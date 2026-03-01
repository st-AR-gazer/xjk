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
    path.join(__dirname, "..", "tools", "MapValidationChecker.exe"),
  ]);

const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, "..", "frontend");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "..", "data", "uploads");
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), "..", "data", "processed");

const UPLOAD_MAPS_DIR = path.join(UPLOAD_DIR, "maps");
const UPLOAD_REPLAYS_DIR = path.join(UPLOAD_DIR, "replays");
const UPLOAD_MANUAL_DIR = path.join(UPLOAD_DIR, "manual");
const WORK_DIR = path.join(OUTPUT_DIR, "_work");

function safeMkdir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

[FRONTEND_DIR, UPLOAD_DIR, OUTPUT_DIR, UPLOAD_MAPS_DIR, UPLOAD_REPLAYS_DIR, UPLOAD_MANUAL_DIR, WORK_DIR].forEach(safeMkdir);

function isMapFilename(name) {
  const lower = String(name || "").toLowerCase();
  return lower.endsWith(".map.gbx") || lower.endsWith(".gbx");
}

function isReplayFilename(name) {
  return String(name || "").toLowerCase().endsWith(".replay.gbx");
}

function parseBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseIntSafe(value, fallback = null) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return n;
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch {}
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
      resolve({ code, stdout, stderr });
    });
  });
}

const uploadStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    if (file.fieldname === "map") return cb(null, UPLOAD_MAPS_DIR);
    if (file.fieldname === "replay") return cb(null, UPLOAD_REPLAYS_DIR);
    if (file.fieldname === "manual") return cb(null, UPLOAD_MANUAL_DIR);
    return cb(new Error(`Unexpected upload field: ${file.fieldname}`));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(String(file.originalname || "")) || ".bin";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "map") {
      if (!isMapFilename(file.originalname)) {
        return cb(new Error("Map must be .Map.Gbx / .Gbx."));
      }
      return cb(null, true);
    }

    if (file.fieldname === "replay") {
      if (!isReplayFilename(file.originalname)) {
        return cb(new Error("Replay must be .Replay.Gbx."));
      }
      return cb(null, true);
    }

    if (file.fieldname === "manual") {
      if (!String(file.originalname || "").toLowerCase().endsWith(".json")) {
        return cb(new Error("Manual overrides file must be .json."));
      }
      return cb(null, true);
    }

    return cb(new Error(`Unexpected upload field: ${file.fieldname}`));
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

app.post("/api/check", upload.fields([{ name: "map", maxCount: 1 }, { name: "replay", maxCount: 1 }, { name: "manual", maxCount: 1 }]), async (req, res) => {
  const mapFile = req.files?.map?.[0];
  const replayFile = req.files?.replay?.[0];
  const manualFile = req.files?.manual?.[0];

  if (!mapFile) {
    await Promise.all([safeUnlink(replayFile?.path), safeUnlink(manualFile?.path)]);
    return res.status(400).json({ error: "Map file is required." });
  }

  const strictGps = parseBool(req.body?.strictGps, false);
  const noGps = parseBool(req.body?.noGps, false);
  const includePath = parseBool(req.body?.includePath, false);
  const dataDump = parseBool(req.body?.dataDump, false);
  const pretty = parseBool(req.body?.pretty, true);

  const gpsThresholdMs = parseIntSafe(req.body?.gpsThresholdMs, null);
  const maxDepth = parseIntSafe(req.body?.maxDepth, null);

  const requestId = randomUUID();
  const outputPath = path.join(WORK_DIR, `${requestId}.json`);

  const args = ["--single", mapFile.path, "--output", outputPath];
  if (pretty) args.push("--pretty");
  if (replayFile) args.push("--replays", replayFile.path);
  if (manualFile) args.push("--manual", manualFile.path);
  if (strictGps) args.push("--strict-gps");
  if (noGps) args.push("--no-gps");
  if (includePath) args.push("--include-path");
  if (dataDump) args.push("--data-dump");
  if (Number.isInteger(gpsThresholdMs) && gpsThresholdMs >= 0) {
    args.push("--gps-threshold-ms", String(gpsThresholdMs));
  }
  if (Number.isInteger(maxDepth) && maxDepth > 0) {
    args.push("--max-depth", String(maxDepth));
  }

  const cleanup = async () => {
    if (KEEP_FILES) return;
    await Promise.all([
      safeUnlink(mapFile.path),
      safeUnlink(replayFile?.path),
      safeUnlink(manualFile?.path),
      safeUnlink(outputPath),
    ]);
  };

  try {
    const { code, stdout, stderr } = await runTool(args);

    const outputText = (await fsp.readFile(outputPath, "utf8").catch(() => "")) || stdout || "";
    const parsed = parseJsonSafe(outputText);

    if (!parsed) {
      await cleanup();
      return res.status(500).json({
        error: code === 0 ? "Checker did not return valid JSON output." : `Checker failed with exit code ${code}.`,
        stderr: stderr || null,
      });
    }

    await cleanup();
    return res.status(200).json({
      ok: true,
      toolExitCode: code,
      result: parsed,
      stderr: stderr?.trim() || null,
    });
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
