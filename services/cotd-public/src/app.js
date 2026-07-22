import fs from "node:fs";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { parseBoolean } from "../../shared/envUtils.js";
import { createStubClassification } from "./classifierClient.js";
import { buildDemoSnapshot, sanitizeSnapshot } from "./cotdModel.js";
import { createCotdHttpPolicy } from "./httpPolicy.js";
import { parseLimit, parseOffset, setPrivateNoStore } from "./publicHttpPolicy.js";

function createRateLimiter(maxRequests, sendError) {
  return rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, 429, "rate_limited", "Too many requests. Please try again in a moment."),
  });
}

function createCotdApp({ runtime, settings, workflow, logger = console }) {
  const {
    ADMIN_TOKEN,
    ALLOW_DEBUG_RAW,
    AUTO_CLASSIFY_ENABLED,
    CLASSIFIER_BASE_URL,
    CLASSIFIER_PATH,
    CLASSIFIER_TIMEOUT_MS,
    FRONTEND_DIR,
    MAP_FILES_DIR,
    PUBLIC_CACHE_TTL_MS,
    PUBLIC_PAGINATION_MAX_OFFSET,
    TOTD_DOWNLOAD_MAP_FILES,
    TOTD_FETCH_ENABLED,
    TOTD_FETCH_INTERVAL_MS,
    TOTD_SOURCE_TIMEOUT_MS,
    TOTD_SYNC_MONTH_LENGTH,
    TOTD_SYNC_MONTH_OFFSET,
    TOTD_SYNC_ROYAL,
  } = settings;
  const { classifierClient, nadeoClient, repository, responseCache, totdClient } = runtime;
  const policy = createCotdHttpPolicy({
    adminToken: ADMIN_TOKEN,
    allowDebugRaw: ALLOW_DEBUG_RAW,
    cacheTtlMs: PUBLIC_CACHE_TTL_MS,
    responseCache,
  });
  const {
    getCacheEntry,
    privateResponseFor,
    requireAdmin,
    sendError,
    sendSuccess,
    setCacheEntry,
    setCacheHeaders,
    setRouteCacheHeaders,
    shouldIncludeRaw,
  } = policy;
  const app = express();
  const sharedDir = path.resolve(FRONTEND_DIR, "..", "..", "shared");

  function publicTodayPayload(req) {
    const includeRaw = shouldIncludeRaw(req);
    const latest = repository.getLatest();
    const data = sanitizeSnapshot(latest || buildDemoSnapshot(createStubClassification()), { includeRaw });
    if (!latest) data.storage = { mode: "empty", latestStored: false };
    if (String(req.query.debug || "").trim() && !includeRaw) {
      data.warnings = [
        ...(data.warnings || []),
        "Raw/debug payloads require COTD_ALLOW_DEBUG_RAW=1 and a valid configured admin token.",
      ];
    }
    return data;
  }

  function publicArchivePayload(req, { limit, offset }) {
    const page = repository.listTotdMaps({ limit, offset });
    return {
      ...page,
      items: page.items.map((item) => sanitizeSnapshot(item, { includeRaw: shouldIncludeRaw(req) })),
    };
  }

  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(morgan("combined"));
  app.use("/api/v1", (req, res, next) => {
    if (privateResponseFor(req)) setPrivateNoStore(res);
    next();
  });
  app.use(express.json({ limit: "300kb" }));
  app.use("/shared", express.static(sharedDir));
  app.use(express.static(FRONTEND_DIR));
  app.use("/api/v1/", createRateLimiter(180, sendError));

  app.get("/", (_req, res) => res.sendFile(path.join(FRONTEND_DIR, "index.html")));
  app.get(["/history", "/plugin", "/totd"], (_req, res) => res.sendFile(path.join(FRONTEND_DIR, "index.html")));

  app.get(["/health", "/api/v1/health"], (_req, res) => {
    let storage = null;
    try {
      storage = repository.getStorageSummary();
    } catch (error) {
      storage = { status: "error", error: error?.message || "storage unavailable" };
    }
    return sendSuccess(res, {
      service: "cotd-public",
      status: storage.status === "ok" ? (classifierClient.isConfigured() ? "ok" : "degraded") : "error",
      apiVersion: "v1",
      checkedAt: new Date().toISOString(),
      storage,
      classifier: {
        configured: classifierClient.isConfigured(),
        baseUrlConfigured: Boolean(CLASSIFIER_BASE_URL),
        path: CLASSIFIER_PATH,
        timeoutMs: CLASSIFIER_TIMEOUT_MS,
      },
      nadeo: nadeoClient.status(),
      totdFetch: {
        enabled: TOTD_FETCH_ENABLED,
        intervalMs: TOTD_FETCH_INTERVAL_MS,
        sourceConfigured: totdClient.isConfigured(),
        nadeoConfigured: nadeoClient.isConfigured(),
        sourceTimeoutMs: TOTD_SOURCE_TIMEOUT_MS,
        autoClassifyEnabled: AUTO_CLASSIFY_ENABLED,
        syncMonthLength: TOTD_SYNC_MONTH_LENGTH,
        syncMonthOffset: TOTD_SYNC_MONTH_OFFSET,
        downloadMapFiles: TOTD_DOWNLOAD_MAP_FILES,
        inFlight: Boolean(workflow.fetchInFlight),
        lastRun: repository.getFetchState(),
      },
      adminIngestConfigured: Boolean(ADMIN_TOKEN),
    });
  });

  app.get(["/api/v1", "/api/v1/"], (req, res) => {
    setRouteCacheHeaders(req, res, "miss");
    return sendSuccess(res, {
      apiVersion: "v1",
      endpoints: {
        health: "/api/v1/health",
        today: "/api/v1/today",
        totd: "/api/v1/totd?limit=100&offset=0",
        maps: "/api/v1/maps?limit=100&offset=0",
        mapFile: "/api/v1/maps/:mapUid/file",
        history: "/api/v1/history?limit=30&offset=0",
        adminIngest: "/api/v1/admin/ingest",
        adminFetchNow: "/api/v1/admin/fetch-now",
        adminSyncTotd: "/api/v1/admin/sync-totd",
      },
      debugRaw: {
        enabledByEnv: ALLOW_DEBUG_RAW,
        query: "?debug=1",
        requiresAdminToken: true,
        adminTokenConfigured: Boolean(ADMIN_TOKEN),
      },
    });
  });

  app.get("/api/v1/today", (req, res) => {
    try {
      const privateResponse = privateResponseFor(req);
      const cached = privateResponse ? undefined : getCacheEntry("today");
      if (cached !== undefined) {
        setCacheHeaders(res, "hit");
        return sendSuccess(res, cached);
      }
      const data = publicTodayPayload(req);
      if (!privateResponse) setCacheEntry("today", data);
      setRouteCacheHeaders(req, res, "miss");
      return sendSuccess(res, data);
    } catch (error) {
      logger.error("[cotd-public] today lookup failed:", error?.message || error);
      return sendError(res, 500, "internal_error", "The COTD public service could not load today's snapshot.");
    }
  });

  app.get(["/api/v1/totd", "/api/v1/maps"], (req, res) => {
    try {
      const limit = parseLimit(req.query.limit, { fallback: 100, max: 500 });
      const offset = parseOffset(req.query.offset, { fallback: 0, max: PUBLIC_PAGINATION_MAX_OFFSET });
      const privateResponse = privateResponseFor(req);
      const cacheKey = `totd:${limit}:${offset}`;
      const cached = privateResponse ? undefined : getCacheEntry(cacheKey);
      if (cached !== undefined) {
        setCacheHeaders(res, "hit");
        return sendSuccess(res, cached);
      }
      const data = publicArchivePayload(req, { limit, offset });
      if (!privateResponse) setCacheEntry(cacheKey, data);
      setRouteCacheHeaders(req, res, "miss");
      return sendSuccess(res, data);
    } catch (error) {
      if (error?.statusCode === 400) return sendError(res, 400, "invalid_request", error.message);
      logger.error("[cotd-public] TOTD archive lookup failed:", error?.message || error);
      return sendError(res, 500, "internal_error", "The COTD public service could not load the TOTD archive.");
    }
  });

  app.get("/api/v1/maps/:mapUid/file", (req, res) => {
    try {
      const mapFile = repository.getMapFile(req.params.mapUid);
      if (!mapFile || mapFile.status !== "downloaded" || !mapFile.storagePath) {
        return sendError(res, 404, "not_found", "Downloaded map file is not available for this map UID.");
      }
      const safeRoot = path.resolve(MAP_FILES_DIR);
      const safePath = path.resolve(mapFile.storagePath);
      if (safePath !== safeRoot && !safePath.startsWith(`${safeRoot}${path.sep}`)) {
        return sendError(res, 500, "storage_error", "Stored map file path is outside the configured map directory.");
      }
      if (!fs.existsSync(safePath)) return sendError(res, 404, "not_found", "Stored map file is missing on disk.");
      if (privateResponseFor(req)) setPrivateNoStore(res);
      else res.setHeader("cache-control", "public, max-age=86400");
      return res.download(safePath, mapFile.filename || `${req.params.mapUid}.Map.Gbx`);
    } catch (error) {
      logger.error("[cotd-public] map file download failed:", error?.message || error);
      return sendError(res, 500, "internal_error", "The COTD public service could not serve the map file.");
    }
  });

  app.get("/api/v1/history", (req, res) => {
    try {
      const limit = parseLimit(req.query.limit, { fallback: 30, max: 100 });
      const offset = parseOffset(req.query.offset, { fallback: 0, max: PUBLIC_PAGINATION_MAX_OFFSET });
      const includeRaw = shouldIncludeRaw(req);
      const privateResponse = privateResponseFor(req);
      const cacheKey = `history:${limit}:${offset}`;
      const cached = privateResponse ? undefined : getCacheEntry(cacheKey);
      if (cached !== undefined) {
        setCacheHeaders(res, "hit");
        return sendSuccess(res, cached);
      }
      const page = repository.listHistory({ limit, offset });
      const data = { ...page, items: page.items.map((item) => sanitizeSnapshot(item, { includeRaw })) };
      if (!privateResponse) setCacheEntry(cacheKey, data);
      setRouteCacheHeaders(req, res, "miss");
      return sendSuccess(res, data);
    } catch (error) {
      if (error?.statusCode === 400) return sendError(res, 400, "invalid_request", error.message);
      logger.error("[cotd-public] history lookup failed:", error?.message || error);
      return sendError(res, 500, "internal_error", "The COTD public service could not load history.");
    }
  });

  app.post("/api/v1/admin/ingest", createRateLimiter(30, sendError), requireAdmin, async (req, res) => {
    try {
      const saved = repository.upsertSnapshot(await workflow.buildAdminSnapshot(req.body || {}));
      responseCache.clear();
      return sendSuccess(res, sanitizeSnapshot(saved, { includeRaw: shouldIncludeRaw(req) }), 201);
    } catch (error) {
      logger.error("[cotd-public] admin ingest failed:", error?.message || error);
      return sendError(res, 400, "invalid_request", error.message || "The COTD ingest payload was invalid.");
    }
  });

  app.post("/api/v1/admin/fetch-now", createRateLimiter(12, sendError), requireAdmin, async (_req, res) => {
    try {
      return sendSuccess(res, await workflow.runFetch({ reason: "admin" }));
    } catch (error) {
      logger.error("[cotd-public] admin fetch-now failed:", error?.message || error);
      return sendError(res, 502, "totd_source_unavailable", error.message || "The TOTD source request failed.");
    }
  });

  app.post("/api/v1/admin/sync-totd", createRateLimiter(8, sendError), requireAdmin, async (req, res) => {
    if (!nadeoClient.isConfigured()) {
      return sendError(
        res,
        503,
        "nadeo_not_configured",
        "Configure COTD_NADEO_* credentials for both NadeoLiveServices and NadeoServices before syncing TOTDs."
      );
    }
    const body = req.body || {};
    const length = Math.max(
      1,
      Math.min(36, Number(body.length ?? req.query.length ?? TOTD_SYNC_MONTH_LENGTH) || TOTD_SYNC_MONTH_LENGTH)
    );
    const offset = Math.max(0, Number(body.offset ?? req.query.offset ?? TOTD_SYNC_MONTH_OFFSET) || 0);
    const royal = parseBoolean(body.royal ?? req.query.royal, TOTD_SYNC_ROYAL);
    const downloadFiles = parseBoolean(
      body.downloadFiles ?? body.download_files ?? req.query.downloadFiles,
      TOTD_DOWNLOAD_MAP_FILES
    );
    try {
      return sendSuccess(
        res,
        await workflow.runExclusiveNadeoSync({ reason: "admin-sync", length, offset, royal, downloadFiles })
      );
    } catch (error) {
      logger.error("[cotd-public] admin sync-totd failed:", error?.message || error);
      return sendError(res, 502, "nadeo_sync_failed", error.message || "The Nadeo TOTD sync failed.");
    }
  });

  app.use((err, _req, res, _next) => {
    if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
      return sendError(res, 400, "invalid_request", "Request body must be valid JSON.");
    }
    logger.error("[cotd-public] unexpected server error:", err);
    return sendError(res, 500, "internal_error", "The COTD public service encountered an unexpected error.");
  });

  return app;
}

export { createCotdApp };
