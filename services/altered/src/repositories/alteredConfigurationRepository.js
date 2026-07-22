import { clampInt, parseJsonSafe, serializeJson, toIso, toText } from "../../../shared/valueUtils.js";

const DEFAULT_HOOK_KEY = "altered-club";

function normalizeScheduleMode(value, fallback = "interval") {
  const mode = String(value || "")
    .trim()
    .toLowerCase();
  return mode === "daily" || mode === "interval" ? mode : fallback;
}

class AlteredConfigurationRepository {
  constructor(db) {
    this.db = db;
  }

  ensureDefaultHookConfig({
    hookKey = DEFAULT_HOOK_KEY,
    clubId = 24231,
    clubName = "Altered Nadeo",
    sourceLabel = "altered-monitor",
  } = {}) {
    const existing = this.getHookConfig(hookKey);
    if (existing) return existing;
    return this.updateHookConfig({
      hookKey,
      clubId,
      clubName,
      sourceLabel,
      enabled: true,
      autoTrackNewMaps: true,
    });
  }

  ensureHookConfigs(configs = []) {
    const list = Array.isArray(configs) ? configs : [];
    const out = [];
    for (const config of list) {
      const hookKey = String(config?.hookKey || DEFAULT_HOOK_KEY).trim() || DEFAULT_HOOK_KEY;
      const existing = this.getHookConfig(hookKey);
      if (existing) {
        out.push(existing);
        continue;
      }
      const inserted = this.updateHookConfig({
        hookKey,
        clubId: config?.clubId,
        clubName: config?.clubName,
        sourceLabel: config?.sourceLabel,
        enabled: config?.enabled === undefined ? true : Boolean(config.enabled),
        autoTrackNewMaps: config?.autoTrackNewMaps === undefined ? true : Boolean(config.autoTrackNewMaps),
      });
      if (inserted) out.push(inserted);
    }
    return out;
  }

  getHookConfig(hookKey = DEFAULT_HOOK_KEY) {
    const row = this.db
      .prepare(
        `
        SELECT
          hook_key AS hookKey,
          club_id AS clubId,
          club_name AS clubName,
          source_label AS sourceLabel,
          enabled AS enabled,
          auto_track_new_maps AS autoTrackNewMaps,
          created_at AS createdAt,
          updated_at AS updatedAt,
          last_synced_at AS lastSyncedAt,
          last_error AS lastError
        FROM altered_hook_config
        WHERE hook_key = ?
        LIMIT 1
        `
      )
      .get(hookKey);
    if (!row) return null;
    return {
      ...row,
      enabled: Boolean(row.enabled),
      autoTrackNewMaps: Boolean(row.autoTrackNewMaps),
    };
  }

  listHookConfigs({ includeDisabled = true } = {}) {
    const whereSql = includeDisabled ? "" : "WHERE enabled = 1";
    const rows = this.db
      .prepare(
        `
        SELECT
          hook_key AS hookKey,
          club_id AS clubId,
          club_name AS clubName,
          source_label AS sourceLabel,
          enabled AS enabled,
          auto_track_new_maps AS autoTrackNewMaps,
          created_at AS createdAt,
          updated_at AS updatedAt,
          last_synced_at AS lastSyncedAt,
          last_error AS lastError
        FROM altered_hook_config
        ${whereSql}
        ORDER BY
          CASE WHEN hook_key = ? THEN 0 ELSE 1 END,
          enabled DESC,
          updated_at DESC,
          club_name COLLATE NOCASE ASC
        `
      )
      .all(DEFAULT_HOOK_KEY);
    return rows.map((row) => ({
      ...row,
      enabled: Boolean(row.enabled),
      autoTrackNewMaps: Boolean(row.autoTrackNewMaps),
    }));
  }

