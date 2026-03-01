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
    path.join(__dirname, "..", "tools", "ReplayDataExtractor.exe"),
  ]);

const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, "..", "frontend");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "..", "data", "uploads");
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), "..", "data", "processed");

const UPLOAD_REPLAY_DIR = path.join(UPLOAD_DIR, "replays");
const UPLOAD_REQUEST_DIR = path.join(UPLOAD_DIR, "requests");
const WORK_DIR = path.join(OUTPUT_DIR, "_work");

function safeMkdir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

[FRONTEND_DIR, UPLOAD_DIR, OUTPUT_DIR, UPLOAD_REPLAY_DIR, UPLOAD_REQUEST_DIR, WORK_DIR].forEach(safeMkdir);

const DEFAULT_SELECTION = {
  $type: true,
  Time: {
    TotalMilliseconds: true,
  },
  PlayerLogin: true,
  PlayerNickname: true,
  AuthorLogin: true,
  AuthorNickname: true,
  MapInfo: {
    Author: true,
    Id: true,
  },
  Ghosts: {
    "*": {
      $type: true,
      GhostLogin: true,
      GhostNickname: true,
      GhostUid: {
        Number: true,
      },
      RaceTime: {
        TotalMilliseconds: true,
      },
      Respawns: true,
      GhostZone: true,
    },
  },
};

function safeExt(name, fallback = ".tmp") {
  const ext = path.extname(String(name || ""));
  return ext || fallback;
}

function parseBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseIntSafe(value, fallback) {
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
    if (file.fieldname === "replay") return cb(null, UPLOAD_REPLAY_DIR);
    if (file.fieldname === "requestFile") return cb(null, UPLOAD_REQUEST_DIR);
    return cb(new Error(`Unexpected upload field: ${file.fieldname}`));
  },
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${safeExt(file.originalname, ".bin")}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "replay") {
      const lower = String(file.originalname || "").toLowerCase();
      if (!lower.endsWith(".replay.gbx")) {
        return cb(new Error("Replay must be a .Replay.Gbx file."));
      }
      return cb(null, true);
    }

    if (file.fieldname === "requestFile") {
      const lower = String(file.originalname || "").toLowerCase();
      if (!lower.endsWith(".json")) {
        return cb(new Error("Request file must be .json."));
      }
      return cb(null, true);
    }

    return cb(new Error(`Unexpected upload field: ${file.fieldname}`));
  },
});

function buildRequestBody({ replayPath, outputPath, body, requestText, requestFileText }) {
  const includeNulls = parseBool(body?.includeNulls, false);
  const prettyPrint = parseBool(body?.prettyPrint, false);
  const maxDepth = Math.max(1, Math.min(parseIntSafe(body?.maxDepth, 20), 80));
  const maxCollectionItems = Math.max(10, Math.min(parseIntSafe(body?.maxCollectionItems, 100000), 200000));

  const fromText = requestText?.trim() ? parseJsonSafe(requestText) : null;
  const fromFile = requestFileText?.trim() ? parseJsonSafe(requestFileText) : null;

  const request = fromText || fromFile || {};

  if (!request.selection && !Array.isArray(request.paths)) {
    request.selection = DEFAULT_SELECTION;
  }

  request.replayFile = replayPath;
  request.outputFile = outputPath;
  request.includeNulls = includeNulls;
  request.prettyPrint = prettyPrint;
  request.maxDepth = maxDepth;
  request.maxCollectionItems = maxCollectionItems;

  return request;
}

const app = express();
app.disable("x-powered-by");

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("combined"));
app.use(express.json({ limit: "2mb" }));
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

app.post("/api/extract", upload.fields([{ name: "replay", maxCount: 1 }, { name: "requestFile", maxCount: 1 }]), async (req, res) => {
  const replayFile = req.files?.replay?.[0];
  const requestFile = req.files?.requestFile?.[0];

  if (!replayFile) {
    await safeUnlink(requestFile?.path);
    return res.status(400).json({ error: "Replay file is required." });
  }

  const requestId = randomUUID();
  const requestPath = path.join(WORK_DIR, `${requestId}-request.json`);
  const outputPath = path.join(WORK_DIR, `${requestId}-output.json`);

  const cleanup = async () => {
    if (KEEP_FILES) return;
    await Promise.all([
      safeUnlink(replayFile.path),
      safeUnlink(requestFile?.path),
      safeUnlink(requestPath),
      safeUnlink(outputPath),
    ]);
  };

  try {
    const requestFileText = requestFile ? await fsp.readFile(requestFile.path, "utf8") : "";
    const customRequestText = typeof req.body?.requestJsonText === "string" ? req.body.requestJsonText : "";

    const requestBody = buildRequestBody({
      replayPath: replayFile.path,
      outputPath,
      body: req.body,
      requestText: customRequestText,
      requestFileText,
    });

    await fsp.writeFile(requestPath, JSON.stringify(requestBody), "utf8");
    const { code, stdout, stderr } = await runTool([requestPath]);

    const resultText = (await fsp.readFile(outputPath, "utf8").catch(() => "")) || stdout || "";
    const parsedResult = parseJsonSafe(resultText);

    if (!parsedResult) {
      await cleanup();
      return res.status(500).json({
        error: code === 0 ? "Extractor did not return valid JSON output." : `Extractor failed with exit code ${code}.`,
        stderr: stderr || null,
      });
    }

    await cleanup();
    return res.status(200).json({
      ok: true,
      toolExitCode: code,
      result: parsedResult,
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
