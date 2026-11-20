const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema({
    originalName: { type: String, required: true },
    filename: { type: String, required: true, unique: true },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model("File", fileSchema);