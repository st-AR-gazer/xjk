import {
  createAction,
  deriveJobState,
  normalizeIso,
  summarizeDiscovery,
  summarizeDisplayname,
  summarizeHookRun,
  summarizeTrackerRun,
} from "./routeUtils.js";

function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function buildFullSyncJob({ hook, liveStatus, monitor }) {
  const lastFinishedAt = monitor.lastFinishedAt || hook?.latestRun?.finishedAt;
  return {
    jobKey: "club-full-sync",
    label: "Club Full Sync",
    state: deriveJobState({
      configured: Boolean(liveStatus?.configured),
      enabled: Boolean(monitor.enabled),
      running: Boolean(monitor.running),
      error: monitor.lastError,
      successAt: monitor.lastFinishedAt,
    }),
    configured: Boolean(liveStatus?.configured),
    enabled: Boolean(monitor.enabled),
    lastStartedAt: normalizeIso(monitor.lastStartedAt || hook?.latestRun?.startedAt),
    lastFinishedAt: normalizeIso(lastFinishedAt),
    lastSuccessAt: monitor.lastError ? null : normalizeIso(lastFinishedAt),
    lastFailureAt: monitor.lastError ? normalizeIso(monitor.lastFinishedAt || monitor.lastStartedAt) : null,
    nextRunAt: normalizeIso(monitor.nextRunAt),
    durationMs: finiteNumber(monitor.lastDurationMs),
    summaryLine: monitor.lastSummary
      ? summarizeHookRun(hook?.latestRun || monitor.lastSummary)
      : summarizeHookRun(hook?.latestRun),
    errorLine: monitor.lastError || null,
    actions: [
      createAction("run-full-sync", "Run Full Sync", "main"),
      createAction("view-history", "View History", "lite"),
    ],
  };
}

function buildDiscoverySyncJob({ liveStatus, monitor }) {
  return {
    jobKey: "club-discovery-sync",
    label: "Discovery Sync",
    state: deriveJobState({
      configured: Boolean(liveStatus?.configured),
      enabled: Boolean(monitor.discoveryEnabled),
      running: Boolean(monitor.discoveryRunning),
      error: monitor.lastDiscoveryError,
      successAt: monitor.lastDiscoveryFinishedAt,
    }),
    configured: Boolean(liveStatus?.configured),
    enabled: Boolean(monitor.discoveryEnabled),
    lastStartedAt: normalizeIso(monitor.lastDiscoveryStartedAt),
    lastFinishedAt: normalizeIso(monitor.lastDiscoveryFinishedAt),
    lastSuccessAt: monitor.lastDiscoveryError ? null : normalizeIso(monitor.lastDiscoveryFinishedAt),
    lastFailureAt: monitor.lastDiscoveryError
      ? normalizeIso(monitor.lastDiscoveryFinishedAt || monitor.lastDiscoveryStartedAt)
      : null,
    nextRunAt: normalizeIso(monitor.nextDiscoveryRunAt),
    durationMs: finiteNumber(monitor.lastDiscoveryDurationMs),
    summaryLine: summarizeDiscovery(monitor),
    errorLine: monitor.lastDiscoveryError || null,
    actions: [
      createAction("run-discovery-sync", "Run Discovery", "main"),
      createAction("view-history", "View History", "lite"),
    ],
  };
}

function buildTrackerJob({ trackerStatus, trackerRuns }) {
  const runtime = trackerStatus?.runtime || {};
  const latestRun = trackerStatus?.latestRun || trackerRuns[0] || null;
  return {
    jobKey: "tracker-run",
    label: "Tracker Push",
    state: deriveJobState({
      configured: !trackerStatus?.error,
      enabled: runtime.enabled !== false,
      running: false,
      error: trackerStatus?.error || null,
      successAt: latestRun?.finishedAt || trackerStatus?.latestRun?.finishedAt || null,
    }),
    configured: !trackerStatus?.error,
    enabled: runtime.enabled !== false,
    lastStartedAt: normalizeIso(latestRun?.startedAt || null),
    lastFinishedAt: normalizeIso(latestRun?.finishedAt || null),
    lastSuccessAt: trackerStatus?.error ? null : normalizeIso(latestRun?.finishedAt || null),
    lastFailureAt: trackerStatus?.error ? normalizeIso(latestRun?.finishedAt || null) : null,
    nextRunAt: normalizeIso(runtime?.nextRunAt || null),
    durationMs: finiteNumber(latestRun?.durationMs),
    summaryLine: summarizeTrackerRun(trackerStatus, trackerRuns),
    errorLine: trackerStatus?.error || null,
    actions: [
      createAction("run-tracker-now", "Run Tracker", "main"),
      createAction("view-history", "View History", "lite"),
    ],
  };
}

