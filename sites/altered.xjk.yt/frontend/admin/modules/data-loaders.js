import { renderActivity, renderApi, renderSettings } from "./activity-api-settings.js?v=2";
import { api } from "./api.js?v=2";
import { renderClubs } from "./clubs.js?v=2";
import { ADMIN_DEBUG_ENABLED, CAMPAIGN_CATALOG_PAGE_SIZE } from "./constants.js?v=2";
import { renderDashboard } from "./dashboard.js?v=2";
import { stripFmt } from "./formatters.js?v=2";
import { renderJobs } from "./jobs.js?v=2";
import { renderMaps } from "./maps.js?v=2";
import { loadNamingSimilarityBackfillStatus, syncNamingSimilarityCampaignSelects } from "./similarity-scope.js?v=2";
import { state } from "./state.js?v=2";
import { renderNavBadges, renderTopbar } from "./status-bar.js?v=2";

export async function loadDashboard() {
  state.dashboard = await api("/api/v1/admin/command-center");
  const manifestSimilarityStatus = state.dashboard?.compatibility?.requiredRoutes?.namingSimilarityBackfillStatus;
  if (manifestSimilarityStatus === true) {
    state.similarityBackfillStatusSupported = true;
  } else if (manifestSimilarityStatus === false && state.similarityBackfillStatusSupported === null) {
    state.similarityBackfillStatusSupported = false;
  }
  state.lastLoad.dashboard = Date.now();
  renderDashboard();
  renderTopbar();
  renderNavBadges();
  if (
    state.similarityBackfillStatusSupported !== false &&
    !state.busy.has("naming-similarity") &&
    !state.similarityBackfill?.running &&
    !state.similarityBackfill
  ) {
    loadNamingSimilarityBackfillStatus().catch(console.error);
  }
}

let campaignCatalogPromise = null;

export async function loadCampaignCatalog() {
  if (Array.isArray(state.campaignCatalog)) return state.campaignCatalog;
  if (campaignCatalogPromise) return campaignCatalogPromise;

  campaignCatalogPromise = (async () => {
    try {
      const rows = [];
      let page = 1;
      while (true) {
        const data = await api(
          `/api/v1/admin/maps/workspace?view=campaigns&page=${page}&pageSize=${CAMPAIGN_CATALOG_PAGE_SIZE}`
        );
        const pageRows = Array.isArray(data?.rows) ? data.rows : [];
        rows.push(...pageRows);

        const total = Number(data?.total || 0) || 0;
        const hasMore = Boolean(data?.hasMore) || (total > 0 && rows.length < total);
        if (!hasMore || !pageRows.length) break;
        page += 1;
      }
      state.campaignCatalog = rows;
    } catch {
      state.campaignCatalog = [];
    } finally {
      campaignCatalogPromise = null;
    }

    syncNamingSimilarityCampaignSelects();
    return state.campaignCatalog;
  })();

  return campaignCatalogPromise;
}

let jobsOverviewPromise = null;
let jobsConsoleSnapshot = null;
let liveMonitorStatusPromise = null;
let liveMonitorConsoleSnapshot = null;

function buildJobConsoleEntry(job = {}) {
  return {
    jobKey: String(job.jobKey || "").trim() || "job",
    label: String(job.label || "").trim() || "Unnamed Job",
    state: String(job.state || "").trim() || "unknown",
    configured: Boolean(job.configured),
    enabled: Boolean(job.enabled),
    summary: String(job.summaryLine || "").trim(),
    error: String(job.errorLine || "").trim(),
    lastStartedAt: String(job.lastStartedAt || "").trim(),
    lastFinishedAt: String(job.lastFinishedAt || "").trim(),
    lastSuccessAt: String(job.lastSuccessAt || "").trim(),
    lastFailureAt: String(job.lastFailureAt || "").trim(),
    nextRunAt: String(job.nextRunAt || "").trim(),
    durationMs: Number.isFinite(Number(job.durationMs)) ? Number(job.durationMs) : null,
  };
}

function sameJobConsoleEntry(left, right) {
  if (!left || !right) return false;
  return (
    left.jobKey === right.jobKey &&
    left.label === right.label &&
    left.state === right.state &&
    left.configured === right.configured &&
    left.enabled === right.enabled &&
    left.summary === right.summary &&
    left.error === right.error &&
    left.lastStartedAt === right.lastStartedAt &&
    left.lastFinishedAt === right.lastFinishedAt &&
    left.lastSuccessAt === right.lastSuccessAt &&
    left.lastFailureAt === right.lastFailureAt &&
    left.nextRunAt === right.nextRunAt &&
    left.durationMs === right.durationMs
  );
}

