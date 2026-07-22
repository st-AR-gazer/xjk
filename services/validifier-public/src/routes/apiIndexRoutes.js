import { sendSuccess, setPublicCacheHeaders } from "../httpResponses.js";
import { PUBLIC_TRACKS } from "../verificationModel.js";

export function registerApiIndexRoutes(app, { cacheTtlMs, configured, publicApiCatalog } = {}) {
  app.get(["/health", "/api/v1/health"], (_req, res) =>
    sendSuccess(res, {
      status: configured ? "ok" : "degraded",
      api_version: "v1",
      supported_tracks: [...PUBLIC_TRACKS],
      checked_at: new Date().toISOString(),
    })
  );

  app.get(["/api/v1", "/api/v1/"], (_req, res) => {
    setPublicCacheHeaders(res, cacheTtlMs, "miss");
    return sendSuccess(res, {
      api_version: "v1",
      docs_path: "/api/",
      endpoints: {
        endpoint_catalog: "/api/v1/endpoints",
        health: "/api/v1/health",
        live: "/api/v1/live?limit=1..500&mapLimit=1..50",
        record: "/api/v1/records/:recordId",
        record_verdicts: "/api/v1/records/:recordId/verdicts",
        map_verdicts:
          "/api/v1/maps/:mapUid/verdicts?track=replay|deep&limit=10..100&page=1..n&sort=rank_asc|rank_desc|updated_desc|record_asc&status=all|pass|fail|pending|unavailable|not_run",
        batch: "/api/v1/verdicts/batch",
        upload_map: "/api/v1/uploads/map?filename=<urlencoded>",
        upload_replay: "/api/v1/uploads/replay?filename=<urlencoded>",
        submit_replay: "/api/v1/submissions/replay",
      },
    });
  });

  app.get("/api/v1/endpoints", (_req, res) => {
    setPublicCacheHeaders(res, cacheTtlMs, "miss");
    return sendSuccess(res, publicApiCatalog);
  });
}
