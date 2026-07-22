import { normalizeAccountId, clampInt, asArray, uniqueBy, collectMapperAccountIds } from "../serviceSupport.js";

async function runMapperNameSyncCycle({
  priority = false,
  reason = "schedule",
  force = false,
  accountIds = [],
  allowWhenDisabled = false,
  limit = null,
} = {}) {
  const normalizedRequestedAccountIds = uniqueBy(
    asArray(accountIds)
      .map((accountId) => normalizeAccountId(accountId))
      .filter(Boolean),
    (accountId) => accountId
  );
  const targetedSync = normalizedRequestedAccountIds.length > 0;

  if (!this.mapperNameSync.enabled && !allowWhenDisabled) {
    return { skipped: true, reason: "disabled" };
  }
  if (this.mapperNameSync.running) {
    return { skipped: true, reason: "already-running" };
  }

  const startedAt = new Date().toISOString();
  this.mapperNameSync.running = true;
  this.mapperNameSync.lastStartedAt = startedAt;
  this.mapperNameSync.lastError = null;
  this.mapperNameSync.runCounter += 1;

  try {
    const poolRefresh = await this.refreshMapperAccountPool({
      force: reason === "startup" || force || targetedSync,
    });
    if (poolRefresh?.error) {
      this.mapperNameSync.lastError = poolRefresh.error;
      return {
        error: poolRefresh.error,
      };
    }

    if (targetedSync && typeof this.repository?.mappers?.seedMapperAccounts === "function") {
      const seeded = this.repository.mappers.seedMapperAccounts({
        accountIds: normalizedRequestedAccountIds,
        source: "manual-targeted",
      });
      if (seeded?.error) {
        this.mapperNameSync.lastError = seeded.error;
        return {
          error: seeded.error,
        };
      }
    }

    const statsBefore = this.repository.mappers.getMapperAccountStats();
    this.mapperNameSync.mode = Number(statsBefore.unresolvedAccounts || 0) > 0 ? "bootstrap" : "maintenance";

    const priorityRefresh = await this.refreshPriorityMapperAccounts({
      force: reason === "startup" || priority,
    });
    if (priorityRefresh?.error) {
      this.logger.warn(`[altered-mapper-sync] failed to refresh priority accounts: ${priorityRefresh.error}`);
    }

    const syncLimit = clampInt(
      limit !== null && limit !== undefined
        ? Number(limit)
        : targetedSync
          ? normalizedRequestedAccountIds.length
          : priority
            ? this.mapperNameSync.priorityBatchSize
            : this.mapperNameSync.batchSize,
      {
        min: 1,
        max: 5000,
        fallback: priority ? this.mapperNameSync.priorityBatchSize : this.mapperNameSync.batchSize,
      }
    );
    const minResolvedAgeSeconds = force
      ? 0
      : priority
        ? this.mapperNameSync.priorityCacheTtlSeconds
        : this.mapperNameSync.cacheTtlSeconds;
    const preferredAccountIds = targetedSync ? normalizedRequestedAccountIds : this.mapperNameSync.priorityAccountIds;
    let batchRows = this.repository.mappers.getMapperAccountsForSync({
      limit: syncLimit,
      accountIds: preferredAccountIds,
      minResolvedAgeSeconds,
    });
    if (!batchRows.length && !targetedSync && preferredAccountIds.length) {
      batchRows = this.repository.mappers.getMapperAccountsForSync({
        limit: syncLimit,
        accountIds: [],
        minResolvedAgeSeconds,
      });
    }
    const accountIds = batchRows.map((row) => row.accountId).filter(Boolean);
    if (!accountIds.length) {
      const statsAfter = this.repository.mappers.getMapperAccountStats();
      this.mapperNameSync.mode = Number(statsAfter.unresolvedAccounts || 0) > 0 ? "bootstrap" : "maintenance";
      const cacheSkipped = targetedSync ? Math.max(0, normalizedRequestedAccountIds.length - accountIds.length) : 0;
      this.mapperNameSync.lastSummary = {
        cycle: priority ? "priority" : "main",
        reason,
        skipped: true,
        force,
        targetedSync,
        requestedAccountIds: normalizedRequestedAccountIds.length,
        cacheTtlSeconds: minResolvedAgeSeconds,
        cacheSkipped,
        batchSize: 0,
        statsBefore,
        statsAfter,
        completedAt: new Date().toISOString(),
      };
      return this.mapperNameSync.lastSummary;
    }

    const source = priority ? "mapper-sync-priority" : "mapper-sync";
    const syncResult = await this.syncMapperNamesBatch({
      accountIds,
      source,
    });
    if (syncResult?.error) {
      this.mapperNameSync.lastError = syncResult.error;
    }

    const statsAfter = this.repository.mappers.getMapperAccountStats();
    this.mapperNameSync.mode = Number(statsAfter.unresolvedAccounts || 0) > 0 ? "bootstrap" : "maintenance";

    this.mapperNameSync.lastSummary = {
      cycle: priority ? "priority" : "main",
      reason,
      force,
      targetedSync,
      requestedAccountIds: normalizedRequestedAccountIds.length,
      cacheTtlSeconds: minResolvedAgeSeconds,
      batchSize: accountIds.length,
      ...syncResult,
      statsBefore,
      statsAfter,
      completedAt: new Date().toISOString(),
    };
    return this.mapperNameSync.lastSummary;
  } catch (error) {
    const message = error?.message || "Mapper sync cycle failed.";
    this.mapperNameSync.lastError = message;
    return {
      error: message,
    };
  } finally {
    this.mapperNameSync.running = false;
    this.mapperNameSync.lastFinishedAt = new Date().toISOString();
    this.scheduleNextMapperSyncRun({ priority: false });
    this.scheduleNextMapperSyncRun({ priority: true });
  }
}

