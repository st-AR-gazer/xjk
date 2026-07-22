import { clampInt, toIso, toNullableIso, toText } from "../../../../shared/valueUtils.js";
import { boolToInt } from "./support.js";

function rowToMonitoredMap(row, { includeUserEmail = false } = {}) {
  const map = {
    id: Number(row.id || 0),
    userId: Number(row.userId || 0),
    mapUid: toText(row.mapUid),
    mapName: toText(row.mapName),
    enabled: Boolean(row.enabled),
    sourceLabel: toText(row.sourceLabel),
    lastWrMs: row.lastWrMs === null || row.lastWrMs === undefined ? null : Number(row.lastWrMs),
    lastWrHolder: toText(row.lastWrHolder) || null,
    lastCheckedAt: toNullableIso(row.lastCheckedAt),
    lastError: toText(row.lastError) || null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
  if (!includeUserEmail) return map;
  return {
    id: map.id,
    userId: map.userId,
    userEmail: toText(row.userEmail),
    mapUid: map.mapUid,
    mapName: map.mapName,
    enabled: map.enabled,
    sourceLabel: map.sourceLabel,
    lastWrMs: map.lastWrMs,
    lastWrHolder: map.lastWrHolder,
    lastCheckedAt: map.lastCheckedAt,
    lastError: map.lastError,
    createdAt: map.createdAt,
    updatedAt: map.updatedAt,
  };
}

class OpsMonitoringRepository {
  constructor(db, userRepository) {
    this.db = db;
    this.userRepository = userRepository;
  }

  upsertMonitoredMap({ userId, mapUid, mapName = "", enabled = true, sourceLabel = "altered-ops" }) {
    const safeUserId = Number(userId) || 0;
    if (!this.userRepository.getUser(safeUserId)) return { error: "User not found." };
    const safeUid = toText(mapUid);
    if (!safeUid) return { error: "mapUid is required." };
    const now = new Date().toISOString();
    const safeName = toText(mapName) || safeUid;
    this.db
      .prepare(
        `
        INSERT INTO monitored_maps (
          user_id, map_uid, map_name, enabled, source_label, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, map_uid) DO UPDATE SET
          map_name = excluded.map_name,
          enabled = excluded.enabled,
          source_label = excluded.source_label,
          updated_at = excluded.updated_at
        `
      )
      .run(safeUserId, safeUid, safeName, boolToInt(Boolean(enabled)), toText(sourceLabel) || "altered-ops", now, now);
    return { map: this.getMonitoredMap({ userId: safeUserId, mapUid: safeUid }) };
  }

  getMonitoredMap({ userId, mapUid }) {
    const row = this.db
      .prepare(
        `
        SELECT
          id,
          user_id AS userId,
          map_uid AS mapUid,
          map_name AS mapName,
          enabled AS enabled,
          source_label AS sourceLabel,
          last_wr_ms AS lastWrMs,
          last_wr_holder AS lastWrHolder,
          last_checked_at AS lastCheckedAt,
          last_error AS lastError,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM monitored_maps
        WHERE user_id = ? AND LOWER(map_uid) = LOWER(?)
        LIMIT 1
        `
      )
      .get(Number(userId) || 0, toText(mapUid));
    return row ? rowToMonitoredMap(row) : null;
  }

  listMonitoredMaps({ userId = null, enabledOnly = false, limit = 5000 } = {}) {
    const hasUser = Number(userId) > 0;
    const rows = this.db
      .prepare(
        `
        SELECT
          m.id,
          m.user_id AS userId,
          u.email AS userEmail,
          m.map_uid AS mapUid,
          m.map_name AS mapName,
          m.enabled AS enabled,
          m.source_label AS sourceLabel,
          m.last_wr_ms AS lastWrMs,
          m.last_wr_holder AS lastWrHolder,
          m.last_checked_at AS lastCheckedAt,
          m.last_error AS lastError,
          m.created_at AS createdAt,
          m.updated_at AS updatedAt
        FROM monitored_maps m
        JOIN users u ON u.id = m.user_id
        WHERE
          (? = 0 OR m.user_id = ?)
          AND (? = 0 OR m.enabled = 1)
        ORDER BY m.id DESC
        LIMIT ?
        `
      )
      .all(
        hasUser ? 1 : 0,
        hasUser ? Number(userId) : 0,
        enabledOnly ? 1 : 0,
        clampInt(limit, { min: 1, max: 25000, fallback: 5000 })
      );
    return rows.map((row) => rowToMonitoredMap(row, { includeUserEmail: true }));
  }

  updateMonitoredMapState({ userId, mapUid, mapName, lastWrMs, lastWrHolder, lastCheckedAt, lastError }) {
    const existing = this.getMonitoredMap({ userId, mapUid });
    if (!existing) return null;

    const sets = ["updated_at = ?"];
    const params = [new Date().toISOString()];

    if (mapName !== undefined) {
      sets.push("map_name = ?");
      params.push(toText(mapName) || existing.mapUid);
    }
    if (lastWrMs !== undefined) {
      sets.push("last_wr_ms = ?");
      params.push(lastWrMs === null ? null : clampInt(lastWrMs, { min: 0, max: 2147483647, fallback: 0 }));
    }
    if (lastWrHolder !== undefined) {
      sets.push("last_wr_holder = ?");
      params.push(toText(lastWrHolder) || null);
    }
    if (lastCheckedAt !== undefined) {
      sets.push("last_checked_at = ?");
      params.push(toNullableIso(lastCheckedAt));
    }
    if (lastError !== undefined) {
      sets.push("last_error = ?");
      params.push(toText(lastError) || null);
    }

    params.push(Number(userId) || 0);
    params.push(toText(mapUid));
    this.db
      .prepare(`UPDATE monitored_maps SET ${sets.join(", ")} WHERE user_id = ? AND LOWER(map_uid) = LOWER(?)`)
      .run(...params);
    return this.getMonitoredMap({ userId, mapUid });
  }

  createMapPollRun({ scheduleId, userId, mapsTotal }) {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `
        INSERT INTO map_poll_runs (
          schedule_id, user_id, started_at, finished_at,
          maps_total, maps_checked, maps_changed, status, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        Number(scheduleId) || null,
        Number(userId) || null,
        now,
        null,
        clampInt(mapsTotal, { min: 0, max: 500000, fallback: 0 }),
        0,
        0,
        "running",
        ""
      );
    return Number(result.lastInsertRowid || 0);
  }

  finishMapPollRun({ runId, mapsChecked, mapsChanged, status = "ok", note = "" }) {
    const safeStatus = status === "error" ? "error" : "ok";
    const finishedAt = new Date().toISOString();
    this.db
      .prepare(
        `
        UPDATE map_poll_runs
        SET
          finished_at = ?,
          maps_checked = ?,
          maps_changed = ?,
          status = ?,
          note = ?
        WHERE run_id = ?
        `
      )
      .run(
        finishedAt,
        clampInt(mapsChecked, { min: 0, max: 500000, fallback: 0 }),
        clampInt(mapsChanged, { min: 0, max: 500000, fallback: 0 }),
        safeStatus,
        toText(note),
        Number(runId) || 0
      );
    return finishedAt;
  }

  recordMapPollEvent({
    runId,
    scheduleId,
    userId,
    mapUid,
    mapName,
    checkedAt,
    changed,
    oldWrMs,
    newWrMs,
    oldWrHolder,
    newWrHolder,
    error,
  }) {
    this.db
      .prepare(
        `
        INSERT INTO map_poll_events (
          run_id,
          schedule_id,
          user_id,
          map_uid,
          map_name,
          checked_at,
          changed,
          old_wr_ms,
          new_wr_ms,
          old_wr_holder,
          new_wr_holder,
          error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        Number(runId) || null,
        Number(scheduleId) || null,
        Number(userId) || null,
        toText(mapUid),
        toText(mapName),
        toIso(checkedAt),
        boolToInt(Boolean(changed)),
        oldWrMs === undefined || oldWrMs === null ? null : clampInt(oldWrMs, { min: 0, max: 2147483647, fallback: 0 }),
        newWrMs === undefined || newWrMs === null ? null : clampInt(newWrMs, { min: 0, max: 2147483647, fallback: 0 }),
        toText(oldWrHolder) || null,
        toText(newWrHolder) || null,
        toText(error) || null
      );
  }

  listMapPollRuns({ limit = 100 } = {}) {
    return this.db
      .prepare(
        `
        SELECT
          run_id AS runId,
          schedule_id AS scheduleId,
          user_id AS userId,
          started_at AS startedAt,
          finished_at AS finishedAt,
          maps_total AS mapsTotal,
          maps_checked AS mapsChecked,
          maps_changed AS mapsChanged,
          status,
          note
        FROM map_poll_runs
        ORDER BY run_id DESC
        LIMIT ?
        `
      )
      .all(clampInt(limit, { min: 1, max: 2000, fallback: 100 }))
      .map((row) => ({
        runId: Number(row.runId || 0),
        scheduleId: row.scheduleId ? Number(row.scheduleId) : null,
        userId: row.userId ? Number(row.userId) : null,
        startedAt: toIso(row.startedAt),
        finishedAt: toNullableIso(row.finishedAt),
        mapsTotal: Number(row.mapsTotal || 0),
        mapsChecked: Number(row.mapsChecked || 0),
        mapsChanged: Number(row.mapsChanged || 0),
        status: toText(row.status) || "ok",
        note: toText(row.note),
      }));
  }

  listMapPollEvents({ mapUid = "", limit = 200 } = {}) {
    const safeUid = toText(mapUid);
    return this.db
      .prepare(
        `
        SELECT
          event_id AS eventId,
          run_id AS runId,
          schedule_id AS scheduleId,
          user_id AS userId,
          map_uid AS mapUid,
          map_name AS mapName,
          checked_at AS checkedAt,
          changed AS changed,
          old_wr_ms AS oldWrMs,
          new_wr_ms AS newWrMs,
          old_wr_holder AS oldWrHolder,
          new_wr_holder AS newWrHolder,
          error AS error
        FROM map_poll_events
        WHERE (? = '' OR LOWER(map_uid) = LOWER(?))
        ORDER BY event_id DESC
        LIMIT ?
        `
      )
      .all(safeUid, safeUid, clampInt(limit, { min: 1, max: 5000, fallback: 200 }))
      .map((row) => ({
        eventId: Number(row.eventId || 0),
        runId: row.runId ? Number(row.runId) : null,
        scheduleId: row.scheduleId ? Number(row.scheduleId) : null,
        userId: row.userId ? Number(row.userId) : null,
        mapUid: toText(row.mapUid),
        mapName: toText(row.mapName),
        checkedAt: toIso(row.checkedAt),
        changed: Boolean(row.changed),
        oldWrMs: row.oldWrMs === null || row.oldWrMs === undefined ? null : Number(row.oldWrMs),
        newWrMs: row.newWrMs === null || row.newWrMs === undefined ? null : Number(row.newWrMs),
        oldWrHolder: toText(row.oldWrHolder) || null,
        newWrHolder: toText(row.newWrHolder) || null,
        error: toText(row.error) || null,
      }));
  }

  countMonitoredMaps() {
    return Number(this.db.prepare("SELECT COUNT(*) AS count FROM monitored_maps").get()?.count || 0);
  }
}

export { OpsMonitoringRepository };
