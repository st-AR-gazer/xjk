import express from "express";

function parseOptionalBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return undefined;
  const raw = String(value).trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return undefined;
}

function parseAccountIds(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[\s,;]+/)
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }
  return [];
}

function parseIntegerValues(value) {
  const rawValues = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,;]+/) : [];
  return rawValues
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.floor(item));
}

function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function toText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function resolveNamingSimilarityClubId({
  requestedMapUids = [],
  requestedClubId = undefined,
  query = "",
  sourceKey = "",
  service,
} = {}) {
  if (requestedMapUids.length || toText(query)) return requestedClubId;
  if (requestedClubId !== undefined) return requestedClubId;

  const normalizedSourceKey = toText(sourceKey).toLowerCase();
  if (!normalizedSourceKey) {
    return null;
  }

  return service.getPrimaryProjectClubId();
}

function normalizeIso(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function tableExists(db, tableName) {
  if (!db || !tableName) return false;
  try {
    return Boolean(
      db
        .prepare(
          `
          SELECT 1
          FROM sqlite_master
          WHERE type = 'table' AND name = ?
          LIMIT 1
          `
        )
        .get(String(tableName))
    );
  } catch {
    return false;
  }
}

function buildCompatibilityReport(service) {
  const db = service?.repository?.db || null;
  const requiredTables = {
    altered_map_content_signatures: tableExists(db, "altered_map_content_signatures"),
    altered_map_number_similarity: tableExists(db, "altered_map_number_similarity"),
  };
  const requiredRoutes = {
    namingSimilarityBackfill: true,
    namingSimilarityBackfillStart: true,
    namingSimilarityBackfillStatus: true,
    namingSimilarityBackfillCancel: true,
    namingCandidateDetail: true,
    namingSimilaritySelection: true,
  };
  const notes = [];
  for (const [tableName, exists] of Object.entries(requiredTables)) {
    if (!exists) notes.push(`Missing DB table: ${tableName}`);
  }
  return {
    manifestVersion: "2026-03-16-gbx-layout",
    ok: notes.length === 0,
    requiredTables,
    requiredRoutes,
    notes,
  };
}

function resolveCursorOffset(cursor, fallback = 0) {
  if (cursor === undefined || cursor === null || cursor === "") return fallback;
  return clampInt(cursor, { min: 0, max: 2000000, fallback });
}

function createAction(key, label, tone = "lite") {
  return { key, label, tone };
}

function deriveJobState({ configured = true, enabled = true, running = false, error = null, successAt = null } = {}) {
  if (!configured) return "blocked";
  if (error) return "failed";
  if (running) return "running";
  if (!enabled) return "warning";
  if (successAt) return "success";
  return "idle";
}

function buildEvent({
  id,
  kind,
  title,
  subtitle = "",
  createdAt = null,
  mapUid = null,
  jobKey = null,
  status = "info",
  summary = "",
  detail = null,
  meta = {},
} = {}) {
  return {
    id: toText(id) || `${kind}:${title}:${createdAt || "na"}`,
    kind,
    title,
    subtitle,
    createdAt: normalizeIso(createdAt),
    mapUid: toText(mapUid) || null,
    jobKey: toText(jobKey) || null,
    status,
    summary,
    detail: detail ? String(detail) : null,
    meta: meta && typeof meta === "object" ? meta : {},
  };
}

function sortEvents(items = []) {
  return [...items].sort((a, b) => {
    const left = Date.parse(a?.createdAt || "") || 0;
    const right = Date.parse(b?.createdAt || "") || 0;
    return right - left;
  });
}

function summarizeHookRun(run) {
  if (!run) return "No full sync has completed yet.";
  return `${Number(run.campaignsSeen || 0)} campaigns | ${Number(run.mapsSeen || 0)} maps | +${Number(run.mapsInserted || 0)} inserted | ~${Number(run.mapsUpdated || 0)} updated`;
}

function summarizeDiscovery(monitor = {}) {
  const summary = monitor.lastDiscoverySummary || null;
  if (!summary) return "No discovery sync has completed yet.";
  return `${Number(summary.newCampaignsStored || 0)} new campaigns | ${Number(summary.uploadBucketsSeen || 0)} upload buckets`;
}

function summarizeTrackerRun(trackerStatus = {}, trackerRuns = []) {
  const latest = trackerStatus?.latestRun || trackerRuns[0] || null;
  if (!latest) return "No tracker run has completed yet.";
  return `${Number(latest.mapsChecked || 0)} maps checked | ${Number(latest.wrChanges || 0)} WR changes`;
}

function summarizeDisplayname(mapperNameSync = {}) {
  const summary = mapperNameSync.lastSummary || null;
  if (!summary) return "No display-name sync has completed yet.";
  if (summary.error) return summary.error;
  return `${Number(summary.batchSize || 0)} accounts processed | ${Number(summary.resolved || 0)} resolved | ${Number(summary.accepted || 0)} accepted`;
}

function buildJobHistoryItem({
  id,
  state,
  startedAt = null,
  finishedAt = null,
  durationMs = null,
  summary = "",
  detail = null,
  meta = {},
} = {}) {
  return {
    id: toText(id) || `history:${state}:${finishedAt || startedAt || "na"}`,
    state,
    startedAt: normalizeIso(startedAt),
    finishedAt: normalizeIso(finishedAt),
    durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : null,
    summary,
    detail,
    meta,
  };
}

function buildJobsOverviewPayload({ hook, liveStatus, trackerStatus, trackerRuns, opsOverview, localStore }) {
  const monitor = liveStatus?.monitor || {};
  const mapperNameSync = liveStatus?.mapperNameSync || {};
  const trackerRuntime = trackerStatus?.runtime || {};
  const trackerLatestRun = trackerStatus?.latestRun || trackerRuns[0] || null;

  const fullSync = {
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
    lastFinishedAt: normalizeIso(monitor.lastFinishedAt || hook?.latestRun?.finishedAt),
    lastSuccessAt: monitor.lastError ? null : normalizeIso(monitor.lastFinishedAt || hook?.latestRun?.finishedAt),
    lastFailureAt: monitor.lastError ? normalizeIso(monitor.lastFinishedAt || monitor.lastStartedAt) : null,
    nextRunAt: normalizeIso(monitor.nextRunAt),
    durationMs: Number.isFinite(Number(monitor.lastDurationMs)) ? Number(monitor.lastDurationMs) : null,
    summaryLine: monitor.lastSummary ? summarizeHookRun(hook?.latestRun || monitor.lastSummary) : summarizeHookRun(hook?.latestRun),
    errorLine: monitor.lastError || null,
    actions: [
      createAction("run-full-sync", "Run Full Sync", "main"),
      createAction("view-history", "View History", "lite"),
    ],
  };

  const discoverySync = {
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
    lastFailureAt: monitor.lastDiscoveryError ? normalizeIso(monitor.lastDiscoveryFinishedAt || monitor.lastDiscoveryStartedAt) : null,
    nextRunAt: normalizeIso(monitor.nextDiscoveryRunAt),
    durationMs: Number.isFinite(Number(monitor.lastDiscoveryDurationMs)) ? Number(monitor.lastDiscoveryDurationMs) : null,
    summaryLine: summarizeDiscovery(monitor),
    errorLine: monitor.lastDiscoveryError || null,
    actions: [
      createAction("run-discovery-sync", "Run Discovery", "main"),
      createAction("view-history", "View History", "lite"),
    ],
  };

  const trackerRun = {
    jobKey: "tracker-run",
    label: "Tracker Push",
    state: deriveJobState({
      configured: !trackerStatus?.error,
      enabled: trackerRuntime.enabled !== false,
      running: false,
      error: trackerStatus?.error || null,
      successAt: trackerLatestRun?.finishedAt || trackerStatus?.latestRun?.finishedAt || null,
    }),
    configured: !trackerStatus?.error,
    enabled: trackerRuntime.enabled !== false,
    lastStartedAt: normalizeIso(trackerLatestRun?.startedAt || null),
    lastFinishedAt: normalizeIso(trackerLatestRun?.finishedAt || null),
    lastSuccessAt: trackerStatus?.error ? null : normalizeIso(trackerLatestRun?.finishedAt || null),
    lastFailureAt: trackerStatus?.error ? normalizeIso(trackerLatestRun?.finishedAt || null) : null,
    nextRunAt: normalizeIso(trackerRuntime?.nextRunAt || null),
    durationMs: Number.isFinite(Number(trackerLatestRun?.durationMs)) ? Number(trackerLatestRun.durationMs) : null,
    summaryLine: summarizeTrackerRun(trackerStatus, trackerRuns),
    errorLine: trackerStatus?.error || null,
    actions: [
      createAction("run-tracker-now", "Run Tracker", "main"),
      createAction("view-history", "View History", "lite"),
    ],
  };

  const displaynameSync = {
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
    lastFailureAt: mapperNameSync.lastError ? normalizeIso(mapperNameSync.lastFinishedAt || mapperNameSync.lastStartedAt) : null,
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

  const scheduler = opsOverview?.scheduler || {};
  const opsScheduler = {
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

  const localStoreJob = {
    jobKey: "map-local-copy-backfill",
    label: "Map Local Copy Backfill",
    state: deriveJobState({
      configured: true,
      enabled: Boolean(localStore?.enabled),
      running: Boolean(localStore?.job?.running),
      error: localStore?.job?.lastError || null,
      successAt: localStore?.job?.lastFinishedAt || null,
    }),
    configured: true,
    enabled: Boolean(localStore?.enabled),
    lastStartedAt: normalizeIso(localStore?.job?.lastStartedAt),
    lastFinishedAt: normalizeIso(localStore?.job?.lastFinishedAt),
    lastSuccessAt: localStore?.job?.lastError ? null : normalizeIso(localStore?.job?.lastFinishedAt),
    lastFailureAt: localStore?.job?.lastError ? normalizeIso(localStore?.job?.lastFinishedAt || localStore?.job?.lastStartedAt) : null,
    nextRunAt: null,
    durationMs: Number.isFinite(Number(localStore?.job?.lastDurationMs)) ? Number(localStore.job.lastDurationMs) : null,
    summaryLine: localStore?.summary
      ? `${Number(localStore.summary.downloadedCount || 0)}/${Number(localStore.summary.totalMaps || 0)} local files | ${Number(localStore.summary.signatureReadyCount || 0)} signatures`
      : "Local map copy store has not been initialized yet.",
    errorLine: localStore?.job?.lastError || null,
    actions: [
      createAction("run-map-local-copy-backfill", "Run Full Backfill", "main"),
      createAction("retry-map-local-copy-errors", "Retry Errors", "lite"),
    ],
  };

  return {
    generatedAt: new Date().toISOString(),
    jobs: [fullSync, discoverySync, trackerRun, displaynameSync, opsScheduler, localStoreJob],
  };
}

function buildJobHistoryPayload({ jobKey, liveStatus, hookRuns, trackerRuns, opsOverview, opsRuns }) {
  const monitor = liveStatus?.monitor || {};
  const mapperNameSync = liveStatus?.mapperNameSync || {};
  if (jobKey === "club-full-sync") {
    return {
      label: "Club Full Sync",
      items: (Array.isArray(hookRuns) ? hookRuns : []).map((run) =>
        buildJobHistoryItem({
          id: `full:${run.runId}`,
          state: String(run.status || "ok").toLowerCase() === "error" ? "failed" : "success",
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          summary: summarizeHookRun(run),
          detail: toText(run.note) || null,
          meta: {
            campaignsSeen: Number(run.campaignsSeen || 0),
            mapsSeen: Number(run.mapsSeen || 0),
            mapsInserted: Number(run.mapsInserted || 0),
            mapsUpdated: Number(run.mapsUpdated || 0),
            mapsLinked: Number(run.mapsLinked || 0),
          },
        })
      ),
    };
  }
  if (jobKey === "club-discovery-sync") {
    const items = [];
    if (monitor.lastDiscoverySummary || monitor.lastDiscoveryError) {
      items.push(
        buildJobHistoryItem({
          id: `discovery:${monitor.lastDiscoveryFinishedAt || monitor.lastDiscoveryStartedAt || "latest"}`,
          state: monitor.lastDiscoveryError ? "failed" : monitor.discoveryRunning ? "running" : "success",
          startedAt: monitor.lastDiscoveryStartedAt,
          finishedAt: monitor.lastDiscoveryFinishedAt,
          durationMs: monitor.lastDiscoveryDurationMs,
          summary: summarizeDiscovery(monitor),
          detail: monitor.lastDiscoveryError || null,
          meta: monitor.lastDiscoverySummary || {},
        })
      );
    }
    return {
      label: "Discovery Sync",
      items,
    };
  }
  if (jobKey === "tracker-run") {
    return {
      label: "Tracker Push",
      items: (Array.isArray(trackerRuns) ? trackerRuns : []).map((run, index) =>
        buildJobHistoryItem({
          id: `tracker:${run.runId || index + 1}`,
          state: "success",
          finishedAt: run.finishedAt,
          summary: `${Number(run.mapsChecked || 0)} maps checked | ${Number(run.wrChanges || 0)} WR changes`,
          detail: toText(run.reason) || null,
          meta: {
            mapsChecked: Number(run.mapsChecked || 0),
            wrChanges: Number(run.wrChanges || 0),
          },
        })
      ),
    };
  }
  if (jobKey === "displayname-sync") {
    const items = [];
    if (mapperNameSync.lastSummary || mapperNameSync.lastError) {
      const summary = mapperNameSync.lastSummary || {};
      items.push(
        buildJobHistoryItem({
          id: `displayname:${mapperNameSync.lastFinishedAt || mapperNameSync.lastStartedAt || "latest"}`,
          state: mapperNameSync.lastError ? "failed" : mapperNameSync.running ? "running" : "success",
          startedAt: mapperNameSync.lastStartedAt,
          finishedAt: mapperNameSync.lastFinishedAt,
          summary: summarizeDisplayname(mapperNameSync),
          detail: mapperNameSync.lastError || null,
          meta: summary,
        })
      );
    }
    return {
      label: "Display Name Sync",
      items,
    };
  }
  const scheduler = opsOverview?.scheduler || {};
  const items = (Array.isArray(opsRuns) ? opsRuns : []).map((run) =>
    buildJobHistoryItem({
      id: `ops:${run.runId || run.finishedAt || run.startedAt || "latest"}`,
      state: String(run.status || "").toLowerCase() === "ok" ? "success" : "failed",
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      summary: `${Number(run.mapsChecked || run.mapsTotal || 0)} maps checked | ${Number(run.mapsChanged || 0)} changed`,
      detail: toText(run.note) || null,
      meta: {
        runId: Number(run.runId || 0) || null,
        scheduleId: Number(run.scheduleId || 0) || null,
        userId: Number(run.userId || 0) || null,
      },
    })
  );
  if (!items.length && (scheduler.lastSummary || scheduler.lastError)) {
    items.push(
      buildJobHistoryItem({
        id: `ops:${scheduler.lastFinishedAt || scheduler.lastStartedAt || "latest"}`,
        state: scheduler.lastError ? "failed" : scheduler.running ? "running" : "success",
        startedAt: scheduler.lastStartedAt,
        finishedAt: scheduler.lastFinishedAt,
        summary: scheduler.lastSummary
          ? `${Number(scheduler.lastSummary.mapsChecked || 0)} maps checked | ${Number(scheduler.lastSummary.mapsChanged || 0)} changed`
          : "No ops scheduler summary available.",
        detail: scheduler.lastError || null,
        meta: scheduler.lastSummary || {},
      })
    );
  }
  return {
    label: "Ops Scheduler",
    items,
  };
}

function buildAlerts({ liveStatus, hook, trackerStatus, namingSummary, updateRequests, opsOverview, opsEvents }) {
  const alerts = [];
  const monitor = liveStatus?.monitor || {};
  const mapperNameSync = liveStatus?.mapperNameSync || {};
  const integrations = liveStatus?.integrations || {};
  const counts = opsOverview?.counts || {};
  const pendingNaming = Number(namingSummary?.pendingManualReview || namingSummary?.pending || 0);
  const queuedRequests = (Array.isArray(updateRequests) ? updateRequests : []).filter(
    (request) => String(request?.status || "").toLowerCase() === "queued"
  ).length;
  const pollErrors = (Array.isArray(opsEvents) ? opsEvents : []).filter((event) => event?.error).length;

  if (!liveStatus?.configured) {
    alerts.push({
      id: "live-auth-missing",
      level: "error",
      title: "Live auth is missing",
      body: liveStatus?.authAdvice || "Configure Altered live auth before running club syncs.",
      source: "club monitor",
      createdAt: new Date().toISOString(),
      actionLabel: "Open Settings",
      actionTarget: "#settings",
    });
  }
  if (!hook?.enabled) {
    alerts.push({
      id: "hook-disabled",
      level: "warn",
      title: "Hook is disabled",
      body: "Tracker hook sync is disabled for altered-club.",
      source: "hook",
      createdAt: new Date().toISOString(),
      actionLabel: "Open Settings",
      actionTarget: "#settings",
    });
  }
  if (monitor.lastError) {
    alerts.push({
      id: "full-sync-error",
      level: "error",
      title: "Last full sync failed",
      body: monitor.lastError,
      source: "club full sync",
      createdAt: normalizeIso(monitor.lastFinishedAt || monitor.lastStartedAt) || new Date().toISOString(),
      actionLabel: "Open Sync Center",
      actionTarget: "#sync",
    });
  }
  if (monitor.lastDiscoveryError) {
    alerts.push({
      id: "discovery-error",
      level: "warn",
      title: "Last discovery sync failed",
      body: monitor.lastDiscoveryError,
      source: "discovery sync",
      createdAt: normalizeIso(monitor.lastDiscoveryFinishedAt || monitor.lastDiscoveryStartedAt) || new Date().toISOString(),
      actionLabel: "Open Sync Center",
      actionTarget: "#sync",
    });
  }
  if (mapperNameSync.lastError) {
    alerts.push({
      id: "displayname-error",
      level: "warn",
      title: "Display-name sync needs attention",
      body: mapperNameSync.lastError,
      source: "displayname sync",
      createdAt: normalizeIso(mapperNameSync.lastFinishedAt || mapperNameSync.lastStartedAt) || new Date().toISOString(),
      actionLabel: "Open Sync Center",
      actionTarget: "#sync",
    });
  }
  if (integrations?.trackerDisplayname?.enabled && !integrations?.trackerDisplayname?.relayAvailable) {
    alerts.push({
      id: "displayname-relay-unavailable",
      level: "warn",
      title: "Displayname relay is unavailable",
      body: integrations?.trackerDisplayname?.lastRelayError || "Tracker displayname relay is not currently available.",
      source: "integration",
      createdAt: new Date().toISOString(),
      actionLabel: "Open Advanced",
      actionTarget: "#advanced",
    });
  }
  if (trackerStatus?.error) {
    alerts.push({
      id: "tracker-status-error",
      level: "warn",
      title: "Tracker status is unavailable",
      body: trackerStatus.error,
      source: "tracker",
      createdAt: new Date().toISOString(),
      actionLabel: "Open Sync Center",
      actionTarget: "#sync",
    });
  }
  if (opsOverview?.scheduler?.lastError) {
    alerts.push({
      id: "ops-scheduler-error",
      level: "error",
      title: "Ops scheduler failed recently",
      body: opsOverview.scheduler.lastError,
      source: "ops scheduler",
      createdAt: normalizeIso(opsOverview.scheduler.lastFinishedAt || opsOverview.scheduler.lastStartedAt) || new Date().toISOString(),
      actionLabel: "Open Settings",
      actionTarget: "#settings",
    });
  }
  if (pendingNaming > 0) {
    alerts.push({
      id: "naming-backlog",
      level: "info",
      title: "Naming review backlog",
      body: `${pendingNaming} map names still need manual review.`,
      source: "naming review",
      createdAt: new Date().toISOString(),
      actionLabel: "Open Maps",
      actionTarget: "#maps?view=naming",
    });
  }
  if (queuedRequests > 0) {
    alerts.push({
      id: "update-requests",
      level: "info",
      title: "Pending update requests",
      body: `${queuedRequests} update requests are still queued.`,
      source: "update requests",
      createdAt: new Date().toISOString(),
      actionLabel: "Open Maps",
      actionTarget: "#maps?view=requests",
    });
  }
  if (pollErrors > 0 || Number(counts.queuedBotCommands || 0) > 0) {
    alerts.push({
      id: "ops-backlog",
      level: pollErrors > 0 ? "warn" : "info",
      title: "Operational backlog detected",
      body: `${pollErrors} recent poll errors | ${Number(counts.queuedBotCommands || 0)} queued bot commands`,
      source: "ops",
      createdAt: new Date().toISOString(),
      actionLabel: "Open Operations",
      actionTarget: "#operations",
    });
  }

  return alerts;
}

function buildRecentEvents({ hookRuns, opsRuns, opsEvents, trackerRuns, liveStatus }) {
  const monitor = liveStatus?.monitor || {};
  const mapperNameSync = liveStatus?.mapperNameSync || {};
  const events = [];

  (Array.isArray(hookRuns) ? hookRuns.slice(0, 4) : []).forEach((run) => {
    events.push(
      buildEvent({
        id: `hook-run:${run.runId}`,
        kind: "job",
        title: "Club full sync completed",
        subtitle: "Altered club snapshot",
        createdAt: run.finishedAt || run.startedAt,
        jobKey: "club-full-sync",
        status: String(run.status || "").toLowerCase() === "error" ? "error" : "success",
        summary: summarizeHookRun(run),
        detail: toText(run.note) || null,
        meta: {
          runId: Number(run.runId || 0),
          campaignsSeen: Number(run.campaignsSeen || 0),
          mapsSeen: Number(run.mapsSeen || 0),
        },
      })
    );
  });

  (Array.isArray(opsRuns) ? opsRuns.slice(0, 4) : []).forEach((run) => {
    events.push(
      buildEvent({
        id: `ops-run:${run.runId}`,
        kind: "poll-run",
        title: "Ops poll run completed",
        subtitle: `Schedule ${run.scheduleId || "-"}`,
        createdAt: run.finishedAt || run.startedAt,
        jobKey: "ops-scheduler",
        status: String(run.status || "").toLowerCase() === "ok" ? "success" : "warn",
        summary: `${Number(run.mapsChecked || run.mapsTotal || 0)} maps checked | ${Number(run.mapsChanged || 0)} changed`,
        detail: toText(run.note) || null,
        meta: {
          runId: Number(run.runId || 0),
          scheduleId: Number(run.scheduleId || 0) || null,
          userId: Number(run.userId || 0) || null,
        },
      })
    );
  });

  (Array.isArray(opsEvents) ? opsEvents.slice(0, 6) : []).forEach((event) => {
    const hasError = Boolean(event?.error);
    const changed = Boolean(event?.changed || event?.wrChanged);
    events.push(
      buildEvent({
        id: `ops-event:${event.eventId || event.runId || event.mapUid || Math.random()}`,
        kind: hasError ? "error" : changed ? "wr-change" : "scheduler",
        title: hasError ? "Map check failed" : changed ? "WR changed" : "Map checked",
        subtitle: toText(event.mapName || event.mapUid) || "Unknown map",
        createdAt: event.checkedAt || event.createdAt,
        mapUid: event.mapUid,
        status: hasError ? "error" : changed ? "success" : "info",
        summary: hasError
          ? toText(event.error)
          : changed
            ? `${Number(event.oldWrMs || 0)} -> ${Number(event.newWrMs || 0)}`
            : "No WR change recorded",
        detail: hasError ? toText(event.error) : null,
        meta: {
          runId: Number(event.runId || 0) || null,
          scheduleId: Number(event.scheduleId || 0) || null,
          userId: Number(event.userId || 0) || null,
        },
      })
    );
  });

  (Array.isArray(trackerRuns) ? trackerRuns.slice(0, 2) : []).forEach((run, index) => {
    events.push(
      buildEvent({
        id: `tracker-run:${run.runId || index + 1}`,
        kind: "job",
        title: "Tracker push completed",
        subtitle: "WR tracker",
        createdAt: run.finishedAt,
        jobKey: "tracker-run",
        status: "success",
        summary: `${Number(run.mapsChecked || 0)} maps checked | ${Number(run.wrChanges || 0)} WR changes`,
        detail: toText(run.reason) || null,
        meta: {
          runId: Number(run.runId || 0) || null,
        },
      })
    );
  });

  if (monitor.lastDiscoverySummary || monitor.lastDiscoveryError) {
    events.push(
      buildEvent({
        id: `discovery:${monitor.lastDiscoveryFinishedAt || monitor.lastDiscoveryStartedAt || "latest"}`,
        kind: "job",
        title: monitor.lastDiscoveryError ? "Discovery sync failed" : "Discovery sync completed",
        subtitle: "Altered club discovery",
        createdAt: monitor.lastDiscoveryFinishedAt || monitor.lastDiscoveryStartedAt,
        jobKey: "club-discovery-sync",
        status: monitor.lastDiscoveryError ? "warn" : "success",
        summary: summarizeDiscovery(monitor),
        detail: monitor.lastDiscoveryError || null,
      })
    );
  }

  if (mapperNameSync.lastSummary || mapperNameSync.lastError) {
    events.push(
      buildEvent({
        id: `displayname:${mapperNameSync.lastFinishedAt || mapperNameSync.lastStartedAt || "latest"}`,
        kind: "job",
        title: mapperNameSync.lastError ? "Display-name sync failed" : "Display-name sync completed",
        subtitle: "Mapper account resolver",
        createdAt: mapperNameSync.lastFinishedAt || mapperNameSync.lastStartedAt,
        jobKey: "displayname-sync",
        status: mapperNameSync.lastError ? "warn" : "success",
        summary: summarizeDisplayname(mapperNameSync),
        detail: mapperNameSync.lastError || null,
      })
    );
  }

  return sortEvents(events).slice(0, 14);
}

async function loadAdminContext(service, opsService) {
  const ADMIN_TRACKER_LOAD_TIMEOUT_MS = 1200;
  const liveStatus = service.getLiveMonitorStatus();
  const hook = service.getHookStatus();
  const hookRuns = service.getHookRuns(12);
  const projectClubs = service.getProjectClubs({ includeDisabled: true });
  const projectSources =
    typeof service.getProjectSources === "function"
      ? service.getProjectSources({ includeDisabled: true })
      : [];
  const publicApiUsage =
    typeof service.getPublicApiUsageSummary === "function"
      ? service.getPublicApiUsageSummary({
          days: 30,
          recentLimit: 12,
          topLimit: 8,
          originsLimit: 6,
        })
      : null;
  const naming = service.getMapNameStandardizationCandidates({ limit: 1 });
  const unmatchedNaming = service.getMapNameStandardizationCandidates({
    automationState: "unmatched",
    reviewState: "pending",
    limit: 12,
  });
  const localStore = typeof service.getMapLocalStoreStatus === "function"
    ? service.getMapLocalStoreStatus()
    : null;
  const updates = service.listUpdateRequests({ limit: 5000, offset: 0 });
  const opsOverview = opsService?.getOverview ? opsService.getOverview() : null;
  const opsRuns = opsService?.listPollRuns ? opsService.listPollRuns({ limit: 40 }) : [];
  const opsEvents = opsService?.listPollEvents ? opsService.listPollEvents({ limit: 120 }) : [];

  const [trackerStatus, trackerRunsResult, stats] = await Promise.all([
    service
      .getTrackerStatus({ timeoutMs: ADMIN_TRACKER_LOAD_TIMEOUT_MS })
      .catch((error) => ({ error: error?.message || "Tracker status unavailable." })),
    service
      .getTrackerRunHistory(40, { timeoutMs: ADMIN_TRACKER_LOAD_TIMEOUT_MS })
      .catch((error) => ({ ok: false, runs: [], error: error?.message || "Tracker runs unavailable." })),
    service.getAlterationsStats().catch(() => ({
      total_maps: 0,
      actively_tracked: 0,
      total_wr_changes: 0,
      last_run_at: null,
    })),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    liveStatus,
    hook,
    hookRuns,
    projectClubs,
    projectSources,
    publicApiUsage,
    localStore,
    namingSummary: naming?.summary || {
      total: 0,
      matched: 0,
      unmatched: 0,
      pending: 0,
      pendingManualReview: 0,
      pendingMatched: 0,
      approved: 0,
      ignored: 0,
      requiresRegex: 0,
      manualNamed: 0,
    },
    unmatchedNamingPreview: Array.isArray(unmatchedNaming?.candidates)
      ? unmatchedNaming.candidates
      : [],
    updateRequests: Array.isArray(updates?.requests) ? updates.requests : [],
    opsOverview,
    opsRuns: Array.isArray(opsRuns) ? opsRuns : [],
    opsEvents: Array.isArray(opsEvents) ? opsEvents : [],
    trackerStatus: trackerStatus || { error: "Tracker status unavailable." },
    trackerRuns: trackerRunsResult?.ok ? trackerRunsResult.runs : [],
    trackerRunsError: trackerRunsResult?.ok ? null : trackerRunsResult?.error || null,
    stats,
  };
}

const ADMIN_CONTEXT_CACHE_TTL_MS = 2500;
const ADMIN_CONTEXT_STALE_WAIT_MS = 900;
let adminContextCache = {
  value: null,
  refreshedAtMs: 0,
  refreshing: null,
  lastError: null,
};

function buildFallbackAdminContext(service, opsService, errorMessage = "") {
  return {
    generatedAt: new Date().toISOString(),
    liveStatus:
      typeof service.getLiveMonitorStatus === "function"
        ? service.getLiveMonitorStatus()
        : {
            monitor: {},
            integrations: {},
            mapperNameSync: {},
          },
    hook:
      typeof service.getHookStatus === "function"
        ? service.getHookStatus()
        : {
            latestRun: null,
            mapCount: 0,
            trackedCount: 0,
          },
    hookRuns: typeof service.getHookRuns === "function" ? service.getHookRuns(12) : [],
    projectClubs:
      typeof service.getProjectClubs === "function"
        ? service.getProjectClubs({ includeDisabled: true })
        : [],
    projectSources:
      typeof service.getProjectSources === "function"
        ? service.getProjectSources({ includeDisabled: true })
        : [],
    publicApiUsage: null,
    localStore:
      typeof service.getMapLocalStoreStatus === "function"
        ? service.getMapLocalStoreStatus()
        : null,
    namingSummary: {
      total: 0,
      matched: 0,
      unmatched: 0,
      pending: 0,
      pendingManualReview: 0,
      pendingMatched: 0,
      approved: 0,
      ignored: 0,
      requiresRegex: 0,
      manualNamed: 0,
    },
    unmatchedNamingPreview: [],
    updateRequests: [],
    opsOverview: opsService?.getOverview ? opsService.getOverview() : null,
    opsRuns: [],
    opsEvents: [],
    trackerStatus: { error: errorMessage || "Tracker status unavailable." },
    trackerRuns: [],
    trackerRunsError: errorMessage || null,
    stats: {
      total_maps: 0,
      actively_tracked: 0,
      total_wr_changes: 0,
      last_run_at: null,
    },
  };
}

function waitWithTimeout(promise, timeoutMs) {
  const safeMs = Math.max(0, Number(timeoutMs) || 0);
  if (!safeMs) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), safeMs).unref?.();
    }),
  ]);
}

