import { clampInt, normalizeIso, parseOptionalBoolean, parseSimilarityWeightProfile, toText } from "./routeUtils.js";

function registerMapWorkspaceRoutes(router, { service, opsService = null }) {
  router.get("/maps/workspace", (req, res) => {
    const query = req.query || {};
    const view = toText(query.view, "inventory").toLowerCase();
    const page = clampInt(query.page, { min: 1, max: 50000, fallback: 1 });
    const minPageSize = view === "naming" ? 5 : 10;
    const fallbackPageSize = view === "naming" ? 5 : 50;
    const pageSize = clampInt(query.pageSize, {
      min: minPageSize,
      max: 200,
      fallback: fallbackPageSize,
    });
    const offset = (page - 1) * pageSize;

    if (view === "inventory") {
      const tracked = parseOptionalBoolean(query.tracked);
      const result = service.catalog.getAdminMapsWorkspace({
        q: query.q,
        campaign: query.campaign,
        tracked,
        status: query.status,
        staleState: query.staleState,
        page,
        pageSize,
      });
      const campaignPayload = service.catalog.getAlterationsCampaigns({ limit: 5000, offset: 0 });
      const opsMaps = opsService?.listMonitoredMaps ? opsService.listMonitoredMaps({ limit: 5000 }) : [];
      const opsMapByUid = new Map();
      (Array.isArray(opsMaps) ? opsMaps : []).forEach((item) => {
        const key = toText(item?.mapUid);
        if (!key || opsMapByUid.has(key)) return;
        opsMapByUid.set(key, item);
      });
      const rows = (Array.isArray(result.maps) ? result.maps : []).map((map) => {
        const checkedAtMs = Date.parse(map.lastCheckedAt || "");
        const isFresh = Number.isFinite(checkedAtMs) && checkedAtMs > Date.now() - 24 * 60 * 60 * 1000;
        const opsMap = opsMapByUid.get(toText(map.uid)) || null;
        return {
          mapUid: toText(map.uid),
          mapName: toText(map.name) || toText(map.uid),
          campaignName: toText(map.campaign, "Unassigned") || "Unassigned",
          slot: Number(map.slot || 0) || null,
          tracked: Boolean(map.tracked),
          status: toText(map.status, "live") || "live",
          lastCheckedAt: normalizeIso(map.lastCheckedAt),
          lastWrChangeAt: normalizeIso(map.wrUpdatedAt),
          hookTracked: true,
          namingReviewState: null,
          updateRequestState: null,
          staleState: opsMap?.lastError ? "error" : map.lastCheckedAt ? (isFresh ? "fresh" : "stale") : "stale",
          detail: {
            ...map,
            opsMonitorUserId: Number(opsMap?.userId || 0) || null,
            opsMonitorUserEmail: toText(opsMap?.userEmail) || null,
            opsLastError: toText(opsMap?.lastError) || null,
          },
        };
      });
      return res.json({
        generatedAt: new Date().toISOString(),
        view,
        page,
        pageSize,
        total: Number(result.total || 0),
        pageCount: Number(result.pageCount || 1),
        hasMore: Boolean(result.hasMore),
        filters: {
          q: toText(query.q),
          campaign: toText(query.campaign),
          tracked,
          status: toText(query.status),
          staleState: toText(query.staleState),
        },
        filterOptions: {
          campaigns: Array.isArray(campaignPayload.campaigns) ? campaignPayload.campaigns : [],
        },
        rows,
      });
    }

    if (view === "campaigns") {
      const payload = service.catalog.getAlterationsCampaigns({ limit: 5000, offset: 0 });
      const rows = Array.isArray(payload.campaigns) ? payload.campaigns : [];
      const pageRows = rows.slice(offset, offset + pageSize);
      const hasMore = offset + pageRows.length < rows.length;
      return res.json({
        generatedAt: new Date().toISOString(),
        view,
        page,
        pageSize,
        total: rows.length,
        pageCount: Math.max(1, Math.ceil(rows.length / pageSize)),
        hasMore,
        rows: pageRows,
      });
    }

    if (view === "naming") {
      const requiresRegex = parseOptionalBoolean(query.requiresRegex);
      const payload = service.maps.getMapNameStandardizationCandidates({
        q: query.q,
        automationState: query.automationState,
        reviewState: query.reviewState,
        requiresRegex: requiresRegex === undefined ? undefined : Boolean(requiresRegex),
        limit: pageSize,
        offset,
      });
      const unfilteredTotal = Number(payload.summary?.total || 0);
      const total = payload.filteredTotal !== undefined ? Number(payload.filteredTotal) : unfilteredTotal;
      return res.json({
        generatedAt: new Date().toISOString(),
        view,
        page,
        pageSize,
        total,
        unfilteredTotal,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
        hasMore: offset + Number(payload.candidates?.length || 0) < total,
        filters: {
          q: toText(query.q),
          automationState: toText(query.automationState),
          reviewState: toText(query.reviewState),
          requiresRegex,
        },
        summary: payload.summary,
        rows: Array.isArray(payload.candidates) ? payload.candidates : [],
      });
    }

    if (view === "requests") {
      const payload = service.catalog.listUpdateRequests({
        status: query.status,
        q: query.q,
        limit: 5000,
        offset: 0,
      });
      const rows = Array.isArray(payload.requests) ? payload.requests : [];
      const pageRows = rows.slice(offset, offset + pageSize);
      const hasMore = offset + pageRows.length < rows.length;
      return res.json({
        generatedAt: new Date().toISOString(),
        view,
        page,
        pageSize,
        total: rows.length,
        pageCount: Math.max(1, Math.ceil(rows.length / pageSize)),
        hasMore,
        filters: {
          q: toText(query.q),
          status: toText(query.status),
        },
        rows: pageRows,
      });
    }

    if (view === "weights") {
      const payload = service.maps.getSimilarityWeightWorkspace();
      const scopedRules = Array.isArray(payload.scopedRules) ? payload.scopedRules : [];
      const campaignOverrides = Array.isArray(payload.campaignOverrides) ? payload.campaignOverrides : [];
      return res.json({
        generatedAt: payload.generatedAt || new Date().toISOString(),
        view,
        page: 1,
        pageSize,
        total: scopedRules.length + campaignOverrides.length,
        pageCount: 1,
        hasMore: false,
        defaults: payload.defaults || parseSimilarityWeightProfile({}),
        scopedRules,
        campaignOverrides,
        alterations: Array.isArray(payload.alterations) ? payload.alterations : [],
        alterationRegexLibrary:
          payload.alterationRegexLibrary && typeof payload.alterationRegexLibrary === "object"
            ? payload.alterationRegexLibrary
            : {},
        alterationRegexBehavior:
          payload.alterationRegexBehavior && typeof payload.alterationRegexBehavior === "object"
            ? payload.alterationRegexBehavior
            : {},
      });
    }

    return res.status(400).json({ error: "Unsupported workspace view." });
  });

  router.post("/similarity-weight-rules", (req, res) => {
    const body = req.body || {};
    const result = service.maps.updateSimilarityWeightRule({
      ruleId: body.ruleId,
      sourceKey: body.sourceKey,
      season: body.season,
      seasonYear: body.seasonYear,
      environment: body.environment,
      alterationSlug: body.alterationSlug,
      weights: parseSimilarityWeightProfile(body.weights ?? body.weightProfile ?? body.profile ?? body),
    });
    if (result?.error) return res.status(400).json(result);
    return res.json({
      ...result,
      workspace: service.maps.getSimilarityWeightWorkspace(),
    });
  });

  router.post("/similarity-weight-rules/:ruleId/delete", (req, res) => {
    const result = service.maps.deleteSimilarityWeightRule({
      ruleId: req.params.ruleId,
    });
    if (result?.error) return res.status(400).json(result);
    return res.json({
      ...result,
      workspace: service.maps.getSimilarityWeightWorkspace(),
    });
  });

  router.post("/similarity-weight-campaign-overrides", (req, res) => {
    const body = req.body || {};
    const result = service.maps.updateSimilarityCampaignWeightOverride({
      campaignId: body.campaignId,
      weights: parseSimilarityWeightProfile(body.weights ?? body.weightProfile ?? body.profile ?? body),
    });
    if (result?.error) return res.status(400).json(result);
    return res.json({
      ...result,
      workspace: service.maps.getSimilarityWeightWorkspace(),
    });
  });

  router.post("/similarity-weight-campaign-overrides/:campaignId/delete", (req, res) => {
    const result = service.maps.deleteSimilarityCampaignWeightOverride({
      campaignId: req.params.campaignId,
    });
    if (result?.error) return res.status(400).json(result);
    return res.json({
      ...result,
      workspace: service.maps.getSimilarityWeightWorkspace(),
    });
  });
}

export { registerMapWorkspaceRoutes };