function buildJobsConsoleDiff(previousEntries = [], nextEntries = []) {
  const previousByKey = new Map(previousEntries.map((entry) => [entry.jobKey, entry]));
  return nextEntries
    .map((entry) => ({ before: previousByKey.get(entry.jobKey) || null, after: entry }))
    .filter(({ before, after }) => !before || !sameJobConsoleEntry(before, after));
}

export function logJobsConsole(message, details = null, level = "log") {
  if (!ADMIN_DEBUG_ENABLED) return;
  const prefix = "[altered-admin/jobs]";
  const method = typeof console[level] === "function" ? level : "log";
  if (details === null || details === undefined) {
    console[method](`${prefix} ${message}`);
    return;
  }
  console[method](`${prefix} ${message}`, details);
}

export function logJobsOverviewConsole(payload, { source = "jobs-refresh", force = false } = {}) {
  if (!ADMIN_DEBUG_ENABLED) return;
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  const nextEntries = jobs.map(buildJobConsoleEntry);
  const previousEntries = jobsConsoleSnapshot;
  const changes = buildJobsConsoleDiff(previousEntries || [], nextEntries);
  const runningEntries = nextEntries.filter((entry) => entry.state === "running");
  const shouldLog = force || !previousEntries || changes.length > 0 || runningEntries.length > 0;

  jobsConsoleSnapshot = nextEntries;
  if (!shouldLog) return;

  const headline =
    `[altered-admin/jobs] ${source} @ ${String(payload?.generatedAt || new Date().toISOString())}` +
    ` | ${nextEntries.length} jobs | ${runningEntries.length} running` +
    ` | ${changes.length} changed`;

  if (typeof console.groupCollapsed === "function") {
    console.groupCollapsed(headline);
  } else {
    console.log(headline);
  }

  if (!previousEntries || force) {
    console.table(nextEntries);
  } else if (changes.length > 0) {
    console.table(
      changes.map(({ before, after }) => ({
        jobKey: after.jobKey,
        stateFrom: before?.state || "-",
        stateTo: after.state,
        summaryFrom: before?.summary || "",
        summaryTo: after.summary,
        errorFrom: before?.error || "",
        errorTo: after.error,
        lastStartedAt: after.lastStartedAt,
        lastFinishedAt: after.lastFinishedAt,
        nextRunAt: after.nextRunAt,
        durationMs: after.durationMs ?? "",
      }))
    );
  } else {
    console.table(
      runningEntries.map((entry) => ({
        jobKey: entry.jobKey,
        state: entry.state,
        summary: entry.summary,
        lastStartedAt: entry.lastStartedAt,
        durationMs: entry.durationMs ?? "",
      }))
    );
    console.log("[altered-admin/jobs] running heartbeat: no job-field changes since the last poll.");
  }

  if (runningEntries.length > 0) {
    console.log("[altered-admin/jobs] currently running jobs", runningEntries);
  }

  if (typeof console.groupEnd === "function") {
    console.groupEnd();
  }
}

function cleanLiveMonitorMapName(value, mapUid = "") {
  const raw = String(value || "").trim();
  const cleaned = stripFmt(raw).trim();
  if (cleaned) return cleaned;
  return raw || String(mapUid || "").trim();
}

function buildLiveMonitorConsoleSnapshot(payload = {}) {
  const monitor = payload?.monitor || {};
  const progress = monitor?.progress || {};
  const counters = progress?.counters || {};
  const currentMaps = Array.isArray(progress?.currentMaps)
    ? progress.currentMaps
        .map((entry) => ({
          mapUid: String(entry?.mapUid || "").trim() || "",
          mapName: cleanLiveMonitorMapName(entry?.mapName || entry?.mapUid || "", entry?.mapUid || ""),
        }))
        .filter((entry) => entry.mapUid || entry.mapName)
    : [];

  return {
    running: Boolean(monitor?.running),
    discoveryRunning: Boolean(monitor?.discoveryRunning),
    phase: String(progress?.phase || "").trim(),
    status: String(progress?.status || "").trim(),
    message: String(progress?.message || "").trim(),
    percent: Number.isFinite(Number(progress?.percent)) ? Number(progress.percent) : null,
    updatedAt: String(progress?.updatedAt || "").trim(),
    currentMapUid: String(progress?.currentMapUid || "").trim(),
    currentMapName: cleanLiveMonitorMapName(progress?.currentMapName || "", progress?.currentMapUid || ""),
    currentCampaignName: String(counters?.currentCampaignName || "").trim(),
    currentCampaignId:
      Number.isFinite(Number(counters?.currentCampaignId)) && Number(counters.currentCampaignId) > 0
        ? Number(counters.currentCampaignId)
        : null,
    trackerTarget: String(counters?.trackerTarget || "").trim(),
    trackerChunkSize: Number.isFinite(Number(counters?.trackerChunkSize)) ? Number(counters.trackerChunkSize) : null,
    trackerChunksSynced: Number.isFinite(Number(counters?.trackerChunksSynced))
      ? Number(counters.trackerChunksSynced)
      : null,
    trackerChunksTotal: Number.isFinite(Number(counters?.trackerChunksTotal))
      ? Number(counters.trackerChunksTotal)
      : null,
    trackerMapsSynced: Number.isFinite(Number(counters?.trackerMapsSynced)) ? Number(counters.trackerMapsSynced) : null,
    trackerMapsToSync: Number.isFinite(Number(counters?.trackerMapsToSync)) ? Number(counters.trackerMapsToSync) : null,
    currentMaps,
  };
}

