function tableExists(db, tableName) {
  if (!db || !tableName) return false;
  try {
    return Boolean(
      db
        .prepare(
          `
          SELECT 1
          FROM sqlite_master
          WHERE type = 'table' AND name = ?
          LIMIT 1
          `
        )
        .get(String(tableName))
    );
  } catch {
    return false;
  }
}

function buildCompatibilityReport(service) {
  const db = service?.catalog?.repository?.db || null;
  const requiredTables = {
    altered_map_content_signatures: tableExists(db, "altered_map_content_signatures"),
    altered_map_number_similarity: tableExists(db, "altered_map_number_similarity"),
  };
  const requiredRoutes = {
    namingSimilarityBackfill: true,
    namingSimilarityBackfillStart: true,
    namingSimilarityBackfillStatus: true,
    namingSimilarityBackfillCancel: true,
    namingCandidateDetail: true,
    namingSimilaritySelection: true,
    namingSimilarityWeights: true,
    similarityWeightRules: true,
    similarityWeightCampaignOverrides: true,
  };
  const notes = [];
  for (const [tableName, exists] of Object.entries(requiredTables)) {
    if (!exists) notes.push(`Missing DB table: ${tableName}`);
  }
  return {
    manifestVersion: "2026-03-16-gbx-layout",
    ok: notes.length === 0,
    requiredTables,
    requiredRoutes,
    notes,
  };
}
async function loadAdminContext(service, opsService) {
  const ADMIN_TRACKER_LOAD_TIMEOUT_MS = 1200;
  const liveStatus = service.monitoring.getLiveMonitorStatus();
  const hook = service.catalog.getHookStatus();
  const hookRuns = service.catalog.getHookRuns(12);
  const projectClubs = service.sources.getProjectClubs({ includeDisabled: true });
  const projectSources =
    typeof service.sources.getProjectSources === "function"
      ? service.sources.getProjectSources({ includeDisabled: true })
      : [];
  const publicApiUsage =
    typeof service.catalog.getPublicApiUsageSummary === "function"
      ? service.catalog.getPublicApiUsageSummary({
          days: 30,
          recentLimit: 12,
          topLimit: 8,
          originsLimit: 6,
        })
      : null;
  const naming = service.maps.getMapNameStandardizationCandidates({ limit: 1 });
  const unmatchedNaming = service.maps.getMapNameStandardizationCandidates({
    automationState: "unmatched",
    reviewState: "pending",
    limit: 12,
  });
  const localStore =
    typeof service.maps.getMapLocalStoreStatus === "function" ? service.maps.getMapLocalStoreStatus() : null;
  const updates = service.catalog.listUpdateRequests({ limit: 5000, offset: 0 });
  const opsOverview = opsService?.getOverview ? opsService.getOverview() : null;
  const opsRuns = opsService?.listPollRuns ? opsService.listPollRuns({ limit: 40 }) : [];
  const opsEvents = opsService?.listPollEvents ? opsService.listPollEvents({ limit: 120 }) : [];

  const [trackerStatus, trackerRunsResult, stats] = await Promise.all([
    service.tracker
      .getTrackerStatus({ timeoutMs: ADMIN_TRACKER_LOAD_TIMEOUT_MS })
      .catch((error) => ({ error: error?.message || "Tracker status unavailable." })),
    service.tracker
      .getTrackerRunHistory(40, { timeoutMs: ADMIN_TRACKER_LOAD_TIMEOUT_MS })
      .catch((error) => ({ ok: false, runs: [], error: error?.message || "Tracker runs unavailable." })),
    service.catalog.getAlterationsStats().catch(() => ({
      total_maps: 0,
      actively_tracked: 0,
      total_wr_changes: 0,
      last_run_at: null,
    })),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    liveStatus,
    hook,
    hookRuns,
    projectClubs,
    projectSources,
    publicApiUsage,
    localStore,
    namingSummary: naming?.summary || {
      total: 0,
      matched: 0,
      unmatched: 0,
      pending: 0,
      pendingManualReview: 0,
      pendingMatched: 0,
      approved: 0,
      ignored: 0,
      requiresRegex: 0,
      manualNamed: 0,
    },
    unmatchedNamingPreview: Array.isArray(unmatchedNaming?.candidates) ? unmatchedNaming.candidates : [],
    updateRequests: Array.isArray(updates?.requests) ? updates.requests : [],
    opsOverview,
    opsRuns: Array.isArray(opsRuns) ? opsRuns : [],
    opsEvents: Array.isArray(opsEvents) ? opsEvents : [],
    trackerStatus: trackerStatus || { error: "Tracker status unavailable." },
    trackerRuns: trackerRunsResult?.ok ? trackerRunsResult.runs : [],
    trackerRunsError: trackerRunsResult?.ok ? null : trackerRunsResult?.error || null,
    stats,
  };
}

const ADMIN_CONTEXT_CACHE_TTL_MS = 2500;
const ADMIN_CONTEXT_STALE_WAIT_MS = 900;
const adminContextCache = {
  value: null,
  refreshedAtMs: 0,
  refreshing: null,
  lastError: null,
};

function buildFallbackAdminContext(service, opsService, errorMessage = "") {
  return {
    generatedAt: new Date().toISOString(),
    liveStatus:
      typeof service.monitoring.getLiveMonitorStatus === "function"
        ? service.monitoring.getLiveMonitorStatus()
        : {
            monitor: {},
            integrations: {},
            mapperNameSync: {},
          },
    hook:
      typeof service.catalog.getHookStatus === "function"
        ? service.catalog.getHookStatus()
        : {
            latestRun: null,
            mapCount: 0,
            trackedCount: 0,
          },
    hookRuns: typeof service.catalog.getHookRuns === "function" ? service.catalog.getHookRuns(12) : [],
    projectClubs:
      typeof service.sources.getProjectClubs === "function"
        ? service.sources.getProjectClubs({ includeDisabled: true })
        : [],
    projectSources:
      typeof service.sources.getProjectSources === "function"
        ? service.sources.getProjectSources({ includeDisabled: true })
        : [],
    publicApiUsage: null,
    localStore:
      typeof service.maps.getMapLocalStoreStatus === "function" ? service.maps.getMapLocalStoreStatus() : null,
    namingSummary: {
      total: 0,
      matched: 0,
      unmatched: 0,
      pending: 0,
      pendingManualReview: 0,
      pendingMatched: 0,
      approved: 0,
      ignored: 0,
      requiresRegex: 0,
      manualNamed: 0,
    },
    unmatchedNamingPreview: [],
    updateRequests: [],
    opsOverview: opsService?.getOverview ? opsService.getOverview() : null,
    opsRuns: [],
    opsEvents: [],
    trackerStatus: { error: errorMessage || "Tracker status unavailable." },
    trackerRuns: [],
    trackerRunsError: errorMessage || null,
    stats: {
      total_maps: 0,
      actively_tracked: 0,
      total_wr_changes: 0,
      last_run_at: null,
    },
  };
}

function waitWithTimeout(promise, timeoutMs) {
  const safeMs = Math.max(0, Number(timeoutMs) || 0);
  if (!safeMs) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), safeMs).unref?.();
    }),
  ]);
}

