import express from "express";
import multer from "multer";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readTextFileWithinLimit, safeMkdir, safeUnlink } from "../../shared/backend/filesystem.js";
import { createUploadErrorHandler, startToolServerIfMain } from "../../shared/backend/http.js";
import { createTempCleanup } from "../../shared/backend/lifecycle.js";
import { createNativeToolBackend } from "../../shared/backend/native-runtime.js";
import { runJsonToolRequest } from "../../shared/backend/responses.js";
import {
  createFieldUpload,
  hasAllowedSuffix,
  isTrackmaniaMapFilename,
  isTrackmaniaReplayFilename,
} from "../../shared/backend/uploads.js";
import { parseBool } from "../../shared/backend/values.js";

dotenv.config();

const toolRuntime = createNativeToolBackend({
  metaUrl: import.meta.url,
  executableName: "MapValidationChecker.exe",
  express,
  helmet,
  morgan,
  rateLimit,
  frontendOptions: { jsonLimit: "1mb" },
  uploadFieldLimitsMb: { manual: 1 },
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
const UPLOAD_REPLAYS_DIR = path.join(UPLOAD_DIR, "replays");
const UPLOAD_MANUAL_DIR = path.join(UPLOAD_DIR, "manual");
const WORK_DIR = path.join(OUTPUT_DIR, "_work");

[FRONTEND_DIR, UPLOAD_DIR, OUTPUT_DIR, UPLOAD_MAPS_DIR, UPLOAD_REPLAYS_DIR, UPLOAD_MANUAL_DIR, WORK_DIR].forEach(
  safeMkdir
);

function parseIntSafe(value, fallback = null) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return n;
}

const upload = createFieldUpload({
  multer,
  maxFileMb: MAX_FILE_MB,
  maxFiles: 3,
  fields: {
    map: {
      directory: UPLOAD_MAPS_DIR,
      accept: (file) => isTrackmaniaMapFilename(file.originalname),
      errorMessage: "Map must be .Map.Gbx / .Gbx.",
    },
    replay: {
      directory: UPLOAD_REPLAYS_DIR,
      accept: (file) => isTrackmaniaReplayFilename(file.originalname),
      errorMessage: "Replay must be .Replay.Gbx.",
    },
    manual: {
      directory: UPLOAD_MANUAL_DIR,
      accept: (file) => hasAllowedSuffix(file.originalname, [".json"]),
      errorMessage: "Manual overrides file must be .json.",
    },
  },
});

app.post(
  "/api/check",
  toolRuntime.admit,
  upload.fields([
    { name: "map", maxCount: 1 },
    { name: "replay", maxCount: 1 },
    { name: "manual", maxCount: 1 },
  ]),
  toolRuntime.enforceUploadBudget,
  async (req, res) => {
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

    const cleanup = createTempCleanup({
      keepFiles: KEEP_FILES,
      files: [mapFile.path, replayFile?.path, manualFile?.path, outputPath],
    });

    return runJsonToolRequest({
      res,
      run: () => toolRuntime.run(args, { rejectOnNonZero: false }),
      readOutput: () =>
        readTextFileWithinLimit(outputPath, {
          maxBytes: runtimeConfig.maxProcessOutputBytes,
          missingValue: "",
        }),
      cleanup,
      processName: "Checker",
    });
  }
);

app.use(createUploadErrorHandler({ multer, maxFileMb: MAX_FILE_MB }));

export { app };
startToolServerIfMain(import.meta.url, {
  app,
  port: PORT,
  details: [`TOOL_PATH=${TOOL_PATH}`, `UPLOAD_DIR=${UPLOAD_DIR}`, `OUTPUT_DIR=${OUTPUT_DIR}`],
});
