import {
  buildWrLeaderboardsFromTrackerMaps,
  clampInt,
  collectAllWrLeaderboardAccountIds,
  groupLeaderboardBuckets,
  mergeWrDisplayNamesFromTracker,
  sortOverallWrRows,
  toText,
} from "../serviceSupport.js";

function emptyMedalPayload(note) {
  return {
    available: false,
    note,
    sampled_at: null,
    maps_sampled: 0,
    top_by_medal: { author: [], gold: [], silver: [], bronze: [] },
  };
}

function normalizeLeaderboardOptions({
  limit = 50,
  mapsOffset = 0,
  overallLimit = 5000,
  overallOffset = 0,
  perBucketLimit = 10,
  includeMaps = true,
  includeBuckets = true,
  includeMedals = true,
} = {}) {
  return {
    limit: clampInt(limit, { min: 1, max: 500, fallback: 50 }),
    mapsOffset: clampInt(mapsOffset, { min: 0, max: 2000000, fallback: 0 }),
    overallLimit: clampInt(overallLimit, { min: 1, max: 5000, fallback: 400 }),
    overallOffset: clampInt(overallOffset, { min: 0, max: 2000000, fallback: 0 }),
    perBucketLimit: clampInt(perBucketLimit, { min: 1, max: 50, fallback: 10 }),
    includeMaps: includeMaps !== false,
    includeBuckets: includeBuckets !== false,
    includeMedals: includeMedals !== false,
  };
}

function loadStoredLeaderboardData(repository, options) {
  const mostPlayedMaps = options.includeMaps
    ? repository.catalog.listMostPlayedAlterationsMaps({ limit: options.limit, offset: options.mapsOffset })
    : [];
  const overall = repository.leaderboard.listWrLeaderboardOverall({
    limit: options.overallLimit,
    offset: options.overallOffset,
  });
  const bySeasonRows = options.includeBuckets
    ? repository.leaderboard.listWrLeaderboardBySeason({
        perBucketLimit: options.perBucketLimit,
        maxRows: options.perBucketLimit * 24,
      })
    : [];
  const byCampaignRows = options.includeBuckets
    ? repository.leaderboard.listWrLeaderboardByCampaign({
        perBucketLimit: options.perBucketLimit,
        maxRows: options.perBucketLimit * 800,
      })
    : [];
  const bySlotRows = options.includeBuckets
    ? repository.leaderboard.listWrLeaderboardBySlot({
        perBucketLimit: options.perBucketLimit,
        maxRows: options.perBucketLimit * 40,
      })
    : [];
  return {
    mostPlayedMaps,
    baseStats: repository.catalog.getAlterationsStats(),
    wrSummary: repository.leaderboard.getWrLeaderboardSummary(),
    rows: { overall, bySeasonRows, byCampaignRows, bySlotRows },
  };
}

function readBucketRows(payload, camelKey, snakeKey) {
  if (Array.isArray(payload?.[camelKey])) return payload[camelKey];
  return Array.isArray(payload?.[snakeKey]) ? payload[snakeKey] : [];
}

function trackerPayloadRows(payload, options) {
  const overall = Array.isArray(payload?.overall) ? payload.overall : [];
  if (!overall.length) return null;
  return {
    rows: {
      overall: overall.slice(options.overallOffset, options.overallOffset + options.overallLimit),
      bySeasonRows: readBucketRows(payload, "bySeasonRows", "by_season_rows"),
      byCampaignRows: readBucketRows(payload, "byCampaignRows", "by_campaign_rows"),
      bySlotRows: readBucketRows(payload, "bySlotRows", "by_slot_rows"),
    },
    summary: {
      unique_players: Number(payload?.summary?.uniquePlayers || overall.length),
      total_wrs: Number(
        payload?.summary?.totalWrs || overall.reduce((sum, row) => sum + Number(row?.wr_count || 0), 0)
      ),
    },
    source: payload?.source || "tracker-leaderboard-rank-one",
  };
}

