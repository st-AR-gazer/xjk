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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_TOOL_PATH = path.join(__dirname, "..", "tools", "stripValidationReplay.exe");
const TOOL_PATH = process.env.TOOL_PATH || (fs.existsSync(DEFAULT_TOOL_PATH) ? DEFAULT_TOOL_PATH : "");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "..", "data", "uploads");
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), "..", "data", "processed");
const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, "..", "frontend");
const WORK_DIR = path.join(OUTPUT_DIR, "_work");
const RETURN_DIR = path.join(OUTPUT_DIR, "_returns");
const PROCESSED_MAPS_DIR = path.join(OUTPUT_DIR, "maps");
const PROCESSED_GHOSTS_DIR = path.join(OUTPUT_DIR, "ghosts");
const PROCESSED_REPLAYS_DIR = path.join(OUTPUT_DIR, "replays");

const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 64);
const TOOL_TIMEOUT_MS = Number(process.env.TOOL_TIMEOUT_MS || 180000);
const KEEP_FILES = String(process.env.KEEP_FILES || "false").toLowerCase() === "true";
const REPLAY_UNSUPPORTED_REASON = "Replay export is not available: GBX.NET cannot serialize CGameCtnReplayRecord (Replay.Gbx write support is missing).";
function safeMkdir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

safeMkdir(UPLOAD_DIR);
safeMkdir(OUTPUT_DIR);
safeMkdir(WORK_DIR);
safeMkdir(RETURN_DIR);
safeMkdir(PROCESSED_MAPS_DIR);
safeMkdir(PROCESSED_GHOSTS_DIR);
safeMkdir(PROCESSED_REPLAYS_DIR);

function isAllowedMapFilename(filename) {
  const lower = filename.toLowerCase();
  return lower.endsWith(".map.gbx") || lower.endsWith(".gbx");
}

function pickStoredExtension(originalName) {
  const lower = originalName.toLowerCase();
  if (lower.endsWith(".map.gbx")) return ".Map.Gbx";
  const ext = path.extname(originalName);
  return ext ? ext : ".Gbx";
}

function makeDownloadName(originalName) {
  const base = originalName
    .replace(/\.map\.gbx$/i, "")
    .replace(/\.gbx$/i, "");
  return `${base}-no-validation-replay.Map.Gbx`;
}

function makeGhostDownloadName(originalName) {
  const base = originalName
    .replace(/\.map\.gbx$/i, "")
    .replace(/\.gbx$/i, "");
  return `${base}-validation-ghost.Ghost.Gbx`;
}

function makeReplayDownloadName(originalName) {
  const base = originalName
    .replace(/\.map\.gbx$/i, "")
    .replace(/\.gbx$/i, "");
  return `${base}-validation-replay.Replay.Gbx`;
}

function makeZipDownloadName(originalName) {
  const base = originalName
    .replace(/\.map\.gbx$/i, "")
    .replace(/\.gbx$/i, "");
  return `${base}-exports.zip`;
}

function sanitizeDownloadName(name) {
  return String(name || "download.bin").replace(/["\\/\r\n]+/g, "_");
}

function parseBool(value) {
  if (Array.isArray(value)) return value.some(parseBool);
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

async function pickSingleFile(dir) {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => path.join(dir, e.name));

    if (files.length === 0) return null;
    if (files.length === 1) return files[0];

    const withStats = await Promise.all(files.map(async (f) => ({ file: f, stat: await fsp.stat(f) })));
    withStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return withStats[0].file;
  } catch {
    return null;
  }
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = buildCrc32Table();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c = CRC32_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function getDosDateTime(now = new Date()) {
  const year = Math.max(1980, now.getFullYear());
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = Math.floor(now.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;

  return { dosTime, dosDate };
}

async function buildZipBuffer(fileSpecs) {
  const now = new Date();
  const { dosTime, dosDate } = getDosDateTime(now);

  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const spec of fileSpecs) {
    const name = sanitizeDownloadName(spec.name);
    const nameBytes = Buffer.from(name.replace(/\\/g, "/"), "utf8");
    const data = await fsp.readFile(spec.path);
    const dataCrc32 = crc32(data);
    const size = data.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 file names
    localHeader.writeUInt16LE(0, 8); // store (no compression)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(dataCrc32, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length

    localChunks.push(localHeader, nameBytes, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8
    centralHeader.writeUInt16LE(0, 10); // store
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(dataCrc32, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // local header offset

    centralChunks.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // disk number
  end.writeUInt16LE(0, 6); // central dir disk
  end.writeUInt16LE(fileSpecs.length, 8);
  end.writeUInt16LE(fileSpecs.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localChunks, centralDirectory, end]);
}

function runTool(inputPath, outputPath, extraArgs = [], extraEnv = {}) {
  return new Promise((resolve, reject) => {
    if (!TOOL_PATH) return reject(new Error("TOOL_PATH is not set."));
    if (!fs.existsSync(TOOL_PATH)) return reject(new Error(`Tool not found at: ${TOOL_PATH}`));

    const child = spawn(TOOL_PATH, [inputPath, outputPath, ...extraArgs], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...extraEnv },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

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
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`Tool exited with code ${code}\n${stderr || stdout}`));
    });
  });
}
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const id = randomUUID();
    const ext = pickStoredExtension(file.originalname);
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedMapFilename(file.originalname)) {
      return cb(new Error("Unsupported file type. Please upload a Trackmania .Map.Gbx / .Gbx map file."));
    }
    cb(null, true);
  },
});
const app = express();
app.disable("x-powered-by");

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("combined"));

