import express from "express";
import multer from "multer";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "node:path";
import fsp from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { safeMkdir } from "../../shared/backend/filesystem.js";
import { createUploadErrorHandler, startToolServerIfMain } from "../../shared/backend/http.js";
import { createTempCleanup } from "../../shared/backend/lifecycle.js";
import { createNativeToolBackend } from "../../shared/backend/native-runtime.js";
import { sendBufferDownload, sendFileDownload } from "../../shared/backend/responses.js";
import { createFieldUpload, getMapUploadExtension, isTrackmaniaMapFilename } from "../../shared/backend/uploads.js";
import { parseBool, sanitizeDownloadName, stripMapGbxExtension } from "../../shared/backend/values.js";
import { buildZipBuffer as buildSharedZipBuffer } from "../../shared/backend/zip.js";

dotenv.config();

const CLONE_HANDLING_ARGS = ["--allow-clones", "remove"];
const toolRuntime = createNativeToolBackend({
  metaUrl: import.meta.url,
  executableName: "stripValidationReplay.exe",
  express,
  helmet,
  morgan,
  rateLimit,
});
const { app, config: runtimeConfig } = toolRuntime;
const {
  port: PORT,
  maxFileMb: MAX_FILE_MB,
  keepFiles: KEEP_FILES,
  toolPath: TOOL_PATH,
  uploadDir: UPLOAD_DIR,
  outputDir: OUTPUT_DIR,
} = runtimeConfig;
const WORK_DIR = path.join(OUTPUT_DIR, "_work");
const RETURN_DIR = path.join(OUTPUT_DIR, "_returns");
const PROCESSED_MAPS_DIR = path.join(OUTPUT_DIR, "maps");
const PROCESSED_GHOSTS_DIR = path.join(OUTPUT_DIR, "ghosts");
const PROCESSED_REPLAYS_DIR = path.join(OUTPUT_DIR, "replays");

const REPLAY_UNSUPPORTED_REASON =
  "Replay export is not available: GBX.NET cannot serialize CGameCtnReplayRecord (Replay.Gbx write support is missing).";

safeMkdir(UPLOAD_DIR);
safeMkdir(OUTPUT_DIR);
safeMkdir(WORK_DIR);
safeMkdir(RETURN_DIR);
safeMkdir(PROCESSED_MAPS_DIR);
safeMkdir(PROCESSED_GHOSTS_DIR);
safeMkdir(PROCESSED_REPLAYS_DIR);

function makeDownloadName(originalName) {
  const base = stripMapGbxExtension(originalName) || "map";
  return `${base}-no-validation-replay.Map.Gbx`;
}

function makeGhostDownloadName(originalName) {
  const base = stripMapGbxExtension(originalName) || "map";
  return `${base}-validation-ghost.Ghost.Gbx`;
}

function makeReplayDownloadName(originalName) {
  const base = stripMapGbxExtension(originalName) || "map";
  return `${base}-validation-replay.Replay.Gbx`;
}

function makeZipDownloadName(originalName) {
  const base = stripMapGbxExtension(originalName) || "map";
  return `${base}-exports.zip`;
}

function buildZipBuffer(fileSpecs) {
  return buildSharedZipBuffer(fileSpecs, { sanitizeName: sanitizeDownloadName });
}

async function pickSingleFile(dir) {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile()).map((e) => path.join(dir, e.name));

    if (files.length === 0) return null;
    if (files.length === 1) return files[0];

    const withStats = await Promise.all(files.map(async (f) => ({ file: f, stat: await fsp.stat(f) })));
    withStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return withStats[0].file;
  } catch {
    return null;
  }
}

const upload = createFieldUpload({
  multer,
  maxFileMb: MAX_FILE_MB,
  fields: {
    map: {
      directory: UPLOAD_DIR,
      buildFilename: ({ file, id }) => `${id}${getMapUploadExtension(file.originalname)}`,
      accept: (file) => isTrackmaniaMapFilename(file.originalname),
      errorMessage: "Unsupported file type. Please upload a Trackmania .Map.Gbx / .Gbx map file.",
    },
  },
});

app.post("/api/strip", toolRuntime.admit, upload.single("map"), toolRuntime.enforceUploadBudget, async (req, res) => {
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

  const toolArgs = [...CLONE_HANDLING_ARGS];
  if (wantMap) toolArgs.push("--return-map", returnMapDir);
  if (wantGhost) toolArgs.push("--return-ghost", returnGhostDir);
  if (wantReplay) toolArgs.push("--return-replay", returnReplayDir);

  const cleanup = createTempCleanup({
    keepFiles: KEEP_FILES,
    files: [inputPath, outputPath],
    directories: [requestReturnDir],
  });

  try {
    const processedRoot = KEEP_FILES ? OUTPUT_DIR : path.join(requestReturnDir, "processed");
    safeMkdir(processedRoot);
    const { stdout, stderr } = await toolRuntime.run([inputPath, outputPath, ...toolArgs], {
      env: { ...process.env, TM_PROCESSED_ROOT: processedRoot },
    });

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
      sendFileDownload({
        res,
        filePath: single.filePath,
        downloadName: single.downloadName,
        cleanup,
      });
      return;
    }

    const zipEntries = selected.map((item) => ({
      name: item.downloadName,
      path: item.filePath,
    }));

    const zipBuffer = await buildZipBuffer(zipEntries);
    const zipName = makeZipDownloadName(uploaded.originalname);
    sendBufferDownload({ res, buffer: zipBuffer, downloadName: zipName });

    await cleanup();
  } catch (err) {
    console.error("Processing failed:", err);
    await cleanup();
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.use(createUploadErrorHandler({ multer, maxFileMb: MAX_FILE_MB }));

export { app };
startToolServerIfMain(import.meta.url, {
  app,
  port: PORT,
  details: [`UPLOAD_DIR=${UPLOAD_DIR}`, `OUTPUT_DIR=${OUTPUT_DIR}`, `TOOL_PATH=${TOOL_PATH}`],
});
