import {
  normalizeAccountId,
  hasResolvedDisplayName,
  resolveKnownDisplayName,
  sanitizeResolvedDisplayName,
  DEFAULT_MAPPER_PRIORITY_BATCH_SIZE,
  toText,
  asArray,
  uniqueBy,
} from "../serviceSupport.js";

function collectAccountIds(rows = [], keys = []) {
  const safeKeys = Array.isArray(keys) ? keys : [];
  const ids = [];
  const seen = new Set();
  for (const row of asArray(rows)) {
    for (const key of safeKeys) {
      const accountId = normalizeAccountId(row?.[key]);
      if (!accountId || seen.has(accountId)) continue;
      seen.add(accountId);
      ids.push(accountId);
    }
  }
  return ids;
}

function collectHolderAccountIds(rows = [], keys = []) {
  return this.collectAccountIds(rows, keys);
}

function pruneViewedPriorityAccountIds(nowMs = Date.now()) {
  const ttlMs = Math.max(1000, Number(this.mapperNameSync.viewedPriorityCooldownMs || 0) || 0);
  const queueMap = this.mapperNameSync.viewedPriorityQueuedAtMsByAccountId;
  if (!(queueMap instanceof Map)) {
    this.mapperNameSync.viewedPriorityQueuedAtMsByAccountId = new Map();
    this.mapperNameSync.viewedPriorityAccountIds = [];
    return;
  }
  for (const [accountId, queuedAtMs] of queueMap.entries()) {
    if (!queuedAtMs || nowMs - Number(queuedAtMs || 0) >= ttlMs) {
      queueMap.delete(accountId);
    }
  }
  this.mapperNameSync.viewedPriorityAccountIds = asArray(this.mapperNameSync.viewedPriorityAccountIds).filter(
    (accountId) => queueMap.has(accountId)
  );
}

function kickoffPriorityDisplayNameFallback({ source = "public-view" } = {}) {
  if (!this.trackerIntegrations.displaynameFallbackLocal) return false;
  this.pruneViewedPriorityAccountIds();

  const nowMs = Date.now();
  const cooldownMs = Math.max(1000, Number(this.mapperNameSync.viewedPriorityLocalKickoffCooldownMs || 0) || 0);
  const lastKickoffAtMs = Number(this.mapperNameSync.lastViewedPriorityLocalKickoffAtMs || 0);
  if (lastKickoffAtMs && nowMs - lastKickoffAtMs < cooldownMs) {
    return false;
  }

  const accountIds = uniqueBy(
    asArray(this.mapperNameSync.viewedPriorityAccountIds)
      .map((accountId) => normalizeAccountId(accountId))
      .filter(Boolean),
    (accountId) => accountId
  ).slice(0, Math.max(1, Number(this.mapperNameSync.priorityBatchSize || 0) || DEFAULT_MAPPER_PRIORITY_BATCH_SIZE));
  if (!accountIds.length) return false;

  this.mapperNameSync.lastViewedPriorityLocalKickoffAtMs = nowMs;
  const safeSource = String(source || "public-view").trim() || "public-view";
  this.syncMapperNamesBatch({
    accountIds,
    source: `priority:${safeSource}`,
  })
    .then((result) => {
      if (!result?.ok) {
        const message = result?.error || "Local priority display-name sync failed.";
        this.logger.warn(`[altered-displayname-priority] ${message}`);
      }
    })
    .catch((error) => {
      const message = error?.message || String(error || "Local priority display-name sync failed.");
      this.logger.warn(`[altered-displayname-priority] ${message}`);
    });
  return true;
}

