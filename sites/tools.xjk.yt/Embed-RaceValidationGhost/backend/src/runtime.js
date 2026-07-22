import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { firstExistingPath, safeMkdir } from "../../../shared/backend/filesystem.js";
import { createNativeToolBackend } from "../../../shared/backend/native-runtime.js";
import {
  createFieldUpload,
  hasAllowedSuffix,
  isTrackmaniaMapFilename,
  isTrackmaniaReplayFilename,
} from "../../../shared/backend/uploads.js";
import { pickStoredExtension } from "./fileNames.js";
import { parseNonNegativeInt } from "./replayInspection.js";

function createEmbedRuntime({ metaUrl, env = process.env } = {}) {
  const backendDir = path.dirname(fileURLToPath(metaUrl));
  dotenv.config({ path: path.join(backendDir, ".env") });
  const toolRuntime = createNativeToolBackend({
    metaUrl,
    executableName: "EmbedRaceValidationGhost.exe",
    express,
    helmet,
    morgan,
    rateLimit,
    frontendOptions: { jsonLimit: "1mb" },
    runtimeOptions: { cwd: backendDir, env },
  });
  const config = toolRuntime.config;
  const replayExtractToolPath =
    env.REPLAY_EXTRACT_TOOL_PATH ||
    firstExistingPath([path.join(backendDir, "..", "tools", "ReplayDataExtractor.exe")]);
  const paths = {
    uploadMapsDir: path.join(config.uploadDir, "maps"),
    uploadInputsDir: path.join(config.uploadDir, "inputs"),
    uploadInspectDir: path.join(config.uploadDir, "inspect"),
    workDir: path.join(config.outputDir, "_work"),
    processedMapsDir: path.join(config.outputDir, "maps"),
    processedGhostsDir: path.join(config.outputDir, "ghosts"),
    processedReplaysDir: path.join(config.outputDir, "replays"),
  };
  [config.uploadDir, config.outputDir, config.frontendDir, ...Object.values(paths)].forEach(safeMkdir);

  function resolveGbxlzoPath() {
    if (env.GBXLZO_PATH) {
      const explicit = path.resolve(env.GBXLZO_PATH);
      if (fs.existsSync(explicit)) return explicit;
    }
    if (!config.toolPath) return "";
    const toolDirectory = path.dirname(path.resolve(config.toolPath));
    return firstExistingPath([
      path.join(backendDir, "gbxlzo.exe"),
      path.join(backendDir, "..", "tools", "gbxlzo.exe"),
      path.join(toolDirectory, "gbxlzo.exe"),
      path.join(backendDir, "..", "..", "Strip-RaceValidationGhost", "tools", "gbxlzo.exe"),
    ]);
  }

  const resolvedGbxlzoPath = resolveGbxlzoPath();
  const embedUpload = createFieldUpload({
    multer,
    maxFileMb: config.maxFileMb,
    maxFiles: 2,
    fields: {
      map: {
        directory: paths.uploadMapsDir,
        buildFilename: ({ file, id }) => `${id}${pickStoredExtension(file.originalname, "map")}`,
        accept: (file) => isTrackmaniaMapFilename(file.originalname),
        errorMessage: "Unsupported map type. Upload a Trackmania .Map.Gbx / .Gbx file.",
      },
      source: {
        directory: paths.uploadInputsDir,
        buildFilename: ({ file, id }) => `${id}${pickStoredExtension(file.originalname, "input")}`,
        accept: (file) => hasAllowedSuffix(file.originalname, [".ghost.gbx", ".replay.gbx", ".gbx"]),
        errorMessage: "Unsupported source type. Upload a .Ghost.Gbx or .Replay.Gbx file.",
      },
    },
  });
  const replayInspectUpload = createFieldUpload({
    multer,
    maxFileMb: config.maxFileMb,
    maxFiles: 1,
    fields: {
      replay: {
        directory: paths.uploadInspectDir,
        buildFilename: ({ file, id }) => `${id}${pickStoredExtension(file.originalname, "input")}`,
        accept: (file) => isTrackmaniaReplayFilename(file.originalname),
        errorMessage: "Replay inspection requires a .Replay.Gbx file.",
      },
    },
  });

  function runEmbedTool(mapPath, sourcePath, outputPath, ghostIndex) {
    const args = [mapPath, sourcePath, outputPath];
    if (resolvedGbxlzoPath) args.push("--gbxlzo", resolvedGbxlzoPath);
    args.push("--ghost-index", String(parseNonNegativeInt(ghostIndex, 0)));
    return toolRuntime.execute({
      executable: config.toolPath,
      args,
      timeoutMs: config.toolTimeoutMs,
      label: "Embed tool",
      pathLabel: "Embed tool path",
    });
  }

  return {
    ...toolRuntime,
    embedUpload,
    extractTimeoutMs: Number(env.EXTRACT_TIMEOUT_MS || 180000),
    multer,
    paths,
    replayExtractToolPath,
    replayInspectUpload,
    resolvedGbxlzoPath,
    runEmbedTool,
  };
}

export { createEmbedRuntime };
