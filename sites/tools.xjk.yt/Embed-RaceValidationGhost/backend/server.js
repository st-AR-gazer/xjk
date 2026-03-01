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
    path.join(__dirname, "..", "tools", "EmbedRaceValidationGhost.exe"),
  ]);
const REPLAY_EXTRACT_TOOL_PATH =
  process.env.REPLAY_EXTRACT_TOOL_PATH ||
  firstExistingPath([
    path.join(__dirname, "..", "tools", "ReplayDataExtractor.exe"),
  ]);
const GBXLZO_PATH = process.env.GBXLZO_PATH || "";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "..", "data", "uploads");
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), "..", "data", "processed");
const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, "..", "frontend");

const UPLOAD_MAPS_DIR = path.join(UPLOAD_DIR, "maps");
const UPLOAD_INPUTS_DIR = path.join(UPLOAD_DIR, "inputs");
const UPLOAD_INSPECT_DIR = path.join(UPLOAD_DIR, "inspect");
const WORK_DIR = path.join(OUTPUT_DIR, "_work");
const PROCESSED_MAPS_DIR = path.join(OUTPUT_DIR, "maps");
const PROCESSED_GHOSTS_DIR = path.join(OUTPUT_DIR, "ghosts");
const PROCESSED_REPLAYS_DIR = path.join(OUTPUT_DIR, "replays");

const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 128);
const TOOL_TIMEOUT_MS = Number(process.env.TOOL_TIMEOUT_MS || 180000);
const EXTRACT_TIMEOUT_MS = Number(process.env.EXTRACT_TIMEOUT_MS || 180000);
const KEEP_FILES = String(process.env.KEEP_FILES || "false").toLowerCase() === "true";
const UINT32_MAX_UNIX_SECONDS = 0xffffffff;

const REPLAY_SELECTION = {
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
      GhostUid: {
        Number: true,
      },
      GhostLogin: true,
      GhostNickname: true,
      GhostClubTag: true,
      GhostTrigram: true,
      GhostZone: true,
      RaceTime: {
        Milliseconds: true,
        Seconds: true,
        Minutes: true,
        TotalMilliseconds: true,
      },
      EventsDuration: {
        TotalMilliseconds: true,
      },
      Respawns: true,
      StuntScore: true,
      SteeringWheelSensitivity: true,
      WalltimeStartTimestamp: true,
      WalltimeEndTimestamp: true,
      Checkpoints: {
        "*": {
          Speed: true,
          StuntsScore: true,
        },
      },
      SkinPackDescs: {
        "*": {
          FilePath: true,
          LocatorUrl: true,
        },
      },
      PlayerModel: {
        Author: true,
        Id: true,
      },
      RecordData: {
        GameVersion: true,
      },
      CompressedData: {
        UncompressedSize: true,
      },
    },
  },
};

function safeMkdir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

[
  UPLOAD_DIR,
  OUTPUT_DIR,
  FRONTEND_DIR,
  UPLOAD_MAPS_DIR,
  UPLOAD_INPUTS_DIR,
  UPLOAD_INSPECT_DIR,
  WORK_DIR,
  PROCESSED_MAPS_DIR,
  PROCESSED_GHOSTS_DIR,
  PROCESSED_REPLAYS_DIR,
].forEach(safeMkdir);

function resolveGbxlzoPath() {
  if (GBXLZO_PATH) {
    const explicit = path.resolve(GBXLZO_PATH);
    if (fs.existsSync(explicit)) return explicit;
  }

  if (!TOOL_PATH) return "";

  const toolDir = path.dirname(path.resolve(TOOL_PATH));

  const candidates = [
    path.join(process.cwd(), "gbxlzo.exe"),
    path.join(process.cwd(), "..", "tools", "gbxlzo.exe"),
    path.join(__dirname, "..", "tools", "gbxlzo.exe"),
    path.join(toolDir, "gbxlzo.exe"),
    path.join(__dirname, "..", "..", "Strip-RaceValidationGhost", "tools", "gbxlzo.exe"),
  ];

  for (const candidate of candidates) {
    const full = path.resolve(candidate);
    if (fs.existsSync(full)) return full;
  }

  return "";
}

