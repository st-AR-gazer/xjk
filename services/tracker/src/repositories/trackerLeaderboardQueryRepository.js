import { clampInt, normalizeAccountId } from "../../../shared/valueUtils.js";
import { LATEST_CAMPAIGN_JOIN, normalizeIso } from "./trackerRepositorySupport.js";

class TrackerLeaderboardQueryRepository {
  constructor(db) {
    this.db = db;
  }

  getMedalLeaderboards({ limit = 50, trackedOnly = true } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
    const rows = this.db
      .prepare(
        `
        SELECT
          m.map_uid AS uid,
          m.name AS name,
          COALESCE(cm.campaign_name, 'Unassigned') AS campaign,
          COALESCE(cm.slot, 0) AS slot,
          m.author_time AS authorMs,
          m.gold_time AS goldMs,
          m.silver_time AS silverMs,
          m.bronze_time AS bronzeMs,
          COUNT(
            DISTINCT CASE
              WHEN NULLIF(COALESCE(lb.account_id, ''), '') IS NOT NULL THEN LOWER(TRIM(lb.account_id))
              WHEN NULLIF(COALESCE(lb.display_name, ''), '') IS NOT NULL THEN 'name:' || LOWER(TRIM(lb.display_name))
              ELSE NULL
            END
          ) AS sampledPlayers,
          COUNT(
            DISTINCT CASE
              WHEN m.author_time > 0 AND lb.score > 0 AND lb.score <= m.author_time THEN
                CASE
                  WHEN NULLIF(COALESCE(lb.account_id, ''), '') IS NOT NULL THEN LOWER(TRIM(lb.account_id))
                  WHEN NULLIF(COALESCE(lb.display_name, ''), '') IS NOT NULL THEN 'name:' || LOWER(TRIM(lb.display_name))
                  ELSE NULL
                END
              ELSE NULL
            END
          ) AS authorCount,
          COUNT(
            DISTINCT CASE
              WHEN m.gold_time > 0 AND lb.score > 0 AND lb.score <= m.gold_time THEN
                CASE
                  WHEN NULLIF(COALESCE(lb.account_id, ''), '') IS NOT NULL THEN LOWER(TRIM(lb.account_id))
                  WHEN NULLIF(COALESCE(lb.display_name, ''), '') IS NOT NULL THEN 'name:' || LOWER(TRIM(lb.display_name))
                  ELSE NULL
                END
              ELSE NULL
            END
          ) AS goldCount,
          COUNT(
            DISTINCT CASE
              WHEN m.silver_time > 0 AND lb.score > 0 AND lb.score <= m.silver_time THEN
                CASE
                  WHEN NULLIF(COALESCE(lb.account_id, ''), '') IS NOT NULL THEN LOWER(TRIM(lb.account_id))
                  WHEN NULLIF(COALESCE(lb.display_name, ''), '') IS NOT NULL THEN 'name:' || LOWER(TRIM(lb.display_name))
                  ELSE NULL
                END
              ELSE NULL
            END
          ) AS silverCount,
          COUNT(
            DISTINCT CASE
              WHEN m.bronze_time > 0 AND lb.score > 0 AND lb.score <= m.bronze_time THEN
                CASE
                  WHEN NULLIF(COALESCE(lb.account_id, ''), '') IS NOT NULL THEN LOWER(TRIM(lb.account_id))
                  WHEN NULLIF(COALESCE(lb.display_name, ''), '') IS NOT NULL THEN 'name:' || LOWER(TRIM(lb.display_name))
                  ELSE NULL
                END
              ELSE NULL
            END
          ) AS bronzeCount
        FROM maps m
        ${LATEST_CAMPAIGN_JOIN}
        LEFT JOIN leaderboards lb ON lb.map_uid = m.map_uid
        WHERE (? = 0 OR m.is_tracked = 1)
        GROUP BY m.map_uid
        `
      )
      .all(trackedOnly ? 1 : 0)
      .map((row) => ({
        uid: row.uid,
        name: row.name || row.uid,
        campaign: row.campaign || "Unassigned",
        slot: Number(row.slot || 0),
        authorMs: Number(row.authorMs || 0),
        goldMs: Number(row.goldMs || 0),
        silverMs: Number(row.silverMs || 0),
        bronzeMs: Number(row.bronzeMs || 0),
        sampledPlayers: Number(row.sampledPlayers || 0),
        authorCount: Number(row.authorCount || 0),
        goldCount: Number(row.goldCount || 0),
        silverCount: Number(row.silverCount || 0),
        bronzeCount: Number(row.bronzeCount || 0),
      }));

    const sortBy = (field) =>
      [...rows]
        .filter((row) => Number(row[field] || 0) > 0)
        .sort((a, b) => {
          const diff = Number(b[field] || 0) - Number(a[field] || 0);
          if (diff !== 0) return diff;
          const sampledDiff = Number(b.sampledPlayers || 0) - Number(a.sampledPlayers || 0);
          if (sampledDiff !== 0) return sampledDiff;
          return String(a.name || "").localeCompare(String(b.name || ""), undefined, {
            sensitivity: "base",
          });
        })
        .slice(0, safeLimit);

    return {
      sampledAt: new Date().toISOString(),
      trackedOnly: Boolean(trackedOnly),
      source: "tracker-leaderboards",
      note: "Counts are based on leaderboard rows currently stored by tracker. They expand as more records are ingested.",
      mapsSampled: rows.length,
      topByMedal: {
        author: sortBy("authorCount"),
        gold: sortBy("goldCount"),
        silver: sortBy("silverCount"),
        bronze: sortBy("bronzeCount"),
      },
    };
  }

