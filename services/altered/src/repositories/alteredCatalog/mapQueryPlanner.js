import {
  clampInt,
  mapStatusWhereClause,
  mapWrStateWhereClause,
  normalizeRandomSeed,
  slugifyText,
  toText,
  ALTERATION_VALUE_SEPARATOR,
} from "../alteredRepositorySupport.js";
import { normalizeCommaSeparatedValues } from "../../domain/alterationMapFilters.js";

function normalizeAlterationMapQuery({
  limit = 50000,
  offset = 0,
  q = "",
  sort = "name",
  campaignIds = [],
  excludeCampaignIds = [],
  status = "",
  statuses = [],
  excludeStatuses = [],
  season = "",
  year = null,
  alterationSlugs = [],
  excludeAlterationSlugs = [],
  alterationIds = [],
  mapNumber = null,
  environment = "",
  environments = [],
  excludeEnvironments = [],
  mapType = "",
  mapTypes = [],
  excludeMapTypes = [],
  hasWr = undefined,
  wrStates = [],
  excludeWrStates = [],
  randomSeed = "",
} = {}) {
  const safeLimit = clampInt(limit, { min: 1, max: 100000, fallback: 50000 });
  const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
  const normalizedQuery = toText(q).toLowerCase();
  const normalizedSeason = toText(season);
  const normalizedRandomSeed = normalizeRandomSeed(randomSeed);
  const normalizedMapNumber = clampInt(mapNumber, {
    min: 1,
    max: 999,
    fallback: 0,
  });
  const normalizedYear = clampInt(year, {
    min: 1900,
    max: 2500,
    fallback: 0,
  });
  const isCampaignId = (value) => /^\d+$/.test(value);
  const normalizeLowercase = (value) => toText(value).toLowerCase();
  const isTrackingStatus = (value) => value === "active" || value === "paused" || value === "idle";
  const isWrState = (value) => value === "with_wr" || value === "without_wr";
  const caseInsensitiveKey = (value) => value.toLowerCase();
  const normalizedCampaignIds = normalizeCommaSeparatedValues(campaignIds, { isAllowed: isCampaignId });
  const normalizedExcludeCampaignIds = normalizeCommaSeparatedValues(excludeCampaignIds, {
    isAllowed: isCampaignId,
  });
  const normalizedStatuses = normalizeCommaSeparatedValues(Array.isArray(statuses) ? statuses : [statuses, status], {
    normalize: normalizeLowercase,
    isAllowed: isTrackingStatus,
  });
  const normalizedExcludeStatuses = normalizeCommaSeparatedValues(excludeStatuses, {
    normalize: normalizeLowercase,
    isAllowed: isTrackingStatus,
  });
  const normalizedAlterationSlugs = normalizeCommaSeparatedValues(alterationSlugs, {
    normalize: slugifyText,
  });
  const normalizedExcludeAlterationSlugs = normalizeCommaSeparatedValues(excludeAlterationSlugs, {
    normalize: slugifyText,
  });
  const normalizedAlterationIds = normalizeCommaSeparatedValues(alterationIds, {
    normalize: (value) => clampInt(value, { min: 1, max: 2147483647, fallback: 0 }),
  });
  const normalizedEnvironments = normalizeCommaSeparatedValues(
    Array.isArray(environments) ? environments : [environments, environment],
    { makeKey: caseInsensitiveKey }
  );
  const normalizedExcludeEnvironments = normalizeCommaSeparatedValues(excludeEnvironments, {
    makeKey: caseInsensitiveKey,
  });
  const normalizedMapTypes = normalizeCommaSeparatedValues(Array.isArray(mapTypes) ? mapTypes : [mapTypes, mapType], {
    makeKey: caseInsensitiveKey,
  });
  const normalizedExcludeMapTypes = normalizeCommaSeparatedValues(excludeMapTypes, {
    makeKey: caseInsensitiveKey,
  });
  const normalizedWrStates = normalizeCommaSeparatedValues(wrStates, {
    normalize: normalizeLowercase,
    isAllowed: isWrState,
  });
  const normalizedExcludeWrStates = normalizeCommaSeparatedValues(excludeWrStates, {
    normalize: normalizeLowercase,
    isAllowed: isWrState,
  });

  return {
    safeLimit,
    safeOffset,
    normalizedQuery,
    normalizedSeason,
    normalizedRandomSeed,
    normalizedMapNumber,
    normalizedYear,
    normalizedCampaignIds,
    normalizedExcludeCampaignIds,
    normalizedStatuses,
    normalizedExcludeStatuses,
    normalizedAlterationSlugs,
    normalizedExcludeAlterationSlugs,
    normalizedAlterationIds,
    normalizedEnvironments,
    normalizedExcludeEnvironments,
    normalizedMapTypes,
    normalizedExcludeMapTypes,
    normalizedWrStates,
    normalizedExcludeWrStates,
    hasWr,
    sort,
  };
}

