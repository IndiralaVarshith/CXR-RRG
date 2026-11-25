require("dotenv").config({ quiet: true });
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

const bcrypt = require("bcryptjs");
const cors = require("cors");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { createProxyMiddleware } = require("http-proxy-middleware");

const User = require("./models/User");
const Report = require("./models/Report");

const app = express();
app.set("trust proxy", 1); // behind Hugging Face / other reverse proxies

const PORT = process.env.PORT || 5000;
const JWT_SECRET =
  process.env.JWT_SECRET && process.env.JWT_SECRET !== "replace-with-strong-random-secret"
    ? process.env.JWT_SECRET
    : crypto.randomBytes(32).toString("hex");
if (JWT_SECRET !== process.env.JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET not set: using a random one (everyone is signed out on restart).");
}
const ML_PROXY_TARGET = process.env.ML_PROXY_TARGET; // e.g. http://127.0.0.1:8000 inside the container
const FRONTEND_BUILD = process.env.FRONTEND_BUILD; // folder with the React production build

// ---------------- ML proxy (before body parsers so uploads stream through) ----------------
if (ML_PROXY_TARGET) {
  app.use(
    "/ml",
    createProxyMiddleware({ target: ML_PROXY_TARGET, changeOrigin: true, proxyTimeout: 120000, timeout: 120000 })
  );
  console.log(`↪  /ml proxied to ${ML_PROXY_TARGET}`);
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Legacy uploads saved on disk by older versions (local development only)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ["image/png", "image/jpeg"].includes(file.mimetype)),
});

// ---------------- MongoDB ----------------
let bucket = null;
if (process.env.MONGO_URI) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
      bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "images" });
      console.log("✅ MongoDB connected");
    })
    .catch((err) => console.error("Mongo error:", err.message));
} else {
  console.warn("⚠️  MONGO_URI not set. Sign-in and saving reports will not work.");
}

app.get("/api/health", (req, res) =>
  res.json({ status: "ok", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" })
);

// Fail fast with a clear message when the database is down (instead of a 10s hang)
app.use("/api", (req, res, next) => {
  const doctorLogin = req.path === "/auth/login" && req.body?.email === process.env.DOCTOR_EMAIL;
  if (mongoose.connection.readyState !== 1 && !doctorLogin) {
    return res.status(503).json({
      error: "Database not connected. Check MONGO_URI and that MongoDB is running.",
    });
  }
  next();
});

// ---------------- auth helpers ----------------
const sign = (user) =>
  jwt.sign({ email: user.email, name: user.name || "", role: user.role || "user" }, JWT_SECRET, { expiresIn: "7d" });

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Please sign in." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

const canAccess = (user, report) => user.role === "doctor" || report.userEmail === user.email;

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

// ---------------- AUTH ROUTES ----------------
app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const name = String(req.body.name || "").trim().slice(0, 80);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
    if (email === String(process.env.DOCTOR_EMAIL || "").toLowerCase())
      return res.status(400).json({ error: "User already exists" });

    if (await User.findOne({ email })) return res.status(400).json({ error: "User already exists" });

    const user = await User.create({ email, password: await bcrypt.hash(password, 10), name, role: "user" });
    res.json({ message: "User registered", token: sign(user), email: user.email, name: user.name, role: user.role });
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (process.env.DOCTOR_EMAIL && email === process.env.DOCTOR_EMAIL.toLowerCase() && password === process.env.DOCTOR_PASSWORD) {
      const doctor = { email, name: "Doctor", role: "doctor" };
      return res.json({ message: "Doctor login success", token: sign(doctor), ...doctor });
    }

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ error: "Invalid email or password" });

    res.json({ message: "User login success", token: sign(user), email: user.email, name: user.name || "", role: user.role || "user" });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/auth/me", auth, (req, res) => res.json(req.user));

// ---------------- IMAGES (stored in MongoDB GridFS) ----------------
// Public by an unguessable 32-hex key, so <img> tags and the PDF export can load them.
app.get("/api/images/:key", async (req, res) => {
  try {
    if (!/^[a-f0-9]{32}$/.test(req.params.key)) return res.status(404).end();
    const report = await Report.findOne({ imageKey: req.params.key }, { imageFileId: 1 });
    if (!report?.imageFileId || !bucket) return res.status(404).end();
    const file = (await bucket.find({ _id: report.imageFileId }).toArray())[0];
    if (!file) return res.status(404).end();
    res.set("Content-Type", file.contentType || file.metadata?.contentType || "image/jpeg");
    res.set("Cache-Control", "private, max-age=86400");
    bucket.openDownloadStream(file._id).pipe(res);
  } catch (err) {
    console.error("Image error:", err.message);
    res.status(500).end();
  }
});

async function storeImage(file) {
  const key = crypto.randomBytes(16).toString("hex");
  const id = await new Promise((resolve, reject) => {
    const up = bucket.openUploadStream(key, { metadata: { contentType: file.mimetype } });
    Readable.from(file.buffer).pipe(up).on("error", reject).on("finish", () => resolve(up.id));
  });
  return { key, id };
}

