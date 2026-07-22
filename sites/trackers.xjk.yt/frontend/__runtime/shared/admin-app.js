import { appendText, clearElement, createElement } from "./dom.js";
import {
  applySiteDataLinks,
  byId,
  clearLegacyAdminTokenArtifacts,
  createTrackerRouteResolver,
  formatDateTime,
  formatDurationMs,
  formatRelativeTime,
  mapMatchesQuery,
  readFeedEntry,
  renderTrackerEngine,
  requestJson,
} from "/shared/xjk-core/tracker-runtime.js";

const REFRESH_MS = 30000;
const TAB_KEY = "tracker_admin_tab";
const VALID_TABS = new Set(["overview", "maps", "bulk-import", "run-history", "wr-feed"]);
const TRACKER_MODE = globalThis.XjkTrackerConfig?.mode === "leaderboard" ? "leaderboard" : "wr";
const routes = createTrackerRouteResolver(TRACKER_MODE);

clearLegacyAdminTokenArtifacts();

const state = {
  status: null,
  maps: [],
  runs: [],
  wrFeed: [],
  filters: { search: "", trackingFilter: "all" },
  adminLog: [],
  auth: null,
  ui: { activeTab: "overview" },
};
const $ = byId;

const els = {
  adminTitle: $("admin-title"),
  adminSub: $("admin-sub"),
  changesLabel: $("admin-changes-label"),
  feedTabLabel: $("admin-feed-tab-label"),
  authNote: $("authNote"),
  adminLogoutBtn: $("admin-logout-btn"),
  statTracked: $("stat-tracked"),
  statDue: $("stat-due"),
  statChanges: $("stat-changes"),
  statEngine: $("stat-engine"),
  runNowBtn: $("run-now-btn"),
  engineProvider: $("engine-provider"),
  engineTick: $("engine-tick"),
  engineStatus: $("engine-status"),
  engineStarted: $("engine-started"),
  engineFinished: $("engine-finished"),
  engineError: $("engine-error"),
  overviewLatest: $("overview-latest-run"),
  overviewRuns: $("overview-recent-runs"),
  adminMapsCount: $("admin-maps-count"),
  adminMapSearch: $("admin-map-search"),
  adminMapFilter: $("admin-map-filter"),
  adminMapRows: $("admin-map-rows"),
  bulkForm: $("bulk-import-form"),
  bulkInput: $("bulk-json-input"),
  bulkValidateBtn: $("bulk-validate-btn"),
  bulkStatus: $("bulk-status"),
  adminRunsList: $("admin-runs-list"),
  adminFeedNote: $("admin-feed-note"),
  adminFeedList: $("admin-feed-list"),
  adminFeedEmpty: $("admin-feed-empty"),
  adminLogList: $("admin-log-list"),
  tabButtons: Array.from(document.querySelectorAll("[data-admin-tab]")),
  tabPanels: Array.from(document.querySelectorAll("[data-tab-panel]")),
};

