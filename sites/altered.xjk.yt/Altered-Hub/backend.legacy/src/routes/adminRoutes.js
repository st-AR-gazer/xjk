import express from "express";

function createAdminRoutes(service, { adminToken }) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!adminToken) return next();
    const token =
      req.headers["x-admin-token"] ||
      req.headers.authorization?.replace(/^Bearer\s+/i, "") ||
      "";
    if (String(token).trim() !== String(adminToken).trim()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return next();
  });

  router.post("/maps/:mapUid/campaign", (req, res) => {
    const { campaignName, slot, clubId } = req.body || {};
    const result = service.updateMapCampaign({
      mapUid: req.params.mapUid,
      campaignName,
      slot,
      clubId,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

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
      checkFrequency:
        payload.checkFrequency !== undefined ? Number(payload.checkFrequency) : undefined,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/wr/simulate", (req, res) => {
    const result = service.simulateWr({
      mapUid: req.body?.mapUid || "",
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

  return router;
}

export { createAdminRoutes };
