const FALLBACK_REFRESH_MS = 5000;
const STREAM_RECONNECT_MS = 3000;
const FRESH_THRESHOLD_MS = 5 * 60 * 1000;
const MAPS_PER_PAGE = 25;
const state = {
  mode: "wr",
  status: null,
  maps: [],
  runs: [],
  wrFeed: [],
  liveChecks: [],
  filters: { search: "", dueOnly: false },
  pagination: { page: 1, totalPages: 1 },
  activeTab: "live-feed",
  stream: {
    source: null,
    connected: false,
    reconnectTimer: null,
  },
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
  headerBadge:   $("header-badge"),
  headerTitle:   $("header-title"),
  headerSub:     $("header-sub"),
  statChangesLabel: $("stat-changes-label"),
  feedTitle:     $("feed-title"),
  feedEmptyText: $("feed-empty-text"),
  checkStreamTitle: $("check-stream-title"),
  footMark:      $("foot-mark"),
  statTracked:   $("stat-tracked"),
  statDue:       $("stat-due"),
  statChanges:   $("stat-changes"),
  statLastRun:   $("stat-last-run"),
  spotlight:     $("spotlight"),
  spotlightMap:  $("spotlight-map"),
  spotlightDetail: $("spotlight-detail"),
  spotlightWr:   $("spotlight-wr"),
  feedNote:      $("feed-note"),
  feedList:      $("feed-list"),
  feedEmpty:     $("feed-empty"),
  checkFeedNote: $("check-feed-note"),
  checkFeedList: $("check-feed-list"),
  checkFeedEmpty:$("check-feed-empty"),
  mapsCount:     $("maps-count"),
  mapSearch:     $("map-search"),
  dueOnly:       $("due-only"),
  mapRows:       $("map-rows"),
  pageInfo:      $("page-info"),
  pagePrev:      $("page-prev"),
  pageNext:      $("page-next"),
  engineProvider: $("engine-provider"),
  engineTick:    $("engine-tick"),
  engineStatus:  $("engine-status"),
  engineStarted: $("engine-started"),
  engineFinished:$("engine-finished"),
  engineError:   $("engine-error"),
  runNowBtn:     $("run-now-btn"),
  runsList:      $("runs-list"),
};

const HAS_CHECK_FEED =
  Boolean(els.checkFeedNote) &&
  Boolean(els.checkFeedList) &&
  Boolean(els.checkFeedEmpty);
