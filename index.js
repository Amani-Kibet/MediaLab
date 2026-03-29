import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import session from "express-session";
import MongoStore from "connect-mongo";
import passport from "passport";
import mongoose from "mongoose";
import "dotenv/config";
import multer from "multer";

// Auth & specialized imports
import authRoutes from "./routes/authRoutes.js";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { spawn } from "child_process";

// Fix for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FFmpeg setup
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "https://medialab-6b20.onrender.com", credentials: true },
});

const PORT = process.env.PORT || 3000;

// 1. Ensure required folders exist
const uploadDir = path.join(__dirname, "uploads");
const exportDir = path.join(__dirname, "exports");
[uploadDir, exportDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 2. Multer Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// 3. Database Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// 4. Global Middleware
app.use(
  cors({ origin: "https://medialab-6b20.onrender.com", credentials: true }),
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// 5. Authentication Setup
app.use(
  session({
    secret: process.env.SESSION_SECRET || "medialab-secret-key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

const clientPath = path.join(__dirname, "client");
app.use(express.static(clientPath));
app.use("/uploads", express.static(uploadDir));
app.use("/exports", express.static(exportDir));

// --- API ROUTES ---

// Auth Bridge
app.use("/api/auth", authRoutes);

// Physical Upload Route
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ success: false, message: "No file received" });
  console.log(`📡 File Uploaded: ${req.file.filename}`);
  res.json({ success: true, filename: req.file.filename });
});

// Video to Audio Route
app.post("/api/convert/video-to-audio", (req, res) => {
  const { videoFile, socketId, requestedFormat } = req.body;
  const format = requestedFormat || "mp3";
  const outputFile = `exports/audio_${Date.now()}.${format}`;

  ffmpeg(path.join(uploadDir, videoFile))
    .toFormat(format)
    .on("progress", (progress) => {
      if (progress.percent && socketId) {
        io.to(socketId).emit("conversion-progress", {
          percent: Math.round(progress.percent),
          type: "video",
        });
      }
    })
    .on("end", () => res.json({ success: true, audioUrl: `/${outputFile}` }))
    .on("error", (err) => res.status(500).json({ error: err.message }))
    .save(path.join(__dirname, outputFile));
});

// Voice Cloning Route
app.post("/api/convert/voice-clone", (req, res) => {
  const { text, speakerWav, socketId } = req.body;
  const outputFile = `exports/clone_${Date.now()}.wav`;
  const pythonPath = path.join(__dirname, "venv", "Scripts", "python.exe");

  const pyProcess = spawn(pythonPath, [
    "clone_engine.py",
    text,
    path.join(uploadDir, speakerWav),
    path.join(__dirname, outputFile),
  ]);

  pyProcess.stdout.on("data", (data) => {
    const msg = data.toString();
    if (msg.startsWith("PROGRESS:") && socketId) {
      const p = msg.split(":")[1];
      io.to(socketId).emit("conversion-progress", {
        percent: parseInt(p),
        type: "voice",
      });
    }
  });

  pyProcess.on("close", (code) => {
    if (code === 0) res.json({ success: true, audioUrl: `/${outputFile}` });
    else res.status(500).json({ error: "AI Engine Failed" });
  });
});

// Socket Connection
io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
});

// Start Server
httpServer.listen(PORT, () => {
  console.log("Server started");
});
