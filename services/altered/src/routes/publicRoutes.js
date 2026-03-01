import express from "express";

function createPublicRoutes(service, { wrWebhookSecret = "" } = {}) {
  const router = express.Router();
  const safeWrWebhookSecret = String(wrWebhookSecret || "").trim();

  router.get("/dashboard", async (_req, res) => {
    const payload = await service.getDashboard();
    return res.json(payload);
  });

  router.get("/latest-wr", (_req, res) => {
    const payload = service.getLatestWr({
      includeRecent: true,
      limit: 24,
    });
    return res.json(payload);
  });

  router.post("/webhook/wr", (req, res) => {
    if (!safeWrWebhookSecret) {
      return res.status(503).json({
        error: "WR webhook is not configured on this service.",
      });
    }

    const secret = String(req.headers["x-webhook-secret"] || "").trim();
    if (!secret || secret !== safeWrWebhookSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = req.body || {};
    const result = service.receiveWrWebhook({
      mapUid: body.mapUid ?? body.uid ?? body.map_uid,
      mapName: body.mapName ?? body.name ?? body.map_name,
      holder: body.holder ?? body.wrHolder ?? body.displayName,
      wrMs: body.wrMs ?? body.wr_ms ?? body.recordTime,
      recordedAt: body.recordedAt ?? body.at ?? body.timestamp,
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/maps/info/:mapUid", (req, res) => {
    const payload = service.getMapInfo(req.params.mapUid);
    return res.json(payload);
  });

  router.get("/hook/altered", (_req, res) => {
    const hook = service.getHookStatus();
    if (!hook) return res.status(404).json({ error: "Altered hook not configured." });
    return res.json({ hook });
  });

  router.get("/hook/altered/maps", (req, res) => {
    const maps = service.getHookMaps({
      q: req.query.q || "",
      limit: Number(req.query.limit) || 1200,
    });
    return res.json({ maps, count: maps.length });
  });

  router.get("/hook/altered/runs", (req, res) => {
    const runs = service.getHookRuns(Number(req.query.limit) || 30);
    return res.json({ runs, count: runs.length });
  });

  router.get("/tracker/status", async (_req, res) => {
    const payload = await service.getTrackerStatus();
    if (payload?.error) {
      return res.status(502).json({ error: payload.error });
    }
    return res.json(payload);
  });

  router.get("/alterations/stats", async (_req, res) => {
    const payload = await service.getAlterationsStats();
    return res.json(payload);
  });

  router.get("/alterations/maps", async (_req, res) => {
    const query = _req.query || {};
    const payload = await service.getAlterationsMaps({
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
    });
    return res.json(payload);
  });

  router.get("/alterations/campaigns", (req, res) => {
    const query = req.query || {};
    const payload = service.getAlterationsCampaigns({
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
    });
    return res.json(payload);
  });

  router.get("/alterations/uploads", (req, res) => {
    const query = req.query || {};
    const payload = service.getAlterationsUploads({
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
    });
    return res.json(payload);
  });

  router.get("/alterations/leaderboards", async (req, res) => {
    const query = req.query || {};
    const payload = await service.getAlterationsLeaderboards({
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      overallLimit: query.overallLimit !== undefined ? Number(query.overallLimit) : undefined,
      perBucketLimit:
        query.perBucketLimit !== undefined ? Number(query.perBucketLimit) : undefined,
    });
    return res.json(payload);
  });

  router.get("/alterations/leaderboards/live", async (req, res) => {
    const query = req.query || {};
    const payload = await service.getMonitorLeaderboardLive({
      leaderboardLimit: query.limit !== undefined ? Number(query.limit) : undefined,
      feedLimit: query.feedLimit !== undefined ? Number(query.feedLimit) : undefined,
    });
    return res.json(payload);
  });

  router.post("/request-update", async (req, res) => {
    const body = req.body || {};
    const result = await service.submitUpdateRequest({
      uid: body.uid ?? body.mapUid ?? body.map_uid,
      name: body.name ?? body.mapName ?? body.map_name,
      reason: body.reason,
      requesterIp: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
      requesterUserAgent: req.headers["user-agent"] || "",
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  return router;
}

export { createPublicRoutes };
