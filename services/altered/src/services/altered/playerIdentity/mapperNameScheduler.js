import { normalizeAccountId, DEFAULT_MAPPER_REQUEST_GAP_MS, clampInt, asArray, uniqueBy } from "../serviceSupport.js";

function getMapperNameSyncStatus() {
  const stats =
    typeof this.repository?.mappers?.getMapperAccountStats === "function"
      ? this.repository.mappers.getMapperAccountStats()
      : {
          totalAccounts: 0,
          unresolvedAccounts: 0,
          neverResolvedAccounts: 0,
          latestResolvedAt: null,
          oldestResolvedAt: null,
        };
  return {
    enabled: this.mapperNameSync.enabled,
    relayMode: this.shouldUseDisplaynameRelay() ? "tracker-displayname-primary" : "local-primary",
    relayEnabled: this.trackerIntegrations.displaynameEnabled,
    relayConfigured: Boolean(this.trackerDisplaynameClient?.isConfigured?.()),
    relayAvailable: this.trackerIntegrations.displaynameRelayAvailable,
    relayFallbackLocal: this.trackerIntegrations.displaynameFallbackLocal,
    relayLast: this.trackerIntegrations.lastDisplaynameRelay,
    relayLastError: this.trackerIntegrations.lastDisplaynameRelayError,
    mode: this.mapperNameSync.mode,
    running: this.mapperNameSync.running,
    nextRunAt: this.mapperNameSync.nextRunAt,
    nextPriorityRunAt: this.mapperNameSync.nextPriorityRunAt,
    bootstrapIntervalSeconds: this.mapperNameSync.bootstrapIntervalSeconds,
    maintenanceIntervalSeconds: this.mapperNameSync.maintenanceIntervalSeconds,
    priorityIntervalSeconds: this.mapperNameSync.priorityIntervalSeconds,
    batchSize: this.mapperNameSync.batchSize,
    priorityBatchSize: this.mapperNameSync.priorityBatchSize,
    priorityTopLimit: this.mapperNameSync.priorityTopLimit,
    cacheTtlSeconds: this.mapperNameSync.cacheTtlSeconds,
    priorityCacheTtlSeconds: this.mapperNameSync.priorityCacheTtlSeconds,
    knownAccountsRefreshSeconds: this.mapperNameSync.knownAccountsRefreshSeconds,
    minRequestGapMs: this.mapperNameSync.minRequestGapMs,
    knownAccountsRefreshedAt:
      this.mapperNameSync.knownAccountsRefreshedAtMs > 0
        ? new Date(this.mapperNameSync.knownAccountsRefreshedAtMs).toISOString()
        : null,
    priorityAccountsRefreshedAt:
      this.mapperNameSync.priorityAccountsRefreshedAtMs > 0
        ? new Date(this.mapperNameSync.priorityAccountsRefreshedAtMs).toISOString()
        : null,
    priorityAccountsTracked: Number(this.mapperNameSync.priorityAccountIds.length || 0),
    viewedPriorityAccountsTracked: Number(this.mapperNameSync.viewedPriorityAccountIds.length || 0),
    lastStartedAt: this.mapperNameSync.lastStartedAt,
    lastFinishedAt: this.mapperNameSync.lastFinishedAt,
    lastError: this.mapperNameSync.lastError,
    lastSummary: this.mapperNameSync.lastSummary,
    stats,
  };
}

