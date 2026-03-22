const REFRESH_INTERVAL_MS = 45000;

const state = {
  maps: [],
  wrFeed: [],
  campaigns: [],
  mapOptions: [],
  summary: null,
  tracker: null,
  hook: {
    status: null,
    maps: [],
    runs: [],
  },
  initialized: false,
  filters: {
    search: "",
    campaign: "all",
    sort: "wr_recent",
    trackedOnly: false,
    hookSearch: "",
  },
  adminLog: [],
};

const elements = {
  syncNote: document.querySelector(".sync-note"),
  statTracked: document.getElementById("statTracked"),
  statCampaigns: document.getElementById("statCampaigns"),
  statLatest: document.getElementById("statLatest"),
  sideLatestMap: document.getElementById("sideLatestMap"),
  sideLatestMeta: document.getElementById("sideLatestMeta"),
  trackedSearch: document.getElementById("trackedSearch"),
  trackedMapList: document.getElementById("trackedMapList"),
  latestWrCard: document.getElementById("latestWrCard"),
  wrFeedList: document.getElementById("wrFeedList"),
  simulateWrBtn: document.getElementById("simulateWrBtn"),
  campaignFilter: document.getElementById("campaignFilter"),
  sortSelect: document.getElementById("sortSelect"),
  trackedOnlyToggle: document.getElementById("trackedOnlyToggle"),
  mapRows: document.getElementById("mapRows"),
  mapCountLabel: document.getElementById("mapCountLabel"),
  adminMapSelect: document.getElementById("adminMapSelect"),
  adminCampaignInput: document.getElementById("adminCampaignInput"),
  adminSlotInput: document.getElementById("adminSlotInput"),
  campaignForm: document.getElementById("campaignForm"),
  trackingMapSelect: document.getElementById("trackingMapSelect"),
  trackingStateSelect: document.getElementById("trackingStateSelect"),
  trackingForm: document.getElementById("trackingForm"),
  uidLookupForm: document.getElementById("uidLookupForm"),
  uidLookupInput: document.getElementById("uidLookupInput"),
  uidLookupResult: document.getElementById("uidLookupResult"),
  adminLogList: document.getElementById("adminLogList"),
  hookStatusLine: document.getElementById("hookStatusLine"),
  hookRunLine: document.getElementById("hookRunLine"),
  hookConfigForm: document.getElementById("hookConfigForm"),
  hookClubIdInput: document.getElementById("hookClubIdInput"),
  hookClubNameInput: document.getElementById("hookClubNameInput"),
  hookSourceInput: document.getElementById("hookSourceInput"),
  hookEnabledToggle: document.getElementById("hookEnabledToggle"),
  hookAutoTrackToggle: document.getElementById("hookAutoTrackToggle"),
  hookSyncForm: document.getElementById("hookSyncForm"),
  hookSnapshotInput: document.getElementById("hookSnapshotInput"),
  hookSyncBtn: document.getElementById("hookSyncBtn"),
  hookMapSearch: document.getElementById("hookMapSearch"),
  hookMapList: document.getElementById("hookMapList"),
};

function getAdminToken() {
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("admin_token");
    if (fromQuery && fromQuery.trim()) {
      window.localStorage.setItem("altered_admin_token", fromQuery.trim());
      return fromQuery.trim();
    }
    return window.localStorage.getItem("altered_admin_token") || "";
  } catch {
    return "";
  }
}

const ADMIN_TOKEN = getAdminToken();

function buildHeaders({ admin = false, hasJson = false } = {}) {
  const headers = {};
  if (hasJson) headers["Content-Type"] = "application/json";
  if (admin && ADMIN_TOKEN) headers["x-admin-token"] = ADMIN_TOKEN;
  return headers;
}

