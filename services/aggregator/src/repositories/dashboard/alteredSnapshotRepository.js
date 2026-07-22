import { clampInt } from "../../../../shared/valueUtils.js";
import { mapIngestRunDbRow, parseJsonObject, toDbInt } from "../support/databaseValues.js";

class AlteredSnapshotRepository {
  constructor(db) {
    this.db = db;
  }

  getAlteredDashboardSummary({ syncRunsLimit = 12, pollRunsLimit = 20 } = {}) {
    const safeSyncRunsLimit = clampInt(syncRunsLimit, { min: 1, max: 100, fallback: 12 });
    const safePollRunsLimit = clampInt(pollRunsLimit, { min: 1, max: 100, fallback: 20 });
    const club =
      this.db
        .prepare(
          `
          SELECT
            c.club_id AS clubId,
            c.club_name AS clubName,
            c.source_label AS sourceLabel,
            c.first_seen_at AS firstSeenAt,
            c.last_synced_at AS lastSyncedAt,
            c.payload_json AS payloadJson,
            (
              (SELECT COUNT(*) FROM club_campaign_maps ccm WHERE ccm.club_id = c.club_id) +
              (SELECT COUNT(*) FROM club_upload_maps cum WHERE cum.club_id = c.club_id)
            ) AS mapCount,
            (SELECT COUNT(*) FROM club_members cm WHERE cm.club_id = c.club_id) AS memberCount
          FROM clubs c
          ORDER BY
            mapCount DESC,
            memberCount DESC,
            CASE WHEN c.source_label = 'prod' THEN 0 ELSE 1 END,
            c.last_synced_at DESC,
            c.club_id ASC
          LIMIT 1
          `
        )
        .get() || null;
    const clubId = toDbInt(club?.clubId);
    const clubStats = clubId
      ? this.db
          .prepare(
            `
            SELECT
              (SELECT COUNT(*) FROM club_campaigns WHERE club_id = ?) AS campaigns,
              (SELECT COUNT(*) FROM club_campaign_maps WHERE club_id = ?) AS campaignMaps,
              (SELECT COUNT(*) FROM club_uploads WHERE club_id = ?) AS uploads,
              (SELECT COUNT(*) FROM club_upload_maps WHERE club_id = ?) AS uploadMaps,
              (SELECT COUNT(*) FROM club_members WHERE club_id = ?) AS members
            `
          )
          .get(clubId, clubId, clubId, clubId, clubId) || {}
      : {};
    const hookEvents = this.db
      .prepare(
        `
        SELECT
          event_id AS eventId,
          occurred_at AS occurredAt,
          source_label AS sourceLabel,
          payload_json AS payloadJson,
          detail_1 AS detail1,
          detail_2 AS detail2,
          detail_3 AS detail3
        FROM aggregator_events
        WHERE event_type = 'club.snapshot'
        ORDER BY
          occurred_at DESC,
          event_id DESC
        LIMIT 50
        `
      )
      .all();
    const syncRuns = hookEvents
      .map((event) => {
        const payload = parseJsonObject(event.payloadJson);
        const mapsSeen = toDbInt(payload.campaignMapsSeen) + toDbInt(payload.uploadMapsSeen);
        return {
          runId: event.eventId,
          status: "finished",
          startedAt: event.occurredAt || null,
          finishedAt: event.occurredAt || null,
          mapsSeen,
          mapsInserted: 0,
          mapsUpdated: mapsSeen,
          note: [event.detail1, event.detail2, event.detail3].filter(Boolean).join(" | "),
          sourceLabel: event.sourceLabel || null,
        };
      })
      .sort((left, right) => {
        const leftMaps = toDbInt(left.mapsSeen);
        const rightMaps = toDbInt(right.mapsSeen);
        if (leftMaps !== rightMaps) return rightMaps - leftMaps;
        return String(right.finishedAt || "").localeCompare(String(left.finishedAt || ""));
      })
      .slice(0, safeSyncRunsLimit);
    if (!syncRuns.length && club) {
      syncRuns.push({
        runId: "club",
        status: "finished",
        startedAt: club.lastSyncedAt || null,
        finishedAt: club.lastSyncedAt || null,
        mapsSeen: toDbInt(clubStats.campaignMaps) + toDbInt(clubStats.uploadMaps),
        mapsInserted: 0,
        mapsUpdated: toDbInt(clubStats.campaignMaps) + toDbInt(clubStats.uploadMaps),
        note: "database club snapshot",
        sourceLabel: club.sourceLabel || null,
      });
    }

    const pollRuns = this.db
      .prepare(
        `
        SELECT *
        FROM ingest_runs
        WHERE project_key IN ('prod-tracker-main', 'prod-tracker-leaderboard', 'local-tracker-main', 'local-tracker-leaderboard')
        ORDER BY
          CASE WHEN source_label = 'prod' THEN 0 ELSE 1 END,
          finished_at DESC,
          ingest_id DESC
        LIMIT ?
        `
      )
      .all(safePollRunsLimit)
      .map((row) => mapIngestRunDbRow(row))
      .filter(Boolean);
    const latestPollRun = pollRuns[0] || null;
    const latestSyncRun = syncRuns[0] || null;
    const mapsLoaded = toDbInt(clubStats.campaignMaps) + toDbInt(clubStats.uploadMaps);

    return {
      source: "database",
      altered: {
        hook: club
          ? {
              enabled: true,
              clubId: clubId || null,
              clubName: club.clubName || "Altered",
              autoTrackNewMaps: true,
              trackedCount: mapsLoaded,
              mapCount: mapsLoaded,
              lastSyncedAt: club.lastSyncedAt || null,
              latestRun: latestSyncRun,
              sourceLabel: club.sourceLabel || null,
            }
          : null,
        syncRuns,
        liveStatus: {
          monitor: {
            enabled: true,
            running: false,
            discoveryRunning: false,
            discoveryEnabled: true,
            lastFinishedAt: latestSyncRun?.finishedAt || club?.lastSyncedAt || null,
            nextRunAt: null,
            lastError: null,
            lastSummary: {
              campaignsLoaded: toDbInt(clubStats.campaigns) + toDbInt(clubStats.uploads),
              mapsLoaded,
              membersLoaded: toDbInt(clubStats.members),
            },
          },
        },
        opsOverview: {
          scheduler: {
            enabled: true,
            tickSeconds: 0,
            source: "database",
          },
        },
        pollRuns,
      },
      warnings: [],
      degraded: false,
      latestPollRun,
    };
  }

