import { clampInt, normalizeAccountId, toNullableIso, uniqueBy } from "../alteredRepositorySupport.js";
import { buildAlterationMapQuery } from "./mapQueryPlanner.js";
import { mapAlterationMapRow } from "./mapRowMapper.js";

class AlteredCatalogMapRepository {
  constructor(db) {
    this.db = db;
  }

  listAlterationsMaps(options = {}) {
    const { joinSql, orderBy, orderParams, params, safeLimit, safeOffset, whereSql } = buildAlterationMapQuery(options);
    const total = Number(
      this.db
        .prepare(
          `
          SELECT COUNT(*) AS total
          FROM altered_maps m
          ${joinSql}
          ${whereSql}
          `
        )
        .get(...params)?.total || 0
    );

    const rows = this.db
      .prepare(
        `
        SELECT
          m.map_uid AS mapUid,
          m.name AS name,
          m.map_type AS mapType,
          m.map_style AS mapStyle,
          m.map_environment AS mapEnvironment,
          m.author AS author,
          m.author_display_name AS authorDisplayName,
          m.submitter AS submitter,
          m.submitter_display_name AS submitterDisplayName,
          m.payload_json AS payloadJson,
          m.thumbnail_url AS thumbnailUrl,
          m.download_url AS downloadUrl,
          m.player_count AS playerCount,
          m.author_time AS authorTime,
          m.gold_time AS goldTime,
          m.silver_time AS silverTime,
          m.bronze_time AS bronzeTime,
          m.wr_ms AS wrMs,
          m.wr_holder AS wrHolder,
          m.wr_updated_at AS wrUpdatedAt,
          m.tracked AS tracked,
          m.status AS status,
          c.campaign_id AS campaignDbId,
          c.external_campaign_id AS campaignExternalId,
          c.name AS campaignName,
          c.start_timestamp AS campaignStartTimestamp,
          c.payload_json AS campaignPayloadJson,
          c.created_at AS campaignCreatedAt,
          c.updated_at AS campaignUpdatedAt,
          p.slot AS slot,
          n.season AS derivedSeason,
          n.year AS derivedYear,
          n.map_number AS derivedMapNumber,
          n.map_numbers_json AS derivedMapNumbersJson,
          n.alteration_label AS derivedAlterationLabel,
          n.alteration_mix_json AS derivedAlterationMixJson,
          alt.alterationIdsCsv AS alterationIdsCsv,
          alt.alterationNamesCsv AS alterationNamesCsv,
          alt.alterationSlugsCsv AS alterationSlugsCsv,
          COALESCE(wrc.wrChangeCount, 0) AS wrChangeCount
        FROM altered_maps m
        ${joinSql}
        ${whereSql}
        ${orderBy}
        LIMIT ?
        OFFSET ?
        `
      )
      .all(...params, ...orderParams, safeLimit, safeOffset);

    return {
      total,
      rows: rows.map(mapAlterationMapRow),
    };
  }

  listAlterationsUploadMaps({ limit = 5000, offset = 0 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 100000, fallback: 5000 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const rows = this.db
      .prepare(
        `
        SELECT
          um.club_id AS clubId,
          um.bucket_id AS bucketId,
          ub.name AS bucketName,
          ub.map_count AS bucketMapCount,
          ub.active AS bucketActive,
          um.map_uid AS mapUid,
          um.slot AS slot,
          um.map_name AS mapName,
          um.author_account_id AS authorAccountId,
          um.first_seen_at AS firstSeenAt,
          um.last_seen_at AS lastSeenAt,
          um.updated_at AS updatedAt
        FROM altered_upload_maps um
        LEFT JOIN altered_upload_buckets ub
          ON ub.club_id = um.club_id AND ub.bucket_id = um.bucket_id
        ORDER BY
          COALESCE(um.last_seen_at, um.updated_at, um.first_seen_at, '') DESC,
          um.bucket_id DESC,
          um.slot ASC,
          um.map_uid ASC
        LIMIT ?
        OFFSET ?
        `
      )
      .all(safeLimit, safeOffset);

    return rows.map((row) => ({
      club_id: Number(row.clubId || 0),
      bucket_id: Number(row.bucketId || 0),
      bucket_name: String(row.bucketName || "").trim() || `Bucket ${row.bucketId}`,
      bucket_map_count: Number(row.bucketMapCount || 0),
      bucket_active: Number(row.bucketActive || 0) > 0,
      map_uid: String(row.mapUid || "").trim(),
      slot: Number(row.slot || 0),
      map_name: String(row.mapName || "").trim() || String(row.mapUid || "").trim(),
      author_account_id: normalizeAccountId(row.authorAccountId),
      first_seen_at: toNullableIso(row.firstSeenAt) || null,
      last_seen_at: toNullableIso(row.lastSeenAt) || null,
      updated_at: toNullableIso(row.updatedAt) || null,
    }));
  }

  listAlteredMapUids({ trackedOnly = true, limit = 100000 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 500000, fallback: 100000 });
    const rows = this.db
      .prepare(
        `
        SELECT map_uid AS mapUid
        FROM altered_maps
        WHERE (? = 0 OR (tracked = 1 AND LOWER(COALESCE(status, '')) = 'live'))
        ORDER BY map_uid ASC
        LIMIT ?
        `
      )
      .all(trackedOnly ? 1 : 0, safeLimit);

    return uniqueBy(
      rows
        .map((row) =>
          String(row.mapUid || "")
            .trim()
            .toLowerCase()
        )
        .filter(Boolean),
      (mapUid) => mapUid
    );
  }

  listMostPlayedAlterationsMaps({ limit = 50, offset = 0 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 2000, fallback: 50 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    return this.db
      .prepare(
        `
        SELECT
          m.map_uid AS mapUid,
          m.name AS mapName,
          COALESCE(c.name, 'Unassigned') AS campaignName,
          COALESCE(p.slot, 0) AS slot,
          m.player_count AS playerCount,
          m.wr_holder AS wrHolder,
          m.wr_ms AS wrMs,
          m.wr_updated_at AS wrUpdatedAt,
          m.author_time AS authorTime,
          m.gold_time AS goldTime,
          m.silver_time AS silverTime,
          m.bronze_time AS bronzeTime
        FROM altered_maps m
        LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
        LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
        ORDER BY m.player_count DESC, m.name COLLATE NOCASE ASC
        LIMIT ?
        OFFSET ?
        `
      )
      .all(safeLimit, safeOffset)
      .map((row) => ({
        map_uid: row.mapUid,
        map_name: row.mapName || row.mapUid,
        campaign_name: row.campaignName || "Unassigned",
        slot: Number(row.slot || 0),
        player_count: Number(row.playerCount || 0),
        wr_holder: row.wrHolder || null,
        wr_ms: Number(row.wrMs || 0) || null,
        wr_updated_at: row.wrUpdatedAt || null,
        author_time: Number(row.authorTime || 0),
        gold_time: Number(row.goldTime || 0),
        silver_time: Number(row.silverTime || 0),
        bronze_time: Number(row.bronzeTime || 0),
      }));
  }
}

export { AlteredCatalogMapRepository };
