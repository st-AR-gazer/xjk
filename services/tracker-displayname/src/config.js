import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const raw = String(value).trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return fallback;
}

function normalizeBaseUrl(value, fallback = "") {
  return String(value || fallback || "")
    .trim()
    .replace(/\/+$/, "");
}

const PORT = clampInt(process.env.PORT || 3141, { min: 1, max: 65535, fallback: 3141 });
const FRONTEND_DIR =
  process.env.FRONTEND_DIR ||
  path.join(__dirname, "..", "..", "..", "sites", "tracker-displayname.xjk.yt", "frontend");

const TRACKER_DISPLAYNAME_ENABLED = parseBool(process.env.TRACKER_DISPLAYNAME_ENABLED, true);
const TRACKER_DISPLAYNAME_SCHEDULER_ENABLED = parseBool(
  process.env.TRACKER_DISPLAYNAME_SCHEDULER_ENABLED,
  true
);
const TRACKER_DISPLAYNAME_MAINTENANCE_INTERVAL_SECONDS = clampInt(
  process.env.TRACKER_DISPLAYNAME_MAINTENANCE_INTERVAL_SECONDS || 60,
  { min: 60, max: 86400, fallback: 60 }
);
const TRACKER_DISPLAYNAME_STALE_AFTER_SECONDS = clampInt(
  process.env.TRACKER_DISPLAYNAME_STALE_AFTER_SECONDS || 86400,
  { min: 0, max: 30 * 24 * 60 * 60, fallback: 86400 }
);
const TRACKER_DISPLAYNAME_BATCH_SIZE = clampInt(
  process.env.TRACKER_DISPLAYNAME_BATCH_SIZE || 50,
  { min: 1, max: 50, fallback: 50 }
);
const TRACKER_DISPLAYNAME_MAX_ACCOUNTS_PER_CYCLE = clampInt(
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

const TRACKER_DISPLAYNAME_AGGREGATOR_BASE_URL = normalizeBaseUrl(
  process.env.TRACKER_DISPLAYNAME_AGGREGATOR_BASE_URL,
  "http://127.0.0.1:3140/api/v1"
);
const TRACKER_DISPLAYNAME_AGGREGATOR_TOKEN = String(
  process.env.TRACKER_DISPLAYNAME_AGGREGATOR_TOKEN || process.env.AGGREGATOR_INGEST_TOKEN || ""
).trim();
const TRACKER_DISPLAYNAME_REQUEST_TIMEOUT_MS = clampInt(
  process.env.TRACKER_DISPLAYNAME_REQUEST_TIMEOUT_MS || 15000,
  { min: 1000, max: 120000, fallback: 15000 }
);
const TRACKER_DISPLAYNAME_MIN_REQUEST_GAP_MS = clampInt(
  process.env.TRACKER_DISPLAYNAME_MIN_REQUEST_GAP_MS || 5000,
  { min: 0, max: 120000, fallback: 5000 }
);

const UBI_OAUTH_CLIENT_ID = String(process.env.UBI_OAUTH_CLIENT_ID || "").trim();
const UBI_OAUTH_CLIENT_SECRET = String(process.env.UBI_OAUTH_CLIENT_SECRET || "").trim();
const UBI_OAUTH_TOKEN_URL = normalizeBaseUrl(
  process.env.UBI_OAUTH_TOKEN_URL,
  "https://api.trackmania.com/api/access_token"
);
const TRACKER_DISPLAYNAME_API_BASE_URL = normalizeBaseUrl(
  process.env.TRACKER_DISPLAYNAME_API_BASE_URL,
  "https://api.trackmania.com"
);
const TRACKER_DISPLAYNAME_SCOPE = String(process.env.TRACKER_DISPLAYNAME_SCOPE || "clubs").trim();
const TRACKER_DISPLAYNAME_USER_AGENT = String(
  process.env.TRACKER_DISPLAYNAME_USER_AGENT ||
    "altered project by ar, contact @ar___ on discord"
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
