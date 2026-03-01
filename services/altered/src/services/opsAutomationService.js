function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function toText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function parseOptionalBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return undefined;
  const raw = String(value).trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return undefined;
}

function toNullableInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

const OPS_SCHEMA_MERMAID = `
erDiagram
  user_types ||--o{ users : user_type_id
  users ||--o{ user_addresses : user_id
  users ||--o{ user_schedules : user_id
  user_schedules ||--|| user_schedule_runtime : schedule_id
  users ||--o{ monitored_maps : user_id
  user_schedules ||--o{ map_poll_runs : schedule_id
  users ||--o{ map_poll_runs : user_id
  map_poll_runs ||--o{ map_poll_events : run_id
  user_schedules ||--o{ map_poll_events : schedule_id
  users ||--o{ map_poll_events : user_id

  user_types {
    int id PK
    varchar type
  }
  users {
    int id PK
    int user_type_id FK
    varchar parse_id
    varchar email
    varchar password
    boolean logged_in
    varchar token_facebook
    varchar token_twitter
    varchar user_token
    datetime token_expiration
  }
  user_schedules {
    int id PK
    int user_id FK
    varchar goal
    int schedule_cloud_id
  }
  user_addresses {
    int id PK
    int user_id FK
    varchar title
  }
`;

class OpsAutomationService {
  constructor({
    repository,
    trackerClient,
    monitorConfig = {},
    logger = console,
  }) {
    this.repository = repository;
    this.trackerClient = trackerClient;
    this.logger = logger;
    this.repository.ensureDefaults();
    this.scheduler = {
      enabled:
        monitorConfig.enabled === undefined
          ? true
          : Boolean(monitorConfig.enabled),
      tickSeconds: clampInt(monitorConfig.tickSeconds, {
        min: 15,
        max: 86400,
        fallback: 120,
      }),
      maxMapsPerRun: clampInt(monitorConfig.maxMapsPerRun, {
        min: 1,
        max: 25000,
        fallback: 5000,
      }),
      timer: null,
      running: false,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastError: null,
      lastSummary: null,
    };
  }

  getSchemaMermaid() {
    return OPS_SCHEMA_MERMAID.trim();
  }

  getSchedulerStatus() {
    return {
      enabled: this.scheduler.enabled,
      tickSeconds: this.scheduler.tickSeconds,
      maxMapsPerRun: this.scheduler.maxMapsPerRun,
      running: this.scheduler.running,
      lastStartedAt: this.scheduler.lastStartedAt,
      lastFinishedAt: this.scheduler.lastFinishedAt,
      lastError: this.scheduler.lastError,
      lastSummary: this.scheduler.lastSummary,
      hasTimer: Boolean(this.scheduler.timer),
    };
  }

  getOverview() {
    return {
      counts: this.repository.getCounts(),
      scheduler: this.getSchedulerStatus(),
      bot: this.repository.getDiscordBotConfig(),
    };
  }

  updateSchedulerConfig(payload = {}) {
    const enabled = parseOptionalBoolean(payload.enabled);
    if (enabled !== undefined) this.scheduler.enabled = enabled;
    if (payload.tickSeconds !== undefined) {
      this.scheduler.tickSeconds = clampInt(payload.tickSeconds, {
        min: 15,
        max: 86400,
        fallback: this.scheduler.tickSeconds,
      });
    }
    if (payload.maxMapsPerRun !== undefined) {
      this.scheduler.maxMapsPerRun = clampInt(payload.maxMapsPerRun, {
        min: 1,
        max: 25000,
        fallback: this.scheduler.maxMapsPerRun,
      });
    }
    if (this.scheduler.enabled) this.startScheduler();
    else this.stopScheduler();
    return this.getSchedulerStatus();
  }

  startScheduler() {
    if (this.scheduler.timer) {
      clearInterval(this.scheduler.timer);
      this.scheduler.timer = null;
    }
    if (!this.scheduler.enabled) return false;
    const intervalMs = this.scheduler.tickSeconds * 1000;
    this.scheduler.timer = setInterval(() => {
      this.runDueSchedules({ reason: "interval" }).catch((error) => {
        this.scheduler.lastError = error?.message || "Failed to run due schedules.";
        this.logger.warn(`[altered-ops] scheduler interval failed: ${this.scheduler.lastError}`);
      });
    }, intervalMs);
    this.scheduler.timer.unref?.();
    return true;
  }

  stopScheduler() {
    if (this.scheduler.timer) {
      clearInterval(this.scheduler.timer);
      this.scheduler.timer = null;
    }
    this.scheduler.running = false;
    return true;
  }

  listUsers(limit = 250) {
    return this.repository.listUsers({ limit });
  }

  createUser(payload = {}) {
    return this.repository.createUser(payload);
  }

  addUserAddress({ userId, title }) {
    return this.repository.addUserAddress({ userId, title });
  }

  listUserAddresses(userId, limit = 100) {
    return this.repository.listUserAddresses(userId, { limit });
  }

  listUserTypes() {
    return this.repository.listUserTypes();
  }

