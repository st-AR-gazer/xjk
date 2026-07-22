import { clampInt, toIso, toNullableIso, toText } from "../../../../shared/valueUtils.js";
import { addHours, boolToInt } from "./support.js";

function rowToSchedule(row, { includeTimestamps = false } = {}) {
  const common = {
    scheduleId: Number(row.scheduleId || 0),
    userId: Number(row.userId || 0),
    userEmail: toText(row.userEmail),
    goal: toText(row.goal),
    scheduleCloudId: row.scheduleCloudId ? Number(row.scheduleCloudId) : null,
  };
  if (includeTimestamps) {
    return {
      ...common,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      enabled: Boolean(row.enabled),
      intervalHours: clampInt(row.intervalHours, { min: 1, max: 720, fallback: 6 }),
      lastRunAt: toNullableIso(row.lastRunAt),
      nextRunAt: toNullableIso(row.nextRunAt),
    };
  }
  return {
    ...common,
    enabled: Boolean(row.enabled),
    intervalHours: clampInt(row.intervalHours, { min: 1, max: 720, fallback: 6 }),
    lastRunAt: toNullableIso(row.lastRunAt),
    nextRunAt: toNullableIso(row.nextRunAt),
  };
}

class OpsScheduleRepository {
  constructor(db, userRepository) {
    this.db = db;
    this.userRepository = userRepository;
  }

  createSchedule({ userId, goal, scheduleCloudId, intervalHours = 6, enabled = true }) {
    const user = this.userRepository.getUser(userId);
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
      .all(hasUser ? 1 : 0, hasUser ? Number(userId) : 0, clampInt(limit, { min: 1, max: 5000, fallback: 500 }));
    return rows.map((row) => rowToSchedule(row, { includeTimestamps: true }));
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
    return row ? rowToSchedule(row) : null;
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
    return rows.map((row) => rowToSchedule(row));
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

  countSchedules() {
    return Number(this.db.prepare("SELECT COUNT(*) AS count FROM user_schedules").get()?.count || 0);
  }

  countDueSchedules(nowIso) {
    return Number(
      this.db
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM user_schedule_runtime
          WHERE enabled = 1 AND (next_run_at IS NULL OR next_run_at <= ?)
          `
        )
        .get(nowIso)?.count || 0
    );
  }
}

export { OpsScheduleRepository };
