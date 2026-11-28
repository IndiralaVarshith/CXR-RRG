require("dotenv").config({ quiet: true });
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

const cookieParser = require("cookie-parser");
const express = require("express");
const helmet = require("helmet");
const mongoose = require("mongoose");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { createProxyMiddleware } = require("http-proxy-middleware");

const { router: authRouter, requireAuth } = require("./auth");
const Report = require("./models/Report");

mongoose.set("sanitizeFilter", true); // strip $-operators smuggled in through user input

const app = express();
app.set("trust proxy", 1); // one reverse proxy in front (Render) -> correct client IP for rate limits
app.disable("x-powered-by");

const PROD = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 5000;
const ML_PROXY_TARGET = process.env.ML_PROXY_TARGET; // AI service (Modal in production, :8000 locally)
const ML_API_KEY = process.env.ML_API_KEY || ""; // shared secret so only this server can call the AI
const FRONTEND_BUILD = process.env.FRONTEND_BUILD; // folder with the React production build

// ---------------- security headers ----------------
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "https://accounts.google.com/gsi/client"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com/gsi/style"],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        "img-src": ["'self'", "data:", "blob:", "https://*.googleusercontent.com"],
        "connect-src": ["'self'", "https://accounts.google.com/gsi/"],
        "frame-src": ["https://accounts.google.com/gsi/"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'none'"],
        "upgrade-insecure-requests": PROD ? [] : null,
      },
    },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }, // Google sign-in popup
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: PROD ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);
app.use((req, res, next) => {
  res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  next();
});
app.use(cookieParser());

// ---------------- CSRF defence ----------------
// Session cookies are SameSite=Strict; additionally refuse state-changing requests from other origins.
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next(); // same-origin form posts from older browsers / curl
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: "Request blocked." });
  }
  if (host !== req.get("host") && !(!PROD && /^(localhost|127\.0\.0\.1):300\d$/.test(host))) {
    return res.status(403).json({ error: "Request blocked." });
  }
  next();
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

const dbReady = (req, res, next) =>
  mongoose.connection.readyState === 1
    ? next()
    : res.status(503).json({ error: "The service is starting up. Please try again in a moment." });

// ---------------- AI proxy: signed-in users only (before body parsers so uploads stream) ----------------
const predictLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 40,
  keyGenerator: (req) => req.user?.id || "anon",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "You're analyzing images very quickly. Please wait a few minutes." },
});
if (ML_PROXY_TARGET) {
  app.use(
    "/ml",
    dbReady,
    requireAuth,
    (req, res, next) => (req.method === "POST" ? predictLimiter(req, res, next) : next()),
    createProxyMiddleware({
      target: ML_PROXY_TARGET,
      changeOrigin: true,
      proxyTimeout: 120000,
      timeout: 120000,
      on: {
        proxyReq: (proxyReq) => {
          proxyReq.removeHeader("cookie"); // never forward session cookies to the AI service
          if (ML_API_KEY) proxyReq.setHeader("X-ML-Key", ML_API_KEY);
        },
      },
    })
  );
  console.log(`↪  /ml proxied to ${ML_PROXY_TARGET} (sign-in required${ML_API_KEY ? ", with API key" : ""})`);
}

app.use(express.json({ limit: "100kb" }));
app.use("/api", dbReady);

// ---------------- AUTH ----------------
app.use("/api/auth", authRouter);

// Everything else under /api needs a signed-in user
app.use("/api", requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 10, fieldSize: 200 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ["image/png", "image/jpeg"].includes(file.mimetype)),
});

const canAccess = (user, report) => user.role === "doctor" || report.userEmail === user.email;

// Legacy uploads saved on disk by older local versions
app.use("/uploads", requireAuth, express.static(path.join(__dirname, "uploads"), { dotfiles: "deny" }));

