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
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { spawn } from "child_process";

// Models & Routes
import authRoutes from "./routes/authRoutes.js";
import User from "./models/User.js";
import Feedback from "./models/Feedback.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
const httpServer = createServer(app);

// --- 1. PRO PRODUCTION SETUP ---
// This is critical for Render/Heroku to handle HTTPS cookies correctly
app.set("trust proxy", 1);

const io = new Server(httpServer, {
  cors: {
    origin:
      process.env.NODE_ENV === "production"
        ? "https://medialab-6b20.onrender.com"
        : ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  },
});

// --- 2. FOLDER & STATIC SETUP ---
const uploadDir = path.resolve(__dirname, "uploads");
const exportDir = path.resolve(__dirname, "exports");

[uploadDir, exportDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? "https://medialab-6b20.onrender.com"
        : true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// --- 3. DATABASE & SESSION ---
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "medialab-secret-key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      ttl: 24 * 60 * 60, // 1 day
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      // CRITICAL: On Render, secure must be true and sameSite must be 'none' for Google Auth
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

// Serving
app.use(express.static(path.join(__dirname, "client")));
app.use("/uploads", express.static(uploadDir));
app.use("/exports", express.static(exportDir));

// --- 4. API ROUTES ---
app.use("/api/auth", authRoutes);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
});

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file)
    return res.status(400).json({ success: false, message: "No file" });
  res.json({ success: true, filename: req.file.filename });
});

// --- VIDEO TO AUDIO ---
app.post("/api/convert/video-to-audio", async (req, res) => {
  const { videoFile, socketId, requestedFormat } = req.body;
  const format = requestedFormat || "mp3";
  const outputFileName = `audio_${Date.now()}.${format}`;
  const outputPath = path.join(exportDir, outputFileName);
  const inputPath = path.join(uploadDir, videoFile);

  if (!fs.existsSync(inputPath))
    return res.status(404).json({ success: false, message: "File not found" });

  ffmpeg(inputPath)
    .toFormat(format)
    .on("start", () => {
      if (socketId)
        io.to(socketId).emit("process-step", {
          message: "🎸 Extracting Audio...",
          percent: 30,
        });
    })
    .on("progress", (progress) => {
      if (progress.percent && socketId) {
        const overallPercent = 30 + Math.round(progress.percent) * 0.6;
        io.to(socketId).emit("process-step", {
          message: "AI Converting...",
          percent: Math.min(overallPercent, 95),
        });
      }
    })
    .on("end", async () => {
      const finalUrl = `/exports/${outputFileName}`;
      if (socketId)
        io.to(socketId).emit("process-step", {
          message: "✨ Optimization Complete!",
          percent: 100,
        });

      if (req.user) {
        await User.findByIdAndUpdate(req.user._id, {
          $push: {
            projects: {
              toolType: "Video → Audio",
              fileName: videoFile,
              fileUrl: finalUrl,
              createdAt: new Date(),
            },
          },
        });
      }
      res.json({ success: true, audioUrl: finalUrl });
    })
    .on("error", (err) =>
      res.status(500).json({ success: false, message: err.message }),
    )
    .save(outputPath);
});

// --- VOICE CLONE ---
app.post("/api/convert/voice-clone", (req, res) => {
  const { text, speakerWav, socketId } = req.body;
  const outputFileName = `clone_${Date.now()}.wav`;
  const outputPath = path.join(exportDir, outputFileName);
  const pythonCmd = process.platform === "win32" ? "python" : "python3";

  const pyProcess = spawn(pythonCmd, [
    "clone_engine.py",
    text,
    path.join(uploadDir, speakerWav),
    outputPath,
  ]);

  if (socketId)
    io.to(socketId).emit("process-step", {
      message: "🧠 Neural Engine Loading...",
      percent: 15,
    });

  pyProcess.stdout.on("data", (data) => {
    const msg = data.toString();
    if (msg.startsWith("PROGRESS:") && socketId) {
      io.to(socketId).emit("process-step", {
        message: "AI Generating Voice...",
        percent: parseInt(msg.split(":")[1]),
      });
    }
  });

  pyProcess.on("close", async (code) => {
    if (code === 0) {
      const finalUrl = `/exports/${outputFileName}`;
      if (req.user) {
        await User.findByIdAndUpdate(req.user._id, {
          $push: {
            projects: {
              toolType: "Voice Clone",
              fileName: "Neural Generation",
              fileUrl: finalUrl,
              createdAt: new Date(),
            },
          },
        });
      }
      res.json({ success: true, audioUrl: finalUrl });
    } else {
      res.status(500).json({ error: "AI Engine Failed" });
    }
  });
});

app.post("/api/community-feedback", async (req, res) => {
  try {
    const rating = Number(req.body?.rating || 0);
    const feedbackText = String(req.body?.feedback || "").trim();

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5." });
    }
    if (!feedbackText) {
      return res.status(400).json({ success: false, message: "Feedback message is required." });
    }

    const isLoggedIn = Boolean(req.user);
    const record = await Feedback.create({
      userId: isLoggedIn ? req.user._id : null,
      username: isLoggedIn ? req.user.name || "MediaLab User" : "Anonymous",
      email: isLoggedIn ? req.user.email || "" : "",
      rating,
      feedback: feedbackText,
      source: String(req.body?.source || "web-builder"),
      isAnonymous: !isLoggedIn,
    });

    res.json({
      success: true,
      message: "Feedback saved successfully.",
      feedbackId: record._id,
    });
  } catch (error) {
    console.error("Feedback save failed:", error);
    res.status(500).json({ success: false, message: "Could not save feedback right now." });
  }
});

io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () =>
  console.log(`🚀 MediaLab Server running on port ${PORT}`),
);
