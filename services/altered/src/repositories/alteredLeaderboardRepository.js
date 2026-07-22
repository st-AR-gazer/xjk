import { clampInt } from "./alteredRepositorySupport.js";

class AlteredLeaderboardRepository {
  constructor(db) {
    this.db = db;
  }

  listWrLeaderboardOverall({ limit = 300, offset = 0 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 5000, fallback: 300 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    return this.db
      .prepare(
        `
        SELECT
          TRIM(m.wr_holder) AS player,
          COUNT(*) AS wrCount,
          MAX(COALESCE(m.wr_updated_at, m.updated_at, m.created_at)) AS latestWrAt
        FROM altered_maps m
        WHERE m.wr_ms > 0 AND TRIM(COALESCE(m.wr_holder, '')) != ''
        GROUP BY TRIM(m.wr_holder)
        ORDER BY wrCount DESC, COALESCE(latestWrAt, '') DESC, player COLLATE NOCASE ASC
        LIMIT ?
        OFFSET ?
        `
      )
      .all(safeLimit, safeOffset)
      .map((row) => ({
        player: row.player,
        wr_count: Number(row.wrCount || 0),
        latest_wr_at: row.latestWrAt || null,
      }));
  }

  getWrLeaderboardSummary() {
    const row = this.db
      .prepare(
        `
        WITH grouped AS (
          SELECT
            TRIM(m.wr_holder) AS player,
            COUNT(*) AS wrCount
          FROM altered_maps m
          WHERE m.wr_ms > 0 AND TRIM(COALESCE(m.wr_holder, '')) != ''
          GROUP BY TRIM(m.wr_holder)
        )
        SELECT
          COUNT(*) AS uniquePlayers,
          COALESCE(SUM(wrCount), 0) AS totalWrs
        FROM grouped
        `
      )
      .get();

    return {
      unique_players: Number(row?.uniquePlayers || 0),
      total_wrs: Number(row?.totalWrs || 0),
    };
  }

  listWrLeaderboardByCampaign({ perBucketLimit = 10, maxRows = 4000 } = {}) {
    const safePerBucketLimit = clampInt(perBucketLimit, {
      min: 1,
      max: 100,
      fallback: 10,
    });
    const safeMaxRows = clampInt(maxRows, { min: 1, max: 20000, fallback: 4000 });
    return this.db
      .prepare(
        `
        WITH grouped AS (
          SELECT
            COALESCE(c.name, 'Unassigned') AS bucket,
            TRIM(m.wr_holder) AS player,
            COUNT(*) AS wrCount,
            MAX(COALESCE(m.wr_updated_at, m.updated_at, m.created_at)) AS latestWrAt
          FROM altered_maps m
          LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
          LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
          WHERE m.wr_ms > 0 AND TRIM(COALESCE(m.wr_holder, '')) != ''
          GROUP BY bucket, TRIM(m.wr_holder)
        ),
        ranked AS (
          SELECT
            bucket,
            player,
            wrCount,
            latestWrAt,
            ROW_NUMBER() OVER (
              PARTITION BY bucket
              ORDER BY wrCount DESC, COALESCE(latestWrAt, '') DESC, player COLLATE NOCASE ASC
            ) AS rank
          FROM grouped
        )
        SELECT bucket, player, wrCount, latestWrAt, rank
        FROM ranked
        WHERE rank <= ?
        ORDER BY bucket COLLATE NOCASE ASC, rank ASC
        LIMIT ?
        `
      )
      .all(safePerBucketLimit, safeMaxRows)
      .map((row) => ({
        bucket: row.bucket || "Unassigned",
        player: row.player,
        wr_count: Number(row.wrCount || 0),
        latest_wr_at: row.latestWrAt || null,
        rank: Number(row.rank || 0),
      }));
  }

  listWrLeaderboardBySeason({ perBucketLimit = 10, maxRows = 1000 } = {}) {
    const safePerBucketLimit = clampInt(perBucketLimit, {
      min: 1,
      max: 100,
      fallback: 10,
    });
    const safeMaxRows = clampInt(maxRows, { min: 1, max: 5000, fallback: 1000 });
    return this.db
      .prepare(
        `
        WITH grouped AS (
          SELECT
            CASE
              WHEN LOWER(COALESCE(c.name, '')) LIKE '%winter%' THEN 'Winter'
              WHEN LOWER(COALESCE(c.name, '')) LIKE '%spring%' THEN 'Spring'
              WHEN LOWER(COALESCE(c.name, '')) LIKE '%summer%' THEN 'Summer'
              WHEN LOWER(COALESCE(c.name, '')) LIKE '%fall%' OR LOWER(COALESCE(c.name, '')) LIKE '%autumn%' THEN 'Fall'
              ELSE 'Other'
            END AS bucket,
            TRIM(m.wr_holder) AS player,
            COUNT(*) AS wrCount,
            MAX(COALESCE(m.wr_updated_at, m.updated_at, m.created_at)) AS latestWrAt
          FROM altered_maps m
          LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
          LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
          WHERE m.wr_ms > 0 AND TRIM(COALESCE(m.wr_holder, '')) != ''
          GROUP BY bucket, TRIM(m.wr_holder)
        ),
        ranked AS (
          SELECT
            bucket,
            player,
            wrCount,
            latestWrAt,
            ROW_NUMBER() OVER (
              PARTITION BY bucket
              ORDER BY wrCount DESC, COALESCE(latestWrAt, '') DESC, player COLLATE NOCASE ASC
            ) AS rank
          FROM grouped
        )
        SELECT bucket, player, wrCount, latestWrAt, rank
        FROM ranked
        WHERE rank <= ?
        ORDER BY bucket COLLATE NOCASE ASC, rank ASC
        LIMIT ?
        `
      )
      .all(safePerBucketLimit, safeMaxRows)
      .map((row) => ({
        bucket: row.bucket || "Other",
        player: row.player,
        wr_count: Number(row.wrCount || 0),
        latest_wr_at: row.latestWrAt || null,
        rank: Number(row.rank || 0),
      }));
  }

  listWrLeaderboardBySlot({ perBucketLimit = 10, maxRows = 1000 } = {}) {
    const safePerBucketLimit = clampInt(perBucketLimit, {
      min: 1,
      max: 100,
      fallback: 10,
    });
    const safeMaxRows = clampInt(maxRows, { min: 1, max: 5000, fallback: 1000 });
    return this.db
      .prepare(
        `
        WITH grouped AS (
          SELECT
            CASE
              WHEN COALESCE(p.slot, 0) BETWEEN 1 AND 25 THEN printf('%02d', p.slot)
              ELSE 'Other'
            END AS bucket,
            TRIM(m.wr_holder) AS player,
            COUNT(*) AS wrCount,
            MAX(COALESCE(m.wr_updated_at, m.updated_at, m.created_at)) AS latestWrAt
          FROM altered_maps m
          LEFT JOIN altered_map_positions p ON p.map_uid = m.map_uid
          WHERE m.wr_ms > 0 AND TRIM(COALESCE(m.wr_holder, '')) != ''
          GROUP BY bucket, TRIM(m.wr_holder)
        ),
        ranked AS (
          SELECT
            bucket,
            player,
            wrCount,
            latestWrAt,
            ROW_NUMBER() OVER (
              PARTITION BY bucket
              ORDER BY wrCount DESC, COALESCE(latestWrAt, '') DESC, player COLLATE NOCASE ASC
            ) AS rank
          FROM grouped
        )
        SELECT bucket, player, wrCount, latestWrAt, rank
        FROM ranked
        WHERE rank <= ?
        ORDER BY
          CASE WHEN bucket = 'Other' THEN 999 ELSE CAST(bucket AS INTEGER) END ASC,
          rank ASC
        LIMIT ?
        `
      )
      .all(safePerBucketLimit, safeMaxRows)
      .map((row) => ({
        bucket: row.bucket || "Other",
        player: row.player,
        wr_count: Number(row.wrCount || 0),
        latest_wr_at: row.latestWrAt || null,
        rank: Number(row.rank || 0),
      }));
  }
}

export { AlteredLeaderboardRepository };
