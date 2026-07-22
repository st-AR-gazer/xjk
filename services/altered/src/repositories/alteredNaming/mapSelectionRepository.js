import {
  EXCLUDE_NONCANONICAL_WEEKLY_SHORTS_SQL,
  clampInt,
  parseJsonSafe,
  toText,
  uniqueBy,
} from "../alteredRepositorySupport.js";

function buildMapSelectionFilter({ q, mapUids, clubId, reviewState, campaignName, limit, defaultLimit }) {
  const query = toText(q).toLowerCase();
  const pattern = `%${query}%`;
  const safeClubId = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 }) || null;
  const safeCampaignName = toText(campaignName).toLowerCase();
  const campaignNamePattern = safeCampaignName ? `%${safeCampaignName}%` : "";
  const safeMapUids = uniqueBy(
    (Array.isArray(mapUids) ? mapUids : []).map((value) => toText(value)).filter(Boolean),
    (value) => value.toLowerCase()
  );
  const normalizedReview = toText(reviewState).toLowerCase();
  const hasReviewFilter = ["pending", "approved", "ignored"].includes(normalizedReview);

  return {
    query,
    pattern,
    safeMapUids,
    safeClubId,
    campaignNamePattern,
    normalizedReview,
    mapUidWhere: safeMapUids.length ? `AND m.map_uid IN (${safeMapUids.map(() => "?").join(", ")})` : "",
    clubWhere: safeClubId ? "AND c.club_id = ?" : "",
    campaignNameWhere: safeCampaignName ? "AND LOWER(c.name) LIKE ?" : "",
    reviewWhere: hasReviewFilter ? "AND nc.review_state = ?" : "",
    reviewJoin: hasReviewFilter ? "INNER JOIN altered_map_name_candidates nc ON nc.map_uid = m.map_uid" : "",
    safeLimit: Math.max(1, Math.min(Number(limit) || defaultLimit, 120000)),
  };
}

class AlteredNamingMapSelectionRepository {
  constructor(db) {
    this.db = db;
  }

