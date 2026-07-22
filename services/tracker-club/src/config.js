import dotenv from "dotenv";
import { initializeTrackerServiceConfig } from "../../shared/serviceConfigRuntime.js";

const config = initializeTrackerServiceConfig({
  dotenv,
  moduleUrl: import.meta.url,
  defaultPort: 3142,
  frontendMode: "club",
});
const { PORT, FRONTEND_DIR } = config;
const TRACKER_CLUB_ENABLED = config.parseBool(process.env.TRACKER_CLUB_ENABLED, true);
const TRACKER_CLUB_PROJECT_KEY = String(process.env.TRACKER_CLUB_PROJECT_KEY || "local-tracker-club")
  .trim()
  .toLowerCase();
const TRACKER_CLUB_PROJECT_NAME = String(process.env.TRACKER_CLUB_PROJECT_NAME || "Local Tracker Club").trim();
const TRACKER_CLUB_SOURCE_LABEL = String(process.env.TRACKER_CLUB_SOURCE_LABEL || "tracker-club").trim();

const TRACKER_CLUB_AGGREGATOR_BASE_URL = config.normalizeBaseUrl(
  process.env.TRACKER_CLUB_AGGREGATOR_BASE_URL,
  "http://127.0.0.1:3140/api/v1"
);
const TRACKER_CLUB_AGGREGATOR_TOKEN = String(
  process.env.TRACKER_CLUB_AGGREGATOR_TOKEN || process.env.AGGREGATOR_INGEST_TOKEN || ""
).trim();
const TRACKER_CLUB_REQUEST_TIMEOUT_MS = config.clampInt(process.env.TRACKER_CLUB_REQUEST_TIMEOUT_MS || 15 * 1000, {
  min: 1000,
  max: 120000,
  fallback: 15 * 1000,
});

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