function buildDisplayNameSyncJob({ liveStatus, mapperNameSync }) {
  return {
    jobKey: "displayname-sync",
    label: "Display Name Sync",
    state: deriveJobState({
      configured: Boolean(liveStatus?.configured),
      enabled: Boolean(mapperNameSync.enabled),
      running: Boolean(mapperNameSync.running),
      error: mapperNameSync.lastError,
      successAt: mapperNameSync.lastFinishedAt,
    }),
    configured: Boolean(liveStatus?.configured),
    enabled: Boolean(mapperNameSync.enabled),
    lastStartedAt: normalizeIso(mapperNameSync.lastStartedAt),
    lastFinishedAt: normalizeIso(mapperNameSync.lastFinishedAt),
    lastSuccessAt: mapperNameSync.lastError ? null : normalizeIso(mapperNameSync.lastFinishedAt),
    lastFailureAt: mapperNameSync.lastError
      ? normalizeIso(mapperNameSync.lastFinishedAt || mapperNameSync.lastStartedAt)
      : null,
    nextRunAt: normalizeIso(mapperNameSync.nextRunAt),
    durationMs: null,
    summaryLine: summarizeDisplayname(mapperNameSync),
    errorLine: mapperNameSync.lastError || null,
    actions: [
      createAction("run-displayname-cached", "Run Cached", "main"),
      createAction("run-displayname-force", "Run Force", "lite"),
      createAction("run-displayname-priority", "Run Priority", "lite"),
      createAction("run-displayname-targeted", "Sync Specific IDs", "warn"),
      createAction("view-history", "View History", "lite"),
    ],
  };
}

function buildOpsSchedulerJob(opsOverview) {
  const scheduler = opsOverview?.scheduler || {};
  return {
    jobKey: "ops-scheduler",
    label: "Ops Scheduler",
    state: deriveJobState({
      configured: true,
      enabled: Boolean(scheduler.enabled),
      running: Boolean(scheduler.running),
      error: scheduler.lastError,
      successAt: scheduler.lastFinishedAt,
    }),
    configured: true,
    enabled: Boolean(scheduler.enabled),
    lastStartedAt: normalizeIso(scheduler.lastStartedAt),
    lastFinishedAt: normalizeIso(scheduler.lastFinishedAt),
    lastSuccessAt: scheduler.lastError ? null : normalizeIso(scheduler.lastFinishedAt),
    lastFailureAt: scheduler.lastError ? normalizeIso(scheduler.lastFinishedAt || scheduler.lastStartedAt) : null,
    nextRunAt: null,
    durationMs: null,
    summaryLine: scheduler.lastSummary
      ? `${Number(scheduler.lastSummary.mapsChecked || 0)} maps checked | ${Number(scheduler.lastSummary.mapsChanged || 0)} changed`
      : "No ops scheduler run has completed yet.",
    errorLine: scheduler.lastError || null,
    actions: [
      createAction("run-ops-scheduler", "Run Due Checks", "lite"),
      createAction("view-history", "View History", "lite"),
    ],
  };
}

function buildLocalStoreJob(localStore) {
  const job = localStore?.job || {};
  return {
    jobKey: "map-local-copy-backfill",
    label: "Map Local Copy Backfill",
    state: deriveJobState({
      configured: true,
      enabled: Boolean(localStore?.enabled),
      running: Boolean(job.running),
      error: job.lastError || null,
      successAt: job.lastFinishedAt || null,
    }),
    configured: true,
    enabled: Boolean(localStore?.enabled),
    lastStartedAt: normalizeIso(job.lastStartedAt),
    lastFinishedAt: normalizeIso(job.lastFinishedAt),
    lastSuccessAt: job.lastError ? null : normalizeIso(job.lastFinishedAt),
    lastFailureAt: job.lastError ? normalizeIso(job.lastFinishedAt || job.lastStartedAt) : null,
    nextRunAt: null,
    durationMs: finiteNumber(job.lastDurationMs),
    summaryLine: localStore?.summary
      ? `${Number(localStore.summary.downloadedCount || 0)}/${Number(localStore.summary.totalMaps || 0)} local files | ${Number(localStore.summary.signatureReadyCount || 0)} signatures`
      : "Local map copy store has not been initialized yet.",
    errorLine: job.lastError || null,
    actions: [
      createAction("run-map-local-copy-backfill", "Run Full Backfill", "main"),
      createAction("retry-map-local-copy-errors", "Retry Errors", "lite"),
    ],
  };
}

function buildOverviewJobs(input) {
  const liveStatus = input.liveStatus;
  const monitor = liveStatus?.monitor || {};
  const mapperNameSync = liveStatus?.mapperNameSync || {};
  return [
    buildFullSyncJob({ hook: input.hook, liveStatus, monitor }),
    buildDiscoverySyncJob({ liveStatus, monitor }),
    buildTrackerJob({ trackerStatus: input.trackerStatus, trackerRuns: input.trackerRuns }),
    buildDisplayNameSyncJob({ liveStatus, mapperNameSync }),
    buildOpsSchedulerJob(input.opsOverview),
    buildLocalStoreJob(input.localStore),
  ];
}

export {
  buildDiscoverySyncJob,
  buildDisplayNameSyncJob,
  buildFullSyncJob,
  buildLocalStoreJob,
  buildOpsSchedulerJob,
  buildOverviewJobs,
  buildTrackerJob,
};
