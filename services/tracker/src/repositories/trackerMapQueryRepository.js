import { LATEST_CAMPAIGN_JOIN, MAP_CHECK_COUNTS_JOIN, rowToMap } from "./trackerRepositorySupport.js";

class TrackerMapQueryRepository {
  constructor(db) {
    this.db = db;
  }

  getSummary() {
    const trackedMaps = this.db.prepare("SELECT COUNT(*) AS count FROM maps WHERE is_tracked = 1").get()?.count || 0;
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
      this.db.prepare("SELECT timestamp FROM wr_history WHERE removed = 0 ORDER BY timestamp DESC LIMIT 1").get()
        ?.timestamp || null;

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

    const query = String(q || "")
      .trim()
      .toLowerCase();
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
        m.wr_account_id AS wrAccountId,
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
      .prepare(
        "SELECT map_uid AS uid, name AS name, wr_time AS wrMs, wr_display_name AS wrHolder FROM maps WHERE map_uid = ? LIMIT 1"
      )
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
    const frequencyExpr = maxInterval > 0 ? "MIN(COALESCE(m.check_frequency, 0), ?)" : "COALESCE(m.check_frequency, 0)";

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

  countDueTrackedMaps({ nowIso, maxCheckIntervalSeconds = 0 } = {}) {
    const now = nowIso || new Date().toISOString();
    const maxInterval = Math.max(0, Number(maxCheckIntervalSeconds) || 0);
    const frequencyExpr = maxInterval > 0 ? "MIN(COALESCE(m.check_frequency, 0), ?)" : "COALESCE(m.check_frequency, 0)";

    const sql = `
      SELECT COUNT(*) AS count
      FROM maps m
      WHERE
        m.is_tracked = 1
        AND m.tracking_status = 'live'
        AND (
          m.last_checked_at IS NULL
          OR (strftime('%s', ?) - strftime('%s', m.last_checked_at)) >= ${frequencyExpr}
        )
    `;

    const args = maxInterval > 0 ? [now, maxInterval] : [now];
    return Number(this.db.prepare(sql).get(...args)?.count || 0);
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

export { TrackerMapQueryRepository };
