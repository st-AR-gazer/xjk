import express from "express";

function createIngestRoutes(repository, { ingestToken = "" } = {}) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!ingestToken) return next();
    const supplied =
      req.headers["x-ingest-token"] ||
      req.headers["x-admin-token"] ||
      req.headers.authorization?.replace(/^Bearer\s+/i, "") ||
      "";
    if (String(supplied).trim() !== String(ingestToken).trim()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return next();
  });

  const handleIngest = (req, res) => {
    try {
      const result = repository.ingestTrackerRun(req.body || {});
      if (result?.error) {
        return res.status(400).json(result);
      }
      return res.json({
        ok: true,
        ingest: result,
      });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "Failed to ingest tracker payload.",
      });
    }
  };

  router.post("/tracker-run", handleIngest);
  router.post("/tracker-runs", handleIngest);

  router.post("/instance/register", (req, res) => {
    try {
      const result = repository.registerInstance(req.body || {});
      if (result?.error) return res.status(400).json(result);
      return res.json({ ok: true, registration: result });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "Failed to register tracker instance.",
      });
    }
  });

  router.post("/instance/heartbeat", (req, res) => {
    try {
      const result = repository.heartbeatInstance(req.body || {});
      if (result?.error) return res.status(400).json(result);
      return res.json({ ok: true, heartbeat: result });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "Failed to ingest tracker heartbeat.",
      });
    }
  });

  router.post("/display-names", (req, res) => {
    try {
      const result = repository.ingestDisplayNames(req.body || {});
      if (result?.error) return res.status(400).json(result);
      return res.json({ ok: true, ingest: result });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "Failed to ingest display-name payload.",
      });
    }
  });

  router.post("/club-snapshot", (req, res) => {
    try {
      const result = repository.ingestClubSnapshot(req.body || {});
      if (result?.error) return res.status(400).json(result);
      return res.json({ ok: true, ingest: result });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "Failed to ingest club snapshot payload.",
      });
    }
  });

  const handleEventsIngest = (req, res) => {
    try {
      const result = repository.ingestEvents(req.body || {});
      if (result?.error) return res.status(400).json(result);
      return res.json({ ok: true, ingest: result });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "Failed to ingest event payload.",
      });
    }
  };

  router.post("/event", handleEventsIngest);
  router.post("/events", handleEventsIngest);

  const handleTrafficIngest = (req, res) => {
    try {
      const result = repository.ingestTraffic(req.body || {});
      if (result?.error) return res.status(400).json(result);
      return res.json({ ok: true, ingest: result });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "Failed to ingest traffic payload.",
      });
    }
  };

  router.post("/traffic", handleTrafficIngest);
  router.post("/traffic/batch", handleTrafficIngest);

  return router;
}

export { createIngestRoutes };
