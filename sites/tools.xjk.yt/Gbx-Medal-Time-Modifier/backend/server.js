import express from "express";
import multer from "multer";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { safeMkdir, safeUnlink } from "../../shared/backend/filesystem.js";
import { createUploadErrorHandler, startToolServerIfMain } from "../../shared/backend/http.js";
import { createTempCleanup } from "../../shared/backend/lifecycle.js";
import { createNativeToolBackend } from "../../shared/backend/native-runtime.js";
import { sendFileDownload } from "../../shared/backend/responses.js";
import { createFieldUpload, isTrackmaniaMapFilename } from "../../shared/backend/uploads.js";
import { stripMapGbxExtension } from "../../shared/backend/values.js";

dotenv.config();

const toolRuntime = createNativeToolBackend({
  metaUrl: import.meta.url,
  executableName: "GbxMedalTimeModifier.exe",
  express,
  helmet,
  morgan,
  rateLimit,
  frontendOptions: { jsonLimit: "1mb" },
});
const { app, config: runtimeConfig } = toolRuntime;
const {
  port: PORT,
  maxFileMb: MAX_FILE_MB,
  keepFiles: KEEP_FILES,
  toolPath: TOOL_PATH,
  frontendDir: FRONTEND_DIR,
  uploadDir: UPLOAD_DIR,
  outputDir: OUTPUT_DIR,
} = runtimeConfig;

const UPLOAD_MAPS_DIR = path.join(UPLOAD_DIR, "maps");
const WORK_DIR = path.join(OUTPUT_DIR, "_work");

[FRONTEND_DIR, UPLOAD_DIR, OUTPUT_DIR, UPLOAD_MAPS_DIR, WORK_DIR].forEach(safeMkdir);

function makeDownloadName(originalName) {
  const base = stripMapGbxExtension(originalName) || "map";
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

const upload = createFieldUpload({
  multer,
  maxFileMb: MAX_FILE_MB,
  maxFiles: 1,
  fields: {
    map: {
      directory: UPLOAD_MAPS_DIR,
      fallbackExtension: ".Gbx",
      accept: (file) => isTrackmaniaMapFilename(file.originalname),
      errorMessage: "Upload a Trackmania .Map.Gbx / .Gbx map file.",
    },
  },
});

app.post("/api/modify", toolRuntime.admit, upload.single("map"), toolRuntime.enforceUploadBudget, async (req, res) => {
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

  const cleanup = createTempCleanup({ keepFiles: KEEP_FILES, files: [mapFile.path, outputPath] });

  try {
    await toolRuntime.run([mapFile.path, outputPath, at, gold, silver, bronze]);

    const downloadName = makeDownloadName(mapFile.originalname);
    sendFileDownload({
      res,
      filePath: outputPath,
      downloadName,
      cleanup,
      errorMessage: "Failed to read modified map.",
    });
  } catch (err) {
    await cleanup();
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

app.use(createUploadErrorHandler({ multer, maxFileMb: MAX_FILE_MB }));

export { app };
startToolServerIfMain(import.meta.url, {
  app,
  port: PORT,
  details: [`TOOL_PATH=${TOOL_PATH}`, `UPLOAD_DIR=${UPLOAD_DIR}`, `OUTPUT_DIR=${OUTPUT_DIR}`],
});