// ---------------- IMAGES (GridFS): owner or doctor only ----------------
app.get("/api/images/:key", async (req, res, next) => {
  try {
    const key = String(req.params.key);
    if (!/^[a-f0-9]{32}$/.test(key)) return res.status(404).end();
    const report = await Report.findOne({ imageKey: key }, { imageFileId: 1, userEmail: 1 });
    if (!report?.imageFileId || !bucket || !canAccess(req.user, report)) return res.status(404).end();
    const file = (await bucket.find({ _id: report.imageFileId }).toArray())[0];
    if (!file) return res.status(404).end();
    const type = file.metadata?.contentType === "image/png" ? "image/png" : "image/jpeg";
    res.set({ "Content-Type": type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
    bucket.openDownloadStream(file._id).pipe(res);
  } catch (err) {
    next(err);
  }
});

// Check the file really is a PNG/JPEG (not just named like one)
const isImage = (buf) =>
  buf?.length > 8 &&
  ((buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) || (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff));

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

const str = (v, max) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);

// ---------------- REPORTS ----------------
app.post("/api/save-report", upload.single("image"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file || !isImage(file.buffer)) return res.status(400).json({ error: "A PNG or JPG image is required to save a report." });
    if (!bucket) return res.status(503).json({ error: "Image storage is not ready yet. Try again in a moment." });
    const { notes, reportText, patientName, ectNumber } = req.body;

    let ai = {};
    try {
      ai = req.body.aiData ? JSON.parse(req.body.aiData) : {};
    } catch {
      ai = {};
    }
    const probs = {};
    if (ai && typeof ai.probabilities === "object" && !Array.isArray(ai.probabilities)) {
      for (const [k, v] of Object.entries(ai.probabilities).slice(0, 30)) {
        if (typeof v === "number" && Number.isFinite(v) && /^[\w .'-]{1,60}$/.test(k)) probs[k] = Math.min(1, Math.max(0, v));
      }
    }
    const values = Object.values(probs);

    const { key, id } = await storeImage(file);
    const report = await Report.create({
      userEmail: req.user.email,
      userName: req.user.name || req.user.email.split("@")[0],
      patientName: str(patientName, 120).trim() || "Unknown Patient",
      ectNumber: str(ectNumber, 60),
      notes: str(notes, 5000),
      imagePath: `api/images/${key}`,
      imageKey: key,
      imageFileId: id,
      aiReport: {
        model: str(ai.model || "cxr-rrg-ml", 120),
        finding: str(reportText, 20000),
        findings: Array.isArray(ai.findings) ? ai.findings.slice(0, 20).map((f) => str(f, 60)) : [],
        probabilities: probs,
        risk: ["high", "moderate", "low"].includes(ai.risk) ? ai.risk : null,
        confidence: values.length ? Math.max(...values) : null,
      },
    });
    res.status(201).json({ message: "Report saved", report });
  } catch (err) {
    next(err);
  }
});

// All reports (doctor only)
app.get("/api/reports", async (req, res, next) => {
  if (req.user.role !== "doctor") return res.status(403).json({ error: "Doctors only." });
  try {
    res.json(await Report.find().sort({ createdAt: -1 }).limit(500));
  } catch (err) {
    next(err);
  }
});

// The signed-in user's reports (doctors see all)
app.get("/api/history", async (req, res, next) => {
  try {
    const q = req.user.role === "doctor" ? {} : { userEmail: req.user.email };
    res.json(await Report.find(q).sort({ createdAt: -1 }).limit(500));
  } catch (err) {
    next(err);
  }
});

app.delete("/api/history/clear/all", async (req, res, next) => {
  try {
    const mine = await Report.find({ userEmail: req.user.email }, { imageFileId: 1 });
    await Promise.all(mine.map(removeImage));
    const result = await Report.deleteMany({ userEmail: req.user.email });
    res.json({ message: "History cleared", count: result.deletedCount });
  } catch (err) {
    next(err);
  }
});

app.put("/api/history/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Report not found" });
    const report = await Report.findById(req.params.id);
    if (!report || !canAccess(req.user, report)) return res.status(404).json({ error: "Report not found" });

    const { patientName, notes, finding, ectNumber } = req.body || {};
    if (patientName !== undefined) report.patientName = str(patientName, 120).trim() || "Unknown Patient";
    if (ectNumber !== undefined) report.ectNumber = str(ectNumber, 60);
    if (notes !== undefined) report.notes = str(notes, 5000);
    if (finding !== undefined && report.aiReport) {
      report.aiReport = { ...report.aiReport, finding: str(finding, 20000) };
      report.markModified("aiReport");
    }
    await report.save();
    res.json({ message: "Report updated", report });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/history/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Report not found" });
    const report = await Report.findById(req.params.id);
    if (!report || !canAccess(req.user, report)) return res.status(404).json({ error: "Report not found" });
    await removeImage(report);
    await report.deleteOne();
    res.json({ message: "Report deleted successfully" });
  } catch (err) {
    next(err);
  }
});

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// ---------------- WEBSITE (production build) ----------------
if (FRONTEND_BUILD && fs.existsSync(path.join(FRONTEND_BUILD, "index.html"))) {
  app.use(express.static(FRONTEND_BUILD, { index: false, maxAge: "1h", dotfiles: "ignore" }));
  app.get(/^\/(?!api\/|ml\/|uploads\/).*/, (req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(FRONTEND_BUILD, "index.html"));
  });
  console.log(`🌐 Serving website from ${FRONTEND_BUILD}`);
}

// ---------------- errors: never leak internals ----------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE" ? "Image is too large (max 25 MB)." : "Invalid upload.";
    return res.status(400).json({ error: msg });
  }
  if (err?.type === "entity.parse.failed" || err?.type === "entity.too.large") {
    return res.status(400).json({ error: "Invalid request." });
  }
  console.error(`${req.method} ${req.path} error:`, err?.message || err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