  getWrFeed(limit = 24) {
    const sql = `
      SELECT
        h.map_uid AS uid,
        m.name AS name,
        COALESCE(cm.campaign_name, 'Unassigned') AS campaign,
        h.record_time AS wrMs,
        h.account_id AS accountId,
        COALESCE(NULLIF(p.latest_display_name, ''), NULLIF(h.display_name, ''), NULLIF(m.wr_display_name, ''), 'Unknown') AS holder,
        h.timestamp AS at
      FROM wr_history h
      JOIN maps m ON m.map_uid = h.map_uid
      LEFT JOIN player_profiles p ON p.account_id = h.account_id
      ${LATEST_CAMPAIGN_JOIN}
      WHERE h.removed = 0
      ORDER BY h.timestamp DESC
      LIMIT ?
    `;
    return this.db
      .prepare(sql)
      .all(Math.max(1, Math.min(Number(limit) || 24, 200)))
      .map((row) => ({
        uid: row.uid,
        name: row.name,
        campaign: row.campaign,
        wrMs: Number(row.wrMs || 0),
        accountId: normalizeAccountId(row.accountId),
        holder: row.holder || "Unknown",
        at: row.at,
      }));
  }

  getLeaderboardFeed(limit = 24) {
    const rows = this.db
      .prepare(
        `
        SELECT
          lb.map_uid AS uid,
          m.name AS name,
          COALESCE(cm.campaign_name, 'Unassigned') AS campaign,
          lb.score AS scoreMs,
          lb.account_id AS accountId,
          COALESCE(NULLIF(p.latest_display_name, ''), NULLIF(lb.display_name, ''), NULLIF(m.wr_display_name, ''), 'Unknown') AS holder,
          lb.timestamp AS at,
          lb.ranking AS ranking
        FROM leaderboards lb
        JOIN maps m ON m.map_uid = lb.map_uid
        LEFT JOIN player_profiles p ON p.account_id = lb.account_id
        ${LATEST_CAMPAIGN_JOIN}
        WHERE lb.ranking = 1
        ORDER BY lb.timestamp DESC
        LIMIT ?
        `
      )
      .all(Math.max(1, Math.min(Number(limit) || 24, 500)));

    return rows.map((row) => ({
      uid: row.uid,
      name: row.name,
      campaign: row.campaign,
      wrMs: Number(row.scoreMs || 0),
      accountId: normalizeAccountId(row.accountId),
      holder: row.holder || "Unknown",
      at: row.at,
      ranking: Number(row.ranking || 1),
    }));
  }

