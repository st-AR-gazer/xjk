import express from "express";

function parseBool(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function createPublicRoutes(repository) {
  const router = express.Router();

  router.get("/meta", (_req, res) => {
    res.json({
      service: "tracker-aggregator",
      generatedAt: new Date().toISOString(),
      summary: repository.getMeta(),
    });
  });

  router.get("/metrics/overview", (_req, res) => {
    const metrics = repository.getMetricsOverview();
    res.json({
      generatedAt: new Date().toISOString(),
      metrics,
    });
  });

  router.get("/metrics/timeseries", (req, res) => {
    const series = repository.getMetricsTimeseries({
      bucket: req.query.bucket || "hour",
      windowHours: Number(req.query.window_hours) || 168,
      projectKey: req.query.project_key || "",
    });
    res.json({
      generatedAt: new Date().toISOString(),
      series,
    });
  });

  router.get("/db/tables", (req, res) => {
    const includeCounts = parseBool(req.query.include_counts) || String(req.query.include_counts || "") === "";
    const tables = repository.listDataTables({ includeCounts });
    res.json({
      tables,
      count: tables.length,
    });
  });

  router.get("/db/tables/:table/schema", (req, res) => {
    const schema = repository.getTableSchema(req.params.table);
    if (!schema) return res.status(404).json({ error: "Table not found." });
    return res.json({ schema });
  });

  router.get("/db/tables/:table/rows", (req, res) => {
    const data = repository.getTableRows(req.params.table, {
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
      sortBy: req.query.sort_by || "",
      sortDir: req.query.sort_dir || "desc",
    });
    if (!data) return res.status(404).json({ error: "Table not found." });
    return res.json(data);
  });

  router.get("/projects", (req, res) => {
    const projects = repository.listProjects({
      limit: Number(req.query.limit) || 120,
    });
    res.json({
      projects,
      count: projects.length,
    });
  });

  router.get("/projects/:projectKey", (req, res) => {
    const project = repository.getProject(req.params.projectKey);
    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }
    return res.json({ project });
  });

  router.get("/projects/:projectKey/maps", (req, res) => {
    const maps = repository.getProjectMaps(req.params.projectKey, {
      q: req.query.q || "",
      changedOnly: parseBool(req.query.changed_only),
      limit: Number(req.query.limit) || 500,
    });
    return res.json({
      maps,
      count: maps.length,
    });
  });

  router.get("/projects/:projectKey/instances", (req, res) => {
    const instances = repository.listProjectInstances(req.params.projectKey, {
      limit: Number(req.query.limit) || 120,
    });
    return res.json({
      instances,
      count: instances.length,
    });
  });

  router.get("/maps/:mapUid/projects", (req, res) => {
    const projects = repository.getMapProjects(req.params.mapUid, {
      limit: Number(req.query.limit) || 120,
    });
    return res.json({
      mapUid: req.params.mapUid,
      projects,
      count: projects.length,
    });
  });

  router.get("/events/facets", (req, res) => {
    const facets = repository.getEventFacets({
      projectKey: req.query.project_key || "",
      includeSystem: parseBool(req.query.include_system),
      fromIso: req.query.from_iso || "",
      toIso: req.query.to_iso || "",
    });
    return res.json(facets);
  });

  router.get("/queue/wr-baseline", (req, res) => {
    const payload = repository.getWrBaselineQueue({
      limit: Number(req.query.limit) || 100,
      offset: Number(req.query.offset) || 0,
      page: Number(req.query.page) || 1,
      status: req.query.status || "queued",
      projectKey: req.query.project_key || "",
      q: req.query.q || "",
    });
    return res.json(payload);
  });

  router.get("/events/recent", (req, res) => {
    const payload = repository.getRecentEvents({
      limit: Number(req.query.limit) || 80,
      offset: Number(req.query.offset) || 0,
      page: Number(req.query.page) || 1,
      projectKey: req.query.project_key || "",
      changedOnly: parseBool(req.query.changed_only),
      includeSystem: parseBool(req.query.include_system),
      source: req.query.source || "",
      eventType: req.query.event_type || "",
      fromIso: req.query.from_iso || "",
      toIso: req.query.to_iso || "",
      q: req.query.q || "",
    });
    return res.json(payload);
  });

  router.get("/display-names", (req, res) => {
    const query = req.query || {};
    const accountIds = []
      .concat(query.accountId || [])
      .concat(query.accountIds || [])
      .flatMap((value) =>
        Array.isArray(value)
          ? value
          : String(value || "")
              .split(/[\s,;]+/)
              .filter(Boolean)
      );
    const rows = repository.getDisplayNames({
      accountIds,
      q: query.q || "",
      limit: Number(query.limit) || 200,
      maxAgeSeconds: Number(query.max_age_seconds) || 0,
    });
    return res.json({
      names: rows,
      count: rows.length,
    });
  });

  router.get("/display-names/candidates", (req, res) => {
    const accountIds = repository.listDisplayNameCandidates({
      staleAfterSeconds: Number(req.query.stale_after_seconds) || 86400,
      limit: Number(req.query.limit) || 200,
    });
    return res.json({
      accountIds,
      count: accountIds.length,
    });
  });

  router.get("/clubs/:clubId/summary", (req, res) => {
    const summary = repository.getClubSummary(req.params.clubId);
    if (!summary) return res.status(404).json({ error: "Club not found." });
    return res.json({ summary });
  });

  router.get("/clubs/:clubId/campaigns", (req, res) => {
    const campaigns = repository.getClubCampaigns(req.params.clubId, {
      limit: Number(req.query.limit) || 200,
    });
    return res.json({
      campaigns,
      count: campaigns.length,
    });
  });

  router.get("/clubs/:clubId/maps", (req, res) => {
    const maps = repository.getClubMaps(req.params.clubId, {
      q: req.query.q || "",
      limit: Number(req.query.limit) || 500,
    });
    return res.json({
      maps,
      count: maps.length,
    });
  });

  router.get("/clubs/:clubId/members", (req, res) => {
    const members = repository.getClubMembers(req.params.clubId, {
      q: req.query.q || "",
      limit: Number(req.query.limit) || 200,
    });
    return res.json({
      members,
      count: members.length,
    });
  });

  return router;
}

export { createPublicRoutes };
