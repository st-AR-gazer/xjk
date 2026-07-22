import { parseAccountIds, parseOptionalBoolean } from "./routeUtils.js";

function registerMapSyncRoutes(router, { service, getLiveAuthContext = async () => null }) {
  router.post("/maps/:mapUid/campaign", async (req, res) => {
    const body = req.body || {};
    const result = await service.maps.updateMapCampaign({
      mapUid: req.params.mapUid,
      campaignName: body.campaignName,
      slot: body.slot,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/maps/:mapUid/tracking", async (req, res) => {
    const body = req.body || {};
    const tracked = parseOptionalBoolean(body.tracked);
    const result = await service.tracker.updateMapTracking({
      mapUid: req.params.mapUid,
      tracked,
      status: body.status,
      checkFrequency: body.checkFrequency !== undefined ? Number(body.checkFrequency) : undefined,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/tracker/run-now", async (_req, res) => {
    const result = await service.tracker.runTrackerNow();
    if (result.error) return res.status(502).json(result);
    return res.json(result);
  });

  router.get("/maps/local-store/summary", (_req, res) => {
    return res.json(service.maps.getMapLocalStoreStatus());
  });

  router.post("/maps/local-store/backfill", async (req, res) => {
    const body = req.body || {};
    const result = await service.maps.runMapLocalCopyBackfill({
      reason: "manual-admin",
      force: Boolean(parseOptionalBoolean(body.force)),
      retryErrorsOnly: Boolean(parseOptionalBoolean(body.retryErrorsOnly)),
      mapUids: parseAccountIds(body.mapUids ?? body.map_uids ?? body.uids),
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/maps/local-store/retry-errors", async (_req, res) => {
    const result = await service.maps.runMapLocalCopyBackfill({
      reason: "manual-admin-retry-errors",
      force: true,
      retryErrorsOnly: true,
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/hook/altered/config", (req, res) => {
    const body = req.body || {};
    const result = service.maps.updateHookConfig({
      hookKey: body.hookKey,
      clubId: body.clubId,
      clubName: body.clubName,
      sourceLabel: body.sourceLabel,
      enabled: parseOptionalBoolean(body.enabled),
      autoTrackNewMaps: parseOptionalBoolean(body.autoTrackNewMaps),
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/hook/altered/sync", async (req, res) => {
    const body = req.body?.snapshot && typeof req.body.snapshot === "object" ? req.body.snapshot : req.body;
    const result = await service.sources.syncHookSnapshot(body || {});
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/hook/altered/maps/:mapUid/tracking", async (req, res) => {
    const body = req.body || {};
    const tracked = parseOptionalBoolean(body.tracked);
    const result = await service.tracker.updateMapTracking({
      mapUid: req.params.mapUid,
      tracked,
      status: body.status,
      checkFrequency: body.checkFrequency !== undefined ? Number(body.checkFrequency) : undefined,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/hook/altered/live/status", (_req, res) => {
    return res.json(service.monitoring.getLiveMonitorStatus());
  });

  router.post("/hook/altered/live/fetch", async (req, res) => {
    const body = req.body || {};
    const summaryOnly = parseOptionalBoolean(body.summaryOnly);
    let authContext = null;
    try {
      authContext = await getLiveAuthContext(req);
    } catch (error) {
      return res.status(Number(error?.statusCode || 401)).json({
        error: error?.message || "Failed to resolve Ubisoft auth context.",
      });
    }
    const result = await service.monitoring.fetchLiveClubStructure({
      clubId: body.clubId,
      activityPageSize: body.activityPageSize ?? body.activityLength,
      activeOnly: parseOptionalBoolean(body.activeOnly),
      fetchMapDetails: parseOptionalBoolean(body.fetchMapDetails),
      summaryOnly: summaryOnly === undefined ? true : summaryOnly,
      authContext,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/hook/altered/live/sync", async (req, res) => {
    const body = req.body || {};
    let authContext = null;
    try {
      authContext = await getLiveAuthContext(req);
    } catch (error) {
      return res.status(Number(error?.statusCode || 401)).json({
        error: error?.message || "Failed to resolve Ubisoft auth context.",
      });
    }
    const result = await service.monitoring.syncLiveClubSnapshot({
      hookKey: body.hookKey,
      clubId: body.clubId,
      activityPageSize: body.activityPageSize ?? body.activityLength,
      activeOnly: parseOptionalBoolean(body.activeOnly),
      fetchMapDetails: parseOptionalBoolean(body.fetchMapDetails),
      sourceLabel: body.sourceLabel,
      note: body.note,
      authContext,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/sources/:sourceKey/sync", async (req, res) => {
    const body = req.body || {};
    let authContext = null;
    try {
      authContext = await getLiveAuthContext(req);
    } catch (error) {
      return res.status(Number(error?.statusCode || 401)).json({
        error: error?.message || "Failed to resolve Ubisoft auth context.",
      });
    }
    const result = await service.sources.syncProjectSourceByKey(req.params.sourceKey, {
      authContext,
      importLocalFiles:
        parseOptionalBoolean(body.importLocalFiles) === undefined
          ? true
          : Boolean(parseOptionalBoolean(body.importLocalFiles)),
      importRoots: Array.isArray(body.importRoots) ? body.importRoots : [],
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/hook/altered/live/monitor/config", (req, res) => {
    const body = req.body || {};
    const result = service.monitoring.updateLiveMonitorConfig({
      enabled: parseOptionalBoolean(body.enabled),
      discoveryEnabled: parseOptionalBoolean(body.discoveryEnabled),
      scheduleMode: body.scheduleMode,
      dailyHourUtc: body.dailyHourUtc,
      dailyMinuteUtc: body.dailyMinuteUtc,
      clubId: body.clubId,
      intervalSeconds: body.intervalSeconds,
      discoveryIntervalSeconds: body.discoveryIntervalSeconds,
      discoveryCampaignLimit: body.discoveryCampaignLimit,
      discoveryActivityPageSize: body.discoveryActivityPageSize,
      activityPageSize: body.activityPageSize,
      activeOnly: parseOptionalBoolean(body.activeOnly),
      fetchMapDetails: parseOptionalBoolean(body.fetchMapDetails),
      trackerChunkSize: body.trackerChunkSize,
    });
    return res.json(result);
  });

  router.post("/hook/altered/live/monitor/run", async (req, res) => {
    let authContext = null;
    try {
      authContext = await getLiveAuthContext(req);
    } catch (error) {
      return res.status(Number(error?.statusCode || 401)).json({
        error: error?.message || "Failed to resolve Ubisoft auth context.",
      });
    }
    const result = await service.monitoring.runLiveMonitorCycleDetached({
      reason: "manual-api",
      authContext,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/hook/altered/live/monitor/run-discovery", async (req, res) => {
    let authContext = null;
    try {
      authContext = await getLiveAuthContext(req);
    } catch (error) {
      return res.status(Number(error?.statusCode || 401)).json({
        error: error?.message || "Failed to resolve Ubisoft auth context.",
      });
    }
    const result = await service.monitoring.runLiveDiscoveryCycleDetached({
      reason: "manual-api-discovery",
      authContext,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/hook/altered/live/mapper-sync/status", (_req, res) => {
    return res.json({
      mapperNameSync: service.players.getMapperNameSyncStatus(),
    });
  });

  router.post("/hook/altered/live/mapper-sync/config", async (req, res) => {
    const body = req.body || {};
    const status = await service.players.updateMapperNameSyncConfig({
      enabled: parseOptionalBoolean(body.enabled),
      bootstrapIntervalSeconds: body.bootstrapIntervalSeconds,
      maintenanceIntervalSeconds: body.maintenanceIntervalSeconds,
      priorityIntervalSeconds: body.priorityIntervalSeconds,
      batchSize: body.batchSize,
      priorityBatchSize: body.priorityBatchSize,
      priorityTopLimit: body.priorityTopLimit,
      priorityRefreshSeconds: body.priorityRefreshSeconds,
      knownAccountsRefreshSeconds: body.knownAccountsRefreshSeconds,
      cacheTtlSeconds: body.cacheTtlSeconds,
      priorityCacheTtlSeconds: body.priorityCacheTtlSeconds,
      minRequestGapMs: body.minRequestGapMs,
      resetKnownAccountsCache: parseOptionalBoolean(body.resetKnownAccountsCache),
      resetPriorityAccountsCache: parseOptionalBoolean(body.resetPriorityAccountsCache),
    });
    return res.json({ mapperNameSync: status });
  });

  router.post("/hook/altered/live/mapper-sync/run", async (req, res) => {
    const body = req.body || {};
    const result = await service.players.runMapperNameSyncNow({
      priority: Boolean(parseOptionalBoolean(body.priority)),
      force: Boolean(parseOptionalBoolean(body.force)),
      reason: "manual-api",
    });
    if (result?.error) return res.status(400).json(result);
    return res.json({
      result,
      mapperNameSync: service.players.getMapperNameSyncStatus(),
    });
  });

  router.post("/hook/altered/live/mapper-sync/accounts", async (req, res) => {
    const body = req.body || {};
    const accountIds = parseAccountIds(body.accountIds);
    if (!accountIds.length) {
      return res.status(400).json({
        error: "Provide at least one account ID.",
      });
    }
    const result = await service.players.syncSpecificMapperAccountIds({
      accountIds,
      force: Boolean(parseOptionalBoolean(body.force)),
      reason: "manual-targeted-api",
    });
    if (result?.error) return res.status(400).json(result);
    return res.json({
      result,
      mapperNameSync: service.players.getMapperNameSyncStatus(),
    });
  });
}

export { registerMapSyncRoutes };
