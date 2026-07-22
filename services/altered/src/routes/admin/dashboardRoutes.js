import { buildAlerts, buildRecentEvents } from "./activityPayloads.js";
import { buildCompatibilityReport, getAdminContextCached } from "./adminContext.js";
import { buildJobHistoryPayload, buildJobsOverviewPayload } from "./jobPayloads.js";
import { clampInt, resolveCursorOffset, toText } from "./routeUtils.js";

function registerDashboardRoutes(router, { service, opsService = null }) {
  router.get("/command-center", async (_req, res) => {
    const context = await getAdminContextCached(service, opsService);
    const jobsPayload = buildJobsOverviewPayload({
      hook: context.hook,
      liveStatus: context.liveStatus,
      trackerStatus: context.trackerStatus,
      trackerRuns: context.trackerRuns,
      opsOverview: context.opsOverview,
      localStore: context.localStore,
    });
    const alerts = buildAlerts({
      liveStatus: context.liveStatus,
      hook: context.hook,
      trackerStatus: context.trackerStatus,
      namingSummary: context.namingSummary,
      updateRequests: context.updateRequests,
      opsOverview: context.opsOverview,
      opsEvents: context.opsEvents,
    });
    const counts = context.opsOverview?.counts || {};
    const recentEvents = buildRecentEvents({
      hookRuns: context.hookRuns,
      opsRuns: context.opsRuns,
      opsEvents: context.opsEvents,
      trackerRuns: context.trackerRuns,
      liveStatus: context.liveStatus,
    });
    const healthState = alerts.some((item) => item.level === "error")
      ? "blocked"
      : alerts.some((item) => item.level === "warn")
        ? "degraded"
        : "healthy";
    const healthSummary =
      healthState === "blocked"
        ? alerts.find((item) => item.level === "error")?.title || "One or more critical blockers are active."
        : healthState === "degraded"
          ? alerts.find((item) => item.level === "warn")?.title || "Some systems need attention."
          : "All critical admin workflows are currently healthy.";

    return res.json({
      generatedAt: context.generatedAt,
      compatibility: buildCompatibilityReport(service),
      health: {
        state: healthState,
        summary: healthSummary,
      },
      counters: {
        maps: Number(context.stats?.total_maps || context.hook?.mapCount || 0),
        trackedMaps: Number(context.stats?.actively_tracked || context.hook?.trackedCount || 0),
        campaigns: Number(context.hook?.latestRun?.campaignsSeen || 0),
        namingPending: Number(context.namingSummary?.pendingManualReview || context.namingSummary?.pending || 0),
        namingUnmatched: Number(context.namingSummary?.unmatched || 0),
        localDownloaded: Number(context.localStore?.summary?.downloadedCount || 0),
        localMissing: Number(context.localStore?.summary?.missingCount || 0),
        queuedUpdateRequests: context.updateRequests.filter(
          (request) => String(request?.status || "").toLowerCase() === "queued"
        ).length,
        opsPollErrors: context.opsEvents.filter((event) => event?.error).length,
        dueSchedules: Number(counts.dueSchedules || 0),
        queuedCommands: Number(counts.queuedBotCommands || 0),
        apiRequests24h: Number(context.publicApiUsage?.totals?.requests24h || 0),
        apiRequests7d: Number(context.publicApiUsage?.totals?.requests7d || 0),
      },
      naming: {
        summary: context.namingSummary,
        unmatchedPreview: context.unmatchedNamingPreview,
      },
      projectClubs: context.projectClubs,
      projectSources: context.projectSources,
      localStore: context.localStore,
      jobs: jobsPayload.jobs,
      alerts,
      recentEvents: recentEvents.slice(0, 8),
    });
  });

  router.get("/jobs/overview", async (_req, res) => {
    const context = await getAdminContextCached(service, opsService);
    const payload = buildJobsOverviewPayload({
      hook: context.hook,
      liveStatus: context.liveStatus,
      trackerStatus: context.trackerStatus,
      trackerRuns: context.trackerRuns,
      opsOverview: context.opsOverview,
      localStore: context.localStore,
    });
    return res.json({
      ...payload,
      projectClubs: context.projectClubs,
      projectSources: context.projectSources,
    });
  });
  router.get("/jobs/:jobKey/history", async (req, res) => {
    const safeJobKey = toText(req.params.jobKey).toLowerCase();
    const validJobKeys = new Set([
      "club-full-sync",
      "club-discovery-sync",
      "tracker-run",
      "displayname-sync",
      "ops-scheduler",
    ]);
    if (!validJobKeys.has(safeJobKey)) {
      return res.status(404).json({ error: "Unknown job key." });
    }
    const context = await getAdminContextCached(service, opsService);
    const payload = buildJobHistoryPayload({
      jobKey: safeJobKey,
      liveStatus: context.liveStatus,
      hookRuns: context.hookRuns,
      trackerRuns: context.trackerRuns,
      opsOverview: context.opsOverview,
      opsRuns: context.opsRuns,
    });
    const cursor = resolveCursorOffset(req.query.cursor, 0);
    const limit = clampInt(req.query.limit, { min: 1, max: 100, fallback: 20 });
    const items = (Array.isArray(payload.items) ? payload.items : []).slice(cursor, cursor + limit);
    const hasMore = cursor + items.length < Number(payload.items?.length || 0);
    return res.json({
      generatedAt: context.generatedAt,
      jobKey: safeJobKey,
      label: payload.label,
      cursor,
      limit,
      total: Number(payload.items?.length || 0),
      hasMore,
      nextCursor: hasMore ? cursor + items.length : null,
      items,
    });
  });
}

export { registerDashboardRoutes };
