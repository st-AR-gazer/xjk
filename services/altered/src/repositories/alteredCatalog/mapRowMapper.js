import {
  buildCampaignCatalogMetadata,
  mapTrackingStatus,
  parseJsonSafe,
  resolveSavedMapperDisplayName,
  slugifyText,
  uniqueTexts,
} from "../alteredRepositorySupport.js";

function mapAlterationMapRow(row) {
  const campaignId =
    row.campaignExternalId !== null && row.campaignExternalId !== undefined
      ? String(row.campaignExternalId)
      : row.campaignDbId !== null && row.campaignDbId !== undefined
        ? String(row.campaignDbId)
        : null;
  const campaignMeta = buildCampaignCatalogMetadata({
    campaignName: row.campaignName,
    startTimestamp: row.campaignStartTimestamp,
    payloadJson: row.campaignPayloadJson,
    createdAt: row.campaignCreatedAt,
    updatedAt: row.campaignUpdatedAt,
    alterationIdsCsv: row.alterationIdsCsv,
    alterationNamesCsv: row.alterationNamesCsv,
    alterationSlugsCsv: row.alterationSlugsCsv,
  });
  const derivedAlterationMix = parseJsonSafe(row.derivedAlterationMixJson, []) || [];
  const mapAlterationNames = campaignMeta.alterations.length
    ? campaignMeta.alterations.map((item) => item.name)
    : uniqueTexts(derivedAlterationMix.length ? derivedAlterationMix : [row.derivedAlterationLabel || ""]);
  const mapAlterations = mapAlterationNames.map((name) => {
    const existing = campaignMeta.alterations.find(
      (item) => String(item?.name || "").toLowerCase() === name.toLowerCase()
    );
    return {
      id: existing?.id || null,
      name: existing?.name || name,
      slug: existing?.slug || slugifyText(name, name),
    };
  });

  const payload = parseJsonSafe(row.payloadJson, null);
  const authorSavedDisplayName = resolveSavedMapperDisplayName(payload, "author", row.author);
  const submitterSavedDisplayName = resolveSavedMapperDisplayName(payload, "submitter", row.submitter);

  return {
    map_uid: row.mapUid,
    name: row.name || row.mapUid,
    author: row.author || "",
    author_display_name: row.authorDisplayName || null,
    author_saved_display_name: authorSavedDisplayName || null,
    submitter: row.submitter || "",
    submitter_display_name: row.submitterDisplayName || null,
    submitter_saved_display_name: submitterSavedDisplayName || null,
    thumbnail_url: row.thumbnailUrl || null,
    download_url: row.downloadUrl || null,
    map_type: row.mapType || null,
    map_style: row.mapStyle || null,
    map_environment: row.mapEnvironment || null,
    author_time: Number(row.authorTime || 0),
    gold_time: Number(row.goldTime || 0),
    silver_time: Number(row.silverTime || 0),
    bronze_time: Number(row.bronzeTime || 0),
    player_count: Number(row.playerCount || 0),
    wr_ms: Number(row.wrMs || 0) || null,
    wr_holder: row.wrHolder || null,
    wr_updated_at: row.wrUpdatedAt || null,
    tracked: Boolean(row.tracked),
    status: row.status || "live",
    tracking_status: mapTrackingStatus({
      tracked: Boolean(row.tracked),
      status: row.status || "live",
    }),
    check_count: 0,
    change_count: Number(row.wrChangeCount || 0),
    campaign_id: campaignId,
    campaign_db_id: Number(row.campaignDbId || 0) || null,
    campaign_external_id: Number(row.campaignExternalId || 0) || null,
    campaign_name: row.campaignName || null,
    campaign_sort_timestamp_ms: Number(campaignMeta.sortTimestampMs || 0) || 0,
    campaign_added_at: campaignMeta.addedAt || null,
    season: row.derivedSeason || campaignMeta.season || null,
    year: Number(row.derivedYear || 0) || campaignMeta.seasonYear || null,
    season_label: campaignMeta.seasonLabel || null,
    season_key: campaignMeta.seasonKey || null,
    car_type: campaignMeta.carType || null,
    carType: campaignMeta.carType || null,
    map_number: Number(row.derivedMapNumber || 0) || null,
    map_numbers: parseJsonSafe(row.derivedMapNumbersJson, []) || [],
    alteration: campaignMeta.primaryAlteration?.name || row.derivedAlterationLabel || null,
    alterations: mapAlterations,
    campaign_alterations: campaignMeta.alterations,
    slot: Number(row.slot || 0) || 0,
  };
}

export { mapAlterationMapRow };