  listSchedules({ userId = null, limit = 500 } = {}) {
    return this.repository.listSchedules({ userId, limit });
  }

  createSchedule(payload = {}) {
    return this.repository.createSchedule({
      userId: payload.userId,
      goal: payload.goal,
      scheduleCloudId: payload.scheduleCloudId,
      intervalHours: payload.intervalHours,
      enabled: payload.enabled,
    });
  }

  updateScheduleRuntime(payload = {}) {
    return this.repository.updateScheduleRuntime({
      scheduleId: payload.scheduleId,
      enabled: payload.enabled,
      intervalHours: payload.intervalHours,
      nextRunAt: payload.nextRunAt,
    });
  }

  listMonitoredMaps({ userId = null, enabledOnly = false, limit = 5000 } = {}) {
    return this.repository.listMonitoredMaps({
      userId,
      enabledOnly,
      limit,
    });
  }

  listPollRuns({ limit = 100 } = {}) {
    return this.repository.listMapPollRuns({ limit });
  }

  listPollEvents({ mapUid = "", limit = 200 } = {}) {
    return this.repository.listMapPollEvents({ mapUid, limit });
  }

  addMonitoredMap(payload = {}) {
    return this.repository.upsertMonitoredMap({
      userId: payload.userId,
      mapUid: payload.mapUid,
      mapName: payload.mapName,
      enabled: payload.enabled,
      sourceLabel: payload.sourceLabel,
    });
  }

  getBotConfig() {
    return this.repository.getDiscordBotConfig();
  }

  updateBotConfig(payload = {}) {
    return this.repository.updateDiscordBotConfig(payload);
  }

  listBotCommands({ status = "", limit = 200 } = {}) {
    return this.repository.listDiscordCommands({ status, limit });
  }

  enqueueBotCommand(payload = {}) {
    return this.repository.enqueueDiscordCommand({
      commandType: payload.commandType,
      payload: payload.payload || {},
      source: payload.source || "manual",
    });
  }

  updateBotCommandStatus(payload = {}) {
    return this.repository.updateDiscordCommandStatus({
      commandId: payload.commandId,
      status: payload.status,
      error: payload.error || "",
    });
  }

  async checkMapNow({ userId, mapUid, reason = "manual-check" }) {
    const map = this.repository.getMonitoredMap({ userId, mapUid });
    if (!map) return { error: "Monitored map not found for this user." };

    const pseudoSchedule = {
      scheduleId: null,
      userId: map.userId,
      intervalHours: 1,
      goal: reason,
    };
    const runId = this.repository.createMapPollRun({
      scheduleId: null,
      userId: map.userId,
      mapsTotal: 1,
    });
    const result = await this.checkSingleMap({
      schedule: pseudoSchedule,
      runId,
      map,
      reason,
    });
    this.repository.finishMapPollRun({
      runId,
      mapsChecked: 1,
      mapsChanged: result.changed ? 1 : 0,
      status: result.error ? "error" : "ok",
      note: reason,
    });
    return result.error ? { error: result.error, result } : { result };
  }

