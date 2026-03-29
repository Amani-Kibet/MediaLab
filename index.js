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

// Models & Routes
import authRoutes from "./routes/authRoutes.js";
import User from "./models/User.js";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure FFmpeg path is set correctly
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
const httpServer = createServer(app);

// 1. Socket.io Setup with Dynamic CORS
const io = new Server(httpServer, {
  cors: {
    origin:
      process.env.NODE_ENV === "production"
        ? "https://medialab-6b20.onrender.com"
        : ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  },
});

// 2. Absolute Folders Setup (Prevents "Folder Not Found" crashes)
const uploadDir = path.resolve(__dirname, "uploads");
const exportDir = path.resolve(__dirname, "exports");

[uploadDir, exportDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

// 3. Middlewares
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

// Database Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// 4. Authentication & Session
app.use(
  session({
    secret: process.env.SESSION_SECRET || "medialab-secret-key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      secure: process.env.NODE_ENV === "production", // Recommended for HTTPS
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

// Static Serving
app.use(express.static(path.join(__dirname, "client")));
app.use("/uploads", express.static(uploadDir));
app.use("/exports", express.static(exportDir));

// --- API ROUTES ---

app.use("/api/auth", authRoutes);

// Fix Multer to use absolute path variable
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ success: false, message: "No file received" });
  res.json({ success: true, filename: req.file.filename });
});

// --- UPDATED VIDEO TO AUDIO ROUTE ---
app.post("/api/convert/video-to-audio", async (req, res) => {
  const { videoFile, socketId, requestedFormat } = req.body;
  const format = requestedFormat || "mp3";
  const outputFileName = `audio_${Date.now()}.${format}`;
  const outputPath = path.join(exportDir, outputFileName);
  const inputPath = path.join(uploadDir, videoFile);

  console.log("📂 Input Path:", inputPath);
  console.log("ID for Socket:", socketId);

  // 1. Check if file actually exists before calling FFmpeg
  if (!fs.existsSync(inputPath)) {
    console.error("❌ ERROR: Source video file not found at path!");
    return res
      .status(404)
      .json({ success: false, message: "File not found on server" });
  }

  if (socketId) {
    io.to(socketId).emit("process-step", {
      message: "🚀 FFmpeg Engine Initializing...",
      percent: 10,
    });
  }

  // 2. Wrap FFmpeg in a try/catch or ensure error listeners are robust
  ffmpeg(inputPath)
    .toFormat(format)
    .on("start", (commandLine) => {
      console.log("🎬 FFmpeg started with command: " + commandLine);
      if (socketId)
        io.to(socketId).emit("process-step", {
          message: "🎸 Extracting Audio...",
          percent: 30,
        });
    })
    .on("progress", (progress) => {
      if (progress.percent && socketId) {
        const overallPercent = 30 + Math.round(progress.percent) * 0.5;
        io.to(socketId).emit("process-step", {
          message: "Converting...",
          percent: overallPercent,
        });
      }
    })
    .on("end", async () => {
      console.log("✅ FFmpeg Conversion Finished Successfully");
      const finalUrl = `/exports/${outputFileName}`;

      // 1. Force the UI to hit 100% via Socket
      if (socketId) {
        io.to(socketId).emit("process-step", {
          message: "✨ AI Optimization Complete!",
          percent: 100,
        });
      }

      // 2. Save to Project History (MongoDB)
      if (req.user) {
        try {
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
          console.log("💾 Project saved to MongoDB history");
        } catch (dbErr) {
          console.error("❌ History Save Error:", dbErr);
        }
      }

      // 3. Send final response to the Frontend fetch call
      res.json({
        success: true,
        audioUrl: finalUrl,
        fileName: videoFile,
      });
    })
    .on("error", (err) => {
      console.error("❌ FFmpeg Exec Error:", err.message);
      if (socketId)
        io.to(socketId).emit("process-step", {
          message: "Error: Conversion Failed",
          percent: 0,
        });
      res.status(500).json({ success: false, message: err.message });
    })
    .save(outputPath);
});

// --- UPDATED VOICE CLONE ROUTE ---
app.post("/api/convert/voice-clone", (req, res) => {
  const { text, speakerWav, socketId } = req.body;
  const outputFileName = `clone_${Date.now()}.wav`;
  const outputPath = path.join(exportDir, outputFileName);

  // Cross-platform python command
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
      const p = parseInt(msg.split(":")[1]);
      io.to(socketId).emit("process-step", {
        message: "AI Generating Voice...",
        percent: p,
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

io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 MediaLab Server running on port ${PORT}`);
});
