import { buildOperationsFeedPayload } from "./activityPayloads.js";
import { getAdminContextCached } from "./adminContext.js";
import {
  clampInt,
  resolveCursorOffset,
  summarizeDisplayname,
  summarizeHookRun,
  summarizeTrackerRun,
  toText,
} from "./routeUtils.js";

function registerSummaryRoutes(router, { service, opsService = null, getLiveAuthContext = async () => null }) {
  router.get("/operations/feed", async (req, res) => {
    const context = await getAdminContextCached(service, opsService);
    const cursor = resolveCursorOffset(req.query.cursor, 0);
    const limit = clampInt(req.query.limit, { min: 1, max: 100, fallback: 40 });
    const payload = buildOperationsFeedPayload({
      context,
      kind: req.query.kind,
      mapUid: req.query.mapUid,
      jobKey: req.query.jobKey,
      cursor,
      limit,
    });
    return res.json(payload);
  });

  router.get("/settings/summary", async (req, res) => {
    const context = await getAdminContextCached(service, opsService);
    let liveApiContext = null;
    let liveApiError = null;
    try {
      liveApiContext = await getLiveAuthContext(req);
    } catch (error) {
      liveApiError = error?.message || "Live API auth context is unavailable.";
    }

    return res.json({
      generatedAt: context.generatedAt,
      hook: context.hook,
      projectClubs: context.projectClubs,
      projectSources: context.projectSources,
      liveMonitor: context.liveStatus?.monitor || {},
      liveIntegrations: context.liveStatus?.integrations || {},
      liveAuth: context.liveStatus?.auth || null,
      liveApiSession: {
        available: Boolean(liveApiContext),
        error: liveApiError,
      },
      mapperNameSync: context.liveStatus?.mapperNameSync || {},
      trackerStatus: context.trackerStatus,
      publicApi: context.publicApiUsage || {
        totals: {
          totalRequests: 0,
          requests24h: 0,
          requests7d: 0,
          requestsWindow: 0,
          successCount: 0,
          clientErrorCount: 0,
          serverErrorCount: 0,
          uniqueClientsWindow: 0,
        },
        endpoints: [],
        origins: [],
        timeline: [],
        recentRequests: [],
        catalog: {
          docsPath: "/api/",
          totalEndpoints: 0,
        },
      },
      ops: {
        counts: context.opsOverview?.counts || {},
        scheduler: context.opsOverview?.scheduler || {},
        bot: context.opsOverview?.bot || {},
      },
      localStore: context.localStore,
      namingSummary: context.namingSummary,
      updateRequestSummary: {
        total: context.updateRequests.length,
        queued: context.updateRequests.filter((item) => toText(item?.status).toLowerCase() === "queued").length,
        processing: context.updateRequests.filter((item) => toText(item?.status).toLowerCase() === "processing").length,
      },
    });
  });

  router.get("/public-api/summary", async (_req, res) => {
    const context = await getAdminContextCached(service, opsService);
    return res.json({
      generatedAt: context.generatedAt,
      usage: context.publicApiUsage || {
        totals: {
          totalRequests: 0,
          requests24h: 0,
          requests7d: 0,
          requestsWindow: 0,
          successCount: 0,
          clientErrorCount: 0,
          serverErrorCount: 0,
          uniqueClientsWindow: 0,
        },
        endpoints: [],
        origins: [],
        timeline: [],
        recentRequests: [],
        catalog: {
          docsPath: "/api/",
          totalEndpoints: 0,
        },
      },
      catalog:
        typeof service.catalog.getPublicApiCatalog === "function"
          ? service.catalog.getPublicApiCatalog()
          : {
              generatedAt: context.generatedAt,
              api: {
                name: "Altered Public API",
                version: "v1",
                docsPath: "/api/",
                totalEndpoints: 0,
              },
              endpoints: [],
            },
    });
  });

  router.get("/advanced/summary", async (_req, res) => {
    const context = await getAdminContextCached(service, opsService);
    const monitor = context.liveStatus?.monitor || {};
    const mapperNameSync = context.liveStatus?.mapperNameSync || {};
    return res.json({
      generatedAt: context.generatedAt,
      legacyMonitoringUrl: "/admin/monitoring/",
      sections: {
        club: {
          available: true,
          state: !context.liveStatus?.configured ? "blocked" : monitor.enabled ? "online" : "paused",
          summary: summarizeHookRun(context.hook?.latestRun),
        },
        leaderboard: {
          available: true,
          state: context.trackerStatus?.error ? "degraded" : "online",
          summary: summarizeTrackerRun(context.trackerStatus, context.trackerRuns),
        },
        displayname: {
          available: true,
          state: mapperNameSync.lastError ? "degraded" : mapperNameSync.enabled ? "online" : "paused",
          summary: summarizeDisplayname(mapperNameSync),
        },
      },
      counters: {
        maps: Number(context.stats?.total_maps || 0),
        trackedMaps: Number(context.stats?.actively_tracked || 0),
        campaigns: Number(context.hook?.latestRun?.campaignsSeen || 0),
        totalWrChanges: Number(context.stats?.total_wr_changes || 0),
        opsPollErrors: context.opsEvents.filter((event) => event?.error).length,
      },
    });
  });
}

export { registerSummaryRoutes };
