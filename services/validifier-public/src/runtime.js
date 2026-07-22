import {
  ARTIFACT_ROOT,
  ARTIFACT_TTL_MS,
  CACHE_TTL_MS,
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
  REPLAY_UPLOAD_MAX_BYTES,
  REQUEST_TIMEOUT_MS,
  SUBMISSION_TTL_MS,
  UPLOAD_BYTES_PER_DAY,
  UPLOAD_GLOBAL_BYTES_PER_DAY,
  UPLOAD_GLOBAL_MAX_CONCURRENT,
  UPLOAD_MAX_CONCURRENT,
} from "./config.js";
import { createArtifactLifecycle, startArtifactCollection } from "./artifactLifecycle.js";
import { createValidifierApp } from "./app.js";
import { createInternalClient } from "./internalClient.js";
import { createLiveQueueService } from "./liveQueueService.js";
import { createPublicLookupService } from "./publicLookupService.js";
import { createPublicResponseCache } from "./publicCache.js";
import { buildPublicApiCatalog } from "./publicApiCatalog.js";
import { ValidifierRepository } from "./repository.js";
import { createUploadQuotaManager } from "./uploadQuota.js";

export function createValidifierRuntime({ logger = console } = {}) {
  const internalClient = createInternalClient({
    internalBaseUrl: INTERNAL_BASE_URL,
    internalToken: INTERNAL_TOKEN,
    internalTokenHeader: INTERNAL_TOKEN_HEADER,
    internalTokenPrefix: INTERNAL_TOKEN_PREFIX,
    internalAccessToken: INTERNAL_ACCESS_TOKEN,
    internalSubmissionSecret: INTERNAL_SUBMISSION_SECRET,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
  });
  const repository = new ValidifierRepository({
    dbFile: DB_FILE,
    artifactTtlMs: ARTIFACT_TTL_MS,
    submissionTtlMs: SUBMISSION_TTL_MS,
  });
  const artifactLifecycle = createArtifactLifecycle({ repository, logger });
  const uploadQuota = createUploadQuotaManager({
    repository,
    bytesPerDay: UPLOAD_BYTES_PER_DAY,
    globalBytesPerDay: UPLOAD_GLOBAL_BYTES_PER_DAY,
    maxConcurrent: UPLOAD_MAX_CONCURRENT,
    globalMaxConcurrent: UPLOAD_GLOBAL_MAX_CONCURRENT,
  });
  const responseCache = createPublicResponseCache({ ttlMs: CACHE_TTL_MS });
  const lookupService = createPublicLookupService({ internalClient, repository, responseCache });
  const liveQueueService = createLiveQueueService({ internalClient, repository, lookupService, logger });
  const app = createValidifierApp({
    artifactLifecycle,
    artifactRoot: ARTIFACT_ROOT,
    cacheTtlMs: CACHE_TTL_MS,
    configured: Boolean(INTERNAL_BASE_URL),
    frontendDir: FRONTEND_DIR,
    internalClient,
    liveQueueService,
    logger,
    lookupService,
    mapUploadMaxBytes: MAP_UPLOAD_MAX_BYTES,
    publicApiCatalog: buildPublicApiCatalog(),
    replayUploadMaxBytes: REPLAY_UPLOAD_MAX_BYTES,
    repository,
    uploadQuota,
  });
  return { app, artifactLifecycle, internalClient, repository, uploadQuota };
}

export function startValidifierPublicServer({ logger = console } = {}) {
  const runtime = createValidifierRuntime({ logger });
  const artifactTimer = startArtifactCollection(runtime.artifactLifecycle);
  const server = runtime.app.listen(PORT, "127.0.0.1", () => {
    logger.log(`Validifier public service listening on http://127.0.0.1:${PORT}`);
    logger.log(`FRONTEND_DIR=${FRONTEND_DIR}`);
    logger.log(`DB_FILE=${DB_FILE}`);
    logger.log(`INTERNAL_BASE_URL=${INTERNAL_BASE_URL || "(not configured)"}`);
  });
  server.on("close", () => clearInterval(artifactTimer));
  return { ...runtime, artifactTimer, server };
}
