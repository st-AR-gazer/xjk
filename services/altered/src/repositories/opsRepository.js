function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function toText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function toIso(value, fallbackIso = new Date().toISOString()) {
  if (!value) return fallbackIso;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallbackIso;
  return date.toISOString();
}

function toNullableIso(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function addHours(isoString, hours) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCHours(date.getUTCHours() + Math.max(1, Number(hours) || 1));
  return date.toISOString();
}

function boolToInt(value) {
  return value ? 1 : 0;
}

function parseJsonSafe(value, fallback = null) {
  const raw = toText(value);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function serializeJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function normalizeCommandStatus(value, fallback = "queued") {
  const status = toText(value).toLowerCase();
  if (status === "queued" || status === "sent" || status === "failed" || status === "cancelled") {
    return status;
  }
  return fallback;
}

class OpsRepository {
  constructor(db) {
    this.db = db;
  }

  ensureDefaults() {
    const now = new Date().toISOString();
    const defaultTypes = ["admin", "operator", "viewer"];
    const insertType = this.db.prepare("INSERT OR IGNORE INTO user_types (type) VALUES (?)");
    for (const type of defaultTypes) {
      insertType.run(type);
    }

    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO discord_bot_config (
          config_id,
          enabled,
          bot_name,
          guild_id,
          channel_id,
          webhook_url,
          announce_wr_changes,
          mention_role_id,
          footer_text,
          updated_at
        ) VALUES (1, 0, 'altered-bot', '', '', '', 1, '', '', ?)
        `
      )
      .run(now);
  }

  listUserTypes() {
    return this.db
      .prepare("SELECT id, type FROM user_types ORDER BY id ASC")
      .all()
      .map((row) => ({
        id: Number(row.id || 0),
        type: toText(row.type),
      }));
  }

  getUser(userId) {
    const row = this.db
      .prepare(
        `
        SELECT
          u.id,
          u.user_type_id AS userTypeId,
          t.type AS userType,
          u.parse_id AS parseId,
          u.email,
          u.password,
          u.logged_in AS loggedIn,
          u.token_facebook AS tokenFacebook,
          u.token_twitter AS tokenTwitter,
          u.user_token AS userToken,
          u.token_expiration AS tokenExpiration,
          u.created_at AS createdAt,
          u.updated_at AS updatedAt
        FROM users u
        LEFT JOIN user_types t ON t.id = u.user_type_id
        WHERE u.id = ?
        LIMIT 1
        `
      )
      .get(Number(userId) || 0);
    if (!row) return null;
    return {
      id: Number(row.id || 0),
      userTypeId: row.userTypeId ? Number(row.userTypeId) : null,
      userType: toText(row.userType) || null,
      parseId: toText(row.parseId) || null,
      email: toText(row.email),
      password: toText(row.password),
      loggedIn: Boolean(row.loggedIn),
      tokenFacebook: toText(row.tokenFacebook) || null,
      tokenTwitter: toText(row.tokenTwitter) || null,
      userToken: toText(row.userToken) || null,
      tokenExpiration: toNullableIso(row.tokenExpiration),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  listUsers({ limit = 250 } = {}) {
    const rows = this.db
      .prepare(
        `
        SELECT
          u.id,
          u.user_type_id AS userTypeId,
          t.type AS userType,
          u.parse_id AS parseId,
          u.email,
          u.logged_in AS loggedIn,
          u.user_token AS userToken,
          u.token_expiration AS tokenExpiration,
          u.created_at AS createdAt,
          u.updated_at AS updatedAt
        FROM users u
        LEFT JOIN user_types t ON t.id = u.user_type_id
        ORDER BY u.id DESC
        LIMIT ?
        `
      )
      .all(clampInt(limit, { min: 1, max: 2000, fallback: 250 }));
    return rows.map((row) => ({
      id: Number(row.id || 0),
      userTypeId: row.userTypeId ? Number(row.userTypeId) : null,
      userType: toText(row.userType) || null,
      parseId: toText(row.parseId) || null,
      email: toText(row.email),
      loggedIn: Boolean(row.loggedIn),
      userToken: toText(row.userToken) || null,
      tokenExpiration: toNullableIso(row.tokenExpiration),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    }));
  }

  createUser(payload = {}) {
    const now = new Date().toISOString();
    const email = toText(payload.email).toLowerCase();
    const password = toText(payload.password);
    if (!email.includes("@")) return { error: "A valid email is required." };
    if (!password) return { error: "password is required." };

    const userTypeId = clampInt(payload.userTypeId, {
      min: 1,
      max: 2147483647,
      fallback: 0,
    });
    const safeTypeId = userTypeId || null;

    try {
      const result = this.db
        .prepare(
          `
          INSERT INTO users (
            user_type_id,
            parse_id,
            email,
            password,
            logged_in,
            token_facebook,
            token_twitter,
            user_token,
            token_expiration,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          safeTypeId,
          toText(payload.parseId),
          email,
          password,
          boolToInt(Boolean(payload.loggedIn)),
          toText(payload.tokenFacebook),
          toText(payload.tokenTwitter),
          toText(payload.userToken),
          toNullableIso(payload.tokenExpiration),
          now,
          now
        );
      return { user: this.getUser(Number(result.lastInsertRowid || 0)) };
    } catch (error) {
      if (String(error?.message || "").toLowerCase().includes("unique")) {
        return { error: "A user with this email already exists." };
      }
      return { error: error?.message || "Failed to create user." };
    }
  }

  addUserAddress({ userId, title }) {
    const user = this.getUser(userId);
    if (!user) return { error: "User not found." };
    const safeTitle = toText(title);
    if (!safeTitle) return { error: "title is required." };
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `
        INSERT INTO user_addresses (user_id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        `
      )
      .run(user.id, safeTitle, now, now);
    return { addressId: Number(result.lastInsertRowid || 0) };
  }

  listUserAddresses(userId, { limit = 100 } = {}) {
    return this.db
      .prepare(
        `
        SELECT
          id,
          user_id AS userId,
          title,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM user_addresses
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ?
        `
      )
      .all(Number(userId) || 0, clampInt(limit, { min: 1, max: 1000, fallback: 100 }))
      .map((row) => ({
        id: Number(row.id || 0),
        userId: Number(row.userId || 0),
        title: toText(row.title),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
      }));
  }

  createSchedule({ userId, goal, scheduleCloudId, intervalHours = 6, enabled = true }) {
    const user = this.getUser(userId);
    if (!user) return { error: "User not found." };
    const safeGoal = toText(goal);
    if (!safeGoal) return { error: "goal is required." };
    const now = new Date().toISOString();
    const safeIntervalHours = clampInt(intervalHours, { min: 1, max: 720, fallback: 6 });

    const created = this.db
      .prepare(
        `
        INSERT INTO user_schedules (
          user_id,
          goal,
          schedule_cloud_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(
        user.id,
        safeGoal,
        scheduleCloudId !== undefined && scheduleCloudId !== null
          ? clampInt(scheduleCloudId, { min: 1, max: 2147483647, fallback: 0 }) || null
          : null,
        now,
        now
      );
    const scheduleId = Number(created.lastInsertRowid || 0);
    this.db
      .prepare(
        `
        INSERT INTO user_schedule_runtime (
          schedule_id,
          enabled,
          interval_hours,
          last_run_at,
          next_run_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .run(scheduleId, boolToInt(Boolean(enabled)), safeIntervalHours, null, addHours(now, safeIntervalHours), now);
    return { scheduleId };
  }

  listSchedules({ userId = null, limit = 500 } = {}) {
    const hasUser = Number(userId) > 0;
    const rows = this.db
      .prepare(
        `
        SELECT
          s.id AS scheduleId,
          s.user_id AS userId,
          u.email AS userEmail,
          s.goal AS goal,
          s.schedule_cloud_id AS scheduleCloudId,
          s.created_at AS createdAt,
          s.updated_at AS updatedAt,
          r.enabled AS enabled,
          r.interval_hours AS intervalHours,
          r.last_run_at AS lastRunAt,
          r.next_run_at AS nextRunAt
        FROM user_schedules s
        JOIN users u ON u.id = s.user_id
        JOIN user_schedule_runtime r ON r.schedule_id = s.id
        WHERE (? = 0 OR s.user_id = ?)
        ORDER BY s.id DESC
        LIMIT ?
        `
      )
      .all(
        hasUser ? 1 : 0,
        hasUser ? Number(userId) : 0,
        clampInt(limit, { min: 1, max: 5000, fallback: 500 })
      );
    return rows.map((row) => ({
      scheduleId: Number(row.scheduleId || 0),
      userId: Number(row.userId || 0),
      userEmail: toText(row.userEmail),
      goal: toText(row.goal),
      scheduleCloudId: row.scheduleCloudId ? Number(row.scheduleCloudId) : null,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      enabled: Boolean(row.enabled),
      intervalHours: clampInt(row.intervalHours, { min: 1, max: 720, fallback: 6 }),
      lastRunAt: toNullableIso(row.lastRunAt),
      nextRunAt: toNullableIso(row.nextRunAt),
    }));
  }

  getSchedule(scheduleId) {
    const row = this.db
      .prepare(
        `
        SELECT
          s.id AS scheduleId,
          s.user_id AS userId,
          u.email AS userEmail,
          s.goal AS goal,
          s.schedule_cloud_id AS scheduleCloudId,
          r.enabled AS enabled,
          r.interval_hours AS intervalHours,
          r.last_run_at AS lastRunAt,
          r.next_run_at AS nextRunAt
        FROM user_schedules s
        JOIN users u ON u.id = s.user_id
        JOIN user_schedule_runtime r ON r.schedule_id = s.id
        WHERE s.id = ?
        LIMIT 1
        `
      )
      .get(Number(scheduleId) || 0);
    if (!row) return null;
    return {
      scheduleId: Number(row.scheduleId || 0),
      userId: Number(row.userId || 0),
      userEmail: toText(row.userEmail),
      goal: toText(row.goal),
      scheduleCloudId: row.scheduleCloudId ? Number(row.scheduleCloudId) : null,
      enabled: Boolean(row.enabled),
      intervalHours: clampInt(row.intervalHours, { min: 1, max: 720, fallback: 6 }),
      lastRunAt: toNullableIso(row.lastRunAt),
      nextRunAt: toNullableIso(row.nextRunAt),
    };
  }

  updateScheduleRuntime({ scheduleId, enabled, intervalHours, nextRunAt }) {
    const existing = this.db
      .prepare(
        `
        SELECT
          s.id AS scheduleId,
          r.enabled AS enabled,
          r.interval_hours AS intervalHours,
          r.last_run_at AS lastRunAt,
          r.next_run_at AS nextRunAt
        FROM user_schedules s
        JOIN user_schedule_runtime r ON r.schedule_id = s.id
        WHERE s.id = ?
        LIMIT 1
        `
      )
      .get(Number(scheduleId) || 0);
    if (!existing) return { error: "Schedule not found." };

    const now = new Date().toISOString();
    const safeEnabled = enabled === undefined ? Boolean(existing.enabled) : Boolean(enabled);
    const safeInterval = clampInt(intervalHours, {
      min: 1,
      max: 720,
      fallback: clampInt(existing.intervalHours, { min: 1, max: 720, fallback: 6 }),
    });
    const safeNextRun =
      nextRunAt === undefined
        ? toNullableIso(existing.nextRunAt)
        : toNullableIso(nextRunAt) || addHours(now, safeInterval);

    this.db
      .prepare(
        `
        UPDATE user_schedule_runtime
        SET enabled = ?, interval_hours = ?, next_run_at = ?, updated_at = ?
        WHERE schedule_id = ?
        `
      )
      .run(boolToInt(safeEnabled), safeInterval, safeNextRun, now, Number(scheduleId) || 0);

    return {
      scheduleId: Number(scheduleId) || 0,
      enabled: safeEnabled,
      intervalHours: safeInterval,
      nextRunAt: safeNextRun,
    };
  }

  listDueSchedules({ nowIso = new Date().toISOString(), limit = 100 } = {}) {
    const rows = this.db
      .prepare(
        `
        SELECT
          s.id AS scheduleId,
          s.user_id AS userId,
          u.email AS userEmail,
          s.goal AS goal,
          s.schedule_cloud_id AS scheduleCloudId,
          r.enabled AS enabled,
          r.interval_hours AS intervalHours,
          r.last_run_at AS lastRunAt,
          r.next_run_at AS nextRunAt
        FROM user_schedules s
        JOIN users u ON u.id = s.user_id
        JOIN user_schedule_runtime r ON r.schedule_id = s.id
        WHERE
          r.enabled = 1
          AND (r.next_run_at IS NULL OR r.next_run_at <= ?)
        ORDER BY COALESCE(r.next_run_at, '1970-01-01T00:00:00.000Z') ASC
        LIMIT ?
        `
      )
      .all(toIso(nowIso), clampInt(limit, { min: 1, max: 500, fallback: 100 }));
    return rows.map((row) => ({
      scheduleId: Number(row.scheduleId || 0),
      userId: Number(row.userId || 0),
      userEmail: toText(row.userEmail),
      goal: toText(row.goal),
      scheduleCloudId: row.scheduleCloudId ? Number(row.scheduleCloudId) : null,
      enabled: Boolean(row.enabled),
      intervalHours: clampInt(row.intervalHours, { min: 1, max: 720, fallback: 6 }),
      lastRunAt: toNullableIso(row.lastRunAt),
      nextRunAt: toNullableIso(row.nextRunAt),
    }));
  }

  markScheduleRunComplete({ scheduleId, ranAt, intervalHours }) {
    const safeRanAt = toIso(ranAt);
    const safeInterval = clampInt(intervalHours, { min: 1, max: 720, fallback: 6 });
    const nextRunAt = addHours(safeRanAt, safeInterval);
    this.db
      .prepare(
        `
        UPDATE user_schedule_runtime
        SET last_run_at = ?, next_run_at = ?, updated_at = ?
        WHERE schedule_id = ?
        `
      )
      .run(safeRanAt, nextRunAt, safeRanAt, Number(scheduleId) || 0);
    return {
      scheduleId: Number(scheduleId) || 0,
      lastRunAt: safeRanAt,
      nextRunAt,
    };
  }

  upsertMonitoredMap({ userId, mapUid, mapName = "", enabled = true, sourceLabel = "altered-ops" }) {
    const safeUserId = Number(userId) || 0;
    if (!this.getUser(safeUserId)) return { error: "User not found." };
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
    if (!row) return null;
    return {
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
    return rows.map((row) => ({
      id: Number(row.id || 0),
      userId: Number(row.userId || 0),
      userEmail: toText(row.userEmail),
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
    }));
  }

  updateMonitoredMapState({
    userId,
    mapUid,
    mapName,
    lastWrMs,
    lastWrHolder,
    lastCheckedAt,
    lastError,
  }) {
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

  getDiscordBotConfig() {
    const row = this.db
      .prepare(
        `
        SELECT
          config_id AS configId,
          enabled AS enabled,
          bot_name AS botName,
          guild_id AS guildId,
          channel_id AS channelId,
          webhook_url AS webhookUrl,
          announce_wr_changes AS announceWrChanges,
          mention_role_id AS mentionRoleId,
          footer_text AS footerText,
          updated_at AS updatedAt
        FROM discord_bot_config
        WHERE config_id = 1
        LIMIT 1
        `
      )
      .get();
    if (!row) return null;
    return {
      configId: Number(row.configId || 1),
      enabled: Boolean(row.enabled),
      botName: toText(row.botName) || "altered-bot",
      guildId: toText(row.guildId) || null,
      channelId: toText(row.channelId) || null,
      webhookUrl: toText(row.webhookUrl) || null,
      announceWrChanges: Boolean(row.announceWrChanges),
      mentionRoleId: toText(row.mentionRoleId) || null,
      footerText: toText(row.footerText) || null,
      updatedAt: toIso(row.updatedAt),
    };
  }

  updateDiscordBotConfig(payload = {}) {
    const existing = this.getDiscordBotConfig();
    const now = new Date().toISOString();
    const merged = {
      enabled: payload.enabled === undefined ? Boolean(existing?.enabled) : Boolean(payload.enabled),
      botName: toText(payload.botName) || toText(existing?.botName) || "altered-bot",
      guildId: payload.guildId === undefined ? toText(existing?.guildId) : toText(payload.guildId),
      channelId: payload.channelId === undefined ? toText(existing?.channelId) : toText(payload.channelId),
      webhookUrl:
        payload.webhookUrl === undefined ? toText(existing?.webhookUrl) : toText(payload.webhookUrl),
      announceWrChanges:
        payload.announceWrChanges === undefined
          ? Boolean(existing?.announceWrChanges)
          : Boolean(payload.announceWrChanges),
      mentionRoleId:
        payload.mentionRoleId === undefined
          ? toText(existing?.mentionRoleId)
          : toText(payload.mentionRoleId),
      footerText:
        payload.footerText === undefined ? toText(existing?.footerText) : toText(payload.footerText),
    };
    this.db
      .prepare(
        `
        INSERT INTO discord_bot_config (
          config_id,
          enabled,
          bot_name,
          guild_id,
          channel_id,
          webhook_url,
          announce_wr_changes,
          mention_role_id,
          footer_text,
          updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(config_id) DO UPDATE SET
          enabled = excluded.enabled,
          bot_name = excluded.bot_name,
          guild_id = excluded.guild_id,
          channel_id = excluded.channel_id,
          webhook_url = excluded.webhook_url,
          announce_wr_changes = excluded.announce_wr_changes,
          mention_role_id = excluded.mention_role_id,
          footer_text = excluded.footer_text,
          updated_at = excluded.updated_at
        `
      )
      .run(
        boolToInt(merged.enabled),
        merged.botName,
        merged.guildId,
        merged.channelId,
        merged.webhookUrl,
        boolToInt(merged.announceWrChanges),
        merged.mentionRoleId,
        merged.footerText,
        now
      );
    return this.getDiscordBotConfig();
  }

  enqueueDiscordCommand({ commandType, payload = {}, source = "ops-scheduler" }) {
    const safeType = toText(commandType);
    if (!safeType) return { error: "commandType is required." };
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `
        INSERT INTO discord_bot_commands (
          status,
          command_type,
          payload_json,
          source,
          created_at
        ) VALUES (?, ?, ?, ?, ?)
        `
      )
      .run("queued", safeType, serializeJson(payload), toText(source) || "ops-scheduler", now);
    return { commandId: Number(result.lastInsertRowid || 0) };
  }

  listDiscordCommands({ status = "", limit = 200 } = {}) {
    const safeStatus = normalizeCommandStatus(status, "");
    return this.db
      .prepare(
        `
        SELECT
          command_id AS commandId,
          status,
          command_type AS commandType,
          payload_json AS payloadJson,
          source,
          created_at AS createdAt,
          processed_at AS processedAt,
          error
        FROM discord_bot_commands
        WHERE (? = '' OR status = ?)
        ORDER BY command_id DESC
        LIMIT ?
        `
      )
      .all(
        safeStatus,
        safeStatus,
        clampInt(limit, { min: 1, max: 5000, fallback: 200 })
      )
      .map((row) => ({
        commandId: Number(row.commandId || 0),
        status: normalizeCommandStatus(row.status),
        commandType: toText(row.commandType),
        payload: parseJsonSafe(row.payloadJson, {}),
        source: toText(row.source),
        createdAt: toIso(row.createdAt),
        processedAt: toNullableIso(row.processedAt),
        error: toText(row.error) || null,
      }));
  }

  updateDiscordCommandStatus({ commandId, status, error = "" }) {
    const safeStatus = normalizeCommandStatus(status, "queued");
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        UPDATE discord_bot_commands
        SET
          status = ?,
          processed_at = CASE WHEN ? = 'queued' THEN NULL ELSE ? END,
          error = CASE WHEN ? = '' THEN NULL ELSE ? END
        WHERE command_id = ?
        `
      )
      .run(safeStatus, safeStatus, now, toText(error), toText(error), Number(commandId) || 0);
    const row = this.db
      .prepare(
        `
        SELECT
          command_id AS commandId,
          status,
          command_type AS commandType,
          payload_json AS payloadJson,
          source,
          created_at AS createdAt,
          processed_at AS processedAt,
          error
        FROM discord_bot_commands
        WHERE command_id = ?
        LIMIT 1
        `
      )
      .get(Number(commandId) || 0);
    if (!row) return null;
    return {
      commandId: Number(row.commandId || 0),
      status: normalizeCommandStatus(row.status),
      commandType: toText(row.commandType),
      payload: parseJsonSafe(row.payloadJson, {}),
      source: toText(row.source),
      createdAt: toIso(row.createdAt),
      processedAt: toNullableIso(row.processedAt),
      error: toText(row.error) || null,
    };
  }

  getCounts() {
    const users = Number(this.db.prepare("SELECT COUNT(*) AS count FROM users").get()?.count || 0);
    const schedules = Number(
      this.db.prepare("SELECT COUNT(*) AS count FROM user_schedules").get()?.count || 0
    );
    const monitoredMaps = Number(
      this.db.prepare("SELECT COUNT(*) AS count FROM monitored_maps").get()?.count || 0
    );
    const dueSchedules = Number(
      this.db
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM user_schedule_runtime
          WHERE enabled = 1 AND (next_run_at IS NULL OR next_run_at <= ?)
          `
        )
        .get(new Date().toISOString())?.count || 0
    );
    const queuedBotCommands = Number(
      this.db
        .prepare("SELECT COUNT(*) AS count FROM discord_bot_commands WHERE status = 'queued'")
        .get()?.count || 0
    );
    return {
      users,
      schedules,
      monitoredMaps,
      dueSchedules,
      queuedBotCommands,
    };
  }
}

export { OpsRepository };
