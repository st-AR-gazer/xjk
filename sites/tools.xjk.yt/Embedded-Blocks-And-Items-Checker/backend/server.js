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
import { createFieldUpload, hasAllowedSuffix, isTrackmaniaMapFilename } from "../../shared/backend/uploads.js";
import { parseBool } from "../../shared/backend/values.js";

dotenv.config();

const toolRuntime = createNativeToolBackend({
  metaUrl: import.meta.url,
  executableName: "EmbeddedBlocksAndItemsChecker.exe",
  express,
  helmet,
  morgan,
  rateLimit,
  frontendOptions: { jsonLimit: "1mb" },
  uploadFieldLimitsMb: { manualOverrides: 1 },
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
const UPLOAD_MANUAL_DIR = path.join(UPLOAD_DIR, "manual");
const WORK_DIR = path.join(OUTPUT_DIR, "_work");

[FRONTEND_DIR, UPLOAD_DIR, OUTPUT_DIR, UPLOAD_MAPS_DIR, UPLOAD_MANUAL_DIR, WORK_DIR].forEach(safeMkdir);

const upload = createFieldUpload({
  multer,
  maxFileMb: MAX_FILE_MB,
  maxFiles: 2,
  fields: {
    map: {
      directory: UPLOAD_MAPS_DIR,
      accept: (file) => isTrackmaniaMapFilename(file.originalname),
      errorMessage: "Upload a Trackmania .Map.Gbx / .Gbx map file.",
    },
    manualOverrides: {
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
    { name: "manualOverrides", maxCount: 1 },
  ]),
  toolRuntime.enforceUploadBudget,
  async (req, res) => {
    const mapFile = req.files?.map?.[0];
    const manualFile = req.files?.manualOverrides?.[0];

    if (!mapFile) {
      await safeUnlink(manualFile?.path);
      return res.status(400).json({ error: "Map file is required." });
    }

    const pretty = parseBool(req.body?.pretty, true);
    const caseSensitive = parseBool(req.body?.caseSensitive, false);
    const includeExpectedList = parseBool(req.body?.includeExpectedList, true);
    const includeMapName = parseBool(req.body?.includeMapName, true);
    const relaxedStemMatch = parseBool(req.body?.relaxedStemMatch, false);
    const dumpZip = parseBool(req.body?.dumpZip, false);

    const requestId = randomUUID();
    const outputPath = path.join(WORK_DIR, `${requestId}.json`);

    const args = [mapFile.path, outputPath];
    if (pretty) args.push("--pretty");
    args.push(caseSensitive ? "--case-sensitive" : "--case-insensitive");
    if (!includeExpectedList) args.push("--no-expected-list");
    if (!includeMapName) args.push("--no-map-name");
    if (relaxedStemMatch) args.push("--relaxed-stem-match");
    if (dumpZip) args.push("--dump-zip");
    if (manualFile) args.push("--manual-overrides", manualFile.path);

    const cleanup = createTempCleanup({
      keepFiles: KEEP_FILES,
      files: [mapFile.path, manualFile?.path, outputPath],
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
      resultKey: "report",
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