function queuePriorityDisplayNameLookups(accountIds = [], { source = "public-view" } = {}) {
  const normalizedAccountIds = uniqueBy(
    asArray(accountIds)
      .map((accountId) => normalizeAccountId(accountId))
      .filter(Boolean),
    (accountId) => accountId
  );
  if (!normalizedAccountIds.length) {
    return {
      queued: 0,
      relayQueued: false,
    };
  }

  this.pruneViewedPriorityAccountIds();
  const safeSource = String(source || "public-view").trim() || "public-view";
  const nowMs = Date.now();
  const queueMap = this.mapperNameSync.viewedPriorityQueuedAtMsByAccountId;
  const freshAccountIds = normalizedAccountIds.filter((accountId) => {
    const queuedAtMs = Number(queueMap.get(accountId) || 0);
    return !queuedAtMs || nowMs - queuedAtMs >= this.mapperNameSync.viewedPriorityCooldownMs;
  });
  if (!freshAccountIds.length) {
    return {
      queued: 0,
      relayQueued: false,
    };
  }

  for (const accountId of freshAccountIds) {
    queueMap.set(accountId, nowMs);
  }
  this.mapperNameSync.viewedPriorityAccountIds = uniqueBy(
    [...freshAccountIds, ...asArray(this.mapperNameSync.viewedPriorityAccountIds)],
    (accountId) => accountId
  );
  this.mapperNameSync.priorityAccountIds = uniqueBy(
    [...freshAccountIds, ...asArray(this.mapperNameSync.priorityAccountIds)],
    (accountId) => accountId
  );

  if (typeof this.repository?.mappers?.seedMapperAccounts === "function") {
    const seeded = this.repository.mappers.seedMapperAccounts({
      accountIds: freshAccountIds,
      source: `priority:${safeSource}`,
    });
    if (seeded?.error) {
      this.logger.warn(`[altered-mapper-sync] failed to seed priority accounts: ${seeded.error}`);
    }
  }

  let localFallbackQueued = false;
  const queueLocalFallback = () => {
    if (localFallbackQueued) return;
    localFallbackQueued = this.kickoffPriorityDisplayNameFallback({
      source: safeSource,
    });
  };

  if (this.shouldUseDisplaynameRelay()) {
    const relayPromise = this.trackerDisplaynameClient?.enqueueAccountIds?.(freshAccountIds, {
      front: true,
    });
    relayPromise
      ?.then((result) => {
        if (!result?.ok) {
          const message = result?.error || "Tracker-displayname priority enqueue failed.";
          this.trackerIntegrations.lastDisplaynameRelayError = message;
          this.logger.warn(`[altered-displayname-priority] ${message}`);
          queueLocalFallback();
          return;
        }
        this.trackerIntegrations.displaynameRelayAvailable = true;
        this.trackerIntegrations.lastDisplaynameRelayError = null;
      })
      ?.catch((error) => {
        const message = error?.message || String(error || "Priority enqueue failed.");
        this.trackerIntegrations.lastDisplaynameRelayError = message;
        this.logger.warn(`[altered-displayname-priority] ${message}`);
        queueLocalFallback();
      });

    const relayKickoffCooldownMs = Math.max(
      1000,
      Number(this.mapperNameSync.viewedPriorityRelayKickoffCooldownMs || 0) || 0
    );
    const lastRelayKickoffAtMs = Number(this.mapperNameSync.lastViewedPriorityRelayKickoffAtMs || 0);
    if (!lastRelayKickoffAtMs || nowMs - lastRelayKickoffAtMs >= relayKickoffCooldownMs) {
      this.mapperNameSync.lastViewedPriorityRelayKickoffAtMs = nowMs;
      this.trackerDisplaynameClient
        ?.runSync?.({
          accountIds: freshAccountIds,
          forceCandidates: false,
          prioritizeAccountIds: true,
        })
        ?.then((result) => {
          if (!result?.ok) {
            const message = result?.error || "Tracker-displayname priority kickoff failed.";
            this.trackerIntegrations.lastDisplaynameRelayError = message;
            this.logger.warn(`[altered-displayname-priority] ${message}`);
            queueLocalFallback();
            return;
          }
          this.trackerIntegrations.displaynameRelayAvailable = true;
          this.trackerIntegrations.lastDisplaynameRelayError = null;
        })
        ?.catch((error) => {
          const message = error?.message || String(error || "Priority relay kickoff failed.");
          this.trackerIntegrations.lastDisplaynameRelayError = message;
          this.logger.warn(`[altered-displayname-priority] ${message}`);
          queueLocalFallback();
        });
    }
  } else {
    queueLocalFallback();
  }

  return {
    queued: freshAccountIds.length,
    relayQueued: this.shouldUseDisplaynameRelay(),
    localFallbackQueued,
  };
}

