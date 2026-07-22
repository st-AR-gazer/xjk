const EMPTY_META = Object.freeze({
  projects: 0,
  maps: 0,
  events: 0,
  latestEventAt: null,
  latestChangeAt: null,
});

function queryNumber(db, sql, column = "count") {
  return Number(db.prepare(sql).get()?.[column] || 0);
}

function queryAccountCount(db) {
  const candidates = [
    "SELECT COUNT(*) AS count FROM accounts",
    "SELECT COUNT(DISTINCT account_id) AS count FROM account_display_name_current NOT INDEXED",
    "SELECT COUNT(DISTINCT account_id) AS count FROM account_display_name_history NOT INDEXED",
  ];

  for (const sql of candidates) {
    try {
      return queryNumber(db, sql);
    } catch {}
  }
  return 0;
}

function queryOverviewCounts(db) {
  const lastIngestAt =
    db.prepare("SELECT finished_at AS at FROM ingest_runs ORDER BY finished_at DESC LIMIT 1").get()?.at || null;
  return {
    projects: queryNumber(db, "SELECT COUNT(*) AS count FROM projects"),
    instances: queryNumber(db, "SELECT COUNT(*) AS count FROM project_instances"),
    onlineInstances: queryNumber(
      db,
      `
      SELECT COUNT(*) AS count
      FROM project_instances
      WHERE status = 'online'
        AND julianday(last_heartbeat_at) >= julianday('now') - (10.0 / 1440.0)
      `
    ),
    ingestRuns: queryNumber(db, "SELECT COUNT(*) AS count FROM ingest_runs"),
    eventsChanged: queryNumber(db, "SELECT COUNT(*) AS count FROM map_events WHERE changed = 1"),
    accounts: queryAccountCount(db),
    displayNames: queryNumber(db, "SELECT COUNT(*) AS count FROM account_display_name_current"),
    clubs: queryNumber(db, "SELECT COUNT(*) AS count FROM clubs"),
    clubCampaigns: queryNumber(db, "SELECT COUNT(*) AS count FROM club_campaigns"),
    clubMaps: queryNumber(
      db,
      `
      SELECT
        (SELECT COUNT(*) FROM club_campaign_maps) +
        (SELECT COUNT(*) FROM club_upload_maps) AS count
      `
    ),
    clubMembers: queryNumber(db, "SELECT COUNT(*) AS count FROM club_members"),
    lastIngestAt,
  };
}

function queryFreshness(db) {
  const row =
    db
      .prepare(
        `
        SELECT
          COUNT(*) AS trackedMaps,
          COALESCE(SUM(CASE WHEN latest_checked_at IS NULL THEN 1 ELSE 0 END), 0) AS neverChecked,
          COALESCE(SUM(CASE WHEN julianday(latest_checked_at) >= julianday('now') - (6.0 / 24.0) THEN 1 ELSE 0 END), 0) AS checked6h,
          COALESCE(SUM(CASE WHEN julianday(latest_checked_at) >= julianday('now') - (24.0 / 24.0) THEN 1 ELSE 0 END), 0) AS checked24h,
          COALESCE(SUM(CASE WHEN julianday(latest_checked_at) >= julianday('now') - 7.0 THEN 1 ELSE 0 END), 0) AS checked7d,
          MIN(latest_checked_at) AS oldestCheckedAt,
          MAX(latest_checked_at) AS newestCheckedAt
        FROM project_maps
        `
      )
      .get() || {};
  const trackedMaps = Number(row.trackedMaps || 0);
  const checked24h = Number(row.checked24h || 0);
  const checked7d = Number(row.checked7d || 0);
  return {
    trackedMaps,
    checked6h: Number(row.checked6h || 0),
    checked24h,
    checked7d,
    stale24h: Math.max(0, trackedMaps - checked24h),
    stale7d: Math.max(0, trackedMaps - checked7d),
    neverChecked: Number(row.neverChecked || 0),
    oldestCheckedAt: row.oldestCheckedAt || null,
    newestCheckedAt: row.newestCheckedAt || null,
  };
}