function buildAlterationMapWhere({
  normalizedQuery,
  normalizedSeason,
  normalizedMapNumber,
  normalizedYear,
  normalizedCampaignIds,
  normalizedExcludeCampaignIds,
  normalizedStatuses,
  normalizedExcludeStatuses,
  normalizedAlterationSlugs,
  normalizedExcludeAlterationSlugs,
  normalizedAlterationIds,
  normalizedEnvironments,
  normalizedExcludeEnvironments,
  normalizedMapTypes,
  normalizedExcludeMapTypes,
  normalizedWrStates,
  normalizedExcludeWrStates,
  hasWr,
}) {
  const whereClauses = [];
  const params = [];

  if (normalizedCampaignIds.length) {
    whereClauses.push(
      `CAST(COALESCE(c.external_campaign_id, c.campaign_id) AS TEXT) IN (${normalizedCampaignIds
        .map(() => "?")
        .join(", ")})`
    );
    params.push(...normalizedCampaignIds);
  }
  if (normalizedExcludeCampaignIds.length) {
    whereClauses.push(
      `CAST(COALESCE(c.external_campaign_id, c.campaign_id) AS TEXT) NOT IN (${normalizedExcludeCampaignIds
        .map(() => "?")
        .join(", ")})`
    );
    params.push(...normalizedExcludeCampaignIds);
  }

  if (normalizedQuery) {
    const like = `%${normalizedQuery}%`;
    whereClauses.push(
      `(
          LOWER(COALESCE(m.name, '')) LIKE ?
          OR LOWER(COALESCE(m.author, '')) LIKE ?
          OR LOWER(COALESCE(m.wr_holder, '')) LIKE ?
          OR LOWER(COALESCE(m.map_uid, '')) LIKE ?
          OR LOWER(COALESCE(c.name, '')) LIKE ?
        )`
    );
    params.push(like, like, like, like, like);
  }

  if (normalizedStatuses.length) {
    const statusClauses = normalizedStatuses.map((value) => mapStatusWhereClause(value)).filter(Boolean);
    if (statusClauses.length) {
      whereClauses.push(`(${statusClauses.join(" OR ")})`);
    }
  }
  if (normalizedExcludeStatuses.length) {
    const excludedStatusClauses = normalizedExcludeStatuses.map((value) => mapStatusWhereClause(value)).filter(Boolean);
    if (excludedStatusClauses.length) {
      whereClauses.push(`NOT (${excludedStatusClauses.join(" OR ")})`);
    }
  }

  if (normalizedSeason) {
    whereClauses.push("LOWER(COALESCE(n.season, '')) = LOWER(?)");
    params.push(normalizedSeason);
  }

  if (normalizedYear) {
    whereClauses.push("n.year = ?");
    params.push(normalizedYear);
  }

  if (normalizedMapNumber) {
    whereClauses.push("n.map_number = ?");
    params.push(normalizedMapNumber);
  }

  if (normalizedEnvironments.length) {
    whereClauses.push(
      `LOWER(COALESCE(m.map_environment, '')) IN (${normalizedEnvironments.map(() => "LOWER(?)").join(", ")})`
    );
    params.push(...normalizedEnvironments);
  }
  if (normalizedExcludeEnvironments.length) {
    whereClauses.push(
      `LOWER(COALESCE(m.map_environment, '')) NOT IN (${normalizedExcludeEnvironments
        .map(() => "LOWER(?)")
        .join(", ")})`
    );
    params.push(...normalizedExcludeEnvironments);
  }

  if (normalizedMapTypes.length) {
    whereClauses.push(`LOWER(COALESCE(m.map_type, '')) IN (${normalizedMapTypes.map(() => "LOWER(?)").join(", ")})`);
    params.push(...normalizedMapTypes);
  }
  if (normalizedExcludeMapTypes.length) {
    whereClauses.push(
      `LOWER(COALESCE(m.map_type, '')) NOT IN (${normalizedExcludeMapTypes.map(() => "LOWER(?)").join(", ")})`
    );
    params.push(...normalizedExcludeMapTypes);
  }

  if (normalizedWrStates.length) {
    const wrClauses = normalizedWrStates.map((value) => mapWrStateWhereClause(value)).filter(Boolean);
    if (wrClauses.length) {
      whereClauses.push(`(${wrClauses.join(" OR ")})`);
    }
  } else if (hasWr === true) {
    whereClauses.push(mapWrStateWhereClause("with_wr"));
  } else if (hasWr === false) {
    whereClauses.push(mapWrStateWhereClause("without_wr"));
  }
  if (normalizedExcludeWrStates.length) {
    const excludedWrClauses = normalizedExcludeWrStates.map((value) => mapWrStateWhereClause(value)).filter(Boolean);
    if (excludedWrClauses.length) {
      whereClauses.push(`NOT (${excludedWrClauses.join(" OR ")})`);
    }
  }

  if (normalizedAlterationSlugs.length) {
    whereClauses.push(
      `EXISTS (
          SELECT 1
          FROM altered_campaign_alterations ca_filter
          JOIN altered_alterations a_filter ON a_filter.alteration_id = ca_filter.alteration_id
          WHERE ca_filter.campaign_id = c.campaign_id
            AND a_filter.slug IN (${normalizedAlterationSlugs.map(() => "?").join(", ")})
        )`
    );
    params.push(...normalizedAlterationSlugs);
  }
  if (normalizedExcludeAlterationSlugs.length) {
    whereClauses.push(
      `NOT EXISTS (
          SELECT 1
          FROM altered_campaign_alterations ca_filter
          JOIN altered_alterations a_filter ON a_filter.alteration_id = ca_filter.alteration_id
          WHERE ca_filter.campaign_id = c.campaign_id
            AND a_filter.slug IN (${normalizedExcludeAlterationSlugs.map(() => "?").join(", ")})
        )`
    );
    params.push(...normalizedExcludeAlterationSlugs);
  }

  if (normalizedAlterationIds.length) {
    whereClauses.push(
      `EXISTS (
          SELECT 1
          FROM altered_campaign_alterations ca_filter
          WHERE ca_filter.campaign_id = c.campaign_id
            AND ca_filter.alteration_id IN (${normalizedAlterationIds.map(() => "?").join(", ")})
        )`
    );
    params.push(...normalizedAlterationIds);
  }
  return {
    params,
    whereSql: whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "",
  };
}

