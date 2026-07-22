import {
  clampInt,
  parseJsonSafe,
  toText,
  uniqueBy,
  resolveSavedMapperDisplayName,
  rowToMap,
} from "./alteredRepositorySupport.js";

class AlteredMapRepository {
  constructor(db) {
    this.db = db;
  }

  listMaps({ q = "", limit = 1200, offset = 0 } = {}) {
    const query = String(q || "")
      .trim()
      .toLowerCase();
    const pattern = `%${query}%`;
    const safeLimit = Math.max(1, Math.min(Number(limit) || 1200, 50000));
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const rows = this.db
      .prepare(
        `
        SELECT
          m.map_uid AS uid,
          m.map_id AS mapId,
          m.name AS name,
          m.map_type AS mapType,
          m.map_style AS mapStyle,
          m.map_environment AS mapEnvironment,
          c.name AS campaign,
          c.campaign_id AS campaignId,
          p.slot AS slot,
          m.author_time AS authorMs,
          m.player_count AS playerCount,
          m.player_count_updated_at AS playerCountUpdatedAt,
          m.wr_ms AS wrMs,
          m.wr_holder AS wrHolder,
          m.wr_updated_at AS wrUpdatedAt,
          m.tracked AS tracked,
          m.status AS status,
          m.check_frequency AS checkFrequency,
          m.last_checked_at AS lastCheckedAt,
          m.map_created_at AS mapCreatedAt,
          m.map_updated_at AS mapUpdatedAt
        FROM altered_maps m
        LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
        LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
        WHERE (? = '' OR LOWER(m.name) LIKE ? OR LOWER(m.map_uid) LIKE ?)
        ORDER BY COALESCE(c.name, 'Unassigned') COLLATE NOCASE ASC, COALESCE(p.slot, 9999) ASC, m.name COLLATE NOCASE ASC
        LIMIT ?
        OFFSET ?
        `
      )
      .all(query, pattern, pattern, safeLimit, safeOffset);
    return rows.map(rowToMap);
  }