function getCachedPlayerName(accountId) {
  const safeAccountId = normalizeAccountId(accountId);
  if (!safeAccountId) return "";
  const cached = this.playerNamesCache.get(safeAccountId);
  if (!cached) return "";
  if (Number(cached.expiresAtMs || 0) <= Date.now()) {
    this.playerNamesCache.delete(safeAccountId);
    return "";
  }
  const displayName = sanitizeResolvedDisplayName(cached.displayName, {
    accountId: safeAccountId,
  });
  if (!displayName) return "";
  return displayName;
}

function cachePlayerName(accountId, displayName) {
  const safeAccountId = normalizeAccountId(accountId);
  const safeDisplayName = sanitizeResolvedDisplayName(displayName, {
    accountId: safeAccountId,
  });
  if (!safeAccountId || !safeDisplayName) return;
  this.playerNamesCache.set(safeAccountId, {
    displayName: safeDisplayName,
    expiresAtMs: Date.now() + this.playerNamesCacheTtlMs,
  });
}

async function resolvePlayerNamesByAccountIds(accountIds = [], { chunkSize = 100, external = true } = {}) {
  const normalizedAccountIds = [];
  const seen = new Set();
  for (const rawAccountId of asArray(accountIds)) {
    const accountId = normalizeAccountId(rawAccountId);
    if (!accountId || seen.has(accountId)) continue;
    seen.add(accountId);
    normalizedAccountIds.push(accountId);
  }
  if (!normalizedAccountIds.length) return {};

  const namesByAccountId = {};
  const externallyResolvedNamesByAccountId = {};
  const unresolved = [];
  for (const accountId of normalizedAccountIds) {
    const cached = this.getCachedPlayerName(accountId);
    if (cached) {
      namesByAccountId[accountId] = cached;
    } else {
      unresolved.push(accountId);
    }
  }

  if (unresolved.length && typeof this.repository?.mappers?.getMapperAccountsForSync === "function") {
    const localMapperRows = this.repository.mappers.getMapperAccountsForSync({
      accountIds: unresolved,
      limit: Math.max(unresolved.length, 50),
      minResolvedAgeSeconds: 0,
    });
    for (const row of asArray(localMapperRows)) {
      const accountId = normalizeAccountId(row?.accountId);
      const displayName = toText(row?.latestDisplayName);
      if (!accountId || !displayName || normalizeAccountId(displayName)) continue;
      namesByAccountId[accountId] = displayName;
      this.cachePlayerName(accountId, displayName);
    }
  }

  const unresolvedAfterLocal = unresolved.filter((accountId) => !namesByAccountId[accountId]);
  if (!external) {
    if (unresolvedAfterLocal.length) {
      this.queuePriorityDisplayNameLookups(unresolvedAfterLocal, {
        source: "public-resolution",
      });
    }
    return namesByAccountId;
  }

  let unresolvedAfterAggregator = unresolvedAfterLocal;

  if (unresolvedAfterLocal.length && this.aggregatorClient?.isConfigured?.()) {
    const aggregatorResult = await this.getDisplayNamesFromAggregator(unresolvedAfterLocal);
    if (aggregatorResult?.ok) {
      for (const [rawAccountId, rawDisplayName] of Object.entries(aggregatorResult.namesByAccountId || {})) {
        const accountId = normalizeAccountId(rawAccountId);
        const displayName = sanitizeResolvedDisplayName(rawDisplayName, { accountId });
        if (!accountId || !displayName) continue;
        namesByAccountId[accountId] = displayName;
        externallyResolvedNamesByAccountId[accountId] = displayName;
        this.cachePlayerName(accountId, displayName);
      }
    } else if (aggregatorResult?.error) {
      this.logger.warn(`[altered-displayname] aggregator lookup warning: ${aggregatorResult.error}`);
    }
    unresolvedAfterAggregator = unresolvedAfterLocal.filter((accountId) => !namesByAccountId[accountId]);
  }

  let unresolvedAfterKnown = unresolvedAfterAggregator;
  for (const accountId of unresolvedAfterAggregator) {
    const displayName = sanitizeResolvedDisplayName(resolveKnownDisplayName(accountId), {
      accountId,
    });
    if (!displayName) continue;
    namesByAccountId[accountId] = displayName;
    externallyResolvedNamesByAccountId[accountId] = displayName;
    this.cachePlayerName(accountId, displayName);
  }
  unresolvedAfterKnown = unresolvedAfterAggregator.filter((accountId) => !namesByAccountId[accountId]);

  let unresolvedAfterDisplaynameRelay = unresolvedAfterKnown;
  if (
    unresolvedAfterKnown.length &&
    this.shouldUseDisplaynameRelay() &&
    typeof this.trackerDisplaynameClient?.resolveAccountIds === "function"
  ) {
    const relayResult = await this.trackerDisplaynameClient.resolveAccountIds(unresolvedAfterKnown, {
      front: true,
      reason: "altered-public-resolution",
    });
    if (relayResult?.ok) {
      const relayPayload = relayResult.data || {};
      const relayNamesByAccountId =
        relayPayload.namesByAccountId && typeof relayPayload.namesByAccountId === "object"
          ? relayPayload.namesByAccountId
          : {};
      for (const [rawAccountId, rawDisplayName] of Object.entries(relayNamesByAccountId)) {
        const accountId = normalizeAccountId(rawAccountId);
        const displayName = sanitizeResolvedDisplayName(rawDisplayName, { accountId });
        if (!accountId || !displayName) continue;
        namesByAccountId[accountId] = displayName;
        externallyResolvedNamesByAccountId[accountId] = displayName;
        this.cachePlayerName(accountId, displayName);
      }

      this.trackerIntegrations.displaynameRelayAvailable = true;
      this.trackerIntegrations.lastDisplaynameRelayError = relayPayload.ingestError || null;
      this.trackerIntegrations.lastDisplaynameRelay = {
        at: new Date().toISOString(),
        reason: "altered-public-resolution",
        requested: Number(relayPayload.requested || unresolvedAfterKnown.length),
        resolved: Number(relayPayload.resolved || Object.keys(relayNamesByAccountId).length || 0),
        accepted: Number(relayPayload.accepted || 0),
        inserted: Number(relayPayload.inserted || 0),
        updated: Number(relayPayload.updated || 0),
        unchanged: Number(relayPayload.unchanged || 0),
        queueRemaining: Number(relayPayload.queueRemaining || 0),
      };
    } else if (relayResult?.error) {
      this.trackerIntegrations.lastDisplaynameRelayError = relayResult.error;
      this.logger.warn(`[altered-displayname] tracker-displayname resolve warning: ${relayResult.error}`);
    }

    unresolvedAfterDisplaynameRelay = unresolvedAfterKnown.filter((accountId) => !namesByAccountId[accountId]);
  }

  const syncExternallyResolvedNames = async () => {
    const syncedAccountIds = Object.keys(externallyResolvedNamesByAccountId);
    if (!syncedAccountIds.length) {
      return;
    }
    if (typeof this.repository?.mappers?.upsertMapperNames === "function") {
      const upsert = this.repository.mappers.upsertMapperNames({
        accountIds: syncedAccountIds,
        namesByAccountId: externallyResolvedNamesByAccountId,
        source: "public-displayname-lookup",
      });
      if (upsert?.error) {
        this.logger.warn(`[altered-displayname] local mapper sync warning: ${upsert.error}`);
      } else if (typeof this.repository?.mappers?.updateMapMapperDisplayNames === "function") {
        const mapLinks = this.repository.mappers.updateMapMapperDisplayNames({
          namesByAccountId: externallyResolvedNamesByAccountId,
        });
        if (mapLinks?.error) {
          this.logger.warn(`[altered-displayname] map display-name sync warning: ${mapLinks.error}`);
        }
      }
    }
    try {
      await this.ingestDisplayNamesToAggregator(externallyResolvedNamesByAccountId, {
        source: "public-displayname-lookup",
      });
    } catch (error) {
      this.logger.warn(`[altered-displayname] aggregator display-name sync warning: ${error?.message || error}`);
    }
  };

  if (!unresolvedAfterDisplaynameRelay.length || !this.trackerClient?.getPlayerNames) {
    if (unresolvedAfterDisplaynameRelay.length) {
      this.queuePriorityDisplayNameLookups(unresolvedAfterDisplaynameRelay, {
        source: "public-resolution",
      });
    }
    await syncExternallyResolvedNames();
    return namesByAccountId;
  }

  const namesResult = await this.trackerClient.getPlayerNames(unresolvedAfterDisplaynameRelay, {
    chunkSize,
  });
  const fromTracker =
    namesResult?.namesByAccountId && typeof namesResult.namesByAccountId === "object"
      ? namesResult.namesByAccountId
      : {};

  for (const [rawAccountId, rawDisplayName] of Object.entries(fromTracker)) {
    const accountId = normalizeAccountId(rawAccountId);
    const displayName = sanitizeResolvedDisplayName(rawDisplayName, { accountId });
    if (!accountId || !displayName) continue;
    namesByAccountId[accountId] = displayName;
    externallyResolvedNamesByAccountId[accountId] = displayName;
    this.cachePlayerName(accountId, displayName);
  }

  const stillUnresolved = unresolvedAfterDisplaynameRelay.filter((accountId) => !namesByAccountId[accountId]);
  if (stillUnresolved.length) {
    this.queuePriorityDisplayNameLookups(stillUnresolved, {
      source: "public-resolution",
    });
  }
  await syncExternallyResolvedNames();

  return namesByAccountId;
}