function queryThroughput(db) {
  const eventRow =
    db
      .prepare(
        `
        SELECT
          COUNT(*) AS checks24h,
          COALESCE(SUM(changed), 0) AS changes24h,
          COALESCE(
            SUM(CASE WHEN note IS NOT NULL AND LOWER(note) LIKE 'error:%' THEN 1 ELSE 0 END),
            0
          ) AS errors24h
        FROM map_events
        WHERE julianday(checked_at) >= julianday('now') - (24.0 / 24.0)
        `
      )
      .get() || {};
  const runRow =
    db
      .prepare(
        `
        SELECT
          COUNT(*) AS runs24h,
          COALESCE(SUM(maps_checked), 0) AS mapsChecked24h,
          COALESCE(SUM(wr_changes), 0) AS wrChanges24h,
          COALESCE(AVG((julianday(finished_at) - julianday(started_at)) * 86400.0), 0) AS avgRunDurationSeconds24h,
          COALESCE(MAX((julianday(finished_at) - julianday(started_at)) * 86400.0), 0) AS maxRunDurationSeconds24h
        FROM ingest_runs
        WHERE julianday(finished_at) >= julianday('now') - (24.0 / 24.0)
        `
      )
      .get() || {};
  return {
    checks: Number(eventRow.checks24h || 0),
    changes: Number(eventRow.changes24h || 0),
    errors: Number(eventRow.errors24h || 0),
    runs: Number(runRow.runs24h || 0),
    mapsChecked: Number(runRow.mapsChecked24h || 0),
    wrChanges: Number(runRow.wrChanges24h || 0),
    avgRunDurationSeconds: Number(runRow.avgRunDurationSeconds24h || 0),
    maxRunDurationSeconds: Number(runRow.maxRunDurationSeconds24h || 0),
  };
}

function queryInstanceHealth(db) {
  const row =
    db
      .prepare(
        `
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN status <> 'online'
                  OR julianday(last_heartbeat_at) < julianday('now') - (10.0 / 1440.0)
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS staleOrOfflineInstances,
          COALESCE(AVG((julianday('now') - julianday(last_heartbeat_at)) * 86400.0), 0) AS avgHeartbeatAgeSeconds,
          COALESCE(MAX((julianday('now') - julianday(last_heartbeat_at)) * 86400.0), 0) AS maxHeartbeatAgeSeconds
        FROM project_instances
        `
      )
      .get() || {};
  return {
    staleOrOfflineInstances: Number(row.staleOrOfflineInstances || 0),
    avgHeartbeatAgeSeconds: Number(row.avgHeartbeatAgeSeconds || 0),
    maxHeartbeatAgeSeconds: Number(row.maxHeartbeatAgeSeconds || 0),
  };
}

function queryNameHealth(db, { accounts, displayNames }) {
  const row =
    db
      .prepare(
        `
        SELECT
          COALESCE(
            SUM(CASE WHEN julianday(observed_at) >= julianday('now') - (24.0 / 24.0) THEN 1 ELSE 0 END),
            0
          ) AS observed24h,
          COALESCE(
            SUM(CASE WHEN julianday(observed_at) < julianday('now') - 20.0 THEN 1 ELSE 0 END),
            0
          ) AS stale20d,
          MAX(observed_at) AS lastObservedAt
        FROM account_display_name_current
        `
      )
      .get() || {};
  let renameEvents30d = 0;
  try {
    renameEvents30d = queryNumber(
      db,
      `
      SELECT COUNT(*) AS count
      FROM account_display_name_history
      WHERE julianday(valid_from) >= julianday('now') - 30.0
      `
    );
  } catch {}

  return {
    observed24h: Number(row.observed24h || 0),
    stale20d: Number(row.stale20d || 0),
    renameEvents30d,
    missingDisplayNames: Math.max(0, accounts - displayNames),
    coveragePct: accounts > 0 ? (displayNames / accounts) * 100 : 0,
    lastObservedAt: row.lastObservedAt || null,
  };
}

function queryStorage(db) {
  const pageCount = queryNumber(db, "PRAGMA page_count", "page_count");
  const pageSize = queryNumber(db, "PRAGMA page_size", "page_size");
  const freeBytes = queryNumber(db, "PRAGMA freelist_count", "freelist_count") * pageSize;
  const dbBytes = pageCount * pageSize;
  return {
    pageCount,
    pageSize,
    dbBytes,
    usedBytes: Math.max(0, dbBytes - freeBytes),
    freeBytes,
  };
}

