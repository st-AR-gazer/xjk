import {
  CONTENT_SIGNATURE_VERSION,
  buildSimilarityWeightOverrideMaps,
  clampInt,
  classifyNamingSimilaritySource,
  normalizeOptionalClubId,
  resolveMapCampaignName,
  resolveMapDownloadUrl,
  resolveMapSlot,
  resolveMapUid,
  toText,
  uniqueBy,
} from "../../serviceSupport.js";

function loadSimilarityTargets(run) {
  const safeLimit = clampInt(run.limit, { min: 1, max: 120000, fallback: 250 });
  const safeClubId = normalizeOptionalClubId(run.clubId);
  const effectiveClubId = Array.isArray(run.mapUids) && run.mapUids.length ? null : safeClubId;
  run.reportProgress({
    status: "running",
    stage: "loading-targets",
    message: effectiveClubId
      ? `Loading naming candidates for primary club ${effectiveClubId}...`
      : "Loading naming candidates...",
    percent: 2,
    replaceCounters: true,
    counters: { total: 0, processed: 0, resolved: 0, unresolved: 0, changedCandidates: 0 },
    targetClubId: effectiveClubId,
    sourceKey: toText(run.sourceKey).toLowerCase() || null,
    rescanAll: Boolean(run.rescanAll),
  });

  const hasMapUidFilter = Array.isArray(run.mapUids) && run.mapUids.length;
  const shouldPrioritizeRefreshOnly = !run.rescanAll && !toText(run.q) && !hasMapUidFilter;
  const sourceMaps = run.repository.naming.listMapsForNameStandardization({
    q: run.q,
    limit: !toText(run.q) && !hasMapUidFilter ? Math.max(safeLimit * 4, 1000) : safeLimit,
    mapUids: run.mapUids,
    clubId: effectiveClubId,
    campaignName: run.campaignName,
    includePayload: false,
  });
  const prioritizedSourceMaps = shouldPrioritizeRefreshOnly
    ? run.repository.naming.listMapsNeedingSimilarityRefresh({
        q: run.q,
        limit: safeLimit,
        mapUids: run.mapUids,
        requiredAssignmentMethod: CONTENT_SIGNATURE_VERSION,
        clubId: effectiveClubId,
        campaignName: run.campaignName,
        includePayload: false,
      })
    : [];
  const normalizedMaps = uniqueBy(
    (prioritizedSourceMaps.length ? prioritizedSourceMaps : sourceMaps)
      .map((map) => ({
        ...map,
        mapUid: resolveMapUid(map),
        campaignName: resolveMapCampaignName(map),
        slot: resolveMapSlot(map),
        downloadUrl: resolveMapDownloadUrl(map),
      }))
      .filter((map) => map.mapUid),
    (map) => map.mapUid.toLowerCase()
  )
    .filter((map) => {
      const requiredSourceKey = toText(run.sourceKey).toLowerCase();
      return !requiredSourceKey || classifyNamingSimilaritySource(map) === requiredSourceKey;
    })
    .slice(0, safeLimit);

  return { safeLimit, effectiveClubId, normalizedMaps };
}

function loadSimilarityWeights(run) {
  return {
    similarityWeightOverrides: buildSimilarityWeightOverrideMaps({
      mapOverrides: run.repository.naming.getSimilarityMapWeightOverrides({
        mapUids: run.normalizedMaps.map((map) => map.mapUid),
      }),
      campaignOverrides: run.repository.naming.getSimilarityCampaignWeightOverrides({
        campaignIds: run.normalizedMaps.map((map) => map.campaignId),
      }),
    }),
    similarityWeightRules: run.repository.naming.listSimilarityWeightRules(),
  };
}

export { loadSimilarityTargets, loadSimilarityWeights };
