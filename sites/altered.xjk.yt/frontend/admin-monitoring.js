
const TAB_KEY = "altered_admin_monitor_tab_v3";
const CLUB_TAB_KEY = "altered_admin_monitor_club_tab_v1";
const LB_SCHED_KEY = "altered_admin_monitor_lb_sched_v1";

const VALID_TABS = new Set(["club", "leaderboard", "displayname"]);
const VALID_CLUB_TABS = new Set(["maps", "campaigns", "uploads"]);

const REFRESH_MS = 12000;
const STATUS_MS = 2000;
const RUN_POLL_MS = 1250;
const RUN_TIMEOUT_MS = 25 * 60 * 1000;

const state = {
  tab: "club",
  clubTab: "maps",
  formDirty: false,
  displayNameFormDirty: false,
  monitorStatus: null,
  club: {
    maps: [],
    campaigns: [],
    uploads: [],
    loadedAt: null,
  },
  leaderboards: null,
  leaderboardsLoadedAt: null,
  lbScheduler: {
    enabled: true,
    intervalSeconds: 15,
    feedLimit: 80,
  },
  lastLbRefreshAtMs: 0,
};

const el = {
  authState: document.getElementById("authState"),
  refreshAllBtn: document.getElementById("refreshAllBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  statFullState: document.getElementById("statFullState"),
  statDiscoveryState: document.getElementById("statDiscoveryState"),
  statNextFull: document.getElementById("statNextFull"),
  statNextDiscovery: document.getElementById("statNextDiscovery"),
  tabs: Array.from(document.querySelectorAll("[data-monitor-tab]")),
  panels: Array.from(document.querySelectorAll("[data-monitor-panel]")),
  clubTabs: Array.from(document.querySelectorAll("[data-club-tab]")),
  clubPanels: Array.from(document.querySelectorAll("[data-club-panel]")),
  monitorConfigForm: document.getElementById("monitorConfigForm"),
  clubIdInput: document.getElementById("clubIdInput"),
  scheduleModeInput: document.getElementById("scheduleModeInput"),
  intervalSecondsInput: document.getElementById("intervalSecondsInput"),
  dailyHourInput: document.getElementById("dailyHourInput"),
  dailyMinuteInput: document.getElementById("dailyMinuteInput"),
  activityPageSizeInput: document.getElementById("activityPageSizeInput"),
  trackerChunkSizeInput: document.getElementById("trackerChunkSizeInput"),
  monitorEnabledInput: document.getElementById("monitorEnabledInput"),
  activeOnlyInput: document.getElementById("activeOnlyInput"),
  fetchMapDetailsInput: document.getElementById("fetchMapDetailsInput"),
  discoveryIntervalInput: document.getElementById("discoveryIntervalInput"),
  discoveryCampaignLimitInput: document.getElementById("discoveryCampaignLimitInput"),
  discoveryActivityPageSizeInput: document.getElementById("discoveryActivityPageSizeInput"),
  discoveryEnabledInput: document.getElementById("discoveryEnabledInput"),
  refreshStatusBtn: document.getElementById("refreshStatusBtn"),
  refreshClubDataBtn: document.getElementById("refreshClubDataBtn"),
  configStatus: document.getElementById("configStatus"),
  runFullBtn: document.getElementById("runFullBtn"),
  runDiscoveryBtn: document.getElementById("runDiscoveryBtn"),
  fetchSummaryBtn: document.getElementById("fetchSummaryBtn"),
  actionStatus: document.getElementById("actionStatus"),
  actionProgressBar: document.getElementById("actionProgressBar"),
  liveStatusLine: document.getElementById("liveStatusLine"),
  liveNextRunLine: document.getElementById("liveNextRunLine"),
  liveSummaryLine: document.getElementById("liveSummaryLine"),
  liveProgressBar: document.getElementById("liveProgressBar"),
  liveProgressText: document.getElementById("liveProgressText"),
  liveProgressMeta: document.getElementById("liveProgressMeta"),
  liveCounterGrid: document.getElementById("liveCounterGrid"),
  clubMapsSummary: document.getElementById("clubMapsSummary"),
  clubMapsList: document.getElementById("clubMapsList"),
  clubCampaignsSummary: document.getElementById("clubCampaignsSummary"),
  clubCampaignsList: document.getElementById("clubCampaignsList"),
  clubUploadsSummary: document.getElementById("clubUploadsSummary"),
  clubUploadsList: document.getElementById("clubUploadsList"),
  leaderboardSchedulerForm: document.getElementById("leaderboardSchedulerForm"),
  leaderboardSchedulerEnabledInput: document.getElementById("leaderboardSchedulerEnabledInput"),
  leaderboardSchedulerIntervalInput: document.getElementById("leaderboardSchedulerIntervalInput"),
  leaderboardFeedLimitInput: document.getElementById("leaderboardFeedLimitInput"),
  leaderboardSchedulerStatus: document.getElementById("leaderboardSchedulerStatus"),
  leaderboardLastUpdatedLine: document.getElementById("leaderboardLastUpdatedLine"),
  refreshLeaderboardBtn: document.getElementById("refreshLeaderboardBtn"),
  leaderboardStatusLine: document.getElementById("leaderboardStatusLine"),
  leaderboardSummaryGrid: document.getElementById("leaderboardSummaryGrid"),
  leaderboardLiveFeedList: document.getElementById("leaderboardLiveFeedList"),
  leaderboardWrList: document.getElementById("leaderboardWrList"),
  leaderboardMostPlayedList: document.getElementById("leaderboardMostPlayedList"),
  refreshDisplayNameBtn: document.getElementById("refreshDisplayNameBtn"),
  displayNameStateLine: document.getElementById("displayNameStateLine"),
  displayNameScheduleLine: document.getElementById("displayNameScheduleLine"),
  displayNameLastLine: document.getElementById("displayNameLastLine"),
  displayNameProgressBar: document.getElementById("displayNameProgressBar"),
  displayNameProgressText: document.getElementById("displayNameProgressText"),
  displayNameRunBtn: document.getElementById("displayNameRunBtn"),
  displayNameRunForceBtn: document.getElementById("displayNameRunForceBtn"),
  displayNameRunPriorityBtn: document.getElementById("displayNameRunPriorityBtn"),
  displayNameActionStatus: document.getElementById("displayNameActionStatus"),
  displayNameAccountIdsInput: document.getElementById("displayNameAccountIdsInput"),
  displayNameSpecificForceInput: document.getElementById("displayNameSpecificForceInput"),
  displayNameSyncAccountsBtn: document.getElementById("displayNameSyncAccountsBtn"),
  displayNameConfigForm: document.getElementById("displayNameConfigForm"),
  displayNameEnabledInput: document.getElementById("displayNameEnabledInput"),
  displayNameBootstrapIntervalInput: document.getElementById("displayNameBootstrapIntervalInput"),
  displayNameMaintenanceIntervalInput: document.getElementById("displayNameMaintenanceIntervalInput"),
  displayNamePriorityIntervalInput: document.getElementById("displayNamePriorityIntervalInput"),
  displayNameCacheTtlInput: document.getElementById("displayNameCacheTtlInput"),
  displayNamePriorityCacheTtlInput: document.getElementById("displayNamePriorityCacheTtlInput"),
  displayNameKnownAccountsRefreshInput: document.getElementById("displayNameKnownAccountsRefreshInput"),
  displayNameBatchSizeInput: document.getElementById("displayNameBatchSizeInput"),
  displayNamePriorityBatchSizeInput: document.getElementById("displayNamePriorityBatchSizeInput"),
  displayNameRequestGapInput: document.getElementById("displayNameRequestGapInput"),
  displayNamePriorityTopLimitInput: document.getElementById("displayNamePriorityTopLimitInput"),
  displayNameSaveConfigBtn: document.getElementById("displayNameSaveConfigBtn"),
  displayNameConfigStatus: document.getElementById("displayNameConfigStatus"),
  displayNameStatsGrid: document.getElementById("displayNameStatsGrid"),
};
function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}
function fmtCount(v) {
  return n(v).toLocaleString();
}
function fmtTs(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t)
    ? new Date(t).toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        hourCycle: "h23",
      })
    : "-";
}
function fmtAgo(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "-";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function setLine(node, msg, tone = "") {
  if (!node) return;
  node.classList.remove("good", "bad");
  if (tone === "good" || tone === "bad") node.classList.add(tone);
  node.textContent = msg;
}
async function api(path, { method = "GET", body } = {}) {
  const r = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let p = null;
  try {
    p = await r.json();
  } catch {}
  if (r.status === 401) {
    window.location.href = p?.loginUrl || "/auth/ubisoft/login?return_to=%2Fadmin%2Fmonitoring%2F";
    throw new Error("Unauthorized");
  }
  if (!r.ok) throw new Error(p?.error || `Request failed (${r.status})`);
  return p;
}

function setTab(tab, persist = true) {
  state.tab = VALID_TABS.has(tab) ? tab : "club";
  if (persist) localStorage.setItem(TAB_KEY, state.tab);
  el.tabs.forEach((b) => {
    const a = b.getAttribute("data-monitor-tab") === state.tab;
    b.classList.toggle("is-active", a);
    b.setAttribute("aria-selected", a ? "true" : "false");
  });
  el.panels.forEach((p) => {
    const a = p.getAttribute("data-monitor-panel") === state.tab;
    p.classList.toggle("is-active", a);
    p.hidden = !a;
  });
}

function setClubTab(tab, persist = true) {
  state.clubTab = VALID_CLUB_TABS.has(tab) ? tab : "maps";
  if (persist) localStorage.setItem(CLUB_TAB_KEY, state.clubTab);
  el.clubTabs.forEach((b) => {
    const a = b.getAttribute("data-club-tab") === state.clubTab;
    b.classList.toggle("is-active", a);
    b.setAttribute("aria-selected", a ? "true" : "false");
  });
  el.clubPanels.forEach((p) => {
    const a = p.getAttribute("data-club-panel") === state.clubTab;
    p.classList.toggle("is-active", a);
    p.hidden = !a;
  });
}

function readLbScheduler() {
  return {
    enabled: Boolean(el.leaderboardSchedulerEnabledInput?.checked),
    intervalSeconds: Math.max(5, Math.min(120, Math.floor(n(el.leaderboardSchedulerIntervalInput?.value, 15)))),
    feedLimit: Math.max(10, Math.min(200, Math.floor(n(el.leaderboardFeedLimitInput?.value, 80)))),
  };
}

function loadLbScheduler() {
  try {
    const raw = localStorage.getItem(LB_SCHED_KEY);
    if (!raw) return;
    const x = JSON.parse(raw);
    state.lbScheduler.enabled = Boolean(x?.enabled);
    state.lbScheduler.intervalSeconds = Math.max(5, Math.min(120, Math.floor(n(x?.intervalSeconds, 15))));
    state.lbScheduler.feedLimit = Math.max(10, Math.min(200, Math.floor(n(x?.feedLimit, 80))));
  } catch {}
}

function hydrateLbScheduler() {
  el.leaderboardSchedulerEnabledInput.checked = state.lbScheduler.enabled;
  el.leaderboardSchedulerIntervalInput.value = String(state.lbScheduler.intervalSeconds);
  el.leaderboardFeedLimitInput.value = String(state.lbScheduler.feedLimit);
}

function renderList(node, rows, fn, empty) {
  if (!node) return;
  node.innerHTML = "";
  if (!rows.length) {
    node.innerHTML = `<li><strong>${esc(empty)}</strong></li>`;
    return;
  }
  rows.forEach((row) => {
    const li = document.createElement("li");
    li.innerHTML = fn(row);
    node.appendChild(li);
  });
}

function renderMonitor() {
  const s = state.monitorStatus || {};
  const m = s.monitor || {};
  const p = m.progress || {};
  const pct = Math.max(0, Math.min(100, Math.floor(n(p.percent, 0))));

  if (!state.formDirty) {
    el.clubIdInput.value = String(m.clubId || 24231);
    el.scheduleModeInput.value = m.scheduleMode === "interval" ? "interval" : "daily";
    el.intervalSecondsInput.value = String(Math.max(60, Math.min(86400, Math.floor(n(m.intervalSeconds, 21600)))));
    el.dailyHourInput.value = String(Math.max(0, Math.min(23, Math.floor(n(m.dailyHourUtc, 3)))));
    el.dailyMinuteInput.value = String(Math.max(0, Math.min(59, Math.floor(n(m.dailyMinuteUtc, 0)))));
    el.activityPageSizeInput.value = String(Math.max(1, Math.min(250, Math.floor(n(m.activityPageSize, 250)))));
    el.trackerChunkSizeInput.value = String(Math.max(25, Math.min(1000, Math.floor(n(m.trackerChunkSize, 350)))));
    el.monitorEnabledInput.checked = Boolean(m.enabled);
    el.activeOnlyInput.checked = Boolean(m.activeOnly);
    el.fetchMapDetailsInput.checked = Boolean(m.fetchMapDetails);
    el.discoveryEnabledInput.checked = Boolean(m.discoveryEnabled);
    el.discoveryIntervalInput.value = String(Math.max(300, Math.min(86400, Math.floor(n(m.discoveryIntervalSeconds, 3600)))));
    el.discoveryCampaignLimitInput.value = String(Math.max(1, Math.min(250, Math.floor(n(m.discoveryCampaignLimit, 25)))));
    el.discoveryActivityPageSizeInput.value = String(Math.max(1, Math.min(250, Math.floor(n(m.discoveryActivityPageSize, 100)))));
  }

  el.authState.textContent = s.configured
    ? `Live API ready (${s.auth?.authMode || s.auth?.mode || "configured"})`
    : "Live API auth not configured.";
  el.statFullState.textContent = m.running ? "Running" : m.enabled ? "Enabled" : "Disabled";
  el.statDiscoveryState.textContent = m.discoveryRunning ? "Running" : m.discoveryEnabled ? "Enabled" : "Disabled";
  el.statNextFull.textContent = fmtTs(m.nextRunAt);
  el.statNextDiscovery.textContent = fmtTs(m.nextDiscoveryRunAt);

  el.liveStatusLine.textContent = `full=${m.running ? "running" : "idle"} | discovery=${m.discoveryRunning ? "running" : m.discoveryEnabled ? "enabled" : "disabled"}`;
  el.liveNextRunLine.textContent = `next full=${fmtTs(m.nextRunAt)} | next discovery=${fmtTs(m.nextDiscoveryRunAt)}`;
  el.liveSummaryLine.textContent = m.lastSummary
    ? `Last full scan: ${fmtCount(m.lastSummary.campaignsLoaded || 0)} campaigns, ${fmtCount(m.lastSummary.mapsLoaded || 0)} maps (${fmtAgo(m.lastFinishedAt)})`
    : m.lastError
      ? `Last full scan failed: ${m.lastError}`
      : "Last full scan: -";

  el.liveProgressBar.style.width = `${pct}%`;
  el.actionProgressBar.style.width = `${pct}%`;
  el.liveProgressText.textContent = `Progress: ${pct}% (${String(p.status || "idle")})`;
  el.liveProgressMeta.textContent = p.message ? `${p.message} | phase=${p.phase || "-"}` : "No active run.";

  const counters = p.counters && typeof p.counters === "object" ? p.counters : {};
  const keys = Object.keys(counters);
  el.liveCounterGrid.innerHTML = keys.length
    ? keys.map((k) => `<article class="live-progress-stat"><p class="live-progress-stat-label">${esc(k)}</p><p class="live-progress-stat-value">${esc(fmtCount(counters[k]))}</p></article>`).join("")
    : "<p class=\"hook-map-meta\">No live counters yet.</p>";

  const d = s.mapperNameSync || {};
  const stats = d.stats || {};
  const sum = d.lastSummary || {};

  if (!state.displayNameFormDirty) {
    el.displayNameEnabledInput.checked = Boolean(d.enabled);
    el.displayNameBootstrapIntervalInput.value = String(Math.max(5, Math.min(3600, Math.floor(n(d.bootstrapIntervalSeconds, 5)))));
    el.displayNameMaintenanceIntervalInput.value = String(Math.max(10, Math.min(86400, Math.floor(n(d.maintenanceIntervalSeconds, 20)))));
    el.displayNamePriorityIntervalInput.value = String(Math.max(5, Math.min(3600, Math.floor(n(d.priorityIntervalSeconds, 5)))));
    el.displayNameCacheTtlInput.value = String(Math.max(0, Math.min(2592000, Math.floor(n(d.cacheTtlSeconds, 86400)))));
    el.displayNamePriorityCacheTtlInput.value = String(Math.max(0, Math.min(2592000, Math.floor(n(d.priorityCacheTtlSeconds, 1800)))));
    el.displayNameKnownAccountsRefreshInput.value = String(Math.max(60, Math.min(86400, Math.floor(n(d.knownAccountsRefreshSeconds, 900)))));
    el.displayNameBatchSizeInput.value = String(Math.max(1, Math.min(50, Math.floor(n(d.batchSize, 50)))));
    el.displayNamePriorityBatchSizeInput.value = String(Math.max(1, Math.min(50, Math.floor(n(d.priorityBatchSize, 25)))));
    el.displayNameRequestGapInput.value = String(Math.max(5000, Math.min(120000, Math.floor(n(d.minRequestGapMs, 5000)))));
    el.displayNamePriorityTopLimitInput.value = String(Math.max(1, Math.min(2000, Math.floor(n(d.priorityTopLimit, 250)))));
  }

  el.displayNameStateLine.textContent = `sync=${d.running ? "running" : d.enabled ? d.mode || "enabled" : "disabled"} | lookup=${s.mapperNameTracking?.configured ? "configured" : "not configured"}`;
  el.displayNameScheduleLine.textContent = `next=${fmtTs(d.nextRunAt)} | next priority=${fmtTs(d.nextPriorityRunAt)} | gap=${fmtCount(d.minRequestGapMs || 0)}ms`;
  el.displayNameLastLine.textContent = d.lastError ? `Last failed: ${d.lastError}` : d.lastFinishedAt ? `Last run: ${fmtAgo(d.lastFinishedAt)}` : "Last run: -";
  el.displayNameProgressBar.style.width = d.running ? `${pct}%` : "0%";
  el.displayNameProgressText.textContent = d.running ? `Progress: ${pct}%` : "Progress: idle";
  el.displayNameStatsGrid.innerHTML = `
    <article class="live-progress-stat"><p class="live-progress-stat-label">Known Accounts</p><p class="live-progress-stat-value">${esc(fmtCount(stats.totalAccounts || 0))}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Unresolved</p><p class="live-progress-stat-value">${esc(fmtCount(stats.unresolvedAccounts || 0))}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Tracker Cache Hits (Last)</p><p class="live-progress-stat-value">${esc(fmtCount(sum.trackerCacheHits || 0))}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Nadeo Resolved (Last)</p><p class="live-progress-stat-value">${esc(fmtCount(sum.nadeoResolved || 0))}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Names Updated (Last)</p><p class="live-progress-stat-value">${esc(fmtCount(sum.namesUpdated || 0))}</p></article>
  `;
}
function renderClub() {
  el.clubMapsSummary.textContent = `Loaded ${fmtCount(state.club.maps.length)} maps (${fmtTs(state.club.loadedAt)}).`;
  el.clubCampaignsSummary.textContent = `Loaded ${fmtCount(state.club.campaigns.length)} campaigns (${fmtTs(state.club.loadedAt)}).`;
  el.clubUploadsSummary.textContent = `Loaded ${fmtCount(state.club.uploads.length)} upload rows (${fmtTs(state.club.loadedAt)}).`;

  renderList(el.clubMapsList, state.club.maps.slice(0, 140), (r) =>
    `<strong>${esc(r.name || r.map_uid || "Unknown map")}</strong><span class="hook-map-meta">UID: ${esc(r.map_uid || "-")} | Campaign: ${esc(r.campaign_name || "Unassigned")} | Players: ${esc(fmtCount(r.player_count || 0))}</span>`,
    "No maps tracked yet."
  );

  renderList(el.clubCampaignsList, state.club.campaigns.slice(0, 140), (r) =>
    `<strong>${esc(r.name || "Unknown campaign")}</strong><span class="hook-map-meta">ID: ${esc(r.id || "-")} | Maps: ${esc(fmtCount(r.map_count || 0))}</span>`,
    "No campaigns tracked yet."
  );

  renderList(el.clubUploadsList, state.club.uploads.slice(0, 140), (r) =>
    `<strong>${esc(r.map_name || r.map_uid || "Unknown map")}</strong><span class="hook-map-meta">Bucket: ${esc(r.bucket_name || `Bucket ${r.bucket_id || "-"}`)} | UID: ${esc(r.map_uid || "-")} | Last Seen: ${esc(fmtTs(r.last_seen_at))}</span>`,
    "No upload maps tracked yet."
  );
}

function renderLeaderboards() {
  const p = state.leaderboards || {};
  const l = p.leaderboards || {};
  const s = l.summary || {};
  const feed = Array.isArray(p.feed) ? p.feed : [];
  const wr = Array.isArray(l?.wr?.overall) ? l.wr.overall : [];
  const mp = Array.isArray(l?.maps?.most_played) ? l.maps.most_played : [];

  el.leaderboardStatusLine.textContent = state.leaderboards
    ? `Updated ${fmtAgo(state.leaderboardsLoadedAt)} | feed=${fmtCount(p.feedCount || 0)}/${fmtCount(p.feedSourceCount || 0)} | altered tracked maps=${fmtCount(p.alteredTrackedMapCount || 0)}`
    : "Loading leaderboard snapshot...";
  el.leaderboardLastUpdatedLine.textContent = `Last update: ${fmtTs(state.leaderboardsLoadedAt)}`;

  el.leaderboardSummaryGrid.innerHTML = `
    <article class="live-progress-stat"><p class="live-progress-stat-label">Altered Total Maps</p><p class="live-progress-stat-value">${esc(fmtCount(s.total_maps || 0))}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Altered Active Maps</p><p class="live-progress-stat-value">${esc(fmtCount(s.active_maps || 0))}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Unique WR Players</p><p class="live-progress-stat-value">${esc(fmtCount(s.unique_wr_players || 0))}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Total WRs</p><p class="live-progress-stat-value">${esc(fmtCount(s.total_wrs || 0))}</p></article>
  `;

  renderList(el.leaderboardLiveFeedList, feed.slice(0, 40), (r) =>
    `<strong>${esc(r.name || r.uid || "Unknown map")}</strong><span class="hook-map-meta">UID: ${esc(r.uid || "-")} | Holder: ${esc(r.holder || "Unknown")} | WR: ${esc(fmtCount(r.wrMs || 0))} ms | ${esc(fmtTs(r.at))}</span>`,
    "No live tracker events for altered maps yet."
  );

  renderList(el.leaderboardWrList, wr.slice(0, 16), (r) =>
    `<strong>${esc(r.display_name || r.player || r.account_id || "Unknown")} - ${esc(fmtCount(r.wr_count || 0))} WRs</strong><span class="hook-map-meta">${r.account_id ? `Account: ${esc(r.account_id)}` : "No account ID linked yet."}</span>`,
    "No WR player rows yet."
  );

  renderList(el.leaderboardMostPlayedList, mp.slice(0, 16), (r) =>
    `<strong>${esc(r.name || r.map_name || r.map_uid || "Unknown map")}</strong><span class="hook-map-meta">Players: ${esc(fmtCount(r.players || r.player_count || 0))} | UID: ${esc(r.map_uid || r.uid || "-")}</span>`,
    "No map activity rows yet."
  );
}

async function loadAuth() {
  const a = await api("/api/v1/admin/auth/status");
  if (!a?.authenticated) {
    window.location.href = a?.loginUrl || "/auth/ubisoft/login?return_to=%2Fadmin%2Fmonitoring%2F";
    return false;
  }
  return true;
}

async function loadMonitor(silent = false) {
  try {
    state.monitorStatus = await api("/api/v1/admin/hook/altered/live/status");
    renderMonitor();
  } catch (e) {
    if (!silent) setLine(el.actionStatus, `Failed to load monitor status: ${e.message}`, "bad");
  }
}

async function loadClub(silent = false) {
  try {
    const [maps, campaigns, uploads] = await Promise.all([
      api("/api/v1/alterations/maps?limit=1500"),
      api("/api/v1/alterations/campaigns?limit=1200"),
      api("/api/v1/alterations/uploads?limit=1500"),
    ]);
    state.club.maps = Array.isArray(maps?.maps) ? maps.maps : [];
    state.club.campaigns = Array.isArray(campaigns?.campaigns) ? campaigns.campaigns : [];
    state.club.uploads = Array.isArray(uploads?.uploads) ? uploads.uploads : [];
    state.club.loadedAt = new Date().toISOString();
    renderClub();
  } catch (e) {
    if (!silent) setLine(el.configStatus, `Failed to load club data: ${e.message}`, "bad");
  }
}

async function loadLb(silent = false) {
  try {
    const payload = await api(`/api/v1/alterations/leaderboards/live?limit=18&feedLimit=${state.lbScheduler.feedLimit}`);
    state.leaderboards = payload || {};
    state.leaderboardsLoadedAt = new Date().toISOString();
    state.lastLbRefreshAtMs = Date.now();
    renderLeaderboards();
  } catch (e) {
    if (!silent) setLine(el.leaderboardSchedulerStatus, `Failed to load leaderboard data: ${e.message}`, "bad");
  }
}

async function waitForRun(kind) {
  const start = Date.now();
  while (Date.now() - start < RUN_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, RUN_POLL_MS));
    await loadMonitor(true);
    const m = state.monitorStatus?.monitor || {};
    const running = kind === "discovery" ? Boolean(m.discoveryRunning) : Boolean(m.running);
    const status = String(m.progress?.status || "").toLowerCase();
    if (!running && status !== "running") return;
  }
  throw new Error("Timed out waiting for run completion.");
}
async function saveMonitorConfig(e) {
  e.preventDefault();
  const payload = {
    clubId: Math.max(1, Math.floor(n(el.clubIdInput.value, 24231))),
    scheduleMode: String(el.scheduleModeInput.value || "daily").toLowerCase() === "interval" ? "interval" : "daily",
    intervalSeconds: Math.max(60, Math.min(86400, Math.floor(n(el.intervalSecondsInput.value, 21600)))),
    dailyHourUtc: Math.max(0, Math.min(23, Math.floor(n(el.dailyHourInput.value, 3)))),
    dailyMinuteUtc: Math.max(0, Math.min(59, Math.floor(n(el.dailyMinuteInput.value, 0)))),
    activityPageSize: Math.max(1, Math.min(250, Math.floor(n(el.activityPageSizeInput.value, 250)))),
    trackerChunkSize: Math.max(25, Math.min(1000, Math.floor(n(el.trackerChunkSizeInput.value, 350)))),
    enabled: Boolean(el.monitorEnabledInput.checked),
    activeOnly: Boolean(el.activeOnlyInput.checked),
    fetchMapDetails: Boolean(el.fetchMapDetailsInput.checked),
    discoveryEnabled: Boolean(el.discoveryEnabledInput.checked),
    discoveryIntervalSeconds: Math.max(300, Math.min(86400, Math.floor(n(el.discoveryIntervalInput.value, 3600)))),
    discoveryCampaignLimit: Math.max(1, Math.min(250, Math.floor(n(el.discoveryCampaignLimitInput.value, 25)))),
    discoveryActivityPageSize: Math.max(1, Math.min(250, Math.floor(n(el.discoveryActivityPageSizeInput.value, 100)))),
  };
  try {
    state.monitorStatus = await api("/api/v1/admin/hook/altered/live/monitor/config", { method: "POST", body: payload });
    state.formDirty = false;
    renderMonitor();
    setLine(el.configStatus, "Club scheduler saved.", "good");
  } catch (err) {
    setLine(el.configStatus, `Config save failed: ${err.message}`, "bad");
  }
}

