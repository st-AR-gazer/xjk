import {
  normalizePossibleAccountId,
  resolveKnownDisplayName,
  sanitizeResolvedDisplayName,
  validateSharedDisplayName,
} from "./displayNameResolution.js";

function uniqueAccountIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizePossibleAccountId).filter(Boolean))];
}

function coerceNamesMap(value) {
  if (!value) return {};
  if (Array.isArray(value)) {
    const namesByAccountId = {};
    for (const row of value) {
      const accountId = normalizePossibleAccountId(row?.accountId || row?.account_id);
      const displayName = sanitizeResolvedDisplayName(row?.displayName || row?.display_name, {
        accountId,
      });
      if (!accountId || !displayName) continue;
      namesByAccountId[accountId] = displayName;
    }
    return namesByAccountId;
  }
  if (typeof value === "object") {
    const namesByAccountId = {};
    for (const [rawAccountId, rawDisplayName] of Object.entries(value)) {
      const accountId = normalizePossibleAccountId(rawAccountId);
      const displayName = sanitizeResolvedDisplayName(rawDisplayName, { accountId });
      if (!accountId || !displayName) continue;
      namesByAccountId[accountId] = displayName;
    }
    return namesByAccountId;
  }
  return {};
}

class DisplayNameDirectory {
  constructor({
    aggregatorClient = null,
    trackerDisplaynameClient = null,
    logger = console,
    cacheTtlMs = 6 * 60 * 60 * 1000,
    projectKey = "xjk-shared-displayname",
    projectName = "XJK Shared Displayname",
    sourceLabel = "xjk-shared-displayname",
    getLocalNames = null,
    setLocalNames = null,
  } = {}) {
    this.aggregatorClient = aggregatorClient;
    this.trackerDisplaynameClient = trackerDisplaynameClient;
    this.logger = logger;
    this.cacheTtlMs = Math.max(30_000, Number(cacheTtlMs) || 6 * 60 * 60 * 1000);
    this.projectKey = String(projectKey || "").trim() || "xjk-shared-displayname";
    this.projectName = String(projectName || "").trim() || "XJK Shared Displayname";
    this.sourceLabel = String(sourceLabel || "").trim() || "xjk-shared-displayname";
    this.getLocalNames = typeof getLocalNames === "function" ? getLocalNames : null;
    this.setLocalNames = typeof setLocalNames === "function" ? setLocalNames : null;
    this.cache = new Map();
  }

  getCachedDisplayName(accountId) {
    const safeAccountId = normalizePossibleAccountId(accountId);
    if (!safeAccountId) return "";
    const cached = this.cache.get(safeAccountId);
    if (!cached) return "";
    if (Number(cached.expiresAtMs || 0) <= Date.now()) {
      this.cache.delete(safeAccountId);
      return "";
    }
    return sanitizeResolvedDisplayName(cached.displayName, { accountId: safeAccountId });
  }

  cacheDisplayName(accountId, displayName) {
    const safeAccountId = normalizePossibleAccountId(accountId);
    const validated = validateSharedDisplayName(displayName, { accountId: safeAccountId });
    if (!safeAccountId || !validated.ok) return "";
    this.cache.set(safeAccountId, {
      displayName: validated.displayName,
      expiresAtMs: Date.now() + this.cacheTtlMs,
    });
    return validated.displayName;
  }

  cacheNames(namesByAccountId = {}) {
    const safeMap = coerceNamesMap(namesByAccountId);
    for (const [accountId, displayName] of Object.entries(safeMap)) {
      this.cacheDisplayName(accountId, displayName);
    }
    return safeMap;
  }

  async readLocalNames(accountIds = []) {
    if (!this.getLocalNames) return {};
    try {
      return coerceNamesMap(await this.getLocalNames(uniqueAccountIds(accountIds)));
    } catch (error) {
      this.logger.warn(`[shared-displayname-directory] local read failed: ${error?.message || error}`);
      return {};
    }
  }

  async writeLocalNames(namesByAccountId = {}, { source = this.sourceLabel } = {}) {
    if (!this.setLocalNames) return { ok: true, skipped: true };
    const safeMap = coerceNamesMap(namesByAccountId);
    if (!Object.keys(safeMap).length) return { ok: true, skipped: true };
    try {
      await this.setLocalNames(safeMap, { source });
      return { ok: true, count: Object.keys(safeMap).length };
    } catch (error) {
      this.logger.warn(`[shared-displayname-directory] local write failed: ${error?.message || error}`);
      return {
        ok: false,
        error: error?.message || "Local display-name write failed.",
      };
    }
  }

