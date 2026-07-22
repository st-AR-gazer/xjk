class TrackerService {
  constructor(repository, { trackerEngine = null } = {}) {
    this.repository = repository;
    this.trackerEngine = trackerEngine;
    this.medalLeaderboardCache = {
      key: "",
      expiresAt: 0,
      payload: null,
    };
  }

  getMeta() {
    const summary = this.repository.getSummary();
    const runtime = this.trackerEngine ? this.trackerEngine.getStatus() : null;
    const mode = String(runtime?.mode || "wr");
    return {
      service: mode === "leaderboard" ? "altered-tracker-leaderboard" : "altered-tracker-wr",
      generatedAt: new Date().toISOString(),
      summary,
      tracker: runtime
        ? {
            provider: runtime.provider,
            providerReady: runtime.providerReady,
            mode,
            tickSeconds: runtime.tickSeconds,
            enabled: runtime.enabled,
            timerActive: runtime.timerActive,
          }
        : null,
    };
  }

  getDashboard() {
    const maps = this.repository.getMaps({
      campaign: "all",
      trackedOnly: false,
      sort: "wr_recent",
      limit: 1200,
    });
    const wrFeed = this.repository.getWrFeed(24);
    const campaigns = this.repository.getCampaignNames();
    const summary = this.repository.getSummary();
    const mapOptions = this.repository.getMapOptions();
    const tracker = this.getTrackerStatus();
    return { maps, wrFeed, campaigns, summary, mapOptions, tracker };
  }

  getMaps(query) {
    return this.repository.getMaps(query);
  }

  getTrackedMaps(query) {
    return this.repository.getTrackedMaps(query);
  }

  getTrackedMapsApi(query) {
    const nowMs = Date.now();
    const runtimeMaxInterval = Math.max(0, Number(this.trackerEngine?.getStatus?.().maxCheckIntervalSeconds || 0));
    return this.repository.getTrackedMaps(query).map((map) => {
      const frequencyRaw = Math.max(0, Number(map.checkFrequency || 0));
      const frequency =
        runtimeMaxInterval > 0 ? Math.min(frequencyRaw || runtimeMaxInterval, runtimeMaxInterval) : frequencyRaw;
      const lastMs = Date.parse(map.lastCheckedAt || "");
      if (!Number.isFinite(lastMs)) {
        return {
          ...map,
          dueNow: true,
          nextCheckAt: null,
          nextCheckInSeconds: 0,
        };
      }
      const nextMs = lastMs + frequency * 1000;
      const dueNow = nextMs <= nowMs;
      return {
        ...map,
        dueNow,
        nextCheckAt: new Date(nextMs).toISOString(),
        nextCheckInSeconds: dueNow ? 0 : Math.ceil((nextMs - nowMs) / 1000),
      };
    });
  }

  getWrFeed(limit) {
    return this.repository.getWrFeed(limit);
  }

  getLeaderboardFeed(limit) {
    return this.repository.getLeaderboardFeed(limit);
  }

  getLeaderboardWrLeaderboards({
    overallLimit = 300,
    overallOffset = 0,
    perBucketLimit = 10,
    trackedOnly = true,
    includeBuckets = true,
  } = {}) {
    return this.repository.getLeaderboardWrLeaderboards({
      overallLimit,
      overallOffset,
      perBucketLimit,
      trackedOnly,
      includeBuckets,
    });
  }

  getMapInfo(mapUid) {
    return this.repository.getMapInfo(mapUid);
  }

  getMedalLeaderboards({ limit = 50, trackedOnly = true } = {}) {
    const safeLimit = Math.max(1, Number(limit) || 50);
    const safeTrackedOnly = Boolean(trackedOnly);
    const cacheKey = `${safeLimit}:${safeTrackedOnly ? 1 : 0}`;
    const nowMs = Date.now();
    if (
      this.medalLeaderboardCache.payload &&
      this.medalLeaderboardCache.key === cacheKey &&
      nowMs < this.medalLeaderboardCache.expiresAt
    ) {
      return this.medalLeaderboardCache.payload;
    }

    const payload = this.repository.getMedalLeaderboards({
      limit,
      trackedOnly,
    });
    this.medalLeaderboardCache = {
      key: cacheKey,
      expiresAt: nowMs + 30000,
      payload,
    };
    return payload;
  }

  getTrackerStatus() {
    const runtime = this.trackerEngine ? this.trackerEngine.getStatus() : null;
    const trackedDueNow = this.repository.countDueTrackedMaps({
      nowIso: new Date().toISOString(),
      maxCheckIntervalSeconds: Number(runtime?.maxCheckIntervalSeconds || 0),
    });
    return {
      runtime,
      latestRun: this.repository.getLatestTrackerRun(),
      summary: this.repository.getSummary(),
      trackedDueNow,
    };
  }

  getTrackerRuns(limit) {
    return this.repository.getTrackerRuns(limit);
  }

  getTopWrAccounts({ limit = 200, trackedOnly = true } = {}) {
    return this.repository.getTopWrAccounts({
      limit,
      trackedOnly,
    });
  }

  getLeaderboardCoverage({ trackedOnly = true } = {}) {
    return this.repository.getLeaderboardCoverage({
      trackedOnly,
    });
  }

  async runTrackerNow() {
    if (!this.trackerEngine) {
      return { error: "Tracker runtime is not enabled." };
    }
    const result = await this.trackerEngine.runNow({ reason: "manual-api" });
    return { run: result };
  }

  setTrackerConfig(config = {}) {
    if (!this.trackerEngine) {
      return { error: "Tracker runtime is not enabled." };
    }
    const runtime = this.trackerEngine.setConfig({
      enabled: config.enabled,
      tickSeconds: config.tickSeconds,
      batchSize: config.batchSize,
      maxCheckIntervalSeconds: config.maxCheckIntervalSeconds,
      leaderboardTopN: config.leaderboardTopN,
    });
    return { runtime };
  }

  updateMapTracking({ mapUid, tracked, status, checkFrequency }) {
    const hasTracked = typeof tracked === "boolean";
    const hasStatus = typeof status === "string";
    const hasFrequency = Number.isFinite(checkFrequency);
    if (!hasTracked && !hasStatus && !hasFrequency) {
      return { error: "Nothing to update. Provide tracked/status/checkFrequency." };
    }

    const updated = this.repository.updateMapTracking({
      mapUid,
      tracked: hasTracked ? tracked : undefined,
      status: hasStatus ? String(status).toLowerCase() : undefined,
      checkFrequency: hasFrequency ? Number(checkFrequency) : undefined,
    });
    if (!updated) return { error: "Map not found." };
    return { updated };
  }

  bulkUpsertMaps({ maps }) {
    const mapList = Array.isArray(maps) ? maps : [];
    if (!mapList.length) {
      return { error: "maps[] is required." };
    }
    const result = this.repository.bulkUpsertMaps({ maps: mapList });
    return {
      synced: result,
      upserted: Number(result.total || 0),
      count: Number(result.total || 0),
    };
  }

  bulkUpsertPlayerNames({ players, source }) {
    const payload = Array.isArray(players) ? players : [];
    if (!payload.length) {
      return { error: "players[] is required." };
    }
    const result = this.repository.bulkUpsertPlayerNames({
      players: payload,
      source,
    });
    if (result?.error) return result;
    return {
      synced: result,
      playersSeen: Number(result.playersSeen || 0),
      namesUpdated: Number(result.namesUpdated || 0),
      historyInserted: Number(result.historyInserted || 0),
      mapsUpdated: Number(result.mapsUpdated || 0),
      leaderboardRowsUpdated: Number(result.leaderboardRowsUpdated || 0),
      wrHistoryRowsUpdated: Number(result.wrHistoryRowsUpdated || 0),
    };
  }

  getPlayerNamesByAccountIds({ accountIds, limit = 200 } = {}) {
    const result = this.repository.getPlayerNamesByAccountIds({
      accountIds,
      limit,
    });
    return {
      requested: Number(result.requested || 0),
      found: Number(result.found || 0),
      namesByAccountId:
        result.namesByAccountId && typeof result.namesByAccountId === "object" ? result.namesByAccountId : {},
      profiles: Array.isArray(result.profiles) ? result.profiles : [],
      generatedAt: new Date().toISOString(),
    };
  }
}

export { TrackerService };