async function runFull() {
  el.runFullBtn.disabled = true;
  setLine(el.actionStatus, "Starting full scan...");
  try {
    const r = await api("/api/v1/admin/hook/altered/live/monitor/run", { method: "POST", body: {} });
    if (!r?.skipped) await waitForRun("full");
    await Promise.all([loadMonitor(true), loadClub(true)]);
    setLine(el.actionStatus, String(state.monitorStatus?.monitor?.progress?.message || "Full scan finished."), "good");
  } catch (e) {
    setLine(el.actionStatus, `Full scan failed: ${e.message}`, "bad");
  } finally {
    el.runFullBtn.disabled = false;
  }
}

async function runDiscovery() {
  el.runDiscoveryBtn.disabled = true;
  setLine(el.actionStatus, "Starting discovery scan...");
  try {
    const r = await api("/api/v1/admin/hook/altered/live/monitor/run-discovery", { method: "POST", body: {} });
    if (!r?.skipped) await waitForRun("discovery");
    await Promise.all([loadMonitor(true), loadClub(true)]);
    setLine(el.actionStatus, String(state.monitorStatus?.monitor?.progress?.message || "Discovery scan finished."), "good");
  } catch (e) {
    setLine(el.actionStatus, `Discovery scan failed: ${e.message}`, "bad");
  } finally {
    el.runDiscoveryBtn.disabled = false;
  }
}

