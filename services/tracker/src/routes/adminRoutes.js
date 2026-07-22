import express from "express";

function createAdminRoutes(service, { adminAuth }) {
  const router = express.Router();

  if (!adminAuth) {
    throw new Error("createAdminRoutes requires adminAuth.");
  }

  router.get("/auth/status", (req, res) => {
    return res.json(adminAuth.getAuthStatus(req));
  });

  router.post("/auth/login", (req, res) => {
    const body = req.body || {};
    const result = adminAuth.login({
      username: body.username ?? body.user ?? body.email,
      password: body.password ?? body.pass,
      adminToken: body.adminToken ?? body.token,
      req,
      res,
    });
    if (!result.ok) {
      return res.status(result.statusCode || 401).json({ error: result.error || "Unauthorized" });
    }
    return res.json({
      ok: true,
      authenticated: true,
      authenticatedVia: result.authenticatedVia,
      user: result.user,
      session: result.session,
      mode: adminAuth.getModeSummary(),
    });
  });

  router.post("/auth/logout", (req, res) => {
    const result = adminAuth.logout({ req, res });
    return res.json(result);
  });

  router.use(adminAuth.requireAdminMiddleware());

  router.post("/maps/:mapUid/tracking", (req, res) => {
    const payload = req.body || {};
    const trackedValue = payload.tracked;
    const tracked =
      typeof trackedValue === "boolean"
        ? trackedValue
        : trackedValue === undefined
          ? undefined
          : String(trackedValue).toLowerCase() === "true";

    const result = service.updateMapTracking({
      mapUid: req.params.mapUid,
      tracked,
      status: payload.status,
      checkFrequency: payload.checkFrequency !== undefined ? Number(payload.checkFrequency) : undefined,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/maps/bulk-upsert", (req, res) => {
    const maps = Array.isArray(req.body) ? req.body : req.body?.maps;
    const result = service.bulkUpsertMaps({
      maps,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/players/names/bulk-upsert", (req, res) => {
    const players = Array.isArray(req.body) ? req.body : req.body?.players;
    const source = req.body?.source;
    const result = service.bulkUpsertPlayerNames({
      players,
      source,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/tracker/run-now", async (_req, res) => {
    try {
      const result = await service.runTrackerNow();
      if (result.error) return res.status(400).json(result);
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ error: error?.message || "Tracker run failed." });
    }
  });

  router.post("/tracker/config", (req, res) => {
    const body = req.body || {};
    const result = service.setTrackerConfig({
      enabled: body.enabled,
      tickSeconds: body.tickSeconds,
      batchSize: body.batchSize,
      maxCheckIntervalSeconds: body.maxCheckIntervalSeconds,
      leaderboardTopN: body.leaderboardTopN,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  return router;
}

export { createAdminRoutes };