function resolveHolderName(holder, namesByAccountId = {}, { accountId = "" } = {}) {
  const holderText = toText(holder);
  const holderAccountId = normalizeAccountId(accountId) || normalizeAccountId(holderText);
  if (!holderAccountId) return holderText || "Unknown";
  const fromLookup = sanitizeResolvedDisplayName(namesByAccountId[holderAccountId], {
    accountId: holderAccountId,
  });
  if (fromLookup) return fromLookup;
  const fromCache = this.getCachedPlayerName(holderAccountId);
  if (fromCache) return fromCache;
  const holderDisplayName = sanitizeResolvedDisplayName(holderText, {
    accountId: holderAccountId,
  });
  if (holderDisplayName) return holderDisplayName;
  return holderAccountId;
}

function applyResolvedHolderNames(
  rows = [],
  holderKey,
  namesByAccountId = {},
  { accountIdKeys = [], pendingKey = "", accountIdOutputKey = "" } = {}
) {
  const key = toText(holderKey);
  if (!key) return asArray(rows);
  const safeAccountIdKeys = Array.isArray(accountIdKeys) ? accountIdKeys : [];
  const safePendingKey = toText(pendingKey);
  const safeAccountIdOutputKey = toText(accountIdOutputKey);
  return asArray(rows).map((row) => {
    const accountId =
      safeAccountIdKeys.map((accountKey) => normalizeAccountId(row?.[accountKey])).find(Boolean) ||
      normalizeAccountId(row?.[key]);
    const resolved = this.resolveHolderName(row?.[key], namesByAccountId, { accountId });
    const pending = accountId ? !hasResolvedDisplayName(resolved, { accountId }) : false;
    return {
      ...row,
      [key]: resolved,
      ...(safePendingKey ? { [safePendingKey]: pending } : {}),
      ...(safeAccountIdOutputKey ? { [safeAccountIdOutputKey]: accountId || null } : {}),
    };
  });
}

export {
  collectAccountIds,
  collectHolderAccountIds,
  pruneViewedPriorityAccountIds,
  kickoffPriorityDisplayNameFallback,
  queuePriorityDisplayNameLookups,
  getCachedPlayerName,
  cachePlayerName,
  resolvePlayerNamesByAccountIds,
  resolveHolderName,
  applyResolvedHolderNames,
};