async function api(path, { method = "GET", body, admin = false } = {}) {
  const headers = body ? { "content-type": "application/json" } : {};
  if (admin && ADMIN_TOKEN) headers["x-admin-token"] = ADMIN_TOKEN;
  const res = await fetch(path, {
    method,
    cache: "no-store",
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

function applyModeUI() {
  const isLeaderboard = state.mode === "leaderboard";
  if (els.headerBadge) {
    els.headerBadge.textContent = isLeaderboard ? "Leaderboard" : "World Records";
  }
  if (els.headerTitle) {
    els.headerTitle.textContent = isLeaderboard ? "leaderboard." : "wr.";
  }
  if (els.headerSub) {
    els.headerSub.textContent = isLeaderboard
      ? "Top-N leaderboard monitoring for Trackmania maps, with live check stream and snapshot updates."
      : "Real-time world-record monitoring for Trackmania \u2014 powering WR alerts and live map status.";
  }
  if (els.statChangesLabel) {
    els.statChangesLabel.textContent = isLeaderboard ? "Top Changes" : "WR Changes";
  }
  if (els.feedTitle) {
    els.feedTitle.textContent = isLeaderboard ? "Leaderboard Top Changes" : "WR Changes";
  }
  if (els.feedEmptyText) {
    els.feedEmptyText.textContent = isLeaderboard
      ? "Waiting for leaderboard data\u2026"
      : "Waiting for world-record data\u2026";
  }
  if (els.checkStreamTitle) {
    els.checkStreamTitle.textContent = isLeaderboard ? "Leaderboard Check Stream" : "Check Stream";
  }
  if (els.footMark) {
    els.footMark.textContent = isLeaderboard
      ? "trackers.xjk.yt/leaderboard"
      : "trackers.xjk.yt/wr";
  }
  document.title = isLeaderboard
    ? "xjk / leaderboard"
    : "xjk / world records";
}
function switchTab(tabId) {
  state.activeTab = tabId;

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tabId);
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `tab-${tabId}`);
  });
  history.replaceState(null, "", `#${tabId}`);
}
function renderStats() {
  const tracked = Number(state.status?.summary?.trackedMaps || 0);
  const due     = Number(state.status?.trackedDueNow || 0);
  const latest  = state.status?.latestRun;
  const totalChanges = state.runs.reduce((sum, r) => sum + (Number(r.wrChanges) || 0), 0);

  els.statTracked.textContent = String(tracked);
  els.statDue.textContent     = String(due);
  els.statChanges.textContent = String(totalChanges);
  els.statLastRun.textContent = latest
    ? `#${latest.runId || "\u2014"} \u00B7 ${fmtAgo(latest.finishedAt)}`
    : "\u2014";
}
function renderSpotlight(entry) {
  if (!els.spotlight || !entry) return;

  const mapName = entry.mapName || entry.name || entry.map_name || "Unknown";
  const holder  = entry.newHolder || entry.holder || entry.wrHolder || "\u2014";
  const wrMs    = entry.newWrMs || entry.wrMs || entry.wr_ms || 0;
  const changed = Boolean(entry.changed);
  const ago     = fmtAgo(entry.checkedAt || entry.updatedAt || entry.at || "");

  els.spotlightMap.textContent = mapName;
  els.spotlightWr.textContent = fmtMs(wrMs);

  if (changed) {
    const oldMs = entry.oldWrMs || entry.previousWrMs || 0;
    els.spotlightDetail.textContent = `WR changed! ${fmtMs(oldMs)} \u2192 ${fmtMs(wrMs)} \u00B7 by ${holder} \u00B7 ${ago}`;
  } else {
    els.spotlightDetail.textContent = `WR ${fmtMs(wrMs)} \u00B7 by ${holder} \u00B7 ${ago}`;
  }

  els.spotlight.classList.add("is-active");
  els.spotlight.style.transition = "none";
  els.spotlight.style.borderColor = changed
    ? "rgba(240, 191, 103, 0.6)"
    : "rgba(105, 214, 212, 0.4)";
  requestAnimationFrame(() => {
    els.spotlight.style.transition = "border-color 1.5s ease";
    els.spotlight.style.borderColor = "";
  });
}
function renderFeed() {
  const feed = state.wrFeed;
  const now = Date.now();

  if (!feed.length) {
    els.feedList.innerHTML = "";
    els.feedList.appendChild(els.feedEmpty);
    els.feedEmpty.hidden = false;
    return;
  }

  els.feedEmpty.hidden = true;
  els.feedList.innerHTML = "";

  feed.forEach((entry) => {
    const card = document.createElement("article");
    const updatedAt = entry.updatedAt || entry.at || entry.wrUpdatedAt || "";
    const isFresh = updatedAt && (now - Date.parse(updatedAt)) < FRESH_THRESHOLD_MS;
    card.className = `feed-card${isFresh ? " is-fresh" : ""}`;

    const mapName = entry.mapName || entry.name || entry.map_name || "Unknown";
    const holder  = entry.holder || entry.wrHolder || entry.wr_holder || "\u2014";
    const newWr   = entry.newWrMs || entry.wrMs || entry.wr_ms || 0;
    const oldWr   = entry.oldWrMs || entry.previousWrMs || 0;
    const ago     = fmtAgo(updatedAt);

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
    els.feedList.appendChild(card);
  });
}
function renderLiveChecks() {
  if (!HAS_CHECK_FEED) return;
  const items = state.liveChecks;
  els.checkFeedList.innerHTML = "";

  if (!items.length) {
    els.checkFeedList.appendChild(els.checkFeedEmpty);
    els.checkFeedEmpty.hidden = false;
    return;
  }

  els.checkFeedEmpty.hidden = true;

  items.forEach((entry) => {
    const card = document.createElement("article");
    const isError = String(entry.note || "").toLowerCase().startsWith("error:");
    const changed = Boolean(entry.changed);
    card.className = `check-card${changed ? " is-changed" : ""}`;

    let pillClass = "check-pill-ok";
    let pillText = "checked";
    if (isError) {
      pillClass = "check-pill-error";
      pillText = "error";
    } else if (changed) {
      pillClass = "check-pill-change";
      pillText = "wr changed";
    }

    const mapName = entry.mapName || "Unknown";
    const campaignLabel = entry.campaign
      ? `${entry.campaign} #${Number(entry.slot) || 0}`
      : "Unassigned";
    const wrDetail = changed
      ? `${fmtMs(entry.newWrMs || 0)} \u2190 ${fmtMs(entry.oldWrMs || 0)}`
      : fmtMs(entry.newWrMs || entry.oldWrMs || 0);
    const progress = Number.isFinite(entry.progressCurrent) && Number.isFinite(entry.progressTotal)
      ? `${entry.progressCurrent}/${entry.progressTotal}`
      : "\u2014";

    card.innerHTML = `
      <div class="check-card-top">
        <span class="check-map-name">${mapName}</span>
        <span class="check-time">${fmtAgo(entry.checkedAt)}</span>
      </div>
      <div class="check-meta">
        <span class="check-pill ${pillClass}">${pillText}</span>
        <span>${campaignLabel}</span>
        <span>wr ${wrDetail}</span>
        <span>source ${entry.source || "unknown"}</span>
        <span>progress ${progress}</span>
      </div>
    `;
    els.checkFeedList.appendChild(card);
  });
}
function getFilteredMaps() {
  const q = state.filters.search.toLowerCase().trim();
  return state.maps
    .filter((m) => (state.filters.dueOnly ? m.dueNow : true))
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
      if (a.dueNow !== b.dueNow) return a.dueNow ? -1 : 1;
      return (Number(a.nextCheckInSeconds) || 0) - (Number(b.nextCheckInSeconds) || 0);
    });
}

