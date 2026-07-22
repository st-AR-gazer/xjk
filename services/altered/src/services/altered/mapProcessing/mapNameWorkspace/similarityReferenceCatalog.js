import {
  COMPETITION_SOURCE_KEY,
  TOTD_SOURCE_KEY,
  buildCampaignFamily,
  classifyNamingSimilaritySource,
  isBetterReferenceCampaign,
  isCompetitionFamily,
  isNormalNadeoReferenceCampaign,
  limitReferenceCampaignFallback,
  resolveMapCampaignName,
  resolveMapDownloadUrl,
  resolveMapSlot,
  resolveMapUid,
  toText,
  uniqueBy,
} from "../../serviceSupport.js";

function normalizeReferenceFamilyKey(value) {
  const raw = toText(value);
  return raw ? raw.replace(/:env:[^:]+/g, "") : "";
}

async function refreshReferenceSources(run) {
  const projectSourceService = run.getProjectSourceService();
  try {
    await projectSourceService.ensureOfficialSeasonalSourceFresh();
  } catch (error) {
    run.logger.warn(
      `[altered-official-seasonal] unable to refresh official campaign catalog before similarity run: ${error?.message || error}`
    );
  }

  const requiredSourceKeys = new Set(
    run.normalizedMaps.map((map) => classifyNamingSimilaritySource(map)).filter(Boolean)
  );
  if (requiredSourceKeys.has(TOTD_SOURCE_KEY)) {
    try {
      await projectSourceService.ensureTotdSourceAvailable();
    } catch (error) {
      run.logger.warn(
        `[altered-totd] unable to refresh official TOTD catalog before similarity run: ${error?.message || error}`
      );
    }
  }
  if (requiredSourceKeys.has(COMPETITION_SOURCE_KEY)) {
    try {
      await projectSourceService.ensureCompetitionSourceAvailable();
    } catch (error) {
      run.logger.warn(
        `[altered-competition] unable to refresh competition catalog before similarity run: ${error?.message || error}`
      );
    }
  }
}

function buildReferenceCatalog(run) {
  const requiredReferenceFamilyKeys = new Set();
  for (const map of run.normalizedMaps) {
    const familyKey = toText(buildCampaignFamily(map.campaignName).key);
    const referenceFamilyKey = normalizeReferenceFamilyKey(familyKey);
    if (referenceFamilyKey) requiredReferenceFamilyKeys.add(referenceFamilyKey);
  }

  const referenceCatalog = run.repository.catalog.listAlterationsCampaigns({
    limit: 10000,
    offset: 0,
    catalogOnly: true,
  });
  const catalogRows = Array.isArray(referenceCatalog?.rows) ? referenceCatalog.rows : [];
  const campaignCatalogById = new Map(
    catalogRows
      .filter((campaign) => Number(campaign?.campaign_db_id || 0) > 0)
      .map((campaign) => [Number(campaign.campaign_db_id), campaign])
  );
  const canonicalReferenceCampaignByFamily = new Map();
  const availableReferenceFamilies = new Set();
  for (const campaign of catalogRows) {
    const family = buildCampaignFamily(campaign?.name);
    if (!isNormalNadeoReferenceCampaign(campaign)) continue;
    availableReferenceFamilies.add(family.key);
    const currentList = canonicalReferenceCampaignByFamily.get(family.key) || [];
    if (isCompetitionFamily(family, campaign)) {
      const campaignKey = getCampaignKey(campaign);
      if (!currentList.some((item) => getCampaignKey(item) === campaignKey)) {
        canonicalReferenceCampaignByFamily.set(family.key, [...currentList, campaign]);
      }
      continue;
    }
    if (isBetterReferenceCampaign(currentList[0] || null, campaign)) {
      canonicalReferenceCampaignByFamily.set(family.key, [campaign]);
    }
  }

  const missingReferenceFamilies = [...requiredReferenceFamilyKeys].filter(
    (familyKey) => familyKey && !availableReferenceFamilies.has(familyKey)
  );
  let canonicalReferenceCampaigns = requiredReferenceFamilyKeys.size
    ? [...canonicalReferenceCampaignByFamily.entries()]
        .filter(([familyKey]) => requiredReferenceFamilyKeys.has(familyKey))
        .flatMap(([, campaigns]) => campaigns)
    : [];
  if (!canonicalReferenceCampaigns.length) {
    canonicalReferenceCampaigns = limitReferenceCampaignFallback(
      [...canonicalReferenceCampaignByFamily.values()]
        .flat()
        .sort(
          (a, b) =>
            Number(b?.sort_timestamp_ms || b?.sortTimestampMs || 0) -
            Number(a?.sort_timestamp_ms || a?.sortTimestampMs || 0)
        )
    );
  }

  const referenceCampaignByName = new Map(
    canonicalReferenceCampaigns
      .filter((campaign) => toText(campaign?.name))
      .map((campaign) => [toText(campaign.name), campaign])
  );
  const referenceMapsByCampaignName = new Map();
  for (const map of run.repository.maps.listMapsForCampaignNames({
    campaignNames: [...referenceCampaignByName.keys()],
  })) {
    const campaignName = toText(map.campaignName || map.campaign);
    if (!campaignName) continue;
    if (!referenceMapsByCampaignName.has(campaignName)) referenceMapsByCampaignName.set(campaignName, []);
    referenceMapsByCampaignName.get(campaignName).push(map);
  }

  const globalReferenceMaps = uniqueBy(
    canonicalReferenceCampaigns.flatMap((campaign) => {
      const maps = referenceMapsByCampaignName.get(toText(campaign?.name)) || [];
      return maps
        .map((map) => ({
          ...map,
          mapUid: resolveMapUid(map),
          slot: resolveMapSlot(map),
          campaignName: resolveMapCampaignName(map),
          downloadUrl: resolveMapDownloadUrl(map),
          campaignId: Number(campaign?.campaign_db_id || 0) || null,
          referenceFamilyKey: buildCampaignFamily(campaign?.name).key || null,
        }))
        .filter((map) => map.mapUid && map.slot);
    }),
    (map) => map.mapUid.toLowerCase()
  );

  return { campaignCatalogById, globalReferenceMaps, missingReferenceFamilies };
}

function getCampaignKey(campaign) {
  const campaignId = Number(campaign?.campaign_db_id || campaign?.campaignDbId || 0);
  return campaignId > 0 ? `id:${campaignId}` : `name:${toText(campaign?.name).toLowerCase()}`;
}

export { buildReferenceCatalog, normalizeReferenceFamilyKey, refreshReferenceSources };