async function getAdminContextCached(service, opsService) {
  const nowMs = Date.now();
  const cached = adminContextCache.value;
  if (cached && nowMs - adminContextCache.refreshedAtMs <= ADMIN_CONTEXT_CACHE_TTL_MS) {
    return cached;
  }

  if (!adminContextCache.refreshing) {
    adminContextCache.refreshing = (async () => {
      try {
        const fresh = await loadAdminContext(service, opsService);
        adminContextCache.value = fresh;
        adminContextCache.refreshedAtMs = Date.now();
        adminContextCache.lastError = null;
        return fresh;
      } catch (error) {
        adminContextCache.lastError = error?.message || String(error || "Failed loading admin context.");
        throw error;
      } finally {
        adminContextCache.refreshing = null;
      }
    })();
  }

  try {
    if (!cached) {
      return await adminContextCache.refreshing;
    }
    return await waitWithTimeout(adminContextCache.refreshing, ADMIN_CONTEXT_STALE_WAIT_MS);
  } catch (error) {
    if (adminContextCache.value) return adminContextCache.value;
    return buildFallbackAdminContext(
      service,
      opsService,
      adminContextCache.lastError || error?.message || "Admin context is unavailable."
    );
  }
}

function createAdminRoutes(service, { resolveLiveAuthContext = null, opsService = null } = {}) {
  const router = express.Router();

  async function getLiveAuthContext(req) {
    if (typeof resolveLiveAuthContext !== "function") return null;
    const resolved = await resolveLiveAuthContext(req);
    return resolved || null;
  }

  router.get("/command-center", async (_req, res) => {
    const context = await getAdminContextCached(service, opsService);
    const jobsPayload = buildJobsOverviewPayload({
      hook: context.hook,
      liveStatus: context.liveStatus,
      trackerStatus: context.trackerStatus,
      trackerRuns: context.trackerRuns,
      opsOverview: context.opsOverview,
      localStore: context.localStore,
    });
    const alerts = buildAlerts({
      liveStatus: context.liveStatus,
      hook: context.hook,
      trackerStatus: context.trackerStatus,
      namingSummary: context.namingSummary,
      updateRequests: context.updateRequests,
      opsOverview: context.opsOverview,
      opsEvents: context.opsEvents,
    });
    const counts = context.opsOverview?.counts || {};
    const recentEvents = buildRecentEvents({
      hookRuns: context.hookRuns,
      opsRuns: context.opsRuns,
      opsEvents: context.opsEvents,
      trackerRuns: context.trackerRuns,
      liveStatus: context.liveStatus,
    });
    const healthState =
      alerts.some((item) => item.level === "error")
        ? "blocked"
        : alerts.some((item) => item.level === "warn")
          ? "degraded"
          : "healthy";
    const healthSummary =
      healthState === "blocked"
        ? alerts.find((item) => item.level === "error")?.title || "One or more critical blockers are active."
        : healthState === "degraded"
          ? alerts.find((item) => item.level === "warn")?.title || "Some systems need attention."
          : "All critical admin workflows are currently healthy.";

    return res.json({
      generatedAt: context.generatedAt,
      compatibility: buildCompatibilityReport(service),
      health: {
        state: healthState,
        summary: healthSummary,
      },
      counters: {
        maps: Number(context.stats?.total_maps || context.hook?.mapCount || 0),
        trackedMaps: Number(context.stats?.actively_tracked || context.hook?.trackedCount || 0),
        campaigns: Number(context.hook?.latestRun?.campaignsSeen || 0),
        namingPending: Number(context.namingSummary?.pendingManualReview || context.namingSummary?.pending || 0),
        namingUnmatched: Number(context.namingSummary?.unmatched || 0),
        localDownloaded: Number(context.localStore?.summary?.downloadedCount || 0),
        localMissing: Number(context.localStore?.summary?.missingCount || 0),
        queuedUpdateRequests: context.updateRequests.filter((request) => String(request?.status || "").toLowerCase() === "queued").length,
        opsPollErrors: context.opsEvents.filter((event) => event?.error).length,
        dueSchedules: Number(counts.dueSchedules || 0),
        queuedCommands: Number(counts.queuedBotCommands || 0),
        apiRequests24h: Number(context.publicApiUsage?.totals?.requests24h || 0),
        apiRequests7d: Number(context.publicApiUsage?.totals?.requests7d || 0),
      },
      naming: {
        summary: context.namingSummary,
        unmatchedPreview: context.unmatchedNamingPreview,
      },
      projectClubs: context.projectClubs,
      projectSources: context.projectSources,
      localStore: context.localStore,
      jobs: jobsPayload.jobs,
      alerts,
      recentEvents: recentEvents.slice(0, 8),
    });
  });

  router.get("/jobs/overview", async (_req, res) => {
    const context = await getAdminContextCached(service, opsService);
    const payload = buildJobsOverviewPayload({
      hook: context.hook,
      liveStatus: context.liveStatus,
      trackerStatus: context.trackerStatus,
      trackerRuns: context.trackerRuns,
      opsOverview: context.opsOverview,
      localStore: context.localStore,
    });
    return res.json({
      ...payload,
      projectClubs: context.projectClubs,
      projectSources: context.projectSources,
    });
  });

  function buildOperationsFeedPayload({
    context,
    kind = "all",
    mapUid = "",
    jobKey = "",
    cursor = 0,
    limit = 50,
  }) {
    const monitor = context.liveStatus?.monitor || {};
    const mapperNameSync = context.liveStatus?.mapperNameSync || {};
    const events = [];

    (Array.isArray(context.hookRuns) ? context.hookRuns : []).forEach((run) => {
      events.push(
        buildEvent({
          id: `hook-run:${run.runId}`,
          kind: "job",
          title: String(run.status || "").toLowerCase() === "error" ? "Club full sync failed" : "Club full sync completed",
          subtitle: "Altered club snapshot",
          createdAt: run.finishedAt || run.startedAt,
          jobKey: "club-full-sync",
          status: String(run.status || "").toLowerCase() === "error" ? "error" : "success",
          summary: summarizeHookRun(run),
          detail: toText(run.note) || null,
          meta: {
            runId: Number(run.runId || 0) || null,
            campaignsSeen: Number(run.campaignsSeen || 0),
            mapsSeen: Number(run.mapsSeen || 0),
            mapsInserted: Number(run.mapsInserted || 0),
            mapsUpdated: Number(run.mapsUpdated || 0),
          },
        })
      );
    });

    (Array.isArray(context.opsRuns) ? context.opsRuns : []).forEach((run) => {
      events.push(
        buildEvent({
          id: `ops-run:${run.runId || run.finishedAt || run.startedAt || "latest"}`,
          kind: "poll-run",
          title: String(run.status || "").toLowerCase() === "ok" ? "Ops poll run completed" : "Ops poll run failed",
          subtitle: `Schedule ${run.scheduleId || "-"}`,
          createdAt: run.finishedAt || run.startedAt,
          jobKey: "ops-scheduler",
          status: String(run.status || "").toLowerCase() === "ok" ? "success" : "error",
          summary: `${Number(run.mapsChecked || run.mapsTotal || 0)} maps checked | ${Number(run.mapsChanged || 0)} changed`,
          detail: toText(run.note) || null,
          meta: {
            runId: Number(run.runId || 0) || null,
            scheduleId: Number(run.scheduleId || 0) || null,
            userId: Number(run.userId || 0) || null,
          },
        })
      );
    });

    (Array.isArray(context.opsEvents) ? context.opsEvents : []).forEach((event) => {
      const hasError = Boolean(event?.error);
      const changed = Boolean(event?.changed || event?.wrChanged);
      events.push(
        buildEvent({
          id: `ops-event:${event.eventId || event.runId || event.mapUid || Math.random()}`,
          kind: hasError ? "error" : changed ? "wr-change" : "scheduler",
          title: hasError ? "Map check failed" : changed ? "WR changed" : "Map checked",
          subtitle: toText(event.mapName || event.mapUid) || "Unknown map",
          createdAt: event.checkedAt || event.createdAt,
          mapUid: event.mapUid,
          jobKey: "ops-scheduler",
          status: hasError ? "error" : changed ? "success" : "info",
          summary: hasError
            ? toText(event.error)
            : changed
              ? `${Number(event.oldWrMs || 0)} -> ${Number(event.newWrMs || 0)}`
              : "No WR change recorded",
          detail: hasError ? toText(event.error) : null,
          meta: {
            runId: Number(event.runId || 0) || null,
            scheduleId: Number(event.scheduleId || 0) || null,
            userId: Number(event.userId || 0) || null,
            oldWrHolder: toText(event.oldWrHolder) || null,
            newWrHolder: toText(event.newWrHolder) || null,
          },
        })
      );
    });

    (Array.isArray(context.trackerRuns) ? context.trackerRuns : []).forEach((run, index) => {
      events.push(
        buildEvent({
          id: `tracker-run:${run.runId || index + 1}`,
          kind: "job",
          title: "Tracker push completed",
          subtitle: "WR tracker",
          createdAt: run.finishedAt || run.startedAt,
          jobKey: "tracker-run",
          status: "success",
          summary: `${Number(run.mapsChecked || 0)} maps checked | ${Number(run.wrChanges || 0)} WR changes`,
          detail: toText(run.reason) || null,
          meta: {
            runId: Number(run.runId || 0) || null,
          },
        })
      );
    });

    if (monitor.lastDiscoverySummary || monitor.lastDiscoveryError) {
      events.push(
        buildEvent({
          id: `discovery:${monitor.lastDiscoveryFinishedAt || monitor.lastDiscoveryStartedAt || "latest"}`,
          kind: "job",
          title: monitor.lastDiscoveryError ? "Discovery sync failed" : "Discovery sync completed",
          subtitle: "Altered club discovery",
          createdAt: monitor.lastDiscoveryFinishedAt || monitor.lastDiscoveryStartedAt,
          jobKey: "club-discovery-sync",
          status: monitor.lastDiscoveryError ? "warn" : "success",
          summary: summarizeDiscovery(monitor),
          detail: monitor.lastDiscoveryError || null,
        })
      );
    }

    if (mapperNameSync.lastSummary || mapperNameSync.lastError) {
      events.push(
        buildEvent({
          id: `displayname:${mapperNameSync.lastFinishedAt || mapperNameSync.lastStartedAt || "latest"}`,
          kind: "job",
          title: mapperNameSync.lastError ? "Display-name sync failed" : "Display-name sync completed",
          subtitle: "Mapper account resolver",
          createdAt: mapperNameSync.lastFinishedAt || mapperNameSync.lastStartedAt,
          jobKey: "displayname-sync",
          status: mapperNameSync.lastError ? "warn" : "success",
          summary: summarizeDisplayname(mapperNameSync),
          detail: mapperNameSync.lastError || null,
        })
      );
    }

    const safeMapUid = toText(mapUid).toLowerCase();
    const safeJobKey = toText(jobKey).toLowerCase();
    const safeKind = toText(kind, "all").toLowerCase();
    const filtered = sortEvents(events).filter((event) => {
      if (safeMapUid) {
        const candidate = toText(event.mapUid).toLowerCase();
        if (!candidate || candidate !== safeMapUid) return false;
      }
      if (safeJobKey) {
        const candidate = toText(event.jobKey).toLowerCase();
        if (!candidate || candidate !== safeJobKey) return false;
      }
      if (safeKind === "all" || !safeKind) return true;
      if (safeKind === "error") return event.kind === "error" || event.status === "error";
      if (safeKind === "scheduler") return event.kind === "scheduler" || event.jobKey === "ops-scheduler";
      return event.kind === safeKind;
    });
    const pageItems = filtered.slice(cursor, cursor + limit);
    const hasMore = cursor + pageItems.length < filtered.length;
    return {
      generatedAt: context.generatedAt,
      kind: safeKind || "all",
      mapUid: safeMapUid || null,
      jobKey: safeJobKey || null,
      total: filtered.length,
      cursor,
      limit,
      hasMore,
      nextCursor: hasMore ? cursor + pageItems.length : null,
      events: pageItems,
    };
  }

  router.get("/jobs/:jobKey/history", async (req, res) => {
    const safeJobKey = toText(req.params.jobKey).toLowerCase();
    const validJobKeys = new Set([
      "club-full-sync",
      "club-discovery-sync",
      "tracker-run",
      "displayname-sync",
      "ops-scheduler",
    ]);
    if (!validJobKeys.has(safeJobKey)) {
      return res.status(404).json({ error: "Unknown job key." });
    }
    const context = await getAdminContextCached(service, opsService);
    const payload = buildJobHistoryPayload({
      jobKey: safeJobKey,
      liveStatus: context.liveStatus,
      hookRuns: context.hookRuns,
      trackerRuns: context.trackerRuns,
      opsOverview: context.opsOverview,
      opsRuns: context.opsRuns,
    });
    const cursor = resolveCursorOffset(req.query.cursor, 0);
    const limit = clampInt(req.query.limit, { min: 1, max: 100, fallback: 20 });
    const items = (Array.isArray(payload.items) ? payload.items : []).slice(cursor, cursor + limit);
    const hasMore = cursor + items.length < Number(payload.items?.length || 0);
    return res.json({
      generatedAt: context.generatedAt,
      jobKey: safeJobKey,
      label: payload.label,
      cursor,
      limit,
      total: Number(payload.items?.length || 0),
      hasMore,
      nextCursor: hasMore ? cursor + items.length : null,
      items,
    });
  });

  router.get("/maps/workspace", (req, res) => {
    const query = req.query || {};
    const view = toText(query.view, "inventory").toLowerCase();
    const page = clampInt(query.page, { min: 1, max: 50000, fallback: 1 });
    const minPageSize = view === "naming" ? 5 : 10;
    const fallbackPageSize = view === "naming" ? 5 : 50;
    const pageSize = clampInt(query.pageSize, {
      min: minPageSize,
      max: 200,
      fallback: fallbackPageSize,
    });
    const offset = (page - 1) * pageSize;

    if (view === "inventory") {
      const tracked = parseOptionalBoolean(query.tracked);
      const result = service.getAdminMapsWorkspace({
        q: query.q,
        campaign: query.campaign,
        tracked,
        status: query.status,
        staleState: query.staleState,
        page,
        pageSize,
      });
      const campaignPayload = service.getAlterationsCampaigns({ limit: 5000, offset: 0 });
      const opsMaps = opsService?.listMonitoredMaps
        ? opsService.listMonitoredMaps({ limit: 5000 })
        : [];
      const opsMapByUid = new Map();
      (Array.isArray(opsMaps) ? opsMaps : []).forEach((item) => {
        const key = toText(item?.mapUid);
        if (!key || opsMapByUid.has(key)) return;
        opsMapByUid.set(key, item);
      });
      const rows = (Array.isArray(result.maps) ? result.maps : []).map((map) => {
        const checkedAtMs = Date.parse(map.lastCheckedAt || "");
        const isFresh = Number.isFinite(checkedAtMs) && checkedAtMs > Date.now() - 24 * 60 * 60 * 1000;
        const opsMap = opsMapByUid.get(toText(map.uid)) || null;
        return {
          mapUid: toText(map.uid),
          mapName: toText(map.name) || toText(map.uid),
          campaignName: toText(map.campaign, "Unassigned") || "Unassigned",
          slot: Number(map.slot || 0) || null,
          tracked: Boolean(map.tracked),
          status: toText(map.status, "live") || "live",
          lastCheckedAt: normalizeIso(map.lastCheckedAt),
          lastWrChangeAt: normalizeIso(map.wrUpdatedAt),
          hookTracked: true,
          namingReviewState: null,
          updateRequestState: null,
          staleState: opsMap?.lastError ? "error" : map.lastCheckedAt ? (isFresh ? "fresh" : "stale") : "stale",
          detail: {
            ...map,
            opsMonitorUserId: Number(opsMap?.userId || 0) || null,
            opsMonitorUserEmail: toText(opsMap?.userEmail) || null,
            opsLastError: toText(opsMap?.lastError) || null,
          },
        };
      });
      return res.json({
        generatedAt: new Date().toISOString(),
        view,
        page,
        pageSize,
        total: Number(result.total || 0),
        pageCount: Number(result.pageCount || 1),
        hasMore: Boolean(result.hasMore),
        filters: {
          q: toText(query.q),
          campaign: toText(query.campaign),
          tracked,
          status: toText(query.status),
          staleState: toText(query.staleState),
        },
        filterOptions: {
          campaigns: Array.isArray(campaignPayload.campaigns) ? campaignPayload.campaigns : [],
        },
        rows,
      });
    }

    if (view === "campaigns") {
      const payload = service.getAlterationsCampaigns({ limit: 5000, offset: 0 });
      const rows = Array.isArray(payload.campaigns) ? payload.campaigns : [];
      const pageRows = rows.slice(offset, offset + pageSize);
      const hasMore = offset + pageRows.length < rows.length;
      return res.json({
        generatedAt: new Date().toISOString(),
        view,
        page,
        pageSize,
        total: rows.length,
        pageCount: Math.max(1, Math.ceil(rows.length / pageSize)),
        hasMore,
        rows: pageRows,
      });
    }

    if (view === "naming") {
      const requiresRegex = parseOptionalBoolean(query.requiresRegex);
      const payload = service.getMapNameStandardizationCandidates({
        q: query.q,
        automationState: query.automationState,
        reviewState: query.reviewState,
        requiresRegex:
          requiresRegex === undefined ? undefined : Boolean(requiresRegex),
        limit: pageSize,
        offset,
      });
      const unfilteredTotal = Number(payload.summary?.total || 0);
      const total = payload.filteredTotal !== undefined
        ? Number(payload.filteredTotal)
        : unfilteredTotal;
      return res.json({
        generatedAt: new Date().toISOString(),
        view,
        page,
        pageSize,
        total,
        unfilteredTotal,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
        hasMore: offset + Number(payload.candidates?.length || 0) < total,
        filters: {
          q: toText(query.q),
          automationState: toText(query.automationState),
          reviewState: toText(query.reviewState),
          requiresRegex,
        },
        summary: payload.summary,
        rows: Array.isArray(payload.candidates) ? payload.candidates : [],
      });
    }

    if (view === "requests") {
      const payload = service.listUpdateRequests({
        status: query.status,
        q: query.q,
        limit: 5000,
        offset: 0,
      });
      const rows = Array.isArray(payload.requests) ? payload.requests : [];
      const pageRows = rows.slice(offset, offset + pageSize);
      const hasMore = offset + pageRows.length < rows.length;
      return res.json({
        generatedAt: new Date().toISOString(),
        view,
        page,
        pageSize,
        total: rows.length,
        pageCount: Math.max(1, Math.ceil(rows.length / pageSize)),
        hasMore,
        filters: {
          q: toText(query.q),
          status: toText(query.status),
        },
        rows: pageRows,
      });
    }

    return res.status(400).json({ error: "Unsupported workspace view." });
  });

  router.get("/operations/feed", async (req, res) => {
    const context = await getAdminContextCached(service, opsService);
    const cursor = resolveCursorOffset(req.query.cursor, 0);
    const limit = clampInt(req.query.limit, { min: 1, max: 100, fallback: 40 });
    const payload = buildOperationsFeedPayload({
      context,
      kind: req.query.kind,
      mapUid: req.query.mapUid,
      jobKey: req.query.jobKey,
      cursor,
      limit,
    });
    return res.json(payload);
  });

  router.get("/settings/summary", async (req, res) => {
    const context = await getAdminContextCached(service, opsService);
    let liveApiContext = null;
    let liveApiError = null;
    try {
      liveApiContext = await getLiveAuthContext(req);
    } catch (error) {
      liveApiError = error?.message || "Live API auth context is unavailable.";
    }

    return res.json({
      generatedAt: context.generatedAt,
      hook: context.hook,
      projectClubs: context.projectClubs,
      projectSources: context.projectSources,
      liveMonitor: context.liveStatus?.monitor || {},
      liveIntegrations: context.liveStatus?.integrations || {},
      liveAuth: context.liveStatus?.auth || null,
      liveApiSession: {
        available: Boolean(liveApiContext),
        error: liveApiError,
      },
      mapperNameSync: context.liveStatus?.mapperNameSync || {},
      trackerStatus: context.trackerStatus,
      publicApi: context.publicApiUsage || {
        totals: {
          totalRequests: 0,
          requests24h: 0,
          requests7d: 0,
          requestsWindow: 0,
          successCount: 0,
          clientErrorCount: 0,
          serverErrorCount: 0,
          uniqueClientsWindow: 0,
        },
        endpoints: [],
        origins: [],
        timeline: [],
        recentRequests: [],
        catalog: {
          docsPath: "/api/",
          totalEndpoints: 0,
        },
      },
      ops: {
        counts: context.opsOverview?.counts || {},
        scheduler: context.opsOverview?.scheduler || {},
        bot: context.opsOverview?.bot || {},
      },
      localStore: context.localStore,
      namingSummary: context.namingSummary,
      updateRequestSummary: {
        total: context.updateRequests.length,
        queued: context.updateRequests.filter((item) => toText(item?.status).toLowerCase() === "queued").length,
        processing: context.updateRequests.filter((item) => toText(item?.status).toLowerCase() === "processing").length,
      },
    });
  });

  router.get("/public-api/summary", async (_req, res) => {
    const context = await getAdminContextCached(service, opsService);
    return res.json({
      generatedAt: context.generatedAt,
      usage: context.publicApiUsage || {
        totals: {
          totalRequests: 0,
          requests24h: 0,
          requests7d: 0,
          requestsWindow: 0,
          successCount: 0,
          clientErrorCount: 0,
          serverErrorCount: 0,
          uniqueClientsWindow: 0,
        },
        endpoints: [],
        origins: [],
        timeline: [],
        recentRequests: [],
        catalog: {
          docsPath: "/api/",
          totalEndpoints: 0,
        },
      },
      catalog:
        typeof service.getPublicApiCatalog === "function"
          ? service.getPublicApiCatalog()
          : {
              generatedAt: context.generatedAt,
              api: {
                name: "Altered Public API",
                version: "v1",
                docsPath: "/api/",
                totalEndpoints: 0,
              },
              endpoints: [],
            },
    });
  });

  router.get("/advanced/summary", async (_req, res) => {
    const context = await getAdminContextCached(service, opsService);
    const monitor = context.liveStatus?.monitor || {};
    const mapperNameSync = context.liveStatus?.mapperNameSync || {};
    return res.json({
      generatedAt: context.generatedAt,
      legacyMonitoringUrl: "/admin-monitoring.html",
      sections: {
        club: {
          available: true,
          state: !context.liveStatus?.configured ? "blocked" : monitor.enabled ? "online" : "paused",
          summary: summarizeHookRun(context.hook?.latestRun),
        },
        leaderboard: {
          available: true,
          state: context.trackerStatus?.error ? "degraded" : "online",
          summary: summarizeTrackerRun(context.trackerStatus, context.trackerRuns),
        },
        displayname: {
          available: true,
          state: mapperNameSync.lastError ? "degraded" : mapperNameSync.enabled ? "online" : "paused",
          summary: summarizeDisplayname(mapperNameSync),
        },
      },
      counters: {
        maps: Number(context.stats?.total_maps || 0),
        trackedMaps: Number(context.stats?.actively_tracked || 0),
        campaigns: Number(context.hook?.latestRun?.campaignsSeen || 0),
        totalWrChanges: Number(context.stats?.total_wr_changes || 0),
        opsPollErrors: context.opsEvents.filter((event) => event?.error).length,
      },
    });
  });

  router.post("/maps/:mapUid/campaign", async (req, res) => {
    const body = req.body || {};
    const result = await service.updateMapCampaign({
      mapUid: req.params.mapUid,
      campaignName: body.campaignName,
      slot: body.slot,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/maps/:mapUid/tracking", async (req, res) => {
    const body = req.body || {};
    const tracked = parseOptionalBoolean(body.tracked);
    const result = await service.updateMapTracking({
      mapUid: req.params.mapUid,
      tracked,
      status: body.status,
      checkFrequency: body.checkFrequency !== undefined ? Number(body.checkFrequency) : undefined,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/tracker/run-now", async (_req, res) => {
    const result = await service.runTrackerNow();
    if (result.error) return res.status(502).json(result);
    return res.json(result);
  });

  router.get("/maps/local-store/summary", (_req, res) => {
    return res.json(service.getMapLocalStoreStatus());
  });

  router.post("/maps/local-store/backfill", async (req, res) => {
    const body = req.body || {};
    const result = await service.runMapLocalCopyBackfill({
      reason: "manual-admin",
      force: Boolean(parseOptionalBoolean(body.force)),
      retryErrorsOnly: Boolean(parseOptionalBoolean(body.retryErrorsOnly)),
      mapUids: parseAccountIds(body.mapUids ?? body.map_uids ?? body.uids),
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/maps/local-store/retry-errors", async (_req, res) => {
    const result = await service.runMapLocalCopyBackfill({
      reason: "manual-admin-retry-errors",
      force: true,
      retryErrorsOnly: true,
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/hook/altered/config", (req, res) => {
    const body = req.body || {};
    const result = service.updateHookConfig({
      hookKey: body.hookKey,
      clubId: body.clubId,
      clubName: body.clubName,
      sourceLabel: body.sourceLabel,
      enabled: parseOptionalBoolean(body.enabled),
      autoTrackNewMaps: parseOptionalBoolean(body.autoTrackNewMaps),
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/hook/altered/sync", async (req, res) => {
    const body =
      req.body?.snapshot && typeof req.body.snapshot === "object" ? req.body.snapshot : req.body;
    const result = await service.syncHookSnapshot(body || {});
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/hook/altered/maps/:mapUid/tracking", async (req, res) => {
    const body = req.body || {};
    const tracked = parseOptionalBoolean(body.tracked);
    const result = await service.updateMapTracking({
      mapUid: req.params.mapUid,
      tracked,
      status: body.status,
      checkFrequency: body.checkFrequency !== undefined ? Number(body.checkFrequency) : undefined,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/hook/altered/live/status", (_req, res) => {
    return res.json(service.getLiveMonitorStatus());
  });

  router.post("/hook/altered/live/fetch", async (req, res) => {
    const body = req.body || {};
    const summaryOnly = parseOptionalBoolean(body.summaryOnly);
    let authContext = null;
    try {
      authContext = await getLiveAuthContext(req);
    } catch (error) {
      return res.status(Number(error?.statusCode || 401)).json({
        error: error?.message || "Failed to resolve Ubisoft auth context.",
      });
    }
    const result = await service.fetchLiveClubStructure({
      clubId: body.clubId,
      activityPageSize: body.activityPageSize ?? body.activityLength,
      activeOnly: parseOptionalBoolean(body.activeOnly),
      fetchMapDetails: parseOptionalBoolean(body.fetchMapDetails),
      summaryOnly: summaryOnly === undefined ? true : summaryOnly,
      authContext,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/hook/altered/live/sync", async (req, res) => {
    const body = req.body || {};
    let authContext = null;
    try {
      authContext = await getLiveAuthContext(req);
    } catch (error) {
      return res.status(Number(error?.statusCode || 401)).json({
        error: error?.message || "Failed to resolve Ubisoft auth context.",
      });
    }
    const result = await service.syncLiveClubSnapshot({
      hookKey: body.hookKey,
      clubId: body.clubId,
      activityPageSize: body.activityPageSize ?? body.activityLength,
      activeOnly: parseOptionalBoolean(body.activeOnly),
      fetchMapDetails: parseOptionalBoolean(body.fetchMapDetails),
      sourceLabel: body.sourceLabel,
      note: body.note,
      authContext,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/sources/:sourceKey/sync", async (req, res) => {
    const body = req.body || {};
    let authContext = null;
    try {
      authContext = await getLiveAuthContext(req);
    } catch (error) {
      return res.status(Number(error?.statusCode || 401)).json({
        error: error?.message || "Failed to resolve Ubisoft auth context.",
      });
    }
    const result = await service.syncProjectSourceByKey(req.params.sourceKey, {
      authContext,
      importLocalFiles:
        parseOptionalBoolean(body.importLocalFiles) === undefined
          ? true
          : Boolean(parseOptionalBoolean(body.importLocalFiles)),
      importRoots: Array.isArray(body.importRoots) ? body.importRoots : [],
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/hook/altered/live/monitor/config", (req, res) => {
    const body = req.body || {};
    const result = service.updateLiveMonitorConfig({
      enabled: parseOptionalBoolean(body.enabled),
      discoveryEnabled: parseOptionalBoolean(body.discoveryEnabled),
      scheduleMode: body.scheduleMode,
      dailyHourUtc: body.dailyHourUtc,
      dailyMinuteUtc: body.dailyMinuteUtc,
      clubId: body.clubId,
      intervalSeconds: body.intervalSeconds,
      discoveryIntervalSeconds: body.discoveryIntervalSeconds,
      discoveryCampaignLimit: body.discoveryCampaignLimit,
      discoveryActivityPageSize: body.discoveryActivityPageSize,
      activityPageSize: body.activityPageSize,
      activeOnly: parseOptionalBoolean(body.activeOnly),
      fetchMapDetails: parseOptionalBoolean(body.fetchMapDetails),
      trackerChunkSize: body.trackerChunkSize,
    });
    return res.json(result);
  });

  router.post("/hook/altered/live/monitor/run", async (req, res) => {
    let authContext = null;
    try {
      authContext = await getLiveAuthContext(req);
    } catch (error) {
      return res.status(Number(error?.statusCode || 401)).json({
        error: error?.message || "Failed to resolve Ubisoft auth context.",
      });
    }
    const result = await service.runLiveMonitorCycleDetached({
      reason: "manual-api",
      authContext,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/hook/altered/live/monitor/run-discovery", async (req, res) => {
    let authContext = null;
    try {
      authContext = await getLiveAuthContext(req);
    } catch (error) {
      return res.status(Number(error?.statusCode || 401)).json({
        error: error?.message || "Failed to resolve Ubisoft auth context.",
      });
    }
    const result = await service.runLiveDiscoveryCycleDetached({
      reason: "manual-api-discovery",
      authContext,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/hook/altered/live/mapper-sync/status", (_req, res) => {
    return res.json({
      mapperNameSync: service.getMapperNameSyncStatus(),
    });
  });

  router.post("/hook/altered/live/mapper-sync/config", async (req, res) => {
    const body = req.body || {};
    const status = await service.updateMapperNameSyncConfig({
      enabled: parseOptionalBoolean(body.enabled),
      bootstrapIntervalSeconds: body.bootstrapIntervalSeconds,
      maintenanceIntervalSeconds: body.maintenanceIntervalSeconds,
      priorityIntervalSeconds: body.priorityIntervalSeconds,
      batchSize: body.batchSize,
      priorityBatchSize: body.priorityBatchSize,
      priorityTopLimit: body.priorityTopLimit,
      priorityRefreshSeconds: body.priorityRefreshSeconds,
      knownAccountsRefreshSeconds: body.knownAccountsRefreshSeconds,
      cacheTtlSeconds: body.cacheTtlSeconds,
      priorityCacheTtlSeconds: body.priorityCacheTtlSeconds,
      minRequestGapMs: body.minRequestGapMs,
      resetKnownAccountsCache: parseOptionalBoolean(body.resetKnownAccountsCache),
      resetPriorityAccountsCache: parseOptionalBoolean(body.resetPriorityAccountsCache),
    });
    return res.json({ mapperNameSync: status });
  });

  router.post("/hook/altered/live/mapper-sync/run", async (req, res) => {
    const body = req.body || {};
    const result = await service.runMapperNameSyncNow({
      priority: Boolean(parseOptionalBoolean(body.priority)),
      force: Boolean(parseOptionalBoolean(body.force)),
      reason: "manual-api",
    });
    if (result?.error) return res.status(400).json(result);
    return res.json({
      result,
      mapperNameSync: service.getMapperNameSyncStatus(),
    });
  });

  router.post("/hook/altered/live/mapper-sync/accounts", async (req, res) => {
    const body = req.body || {};
    const accountIds = parseAccountIds(body.accountIds);
    if (!accountIds.length) {
      return res.status(400).json({
        error: "Provide at least one account ID.",
      });
    }
    const result = await service.syncSpecificMapperAccountIds({
      accountIds,
      force: Boolean(parseOptionalBoolean(body.force)),
      reason: "manual-targeted-api",
    });
    if (result?.error) return res.status(400).json(result);
    return res.json({
      result,
      mapperNameSync: service.getMapperNameSyncStatus(),
    });
  });

  router.get("/alterations/campaigns/timeline", (req, res) => {
    const query = req.query || {};
    const payload = service.getCampaignTimeline({
      source: query.source,
      bucket: query.bucket,
      days: query.days !== undefined ? Number(query.days) : undefined,
      clubId: query.clubId !== undefined ? Number(query.clubId) : undefined,
    });
    return res.json(payload);
  });

  router.post("/naming/process", (req, res) => {
    const body = req.body || {};
    const result = service.processMapNameStandardization({
      q: body.q,
      limit: body.limit,
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/naming/backfill", (req, res) => {
    const body = req.body || {};
    const result = service.assignStoredMapMetadata({
      q: body.q,
      limit: body.limit !== undefined ? Number(body.limit) : 120000,
      mapUids: parseAccountIds(body.mapUids ?? body.map_uids ?? body.uids),
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/naming/similarity/backfill/status", (_req, res) => {
    return res.json(service.getNamingSimilarityBackfillStatus());
  });

  router.post("/naming/similarity/backfill/cancel", (req, res) => {
    const body = req.body || {};
    const result = service.cancelNamingSimilarityBackfill({
      reason: body.reason,
    });
    return res.status(result?.canceled ? 202 : 200).json(result);
  });

  router.post("/naming/similarity/backfill/start", (req, res) => {
    const body = req.body || {};
    const requestedMapUids = parseAccountIds(body.mapUids ?? body.map_uids ?? body.uids);
    const requestedClubId = body.clubId !== undefined ? Number(body.clubId) : undefined;
    const sourceKey = body.sourceKey ?? body.source_key;
    const result = service.startNamingSimilarityBackfill({
      q: body.q,
      limit: body.limit !== undefined ? Number(body.limit) : 120000,
      mapUids: requestedMapUids,
      clubId: resolveNamingSimilarityClubId({
        requestedMapUids,
        requestedClubId,
        query: body.q,
        sourceKey,
        service,
      }),
      sourceKey,
      reviewState: body.reviewState ?? body.review_state ?? "",
      force: Boolean(parseOptionalBoolean(body.force)),
      rescanAll: Boolean(parseOptionalBoolean(body.rescanAll ?? body.rescan_all)),
      persistCandidates:
        parseOptionalBoolean(body.persistCandidates) === undefined
          ? true
          : Boolean(parseOptionalBoolean(body.persistCandidates)),
      reason: body.reason,
    });
    return res.status(result?.started ? 202 : 200).json(result);
  });

  router.post("/naming/similarity/backfill", async (req, res) => {
    const body = req.body || {};
    const requestedMapUids = parseAccountIds(body.mapUids ?? body.map_uids ?? body.uids);
    const requestedClubId = body.clubId !== undefined ? Number(body.clubId) : undefined;
    const sourceKey = body.sourceKey ?? body.source_key;
    const result = await service.assignStoredMapNumbersBySimilarity({
      q: body.q,
      limit: body.limit !== undefined ? Number(body.limit) : 120000,
      mapUids: requestedMapUids,
      clubId: resolveNamingSimilarityClubId({
        requestedMapUids,
        requestedClubId,
        query: body.q,
        sourceKey,
        service,
      }),
      sourceKey,
      force: Boolean(parseOptionalBoolean(body.force)),
      rescanAll: Boolean(parseOptionalBoolean(body.rescanAll ?? body.rescan_all)),
      persistCandidates:
        parseOptionalBoolean(body.persistCandidates) === undefined
          ? true
          : Boolean(parseOptionalBoolean(body.persistCandidates)),
    });
    if (result?.error || result?.ok === false) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/naming/candidates", (req, res) => {
    const query = req.query || {};
    const requiresRegex = parseOptionalBoolean(query.requiresRegex);
    const result = service.getMapNameStandardizationCandidates({
      q: query.q,
      automationState: query.automationState,
      reviewState: query.reviewState,
      requiresRegex:
        requiresRegex === undefined ? undefined : Boolean(requiresRegex),
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      offset: query.offset !== undefined ? Number(query.offset) : undefined,
    });
    return res.json(result);
  });

  router.get("/naming/candidates/:mapUid/detail", async (req, res) => {
    const result = await service.getMapNameStandardizationCandidateDetail(req.params.mapUid);
    if (result?.error) return res.status(404).json(result);
    return res.json(result);
  });

  router.get("/maps/:targetMapUid/viewer-diff", async (req, res) => {
    const result = await service.getMapViewerDiffPayload({
      targetMapUid: req.params.targetMapUid,
      referenceMapUid: req.query.referenceMapUid,
    });
    if (result?.error) {
      const statusCode =
        /not found/i.test(String(result.error || ""))
          ? 404
          : /required/i.test(String(result.error || ""))
            ? 400
            : 409;
      return res.status(statusCode).json(result);
    }
    return res.json(result);
  });

  router.post("/maps/:mapUid/local-fix", async (req, res) => {
    const body = req.body || {};
    const result = await service.importMapLocalFileFix({
      mapUid: req.params.mapUid,
      sourceFilePath: body.sourceFilePath ?? body.source_path ?? body.path,
      note: body.note,
      recomputeSimilarity:
        parseOptionalBoolean(body.recomputeSimilarity ?? body.recompute_similarity) === undefined
          ? true
          : Boolean(parseOptionalBoolean(body.recomputeSimilarity ?? body.recompute_similarity)),
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/naming/candidates/:mapUid/similarity-selection", async (req, res) => {
    const body = req.body || {};
    const result = await service.updateMapNameCandidateSimilaritySelection({
      mapUid: req.params.mapUid,
      candidateMapUids: parseAccountIds(
        body.candidateMapUids ?? body.candidate_map_uids ?? body.referenceMapUids ?? body.reference_map_uids
      ),
      mapNumbers: parseIntegerValues(body.mapNumbers ?? body.map_numbers),
      reviewState: body.reviewState,
      reviewNote: body.reviewNote,
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/naming/candidates/:mapUid/review", (req, res) => {
    const body = req.body || {};
    const result = service.updateMapNameStandardizationCandidateReview({
      mapUid: req.params.mapUid,
      reviewState: body.reviewState,
      manualName: body.manualName,
      reviewNote: body.reviewNote,
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/update-requests", (req, res) => {
    const query = req.query || {};
    const result = service.listUpdateRequests({
      status: query.status,
      q: query.q,
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      offset: query.offset !== undefined ? Number(query.offset) : undefined,
    });
    return res.json(result);
  });

  router.post("/update-requests/:requestId/status", (req, res) => {
    const body = req.body || {};
    const result = service.updateUpdateRequestStatus({
      requestId: Number(req.params.requestId),
      status: body.status,
      resolutionNote: body.resolutionNote,
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  return router;
}

export { createAdminRoutes };