async function runMapperNameSyncNow({ priority = false, force = false, reason = "manual-api" } = {}) {
  if (this.shouldUseDisplaynameRelay()) {
    const relayResult = await this.runTrackerDisplaynameSync({
      accountIds: [],
      reason,
      forceCandidates: Boolean(force),
    });
    if (relayResult?.ok) {
      return {
        ok: true,
        relay: "tracker-displayname",
        ...relayResult.summary,
      };
    }
    if (!this.trackerIntegrations.displaynameFallbackLocal) {
      return {
        error: relayResult?.error || "Tracker-displayname sync failed.",
      };
    }
  }
  return this.runMapperNameSyncCycle({
    priority: Boolean(priority),
    force: Boolean(force),
    allowWhenDisabled: true,
    reason,
  });
}

async function syncSpecificMapperAccountIds({ accountIds = [], force = false, reason = "manual-targeted-api" } = {}) {
  const normalizedRequested = uniqueBy(
    asArray(accountIds)
      .map((accountId) => normalizeAccountId(accountId))
      .filter(Boolean),
    (accountId) => accountId
  );
  if (this.shouldUseDisplaynameRelay()) {
    const relayResult = await this.runTrackerDisplaynameSync({
      accountIds: normalizedRequested,
      reason,
      forceCandidates: Boolean(force),
    });
    if (relayResult?.ok) {
      const upsert = this.repository.mappers.upsertMapperNames({
        accountIds: normalizedRequested,
        namesByAccountId: relayResult.namesByAccountId || {},
        source: reason || "manual-targeted-api",
      });
      if (upsert?.error) {
        return {
          error: upsert.error,
        };
      }
      const mapLinks = this.repository.mappers.updateMapMapperDisplayNames({
        namesByAccountId: relayResult.namesByAccountId || {},
      });
      return {
        ok: true,
        relay: "tracker-displayname",
        requested: normalizedRequested.length,
        resolved: Object.keys(relayResult.namesByAccountId || {}).length,
        namesUpdated: Number(upsert.namesUpdated || 0),
        historyInserted: Number(upsert.historyInserted || 0),
        mapLinksUpdated: Number(mapLinks?.updated || 0),
        summary: relayResult.summary || null,
      };
    }
    if (!this.trackerIntegrations.displaynameFallbackLocal) {
      return {
        error: relayResult?.error || "Tracker-displayname sync failed.",
      };
    }
  }
  return this.runMapperNameSyncCycle({
    priority: false,
    force: Boolean(force),
    allowWhenDisabled: true,
    reason,
    accountIds,
    limit: 5000,
  });
}

