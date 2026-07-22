import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { resolveToolRuntimeConfig } from "../runtime.js";

test("resolveToolRuntimeConfig applies converter defaults", () => {
  const backendDir = path.resolve("fixture", "backend");
  const config = resolveToolRuntimeConfig({
    metaUrl: pathToFileURL(path.join(backendDir, "server.js")).href,
    executableName: "Tool.exe",
    env: {},
    cwd: path.resolve("runtime", "backend"),
  });

  assert.equal(config.port, 3000);
  assert.equal(config.maxFileMb, 64);
  assert.equal(config.maxUploadMb, 96);
  assert.equal(config.toolTimeoutMs, 180_000);
  assert.equal(config.maxActiveJobs, 4);
  assert.equal(config.maxActiveJobsPerClient, 2);
  assert.equal(config.busyRetryAfterSeconds, 5);
  assert.equal(config.maxProcessOutputBytes, 8 * 1024 * 1024);
  assert.equal(config.keepFiles, false);
  assert.equal(config.backendDir, backendDir);
  assert.equal(config.toolPath, "");
  assert.equal(config.frontendDir, path.resolve("fixture", "frontend"));
  assert.equal(config.uploadDir, path.resolve("runtime", "data", "uploads"));
  assert.equal(config.outputDir, path.resolve("runtime", "data", "processed"));
});

test("resolveToolRuntimeConfig preserves environment overrides", () => {
  const config = resolveToolRuntimeConfig({
    metaUrl: pathToFileURL(path.resolve("fixture", "backend", "server.js")).href,
    executableName: "Tool.exe",
    defaultMaxFileMb: 64,
    defaultTimeoutMs: 300_000,
    env: {
      PORT: "4321",
      MAX_FILE_MB: "32",
      MAX_UPLOAD_MB: "48",
      TOOL_TIMEOUT_MS: "9000",
      TOOL_MAX_ACTIVE_JOBS: "3",
      TOOL_MAX_ACTIVE_JOBS_PER_CLIENT: "9",
      TOOL_BUSY_RETRY_AFTER_SECONDS: "12",
      TOOL_MAX_OUTPUT_MB: "4",
      KEEP_FILES: "TRUE",
      TOOL_PATH: "custom-tool",
      FRONTEND_DIR: "custom-frontend",
      UPLOAD_DIR: "custom-uploads",
      OUTPUT_DIR: "custom-output",
    },
  });

  assert.deepEqual(config, {
    port: 4321,
    maxFileMb: 32,
    maxUploadMb: 48,
    toolTimeoutMs: 9000,
    maxActiveJobs: 3,
    maxActiveJobsPerClient: 3,
    busyRetryAfterSeconds: 12,
    maxProcessOutputBytes: 4 * 1024 * 1024,
    keepFiles: true,
    backendDir: path.resolve("fixture", "backend"),
    toolPath: "custom-tool",
    frontendDir: "custom-frontend",
    uploadDir: "custom-uploads",
    outputDir: "custom-output",
  });
});

test("resolveToolRuntimeConfig keeps operator overrides within hard resource ceilings", () => {
  const config = resolveToolRuntimeConfig({
    metaUrl: pathToFileURL(path.resolve("fixture", "backend", "server.js")).href,
    executableName: "Tool.exe",
    env: {
      MAX_FILE_MB: "99999",
      MAX_UPLOAD_MB: "99999",
      TOOL_TIMEOUT_MS: "99999999",
      TOOL_MAX_ACTIVE_JOBS: "99999",
      TOOL_MAX_ACTIVE_JOBS_PER_CLIENT: "99999",
      TOOL_MAX_OUTPUT_MB: "99999",
    },
  });

  assert.equal(config.maxFileMb, 256);
  assert.equal(config.maxUploadMb, 512);
  assert.equal(config.toolTimeoutMs, 15 * 60 * 1000);
  assert.equal(config.maxActiveJobs, 16);
  assert.equal(config.maxActiveJobsPerClient, 16);
  assert.equal(config.maxProcessOutputBytes, 64 * 1024 * 1024);
});