async function updateMapperNameSyncConfig(options = {}) {
  if (options.enabled !== undefined) {
    this.mapperNameSync.enabled = Boolean(options.enabled);
  }
  if (options.bootstrapIntervalSeconds !== undefined) {
    this.mapperNameSync.bootstrapIntervalSeconds = clampInt(options.bootstrapIntervalSeconds, {
      min: 60,
      max: 86400,
      fallback: this.mapperNameSync.bootstrapIntervalSeconds,
    });
  }
  if (options.maintenanceIntervalSeconds !== undefined) {
    this.mapperNameSync.maintenanceIntervalSeconds = clampInt(options.maintenanceIntervalSeconds, {
      min: 60,
      max: 86400,
      fallback: this.mapperNameSync.maintenanceIntervalSeconds,
    });
  }
  if (options.priorityIntervalSeconds !== undefined) {
    this.mapperNameSync.priorityIntervalSeconds = clampInt(options.priorityIntervalSeconds, {
      min: 60,
      max: 86400,
      fallback: this.mapperNameSync.priorityIntervalSeconds,
    });
  }
  if (options.batchSize !== undefined) {
    this.mapperNameSync.batchSize = clampInt(options.batchSize, {
      min: 1,
      max: 50,
      fallback: this.mapperNameSync.batchSize,
    });
  }
  if (options.priorityBatchSize !== undefined) {
    this.mapperNameSync.priorityBatchSize = clampInt(options.priorityBatchSize, {
      min: 1,
      max: 50,
      fallback: this.mapperNameSync.priorityBatchSize,
    });
  }
  if (options.priorityTopLimit !== undefined) {
    this.mapperNameSync.priorityTopLimit = clampInt(options.priorityTopLimit, {
      min: 1,
      max: 2000,
      fallback: this.mapperNameSync.priorityTopLimit,
    });
  }
  if (options.priorityRefreshSeconds !== undefined) {
    this.mapperNameSync.priorityRefreshSeconds = clampInt(options.priorityRefreshSeconds, {
      min: 30,
      max: 86400,
      fallback: this.mapperNameSync.priorityRefreshSeconds,
    });
  }
  if (options.knownAccountsRefreshSeconds !== undefined) {
    this.mapperNameSync.knownAccountsRefreshSeconds = clampInt(options.knownAccountsRefreshSeconds, {
      min: 60,
      max: 86400,
      fallback: this.mapperNameSync.knownAccountsRefreshSeconds,
    });
  }
  if (options.cacheTtlSeconds !== undefined) {
    this.mapperNameSync.cacheTtlSeconds = clampInt(options.cacheTtlSeconds, {
      min: 0,
      max: 30 * 24 * 60 * 60,
      fallback: this.mapperNameSync.cacheTtlSeconds,
    });
  }
  if (options.priorityCacheTtlSeconds !== undefined) {
    this.mapperNameSync.priorityCacheTtlSeconds = clampInt(options.priorityCacheTtlSeconds, {
      min: 0,
      max: 30 * 24 * 60 * 60,
      fallback: this.mapperNameSync.priorityCacheTtlSeconds,
    });
  }
  if (options.minRequestGapMs !== undefined) {
    this.mapperNameSync.minRequestGapMs = clampInt(options.minRequestGapMs, {
      min: DEFAULT_MAPPER_REQUEST_GAP_MS,
      max: 120000,
      fallback: this.mapperNameSync.minRequestGapMs,
    });
  }
  if (options.resetKnownAccountsCache) {
    this.mapperNameSync.knownAccountsRefreshedAtMs = 0;
  }
  if (options.resetPriorityAccountsCache) {
    this.mapperNameSync.priorityAccountsRefreshedAtMs = 0;
    this.mapperNameSync.priorityAccountIds = [];
  }

  const useRelay = this.shouldUseDisplaynameRelay();
  if (useRelay) {
    await this.stopMapperNameSyncScheduler();
    const relayConfig = await this.trackerDisplaynameClient.updateConfig({
      enabled: this.mapperNameSync.enabled,
      schedulerEnabled: this.mapperNameSync.enabled,
      maintenanceIntervalSeconds: this.mapperNameSync.maintenanceIntervalSeconds,
      staleAfterSeconds: this.mapperNameSync.cacheTtlSeconds,
      batchSize: this.mapperNameSync.batchSize,
      maxAccountsPerCycle: Math.max(
        this.mapperNameSync.batchSize,
        this.mapperNameSync.priorityBatchSize,
        this.mapperNameSync.priorityTopLimit
      ),
    });
    if (!relayConfig?.ok) {
      this.trackerIntegrations.lastDisplaynameRelayError =
        relayConfig?.error || "Failed to update tracker-displayname config.";
      if (/not configured|disabled/i.test(this.trackerIntegrations.lastDisplaynameRelayError)) {
        this.trackerIntegrations.displaynameRelayAvailable = false;
      }
      if (this.trackerIntegrations.displaynameFallbackLocal && this.mapperNameSync.enabled) {
        this.scheduleNextMapperSyncRun({ priority: false, fromTimeMs: Date.now() });
        this.scheduleNextMapperSyncRun({ priority: true, fromTimeMs: Date.now() });
      }
    } else {
      this.trackerIntegrations.displaynameRelayAvailable = true;
      this.trackerIntegrations.lastDisplaynameRelayError = null;
    }
  } else if (!this.mapperNameSync.enabled) {
    await this.stopMapperNameSyncScheduler();
  } else {
    this.scheduleNextMapperSyncRun({ priority: false, fromTimeMs: Date.now() });
    this.scheduleNextMapperSyncRun({ priority: true, fromTimeMs: Date.now() });
  }
  return this.getMapperNameSyncStatus();
}

function computeNextMapperSyncRunIso({ priority = false, fromTimeMs = Date.now() } = {}) {
  const delaySeconds = priority
    ? this.mapperNameSync.priorityIntervalSeconds
    : this.mapperNameSync.mode === "bootstrap"
      ? this.mapperNameSync.bootstrapIntervalSeconds
      : this.mapperNameSync.maintenanceIntervalSeconds;
  return new Date(fromTimeMs + Math.max(1, delaySeconds) * 1000).toISOString();
}

