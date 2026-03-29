import { spawn } from "child_process";
import path from "path";

// Point specifically to the Python inside your NEW virtual environment
const VENV_PYTHON = path.join(process.cwd(), "venv", "Scripts", "python.exe");

export const cloneVoiceHandler = (req, res) => {
  const { text, speakerFile } = req.body;
  const outputFile = `exports/clone_${Date.now()}.wav`;
  const referencePath = `uploads/${speakerFile}`;

  // Spawn the Python process
  const pythonProcess = spawn(VENV_PYTHON, [
    "clone_engine.py",
    text,
    referencePath,
    outputFile,
  ]);

  pythonProcess.stdout.on("data", (data) => {
    if (data.toString().includes("COMPLETED_SUCCESSFULLY")) {
      res.json({
        success: true,
        audioUrl: `/${outputFile}`,
        message: "Voice cloned successfully!",
      });
    }
  });

  pythonProcess.stderr.on("data", (data) => {
    console.error(`AI Engine Status: ${data}`);
  });

  pythonProcess.on("error", (err) => {
    res
      .status(500)
      .json({ success: false, error: "Failed to start AI engine" });
  });
};
