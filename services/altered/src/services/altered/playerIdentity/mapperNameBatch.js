import { normalizeAccountId, asArray, delay, uniqueBy } from "../serviceSupport.js";
import { persistResolvedMapperNames, syncResolvedPlayersToTracker } from "./mapperNamePersistence.js";

async function syncMapperNamesBatch({ accountIds = [], source = "mapper-sync" } = {}) {
  const normalizedAccountIds = uniqueBy(
    asArray(accountIds)
      .map((accountId) => normalizeAccountId(accountId))
      .filter(Boolean),
    (accountId) => accountId
  );
  if (!normalizedAccountIds.length) {
    return {
      ok: true,
      requested: 0,
      resolved: 0,
      trackerCacheHits: 0,
      nadeoRequested: 0,
      nadeoResolved: 0,
      namesUpdated: 0,
      historyInserted: 0,
      mapLinksUpdated: 0,
      trackerPlayersSynced: 0,
    };
  }

  if (this.shouldUseDisplaynameRelay()) {
    const relayResult = await this.runTrackerDisplaynameSync({
      accountIds: normalizedAccountIds,
      reason: source || "mapper-sync",
      forceCandidates: false,
    });
    if (relayResult?.ok) {
      const namesByAccountId = relayResult.namesByAccountId || {};
      const persisted = await persistResolvedMapperNames(this, {
        accountIds: normalizedAccountIds,
        namesByAccountId,
        source,
      });
      if (persisted.error) {
        return {
          ok: false,
          error: persisted.error,
          requested: normalizedAccountIds.length,
        };
      }
      const { nameUpsert, mapLinks, aggregatorIngest } = persisted;
      const trackerSync = await syncResolvedPlayersToTracker(this, namesByAccountId, source);
      const warning =
        [trackerSync.warning, aggregatorIngest?.ok ? null : aggregatorIngest?.error].filter(Boolean).join(" | ") ||
        null;
      return {
        ok: true,
        relay: "tracker-displayname",
        warning,
        requested: normalizedAccountIds.length,
        resolved: Object.keys(namesByAccountId).length,
        trackerCacheHits: Object.keys(namesByAccountId).length,
        nadeoRequested: Number(relayResult.summary?.requested || normalizedAccountIds.length),
        nadeoResolved: Number(relayResult.summary?.resolved || Object.keys(namesByAccountId).length),
        namesUpdated: Number(nameUpsert.namesUpdated || 0),
        historyInserted: Number(nameUpsert.historyInserted || 0),
        mapLinksUpdated: Number(mapLinks?.updated || 0),
        aggregatorAccepted: Number(aggregatorIngest?.accepted || 0),
        aggregatorInserted: Number(aggregatorIngest?.inserted || 0),
        aggregatorUpdated: Number(aggregatorIngest?.updated || 0),
        trackerPlayersSynced: trackerSync.playersSynced,
      };
    }
    if (!this.trackerIntegrations.displaynameFallbackLocal) {
      return {
        ok: false,
        error: relayResult?.error || "Tracker-displayname sync failed.",
        requested: normalizedAccountIds.length,
      };
    }
  }

  let trackerLookupWarning = null;
  let trackerNamesByAccountId = {};
  if (this.trackerClient?.getPlayerNames) {
    const trackerLookup = await this.trackerClient.getPlayerNames(normalizedAccountIds, {
      chunkSize: 50,
    });
    if (trackerLookup?.namesByAccountId && typeof trackerLookup.namesByAccountId === "object") {
      trackerNamesByAccountId = trackerLookup.namesByAccountId;
    }
    if (trackerLookup?.error) {
      trackerLookupWarning = trackerLookup.error;
    }
  }

  const unresolvedAccountIds = normalizedAccountIds.filter((accountId) => !trackerNamesByAccountId[accountId]);
  let nadeoRequested = 0;
  let nadeoResolved = 0;
  let nadeoNamesByAccountId = {};

  if (unresolvedAccountIds.length > 0) {
    if (!this.mapperNameClient || !this.mapperNameClient.isConfigured?.()) {
      return {
        ok: false,
        error: "Mapper name client is not configured.",
        requested: normalizedAccountIds.length,
        trackerCacheHits: Object.keys(trackerNamesByAccountId).length,
        nadeoRequested,
        nadeoResolved,
        trackerLookupWarning,
      };
    }

    const waitMs = Math.max(0, Number(this.mapperNameSync.nextLookupAllowedAtMs || 0) - Date.now());
    if (waitMs > 0) {
      await delay(waitMs);
    }

    let resolved;
    try {
      resolved = await this.mapperNameClient.getDisplayNames(unresolvedAccountIds);
    } finally {
      this.mapperNameSync.nextLookupAllowedAtMs = Date.now() + this.mapperNameSync.minRequestGapMs;
    }

    nadeoRequested = Number(resolved?.requested || unresolvedAccountIds.length);
    nadeoResolved = Number(resolved?.resolved || 0);
    nadeoNamesByAccountId =
      resolved?.namesByAccountId && typeof resolved.namesByAccountId === "object" ? resolved.namesByAccountId : {};

    if (!resolved?.ok) {
      return {
        ok: false,
        error: resolved?.error || "Failed to resolve mapper display names.",
        requested: normalizedAccountIds.length,
        trackerCacheHits: Object.keys(trackerNamesByAccountId).length,
        nadeoRequested,
        nadeoResolved,
        trackerLookupWarning,
      };
    }
  }

  const namesByAccountId = {
    ...trackerNamesByAccountId,
    ...nadeoNamesByAccountId,
  };
  const persisted = await persistResolvedMapperNames(this, {
    accountIds: normalizedAccountIds,
    namesByAccountId,
    source,
  });
  if (persisted.error) {
    return {
      ok: false,
      error: persisted.error,
      requested: normalizedAccountIds.length,
    };
  }
  const { nameUpsert, mapLinks, aggregatorIngest } = persisted;
  const trackerSync = await syncResolvedPlayersToTracker(this, nadeoNamesByAccountId, source);
  const warning =
    [trackerLookupWarning, trackerSync.warning, aggregatorIngest?.ok ? null : aggregatorIngest?.error]
      .filter(Boolean)
      .join(" | ") || null;

  return {
    ok: true,
    warning,
    requested: normalizedAccountIds.length,
    resolved: Object.keys(namesByAccountId).length,
    trackerCacheHits: Object.keys(trackerNamesByAccountId).length,
    nadeoRequested,
    nadeoResolved,
    namesUpdated: Number(nameUpsert.namesUpdated || 0),
    historyInserted: Number(nameUpsert.historyInserted || 0),
    mapLinksUpdated: Number(mapLinks?.updated || 0),
    aggregatorAccepted: Number(aggregatorIngest?.accepted || 0),
    aggregatorInserted: Number(aggregatorIngest?.inserted || 0),
    aggregatorUpdated: Number(aggregatorIngest?.updated || 0),
    trackerPlayersSynced: trackerSync.playersSynced,
  };
}

export { syncMapperNamesBatch };
