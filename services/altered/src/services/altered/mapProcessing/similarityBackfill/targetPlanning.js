import {
  classifyNamingSimilaritySource,
  CONTENT_SIGNATURE_VERSION,
  EXTERNAL_NAMING_SIMILARITY_MIN_MAPS,
  clampInt,
  normalizeOptionalClubId,
  normalizeUniqueStrings,
  resolveMapCampaignName,
  resolveMapDownloadUrl,
  resolveMapSlot,
  resolveMapUid,
  toText,
  uniqueBy,
} from "../../serviceSupport.js";

function buildNamingSimilarityBackfillTargets(
  context,
  {
    q = "",
    limit = 120000,
    mapUids = [],
    clubId = null,
    sourceKey = "",
    campaignName = "",
    reviewState = "",
    rescanAll = false,
  } = {}
) {
  const requestedMapUids = normalizeUniqueStrings(Array.isArray(mapUids) ? mapUids : []);
  const safeLimit = clampInt(limit, { min: 1, max: 120000, fallback: 250 });
  const safeClubId = normalizeOptionalClubId(clubId);
  const effectiveClubId = requestedMapUids.length ? null : safeClubId;
  const shouldPrioritizeRefreshOnly = !rescanAll && !toText(q) && !requestedMapUids.length;
  const sourceMaps = context.repository.naming.listMapsForNameStandardization({
    q,
    limit: !toText(q) && !requestedMapUids.length ? Math.max(safeLimit * 4, 1000) : safeLimit,
    mapUids: requestedMapUids,
    clubId: effectiveClubId,
    campaignName,
    reviewState,
    includePayload: false,
  });
  const prioritizedSourceMaps = shouldPrioritizeRefreshOnly
    ? context.repository.naming.listMapsNeedingSimilarityRefresh({
        q,
        limit: safeLimit,
        mapUids: requestedMapUids,
        requiredAssignmentMethod: CONTENT_SIGNATURE_VERSION,
        clubId: effectiveClubId,
        campaignName,
        reviewState,
        includePayload: false,
      })
    : [];
  const maps = uniqueBy(
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
      const requiredSourceKey = toText(sourceKey).toLowerCase();
      if (!requiredSourceKey) return true;
      return classifyNamingSimilaritySource(map) === requiredSourceKey;
    })
    .slice(0, safeLimit);

  return {
    maps,
    targetClubId: effectiveClubId,
    sourceKey: toText(sourceKey).toLowerCase() || null,
    requestedMapUids,
    safeLimit,
  };
}

function shouldUseExternalNamingSimilarityBackfill(
  _context,
  { q = "", mapUids = [], rescanAll = false, selectedCount = 0 } = {}
) {
  if (Array.isArray(mapUids) && mapUids.length) return false;
  if (toText(q)) return false;
  if (rescanAll) return true;
  return Number(selectedCount || 0) >= EXTERNAL_NAMING_SIMILARITY_MIN_MAPS;
}

export { buildNamingSimilarityBackfillTargets, shouldUseExternalNamingSimilarityBackfill };
