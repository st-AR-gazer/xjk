import dotenv from "dotenv";
import { initializeTrackerServiceConfig } from "../../shared/serviceConfigRuntime.js";

const config = initializeTrackerServiceConfig({
  dotenv,
  moduleUrl: import.meta.url,
  defaultPort: 3141,
  frontendMode: "displayname",
});
const { PORT, FRONTEND_DIR } = config;

const TRACKER_DISPLAYNAME_ENABLED = config.parseBool(process.env.TRACKER_DISPLAYNAME_ENABLED, true);
const TRACKER_DISPLAYNAME_SCHEDULER_ENABLED = config.parseBool(process.env.TRACKER_DISPLAYNAME_SCHEDULER_ENABLED, true);
const TRACKER_DISPLAYNAME_MAINTENANCE_INTERVAL_SECONDS = config.clampInt(
  process.env.TRACKER_DISPLAYNAME_MAINTENANCE_INTERVAL_SECONDS || 60,
  { min: 3, max: 24 * 60 * 60, fallback: 60 }
);
const TRACKER_DISPLAYNAME_STALE_AFTER_SECONDS = config.clampInt(
  process.env.TRACKER_DISPLAYNAME_STALE_AFTER_SECONDS || 24 * 60 * 60,
  { min: 0, max: 30 * 24 * 60 * 60, fallback: 24 * 60 * 60 }
);
const TRACKER_DISPLAYNAME_BATCH_SIZE = config.clampInt(process.env.TRACKER_DISPLAYNAME_BATCH_SIZE || 50, {
  min: 1,
  max: 50,
  fallback: 50,
});
const TRACKER_DISPLAYNAME_MAX_ACCOUNTS_PER_CYCLE = config.clampInt(
  process.env.TRACKER_DISPLAYNAME_MAX_ACCOUNTS_PER_CYCLE || 200,
  { min: 1, max: 5000, fallback: 200 }
);

const TRACKER_DISPLAYNAME_PROJECT_KEY = String(
  process.env.TRACKER_DISPLAYNAME_PROJECT_KEY || "local-tracker-displayname"
)
  .trim()
  .toLowerCase();
const TRACKER_DISPLAYNAME_PROJECT_NAME = String(
  process.env.TRACKER_DISPLAYNAME_PROJECT_NAME || "Local Tracker Displayname"
).trim();
const TRACKER_DISPLAYNAME_SOURCE_LABEL = String(
  process.env.TRACKER_DISPLAYNAME_SOURCE_LABEL || "tracker-displayname"
).trim();

const TRACKER_DISPLAYNAME_AGGREGATOR_BASE_URL = config.normalizeBaseUrl(
  process.env.TRACKER_DISPLAYNAME_AGGREGATOR_BASE_URL,
  "http://127.0.0.1:3140/api"
);
const TRACKER_DISPLAYNAME_AGGREGATOR_TOKEN = String(
  process.env.TRACKER_DISPLAYNAME_AGGREGATOR_TOKEN || process.env.AGGREGATOR_INGEST_TOKEN || ""
).trim();
const TRACKER_DISPLAYNAME_REQUEST_TIMEOUT_MS = config.clampInt(
  process.env.TRACKER_DISPLAYNAME_REQUEST_TIMEOUT_MS || 15 * 1000,
  { min: 1000, max: 120000, fallback: 15 * 1000 }
);
const TRACKER_DISPLAYNAME_MIN_REQUEST_GAP_MS = config.clampInt(
  process.env.TRACKER_DISPLAYNAME_MIN_REQUEST_GAP_MS || 5 * 1000,
  { min: 0, max: 120000, fallback: 5 * 1000 }
);

const UBI_OAUTH_CLIENT_ID = String(process.env.UBI_OAUTH_CLIENT_ID || "").trim();
const UBI_OAUTH_CLIENT_SECRET = String(process.env.UBI_OAUTH_CLIENT_SECRET || "").trim();
const UBI_OAUTH_TOKEN_URL = config.normalizeBaseUrl(
  process.env.UBI_OAUTH_TOKEN_URL,
  "https://api.trackmania.com/api/access_token"
);
const TRACKER_DISPLAYNAME_API_BASE_URL = config.normalizeBaseUrl(
  process.env.TRACKER_DISPLAYNAME_API_BASE_URL,
  "https://api.trackmania.com"
);
const TRACKER_DISPLAYNAME_SCOPE = String(process.env.TRACKER_DISPLAYNAME_SCOPE || "clubs").trim();
const TRACKER_DISPLAYNAME_USER_AGENT = String(
  process.env.TRACKER_DISPLAYNAME_USER_AGENT || "trackers.xjk.yt-displayname/1.0 (+https://xjk.yt/)"
).trim();

export {
  PORT,
  FRONTEND_DIR,
  TRACKER_DISPLAYNAME_ENABLED,
  TRACKER_DISPLAYNAME_SCHEDULER_ENABLED,
  TRACKER_DISPLAYNAME_MAINTENANCE_INTERVAL_SECONDS,
  TRACKER_DISPLAYNAME_STALE_AFTER_SECONDS,
  TRACKER_DISPLAYNAME_BATCH_SIZE,
  TRACKER_DISPLAYNAME_MAX_ACCOUNTS_PER_CYCLE,
  TRACKER_DISPLAYNAME_PROJECT_KEY,
  TRACKER_DISPLAYNAME_PROJECT_NAME,
  TRACKER_DISPLAYNAME_SOURCE_LABEL,
  TRACKER_DISPLAYNAME_AGGREGATOR_BASE_URL,
  TRACKER_DISPLAYNAME_AGGREGATOR_TOKEN,
  TRACKER_DISPLAYNAME_REQUEST_TIMEOUT_MS,
  TRACKER_DISPLAYNAME_MIN_REQUEST_GAP_MS,
  UBI_OAUTH_CLIENT_ID,
  UBI_OAUTH_CLIENT_SECRET,
  UBI_OAUTH_TOKEN_URL,
  TRACKER_DISPLAYNAME_API_BASE_URL,
  TRACKER_DISPLAYNAME_SCOPE,
  TRACKER_DISPLAYNAME_USER_AGENT,
};