function trackerMapFallbackRows(maps, options) {
  const fallback = buildWrLeaderboardsFromTrackerMaps(maps);
  if (!fallback.overall.length) return null;
  const withinBucketLimit = (row) => Number(row.rank || 0) <= options.perBucketLimit;
  return {
    rows: {
      overall: fallback.overall.slice(options.overallOffset, options.overallOffset + options.overallLimit),
      bySeasonRows: fallback.by_season_rows.filter(withinBucketLimit),
      byCampaignRows: fallback.by_campaign_rows.filter(withinBucketLimit),
      bySlotRows: fallback.by_slot_rows.filter(withinBucketLimit),
    },
    summary: {
      unique_players: Number(fallback.overall.length || 0),
      total_wrs: fallback.overall.reduce((sum, row) => sum + Number(row?.wr_count || 0), 0),
    },
    source: "tracker-fallback",
  };
}

async function resolveLeaderboardRows({ storedRows, trackerCoverageClient, options }) {
  if (storedRows.overall.length) return { rows: storedRows, summary: null, source: "altered-db" };
  const leaderboardResult = await trackerCoverageClient.getLeaderboardWrLeaderboards({
    overallLimit: options.overallLimit + options.overallOffset,
    overallOffset: 0,
    perBucketLimit: options.perBucketLimit,
    includeBuckets: options.includeBuckets,
  });
  const trackerRows = trackerPayloadRows(leaderboardResult?.ok ? leaderboardResult.data || {} : {}, options);
  if (trackerRows) return trackerRows;

  const mapsResult = await trackerCoverageClient.getTrackedMaps(60000);
  if (!mapsResult?.ok) return { rows: storedRows, summary: null, source: "altered-db" };
  return (
    trackerMapFallbackRows(mapsResult?.data?.maps || [], options) || {
      rows: storedRows,
      summary: null,
      source: "altered-db",
    }
  );
}

async function resolveLeaderboardNames({ resolved, playerIdentityService }) {
  const accountIds = collectAllWrLeaderboardAccountIds({
    wrOverall: resolved.rows.overall,
    wrBySeasonRows: resolved.rows.bySeasonRows,
    wrByCampaignRows: resolved.rows.byCampaignRows,
    wrBySlotRows: resolved.rows.bySlotRows,
  });
  const namesByAccountId = accountIds.length
    ? await playerIdentityService.resolvePlayerNamesByAccountIds(accountIds, {
        chunkSize: 100,
        external: resolved.source !== "tracker-leaderboard-rank-one",
      })
    : {};
  const namedRows = mergeWrDisplayNamesFromTracker({
    wrOverall: resolved.rows.overall,
    wrBySeasonRows: resolved.rows.bySeasonRows,
    wrByCampaignRows: resolved.rows.byCampaignRows,
    wrBySlotRows: resolved.rows.bySlotRows,
    namesByAccountId,
  });
  return {
    ...resolved,
    rows: {
      overall: sortOverallWrRows(namedRows.overall),
      bySeasonRows: namedRows.bySeasonRows,
      byCampaignRows: namedRows.byCampaignRows,
      bySlotRows: namedRows.bySlotRows,
    },
  };
}

async function loadMedalPayload({ trackerClient, options }) {
  if (!options.includeMedals) return emptyMedalPayload("Medal payload disabled for this request.");
  const result = await trackerClient.getMedalLeaderboards(options.limit);
  if (!result?.ok) {
    return emptyMedalPayload(toText(result?.error) || "Tracker medal leaderboard endpoint is unavailable.");
  }
  return {
    available: true,
    note: toText(result?.data?.note) || "Counts are based on tracker leaderboard rows.",
    sampled_at: result?.data?.sampledAt || new Date().toISOString(),
    maps_sampled: Number(result?.data?.mapsSampled || 0),
    top_by_medal: result?.data?.topByMedal || { author: [], gold: [], silver: [], bronze: [] },
  };
}