  async getDisplayNamesFromAggregator(accountIds = []) {
    if (!this.aggregatorClient?.isConfigured?.()) {
      return {
        ok: false,
        error: "Aggregator client is not configured.",
        namesByAccountId: {},
      };
    }

    const normalizedAccountIds = uniqueAccountIds(accountIds);
    if (!normalizedAccountIds.length) {
      return {
        ok: true,
        namesByAccountId: {},
        resolved: 0,
      };
    }

    const result = await this.aggregatorClient.getDisplayNames(normalizedAccountIds);
    if (!result?.ok) {
      return {
        ok: false,
        error: result?.error || "Failed to query display names from aggregator.",
        namesByAccountId: {},
      };
    }

    const rows = Array.isArray(result?.data?.names) ? result.data.names : [];
    const namesByAccountId = {};
    for (const row of rows) {
      const accountId = normalizePossibleAccountId(row?.accountId || row?.account_id);
      const validated = validateSharedDisplayName(row?.displayName || row?.display_name, {
        accountId,
      });
      if (!accountId || !validated.ok) continue;
      namesByAccountId[accountId] = validated.displayName;
    }

    return {
      ok: true,
      namesByAccountId,
      resolved: Object.keys(namesByAccountId).length,
    };
  }

  async ingestDisplayNamesToAggregator(
    namesByAccountId = {},
    { source = this.sourceLabel, observedAt = new Date().toISOString() } = {}
  ) {
    if (!this.aggregatorClient?.isConfigured?.()) {
      return {
        ok: false,
        skipped: true,
        error: "Aggregator client is not configured.",
      };
    }

    const safeMap = coerceNamesMap(namesByAccountId);
    if (!Object.keys(safeMap).length) {
      return {
        ok: true,
        skipped: true,
        accepted: 0,
        inserted: 0,
        updated: 0,
        unchanged: 0,
      };
    }

    const ingest = await this.aggregatorClient.ingestDisplayNames(safeMap, {
      source,
      projectKey: this.projectKey,
      projectName: this.projectName,
      observedAt,
    });

    if (!ingest?.ok) {
      return {
        ok: false,
        error: ingest?.error || "Failed to ingest display names to aggregator.",
      };
    }

    const result = ingest?.data?.ingest || ingest?.data || {};
    return {
      ok: true,
      accepted: Number(result.accepted || 0),
      inserted: Number(result.inserted || 0),
      updated: Number(result.updated || 0),
      unchanged: Number(result.unchanged || 0),
    };
  }

  async enqueuePriorityLookups(accountIds = [], { front = true } = {}) {
    if (!this.trackerDisplaynameClient?.isConfigured?.()) {
      return {
        ok: false,
        error: "Tracker displayname client is not configured.",
      };
    }
    if (typeof this.trackerDisplaynameClient.enqueueAccountIds !== "function") {
      return {
        ok: false,
        error: "Tracker displayname client does not support priority enqueue.",
      };
    }
    return this.trackerDisplaynameClient.enqueueAccountIds(uniqueAccountIds(accountIds), {
      front,
    });
  }

  async resolveViaTrackerDisplayname(accountIds = [], { reason = "shared-resolution", front = true } = {}) {
    if (!this.trackerDisplaynameClient?.isConfigured?.()) {
      return {
        ok: false,
        error: "Tracker displayname client is not configured.",
        namesByAccountId: {},
      };
    }

    const relay = await this.trackerDisplaynameClient.resolveAccountIds(uniqueAccountIds(accountIds), {
      front,
      reason,
    });
    if (!relay?.ok) {
      return {
        ok: false,
        error: relay?.error || "Tracker displayname resolution failed.",
        namesByAccountId: {},
      };
    }

    const data = relay.data || {};
    const namesByAccountId = coerceNamesMap(data.namesByAccountId);
    return {
      ok: true,
      namesByAccountId,
      requested: Number(data.requested || accountIds.length),
      resolved: Number(data.resolved || Object.keys(namesByAccountId).length),
      missingAccountIds: uniqueAccountIds(data.missingAccountIds || []),
      queueRemaining: Number(data.queueRemaining || 0),
      ingestError: data.ingestError || "",
      fetchError: data.fetchError || "",
    };
  }

  async observeNames(
    namesByAccountId = {},
    { source = this.sourceLabel, persistLocal = true, ingest = true, observedAt = new Date().toISOString() } = {}
  ) {
    const safeMap = this.cacheNames(namesByAccountId);
    if (!Object.keys(safeMap).length) {
      return {
        ok: true,
        skipped: true,
        namesByAccountId: {},
      };
    }

    const localResult = persistLocal ? await this.writeLocalNames(safeMap, { source }) : { ok: true, skipped: true };
    const ingestResult = ingest
      ? await this.ingestDisplayNamesToAggregator(safeMap, { source, observedAt })
      : { ok: true, skipped: true };

    return {
      ok: Boolean(localResult?.ok !== false && ingestResult?.ok !== false),
      namesByAccountId: safeMap,
      local: localResult,
      ingest: ingestResult,
    };
  }

