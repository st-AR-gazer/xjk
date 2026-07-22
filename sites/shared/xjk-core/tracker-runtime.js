import { fetchJson } from "./http.js";

function byId(id, document = globalThis.document) {
  return document?.getElementById?.(id) || null;
}

const TRACKER_MODES = new Set(["wr", "leaderboard", "displayname", "club"]);

function normalizeTrackerMode(mode) {
  const value = String(mode || "").toLowerCase();
  return TRACKER_MODES.has(value) ? value : "wr";
}

function detectTrackerMountPath(pathname, mode) {
  const normalizedMode = normalizeTrackerMode(mode);
  const segments = String(pathname || "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const modeIndex = segments.findIndex((segment) => segment.toLowerCase() === normalizedMode);
  if (modeIndex < 0) return "";

  return `/${segments.slice(0, modeIndex + 1).join("/")}`;
}

function createTrackerRouteResolver(mode, { pathname = globalThis.location?.pathname || "/" } = {}) {
  const normalizedMode = normalizeTrackerMode(mode);
  const basePath = detectTrackerMountPath(pathname, normalizedMode);

  function resolve(path = "/") {
    const value = String(path || "/");
    const suffix = value.startsWith("/") ? value : `/${value}`;
    if (!basePath || suffix === basePath || suffix.startsWith(`${basePath}/`)) return suffix;
    return `${basePath}${suffix}`;
  }

  return Object.freeze({
    admin(path = "") {
      const suffix = String(path || "").replace(/^\/+/, "");
      return resolve(suffix ? `/admin/${suffix}` : "/admin");
    },
    api(path = "") {
      const suffix = String(path || "").replace(/^\/+/, "");
      return resolve(suffix ? `/api/${suffix}` : "/api");
    },
    asset(path = "") {
      const suffix = String(path || "").replace(/^\/+/, "");
      return resolve(suffix ? `/tracker-shared/${suffix}` : "/tracker-shared");
    },
    basePath,
    mode: normalizedMode,
    resolve,
  });
}

function clearLegacyAdminTokenArtifacts({ globalObject = globalThis } = {}) {
  try {
    globalObject.localStorage?.removeItem("tracker_admin_token");
  } catch {}

  try {
    const url = new URL(globalObject.location.href);
    if (!url.searchParams.has("admin_token")) return;
    url.searchParams.delete("admin_token");
    globalObject.history.replaceState(globalObject.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {}
}

async function requestJson(path, { method = "GET", body } = {}) {
  return fetchJson(path, {
    method,
    ...(body === undefined ? {} : { json: body }),
  });
}

function formatDurationMs(milliseconds) {
  const value = Math.max(0, Number(milliseconds) || 0);
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const fraction = value % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(fraction).padStart(3, "0")}`;
}

function formatRelativeTime(timestamp, { now = Date.now() } = {}) {
  const parsed = Date.parse(timestamp || "");
  if (!Number.isFinite(parsed)) return "\u2014";

  const seconds = Math.max(0, Math.floor((now - parsed) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "\u2014";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
}

function formatClockTime(timestamp, { empty = "-" } = {}) {
  const date = timestamp ? new Date(timestamp) : null;
  if (!date || Number.isNaN(date.getTime())) return empty;
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
}

async function applySiteDataLinks({ globalObject = globalThis, document = globalThis.document } = {}) {
  const xjkSite = globalObject.XjkSite || (await import("/shared/xjk-core/site-runtime.js")).XjkSite;
  xjkSite.applySiteDataLinks(document, { location: globalObject.location });
}

function bindDockNavigation(document = globalThis.document) {
  const buttons = Array.from(document?.querySelectorAll?.(".dock-btn") || []);
  const panels = Array.from(document?.querySelectorAll?.(".view-layer") || []);

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const viewId = button.getAttribute("data-view");
      buttons.forEach((candidate) => candidate.classList.remove("is-active"));
      panels.forEach((panel) => panel.classList.remove("is-active"));
      button.classList.add("is-active");
      document.getElementById(`view-${viewId}`)?.classList.add("is-active");
    });
  });
}

function startStatusPolling(
  loadStatus,
  { onError = () => {}, intervalMs = 5000, setInterval = globalThis.setInterval } = {}
) {
  const refresh = () => Promise.resolve().then(loadStatus).catch(onError);
  void refresh();
  return setInterval(refresh, intervalMs);
}

function mapMatchesQuery(map, query) {
  const normalizedQuery = String(query || "")
    .toLowerCase()
    .trim();
  if (!normalizedQuery) return true;
  return [map?.name, map?.uid, map?.wrHolder, map?.campaign].some((value) =>
    String(value || "")
      .toLowerCase()
      .includes(normalizedQuery)
  );
}

function readFeedEntry(entry, { formatAgo = formatRelativeTime } = {}) {
  return {
    mapName: entry?.mapName || entry?.name || entry?.map_name || "Unknown",
    holder: entry?.newHolder || entry?.holder || entry?.wrHolder || entry?.wr_holder || "\u2014",
    newWr: entry?.newWrMs || entry?.wrMs || entry?.wr_ms || 0,
    oldWr: entry?.oldWrMs || entry?.previousWrMs || 0,
    ago: formatAgo(entry?.updatedAt || entry?.at || entry?.wrUpdatedAt || ""),
  };
}

function renderTrackerEngine(elements, runtime, { formatAgo = formatRelativeTime } = {}) {
  const values = runtime
    ? {
        provider: runtime.provider || "unknown",
        tick: `${runtime.tickSeconds || "\u2014"}s`,
        status: runtime.timerActive ? "running" : "idle",
        started: runtime.lastStartedAt ? formatAgo(runtime.lastStartedAt) : "\u2014",
        finished: runtime.lastFinishedAt ? formatAgo(runtime.lastFinishedAt) : "\u2014",
        error: runtime.lastError?.message || "none",
      }
    : {
        provider: "\u2014",
        tick: "\u2014",
        status: "offline",
        started: "\u2014",
        finished: "\u2014",
        error: "n/a",
      };

  Object.entries(values).forEach(([key, value]) => {
    if (elements?.[key]) elements[key].textContent = value;
  });
}

export {
  applySiteDataLinks,
  bindDockNavigation,
  byId,
  clearLegacyAdminTokenArtifacts,
  createTrackerRouteResolver,
  detectTrackerMountPath,
  formatClockTime,
  formatDateTime,
  formatDurationMs,
  formatRelativeTime,
  mapMatchesQuery,
  normalizeTrackerMode,
  readFeedEntry,
  renderTrackerEngine,
  requestJson,
  startStatusPolling,
};
