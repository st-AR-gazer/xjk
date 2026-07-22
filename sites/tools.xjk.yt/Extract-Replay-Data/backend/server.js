import express from "express";
import multer from "multer";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "node:path";
import fsp from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { readTextFileWithinLimit, safeMkdir, safeUnlink } from "../../shared/backend/filesystem.js";
import { createUploadErrorHandler, startToolServerIfMain } from "../../shared/backend/http.js";
import { createTempCleanup } from "../../shared/backend/lifecycle.js";
import { createNativeToolBackend } from "../../shared/backend/native-runtime.js";
import { runJsonToolRequest } from "../../shared/backend/responses.js";
import { createFieldUpload, hasAllowedSuffix, isTrackmaniaReplayFilename } from "../../shared/backend/uploads.js";
import { parseBool } from "../../shared/backend/values.js";
import { parseJsonSafe } from "../../../../services/shared/valueUtils.js";

dotenv.config();

const toolRuntime = createNativeToolBackend({
  metaUrl: import.meta.url,
  executableName: "ReplayDataExtractor.exe",
  express,
  helmet,
  morgan,
  rateLimit,
  frontendOptions: { jsonLimit: "2mb" },
  uploadFieldLimitsMb: { requestFile: 1 },
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

const UPLOAD_REPLAY_DIR = path.join(UPLOAD_DIR, "replays");
const UPLOAD_REQUEST_DIR = path.join(UPLOAD_DIR, "requests");
const WORK_DIR = path.join(OUTPUT_DIR, "_work");

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

function parseIntSafe(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return n;
}

const upload = createFieldUpload({
  multer,
  maxFileMb: MAX_FILE_MB,
  maxFiles: 2,
  fields: {
    replay: {
      directory: UPLOAD_REPLAY_DIR,
      accept: (file) => isTrackmaniaReplayFilename(file.originalname),
      errorMessage: "Replay must be a .Replay.Gbx file.",
    },
    requestFile: {
      directory: UPLOAD_REQUEST_DIR,
      accept: (file) => hasAllowedSuffix(file.originalname, [".json"]),
      errorMessage: "Request file must be .json.",
    },
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

app.post(
  "/api/extract",
  toolRuntime.admit,
  upload.fields([
    { name: "replay", maxCount: 1 },
    { name: "requestFile", maxCount: 1 },
  ]),
  toolRuntime.enforceUploadBudget,
  async (req, res) => {
    const replayFile = req.files?.replay?.[0];
    const requestFile = req.files?.requestFile?.[0];

    if (!replayFile) {
      await safeUnlink(requestFile?.path);
      return res.status(400).json({ error: "Replay file is required." });
    }

    const requestId = randomUUID();
    const requestPath = path.join(WORK_DIR, `${requestId}-request.json`);
    const outputPath = path.join(WORK_DIR, `${requestId}-output.json`);

    const cleanup = createTempCleanup({
      keepFiles: KEEP_FILES,
      files: [replayFile.path, requestFile?.path, requestPath, outputPath],
    });

    return runJsonToolRequest({
      res,
      cleanup,
      processName: "Extractor",
      run: async () => {
        const requestFileText = requestFile
          ? await readTextFileWithinLimit(requestFile.path, { maxBytes: 1024 * 1024 })
          : "";
        const customRequestText = typeof req.body?.requestJsonText === "string" ? req.body.requestJsonText : "";
        const requestBody = buildRequestBody({
          replayPath: replayFile.path,
          outputPath,
          body: req.body,
          requestText: customRequestText,
          requestFileText,
        });
        await fsp.writeFile(requestPath, JSON.stringify(requestBody), "utf8");
        return toolRuntime.run([requestPath], { rejectOnNonZero: false });
      },
      readOutput: () =>
        readTextFileWithinLimit(outputPath, {
          maxBytes: runtimeConfig.maxProcessOutputBytes,
          missingValue: "",
        }),
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
