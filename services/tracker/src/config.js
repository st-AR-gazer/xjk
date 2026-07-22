import path from "node:path";
import dotenv from "dotenv";
import { ensureDirectorySync } from "../../shared/fsUtils.js";
import { initializeTrackerServiceConfig } from "../../shared/serviceConfigRuntime.js";
import { resolveWrWebhookCredentialEnvironment } from "../../shared/credentialPolicy.js";

const config = initializeTrackerServiceConfig({
  dotenv,
  moduleUrl: import.meta.url,
  defaultPort: 3131,
  frontendMode: (env) =>
    String(env.TRACKER_MODE || "wr")
      .trim()
      .toLowerCase() === "leaderboard"
      ? "leaderboard"
      : "wr",
});
const { PORT, FRONTEND_DIR, FRONTEND_MODE: TRACKER_MODE } = config;
const DATA_DIR =
  process.env.DATA_DIR || path.join(config.moduleDir, "..", "..", "..", "sites", "altered.xjk.yt", "data");
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, "altered-tracker.sqlite");
const TRACKER_ADMIN_TOKEN = String(process.env.TRACKER_ADMIN_TOKEN || "").trim();
const TRACKER_ADMIN_USERNAME = String(process.env.TRACKER_ADMIN_USERNAME || "").trim();
const TRACKER_ADMIN_PASSWORD = String(process.env.TRACKER_ADMIN_PASSWORD || "");
const TRACKER_ADMIN_SESSION_COOKIE_NAME =
  String(process.env.TRACKER_ADMIN_SESSION_COOKIE_NAME || "tracker_admin_session").trim() || "tracker_admin_session";
const TRACKER_ADMIN_SESSION_TTL_SECONDS = config.clampInt(process.env.TRACKER_ADMIN_SESSION_TTL_SECONDS || 43200, {
  min: 300,
  max: 365 * 24 * 60 * 60,
  fallback: 43200,
});
const TRACKER_ADMIN_ALLOW_OPEN = config.parseBool(process.env.TRACKER_ADMIN_ALLOW_OPEN, false);
const TRACKER_ENABLED = config.parseBool(process.env.TRACKER_ENABLED, true);
const TRACKER_PROVIDER = String(process.env.TRACKER_PROVIDER || "noop").trim() || "noop";
const TRACKER_LEADERBOARD_TOP_N = config.clampInt(process.env.TRACKER_LEADERBOARD_TOP_N || 100, {
  min: 1,
  max: 1000,
  fallback: 100,
});
const TRACKER_TICK_SECONDS = config.clampInt(process.env.TRACKER_TICK_SECONDS || 20, {
  min: 3,
  max: 24 * 60 * 60,
  fallback: 20,
});
const TRACKER_BATCH_SIZE = config.clampInt(process.env.TRACKER_BATCH_SIZE || 6, {
  min: 1,
  max: 1000,
  fallback: 6,
});
const TRACKER_MAX_CHECK_INTERVAL_SECONDS = config.clampInt(process.env.TRACKER_MAX_CHECK_INTERVAL_SECONDS || 0, {
  min: 0,
  max: 24 * 60 * 60,
  fallback: 0,
});
const TRACKER_WR_WEBHOOK_URL = String(process.env.TRACKER_WR_WEBHOOK_URL || "").trim();
const TRACKER_WR_WEBHOOK_ENABLED = config.parseBool(
  process.env.TRACKER_WR_WEBHOOK_ENABLED,
  Boolean(TRACKER_WR_WEBHOOK_URL)
);
const { TRACKER_WR_WEBHOOK_SECRET } = resolveWrWebhookCredentialEnvironment(process.env);
const TRACKER_WR_WEBHOOK_TIMEOUT_MS = config.clampInt(process.env.TRACKER_WR_WEBHOOK_TIMEOUT_MS || 5000, {
  min: 1000,
  max: 120000,
  fallback: 5000,
});
const TRACKER_USER_AGENT = String(process.env.TRACKER_USER_AGENT || "").trim() || "xjk-tracker/1.0 (+https://xjk.yt)";
const TRACKER_REQUEST_TIMEOUT_MS = config.clampInt(process.env.TRACKER_REQUEST_TIMEOUT_MS || 10000, {
  min: 2000,
  max: 120000,
  fallback: 10000,
});
const TRACKER_MIN_REQUEST_GAP_MS = config.clampInt(process.env.TRACKER_MIN_REQUEST_GAP_MS || 5000, {
  min: 0,
  max: 120000,
  fallback: 5000,
});
const TRACKER_LIVE_GROUP_UID = String(process.env.TRACKER_LIVE_GROUP_UID || "Personal_Best").trim();
const TRACKER_LIVE_ONLY_WORLD = config.parseBool(process.env.TRACKER_LIVE_ONLY_WORLD, true);
const TRACKER_NADEO_AUTH_MODE = String(process.env.TRACKER_NADEO_AUTH_MODE || "basic")
  .trim()
  .toLowerCase();