async function removeImage(report) {
  if (report?.imageFileId && bucket) {
    try {
      await bucket.delete(report.imageFileId);
    } catch {
      /* already gone */
    }
  }
}

// ---------------- REPORTS ----------------
// POST /api/save-report - image + report text + structured AI output
app.post("/api/save-report", auth, upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "A PNG or JPG image is required to save a report." });
    if (!bucket) return res.status(503).json({ error: "Image storage is not ready yet. Try again in a moment." });
    const { notes, reportText, patientName, ectNumber } = req.body;

    let ai = {};
    try {
      ai = req.body.aiData ? JSON.parse(req.body.aiData) : {};
    } catch {
      ai = {};
    }
    const probs = ai.probabilities && typeof ai.probabilities === "object" ? ai.probabilities : {};
    const values = Object.values(probs).filter((v) => typeof v === "number");

    const { key, id } = await storeImage(file);
    const report = await Report.create({
      userEmail: req.user.email,
      userName: req.user.name || req.user.email.split("@")[0],
      patientName: String(patientName || "Unknown Patient").slice(0, 120),
      ectNumber: String(ectNumber || "").slice(0, 60),
      notes: String(notes || "").slice(0, 5000),
      imagePath: `api/images/${key}`,
      imageKey: key,
      imageFileId: id,
      aiReport: {
        model: String(ai.model || "cxr-rrg-ml").slice(0, 120),
        finding: String(reportText || "").slice(0, 20000),
        findings: Array.isArray(ai.findings) ? ai.findings.slice(0, 20) : [],
        probabilities: probs,
        risk: ai.risk || null,
        confidence: values.length ? Math.max(...values) : null,
      },
    });
    res.json({ message: "Report saved", report });
  } catch (err) {
    console.error("Save report error:", err.message);
    res.status(500).json({ error: "Failed to save report" });
  }
});

// GET /api/reports - all reports (doctor only)
app.get("/api/reports", auth, async (req, res) => {
  if (req.user.role !== "doctor") return res.status(403).json({ error: "Doctors only." });
  try {
    res.json(await Report.find().sort({ createdAt: -1 }).limit(500));
  } catch (err) {
    console.error("Reports error:", err.message);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

// GET /api/history - the signed-in user's reports (doctors see all)
app.get("/api/history", auth, async (req, res) => {
  try {
    const q = req.user.role === "doctor" ? {} : { userEmail: req.user.email };
    res.json(await Report.find(q).sort({ createdAt: -1 }).limit(500));
  } catch (err) {
    console.error("History error:", err.message);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// DELETE /api/history/clear/all - delete all of the signed-in user's reports
app.delete("/api/history/clear/all", auth, async (req, res) => {
  try {
    const mine = await Report.find({ userEmail: req.user.email }, { imageFileId: 1 });
    await Promise.all(mine.map(removeImage));
    const result = await Report.deleteMany({ userEmail: req.user.email });
    res.json({ message: "History cleared", count: result.deletedCount });
  } catch (err) {
    console.error("Clear history error:", err.message);
    res.status(500).json({ error: "Failed to clear history" });
  }
});

// PUT /api/history/:id - edit a report
app.put("/api/history/:id", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Report not found" });
    const report = await Report.findById(req.params.id);
    if (!report || !canAccess(req.user, report)) return res.status(404).json({ error: "Report not found" });

    const { patientName, notes, finding, ectNumber } = req.body;
    if (patientName !== undefined) report.patientName = String(patientName).slice(0, 120);
    if (ectNumber !== undefined) report.ectNumber = String(ectNumber).slice(0, 60);
    if (notes !== undefined) report.notes = String(notes).slice(0, 5000);
    if (finding !== undefined && report.aiReport) {
      report.aiReport = { ...report.aiReport, finding: String(finding).slice(0, 20000) };
      report.markModified("aiReport");
    }
    await report.save();
    res.json({ message: "Report updated", report });
  } catch (err) {
    console.error("Update error:", err.message);
    res.status(500).json({ error: "Failed to update report" });
  }
});

// DELETE /api/history/:id - delete one report
app.delete("/api/history/:id", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Report not found" });
    const report = await Report.findById(req.params.id);
    if (!report || !canAccess(req.user, report)) return res.status(404).json({ error: "Report not found" });
    await removeImage(report);
    await report.deleteOne();
    res.json({ message: "Report deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err.message);
    res.status(500).json({ error: "Failed to delete report" });
  }
});

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// ---------------- WEBSITE (production build) ----------------
if (FRONTEND_BUILD && fs.existsSync(path.join(FRONTEND_BUILD, "index.html"))) {
  app.use(express.static(FRONTEND_BUILD, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api\/|ml\/|uploads\/).*/, (req, res) => res.sendFile(path.join(FRONTEND_BUILD, "index.html")));
  console.log(`🌐 Serving website from ${FRONTEND_BUILD}`);
}

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
