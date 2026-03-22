import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3130);
const FRONTEND_DIR =
  process.env.FRONTEND_DIR || path.join(__dirname, "..", "..", "..", "frontend");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, "altered-tracker.sqlite");
const TRACKER_ADMIN_TOKEN =
  String(process.env.TRACKER_ADMIN_TOKEN || "").trim() ||
  String(process.env.ALTERED_ADMIN_TOKEN || "").trim();
const TRACKER_ADMIN_USERNAME = String(process.env.TRACKER_ADMIN_USERNAME || "").trim();
const TRACKER_ADMIN_PASSWORD = String(process.env.TRACKER_ADMIN_PASSWORD || "");
const TRACKER_ADMIN_SESSION_COOKIE_NAME =
  String(process.env.TRACKER_ADMIN_SESSION_COOKIE_NAME || "tracker_admin_session").trim() ||
  "tracker_admin_session";
const TRACKER_ADMIN_SESSION_TTL_SECONDS = Math.max(
  300,
  Number(process.env.TRACKER_ADMIN_SESSION_TTL_SECONDS || 43200)
);
const TRACKER_ADMIN_ALLOW_OPEN =
  String(process.env.TRACKER_ADMIN_ALLOW_OPEN || "0").trim() !== "0";
const TRACKER_ENABLED = String(process.env.TRACKER_ENABLED || "1") !== "0";
const TRACKER_PROVIDER = String(process.env.TRACKER_PROVIDER || "noop");
const TRACKER_MODE_RAW = String(process.env.TRACKER_MODE || "wr").trim().toLowerCase();
const TRACKER_MODE = TRACKER_MODE_RAW === "leaderboard" ? "leaderboard" : "wr";
const TRACKER_LEADERBOARD_TOP_N = Math.max(
  1,
  Math.min(1000, Number(process.env.TRACKER_LEADERBOARD_TOP_N || 100))
);
const TRACKER_TICK_SECONDS = Math.max(3, Number(process.env.TRACKER_TICK_SECONDS || 20));
const TRACKER_BATCH_SIZE = Math.max(1, Number(process.env.TRACKER_BATCH_SIZE || 6));
const TRACKER_MAX_CHECK_INTERVAL_SECONDS = Math.max(
  0,
  Number(process.env.TRACKER_MAX_CHECK_INTERVAL_SECONDS || 0)
);
const TRACKER_WR_WEBHOOK_ENABLED =
  String(process.env.TRACKER_WR_WEBHOOK_ENABLED || "").trim() !== ""
    ? String(process.env.TRACKER_WR_WEBHOOK_ENABLED || "0") !== "0"
    : Boolean(String(process.env.TRACKER_WR_WEBHOOK_URL || "").trim());
const TRACKER_WR_WEBHOOK_URL = String(process.env.TRACKER_WR_WEBHOOK_URL || "").trim();
const TRACKER_WR_WEBHOOK_SECRET = String(
  process.env.TRACKER_WR_WEBHOOK_SECRET ||
    process.env.TRACKER_ADMIN_TOKEN ||
    process.env.ALTERED_ADMIN_TOKEN ||
    ""
).trim();
const TRACKER_WR_WEBHOOK_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.TRACKER_WR_WEBHOOK_TIMEOUT_MS || 5000)
);
const TRACKER_USER_AGENT =
  String(process.env.TRACKER_USER_AGENT || "").trim() ||
  "xjk-tracker/1.0 (+https://xjk.yt)";
const TRACKER_REQUEST_TIMEOUT_MS = Math.max(
  2000,
  Number(process.env.TRACKER_REQUEST_TIMEOUT_MS || 10000)
);
const TRACKER_MIN_REQUEST_GAP_MS = Math.max(
  0,
  Number(process.env.TRACKER_MIN_REQUEST_GAP_MS || 5000)
);
const TRACKER_LIVE_GROUP_UID = String(process.env.TRACKER_LIVE_GROUP_UID || "Personal_Best");
const TRACKER_LIVE_ONLY_WORLD = String(process.env.TRACKER_LIVE_ONLY_WORLD || "1") !== "0";
const TRACKER_NADEO_AUTH_MODE = String(
  process.env.TRACKER_NADEO_AUTH_MODE || "basic"
).toLowerCase();
const TRACKER_NADEO_DEDI_LOGIN = String(process.env.TRACKER_NADEO_DEDI_LOGIN || "");
const TRACKER_NADEO_DEDI_PASSWORD = String(process.env.TRACKER_NADEO_DEDI_PASSWORD || "");
const TRACKER_UBI_EMAIL = String(process.env.TRACKER_UBI_EMAIL || "");
const TRACKER_UBI_PASSWORD = String(process.env.TRACKER_UBI_PASSWORD || "");
const TRACKER_NADEO_LIVE_ACCESS_TOKEN = String(process.env.TRACKER_NADEO_LIVE_ACCESS_TOKEN || "");
const TRACKER_NADEO_LIVE_REFRESH_TOKEN = String(
  process.env.TRACKER_NADEO_LIVE_REFRESH_TOKEN || ""
);
const TRACKER_TOKEN_CACHE_FILE =
  process.env.TRACKER_TOKEN_CACHE_FILE || path.join(DATA_DIR, "nadeo-token-cache.json");
const TRACKER_AGGREGATOR_ENABLED =
  String(process.env.TRACKER_AGGREGATOR_ENABLED || "").trim() !== ""
    ? String(process.env.TRACKER_AGGREGATOR_ENABLED || "0") !== "0"
    : Boolean(String(process.env.TRACKER_AGGREGATOR_BASE_URL || "").trim());
const TRACKER_AGGREGATOR_BASE_URL = String(
  process.env.TRACKER_AGGREGATOR_BASE_URL || ""
).trim();
const TRACKER_AGGREGATOR_TOKEN = String(process.env.TRACKER_AGGREGATOR_TOKEN || "").trim();
const TRACKER_AGGREGATOR_PROJECT_KEY =
  String(process.env.TRACKER_AGGREGATOR_PROJECT_KEY || "").trim() || "tracker-default";
const TRACKER_AGGREGATOR_PROJECT_NAME =
  String(process.env.TRACKER_AGGREGATOR_PROJECT_NAME || "").trim() || "Tracker Instance";
const TRACKER_AGGREGATOR_SOURCE_LABEL =
  String(process.env.TRACKER_AGGREGATOR_SOURCE_LABEL || "").trim() || "tracker";
const TRACKER_AGGREGATOR_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.TRACKER_AGGREGATOR_TIMEOUT_MS || 5000)
);
const TRACKER_INSTANCE_ID =
  String(process.env.TRACKER_INSTANCE_ID || "").trim() || `tracker-${PORT}`;
const TRACKER_INSTANCE_NAME =
  String(process.env.TRACKER_INSTANCE_NAME || "").trim() || `Tracker ${PORT}`;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

ensureDir(DATA_DIR);

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
