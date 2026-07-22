import path from "node:path";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { ensureDirectorySync } from "../../shared/fsUtils.js";
import { firstFiniteNumber, normalizeBaseUrl } from "../../shared/valueUtils.js";
import { resolveValidifierHardeningSettings } from "./hardeningConfig.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serviceRoot, "..", "..");
const siteRoot = path.join(repoRoot, "sites", "validifier.xjk.yt");

const PORT = Math.max(1, firstFiniteNumber(process.env.PORT, 3044) || 3044);
const REQUEST_TIMEOUT_MS = Math.max(
  1000,
  firstFiniteNumber(
    process.env.VALIDIFIER_PUBLIC_REQUEST_TIMEOUT_MS,
    process.env.REPLAY_VERIFICATION_REQUEST_TIMEOUT_MS,
    15000
  ) || 15000
);
const CACHE_TTL_MS = Math.max(0, firstFiniteNumber(process.env.VALIDIFIER_PUBLIC_CACHE_TTL_MS, 15000) || 15000);

const FRONTEND_DIR = path.resolve(process.env.FRONTEND_DIR || path.join(siteRoot, "frontend"));
const DATA_DIR = path.resolve(
  process.env.VALIDIFIER_PUBLIC_DATA_DIR || process.env.DATA_DIR || path.join(siteRoot, "data")
);
const DB_FILE = path.resolve(
  process.env.VALIDIFIER_PUBLIC_DB_FILE || process.env.DB_FILE || path.join(DATA_DIR, "validifier-public.sqlite")
);
const ARTIFACT_ROOT = path.resolve(process.env.VALIDIFIER_PUBLIC_ARTIFACT_ROOT || path.join(DATA_DIR, "artifacts"));

const INTERNAL_BASE_URL = normalizeBaseUrl(
  process.env.VALIDIFIER_INTERNAL_BASE_URL || process.env.REPLAY_VERIFICATION_API_BASE_URL || ""
);
const INTERNAL_TOKEN = String(
  process.env.VALIDIFIER_INTERNAL_TOKEN || process.env.REPLAY_VERIFICATION_API_TOKEN || ""
).trim();
const INTERNAL_TOKEN_HEADER = String(
  process.env.VALIDIFIER_INTERNAL_TOKEN_HEADER || process.env.REPLAY_VERIFICATION_API_TOKEN_HEADER || "Authorization"
).trim();
const INTERNAL_TOKEN_PREFIX = String(
  process.env.VALIDIFIER_INTERNAL_TOKEN_PREFIX || process.env.REPLAY_VERIFICATION_API_TOKEN_PREFIX || "Bearer"
).trim();
const INTERNAL_ACCESS_TOKEN = String(process.env.VALIDIFIER_INTERNAL_ACCESS_TOKEN || "").trim();
const INTERNAL_SUBMISSION_SECRET = String(process.env.VALIDIFIER_INTERNAL_SUBMISSION_SECRET || "").trim();

const REPLAY_BUILD_ID = String(process.env.VALIDIFIER_REPLAY_BUILD_ID || "").trim();

const MAP_UPLOAD_MAX_BYTES = 64 * 1024 * 1024;
const REPLAY_UPLOAD_MAX_BYTES = 16 * 1024 * 1024;
const hardeningSettings = resolveValidifierHardeningSettings(process.env);
const ARTIFACT_TTL_MS = hardeningSettings.VALIDIFIER_PUBLIC_ARTIFACT_TTL_MS;
const SUBMISSION_TTL_MS = hardeningSettings.VALIDIFIER_PUBLIC_SUBMISSION_TTL_MS;
const UPLOAD_BYTES_PER_DAY = hardeningSettings.VALIDIFIER_PUBLIC_UPLOAD_BYTES_PER_DAY;
const UPLOAD_GLOBAL_BYTES_PER_DAY = hardeningSettings.VALIDIFIER_PUBLIC_UPLOAD_GLOBAL_BYTES_PER_DAY;
const UPLOAD_MAX_CONCURRENT = hardeningSettings.VALIDIFIER_PUBLIC_UPLOAD_MAX_CONCURRENT;
const UPLOAD_GLOBAL_MAX_CONCURRENT = hardeningSettings.VALIDIFIER_PUBLIC_UPLOAD_GLOBAL_MAX_CONCURRENT;

ensureDirectorySync(DATA_DIR);
ensureDirectorySync(ARTIFACT_ROOT);

export {
  ARTIFACT_ROOT,
  ARTIFACT_TTL_MS,
  CACHE_TTL_MS,
  DATA_DIR,
  DB_FILE,
  FRONTEND_DIR,
  INTERNAL_ACCESS_TOKEN,
  INTERNAL_BASE_URL,
  INTERNAL_SUBMISSION_SECRET,
  INTERNAL_TOKEN,
  INTERNAL_TOKEN_HEADER,
  INTERNAL_TOKEN_PREFIX,
  MAP_UPLOAD_MAX_BYTES,
  PORT,
  REPLAY_BUILD_ID,
  REPLAY_UPLOAD_MAX_BYTES,
  REQUEST_TIMEOUT_MS,
  SUBMISSION_TTL_MS,
  UPLOAD_BYTES_PER_DAY,
  UPLOAD_GLOBAL_BYTES_PER_DAY,
  UPLOAD_GLOBAL_MAX_CONCURRENT,
  UPLOAD_MAX_CONCURRENT,
};
