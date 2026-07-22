const path = require("node:path");

function definePublicDataProcesses({ defineProcess, roots, serviceEnvironments }) {
  const validifierEnvironment = serviceEnvironments.forService("validifier-public");
  const cotdEnvironment = serviceEnvironments.forService("cotd-public");

  return [
    defineProcess("validifier-public", {
      env: {
        FRONTEND_DIR: path.join(roots.sites, "validifier.xjk.yt", "frontend"),
        VALIDIFIER_PUBLIC_DATA_DIR:
          validifierEnvironment.VALIDIFIER_PUBLIC_DATA_DIR || path.join(roots.sites, "validifier.xjk.yt", "data"),
        VALIDIFIER_PUBLIC_DB_FILE:
          validifierEnvironment.VALIDIFIER_PUBLIC_DB_FILE ||
          path.join(roots.sites, "validifier.xjk.yt", "data", "validifier-public.sqlite"),
        VALIDIFIER_PUBLIC_ARTIFACT_ROOT:
          validifierEnvironment.VALIDIFIER_PUBLIC_ARTIFACT_ROOT ||
          path.join(roots.sites, "validifier.xjk.yt", "data", "artifacts"),
        VALIDIFIER_INTERNAL_BASE_URL:
          validifierEnvironment.VALIDIFIER_INTERNAL_BASE_URL ||
          validifierEnvironment.REPLAY_VERIFICATION_API_BASE_URL ||
          "",
        VALIDIFIER_INTERNAL_TOKEN:
          validifierEnvironment.VALIDIFIER_INTERNAL_TOKEN || validifierEnvironment.REPLAY_VERIFICATION_API_TOKEN || "",
        VALIDIFIER_INTERNAL_TOKEN_HEADER:
          validifierEnvironment.VALIDIFIER_INTERNAL_TOKEN_HEADER ||
          validifierEnvironment.REPLAY_VERIFICATION_API_TOKEN_HEADER ||
          "Authorization",
        VALIDIFIER_INTERNAL_TOKEN_PREFIX:
          validifierEnvironment.VALIDIFIER_INTERNAL_TOKEN_PREFIX ||
          validifierEnvironment.REPLAY_VERIFICATION_API_TOKEN_PREFIX ||
          "Bearer",
        VALIDIFIER_INTERNAL_ACCESS_TOKEN: validifierEnvironment.VALIDIFIER_INTERNAL_ACCESS_TOKEN || "",
        VALIDIFIER_INTERNAL_SUBMISSION_SECRET: validifierEnvironment.VALIDIFIER_INTERNAL_SUBMISSION_SECRET || "",
        VALIDIFIER_REPLAY_BUILD_ID: validifierEnvironment.VALIDIFIER_REPLAY_BUILD_ID || "",
        VALIDIFIER_PUBLIC_REQUEST_TIMEOUT_MS:
          validifierEnvironment.VALIDIFIER_PUBLIC_REQUEST_TIMEOUT_MS ||
          validifierEnvironment.REPLAY_VERIFICATION_REQUEST_TIMEOUT_MS ||
          "15000",
        VALIDIFIER_PUBLIC_CACHE_TTL_MS: validifierEnvironment.VALIDIFIER_PUBLIC_CACHE_TTL_MS || "15000",
        VALIDIFIER_PUBLIC_ARTIFACT_TTL_MS: validifierEnvironment.VALIDIFIER_PUBLIC_ARTIFACT_TTL_MS || "604800000",
        VALIDIFIER_PUBLIC_SUBMISSION_TTL_MS: validifierEnvironment.VALIDIFIER_PUBLIC_SUBMISSION_TTL_MS || "604800000",
        VALIDIFIER_PUBLIC_UPLOAD_BYTES_PER_DAY:
          validifierEnvironment.VALIDIFIER_PUBLIC_UPLOAD_BYTES_PER_DAY || "268435456",
        VALIDIFIER_PUBLIC_UPLOAD_GLOBAL_BYTES_PER_DAY:
          validifierEnvironment.VALIDIFIER_PUBLIC_UPLOAD_GLOBAL_BYTES_PER_DAY || "2147483648",
        VALIDIFIER_PUBLIC_UPLOAD_MAX_CONCURRENT: validifierEnvironment.VALIDIFIER_PUBLIC_UPLOAD_MAX_CONCURRENT || "2",
        VALIDIFIER_PUBLIC_UPLOAD_GLOBAL_MAX_CONCURRENT:
          validifierEnvironment.VALIDIFIER_PUBLIC_UPLOAD_GLOBAL_MAX_CONCURRENT || "8",
      },
    }),
    defineProcess("cotd-public", {
      env: {
        FRONTEND_DIR: path.join(roots.sites, "cotd.xjk.yt", "frontend"),
        COTD_PUBLIC_DATA_DIR: cotdEnvironment.COTD_PUBLIC_DATA_DIR || path.join(roots.sites, "cotd.xjk.yt", "data"),
        COTD_PUBLIC_STORAGE_FILE:
          cotdEnvironment.COTD_PUBLIC_STORAGE_FILE || path.join(roots.sites, "cotd.xjk.yt", "data", "cotd-public.json"),
        COTD_PUBLIC_DB_FILE:
          cotdEnvironment.COTD_PUBLIC_DB_FILE || path.join(roots.sites, "cotd.xjk.yt", "data", "cotd-public.sqlite"),
        COTD_MAP_FILES_DIR: cotdEnvironment.COTD_MAP_FILES_DIR || path.join(roots.sites, "cotd.xjk.yt", "data", "maps"),
        COTD_PUBLIC_CACHE_TTL_MS: cotdEnvironment.COTD_PUBLIC_CACHE_TTL_MS || "15000",
        COTD_HISTORY_LIMIT: cotdEnvironment.COTD_HISTORY_LIMIT || "2500",
        COTD_ADMIN_TOKEN: cotdEnvironment.COTD_ADMIN_TOKEN || "",
        COTD_TOTD_FETCH_ENABLED: cotdEnvironment.COTD_TOTD_FETCH_ENABLED || "0",
        COTD_TOTD_FETCH_ON_START: cotdEnvironment.COTD_TOTD_FETCH_ON_START || "1",
        COTD_TOTD_FETCH_INTERVAL_MS: cotdEnvironment.COTD_TOTD_FETCH_INTERVAL_MS || "300000",
        COTD_TOTD_SOURCE_URL: cotdEnvironment.COTD_TOTD_SOURCE_URL || "",
        COTD_TOTD_SOURCE_TOKEN: cotdEnvironment.COTD_TOTD_SOURCE_TOKEN || "",
        COTD_TOTD_SOURCE_TOKEN_HEADER: cotdEnvironment.COTD_TOTD_SOURCE_TOKEN_HEADER || "Authorization",
        COTD_TOTD_SOURCE_TOKEN_PREFIX: cotdEnvironment.COTD_TOTD_SOURCE_TOKEN_PREFIX || "Bearer",
        COTD_TOTD_SOURCE_TIMEOUT_MS: cotdEnvironment.COTD_TOTD_SOURCE_TIMEOUT_MS || "15000",
        COTD_AUTO_CLASSIFY_ENABLED: cotdEnvironment.COTD_AUTO_CLASSIFY_ENABLED || "1",
        COTD_TOTD_SYNC_MONTH_LENGTH: cotdEnvironment.COTD_TOTD_SYNC_MONTH_LENGTH || "1",
        COTD_TOTD_SYNC_MONTH_OFFSET: cotdEnvironment.COTD_TOTD_SYNC_MONTH_OFFSET || "0",
        COTD_TOTD_SYNC_ROYAL: cotdEnvironment.COTD_TOTD_SYNC_ROYAL || "0",
        COTD_TOTD_DOWNLOAD_MAP_FILES: cotdEnvironment.COTD_TOTD_DOWNLOAD_MAP_FILES || "1",
        COTD_NADEO_AUTH_MODE: cotdEnvironment.COTD_NADEO_AUTH_MODE || "basic",
        COTD_NADEO_DEDI_LOGIN: cotdEnvironment.COTD_NADEO_DEDI_LOGIN || "",
        COTD_NADEO_DEDI_PASSWORD: cotdEnvironment.COTD_NADEO_DEDI_PASSWORD || "",
        COTD_NADEO_SERVICES_TOKEN: cotdEnvironment.COTD_NADEO_SERVICES_TOKEN || "",
        COTD_NADEO_LIVE_SERVICES_TOKEN: cotdEnvironment.COTD_NADEO_LIVE_SERVICES_TOKEN || "",
        COTD_NADEO_TOKEN_CACHE_FILE:
          cotdEnvironment.COTD_NADEO_TOKEN_CACHE_FILE ||
          path.join(roots.sites, "cotd.xjk.yt", "data", "nadeo-token-cache.json"),
        COTD_NADEO_REQUEST_TIMEOUT_MS: cotdEnvironment.COTD_NADEO_REQUEST_TIMEOUT_MS || "15000",
        COTD_NADEO_MIN_REQUEST_GAP_MS: cotdEnvironment.COTD_NADEO_MIN_REQUEST_GAP_MS || "1000",
        COTD_NADEO_GLOBAL_THROTTLE_FILE:
          cotdEnvironment.COTD_NADEO_GLOBAL_THROTTLE_FILE || cotdEnvironment.NADEO_GLOBAL_THROTTLE_FILE || "",
        COTD_NADEO_GLOBAL_MIN_REQUEST_GAP_MS:
          cotdEnvironment.COTD_NADEO_GLOBAL_MIN_REQUEST_GAP_MS ||
          cotdEnvironment.NADEO_GLOBAL_MIN_REQUEST_GAP_MS ||
          "0",
        COTD_NADEO_USER_AGENT:
          cotdEnvironment.COTD_NADEO_USER_AGENT ||
          cotdEnvironment.COTD_USER_AGENT ||
          "xjk.yt COTD integration (admin@xjk.yt)",
        COTD_CLASSIFIER_BASE_URL: cotdEnvironment.COTD_CLASSIFIER_BASE_URL || "",
        COTD_CLASSIFIER_PATH: cotdEnvironment.COTD_CLASSIFIER_PATH || "/api/v1/classify",
        COTD_CLASSIFIER_TOKEN: cotdEnvironment.COTD_CLASSIFIER_TOKEN || "",
        COTD_CLASSIFIER_TOKEN_HEADER: cotdEnvironment.COTD_CLASSIFIER_TOKEN_HEADER || "Authorization",
        COTD_CLASSIFIER_TOKEN_PREFIX: cotdEnvironment.COTD_CLASSIFIER_TOKEN_PREFIX || "Bearer",
        COTD_CLASSIFIER_TIMEOUT_MS: cotdEnvironment.COTD_CLASSIFIER_TIMEOUT_MS || "15000",
        COTD_ALLOW_DEBUG_RAW: cotdEnvironment.COTD_ALLOW_DEBUG_RAW || "0",
      },
    }),
  ];
}

module.exports = { definePublicDataProcesses };
