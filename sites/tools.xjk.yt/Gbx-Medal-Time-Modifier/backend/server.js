import express from "express";
import multer from "multer";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 128);
const TOOL_TIMEOUT_MS = Number(process.env.TOOL_TIMEOUT_MS || 180000);
const KEEP_FILES = String(process.env.KEEP_FILES || "false").toLowerCase() === "true";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function firstExistingPath(paths) {
  for (const p of paths) {
    const full = path.resolve(p);
    if (fs.existsSync(full)) return full;
  }
  return "";
}

const TOOL_PATH =
  process.env.TOOL_PATH ||
  firstExistingPath([
    path.join(__dirname, "..", "tools", "GbxMedalTimeModifier.exe"),
  ]);

const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, "..", "frontend");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "..", "data", "uploads");
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), "..", "data", "processed");

const UPLOAD_MAPS_DIR = path.join(UPLOAD_DIR, "maps");
const WORK_DIR = path.join(OUTPUT_DIR, "_work");

function safeMkdir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

[FRONTEND_DIR, UPLOAD_DIR, OUTPUT_DIR, UPLOAD_MAPS_DIR, WORK_DIR].forEach(safeMkdir);

function isAllowedMapFilename(filename) {
  const lower = String(filename || "").toLowerCase();
  return lower.endsWith(".map.gbx") || lower.endsWith(".gbx");
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch {}
}

function sanitizeDownloadName(name) {
  return String(name || "download.Map.Gbx").replace(/["\\/\r\n]+/g, "_");
}

function makeDownloadName(originalName) {
  const base = String(originalName || "map")
    .replace(/\.map\.gbx$/i, "")
    .replace(/\.gbx$/i, "");
  return `${base}-medals-modified.Map.Gbx`;
}

function parseMedalToken(value, { allowAuto }) {
  const token = String(value ?? "").trim();
  if (!token) return null;

  const lower = token.toLowerCase();
  if (token === "_") return "_";
  if (allowAuto && lower === "auto") return "auto";
  if (!allowAuto && lower === "auto") return null;

  if (!/^\d+$/.test(token)) return null;
  return String(Number(token));
}

function runTool(args) {
  return new Promise((resolve, reject) => {
    if (!TOOL_PATH) return reject(new Error("TOOL_PATH is not set."));
    if (!fs.existsSync(TOOL_PATH)) return reject(new Error(`Tool not found at: ${TOOL_PATH}`));

    const child = spawn(TOOL_PATH, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Tool timed out after ${TOOL_TIMEOUT_MS}ms`));
    }, TOOL_TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        return resolve({ stdout, stderr });
      }
      return reject(new Error(`Tool exited with code ${code}\n${stderr || stdout}`));
    });
  });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_MAPS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(String(file.originalname || "")) || ".Gbx";
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedMapFilename(file.originalname)) {
      return cb(new Error("Upload a Trackmania .Map.Gbx / .Gbx map file."));
    }
    return cb(null, true);
  },
});

const app = express();
app.disable("x-powered-by");

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(FRONTEND_DIR));

app.get("/", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.get("/health", (_req, res) => {
  res.type("text").send("ok");
});

app.use(
  "/api/",
  rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.post("/api/modify", upload.single("map"), async (req, res) => {
  const mapFile = req.file;
  if (!mapFile) {
    return res.status(400).json({ error: "Map file is required." });
  }

  const at = parseMedalToken(req.body?.at, { allowAuto: false });
  const gold = parseMedalToken(req.body?.gold, { allowAuto: true });
  const silver = parseMedalToken(req.body?.silver, { allowAuto: true });
  const bronze = parseMedalToken(req.body?.bronze, { allowAuto: true });

  if (!at) {
    await safeUnlink(mapFile.path);
    return res.status(400).json({ error: "AT must be a number or '_' (auto is not allowed for AT)." });
  }

  if (!gold || !silver || !bronze) {
    await safeUnlink(mapFile.path);
    return res.status(400).json({
      error: "Gold/Silver/Bronze must each be a number, '_', or 'auto'.",
    });
  }

  const requestId = randomUUID();
  const outputPath = path.join(WORK_DIR, `${requestId}.Map.Gbx`);

  const cleanup = async () => {
    if (KEEP_FILES) return;
    await Promise.all([safeUnlink(mapFile.path), safeUnlink(outputPath)]);
  };

  try {
    await runTool([mapFile.path, outputPath, at, gold, silver, bronze]);

    const downloadName = makeDownloadName(mapFile.originalname);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${sanitizeDownloadName(downloadName)}"`);

    const rs = fs.createReadStream(outputPath);
    rs.on("error", async (err) => {
      console.error("ReadStream error:", err);
      if (!res.headersSent) res.status(500);
      res.end("Failed to read modified map.");
      await cleanup();
    });

    rs.pipe(res);
    res.on("finish", cleanup);
  } catch (err) {
    await cleanup();
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: `File too large. Max ${MAX_FILE_MB} MB per file.` });
    }
    return res.status(400).json({ error: err.message });
  }

  if (err) {
    return res.status(400).json({ error: err.message || "Invalid request." });
  }

  return res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Backend listening on http://127.0.0.1:${PORT}`);
  console.log(`TOOL_PATH=${TOOL_PATH}`);
  console.log(`UPLOAD_DIR=${UPLOAD_DIR}`);
  console.log(`OUTPUT_DIR=${OUTPUT_DIR}`);
});
