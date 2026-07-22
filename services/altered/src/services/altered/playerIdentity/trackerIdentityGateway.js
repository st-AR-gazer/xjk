import { normalizeAccountId, sanitizeResolvedDisplayName, asArray, uniqueBy } from "../serviceSupport.js";

function shouldUseDisplaynameRelay() {
  return Boolean(
    this.trackerIntegrations.displaynameEnabled &&
      this.trackerIntegrations.displaynameRelayAvailable &&
      this.trackerDisplaynameClient?.isConfigured?.()
  );
}

function shouldUseClubRelay() {
  return Boolean(
    this.trackerIntegrations.clubEnabled &&
      this.trackerIntegrations.clubRelayAvailable &&
      this.trackerClubClient?.isConfigured?.()
  );
}

async function relayClubSnapshotToTrackerClub(snapshot = {}) {
  if (!this.shouldUseClubRelay()) {
    return {
      relayed: false,
      reason: "tracker-club relay disabled or not configured",
    };
  }

  const relay = await this.trackerClubClient.ingestSnapshot(snapshot);
  if (!relay?.ok) {
    const message = relay?.error || "Tracker-club snapshot ingest failed.";
    this.trackerIntegrations.lastClubRelayError = message;
    if (/not configured|disabled/i.test(message)) {
      this.trackerIntegrations.clubRelayAvailable = false;
    }
    return {
      relayed: false,
      error: message,
    };
  }

  const data = relay.data || {};
  const nowIso = new Date().toISOString();
  this.trackerIntegrations.lastClubRelay = {
    at: nowIso,
    ...data,
  };
  this.trackerIntegrations.clubRelayAvailable = true;
  this.trackerIntegrations.lastClubRelayError = null;
  return {
    relayed: true,
    at: nowIso,
    ...data,
  };
}

async function getDisplayNamesFromAggregator(accountIds = []) {
  if (!this.aggregatorClient?.isConfigured?.()) {
    return {
      ok: false,
      error: "Aggregator client is not configured.",
      namesByAccountId: {},
    };
  }

  const normalizedAccountIds = uniqueBy(
    asArray(accountIds)
      .map((accountId) => normalizeAccountId(accountId))
      .filter(Boolean),
    (accountId) => accountId
  );
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

  const rows = asArray(result?.data?.names);
  const namesByAccountId = {};
  for (const row of rows) {
    const accountId = normalizeAccountId(row?.accountId);
    const displayName = sanitizeResolvedDisplayName(row?.displayName, { accountId });
    if (!accountId || !displayName) continue;
    namesByAccountId[accountId] = displayName;
  }

  return {
    ok: true,
    namesByAccountId,
    resolved: Object.keys(namesByAccountId).length,
  };
}

async function ingestDisplayNamesToAggregator(namesByAccountId = {}, { source = "mapper-sync" } = {}) {
  if (!this.aggregatorClient?.isConfigured?.()) {
    return {
      ok: false,
      skipped: true,
      error: "Aggregator client is not configured.",
    };
  }

  const safeMap = namesByAccountId && typeof namesByAccountId === "object" ? namesByAccountId : {};
  const payloadMap = {};
  for (const [rawAccountId, rawDisplayName] of Object.entries(safeMap)) {
    const accountId = normalizeAccountId(rawAccountId);
    const displayName = String(rawDisplayName || "").trim();
    if (!accountId || !displayName) continue;
    if (normalizeAccountId(displayName) === accountId) continue;
    payloadMap[accountId] = displayName;
  }

  if (!Object.keys(payloadMap).length) {
    return {
      ok: true,
      skipped: true,
      accepted: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
    };
  }

  const ingest = await this.aggregatorClient.ingestDisplayNames(payloadMap, {
    source,
    projectKey: "altered-mapper-displayname",
    projectName: "Altered Mapper Displayname",
    observedAt: new Date().toISOString(),
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

async function runTrackerDisplaynameSync({ accountIds = [], reason = "altered-sync", forceCandidates = false } = {}) {
  if (!this.shouldUseDisplaynameRelay()) {
    return {
      ok: false,
      error: "tracker-displayname relay disabled or not configured",
    };
  }

  const normalizedAccountIds = uniqueBy(
    asArray(accountIds)
      .map((accountId) => normalizeAccountId(accountId))
      .filter(Boolean),
    (accountId) => accountId
  );

  const run = await this.trackerDisplaynameClient.runSync({
    accountIds: normalizedAccountIds,
    forceCandidates: Boolean(forceCandidates),
    prioritizeAccountIds: true,
  });
  if (!run?.ok) {
    const message = run?.error || "Tracker-displayname sync failed.";
    this.trackerIntegrations.lastDisplaynameRelayError = message;
    if (/not configured|disabled/i.test(message)) {
      this.trackerIntegrations.displaynameRelayAvailable = false;
    }
    return {
      ok: false,
      error: message,
    };
  }

  const runNamesByAccountId =
    run?.data?.namesByAccountId && typeof run.data.namesByAccountId === "object" ? run.data.namesByAccountId : {};
  const namesResult = Object.keys(runNamesByAccountId).length
    ? {
        ok: true,
        namesByAccountId: runNamesByAccountId,
        resolved: Object.keys(runNamesByAccountId).length,
      }
    : await this.getDisplayNamesFromAggregator(normalizedAccountIds);
  if (!namesResult?.ok) {
    const message = namesResult?.error || "Tracker-displayname sync completed but names could not be read.";
    this.trackerIntegrations.lastDisplaynameRelayError = message;
    return {
      ok: false,
      error: message,
    };
  }

  const data = run.data || {};
  const nowIso = new Date().toISOString();
  this.trackerIntegrations.lastDisplaynameRelay = {
    at: nowIso,
    reason,
    requested: Number(data.requested || normalizedAccountIds.length),
    resolved: Number(data.resolved || namesResult.resolved || 0),
    accepted: Number(data.accepted || 0),
    inserted: Number(data.inserted || 0),
    updated: Number(data.updated || 0),
    unchanged: Number(data.unchanged || 0),
    queueRemaining: Number(data.queueRemaining || 0),
  };
  this.trackerIntegrations.displaynameRelayAvailable = true;
  this.trackerIntegrations.lastDisplaynameRelayError = null;

  return {
    ok: true,
    summary: this.trackerIntegrations.lastDisplaynameRelay,
    namesByAccountId: namesResult.namesByAccountId,
  };
}

export {
  shouldUseDisplaynameRelay,
  shouldUseClubRelay,
  relayClubSnapshotToTrackerClub,
  getDisplayNamesFromAggregator,
  ingestDisplayNamesToAggregator,
  runTrackerDisplaynameSync,
};