function queryTopProjects(db) {
  try {
    return db
      .prepare(
        `
        SELECT
          p.project_key AS projectKey,
          p.display_name AS projectName,
          COALESCE(SUM(pm.check_count), 0) AS checks,
          COALESCE(SUM(pm.change_count), 0) AS changes,
          COALESCE(COUNT(pm.map_uid), 0) AS trackedMaps
        FROM projects p
        LEFT JOIN project_maps pm NOT INDEXED ON pm.project_key = p.project_key
        GROUP BY p.project_key, p.display_name
        ORDER BY checks DESC, changes DESC, trackedMaps DESC
        LIMIT 8
        `
      )
      .all()
      .map((row) => ({
        projectKey: row.projectKey,
        projectName: row.projectName || row.projectKey,
        checks: Number(row.checks || 0),
        changes: Number(row.changes || 0),
        trackedMaps: Number(row.trackedMaps || 0),
      }));
  } catch {
    return [];
  }
}

function loadMetricsOverview(db, adminDataRepository) {
  const base = adminDataRepository.getMeta();
  const counts = queryOverviewCounts(db);
  const throughput = queryThroughput(db);
  return {
    ...base,
    ...counts,
    storage: queryStorage(db),
    freshness: queryFreshness(db),
    throughput24h: {
      checks: throughput.checks,
      changes: throughput.changes,
      errors: throughput.errors,
      runs: throughput.runs,
      mapsChecked: throughput.mapsChecked,
      wrChanges: throughput.wrChanges,
    },
    rates: {
      changeRateOverallPct: base.events > 0 ? (counts.eventsChanged / base.events) * 100 : 0,
      changeRate24hPct: throughput.checks > 0 ? (throughput.changes / throughput.checks) * 100 : 0,
      errorRate24hPct: throughput.checks > 0 ? (throughput.errors / throughput.checks) * 100 : 0,
    },
    runHealth: {
      avgRunDurationSeconds24h: throughput.avgRunDurationSeconds,
      maxRunDurationSeconds24h: throughput.maxRunDurationSeconds,
      avgMapsPerRun24h: throughput.runs > 0 ? throughput.mapsChecked / throughput.runs : 0,
      avgWrChangesPerRun24h: throughput.runs > 0 ? throughput.wrChanges / throughput.runs : 0,
    },
    instanceHealth: queryInstanceHealth(db),
    nameHealth: queryNameHealth(db, counts),
    topProjects: queryTopProjects(db),
  };
}

function createDegradedMetricsOverview(adminDataRepository, error) {
  let base = EMPTY_META;
  try {
    base = adminDataRepository.getMeta();
  } catch {}

  return {
    ...base,
    projects: Number(base.projects || 0),
    instances: 0,
    onlineInstances: 0,
    ingestRuns: 0,
    eventsChanged: 0,
    accounts: 0,
    displayNames: 0,
    clubs: 0,
    clubCampaigns: 0,
    clubMaps: 0,
    clubMembers: 0,
    lastIngestAt: null,
    degraded: true,
    degradedReason: String(error?.message || error || "database issue"),
    storage: { pageCount: 0, pageSize: 0, dbBytes: 0, usedBytes: 0, freeBytes: 0 },
    freshness: {
      trackedMaps: 0,
      checked6h: 0,
      checked24h: 0,
      checked7d: 0,
      stale24h: 0,
      stale7d: 0,
      neverChecked: 0,
      oldestCheckedAt: null,
      newestCheckedAt: null,
    },
    throughput24h: { checks: 0, changes: 0, errors: 0, runs: 0, mapsChecked: 0, wrChanges: 0 },
    rates: { changeRateOverallPct: 0, changeRate24hPct: 0, errorRate24hPct: 0 },
    runHealth: {
      avgRunDurationSeconds24h: 0,
      maxRunDurationSeconds24h: 0,
      avgMapsPerRun24h: 0,
      avgWrChangesPerRun24h: 0,
    },
    instanceHealth: { staleOrOfflineInstances: 0, avgHeartbeatAgeSeconds: 0, maxHeartbeatAgeSeconds: 0 },
    nameHealth: {
      observed24h: 0,
      stale20d: 0,
      renameEvents30d: 0,
      missingDisplayNames: 0,
      coveragePct: 0,
      lastObservedAt: null,
    },
    topProjects: [],
  };
}

export { createDegradedMetricsOverview, loadMetricsOverview };