  listMapsForNameStandardization({
    q = "",
    limit = 60000,
    mapUids = [],
    clubId = null,
    reviewState = "",
    campaignName = "",
    includePayload = true,
  } = {}) {
    const {
      query,
      pattern,
      safeMapUids,
      safeClubId,
      campaignNamePattern,
      normalizedReview,
      mapUidWhere,
      clubWhere,
      campaignNameWhere,
      reviewWhere,
      reviewJoin,
      safeLimit,
    } = buildMapSelectionFilter({
      q,
      mapUids,
      clubId,
      reviewState,
      campaignName,
      limit,
      defaultLimit: 60000,
    });
    return this.db
      .prepare(
        includePayload
          ? `
            SELECT
              m.map_uid AS mapUid,
              m.map_id AS mapId,
              m.name AS name,
              m.map_type AS mapType,
              m.map_style AS mapStyle,
              m.map_environment AS mapEnvironment,
              m.author AS author,
              m.submitter AS submitter,
              m.download_url AS downloadUrl,
              m.payload_json AS payloadJson,
              c.name AS campaign,
              c.club_id AS clubId,
              c.campaign_id AS campaignId,
              c.external_campaign_id AS campaignExternalId,
              campaign_counts.mapCount AS campaignMapCount,
              c.start_timestamp AS campaignStartTimestamp,
              c.payload_json AS campaignPayloadJson,
              p.slot AS slot
            FROM altered_maps m
            LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
            LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
            ${reviewJoin}
            LEFT JOIN (
              SELECT p2.campaign_id AS campaignId, COUNT(*) AS mapCount
              FROM altered_map_positions p2
              GROUP BY p2.campaign_id
            ) campaign_counts ON campaign_counts.campaignId = c.campaign_id
            WHERE (? = '' OR LOWER(m.name) LIKE ? OR LOWER(m.map_uid) LIKE ?)
              ${mapUidWhere}
              ${clubWhere}
              ${campaignNameWhere}
              ${reviewWhere}
              ${EXCLUDE_NONCANONICAL_WEEKLY_SHORTS_SQL}
            ORDER BY COALESCE(c.name, 'Unassigned') COLLATE NOCASE ASC, COALESCE(p.slot, 9999) ASC, m.name COLLATE NOCASE ASC
            LIMIT ?
          `
          : `
            SELECT
              m.map_uid AS mapUid,
              m.map_id AS mapId,
              m.name AS name,
              m.map_type AS mapType,
              m.map_style AS mapStyle,
              m.map_environment AS mapEnvironment,
              m.author AS author,
              m.submitter AS submitter,
              m.download_url AS downloadUrl,
              NULL AS payloadJson,
              c.name AS campaign,
              c.club_id AS clubId,
              c.campaign_id AS campaignId,
              c.external_campaign_id AS campaignExternalId,
              NULL AS campaignMapCount,
              c.start_timestamp AS campaignStartTimestamp,
              c.payload_json AS campaignPayloadJson,
              p.slot AS slot
            FROM altered_maps m
            LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
            LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
            ${reviewJoin}
            WHERE (? = '' OR LOWER(m.name) LIKE ? OR LOWER(m.map_uid) LIKE ?)
              ${mapUidWhere}
              ${clubWhere}
              ${campaignNameWhere}
              ${reviewWhere}
              ${EXCLUDE_NONCANONICAL_WEEKLY_SHORTS_SQL}
            ORDER BY COALESCE(c.name, 'Unassigned') COLLATE NOCASE ASC, COALESCE(p.slot, 9999) ASC, m.name COLLATE NOCASE ASC
            LIMIT ?
          `
      )
      .all(
        query,
        pattern,
        pattern,
        ...safeMapUids,
        ...(safeClubId ? [safeClubId] : []),
        ...(campaignNamePattern ? [campaignNamePattern] : []),
        ...(reviewWhere ? [normalizedReview] : []),
        safeLimit
      )
      .map((row) => ({
        ...row,
        payload: parseJsonSafe(row.payloadJson, null),
        campaignPayload: parseJsonSafe(row.campaignPayloadJson, null),
      }));
  }

