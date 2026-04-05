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

const DEFAULT_TOOL_PATH = path.join(__dirname, "..", "tools", "UnderwaterMapConverter.exe");
const TOOL_PATH = process.env.TOOL_PATH || (fs.existsSync(DEFAULT_TOOL_PATH) ? DEFAULT_TOOL_PATH : "");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "..", "data", "uploads");
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), "..", "data", "processed");
const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, "..", "frontend");

const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 64);
const MAX_FILE_COUNT = Number(process.env.MAX_FILE_COUNT || 25);
const TOOL_TIMEOUT_MS = Number(process.env.TOOL_TIMEOUT_MS || 300000);
const KEEP_FILES = String(process.env.KEEP_FILES || "false").toLowerCase() === "true";

const JOBS_DIR = process.env.JOBS_DIR || path.join(process.cwd(), "..", "data", "jobs");
const JOB_TTL_MS = Number(process.env.JOB_TTL_MS || 6 * 60 * 60 * 1000);
const JOB_CLEANUP_INTERVAL_MS = Number(process.env.JOB_CLEANUP_INTERVAL_MS || 30 * 60 * 1000);

function safeMkdir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

safeMkdir(UPLOAD_DIR);
safeMkdir(OUTPUT_DIR);
safeMkdir(JOBS_DIR);

function stripMapExtension(fileName) {
  return String(fileName || "")
    .replace(/\.map(?:\(\d+\))?\.gbx$/i, "")
    .replace(/\.gbx$/i, "");
}

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

function makeDownloadName(originalName, suffix) {
  const base = stripMapExtension(originalName);
  return `${base}-${suffix}.Map.Gbx`;
}

function sanitizeDownloadName(name) {
  return String(name || "download.bin").replace(/["\\/\r\n]+/g, "_");
}

function runTool(args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    if (!TOOL_PATH) return reject(new Error("TOOL_PATH is not set."));
    if (!fs.existsSync(TOOL_PATH)) return reject(new Error(`Tool not found at: ${TOOL_PATH}`));

    const child = spawn(TOOL_PATH, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
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

function registerRejectedFile(req, file, reason) {
  if (!req.rejectedFiles) req.rejectedFiles = [];
  req.rejectedFiles.push({
    name: file.originalname,
    reason: String(reason || "Rejected."),
  });
}

function strictMapFileFilter(_req, file, cb) {
  if (!isAllowedMapFilename(file.originalname)) {
    return cb(new Error("Unsupported file type. Please upload a .Map.Gbx or .Gbx file."));
  }
  cb(null, true);
}

function lenientMapFileFilter(req, file, cb) {
  if (!isAllowedMapFilename(file.originalname)) {
    registerRejectedFile(req, file, "Unsupported file type.");
    return cb(null, false);
  }
  cb(null, true);
}

const uploadSingle = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: strictMapFileFilter,
});

const uploadBatch = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: MAX_FILE_COUNT },
  fileFilter: lenientMapFileFilter,
});

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("combined"));

app.use(express.static(FRONTEND_DIR));

