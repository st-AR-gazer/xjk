import path from "node:path";
import { fileURLToPath } from "node:url";
import { firstExistingPath } from "./filesystem.js";

const MEBIBYTE = 1024 * 1024;

function boundedPositiveInteger(value, { fallback, max }) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function resolveToolRuntimeConfig({
  metaUrl,
  executableName,
  defaultPort = 3000,
  defaultMaxFileMb = 64,
  defaultMaxUploadMb = 96,
  defaultTimeoutMs = 180_000,
  defaultMaxActiveJobs = 4,
  defaultMaxActiveJobsPerClient = 2,
  defaultBusyRetryAfterSeconds = 5,
  defaultMaxProcessOutputMb = 8,
  env = process.env,
  cwd = process.cwd(),
}) {
  const backendDir = path.dirname(fileURLToPath(metaUrl));
  const bundledToolPath = path.join(backendDir, "..", "tools", executableName);
  const maxFileMb = boundedPositiveInteger(env.MAX_FILE_MB, { fallback: defaultMaxFileMb, max: 256 });
  const maxUploadMb = boundedPositiveInteger(env.MAX_UPLOAD_MB, {
    fallback: Math.max(defaultMaxUploadMb, maxFileMb),
    max: 512,
  });
  const maxActiveJobs = boundedPositiveInteger(env.TOOL_MAX_ACTIVE_JOBS, {
    fallback: defaultMaxActiveJobs,
    max: 16,
  });
  const maxActiveJobsPerClient = Math.min(
    boundedPositiveInteger(env.TOOL_MAX_ACTIVE_JOBS_PER_CLIENT, {
      fallback: defaultMaxActiveJobsPerClient,
      max: 16,
    }),
    maxActiveJobs
  );

  return {
    port: boundedPositiveInteger(env.PORT, { fallback: defaultPort, max: 65535 }),
    maxFileMb,
    maxUploadMb,
    toolTimeoutMs: boundedPositiveInteger(env.TOOL_TIMEOUT_MS, { fallback: defaultTimeoutMs, max: 15 * 60 * 1000 }),
    maxActiveJobs,
    maxActiveJobsPerClient,
    busyRetryAfterSeconds: boundedPositiveInteger(env.TOOL_BUSY_RETRY_AFTER_SECONDS, {
      fallback: defaultBusyRetryAfterSeconds,
      max: 300,
    }),
    maxProcessOutputBytes:
      boundedPositiveInteger(env.TOOL_MAX_OUTPUT_MB, { fallback: defaultMaxProcessOutputMb, max: 64 }) * MEBIBYTE,
    keepFiles: String(env.KEEP_FILES || "false").toLowerCase() === "true",
    backendDir,
    toolPath: env.TOOL_PATH || firstExistingPath([bundledToolPath]),
    frontendDir: env.FRONTEND_DIR || path.join(backendDir, "..", "frontend"),
    uploadDir: env.UPLOAD_DIR || path.join(cwd, "..", "data", "uploads"),
    outputDir: env.OUTPUT_DIR || path.join(cwd, "..", "data", "processed"),
  };
}
