import { readGlobalNadeoQueueSnapshot } from "../../../../shared/nadeoGlobalThrottle.js";
import { clampInt } from "../../../../shared/valueUtils.js";
import { normalizeStateFilePath } from "./routeSupport.js";

function registerDataRoutes(router, repository, { nadeoControl = {} } = {}) {
  const nadeoThrottleStateFile = normalizeStateFilePath(nadeoControl.throttleStateFile);
  const nadeoMinRequestGapMs = clampInt(nadeoControl.minRequestGapMs, {
    min: 0,
    max: 120000,
    fallback: 0,
  });

  router.get("/meta", (_req, res) => {
    const summary = repository.getMeta();
    const metrics = repository.getMetricsOverview();
    return res.json({ generatedAt: new Date().toISOString(), summary, metrics });
  });

  router.get("/traffic/overview", (req, res) => {
    const overview = repository.getTrafficOverview({
      windowHours: clampInt(req.query.window_hours, { min: 1, max: 24 * 90, fallback: 24 }),
      projectKey: req.query.project_key || "",
      service: req.query.service || "",
    });
    return res.json({ generatedAt: new Date().toISOString(), overview });
  });

  router.get("/traffic/timeseries", (req, res) => {
    const series = repository.getTrafficTimeseries({
      bucket: req.query.bucket || "hour",
      windowHours: clampInt(req.query.window_hours, { min: 1, max: 24 * 90, fallback: 24 }),
      projectKey: req.query.project_key || "",
      service: req.query.service || "",
    });
    return res.json({ generatedAt: new Date().toISOString(), series });
  });

  router.get("/traffic/top", (req, res) => {
    const top = repository.getTrafficTop({
      windowHours: clampInt(req.query.window_hours, { min: 1, max: 24 * 90, fallback: 24 }),
      projectKey: req.query.project_key || "",
      service: req.query.service || "",
      direction: req.query.direction || "outgoing",
      dimension: req.query.dimension || "",
      limit: clampInt(req.query.limit, { min: 1, max: 200, fallback: 20 }),
    });
    return res.json({ generatedAt: new Date().toISOString(), top });
  });

  router.get("/traffic/facets", (req, res) => {
    const facets = repository.getTrafficFacets({
      windowHours: clampInt(req.query.window_hours, { min: 1, max: 24 * 90, fallback: 24 }),
      projectKey: req.query.project_key || "",
    });
    return res.json({ generatedAt: new Date().toISOString(), facets });
  });

  router.get("/traffic/errors", (req, res) => {
    const errors = repository.getTrafficErrors({
      windowHours: clampInt(req.query.window_hours, { min: 1, max: 24 * 90, fallback: 24 }),
      projectKey: req.query.project_key || "",
      service: req.query.service || "",
      direction: req.query.direction || "",
      statusMin: clampInt(req.query.status_min, { min: 400, max: 599, fallback: 400 }),
      q: req.query.q || "",
      limit: clampInt(req.query.limit, { min: 1, max: 500, fallback: 50 }),
      page: clampInt(req.query.page, { min: 1, max: 100000, fallback: 1 }),
      offset: clampInt(req.query.offset, { min: 0, max: 100000000, fallback: 0 }),
    });
    return res.json({ generatedAt: new Date().toISOString(), errors });
  });

  router.get("/nadeo/queue", (req, res) => {
    const snapshot = readGlobalNadeoQueueSnapshot({
      stateFile: nadeoThrottleStateFile,
      minGapMs: nadeoMinRequestGapMs,
      maxItems: clampInt(req.query.limit, { min: 10, max: 500, fallback: 120 }),
    });
    return res.json({ generatedAt: new Date().toISOString(), queue: snapshot });
  });

  router.get("/nadeo/guardrail", (req, res) => {
    const guardrail = repository.getNadeoGuardrailSnapshot({
      windowHours: clampInt(req.query.window_hours, { min: 1, max: 24 * 90, fallback: 24 }),
      projectKey: req.query.project_key || "",
      service: req.query.service || "",
    });
    const queue = readGlobalNadeoQueueSnapshot({
      stateFile: nadeoThrottleStateFile,
      minGapMs: nadeoMinRequestGapMs,
      maxItems: 20,
    });
    return res.json({
      generatedAt: new Date().toISOString(),
      guardrail: {
        ...guardrail,
        queue: {
          configured: queue.configured,
          pendingCount: queue.pendingCount,
          activeWaiterId: queue.activeWaiterId || null,
          lastGrantedAt: queue.lastGrantedAt || null,
          lastRequestAt: queue.lastRequestAt || null,
          secondsSinceLastRequest: queue.secondsSinceLastRequest,
          minGapMs: queue.minGapMs,
        },
      },
    });
  });

  router.get("/projects", (req, res) => {
    const projects = repository.listProjects({
      limit: clampInt(req.query.limit, { min: 1, max: 500, fallback: 120 }),
    });
    return res.json({ generatedAt: new Date().toISOString(), projects, count: projects.length });
  });

  router.get("/altered/summary", (req, res) => {
    const summary = repository.getAlteredDashboardSummary({
      syncRunsLimit: clampInt(req.query.sync_runs_limit, { min: 1, max: 100, fallback: 12 }),
      pollRunsLimit: clampInt(req.query.poll_runs_limit, { min: 1, max: 100, fallback: 20 }),
    });
    return res.json({ generatedAt: new Date().toISOString(), ...summary });
  });

  router.get("/altered/check-history", (req, res) => {
    const q = String(req.query.q || "")
      .trim()
      .toLowerCase();
    const mapUid = String(req.query.map_uid || "").trim();
    const limit = clampInt(req.query.limit, { min: 1, max: 500, fallback: 120 });
    const events = repository.getAlteredCheckHistory({ q, mapUid, limit });
    return res.json({
      generatedAt: new Date().toISOString(),
      events,
      count: events.length,
      source: "database",
    });
  });
}

export { registerDataRoutes };
