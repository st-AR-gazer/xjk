import express from "express";

import { registerDashboardRoutes } from "./admin/dashboardRoutes.js";
import { registerMapSyncRoutes } from "./admin/mapSyncRoutes.js";
import { registerMapWorkspaceRoutes } from "./admin/mapWorkspaceRoutes.js";
import { registerNamingRoutes } from "./admin/namingRoutes.js";
import { registerSummaryRoutes } from "./admin/summaryRoutes.js";

function createAdminRoutes(service, { resolveLiveAuthContext = null, opsService = null } = {}) {
  const router = express.Router();

  async function getLiveAuthContext(req) {
    if (typeof resolveLiveAuthContext !== "function") return null;
    const resolved = await resolveLiveAuthContext(req);
    return resolved || null;
  }

  registerDashboardRoutes(router, { service, opsService });
  registerMapWorkspaceRoutes(router, { service, opsService });
  registerSummaryRoutes(router, { service, opsService, getLiveAuthContext });
  registerMapSyncRoutes(router, { service, getLiveAuthContext });
  registerNamingRoutes(router, { service });

  return router;
}

export { createAdminRoutes };
