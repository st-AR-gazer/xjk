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
const JSON_LIMIT_MB = Number(process.env.JSON_LIMIT_MB || Math.max(4, Math.ceil(MAX_FILE_MB * 1.5) + 4));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function firstExistingPath(paths) {
  for (const candidate of paths) {
    const full = path.resolve(candidate);
    if (fs.existsSync(full)) return full;
  }
  return "";
}

const TOOL_PATH =
  process.env.TOOL_PATH ||
  firstExistingPath([
    path.join(__dirname, "..", "tools", "ClipToGhost.exe"),
  ]);

const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, "..", "frontend");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "..", "data", "uploads");
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), "..", "data", "processed");
const UPLOAD_RETENTION_MS = Number(process.env.UPLOAD_RETENTION_MS || 60 * 60 * 1000);

const UPLOAD_MAPS_DIR = path.join(UPLOAD_DIR, "maps");
const UPLOAD_TEMPLATES_DIR = path.join(UPLOAD_DIR, "templates");
const UPLOAD_CACHE_DIR = path.join(UPLOAD_DIR, "cache");
const WORK_DIR = path.join(OUTPUT_DIR, "_work");

function safeMkdir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

[FRONTEND_DIR, UPLOAD_DIR, OUTPUT_DIR, UPLOAD_MAPS_DIR, UPLOAD_TEMPLATES_DIR, UPLOAD_CACHE_DIR, WORK_DIR].forEach(safeMkdir);

function isMapFilename(name) {
  const lower = String(name || "").toLowerCase();
  return lower.endsWith(".map.gbx") || lower.endsWith(".gbx");
}

function isGhostFilename(name) {
  const lower = String(name || "").toLowerCase();
  return lower.endsWith(".ghost.gbx") || lower.endsWith(".gbx");
}

function safeExt(name, fallback = ".bin") {
  const ext = path.extname(String(name || ""));
  return ext || fallback;
}

function sanitizeDownloadName(name) {
  const asciiSafe = String(name || "download.bin")
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]+/g, "_")
    .replace(/["\\/\r\n]+/g, "_")
    .trim();

  return asciiSafe || "download.bin";
}

function stripMapExtension(name) {
  return String(name || "")
    .replace(/\.map\.gbx$/i, "")
    .replace(/\.gbx$/i, "");
}

function parseBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNonNegativeInt(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseTemplateMode(value) {
  const normalized = String(value || "shipped").trim().toLowerCase();
  if (normalized === "custom") return "custom";
  if (normalized === "blank") return "blank";
  return "shipped";
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

async function safeRm(targetPath) {
  if (!targetPath) return;
  try {
    await fsp.rm(targetPath, { recursive: true, force: true });
  } catch {}
}

function parseBase64Upload(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^data:[^;]+;base64,(.*)$/i.exec(trimmed);
  return match ? match[1] : trimmed;
}

function sanitizeUploadId(value) {
  const text = String(value || "").trim();
  return /^[a-z0-9-]{16,}$/i.test(text) ? text : "";
}

function getStoredUploadMetaPath(uploadId) {
  return path.join(UPLOAD_CACHE_DIR, `${uploadId}.json`);
}

async function pruneStoredUploads() {
  const entries = await fsp.readdir(UPLOAD_CACHE_DIR, { withFileTypes: true }).catch(() => []);
  const cutoff = Date.now() - UPLOAD_RETENTION_MS;

  await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(UPLOAD_CACHE_DIR, entry.name);
    const stat = await fsp.stat(fullPath).catch(() => null);
    if (!stat || stat.mtimeMs >= cutoff) return;
    await safeRm(fullPath);
  }));
}

async function storeMapUpload(buffer, originalname) {
  await pruneStoredUploads();

  const uploadId = randomUUID();
  const filePath = path.join(UPLOAD_CACHE_DIR, `${uploadId}${safeExt(originalname, ".Gbx")}`);
  const metaPath = getStoredUploadMetaPath(uploadId);

  await fsp.writeFile(filePath, buffer);
  await fsp.writeFile(metaPath, JSON.stringify({
    uploadId,
    originalname,
    path: filePath,
    createdAt: Date.now(),
  }));

  return { uploadId, originalname, path: filePath, transient: false };
}

