const LATEST_CAMPAIGN_JOIN = `
LEFT JOIN (
  SELECT
    mc.map_uid AS map_uid,
    mc.slot AS slot,
    c.campaign_id AS campaign_id,
    c.name AS campaign_name
  FROM map_campaigns mc
  JOIN campaigns c ON c.campaign_id = mc.campaign_id
) cm ON cm.map_uid = m.map_uid
`;

const MAP_CHECK_COUNTS_JOIN = `
LEFT JOIN (
  SELECT
    map_uid AS map_uid,
    COUNT(*) AS check_count,
    SUM(CASE WHEN changed = 1 THEN 1 ELSE 0 END) AS change_count
  FROM tracker_map_checks
  GROUP BY map_uid
) mcc ON mcc.map_uid = m.map_uid
`;

function rowToMap(row) {
  return {
    uid: row.uid,
    mapId: row.mapId,
    name: row.name,
    campaign: row.campaign || "Unassigned",
    campaignId: row.campaignId || null,
    slot: Number(row.slot || 0),
    authorMs: Number(row.authorMs || 0),
    wrMs: Number(row.wrMs || 0),
    wrAccountId: row.wrAccountId || null,
    wrHolder: row.wrHolder || "-",
    wrUpdatedAt: row.wrUpdatedAt || null,
    tracked: Boolean(row.tracked),
    status: row.status || "live",
    checkFrequency: Number(row.checkFrequency || 0),
    checkIntervalSeconds: Number(row.checkFrequency || 0),
    lastCheckedAt: row.lastCheckedAt || null,
    checkCount: Number(row.checkCount || 0),
    changeCount: Number(row.changeCount || 0),
  };
}

function normalizeStatus(value, fallback = "live") {
  const status = String(value || "").toLowerCase();
  if (status === "live" || status === "paused" || status === "archived") return status;
  return fallback;
}

function normalizeIso(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

export { LATEST_CAMPAIGN_JOIN, MAP_CHECK_COUNTS_JOIN, normalizeIso, normalizeStatus, rowToMap };
