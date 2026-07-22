import {
  buildCampaignCatalogMetadata,
  clampInt,
  parseJsonSafe,
  slugifyText,
  toText,
  uniqueBy,
  ALTERATION_VALUE_SEPARATOR,
} from "../alteredRepositorySupport.js";

class AlteredCatalogCampaignRepository {
  constructor(db) {
    this.db = db;
  }

  getAlterationsMapFilters() {
    const seasons = this.db
      .prepare(
        `
        SELECT DISTINCT season
        FROM altered_map_name_candidates
        WHERE season IS NOT NULL AND TRIM(season) <> ''
        ORDER BY
          CASE LOWER(season)
            WHEN 'winter' THEN 1
            WHEN 'spring' THEN 2
            WHEN 'summer' THEN 3
            WHEN 'fall' THEN 4
            ELSE 5
          END,
          season COLLATE NOCASE ASC
        `
      )
      .all()
      .map((row) => row.season)
      .filter(Boolean);
    const years = this.db
      .prepare(
        `
        SELECT DISTINCT year
        FROM altered_map_name_candidates
        WHERE year IS NOT NULL
        ORDER BY year DESC
        `
      )
      .all()
      .map((row) => Number(row.year || 0))
      .filter(Boolean);
    const environments = this.db
      .prepare(
        `
        SELECT DISTINCT map_environment AS value
        FROM altered_maps
        WHERE map_environment IS NOT NULL AND TRIM(map_environment) <> ''
        ORDER BY map_environment COLLATE NOCASE ASC
        `
      )
      .all()
      .map((row) => row.value)
      .filter(Boolean);
    const mapTypes = this.db
      .prepare(
        `
        SELECT DISTINCT map_type AS value
        FROM altered_maps
        WHERE map_type IS NOT NULL AND TRIM(map_type) <> ''
        ORDER BY map_type COLLATE NOCASE ASC
        `
      )
      .all()
      .map((row) => row.value)
      .filter(Boolean);
    const seasonTags = [];
    const seasonTagMap = new Map();
    this.listAlterationsCampaigns({ limit: 5000, offset: 0, catalogOnly: true }).rows.forEach((campaign) => {
      const key = toText(campaign.season_key);
      const label = toText(campaign.season_label || campaign.display_name || campaign.name);
      if (!key || !label) return;
      if (!seasonTagMap.has(key)) {
        seasonTagMap.set(key, {
          key,
          label,
          campaign_ids: [],
          campaign_count: 0,
          map_count: 0,
          sort_timestamp_ms: Number(campaign.sort_timestamp_ms || 0) || 0,
        });
      }
      const entry = seasonTagMap.get(key);
      entry.campaign_ids.push(String(campaign.id));
      entry.campaign_count += 1;
      entry.map_count += Number(campaign.map_count || 0);
      entry.sort_timestamp_ms = Math.max(
        Number(entry.sort_timestamp_ms || 0) || 0,
        Number(campaign.sort_timestamp_ms || 0) || 0
      );
    });
    seasonTags.push(
      ...[...seasonTagMap.values()]
        .map((entry) => ({
          key: entry.key,
          label: entry.label,
          campaign_ids: uniqueBy(entry.campaign_ids, (value) => value),
          campaign_count: entry.campaign_count,
          map_count: entry.map_count,
          sort_timestamp_ms: entry.sort_timestamp_ms,
        }))
        .sort((a, b) => {
          const timeDiff = Number(b.sort_timestamp_ms || 0) - Number(a.sort_timestamp_ms || 0);
          if (timeDiff !== 0) return timeDiff;
          return String(a.label || "").localeCompare(String(b.label || ""));
        })
        .map(({ sort_timestamp_ms: _sortTimestampMs, ...entry }) => entry)
    );

    return {
      seasons,
      years,
      season_tags: seasonTags,
      environments,
      map_types: mapTypes,
      statuses: ["active", "paused", "idle"],
      wr_states: ["with_wr", "without_wr"],
    };
  }

