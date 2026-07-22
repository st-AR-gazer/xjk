import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { safeMkdir } from "../../../shared/backend/filesystem.js";
import { createRateLimiter } from "../../../shared/backend/http.js";
import { createNativeToolBackend } from "../../../shared/backend/native-runtime.js";
import {
  createFieldUpload,
  isTrackmaniaGhostFilename,
  isTrackmaniaMapFilename,
} from "../../../shared/backend/uploads.js";

function createClipRuntime({ metaUrl, env = process.env } = {}) {
  const backendDir = path.dirname(fileURLToPath(metaUrl));
  dotenv.config({ path: path.join(backendDir, ".env") });
  const jsonLimitMb = Math.max(
    4,
    Math.min(Number(env.JSON_LIMIT_MB) || Math.ceil(Math.min(Number(env.MAX_FILE_MB) || 64, 160) * 1.5) + 4, 256)
  );
  const toolRuntime = createNativeToolBackend({
    metaUrl,
    executableName: "ClipToGhost.exe",
    express,
    helmet,
    morgan,
    rateLimit,
    frontendOptions: { jsonLimit: `${jsonLimitMb}mb` },
    runtimeOptions: { cwd: backendDir, env },
  });
  const config = toolRuntime.config;
  const paths = {
    uploadMapsDir: path.join(config.uploadDir, "maps"),
    uploadTemplatesDir: path.join(config.uploadDir, "templates"),
    uploadCacheDir: path.join(config.uploadDir, "cache"),
    workDir: path.join(config.outputDir, "_work"),
  };
  [config.frontendDir, config.uploadDir, config.outputDir, ...Object.values(paths)].forEach(safeMkdir);
  const upload = createFieldUpload({
    multer,
    maxFileMb: config.maxFileMb,
    maxFiles: 2,
    fields: {
      map: {
        directory: paths.uploadMapsDir,
        accept: (file) => isTrackmaniaMapFilename(file.originalname),
        errorMessage: "Map file must be .Map.Gbx / .Gbx.",
      },
      templateGhost: {
        directory: paths.uploadTemplatesDir,
        accept: (file) => isTrackmaniaGhostFilename(file.originalname),
        errorMessage: "Template ghost must be .Ghost.Gbx / .Gbx.",
      },
    },
  });
  function runTool(args) {
    return toolRuntime.run(args, { rejectOnNonZero: false }).then(({ code, stdout, stderr }) => ({
      code: Number(code || 0),
      stdout,
      stderr,
    }));
  }
  return {
    ...toolRuntime,
    express,
    jsonLimitMb,
    maxStoredUploads: Math.floor(Math.max(1, Math.min(Number(env.MAX_STORED_UPLOADS) || 16, 64))),
    multer,
    paths,
    runTool,
    upload,
    uploadLimiter: createRateLimiter({ rateLimit, limit: 6 }),
    uploadRetentionMs: Math.max(
      5 * 60 * 1000,
      Math.min(Number(env.UPLOAD_RETENTION_MS) || 60 * 60 * 1000, 24 * 60 * 60 * 1000)
    ),
  };
}

export { createClipRuntime };