  countMapsWorkspace({ q = "", campaign = "", tracked = undefined, status = "", staleState = "" } = {}) {
    const query = String(q || "")
      .trim()
      .toLowerCase();
    const pattern = `%${query}%`;
    const safeCampaign = String(campaign || "").trim();
    const trackedFlag =
      typeof tracked === "boolean" ? (tracked ? 1 : 0) : Number(tracked) === 1 ? 1 : Number(tracked) === 0 ? 0 : -1;
    const safeStatus = String(status || "")
      .trim()
      .toLowerCase();
    const safeStaleState = String(staleState || "")
      .trim()
      .toLowerCase();
    const row = this.db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM altered_maps m
        LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
        LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
        WHERE (? = '' OR LOWER(m.name) LIKE ? OR LOWER(m.map_uid) LIKE ?)
          AND (? = '' OR LOWER(COALESCE(c.name, 'Unassigned')) = LOWER(?))
          AND (? = -1 OR m.tracked = ?)
          AND (? = '' OR LOWER(COALESCE(m.status, 'live')) = ?)
          AND (
            ? = ''
            OR (? = 'fresh' AND m.last_checked_at IS NOT NULL AND datetime(m.last_checked_at) > datetime('now', '-1 day'))
            OR (? = 'stale' AND (m.last_checked_at IS NULL OR datetime(m.last_checked_at) <= datetime('now', '-1 day')))
          )
        `
      )
      .get(
        query,
        pattern,
        pattern,
        safeCampaign,
        safeCampaign,
        trackedFlag,
        trackedFlag,
        safeStatus,
        safeStatus,
        safeStaleState,
        safeStaleState,
        safeStaleState
      );
    return Number(row?.count || 0);
  }

  listMapsWorkspace({
    q = "",
    campaign = "",
    tracked = undefined,
    status = "",
    staleState = "",
    limit = 50,
    offset = 0,
  } = {}) {
    const query = String(q || "")
      .trim()
      .toLowerCase();
    const pattern = `%${query}%`;
    const safeCampaign = String(campaign || "").trim();
    const trackedFlag =
      typeof tracked === "boolean" ? (tracked ? 1 : 0) : Number(tracked) === 1 ? 1 : Number(tracked) === 0 ? 0 : -1;
    const safeStatus = String(status || "")
      .trim()
      .toLowerCase();
    const safeStaleState = String(staleState || "")
      .trim()
      .toLowerCase();
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const rows = this.db
      .prepare(
        `
        SELECT
          m.map_uid AS uid,
          m.map_id AS mapId,
          m.name AS name,
          m.map_type AS mapType,
          m.map_style AS mapStyle,
          m.map_environment AS mapEnvironment,
          c.name AS campaign,
          c.campaign_id AS campaignId,
          p.slot AS slot,
          m.author_time AS authorMs,
          m.player_count AS playerCount,
          m.player_count_updated_at AS playerCountUpdatedAt,
          m.wr_ms AS wrMs,
          m.wr_holder AS wrHolder,
          m.wr_updated_at AS wrUpdatedAt,
          m.tracked AS tracked,
          m.status AS status,
          m.check_frequency AS checkFrequency,
          m.last_checked_at AS lastCheckedAt,
          m.map_created_at AS mapCreatedAt,
          m.map_updated_at AS mapUpdatedAt
        FROM altered_maps m
        LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
        LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
        WHERE (? = '' OR LOWER(m.name) LIKE ? OR LOWER(m.map_uid) LIKE ?)
          AND (? = '' OR LOWER(COALESCE(c.name, 'Unassigned')) = LOWER(?))
          AND (? = -1 OR m.tracked = ?)
          AND (? = '' OR LOWER(COALESCE(m.status, 'live')) = ?)
          AND (
            ? = ''
            OR (? = 'fresh' AND m.last_checked_at IS NOT NULL AND datetime(m.last_checked_at) > datetime('now', '-1 day'))
            OR (? = 'stale' AND (m.last_checked_at IS NULL OR datetime(m.last_checked_at) <= datetime('now', '-1 day')))
          )
        ORDER BY COALESCE(c.name, 'Unassigned') COLLATE NOCASE ASC, COALESCE(p.slot, 9999) ASC, m.name COLLATE NOCASE ASC
        LIMIT ?
        OFFSET ?
        `
      )
      .all(
        query,
        pattern,
        pattern,
        safeCampaign,
        safeCampaign,
        trackedFlag,
        trackedFlag,
        safeStatus,
        safeStatus,
        safeStaleState,
        safeStaleState,
        safeStaleState,
        safeLimit,
        safeOffset
      );
    return rows.map(rowToMap);
  }

  getMapOptions({ limit = 25000, offset = 0 } = {}) {
    return this.listMaps({ limit, offset }).map((map) => ({
      uid: map.uid,
      name: map.name,
      campaign: map.campaign,
      slot: map.slot,
    }));
  }

  listMapsForCampaignNames({ campaignNames = [] } = {}) {
    const safeCampaignNames = uniqueBy(
      (Array.isArray(campaignNames) ? campaignNames : [campaignNames]).map((value) => toText(value)).filter(Boolean),
      (value) => value.toLowerCase()
    );
    if (!safeCampaignNames.length) return [];
    const placeholders = safeCampaignNames.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
        SELECT
          m.map_uid AS mapUid,
          m.name AS name,
          m.download_url AS downloadUrl,
          m.map_type AS mapType,
          m.map_style AS mapStyle,
          m.map_environment AS mapEnvironment,
          c.campaign_id AS campaignId,
          c.name AS campaignName,
          p.slot AS slot
        FROM altered_maps m
        JOIN altered_map_positions p ON p.map_uid = m.map_uid
        JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
        WHERE c.name IN (${placeholders})
        ORDER BY c.name COLLATE NOCASE ASC, p.slot ASC, m.name COLLATE NOCASE ASC, m.map_uid ASC
        `
      )
      .all(...safeCampaignNames);
    return rows.map((row) => ({
      mapUid: row.mapUid,
      uid: row.mapUid,
      name: row.name || row.mapUid,
      mapName: row.name || row.mapUid,
      downloadUrl: row.downloadUrl || null,
      mapType: row.mapType || null,
      mapStyle: row.mapStyle || null,
      mapEnvironment: row.mapEnvironment || null,
      campaignId: Number(row.campaignId || 0) || null,
      campaignName: row.campaignName || null,
      campaign: row.campaignName || null,
      slot: Number(row.slot || 0) || 0,
    }));
  }

  getMapInfo(mapUid) {
    const uid = String(mapUid || "").trim();
    if (!uid) return { exists: false };
    const row = this.db
      .prepare(
        `
        SELECT
          m.map_uid AS uid,
          m.map_id AS mapId,
          m.name AS name,
          m.map_type AS mapType,
          m.map_style AS mapStyle,
          m.map_environment AS mapEnvironment,
          c.name AS campaign,
          c.campaign_id AS campaignId,
          c.external_campaign_id AS campaignExternalId,
          campaign_counts.mapCount AS campaignMapCount,
          p.slot AS slot,
          m.author AS author,
          m.author_display_name AS authorDisplayName,
          m.submitter AS submitter,
          m.submitter_display_name AS submitterDisplayName,
          m.author_time AS authorMs,
          m.gold_time AS goldMs,
          m.silver_time AS silverMs,
          m.bronze_time AS bronzeMs,
          m.nb_laps AS laps,
          m.thumbnail_url AS thumbnailUrl,
          m.download_url AS downloadUrl,
          m.player_count AS playerCount,
          m.player_count_updated_at AS playerCountUpdatedAt,
          m.wr_ms AS wrMs,
          m.wr_holder AS wrHolder,
          m.wr_updated_at AS wrUpdatedAt,
          m.tracked AS tracked,
          m.status AS status,
          m.check_frequency AS checkFrequency,
          m.last_checked_at AS lastCheckedAt,
          m.map_created_at AS mapCreatedAt,
          m.map_updated_at AS mapUpdatedAt,
          m.payload_json AS payloadJson,
          c.payload_json AS campaignPayloadJson,
          n.original_name AS derivedOriginalName,
          n.sanitized_name AS derivedSanitizedName,
          n.proposed_name AS derivedProposedName,
          n.manual_name AS derivedManualName,
          n.season AS derivedSeason,
          n.year AS derivedYear,
          n.map_number AS derivedMapNumber,
          n.alteration_mix_json AS derivedAlterationMixJson,
          n.parser_pattern AS derivedParserPattern,
          n.parser_confidence AS derivedParserConfidence,
          n.source_version AS derivedSourceVersion,
          n.map_numbers_json AS derivedMapNumbersJson,
          n.alteration_label AS derivedAlterationLabel
          FROM altered_maps m
          LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
          LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
          LEFT JOIN (
            SELECT p2.campaign_id AS campaignId, COUNT(*) AS mapCount
            FROM altered_map_positions p2
            GROUP BY p2.campaign_id
          ) campaign_counts ON campaign_counts.campaignId = c.campaign_id
          LEFT JOIN altered_map_name_candidates n ON n.map_uid = m.map_uid
          WHERE LOWER(m.map_uid) = LOWER(?)
          LIMIT 1
        `
      )
      .get(uid);

    if (!row) return { exists: false };
    const payload = parseJsonSafe(row.payloadJson, null);
    const campaignPayload = parseJsonSafe(row.campaignPayloadJson, null);
    const map = rowToMap(row);
    map.authorSavedDisplayName = resolveSavedMapperDisplayName(payload, "author", map.author) || null;
    map.submitterSavedDisplayName = resolveSavedMapperDisplayName(payload, "submitter", map.submitter) || null;

    return {
      exists: true,
      map: {
        ...map,
        payload,
        campaignPayload,
        derivedNameCandidate:
          row.derivedOriginalName || row.derivedSanitizedName || row.derivedProposedName
            ? {
                originalName: row.derivedOriginalName || null,
                sanitizedName: row.derivedSanitizedName || null,
                proposedName: row.derivedProposedName || null,
                manualName: row.derivedManualName || null,
                season: row.derivedSeason || null,
                year: Number(row.derivedYear || 0) || null,
                mapNumber: Number(row.derivedMapNumber || 0) || null,
                mapNumbers: parseJsonSafe(row.derivedMapNumbersJson, []) || [],
                alteration: row.derivedAlterationLabel || null,
                alterationMix: parseJsonSafe(row.derivedAlterationMixJson, []) || [],
                parserPattern: row.derivedParserPattern || null,
                parserConfidence: Number(row.derivedParserConfidence || 0),
                sourceVersion: row.derivedSourceVersion || null,
              }
            : null,
      },
    };
  }
}

export { AlteredMapRepository };