async function runSummary() {
  el.fetchSummaryBtn.disabled = true;
  setLine(el.actionStatus, "Fetching summary...");
  try {
    const payload = { clubId: Math.max(1, Math.floor(n(el.clubIdInput.value, 24231))), summaryOnly: true };
    const r = await api("/api/v1/admin/hook/altered/live/fetch", { method: "POST", body: payload });
    setLine(el.actionStatus, `Summary loaded: ${fmtCount(r?.summary?.campaignsLoaded || 0)} campaigns, ${fmtCount(r?.summary?.mapsLoaded || 0)} maps.`, "good");
    await Promise.all([loadMonitor(true), loadClub(true)]);
  } catch (e) {
    setLine(el.actionStatus, `Summary fetch failed: ${e.message}`, "bad");
  } finally {
    el.fetchSummaryBtn.disabled = false;
  }
}

async function runDisplayName(priority = false, force = false) {
  setLine(el.displayNameActionStatus, `Starting ${priority ? "priority " : force ? "force " : ""}display-name sync...`);
  try {
    const r = await api("/api/v1/admin/hook/altered/live/mapper-sync/run", { method: "POST", body: { priority, force } });
    const x = r?.result || {};
    setLine(el.displayNameActionStatus, x.skipped
      ? `Skipped (${x.reason || "no-op"}).`
      : `Done: tracker hits=${fmtCount(x.trackerCacheHits || 0)}, nadeo resolved=${fmtCount(x.nadeoResolved || 0)}, updated=${fmtCount(x.namesUpdated || 0)}.`, "good");
    await loadMonitor(true);
  } catch (e) {
    setLine(el.displayNameActionStatus, `Display-name sync failed: ${e.message}`, "bad");
  }
}

