import { clampInt, parseOptionalBoolean, normalizeScheduleMode, toText } from "../serviceSupport.js";

class MonitorStateService {
  constructor({
    repository,
    liveClient,
    mapperNameClient,
    trackerClubClient,
    trackerDisplaynameClient,
    logger,
    liveMonitor,
    getPlayerIdentityService,
    getProjectSourceService,
    getTrackerSyncService,
    createLiveMonitorConfigSnapshot,
    runLiveMonitorCycleDetached,
    runLiveDiscoveryCycleDetached,
  }) {
    this.repository = repository;
    this.liveClient = liveClient;
    this.mapperNameClient = mapperNameClient;
    this.trackerClubClient = trackerClubClient;
    this.trackerDisplaynameClient = trackerDisplaynameClient;
    this.logger = logger;
    this.liveMonitor = liveMonitor;
    this.getPlayerIdentityService = getPlayerIdentityService;
    this.getProjectSourceService = getProjectSourceService;
    this.getTrackerSyncService = getTrackerSyncService;
    this.createLiveMonitorConfigSnapshot = createLiveMonitorConfigSnapshot;
    this.runLiveMonitorCycleDetached = runLiveMonitorCycleDetached;
    this.runLiveDiscoveryCycleDetached = runLiveDiscoveryCycleDetached;
  }

  get trackerIntegrations() {
    return this.getPlayerIdentityService().trackerIntegrations;
  }

  getLiveMonitorConfigSnapshot() {
    return this.createLiveMonitorConfigSnapshot();
  }

  persistLiveMonitorConfig() {
    if (typeof this.repository?.configuration?.upsertLiveMonitorConfig !== "function") return;
    try {
      this.repository.configuration.upsertLiveMonitorConfig(this.getLiveMonitorConfigSnapshot());
    } catch (error) {
      this.logger.warn(`[altered-live] failed to persist monitor config: ${error?.message || error}`);
    }
  }

  updateLiveProgress(partial = {}) {
    const now = new Date().toISOString();
    const previous = this.liveMonitor.progress || {};
    const replaceCounters = Boolean(partial.replaceCounters);
    const phaseChanged = partial.phase !== undefined && partial.phase !== null && partial.phase !== previous.phase;
    const hasCurrentMapFields =
      Object.prototype.hasOwnProperty.call(partial, "currentMapUid") ||
      Object.prototype.hasOwnProperty.call(partial, "currentMapName") ||
      Object.prototype.hasOwnProperty.call(partial, "currentMaps");
    const nextCounters = replaceCounters
      ? { ...(partial.counters || {}) }
      : {
          ...(previous.counters || {}),
          ...(partial.counters || {}),
        };
    const next = {
      ...previous,
      ...partial,
      counters: nextCounters,
      updatedAt: now,
    };
    delete next.replaceCounters;
    if (next.percent !== undefined && next.percent !== null) {
      next.percent = clampInt(next.percent, { min: 0, max: 100, fallback: 0 });
    }
    if (phaseChanged && !hasCurrentMapFields) {
      next.currentMapUid = null;
      next.currentMapName = "";
      next.currentMaps = [];
    }
    if (Object.prototype.hasOwnProperty.call(partial, "currentMapUid")) {
      next.currentMapUid = toText(partial.currentMapUid) || null;
    } else if (next.currentMapUid !== undefined && next.currentMapUid !== null) {
      next.currentMapUid = toText(next.currentMapUid) || null;
    }
    if (Object.prototype.hasOwnProperty.call(partial, "currentMapName")) {
      next.currentMapName = toText(partial.currentMapName) || "";
    } else if (next.currentMapName !== undefined && next.currentMapName !== null) {
      next.currentMapName = toText(next.currentMapName) || "";
    }
    if (Object.prototype.hasOwnProperty.call(partial, "currentMaps")) {
      next.currentMaps = Array.isArray(partial.currentMaps)
        ? partial.currentMaps
            .map((entry) => {
              const mapUid = toText(entry?.mapUid);
              const mapName = toText(entry?.mapName || mapUid);
              if (!mapUid && !mapName) return null;
              return {
                mapUid: mapUid || null,
                mapName: mapName || mapUid || "Unknown map",
              };
            })
            .filter(Boolean)
        : [];
    } else if (!Array.isArray(next.currentMaps)) {
      next.currentMaps = [];
    }
    this.liveMonitor.progress = next;
    return next;
  }