  getLeaderboardWrLeaderboards({
    overallLimit = 300,
    overallOffset = 0,
    perBucketLimit = 10,
    trackedOnly = true,
    includeBuckets = true,
  } = {}) {
    const safeOverallLimit = clampInt(overallLimit, { min: 1, max: 5000, fallback: 300 });
    const safeOverallOffset = clampInt(overallOffset, { min: 0, max: 2000000, fallback: 0 });
    const safePerBucketLimit = clampInt(perBucketLimit, { min: 1, max: 100, fallback: 10 });
    const safeTrackedOnly = trackedOnly ? 1 : 0;
    const safeIncludeBuckets = includeBuckets !== false;

    const rankOneWhere = `
      lb.ranking = 1
      AND COALESCE(lb.score, 0) > 0
      AND (? = 0 OR m.is_tracked = 1)
    `;
    const playerKeyExpr = `
      CASE
        WHEN NULLIF(TRIM(COALESCE(lb.account_id, '')), '') IS NOT NULL
          THEN LOWER(TRIM(lb.account_id))
        ELSE 'name:' || LOWER(TRIM(COALESCE(lb.display_name, 'Unknown')))
      END
    `;
    const displayNameExpr = `
      COALESCE(
        NULLIF(MAX(p.latest_display_name), ''),
        NULLIF(MAX(lb.display_name), ''),
        NULLIF(MAX(lb.account_id), ''),
        'Unknown'
      )
    `;

    const summary =
      this.db
        .prepare(
          `
          WITH grouped AS (
            SELECT
              ${playerKeyExpr} AS playerKey,
              COUNT(DISTINCT lb.map_uid) AS wrCount
            FROM leaderboards lb
            JOIN maps m ON m.map_uid = lb.map_uid
            LEFT JOIN player_profiles p ON p.account_id = LOWER(TRIM(lb.account_id))
            WHERE ${rankOneWhere}
            GROUP BY playerKey
          )
          SELECT
            COUNT(*) AS uniquePlayers,
            COALESCE(SUM(wrCount), 0) AS totalWrs
          FROM grouped
          `
        )
        .get(safeTrackedOnly) || {};

    const overall = this.db
      .prepare(
        `
        WITH grouped AS (
          SELECT
            ${playerKeyExpr} AS playerKey,
            LOWER(NULLIF(TRIM(MAX(lb.account_id)), '')) AS accountId,
            ${displayNameExpr} AS displayName,
            COUNT(DISTINCT lb.map_uid) AS wrCount,
            MAX(lb.timestamp) AS latestWrAt
          FROM leaderboards lb
          JOIN maps m ON m.map_uid = lb.map_uid
          LEFT JOIN player_profiles p ON p.account_id = LOWER(TRIM(lb.account_id))
          WHERE ${rankOneWhere}
          GROUP BY playerKey
        )
        SELECT accountId, displayName, wrCount, latestWrAt
        FROM grouped
        ORDER BY wrCount DESC, COALESCE(latestWrAt, '') DESC, displayName COLLATE NOCASE ASC
        LIMIT ?
        OFFSET ?
        `
      )
      .all(safeTrackedOnly, safeOverallLimit, safeOverallOffset)
      .map((row) => ({
        account_id: normalizeAccountId(row.accountId),
        player: row.displayName || row.accountId || "Unknown",
        display_name: row.displayName || row.accountId || "Unknown",
        wr_count: Number(row.wrCount || 0),
        latest_wr_at: normalizeIso(row.latestWrAt),
      }));

    const bucketRows = (bucketSql, orderSql = "bucket COLLATE NOCASE ASC") =>
      this.db
        .prepare(
          `
          WITH grouped AS (
            SELECT
              ${bucketSql} AS bucket,
              ${playerKeyExpr} AS playerKey,
              LOWER(NULLIF(TRIM(MAX(lb.account_id)), '')) AS accountId,
              ${displayNameExpr} AS displayName,
              COUNT(DISTINCT lb.map_uid) AS wrCount,
              MAX(lb.timestamp) AS latestWrAt
            FROM leaderboards lb
            JOIN maps m ON m.map_uid = lb.map_uid
            ${LATEST_CAMPAIGN_JOIN}
            LEFT JOIN player_profiles p ON p.account_id = LOWER(TRIM(lb.account_id))
            WHERE ${rankOneWhere}
            GROUP BY bucket, playerKey
          ),
          ranked AS (
            SELECT
              bucket,
              accountId,
              displayName,
              wrCount,
              latestWrAt,
              ROW_NUMBER() OVER (
                PARTITION BY bucket
                ORDER BY wrCount DESC, COALESCE(latestWrAt, '') DESC, displayName COLLATE NOCASE ASC
              ) AS rank
            FROM grouped
          )
          SELECT bucket, accountId, displayName, wrCount, latestWrAt, rank
          FROM ranked
          WHERE rank <= ?
          ORDER BY ${orderSql}, rank ASC
          `
        )
        .all(safeTrackedOnly, safePerBucketLimit)
        .map((row) => ({
          bucket: row.bucket || "Other",
          account_id: normalizeAccountId(row.accountId),
          player: row.displayName || row.accountId || "Unknown",
          display_name: row.displayName || row.accountId || "Unknown",
          wr_count: Number(row.wrCount || 0),
          latest_wr_at: normalizeIso(row.latestWrAt),
          rank: Number(row.rank || 0),
        }));

    const bySeasonRows = safeIncludeBuckets
      ? bucketRows(
          `
          CASE
            WHEN LOWER(COALESCE(cm.campaign_name, '')) LIKE '%winter%' THEN 'Winter'
            WHEN LOWER(COALESCE(cm.campaign_name, '')) LIKE '%spring%' THEN 'Spring'
            WHEN LOWER(COALESCE(cm.campaign_name, '')) LIKE '%summer%' THEN 'Summer'
            WHEN LOWER(COALESCE(cm.campaign_name, '')) LIKE '%fall%'
              OR LOWER(COALESCE(cm.campaign_name, '')) LIKE '%autumn%' THEN 'Fall'
            ELSE 'Other'
          END
          `,
          `
          CASE bucket
            WHEN 'Winter' THEN 1
            WHEN 'Spring' THEN 2
            WHEN 'Summer' THEN 3
            WHEN 'Fall' THEN 4
            ELSE 5
          END ASC,
          bucket COLLATE NOCASE ASC
          `
        )
      : [];
    const byCampaignRows = safeIncludeBuckets ? bucketRows("COALESCE(cm.campaign_name, 'Unassigned')") : [];
    const bySlotRows = safeIncludeBuckets
      ? bucketRows(
          `
          CASE
            WHEN COALESCE(cm.slot, 0) BETWEEN 1 AND 25 THEN printf('%02d', cm.slot)
            ELSE 'Other'
          END
          `,
          "CASE WHEN bucket = 'Other' THEN 999 ELSE CAST(bucket AS INTEGER) END ASC"
        )
      : [];

    return {
      sampledAt: new Date().toISOString(),
      trackedOnly: Boolean(trackedOnly),
      source: "tracker-leaderboard-rank-one",
      summary: {
        uniquePlayers: Number(summary.uniquePlayers || 0),
        totalWrs: Number(summary.totalWrs || 0),
      },
      overall,
      bySeasonRows,
      byCampaignRows,
      bySlotRows,
    };
  }

