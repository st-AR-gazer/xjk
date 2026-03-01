import express from "express";

function parseTrackedOnly(value) {
  const raw = String(value || "").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function createPublicRoutes(service) {
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

  router.get("/wr/latest", (req, res) => {
    const limit = Number(req.query.limit) || 24;
    const events = service.getWrFeed(limit);
    res.json({
      latest: events[0] || null,
      feed: events,
      count: events.length,
    });
  });

  router.get("/tracker/status", (_req, res) => {
    res.json(service.getTrackerStatus());
  });

  router.get("/tracker/runs", (req, res) => {
    const runs = service.getTrackerRuns(Number(req.query.limit) || 30);
    res.json({
      runs,
      count: runs.length,
    });
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