app.get("/", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.get("/health", (_req, res) => res.type("text").send("ok"));

const convertLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const statusLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

const activeJobs = new Map();

app.post("/api/convert", convertLimiter, uploadSingle.single("map"), async (req, res) => {
  const uploaded = req.file;
  if (!uploaded) return res.status(400).json({ error: "No file uploaded." });

  const inputPath = uploaded.path;
  const requestId = randomUUID();

  const variant = String(req.body?.variant || "both").toLowerCase();
  const coverage = String(req.body?.coverage || "full-stack").toLowerCase();
  const suffix = String(req.body?.suffix || "Underwater").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "Underwater";

  const validVariants = ["normal", "meshless", "both"];
  const validCoverages = ["one-layer", "full-stack"];

  if (!validVariants.includes(variant)) {
    return res.status(400).json({ error: `Invalid variant. Use: ${validVariants.join(", ")}` });
  }
  if (!validCoverages.includes(coverage)) {
    return res.status(400).json({ error: `Invalid coverage. Use: ${validCoverages.join(", ")}` });
  }

  const workDir = path.join(OUTPUT_DIR, requestId);
  safeMkdir(workDir);

  const workInputPath = path.join(workDir, path.basename(inputPath));
  await fsp.copyFile(inputPath, workInputPath);

  const cleanup = async () => {
    if (KEEP_FILES) return;
    try { await fsp.unlink(inputPath); } catch {}
    try { await fsp.rm(workDir, { recursive: true, force: true }); } catch {}
  };

  try {
    const toolArgs = [
      "make-underwater-map",
      workInputPath,
      suffix,
      "--variant", variant,
      "--coverage", coverage,
    ];

    const { stdout, stderr } = await runTool(toolArgs, { cwd: workDir });

    if (stdout?.trim()) console.log(`tool stdout (${requestId}):\n${stdout}`);
    if (stderr?.trim()) console.warn(`tool stderr (${requestId}):\n${stderr}`);

    const outputFiles = await fsp.readdir(workDir);
    const produced = outputFiles.filter(
      (f) => f !== path.basename(workInputPath) && f.toLowerCase().endsWith(".gbx")
    );

    if (produced.length === 0) {
      throw new Error("Conversion produced no output maps.");
    }

    if (produced.length === 1) {
      const outPath = path.join(workDir, produced[0]);
      const dlName = makeDownloadName(uploaded.originalname, suffix);

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizeDownloadName(dlName)}"`);

      const rs = fs.createReadStream(outPath);
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

    // Multiple outputs (variant=both) - build zip
    const zipEntries = produced.map((f) => ({
      name: f,
      path: path.join(workDir, f),
    }));

    const zipBuffer = await buildZipBuffer(zipEntries);
    const baseName = stripMapExtension(uploaded.originalname);
    const zipName = `${baseName}-${suffix}.zip`;

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

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function ensureUniqueZipEntryName(name, usedNames) {
  const safe = sanitizeDownloadName(name);
  if (!usedNames.has(safe)) {
    usedNames.add(safe);
    return safe;
  }

  const ext = path.extname(safe);
  const base = safe.slice(0, safe.length - ext.length);
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}${ext}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }

  const fallback = `${base}-${randomUUID().slice(0, 8)}${ext}`;
  usedNames.add(fallback);
  return fallback;
}

function inferOutputVariantLabel(fileName) {
  const lower = String(fileName || "").toLowerCase();
  if (lower.includes("meshless")) return "Meshless";
  if (lower.includes("normal")) return "Normal";
  return null;
}

function makeBatchOutputName(originalName, suffix, variantRequest, outputFileName, outputIndex, outputCount) {
  const base = stripMapExtension(originalName).trim() || "map";
  const safeSuffix = String(suffix || "Underwater").trim() || "Underwater";

  let label = null;
  if (variantRequest === "both") {
    label = inferOutputVariantLabel(outputFileName);
    if (!label) label = outputCount > 1 ? `Output${outputIndex + 1}` : "Output";
  }

  const labelPart = label ? `-${label}` : "";
  return `${base}-${safeSuffix}${labelPart}.Map.Gbx`;
}

async function moveFile(sourcePath, destPath) {
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  try {
    await fsp.rename(sourcePath, destPath);
  } catch {
    await fsp.copyFile(sourcePath, destPath);
    await fsp.unlink(sourcePath);
  }
}

async function writeJobStatus(jobDir, status) {
  const out = {
    ...status,
    updatedAt: new Date().toISOString(),
  };
  await fsp.writeFile(path.join(jobDir, "status.json"), JSON.stringify(out, null, 2), "utf8");
  return out;
}

async function readJobStatus(jobDir) {
  const raw = await fsp.readFile(path.join(jobDir, "status.json"), "utf8");
  return JSON.parse(raw);
}

function queueJob(jobDir, status) {
  if (activeJobs.has(status.id)) return;

  const promise = processBatchJob(jobDir, status)
    .catch((err) => {
      console.error(`Batch job failed (${status.id}):`, err);
    })
    .finally(() => {
      activeJobs.delete(status.id);
    });

  activeJobs.set(status.id, promise);
}

async function processBatchJob(jobDir, status) {
  const inputsDir = path.join(jobDir, "inputs");
  const workRoot = path.join(jobDir, "work");
  safeMkdir(workRoot);

  status.state = "processing";
  status = await writeJobStatus(jobDir, status);

  const zipEntries = [];
  const usedNames = new Set();
  const errors = [];

  for (const rejected of status.rejectedFiles || []) {
    errors.push({
      name: rejected?.name,
      reason: rejected?.reason,
    });
  }

  for (const file of status.files) {
    file.status = "processing";
    file.outputs = [];
    file.error = null;
    status = await writeJobStatus(jobDir, status);

    const itemWorkDir = path.join(workRoot, file.id);
    safeMkdir(itemWorkDir);

    const inputPath = path.join(inputsDir, file.storedName);
    const toolArgs = [
      "make-underwater-map",
      inputPath,
      status.options.suffix,
      "--variant",
      status.options.variant,
      "--coverage",
      status.options.coverage,
    ];

    try {
      const { stdout, stderr } = await runTool(toolArgs, { cwd: itemWorkDir });
      if (stdout?.trim()) console.log(`tool stdout (${status.id}/${file.id}):\n${stdout}`);
      if (stderr?.trim()) console.warn(`tool stderr (${status.id}/${file.id}):\n${stderr}`);

      const outputFiles = await fsp.readdir(itemWorkDir);
      const produced = outputFiles.filter((f) => f.toLowerCase().endsWith(".gbx"));

      if (produced.length === 0) {
        throw new Error("Conversion produced no output maps.");
      }

      produced.sort((a, b) => a.localeCompare(b));

      produced.forEach((producedFile, index) => {
        const entryName = makeBatchOutputName(
          file.originalName,
          status.options.suffix,
          status.options.variant,
          producedFile,
          index,
          produced.length
        );
        const zipName = ensureUniqueZipEntryName(entryName, usedNames);
        zipEntries.push({
          name: zipName,
          path: path.join(itemWorkDir, producedFile),
        });
        file.outputs.push(zipName);
      });

      file.status = "done";
      status.counts.ok += 1;
    } catch (err) {
      file.status = "error";
      file.error = String(err?.message || err);
      errors.push({
        name: file.originalName,
        reason: file.error,
      });
      status.counts.failed += 1;
    } finally {
      status.counts.done += 1;
      status = await writeJobStatus(jobDir, status);
    }
  }

  const errorsPath = path.join(jobDir, "errors.json");
  const errorsReport = {
    generatedAt: new Date().toISOString(),
    options: status.options,
    counts: status.counts,
    errors,
  };
  await fsp.writeFile(errorsPath, JSON.stringify(errorsReport, null, 2), "utf8");
  zipEntries.push({ name: "errors.json", path: errorsPath });

  const hasAnyMaps = zipEntries.some((e) => e.name.toLowerCase().endsWith(".gbx"));
  const zipBuffer = await buildZipBuffer(zipEntries);
  const zipPath = path.join(jobDir, "result.zip");
  await fsp.writeFile(zipPath, zipBuffer);

  status.state = "done";
  if (!hasAnyMaps) {
    status.message = "No maps were converted successfully.";
  } else if (status.message) {
    delete status.message;
  }
  status.zip = {
    name: `underwater-${sanitizeDownloadName(status.options.suffix)}-${status.id.slice(0, 8)}.zip`,
    path: "result.zip",
    bytes: zipBuffer.length,
  };
  status = await writeJobStatus(jobDir, status);

  if (!KEEP_FILES) {
    try { await fsp.rm(inputsDir, { recursive: true, force: true }); } catch {}
    try { await fsp.rm(workRoot, { recursive: true, force: true }); } catch {}
    try { await fsp.unlink(errorsPath); } catch {}
  }
}

async function cleanupOldJobs() {
  const now = Date.now();
  let entries = [];
  try {
    entries = await fsp.readdir(JOBS_DIR, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map(async (entry) => {
        const jobId = entry.name;
        if (!isUuidLike(jobId)) return;
        if (activeJobs.has(jobId)) return;

        const jobDir = path.join(JOBS_DIR, jobId);
        let stat = null;
        try {
          stat = await fsp.stat(jobDir);
        } catch {
          return;
        }

        if (stat && now - stat.mtimeMs > JOB_TTL_MS) {
          await fsp.rm(jobDir, { recursive: true, force: true });
        }
      })
  );
}

if (!KEEP_FILES) {
  cleanupOldJobs().catch((err) => console.warn("Job cleanup failed:", err));
  setInterval(() => {
    cleanupOldJobs().catch((err) => console.warn("Job cleanup failed:", err));
  }, JOB_CLEANUP_INTERVAL_MS).unref();
}

app.post("/api/convert-batch", convertLimiter, uploadBatch.array("maps", MAX_FILE_COUNT), async (req, res) => {
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];
  const rejectedFiles = Array.isArray(req.rejectedFiles) ? req.rejectedFiles : [];

  const variant = String(req.body?.variant || "both").toLowerCase();
  const coverage = String(req.body?.coverage || "full-stack").toLowerCase();
  const suffix = String(req.body?.suffix || "Underwater").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "Underwater";

  const validVariants = ["normal", "meshless", "both"];
  const validCoverages = ["one-layer", "full-stack"];

  if (!validVariants.includes(variant)) {
    return res.status(400).json({ error: `Invalid variant. Use: ${validVariants.join(", ")}` });
  }
  if (!validCoverages.includes(coverage)) {
    return res.status(400).json({ error: `Invalid coverage. Use: ${validCoverages.join(", ")}` });
  }

  if (uploadedFiles.length === 0) {
    const message = rejectedFiles.length > 0 ? "No valid map files uploaded." : "No files uploaded.";
    return res.status(400).json({ error: message, rejected: rejectedFiles });
  }

  const jobId = randomUUID();
  const jobDir = path.join(JOBS_DIR, jobId);
  const inputsDir = path.join(jobDir, "inputs");
  safeMkdir(inputsDir);

  const files = [];
  for (const file of uploadedFiles) {
    const destPath = path.join(inputsDir, file.filename);
    await moveFile(file.path, destPath);
    files.push({
      id: randomUUID(),
      originalName: file.originalname,
      storedName: file.filename,
      status: "queued",
      outputs: [],
      error: null,
    });
  }

  let status = {
    id: jobId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    state: "queued",
    options: { variant, coverage, suffix },
    counts: {
      total: files.length + rejectedFiles.length,
      accepted: files.length,
      rejected: rejectedFiles.length,
      done: 0,
      ok: 0,
      failed: 0,
    },
    files,
    rejectedFiles,
    zip: null,
  };

  status = await writeJobStatus(jobDir, status);
  queueJob(jobDir, status);

  res.status(202).json({
    jobId,
    statusUrl: `/api/batch/${jobId}/status`,
    downloadUrl: `/api/batch/${jobId}/download`,
  });
});

app.get("/api/batch/:id/status", statusLimiter, async (req, res) => {
  const jobId = req.params.id;
  if (!isUuidLike(jobId)) return res.status(400).json({ error: "Invalid job id." });

  const jobDir = path.join(JOBS_DIR, jobId);
  try {
    const status = await readJobStatus(jobDir);
    res.setHeader("Cache-Control", "no-store");
    res.json(status);
  } catch {
    res.status(404).json({ error: "Job not found." });
  }
});

app.get("/api/batch/:id/download", statusLimiter, async (req, res) => {
  const jobId = req.params.id;
  if (!isUuidLike(jobId)) return res.status(400).json({ error: "Invalid job id." });

  const jobDir = path.join(JOBS_DIR, jobId);
  let status = null;
  try {
    status = await readJobStatus(jobDir);
  } catch {
    return res.status(404).json({ error: "Job not found." });
  }

  if (status.state !== "done" || !status.zip?.path) {
    return res.status(409).json({ error: "Job not finished yet.", state: status.state, counts: status.counts });
  }

  const zipPath = path.join(jobDir, status.zip.path);
  try {
    await fsp.access(zipPath);
  } catch {
    return res.status(404).json({ error: "Zip not found." });
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${sanitizeDownloadName(status.zip.name)}"`);

  const rs = fs.createReadStream(zipPath);
  rs.on("error", (err) => {
    console.error("ReadStream error:", err);
    if (!res.headersSent) res.status(500);
    res.end("Failed to read zip file.");
  });
  rs.pipe(res);
});

// ── Minimal zip builder ────────────────────────────────────────────

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = buildCrc32Table();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC32_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
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
    central.writeUInt32LE(0, 30);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  const cd = Buffer.concat(centralChunks);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(fileSpecs.length, 8);
  end.writeUInt16LE(fileSpecs.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...localChunks, cd, end]);
}

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Backend listening on http://127.0.0.1:${PORT}`);
  console.log(`UPLOAD_DIR=${UPLOAD_DIR}`);
  console.log(`OUTPUT_DIR=${OUTPUT_DIR}`);
  console.log(`TOOL_PATH=${TOOL_PATH}`);
});
