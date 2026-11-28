/**
 * Authentication for CXR-RRG.
 *
 *  - Sessions: a random 256-bit token in an httpOnly, SameSite=Strict cookie (JavaScript can't
 *    read it, other sites can't send it). Only its SHA-256 hash is stored in MongoDB.
 *  - Device binding: each browser gets its own random device id cookie. A session token only
 *    works together with the device id and the browser/OS family it was created on; if a
 *    stolen token shows up anywhere else the session is revoked.
 *  - Multiple devices per user, each listed (to its owner only) and revocable.
 *  - Passwords: bcrypt (cost 10), 8-72 chars with a letter and a number, lockout after
 *    5 failures, constant-time behaviour for unknown emails, generic error messages.
 *  - Google sign-in: verifies the Google ID token signature, audience and verified email.
 */
const crypto = require("crypto");

const bcrypt = require("bcryptjs");
const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { OAuth2Client } = require("google-auth-library");

const Session = require("./models/Session");
const User = require("./models/User");

const PROD = process.env.NODE_ENV === "production";
const SESSION_COOKIE = PROD ? "__Host-cxr_session" : "cxr_session";
const DEVICE_COOKIE = PROD ? "__Host-cxr_device" : "cxr_device";
const SESSION_DAYS = 7;
const IDLE_DAYS = 3;
const MAX_SESSIONS = 10;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const BCRYPT_COST = 10; // OWASP minimum; higher makes logins take seconds on a 0.1-CPU free server
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const DOCTOR_EMAIL = String(process.env.DOCTOR_EMAIL || "").trim().toLowerCase();
const DOCTOR_PASSWORD = String(process.env.DOCTOR_PASSWORD || "");

const google = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
// Hash used for unknown emails so a wrong email takes as long as a wrong password
// Our own operator queries; user input is still sanitized by mongoose sanitizeFilter
const trusted = (q) => mongoose.trusted(q);
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), BCRYPT_COST);

// ---------------- helpers ----------------
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const randomToken = () => crypto.randomBytes(32).toString("base64url");

const cookieOpts = (maxAgeMs) => ({
  httpOnly: true,
  secure: PROD,
  sameSite: "strict",
  path: "/",
  maxAge: maxAgeMs,
});

function deviceFamily(ua = "") {
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\/|CriOS/.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /CrOS/.test(ua) ? "ChromeOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : "Unknown OS";
  const mobile = /Mobi|iPhone|Android.*Mobile/.test(ua) ? " (mobile)" : "";
  return `${browser} on ${os}${mobile}`;
}

const maskIp = (ip = "") => {
  const v4 = ip.replace(/^::ffff:/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return v4.split(".").slice(0, 2).join(".") + ".x.x";
  return ip.includes(":") ? ip.split(":").slice(0, 3).join(":") + ":…" : "";
};

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]{0,79}$/u;

function cleanEmail(v) {
  const email = typeof v === "string" ? v.trim().toLowerCase() : "";
  return EMAIL_RE.test(email) && email.length <= 254 ? email : null;
}

function passwordProblem(pw) {
  if (typeof pw !== "string" || pw.length < 8) return "Password must be at least 8 characters.";
  if (Buffer.byteLength(pw, "utf8") > 72) return "Password is too long (max 72 characters).";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password must include at least one letter and one number.";
  if (/[\u0000-\u001f\u007f]/.test(pw)) return "Password contains characters that aren't allowed.";
  return null;
}

const publicUser = (u) => ({
  id: String(u._id),
  email: u.email,
  name: u.name || u.email.split("@")[0],
  role: u.role || "user",
  hasPassword: Boolean(u.password),
  google: Boolean(u.googleId),
});

// ---------------- sessions ----------------
function ensureDeviceId(req, res) {
  let id = req.cookies?.[DEVICE_COOKIE];
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(id)) {
    id = randomToken();
    res.cookie(DEVICE_COOKIE, id, cookieOpts(400 * 24 * 3600 * 1000));
  }
  return id;
}

