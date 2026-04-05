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
const TOOL_TIMEOUT_MS = Number(process.env.TOOL_TIMEOUT_MS || 300000);
const KEEP_FILES = String(process.env.KEEP_FILES || "false").toLowerCase() === "true";

function safeMkdir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

safeMkdir(UPLOAD_DIR);
safeMkdir(OUTPUT_DIR);

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
  const base = originalName
    .replace(/\.map\.gbx$/i, "")
    .replace(/\.gbx$/i, "");
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

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedMapFilename(file.originalname)) {
      return cb(new Error("Unsupported file type. Please upload a .Map.Gbx file."));
    }
    cb(null, true);
  },
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

app.use(
  "/api/",
  rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.post("/api/convert", upload.single("map"), async (req, res) => {
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
    const baseName = uploaded.originalname.replace(/\.map\.gbx$/i, "").replace(/\.gbx$/i, "");
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