async function syncSpecificAccounts() {
  const ids = String(el.displayNameAccountIdsInput.value || "").trim();
  if (!ids) return setLine(el.displayNameActionStatus, "Enter at least one account ID.", "bad");
  el.displayNameSyncAccountsBtn.disabled = true;
  try {
    const r = await api("/api/v1/admin/hook/altered/live/mapper-sync/accounts", { method: "POST", body: { accountIds: ids, force: Boolean(el.displayNameSpecificForceInput.checked) } });
    const x = r?.result || {};
    setLine(el.displayNameActionStatus, `Targeted sync: requested=${fmtCount(x.requested || x.requestedAccountIds || 0)}, tracker hits=${fmtCount(x.trackerCacheHits || 0)}, nadeo resolved=${fmtCount(x.nadeoResolved || 0)}.`, "good");
    await loadMonitor(true);
  } catch (e) {
    setLine(el.displayNameActionStatus, `Targeted sync failed: ${e.message}`, "bad");
  } finally {
    el.displayNameSyncAccountsBtn.disabled = false;
  }
}

async function saveDisplayNameConfig(e) {
  e.preventDefault();
  const payload = {
    enabled: Boolean(el.displayNameEnabledInput.checked),
    bootstrapIntervalSeconds: Math.max(5, Math.min(3600, Math.floor(n(el.displayNameBootstrapIntervalInput.value, 5)))),
    maintenanceIntervalSeconds: Math.max(10, Math.min(86400, Math.floor(n(el.displayNameMaintenanceIntervalInput.value, 20)))),
    priorityIntervalSeconds: Math.max(5, Math.min(3600, Math.floor(n(el.displayNamePriorityIntervalInput.value, 5)))),
    cacheTtlSeconds: Math.max(0, Math.min(2592000, Math.floor(n(el.displayNameCacheTtlInput.value, 86400)))),
    priorityCacheTtlSeconds: Math.max(0, Math.min(2592000, Math.floor(n(el.displayNamePriorityCacheTtlInput.value, 1800)))),
    knownAccountsRefreshSeconds: Math.max(60, Math.min(86400, Math.floor(n(el.displayNameKnownAccountsRefreshInput.value, 900)))),
    batchSize: Math.max(1, Math.min(50, Math.floor(n(el.displayNameBatchSizeInput.value, 50)))),
    priorityBatchSize: Math.max(1, Math.min(50, Math.floor(n(el.displayNamePriorityBatchSizeInput.value, 25)))),
    minRequestGapMs: Math.max(5000, Math.min(120000, Math.floor(n(el.displayNameRequestGapInput.value, 5000)))),
    priorityTopLimit: Math.max(1, Math.min(2000, Math.floor(n(el.displayNamePriorityTopLimitInput.value, 250)))),
  };
  try {
    await api("/api/v1/admin/hook/altered/live/mapper-sync/config", { method: "POST", body: payload });
    state.displayNameFormDirty = false;
    setLine(el.displayNameConfigStatus, "Display-name scheduler saved.", "good");
    await loadMonitor(true);
  } catch (err) {
    setLine(el.displayNameConfigStatus, `Config save failed: ${err.message}`, "bad");
  }
}