  getTopWrAccounts({ limit = 200, trackedOnly = true } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 2000));
    const rows = this.db
      .prepare(
        `
        SELECT
          LOWER(TRIM(m.wr_account_id)) AS accountId,
          COALESCE(NULLIF(pp.latest_display_name, ''), NULLIF(TRIM(m.wr_display_name), ''), 'Unknown') AS displayName,
          COUNT(*) AS wrCount,
          MAX(COALESCE(m.wr_updated_at, '')) AS latestWrAt
        FROM maps m
        LEFT JOIN player_profiles pp ON LOWER(pp.account_id) = LOWER(m.wr_account_id)
        WHERE
          NULLIF(TRIM(COALESCE(m.wr_account_id, '')), '') IS NOT NULL
          AND (? = 0 OR (m.is_tracked = 1 AND m.tracking_status = 'live'))
        GROUP BY LOWER(TRIM(m.wr_account_id))
        ORDER BY wrCount DESC, COALESCE(latestWrAt, '') DESC, accountId ASC
        LIMIT ?
        `
      )
      .all(trackedOnly ? 1 : 0, safeLimit);

    return rows
      .map((row) => ({
        accountId: normalizeAccountId(row.accountId),
        displayName: String(row.displayName || "").trim() || "Unknown",
        wrCount: Number(row.wrCount || 0),
        latestWrAt: normalizeIso(row.latestWrAt, null),
      }))
      .filter((row) => row.accountId);
  }

  getLeaderboardCoverage({ trackedOnly = true } = {}) {
    const row =
      this.db
        .prepare(
          `
          SELECT
            COUNT(*) AS totalMaps,
            SUM(
              CASE
                WHEN (
                  COALESCE(m.wr_time, 0) > 0
                    AND (
                      NULLIF(TRIM(COALESCE(m.wr_account_id, '')), '') IS NOT NULL
                      OR NULLIF(TRIM(COALESCE(m.wr_display_name, '')), '') IS NOT NULL
                    )
                )
                  OR COALESCE(lb.rankOneCount, 0) >= 1
                THEN 1 ELSE 0
              END
            ) AS mapsWithKnownWr,
            SUM(CASE WHEN COALESCE(lb.rowCount, 0) >= 1 THEN 1 ELSE 0 END) AS mapsWithLeaderboardRows,
            SUM(CASE WHEN COALESCE(lb.rowCount, 0) > 1 THEN 1 ELSE 0 END) AS mapsWithExtendedLeaderboard,
            COALESCE(SUM(COALESCE(lb.rowCount, 0)), 0) AS leaderboardRowsStored,
            COALESCE(MAX(COALESCE(lb.rowCount, 0)), 0) AS maxRowsPerMap,
            AVG(CASE WHEN COALESCE(lb.rowCount, 0) > 0 THEN lb.rowCount END) AS avgRowsPerCoveredMap,
            AVG(COALESCE(lb.rowCount, 0)) AS avgRowsPerMap
          FROM maps m
          LEFT JOIN (
            SELECT
              map_uid,
              COUNT(*) AS rowCount,
              SUM(CASE WHEN ranking = 1 AND COALESCE(score, 0) > 0 THEN 1 ELSE 0 END) AS rankOneCount
            FROM leaderboards
            GROUP BY map_uid
          ) lb ON lb.map_uid = m.map_uid
          WHERE (? = 0 OR (m.is_tracked = 1 AND m.tracking_status = 'live'))
          `
        )
        .get(trackedOnly ? 1 : 0) || {};

    const totalMaps = Number(row.totalMaps || 0);
    const mapsWithKnownWr = Number(row.mapsWithKnownWr || 0);
    const mapsWithLeaderboardRows = Number(row.mapsWithLeaderboardRows || 0);
    const mapsWithExtendedLeaderboard = Number(row.mapsWithExtendedLeaderboard || 0);
    const leaderboardRowsStored = Number(row.leaderboardRowsStored || 0);

    return {
      trackedOnly: Boolean(trackedOnly),
      totalMaps,
      mapsWithKnownWr,
      mapsWithLeaderboardRows,
      mapsWithExtendedLeaderboard,
      leaderboardRowsStored,
      maxRowsPerMap: Number(row.maxRowsPerMap || 0),
      avgRowsPerCoveredMap: Number(row.avgRowsPerCoveredMap || 0),
      avgRowsPerMap: Number(row.avgRowsPerMap || 0),
      wrCoveragePct: totalMaps > 0 ? (mapsWithKnownWr / totalMaps) * 100 : 0,
      leaderboardCoveragePct: totalMaps > 0 ? (mapsWithLeaderboardRows / totalMaps) * 100 : 0,
      extendedCoveragePct: totalMaps > 0 ? (mapsWithExtendedLeaderboard / totalMaps) * 100 : 0,
    };
  }
}

export { TrackerLeaderboardQueryRepository };