app.use(express.static(FRONTEND_DIR));

app.get("/", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.get("/health", (_req, res) => res.type("text").send("ok"));

app.use(
  "/api/",
  rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.post("/api/strip", upload.single("map"), async (req, res) => {
  const uploaded = req.file;
  if (!uploaded) return res.status(400).json({ error: "No file uploaded." });

  const inputPath = uploaded.path;
  const requestId = randomUUID();
  const outputPath = path.join(WORK_DIR, `${requestId}.Map.Gbx`);
  const requestReturnDir = path.join(RETURN_DIR, requestId);
  const returnMapDir = path.join(requestReturnDir, "maps");
  const returnGhostDir = path.join(requestReturnDir, "ghosts");
  const returnReplayDir = path.join(requestReturnDir, "replays");

  const wantMap = parseBool(req.body?.returnMap);
  const wantGhost = parseBool(req.body?.returnGhost);
  const wantReplay = parseBool(req.body?.returnReplay);

  const toolArgs = [];
  if (wantMap) toolArgs.push("--return-map", returnMapDir);
  if (wantGhost) toolArgs.push("--return-ghost", returnGhostDir);
  if (wantReplay) toolArgs.push("--return-replay", returnReplayDir);

  const cleanup = async () => {
    if (KEEP_FILES) return;
    try { await fsp.unlink(inputPath); } catch {}
    try { await fsp.unlink(outputPath); } catch {}
    try { await fsp.rm(requestReturnDir, { recursive: true, force: true }); } catch {}
  };

  try {
    const { stdout, stderr } = await runTool(inputPath, outputPath, toolArgs, { TM_PROCESSED_ROOT: OUTPUT_DIR });

    if (stdout?.trim()) {
      console.log(`tool stdout (${requestId}):\n${stdout}`);
    }
    if (stderr?.trim()) {
      console.warn(`tool stderr (${requestId}):\n${stderr}`);
    }

    const selected = [];

    if (wantMap) {
      const filePath = await pickSingleFile(returnMapDir);
      if (!filePath) throw new Error("Map return file was requested but not produced.");
      selected.push({
        type: "map",
        filePath,
        downloadName: makeDownloadName(uploaded.originalname),
      });
    }

    if (wantGhost) {
      const filePath = await pickSingleFile(returnGhostDir);
      if (!filePath) throw new Error("Ghost return file was requested but not produced.");
      selected.push({
        type: "ghost",
        filePath,
        downloadName: makeGhostDownloadName(uploaded.originalname),
      });
    }

    if (wantReplay) {
      const filePath = await pickSingleFile(returnReplayDir);
      if (!filePath) throw new Error(REPLAY_UNSUPPORTED_REASON);
      selected.push({
        type: "replay",
        filePath,
        downloadName: makeReplayDownloadName(uploaded.originalname),
      });
    }

    if (selected.length === 0) {
      await cleanup();
      return res.status(200).json({ ok: true, message: "Processed successfully. No return files were selected." });
    }

    if (selected.length === 1) {
      const single = selected[0];
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizeDownloadName(single.downloadName)}"`);

      const rs = fs.createReadStream(single.filePath);
      rs.on("error", async (err) => {
        console.error("ReadStream error:", err);
        if (!res.headersSent) res.status(500);
        res.end("Failed to read output file.");
        await cleanup();
      });

      rs.pipe(res);
      res.on("finish", cleanup);
      return;
    }

    const zipEntries = selected.map((item) => ({
      name: item.downloadName,
      path: item.filePath,
    }));

    const zipBuffer = await buildZipBuffer(zipEntries);
    const zipName = makeZipDownloadName(uploaded.originalname);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${sanitizeDownloadName(zipName)}"`);
    res.setHeader("Content-Length", String(zipBuffer.length));
    res.end(zipBuffer);

    await cleanup();

  } catch (err) {
    console.error("Processing failed:", err);
    await cleanup();
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Backend listening on http://127.0.0.1:${PORT}`);
  console.log(`UPLOAD_DIR=${UPLOAD_DIR}`);
  console.log(`OUTPUT_DIR=${OUTPUT_DIR}`);
  console.log(`TOOL_PATH=${TOOL_PATH}`);
});