function buildAlterationMapOrder({ sort, normalizedRandomSeed }) {
  const orderParams = [];
  let orderBy = "ORDER BY m.name COLLATE NOCASE ASC, m.map_uid ASC";
  if (sort === "newest") {
    orderBy = `ORDER BY
        COALESCE(n.updated_at, m.map_updated_at, m.map_created_at, p.updated_at, c.updated_at, c.created_at, m.updated_at, m.created_at, '') DESC,
        m.name COLLATE NOCASE ASC,
        m.map_uid ASC`;
  } else if (sort === "random" || sort === "seeded_random") {
    orderBy = `ORDER BY
        altered_seeded_random(?, m.map_uid) ASC,
        m.map_uid ASC`;
    orderParams.push(normalizedRandomSeed);
  } else if (sort === "campaign_slot" || sort === "position" || sort === "slot") {
    orderBy = `ORDER BY
        COALESCE(p.slot, n.map_number, 9999) ASC,
        m.name COLLATE NOCASE ASC,
        m.map_uid ASC`;
  } else if (sort === "wr_ms") {
    orderBy = `ORDER BY
        CASE WHEN COALESCE(m.wr_ms, 0) > 0 THEN 0 ELSE 1 END ASC,
        COALESCE(m.wr_ms, 2147483647) ASC,
        m.name COLLATE NOCASE ASC,
        m.map_uid ASC`;
  } else if (sort === "author_time") {
    orderBy = `ORDER BY
        CASE WHEN COALESCE(m.author_time, 0) > 0 THEN 0 ELSE 1 END ASC,
        COALESCE(m.author_time, 2147483647) ASC,
        m.name COLLATE NOCASE ASC,
        m.map_uid ASC`;
  } else if (sort === "wr_updated_at" || sort === "latest_wr") {
    orderBy = `ORDER BY
        COALESCE(m.wr_updated_at, '') DESC,
        COALESCE(m.wr_ms, 2147483647) ASC,
        m.name COLLATE NOCASE ASC,
        m.map_uid ASC`;
  } else if (sort === "change_count" || sort === "most_changes") {
    orderBy = `ORDER BY
        COALESCE(wrc.wrChangeCount, 0) DESC,
        COALESCE(m.wr_updated_at, '') DESC,
        m.name COLLATE NOCASE ASC,
        m.map_uid ASC`;
  }
  return { orderBy, orderParams };
}

const ALTERATION_MAP_JOIN_SQL = `
      LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
      LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
      LEFT JOIN altered_map_name_candidates n ON n.map_uid = m.map_uid
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
      LEFT JOIN (
        SELECT map_uid AS mapUid, COUNT(*) AS wrChangeCount
        FROM altered_wr_events
        GROUP BY map_uid
      ) wrc ON wrc.mapUid = m.map_uid
    `;
function buildAlterationMapQuery(options = {}) {
  const normalized = normalizeAlterationMapQuery(options);
  return {
    ...normalized,
    ...buildAlterationMapWhere(normalized),
    ...buildAlterationMapOrder(normalized),
    joinSql: ALTERATION_MAP_JOIN_SQL,
  };
}

export { buildAlterationMapOrder, buildAlterationMapQuery, buildAlterationMapWhere, normalizeAlterationMapQuery };