  getAlteredCheckHistory({ q = "", mapUid = "", limit = 120 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 500, fallback: 120 });
    const safeMapUid = String(mapUid || "").trim();
    const queryText = String(q || "")
      .trim()
      .toLowerCase();
    const clauses = ["1 = 1"];
    const args = [];
    if (safeMapUid) {
      clauses.push("me.map_uid = ?");
      args.push(safeMapUid);
    }
    if (queryText) {
      clauses.push(
        `(
          LOWER(COALESCE(me.map_name, mr.map_name, '')) LIKE ?
          OR LOWER(COALESCE(me.map_uid, '')) LIKE ?
          OR LOWER(COALESCE(me.old_holder, '')) LIKE ?
          OR LOWER(COALESCE(me.new_holder, '')) LIKE ?
        )`
      );
      args.push(`%${queryText}%`, `%${queryText}%`, `%${queryText}%`, `%${queryText}%`);
    }
    return this.db
      .prepare(
        `
        SELECT
          me.event_id AS eventId,
          me.ingest_id AS runId,
          me.project_key AS projectKey,
          me.map_uid AS mapUid,
          COALESCE(me.map_name, mr.map_name, me.map_uid) AS mapName,
          me.checked_at AS checkedAt,
          me.changed AS changed,
          me.old_wr_time AS oldWrMs,
          me.new_wr_time AS newWrMs,
          me.old_holder AS oldWrHolder,
          me.new_holder AS newWrHolder,
          me.note AS note
        FROM map_events me
        LEFT JOIN map_registry mr ON mr.map_uid = me.map_uid
        WHERE ${clauses.join(" AND ")}
        ORDER BY
          CASE WHEN me.project_key LIKE 'prod-%' THEN 0 ELSE 1 END,
          me.checked_at DESC,
          me.event_id DESC
        LIMIT ?
        `
      )
      .all(...args, safeLimit)
      .map((row) => ({
        eventId: toDbInt(row.eventId),
        runId: toDbInt(row.runId),
        projectKey: row.projectKey || null,
        mapUid: row.mapUid || null,
        mapName: row.mapName || row.mapUid || "Unknown map",
        checkedAt: row.checkedAt || null,
        changed: Boolean(Number(row.changed || 0)),
        oldWrMs: row.oldWrMs === null || row.oldWrMs === undefined ? null : toDbInt(row.oldWrMs),
        newWrMs: row.newWrMs === null || row.newWrMs === undefined ? null : toDbInt(row.newWrMs),
        oldWrHolder: row.oldWrHolder || null,
        newWrHolder: row.newWrHolder || null,
        error:
          row.note && String(row.note).toLowerCase().startsWith("error:")
            ? String(row.note).replace(/^error:\s*/i, "")
            : null,
        note: row.note || null,
      }));
  }
}

export { AlteredSnapshotRepository };