async function apiRequest(path, { method = "GET", body, admin = false } = {}) {
  const response = await fetch(path, {
    method,
    headers: buildHeaders({ admin, hasJson: body !== undefined }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error || `Request failed (${response.status}).`;
    throw new Error(message);
  }

  return payload;
}

function formatMs(ms) {
  const total = Math.max(0, Number(ms) || 0);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
}

function formatAgo(iso) {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return "-";
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - target) / 1000));
  if (deltaSeconds < 50) return "just now";
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m ago`;
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}h ago`;
  return `${Math.floor(deltaSeconds / 86400)}d ago`;
}

const NADEO_FMT_RE = /\$([0-9a-fA-F]{1,3}|[gimnostuwzGIMNOSTUWZ<>]|[hlpHLP](\[[^\]]+\])?)/g;
function stripFmt(v) { return String(v ?? "").replace(NADEO_FMT_RE, ""); }

function sanitizeStatus(statusRaw) {
  const status = String(statusRaw || "").toLowerCase();
  if (status === "live" || status === "paused" || status === "archived") return status;
  return "live";
}

function statusClass(statusRaw) {
  const status = sanitizeStatus(statusRaw);
  if (status === "paused") return "status-pill status-paused";
  if (status === "archived") return "status-pill status-archived";
  return "status-pill status-live";
}

function normalizeMap(map) {
  return {
    uid: String(map.uid || ""),
    mapId: String(map.mapId || ""),
    name: stripFmt(map.name || "Unknown map"),
    campaign: stripFmt(map.campaign || "Unassigned"),
    campaignId: map.campaignId ?? null,
    slot: Number(map.slot || 0),
    authorMs: Number(map.authorMs || 0),
    wrMs: Number(map.wrMs || 0),
    wrHolder: stripFmt(map.wrHolder || "-"),
    wrUpdatedAt: map.wrUpdatedAt || null,
    tracked: Boolean(map.tracked),
    status: sanitizeStatus(map.status),
    checkFrequency: Number(map.checkFrequency || 0),
    lastCheckedAt: map.lastCheckedAt || null,
  };
}

function normalizeWrEvent(event) {
  return {
    uid: String(event.uid || ""),
    name: stripFmt(event.name || "Unknown map"),
    campaign: stripFmt(event.campaign || "Unassigned"),
    wrMs: Number(event.wrMs || 0),
    holder: stripFmt(event.holder || "Unknown"),
    at: event.at || null,
  };
}

function getLatestEvent() {
  return state.wrFeed[0] || null;
}

function pushAdminLog(message) {
  const stamp = new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  state.adminLog.unshift(`[${stamp}] ${message}`);
  if (state.adminLog.length > 16) state.adminLog.length = 16;
  renderAdminLog();
}

function setLookupResult(text, tone = "neutral") {
  elements.uidLookupResult.textContent = text;
  elements.uidLookupResult.classList.remove("good", "bad");
  if (tone === "good") elements.uidLookupResult.classList.add("good");
  if (tone === "bad") elements.uidLookupResult.classList.add("bad");
}

function mapOptionsFallback() {
  return [...state.maps]
    .sort((a, b) => {
      const byCampaign = a.campaign.localeCompare(b.campaign);
      if (byCampaign !== 0) return byCampaign;
      if (a.slot !== b.slot) return a.slot - b.slot;
      return a.name.localeCompare(b.name);
    })
    .map((map) => ({ uid: map.uid, name: map.name, campaign: map.campaign, slot: map.slot }));
}