  updateHookConfig(options = {}) {
    const hookKey = String(options.hookKey || DEFAULT_HOOK_KEY).trim() || DEFAULT_HOOK_KEY;
    const existing = this.getHookConfig(hookKey);
    const now = new Date().toISOString();
    const hasLastSyncedAt = Object.prototype.hasOwnProperty.call(options, "lastSyncedAt");
    const hasLastError = Object.prototype.hasOwnProperty.call(options, "lastError");

    const clubId =
      options.clubId !== undefined
        ? clampInt(options.clubId, { min: 1, max: 2147483647, fallback: 0 })
        : clampInt(existing?.clubId, { min: 1, max: 2147483647, fallback: 0 });
    if (!clubId) return null;

    const clubName =
      String(options.clubName || "").trim() || String(existing?.clubName || "").trim() || `Club ${clubId}`;
    const sourceLabel =
      String(options.sourceLabel || "").trim() || String(existing?.sourceLabel || "").trim() || "altered-monitor";
    const enabled = options.enabled === undefined ? Boolean(existing?.enabled ?? true) : Boolean(options.enabled);
    const autoTrackNewMaps =
      options.autoTrackNewMaps === undefined
        ? Boolean(existing?.autoTrackNewMaps ?? true)
        : Boolean(options.autoTrackNewMaps);
    const lastSyncedAt = hasLastSyncedAt
      ? options.lastSyncedAt
        ? toIso(options.lastSyncedAt, now)
        : null
      : existing?.lastSyncedAt || null;
    const lastError = hasLastError
      ? options.lastError
        ? String(options.lastError)
        : null
      : existing?.lastError || null;

    this.db
      .prepare(
        `
        INSERT INTO altered_hook_config (
          hook_key, club_id, club_name, source_label, enabled, auto_track_new_maps,
          created_at, updated_at, last_synced_at, last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(hook_key) DO UPDATE SET
          club_id = excluded.club_id,
          club_name = excluded.club_name,
          source_label = excluded.source_label,
          enabled = excluded.enabled,
          auto_track_new_maps = excluded.auto_track_new_maps,
          updated_at = excluded.updated_at,
          last_synced_at = excluded.last_synced_at,
          last_error = excluded.last_error
        `
      )
      .run(
        hookKey,
        clubId,
        clubName,
        sourceLabel,
        enabled ? 1 : 0,
        autoTrackNewMaps ? 1 : 0,
        existing?.createdAt || now,
        now,
        lastSyncedAt,
        lastError
      );

    return this.getHookConfig(hookKey);
  }

  getProjectSource(sourceKey = "") {
    const safeSourceKey = toText(sourceKey);
    if (!safeSourceKey) return null;
    const row = this.db
      .prepare(
        `
        SELECT
          source_key AS sourceKey,
          source_type AS sourceType,
          display_name AS displayName,
          source_label AS sourceLabel,
          enabled AS enabled,
          last_synced_at AS lastSyncedAt,
          last_error AS lastError,
          summary_json AS summaryJson,
          metadata_json AS metadataJson,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM altered_project_sources
        WHERE source_key = ?
        LIMIT 1
        `
      )
      .get(safeSourceKey);
    if (!row) return null;

    const summary = parseJsonSafe(row.summaryJson, {}) || {};
    const metadata = parseJsonSafe(row.metadataJson, {}) || {};
    let campaignCount = Number(summary.campaignCount || 0);
    let mapCount = Number(summary.mapCount || 0);
    let trackedCount = Number(summary.trackedCount || 0);
    const campaignType = toText(metadata.campaignType);
    if (campaignType) {
      const aggregate = this.db
        .prepare(
          `
          SELECT
            COUNT(DISTINCT c.campaign_id) AS campaignCount,
            COUNT(DISTINCT p.map_uid) AS mapCount,
            SUM(CASE WHEN m.tracked = 1 THEN 1 ELSE 0 END) AS trackedCount
          FROM altered_campaigns c
          LEFT JOIN altered_map_positions p ON p.campaign_id = c.campaign_id
          LEFT JOIN altered_maps m ON m.map_uid = p.map_uid
          WHERE LOWER(COALESCE(c.campaign_type, '')) = LOWER(?)
          `
        )
        .get(campaignType);
      campaignCount = Number(aggregate?.campaignCount || campaignCount || 0);
      mapCount = Number(aggregate?.mapCount || mapCount || 0);
      trackedCount = Number(aggregate?.trackedCount || trackedCount || 0);
    }

    return {
      sourceKey: row.sourceKey,
      sourceType: row.sourceType || "special",
      displayName: row.displayName || row.sourceKey,
      sourceLabel: row.sourceLabel || row.sourceKey,
      enabled: Boolean(row.enabled),
      lastSyncedAt: row.lastSyncedAt || null,
      lastError: row.lastError || null,
      summary: summary && typeof summary === "object" ? summary : {},
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null,
      campaignCount,
      mapCount,
      trackedCount,
    };
  }

  listProjectSources({ includeDisabled = true } = {}) {
    const whereSql = includeDisabled ? "" : "WHERE enabled = 1";
    const rows = this.db
      .prepare(
        `
        SELECT source_key AS sourceKey
        FROM altered_project_sources
        ${whereSql}
        ORDER BY enabled DESC, updated_at DESC, display_name COLLATE NOCASE ASC
        `
      )
      .all();
    return rows.map((row) => this.getProjectSource(row.sourceKey)).filter(Boolean);
  }

