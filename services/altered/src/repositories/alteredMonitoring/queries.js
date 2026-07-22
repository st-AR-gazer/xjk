import { clampInt, uniqueBy } from "../alteredRepositorySupport.js";

const KNOWN_ID_QUERIES = Object.freeze({
  campaigns: {
    table: "altered_campaigns",
    column: "external_campaign_id",
    alias: "externalId",
  },
  activities: {
    table: "altered_club_activities",
    column: "activity_id",
    alias: "externalId",
  },
  uploadBuckets: {
    table: "altered_upload_buckets",
    column: "bucket_id",
    alias: "externalId",
  },
});

function normalizePositiveIds(values) {
  return uniqueBy(
    (Array.isArray(values) ? values : [])
      .map((value) => clampInt(value, { min: 1, max: 2147483647, fallback: 0 }))
      .filter(Boolean),
    (value) => value
  );
}

function listKnownIds(db, kind, { clubId, values = [] } = {}) {
  const query = KNOWN_ID_QUERIES[kind];
  if (!query) throw new Error(`Unknown monitoring ID kind: ${kind}`);

  const safeClubId = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 });
  const ids = normalizePositiveIds(values);
  if (!safeClubId || !ids.length) return [];

  const placeholders = ids.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT ${query.column} AS ${query.alias}
       FROM ${query.table}
       WHERE club_id = ? AND ${query.column} IN (${placeholders})`
    )
    .all(safeClubId, ...ids)
    .map((row) => clampInt(row?.[query.alias], { min: 1, max: 2147483647, fallback: 0 }))
    .filter(Boolean);
}

function getClubMonitoringCounts(db, clubId, { global = false } = {}) {
  if (global) {
    return {
      campaignCount: Number(db.prepare("SELECT COUNT(*) AS count FROM altered_campaigns").get()?.count || 0),
      mapCount: Number(db.prepare("SELECT COUNT(*) AS count FROM altered_maps").get()?.count || 0),
      trackedCount: Number(
        db.prepare("SELECT COUNT(*) AS count FROM altered_maps WHERE tracked = 1").get()?.count || 0
      ),
    };
  }

  const campaignCount = db
    .prepare("SELECT COUNT(*) AS count FROM altered_campaigns WHERE club_id = ?")
    .get(clubId)?.count;
  const mapCount = db
    .prepare(
      `SELECT COUNT(DISTINCT p.map_uid) AS count
       FROM altered_map_positions p
       JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
       WHERE c.club_id = ?`
    )
    .get(clubId)?.count;
  const trackedCount = db
    .prepare(
      `SELECT COUNT(DISTINCT m.map_uid) AS count
       FROM altered_maps m
       JOIN altered_map_positions p ON p.map_uid = m.map_uid
       JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
       WHERE c.club_id = ? AND m.tracked = 1`
    )
    .get(clubId)?.count;
  return {
    campaignCount: Number(campaignCount || 0),
    mapCount: Number(mapCount || 0),
    trackedCount: Number(trackedCount || 0),
  };
}

export { getClubMonitoringCounts, listKnownIds, normalizePositiveIds };
