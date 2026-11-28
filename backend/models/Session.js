const mongoose = require("mongoose");

// One document per signed-in device. The browser only holds a random token in an
// httpOnly cookie; we store its SHA-256 hash, so a database leak can't be replayed.
const sessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    deviceId: { type: String, required: true }, // random id in the device's own httpOnly cookie
    deviceKey: { type: String, required: true }, // browser + OS family; token is rejected elsewhere
    device: { type: String }, // "Chrome on macOS" (shown to the owner only)
    ip: { type: String },
    method: { type: String, enum: ["password", "google"], default: "password" },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
  },
  { timestamps: true }
);

// MongoDB deletes expired sessions automatically
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Session", sessionSchema);