async function getStoredMapUpload(uploadId) {
  const safeUploadId = sanitizeUploadId(uploadId);
  if (!safeUploadId) return null;

  const metaPath = getStoredUploadMetaPath(safeUploadId);
  const raw = await fsp.readFile(metaPath, "utf8").catch(() => "");
  if (!raw) return null;

  const meta = parseJsonSafe(raw);
  if (!meta || typeof meta !== "object") return null;
  if (!meta.path || !fs.existsSync(meta.path)) return null;

  return {
    uploadId: safeUploadId,
    originalname: sanitizeDownloadName(String(meta.originalname || "map.Map.Gbx")),
    path: String(meta.path),
    transient: false,
  };
}

async function materializeBase64MapUpload(req) {
  const rawBase64 = parseBase64Upload(req.body?.mapBase64);
  if (!rawBase64) return null;

  const originalname = sanitizeDownloadName(String(req.body?.mapFileName || "map.Map.Gbx"));
  if (!isMapFilename(originalname)) {
    throw new Error("mapFileName must be .Map.Gbx / .Gbx.");
  }

  let buffer;
  try {
    buffer = Buffer.from(rawBase64, "base64");
  } catch {
    throw new Error("mapBase64 is not valid base64.");
  }

  if (!buffer || buffer.length === 0) {
    throw new Error("mapBase64 decoded to an empty file.");
  }

  if (buffer.length > MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`Decoded map file exceeds max size of ${MAX_FILE_MB} MB.`);
  }

  const filePath = path.join(UPLOAD_MAPS_DIR, `${randomUUID()}${safeExt(originalname, ".Gbx")}`);
  await fsp.writeFile(filePath, buffer);
  return { path: filePath, originalname, transient: true };
}

async function materializeRawMapUpload(req) {
  const buffer = Buffer.isBuffer(req.body) ? req.body : null;
  if (!buffer || buffer.length === 0) {
    throw new Error("Raw map upload body is empty.");
  }

  if (buffer.length > MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`Uploaded map file exceeds max size of ${MAX_FILE_MB} MB.`);
  }

  const originalname = sanitizeDownloadName(String(req.query?.mapFileName || req.get("x-map-filename") || "map.Map.Gbx"));
  if (!isMapFilename(originalname)) {
    throw new Error("mapFileName must be .Map.Gbx / .Gbx.");
  }

  return storeMapUpload(buffer, originalname);
}

async function getMapUpload(req) {
  const uploaded = req.files?.map?.[0];
  if (uploaded) return { ...uploaded, transient: true };

  const uploadId = String(req.body?.uploadId || req.query?.uploadId || "").trim();
  if (uploadId) {
    return getStoredMapUpload(uploadId);
  }

  return materializeBase64MapUpload(req);
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let current = i;
    for (let j = 0; j < 8; j += 1) {
      current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
    }
    table[i] = current >>> 0;
  }
  return table;
}

const CRC32_TABLE = buildCrc32Table();

function crc32(buffer) {
  let current = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    current = CRC32_TABLE[(current ^ buffer[i]) & 0xff] ^ (current >>> 8);
  }
  return (current ^ 0xffffffff) >>> 0;
}

function getDosDateTime(now = new Date()) {
  const year = Math.max(1980, now.getFullYear());
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  return { dosTime, dosDate };
}

async function buildZipBuffer(fileSpecs) {
  const { dosTime, dosDate } = getDosDateTime();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const spec of fileSpecs) {
    const name = sanitizeDownloadName(spec.name);
    const nameBytes = Buffer.from(name.replace(/\\/g, "/"), "utf8");
    const data = await fsp.readFile(spec.path);
    const dataCrc32 = crc32(data);
    const size = data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(dataCrc32, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    localChunks.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(dataCrc32, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  const centralDir = Buffer.concat(centralChunks);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(fileSpecs.length, 8);
  end.writeUInt16LE(fileSpecs.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDir, end]);
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
      resolve({ code: Number(code || 0), stdout, stderr });
    });
  });
}