function adminMapOptions() {
  if (Array.isArray(state.mapOptions) && state.mapOptions.length) {
    return [...state.mapOptions].sort((a, b) => {
      const aCampaign = String(a.campaign || "");
      const bCampaign = String(b.campaign || "");
      const byCampaign = aCampaign.localeCompare(bCampaign);
      if (byCampaign !== 0) return byCampaign;
      const aSlot = Number(a.slot || 0);
      const bSlot = Number(b.slot || 0);
      if (aSlot !== bSlot) return aSlot - bSlot;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }
  return mapOptionsFallback();
}

function renderHeroStats() {
  const tracked =
    Number(state.summary?.trackedMaps) || state.maps.filter((map) => map.tracked).length;
  const campaignCount =
    Number(state.summary?.campaignCount) || new Set(state.maps.map((map) => map.campaign)).size;
  const latest = getLatestEvent();

  elements.statTracked.textContent = String(tracked);
  elements.statCampaigns.textContent = String(campaignCount);
  elements.statLatest.textContent = latest ? `${latest.name} (${formatAgo(latest.at)})` : "-";
}

function renderTrackerRuntime() {
  if (!elements.syncNote) return;
  const runtime = state.tracker?.runtime;
  const latestRun = state.tracker?.latestRun;
  const dueNow = Number(state.tracker?.trackedDueNow || 0);

  if (!runtime || !runtime.enabled) {
    elements.syncNote.textContent = `Data synced from tracker service • refresh every ${Math.floor(
      REFRESH_INTERVAL_MS / 1000
    )}s`;
    return;
  }

  const runText = latestRun
    ? `run #${latestRun.runId}: ${latestRun.mapsChecked} checked, ${latestRun.wrChanges} changes`
    : "no completed runs yet";
  const capText =
    Number(runtime.maxCheckIntervalSeconds || 0) > 0
      ? ` • max interval ${runtime.maxCheckIntervalSeconds}s`
      : "";
  elements.syncNote.textContent = `Tracker ${
    runtime.enabled ? "live" : "disabled"
  } • ${runtime.provider} • tick ${runtime.tickSeconds}s${capText} • due now ${dueNow} • ${runText}`;
}

function renderLatest() {
  const latest = getLatestEvent();

  if (!latest) {
    elements.sideLatestMap.textContent = "-";
    elements.sideLatestMeta.textContent = "No WR updates yet.";
    elements.latestWrCard.innerHTML = "<strong>No WR data yet</strong><p>Feed is waiting for updates.</p>";
    elements.wrFeedList.innerHTML = "";
    return;
  }

  elements.sideLatestMap.textContent = latest.name;
  elements.sideLatestMeta.textContent = `${latest.holder} set ${formatMs(latest.wrMs)} - ${formatAgo(latest.at)}`;
  elements.latestWrCard.innerHTML = `
    <strong>${latest.name}</strong>
    <p>${latest.holder} now holds WR with <b>${formatMs(latest.wrMs)}</b></p>
    <p>${latest.campaign} - ${formatDateTime(latest.at)}</p>
  `;

  elements.wrFeedList.innerHTML = "";
  state.wrFeed.slice(0, 8).forEach((event) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${event.name} - ${formatMs(event.wrMs)}</strong>
      <span>${event.holder} - ${event.campaign} - ${formatAgo(event.at)}</span>
    `;
    elements.wrFeedList.appendChild(li);
  });
}

function renderTrackedList() {
  const search = state.filters.search.toLowerCase().trim();
  const latest = getLatestEvent();
  const trackedMaps = state.maps
    .filter((map) => map.tracked)
    .filter((map) => {
      if (!search) return true;
      return map.name.toLowerCase().includes(search) || map.uid.toLowerCase().includes(search);
    })
    .sort((a, b) => {
      const campaignDiff = a.campaign.localeCompare(b.campaign);
      if (campaignDiff !== 0) return campaignDiff;
      return a.slot - b.slot;
    });

  elements.trackedMapList.innerHTML = "";
  if (!trackedMaps.length) {
    const li = document.createElement("li");
    li.innerHTML = "<strong>No matches</strong><span>Try another map name or UID.</span>";
    elements.trackedMapList.appendChild(li);
    return;
  }

  trackedMaps.forEach((map) => {
    const li = document.createElement("li");
    if (latest && latest.uid === map.uid) li.classList.add("updated");
    li.innerHTML = `
      <strong>${map.name}</strong>
      <span>${map.campaign} - #${map.slot} - WR ${formatMs(map.wrMs)}</span>
      <span>${map.uid}</span>
    `;
    elements.trackedMapList.appendChild(li);
  });
}

function mapCompare(sortMode, a, b) {
  if (sortMode === "map_name") return a.name.localeCompare(b.name);
  if (sortMode === "campaign") {
    const campaignDiff = a.campaign.localeCompare(b.campaign);
    if (campaignDiff !== 0) return campaignDiff;
    return a.slot - b.slot;
  }
  if (sortMode === "wr_time") return a.wrMs - b.wrMs;
  return Date.parse(b.wrUpdatedAt || 0) - Date.parse(a.wrUpdatedAt || 0);
}

function getVisibleMaps() {
  const search = state.filters.search.toLowerCase().trim();
  return state.maps
    .filter((map) => (state.filters.campaign === "all" ? true : map.campaign === state.filters.campaign))
    .filter((map) => (state.filters.trackedOnly ? map.tracked : true))
    .filter((map) => {
      if (!search) return true;
      return map.name.toLowerCase().includes(search) || map.uid.toLowerCase().includes(search);
    })
    .sort((a, b) => mapCompare(state.filters.sort, a, b));
}

function renderMapTable() {
  const visible = getVisibleMaps();
  elements.mapCountLabel.textContent = `${visible.length} maps shown`;
  elements.mapRows.innerHTML = "";

  if (!visible.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="6">No maps match your current filters.</td>';
    elements.mapRows.appendChild(row);
    return;
  }

  visible.forEach((map) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <strong>${map.name}</strong><br />
        <span>${map.uid}</span>
      </td>
      <td>${map.campaign} - #${map.slot}</td>
      <td>${formatMs(map.wrMs)} <small>(AT ${formatMs(map.authorMs)})</small></td>
      <td>${map.wrHolder}</td>
      <td>${formatAgo(map.wrUpdatedAt)}</td>
      <td><span class="${statusClass(map.status)}">${map.status}</span></td>
    `;
    elements.mapRows.appendChild(row);
  });
}

function renderCampaignFilter() {
  const campaignSource =
    Array.isArray(state.campaigns) && state.campaigns.length
      ? [...state.campaigns]
      : [...new Set(state.maps.map((map) => map.campaign))];
  const campaigns = campaignSource.sort((a, b) => String(a).localeCompare(String(b)));

  const previous = state.filters.campaign;
  elements.campaignFilter.innerHTML = '<option value="all">All campaigns</option>';

  campaigns.forEach((campaign) => {
    const option = document.createElement("option");
    option.value = campaign;
    option.textContent = stripFmt(campaign);
    elements.campaignFilter.appendChild(option);
  });

  if (previous === "all" || campaigns.includes(previous)) {
    elements.campaignFilter.value = previous;
    state.filters.campaign = previous;
  } else {
    elements.campaignFilter.value = "all";
    state.filters.campaign = "all";
  }
}

function renderAdminSelectors() {
  const options = adminMapOptions();
  const markup = options
    .map((map) => {
      const campaign = String(map.campaign || "Unassigned");
      const slot = Number(map.slot || 0);
      return `<option value="${map.uid}">${stripFmt(campaign)} #${slot} - ${stripFmt(map.name)}</option>`;
    })
    .join("");

  elements.adminMapSelect.innerHTML = markup;
  elements.trackingMapSelect.innerHTML = markup;
}

function renderAdminLog() {
  elements.adminLogList.innerHTML = "";
  if (!state.adminLog.length) {
    const li = document.createElement("li");
    li.textContent = "No operations yet.";
    elements.adminLogList.appendChild(li);
    return;
  }

  state.adminLog.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = entry;
    elements.adminLogList.appendChild(li);
  });
}

