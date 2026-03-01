const REFRESH_MS = 30000;
const TAB_KEY = "tracker_admin_tab";
const VALID_TABS = new Set(["overview", "maps", "bulk-import", "run-history", "wr-feed"]);
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
function getAdminToken() {
  try {
    const url = new URL(window.location.href);
    const qt = url.searchParams.get("admin_token");
    if (qt && qt.trim()) {
      window.localStorage.setItem("tracker_admin_token", qt.trim());
      return qt.trim();
    }
    return window.localStorage.getItem("tracker_admin_token") || "";
  } catch {
    return "";
  }
}

const ADMIN_TOKEN = getAdminToken();
const $ = (id) => document.getElementById(id);

const els = {
  authNote:        $("authNote"),
  adminLogoutBtn:  $("admin-logout-btn"),
  statTracked:     $("stat-tracked"),
  statDue:         $("stat-due"),
  statChanges:     $("stat-changes"),
  statEngine:      $("stat-engine"),
  runNowBtn:       $("run-now-btn"),
  engineProvider:  $("engine-provider"),
  engineTick:      $("engine-tick"),
  engineStatus:    $("engine-status"),
  engineStarted:   $("engine-started"),
  engineFinished:  $("engine-finished"),
  engineError:     $("engine-error"),
  overviewLatest:  $("overview-latest-run"),
  overviewRuns:    $("overview-recent-runs"),
  adminMapsCount:  $("admin-maps-count"),
  adminMapSearch:  $("admin-map-search"),
  adminMapFilter:  $("admin-map-filter"),
  adminMapRows:    $("admin-map-rows"),
  bulkForm:        $("bulk-import-form"),
  bulkInput:       $("bulk-json-input"),
  bulkValidateBtn: $("bulk-validate-btn"),
  bulkStatus:      $("bulk-status"),
  adminRunsList:   $("admin-runs-list"),
  adminFeedNote:   $("admin-feed-note"),
  adminFeedList:   $("admin-feed-list"),
  adminFeedEmpty:  $("admin-feed-empty"),
  adminLogList:    $("admin-log-list"),
  tabButtons:      Array.from(document.querySelectorAll("[data-admin-tab]")),
  tabPanels:       Array.from(document.querySelectorAll("[data-tab-panel]")),
};
async function api(path, { method = "GET", body, admin = false } = {}) {
  const headers = body ? { "content-type": "application/json" } : {};
  if (admin && ADMIN_TOKEN) headers["x-admin-token"] = ADMIN_TOKEN;
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}
function fmtMs(ms) {
  const v = Math.max(0, Number(ms) || 0);
  const m = Math.floor(v / 60000);
  const s = Math.floor((v % 60000) / 1000);
  const f = v % 1000;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(f).padStart(3, "0")}`;
}

function fmtAgo(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "\u2014";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60)    return `${sec}s ago`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function fmtDate(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleString(undefined, {
    month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, hourCycle: "h23",
  });
}
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
function configureLinks() {
  const host = window.location.hostname.toLowerCase();
  const port = window.location.port || "80";
  const isLocal = host.endsWith(".localhost") || host === "localhost" || host === "127.0.0.1";
  if (!isLocal) return;

  const targets = {
    main:    `http://xjk.localhost:${port}/`,
    altered: `http://altered.localhost:${port}/`,
    tools:   `http://tools.localhost:${port}/`,
    plugins: `http://plugins.localhost:${port}/`,
  };

  document.querySelectorAll("[data-link]").forEach((node) => {
    const key = node.getAttribute("data-link");
    if (targets[key]) node.setAttribute("href", targets[key]);
  });
}
function getInitialTab() {
  const hash = String(window.location.hash || "").replace(/^#/, "").trim();
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
    try { window.localStorage.setItem(TAB_KEY, next); } catch {}
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

  if (auth.credentialsEnabled) {
    els.authNote.textContent = "Auth required";
    return;
  }

  if (ADMIN_TOKEN) {
    els.authNote.textContent = "Auth: token provided (not accepted)";
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
  els.statEngine.textContent = rt
    ? (rt.timerActive ? "running" : "idle")
    : "offline";
}
function renderEngine() {
  const rt = state.status?.runtime;
  if (!rt) {
    els.engineProvider.textContent = "\u2014";
    els.engineTick.textContent = "\u2014";
    els.engineStatus.textContent = "offline";
    els.engineStarted.textContent = "\u2014";
    els.engineFinished.textContent = "\u2014";
    els.engineError.textContent = "n/a";
    return;
  }

  els.engineProvider.textContent = rt.provider || "unknown";
  els.engineTick.textContent = `${rt.tickSeconds || "\u2014"}s`;
  els.engineStatus.textContent = rt.timerActive ? "running" : "idle";
  els.engineStarted.textContent = rt.lastStartedAt ? fmtAgo(rt.lastStartedAt) : "\u2014";
  els.engineFinished.textContent = rt.lastFinishedAt ? fmtAgo(rt.lastFinishedAt) : "\u2014";
  els.engineError.textContent = rt.lastError?.message || "none";
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

  els.overviewRuns.innerHTML = "";
  const recentRuns = state.runs.slice(0, 6);
  if (!recentRuns.length) {
    const li = document.createElement("li");
    li.innerHTML = "<strong>No runs yet</strong><span>Tracker has not completed any runs.</span>";
    els.overviewRuns.appendChild(li);
    return;
  }

  recentRuns.forEach((run) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>Run #${run.runId || "?"} \u00B7 ${run.wrChanges || 0} changes</strong>
      <span>Checked ${run.mapsChecked || 0}/${run.mapsConsidered || 0} \u00B7 ${run.provider || "unknown"} \u00B7 ${fmtAgo(run.finishedAt)}</span>
    `;
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
    .filter((m) => {
      if (!q) return true;
      return (
        String(m.name || "").toLowerCase().includes(q) ||
        String(m.uid || "").toLowerCase().includes(q) ||
        String(m.wrHolder || "").toLowerCase().includes(q) ||
        String(m.campaign || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (a.tracked !== b.tracked) return a.tracked ? -1 : 1;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
}

function renderMaps() {
  const maps = getFilteredMaps();
  const canManage = Boolean(state.auth?.authenticated || state.auth?.openMode);
  els.adminMapsCount.textContent = `${maps.length} maps`;
  els.adminMapRows.innerHTML = "";

  if (!maps.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="7" style="text-align:center;color:var(--ink-muted);padding:1.5rem;">No maps match the current filter.</td>';
    els.adminMapRows.appendChild(row);
    return;
  }

  maps.forEach((map) => {
    const row = document.createElement("tr");
    const tracked = Boolean(map.tracked);
    const flag = tracked
      ? '<span class="flag flag-tracked">tracked</span>'
      : '<span class="flag flag-untracked">untracked</span>';
    const interval = map.checkIntervalSeconds
      ? `${map.checkIntervalSeconds}s`
      : map.check_interval_seconds
        ? `${map.check_interval_seconds}s`
        : "\u2014";
    const toggleLabel = tracked ? "Untrack" : "Track";
    const toggleClass = tracked ? "is-tracked" : "is-untracked";
    const disabledAttr = canManage ? "" : "disabled";

    row.innerHTML = `
      <td><strong>${map.name || "Unknown"}</strong><br/><span>${map.uid || "\u2014"}</span></td>
      <td>${map.campaign || "Unassigned"} #${map.slot || 0}</td>
      <td>${fmtMs(map.wrMs || map.wr_ms || 0)}</td>
      <td>${map.wrHolder || map.wr_holder || "\u2014"}</td>
      <td>${flag}</td>
      <td>${interval}</td>
      <td>
        <div class="map-actions">
          <button class="action-btn ${toggleClass}" type="button" data-toggle-uid="${map.uid}" data-tracked="${tracked}" ${disabledAttr}>${toggleLabel}</button>
        </div>
      </td>
    `;
    els.adminMapRows.appendChild(row);
  });
}
function renderRuns() {
  els.adminRunsList.innerHTML = "";

  if (!state.runs.length) {
    const li = document.createElement("li");
    li.innerHTML = "<strong>No runs yet</strong><span>Tracker has not completed a persisted run.</span>";
    els.adminRunsList.appendChild(li);
    return;
  }

  state.runs.forEach((run) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>Run #${run.runId || "?"} \u00B7 ${run.wrChanges || 0} WR changes</strong>
      <span>Checked ${run.mapsChecked || 0} / ${run.mapsConsidered || 0} maps \u00B7 ${run.provider || "unknown"}</span>
      <span>${fmtDate(run.finishedAt)} (${fmtAgo(run.finishedAt)})</span>
    `;
    els.adminRunsList.appendChild(li);
  });
}
function renderFeed() {
  const feed = state.wrFeed;

  if (!feed.length) {
    els.adminFeedList.innerHTML = "";
    els.adminFeedList.appendChild(els.adminFeedEmpty);
    els.adminFeedEmpty.hidden = false;
    return;
  }

  els.adminFeedEmpty.hidden = true;
  els.adminFeedList.innerHTML = "";
  els.adminFeedNote.textContent = `${feed.length} entries`;

  feed.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "feed-card";

    const mapName = entry.mapName || entry.name || entry.map_name || "Unknown";
    const holder = entry.holder || entry.wrHolder || entry.wr_holder || "\u2014";
    const newWr = entry.newWrMs || entry.wrMs || entry.wr_ms || 0;
    const oldWr = entry.oldWrMs || entry.previousWrMs || 0;
    const updatedAt = entry.updatedAt || entry.at || entry.wrUpdatedAt || "";
    const ago = fmtAgo(updatedAt);

    const timeDetail = oldWr && newWr && oldWr !== newWr
      ? `<span class="wr-improvement">${fmtMs(newWr)}</span><span class="wr-arrow">&larr;</span>${fmtMs(oldWr)}`
      : `<span class="wr-improvement">${fmtMs(newWr)}</span>`;

    card.innerHTML = `
      <div class="feed-card-top">
        <span class="feed-icon">\u2B50</span>
        <span class="feed-map-name">${mapName}</span>
        <span class="feed-time">${ago}</span>
      </div>
      <div class="feed-detail">
        ${timeDetail}
        &nbsp;&middot;&nbsp; by <span class="feed-holder">${holder}</span>
      </div>
    `;
    els.adminFeedList.appendChild(card);
  });
}
function renderLog() {
  els.adminLogList.innerHTML = "";
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
  try {
    const [statusRes, runsRes, mapsRes, wrRes, authRes] = await Promise.allSettled([
      api("/api/v1/tracker/status"),
      api("/api/v1/tracker/runs?limit=50"),
      api("/api/v1/maps?limit=5000"),
      api("/api/v1/wr/latest?limit=100"),
      api("/api/v1/admin/auth/status", { admin: true }),
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
      state.wrFeed = Array.isArray(payload?.feed) ? payload.feed
        : Array.isArray(payload?.entries) ? payload.entries
        : Array.isArray(payload) ? payload
        : [];
    }
    if (authRes.status === "fulfilled") {
      state.auth = authRes.value;
      if (!state.auth?.authenticated && !state.auth?.openMode) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`/admin/login?next=${next}`);
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
      admin: true,
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
    await api("/api/v1/admin/tracker/run-now", { method: "POST", body: {}, admin: true });
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
      admin: true,
    });
  } catch {}
  window.location.replace("/admin/login?logged_out=1");
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
      admin: true,
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
    toggleTracking(uid, tracked).finally(() => { btn.disabled = false; });
  });

  els.bulkForm.addEventListener("submit", bulkImport);
  els.bulkValidateBtn.addEventListener("click", validateBulkJson);
}
async function boot() {
  configureLinks();
  renderAuth();
  setActiveTab(getInitialTab(), { persist: false });
  bindEvents();
  renderLog();
  await loadData();
  window.setInterval(() => loadData({ silent: true }), REFRESH_MS);
}

boot();


