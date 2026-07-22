import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBoolean as parseBool } from "./envUtils.js";
import { clampInt, normalizeBaseUrl } from "./valueUtils.js";

function initializeServiceConfig({ dotenv, moduleUrl }) {
  dotenv.config();
  return path.dirname(fileURLToPath(moduleUrl));
}

function initializeTrackerServiceConfig({ dotenv, moduleUrl, defaultPort, frontendMode, env = process.env }) {
  const moduleDir = initializeServiceConfig({ dotenv, moduleUrl });
  const resolvedFrontendMode =
    typeof frontendMode === "function" ? String(frontendMode(env) || "").trim() : String(frontendMode || "").trim();
  return {
    PORT: clampInt(env.PORT || defaultPort, {
      min: 1,
      max: 65535,
      fallback: defaultPort,
    }),
    FRONTEND_DIR:
      env.FRONTEND_DIR ||
      path.join(moduleDir, "..", "..", "..", "sites", "trackers.xjk.yt", "frontend", "__runtime", resolvedFrontendMode),
    FRONTEND_MODE: resolvedFrontendMode,
    moduleDir,
    clampInt,
    normalizeBaseUrl,
    parseBool,
  };
}

export { initializeServiceConfig, initializeTrackerServiceConfig };