  computeNextScheduledRunIso({ fromTimeMs = Date.now() } = {}) {
    if (this.liveMonitor.scheduleMode === "daily") {
      const fromDate = new Date(fromTimeMs);
      const candidateMs = Date.UTC(
        fromDate.getUTCFullYear(),
        fromDate.getUTCMonth(),
        fromDate.getUTCDate(),
        this.liveMonitor.dailyHourUtc,
        this.liveMonitor.dailyMinuteUtc,
        0,
        0
      );
      const nextMs = candidateMs > fromTimeMs ? candidateMs : candidateMs + 24 * 60 * 60 * 1000;
      return new Date(nextMs).toISOString();
    }
    return new Date(fromTimeMs + this.liveMonitor.intervalSeconds * 1000).toISOString();
  }

  computeNextDiscoveryRunIso({ fromTimeMs = Date.now() } = {}) {
    return new Date(fromTimeMs + this.liveMonitor.discoveryIntervalSeconds * 1000).toISOString();
  }

  scheduleNextLiveMonitorRun({ fromTimeMs = Date.now() } = {}) {
    if (this.liveMonitor.timer) {
      clearTimeout(this.liveMonitor.timer);
      this.liveMonitor.timer = null;
    }
    if (!this.liveMonitor.enabled) {
      this.liveMonitor.nextRunAt = null;
      return false;
    }

    const nextRunAt = this.computeNextScheduledRunIso({ fromTimeMs });
    const delayMs = Math.max(1000, Date.parse(nextRunAt) - Date.now());
    this.liveMonitor.nextRunAt = nextRunAt;
    this.liveMonitor.timer = setTimeout(() => {
      this.liveMonitor.timer = null;
      this.runLiveMonitorCycleDetached({
        reason: this.liveMonitor.scheduleMode === "daily" ? "daily-full-schedule" : "interval-full-schedule",
      })
        .catch((error) => {
          const message = error?.message || "Live monitor scheduled cycle failed.";
          this.liveMonitor.lastError = message;
          this.logger.warn(`[altered-live] scheduled cycle failed: ${message}`);
        })
        .finally(() => {
          this.scheduleNextLiveMonitorRun({ fromTimeMs: Date.now() });
        });
    }, delayMs);
    this.liveMonitor.timer.unref?.();
    return true;
  }

  scheduleNextDiscoveryRun({ fromTimeMs = Date.now() } = {}) {
    if (this.liveMonitor.discoveryTimer) {
      clearTimeout(this.liveMonitor.discoveryTimer);
      this.liveMonitor.discoveryTimer = null;
    }
    if (!this.liveMonitor.enabled || !this.liveMonitor.discoveryEnabled) {
      this.liveMonitor.nextDiscoveryRunAt = null;
      return false;
    }

    const nextRunAt = this.computeNextDiscoveryRunIso({ fromTimeMs });
    const delayMs = Math.max(1000, Date.parse(nextRunAt) - Date.now());
    this.liveMonitor.nextDiscoveryRunAt = nextRunAt;
    this.liveMonitor.discoveryTimer = setTimeout(() => {
      this.liveMonitor.discoveryTimer = null;
      this.runLiveDiscoveryCycleDetached({
        reason: "hourly-discovery-schedule",
      })
        .catch((error) => {
          const message = error?.message || "Live discovery scheduled cycle failed.";
          this.liveMonitor.lastDiscoveryError = message;
          this.logger.warn(`[altered-live] scheduled discovery cycle failed: ${message}`);
        })
        .finally(() => {
          this.scheduleNextDiscoveryRun({ fromTimeMs: Date.now() });
        });
    }, delayMs);
    this.liveMonitor.discoveryTimer.unref?.();
    return true;
  }

