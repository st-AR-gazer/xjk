import express from "express";

function parseTrackedOnly(value) {
  const raw = String(value || "").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function parseAccountIds(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[\s,;]+/)
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }
  return [];
}

function createPublicRoutes(service, { realtimeHub = null } = {}) {
  const router = express.Router();

  router.get("/meta", (_req, res) => {
    res.json(service.getMeta());
  });

  router.get("/dashboard", (_req, res) => {
    const payload = service.getDashboard();
    res.json(payload);
  });

  router.get("/maps", (req, res) => {
    const maps = service.getMaps({
      campaign: req.query.campaign || "all",
      q: req.query.q || "",
      trackedOnly: parseTrackedOnly(req.query.tracked_only),
      sort: req.query.sort || "wr_recent",
      limit: Number(req.query.limit) || 800,
    });
    res.json({ maps, count: maps.length });
  });

  router.get("/maps/tracked", (req, res) => {
    const maps = service.getTrackedMaps({
      q: req.query.q || "",
      limit: Number(req.query.limit) || 250,
    });
    res.json({ maps, count: maps.length });
  });

  router.get("/tracked/maps", (req, res) => {
    const maps = service.getTrackedMapsApi({
      q: req.query.q || "",
      limit: Number(req.query.limit) || 250,
    });
    res.json({ maps, count: maps.length });
  });

  router.get("/maps/info/:mapUid", (req, res) => {
    const payload = service.getMapInfo(req.params.mapUid);
    res.json(payload);
  });

  router.get("/leaderboards/medals", (req, res) => {
    const trackedOnly =
      req.query.tracked_only === undefined ? true : parseTrackedOnly(req.query.tracked_only);
    const payload = service.getMedalLeaderboards({
      limit: Number(req.query.limit) || 50,
      trackedOnly,
    });
    res.json(payload);
  });

  router.get("/leaderboards/wrs", (req, res) => {
    const trackedOnly =
      req.query.tracked_only === undefined ? true : parseTrackedOnly(req.query.tracked_only);
    const payload = service.getLeaderboardWrLeaderboards({
      overallLimit: Number(req.query.overall_limit ?? req.query.overallLimit) || 300,
      overallOffset: Number(req.query.overall_offset ?? req.query.overallOffset) || 0,
      perBucketLimit: Number(req.query.per_bucket_limit ?? req.query.perBucketLimit) || 10,
      trackedOnly,
      includeBuckets:
        req.query.include_buckets === undefined && req.query.includeBuckets === undefined
          ? true
          : parseTrackedOnly(req.query.include_buckets ?? req.query.includeBuckets),
    });
    res.json(payload);
  });

  router.get("/players/top-accounts", (req, res) => {
    const trackedOnly =
      req.query.tracked_only === undefined ? true : parseTrackedOnly(req.query.tracked_only);
    const accounts = service.getTopWrAccounts({
      limit: Number(req.query.limit) || 200,
      trackedOnly,
    });
    res.json({
      accounts,
      count: accounts.length,
      trackedOnly,
      sampledAt: new Date().toISOString(),
    });
  });

  router.get("/leaderboards/coverage", (req, res) => {
    const trackedOnly =
      req.query.tracked_only === undefined ? true : parseTrackedOnly(req.query.tracked_only);
    const coverage = service.getLeaderboardCoverage({
      trackedOnly,
    });
    res.json({
      coverage,
      sampledAt: new Date().toISOString(),
    });
  });

  router.get("/players/names", (req, res) => {
    const query = req.query || {};
    const accountIds = parseAccountIds(query.accountId || query["accountId[]"]);
    const payload = service.getPlayerNamesByAccountIds({
      accountIds,
      limit: Number(query.limit) || 200,
    });
    res.json(payload);
  });

  router.get("/wr/latest", (req, res) => {
    const limit = Number(req.query.limit) || 24;
    const trackerStatus = service.getTrackerStatus();
    const mode = String(trackerStatus?.runtime?.mode || "wr");
    const events =
      mode === "leaderboard" ? service.getLeaderboardFeed(limit) : service.getWrFeed(limit);
    res.json({
      latest: events[0] || null,
      feed: events,
      count: events.length,
    });
  });

  router.get("/leaderboard/latest", (req, res) => {
    const limit = Number(req.query.limit) || 24;
    const events = service.getLeaderboardFeed(limit);
    res.json({
      latest: events[0] || null,
      feed: events,
      count: events.length,
    });
  });

  router.get("/tracker/status", (_req, res) => {
    res.json(service.getTrackerStatus());
  });

  router.get("/status", (_req, res) => {
    res.json(service.getTrackerStatus());
  });

  router.get("/tracker/runs", (req, res) => {
    const runs = service.getTrackerRuns(Number(req.query.limit) || 30);
    res.json({
      runs,
      count: runs.length,
    });
  });

  router.get("/stream", (req, res) => {
    if (!realtimeHub) {
      return res.status(503).json({
        error: "Realtime stream is not available.",
      });
    }
    realtimeHub.connect(req, res);
    return undefined;
  });

  router.get("/shared/about", (_req, res) => {
    const meta = service.getMeta();
    res.json({
      service: meta.service,
      generatedAt: meta.generatedAt,
      tracker: meta.tracker,
    });
  });

  router.get("/shared/total-tracked", (_req, res) => {
    const status = service.getTrackerStatus();
    res.json({
      trackedMaps: status?.summary?.trackedMaps || 0,
      campaigns: status?.summary?.campaignCount || 0,
      latestWrAt: status?.summary?.latestWrAt || null,
    });
  });

  router.get("/shared/tracked/maps", (req, res) => {
    const maps = service.getTrackedMapsApi({
      q: req.query.q || "",
      limit: Number(req.query.limit) || 250,
    });
    res.json({ maps, count: maps.length });
  });

  return router;
}

export { createPublicRoutes };