  async resolveAccountIds(
    accountIds = [],
    { reason = "shared-resolution", front = true, external = true, queueUnresolved = true } = {}
  ) {
    const normalizedAccountIds = uniqueAccountIds(accountIds);
    if (!normalizedAccountIds.length) {
      return {
        ok: true,
        namesByAccountId: {},
        missingAccountIds: [],
        resolved: 0,
      };
    }

    const namesByAccountId = {};
    const externallyResolvedNamesByAccountId = {};
    const unresolved = [];

    for (const accountId of normalizedAccountIds) {
      const cached = this.getCachedDisplayName(accountId);
      if (cached) {
        namesByAccountId[accountId] = cached;
      } else {
        unresolved.push(accountId);
      }
    }

    const localNamesByAccountId = await this.readLocalNames(unresolved);
    for (const [accountId, displayName] of Object.entries(localNamesByAccountId)) {
      const validated = validateSharedDisplayName(displayName, { accountId });
      if (!validated.ok) continue;
      namesByAccountId[accountId] = validated.displayName;
      this.cacheDisplayName(accountId, validated.displayName);
    }

    const unresolvedAfterLocal = unresolved.filter((accountId) => !namesByAccountId[accountId]);
    if (!external) {
      if (queueUnresolved && unresolvedAfterLocal.length) {
        await this.enqueuePriorityLookups(unresolvedAfterLocal, { front }).catch(() => {});
      }
      return {
        ok: true,
        namesByAccountId,
        missingAccountIds: unresolvedAfterLocal,
        resolved: Object.keys(namesByAccountId).length,
      };
    }

    let unresolvedAfterAggregator = unresolvedAfterLocal;
    if (unresolvedAfterLocal.length && this.aggregatorClient?.isConfigured?.()) {
      const aggregatorResult = await this.getDisplayNamesFromAggregator(unresolvedAfterLocal);
      if (!aggregatorResult?.ok && aggregatorResult?.error) {
        this.logger.warn(`[shared-displayname-directory] aggregator lookup warning: ${aggregatorResult.error}`);
      }
      for (const [accountId, displayName] of Object.entries(aggregatorResult?.namesByAccountId || {})) {
        const validated = validateSharedDisplayName(displayName, { accountId });
        if (!validated.ok) continue;
        namesByAccountId[accountId] = validated.displayName;
        externallyResolvedNamesByAccountId[accountId] = validated.displayName;
        this.cacheDisplayName(accountId, validated.displayName);
      }
      unresolvedAfterAggregator = unresolvedAfterLocal.filter((accountId) => !namesByAccountId[accountId]);
    }

    for (const accountId of unresolvedAfterAggregator) {
      const validated = validateSharedDisplayName(resolveKnownDisplayName(accountId), { accountId });
      if (!validated.ok) continue;
      namesByAccountId[accountId] = validated.displayName;
      externallyResolvedNamesByAccountId[accountId] = validated.displayName;
      this.cacheDisplayName(accountId, validated.displayName);
    }

    let unresolvedAfterKnown = unresolvedAfterAggregator.filter((accountId) => !namesByAccountId[accountId]);

    if (
      unresolvedAfterKnown.length &&
      this.trackerDisplaynameClient?.isConfigured?.() &&
      typeof this.trackerDisplaynameClient.resolveAccountIds === "function"
    ) {
      const relayResult = await this.resolveViaTrackerDisplayname(unresolvedAfterKnown, {
        reason,
        front,
      });
      if (!relayResult?.ok && relayResult?.error) {
        this.logger.warn(`[shared-displayname-directory] tracker-displayname resolve warning: ${relayResult.error}`);
      }
      for (const [accountId, displayName] of Object.entries(relayResult?.namesByAccountId || {})) {
        const validated = validateSharedDisplayName(displayName, { accountId });
        if (!validated.ok) continue;
        namesByAccountId[accountId] = validated.displayName;
        externallyResolvedNamesByAccountId[accountId] = validated.displayName;
        this.cacheDisplayName(accountId, validated.displayName);
      }
      unresolvedAfterKnown = unresolvedAfterKnown.filter((accountId) => !namesByAccountId[accountId]);
    }

    if (Object.keys(externallyResolvedNamesByAccountId).length) {
      await this.observeNames(externallyResolvedNamesByAccountId, {
        source: reason || this.sourceLabel,
      });
    }

    if (queueUnresolved && unresolvedAfterKnown.length) {
      await this.enqueuePriorityLookups(unresolvedAfterKnown, { front }).catch(() => {});
    }

    return {
      ok: true,
      namesByAccountId,
      missingAccountIds: unresolvedAfterKnown,
      resolved: Object.keys(namesByAccountId).length,
    };
  }
}

export { DisplayNameDirectory, uniqueAccountIds };
