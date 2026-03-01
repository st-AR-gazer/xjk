import express from "express";

function parseOptionalBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return undefined;
  const raw = String(value).trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return undefined;
}

function parseAccountIds(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[\s,;]+/)
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }
  return [];
}

function createAdminRoutes(service, { resolveLiveAuthContext = null } = {}) {
  const router = express.Router();

  async function getLiveAuthContext(req) {
    if (typeof resolveLiveAuthContext !== "function") return null;
    const resolved = await resolveLiveAuthContext(req);
    return resolved || null;
  }

  router.post("/maps/:mapUid/campaign", (req, res) => {
    const body = req.body || {};
    const result = service.updateMapCampaign({
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
    const result = await service.updateMapTracking({
      mapUid: req.params.mapUid,
      tracked,
      status: body.status,
      checkFrequency: body.checkFrequency !== undefined ? Number(body.checkFrequency) : undefined,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/tracker/run-now", async (_req, res) => {
    const result = await service.runTrackerNow();
    if (result.error) return res.status(502).json(result);
    return res.json(result);
  });

  router.post("/hook/altered/config", (req, res) => {
    const body = req.body || {};
    const result = service.updateHookConfig({
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
    const body =
      req.body?.snapshot && typeof req.body.snapshot === "object" ? req.body.snapshot : req.body;
    const result = await service.syncHookSnapshot(body || {});
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/hook/altered/maps/:mapUid/tracking", async (req, res) => {
    const body = req.body || {};
    const tracked = parseOptionalBoolean(body.tracked);
    const result = await service.updateMapTracking({
      mapUid: req.params.mapUid,
      tracked,
      status: body.status,
      checkFrequency: body.checkFrequency !== undefined ? Number(body.checkFrequency) : undefined,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/hook/altered/live/status", (_req, res) => {
    return res.json(service.getLiveMonitorStatus());
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
    const result = await service.fetchLiveClubStructure({
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
    const result = await service.syncLiveClubSnapshot({
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

  router.post("/hook/altered/live/monitor/config", (req, res) => {
    const body = req.body || {};
    const result = service.updateLiveMonitorConfig({
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
    const result = await service.runLiveMonitorCycle({
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
    const result = await service.runLiveDiscoveryCycle({
      reason: "manual-api-discovery",
      authContext,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/hook/altered/live/mapper-sync/status", (_req, res) => {
    return res.json({
      mapperNameSync: service.getMapperNameSyncStatus(),
    });
  });

  router.post("/hook/altered/live/mapper-sync/config", async (req, res) => {
    const body = req.body || {};
    const status = await service.updateMapperNameSyncConfig({
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
    const result = await service.runMapperNameSyncNow({
      priority: Boolean(parseOptionalBoolean(body.priority)),
      force: Boolean(parseOptionalBoolean(body.force)),
      reason: "manual-api",
    });
    if (result?.error) return res.status(400).json(result);
    return res.json({
      result,
      mapperNameSync: service.getMapperNameSyncStatus(),
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
    const result = await service.syncSpecificMapperAccountIds({
      accountIds,
      force: Boolean(parseOptionalBoolean(body.force)),
      reason: "manual-targeted-api",
    });
    if (result?.error) return res.status(400).json(result);
    return res.json({
      result,
      mapperNameSync: service.getMapperNameSyncStatus(),
    });
  });

  router.get("/alterations/campaigns/timeline", (req, res) => {
    const query = req.query || {};
    const payload = service.getCampaignTimeline({
      source: query.source,
      bucket: query.bucket,
      days: query.days !== undefined ? Number(query.days) : undefined,
      clubId: query.clubId !== undefined ? Number(query.clubId) : undefined,
    });
    return res.json(payload);
  });

  router.post("/naming/process", (req, res) => {
    const body = req.body || {};
    const result = service.processMapNameStandardization({
      q: body.q,
      limit: body.limit,
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/naming/candidates", (req, res) => {
    const query = req.query || {};
    const requiresRegex = parseOptionalBoolean(query.requiresRegex);
    const result = service.getMapNameStandardizationCandidates({
      q: query.q,
      automationState: query.automationState,
      reviewState: query.reviewState,
      requiresRegex:
        requiresRegex === undefined ? undefined : Boolean(requiresRegex),
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      offset: query.offset !== undefined ? Number(query.offset) : undefined,
    });
    return res.json(result);
  });

  router.post("/naming/candidates/:mapUid/review", (req, res) => {
    const body = req.body || {};
    const result = service.updateMapNameStandardizationCandidateReview({
      mapUid: req.params.mapUid,
      reviewState: body.reviewState,
      manualName: body.manualName,
      reviewNote: body.reviewNote,
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/update-requests", (req, res) => {
    const query = req.query || {};
    const result = service.listUpdateRequests({
      status: query.status,
      q: query.q,
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      offset: query.offset !== undefined ? Number(query.offset) : undefined,
    });
    return res.json(result);
  });

  router.post("/update-requests/:requestId/status", (req, res) => {
    const body = req.body || {};
    const result = service.updateUpdateRequestStatus({
      requestId: Number(req.params.requestId),
      status: body.status,
      resolutionNote: body.resolutionNote,
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  return router;
}

export { createAdminRoutes };