async function startMapperNameSyncScheduler() {
  if (!this.mapperNameSync.enabled) {
    await this.stopMapperNameSyncScheduler();
    return false;
  }
  if (this.shouldUseDisplaynameRelay()) {
    await this.stopMapperNameSyncScheduler();
    const relayConfig = await this.trackerDisplaynameClient.updateConfig({
      enabled: true,
      schedulerEnabled: true,
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
        relayConfig?.error || "Failed to start tracker-displayname scheduler.";
      if (/not configured|disabled/i.test(this.trackerIntegrations.lastDisplaynameRelayError)) {
        this.trackerIntegrations.displaynameRelayAvailable = false;
      }
      if (!this.trackerIntegrations.displaynameFallbackLocal) return false;
    } else {
      this.trackerIntegrations.displaynameRelayAvailable = true;
      this.trackerIntegrations.lastDisplaynameRelayError = null;
      return true;
    }
  }
  this.scheduleNextMapperSyncRun({ priority: false, fromTimeMs: Date.now() });
  this.scheduleNextMapperSyncRun({ priority: true, fromTimeMs: Date.now() });
  this.runMapperNameSyncCycle({
    priority: false,
    reason: "startup",
  }).catch((error) => {
    this.logger.warn(`[altered-mapper-sync] startup cycle failed: ${error?.message || error}`);
  });
  return true;
}

async function stopMapperNameSyncScheduler() {
  if (this.shouldUseDisplaynameRelay()) {
    const relayConfig = await this.trackerDisplaynameClient.updateConfig({
      schedulerEnabled: false,
    });
    if (!relayConfig?.ok) {
      this.trackerIntegrations.lastDisplaynameRelayError =
        relayConfig?.error || "Failed to stop tracker-displayname scheduler.";
    } else {
      this.trackerIntegrations.displaynameRelayAvailable = true;
      this.trackerIntegrations.lastDisplaynameRelayError = null;
    }
  }
  if (this.mapperNameSync.timer) {
    clearTimeout(this.mapperNameSync.timer);
    this.mapperNameSync.timer = null;
  }
  if (this.mapperNameSync.priorityTimer) {
    clearTimeout(this.mapperNameSync.priorityTimer);
    this.mapperNameSync.priorityTimer = null;
  }
  this.mapperNameSync.nextRunAt = null;
  this.mapperNameSync.nextPriorityRunAt = null;
  this.mapperNameSync.running = false;
  return true;
}

async function syncMapperNamesForCampaigns({ campaigns = [], note = "", onProgress = null } = {}) {
  const mapperAccountIds = collectMapperAccountIds(campaigns);
  if (onProgress) {
    onProgress({
      phase: "resolve-mapper-names",
      percent: 92,
      message: `Preparing mapper identity sync for ${mapperAccountIds.length} account IDs.`,
      counters: {
        mapperAccountsSeen: mapperAccountIds.length,
      },
    });
  }
  if (!mapperAccountIds.length) {
    return {
      ok: true,
      mapperAccountsSeen: 0,
      mapperNamesResolved: 0,
      mapperNamesUpdated: 0,
      mapperNameHistoryInserted: 0,
      mapperMapNameLinksUpdated: 0,
    };
  }

  const source = String(note || "live-sync").trim() || "live-sync";

  const syncResult = await this.syncMapperNamesBatch({
    accountIds: mapperAccountIds,
    source,
  });
  if (!syncResult?.ok && syncResult?.error) {
    return {
      ok: false,
      warning: syncResult.error,
      mapperAccountsSeen: mapperAccountIds.length,
      mapperNamesResolved: Number(syncResult.resolved || 0),
      mapperNamesUpdated: Number(syncResult.namesUpdated || 0),
      mapperNameHistoryInserted: Number(syncResult.historyInserted || 0),
      mapperMapNameLinksUpdated: Number(syncResult.mapLinksUpdated || 0),
    };
  }

  if (onProgress) {
    onProgress({
      phase: "resolve-mapper-names",
      percent: 97,
      message: `Mapper names synced (${Number(syncResult?.resolved || 0)} resolved, ${Number(
        syncResult?.namesUpdated || 0
      )} updated).`,
      counters: {
        mapperAccountsSeen: mapperAccountIds.length,
        mapperNamesResolved: Number(syncResult?.resolved || 0),
        mapperNamesUpdated: Number(syncResult?.namesUpdated || 0),
        mapperNameHistoryInserted: Number(syncResult?.historyInserted || 0),
        mapperMapNameLinksUpdated: Number(syncResult?.mapLinksUpdated || 0),
        trackerPlayersSynced: Number(syncResult?.trackerPlayersSynced || 0),
      },
    });
  }

  return {
    ok: true,
    warning: syncResult?.warning || null,
    mapperAccountsSeen: mapperAccountIds.length,
    mapperNamesResolved: Number(syncResult?.resolved || 0),
    mapperNamesUpdated: Number(syncResult?.namesUpdated || 0),
    mapperNameHistoryInserted: Number(syncResult?.historyInserted || 0),
    mapperMapNameLinksUpdated: Number(syncResult?.mapLinksUpdated || 0),
    trackerPlayersSynced: Number(syncResult?.trackerPlayersSynced || 0),
  };
}

export {
  runMapperNameSyncCycle,
  runMapperNameSyncNow,
  syncSpecificMapperAccountIds,
  startMapperNameSyncScheduler,
  stopMapperNameSyncScheduler,
  syncMapperNamesForCampaigns,
};
