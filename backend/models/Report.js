const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    userEmail: { type: String, required: true, index: true },
    userName: { type: String },
    patientName: { type: String, required: true },
    ectNumber: { type: String },
    notes: { type: String },
    // Images are stored in MongoDB (GridFS bucket "images") so they survive
    // restarts on hosts with an ephemeral disk. imagePath = "api/images/<imageKey>".
    imagePath: { type: String, required: true },
    imageKey: { type: String, index: true },
    imageFileId: { type: mongoose.Schema.Types.ObjectId },
    aiReport: { type: Object, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", reportSchema);