const RESOLVED_GBXLZO_PATH = resolveGbxlzoPath();

function isAllowedMapFilename(filename) {
  const lower = String(filename || "").toLowerCase();
  return lower.endsWith(".map.gbx") || lower.endsWith(".gbx");
}

function isReplayFilename(filename) {
  return String(filename || "").toLowerCase().endsWith(".replay.gbx");
}

function isGhostFilename(filename) {
  return String(filename || "").toLowerCase().endsWith(".ghost.gbx");
}

function isAllowedInputFilename(filename) {
  const lower = String(filename || "").toLowerCase();
  return lower.endsWith(".ghost.gbx") || lower.endsWith(".replay.gbx") || lower.endsWith(".gbx");
}

function pickStoredExtension(originalName, kind) {
  const lower = String(originalName || "").toLowerCase();
  if (kind === "map" && lower.endsWith(".map.gbx")) return ".Map.Gbx";
  if (kind === "input" && lower.endsWith(".ghost.gbx")) return ".Ghost.Gbx";
  if (kind === "input" && lower.endsWith(".replay.gbx")) return ".Replay.Gbx";
  const ext = path.extname(String(originalName || ""));
  return ext || ".Gbx";
}

function sanitizeDownloadName(name) {
  return String(name || "download.bin").replace(/["\\/\r\n]+/g, "_");
}

function sanitizePathSegment(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
}

function timestampToken() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(
    d.getUTCMinutes()
  )}${p(d.getUTCSeconds())}`;
}

function makeEmbeddedMapDownloadName(originalMapName, selectedGhostIndex = null) {
  const base = String(originalMapName || "map")
    .replace(/\.map\.gbx$/i, "")
    .replace(/\.gbx$/i, "");

  if (Number.isInteger(selectedGhostIndex)) {
    return `${base}-with-embedded-validation-ghost-${selectedGhostIndex}.Map.Gbx`;
  }

  return `${base}-with-embedded-validation-ghost.Map.Gbx`;
}

function buildProcessedMapPath(requestId, originalMapName) {
  const base = sanitizePathSegment(
    String(originalMapName || "map")
      .replace(/\.map\.gbx$/i, "")
      .replace(/\.gbx$/i, "")
  );
  return path.join(
    PROCESSED_MAPS_DIR,
    `${requestId}-with-embedded-validation-ghost-${timestampToken()}-${base}.Map.Gbx`
  );
}

function buildProcessedGhostPath(requestId, originalName) {
  const base = sanitizePathSegment(
    String(originalName || "ghost")
      .replace(/\.ghost\.gbx$/i, "")
      .replace(/\.gbx$/i, "")
  );
  return path.join(PROCESSED_GHOSTS_DIR, `${requestId}-validation-ghost-${timestampToken()}-${base}.Ghost.Gbx`);
}

function buildProcessedReplayPath(requestId, originalName) {
  const base = sanitizePathSegment(
    String(originalName || "replay")
      .replace(/\.replay\.gbx$/i, "")
      .replace(/\.gbx$/i, "")
  );
  return path.join(PROCESSED_REPLAYS_DIR, `${requestId}-validation-replay-${timestampToken()}-${base}.Replay.Gbx`);
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNonNegativeNumber(value) {
  const n = toFiniteNumber(value);
  return n !== null && n >= 0 ? n : null;
}

function normalizeWalltimeTimestamp(value) {
  if (typeof value !== "string" || value.trim().length === 0) return null;

  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return null;

  const unixSeconds = Math.floor(ts / 1000);

  if (unixSeconds >= UINT32_MAX_UNIX_SECONDS) return null;

  return value;
}

function deriveWalltimeEndTimestamp(startTimestamp, raceTimeTotalMilliseconds) {
  if (typeof startTimestamp !== "string") return null;
  if (!Number.isFinite(raceTimeTotalMilliseconds) || raceTimeTotalMilliseconds < 0) return null;

  const startMs = Date.parse(startTimestamp);
  if (!Number.isFinite(startMs)) return null;

  return new Date(startMs + raceTimeTotalMilliseconds).toISOString();
}

function parseNonNegativeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return fallback;
  return n;
}

function getCheckpointSpeedStats(checkpoints) {
  const speeds = (Array.isArray(checkpoints) ? checkpoints : [])
    .map((cp) => toFiniteNumber(cp?.Speed))
    .filter((s) => s !== null);

  if (speeds.length === 0) return null;

  const min = Math.min(...speeds);
  const max = Math.max(...speeds);
  const avg = speeds.reduce((sum, value) => sum + value, 0) / speeds.length;

  return { min, max, avg };
}

function normalizeReplayInspection(raw) {
  const ghostsRaw = Array.isArray(raw?.Ghosts) ? raw.Ghosts : [];

  const ghosts = ghostsRaw.map((ghost, index) => {
    const checkpointCount = Array.isArray(ghost?.Checkpoints) ? ghost.Checkpoints.length : 0;
    const skinPackDescs = Array.isArray(ghost?.SkinPackDescs) ? ghost.SkinPackDescs : [];
    const raceTimeTotalMilliseconds = toFiniteNumber(ghost?.RaceTime?.TotalMilliseconds);
    const walltimeStartTimestamp = normalizeWalltimeTimestamp(ghost?.WalltimeStartTimestamp);
    const walltimeEndTimestampRaw = normalizeWalltimeTimestamp(ghost?.WalltimeEndTimestamp);
    const walltimeEndTimestamp =
      walltimeEndTimestampRaw ?? deriveWalltimeEndTimestamp(walltimeStartTimestamp, raceTimeTotalMilliseconds);

    return {
      index,
      type: ghost?.$type || null,
      ghostUidNumber: toFiniteNumber(ghost?.GhostUid?.Number),
      ghostLogin: ghost?.GhostLogin || null,
      ghostNickname: ghost?.GhostNickname || null,
      ghostClubTag: ghost?.GhostClubTag || null,
      ghostTrigram: ghost?.GhostTrigram || null,
      ghostZone: ghost?.GhostZone || null,
      raceTime: {
        milliseconds: toFiniteNumber(ghost?.RaceTime?.Milliseconds),
        seconds: toFiniteNumber(ghost?.RaceTime?.Seconds),
        minutes: toFiniteNumber(ghost?.RaceTime?.Minutes),
        totalMilliseconds: raceTimeTotalMilliseconds,
      },
      eventsDurationMs: toFiniteNumber(ghost?.EventsDuration?.TotalMilliseconds),
      respawns: toNonNegativeNumber(ghost?.Respawns),
      stuntScore: toFiniteNumber(ghost?.StuntScore),
      steeringWheelSensitivity: typeof ghost?.SteeringWheelSensitivity === "boolean" ? ghost.SteeringWheelSensitivity : null,
      walltimeStartTimestamp,
      walltimeEndTimestamp,
      checkpointCount,
      checkpointSpeedStats: getCheckpointSpeedStats(ghost?.Checkpoints),
      skinPackCount: skinPackDescs.length,
      skinPackFiles: skinPackDescs
        .map((item) => item?.FilePath)
        .filter((value) => typeof value === "string" && value.trim().length > 0),
      playerModel: {
        author: ghost?.PlayerModel?.Author || null,
        id: ghost?.PlayerModel?.Id || null,
      },
      recordData: {
        gameVersion: ghost?.RecordData?.GameVersion || null,
      },
      compressedData: {
        uncompressedSize: toFiniteNumber(ghost?.CompressedData?.UncompressedSize),
      },
    };
  });

  return {
    replayType: raw?.$type || null,
    totalTimeMs: toFiniteNumber(raw?.Time?.TotalMilliseconds),
    playerLogin: raw?.PlayerLogin || null,
    playerNickname: raw?.PlayerNickname || null,
    authorLogin: raw?.AuthorLogin || null,
    authorNickname: raw?.AuthorNickname || null,
    mapInfo: {
      author: raw?.MapInfo?.Author || null,
      id: raw?.MapInfo?.Id || null,
    },
    ghostCount: ghosts.length,
    ghosts,
  };
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch {}
}

async function tryCopy(src, dst) {
  try {
    await fsp.copyFile(src, dst);
  } catch (err) {
    console.warn(`copy failed (${src} -> ${dst}):`, err);
  }
}

function runProcess(exePath, args, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    if (!exePath) return reject(new Error(`${label} path is not set.`));
    if (!fs.existsSync(exePath)) return reject(new Error(`${label} not found at: ${exePath}`));

    const child = spawn(exePath, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });

    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        return resolve({ stdout, stderr });
      }
      reject(new Error(`${label} exited with code ${code}\n${stderr || stdout}`));
    });
  });
}

function runEmbedTool(mapPath, sourcePath, outputPath, ghostIndex) {
  const args = [mapPath, sourcePath, outputPath];
  if (RESOLVED_GBXLZO_PATH) args.push("--gbxlzo", RESOLVED_GBXLZO_PATH);
  args.push("--ghost-index", String(parseNonNegativeInt(ghostIndex, 0)));
  return runProcess(TOOL_PATH, args, TOOL_TIMEOUT_MS, "Embed tool");
}

async function extractReplayInspection(replayPath, requestId) {
  const requestPath = path.join(WORK_DIR, `${requestId}-extract-request.json`);
  const outputPath = path.join(WORK_DIR, `${requestId}-extract-output.json`);

  try {
    const request = {
      replayFile: replayPath,
      outputFile: outputPath,
      includeNulls: false,
      prettyPrint: false,
      maxDepth: 12,
      maxCollectionItems: 50000,
      selection: REPLAY_SELECTION,
    };

    await fsp.writeFile(requestPath, JSON.stringify(request), "utf8");
    const { stdout, stderr } = await runProcess(REPLAY_EXTRACT_TOOL_PATH, [requestPath], EXTRACT_TIMEOUT_MS, "Replay extractor");

    if (stdout?.trim()) {
      console.log(`replay extractor stdout (${requestId}):\n${stdout}`);
    }
    if (stderr?.trim()) {
      console.warn(`replay extractor stderr (${requestId}):\n${stderr}`);
    }

    const payload = JSON.parse(await fsp.readFile(outputPath, "utf8"));
    return normalizeReplayInspection(payload);
  } finally {
    if (!KEEP_FILES) {
      await safeUnlink(requestPath);
      await safeUnlink(outputPath);
    }
  }
}

const embedStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    if (file.fieldname === "map") return cb(null, UPLOAD_MAPS_DIR);
    if (file.fieldname === "source") return cb(null, UPLOAD_INPUTS_DIR);
    return cb(new Error(`Unexpected field: ${file.fieldname}`));
  },
  filename: (_req, file, cb) => {
    const id = randomUUID();
    const kind = file.fieldname === "map" ? "map" : "input";
    cb(null, `${id}${pickStoredExtension(file.originalname, kind)}`);
  },
});

const inspectStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_INSPECT_DIR),
  filename: (_req, file, cb) => {
    const id = randomUUID();
    cb(null, `${id}${pickStoredExtension(file.originalname, "input")}`);
  },
});

const embedUpload = multer({
  storage: embedStorage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "map") {
      if (!isAllowedMapFilename(file.originalname)) {
        return cb(new Error("Unsupported map type. Upload a Trackmania .Map.Gbx / .Gbx file."));
      }
      return cb(null, true);
    }

    if (file.fieldname === "source") {
      if (!isAllowedInputFilename(file.originalname)) {
        return cb(new Error("Unsupported source type. Upload a .Ghost.Gbx or .Replay.Gbx file."));
      }
      return cb(null, true);
    }

    return cb(new Error(`Unexpected upload field: ${file.fieldname}`));
  },
});

const replayInspectUpload = multer({
  storage: inspectStorage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname !== "replay") {
      return cb(new Error(`Unexpected upload field: ${file.fieldname}`));
    }

    const lower = String(file.originalname || "").toLowerCase();
    if (!lower.endsWith(".replay.gbx")) {
      return cb(new Error("Replay inspection requires a .Replay.Gbx file."));
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

app.post("/api/inspect-replay", replayInspectUpload.single("replay"), async (req, res) => {
  const replayFile = req.file;
  if (!replayFile) {
    return res.status(400).json({ error: "No replay file uploaded." });
  }

  const requestId = randomUUID();

  try {
    const replay = await extractReplayInspection(replayFile.path, requestId);
    if (!replay || replay.ghostCount < 1) {
      throw new Error("Replay file contains zero ghosts.");
    }

    return res.status(200).json({
      ok: true,
      inputKind: "replay",
      replay,
      selectedGhostIndex: 0,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  } finally {
    await safeUnlink(replayFile.path);
  }
});

app.post("/api/embed", embedUpload.fields([{ name: "map", maxCount: 1 }, { name: "source", maxCount: 1 }]), async (req, res) => {
  const mapFile = req.files?.map?.[0];
  const sourceFile = req.files?.source?.[0];

  if (!mapFile || !sourceFile) {
    await Promise.all([safeUnlink(mapFile?.path), safeUnlink(sourceFile?.path)]);
    return res.status(400).json({ error: "Both files are required: one map and one ghost/replay source file." });
  }

  const sourceKindRaw = String(req.body?.sourceKind || "").trim().toLowerCase();
  const sourceKind = sourceKindRaw === "replay" ? "replay" : sourceKindRaw === "ghost" ? "ghost" : isReplayFilename(sourceFile.originalname) ? "replay" : "ghost";

  const selectedGhostIndex = sourceKind === "replay" ? parseNonNegativeInt(req.body?.ghostIndex, 0) : 0;
  const requestId = randomUUID();
  const outputPath = path.join(WORK_DIR, `${requestId}.Map.Gbx`);
  const processedMapPath = buildProcessedMapPath(requestId, mapFile.originalname);

  const cleanupInputsAndWork = async () => {
    if (KEEP_FILES) return;
    await Promise.all([safeUnlink(mapFile.path), safeUnlink(sourceFile.path), safeUnlink(outputPath)]);
  };

  try {
    const { stdout, stderr } = await runEmbedTool(mapFile.path, sourceFile.path, outputPath, selectedGhostIndex);

    if (stdout?.trim()) {
      console.log(`embed stdout (${requestId}):\n${stdout}`);
    }
    if (stderr?.trim()) {
      console.warn(`embed stderr (${requestId}):\n${stderr}`);
    }

    const copyJobs = [tryCopy(outputPath, processedMapPath)];
    if (sourceKind === "replay") {
      copyJobs.push(tryCopy(sourceFile.path, buildProcessedReplayPath(requestId, sourceFile.originalname)));
    } else {
      copyJobs.push(tryCopy(sourceFile.path, buildProcessedGhostPath(requestId, sourceFile.originalname)));
    }
    await Promise.all(copyJobs);

    const downloadName = makeEmbeddedMapDownloadName(mapFile.originalname, sourceKind === "replay" ? selectedGhostIndex : null);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${sanitizeDownloadName(downloadName)}"`);

    const rs = fs.createReadStream(outputPath);
    rs.on("error", async (err) => {
      console.error("ReadStream error:", err);
      if (!res.headersSent) res.status(500);
      res.end("Failed to read embedded map.");
      await cleanupInputsAndWork();
    });

    rs.pipe(res);
    res.on("finish", cleanupInputsAndWork);
  } catch (err) {
    await cleanupInputsAndWork();
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: `File too large. Max size is ${MAX_FILE_MB} MB per file.` });
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
  console.log(`REPLAY_EXTRACT_TOOL_PATH=${REPLAY_EXTRACT_TOOL_PATH}`);
  if (RESOLVED_GBXLZO_PATH) {
    console.log(`GBXLZO_PATH=${RESOLVED_GBXLZO_PATH}`);
  } else {
    console.log("GBXLZO_PATH could not be auto-resolved; embed may fail unless gbxlzo.exe is on PATH.");
  }
  console.log(`UPLOAD_DIR=${UPLOAD_DIR}`);
  console.log(`OUTPUT_DIR=${OUTPUT_DIR}`);
});