function logLiveMonitorConsole(payload, { source = "jobs-live-status", force = false } = {}) {
  if (!ADMIN_DEBUG_ENABLED) return;
  const nextSnapshot = buildLiveMonitorConsoleSnapshot(payload);
  const previousKey = liveMonitorConsoleSnapshot;
  const nextKey = JSON.stringify(nextSnapshot);
  const running = nextSnapshot.running || nextSnapshot.discoveryRunning;
  const shouldLog = force || !previousKey || previousKey !== nextKey || running;

  liveMonitorConsoleSnapshot = nextKey;
  if (!shouldLog) return;

  const headline =
    `[altered-admin/jobs] ${source} live progress` +
    ` | ${nextSnapshot.status || (running ? "running" : "idle")}` +
    ` | ${nextSnapshot.phase || "unknown-phase"}` +
    ` | ${nextSnapshot.percent ?? 0}%`;

  if (typeof console.groupCollapsed === "function") {
    console.groupCollapsed(headline);
  } else {
    console.log(headline);
  }

  console.log("[altered-admin/jobs] live monitor snapshot", nextSnapshot);
  if (nextSnapshot.currentCampaignName) {
    console.log("[altered-admin/jobs] current campaign", {
      currentCampaignName: nextSnapshot.currentCampaignName,
      currentCampaignId: nextSnapshot.currentCampaignId,
    });
  }
  if (nextSnapshot.currentMapUid || nextSnapshot.currentMapName) {
    console.log("[altered-admin/jobs] current map", {
      currentMapUid: nextSnapshot.currentMapUid || null,
      currentMapName: nextSnapshot.currentMapName || null,
    });
  }
  if (nextSnapshot.currentMaps.length > 0) {
    console.table(nextSnapshot.currentMaps);
  }
  if (running && nextSnapshot.trackerMapsToSync) {
    console.log("[altered-admin/jobs] tracker sync progress", {
      trackerTarget: nextSnapshot.trackerTarget || null,
      trackerChunksSynced: nextSnapshot.trackerChunksSynced,
      trackerChunksTotal: nextSnapshot.trackerChunksTotal,
      trackerMapsSynced: nextSnapshot.trackerMapsSynced,
      trackerMapsToSync: nextSnapshot.trackerMapsToSync,
      trackerChunkSize: nextSnapshot.trackerChunkSize,
    });
  }

  if (typeof console.groupEnd === "function") {
    console.groupEnd();
  }
}

async function loadJobsOverview({ source = "jobs-refresh", forceConsole = false } = {}) {
  if (jobsOverviewPromise) return jobsOverviewPromise;
  jobsOverviewPromise = (async () => {
    const payload = await api("/api/v1/admin/jobs/overview");
    state.jobs = payload;
    state.clubs = payload;
    state.lastLoad.jobs = Date.now();
    if (state.ws === "jobs" || forceConsole) {
      logJobsOverviewConsole(payload, { source, force: forceConsole });
    }
    return payload;
  })();
  try {
    return await jobsOverviewPromise;
  } finally {
    jobsOverviewPromise = null;
  }
}

export async function loadLiveMonitorStatusForJobs({ source = "jobs-live-status", forceConsole = false } = {}) {
  if (liveMonitorStatusPromise) return liveMonitorStatusPromise;
  liveMonitorStatusPromise = (async () => {
    const payload = await api("/api/v1/admin/hook/altered/live/status");
    if (state.ws === "jobs" || forceConsole) {
      logLiveMonitorConsole(payload, { source, force: forceConsole });
    }
    return payload;
  })();
  try {
    return await liveMonitorStatusPromise;
  } finally {
    liveMonitorStatusPromise = null;
  }
}