function renderMaps() {
  const allFiltered = getFilteredMaps();
  const total = allFiltered.length;
  const totalPages = Math.max(1, Math.ceil(total / MAPS_PER_PAGE));
  if (state.pagination.page > totalPages) state.pagination.page = totalPages;
  if (state.pagination.page < 1) state.pagination.page = 1;
  state.pagination.totalPages = totalPages;

  const start = (state.pagination.page - 1) * MAPS_PER_PAGE;
  const pageItems = allFiltered.slice(start, start + MAPS_PER_PAGE);

  els.mapsCount.textContent = `${total} maps`;
  els.mapRows.innerHTML = "";

  if (!pageItems.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="6" style="text-align:center;color:var(--ink-muted);padding:1.5rem;">No maps match the current filter.</td>';
    els.mapRows.appendChild(row);
  } else {
    pageItems.forEach((map) => {
      const row = document.createElement("tr");
      const flag = map.dueNow
        ? '<span class="flag flag-due">due now</span>'
        : '<span class="flag flag-wait">scheduled</span>';
      const next = map.dueNow
        ? "now"
        : map.nextCheckInSeconds
          ? `${map.nextCheckInSeconds}s`
          : "\u2014";

      row.innerHTML = `
        <td><strong>${map.name || "Unknown"}</strong><br /><span>${map.uid || "\u2014"}</span></td>
        <td>${map.campaign || "Unassigned"} #${map.slot || 0}</td>
        <td>${fmtMs(map.wrMs || 0)}</td>
        <td>${map.wrHolder || "\u2014"}</td>
        <td>${flag}</td>
        <td>${next}</td>
      `;
      els.mapRows.appendChild(row);
    });
  }
  els.pageInfo.textContent = `Page ${state.pagination.page} of ${totalPages}`;
  els.pagePrev.disabled = state.pagination.page <= 1;
  els.pageNext.disabled = state.pagination.page >= totalPages;
}
function renderEngine() {
  const rt = state.status?.runtime;

  if (!rt) {
    els.engineProvider.textContent = "\u2014";
    els.engineTick.textContent     = "\u2014";
    els.engineStatus.textContent   = "offline";
    els.engineStarted.textContent  = "\u2014";
    els.engineFinished.textContent = "\u2014";
    els.engineError.textContent    = "n/a";
    return;
  }

  els.engineProvider.textContent = rt.provider || "unknown";
  els.engineTick.textContent     = `${rt.tickSeconds || "\u2014"}s`;
  els.engineStatus.textContent   = rt.timerActive ? "running" : "idle";
  els.engineStarted.textContent  = rt.lastStartedAt ? fmtAgo(rt.lastStartedAt) : "\u2014";
  els.engineFinished.textContent = rt.lastFinishedAt ? fmtAgo(rt.lastFinishedAt) : "\u2014";
  els.engineError.textContent    = rt.lastError?.message || "none";
}
function renderRuns() {
  els.runsList.innerHTML = "";

  if (!state.runs.length) {
    const li = document.createElement("li");
    li.innerHTML = "<strong>No runs yet</strong><span>No persisted runs recorded.</span>";
    els.runsList.appendChild(li);
    return;
  }

  state.runs.forEach((run) => {
    const li = document.createElement("li");
    const changeLabel = state.mode === "leaderboard" ? "top changes" : "changes";
    li.innerHTML = `
      <strong>Run #${run.runId || "?"} \u00B7 ${run.wrChanges || 0} ${changeLabel}</strong>
      <span>Checked ${run.mapsChecked || 0}/${run.mapsConsidered || 0} maps \u00B7 ${run.provider || "unknown"}</span>
      <span>${fmtDate(run.finishedAt)} (${fmtAgo(run.finishedAt)})</span>
    `;
    els.runsList.appendChild(li);
  });
}
function renderAll() {
  renderStats();
  renderFeed();
  renderLiveChecks();
  renderMaps();
  renderEngine();
  renderRuns();
}
async function refreshData({ silent = false } = {}) {
  try {
    const [status, runs] = await Promise.allSettled([
      api("api/v1/tracker/status"),
      api("api/v1/tracker/runs?limit=20"),
    ]);

    if (status.status === "fulfilled") {
      state.status = status.value;
      state.mode = String(status.value?.runtime?.mode || "wr").toLowerCase() === "leaderboard"
        ? "leaderboard"
        : "wr";
      applyModeUI();
    }
    if (runs.status === "fulfilled") state.runs = Array.isArray(runs.value?.runs) ? runs.value.runs : [];

    const feedPath =
      state.mode === "leaderboard" ? "api/v1/leaderboard/latest?limit=30" : "api/v1/wr/latest?limit=30";
    try {
      const payload = await api(feedPath);
      state.wrFeed = Array.isArray(payload?.feed)
        ? payload.feed
        : Array.isArray(payload?.entries)
          ? payload.entries
          : Array.isArray(payload)
            ? payload
            : [];
    } catch {
      state.wrFeed = [];
    }

    renderStats();
    renderFeed();
    renderEngine();
    renderRuns();
    if (state.wrFeed.length) {
      renderSpotlight(state.wrFeed[0]);
    }
    api("api/v1/tracked/maps?limit=2000")
      .then((tracked) => {
        state.maps = Array.isArray(tracked?.maps) ? tracked.maps : [];
        renderMaps();
      })
      .catch((error) => {
        if (!silent) {
          els.engineError.textContent = error.message;
        }
      });
  } catch (error) {
    if (!silent) {
      els.engineStatus.textContent = "error";
      els.engineError.textContent  = error.message;
    }
  }
}