async function startSession(req, res, user, method) {
  const deviceId = ensureDeviceId(req, res);
  const ua = String(req.get("user-agent") || "").slice(0, 400);
  // One active session per device: signing in again replaces the old one
  await Session.updateMany({ userId: user._id, deviceId, revokedAt: null }, { revokedAt: new Date() });

  const token = randomToken();
  await Session.create({
    tokenHash: sha256(token),
    userId: user._id,
    deviceId,
    deviceKey: sha256(deviceFamily(ua)),
    device: deviceFamily(ua),
    ip: req.ip,
    method,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5),
  });

  // Cap devices per account: revoke the oldest beyond the limit
  const active = await Session.find({ userId: user._id, revokedAt: null }).sort({ lastSeenAt: -1 }).select("_id");
  if (active.length > MAX_SESSIONS) {
    await Session.updateMany({ _id: trusted({ $in: active.slice(MAX_SESSIONS).map((s) => s._id) }) }, { revokedAt: new Date() });
  }

  user.lastLoginAt = new Date();
  user.failedLogins = 0;
  user.lockUntil = undefined;
  await user.save();

  res.cookie(SESSION_COOKIE, token, cookieOpts(SESSION_DAYS * 864e5));
  return publicUser(user);
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { ...cookieOpts(0), maxAge: undefined });
}

/** Requires a valid, unrevoked session used from the device it was created on. */
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== "string" || token.length < 40 || token.length > 60) {
      return res.status(401).json({ error: "Please sign in." });
    }
    const session = await Session.findOne({ tokenHash: sha256(token) });
    const now = Date.now();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() < now ||
      session.lastSeenAt.getTime() < now - IDLE_DAYS * 864e5
    ) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Your session has ended. Please sign in again." });
    }
    const ua = String(req.get("user-agent") || "");
    if (req.cookies?.[DEVICE_COOKIE] !== session.deviceId || sha256(deviceFamily(ua)) !== session.deviceKey) {
      // Token used from a different device: treat it as stolen
      session.revokedAt = new Date();
      await session.save();
      clearSessionCookie(res);
      console.warn(`Session ${session._id} revoked: used from a different device`);
      return res.status(401).json({ error: "This session belongs to another device. Please sign in again." });
    }
    const user = await User.findById(session.userId);
    if (!user) return res.status(401).json({ error: "Please sign in." });

    if (now - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
      session.lastSeenAt = new Date();
      session.ip = req.ip;
      await session.save();
    }
    req.session = session;
    req.dbUser = user;
    req.user = { id: String(user._id), email: user.email, name: user.name || "", role: user.role || "user" };
    next();
  } catch (err) {
    next(err);
  }
}

// ---------------- routes ----------------
const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true, // only failed attempts count
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait 15 minutes and try again." },
});

async function failedLogin(user) {
  user.failedLogins = (user.failedLogins || 0) + 1;
  if (user.failedLogins >= MAX_FAILS) {
    user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    user.failedLogins = 0;
  }
  await user.save();
}

router.get("/config", (req, res) => res.json({ googleClientId: GOOGLE_CLIENT_ID || null }));

router.post("/register", authLimiter, async (req, res, next) => {
  try {
    const email = cleanEmail(req.body?.email);
    const password = req.body?.password;
    const name = typeof req.body?.name === "string" ? req.body.name.trim().replace(/\s+/g, " ") : "";
    if (!email) return res.status(400).json({ error: "Enter a valid email address." });
    if (!NAME_RE.test(name)) return res.status(400).json({ error: "Enter your name using letters only (max 80)." });
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });
    if (email === DOCTOR_EMAIL || (await User.exists({ email }))) {
      return res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
    }
    const user = await User.create({ email, name, role: "user", password: await bcrypt.hash(password, BCRYPT_COST) });
    res.status(201).json({ user: await startSession(req, res, user, "password") });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
    next(err);
  }
});

router.post("/login", authLimiter, async (req, res, next) => {
  try {
    const email = cleanEmail(req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const generic = () => res.status(401).json({ error: "Invalid email or password." });
    if (!email || !password || Buffer.byteLength(password, "utf8") > 72) {
      await bcrypt.compare("x", DUMMY_HASH);
      return generic();
    }

    // Doctor account from environment variables: keep a real user record so it gets sessions too
    if (DOCTOR_EMAIL && DOCTOR_PASSWORD && email === DOCTOR_EMAIL) {
      const a = Buffer.from(sha256(password));
      const b = Buffer.from(sha256(DOCTOR_PASSWORD));
      if (!crypto.timingSafeEqual(a, b)) return generic();
      let doctor = await User.findOne({ email });
      if (!doctor) doctor = new User({ email, name: "Doctor", role: "doctor" });
      doctor.role = "doctor";
      return res.json({ user: await startSession(req, res, doctor, "password") });
    }

    const user = await User.findOne({ email });
    if (!user || !user.password) {
      await bcrypt.compare(password, DUMMY_HASH);
      return user && user.googleId
        ? res.status(401).json({ error: "This account uses Google sign-in. Use “Continue with Google”." })
        : generic();
    }
    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      const mins = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      return res.status(423).json({ error: `Too many failed attempts. Account locked for ${mins} more minute${mins > 1 ? "s" : ""}.` });
    }
    if (!(await bcrypt.compare(password, user.password))) {
      await failedLogin(user);
      return generic();
    }
    res.json({ user: await startSession(req, res, user, "password") });
  } catch (err) {
    next(err);
  }
});