export async function loadClubs() {
  await loadJobsOverview({ source: "clubs-refresh" });
  renderClubs();
  renderTopbar();
  renderNavBadges();
}

export async function loadJobs(options = {}) {
  await Promise.all([
    loadJobsOverview(options),
    loadLiveMonitorStatusForJobs({
      source: `${String(options?.source || "jobs-refresh")}:live`,
      forceConsole: Boolean(options?.forceConsole),
    }).catch((error) => {
      logJobsConsole(
        "live monitor status fetch failed",
        { message: error?.message || String(error || "Unknown error.") },
        "warn"
      );
    }),
  ]);
  renderJobs();
  renderTopbar();
  renderNavBadges();
}

let mapsLoadPromise = null;
let mapsLoadKey = "";

export async function loadMaps(force = false) {
  const v = state.maps.view;
  if (v === "weights" && !Array.isArray(state.campaignCatalog)) {
    try {
      await loadCampaignCatalog();
    } catch (error) {
      console.error(error);
    }
  }
  const p = state.maps.page[v] || 1;
  const ps = state.maps.pageSize[v] || 50;
  const f = state.maps.filters[v] || {};
  const params = new URLSearchParams({ view: v, page: String(p), pageSize: String(ps) });
  Object.entries(f).forEach(([k, val]) => {
    if (val !== undefined && val !== null && String(val) !== "") params.set(k, String(val));
  });
  const requestKey = params.toString();
  if (mapsLoadPromise && mapsLoadKey === requestKey) {
    await mapsLoadPromise;
    if (force) renderTopbar();
    return;
  }

  mapsLoadKey = requestKey;
  mapsLoadPromise = (async () => {
    state.maps.data = await api(`/api/v1/admin/maps/workspace?${params}`);
    state.maps.lastRequestKey = requestKey;
    renderMaps();
  })();
  try {
    await mapsLoadPromise;
  } finally {
    if (mapsLoadPromise && mapsLoadKey === requestKey) {
      mapsLoadPromise = null;
      mapsLoadKey = "";
    }
  }
  if (force) renderTopbar();
}

let activityLoadPromise = null;
let activityLoadKey = "";

export async function loadActivity() {
  const f = state.activity.filters;
  const params = new URLSearchParams({
    kind: f.kind || "all",
    cursor: String(state.activity.cursor || 0),
    limit: String(state.activity.limit || 40),
  });
  if (f.mapUid) params.set("mapUid", f.mapUid);
  if (f.jobKey) params.set("jobKey", f.jobKey);
  const requestKey = params.toString();
  if (activityLoadPromise && activityLoadKey === requestKey) {
    await activityLoadPromise;
    return;
  }

  activityLoadKey = requestKey;
  activityLoadPromise = (async () => {
    state.activity.data = await api(`/api/v1/admin/operations/feed?${params}`);
    state.activity.lastRequestKey = requestKey;
    state.lastLoad.activity = Date.now();
    renderActivity();
  })();
  try {
    await activityLoadPromise;
  } finally {
    if (activityLoadPromise && activityLoadKey === requestKey) {
      activityLoadPromise = null;
      activityLoadKey = "";
    }
  }
}

export async function loadApi() {
  state.api = await api("/api/v1/admin/public-api/summary");
  state.lastLoad.api = Date.now();
  renderApi();
}

export async function loadSettings() {
  state.settings = await api("/api/v1/admin/settings/summary");
  renderSettings();
}

export function getMapsRequestKey() {
  const v = state.maps.view;
  const p = state.maps.page[v] || 1;
  const ps = state.maps.pageSize[v] || 50;
  const f = state.maps.filters[v] || {};
  const params = new URLSearchParams({ view: v, page: String(p), pageSize: String(ps) });
  Object.entries(f).forEach(([k, val]) => {
    if (val !== undefined && val !== null && String(val) !== "") params.set(k, String(val));
  });
  return params.toString();
}

export function getActivityRequestKey() {
  const f = state.activity.filters;
  const params = new URLSearchParams({
    kind: f.kind || "all",
    cursor: String(state.activity.cursor || 0),
    limit: String(state.activity.limit || 40),
  });
  if (f.mapUid) params.set("mapUid", f.mapUid);
  if (f.jobKey) params.set("jobKey", f.jobKey);
  return params.toString();
}
