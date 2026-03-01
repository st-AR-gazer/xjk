import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeBaseUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

function parseEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const raw = String(value).trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return fallback;
}

const PORT = Number(process.env.PORT || 3130);
const FRONTEND_DIR =
  process.env.FRONTEND_DIR ||
  path.join(__dirname, "..", "..", "..", "sites", "altered.xjk.yt", "frontend");
const DATA_DIR =
  process.env.DATA_DIR ||
  path.join(__dirname, "..", "..", "..", "sites", "altered.xjk.yt", "data");
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, "altered-service.sqlite");
const TRACKER_DOTENV_FALLBACK = parseEnvFile(
  path.join(__dirname, "..", "..", "tracker", ".env")
);
const ADMIN_TOKEN = String(process.env.ALTERED_ADMIN_TOKEN || "");
const TRACKER_PUBLIC_BASE_URL = normalizeBaseUrl(
  process.env.TRACKER_PUBLIC_BASE_URL ||
    process.env.TRACKER_API_BASE_URL ||
    "http://127.0.0.1:3131/api/v1"
);
const TRACKER_ADMIN_BASE_URL = normalizeBaseUrl(
  process.env.TRACKER_ADMIN_BASE_URL || `${TRACKER_PUBLIC_BASE_URL}/admin`
);
const TRACKER_ADMIN_TOKEN = String(
  process.env.TRACKER_ADMIN_TOKEN || TRACKER_DOTENV_FALLBACK.TRACKER_ADMIN_TOKEN || ""
).trim();
const TRACKER_ADMIN_USERNAME = String(
  process.env.TRACKER_ADMIN_USERNAME || TRACKER_DOTENV_FALLBACK.TRACKER_ADMIN_USERNAME || ""
).trim();
const TRACKER_ADMIN_PASSWORD = String(
  process.env.TRACKER_ADMIN_PASSWORD || TRACKER_DOTENV_FALLBACK.TRACKER_ADMIN_PASSWORD || ""
);
const TRACKER_LEADERBOARD_PUBLIC_BASE_URL = normalizeBaseUrl(
  process.env.TRACKER_LEADERBOARD_PUBLIC_BASE_URL || "http://127.0.0.1:3143/api/v1"
);
const TRACKER_LEADERBOARD_ADMIN_BASE_URL = normalizeBaseUrl(
  process.env.TRACKER_LEADERBOARD_ADMIN_BASE_URL ||
    `${TRACKER_LEADERBOARD_PUBLIC_BASE_URL}/admin`
);
const TRACKER_LEADERBOARD_ADMIN_TOKEN = String(
  process.env.TRACKER_LEADERBOARD_ADMIN_TOKEN || TRACKER_ADMIN_TOKEN
).trim();
const TRACKER_LEADERBOARD_ADMIN_USERNAME = String(
  process.env.TRACKER_LEADERBOARD_ADMIN_USERNAME || TRACKER_ADMIN_USERNAME
).trim();
const TRACKER_LEADERBOARD_ADMIN_PASSWORD = String(
  process.env.TRACKER_LEADERBOARD_ADMIN_PASSWORD || TRACKER_ADMIN_PASSWORD
);
const TRACKER_PROXY_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.TRACKER_PROXY_TIMEOUT_MS || 15000)
);
const TRACKER_DISPLAYNAME_BASE_URL = normalizeBaseUrl(
  process.env.TRACKER_DISPLAYNAME_BASE_URL || "http://127.0.0.1:3141/api/v1"
);
const TRACKER_CLUB_BASE_URL = normalizeBaseUrl(
  process.env.TRACKER_CLUB_BASE_URL || "http://127.0.0.1:3142/api/v1"
);
const AGGREGATOR_BASE_URL = normalizeBaseUrl(
  process.env.AGGREGATOR_BASE_URL || "http://127.0.0.1:3140/api/v1"
);
const AGGREGATOR_TOKEN = String(
  process.env.AGGREGATOR_TOKEN || process.env.AGGREGATOR_INGEST_TOKEN || ""
).trim();
const ALTERED_TRACKER_DISPLAYNAME_ENABLED = parseBoolean(
  process.env.ALTERED_TRACKER_DISPLAYNAME_ENABLED,
  true
);
const ALTERED_TRACKER_DISPLAYNAME_FALLBACK_LOCAL = parseBoolean(
  process.env.ALTERED_TRACKER_DISPLAYNAME_FALLBACK_LOCAL,
  true
);
const ALTERED_TRACKER_CLUB_ENABLED = parseBoolean(
  process.env.ALTERED_TRACKER_CLUB_ENABLED,
  true
);
const ALTERED_TRACKER_CLUB_FALLBACK_LOCAL = parseBoolean(
  process.env.ALTERED_TRACKER_CLUB_FALLBACK_LOCAL,
  true
);
const ALTERED_WR_WEBHOOK_SECRET = String(
  process.env.ALTERED_WR_WEBHOOK_SECRET || process.env.ALTERED_ADMIN_TOKEN || ""
).trim();
const UBI_OAUTH_ENABLED = String(process.env.UBI_OAUTH_ENABLED || "0") === "1";
const UBI_OAUTH_CLIENT_ID = String(process.env.UBI_OAUTH_CLIENT_ID || "").trim();
const UBI_OAUTH_CLIENT_SECRET = String(process.env.UBI_OAUTH_CLIENT_SECRET || "").trim();
const UBI_OAUTH_AUTHORIZE_URL = normalizeBaseUrl(process.env.UBI_OAUTH_AUTHORIZE_URL || "");
const UBI_OAUTH_TOKEN_URL = normalizeBaseUrl(process.env.UBI_OAUTH_TOKEN_URL || "");
const UBI_OAUTH_USERINFO_URL = normalizeBaseUrl(process.env.UBI_OAUTH_USERINFO_URL || "");
const UBI_OAUTH_SCOPE = String(process.env.UBI_OAUTH_SCOPE || "openid profile").trim();
const UBI_OAUTH_CALLBACK_PATH = String(
  process.env.UBI_OAUTH_CALLBACK_PATH || "/auth/ubisoft/callback"
).trim();
const UBI_OAUTH_ALLOWED_SUBJECTS = String(process.env.UBI_OAUTH_ALLOWED_SUBJECTS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const UBI_OAUTH_ALLOWED_USERNAMES = String(process.env.UBI_OAUTH_ALLOWED_USERNAMES || "")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const ALTERED_SESSION_COOKIE_NAME = String(
  process.env.ALTERED_SESSION_COOKIE_NAME || "altered_admin_session"
).trim();
const ALTERED_SESSION_TTL_SECONDS = Math.max(
  300,
  Number(process.env.ALTERED_SESSION_TTL_SECONDS || 43200)
);
const ALTERED_OAUTH_STATE_TTL_SECONDS = Math.max(
  60,
  Number(process.env.ALTERED_OAUTH_STATE_TTL_SECONDS || 600)
);
const ALTERED_OAUTH_FALLBACK_LOCAL_ONLY = parseBoolean(
  process.env.ALTERED_OAUTH_FALLBACK_LOCAL_ONLY,
  false
);
const ALTERED_LIVE_MONITOR_ENABLED = parseBoolean(process.env.ALTERED_LIVE_MONITOR_ENABLED, false);
const ALTERED_LIVE_MONITOR_INTERVAL_SECONDS = clampInt(
  process.env.ALTERED_LIVE_MONITOR_INTERVAL_SECONDS || 21600,
  { min: 60, max: 86400, fallback: 21600 }
);
const ALTERED_LIVE_MONITOR_SCHEDULE_MODE = String(
  process.env.ALTERED_LIVE_MONITOR_SCHEDULE_MODE || "daily"
)
  .trim()
  .toLowerCase();
const ALTERED_LIVE_MONITOR_DAILY_HOUR_UTC = clampInt(
  process.env.ALTERED_LIVE_MONITOR_DAILY_HOUR_UTC || 3,
  { min: 0, max: 23, fallback: 3 }
);
const ALTERED_LIVE_MONITOR_DAILY_MINUTE_UTC = clampInt(
  process.env.ALTERED_LIVE_MONITOR_DAILY_MINUTE_UTC || 0,
  { min: 0, max: 59, fallback: 0 }
);
const ALTERED_LIVE_DISCOVERY_ENABLED = parseBoolean(
  process.env.ALTERED_LIVE_DISCOVERY_ENABLED,
  true
);
const ALTERED_LIVE_DISCOVERY_INTERVAL_SECONDS = clampInt(
  process.env.ALTERED_LIVE_DISCOVERY_INTERVAL_SECONDS || 3600,
  { min: 300, max: 86400, fallback: 3600 }
);
const ALTERED_LIVE_DISCOVERY_CAMPAIGN_LIMIT = clampInt(
  process.env.ALTERED_LIVE_DISCOVERY_CAMPAIGN_LIMIT || 25,
  { min: 1, max: 250, fallback: 25 }
);
const ALTERED_LIVE_DISCOVERY_ACTIVITY_PAGE_SIZE = clampInt(
  process.env.ALTERED_LIVE_DISCOVERY_ACTIVITY_PAGE_SIZE || 100,
  { min: 1, max: 250, fallback: 100 }
);
const ALTERED_LIVE_CLUB_ID = clampInt(process.env.ALTERED_LIVE_CLUB_ID || 24231, {
  min: 1,
  max: 2147483647,
  fallback: 24231,
});
const ALTERED_LIVE_ACTIVITY_PAGE_SIZE = clampInt(
  process.env.ALTERED_LIVE_ACTIVITY_PAGE_SIZE || 250,
  { min: 1, max: 250, fallback: 250 }
);
const ALTERED_LIVE_ACTIVITY_ACTIVE_ONLY = parseBoolean(
  process.env.ALTERED_LIVE_ACTIVITY_ACTIVE_ONLY,
  false
);
const ALTERED_LIVE_FETCH_MAP_DETAILS = parseBoolean(
  process.env.ALTERED_LIVE_FETCH_MAP_DETAILS,
  true
);
const ALTERED_LIVE_AUTH_MODE = String(
  process.env.ALTERED_LIVE_AUTH_MODE || process.env.TRACKER_NADEO_AUTH_MODE || "basic"
)
  .trim()
  .toLowerCase();
const ALTERED_LIVE_DEDI_LOGIN = String(
  process.env.ALTERED_LIVE_DEDI_LOGIN || process.env.TRACKER_NADEO_DEDI_LOGIN || ""
).trim();
const ALTERED_LIVE_DEDI_PASSWORD = String(
  process.env.ALTERED_LIVE_DEDI_PASSWORD || process.env.TRACKER_NADEO_DEDI_PASSWORD || ""
).trim();
const ALTERED_LIVE_ACCESS_TOKEN = String(
  process.env.ALTERED_LIVE_ACCESS_TOKEN || process.env.TRACKER_NADEO_LIVE_ACCESS_TOKEN || ""
).trim();
const ALTERED_LIVE_REFRESH_TOKEN = String(
  process.env.ALTERED_LIVE_REFRESH_TOKEN || process.env.TRACKER_NADEO_LIVE_REFRESH_TOKEN || ""
).trim();
const ALTERED_LIVE_API_BASE_URL = normalizeBaseUrl(process.env.ALTERED_LIVE_API_BASE_URL || "");
const ALTERED_LIVE_USER_AGENT =
  String(process.env.ALTERED_LIVE_USER_AGENT || "").trim() ||
  "altered project by ar, contact @ar___ on discord";
const ALTERED_LIVE_REQUEST_TIMEOUT_MS = Math.max(
  2000,
  Number(process.env.ALTERED_LIVE_REQUEST_TIMEOUT_MS || TRACKER_PROXY_TIMEOUT_MS)
);
const ALTERED_LIVE_MIN_REQUEST_GAP_MS = Math.max(
  0,
  Number(process.env.ALTERED_LIVE_MIN_REQUEST_GAP_MS || 550)
);
const ALTERED_MAPPER_NAME_TRACKING_ENABLED = parseBoolean(
  process.env.ALTERED_MAPPER_NAME_TRACKING_ENABLED,
  true
);
const ALTERED_MAPPER_NAME_TRACKING_API_BASE_URL = normalizeBaseUrl(
  process.env.ALTERED_MAPPER_NAME_TRACKING_API_BASE_URL || "https://api.trackmania.com"
);
const ALTERED_MAPPER_NAME_TRACKING_TOKEN_URL = normalizeBaseUrl(
  process.env.ALTERED_MAPPER_NAME_TRACKING_TOKEN_URL || UBI_OAUTH_TOKEN_URL
);
const ALTERED_MAPPER_NAME_TRACKING_SCOPE = String(
  process.env.ALTERED_MAPPER_NAME_TRACKING_SCOPE || UBI_OAUTH_SCOPE || "clubs"
).trim();
const ALTERED_MAPPER_NAME_TRACKING_REQUEST_TIMEOUT_MS = Math.max(
  2000,
  Number(process.env.ALTERED_MAPPER_NAME_TRACKING_REQUEST_TIMEOUT_MS || 15000)
);
const ALTERED_MAPPER_NAME_TRACKING_MIN_REQUEST_GAP_MS = Math.max(
  0,
  Number(
    process.env.ALTERED_MAPPER_NAME_TRACKING_MIN_REQUEST_GAP_MS ||
      process.env.ALTERED_LIVE_MIN_REQUEST_GAP_MS ||
      1800
  )
);
const ALTERED_MAPPER_NAME_TRACKING_USER_AGENT =
  String(process.env.ALTERED_MAPPER_NAME_TRACKING_USER_AGENT || "").trim() ||
  "altered project by ar, contact @ar___ on discord";
const ALTERED_MAPPER_SYNC_SCHEDULER_ENABLED = parseBoolean(
  process.env.ALTERED_MAPPER_SYNC_SCHEDULER_ENABLED,
  true
);
const ALTERED_MAPPER_SYNC_BOOTSTRAP_INTERVAL_SECONDS = clampInt(
  process.env.ALTERED_MAPPER_SYNC_BOOTSTRAP_INTERVAL_SECONDS || 60,
  { min: 60, max: 86400, fallback: 60 }
);
const ALTERED_MAPPER_SYNC_MAINTENANCE_INTERVAL_SECONDS = clampInt(
  process.env.ALTERED_MAPPER_SYNC_MAINTENANCE_INTERVAL_SECONDS || 60,
  { min: 60, max: 86400, fallback: 60 }
);
const ALTERED_MAPPER_SYNC_PRIORITY_INTERVAL_SECONDS = clampInt(
  process.env.ALTERED_MAPPER_SYNC_PRIORITY_INTERVAL_SECONDS || 60,
  { min: 60, max: 86400, fallback: 60 }
);
const ALTERED_MAPPER_SYNC_BATCH_SIZE = clampInt(
  process.env.ALTERED_MAPPER_SYNC_BATCH_SIZE || 50,
  { min: 1, max: 50, fallback: 50 }
);
const ALTERED_MAPPER_SYNC_PRIORITY_BATCH_SIZE = clampInt(
  process.env.ALTERED_MAPPER_SYNC_PRIORITY_BATCH_SIZE || 25,
  { min: 1, max: 50, fallback: 25 }
);
const ALTERED_MAPPER_SYNC_PRIORITY_TOP_LIMIT = clampInt(
  process.env.ALTERED_MAPPER_SYNC_PRIORITY_TOP_LIMIT || 250,
  { min: 1, max: 2000, fallback: 250 }
);
const ALTERED_MAPPER_SYNC_PRIORITY_REFRESH_SECONDS = clampInt(
  process.env.ALTERED_MAPPER_SYNC_PRIORITY_REFRESH_SECONDS || 600,
  { min: 30, max: 86400, fallback: 600 }
);
const ALTERED_MAPPER_SYNC_CACHE_TTL_SECONDS = clampInt(
  process.env.ALTERED_MAPPER_SYNC_CACHE_TTL_SECONDS || 86400,
  { min: 0, max: 30 * 24 * 60 * 60, fallback: 86400 }
);
const ALTERED_MAPPER_SYNC_PRIORITY_CACHE_TTL_SECONDS = clampInt(
  process.env.ALTERED_MAPPER_SYNC_PRIORITY_CACHE_TTL_SECONDS || 1800,
  { min: 0, max: 30 * 24 * 60 * 60, fallback: 1800 }
);
const ALTERED_MAPPER_SYNC_KNOWN_ACCOUNTS_REFRESH_SECONDS = clampInt(
  process.env.ALTERED_MAPPER_SYNC_KNOWN_ACCOUNTS_REFRESH_SECONDS || 900,
  { min: 60, max: 86400, fallback: 900 }
);
const ALTERED_OPS_MONITOR_ENABLED = parseBoolean(process.env.ALTERED_OPS_MONITOR_ENABLED, true);
const ALTERED_OPS_MONITOR_TICK_SECONDS = clampInt(
  process.env.ALTERED_OPS_MONITOR_TICK_SECONDS || 120,
  { min: 15, max: 86400, fallback: 120 }
);
const ALTERED_OPS_MONITOR_MAX_MAPS_PER_RUN = clampInt(
  process.env.ALTERED_OPS_MONITOR_MAX_MAPS_PER_RUN || 5000,
  { min: 1, max: 25000, fallback: 5000 }
);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

ensureDir(DATA_DIR);

export {
  PORT,
  FRONTEND_DIR,
  DATA_DIR,
  DB_FILE,
  ADMIN_TOKEN,
  TRACKER_PUBLIC_BASE_URL,
  TRACKER_ADMIN_BASE_URL,
  TRACKER_ADMIN_TOKEN,
  TRACKER_ADMIN_USERNAME,
  TRACKER_ADMIN_PASSWORD,
  TRACKER_LEADERBOARD_PUBLIC_BASE_URL,
  TRACKER_LEADERBOARD_ADMIN_BASE_URL,
  TRACKER_LEADERBOARD_ADMIN_TOKEN,
  TRACKER_LEADERBOARD_ADMIN_USERNAME,
  TRACKER_LEADERBOARD_ADMIN_PASSWORD,
  TRACKER_PROXY_TIMEOUT_MS,
  TRACKER_DISPLAYNAME_BASE_URL,
  TRACKER_CLUB_BASE_URL,
  AGGREGATOR_BASE_URL,
  AGGREGATOR_TOKEN,
  ALTERED_TRACKER_DISPLAYNAME_ENABLED,
  ALTERED_TRACKER_DISPLAYNAME_FALLBACK_LOCAL,
  ALTERED_TRACKER_CLUB_ENABLED,
  ALTERED_TRACKER_CLUB_FALLBACK_LOCAL,
  ALTERED_WR_WEBHOOK_SECRET,
  UBI_OAUTH_ENABLED,
  UBI_OAUTH_CLIENT_ID,
  UBI_OAUTH_CLIENT_SECRET,
  UBI_OAUTH_AUTHORIZE_URL,
  UBI_OAUTH_TOKEN_URL,
  UBI_OAUTH_USERINFO_URL,
  UBI_OAUTH_SCOPE,
  UBI_OAUTH_CALLBACK_PATH,
  UBI_OAUTH_ALLOWED_SUBJECTS,
  UBI_OAUTH_ALLOWED_USERNAMES,
  ALTERED_SESSION_COOKIE_NAME,
  ALTERED_SESSION_TTL_SECONDS,
  ALTERED_OAUTH_STATE_TTL_SECONDS,
  ALTERED_OAUTH_FALLBACK_LOCAL_ONLY,
  ALTERED_LIVE_MONITOR_ENABLED,
  ALTERED_LIVE_MONITOR_INTERVAL_SECONDS,
  ALTERED_LIVE_MONITOR_SCHEDULE_MODE,
  ALTERED_LIVE_MONITOR_DAILY_HOUR_UTC,
  ALTERED_LIVE_MONITOR_DAILY_MINUTE_UTC,
  ALTERED_LIVE_DISCOVERY_ENABLED,
  ALTERED_LIVE_DISCOVERY_INTERVAL_SECONDS,
  ALTERED_LIVE_DISCOVERY_CAMPAIGN_LIMIT,
  ALTERED_LIVE_DISCOVERY_ACTIVITY_PAGE_SIZE,
  ALTERED_LIVE_CLUB_ID,
  ALTERED_LIVE_ACTIVITY_PAGE_SIZE,
  ALTERED_LIVE_ACTIVITY_ACTIVE_ONLY,
  ALTERED_LIVE_FETCH_MAP_DETAILS,
  ALTERED_LIVE_AUTH_MODE,
  ALTERED_LIVE_DEDI_LOGIN,
  ALTERED_LIVE_DEDI_PASSWORD,
  ALTERED_LIVE_ACCESS_TOKEN,
  ALTERED_LIVE_REFRESH_TOKEN,
  ALTERED_LIVE_API_BASE_URL,
  ALTERED_LIVE_USER_AGENT,
  ALTERED_LIVE_REQUEST_TIMEOUT_MS,
  ALTERED_LIVE_MIN_REQUEST_GAP_MS,
  ALTERED_MAPPER_NAME_TRACKING_ENABLED,
  ALTERED_MAPPER_NAME_TRACKING_API_BASE_URL,
  ALTERED_MAPPER_NAME_TRACKING_TOKEN_URL,
  ALTERED_MAPPER_NAME_TRACKING_SCOPE,
  ALTERED_MAPPER_NAME_TRACKING_REQUEST_TIMEOUT_MS,
  ALTERED_MAPPER_NAME_TRACKING_MIN_REQUEST_GAP_MS,
  ALTERED_MAPPER_NAME_TRACKING_USER_AGENT,
  ALTERED_MAPPER_SYNC_SCHEDULER_ENABLED,
  ALTERED_MAPPER_SYNC_BOOTSTRAP_INTERVAL_SECONDS,
  ALTERED_MAPPER_SYNC_MAINTENANCE_INTERVAL_SECONDS,
  ALTERED_MAPPER_SYNC_PRIORITY_INTERVAL_SECONDS,
  ALTERED_MAPPER_SYNC_BATCH_SIZE,
  ALTERED_MAPPER_SYNC_PRIORITY_BATCH_SIZE,
  ALTERED_MAPPER_SYNC_PRIORITY_TOP_LIMIT,
  ALTERED_MAPPER_SYNC_PRIORITY_REFRESH_SECONDS,
  ALTERED_MAPPER_SYNC_CACHE_TTL_SECONDS,
  ALTERED_MAPPER_SYNC_PRIORITY_CACHE_TTL_SECONDS,
  ALTERED_MAPPER_SYNC_KNOWN_ACCOUNTS_REFRESH_SECONDS,
  ALTERED_OPS_MONITOR_ENABLED,
  ALTERED_OPS_MONITOR_TICK_SECONDS,
  ALTERED_OPS_MONITOR_MAX_MAPS_PER_RUN,
};
