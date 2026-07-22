import { runtimeApiHref } from "./route-model.js?v=2";

const OVERVIEW_REFRESH_MS = 15_000;

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : "0";
}

function formatAgo(iso, now = Date.now()) {
  const timestamp = Date.parse(iso || "");
  if (!Number.isFinite(timestamp)) return "just now";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatTrackerOverview(status, modeLabel) {
  const runtime = status?.runtime || {};
  const tracked = Number(status?.summary?.trackedMaps || 0);
  const due = Number(status?.trackedDueNow || 0);
  if (runtime.lastError) {
    return { label: "Attention", meta: `${modeLabel} runtime reported an error.`, tone: "bad" };
  }
  const details = `${formatNumber(tracked)} maps tracked · ${formatNumber(due)} due now`;
  return runtime.running || runtime.timerActive
    ? { label: "Running", meta: details, tone: "ok" }
    : { label: "Reachable", meta: details, tone: "warn" };
}

function formatDisplaynameOverview(status) {
  if (status?.lastError) {
    return { label: "Attention", meta: "Displayname runtime reported an error.", tone: "bad" };
  }
  const details = `${formatNumber(status?.queueSize || 0)} queued · scheduler ${status?.schedulerEnabled ? "active" : "paused"}`;
  return status?.running
    ? { label: "Syncing", meta: details, tone: "ok" }
    : { label: "Reachable", meta: details, tone: "warn" };
}

function formatClubOverview(status) {
  if (status?.lastError) {
    return { label: "Attention", meta: "Club runtime reported an ingest error.", tone: "bad" };
  }
  if (status?.lastIngestAt) {
    return { label: "Ingested", meta: `Last snapshot ${formatAgo(status.lastIngestAt)}`, tone: "ok" };
  }
  return { label: "Reachable", meta: "Waiting for the first club snapshot.", tone: "warn" };
}

function formatRuntimeOverview(route, status) {
  if (route === "wr") return formatTrackerOverview(status, "WR");
  if (route === "leaderboard") return formatTrackerOverview(status, "Leaderboard");
  if (route === "displayname") return formatDisplaynameOverview(status);
  return formatClubOverview(status);
}

function runtimeStatusRequests(basePrefix) {
  return [
    { key: "wr", url: runtimeApiHref(basePrefix, "wr", "/api/v1/tracker/status") },
    { key: "leaderboard", url: runtimeApiHref(basePrefix, "leaderboard", "/api/v1/tracker/status") },
    { key: "displayname", url: runtimeApiHref(basePrefix, "displayname", "/api/v1/status") },
    { key: "club", url: runtimeApiHref(basePrefix, "club", "/api/v1/status") },
  ];
}

async function fetchRuntimeStatuses(basePrefix, fetchJsonImpl) {
  const requests = runtimeStatusRequests(basePrefix);
  const results = await Promise.allSettled(requests.map(({ url }) => fetchJsonImpl(url)));
  return requests.map((request, index) => ({ ...request, result: results[index] }));
}

function summarizeReachability(reachable, total) {
  const active = {
    state: String(reachable),
    copy:
      reachable === 1 ? "1 runtime responded to health checks." : `${reachable} runtimes responded to health checks.`,
    tone: reachable > 0 ? "ok" : "bad",
  };
  let health;
  if (reachable === total) {
    health = {
      state: "Healthy",
      copy: "All tracker services are reachable from the shared host shell.",
      tone: "ok",
    };
  } else if (reachable > 0) {
    health = {
      state: "Partial",
      copy: `${reachable} of ${total} runtimes are reachable right now.`,
      tone: "warn",
    };
  } else {
    health = {
      state: "Offline",
      copy: "Tracker services did not respond to the shared host shell.",
      tone: "bad",
    };
  }
  return {
    active,
    health,
    network: {
      state: `${reachable}/${total}`,
      copy:
        reachable === total
          ? "Network sync looks healthy across all tracker runtimes."
          : "One or more runtime services are currently unavailable.",
      tone: reachable === total ? "ok" : reachable > 0 ? "warn" : "bad",
    },
  };
}

export {
  OVERVIEW_REFRESH_MS,
  fetchRuntimeStatuses,
  formatAgo,
  formatClubOverview,
  formatDisplaynameOverview,
  formatNumber,
  formatRuntimeOverview,
  formatTrackerOverview,
  runtimeStatusRequests,
  summarizeReachability,
};
