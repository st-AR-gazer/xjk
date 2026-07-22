import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(moduleDirectory, "..");
const defaultFrontendDirectory = path.resolve(backendDirectory, "..", "frontend");

function integer(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function text(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export function loadPluginHubConfig({ env = process.env, loadEnv = true } = {}) {
  if (loadEnv) dotenv.config({ path: path.join(backendDirectory, ".env") });
  const openplanetOrigin = "https://openplanet.dev";

  return {
    port: integer(env.PORT, 3000, { max: 65535 }),
    host: "127.0.0.1",
    frontendDir: path.resolve(backendDirectory, text(env.FRONTEND_DIR, defaultFrontendDirectory)),
    openplanetOrigin,
    openplanetProfileUrl: text(env.OPENPLANET_PROFILE_URL, `${openplanetOrigin}/u/st-AR-gazer`),
    pluginInstallLabel: text(env.PLUGIN_INSTALL_LABEL, "Openplanet plugin manager"),
    pluginsCacheTtlMs: integer(env.PLUGINS_CACHE_TTL_MS, 5 * 60 * 1000, {
      min: 0,
      max: 24 * 60 * 60 * 1000,
    }),
    openplanetFetchTimeoutMs: integer(env.OPENPLANET_FETCH_TIMEOUT_MS, 12_000, {
      min: 1000,
      max: 120_000,
    }),
    openplanetMaxPages: integer(env.OPENPLANET_MAX_PAGES, 20, { max: 100 }),
    openplanetMaxPlugins: integer(env.OPENPLANET_MAX_PLUGINS, 1000, { max: 10_000 }),
    requestUserAgent: text(env.OPENPLANET_REQUEST_UA, "plugins.xjk.yt (+https://plugins.xjk.yt)"),
    imagePaletteCacheTtlMs: integer(env.IMAGE_PALETTE_CACHE_TTL_MS, 12 * 60 * 60 * 1000, {
      min: 0,
      max: 7 * 24 * 60 * 60 * 1000,
    }),
    imagePaletteFailureCacheTtlMs: integer(env.IMAGE_PALETTE_FAILURE_CACHE_TTL_MS, 15 * 60 * 1000, {
      min: 1000,
      max: 24 * 60 * 60 * 1000,
    }),
    imagePaletteCacheMaxEntries: integer(env.IMAGE_PALETTE_CACHE_MAX_ENTRIES, 512, { max: 10_000 }),
    imagePaletteMaxConcurrency: integer(env.IMAGE_PALETTE_MAX_CONCURRENCY, 4, { max: 32 }),
    imageSampleSize: integer(env.IMAGE_SAMPLE_SIZE, 72, { min: 8, max: 256 }),
    apiRateLimitWindowMs: 5 * 60 * 1000,
    apiRateLimitMax: 120,
  };
}

export { backendDirectory };