function bind() {
  el.tabs.forEach((b) => b.addEventListener("click", () => {
    setTab(b.getAttribute("data-monitor-tab") || "club");
    if (state.tab === "leaderboard" && !state.leaderboards) loadLb(true);
  }));
  el.clubTabs.forEach((b) => b.addEventListener("click", () => setClubTab(b.getAttribute("data-club-tab") || "maps")));

  el.monitorConfigForm?.addEventListener("submit", saveMonitorConfig);
  [
    el.clubIdInput,
    el.scheduleModeInput,
    el.intervalSecondsInput,
    el.dailyHourInput,
    el.dailyMinuteInput,
    el.activityPageSizeInput,
    el.trackerChunkSizeInput,
    el.monitorEnabledInput,
    el.activeOnlyInput,
    el.fetchMapDetailsInput,
    el.discoveryIntervalInput,
    el.discoveryCampaignLimitInput,
    el.discoveryActivityPageSizeInput,
    el.discoveryEnabledInput,
  ]
    .filter(Boolean)
    .forEach((node) => {
      const evt = node.tagName === "INPUT" && node.type !== "checkbox" ? "input" : "change";
      node.addEventListener(evt, () => {
        state.formDirty = true;
      });
    });
  el.refreshStatusBtn?.addEventListener("click", () => loadMonitor(false));
  el.refreshClubDataBtn?.addEventListener("click", () => loadClub(false));
  el.refreshLeaderboardBtn?.addEventListener("click", () => loadLb(false));
  el.refreshDisplayNameBtn?.addEventListener("click", () => loadMonitor(false));
  el.refreshAllBtn?.addEventListener("click", () => Promise.all([loadMonitor(false), loadClub(false), state.tab === "leaderboard" ? loadLb(false) : Promise.resolve()]));

  el.runFullBtn?.addEventListener("click", runFull);
  el.runDiscoveryBtn?.addEventListener("click", runDiscovery);
  el.fetchSummaryBtn?.addEventListener("click", runSummary);

  el.displayNameRunBtn?.addEventListener("click", () => runDisplayName(false, false));
  el.displayNameRunForceBtn?.addEventListener("click", () => runDisplayName(false, true));
  el.displayNameRunPriorityBtn?.addEventListener("click", () => runDisplayName(true, false));
  el.displayNameSyncAccountsBtn?.addEventListener("click", syncSpecificAccounts);
  el.displayNameConfigForm?.addEventListener("submit", saveDisplayNameConfig);
  [
    el.displayNameEnabledInput,
    el.displayNameBootstrapIntervalInput,
    el.displayNameMaintenanceIntervalInput,
    el.displayNamePriorityIntervalInput,
    el.displayNameCacheTtlInput,
    el.displayNamePriorityCacheTtlInput,
    el.displayNameKnownAccountsRefreshInput,
    el.displayNameBatchSizeInput,
    el.displayNamePriorityBatchSizeInput,
    el.displayNameRequestGapInput,
    el.displayNamePriorityTopLimitInput,
  ]
    .filter(Boolean)
    .forEach((node) => {
      const evt = node.tagName === "INPUT" && node.type !== "checkbox" ? "input" : "change";
      node.addEventListener(evt, () => {
        state.displayNameFormDirty = true;
      });
    });

  el.leaderboardSchedulerForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    state.lbScheduler = readLbScheduler();
    localStorage.setItem(LB_SCHED_KEY, JSON.stringify(state.lbScheduler));
    setLine(el.leaderboardSchedulerStatus, "Leaderboard scheduler saved.", "good");
  });

  el.logoutBtn?.addEventListener("click", async () => {
    try {
      await api("/api/v1/admin/auth/logout", { method: "POST", body: {} });
    } catch {}
    window.location.href = "/";
  });
}

