import express from "express";

import { createAlteredClient } from "./privateDash/alteredClient.js";
import { normalizeLogDir } from "./privateDash/logFiles.js";
import { registerAlteredRoutes } from "./privateDash/registerAlteredRoutes.js";
import { registerDataRoutes } from "./privateDash/registerDataRoutes.js";
import { registerLogRoutes } from "./privateDash/registerLogRoutes.js";
import { registerTrackerRoutes } from "./privateDash/registerTrackerRoutes.js";
import { createTrackerController } from "./privateDash/trackerControl.js";

function disableResponseCaching(_req, res, next) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
}

function createPrivateDashRoutes(
  repository,
  { trackerControl = {}, alteredControl = {}, logsControl = {}, nadeoControl = {} } = {}
) {
  const router = express.Router();
  const logDir = normalizeLogDir(logsControl?.logDir);
  const trackerController = createTrackerController({ ...trackerControl, logDir });
  const alteredClient = createAlteredClient(alteredControl || {});

  router.use(disableResponseCaching);
  registerDataRoutes(router, repository, { nadeoControl: nadeoControl || {} });
  registerAlteredRoutes(router, alteredClient);
  registerTrackerRoutes(router, repository, trackerController);
  registerLogRoutes(router, { logDir });
  return router;
}

export { createPrivateDashRoutes };
