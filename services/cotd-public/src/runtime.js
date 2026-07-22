import {
  CLASSIFIER_BASE_URL,
  CLASSIFIER_PATH,
  CLASSIFIER_TIMEOUT_MS,
  CLASSIFIER_TOKEN,
  CLASSIFIER_TOKEN_HEADER,
  CLASSIFIER_TOKEN_PREFIX,
  DB_FILE,
  HISTORY_LIMIT,
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
  PUBLIC_CACHE_MAX_ENTRIES,
  PUBLIC_CACHE_TTL_MS,
  TOTD_SOURCE_TIMEOUT_MS,
  TOTD_SOURCE_TOKEN,
  TOTD_SOURCE_TOKEN_HEADER,
  TOTD_SOURCE_TOKEN_PREFIX,
  TOTD_SOURCE_URL,
} from "./config.js";
import { createClassifierClient } from "./classifierClient.js";
import { createNadeoClient } from "./nadeoClient.js";
import { BoundedTtlCache } from "./publicCache.js";
import { CotdRepository } from "./repository.js";
import { createTotdClient } from "./totdClient.js";

function createCotdRuntime() {
  const repository = new CotdRepository({
    dbFile: DB_FILE,
    historyLimit: HISTORY_LIMIT,
  });
  const classifierClient = createClassifierClient({
    classifierBaseUrl: CLASSIFIER_BASE_URL,
    classifierPath: CLASSIFIER_PATH,
    classifierToken: CLASSIFIER_TOKEN,
    classifierTokenHeader: CLASSIFIER_TOKEN_HEADER,
    classifierTokenPrefix: CLASSIFIER_TOKEN_PREFIX,
    classifierTimeoutMs: CLASSIFIER_TIMEOUT_MS,
  });
  const totdClient = createTotdClient({
    sourceUrl: TOTD_SOURCE_URL,
    sourceToken: TOTD_SOURCE_TOKEN,
    sourceTokenHeader: TOTD_SOURCE_TOKEN_HEADER,
    sourceTokenPrefix: TOTD_SOURCE_TOKEN_PREFIX,
    sourceTimeoutMs: TOTD_SOURCE_TIMEOUT_MS,
  });
  const nadeoClient = createNadeoClient({
    authMode: NADEO_AUTH_MODE,
    dediLogin: NADEO_DEDI_LOGIN,
    dediPassword: NADEO_DEDI_PASSWORD,
    servicesToken: NADEO_SERVICES_TOKEN,
    liveServicesToken: NADEO_LIVE_SERVICES_TOKEN,
    tokenCacheFile: NADEO_TOKEN_CACHE_FILE,
    requestTimeoutMs: NADEO_REQUEST_TIMEOUT_MS,
    minRequestGapMs: NADEO_MIN_REQUEST_GAP_MS,
    globalThrottleFile: NADEO_GLOBAL_THROTTLE_FILE,
    globalMinRequestGapMs: NADEO_GLOBAL_MIN_REQUEST_GAP_MS,
    userAgent: NADEO_USER_AGENT,
  });
  const responseCache = new BoundedTtlCache({
    ttlMs: PUBLIC_CACHE_TTL_MS,
    maxEntries: PUBLIC_CACHE_MAX_ENTRIES,
  });

  return { classifierClient, nadeoClient, repository, responseCache, totdClient };
}

export { createCotdRuntime };