function applyModeUI() {
  const isLeaderboard = TRACKER_MODE === "leaderboard";
  document.title = isLeaderboard ? "xjk / leaderboard / admin" : "xjk / wr / admin";
  if (els.adminTitle) els.adminTitle.textContent = isLeaderboard ? "Leaderboard Admin" : "WR Tracker Admin";
  if (els.adminSub) {
    els.adminSub.textContent = isLeaderboard
      ? "Manage tracked maps, trigger runs, import maps in bulk, and monitor leaderboard changes."
      : "Manage tracked maps, trigger runs, import maps in bulk, and monitor WR change history.";
  }
  if (els.changesLabel) els.changesLabel.textContent = isLeaderboard ? "Top Changes" : "WR Changes";
  if (els.feedTabLabel) els.feedTabLabel.textContent = isLeaderboard ? "Top Feed" : "WR Feed";
}
const api = (path, options) => requestJson(routes.resolve(path), options);
const fmtMs = formatDurationMs;
const fmtAgo = formatRelativeTime;
const fmtDate = formatDateTime;
function pushLog(message) {
  const stamp = new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  state.adminLog.unshift(`[${stamp}] ${message}`);
  if (state.adminLog.length > 30) state.adminLog.length = 30;
  renderLog();
}
function getInitialTab() {
  const hash = String(window.location.hash || "")
    .replace(/^#/, "")
    .trim();
  if (VALID_TABS.has(hash)) return hash;
  try {
    const stored = String(window.localStorage.getItem(TAB_KEY) || "").trim();
    if (VALID_TABS.has(stored)) return stored;
  } catch {}
  return "overview";
}

function setActiveTab(tab, { persist = true } = {}) {
  const next = VALID_TABS.has(tab) ? tab : "overview";
  state.ui.activeTab = next;

  els.tabButtons.forEach((btn) => {
    const active = btn.getAttribute("data-admin-tab") === next;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });

  els.tabPanels.forEach((panel) => {
    const active = panel.getAttribute("data-tab-panel") === next;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });

  if (persist) {
    try {
      window.localStorage.setItem(TAB_KEY, next);
    } catch {}
  }
}
function renderAuth() {
  const auth = state.auth;
  if (!auth) {
    els.authNote.textContent = "Auth: checking...";
    els.runNowBtn.disabled = true;
    if (els.bulkValidateBtn) els.bulkValidateBtn.disabled = true;
    if (els.bulkForm?.querySelector(".btn-main")) els.bulkForm.querySelector(".btn-main").disabled = true;
    return;
  }

  const canManage = Boolean(auth.authenticated);
  els.runNowBtn.disabled = !canManage;
  if (els.bulkValidateBtn) els.bulkValidateBtn.disabled = !canManage;
  if (els.bulkForm?.querySelector(".btn-main")) {
    els.bulkForm.querySelector(".btn-main").disabled = !canManage;
  }

  if (auth.authenticated) {
    const method =
      auth.authenticatedVia === "open"
        ? "open mode"
        : auth.authenticatedVia === "session"
          ? "session"
          : auth.authenticatedVia === "token"
            ? "token"
            : "authenticated";
    els.authNote.textContent = `Auth: ${method}`;
    return;
  }

  if (auth.openMode) {
    els.authNote.textContent = "Auth: open mode";
    els.runNowBtn.disabled = false;
    if (els.bulkValidateBtn) els.bulkValidateBtn.disabled = false;
    if (els.bulkForm?.querySelector(".btn-main")) {
      els.bulkForm.querySelector(".btn-main").disabled = false;
    }
    return;
  }

  if (auth.credentialsEnabled || auth.tokenEnabled) {
    els.authNote.textContent = "Auth required";
    return;
  }

  els.authNote.textContent = "Auth unavailable";
}
function renderStats() {
  const summary = state.status?.summary;
  const tracked = Number(summary?.trackedMaps || 0);
  const due = Number(state.status?.trackedDueNow || 0);
  const totalChanges = state.runs.reduce((sum, r) => sum + (Number(r.wrChanges) || 0), 0);
  const rt = state.status?.runtime;

  els.statTracked.textContent = String(tracked);
  els.statDue.textContent = String(due);
  els.statChanges.textContent = String(totalChanges);
  els.statEngine.textContent = rt ? (rt.timerActive ? "running" : "idle") : "offline";
}
function renderEngine() {
  renderTrackerEngine(
    {
      provider: els.engineProvider,
      tick: els.engineTick,
      status: els.engineStatus,
      started: els.engineStarted,
      finished: els.engineFinished,
      error: els.engineError,
    },
    state.status?.runtime
  );
}
function renderOverview() {
  const latest = state.status?.latestRun;
  if (latest) {
    els.overviewLatest.textContent =
      `Run #${latest.runId || "\u2014"} \u00B7 ${latest.wrChanges || 0} changes \u00B7 ` +
      `checked ${latest.mapsChecked || 0}/${latest.mapsConsidered || 0} maps \u00B7 ${fmtAgo(latest.finishedAt)}`;
  } else {
    els.overviewLatest.textContent = "No runs completed yet.";
  }

  clearElement(els.overviewRuns);
  const recentRuns = state.runs.slice(0, 6);
  if (!recentRuns.length) {
    const li = document.createElement("li");
    createElement(li, "strong", { text: "No runs yet" });
    createElement(li, "span", { text: "Tracker has not completed any runs." });
    els.overviewRuns.appendChild(li);
    return;
  }

  recentRuns.forEach((run) => {
    const li = document.createElement("li");
    createElement(li, "strong", { text: `Run #${run.runId || "?"} \u00B7 ${run.wrChanges || 0} changes` });
    createElement(li, "span", {
      text: `Checked ${run.mapsChecked || 0}/${run.mapsConsidered || 0} \u00B7 ${run.provider || "unknown"} \u00B7 ${fmtAgo(run.finishedAt)}`,
    });
    els.overviewRuns.appendChild(li);
  });
}
function getFilteredMaps() {
  const q = state.filters.search.toLowerCase().trim();
  const f = state.filters.trackingFilter;
  return state.maps
    .filter((m) => {
      if (f === "tracked") return m.tracked;
      if (f === "untracked") return !m.tracked;
      return true;
    })
    .filter((map) => mapMatchesQuery(map, q))
    .sort((a, b) => {
      if (a.tracked !== b.tracked) return a.tracked ? -1 : 1;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
}

function renderMaps() {
  const maps = getFilteredMaps();
  const canManage = Boolean(state.auth?.authenticated || state.auth?.openMode);
  els.adminMapsCount.textContent = `${maps.length} maps`;
  clearElement(els.adminMapRows);

  if (!maps.length) {
    const row = document.createElement("tr");
    const cell = createElement(row, "td", {
      text: "No maps match the current filter.",
      attributes: { colspan: 7 },
    });
    cell.style.textAlign = "center";
    cell.style.color = "var(--ink-muted)";
    cell.style.padding = "1.5rem";
    els.adminMapRows.appendChild(row);
    return;
  }

  maps.forEach((map) => {
    const row = document.createElement("tr");
    const tracked = Boolean(map.tracked);
    const interval = map.checkIntervalSeconds
      ? `${map.checkIntervalSeconds}s`
      : map.check_interval_seconds
        ? `${map.check_interval_seconds}s`
        : "\u2014";
    const toggleLabel = tracked ? "Untrack" : "Track";
    const toggleClass = tracked ? "is-tracked" : "is-untracked";

    const mapCell = createElement(row, "td");
    createElement(mapCell, "strong", { text: map.name || "Unknown" });
    createElement(mapCell, "br");
    createElement(mapCell, "span", { text: map.uid || "\u2014" });
    createElement(row, "td", { text: `${map.campaign || "Unassigned"} #${map.slot || 0}` });
    createElement(row, "td", { text: fmtMs(map.wrMs || map.wr_ms || 0) });
    createElement(row, "td", { text: map.wrHolder || map.wr_holder || "\u2014" });
    const statusCell = createElement(row, "td");
    createElement(statusCell, "span", {
      className: tracked ? "flag flag-tracked" : "flag flag-untracked",
      text: tracked ? "tracked" : "untracked",
    });
    createElement(row, "td", { text: interval });
    const actionsCell = createElement(row, "td");
    const actions = createElement(actionsCell, "div", { className: "map-actions" });
    const toggle = createElement(actions, "button", {
      className: `action-btn ${toggleClass}`,
      text: toggleLabel,
      attributes: {
        type: "button",
        "data-toggle-uid": map.uid || "",
        "data-tracked": tracked,
      },
    });
    toggle.disabled = !canManage;
    els.adminMapRows.appendChild(row);
  });
}
function renderRuns() {
  clearElement(els.adminRunsList);

  if (!state.runs.length) {
    const li = document.createElement("li");
    createElement(li, "strong", { text: "No runs yet" });
    createElement(li, "span", { text: "Tracker has not completed a persisted run." });
    els.adminRunsList.appendChild(li);
    return;
  }

  state.runs.forEach((run) => {
    const li = document.createElement("li");
    const changeName = TRACKER_MODE === "leaderboard" ? "top changes" : "WR changes";
    createElement(li, "strong", {
      text: `Run #${run.runId || "?"} \u00B7 ${run.wrChanges || 0} ${changeName}`,
    });
    createElement(li, "span", {
      text: `Checked ${run.mapsChecked || 0} / ${run.mapsConsidered || 0} maps \u00B7 ${run.provider || "unknown"}`,
    });
    createElement(li, "span", { text: `${fmtDate(run.finishedAt)} (${fmtAgo(run.finishedAt)})` });
    els.adminRunsList.appendChild(li);
  });
}
function renderFeed() {
  const feed = state.wrFeed;

  if (!feed.length) {
    clearElement(els.adminFeedList);
    els.adminFeedList.appendChild(els.adminFeedEmpty);
    els.adminFeedEmpty.hidden = false;
    return;
  }

  els.adminFeedEmpty.hidden = true;
  clearElement(els.adminFeedList);
  els.adminFeedNote.textContent = `${feed.length} entries`;

  feed.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "feed-card";

    const { mapName, holder, newWr, oldWr, ago } = readFeedEntry(entry);

    const cardTop = createElement(card, "div", { className: "feed-card-top" });
    createElement(cardTop, "span", { className: "feed-icon", text: "\u2B50" });
    createElement(cardTop, "span", { className: "feed-map-name", text: mapName });
    createElement(cardTop, "span", { className: "feed-time", text: ago });

    const detail = createElement(card, "div", { className: "feed-detail" });
    createElement(detail, "span", { className: "wr-improvement", text: fmtMs(newWr) });
    if (oldWr && newWr && oldWr !== newWr) {
      createElement(detail, "span", { className: "wr-arrow", text: "\u2190" });
      appendText(detail, fmtMs(oldWr));
    }
    appendText(detail, " \u00B7 by ");
    createElement(detail, "span", { className: "feed-holder", text: holder });
    els.adminFeedList.appendChild(card);
  });
}
function renderLog() {
  clearElement(els.adminLogList);
  if (!state.adminLog.length) {
    const li = document.createElement("li");
    li.textContent = "No operations yet.";
    els.adminLogList.appendChild(li);
    return;
  }
  state.adminLog.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = entry;
    els.adminLogList.appendChild(li);
  });
}
function renderAll() {
  renderAuth();
  renderStats();
  renderEngine();
  renderOverview();
  renderMaps();
  renderRuns();
  renderFeed();
  renderLog();
}
async function loadData({ silent = false } = {}) {
  const feedPath =
    TRACKER_MODE === "leaderboard" ? "/api/v1/leaderboard/latest?limit=100" : "/api/v1/wr/latest?limit=100";
  try {
    const [statusRes, runsRes, mapsRes, wrRes, authRes] = await Promise.allSettled([
      api("/api/v1/tracker/status"),
      api("/api/v1/tracker/runs?limit=50"),
      api("/api/v1/maps?limit=5000"),
      api(feedPath),
      api("/api/v1/admin/auth/status"),
    ]);

    if (statusRes.status === "fulfilled") state.status = statusRes.value;
    if (runsRes.status === "fulfilled") {
      state.runs = Array.isArray(runsRes.value?.runs) ? runsRes.value.runs : [];
    }
    if (mapsRes.status === "fulfilled") {
      state.maps = Array.isArray(mapsRes.value?.maps) ? mapsRes.value.maps : [];
    }
    if (wrRes.status === "fulfilled") {
      const payload = wrRes.value;
      state.wrFeed = Array.isArray(payload?.feed)
        ? payload.feed
        : Array.isArray(payload?.entries)
          ? payload.entries
          : Array.isArray(payload)
            ? payload
            : [];
    }
    if (authRes.status === "fulfilled") {
      state.auth = authRes.value;
      if (!state.auth?.authenticated && !state.auth?.openMode) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`${routes.admin("login")}?next=${next}`);
        return;
      }
    }

    renderAll();
  } catch (error) {
    if (!silent) {
      pushLog(`Data load error: ${error.message}`);
    }
  }
}
async function toggleTracking(uid, currentlyTracked) {
  const newTracked = !currentlyTracked;
  try {
    await api(`/api/v1/admin/maps/${encodeURIComponent(uid)}/tracking`, {
      method: "POST",
      body: { tracked: newTracked },
    });
    pushLog(`${newTracked ? "Tracked" : "Untracked"} map ${uid}`);
    await loadData({ silent: true });
  } catch (error) {
    pushLog(`Toggle tracking failed for ${uid}: ${error.message}`);
  }
}
async function runNow() {
  els.runNowBtn.disabled = true;
  const orig = els.runNowBtn.textContent;
  els.runNowBtn.textContent = "Running\u2026";
  try {
    await api("/api/v1/admin/tracker/run-now", { method: "POST", body: {} });
    pushLog("Manual tracker run triggered.");
    await loadData({ silent: true });
  } catch (error) {
    pushLog(`Run now failed: ${error.message}`);
  } finally {
    els.runNowBtn.disabled = false;
    els.runNowBtn.textContent = orig;
  }
}

