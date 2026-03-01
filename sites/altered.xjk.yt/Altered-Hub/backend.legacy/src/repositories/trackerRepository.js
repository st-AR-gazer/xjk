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
    lastCheckedAt: row.lastCheckedAt || null,
  };
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
        m.last_checked_at AS lastCheckedAt
      FROM maps m
      ${LATEST_CAMPAIGN_JOIN}
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

  upsertCampaignByName({ name, clubId }) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO clubs (
          club_id, name, description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(clubId, `Club ${clubId}`, "", now, now);

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