  getLiveMonitorStatus() {
    const configured = Boolean(this.liveClient?.isConfigured?.());
    const projectClubs = this.getProjectSourceService().getProjectClubs({ includeDisabled: true });
    const mapperNameTracking = this.mapperNameClient?.getStatus?.() || {
      enabled: false,
      configured: false,
    };
    return {
      configured,
      authRequired: "nadeo-account",
      authAdvice: configured
        ? null
        : "Configure ALTERED_LIVE_DEDI_LOGIN and ALTERED_LIVE_DEDI_PASSWORD (or ALTERED_LIVE_ACCESS_TOKEN / ALTERED_LIVE_REFRESH_TOKEN).",
      integrations: {
        trackerDisplayname: {
          enabled: this.trackerIntegrations.displaynameEnabled,
          configured: Boolean(this.trackerDisplaynameClient?.isConfigured?.()),
          relayAvailable: this.trackerIntegrations.displaynameRelayAvailable,
          fallbackLocal: this.trackerIntegrations.displaynameFallbackLocal,
          lastRelay: this.trackerIntegrations.lastDisplaynameRelay,
          lastRelayError: this.trackerIntegrations.lastDisplaynameRelayError,
        },
        trackerClub: {
          enabled: this.trackerIntegrations.clubEnabled,
          configured: Boolean(this.trackerClubClient?.isConfigured?.()),
          relayAvailable: this.trackerIntegrations.clubRelayAvailable,
          fallbackLocal: this.trackerIntegrations.clubFallbackLocal,
          lastRelay: this.trackerIntegrations.lastClubRelay,
          lastRelayError: this.trackerIntegrations.lastClubRelayError,
        },
        trackerMapSync: {
          targets: this.getTrackerSyncService()
            .getTrackerMapSyncTargets()
            .map((target) => ({
              key: target.key,
              label: target.label,
              primary: Boolean(target.primary),
              adminBaseUrl: target.adminBaseUrl || null,
            })),
        },
      },
      monitor: {
        enabled: this.liveMonitor.enabled,
        running: this.liveMonitor.running,
        scheduleMode: this.liveMonitor.scheduleMode,
        dailyHourUtc: this.liveMonitor.dailyHourUtc,
        dailyMinuteUtc: this.liveMonitor.dailyMinuteUtc,
        nextRunAt: this.liveMonitor.nextRunAt,
        discoveryEnabled: this.liveMonitor.discoveryEnabled,
        discoveryIntervalSeconds: this.liveMonitor.discoveryIntervalSeconds,
        discoveryCampaignLimit: this.liveMonitor.discoveryCampaignLimit,
        discoveryActivityPageSize: this.liveMonitor.discoveryActivityPageSize,
        nextDiscoveryRunAt: this.liveMonitor.nextDiscoveryRunAt,
        discoveryRunning: this.liveMonitor.discoveryRunning,
        clubId: this.liveMonitor.clubId,
        intervalSeconds: this.liveMonitor.intervalSeconds,
        activityPageSize: this.liveMonitor.activityPageSize,
        activeOnly: this.liveMonitor.activeOnly,
        fetchMapDetails: this.liveMonitor.fetchMapDetails,
        trackerChunkSize: this.liveMonitor.trackerChunkSize,
        progress: this.liveMonitor.progress,
        lastStartedAt: this.liveMonitor.lastStartedAt,
        lastFinishedAt: this.liveMonitor.lastFinishedAt,
        lastDurationMs: this.liveMonitor.lastDurationMs,
        lastError: this.liveMonitor.lastError,
        lastSummary: this.liveMonitor.lastSummary,
        lastDiscoveryStartedAt: this.liveMonitor.lastDiscoveryStartedAt,
        lastDiscoveryFinishedAt: this.liveMonitor.lastDiscoveryFinishedAt,
        lastDiscoveryDurationMs: this.liveMonitor.lastDiscoveryDurationMs,
        lastDiscoveryError: this.liveMonitor.lastDiscoveryError,
        lastDiscoverySummary: this.liveMonitor.lastDiscoverySummary,
      },
      auth: this.liveClient?.getStatus?.() || null,
      mapperNameTracking,
      mapperNameSync: this.getPlayerIdentityService().getMapperNameSyncStatus(),
      projectClubs,
    };
  }

