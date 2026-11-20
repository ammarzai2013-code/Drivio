
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const User = require("./models/User");
const File = require("./models/File");
const Share = require("./models/Share");
const auth = require("./middleware/auth");
const secret = require("./secret/secret");

const app = express();

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static("public"));

const uploadPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);

const storage = multer.diskStorage({
    destination: uploadPath,
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({ storage });

// Register
app.get("/", (req, res) => res.render("Register"));

app.post("/register", async (req, res) => {
    const usernameClean = (req.body.username || "").trim().toLowerCase();
    const emailClean = (req.body.email || "").trim().toLowerCase();
    const { password } = req.body;

    if (!usernameClean || !emailClean || !password) {
        return res.send("Please fill all fields");
    }

    try {
        const exists = await User.findOne({
            $or: [{ username: usernameClean }, { email: emailClean }]
        }).collation({ locale: "en", strength: 2 });
        if (exists) return res.send("Username or email already exists");

        const hash = await bcrypt.hash(password, 10);
        await User.create({
            username: usernameClean,
            email: emailClean,
            password: hash
        });
        res.redirect("/login");
    } catch (error) {
        if (error.code === 11000) return res.send("Username or email already exists");
        res.status(500).send("Registration failed");
    }
});

// Login
app.get("/login", (req, res) => res.render("Login"));

app.post("/login", async (req, res) => {

    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
        return res.send("Email database mein nahi mili");
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
        return res.send("Password incorrect hai");
    }

    const token = jwt.sign({ userId: user._id }, secret);

    res.cookie("token", token, { httpOnly: true });

    res.redirect("/dashboard");
});

// Logout
app.get("/logout", (req, res) => {
    res.clearCookie("token");
    res.redirect("/login");
});

// Dashboard
app.get("/dashboard", auth, async (req, res) => {
    const files = await File.find({ owner: req.user.userId });
    const currentUser = await User.findById(req.user.userId);

    res.render("index", { files, currentUser });
});

// Upload
app.post("/upload", auth, upload.single("file"), async (req, res) => {
    if (!req.file) return res.redirect("/dashboard");

    await File.create({
        originalName: req.file.originalname,
        filename: req.file.filename,
        owner: req.user.userId
    });

    res.redirect("/dashboard");
});

// Search users
app.get("/search", auth, async (req, res) => {
    const q = (req.query.q || "").trim().slice(0, 30);
    const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const users = await User.find({
        username: { $regex: q, $options: "i" },
        _id: { $ne: req.user.userId }
    }).select("username").sort({ username: 1 }).limit(20);

    res.json(users);
});

// Share file
app.post("/share/:id", auth, async (req, res) => {
    const file = await File.findOne({
        _id: req.params.id,
        owner: req.user.userId
    });

    const receiver = await User.findById(req.body.receiver);

    if (!file || !receiver) return res.status(404).send("File or user not found");
    if (receiver._id.toString() === req.user.userId) {
        return res.status(400).send("You cannot send a file to yourself");
    }

    await Share.updateOne(
        { file: file._id, receiver: receiver._id },
        { $setOnInsert: { sender: req.user.userId } },
        { upsert: true }
    );

    res.redirect("/sent");
});

// Download
app.get("/download/:id", auth, async (req, res) => {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).send("File not found");

    const shared = await Share.findOne({
        file: file._id,
        receiver: req.user.userId
    });

    if (file.owner.toString() !== req.user.userId && !shared) {
        return res.status(403).send("Access denied");
    }

    res.download(path.join(uploadPath, file.filename), file.originalName);
});

// Delete
app.post("/delete/:id", auth, async (req, res) => {
    const file = await File.findOne({
        _id: req.params.id,
        owner: req.user.userId
    });

    if (!file) return res.send("File not found");

    const filePath = path.join(uploadPath, file.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await Share.deleteMany({ file: file._id });
    await file.deleteOne();

    res.redirect("/dashboard");
});

// Received files
app.get("/received", auth, async (req, res) => {
    const shares = await Share.find({
        receiver: req.user.userId
    }).populate("file sender");

    res.render("shared", { shares, type: "received" });
});

// Sent files
app.get("/sent", auth, async (req, res) => {
    const shares = await Share.find({
        sender: req.user.userId
    }).populate("file receiver");

    res.render("shared", { shares, type: "sent" });
});

// Start after MongoDB connects
mongoose.connect("mongodb://127.0.0.1:27017/filevault")
    .then(() => {
        console.log("MongoDB Connected");
        app.listen(4000, () => console.log("Server running on port http://localhost:4000"));
    })
    .catch(err => console.log(err));