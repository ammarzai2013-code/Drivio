const mongoose = require("mongoose");

const shareSchema = new mongoose.Schema({
    file: { type: mongoose.Schema.Types.ObjectId, ref: "File", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, default: Date.now }
});

shareSchema.index({ file: 1, receiver: 1 }, { unique: true });

module.exports = mongoose.model("Share", shareSchema);