function getFilteredHookMaps() {
  const query = state.filters.hookSearch.toLowerCase().trim();
  return state.hook.maps
    .filter((map) => {
      if (!query) return true;
      return (
        String(map.name || "").toLowerCase().includes(query) ||
        String(map.uid || "").toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      const campaignDiff = String(a.campaign || "").localeCompare(String(b.campaign || ""));
      if (campaignDiff !== 0) return campaignDiff;
      const slotDiff = Number(a.slot || 0) - Number(b.slot || 0);
      if (slotDiff !== 0) return slotDiff;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
}

function renderHookStatus() {
  const hook = state.hook.status;
  if (!hook) {
    elements.hookStatusLine.textContent = "Hook status: not configured";
    elements.hookRunLine.textContent = "Latest sync run: -";
    return;
  }

  const enabled = hook.enabled ? "enabled" : "disabled";
  const autoTrack = hook.autoTrackNewMaps ? "on" : "off";
  elements.hookStatusLine.textContent =
    `Hook ${hook.hookKey} • club ${stripFmt(hook.clubName)} (${hook.clubId}) • ${enabled} • auto-track ${autoTrack} • maps ${hook.mapCount} (${hook.trackedCount} tracked)`;

  if (hook.latestRun) {
    elements.hookRunLine.textContent =
      `Latest sync run #${hook.latestRun.runId} • ${hook.latestRun.status} • ${hook.latestRun.mapsSeen} maps seen, ${hook.latestRun.mapsInserted} inserted, ${hook.latestRun.mapsUpdated} updated • ${formatAgo(hook.latestRun.finishedAt)}`;
  } else {
    elements.hookRunLine.textContent = "Latest sync run: none yet";
  }
}

function renderHookForm() {
  const hook = state.hook.status;
  if (!hook) return;
  elements.hookClubIdInput.value = String(hook.clubId || "");
  elements.hookClubNameInput.value = hook.clubName || "";
  elements.hookSourceInput.value = hook.sourceLabel || "";
  elements.hookEnabledToggle.checked = Boolean(hook.enabled);
  elements.hookAutoTrackToggle.checked = Boolean(hook.autoTrackNewMaps);
}

function renderHookMapList() {
  const maps = getFilteredHookMaps();
  elements.hookMapList.innerHTML = "";

  if (!maps.length) {
    const item = document.createElement("li");
    item.innerHTML = "<strong>No hooked maps found.</strong><span class=\"hook-map-meta\">Try syncing or changing search.</span>";
    elements.hookMapList.appendChild(item);
    return;
  }

  maps.slice(0, 250).forEach((map) => {
    const item = document.createElement("li");
    const tracked = Boolean(map.tracked);
    item.innerHTML = `
      <div class="hook-map-head">
        <strong>${stripFmt(map.name)}</strong>
        <span class="${statusClass(map.status)}">${map.status}</span>
      </div>
      <div class="hook-map-meta">${stripFmt(map.campaign)} #${map.slot} • UID: ${map.uid}</div>
      <div class="hook-map-meta">WR ${formatMs(map.wrMs)} by ${stripFmt(map.wrHolder || "-")}</div>
      <div class="hook-map-actions">
        <button class="hook-action" type="button" data-hook-action="track" data-map-uid="${map.uid}" ${
          tracked ? "disabled" : ""
        }>Track</button>
        <button class="hook-action" type="button" data-hook-action="pause" data-map-uid="${map.uid}" ${
          !tracked ? "disabled" : ""
        }>Pause</button>
      </div>
    `;
    elements.hookMapList.appendChild(item);
  });
}

function renderHookPanel() {
  renderHookStatus();
  renderHookForm();
  renderHookMapList();
}

function renderAll() {
  renderHeroStats();
  renderTrackerRuntime();
  renderLatest();
  renderTrackedList();
  renderCampaignFilter();
  renderMapTable();
  renderAdminSelectors();
  renderAdminLog();
  renderHookPanel();
}

async function loadHookData({ silent = false } = {}) {
  try {
    const [hookPayload, hookMapsPayload, hookRunsPayload] = await Promise.all([
      apiRequest("/api/v1/hook/altered"),
      apiRequest("/api/v1/hook/altered/maps?limit=1200"),
      apiRequest("/api/v1/hook/altered/runs?limit=12"),
    ]);
    state.hook.status = hookPayload?.hook || null;
    state.hook.maps = Array.isArray(hookMapsPayload?.maps)
      ? hookMapsPayload.maps.map(normalizeMap)
      : [];
    state.hook.runs = Array.isArray(hookRunsPayload?.runs) ? hookRunsPayload.runs : [];
    renderHookPanel();
    return true;
  } catch (error) {
    if (!silent) {
      pushAdminLog(`Failed to load hook data: ${error.message}`);
    }
    state.hook.status = null;
    state.hook.maps = [];
    state.hook.runs = [];
    renderHookPanel();
    return false;
  }
}

async function loadDashboard({ silent = false } = {}) {
  try {
    const payload = await apiRequest("/api/v1/dashboard");
    state.maps = Array.isArray(payload?.maps) ? payload.maps.map(normalizeMap) : [];
    state.wrFeed = Array.isArray(payload?.wrFeed)
      ? payload.wrFeed.map(normalizeWrEvent).sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0))
      : [];
    state.campaigns = Array.isArray(payload?.campaigns) ? payload.campaigns : [];
    state.summary = payload?.summary || null;
    state.mapOptions = Array.isArray(payload?.mapOptions) ? payload.mapOptions : [];
    state.tracker = payload?.tracker || null;
    state.hook.status = payload?.alteredHook || state.hook.status;

    renderAll();

    if (!state.initialized) {
      pushAdminLog("Dashboard initialized from backend data.");
      state.initialized = true;
    }
    return true;
  } catch (error) {
    if (!silent) {
      pushAdminLog(`Failed to load dashboard: ${error.message}`);
      setLookupResult("Failed to load dashboard data. Check backend/gateway logs.", "bad");
    }
    return false;
  }
}

async function simulateIncomingWr() {
  const host = window.location.hostname.toLowerCase();
  const port = window.location.port || "80";
  const isLocalMode =
    host === "localhost" || host === "127.0.0.1" || host === "xjk.localhost" || host.endsWith(".localhost");
  const trackerUrl = isLocalMode
    ? `http://trackers.localhost:${port}/leaderboard/`
    : "https://trackers.xjk.yt/leaderboard/";
  window.location.href = trackerUrl;
}

async function handleCampaignMove(event) {
  event.preventDefault();
  const uid = elements.adminMapSelect.value;
  const campaignName = elements.adminCampaignInput.value.trim();
  const slot = Number(elements.adminSlotInput.value || 1);

  if (!uid) {
    setLookupResult("Select a map first.", "bad");
    return;
  }
  if (!campaignName) {
    setLookupResult("Campaign name is required for campaign move.", "bad");
    return;
  }

  try {
    const payload = await apiRequest(`/api/v1/admin/maps/${encodeURIComponent(uid)}/campaign`, {
      method: "POST",
      body: {
        campaignName,
        slot: Number.isFinite(slot) && slot > 0 ? Math.floor(slot) : 1,
      },
      admin: true,
    });

    const mapName = payload?.updated?.map?.name || uid;
    const mapCampaign = payload?.updated?.map?.campaign || campaignName;
    const mapSlot = payload?.updated?.map?.slot || slot;
    pushAdminLog(`Campaign placement updated for ${mapName} -> ${mapCampaign} #${mapSlot}.`);
    elements.adminCampaignInput.value = "";
    await loadDashboard({ silent: true });
  } catch (error) {
    pushAdminLog(`Campaign update failed: ${error.message}`);
    setLookupResult(`Campaign update failed: ${error.message}`, "bad");
  }
}

async function handleTrackingUpdate(event) {
  event.preventDefault();
  const uid = elements.trackingMapSelect.value;
  const nextState = elements.trackingStateSelect.value;

  if (!uid) {
    setLookupResult("Select a map first.", "bad");
    return;
  }

  const body =
    nextState === "tracked"
      ? { tracked: true, status: "live" }
      : { tracked: false, status: "paused" };

  try {
    const payload = await apiRequest(`/api/v1/admin/maps/${encodeURIComponent(uid)}/tracking`, {
      method: "POST",
      body,
      admin: true,
    });
    const mapName = payload?.updated?.map?.name || uid;
    pushAdminLog(`Tracking updated for ${mapName}: ${nextState}.`);
    await loadDashboard({ silent: true });
  } catch (error) {
    pushAdminLog(`Tracking update failed: ${error.message}`);
    setLookupResult(`Tracking update failed: ${error.message}`, "bad");
  }
}

async function handleUidLookup(event) {
  event.preventDefault();
  const uid = elements.uidLookupInput.value.trim();

  if (!uid) {
    setLookupResult("Enter a map UID first.", "bad");
    return;
  }

  try {
    const payload = await apiRequest(`/api/v1/maps/info/${encodeURIComponent(uid)}`);
    if (!payload?.exists || !payload?.map) {
      setLookupResult(`UID ${uid} is not currently in altered tracking data.`, "bad");
      pushAdminLog(`UID lookup miss: ${uid}.`);
      return;
    }

    const map = payload.map;
    setLookupResult(
      `${map.name} found - ${map.campaign} #${map.slot} - tracked=${Boolean(map.tracked)} - status=${map.status}`,
      "good"
    );
    pushAdminLog(`UID lookup hit: ${map.uid} (${map.name}).`);
  } catch (error) {
    setLookupResult(`Lookup failed: ${error.message}`, "bad");
    pushAdminLog(`UID lookup error: ${error.message}`);
  }
}

async function handleHookConfigSubmit(event) {
  event.preventDefault();
  const clubId = Number(elements.hookClubIdInput.value || 0);
  const clubName = elements.hookClubNameInput.value.trim();
  const sourceLabel = elements.hookSourceInput.value.trim();
  const enabled = elements.hookEnabledToggle.checked;
  const autoTrackNewMaps = elements.hookAutoTrackToggle.checked;

  if (!Number.isFinite(clubId) || clubId <= 0) {
    setLookupResult("Hook config requires a valid club ID.", "bad");
    return;
  }

  try {
    const payload = await apiRequest("/api/v1/admin/hook/altered/config", {
      method: "POST",
      admin: true,
      body: {
        clubId,
        clubName,
        sourceLabel,
        enabled,
        autoTrackNewMaps,
      },
    });
    state.hook.status = payload?.hook || state.hook.status;
    renderHookPanel();
    pushAdminLog(`Hook config saved for club ${clubId}.`);
  } catch (error) {
    pushAdminLog(`Hook config update failed: ${error.message}`);
    setLookupResult(`Hook config update failed: ${error.message}`, "bad");
  }
}

async function handleHookSyncSubmit(event) {
  event.preventDefault();
  const raw = elements.hookSnapshotInput.value.trim();
  if (!raw) {
    setLookupResult("Paste a snapshot JSON payload before syncing.", "bad");
    return;
  }

  let snapshot = null;
  try {
    snapshot = JSON.parse(raw);
  } catch {
    setLookupResult("Snapshot JSON is invalid.", "bad");
    return;
  }

  elements.hookSyncBtn.disabled = true;
  const oldText = elements.hookSyncBtn.textContent;
  elements.hookSyncBtn.textContent = "Syncing...";
  try {
    const payload = await apiRequest("/api/v1/admin/hook/altered/sync", {
      method: "POST",
      admin: true,
      body: snapshot,
    });
    const synced = payload?.synced || {};
    pushAdminLog(
      `Hook sync completed: ${synced.mapsSeen || 0} maps seen, ${synced.mapsInserted || 0} inserted, ${synced.mapsUpdated || 0} updated.`
    );
    await Promise.all([loadDashboard({ silent: true }), loadHookData({ silent: true })]);
  } catch (error) {
    pushAdminLog(`Hook sync failed: ${error.message}`);
    setLookupResult(`Hook sync failed: ${error.message}`, "bad");
  } finally {
    elements.hookSyncBtn.disabled = false;
    elements.hookSyncBtn.textContent = oldText;
  }
}

async function handleHookMapAction(event) {
  const button = event.target.closest("[data-hook-action]");
  if (!button) return;

  const mapUid = button.getAttribute("data-map-uid");
  const action = button.getAttribute("data-hook-action");
  if (!mapUid || !action) return;

  const payload =
    action === "track"
      ? { tracked: true, status: "live" }
      : { tracked: false, status: "paused" };

  button.disabled = true;
  try {
    const result = await apiRequest(
      `/api/v1/admin/hook/altered/maps/${encodeURIComponent(mapUid)}/tracking`,
      {
        method: "POST",
        admin: true,
        body: payload,
      }
    );
    const mapName = result?.updated?.map?.name || mapUid;
    pushAdminLog(`Hook map update: ${mapName} -> ${action === "track" ? "tracked" : "paused"}.`);
    await Promise.all([loadDashboard({ silent: true }), loadHookData({ silent: true })]);
  } catch (error) {
    pushAdminLog(`Hook map update failed: ${error.message}`);
    setLookupResult(`Hook map update failed: ${error.message}`, "bad");
  } finally {
    button.disabled = false;
  }
}

function configureHubLinks() {
  const host = window.location.hostname.toLowerCase();
  const port = window.location.port || "80";
  const isPathMode = host === "localhost" || host === "127.0.0.1" || host === "xjk.localhost";
  const isLocalSubdomain = host.endsWith(".localhost");
  const isLocalMode = isPathMode || isLocalSubdomain;

  const links = {
    main: "https://xjk.yt/",
    tools: "https://tools.xjk.yt/",
    plugins: "https://plugins.xjk.yt/",
    learn: "https://learn.xjk.yt/",
    tracker: "https://trackers.xjk.yt/leaderboard/",
    trackers: "https://trackers.xjk.yt/",
  };

  if (isLocalMode) {
    links.main = `http://xjk.localhost:${port}/`;
    links.tools = `http://tools.localhost:${port}/`;
    links.plugins = `http://plugins.localhost:${port}/`;
    links.learn = `http://learn.localhost:${port}/`;
    links.tracker = `http://trackers.localhost:${port}/leaderboard/`;
    links.trackers = `http://trackers.localhost:${port}/`;
  }

  document.querySelectorAll("[data-link]").forEach((node) => {
    const key = node.getAttribute("data-link");
    const href = links[key];
    if (!href) return;
    node.setAttribute("href", href);
  });
}

function bindEvents() {
  elements.trackedSearch.addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    renderTrackedList();
    renderMapTable();
  });

  elements.campaignFilter.addEventListener("change", (event) => {
    state.filters.campaign = event.target.value;
    renderMapTable();
  });

  elements.sortSelect.addEventListener("change", (event) => {
    state.filters.sort = event.target.value;
    renderMapTable();
  });

  elements.trackedOnlyToggle.addEventListener("change", (event) => {
    state.filters.trackedOnly = event.target.checked;
    renderMapTable();
  });

  elements.simulateWrBtn.addEventListener("click", simulateIncomingWr);
  elements.campaignForm.addEventListener("submit", handleCampaignMove);
  elements.trackingForm.addEventListener("submit", handleTrackingUpdate);
  elements.uidLookupForm.addEventListener("submit", handleUidLookup);
  elements.hookConfigForm.addEventListener("submit", handleHookConfigSubmit);
  elements.hookSyncForm.addEventListener("submit", handleHookSyncSubmit);
  elements.hookMapSearch.addEventListener("input", (event) => {
    state.filters.hookSearch = event.target.value;
    renderHookMapList();
  });
  elements.hookMapList.addEventListener("click", handleHookMapAction);
}

async function boot() {
  if (elements.syncNote) {
    elements.syncNote.textContent = `Auto refresh every ${Math.floor(REFRESH_INTERVAL_MS / 1000)}s`;
  }

  state.filters.sort = elements.sortSelect.value;
  state.filters.trackedOnly = elements.trackedOnlyToggle.checked;

  setLookupResult("No lookup yet.");
  configureHubLinks();
  bindEvents();

  await loadDashboard();
  await loadHookData({ silent: true });

  window.setInterval(() => {
    renderHeroStats();
    renderLatest();
    renderMapTable();
  }, 30000);

  window.setInterval(() => {
    loadDashboard({ silent: true });
    loadHookData({ silent: true });
  }, REFRESH_INTERVAL_MS);
}

boot();
