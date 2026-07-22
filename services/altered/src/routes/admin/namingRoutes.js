import {
  parseAccountIds,
  parseIntegerValues,
  parseOptionalBoolean,
  parseOptionalClubId,
  parseSimilarityWeightProfile,
  resolveNamingSimilarityClubId,
} from "./routeUtils.js";

function registerNamingRoutes(router, { service }) {
  router.get("/alterations/campaigns/timeline", (req, res) => {
    const query = req.query || {};
    const payload = service.catalog.getCampaignTimeline({
      source: query.source,
      bucket: query.bucket,
      days: query.days !== undefined ? Number(query.days) : undefined,
      clubId: query.clubId !== undefined ? Number(query.clubId) : undefined,
    });
    return res.json(payload);
  });

  router.post("/naming/process", (req, res) => {
    const body = req.body || {};
    const result = service.maps.processMapNameStandardization({
      q: body.q,
      limit: body.limit,
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/naming/backfill", (req, res) => {
    const body = req.body || {};
    const result = service.maps.assignStoredMapMetadata({
      q: body.q,
      limit: body.limit !== undefined ? Number(body.limit) : 120000,
      mapUids: parseAccountIds(body.mapUids ?? body.map_uids ?? body.uids),
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/naming/similarity/backfill/status", (_req, res) => {
    return res.json(service.maps.getNamingSimilarityBackfillStatus());
  });

  router.post("/naming/similarity/backfill/cancel", (req, res) => {
    const body = req.body || {};
    const result = service.maps.cancelNamingSimilarityBackfill({
      reason: body.reason,
    });
    return res.status(result?.canceled ? 202 : 200).json(result);
  });

  router.post("/naming/similarity/backfill/start", (req, res) => {
    const body = req.body || {};
    const requestedMapUids = parseAccountIds(body.mapUids ?? body.map_uids ?? body.uids);
    const requestedClubId = parseOptionalClubId(body.clubId);
    const sourceKey = body.sourceKey ?? body.source_key;
    const campaignName = body.campaignName ?? body.campaign_name ?? "";
    const result = service.maps.startNamingSimilarityBackfill({
      q: body.q,
      limit: body.limit !== undefined ? Number(body.limit) : 120000,
      mapUids: requestedMapUids,
      clubId: resolveNamingSimilarityClubId({
        requestedMapUids,
        requestedClubId,
        query: body.q,
        sourceKey,
        service,
      }),
      sourceKey,
      campaignName,
      reviewState: body.reviewState ?? body.review_state ?? "",
      force: Boolean(parseOptionalBoolean(body.force)),
      rescanAll: Boolean(parseOptionalBoolean(body.rescanAll ?? body.rescan_all)),
      persistCandidates:
        parseOptionalBoolean(body.persistCandidates) === undefined
          ? true
          : Boolean(parseOptionalBoolean(body.persistCandidates)),
      reason: body.reason,
    });
    return res.status(result?.started ? 202 : 200).json(result);
  });

  router.post("/naming/similarity/backfill", async (req, res) => {
    const body = req.body || {};
    const requestedMapUids = parseAccountIds(body.mapUids ?? body.map_uids ?? body.uids);
    const requestedClubId = parseOptionalClubId(body.clubId);
    const sourceKey = body.sourceKey ?? body.source_key;
    const campaignName = body.campaignName ?? body.campaign_name ?? "";
    const result = await service.maps.assignStoredMapNumbersBySimilarity({
      q: body.q,
      limit: body.limit !== undefined ? Number(body.limit) : 120000,
      mapUids: requestedMapUids,
      clubId: resolveNamingSimilarityClubId({
        requestedMapUids,
        requestedClubId,
        query: body.q,
        sourceKey,
        service,
      }),
      sourceKey,
      campaignName,
      force: Boolean(parseOptionalBoolean(body.force)),
      rescanAll: Boolean(parseOptionalBoolean(body.rescanAll ?? body.rescan_all)),
      persistCandidates:
        parseOptionalBoolean(body.persistCandidates) === undefined
          ? true
          : Boolean(parseOptionalBoolean(body.persistCandidates)),
    });
    if (result?.error || result?.ok === false) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/naming/candidates", (req, res) => {
    const query = req.query || {};
    const requiresRegex = parseOptionalBoolean(query.requiresRegex);
    const result = service.maps.getMapNameStandardizationCandidates({
      q: query.q,
      automationState: query.automationState,
      reviewState: query.reviewState,
      requiresRegex: requiresRegex === undefined ? undefined : Boolean(requiresRegex),
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      offset: query.offset !== undefined ? Number(query.offset) : undefined,
    });
    return res.json(result);
  });

  router.get("/naming/candidates/:mapUid/detail", async (req, res) => {
    const result = await service.maps.getMapNameStandardizationCandidateDetail(req.params.mapUid);
    if (result?.error) return res.status(404).json(result);
    return res.json(result);
  });

  router.get("/maps/:targetMapUid/viewer-diff", async (req, res) => {
    const result = await service.maps.getMapViewerDiffPayload({
      targetMapUid: req.params.targetMapUid,
      referenceMapUid: req.query.referenceMapUid,
    });
    if (result?.error) {
      const statusCode = /not found/i.test(String(result.error || ""))
        ? 404
        : /required/i.test(String(result.error || ""))
          ? 400
          : 409;
      return res.status(statusCode).json(result);
    }
    return res.json(result);
  });

  router.post("/maps/:mapUid/local-fix", async (req, res) => {
    const body = req.body || {};
    const result = await service.maps.importMapLocalFileFix({
      mapUid: req.params.mapUid,
      sourceFilePath: body.sourceFilePath ?? body.source_path ?? body.path,
      note: body.note,
      recomputeSimilarity:
        parseOptionalBoolean(body.recomputeSimilarity ?? body.recompute_similarity) === undefined
          ? true
          : Boolean(parseOptionalBoolean(body.recomputeSimilarity ?? body.recompute_similarity)),
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/naming/candidates/:mapUid/similarity-selection", async (req, res) => {
    const body = req.body || {};
    const result = await service.maps.updateMapNameCandidateSimilaritySelection({
      mapUid: req.params.mapUid,
      candidateMapUids: parseAccountIds(
        body.candidateMapUids ?? body.candidate_map_uids ?? body.referenceMapUids ?? body.reference_map_uids
      ),
      mapNumbers: parseIntegerValues(body.mapNumbers ?? body.map_numbers),
      reviewState: body.reviewState,
      reviewNote: body.reviewNote,
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/naming/candidates/:mapUid/similarity-weights", async (req, res) => {
    const body = req.body || {};
    const result = await service.maps.updateMapNameCandidateSimilarityWeights({
      mapUid: req.params.mapUid,
      scope: body.scope,
      weights: parseSimilarityWeightProfile(body.weights ?? body.weightProfile ?? body.profile ?? body),
      reset: Boolean(parseOptionalBoolean(body.reset)),
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/naming/candidates/:mapUid/review", (req, res) => {
    const body = req.body || {};
    const result = service.maps.updateMapNameStandardizationCandidateReview({
      mapUid: req.params.mapUid,
      reviewState: body.reviewState,
      manualName: body.manualName,
      reviewNote: body.reviewNote,
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/update-requests", (req, res) => {
    const query = req.query || {};
    const result = service.catalog.listUpdateRequests({
      status: query.status,
      q: query.q,
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      offset: query.offset !== undefined ? Number(query.offset) : undefined,
    });
    return res.json(result);
  });

  router.post("/update-requests/:requestId/status", (req, res) => {
    const body = req.body || {};
    const result = service.catalog.updateUpdateRequestStatus({
      requestId: Number(req.params.requestId),
      status: body.status,
      resolutionNote: body.resolutionNote,
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });
}

export { registerNamingRoutes };