router.post("/google", authLimiter, async (req, res, next) => {
  try {
    if (!google) return res.status(404).json({ error: "Google sign-in is not enabled." });
    const credential = req.body?.credential;
    if (typeof credential !== "string" || credential.length > 4096) {
      return res.status(400).json({ error: "Google sign-in failed." });
    }
    let payload;
    try {
      payload = (await google.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID })).getPayload();
    } catch {
      return res.status(401).json({ error: "Google sign-in could not be verified. Please try again." });
    }
    const email = cleanEmail(payload?.email);
    if (!email || payload.email_verified !== true) {
      return res.status(401).json({ error: "Your Google account email isn't verified." });
    }
    if (email === DOCTOR_EMAIL) return res.status(403).json({ error: "Use the doctor password sign-in for this account." });

    let user = await User.findOne({ email });
    if (!user) {
      const name = String(payload.name || "").replace(/[^\p{L}\p{M} .'-]/gu, "").trim().slice(0, 80);
      user = new User({ email, name: name || email.split("@")[0], role: "user" });
    }
    if (user.googleId && user.googleId !== payload.sub) {
      return res.status(401).json({ error: "This email is linked to a different Google account." });
    }
    user.googleId = payload.sub; // Google verified this email, so link it
    res.json({ user: await startSession(req, res, user, "google") });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, (req, res) => res.json({ user: publicUser(req.dbUser) }));

router.post("/logout", async (req, res, next) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === "string") await Session.updateOne({ tokenHash: sha256(token) }, { revokedAt: new Date() });
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// The signed-in user's own devices only
router.get("/sessions", requireAuth, async (req, res, next) => {
  try {
    const list = await Session.find({ userId: req.dbUser._id, revokedAt: null, expiresAt: trusted({ $gt: new Date() }) })
      .sort({ lastSeenAt: -1 });
    res.json({
      sessions: list.map((s) => ({
        id: String(s._id),
        device: s.device,
        ip: maskIp(s.ip),
        method: s.method,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        current: String(s._id) === String(req.session._id),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/sessions/:id", requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    if (!/^[a-f0-9]{24}$/.test(id)) return res.status(404).json({ error: "Device not found." });
    // Scoped to the owner, so nobody can sign out someone else's device
    const r = await Session.updateOne({ _id: id, userId: req.dbUser._id, revokedAt: null }, { revokedAt: new Date() });
    if (!r.matchedCount) return res.status(404).json({ error: "Device not found." });
    if (id === String(req.session._id)) clearSessionCookie(res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/sessions/revoke-others", requireAuth, async (req, res, next) => {
  try {
    const r = await Session.updateMany(
      { userId: req.dbUser._id, revokedAt: null, _id: trusted({ $ne: req.session._id }) },
      { revokedAt: new Date() }
    );
    res.json({ ok: true, count: r.modifiedCount });
  } catch (err) {
    next(err);
  }
});

router.post("/change-password", authLimiter, requireAuth, async (req, res, next) => {
  try {
    const user = req.dbUser;
    if (user.role === "doctor") return res.status(400).json({ error: "The doctor password is set by the server administrator." });
    const { currentPassword, newPassword } = req.body || {};
    if (user.password) {
      if (typeof currentPassword !== "string" || !(await bcrypt.compare(currentPassword, user.password))) {
        return res.status(401).json({ error: "Current password is incorrect." });
      }
    }
    const problem = passwordProblem(newPassword);
    if (problem) return res.status(400).json({ error: problem });
    user.password = await bcrypt.hash(newPassword, BCRYPT_COST);
    await user.save();
    // Changing the password signs out every other device
    await Session.updateMany({ userId: user._id, revokedAt: null, _id: trusted({ $ne: req.session._id }) }, { revokedAt: new Date() });
    res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

module.exports = { router, requireAuth, deviceFamily, passwordProblem };