function scheduleNextMapperSyncRun({ priority = false, fromTimeMs = Date.now() } = {}) {
  if (priority) {
    if (this.mapperNameSync.priorityTimer) {
      clearTimeout(this.mapperNameSync.priorityTimer);
      this.mapperNameSync.priorityTimer = null;
    }
  } else if (this.mapperNameSync.timer) {
    clearTimeout(this.mapperNameSync.timer);
    this.mapperNameSync.timer = null;
  }

  if (!this.mapperNameSync.enabled) {
    if (priority) this.mapperNameSync.nextPriorityRunAt = null;
    else this.mapperNameSync.nextRunAt = null;
    return false;
  }

  const nextRunAt = this.computeNextMapperSyncRunIso({ priority, fromTimeMs });
  const delayMs = Math.max(1000, Date.parse(nextRunAt) - Date.now());

  if (priority) {
    this.mapperNameSync.nextPriorityRunAt = nextRunAt;
    this.mapperNameSync.priorityTimer = setTimeout(() => {
      this.mapperNameSync.priorityTimer = null;
      this.runMapperNameSyncCycle({
        priority: true,
        reason: "priority-schedule",
      }).catch((error) => {
        this.logger.warn(`[altered-mapper-sync] priority cycle failed: ${error?.message || error}`);
      });
    }, delayMs);
    this.mapperNameSync.priorityTimer.unref?.();
    return true;
  }

  this.mapperNameSync.nextRunAt = nextRunAt;
  this.mapperNameSync.timer = setTimeout(() => {
    this.mapperNameSync.timer = null;
    this.runMapperNameSyncCycle({
      priority: false,
      reason: "schedule",
    }).catch((error) => {
      this.logger.warn(`[altered-mapper-sync] cycle failed: ${error?.message || error}`);
    });
  }, delayMs);
  this.mapperNameSync.timer.unref?.();
  return true;
}

async function refreshMapperAccountPool({ force = false } = {}) {
  if (
    typeof this.repository?.mappers?.listKnownMapperAccountIds !== "function" ||
    typeof this.repository?.mappers?.seedMapperAccounts !== "function"
  ) {
    return {
      ok: false,
      error: "Mapper account repository methods are unavailable.",
    };
  }
  const nowMs = Date.now();
  const ageMs = nowMs - Number(this.mapperNameSync.knownAccountsRefreshedAtMs || 0);
  if (
    !force &&
    Number(this.mapperNameSync.knownAccountsRefreshedAtMs || 0) > 0 &&
    ageMs < this.mapperNameSync.knownAccountsRefreshSeconds * 1000
  ) {
    return {
      ok: true,
      refreshed: false,
    };
  }

  const accountIds = this.repository.mappers.listKnownMapperAccountIds({
    limit: 200000,
  });
  const seed = this.repository.mappers.seedMapperAccounts({
    accountIds,
    source: "altered-monitor",
  });
  if (seed?.error) {
    return {
      ok: false,
      error: seed.error,
    };
  }

  this.mapperNameSync.knownAccountsRefreshedAtMs = nowMs;
  return {
    ok: true,
    refreshed: true,
    accountIdsSeen: Number(accountIds.length || 0),
    inserted: Number(seed.inserted || 0),
    updated: Number(seed.updated || 0),
  };
}

async function refreshPriorityMapperAccounts({ force = false } = {}) {
  this.pruneViewedPriorityAccountIds();
  const nowMs = Date.now();
  const ageMs = nowMs - Number(this.mapperNameSync.priorityAccountsRefreshedAtMs || 0);
  if (
    !force &&
    Number(this.mapperNameSync.priorityAccountsRefreshedAtMs || 0) > 0 &&
    ageMs < this.mapperNameSync.priorityRefreshSeconds * 1000
  ) {
    return {
      ok: true,
      refreshed: false,
      count: this.mapperNameSync.priorityAccountIds.length + this.mapperNameSync.viewedPriorityAccountIds.length,
    };
  }

  if (!this.trackerClient?.getTopWrAccounts) {
    this.mapperNameSync.priorityAccountIds = [...asArray(this.mapperNameSync.viewedPriorityAccountIds)];
    this.mapperNameSync.priorityAccountsRefreshedAtMs = nowMs;
    return {
      ok: true,
      refreshed: true,
      count: this.mapperNameSync.priorityAccountIds.length,
    };
  }

  const response = await this.trackerClient.getTopWrAccounts(this.mapperNameSync.priorityTopLimit);
  if (!response?.ok) {
    return {
      ok: false,
      error: response?.error || "Failed to fetch top WR accounts from tracker.",
    };
  }

  const accounts = asArray(response?.data?.accounts);
  this.mapperNameSync.priorityAccountIds = uniqueBy(
    [
      ...asArray(this.mapperNameSync.viewedPriorityAccountIds),
      ...accounts.map((entry) => normalizeAccountId(entry?.accountId ?? entry?.account_id)).filter(Boolean),
    ],
    (accountId) => accountId
  );
  this.mapperNameSync.priorityAccountsRefreshedAtMs = nowMs;
  return {
    ok: true,
    refreshed: true,
    count: this.mapperNameSync.priorityAccountIds.length,
  };
}

export {
  getMapperNameSyncStatus,
  updateMapperNameSyncConfig,
  computeNextMapperSyncRunIso,
  scheduleNextMapperSyncRun,
  refreshMapperAccountPool,
  refreshPriorityMapperAccounts,
};