function buildPaging({ options, mostPlayedMaps, overall, uniqueWrPlayers }) {
  const hasMoreMaps = options.includeMaps && mostPlayedMaps.length >= options.limit;
  const hasMorePlayers = options.overallOffset + overall.length < uniqueWrPlayers;
  return {
    maps: {
      limit: options.limit,
      offset: options.mapsOffset,
      count: mostPlayedMaps.length,
      has_more: hasMoreMaps,
      next_offset: hasMoreMaps ? options.mapsOffset + mostPlayedMaps.length : null,
    },
    overall_players: {
      limit: options.overallLimit,
      offset: options.overallOffset,
      count: overall.length,
      total: uniqueWrPlayers,
      has_more: hasMorePlayers,
      next_offset: hasMorePlayers ? options.overallOffset + overall.length : null,
    },
  };
}

function buildCoverageSummary(trackerCoverage, baseStats) {
  return {
    total_maps: Number(trackerCoverage.totalMaps || baseStats?.activelyTracked || 0),
    maps_with_known_wr: Number(trackerCoverage.mapsWithKnownWr || 0),
    maps_with_leaderboard_rows: Number(trackerCoverage.mapsWithLeaderboardRows || 0),
    maps_with_extended_leaderboard: Number(trackerCoverage.mapsWithExtendedLeaderboard || 0),
    leaderboard_rows_stored: Number(trackerCoverage.leaderboardRowsStored || 0),
    max_rows_per_map: Number(trackerCoverage.maxRowsPerMap || 0),
    avg_rows_per_map: Number(trackerCoverage.avgRowsPerMap || 0),
    avg_rows_per_covered_map: Number(trackerCoverage.avgRowsPerCoveredMap || 0),
    wr_coverage_pct: Number(trackerCoverage.wrCoveragePct || 0),
    leaderboard_coverage_pct: Number(trackerCoverage.leaderboardCoveragePct || 0),
    extended_coverage_pct: Number(trackerCoverage.extendedCoveragePct || 0),
  };
}

function buildLeaderboardPayload({ options, stored, resolved, trackerCoverageResult, medals }) {
  const overall = resolved.rows.overall;
  const fallbackTotalWrs = overall.reduce((sum, row) => sum + Number(row?.wr_count || 0), 0);
  const totalWrs = Number(resolved.summary?.total_wrs || stored.wrSummary?.total_wrs || fallbackTotalWrs);
  const uniqueWrPlayers = Number(
    resolved.summary?.unique_players || stored.wrSummary?.unique_players || overall.length
  );
  const trackerCoverage =
    trackerCoverageResult?.ok && trackerCoverageResult?.data?.coverage ? trackerCoverageResult.data.coverage : {};
  return {
    generated_at: new Date().toISOString(),
    limits: {
      maps: options.limit,
      maps_offset: options.mapsOffset,
      overall_players: options.overallLimit,
      overall_offset: options.overallOffset,
      per_bucket_players: options.perBucketLimit,
    },
    paging: buildPaging({ options, mostPlayedMaps: stored.mostPlayedMaps, overall, uniqueWrPlayers }),
    summary: {
      total_maps: Number(stored.baseStats?.totalMaps || 0),
      active_maps: Number(stored.baseStats?.activelyTracked || 0),
      unique_wr_players: uniqueWrPlayers,
      wr_source: resolved.source,
      total_wrs: totalWrs,
      page_wr_players: overall.length,
      leaderboard_coverage: buildCoverageSummary(trackerCoverage, stored.baseStats),
    },
    maps: { most_played: stored.mostPlayedMaps },
    wr: {
      overall,
      by_season: options.includeBuckets ? groupLeaderboardBuckets(resolved.rows.bySeasonRows, { order: "season" }) : [],
      by_campaign: options.includeBuckets
        ? groupLeaderboardBuckets(resolved.rows.byCampaignRows, { order: "alpha" })
        : [],
      by_slot: options.includeBuckets ? groupLeaderboardBuckets(resolved.rows.bySlotRows, { order: "slot" }) : [],
    },
    medals,
  };
}

export {
  buildLeaderboardPayload,
  emptyMedalPayload,
  loadMedalPayload,
  loadStoredLeaderboardData,
  normalizeLeaderboardOptions,
  resolveLeaderboardNames,
  resolveLeaderboardRows,
  trackerMapFallbackRows,
  trackerPayloadRows,
};