  upsertProjectSource({
    sourceKey,
    sourceType = "special",
    displayName = "",
    sourceLabel = "",
    enabled = true,
    lastSyncedAt = undefined,
    lastError = undefined,
    summary = undefined,
    metadata = undefined,
  } = {}) {
    const safeSourceKey = toText(sourceKey);
    if (!safeSourceKey) return null;
    const existing = this.getProjectSource(safeSourceKey);
    const now = new Date().toISOString();
    const hasLastSyncedAt = Object.prototype.hasOwnProperty.call(arguments[0] || {}, "lastSyncedAt");
    const hasLastError = Object.prototype.hasOwnProperty.call(arguments[0] || {}, "lastError");
    const hasSummary = Object.prototype.hasOwnProperty.call(arguments[0] || {}, "summary");
    const hasMetadata = Object.prototype.hasOwnProperty.call(arguments[0] || {}, "metadata");
    const nextSummary = hasSummary ? serializeJson(summary || {}) : serializeJson(existing?.summary || {});
    const nextMetadata = hasMetadata ? serializeJson(metadata || {}) : serializeJson(existing?.metadata || {});
    const nextLastSyncedAt = hasLastSyncedAt
      ? lastSyncedAt
        ? toIso(lastSyncedAt, now)
        : null
      : existing?.lastSyncedAt || null;
    const nextLastError = hasLastError ? (lastError ? toText(lastError) : null) : existing?.lastError || null;

    this.db
      .prepare(
        `
        INSERT INTO altered_project_sources (
          source_key,
          source_type,
          display_name,
          source_label,
          enabled,
          last_synced_at,
          last_error,
          summary_json,
          metadata_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_key) DO UPDATE SET
          source_type = excluded.source_type,
          display_name = excluded.display_name,
          source_label = excluded.source_label,
          enabled = excluded.enabled,
          last_synced_at = excluded.last_synced_at,
          last_error = excluded.last_error,
          summary_json = excluded.summary_json,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
        `
      )
      .run(
        safeSourceKey,
        toText(sourceType) || "special",
        toText(displayName) || existing?.displayName || safeSourceKey,
        toText(sourceLabel) || existing?.sourceLabel || safeSourceKey,
        enabled ? 1 : 0,
        nextLastSyncedAt,
        nextLastError,
        nextSummary,
        nextMetadata,
        existing?.createdAt || now,
        now
      );

    return this.getProjectSource(safeSourceKey);
  }

  getLiveMonitorConfig() {
    const row = this.db
      .prepare(
        `
        SELECT
          enabled AS enabled,
          schedule_mode AS scheduleMode,
          daily_hour_utc AS dailyHourUtc,
          daily_minute_utc AS dailyMinuteUtc,
          club_id AS clubId,
          interval_seconds AS intervalSeconds,
          discovery_enabled AS discoveryEnabled,
          discovery_interval_seconds AS discoveryIntervalSeconds,
          discovery_campaign_limit AS discoveryCampaignLimit,
          discovery_activity_page_size AS discoveryActivityPageSize,
          activity_page_size AS activityPageSize,
          active_only AS activeOnly,
          fetch_map_details AS fetchMapDetails,
          tracker_chunk_size AS trackerChunkSize,
          updated_at AS updatedAt
        FROM altered_live_monitor_config
        WHERE config_id = 1
        LIMIT 1
        `
      )
      .get();
    if (!row) return null;
    return {
      enabled: Boolean(row.enabled),
      scheduleMode: normalizeScheduleMode(row.scheduleMode, "daily"),
      dailyHourUtc: clampInt(row.dailyHourUtc, { min: 0, max: 23, fallback: 3 }),
      dailyMinuteUtc: clampInt(row.dailyMinuteUtc, { min: 0, max: 59, fallback: 0 }),
      clubId: clampInt(row.clubId, { min: 1, max: 2147483647, fallback: 24231 }),
      intervalSeconds: clampInt(row.intervalSeconds, { min: 60, max: 86400, fallback: 21600 }),
      discoveryEnabled: Boolean(row.discoveryEnabled),
      discoveryIntervalSeconds: clampInt(row.discoveryIntervalSeconds, {
        min: 300,
        max: 86400,
        fallback: 3600,
      }),
      discoveryCampaignLimit: clampInt(row.discoveryCampaignLimit, {
        min: 1,
        max: 250,
        fallback: 25,
      }),
      discoveryActivityPageSize: clampInt(row.discoveryActivityPageSize, {
        min: 1,
        max: 250,
        fallback: 100,
      }),
      activityPageSize: clampInt(row.activityPageSize, { min: 1, max: 250, fallback: 250 }),
      activeOnly: Boolean(row.activeOnly),
      fetchMapDetails: Boolean(row.fetchMapDetails),
      trackerChunkSize: clampInt(row.trackerChunkSize, {
        min: 25,
        max: 1000,
        fallback: 350,
      }),
      updatedAt: row.updatedAt || null,
    };
  }

