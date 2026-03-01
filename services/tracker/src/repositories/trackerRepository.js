const LATEST_CAMPAIGN_JOIN = `
LEFT JOIN (
  SELECT
    mc.map_uid AS map_uid,
    mc.slot AS slot,
    c.campaign_id AS campaign_id,
    c.name AS campaign_name
  FROM map_campaigns mc
  JOIN campaigns c ON c.campaign_id = mc.campaign_id
  WHERE mc.id IN (SELECT MAX(id) FROM map_campaigns GROUP BY map_uid)
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

function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeStatus(value, fallback = "live") {
  const status = String(value || "").toLowerCase();
  if (status === "live" || status === "paused" || status === "archived") return status;
  return fallback;
}

function normalizeAccountId(value) {
  const accountId = String(value || "").trim().toLowerCase();
  if (!accountId) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(accountId)) {
    return accountId;
  }
  return "";
}

function normalizeIso(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

class TrackerRepository {
  constructor(db) {
    this.db = db;
  }

  getSummary() {
    const trackedMaps =
      this.db.prepare("SELECT COUNT(*) AS count FROM maps WHERE is_tracked = 1").get()?.count || 0;
    const campaignCount =
      this.db
        .prepare(
          `
          SELECT COUNT(DISTINCT c.campaign_id) AS count
          FROM campaigns c
          JOIN map_campaigns mc ON mc.campaign_id = c.campaign_id
          `
        )
        .get()?.count || 0;
    const latestWrAt =
      this.db
        .prepare("SELECT timestamp FROM wr_history WHERE removed = 0 ORDER BY timestamp DESC LIMIT 1")
        .get()?.timestamp || null;

    return {
      trackedMaps: Number(trackedMaps),
      campaignCount: Number(campaignCount),
      latestWrAt,
    };
  }

  getCampaignNames() {
    return this.db
      .prepare(
        `
        SELECT DISTINCT c.name AS name
        FROM campaigns c
        JOIN map_campaigns mc ON mc.campaign_id = c.campaign_id
        ORDER BY c.name COLLATE NOCASE ASC
        `
      )
      .all()
      .map((row) => row.name);
  }

  getMaps({ campaign = "all", q = "", trackedOnly = false, sort = "wr_recent", limit = 800 } = {}) {
    const clauses = [];
    const params = [];
    let orderBy = "ORDER BY COALESCE(m.wr_updated_at, '') DESC, m.name COLLATE NOCASE ASC";

    if (campaign && campaign !== "all") {
      clauses.push("COALESCE(cm.campaign_name, 'Unassigned') = ?");
      params.push(campaign);
    }

    if (trackedOnly) {
      clauses.push("m.is_tracked = 1");
    }

    const query = String(q || "").trim().toLowerCase();
    if (query) {
      clauses.push("(LOWER(m.name) LIKE ? OR LOWER(m.map_uid) LIKE ?)");
      params.push(`%${query}%`, `%${query}%`);
    }

    if (sort === "map_name") {
      orderBy = "ORDER BY m.name COLLATE NOCASE ASC";
    } else if (sort === "campaign") {
      orderBy =
        "ORDER BY COALESCE(cm.campaign_name, 'Unassigned') COLLATE NOCASE ASC, COALESCE(cm.slot, 9999) ASC, m.name COLLATE NOCASE ASC";
    } else if (sort === "wr_time") {
      orderBy = "ORDER BY COALESCE(m.wr_time, 2147483647) ASC, m.name COLLATE NOCASE ASC";
    }

    const sql = `
      SELECT
        m.map_uid AS uid,
        m.map_id AS mapId,
        m.name AS name,
        cm.campaign_name AS campaign,
        cm.campaign_id AS campaignId,
        cm.slot AS slot,
        m.author_time AS authorMs,
        m.wr_time AS wrMs,
        m.wr_display_name AS wrHolder,
        m.wr_updated_at AS wrUpdatedAt,
        m.is_tracked AS tracked,
        m.tracking_status AS status,
        m.check_frequency AS checkFrequency,
        m.last_checked_at AS lastCheckedAt,
        COALESCE(mcc.check_count, 0) AS checkCount,
        COALESCE(mcc.change_count, 0) AS changeCount
      FROM maps m
      ${LATEST_CAMPAIGN_JOIN}
      ${MAP_CHECK_COUNTS_JOIN}
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ${orderBy}
      LIMIT ?
    `;
    params.push(Math.max(1, Math.min(Number(limit) || 800, 2000)));
    const rows = this.db.prepare(sql).all(...params);
    return rows.map(rowToMap);
  }

  getTrackedMaps({ q = "", limit = 250 } = {}) {
    return this.getMaps({
      q,
      trackedOnly: true,
      sort: "campaign",
      limit,
    });
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
      note:
        "Counts are based on leaderboard rows currently stored by tracker. They expand as more records are ingested.",
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
        COALESCE(h.display_name, m.wr_display_name, 'Unknown') AS holder,
        h.timestamp AS at
      FROM wr_history h
      JOIN maps m ON m.map_uid = h.map_uid
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
          lb.display_name AS holder,
          lb.timestamp AS at,
          lb.ranking AS ranking
        FROM leaderboards lb
        JOIN maps m ON m.map_uid = lb.map_uid
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
      holder: row.holder || "Unknown",
      at: row.at,
      ranking: Number(row.ranking || 1),
    }));
  }

  getMapInfo(mapUid) {
    const row = this.db
      .prepare(
        `
        SELECT
          m.map_uid AS uid,
          m.map_id AS mapId,
          m.name AS name,
          m.author AS author,
          m.submitter AS submitter,
          m.author_time AS authorMs,
          m.gold_time AS goldMs,
          m.silver_time AS silverMs,
          m.bronze_time AS bronzeMs,
          m.nb_laps AS laps,
          m.wr_account_id AS wrAccountId,
          m.wr_display_name AS wrHolder,
          m.wr_time AS wrMs,
          m.wr_updated_at AS wrUpdatedAt,
          m.is_tracked AS tracked,
          m.tracking_status AS status,
          m.check_frequency AS checkFrequency,
          m.last_checked_at AS lastCheckedAt,
          COALESCE(cm.campaign_name, 'Unassigned') AS campaign,
          cm.campaign_id AS campaignId,
          COALESCE(cm.slot, 0) AS slot
        FROM maps m
        ${LATEST_CAMPAIGN_JOIN}
        WHERE LOWER(m.map_uid) = LOWER(?)
        LIMIT 1
        `
      )
      .get(mapUid);

    if (!row) return { exists: false };

    return {
      exists: true,
      map: {
        uid: row.uid,
        mapId: row.mapId,
        name: row.name,
        author: row.author,
        submitter: row.submitter,
        authorMs: Number(row.authorMs || 0),
        goldMs: Number(row.goldMs || 0),
        silverMs: Number(row.silverMs || 0),
        bronzeMs: Number(row.bronzeMs || 0),
        laps: Number(row.laps || 1),
        campaign: row.campaign,
        campaignId: row.campaignId || null,
        slot: Number(row.slot || 0),
        wrAccountId: row.wrAccountId || null,
        wrHolder: row.wrHolder || "-",
        wrMs: Number(row.wrMs || 0),
        wrUpdatedAt: row.wrUpdatedAt || null,
        tracked: Boolean(row.tracked),
        status: row.status || "live",
        checkFrequency: Number(row.checkFrequency || 0),
        lastCheckedAt: row.lastCheckedAt || null,
      },
    };
  }

  getMapByUid(mapUid) {
    return this.db
      .prepare("SELECT map_uid AS uid, name AS name, wr_time AS wrMs, wr_display_name AS wrHolder FROM maps WHERE map_uid = ? LIMIT 1")
      .get(mapUid);
  }

  getTrackedLiveCandidates() {
    return this.db
      .prepare(
        `
        SELECT map_uid AS uid, name AS name, wr_time AS wrMs, wr_display_name AS wrHolder
        FROM maps
        WHERE is_tracked = 1 AND tracking_status = 'live'
        ORDER BY COALESCE(wr_updated_at, '') DESC
        `
      )
      .all();
  }

  getDueTrackedMaps({ limit = 6, nowIso, maxCheckIntervalSeconds = 0 } = {}) {
    const now = nowIso || new Date().toISOString();
    const maxInterval = Math.max(0, Number(maxCheckIntervalSeconds) || 0);
    const limitValue = Math.max(1, Math.min(Number(limit) || 6, 100));
    const frequencyExpr =
      maxInterval > 0
        ? "MIN(COALESCE(m.check_frequency, 0), ?)"
        : "COALESCE(m.check_frequency, 0)";

    const sql = `
      SELECT
        m.map_uid AS uid,
        m.name AS name,
        m.wr_time AS wrMs,
        m.wr_account_id AS wrAccountId,
        m.wr_display_name AS wrHolder,
        m.last_checked_at AS lastCheckedAt,
        m.check_frequency AS checkFrequency,
        m.tracking_status AS status
      FROM maps m
      WHERE
        m.is_tracked = 1
        AND m.tracking_status = 'live'
        AND (
          m.last_checked_at IS NULL
          OR (strftime('%s', ?) - strftime('%s', m.last_checked_at)) >= ${frequencyExpr}
        )
      ORDER BY COALESCE(m.last_checked_at, '') ASC, COALESCE(m.wr_updated_at, '') DESC
      LIMIT ?
    `;

    const args = maxInterval > 0 ? [now, maxInterval, limitValue] : [now, limitValue];
    return this.db
      .prepare(sql)
      .all(...args)
      .map((row) => ({
        uid: row.uid,
        name: row.name,
        wrMs: Number(row.wrMs || 0),
        wrAccountId: row.wrAccountId || null,
        wrHolder: row.wrHolder || "-",
        lastCheckedAt: row.lastCheckedAt || null,
        checkFrequency: Number(row.checkFrequency || 0),
        status: row.status || "live",
      }));
  }

  touchMapCheckedAt(mapUid, checkedAt) {
    const at = checkedAt || new Date().toISOString();
    this.db
      .prepare(
        `
        UPDATE maps
        SET last_checked_at = ?, updated_at = ?
        WHERE map_uid = ?
        `
      )
      .run(at, at, mapUid);
  }

  recordTrackerRun({
    startedAt,
    finishedAt,
    mapsConsidered = 0,
    mapsChecked = 0,
    wrChanges = 0,
    provider = "unknown",
    note = "",
    checks = [],
  }) {
    const txStarted = startedAt || new Date().toISOString();
    const txFinished = finishedAt || new Date().toISOString();
    let runId = 0;
    try {
      this.db.exec("BEGIN");
      const runResult = this.db
        .prepare(
          `
          INSERT INTO tracker_runs (
            started_at, finished_at, maps_considered, maps_checked, wr_changes, provider, note
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          txStarted,
          txFinished,
          Math.max(0, Number(mapsConsidered) || 0),
          Math.max(0, Number(mapsChecked) || 0),
          Math.max(0, Number(wrChanges) || 0),
          String(provider || "unknown"),
          String(note || "")
        );
      runId = Number(runResult.lastInsertRowid || 0);

      const insertCheck = this.db.prepare(
        `
        INSERT INTO tracker_map_checks (
          run_id, map_uid, checked_at, changed,
          old_wr_time, new_wr_time, old_holder, new_holder, source, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      );

      for (const item of checks) {
        insertCheck.run(
          runId || null,
          item.mapUid,
          item.checkedAt || txFinished,
          item.changed ? 1 : 0,
          Number(item.oldWrTime || 0),
          Number(item.newWrTime || 0),
          String(item.oldHolder || ""),
          String(item.newHolder || ""),
          String(item.source || ""),
          String(item.note || "")
        );
      }

      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    return {
      runId,
      startedAt: txStarted,
      finishedAt: txFinished,
      mapsConsidered: Math.max(0, Number(mapsConsidered) || 0),
      mapsChecked: Math.max(0, Number(mapsChecked) || 0),
      wrChanges: Math.max(0, Number(wrChanges) || 0),
      provider: String(provider || "unknown"),
      note: String(note || ""),
    };
  }

  getLatestTrackerRun() {
    const row = this.db
      .prepare(
        `
        SELECT
          run_id AS runId,
          started_at AS startedAt,
          finished_at AS finishedAt,
          maps_considered AS mapsConsidered,
          maps_checked AS mapsChecked,
          wr_changes AS wrChanges,
          provider AS provider,
          note AS note
        FROM tracker_runs
        ORDER BY run_id DESC
        LIMIT 1
        `
      )
      .get();

    if (!row) return null;
    return {
      runId: Number(row.runId || 0),
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      mapsConsidered: Number(row.mapsConsidered || 0),
      mapsChecked: Number(row.mapsChecked || 0),
      wrChanges: Number(row.wrChanges || 0),
      provider: row.provider || "unknown",
      note: row.note || "",
    };
  }

  getTrackerRuns(limit = 30) {
    const rows = this.db
      .prepare(
        `
        SELECT
          run_id AS runId,
          started_at AS startedAt,
          finished_at AS finishedAt,
          maps_considered AS mapsConsidered,
          maps_checked AS mapsChecked,
          wr_changes AS wrChanges,
          provider AS provider,
          note AS note
        FROM tracker_runs
        ORDER BY run_id DESC
        LIMIT ?
        `
      )
      .all(Math.max(1, Math.min(Number(limit) || 30, 300)));

    return rows.map((row) => ({
      runId: Number(row.runId || 0),
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      mapsConsidered: Number(row.mapsConsidered || 0),
      mapsChecked: Number(row.mapsChecked || 0),
      wrChanges: Number(row.wrChanges || 0),
      provider: row.provider || "unknown",
      note: row.note || "",
    }));
  }

  upsertClub({ clubId, clubName }) {
    const id = clampInt(clubId, { min: 1, max: 2147483647, fallback: 0 });
    if (!id) return null;
    const name = String(clubName || "").trim() || `Club ${id}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO clubs (
          club_id, name, description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(id, name, "", now, now);

    this.db
      .prepare(
        `
        UPDATE clubs
        SET name = ?, updated_at = ?
        WHERE club_id = ?
        `
      )
      .run(name, now, id);

    return this.db
      .prepare(
        `
        SELECT
          club_id AS clubId,
          name AS clubName
        FROM clubs
        WHERE club_id = ?
        LIMIT 1
        `
      )
      .get(id);
  }

  upsertCampaignByName({ name, clubId }) {
    const now = new Date().toISOString();
    this.upsertClub({
      clubId,
      clubName: `Club ${clubId}`,
    });

    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO campaigns (
          name, club_id, published, created_at, updated_at
        ) VALUES (?, ?, 0, ?, ?)
        `
      )
      .run(name, clubId, now, now);

    this.db
      .prepare("UPDATE campaigns SET updated_at = ? WHERE name = ? AND club_id = ?")
      .run(now, name, clubId);

    const row = this.db
      .prepare("SELECT campaign_id AS campaignId, name FROM campaigns WHERE name = ? AND club_id = ? LIMIT 1")
      .get(name, clubId);

    return row || null;
  }

  updateMapCampaign({ mapUid, campaignName, slot = 1, clubId = 558282 }) {
    const map = this.getMapByUid(mapUid);
    if (!map) return null;

    const campaign = this.upsertCampaignByName({
      name: campaignName,
      clubId,
    });
    if (!campaign) return null;

    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO map_campaigns (map_uid, campaign_id, slot, created_at)
        VALUES (?, ?, ?, ?)
        `
      )
      .run(mapUid, campaign.campaignId, Math.max(1, Math.floor(slot)), now);

    this.db.prepare("UPDATE maps SET updated_at = ? WHERE map_uid = ?").run(now, mapUid);
    return this.getMapInfo(mapUid);
  }

  updateMapTracking({ mapUid, tracked, status, checkFrequency }) {
    const sets = ["updated_at = ?"];
    const params = [new Date().toISOString()];

    if (typeof tracked === "boolean") {
      sets.push("is_tracked = ?");
      params.push(tracked ? 1 : 0);
    }

    if (typeof status === "string" && ["live", "paused", "archived"].includes(status)) {
      sets.push("tracking_status = ?");
      params.push(status);
    }

    if (Number.isFinite(checkFrequency)) {
      sets.push("check_frequency = ?");
      params.push(Math.max(120, Math.floor(checkFrequency)));
    }

    params.push(mapUid);
    const result = this.db
      .prepare(`UPDATE maps SET ${sets.join(", ")} WHERE map_uid = ?`)
      .run(...params);
    if (!result.changes) return null;
    return this.getMapInfo(mapUid);
  }

  bulkUpsertMaps({ maps = [] } = {}) {
    const inputMaps = Array.isArray(maps) ? maps : [];
    if (!inputMaps.length) {
      return {
        inserted: 0,
        updated: 0,
        total: 0,
      };
    }

    let inserted = 0;
    let updated = 0;

    try {
      this.db.exec("BEGIN");

      for (const item of inputMaps) {
        const mapUid = String(item?.uid || item?.mapUid || item?.map_uid || "").trim();
        if (!mapUid) continue;

        const existing = this.db
          .prepare(
            `
            SELECT
              map_uid AS uid,
              map_id AS mapId,
              is_tracked AS tracked,
              tracking_status AS status,
              check_frequency AS checkFrequency,
              wr_account_id AS wrAccountId,
              wr_display_name AS wrHolder,
              wr_time AS wrTime,
              wr_updated_at AS wrUpdatedAt,
              last_checked_at AS lastCheckedAt
            FROM maps
            WHERE map_uid = ?
            LIMIT 1
            `
          )
          .get(mapUid);

        const now = new Date().toISOString();
        const tracked =
          typeof item?.tracked === "boolean"
            ? item.tracked
            : existing
              ? Boolean(existing.tracked)
              : false;
        const status = normalizeStatus(
          item?.status,
          tracked ? "live" : existing?.status || "paused"
        );
        const mapName = String(item?.name || item?.title || mapUid).trim() || mapUid;
        const mapId =
          String(item?.mapId || item?.map_id || existing?.mapId || "").trim() ||
          `map-${mapUid.toLowerCase()}`;
        const author = String(item?.author || "").trim();
        const submitter = String(item?.submitter || "").trim();
        const authorTime = clampInt(item?.authorMs ?? item?.authorTime ?? item?.author_time, {
          min: 0,
          max: 2147483647,
          fallback: 0,
        });
        const goldTime = clampInt(item?.goldMs ?? item?.goldTime ?? item?.gold_time, {
          min: 0,
          max: 2147483647,
          fallback: 0,
        });
        const silverTime = clampInt(item?.silverMs ?? item?.silverTime ?? item?.silver_time, {
          min: 0,
          max: 2147483647,
          fallback: 0,
        });
        const bronzeTime = clampInt(item?.bronzeMs ?? item?.bronzeTime ?? item?.bronze_time, {
          min: 0,
          max: 2147483647,
          fallback: 0,
        });
        const laps = clampInt(item?.laps ?? item?.nbLaps ?? item?.nb_laps, {
          min: 1,
          max: 64,
          fallback: 1,
        });
        const thumbnailUrl = String(item?.thumbnailUrl ?? item?.thumbnail_url ?? "").trim();
        const downloadUrl = String(item?.downloadUrl ?? item?.download_url ?? "").trim();
        const checkFrequency = clampInt(item?.checkFrequency ?? item?.check_frequency, {
          min: 120,
          max: 604800,
          fallback: clampInt(existing?.checkFrequency, {
            min: 120,
            max: 604800,
            fallback: 21600,
          }),
        });
        const wrTime = clampInt(item?.wrMs ?? item?.wrTime ?? item?.wr_time, {
          min: 0,
          max: 2147483647,
          fallback: clampInt(existing?.wrTime, { min: 0, max: 2147483647, fallback: 0 }),
        });
        const wrHolder =
          String(item?.wrHolder ?? item?.wrDisplayName ?? item?.wr_display_name ?? existing?.wrHolder ?? "")
            .trim() || null;
        const wrAccountId =
          String(item?.wrAccountId ?? item?.wr_account_id ?? existing?.wrAccountId ?? "").trim() ||
          null;
        const wrUpdatedAt = wrTime > 0 ? now : existing?.wrUpdatedAt || null;
        const lastCheckedAt = item?.lastCheckedAt || item?.last_checked_at || existing?.lastCheckedAt || null;

        if (existing) {
          this.db
            .prepare(
              `
              UPDATE maps
              SET
                map_id = ?,
                name = ?,
                author = ?,
                submitter = ?,
                author_time = ?,
                gold_time = ?,
                silver_time = ?,
                bronze_time = ?,
                nb_laps = ?,
                thumbnail_url = ?,
                download_url = ?,
                check_frequency = ?,
                last_checked_at = ?,
                wr_account_id = ?,
                wr_display_name = ?,
                wr_time = ?,
                wr_updated_at = ?,
                is_tracked = ?,
                tracking_status = ?,
                updated_at = ?
              WHERE map_uid = ?
              `
            )
            .run(
              mapId,
              mapName,
              author,
              submitter,
              authorTime,
              goldTime,
              silverTime,
              bronzeTime,
              laps,
              thumbnailUrl,
              downloadUrl,
              checkFrequency,
              lastCheckedAt,
              wrAccountId,
              wrHolder,
              wrTime,
              wrUpdatedAt,
              tracked ? 1 : 0,
              status,
              now,
              mapUid
            );
          updated += 1;
          continue;
        }

        this.db
          .prepare(
            `
            INSERT INTO maps (
              map_uid, map_id, name, author, submitter,
              author_time, gold_time, silver_time, bronze_time, nb_laps,
              thumbnail_url, download_url, created_at, updated_at, added_to_bot_at,
              check_frequency, last_checked_at, wr_account_id, wr_display_name, wr_time, wr_updated_at,
              is_tracked, tracking_status
            ) VALUES (
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?,
              ?, ?
            )
            `
          )
          .run(
            mapUid,
            mapId,
            mapName,
            author,
            submitter,
            authorTime,
            goldTime,
            silverTime,
            bronzeTime,
            laps,
            thumbnailUrl,
            downloadUrl,
            now,
            now,
            tracked ? now : null,
            checkFrequency,
            lastCheckedAt,
            wrAccountId,
            wrHolder,
            wrTime,
            wrUpdatedAt,
            tracked ? 1 : 0,
            status
          );
        inserted += 1;
      }

      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    return {
      inserted,
      updated,
      total: inserted + updated,
    };
  }

  insertWrEvent({
    mapUid,
    accountId,
    displayName,
    recordTime,
    timestamp,
    replayUrl = "",
    zoneId = "world",
    zoneName = "World",
    position = 1,
  }) {
    const now = timestamp || new Date().toISOString();
    const map = this.getMapByUid(mapUid);
    if (!map) return null;

    try {
      this.db.exec("BEGIN");
      this.db
        .prepare(
          `
          INSERT INTO wr_history (
            map_uid, account_id, display_name, record_time, medal, replay_url, replay_local_path,
            timestamp, removed, zone_id, zone_name, position
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          mapUid,
          accountId,
          displayName,
          Math.max(1, Math.floor(recordTime)),
          1,
          replayUrl,
          "",
          now,
          0,
          zoneId,
          zoneName,
          position
        );

      this.db
        .prepare(
          `
          INSERT INTO leaderboards (
            map_uid, account_id, display_name, score, ranking, timestamp, zone_id, zone_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          mapUid,
          accountId,
          displayName,
          Math.max(1, Math.floor(recordTime)),
          position,
          now,
          zoneId,
          zoneName
        );

      this.db
        .prepare(
          `
          UPDATE maps
          SET
            wr_account_id = ?,
            wr_display_name = ?,
            wr_time = ?,
            wr_updated_at = ?,
            last_checked_at = ?,
            updated_at = ?
          WHERE map_uid = ?
          `
        )
        .run(
          accountId,
          displayName,
          Math.max(1, Math.floor(recordTime)),
          now,
          now,
          now,
          mapUid
        );
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    return {
      uid: mapUid,
      name: map.name,
      campaign: this.getMapInfo(mapUid)?.map?.campaign || "Unassigned",
      wrMs: Math.max(1, Math.floor(recordTime)),
      holder: displayName,
      at: now,
    };
  }

  replaceLeaderboardSnapshot({
    mapUid,
    entries = [],
    checkedAt,
    source = "tracker",
    note = "",
  } = {}) {
    const uid = String(mapUid || "").trim();
    if (!uid) return null;

    const normalizedEntries = Array.isArray(entries)
      ? entries
          .map((entry, index) => {
            const score = clampInt(entry?.score ?? entry?.wrMs, {
              min: 0,
              max: 2147483647,
              fallback: 0,
            });
            if (score <= 0) return null;
            const ranking = clampInt(entry?.ranking ?? entry?.position ?? index + 1, {
              min: 1,
              max: 100000,
              fallback: index + 1,
            });
            const accountId = normalizeAccountId(entry?.accountId ?? entry?.account_id);
            const displayName = String(
              entry?.displayName ?? entry?.display_name ?? entry?.name ?? accountId ?? ""
            ).trim();
            return {
              accountId: accountId || null,
              displayName: displayName || "Unknown",
              score,
              ranking,
              timestamp: normalizeIso(entry?.recordedAt ?? entry?.timestamp, checkedAt) || checkedAt,
              zoneId: String(entry?.zoneId ?? entry?.zone_id ?? "world").trim() || "world",
              zoneName: String(entry?.zoneName ?? entry?.zone_name ?? "World").trim() || "World",
            };
          })
          .filter(Boolean)
      : [];

    const now = normalizeIso(checkedAt, new Date().toISOString()) || new Date().toISOString();
    const top = normalizedEntries.length > 0 ? normalizedEntries[0] : null;

    try {
      this.db.exec("BEGIN");
      this.db.prepare("DELETE FROM leaderboards WHERE map_uid = ?").run(uid);
      const insertLeaderboard = this.db.prepare(
        `
        INSERT INTO leaderboards (
          map_uid, account_id, display_name, score, ranking, timestamp, zone_id, zone_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      );
      for (const entry of normalizedEntries) {
        insertLeaderboard.run(
          uid,
          entry.accountId,
          entry.displayName,
          entry.score,
          entry.ranking,
          entry.timestamp,
          entry.zoneId,
          entry.zoneName
        );
      }

      if (top) {
        this.db
          .prepare(
            `
            UPDATE maps
            SET
              wr_account_id = ?,
              wr_display_name = ?,
              wr_time = ?,
              wr_updated_at = ?,
              last_checked_at = ?,
              updated_at = ?
            WHERE map_uid = ?
            `
          )
          .run(
            top.accountId,
            top.displayName,
            top.score,
            now,
            now,
            now,
            uid
          );
      } else {
        this.db
          .prepare(
            `
            UPDATE maps
            SET
              last_checked_at = ?,
              updated_at = ?
            WHERE map_uid = ?
            `
          )
          .run(now, now, uid);
      }

      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    return {
      mapUid: uid,
      checkedAt: now,
      source: String(source || ""),
      note: String(note || ""),
      entries: normalizedEntries.length,
      top:
        top && top.score > 0
          ? {
              accountId: top.accountId,
              displayName: top.displayName,
              score: top.score,
              ranking: top.ranking,
              timestamp: top.timestamp,
            }
          : null,
    };
  }

  bulkUpsertPlayerNames({ players = [], source = "external-sync" } = {}) {
    const now = new Date().toISOString();
    const safeSource = String(source || "").trim() || "external-sync";
    const normalized = [];
    const seen = new Set();
    for (const item of Array.isArray(players) ? players : []) {
      const accountId = normalizeAccountId(item?.accountId ?? item?.account_id ?? item?.id);
      const displayName = String(item?.displayName ?? item?.display_name ?? item?.name ?? "").trim();
      if (!accountId || !displayName) continue;
      if (seen.has(accountId)) continue;
      seen.add(accountId);
      normalized.push({
        accountId,
        displayName,
        observedAt: normalizeIso(item?.observedAt ?? item?.observed_at, now) || now,
      });
    }

    if (!normalized.length) {
      return {
        playersSeen: 0,
        namesUpdated: 0,
        historyInserted: 0,
        mapsUpdated: 0,
        leaderboardRowsUpdated: 0,
        wrHistoryRowsUpdated: 0,
      };
    }

    const selectProfileStmt = this.db.prepare(
      `
      SELECT latest_display_name AS latestDisplayName
      FROM player_profiles
      WHERE account_id = ?
      LIMIT 1
      `
    );
    const upsertProfileStmt = this.db.prepare(
      `
      INSERT INTO player_profiles (
        account_id,
        latest_display_name,
        first_seen_at,
        last_seen_at,
        last_resolved_at,
        last_source,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        latest_display_name = COALESCE(NULLIF(excluded.latest_display_name, ''), player_profiles.latest_display_name),
        last_seen_at = excluded.last_seen_at,
        last_resolved_at = COALESCE(excluded.last_resolved_at, player_profiles.last_resolved_at),
        last_source = COALESCE(NULLIF(excluded.last_source, ''), player_profiles.last_source),
        updated_at = excluded.updated_at
      `
    );
    const insertHistoryStmt = this.db.prepare(
      `
      INSERT OR IGNORE INTO player_name_history (
        account_id,
        display_name,
        observed_at,
        source,
        created_at
      ) VALUES (?, ?, ?, ?, ?)
      `
    );
    const updateMapsStmt = this.db.prepare(
      `
      UPDATE maps
      SET
        wr_display_name = ?,
        updated_at = ?
      WHERE
        LOWER(COALESCE(wr_account_id, '')) = ?
        AND COALESCE(wr_display_name, '') <> ?
      `
    );
    const updateLeaderboardsStmt = this.db.prepare(
      `
      UPDATE leaderboards
      SET display_name = ?
      WHERE
        LOWER(COALESCE(account_id, '')) = ?
        AND COALESCE(display_name, '') <> ?
      `
    );
    const updateWrHistoryStmt = this.db.prepare(
      `
      UPDATE wr_history
      SET display_name = ?
      WHERE
        LOWER(COALESCE(account_id, '')) = ?
        AND COALESCE(display_name, '') <> ?
      `
    );

    let namesUpdated = 0;
    let historyInserted = 0;
    let mapsUpdated = 0;
    let leaderboardRowsUpdated = 0;
    let wrHistoryRowsUpdated = 0;

    try {
      this.db.exec("BEGIN");
      for (const entry of normalized) {
        const existing = selectProfileStmt.get(entry.accountId);
        upsertProfileStmt.run(
          entry.accountId,
          entry.displayName,
          now,
          now,
          entry.observedAt,
          safeSource,
          now
        );
        if (String(existing?.latestDisplayName || "") !== entry.displayName) {
          namesUpdated += 1;
        }
        const historyResult = insertHistoryStmt.run(
          entry.accountId,
          entry.displayName,
          entry.observedAt,
          safeSource,
          now
        );
        historyInserted += Number(historyResult?.changes || 0);
        mapsUpdated += Number(updateMapsStmt.run(entry.displayName, now, entry.accountId, entry.displayName)?.changes || 0);
        leaderboardRowsUpdated += Number(
          updateLeaderboardsStmt.run(entry.displayName, entry.accountId, entry.displayName)?.changes || 0
        );
        wrHistoryRowsUpdated += Number(
          updateWrHistoryStmt.run(entry.displayName, entry.accountId, entry.displayName)?.changes || 0
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      return {
        error: error?.message || "Failed to upsert player names.",
        playersSeen: normalized.length,
        namesUpdated,
        historyInserted,
        mapsUpdated,
        leaderboardRowsUpdated,
        wrHistoryRowsUpdated,
      };
    }

    return {
      playersSeen: normalized.length,
      namesUpdated,
      historyInserted,
      mapsUpdated,
      leaderboardRowsUpdated,
      wrHistoryRowsUpdated,
    };
  }

  getPlayerNamesByAccountIds({ accountIds = [], limit = 200 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 2000));
    const normalized = [];
    const seen = new Set();
    for (const rawAccountId of Array.isArray(accountIds) ? accountIds : []) {
      const accountId = normalizeAccountId(rawAccountId);
      if (!accountId || seen.has(accountId)) continue;
      seen.add(accountId);
      normalized.push(accountId);
      if (normalized.length >= safeLimit) break;
    }
    if (!normalized.length) {
      return {
        requested: 0,
        found: 0,
        namesByAccountId: {},
        profiles: [],
      };
    }

    const placeholders = normalized.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
        SELECT
          p.account_id AS accountId,
          p.latest_display_name AS displayName,
          p.last_resolved_at AS lastResolvedAt,
          p.last_source AS lastSource,
          p.updated_at AS updatedAt
        FROM player_profiles p
        WHERE p.account_id IN (${placeholders})
        `
      )
      .all(...normalized);

    const namesByAccountId = {};
    const profiles = rows
      .map((row) => {
        const accountId = normalizeAccountId(row.accountId);
        const displayName = String(row.displayName || "").trim();
        if (accountId && displayName) {
          namesByAccountId[accountId] = displayName;
        }
        return {
          accountId,
          displayName: displayName || null,
          lastResolvedAt: normalizeIso(row.lastResolvedAt, null),
          lastSource: String(row.lastSource || "").trim() || null,
          updatedAt: normalizeIso(row.updatedAt, null),
        };
      })
      .filter((row) => row.accountId);

    return {
      requested: normalized.length,
      found: Object.keys(namesByAccountId).length,
      namesByAccountId,
      profiles,
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

  getMapOptions() {
    return this.db
      .prepare(
        `
        SELECT
          m.map_uid AS uid,
          m.name AS name,
          COALESCE(cm.campaign_name, 'Unassigned') AS campaign,
          COALESCE(cm.slot, 0) AS slot
        FROM maps m
        ${LATEST_CAMPAIGN_JOIN}
        ORDER BY campaign COLLATE NOCASE ASC, slot ASC, name COLLATE NOCASE ASC
        `
      )
      .all();
  }
}

export { TrackerRepository };
