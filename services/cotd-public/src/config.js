import path from "node:path";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { parseBoolean as parseBoolEnv } from "../../shared/envUtils.js";
import { ensureDirectorySync } from "../../shared/fsUtils.js";
import { firstFiniteNumber, normalizeBaseUrl } from "../../shared/valueUtils.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serviceRoot, "..", "..");
const siteRoot = path.join(repoRoot, "sites", "cotd.xjk.yt");

const PORT = Math.max(1, firstFiniteNumber(process.env.PORT, 3045) || 3045);
const PUBLIC_CACHE_TTL_MS = Math.floor(
  Math.max(0, Math.min(300_000, firstFiniteNumber(process.env.COTD_PUBLIC_CACHE_TTL_MS, 15000)))
);
const PUBLIC_CACHE_MAX_ENTRIES = Math.floor(
  Math.max(1, Math.min(5000, firstFiniteNumber(process.env.COTD_PUBLIC_CACHE_MAX_ENTRIES, 256)))
);
const PUBLIC_PAGINATION_MAX_OFFSET = Math.floor(
  Math.max(0, Math.min(1_000_000, firstFiniteNumber(process.env.COTD_PUBLIC_PAGINATION_MAX_OFFSET, 10_000)))
);
const HISTORY_LIMIT = Math.max(1, firstFiniteNumber(process.env.COTD_HISTORY_LIMIT, 2500) || 2500);
const CLASSIFIER_TIMEOUT_MS = Math.max(1000, firstFiniteNumber(process.env.COTD_CLASSIFIER_TIMEOUT_MS, 15000) || 15000);
const TOTD_SOURCE_TIMEOUT_MS = Math.max(
  1000,
  firstFiniteNumber(process.env.COTD_TOTD_SOURCE_TIMEOUT_MS, 15000) || 15000
);
const TOTD_FETCH_INTERVAL_MS = Math.max(
  30000,
  firstFiniteNumber(process.env.COTD_TOTD_FETCH_INTERVAL_MS, 300000) || 300000
);

const FRONTEND_DIR = path.resolve(process.env.FRONTEND_DIR || path.join(siteRoot, "frontend"));
const DATA_DIR = path.resolve(process.env.COTD_PUBLIC_DATA_DIR || process.env.DATA_DIR || path.join(siteRoot, "data"));
const STORAGE_FILE = path.resolve(process.env.COTD_PUBLIC_STORAGE_FILE || path.join(DATA_DIR, "cotd-public.json"));
const DB_FILE = path.resolve(
  process.env.COTD_PUBLIC_DB_FILE || process.env.DB_FILE || path.join(DATA_DIR, "cotd-public.sqlite")
);
const MAP_FILES_DIR = path.resolve(process.env.COTD_MAP_FILES_DIR || path.join(DATA_DIR, "maps"));

const CLASSIFIER_BASE_URL = normalizeBaseUrl(process.env.COTD_CLASSIFIER_BASE_URL || "");
const CLASSIFIER_PATH = String(process.env.COTD_CLASSIFIER_PATH || "/api/v1/classify").trim() || "/api/v1/classify";
const CLASSIFIER_TOKEN = String(process.env.COTD_CLASSIFIER_TOKEN || "").trim();
const CLASSIFIER_TOKEN_HEADER = String(process.env.COTD_CLASSIFIER_TOKEN_HEADER || "Authorization").trim();
const CLASSIFIER_TOKEN_PREFIX = String(process.env.COTD_CLASSIFIER_TOKEN_PREFIX || "Bearer").trim();

const TOTD_FETCH_ENABLED = parseBoolEnv(process.env.COTD_TOTD_FETCH_ENABLED, false);
const TOTD_FETCH_ON_START = parseBoolEnv(process.env.COTD_TOTD_FETCH_ON_START, true);
const TOTD_SOURCE_URL = normalizeBaseUrl(process.env.COTD_TOTD_SOURCE_URL || "");
const TOTD_SOURCE_TOKEN = String(process.env.COTD_TOTD_SOURCE_TOKEN || "").trim();
const TOTD_SOURCE_TOKEN_HEADER = String(process.env.COTD_TOTD_SOURCE_TOKEN_HEADER || "Authorization").trim();
const TOTD_SOURCE_TOKEN_PREFIX = String(process.env.COTD_TOTD_SOURCE_TOKEN_PREFIX || "Bearer").trim();
const AUTO_CLASSIFY_ENABLED = parseBoolEnv(process.env.COTD_AUTO_CLASSIFY_ENABLED, true);
const TOTD_SYNC_MONTH_LENGTH = Math.max(
  1,
  Math.min(36, firstFiniteNumber(process.env.COTD_TOTD_SYNC_MONTH_LENGTH, 1) || 1)
);
const TOTD_SYNC_MONTH_OFFSET = Math.max(0, firstFiniteNumber(process.env.COTD_TOTD_SYNC_MONTH_OFFSET, 0) || 0);
const TOTD_SYNC_ROYAL = parseBoolEnv(process.env.COTD_TOTD_SYNC_ROYAL, false);
const TOTD_DOWNLOAD_MAP_FILES = parseBoolEnv(process.env.COTD_TOTD_DOWNLOAD_MAP_FILES, true);

