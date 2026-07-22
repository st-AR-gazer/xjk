import path from "node:path";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { parseEnvFile } from "../../shared/envUtils.js";
import { ensureDirectorySync } from "../../shared/fsUtils.js";
import { normalizeBaseUrl } from "../../shared/valueUtils.js";
import {
  resolveAlteredInternalCredentialEnvironment,
  resolveTrackerAdminCredentialEnvironment,
} from "../../shared/credentialPolicy.js";
import { resolveAggregatorAccessEnvironment } from "./auth/accessPolicy.js";

const inheritedEnvironment = { ...process.env };
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Math.max(1, Number(process.env.PORT || 3140));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "..", "..", "sites", "altered.xjk.yt", "data");
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, "tracker-aggregator.sqlite");
const FRONTEND_DIR =
  process.env.FRONTEND_DIR || path.join(__dirname, "..", "..", "..", "sites", "aggregator.xjk.yt", "frontend");
const DASH_FRONTEND_DIR =
  process.env.DASH_FRONTEND_DIR || path.join(__dirname, "..", "..", "..", "sites", "dash.xjk.yt", "frontend");
const {
  ingestToken: INGEST_TOKEN,
  dashAdminToken: DASH_ADMIN_TOKEN,
  allowInsecureOpen: ALLOW_INSECURE_OPEN,
} = resolveAggregatorAccessEnvironment(process.env);
const AGGREGATOR_DOTENV_FALLBACK = parseEnvFile(path.join(__dirname, "..", ".env"));
const ALTERED_DOTENV_FALLBACK = parseEnvFile(path.join(__dirname, "..", "..", "altered", ".env"));
const TRACKER_DOTENV_FALLBACK = parseEnvFile(path.join(__dirname, "..", "..", "tracker", ".env"));
const upstreamCredentials = {
  ...resolveAlteredInternalCredentialEnvironment(inheritedEnvironment, {
    ALTERED_INTERNAL_TOKEN: ALTERED_DOTENV_FALLBACK.ALTERED_INTERNAL_TOKEN,
    DASH_ALTERED_INTERNAL_TOKEN: AGGREGATOR_DOTENV_FALLBACK.DASH_ALTERED_INTERNAL_TOKEN,
  }),
  ...resolveTrackerAdminCredentialEnvironment(inheritedEnvironment, {
    TRACKER_ADMIN_TOKEN: TRACKER_DOTENV_FALLBACK.TRACKER_ADMIN_TOKEN,
    DASH_TRACKER_ADMIN_TOKEN: AGGREGATOR_DOTENV_FALLBACK.DASH_TRACKER_ADMIN_TOKEN,
  }),
};
const DASH_HOSTNAMES = String(process.env.DASH_HOSTNAMES || "dash.xjk.yt,dash.localhost")
  .split(",")
  .map((value) =>
    String(value || "")
      .trim()
      .toLowerCase()
  )
  .filter(Boolean);
const isLocalStack = PORT >= 3100;
const TRACKER_WR_BASE_URL = String(
  process.env.DASH_TRACKER_WR_BASE_URL || (isLocalStack ? "http://127.0.0.1:3131" : "http://127.0.0.1:3031")
).trim();
const TRACKER_LEADERBOARD_BASE_URL = String(
  process.env.DASH_TRACKER_LEADERBOARD_BASE_URL || (isLocalStack ? "http://127.0.0.1:3143" : "http://127.0.0.1:3043")
).trim();
const TRACKER_DISPLAYNAME_BASE_URL = String(
  process.env.DASH_TRACKER_DISPLAYNAME_BASE_URL || (isLocalStack ? "http://127.0.0.1:3141" : "http://127.0.0.1:3041")
).trim();
const TRACKER_CLUB_BASE_URL = String(
  process.env.DASH_TRACKER_CLUB_BASE_URL || (isLocalStack ? "http://127.0.0.1:3142" : "http://127.0.0.1:3042")
).trim();
const ALTERED_BASE_URL = normalizeBaseUrl(
  process.env.DASH_ALTERED_BASE_URL || (isLocalStack ? "http://127.0.0.1:3130" : "http://127.0.0.1:3030")
);
const ALTERED_INTERNAL_TOKEN = upstreamCredentials.DASH_ALTERED_INTERNAL_TOKEN;
const TRACKER_ADMIN_TOKEN = upstreamCredentials.DASH_TRACKER_ADMIN_TOKEN;
const ARL_OPENPLANET_AUTH_SECRET = String(process.env.ARL_OPENPLANET_AUTH_SECRET || "").trim();
const OPENPLANET_AUTH_VALIDATE_URL = String(
  process.env.OPENPLANET_AUTH_VALIDATE_URL || "https://openplanet.dev/api/auth/validate"
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
const NADEO_GLOBAL_MIN_REQUEST_GAP_MS = Math.max(0, Number(process.env.NADEO_GLOBAL_MIN_REQUEST_GAP_MS || 0) || 0);

ensureDirectorySync(DATA_DIR);

export {
  PORT,
  DATA_DIR,
  DB_FILE,
  FRONTEND_DIR,
  DASH_FRONTEND_DIR,
  INGEST_TOKEN,
  DASH_ADMIN_TOKEN,
  ALLOW_INSECURE_OPEN,
  DASH_HOSTNAMES,
  TRACKER_WR_BASE_URL,
  TRACKER_LEADERBOARD_BASE_URL,
  TRACKER_DISPLAYNAME_BASE_URL,
  TRACKER_CLUB_BASE_URL,
  ALTERED_BASE_URL,
  ALTERED_INTERNAL_TOKEN,
  TRACKER_ADMIN_TOKEN,
  ARL_OPENPLANET_AUTH_SECRET,
  OPENPLANET_AUTH_VALIDATE_URL,
  PM2_LOG_DIR,
  NADEO_GLOBAL_THROTTLE_FILE,
  NADEO_GLOBAL_MIN_REQUEST_GAP_MS,
};