async function logout() {
  try {
    await api("/api/v1/admin/auth/logout", {
      method: "POST",
      body: {},
    });
  } catch {}
  window.location.replace(`${routes.admin("login")}?logged_out=1`);
}
function validateBulkJson() {
  const raw = els.bulkInput.value.trim();
  if (!raw) {
    els.bulkStatus.textContent = "Paste JSON and click Import.";
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    const maps = Array.isArray(parsed) ? parsed : parsed?.maps;
    if (!Array.isArray(maps) || !maps.length) {
      els.bulkStatus.textContent = "JSON must be an array of maps or { maps: [...] }.";
      return null;
    }
    els.bulkStatus.textContent = `Valid JSON: ${maps.length} maps ready to import.`;
    return maps;
  } catch (e) {
    els.bulkStatus.textContent = `Invalid JSON: ${e.message}`;
    return null;
  }
}

async function bulkImport(event) {
  event.preventDefault();
  const maps = validateBulkJson();
  if (!maps) return;

  els.bulkForm.querySelector(".btn-main").disabled = true;
  els.bulkStatus.textContent = "Importing\u2026";
  try {
    const result = await api("/api/v1/admin/maps/bulk-upsert", {
      method: "POST",
      body: { maps },
    });
    const upserted = result?.upserted || result?.count || maps.length;
    pushLog(`Bulk import completed: ${upserted} maps upserted.`);
    els.bulkStatus.textContent = `Import successful: ${upserted} maps upserted.`;
    await loadData({ silent: true });
  } catch (error) {
    pushLog(`Bulk import failed: ${error.message}`);
    els.bulkStatus.textContent = `Import failed: ${error.message}`;
  } finally {
    els.bulkForm.querySelector(".btn-main").disabled = false;
  }
}
function bindEvents() {
  els.tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveTab(btn.getAttribute("data-admin-tab") || "overview");
    });
  });

  els.runNowBtn.addEventListener("click", runNow);
  if (els.adminLogoutBtn) {
    els.adminLogoutBtn.addEventListener("click", logout);
  }

  els.adminMapSearch.addEventListener("input", (e) => {
    state.filters.search = e.target.value;
    renderMaps();
  });

  els.adminMapFilter.addEventListener("change", (e) => {
    state.filters.trackingFilter = e.target.value;
    renderMaps();
  });

  els.adminMapRows.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-toggle-uid]");
    if (!btn) return;
    const uid = btn.getAttribute("data-toggle-uid");
    const tracked = btn.getAttribute("data-tracked") === "true";
    btn.disabled = true;
    toggleTracking(uid, tracked).finally(() => {
      btn.disabled = false;
    });
  });

  els.bulkForm.addEventListener("submit", bulkImport);
  els.bulkValidateBtn.addEventListener("click", validateBulkJson);
}
async function boot() {
  applySiteDataLinks().catch(() => {});
  applyModeUI();
  renderAuth();
  setActiveTab(getInitialTab(), { persist: false });
  bindEvents();
  renderLog();
  await loadData();
  window.setInterval(() => loadData({ silent: true }), REFRESH_MS);
}

boot();