  listAlterationsCampaigns({
    limit = 3000,
    offset = 0,
    catalogOnly = false,
    linkedOnly = false,
    alterationSlugs = [],
    alterationIds = [],
  } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 10000, fallback: 3000 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const normalizedAlterationSlugs = uniqueBy(
      (Array.isArray(alterationSlugs) ? alterationSlugs : [alterationSlugs])
        .flatMap((value) => String(value || "").split(","))
        .map((value) => slugifyText(value))
        .filter(Boolean),
      (value) => value
    );
    const normalizedAlterationIds = uniqueBy(
      (Array.isArray(alterationIds) ? alterationIds : [alterationIds])
        .flatMap((value) => String(value || "").split(","))
        .map((value) => clampInt(value, { min: 1, max: 2147483647, fallback: 0 }))
        .filter(Boolean),
      (value) => value
    );
    const rows = this.db
      .prepare(
        `
        SELECT
          c.club_id AS clubId,
          c.campaign_id AS campaignDbId,
          c.external_campaign_id AS campaignExternalId,
          c.name AS campaignName,
          c.start_timestamp AS startTimestamp,
          c.payload_json AS payloadJson,
          c.created_at AS createdAt,
          c.updated_at AS updatedAt,
          COUNT(m.map_uid) AS mapCount,
          (
            SELECT m2.thumbnail_url
            FROM altered_map_positions p2
            JOIN altered_maps m2 ON m2.map_uid = p2.map_uid
            WHERE p2.campaign_id = c.campaign_id
              AND m2.thumbnail_url IS NOT NULL
              AND m2.thumbnail_url != ''
            LIMIT 1
          ) AS thumbnailUrl,
          alt.alterationIdsCsv AS alterationIdsCsv,
          alt.alterationNamesCsv AS alterationNamesCsv,
          alt.alterationSlugsCsv AS alterationSlugsCsv
        FROM altered_campaigns c
        LEFT JOIN altered_map_positions p ON p.campaign_id = c.campaign_id
        LEFT JOIN altered_maps m ON m.map_uid = p.map_uid
        LEFT JOIN (
          SELECT
            ca.campaign_id AS campaignId,
            GROUP_CONCAT(CAST(a.alteration_id AS TEXT), ',') AS alterationIdsCsv,
            GROUP_CONCAT(a.name, '${ALTERATION_VALUE_SEPARATOR}') AS alterationNamesCsv,
            GROUP_CONCAT(COALESCE(a.slug, ''), '${ALTERATION_VALUE_SEPARATOR}') AS alterationSlugsCsv
          FROM altered_campaign_alterations ca
          JOIN altered_alterations a ON a.alteration_id = ca.alteration_id
          GROUP BY ca.campaign_id
        ) alt ON alt.campaignId = c.campaign_id
        GROUP BY c.campaign_id
        HAVING COUNT(m.map_uid) > 0
        `
      )
      .all();

    const filtered = rows
      .map((row) => {
        const meta = buildCampaignCatalogMetadata({
          campaignName: row.campaignName,
          startTimestamp: row.startTimestamp,
          payloadJson: row.payloadJson,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          alterationIdsCsv: row.alterationIdsCsv,
          alterationNamesCsv: row.alterationNamesCsv,
          alterationSlugsCsv: row.alterationSlugsCsv,
        });
        return { row, meta };
      })
      .filter(({ meta }) => {
        if (catalogOnly && !meta.isCatalog) return false;
        if (linkedOnly && !meta.alterations.length) return false;
        if (
          normalizedAlterationSlugs.length &&
          !meta.alterations.some((item) => normalizedAlterationSlugs.includes(item.slug))
        ) {
          return false;
        }
        if (
          normalizedAlterationIds.length &&
          !meta.alterations.some((item) => normalizedAlterationIds.includes(Number(item.id || 0)))
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const timeDiff = Number(b.meta.sortTimestampMs || 0) - Number(a.meta.sortTimestampMs || 0);
        if (timeDiff !== 0) return timeDiff;
        const clubDiff = Number(b.row.clubId || 0) - Number(a.row.clubId || 0);
        if (clubDiff !== 0) return clubDiff;
        return Number(b.row.campaignDbId || 0) - Number(a.row.campaignDbId || 0);
      });

    const total = filtered.length;
    const campaigns = filtered.slice(safeOffset, safeOffset + safeLimit).map(({ row, meta }) => {
      const payload = parseJsonSafe(row.payloadJson, null);
      const sourceKey = toText(payload?.sourceKey || payload?.source_key).toLowerCase();
      return {
        id:
          row.campaignExternalId !== null && row.campaignExternalId !== undefined
            ? String(row.campaignExternalId)
            : String(row.campaignDbId),
        campaign_db_id: Number(row.campaignDbId || 0) || null,
        campaign_external_id: Number(row.campaignExternalId || 0) || null,
        club_id: Number(row.clubId || 0) || null,
        name: row.campaignName || `Campaign ${row.campaignDbId}`,
        display_name: meta.seasonLabel || row.campaignName || `Campaign ${row.campaignDbId}`,
        season: meta.season || null,
        season_year: meta.seasonYear || null,
        season_label: meta.seasonLabel || null,
        season_key: meta.seasonKey || null,
        sort_timestamp_ms: Number(meta.sortTimestampMs || 0) || 0,
        added_at: meta.addedAt || null,
        map_count: Number(row.mapCount || 0),
        thumbnail_url: row.thumbnailUrl || null,
        alteration: meta.primaryAlteration?.name || null,
        alterations: meta.alterations,
        primary_alteration: meta.primaryAlteration || null,
        environment: meta.environment || null,
        car_type: meta.carType || null,
        carType: meta.carType || null,
        campaign_type: meta.campaignType || null,
        source_key: sourceKey || null,
        is_catalog: meta.isCatalog,
        has_alteration: meta.alterations.length > 0,
      };
    });

    return {
      total,
      rows: campaigns,
    };
  }

  resolveCampaignDbId(campaign) {
    if (!campaign) return null;
    const hasNumericId = Boolean(campaign.id) && Number.isFinite(Number(campaign.id));
    const row = this.db
      .prepare(
        hasNumericId
          ? `SELECT campaign_id FROM altered_campaigns
             WHERE external_campaign_id = ? OR campaign_id = ?
             LIMIT 1`
          : `SELECT campaign_id FROM altered_campaigns WHERE name = ? LIMIT 1`
      )
      .get(...(hasNumericId ? [Number(campaign.id), Number(campaign.id)] : [campaign.name]));
    return row ? Number(row.campaign_id) : null;
  }
}

export { AlteredCatalogCampaignRepository };