async function readManifest(manifestPath) {
  const text = await fsp.readFile(manifestPath, "utf8").catch(() => "");
  return text ? parseJsonSafe(text) : null;
}

async function collectGhostOutputs(workDir) {
  const entries = await fsp.readdir(workDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".ghost.gbx"))
    .map((entry) => ({
      name: entry.name,
      path: path.join(workDir, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildManifestDownloadName(mapOriginalName) {
  return `${stripMapExtension(mapOriginalName) || "map"}.clip-to-ghost.manifest.json`;
}

function buildZipDownloadName(mapOriginalName) {
  return `${stripMapExtension(mapOriginalName) || "map"}-clip-to-ghost.zip`;
}

const uploadStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    if (file.fieldname === "map") return cb(null, UPLOAD_MAPS_DIR);
    if (file.fieldname === "templateGhost") return cb(null, UPLOAD_TEMPLATES_DIR);
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
    if (file.fieldname === "map") {
      if (!isMapFilename(file.originalname)) {
        return cb(new Error("Map file must be .Map.Gbx / .Gbx."));
      }
      return cb(null, true);
    }

    if (file.fieldname === "templateGhost") {
      if (!isGhostFilename(file.originalname)) {
        return cb(new Error("Template ghost must be .Ghost.Gbx / .Gbx."));
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
app.use(express.json({ limit: `${JSON_LIMIT_MB}mb` }));
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

app.post("/api/upload-map", express.raw({ type: () => true, limit: `${MAX_FILE_MB}mb` }), async (req, res) => {
  try {
    const stored = await materializeRawMapUpload(req);
    return res.status(200).json({
      ok: true,
      uploadId: stored.uploadId,
      fileName: stored.originalname,
    });
  } catch (err) {
    return res.status(400).json({ error: String(err?.message || err) });
  }
});

app.post("/api/inspect", upload.fields([{ name: "map", maxCount: 1 }]), async (req, res) => {
  const mapFile = await getMapUpload(req);
  if (!mapFile) {
    if (req.body?.uploadId) {
      return res.status(404).json({ error: "uploadId was not found or has expired." });
    }
    return res.status(400).json({ error: "Map file is required (multipart 'map', JSON 'mapBase64', or 'uploadId')." });
  }

  const clipIndex = parseNonNegativeInt(req.body?.clipIndex);
  const trackIndex = parseNonNegativeInt(req.body?.trackIndex);
  const blockIndex = parseNonNegativeInt(req.body?.blockIndex);
  const requestId = randomUUID();
  const manifestPath = path.join(WORK_DIR, `${requestId}-inspect.manifest.json`);

  const args = [mapFile.path, "--list-only", "--manifest", manifestPath];
  if (clipIndex !== null) args.push("--clip-index", String(clipIndex));
  if (trackIndex !== null) args.push("--track-index", String(trackIndex));
  if (blockIndex !== null) args.push("--block-index", String(blockIndex));

  const cleanup = async () => {
    if (KEEP_FILES) return;
    await Promise.all([
      mapFile.transient ? safeUnlink(mapFile.path) : Promise.resolve(),
      safeUnlink(manifestPath),
    ]);
  };

  try {
    const { code, stdout, stderr } = await runTool(args);
    const manifest = await readManifest(manifestPath);

    await cleanup();

    if (code === 0 && manifest) {
      return res.status(200).json({
        ok: true,
        toolExitCode: code,
        manifest,
        stdout: stdout.trim() || null,
        stderr: stderr.trim() || null,
      });
    }

    const message = stderr.trim() || stdout.trim() || "Clip inspection failed.";
    if (code === 3) {
      return res.status(404).json({ error: message, toolExitCode: code });
    }

    return res.status(code === 1 || code === 2 ? 400 : 500).json({
      error: message,
      toolExitCode: code,
      manifest: manifest || null,
    });
  } catch (err) {
    await cleanup();
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

app.post(
  "/api/export",
  upload.fields([{ name: "map", maxCount: 1 }, { name: "templateGhost", maxCount: 1 }]),
  async (req, res) => {
    const mapFile = await getMapUpload(req);
    const templateGhostFile = req.files?.templateGhost?.[0];

    if (!mapFile) {
      await safeUnlink(templateGhostFile?.path);
      if (req.body?.uploadId) {
        return res.status(404).json({ error: "uploadId was not found or has expired." });
      }
      return res.status(400).json({ error: "Map file is required (multipart 'map', JSON 'mapBase64', or 'uploadId')." });
    }

    const templateMode = parseTemplateMode(req.body?.templateMode);
    if (templateMode === "custom" && !templateGhostFile) {
      if (mapFile.transient) await safeUnlink(mapFile.path);
      return res.status(400).json({ error: "Custom template mode requires a template ghost file." });
    }

    const includeManifest = parseBool(req.body?.includeManifest, true);
    const clipIndex = parseNonNegativeInt(req.body?.clipIndex);
    const trackIndex = parseNonNegativeInt(req.body?.trackIndex);
    const blockIndex = parseNonNegativeInt(req.body?.blockIndex);
    const requestId = randomUUID();
    const workDir = path.join(WORK_DIR, requestId);
    safeMkdir(workDir);

    const manifestPath = path.join(workDir, "clip-to-ghost.manifest.json");
    const args = [mapFile.path, "--out-dir", workDir, "--manifest", manifestPath];
    if (clipIndex !== null) args.push("--clip-index", String(clipIndex));
    if (trackIndex !== null) args.push("--track-index", String(trackIndex));
    if (blockIndex !== null) args.push("--block-index", String(blockIndex));
    if (templateMode !== "shipped") args.push("--template-mode", templateMode);
    if (templateMode === "custom") args.push("--template-ghost", templateGhostFile.path);

    const cleanup = async () => {
      if (KEEP_FILES) return;
      await Promise.all([
        mapFile.transient ? safeUnlink(mapFile.path) : Promise.resolve(),
        safeUnlink(templateGhostFile?.path),
        safeRm(workDir),
      ]);
    };

    try {
      const { code, stdout, stderr } = await runTool(args);
      const manifest = await readManifest(manifestPath);
      const ghosts = await collectGhostOutputs(workDir);

      if (ghosts.length === 0) {
        await cleanup();
        const message = stderr.trim() || stdout.trim() || "No ghosts were exported.";
        if (code === 3) {
          return res.status(404).json({ error: message, toolExitCode: code, manifest: manifest || null });
        }
        return res.status(500).json({ error: message, toolExitCode: code, manifest: manifest || null });
      }

      if (ghosts.length === 1 && code === 0 && !includeManifest) {
        const single = ghosts[0];
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${sanitizeDownloadName(single.name)}"`);

        const stream = fs.createReadStream(single.path);
        stream.on("error", async (err) => {
          console.error("ReadStream error:", err);
          if (!res.headersSent) res.status(500);
          res.end("Failed to read output ghost.");
          await cleanup();
        });

        stream.pipe(res);
        res.on("finish", cleanup);
        return;
      }

      const zipEntries = ghosts.map((ghost) => ({ name: ghost.name, path: ghost.path }));
      const shouldIncludeManifest = Boolean(manifest) && (includeManifest || ghosts.length > 1 || code !== 0);
      if (shouldIncludeManifest) {
        zipEntries.push({
          name: buildManifestDownloadName(mapFile.originalname),
          path: manifestPath,
        });
      }

      const zipBuffer = await buildZipBuffer(zipEntries);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizeDownloadName(buildZipDownloadName(mapFile.originalname))}"`);
      res.setHeader("Content-Length", String(zipBuffer.length));
      res.end(zipBuffer);

      await cleanup();
    } catch (err) {
      await cleanup();
      return res.status(500).json({ error: String(err?.message || err) });
    }
  }
);

app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      error: `request entity too large (JSON limit ${JSON_LIMIT_MB} MB, decoded file limit ${MAX_FILE_MB} MB). Increase JSON_LIMIT_MB and/or MAX_FILE_MB on the Clip-To-Ghost backend.`,
    });
  }

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