let queuedRefresh = false;

function queueRefresh() {
  if (queuedRefresh) return;
  queuedRefresh = true;
  window.setTimeout(async () => {
    queuedRefresh = false;
    await refreshData({ silent: true });
  }, 120);
}

function addLiveCheck(rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const map = payload.map && typeof payload.map === "object" ? payload.map : {};
  const wr = payload.wr && typeof payload.wr === "object" ? payload.wr : {};
  const progress = payload.progress && typeof payload.progress === "object" ? payload.progress : {};

  const record = {
    checkedAt: payload.at || new Date().toISOString(),
    mapUid: String(map.uid || ""),
    mapName: String(map.name || "Unknown"),
    campaign: String(map.campaign || ""),
    slot: Number(map.slot || 0),
    changed: Boolean(wr.changed),
    oldWrMs: Number(wr.oldMs || 0),
    newWrMs: Number(wr.newMs || 0),
    oldHolder: String(wr.oldHolder || ""),
    newHolder: String(wr.newHolder || ""),
    source: String(payload.source || "unknown"),
    note: String(payload.note || "checked"),
    progressCurrent: Number(progress.current || 0),
    progressTotal: Number(progress.total || 0),
  };

  const progressLabel =
    Number.isFinite(record.progressCurrent) && Number.isFinite(record.progressTotal) && record.progressTotal > 0
      ? `${record.progressCurrent}/${record.progressTotal}`
      : "1/1";
  if (els.feedNote) {
    els.feedNote.textContent = `Live: checked ${progressLabel} - ${record.mapName}`;
  }
  renderSpotlight(record);

  if (!HAS_CHECK_FEED) {
    state.wrFeed.unshift({
      at: record.checkedAt,
      mapName: `[Checked] ${record.mapName}`,
      holder: record.newHolder || record.oldHolder || "-",
      newWrMs: record.newWrMs || record.oldWrMs || 0,
      oldWrMs: record.changed ? record.oldWrMs : 0,
    });
    if (state.wrFeed.length > 30) {
      state.wrFeed.length = 30;
    }
    renderFeed();
    return;
  }

  state.liveChecks.unshift(record);
  if (state.liveChecks.length > 50) {
    state.liveChecks.length = 50;
  }
  els.checkFeedNote.textContent = `Latest: ${record.mapName} (${fmtAgo(record.checkedAt)})`;
  renderLiveChecks();
}

function clearStreamReconnectTimer() {
  if (!state.stream.reconnectTimer) return;
  window.clearTimeout(state.stream.reconnectTimer);
  state.stream.reconnectTimer = null;
}