  async checkSingleMap({ schedule, runId, map, reason }) {
    const checkedAt = new Date().toISOString();
    const trackerResult = await this.trackerClient.getMapInfo(map.mapUid);
    if (!trackerResult.ok) {
      const error = trackerResult.error || "Failed to query tracker.";
      this.repository.updateMonitoredMapState({
        userId: schedule.userId,
        mapUid: map.mapUid,
        lastCheckedAt: checkedAt,
        lastError: error,
      });
      this.repository.recordMapPollEvent({
        runId,
        scheduleId: schedule.scheduleId,
        userId: schedule.userId,
        mapUid: map.mapUid,
        mapName: map.mapName,
        checkedAt,
        changed: false,
        oldWrMs: map.lastWrMs,
        newWrMs: map.lastWrMs,
        oldWrHolder: map.lastWrHolder,
        newWrHolder: map.lastWrHolder,
        error,
      });
      return { mapUid: map.mapUid, changed: false, error };
    }

    const payload = trackerResult.data || {};
    if (!payload.exists || !payload.map) {
      const error = "Map not found in tracker.";
      this.repository.updateMonitoredMapState({
        userId: schedule.userId,
        mapUid: map.mapUid,
        lastCheckedAt: checkedAt,
        lastError: error,
      });
      this.repository.recordMapPollEvent({
        runId,
        scheduleId: schedule.scheduleId,
        userId: schedule.userId,
        mapUid: map.mapUid,
        mapName: map.mapName,
        checkedAt,
        changed: false,
        oldWrMs: map.lastWrMs,
        newWrMs: map.lastWrMs,
        oldWrHolder: map.lastWrHolder,
        newWrHolder: map.lastWrHolder,
        error,
      });
      return { mapUid: map.mapUid, changed: false, error };
    }

    const trackerMap = payload.map || {};
    const currentName = toText(trackerMap.name) || map.mapName || map.mapUid;
    const newWrMs = toNullableInt(trackerMap.wrMs ?? trackerMap.wr_ms);
    const newWrHolder = toText(trackerMap.wrHolder ?? trackerMap.wr_holder) || null;
    const oldWrMs = map.lastWrMs;
    const oldWrHolder = map.lastWrHolder;
    const changed =
      oldWrMs !== null &&
      newWrMs !== null &&
      (Number(oldWrMs) !== Number(newWrMs) || toText(oldWrHolder) !== toText(newWrHolder));

    this.repository.updateMonitoredMapState({
      userId: schedule.userId,
      mapUid: map.mapUid,
      mapName: currentName,
      lastWrMs: newWrMs,
      lastWrHolder: newWrHolder,
      lastCheckedAt: checkedAt,
      lastError: null,
    });
    this.repository.recordMapPollEvent({
      runId,
      scheduleId: schedule.scheduleId,
      userId: schedule.userId,
      mapUid: map.mapUid,
      mapName: currentName,
      checkedAt,
      changed,
      oldWrMs,
      newWrMs,
      oldWrHolder,
      newWrHolder,
      error: null,
    });

    if (changed) {
      const botConfig = this.repository.getDiscordBotConfig();
      if (botConfig?.enabled && botConfig?.announceWrChanges) {
        this.repository.enqueueDiscordCommand({
          commandType: "announce_map_wr_change",
          payload: {
            mapUid: map.mapUid,
            mapName: currentName,
            checkedAt,
            oldWrMs,
            newWrMs,
            oldWrHolder,
            newWrHolder,
            reason,
            userId: schedule.userId,
            scheduleId: schedule.scheduleId,
            channelId: botConfig.channelId || null,
            guildId: botConfig.guildId || null,
            mentionRoleId: botConfig.mentionRoleId || null,
            footerText: botConfig.footerText || null,
          },
          source: "ops-map-monitor",
        });
      }
    }

    return {
      mapUid: map.mapUid,
      mapName: currentName,
      changed,
      oldWrMs,
      newWrMs,
      oldWrHolder,
      newWrHolder,
      error: null,
    };
  }

  async runSchedule(schedule, { reason = "manual" } = {}) {
    const maps = this.repository.listMonitoredMaps({
      userId: schedule.userId,
      enabledOnly: true,
      limit: this.scheduler.maxMapsPerRun,
    });
    const runId = this.repository.createMapPollRun({
      scheduleId: schedule.scheduleId,
      userId: schedule.userId,
      mapsTotal: maps.length,
    });
    let mapsChecked = 0;
    let mapsChanged = 0;
    let hadError = false;

    for (const map of maps) {
      const result = await this.checkSingleMap({
        schedule,
        runId,
        map,
        reason,
      });
      mapsChecked += 1;
      if (result.changed) mapsChanged += 1;
      if (result.error) hadError = true;
    }

    const finishedAt = this.repository.finishMapPollRun({
      runId,
      mapsChecked,
      mapsChanged,
      status: hadError ? "error" : "ok",
      note: reason,
    });
    this.repository.markScheduleRunComplete({
      scheduleId: schedule.scheduleId,
      ranAt: finishedAt,
      intervalHours: schedule.intervalHours,
    });
    return {
      runId,
      scheduleId: schedule.scheduleId,
      userId: schedule.userId,
      mapsTotal: maps.length,
      mapsChecked,
      mapsChanged,
      status: hadError ? "error" : "ok",
      finishedAt,
    };
  }

  async runScheduleNow({ scheduleId, reason = "manual-single" } = {}) {
    const schedule = this.repository.getSchedule(scheduleId);
    if (!schedule) return { error: "Schedule not found." };
    const run = await this.runSchedule(schedule, { reason });
    return { run };
  }

  async runDueSchedules({ reason = "manual-due-check" } = {}) {
    if (this.scheduler.running) {
      return { skipped: true, reason: "Scheduler is already running." };
    }

    this.scheduler.running = true;
    this.scheduler.lastStartedAt = new Date().toISOString();
    this.scheduler.lastError = null;

    try {
      const due = this.repository.listDueSchedules({
        nowIso: this.scheduler.lastStartedAt,
        limit: 200,
      });
      const runs = [];
      for (const schedule of due) {
        runs.push(await this.runSchedule(schedule, { reason }));
      }
      const summary = {
        dueSchedules: due.length,
        runsCreated: runs.length,
        mapsChecked: runs.reduce((sum, run) => sum + Number(run.mapsChecked || 0), 0),
        mapsChanged: runs.reduce((sum, run) => sum + Number(run.mapsChanged || 0), 0),
        finishedAt: new Date().toISOString(),
      };
      this.scheduler.lastSummary = summary;
      this.scheduler.lastFinishedAt = summary.finishedAt;
      return summary;
    } catch (error) {
      const message = error?.message || "Failed to run due schedules.";
      this.scheduler.lastError = message;
      this.scheduler.lastFinishedAt = new Date().toISOString();
      return { error: message };
    } finally {
      this.scheduler.running = false;
    }
  }
}

export { OpsAutomationService };
