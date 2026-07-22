import {
  DEFAULT_TRACKER_SYNC_CHUNK_SIZE,
  DEFAULT_DAILY_HOUR_UTC,
  DEFAULT_DAILY_MINUTE_UTC,
  DEFAULT_DISCOVERY_INTERVAL_SECONDS,
  DEFAULT_DISCOVERY_CAMPAIGN_LIMIT,
  DEFAULT_DISCOVERY_ACTIVITY_PAGE_SIZE,
  clampInt,
  normalizeScheduleMode,
} from "../serviceSupport.js";

class LiveMonitoringContext {
  constructor({
    repository,
    liveClient = null,
    mapperNameClient = null,
    trackerClubClient = null,
    trackerDisplaynameClient = null,
    liveMonitorConfig = {},
    logger = console,
    getAlterationCatalogService,
    getMapProcessingService,
    getPlayerIdentityService,
    getProjectSourceService,
    getTrackerSyncService,
  }) {
    this.repository = repository;
    this.liveClient = liveClient;
    this.mapperNameClient = mapperNameClient;
    this.trackerClubClient = trackerClubClient;
    this.trackerDisplaynameClient = trackerDisplaynameClient;
    this.logger = logger;
    this.getAlterationCatalogService = getAlterationCatalogService;
    this.getMapProcessingService = getMapProcessingService;
    this.getPlayerIdentityService = getPlayerIdentityService;
    this.getProjectSourceService = getProjectSourceService;
    this.getTrackerSyncService = getTrackerSyncService;
    const storedMonitorConfig =
      typeof this.repository?.configuration?.getLiveMonitorConfig === "function"
        ? this.repository.configuration.getLiveMonitorConfig()
        : null;
    const mergedMonitorConfig = {
      ...liveMonitorConfig,
      ...(storedMonitorConfig || {}),
    };
    const hasLiveMonitorEnvOverride = (key) => {
      if (!key) return false;
      const raw = process.env[key];
      return raw !== undefined && raw !== null && String(raw).trim() !== "";
    };
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_MONITOR_ENABLED")) {
      mergedMonitorConfig.enabled = liveMonitorConfig.enabled;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_MONITOR_SCHEDULE_MODE")) {
      mergedMonitorConfig.scheduleMode = liveMonitorConfig.scheduleMode;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_MONITOR_DAILY_HOUR_UTC")) {
      mergedMonitorConfig.dailyHourUtc = liveMonitorConfig.dailyHourUtc;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_MONITOR_DAILY_MINUTE_UTC")) {
      mergedMonitorConfig.dailyMinuteUtc = liveMonitorConfig.dailyMinuteUtc;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_CLUB_ID")) {
      mergedMonitorConfig.clubId = liveMonitorConfig.clubId;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_MONITOR_INTERVAL_SECONDS")) {
      mergedMonitorConfig.intervalSeconds = liveMonitorConfig.intervalSeconds;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_DISCOVERY_ENABLED")) {
      mergedMonitorConfig.discoveryEnabled = liveMonitorConfig.discoveryEnabled;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_DISCOVERY_INTERVAL_SECONDS")) {
      mergedMonitorConfig.discoveryIntervalSeconds = liveMonitorConfig.discoveryIntervalSeconds;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_DISCOVERY_CAMPAIGN_LIMIT")) {
      mergedMonitorConfig.discoveryCampaignLimit = liveMonitorConfig.discoveryCampaignLimit;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_DISCOVERY_ACTIVITY_PAGE_SIZE")) {
      mergedMonitorConfig.discoveryActivityPageSize = liveMonitorConfig.discoveryActivityPageSize;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_ACTIVITY_PAGE_SIZE")) {
      mergedMonitorConfig.activityPageSize = liveMonitorConfig.activityPageSize;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_ACTIVITY_ACTIVE_ONLY")) {
      mergedMonitorConfig.activeOnly = liveMonitorConfig.activeOnly;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_FETCH_MAP_DETAILS")) {
      mergedMonitorConfig.fetchMapDetails = liveMonitorConfig.fetchMapDetails;
    }
    this.liveMonitor = {
      enabled: Boolean(mergedMonitorConfig.enabled),
      scheduleMode: normalizeScheduleMode(mergedMonitorConfig.scheduleMode, "daily"),
      dailyHourUtc: clampInt(mergedMonitorConfig.dailyHourUtc, {
        min: 0,
        max: 23,
        fallback: DEFAULT_DAILY_HOUR_UTC,
      }),
      dailyMinuteUtc: clampInt(mergedMonitorConfig.dailyMinuteUtc, {
        min: 0,
        max: 59,
        fallback: DEFAULT_DAILY_MINUTE_UTC,
      }),
      clubId: clampInt(mergedMonitorConfig.clubId, {
        min: 1,
        max: 2147483647,
        fallback: 24231,
      }),
      intervalSeconds: clampInt(mergedMonitorConfig.intervalSeconds, {
        min: 60,
        max: 86400,
        fallback: 21600,
      }),
      discoveryEnabled:
        mergedMonitorConfig.discoveryEnabled === undefined ? true : Boolean(mergedMonitorConfig.discoveryEnabled),
      discoveryIntervalSeconds: clampInt(mergedMonitorConfig.discoveryIntervalSeconds, {
        min: 300,
        max: 86400,
        fallback: DEFAULT_DISCOVERY_INTERVAL_SECONDS,
      }),
      discoveryCampaignLimit: clampInt(mergedMonitorConfig.discoveryCampaignLimit, {
        min: 1,
        max: 250,
        fallback: DEFAULT_DISCOVERY_CAMPAIGN_LIMIT,
      }),
      discoveryActivityPageSize: clampInt(mergedMonitorConfig.discoveryActivityPageSize, {
        min: 1,
        max: 250,
        fallback: DEFAULT_DISCOVERY_ACTIVITY_PAGE_SIZE,
      }),
      activityPageSize: clampInt(mergedMonitorConfig.activityPageSize, {
        min: 1,
        max: 250,
        fallback: 250,
      }),
      activeOnly: Boolean(mergedMonitorConfig.activeOnly),
      fetchMapDetails:
        mergedMonitorConfig.fetchMapDetails === undefined ? true : Boolean(mergedMonitorConfig.fetchMapDetails),
      trackerChunkSize: clampInt(mergedMonitorConfig.trackerChunkSize, {
        min: 25,
        max: 1000,
        fallback: DEFAULT_TRACKER_SYNC_CHUNK_SIZE,
      }),
      timer: null,
      nextRunAt: null,
      discoveryTimer: null,
      nextDiscoveryRunAt: null,
      running: false,
      discoveryRunning: false,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastDurationMs: null,
      lastError: null,
      lastSummary: null,
      lastDiscoveryStartedAt: null,
      lastDiscoveryFinishedAt: null,
      lastDiscoveryDurationMs: null,
      lastDiscoveryError: null,
      lastDiscoverySummary: null,
      progress: null,
      runCounter: 0,
    };
    if (!storedMonitorConfig && typeof this.repository?.configuration?.upsertLiveMonitorConfig === "function") {
      this.repository.configuration.upsertLiveMonitorConfig(this.getLiveMonitorConfigSnapshot());
    }
  }

  get alterationsSync() {
    return this.getAlterationCatalogService().alterationsSync;
  }

  get mapCopy() {
    return this.getMapProcessingService().mapCopy;
  }

  get trackerIntegrations() {
    return this.getPlayerIdentityService().trackerIntegrations;
  }

  getLiveMonitorConfigSnapshot() {
    return {
      enabled: this.liveMonitor.enabled,
      scheduleMode: this.liveMonitor.scheduleMode,
      dailyHourUtc: this.liveMonitor.dailyHourUtc,
      dailyMinuteUtc: this.liveMonitor.dailyMinuteUtc,
      clubId: this.liveMonitor.clubId,
      intervalSeconds: this.liveMonitor.intervalSeconds,
      discoveryEnabled: this.liveMonitor.discoveryEnabled,
      discoveryIntervalSeconds: this.liveMonitor.discoveryIntervalSeconds,
      discoveryCampaignLimit: this.liveMonitor.discoveryCampaignLimit,
      discoveryActivityPageSize: this.liveMonitor.discoveryActivityPageSize,
      activityPageSize: this.liveMonitor.activityPageSize,
      activeOnly: this.liveMonitor.activeOnly,
      fetchMapDetails: this.liveMonitor.fetchMapDetails,
      trackerChunkSize: this.liveMonitor.trackerChunkSize,
    };
  }
}

export { LiveMonitoringContext };