  listMapsNeedingSimilarityRefresh({
    q = "",
    limit = 250,
    mapUids = [],
    clubId = null,
    reviewState = "",
    campaignName = "",
    requiredAssignmentMethod = "",
    includePayload = true,
  } = {}) {
    const requiredMethod = toText(requiredAssignmentMethod).toLowerCase();
    const {
      query,
      pattern,
      safeMapUids,
      safeClubId,
      campaignNamePattern,
      normalizedReview,
      mapUidWhere,
      clubWhere,
      campaignNameWhere,
      reviewWhere,
      reviewJoin,
      safeLimit,
    } = buildMapSelectionFilter({
      q,
      mapUids,
      clubId,
      reviewState,
      campaignName,
      limit,
      defaultLimit: 250,
    });

    return this.db
      .prepare(
        includePayload
          ? `
            SELECT
              m.map_uid AS mapUid,
              m.map_id AS mapId,
              m.name AS name,
              m.map_type AS mapType,
              m.map_style AS mapStyle,
              m.map_environment AS mapEnvironment,
              m.author AS author,
              m.submitter AS submitter,
              m.download_url AS downloadUrl,
              m.payload_json AS payloadJson,
              c.name AS campaign,
              c.club_id AS clubId,
              c.campaign_id AS campaignId,
              c.external_campaign_id AS campaignExternalId,
              campaign_counts.mapCount AS campaignMapCount,
              c.start_timestamp AS campaignStartTimestamp,
              c.payload_json AS campaignPayloadJson,
              p.slot AS slot,
              sim.assignment_method AS similarityAssignmentMethod,
              sim.updated_at AS similarityUpdatedAt
            FROM altered_maps m
            LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
            LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
            LEFT JOIN altered_map_number_similarity sim ON sim.map_uid = m.map_uid
            ${reviewJoin}
            LEFT JOIN (
              SELECT p2.campaign_id AS campaignId, COUNT(*) AS mapCount
              FROM altered_map_positions p2
              GROUP BY p2.campaign_id
            ) campaign_counts ON campaign_counts.campaignId = c.campaign_id
            WHERE (? = '' OR LOWER(m.name) LIKE ? OR LOWER(m.map_uid) LIKE ?)
              ${mapUidWhere}
              ${clubWhere}
              ${campaignNameWhere}
              ${reviewWhere}
              ${EXCLUDE_NONCANONICAL_WEEKLY_SHORTS_SQL}
              AND (
                sim.map_uid IS NULL
                OR (? <> '' AND LOWER(COALESCE(sim.assignment_method, '')) <> ?)
                OR json_extract(sim.candidate_matches_json, '$[0].weightedScore') IS NULL
              )
            ORDER BY
              CASE
                WHEN sim.map_uid IS NULL THEN 0
                WHEN (? <> '' AND LOWER(COALESCE(sim.assignment_method, '')) <> ?) THEN 1
                WHEN json_extract(sim.candidate_matches_json, '$[0].weightedScore') IS NULL THEN 2
                ELSE 3
              END ASC,
              COALESCE(c.name, 'Unassigned') COLLATE NOCASE ASC,
              COALESCE(p.slot, 9999) ASC,
              m.name COLLATE NOCASE ASC
            LIMIT ?
          `
          : `
            SELECT
              m.map_uid AS mapUid,
              m.map_id AS mapId,
              m.name AS name,
              m.map_type AS mapType,
              m.map_style AS mapStyle,
              m.map_environment AS mapEnvironment,
              m.author AS author,
              m.submitter AS submitter,
              m.download_url AS downloadUrl,
              NULL AS payloadJson,
              c.name AS campaign,
              c.club_id AS clubId,
              c.campaign_id AS campaignId,
              c.external_campaign_id AS campaignExternalId,
              NULL AS campaignMapCount,
              c.start_timestamp AS campaignStartTimestamp,
              c.payload_json AS campaignPayloadJson,
              p.slot AS slot,
              sim.assignment_method AS similarityAssignmentMethod,
              sim.updated_at AS similarityUpdatedAt
            FROM altered_maps m
            LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
            LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
            LEFT JOIN altered_map_number_similarity sim ON sim.map_uid = m.map_uid
            ${reviewJoin}
            WHERE (? = '' OR LOWER(m.name) LIKE ? OR LOWER(m.map_uid) LIKE ?)
              ${mapUidWhere}
              ${clubWhere}
              ${campaignNameWhere}
              ${reviewWhere}
              ${EXCLUDE_NONCANONICAL_WEEKLY_SHORTS_SQL}
              AND (
                sim.map_uid IS NULL
                OR (? <> '' AND LOWER(COALESCE(sim.assignment_method, '')) <> ?)
                OR json_extract(sim.candidate_matches_json, '$[0].weightedScore') IS NULL
              )
            ORDER BY
              CASE
                WHEN sim.map_uid IS NULL THEN 0
                WHEN (? <> '' AND LOWER(COALESCE(sim.assignment_method, '')) <> ?) THEN 1
                WHEN json_extract(sim.candidate_matches_json, '$[0].weightedScore') IS NULL THEN 2
                ELSE 3
              END ASC,
              COALESCE(c.name, 'Unassigned') COLLATE NOCASE ASC,
              COALESCE(p.slot, 9999) ASC,
              m.name COLLATE NOCASE ASC
            LIMIT ?
          `
      )
      .all(
        query,
        pattern,
        pattern,
        ...safeMapUids,
        ...(safeClubId ? [safeClubId] : []),
        ...(campaignNamePattern ? [campaignNamePattern] : []),
        ...(reviewWhere ? [normalizedReview] : []),
        requiredMethod,
        requiredMethod,
        requiredMethod,
        requiredMethod,
        safeLimit
      )
      .map((row) => ({
        ...row,
        payload: parseJsonSafe(row.payloadJson, null),
        campaignPayload: parseJsonSafe(row.campaignPayloadJson, null),
      }));
  }
}

export { AlteredNamingMapSelectionRepository, buildMapSelectionFilter };
