import { clampInt } from "../../../../../shared/valueUtils.js";

function trackerEnabled(key, statusPayload) {
  if (!statusPayload || typeof statusPayload !== "object") return false;
  return key === "wr" || key === "leaderboard"
    ? Boolean(statusPayload?.runtime?.enabled)
    : Boolean(statusPayload.enabled);
}

function buildTrackedSnapshot(entry, defaults) {
  const runtime = entry?.status?.runtime || {};
  return {
    configured: Boolean(entry?.configured),
    enabled: Boolean(entry?.ok && trackerEnabled(defaults.key, entry.status)),
    tickSeconds: clampInt(runtime.tickSeconds, { min: 3, max: 3600, fallback: 20 }),
    batchSize: clampInt(runtime.batchSize, { min: 1, max: 1000, fallback: 6 }),
    maxCheckIntervalSeconds: clampInt(runtime.maxCheckIntervalSeconds, {
      min: 0,
      max: 31_536_000,
      fallback: 0,
    }),
    leaderboardTopN: clampInt(runtime.leaderboardTopN, {
      min: 1,
      max: 1000,
      fallback: defaults.leaderboardTopN,
    }),
  };
}

function buildDisplayNameSnapshot(entry) {
  const status = entry?.status || {};
  return {
    configured: Boolean(entry?.configured),
    enabled: Boolean(entry?.ok && trackerEnabled("displayname", status)),
    schedulerEnabled: Boolean(status.schedulerEnabled),
    maintenanceIntervalSeconds: clampInt(status.maintenanceIntervalSeconds, {
      min: 3,
      max: 3600,
      fallback: 60,
    }),
    staleAfterSeconds: clampInt(status.staleAfterSeconds, { min: 0, max: 31_536_000, fallback: 86400 }),
    batchSize: clampInt(status.batchSize, { min: 1, max: 50, fallback: 50 }),
    maxAccountsPerCycle: clampInt(status.maxAccountsPerCycle, { min: 1, max: 5000, fallback: 200 }),
    minRequestGapMs: clampInt(status.minRequestGapMs, { min: 0, max: 120000, fallback: 5000 }),
  };
}

function buildPrioritySnapshot(statusResults = {}) {
  return {
    wr: buildTrackedSnapshot(statusResults.wr, { key: "wr", leaderboardTopN: 1 }),
    leaderboard: buildTrackedSnapshot(statusResults.leaderboard, {
      key: "leaderboard",
      leaderboardTopN: 100,
    }),
    displayname: buildDisplayNameSnapshot(statusResults.displayname),
    club: {
      configured: Boolean(statusResults?.club?.configured),
      enabled: Boolean(statusResults?.club?.ok && trackerEnabled("club", statusResults.club.status)),
    },
  };
}

function trackerRestorePayload(key, snapshot) {
  if (key === "wr" || key === "leaderboard") {
    return {
      enabled: Boolean(snapshot.enabled),
      tickSeconds: clampInt(snapshot.tickSeconds, { min: 3, max: 3600, fallback: 20 }),
      batchSize: clampInt(snapshot.batchSize, { min: 1, max: 1000, fallback: 6 }),
      maxCheckIntervalSeconds: clampInt(snapshot.maxCheckIntervalSeconds, {
        min: 0,
        max: 31_536_000,
        fallback: 0,
      }),
      leaderboardTopN: clampInt(snapshot.leaderboardTopN, {
        min: 1,
        max: 1000,
        fallback: key === "wr" ? 1 : 100,
      }),
    };
  }
  if (key === "displayname") {
    return {
      enabled: Boolean(snapshot.enabled),
      schedulerEnabled: Boolean(snapshot.schedulerEnabled),
      maintenanceIntervalSeconds: clampInt(snapshot.maintenanceIntervalSeconds, {
        min: 3,
        max: 3600,
        fallback: 60,
      }),
      staleAfterSeconds: clampInt(snapshot.staleAfterSeconds, {
        min: 0,
        max: 31_536_000,
        fallback: 86400,
      }),
      batchSize: clampInt(snapshot.batchSize, { min: 1, max: 50, fallback: 50 }),
      maxAccountsPerCycle: clampInt(snapshot.maxAccountsPerCycle, { min: 1, max: 5000, fallback: 200 }),
      minRequestGapMs: clampInt(snapshot.minRequestGapMs, { min: 0, max: 120000, fallback: 5000 }),
    };
  }
  return { enabled: Boolean(snapshot.enabled) };
}

async function restorePrioritySnapshot({ trackers, sendControlRequest }, snapshot = null) {
  const safeSnapshot = snapshot && typeof snapshot === "object" ? snapshot : null;
  if (!safeSnapshot) return { ok: false, error: "No saved tracker snapshot available." };

  const errors = [];
  for (const key of ["wr", "leaderboard", "displayname", "club"]) {
    if (!safeSnapshot[key]?.configured) continue;
    try {
      await sendControlRequest(trackers[key], "set", trackerRestorePayload(key, safeSnapshot[key]));
    } catch (error) {
      errors.push(`${key}: ${error?.message || error}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export { buildPrioritySnapshot, restorePrioritySnapshot };