const NADEO_AUTH_MODE = String(process.env.COTD_NADEO_AUTH_MODE || "basic")
  .trim()
  .toLowerCase();
const NADEO_DEDI_LOGIN = String(process.env.COTD_NADEO_DEDI_LOGIN || "").trim();
const NADEO_DEDI_PASSWORD = String(process.env.COTD_NADEO_DEDI_PASSWORD || "").trim();
const NADEO_SERVICES_TOKEN = String(process.env.COTD_NADEO_SERVICES_TOKEN || "").trim();
const NADEO_LIVE_SERVICES_TOKEN = String(process.env.COTD_NADEO_LIVE_SERVICES_TOKEN || "").trim();
const NADEO_USER_AGENT = String(
  process.env.COTD_NADEO_USER_AGENT || process.env.COTD_USER_AGENT || "cotd.xjk.yt/1.0 (+https://xjk.yt/)"
).trim();
const NADEO_TOKEN_CACHE_FILE = path.resolve(
  process.env.COTD_NADEO_TOKEN_CACHE_FILE || path.join(DATA_DIR, "nadeo-token-cache.json")
);
const NADEO_REQUEST_TIMEOUT_MS = Math.max(
  1000,
  firstFiniteNumber(process.env.COTD_NADEO_REQUEST_TIMEOUT_MS, 15000) || 15000
);
const NADEO_MIN_REQUEST_GAP_MS = Math.max(
  0,
  firstFiniteNumber(process.env.COTD_NADEO_MIN_REQUEST_GAP_MS, 1000) || 1000
);
const NADEO_GLOBAL_THROTTLE_FILE = String(
  process.env.COTD_NADEO_GLOBAL_THROTTLE_FILE || process.env.NADEO_GLOBAL_THROTTLE_FILE || ""
).trim();
const NADEO_GLOBAL_MIN_REQUEST_GAP_MS = Math.max(
  0,
  firstFiniteNumber(process.env.COTD_NADEO_GLOBAL_MIN_REQUEST_GAP_MS, process.env.NADEO_GLOBAL_MIN_REQUEST_GAP_MS, 0) ||
    0
);

const ADMIN_TOKEN = String(process.env.COTD_ADMIN_TOKEN || "").trim();
const ALLOW_DEBUG_RAW = parseBoolEnv(process.env.COTD_ALLOW_DEBUG_RAW, false);

ensureDirectorySync(DATA_DIR);
ensureDirectorySync(MAP_FILES_DIR);

export {
  ADMIN_TOKEN,
  ALLOW_DEBUG_RAW,
  CLASSIFIER_BASE_URL,
  CLASSIFIER_PATH,
  CLASSIFIER_TIMEOUT_MS,
  CLASSIFIER_TOKEN,
  CLASSIFIER_TOKEN_HEADER,
  CLASSIFIER_TOKEN_PREFIX,
  DATA_DIR,
  DB_FILE,
  FRONTEND_DIR,
  HISTORY_LIMIT,
  MAP_FILES_DIR,
  NADEO_AUTH_MODE,
  NADEO_DEDI_LOGIN,
  NADEO_DEDI_PASSWORD,
  NADEO_GLOBAL_MIN_REQUEST_GAP_MS,
  NADEO_GLOBAL_THROTTLE_FILE,
  NADEO_LIVE_SERVICES_TOKEN,
  NADEO_MIN_REQUEST_GAP_MS,
  NADEO_REQUEST_TIMEOUT_MS,
  NADEO_SERVICES_TOKEN,
  NADEO_TOKEN_CACHE_FILE,
  NADEO_USER_AGENT,
  PORT,
  PUBLIC_CACHE_MAX_ENTRIES,
  PUBLIC_CACHE_TTL_MS,
  PUBLIC_PAGINATION_MAX_OFFSET,
  STORAGE_FILE,
  AUTO_CLASSIFY_ENABLED,
  TOTD_DOWNLOAD_MAP_FILES,
  TOTD_FETCH_ENABLED,
  TOTD_FETCH_INTERVAL_MS,
  TOTD_FETCH_ON_START,
  TOTD_SYNC_MONTH_LENGTH,
  TOTD_SYNC_MONTH_OFFSET,
  TOTD_SYNC_ROYAL,
  TOTD_SOURCE_TIMEOUT_MS,
  TOTD_SOURCE_TOKEN,
  TOTD_SOURCE_TOKEN_HEADER,
  TOTD_SOURCE_TOKEN_PREFIX,
  TOTD_SOURCE_URL,
};
