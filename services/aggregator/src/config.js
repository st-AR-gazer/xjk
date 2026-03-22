import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

const PORT = Math.max(1, Number(process.env.PORT || 3140));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, "tracker-aggregator.sqlite");
const FRONTEND_DIR =
  process.env.FRONTEND_DIR ||
  path.join(__dirname, "..", "..", "..", "sites", "aggregator.xjk.yt", "frontend");
const DASH_FRONTEND_DIR =
  process.env.DASH_FRONTEND_DIR ||
  path.join(__dirname, "..", "..", "..", "sites", "dash.xjk.yt", "frontend");
const INGEST_TOKEN = String(process.env.AGGREGATOR_INGEST_TOKEN || "").trim();
const DASH_ADMIN_TOKEN = String(process.env.DASH_ADMIN_TOKEN || INGEST_TOKEN || "").trim();
const TRACKER_DOTENV_FALLBACK = parseEnvFile(path.join(__dirname, "..", "..", "tracker", ".env"));
const DASH_HOSTNAMES = String(process.env.DASH_HOSTNAMES || "dash.xjk.yt,dash.localhost")
  .split(",")
  .map((value) => String(value || "").trim().toLowerCase())
  .filter(Boolean);
const isLocalStack = PORT >= 3100;
const TRACKER_WR_BASE_URL = String(
  process.env.DASH_TRACKER_WR_BASE_URL ||
    (isLocalStack ? "http://127.0.0.1:3131" : "http://127.0.0.1:3031")
).trim();
const TRACKER_LEADERBOARD_BASE_URL = String(
  process.env.DASH_TRACKER_LEADERBOARD_BASE_URL ||
    (isLocalStack ? "http://127.0.0.1:3143" : "http://127.0.0.1:3043")
).trim();
const TRACKER_DISPLAYNAME_BASE_URL = String(
  process.env.DASH_TRACKER_DISPLAYNAME_BASE_URL ||
    (isLocalStack ? "http://127.0.0.1:3141" : "http://127.0.0.1:3041")
).trim();
const TRACKER_CLUB_BASE_URL = String(
  process.env.DASH_TRACKER_CLUB_BASE_URL ||
    (isLocalStack ? "http://127.0.0.1:3142" : "http://127.0.0.1:3042")
).trim();
const ALTERED_BASE_URL = normalizeBaseUrl(
  process.env.DASH_ALTERED_BASE_URL || (isLocalStack ? "http://127.0.0.1:3130" : "http://127.0.0.1:3030")
);
const ALTERED_INTERNAL_TOKEN = String(
  process.env.DASH_ALTERED_INTERNAL_TOKEN ||
    process.env.DASH_TRACKER_ADMIN_TOKEN ||
    process.env.AGGREGATOR_INGEST_TOKEN ||
    process.env.TRACKER_ADMIN_TOKEN ||
    TRACKER_DOTENV_FALLBACK.TRACKER_ADMIN_TOKEN ||
    INGEST_TOKEN ||
    DASH_ADMIN_TOKEN ||
    ""
).trim();
const TRACKER_ADMIN_TOKEN = String(
  process.env.DASH_TRACKER_ADMIN_TOKEN ||
    process.env.TRACKER_ADMIN_TOKEN ||
    TRACKER_DOTENV_FALLBACK.TRACKER_ADMIN_TOKEN ||
    process.env.DASH_ADMIN_TOKEN ||
    DASH_ADMIN_TOKEN ||
    ""
).trim();
const PM2_HOME = String(
  process.env.PM2_HOME || path.join(process.env.USERPROFILE || process.env.HOME || DATA_DIR, ".pm2")
).trim();
const PM2_LOG_DIR = String(
  process.env.PM2_LOG_DIR || process.env.DASH_PM2_LOG_DIR || path.join(PM2_HOME, "logs")
).trim();
const NADEO_GLOBAL_THROTTLE_FILE = String(
  process.env.NADEO_GLOBAL_THROTTLE_FILE || path.join(DATA_DIR, "nadeo-global-throttle.txt")
).trim();
const NADEO_GLOBAL_MIN_REQUEST_GAP_MS = Math.max(
  0,
  Number(process.env.NADEO_GLOBAL_MIN_REQUEST_GAP_MS || 0) || 0
);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

ensureDir(DATA_DIR);

export {
  PORT,
  DATA_DIR,
  DB_FILE,
  FRONTEND_DIR,
  DASH_FRONTEND_DIR,
  INGEST_TOKEN,
  DASH_ADMIN_TOKEN,
  DASH_HOSTNAMES,
  TRACKER_WR_BASE_URL,
  TRACKER_LEADERBOARD_BASE_URL,
  TRACKER_DISPLAYNAME_BASE_URL,
  TRACKER_CLUB_BASE_URL,
  ALTERED_BASE_URL,
  ALTERED_INTERNAL_TOKEN,
  TRACKER_ADMIN_TOKEN,
  PM2_LOG_DIR,
  NADEO_GLOBAL_THROTTLE_FILE,
  NADEO_GLOBAL_MIN_REQUEST_GAP_MS,
};