  updateLiveMonitorConfig(options = {}) {
    const enabled = parseOptionalBoolean(options.enabled);
    const discoveryEnabled = parseOptionalBoolean(options.discoveryEnabled);
    const activeOnly = parseOptionalBoolean(options.activeOnly);
    const fetchMapDetails = parseOptionalBoolean(options.fetchMapDetails);
    const scheduleMode = normalizeScheduleMode(options.scheduleMode, "");

    if (enabled !== undefined) this.liveMonitor.enabled = enabled;
    if (discoveryEnabled !== undefined) this.liveMonitor.discoveryEnabled = discoveryEnabled;
    if (activeOnly !== undefined) this.liveMonitor.activeOnly = activeOnly;
    if (fetchMapDetails !== undefined) this.liveMonitor.fetchMapDetails = fetchMapDetails;
    if (scheduleMode) this.liveMonitor.scheduleMode = scheduleMode;

    if (options.clubId !== undefined) {
      this.liveMonitor.clubId = clampInt(options.clubId, {
        min: 1,
        max: 2147483647,
        fallback: this.liveMonitor.clubId,
      });
    }
    if (options.intervalSeconds !== undefined) {
      this.liveMonitor.intervalSeconds = clampInt(options.intervalSeconds, {
        min: 60,
        max: 86400,
        fallback: this.liveMonitor.intervalSeconds,
      });
    }
    if (options.activityPageSize !== undefined) {
      this.liveMonitor.activityPageSize = clampInt(options.activityPageSize, {
        min: 1,
        max: 250,
        fallback: this.liveMonitor.activityPageSize,
      });
    }
    if (options.discoveryIntervalSeconds !== undefined) {
      this.liveMonitor.discoveryIntervalSeconds = clampInt(options.discoveryIntervalSeconds, {
        min: 300,
        max: 86400,
        fallback: this.liveMonitor.discoveryIntervalSeconds,
      });
    }
    if (options.discoveryCampaignLimit !== undefined) {
      this.liveMonitor.discoveryCampaignLimit = clampInt(options.discoveryCampaignLimit, {
        min: 1,
        max: 250,
        fallback: this.liveMonitor.discoveryCampaignLimit,
      });
    }
    if (options.discoveryActivityPageSize !== undefined) {
      this.liveMonitor.discoveryActivityPageSize = clampInt(options.discoveryActivityPageSize, {
        min: 1,
        max: 250,
        fallback: this.liveMonitor.discoveryActivityPageSize,
      });
    }
    if (options.dailyHourUtc !== undefined) {
      this.liveMonitor.dailyHourUtc = clampInt(options.dailyHourUtc, {
        min: 0,
        max: 23,
        fallback: this.liveMonitor.dailyHourUtc,
      });
    }
    if (options.dailyMinuteUtc !== undefined) {
      this.liveMonitor.dailyMinuteUtc = clampInt(options.dailyMinuteUtc, {
        min: 0,
        max: 59,
        fallback: this.liveMonitor.dailyMinuteUtc,
      });
    }
    if (options.trackerChunkSize !== undefined) {
      this.liveMonitor.trackerChunkSize = clampInt(options.trackerChunkSize, {
        min: 25,
        max: 1000,
        fallback: this.liveMonitor.trackerChunkSize,
      });
    }

    if (this.liveMonitor.enabled) this.startLiveMonitor();
    else this.stopLiveMonitor();
    this.persistLiveMonitorConfig();
    return this.getLiveMonitorStatus();
  }

  startLiveMonitor() {
    this.persistLiveMonitorConfig();
    this.scheduleNextLiveMonitorRun({ fromTimeMs: Date.now() });
    this.scheduleNextDiscoveryRun({ fromTimeMs: Date.now() });
    return true;
  }

  stopLiveMonitor() {
    if (this.liveMonitor.timer) {
      clearTimeout(this.liveMonitor.timer);
      this.liveMonitor.timer = null;
    }
    if (this.liveMonitor.discoveryTimer) {
      clearTimeout(this.liveMonitor.discoveryTimer);
      this.liveMonitor.discoveryTimer = null;
    }
    this.liveMonitor.nextRunAt = null;
    this.liveMonitor.nextDiscoveryRunAt = null;
    this.liveMonitor.running = false;
    this.liveMonitor.discoveryRunning = false;
    this.persistLiveMonitorConfig();
    return true;
  }
}

export { MonitorStateService };
