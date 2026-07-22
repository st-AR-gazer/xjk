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
import { createFieldUpload, getMapUploadExtension, isTrackmaniaMapFilename } from "../../../shared/backend/uploads.js";

function createUnderwaterRuntime({ metaUrl, env = process.env } = {}) {
  const backendDir = path.dirname(fileURLToPath(metaUrl));
  dotenv.config({ path: path.join(backendDir, ".env") });
  const toolRuntime = createNativeToolBackend({
    metaUrl,
    executableName: "UnderwaterMapConverter.exe",
    express,
    helmet,
    morgan,
    rateLimit,
    installRateLimit: false,
    runtimeOptions: {
      defaultMaxFileMb: 24,
      defaultMaxUploadMb: 64,
      defaultTimeoutMs: 300000,
      defaultMaxActiveJobs: 2,
      defaultMaxActiveJobsPerClient: 1,
      cwd: backendDir,
      env,
    },
  });
  const config = toolRuntime.config;
  const maxFileCount = Math.floor(Math.max(1, Math.min(Number(env.MAX_FILE_COUNT) || 6, 12)));
  const jobsDir = env.JOBS_DIR || path.join(backendDir, "..", "data", "jobs");
  const jobConfig = {
    jobsDir,
    maxFileCount,
    maxStoredJobs: Math.floor(Math.max(1, Math.min(Number(env.MAX_STORED_JOBS) || 12, 48))),
    ttlMs: Math.max(5 * 60 * 1000, Math.min(Number(env.JOB_TTL_MS) || 60 * 60 * 1000, 24 * 60 * 60 * 1000)),
    cleanupIntervalMs: Math.max(
      60 * 1000,
      Math.min(Number(env.JOB_CLEANUP_INTERVAL_MS) || 30 * 60 * 1000, 60 * 60 * 1000)
    ),
  };
  safeMkdir(config.uploadDir);
  safeMkdir(config.outputDir);
  safeMkdir(jobsDir);

  function registerRejectedFile(req, file, reason) {
    if (!req.rejectedFiles) req.rejectedFiles = [];
    req.rejectedFiles.push({ name: file.originalname, reason: String(reason || "Rejected.") });
  }
  function strictMapFileFilter(_req, file, callback) {
    if (!isTrackmaniaMapFilename(file.originalname)) {
      return callback(new Error("Unsupported file type. Please upload a .Map.Gbx or .Gbx file."));
    }
    callback(null, true);
  }
  function lenientMapFileFilter(req, file, callback) {
    if (!isTrackmaniaMapFilename(file.originalname)) {
      registerRejectedFile(req, file, "Unsupported file type.");
      return callback(null, false);
    }
    callback(null, true);
  }
  const uploadSingle = createFieldUpload({
    multer,
    maxFileMb: config.maxFileMb,
    fields: {
      map: {
        directory: config.uploadDir,
        buildFilename: ({ file, id }) => `${id}${getMapUploadExtension(file.originalname)}`,
      },
    },
    fileFilter: strictMapFileFilter,
  });
  const uploadBatch = createFieldUpload({
    multer,
    maxFileMb: config.maxFileMb,
    maxFiles: maxFileCount,
    fields: {
      maps: {
        directory: config.uploadDir,
        buildFilename: ({ file, id }) => `${id}${getMapUploadExtension(file.originalname)}`,
      },
    },
    fileFilter: lenientMapFileFilter,
  });

  return {
    ...toolRuntime,
    jobConfig,
    limiters: {
      batch: createRateLimiter({ rateLimit, limit: 6 }),
      single: createRateLimiter({ rateLimit, limit: 24 }),
      status: createRateLimiter({ rateLimit, limit: 600 }),
    },
    multer,
    uploadBatch,
    uploadSingle,
  };
}

export { createUnderwaterRuntime };