  upsertLiveMonitorConfig(options = {}) {
    const existing = this.getLiveMonitorConfig();
    const now = new Date().toISOString();
    const enabled = options.enabled === undefined ? Boolean(existing?.enabled ?? false) : Boolean(options.enabled);
    const scheduleMode = normalizeScheduleMode(options.scheduleMode, existing?.scheduleMode || "daily");
    const dailyHourUtc = clampInt(options.dailyHourUtc !== undefined ? options.dailyHourUtc : existing?.dailyHourUtc, {
      min: 0,
      max: 23,
      fallback: 3,
    });
    const dailyMinuteUtc = clampInt(
      options.dailyMinuteUtc !== undefined ? options.dailyMinuteUtc : existing?.dailyMinuteUtc,
      { min: 0, max: 59, fallback: 0 }
    );
    const clubId = clampInt(options.clubId !== undefined ? options.clubId : existing?.clubId, {
      min: 1,
      max: 2147483647,
      fallback: 24231,
    });
    const intervalSeconds = clampInt(
      options.intervalSeconds !== undefined ? options.intervalSeconds : existing?.intervalSeconds,
      { min: 60, max: 86400, fallback: 21600 }
    );
    const discoveryEnabled =
      options.discoveryEnabled === undefined
        ? Boolean(existing?.discoveryEnabled ?? true)
        : Boolean(options.discoveryEnabled);
    const discoveryIntervalSeconds = clampInt(
      options.discoveryIntervalSeconds !== undefined
        ? options.discoveryIntervalSeconds
        : existing?.discoveryIntervalSeconds,
      { min: 300, max: 86400, fallback: 3600 }
    );
    const discoveryCampaignLimit = clampInt(
      options.discoveryCampaignLimit !== undefined ? options.discoveryCampaignLimit : existing?.discoveryCampaignLimit,
      { min: 1, max: 250, fallback: 25 }
    );
    const discoveryActivityPageSize = clampInt(
      options.discoveryActivityPageSize !== undefined
        ? options.discoveryActivityPageSize
        : existing?.discoveryActivityPageSize,
      { min: 1, max: 250, fallback: 100 }
    );
    const activityPageSize = clampInt(
      options.activityPageSize !== undefined ? options.activityPageSize : existing?.activityPageSize,
      { min: 1, max: 250, fallback: 250 }
    );
    const activeOnly =
      options.activeOnly === undefined ? Boolean(existing?.activeOnly ?? false) : Boolean(options.activeOnly);
    const fetchMapDetails =
      options.fetchMapDetails === undefined
        ? Boolean(existing?.fetchMapDetails ?? true)
        : Boolean(options.fetchMapDetails);
    const trackerChunkSize = clampInt(
      options.trackerChunkSize !== undefined ? options.trackerChunkSize : existing?.trackerChunkSize,
      { min: 25, max: 1000, fallback: 350 }
    );

    this.db
      .prepare(
        `
        INSERT INTO altered_live_monitor_config (
          config_id,
          enabled,
          schedule_mode,
          daily_hour_utc,
          daily_minute_utc,
          club_id,
          interval_seconds,
          discovery_enabled,
          discovery_interval_seconds,
          discovery_campaign_limit,
          discovery_activity_page_size,
          activity_page_size,
          active_only,
          fetch_map_details,
          tracker_chunk_size,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(config_id) DO UPDATE SET
          enabled = excluded.enabled,
          schedule_mode = excluded.schedule_mode,
          daily_hour_utc = excluded.daily_hour_utc,
          daily_minute_utc = excluded.daily_minute_utc,
          club_id = excluded.club_id,
          interval_seconds = excluded.interval_seconds,
          discovery_enabled = excluded.discovery_enabled,
          discovery_interval_seconds = excluded.discovery_interval_seconds,
          discovery_campaign_limit = excluded.discovery_campaign_limit,
          discovery_activity_page_size = excluded.discovery_activity_page_size,
          activity_page_size = excluded.activity_page_size,
          active_only = excluded.active_only,
          fetch_map_details = excluded.fetch_map_details,
          tracker_chunk_size = excluded.tracker_chunk_size,
          updated_at = excluded.updated_at
        `
      )
      .run(
        1,
        enabled ? 1 : 0,
        scheduleMode,
        dailyHourUtc,
        dailyMinuteUtc,
        clubId,
        intervalSeconds,
        discoveryEnabled ? 1 : 0,
        discoveryIntervalSeconds,
        discoveryCampaignLimit,
        discoveryActivityPageSize,
        activityPageSize,
        activeOnly ? 1 : 0,
        fetchMapDetails ? 1 : 0,
        trackerChunkSize,
        now
      );

    return this.getLiveMonitorConfig();
  }
}

export { AlteredConfigurationRepository, DEFAULT_HOOK_KEY };