async function getAdminContextCached(service, opsService) {
  const nowMs = Date.now();
  const cached = adminContextCache.value;
  if (cached && nowMs - adminContextCache.refreshedAtMs <= ADMIN_CONTEXT_CACHE_TTL_MS) {
    return cached;
  }

  if (!adminContextCache.refreshing) {
    adminContextCache.refreshing = (async () => {
      try {
        const fresh = await loadAdminContext(service, opsService);
        adminContextCache.value = fresh;
        adminContextCache.refreshedAtMs = Date.now();
        adminContextCache.lastError = null;
        return fresh;
      } catch (error) {
        adminContextCache.lastError = error?.message || String(error || "Failed loading admin context.");
        throw error;
      } finally {
        adminContextCache.refreshing = null;
      }
    })();
  }

  try {
    if (!cached) {
      return await adminContextCache.refreshing;
    }
    return await waitWithTimeout(adminContextCache.refreshing, ADMIN_CONTEXT_STALE_WAIT_MS);
  } catch (error) {
    if (adminContextCache.value) return adminContextCache.value;
    return buildFallbackAdminContext(
      service,
      opsService,
      adminContextCache.lastError || error?.message || "Admin context is unavailable."
    );
  }
}

export { buildCompatibilityReport, getAdminContextCached };