const TRACKER_NADEO_DEDI_LOGIN = String(process.env.TRACKER_NADEO_DEDI_LOGIN || "").trim();
const TRACKER_NADEO_DEDI_PASSWORD = String(process.env.TRACKER_NADEO_DEDI_PASSWORD || "");
const TRACKER_UBI_EMAIL = String(process.env.TRACKER_UBI_EMAIL || "").trim();
const TRACKER_UBI_PASSWORD = String(process.env.TRACKER_UBI_PASSWORD || "");
const TRACKER_NADEO_LIVE_ACCESS_TOKEN = String(process.env.TRACKER_NADEO_LIVE_ACCESS_TOKEN || "").trim();
const TRACKER_NADEO_LIVE_REFRESH_TOKEN = String(process.env.TRACKER_NADEO_LIVE_REFRESH_TOKEN || "").trim();
const TRACKER_TOKEN_CACHE_FILE = process.env.TRACKER_TOKEN_CACHE_FILE || path.join(DATA_DIR, "nadeo-token-cache.json");
const TRACKER_AGGREGATOR_BASE_URL = config.normalizeBaseUrl(process.env.TRACKER_AGGREGATOR_BASE_URL);
const TRACKER_AGGREGATOR_ENABLED = config.parseBool(
  process.env.TRACKER_AGGREGATOR_ENABLED,
  Boolean(TRACKER_AGGREGATOR_BASE_URL)
);
const TRACKER_AGGREGATOR_TOKEN = String(process.env.TRACKER_AGGREGATOR_TOKEN || "").trim();
const TRACKER_AGGREGATOR_PROJECT_KEY =
  String(process.env.TRACKER_AGGREGATOR_PROJECT_KEY || "").trim() || "tracker-default";
const TRACKER_AGGREGATOR_PROJECT_NAME =
  String(process.env.TRACKER_AGGREGATOR_PROJECT_NAME || "").trim() || "Tracker Instance";
const TRACKER_AGGREGATOR_SOURCE_LABEL = String(process.env.TRACKER_AGGREGATOR_SOURCE_LABEL || "").trim() || "tracker";
const TRACKER_AGGREGATOR_TIMEOUT_MS = config.clampInt(process.env.TRACKER_AGGREGATOR_TIMEOUT_MS || 5000, {
  min: 1000,
  max: 120000,
  fallback: 5000,
});
const TRACKER_INSTANCE_ID = String(process.env.TRACKER_INSTANCE_ID || "").trim() || `tracker-${PORT}`;
const TRACKER_INSTANCE_NAME = String(process.env.TRACKER_INSTANCE_NAME || "").trim() || `Tracker ${PORT}`;

ensureDirectorySync(DATA_DIR);

export {
  PORT,
  FRONTEND_DIR,
  DATA_DIR,
  DB_FILE,
  TRACKER_ADMIN_TOKEN,
  TRACKER_ADMIN_USERNAME,
  TRACKER_ADMIN_PASSWORD,
  TRACKER_ADMIN_SESSION_COOKIE_NAME,
  TRACKER_ADMIN_SESSION_TTL_SECONDS,
  TRACKER_ADMIN_ALLOW_OPEN,
  TRACKER_ENABLED,
  TRACKER_PROVIDER,
  TRACKER_MODE,
  TRACKER_LEADERBOARD_TOP_N,
  TRACKER_TICK_SECONDS,
  TRACKER_BATCH_SIZE,
  TRACKER_MAX_CHECK_INTERVAL_SECONDS,
  TRACKER_WR_WEBHOOK_ENABLED,
  TRACKER_WR_WEBHOOK_URL,
  TRACKER_WR_WEBHOOK_SECRET,
  TRACKER_WR_WEBHOOK_TIMEOUT_MS,
  TRACKER_USER_AGENT,
  TRACKER_REQUEST_TIMEOUT_MS,
  TRACKER_MIN_REQUEST_GAP_MS,
  TRACKER_LIVE_GROUP_UID,
  TRACKER_LIVE_ONLY_WORLD,
  TRACKER_NADEO_AUTH_MODE,
  TRACKER_NADEO_DEDI_LOGIN,
  TRACKER_NADEO_DEDI_PASSWORD,
  TRACKER_UBI_EMAIL,
  TRACKER_UBI_PASSWORD,
  TRACKER_NADEO_LIVE_ACCESS_TOKEN,
  TRACKER_NADEO_LIVE_REFRESH_TOKEN,
  TRACKER_TOKEN_CACHE_FILE,
  TRACKER_AGGREGATOR_ENABLED,
  TRACKER_AGGREGATOR_BASE_URL,
  TRACKER_AGGREGATOR_TOKEN,
  TRACKER_AGGREGATOR_PROJECT_KEY,
  TRACKER_AGGREGATOR_PROJECT_NAME,
  TRACKER_AGGREGATOR_SOURCE_LABEL,
  TRACKER_AGGREGATOR_TIMEOUT_MS,
  TRACKER_INSTANCE_ID,
  TRACKER_INSTANCE_NAME,
};
