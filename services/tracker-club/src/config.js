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

const PORT = clampInt(process.env.PORT || 3142, { min: 1, max: 65535, fallback: 3142 });
const FRONTEND_DIR =
  process.env.FRONTEND_DIR ||
  path.join(__dirname, "..", "..", "..", "sites", "trackers.xjk.yt", "frontend", "__runtime", "club");
const TRACKER_CLUB_ENABLED = parseBool(process.env.TRACKER_CLUB_ENABLED, true);
const TRACKER_CLUB_PROJECT_KEY = String(process.env.TRACKER_CLUB_PROJECT_KEY || "local-tracker-club")
  .trim()
  .toLowerCase();
const TRACKER_CLUB_PROJECT_NAME = String(
  process.env.TRACKER_CLUB_PROJECT_NAME || "Local Tracker Club"
).trim();
const TRACKER_CLUB_SOURCE_LABEL = String(
  process.env.TRACKER_CLUB_SOURCE_LABEL || "tracker-club"
).trim();

const TRACKER_CLUB_AGGREGATOR_BASE_URL = normalizeBaseUrl(
  process.env.TRACKER_CLUB_AGGREGATOR_BASE_URL,
  "http://127.0.0.1:3140/api/v1"
);
const TRACKER_CLUB_AGGREGATOR_TOKEN = String(
  process.env.TRACKER_CLUB_AGGREGATOR_TOKEN || process.env.AGGREGATOR_INGEST_TOKEN || ""
).trim();
const TRACKER_CLUB_REQUEST_TIMEOUT_MS = clampInt(
  process.env.TRACKER_CLUB_REQUEST_TIMEOUT_MS || 15000,
  { min: 1000, max: 120000, fallback: 15000 }
);

export {
  PORT,
  FRONTEND_DIR,
  TRACKER_CLUB_ENABLED,
  TRACKER_CLUB_PROJECT_KEY,
  TRACKER_CLUB_PROJECT_NAME,
  TRACKER_CLUB_SOURCE_LABEL,
  TRACKER_CLUB_AGGREGATOR_BASE_URL,
  TRACKER_CLUB_AGGREGATOR_TOKEN,
  TRACKER_CLUB_REQUEST_TIMEOUT_MS,
};
