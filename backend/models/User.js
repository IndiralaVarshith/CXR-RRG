const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String }, // bcrypt hash; absent for Google-only accounts
    googleId: { type: String, index: true, sparse: true },
    name: { type: String },
    role: { type: String, enum: ["user", "doctor"], default: "user" },
    failedLogins: { type: Number, default: 0 },
    lockUntil: { type: Date },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