async function boot() {
  loadLbScheduler();
  hydrateLbScheduler();
  setTab(localStorage.getItem(TAB_KEY) || "club", false);
  setClubTab(localStorage.getItem(CLUB_TAB_KEY) || "maps", false);
  bind();

  setLine(el.configStatus, "Configuration not changed yet.");
  setLine(el.actionStatus, "No action started yet.");
  setLine(el.displayNameActionStatus, "No display name sync action started yet.");
  setLine(el.displayNameConfigStatus, "Display name config not changed yet.");
  setLine(el.leaderboardSchedulerStatus, "Leaderboard scheduler not changed yet.");

  const ok = await loadAuth();
  if (!ok) return;

  await Promise.all([
    loadMonitor(true),
    loadClub(true),
    state.tab === "leaderboard" ? loadLb(true) : Promise.resolve(),
  ]);

  setInterval(() => {
    loadMonitor(true);
    if (state.tab === "club") loadClub(true);
  }, STATUS_MS);

  setInterval(() => {
    if (state.tab === "leaderboard" && state.lbScheduler.enabled) {
      const elapsed = Date.now() - state.lastLbRefreshAtMs;
      if (elapsed >= state.lbScheduler.intervalSeconds * 1000) loadLb(true);
    }
  }, 1000);

  setInterval(() => {
    if (state.tab === "club") loadClub(true);
    if (state.tab === "leaderboard") loadLb(true);
  }, REFRESH_MS);
}

boot();
