import { upstreamErrorStatus } from "./routeSupport.js";

function registerAlteredAction(router, alteredClient, { route, upstreamRoute, failureMessage }) {
  router.post(route, async (_req, res) => {
    try {
      const result = await alteredClient.request(upstreamRoute, {
        method: "POST",
        body: {},
        timeoutMs: 30000,
      });
      return res.json({ ok: true, generatedAt: new Date().toISOString(), result });
    } catch (error) {
      return res.status(upstreamErrorStatus(error)).json({ error: error?.message || failureMessage });
    }
  });
}

function registerAlteredRoutes(router, alteredClient) {
  registerAlteredAction(router, alteredClient, {
    route: "/altered/run-full-sync",
    upstreamRoute: "/api/v1/admin/hook/altered/live/monitor/run",
    failureMessage: "Failed to start altered full sync.",
  });
  registerAlteredAction(router, alteredClient, {
    route: "/altered/run-discovery-sync",
    upstreamRoute: "/api/v1/admin/hook/altered/live/monitor/run-discovery",
    failureMessage: "Failed to start altered discovery sync.",
  });
}

export { registerAlteredRoutes };