function updateFeedNote() {
  if (state.stream.connected) {
    els.feedNote.textContent = "Live stream connected";
    if (HAS_CHECK_FEED && !state.liveChecks.length) {
      els.checkFeedNote.textContent = "Live stream connected. Waiting for checked maps...";
    }
    return;
  }
  if (!window.EventSource) {
    els.feedNote.textContent = `Auto-updates every ${Math.floor(FALLBACK_REFRESH_MS / 1000)}s`;
    if (HAS_CHECK_FEED && !state.liveChecks.length) {
      els.checkFeedNote.textContent = `Fallback refresh every ${Math.floor(FALLBACK_REFRESH_MS / 1000)}s`;
    }
    return;
  }
  els.feedNote.textContent = `Reconnecting live stream (fallback ${Math.floor(FALLBACK_REFRESH_MS / 1000)}s)`;
  if (HAS_CHECK_FEED && !state.liveChecks.length) {
    els.checkFeedNote.textContent = "Reconnecting check stream...";
  }
}

function scheduleStreamReconnect() {
  if (state.stream.reconnectTimer) return;
  state.stream.reconnectTimer = window.setTimeout(() => {
    state.stream.reconnectTimer = null;
    connectStream();
  }, STREAM_RECONNECT_MS);
}

function cleanupStream() {
  if (state.stream.source) {
    try {
      state.stream.source.close();
    } catch { }
    state.stream.source = null;
  }
  state.stream.connected = false;
}

function connectStream() {
  if (!window.EventSource) {
    updateFeedNote();
    return;
  }

  cleanupStream();

  const source = new EventSource("api/v1/stream");
  state.stream.source = source;

  source.addEventListener("open", () => {
    clearStreamReconnectTimer();
    state.stream.connected = true;
    updateFeedNote();
  });

  source.addEventListener("connected", () => {
    queueRefresh();
  });

  source.addEventListener("tracker-update", (event) => {
    try {
      const payload = JSON.parse(String(event?.data || "{}"));
      const run = payload?.run;
      if (run && typeof run === "object") {
        if (!state.status) state.status = {};
        state.status.latestRun = {
          ...(state.status.latestRun || {}),
          ...run,
        };
        renderStats();
        renderEngine();
      }
    } catch { }
    queueRefresh();
  });

  source.addEventListener("map-checked", (event) => {
    try {
      const payload = JSON.parse(String(event?.data || "{}"));
      addLiveCheck(payload);
    } catch { }
  });

  source.addEventListener("ping", () => { });

  source.addEventListener("error", () => {
    state.stream.connected = false;
    updateFeedNote();
    cleanupStream();
    scheduleStreamReconnect();
  });
}
async function runNow() {
  els.runNowBtn.disabled = true;
  const orig = els.runNowBtn.textContent;
  els.runNowBtn.textContent = "Running\u2026";
  try {
    await api("api/v1/admin/tracker/run-now", { method: "POST", body: {}, admin: true });
    await refreshData({ silent: true });
  } catch (error) {
    els.engineError.textContent = error.message;
  } finally {
    els.runNowBtn.disabled = false;
    els.runNowBtn.textContent = orig;
  }
}
function bindEvents() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  document.querySelectorAll(".header-actions a[href^='#']").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const tabId = link.getAttribute("href").slice(1);
      const validTab = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
      if (validTab) switchTab(tabId);
    });
  });
  els.mapSearch.addEventListener("input", (e) => {
    state.filters.search = e.target.value;
    state.pagination.page = 1;
    renderMaps();
  });

  els.dueOnly.addEventListener("change", (e) => {
    state.filters.dueOnly = e.target.checked;
    state.pagination.page = 1;
    renderMaps();
  });
  els.pagePrev.addEventListener("click", () => {
    if (state.pagination.page > 1) {
      state.pagination.page--;
      renderMaps();
    }
  });

  els.pageNext.addEventListener("click", () => {
    if (state.pagination.page < state.pagination.totalPages) {
      state.pagination.page++;
      renderMaps();
    }
  });
  els.runNowBtn.addEventListener("click", runNow);
}
async function boot() {
  const hash = window.location.hash.slice(1);
  if (hash && document.querySelector(`.tab-btn[data-tab="${hash}"]`)) {
    switchTab(hash);
  }

  updateFeedNote();
  configureLinks();
  applyModeUI();
  bindEvents();
  await refreshData();
  connectStream();
  window.setInterval(() => refreshData({ silent: true }), FALLBACK_REFRESH_MS);
  window.addEventListener("beforeunload", () => {
    clearStreamReconnectTimer();
    cleanupStream();
  });
}

boot();


