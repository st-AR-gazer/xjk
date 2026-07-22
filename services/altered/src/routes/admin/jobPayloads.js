import {
  buildJobHistoryItem,
  summarizeDiscovery,
  summarizeDisplayname,
  summarizeHookRun,
  toText,
} from "./routeUtils.js";
import { buildOverviewJobs } from "./jobOverviewBuilders.js";

function buildJobsOverviewPayload({ hook, liveStatus, trackerStatus, trackerRuns, opsOverview, localStore }) {
  return {
    generatedAt: new Date().toISOString(),
    jobs: buildOverviewJobs({ hook, liveStatus, trackerStatus, trackerRuns, opsOverview, localStore }),
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

export { buildJobHistoryPayload, buildJobsOverviewPayload };
