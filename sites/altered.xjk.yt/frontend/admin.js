const REFRESH_INTERVAL_MS = 25000;
const HEAVY_DATA_REFRESH_MS = 3 * 60 * 1000;
const DIAGNOSTICS_REFRESH_INTERVAL_MS = 10000;
const DIAG_TIMELINE_DEFAULT_SOURCE = "best";
const DIAG_TIMELINE_DEFAULT_BUCKET = "month";
const DIAG_TIMELINE_DEFAULT_DAYS = 730;
const TM_STYLE_CODE_REGEX = /\$([0-9a-f]{1,3}|[gimnostuwz<>]|[hlp](\[[^\]]+\])?)/gi;
const TAB_STORAGE_KEY = "altered_admin_tab";
const MONITOR_SUBTAB_STORAGE_KEY = "altered_admin_monitor_subtab";
const CLUB_CAMPAIGNS_PAGE_SIZE = 30;
const CLUB_RENDER_MAP_LIMIT_PER_CAMPAIGN = 80;
const CLUB_RENDER_CARD_CHUNK_SIZE = 2;
const CONNECTED_MAP_PAGE_SIZE = 40;
const HOOK_MAP_PAGE_SIZE = 45;
const NAME_CANDIDATE_LIMIT = 260;
const NAME_CANDIDATE_RENDER_CHUNK_SIZE = 28;
const OPS_EVENTS_PAGE_SIZE = 30;
const SELECTOR_APPEND_CHUNK_SIZE = 220;
const SELECTOR_EAGER_CHUNKS = 2;
const VALID_TABS = new Set([
  "overview",
  "monitor",
  "tracker",
  "map-operations",
  "diagnostics",
  "activity-log",
]);
const VALID_MONITOR_SUBTABS = new Set(["scheduler", "maps", "campaigns", "names"]);
const LIVE_PROGRESS_POLL_MS = 1250;
const LIVE_PROGRESS_TIMEOUT_MS = 20 * 60 * 1000;
const TOAST_DEFAULT_MS = 5200;
const TOAST_MIN_MS = 3600;

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const DIAG_COLORS = {
  cyan: "#22ccee",
  cyanBright: "#33ffff",
  blue: "#2299ee",
  purple: "#1166dd",
  inkDim: "#6b8ba8",
  inkMuted: "#3d5a73",
  gridLine: "rgba(190, 205, 255, 0.1)",
  ink: "#e8f4ff",
};

const state = {
  maps: [],
  mapOptions: [],
  summary: null,
  wrFeed: [],
  tracker: null,
  auth: null,
  hook: {
    status: null,
    maps: [],
    runs: [],
  },
  live: {
    status: null,
  },
  naming: {
    summary: null,
    candidates: [],
    filters: {
      search: "",
      automationState: "",
      reviewState: "",
      requiresRegex: "",
    },
  },
  diagnostics: {
    stats: null,
    opsOverview: null,
    opsRuns: [],
    opsEvents: [],
    syncRuns: [],
    timeline: null,
    timelineConfig: {
      source: DIAG_TIMELINE_DEFAULT_SOURCE,
      bucket: DIAG_TIMELINE_DEFAULT_BUCKET,
      days: DIAG_TIMELINE_DEFAULT_DAYS,
    },
  },
  filters: {
    hookSearch: "",
  },
  adminLog: [],
  ui: {
    activeTab: "overview",
    monitorSubTab: "scheduler",
    connectedMapsPage: 1,
    clubStructurePage: 1,
    hookMapsPage: 1,
    opsEventsPage: 1,
    selectorSignature: "",
    selectorHydrationToken: 0,
    selectorHydrationRunning: false,
    selectorHydrationLoaded: 0,
    selectorHydrationTotal: 0,
    monitorRenderToken: 0,
    clubStructureRenderToken: 0,
    namingRenderToken: 0,
    namingRenderInProgress: false,
    diagRenderToken: 0,
  },
  cache: {
    heavyLoadedAt: 0,
    heavyLoaded: false,
    adminOptionsSourceKey: "",
    adminOptions: [],
    dashboardLoadPromise: null,
    diagnosticsLoadPromise: null,
    mapDataVersion: 0,
    monitorDerivedSourceKey: "",
    monitorDerived: null,
    namingRenderedRef: null,
    diagDerivedVersion: -1,
    diagDerived: {
      mapsPerCampaign: [],
      tracking: {
        tracked: 0,
        paused: 0,
        other: 0,
        total: 0,
      },
    },
  },
};

const elements = {
  authState: document.getElementById("authState"),
  logoutBtn: document.getElementById("logoutBtn"),
  statTracked: document.getElementById("statTracked"),
  statCampaigns: document.getElementById("statCampaigns"),
  statLatest: document.getElementById("statLatest"),
  trackerRuntime: document.getElementById("trackerRuntime"),
  tabButtons: Array.from(document.querySelectorAll("[data-admin-tab]")),
  tabPanels: Array.from(document.querySelectorAll("[data-tab-panel]")),
  overviewHookStatus: document.getElementById("overviewHookStatus"),
  overviewHookRun: document.getElementById("overviewHookRun"),
  overviewRunsList: document.getElementById("overviewRunsList"),
  overviewOpsStatus: document.getElementById("overviewOpsStatus"),
  overviewOpsGrid: document.getElementById("overviewOpsGrid"),
  overviewMonitorStatus: document.getElementById("overviewMonitorStatus"),
  overviewNextRuns: document.getElementById("overviewNextRuns"),
  monitorSummaryLine: document.getElementById("monitorSummaryLine"),
  monitorOpenMapOpsBtn: document.getElementById("monitorOpenMapOpsBtn"),
  monitorSubTabButtons: Array.from(document.querySelectorAll("[data-monitor-subtab]")),
  monitorSubTabPanels: Array.from(document.querySelectorAll("[data-monitor-subpanel]")),
  connectedMapsSummary: document.getElementById("connectedMapsSummary"),
  connectedMapsLiveMeta: document.getElementById("connectedMapsLiveMeta"),
  connectedMapsBody: document.getElementById("connectedMapsBody"),
  connectedMapsPrevBtn: document.getElementById("connectedMapsPrevBtn"),
  connectedMapsNextBtn: document.getElementById("connectedMapsNextBtn"),
  connectedMapsPageInfo: document.getElementById("connectedMapsPageInfo"),
  clubStructureBoard: document.getElementById("clubStructureBoard"),
  clubStructurePrevBtn: document.getElementById("clubStructurePrevBtn"),
  clubStructureNextBtn: document.getElementById("clubStructureNextBtn"),
  clubStructurePageInfo: document.getElementById("clubStructurePageInfo"),
  liveMonitorForm: document.getElementById("liveMonitorForm"),
  liveClubIdInput: document.getElementById("liveClubIdInput"),
  liveActivityPageSizeInput: document.getElementById("liveActivityPageSizeInput"),
  liveIntervalInput: document.getElementById("liveIntervalInput"),
  liveScheduleModeSelect: document.getElementById("liveScheduleModeSelect"),
  liveDailyHourInput: document.getElementById("liveDailyHourInput"),
  liveDailyMinuteInput: document.getElementById("liveDailyMinuteInput"),
  liveTrackerChunkSizeInput: document.getElementById("liveTrackerChunkSizeInput"),
  liveEnabledToggle: document.getElementById("liveEnabledToggle"),
  liveActiveOnlyToggle: document.getElementById("liveActiveOnlyToggle"),
  liveFetchDetailsToggle: document.getElementById("liveFetchDetailsToggle"),
  liveRefreshBtn: document.getElementById("liveRefreshBtn"),
  liveFetchBtn: document.getElementById("liveFetchBtn"),
  liveSyncBtn: document.getElementById("liveSyncBtn"),
  liveStatusLine: document.getElementById("liveStatusLine"),
  liveNextRunLine: document.getElementById("liveNextRunLine"),
  liveSummaryLine: document.getElementById("liveSummaryLine"),
  liveProgressBar: document.getElementById("liveProgressBar"),
  liveProgressLine: document.getElementById("liveProgressLine"),
  liveProgressMeta: document.getElementById("liveProgressMeta"),
  liveProgressStats: document.getElementById("liveProgressStats"),
  liveActionStatus: document.getElementById("liveActionStatus"),
  liveActionProgressBar: document.getElementById("liveActionProgressBar"),
  mapOpsStatusLine: document.getElementById("mapOpsStatusLine"),
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
  namingProcessBtn: document.getElementById("namingProcessBtn"),
  namingRefreshBtn: document.getElementById("namingRefreshBtn"),
  namingSearchInput: document.getElementById("namingSearchInput"),
  namingAutomationFilter: document.getElementById("namingAutomationFilter"),
  namingReviewFilter: document.getElementById("namingReviewFilter"),
  namingRegexFilter: document.getElementById("namingRegexFilter"),
  namingSummaryLine: document.getElementById("namingSummaryLine"),
  namingCandidatesBody: document.getElementById("namingCandidatesBody"),
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
  hookMapPrevBtn: document.getElementById("hookMapPrevBtn"),
  hookMapNextBtn: document.getElementById("hookMapNextBtn"),
  hookMapPageInfo: document.getElementById("hookMapPageInfo"),
  adminLogList: document.getElementById("adminLogList"),
  toastStack: document.getElementById("toastStack"),
  diagRefreshBtn: document.getElementById("diagRefreshBtn"),
  diagTotalMaps: document.getElementById("diagTotalMaps"),
  diagActivelyTracked: document.getElementById("diagActivelyTracked"),
  diagTotalWrChanges: document.getElementById("diagTotalWrChanges"),
  diagCampaigns: document.getElementById("diagCampaigns"),
  diagLastRun: document.getElementById("diagLastRun"),
  diagSchedulerStatus: document.getElementById("diagSchedulerStatus"),
  diagOpsSchedulerLine: document.getElementById("diagOpsSchedulerLine"),
  diagOpsGrid: document.getElementById("diagOpsGrid"),
  chartMapsPerCampaign: document.getElementById("chartMapsPerCampaign"),
  chartSyncRuns: document.getElementById("chartSyncRuns"),
  chartTrackingStatus: document.getElementById("chartTrackingStatus"),
  diagTimelineSource: document.getElementById("diagTimelineSource"),
  diagTimelineBucket: document.getElementById("diagTimelineBucket"),
  diagTimelineDays: document.getElementById("diagTimelineDays"),
  diagCampaignTimelineSummary: document.getElementById("diagCampaignTimelineSummary"),
  chartCampaignTimeline: document.getElementById("chartCampaignTimeline"),
  activityLogRefreshBtn: document.getElementById("activityLogRefreshBtn"),
  opsEventsCount: document.getElementById("opsEventsCount"),
  opsEventsList: document.getElementById("opsEventsList"),
  opsEventsPrevBtn: document.getElementById("opsEventsPrevBtn"),
  opsEventsNextBtn: document.getElementById("opsEventsNextBtn"),
  opsEventsPageInfo: document.getElementById("opsEventsPageInfo"),
  opsRunsList: document.getElementById("opsRunsList"),
};
async function apiRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 401) {
    const loginUrl = payload?.loginUrl || "/auth/ubisoft/login?return_to=%2Fadmin%2F";
    window.location.href = loginUrl;
    throw new Error("Unauthorized");
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

function formatAgo(iso) {
  const target = Date.parse(iso || "");
  if (!Number.isFinite(target)) return "-";
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - target) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m ago`;
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}h ago`;
  return `${Math.floor(deltaSeconds / 86400)}d ago`;
}

function formatTimestamp(iso) {
  const value = Date.parse(iso || "");
  if (!Number.isFinite(value)) return "-";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
}

function formatCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString();
}

function formatDurationShort(ms) {
  const parsed = Number(ms);
  if (!Number.isFinite(parsed) || parsed < 0) return "-";
  if (parsed < 1000) return `${Math.floor(parsed)}ms`;
  const totalSeconds = Math.floor(parsed / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h ${remainMinutes}m`;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function asText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function parseFlag(value) {
  const raw = asText(value).toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return undefined;
}

function normalizeDiagTimelineSource(value) {
  const raw = asText(value, DIAG_TIMELINE_DEFAULT_SOURCE).toLowerCase();
  if (raw === "best" || raw === "publication" || raw === "creation" || raw === "start" || raw === "discovered") {
    return raw;
  }
  return DIAG_TIMELINE_DEFAULT_SOURCE;
}

function normalizeDiagTimelineBucket(value) {
  const raw = asText(value, DIAG_TIMELINE_DEFAULT_BUCKET).toLowerCase();
  if (raw === "day" || raw === "week" || raw === "month") return raw;
  return DIAG_TIMELINE_DEFAULT_BUCKET;
}

function readDiagTimelineConfigFromInputs() {
  const current = state.diagnostics.timelineConfig || {
    source: DIAG_TIMELINE_DEFAULT_SOURCE,
    bucket: DIAG_TIMELINE_DEFAULT_BUCKET,
    days: DIAG_TIMELINE_DEFAULT_DAYS,
  };
  const source = normalizeDiagTimelineSource(elements.diagTimelineSource?.value || current.source);
  const bucket = normalizeDiagTimelineBucket(elements.diagTimelineBucket?.value || current.bucket);
  const days = clampNumber(elements.diagTimelineDays?.value || current.days, 7, 3650, DIAG_TIMELINE_DEFAULT_DAYS);
  state.diagnostics.timelineConfig = { source, bucket, days };
  if (elements.diagTimelineSource) elements.diagTimelineSource.value = source;
  if (elements.diagTimelineBucket) elements.diagTimelineBucket.value = bucket;
  if (elements.diagTimelineDays) elements.diagTimelineDays.value = String(days);
  return state.diagnostics.timelineConfig;
}

function getDiagTimelineQueryParams() {
  const config = readDiagTimelineConfigFromInputs();
  const params = new URLSearchParams();
  params.set("source", config.source);
  params.set("bucket", config.bucket);
  params.set("days", String(config.days));
  return params;
}

function resolvePager(totalItems, requestedPage, pageSize) {
  const total = Math.max(0, Number(totalItems) || 0);
  const size = Math.max(1, Number(pageSize) || 1);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const page = clampNumber(requestedPage, 1, totalPages, 1);
  const start = (page - 1) * size;
  const end = Math.min(start + size, total);
  const from = total > 0 ? start + 1 : 0;
  const to = total > 0 ? end : 0;
  return { total, size, totalPages, page, start, end, from, to };
}

function renderPagerControls({ prevButton, nextButton, infoNode, pager, label = "items" } = {}) {
  if (!pager) return;
  const isFirst = pager.page <= 1;
  const isLast = pager.page >= pager.totalPages || pager.total === 0;
  if (prevButton) prevButton.disabled = isFirst || pager.total === 0;
  if (nextButton) nextButton.disabled = isLast;
  if (infoNode) {
    if (pager.total === 0) {
      infoNode.textContent = `No ${label}.`;
    } else {
      infoNode.textContent = `${label}: ${formatCount(pager.from)}-${formatCount(pager.to)} of ${formatCount(pager.total)} | Page ${pager.page} / ${pager.totalPages}`;
    }
  }
}

function hasCounterValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function pickCounter(counters, keys = []) {
  for (const key of keys) {
    const value = counters?.[key];
    if (hasCounterValue(value)) return value;
  }
  return undefined;
}

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
    name: stripTmStyleCodes(map.name || "Unknown map") || "Unknown map",
    campaign: stripTmStyleCodes(map.campaign || "Unassigned") || "Unassigned",
    slot: Number(map.slot || 0),
    wrMs: Number(map.wrMs || 0),
    wrHolder: stripTmStyleCodes(map.wrHolder || "-") || "-",
    wrUpdatedAt: map.wrUpdatedAt || null,
    tracked: Boolean(map.tracked),
    status: sanitizeStatus(map.status),
    checkFrequency: Number(map.checkFrequency || 0),
  };
}

function pushAdminLog(message) {
  const stamp = new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  const cleanMessage = stripTmStyleCodes(message) || "Log entry";
  state.adminLog.unshift(`[${stamp}] ${cleanMessage}`);
  if (state.adminLog.length > 20) state.adminLog.length = 20;
  renderAdminLog();
}

function setLookupResult(text, tone = "neutral") {
  if (!elements.uidLookupResult) return;
  elements.uidLookupResult.textContent = stripTmStyleCodes(text) || "-";
  elements.uidLookupResult.classList.remove("good", "bad");
  if (tone === "good") elements.uidLookupResult.classList.add("good");
  if (tone === "bad") elements.uidLookupResult.classList.add("bad");
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

function notify(level, message, { title = "", durationMs = TOAST_DEFAULT_MS } = {}) {
  if (!elements.toastStack) return;
  const tone = String(level || "info").toLowerCase();
  const safeTone =
    tone === "success" || tone === "warn" || tone === "error" || tone === "info" ? tone : "info";
  const toneDurationMs = { info: 4200, success: 5200, warn: 6200, error: 7600 };
  const toneTitleMap = { info: "Info", success: "Success", warn: "Warning", error: "Error" };
  const toast = document.createElement("article");
  toast.className = `toast ${safeTone}`;
  const titleNode = document.createElement("h4");
  titleNode.className = "toast-title";
  titleNode.textContent = stripTmStyleCodes(title || toneTitleMap[safeTone]) || toneTitleMap[safeTone];
  const bodyNode = document.createElement("p");
  bodyNode.className = "toast-body";
  bodyNode.textContent = stripTmStyleCodes(String(message || "").trim()) || "Notification";
  toast.appendChild(titleNode);
  toast.appendChild(bodyNode);
  elements.toastStack.prepend(toast);
  const dismiss = () => {
    if (!toast.isConnected) return;
    toast.classList.add("is-leaving");
    window.setTimeout(() => {
      if (toast.isConnected) toast.remove();
    }, 200);
  };
  const requestedMs = Number(durationMs);
  const baseMs = Number.isFinite(requestedMs) && requestedMs > 0 ? requestedMs : toneDurationMs[safeTone];
  const resolvedMs = Math.max(TOAST_MIN_MS, Number(baseMs) || TOAST_DEFAULT_MS);
  window.setTimeout(dismiss, resolvedMs);
}

function stripTmStyleCodes(value) {
  return String(value ?? "")
    .replace(TM_STYLE_CODE_REGEX, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function escapeHtml(value) {
  return stripTmStyleCodes(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function getInitialTab() {
  const hashTab = String(window.location.hash || "").replace(/^#/, "").trim();
  if (VALID_TABS.has(hashTab)) return hashTab;
  try {
    const storedTab = String(window.localStorage.getItem(TAB_STORAGE_KEY) || "").trim();
    if (VALID_TABS.has(storedTab)) return storedTab;
  } catch {}
  return "overview";
}

function getInitialMonitorSubTab() {
  try {
    const stored = String(window.localStorage.getItem(MONITOR_SUBTAB_STORAGE_KEY) || "").trim();
    if (VALID_MONITOR_SUBTABS.has(stored)) return stored;
  } catch {}
  return "scheduler";
}

function applyMonitorSubTabVisibility(nextSubTab) {
  elements.monitorSubTabButtons.forEach((button) => {
    const active = button.getAttribute("data-monitor-subtab") === nextSubTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  elements.monitorSubTabPanels.forEach((panel) => {
    const active = panel.getAttribute("data-monitor-subpanel") === nextSubTab;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
}

function setMonitorSubTab(subtab, { persist = true, render = true, load = true } = {}) {
  const nextSubTab = VALID_MONITOR_SUBTABS.has(subtab) ? subtab : "scheduler";
  state.ui.monitorSubTab = nextSubTab;
  applyMonitorSubTabVisibility(nextSubTab);

  if (persist) {
    try {
      window.localStorage.setItem(MONITOR_SUBTAB_STORAGE_KEY, nextSubTab);
    } catch {}
  }

  if (load && state.ui.activeTab === "monitor") {
    if (nextSubTab === "names") {
      void loadMapNameCandidates({ silent: true });
    } else if (nextSubTab === "maps" || nextSubTab === "campaigns") {
      void loadDashboardData({ silent: true, includeHeavy: true });
    }
  }

  if (render && state.ui.activeTab === "monitor") {
    renderTab("monitor");
  }
}

function renderTab(tab) {
  const renderers = typeof TAB_RENDERERS !== "undefined" ? TAB_RENDERERS[tab] : null;
  if (!renderers) return;

  if (tab === "diagnostics") {
    window.requestAnimationFrame(() => {
      if (state.ui.activeTab !== tab) return;
      renderers.forEach((fn) => fn());
    });
    return;
  }

  if (tab === "monitor") {
    const token = ++state.ui.monitorRenderToken;
    const subtab = VALID_MONITOR_SUBTABS.has(state.ui.monitorSubTab)
      ? state.ui.monitorSubTab
      : "scheduler";
    state.ui.monitorSubTab = subtab;
    applyMonitorSubTabVisibility(subtab);

    renderMonitorSummary();
    window.requestAnimationFrame(() => {
      if (state.ui.activeTab !== tab || state.ui.monitorRenderToken !== token) return;
      if (subtab === "scheduler") {
        renderLiveMonitorPanel();
        return;
      }
      if (subtab === "maps") {
        renderConnectedMapsSnapshot();
        return;
      }
      if (subtab === "campaigns") {
        renderClubStructurePanel();
        return;
      }
      if (subtab === "names") {
        renderMapNameStandardizationPanel();
      }
    });
    return;
  }

  renderers.forEach((fn) => fn());
}

function setActiveTab(tab, { persist = true, load = true } = {}) {
  const nextTab = VALID_TABS.has(tab) ? tab : "overview";
  state.ui.activeTab = nextTab;

  elements.tabButtons.forEach((button) => {
    const active = button.getAttribute("data-admin-tab") === nextTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  elements.tabPanels.forEach((panel) => {
    const active = panel.getAttribute("data-tab-panel") === nextTab;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });

  renderTab(nextTab);

  if (persist) {
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, nextTab);
    } catch {}
  }

  if (load) {
    void loadDataForTab(nextTab, { silent: true });
  }
}

function isHeavyTab(tab) {
  if (tab === "monitor") {
    return state.ui.monitorSubTab === "maps" || state.ui.monitorSubTab === "campaigns";
  }
  return tab === "tracker" || tab === "map-operations";
}

function shouldRefreshHeavyData({ force = false } = {}) {
  if (force) return true;
  if (!state.cache.heavyLoaded) return true;
  const ageMs = Date.now() - Number(state.cache.heavyLoadedAt || 0);
  return ageMs >= HEAVY_DATA_REFRESH_MS;
}

async function loadDataForTab(tab, { silent = true } = {}) {
  const active = String(tab || state.ui.activeTab || "overview");
  const dashboardPromise = loadDashboardData({
    silent,
    includeHeavy: isHeavyTab(active),
  });

  if (active === "monitor") {
    if (state.ui.monitorSubTab === "names") {
      await Promise.all([dashboardPromise, loadMapNameCandidates({ silent: true })]);
    } else {
      await dashboardPromise;
    }
  } else if (active === "diagnostics") {
    await Promise.all([dashboardPromise, loadDiagnosticsData({ silent: true })]);
  } else if (active === "activity-log") {
    await Promise.all([dashboardPromise, loadActivityLogData({ silent: true })]);
  } else {
    await dashboardPromise;
  }
}
function renderAuthState() {
  if (!state.auth) {
    elements.authState.textContent = "Checking session...";
    return;
  }
  if (state.auth.authenticated) {
    const userName = state.auth?.user?.username || state.auth?.user?.subject || "admin";
    elements.authState.textContent = `Logged in as ${userName} via Ubisoft`;
    return;
  }
  elements.authState.textContent = "Not authenticated";
}

function renderStats() {
  const tracked = Number(
    state.summary?.trackedMaps ?? state.hook?.status?.trackedCount ?? 0
  );
  const campaigns = Number(
    state.summary?.campaignCount ??
      (Array.isArray(state.maps) && state.maps.length
        ? uniqueBy(state.maps, (m) => String(m.campaign || "")).length
        : 0)
  );
  const latest = Array.isArray(state.wrFeed) && state.wrFeed.length ? state.wrFeed[0] : null;
  const runtime = state.tracker?.runtime || null;

  elements.statTracked.textContent = String(tracked);
  elements.statCampaigns.textContent = String(campaigns);
  elements.statLatest.textContent = latest ? `${latest.name} (${formatAgo(latest.at)})` : "-";
  if (!runtime) {
    elements.trackerRuntime.textContent = "-";
  } else {
    elements.trackerRuntime.textContent = `${runtime.provider || "unknown"} / ${runtime.enabled ? "enabled" : "disabled"}`;
  }
}
function renderOverviewPanel() {
  const hook = state.hook.status;
  if (!hook) {
    elements.overviewHookStatus.textContent = "Hook status: not configured";
    elements.overviewHookRun.textContent = "Latest sync run: -";
  } else {
    const enabled = hook.enabled ? "enabled" : "disabled";
    const autoTrack = hook.autoTrackNewMaps ? "on" : "off";
    const hookKey = stripTmStyleCodes(hook.hookKey || "") || "altered-club";
    const clubName = stripTmStyleCodes(hook.clubName || "") || "Unknown club";
    elements.overviewHookStatus.textContent = `Hook ${hookKey} | club ${clubName} (${hook.clubId}) | ${enabled} | auto-track ${autoTrack}`;

    if (hook.latestRun) {
      elements.overviewHookRun.textContent = `Latest sync #${hook.latestRun.runId} | ${hook.latestRun.status} | ${hook.latestRun.mapsSeen} seen, ${hook.latestRun.mapsInserted} inserted, ${hook.latestRun.mapsUpdated} updated | ${formatAgo(hook.latestRun.finishedAt)}`;
    } else {
      elements.overviewHookRun.textContent = "Latest sync run: none yet";
    }
  }

  elements.overviewRunsList.innerHTML = "";
  const runs = Array.isArray(state.hook.runs) ? state.hook.runs.slice(0, 8) : [];
  if (!runs.length) {
    const item = document.createElement("li");
    item.innerHTML = '<strong>No sync runs yet.</strong><span class="hook-map-meta">Sync a club snapshot to start building history.</span>';
    elements.overviewRunsList.appendChild(item);
  } else {
    runs.forEach((run) => {
      const item = document.createElement("li");
      const runId = Number(run.runId || 0);
      const status = String(run.status || "ok");
      const finishedText = run.finishedAt ? formatAgo(run.finishedAt) : "-";
      item.innerHTML = `
        <strong>Run #${runId || "-"} | ${status}</strong>
        <span class="hook-map-meta">${run.mapsSeen || 0} seen | ${run.mapsInserted || 0} inserted | ${run.mapsUpdated || 0} updated</span>
        <span class="hook-map-meta">${finishedText}</span>
      `;
      elements.overviewRunsList.appendChild(item);
    });
  }

  const ops = state.diagnostics.opsOverview;
  if (ops && elements.overviewOpsStatus) {
    const counts = ops.counts || {};
    elements.overviewOpsStatus.textContent = `${formatCount(counts.users || 0)} users | ${formatCount(counts.schedules || 0)} schedules | ${formatCount(counts.monitoredMaps || 0)} monitored maps`;
    if (elements.overviewOpsGrid) {
      elements.overviewOpsGrid.innerHTML = "";
      [
        { label: "Due Schedules", value: formatCount(counts.dueSchedules || 0) },
        { label: "Queued Commands", value: formatCount(counts.queuedBotCommands || 0) },
      ].forEach((m) => {
        const card = document.createElement("article");
        card.className = "live-progress-stat";
        card.innerHTML = `<span class="live-progress-stat-label">${escapeHtml(m.label)}</span><strong class="live-progress-stat-value">${escapeHtml(m.value)}</strong>`;
        elements.overviewOpsGrid.appendChild(card);
      });
    }
  }

  if (elements.overviewMonitorStatus && state.live.status) {
    const monitor = state.live.status.monitor || {};
    elements.overviewMonitorStatus.textContent = `Monitor ${monitor.enabled ? "enabled" : "disabled"} | full=${monitor.running ? "running" : "idle"} | discovery=${monitor.discoveryRunning ? "running" : monitor.discoveryEnabled ? "enabled" : "disabled"}`;
    if (elements.overviewNextRuns) {
      elements.overviewNextRuns.textContent = `Next full: ${formatTimestamp(monitor.nextRunAt)} | Next discovery: ${formatTimestamp(monitor.nextDiscoveryRunAt)}`;
    }
  }
}
function renderLiveProgressStats(progress, monitor = null) {
  if (!elements.liveProgressStats) return;
  const counters = progress?.counters && typeof progress.counters === "object" ? progress.counters : {};

  const clubId = pickCounter(counters, ["clubId"]);
  const clubName = pickCounter(counters, ["clubName"]);
  const authSource = pickCounter(counters, ["authSource"]);
  const activityPagesLoaded = pickCounter(counters, ["activityPagesLoaded"]);
  const activitiesSeen = pickCounter(counters, ["activitiesSeen"]);
  const campaignsSeen = pickCounter(counters, ["campaignsSeen"]);
  const campaignsLoaded = pickCounter(counters, ["campaignsLoaded", "campaignsProcessed"]);
  const campaignsWithMaps = pickCounter(counters, ["campaignsWithMaps"]);
  const mapUidsDiscovered = pickCounter(counters, ["mapUidsDiscovered"]);
  const mapsLoaded = pickCounter(counters, ["mapsLoaded"]);
  const mapDetailsLoaded = pickCounter(counters, ["mapDetailsLoaded"]);
  const mapDetailsRequested = pickCounter(counters, ["mapDetailsRequested"]);
  const mapDetailChunksLoaded = pickCounter(counters, ["mapDetailChunksLoaded"]);
  const mapDetailChunksTotal = pickCounter(counters, ["mapDetailChunksTotal"]);
  const mapsStored = pickCounter(counters, ["mapsStored", "mapsToStore"]);
  const mapsInserted = pickCounter(counters, ["mapsInserted"]);
  const mapsUpdated = pickCounter(counters, ["mapsUpdated"]);
  const mapsLinked = pickCounter(counters, ["mapsLinked"]);
  const trackerMapsSynced = pickCounter(counters, ["trackerMapsSynced"]);
  const trackerMapsToSync = pickCounter(counters, ["trackerMapsToSync"]);
  const trackerChunksSynced = pickCounter(counters, ["trackerChunksSynced"]);
  const trackerChunksTotal = pickCounter(counters, ["trackerChunksTotal"]);
  const mapperAccountsSeen = pickCounter(counters, ["mapperAccountsSeen"]);
  const mapperNamesResolved = pickCounter(counters, ["mapperNamesResolved"]);
  const mapperNamesUpdated = pickCounter(counters, ["mapperNamesUpdated"]);
  const mapperNameHistoryInserted = pickCounter(counters, ["mapperNameHistoryInserted"]);
  const mapperMapNameLinksUpdated = pickCounter(counters, ["mapperMapNameLinksUpdated"]);
  const currentCampaignName = pickCounter(counters, ["currentCampaignName"]);
  const currentCampaignMapCount = pickCounter(counters, ["currentCampaignMapCount"]);
  const activeOnlyRequested = pickCounter(counters, ["activeOnlyRequested"]);
  const activeOnlyUsed = pickCounter(counters, ["activeOnlyUsed"]);
  const fallbackApplied = pickCounter(counters, ["activityFallbackApplied"]);
  const durationFromProgress = pickCounter(counters, ["durationMs"]);
  const durationMs = Number.isFinite(Number(durationFromProgress)) && Number(durationFromProgress) >= 0 ? Number(durationFromProgress) : Number(progress?.durationMs);
  const startedAtMs = Date.parse(progress?.startedAt || "");
  const isRunning = String(progress?.status || "").toLowerCase() === "running";
  const elapsedMs = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : isRunning && Number.isFinite(startedAtMs) ? Math.max(0, Date.now() - startedAtMs) : Number(monitor?.lastDurationMs);

  const stats = [
    { label: "Club", value: hasCounterValue(clubId) || hasCounterValue(clubName) ? `${clubName || "Club"}${hasCounterValue(clubId) ? ` (#${clubId})` : ""}` : "-" },
    { label: "Auth Source", value: hasCounterValue(authSource) ? String(authSource) : "-" },
    { label: "Activity Pages", value: hasCounterValue(activityPagesLoaded) ? formatCount(activityPagesLoaded) : "-" },
    { label: "Activities Seen", value: hasCounterValue(activitiesSeen) ? formatCount(activitiesSeen) : "-" },
    { label: "Campaigns", value: hasCounterValue(campaignsLoaded) || hasCounterValue(campaignsSeen) ? `${formatCount(campaignsLoaded)} / ${formatCount(campaignsSeen)} loaded${hasCounterValue(campaignsWithMaps) ? ` | with maps ${formatCount(campaignsWithMaps)}` : ""}` : "-" },
    { label: "Current Campaign", value: hasCounterValue(currentCampaignName) ? `${currentCampaignName}${hasCounterValue(currentCampaignMapCount) ? ` (${formatCount(currentCampaignMapCount)} maps)` : ""}` : "-" },
    { label: "Map UIDs Found", value: hasCounterValue(mapUidsDiscovered) ? formatCount(mapUidsDiscovered) : "-" },
    { label: "Map Metadata", value: hasCounterValue(mapDetailsLoaded) || hasCounterValue(mapDetailsRequested) ? `${formatCount(mapDetailsLoaded)} / ${formatCount(mapDetailsRequested)}` : "-" },
    { label: "Metadata Chunks", value: hasCounterValue(mapDetailChunksLoaded) || hasCounterValue(mapDetailChunksTotal) ? `${formatCount(mapDetailChunksLoaded)} / ${formatCount(mapDetailChunksTotal)}` : "-" },
    { label: "Store Results", value: hasCounterValue(mapsLoaded) || hasCounterValue(mapsStored) ? `loaded ${formatCount(mapsLoaded)} | stored ${formatCount(mapsStored)} | +${formatCount(mapsInserted)} / ~${formatCount(mapsUpdated)} / linked ${formatCount(mapsLinked)}` : "-" },
    { label: "Tracker Sync", value: hasCounterValue(trackerMapsSynced) || hasCounterValue(trackerMapsToSync) ? `${formatCount(trackerMapsSynced)} / ${formatCount(trackerMapsToSync)} maps | chunks ${formatCount(trackerChunksSynced)} / ${formatCount(trackerChunksTotal)}` : "-" },
    { label: "Mapper Names", value: hasCounterValue(mapperAccountsSeen) || hasCounterValue(mapperNamesResolved) ? `accounts ${formatCount(mapperAccountsSeen)} | resolved ${formatCount(mapperNamesResolved)} | updated ${formatCount(mapperNamesUpdated)}` : "-" },
    { label: "Name History", value: hasCounterValue(mapperNameHistoryInserted) || hasCounterValue(mapperMapNameLinksUpdated) ? `history +${formatCount(mapperNameHistoryInserted)} | map links ${formatCount(mapperMapNameLinksUpdated)}` : "-" },
    { label: "Active-Only Mode", value: hasCounterValue(activeOnlyRequested) || hasCounterValue(activeOnlyUsed) ? `requested=${String(Boolean(activeOnlyRequested))} | used=${String(Boolean(activeOnlyUsed))}${hasCounterValue(fallbackApplied) ? ` | fallback=${String(Boolean(fallbackApplied))}` : ""}` : "-" },
    { label: "Run Time", value: formatDurationShort(elapsedMs) },
  ];

  elements.liveProgressStats.innerHTML = "";
  stats.forEach((stat) => {
    const card = document.createElement("article");
    card.className = "live-progress-stat";
    const label = document.createElement("span");
    label.className = "live-progress-stat-label";
    label.textContent = stat.label;
    const value = document.createElement("strong");
    value.className = "live-progress-stat-value";
    value.textContent = String(stat.value || "-");
    card.appendChild(label);
    card.appendChild(value);
    elements.liveProgressStats.appendChild(card);
  });
}

function toggleLiveScheduleInputs() {
  const mode = String(elements.liveScheduleModeSelect?.value || "daily").toLowerCase();
  const isDaily = mode === "daily";
  if (elements.liveDailyHourInput) elements.liveDailyHourInput.disabled = !isDaily;
  if (elements.liveDailyMinuteInput) elements.liveDailyMinuteInput.disabled = !isDaily;
  if (elements.liveIntervalInput) elements.liveIntervalInput.disabled = isDaily;
}

function renderLiveProgress(progress, monitor = null) {
  const safeProgress = progress && typeof progress === "object" ? progress : null;
  const percent = clampNumber(safeProgress?.percent, 0, 100, 0);
  if (elements.liveProgressBar) elements.liveProgressBar.style.width = `${percent}%`;
  if (elements.liveActionProgressBar) elements.liveActionProgressBar.style.width = `${percent}%`;

  if (!safeProgress) {
    if (elements.liveProgressLine) elements.liveProgressLine.textContent = "Progress: idle";
    if (elements.liveProgressMeta) elements.liveProgressMeta.textContent = "No active run.";
    if (elements.liveProgressStats) elements.liveProgressStats.innerHTML = '<p class="hook-map-meta">No live statistics yet.</p>';
    if (elements.liveActionStatus) elements.liveActionStatus.textContent = "Manual fetch status: idle";
    return;
  }

  const status = String(safeProgress.status || "running");
  const phase = String(safeProgress.phase || "running");
  const message = String(safeProgress.message || "Working...");
  const startedAt = safeProgress.startedAt ? formatTimestamp(safeProgress.startedAt) : "-";
  const finishedAt = safeProgress.finishedAt ? formatTimestamp(safeProgress.finishedAt) : "-";
  const counters = safeProgress.counters || {};

  if (elements.liveProgressLine) elements.liveProgressLine.textContent = `Progress ${percent}% | ${status} | ${phase}`;
  if (elements.liveProgressMeta) elements.liveProgressMeta.textContent = `${message} | started ${startedAt} | finished ${finishedAt} | campaigns ${Number(counters.campaignsLoaded || counters.campaignsProcessed || 0)} | maps ${Number(counters.mapsLoaded || counters.mapsStored || 0)}`;
  renderLiveProgressStats(safeProgress, monitor);
  if (elements.liveActionStatus) elements.liveActionStatus.textContent = `Manual fetch status: ${status} | ${phase} | ${percent}%`;
}

function renderLiveMonitorPanel() {
  const payload = state.live.status;
  if (!payload) {
    if (elements.liveStatusLine) elements.liveStatusLine.textContent = "Live monitor status: unavailable";
    if (elements.liveNextRunLine) elements.liveNextRunLine.textContent = "Next scheduled run: -";
    if (elements.liveSummaryLine) elements.liveSummaryLine.textContent = "Last live sync: -";
    renderLiveProgress(null, null);
    return;
  }

  const monitor = payload.monitor || {};
  const auth = payload.auth || {};
  const authAdvice = String(payload.authAdvice || "").trim();
  elements.liveClubIdInput.value = String(monitor.clubId || elements.liveClubIdInput.value || "24231");
  elements.liveActivityPageSizeInput.value = String(monitor.activityPageSize || elements.liveActivityPageSizeInput.value || "250");
  elements.liveIntervalInput.value = String(monitor.intervalSeconds || elements.liveIntervalInput.value || "21600");
  elements.liveScheduleModeSelect.value = monitor.scheduleMode === "interval" ? "interval" : "daily";
  elements.liveDailyHourInput.value = String(clampNumber(monitor.dailyHourUtc, 0, 23, 3));
  elements.liveDailyMinuteInput.value = String(clampNumber(monitor.dailyMinuteUtc, 0, 59, 0));
  elements.liveTrackerChunkSizeInput.value = String(clampNumber(monitor.trackerChunkSize, 25, 1000, 350));
  elements.liveEnabledToggle.checked = Boolean(monitor.enabled);
  elements.liveActiveOnlyToggle.checked = Boolean(monitor.activeOnly);
  elements.liveFetchDetailsToggle.checked = Boolean(monitor.fetchMapDetails);
  toggleLiveScheduleInputs();

  const authState = payload.configured ? `auth ready (${auth.authMode || "unknown"})` : "auth not configured (Nadeo account required)";
  if (elements.liveStatusLine) {
    elements.liveStatusLine.textContent = `Live monitor ${monitor.enabled ? "enabled" : "disabled"} | ${authState} | mode ${monitor.scheduleMode || "interval"} | full=${monitor.running ? "running" : "idle"} | discovery=${monitor.discoveryRunning ? "running" : monitor.discoveryEnabled ? "enabled" : "disabled"}${authAdvice ? ` | ${authAdvice}` : ""}`;
  }

  let fullScheduleText = "-";
  if (monitor.scheduleMode === "daily") {
    const hour = clampNumber(monitor.dailyHourUtc, 0, 23, 3);
    const minute = clampNumber(monitor.dailyMinuteUtc, 0, 59, 0);
    const dailyText = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} UTC`;
    fullScheduleText = `${formatTimestamp(monitor.nextRunAt)} (daily @ ${dailyText})`;
  } else {
    fullScheduleText = `${formatTimestamp(monitor.nextRunAt)} (every ${Number(monitor.intervalSeconds || 0)}s)`;
  }
  const discoveryScheduleText = monitor.discoveryEnabled
    ? `${formatTimestamp(monitor.nextDiscoveryRunAt)} (every ${Number(monitor.discoveryIntervalSeconds || 0)}s, latest ${Number(monitor.discoveryCampaignLimit || 0)} campaigns)`
    : "disabled";
  if (elements.liveNextRunLine) elements.liveNextRunLine.textContent = `Next runs | full: ${fullScheduleText} | discovery: ${discoveryScheduleText}`;

  if (monitor.lastSummary) {
    let text = `Last sync: ${monitor.lastSummary.campaignsLoaded || 0} campaigns, ${monitor.lastSummary.mapsLoaded || 0} maps, details ${monitor.lastSummary.mapDetailsLoaded || 0} | ${formatAgo(monitor.lastFinishedAt)}`;
    if (monitor.lastDiscoverySummary) {
      text += ` | last discovery: ${monitor.lastDiscoverySummary.newCampaignsStored || 0} new campaigns, ${monitor.lastDiscoverySummary.uploadBucketsSeen || 0} upload buckets (${formatAgo(monitor.lastDiscoveryFinishedAt)})`;
    }
    if (elements.liveSummaryLine) elements.liveSummaryLine.textContent = text;
  } else if (monitor.lastError) {
    if (elements.liveSummaryLine) elements.liveSummaryLine.textContent = `Last sync error: ${monitor.lastError}`;
  } else if (monitor.lastDiscoverySummary) {
    if (elements.liveSummaryLine) elements.liveSummaryLine.textContent = `Last discovery: ${monitor.lastDiscoverySummary.newCampaignsStored || 0} new campaigns, ${monitor.lastDiscoverySummary.uploadBucketsSeen || 0} upload buckets (${formatAgo(monitor.lastDiscoveryFinishedAt)})`;
  } else {
    if (elements.liveSummaryLine) elements.liveSummaryLine.textContent = "Last live sync: none yet";
  }

  renderLiveProgress(monitor.progress || null, monitor);
}

function getMonitorSourceMaps() {
  if (Array.isArray(state.hook.maps) && state.hook.maps.length) return state.hook.maps;
  return Array.isArray(state.maps) ? state.maps : [];
}

function getMonitorDerivedData() {
  const sourceMaps = getMonitorSourceMaps();
  const sourceType = Array.isArray(state.hook.maps) && state.hook.maps.length ? "hook" : "maps";
  const sourceKey = `${sourceType}:${state.cache.mapDataVersion}:${sourceMaps.length}:${
    sourceMaps[0]?.uid || sourceMaps[0]?.map_uid || ""
  }:${sourceMaps[sourceMaps.length - 1]?.uid || sourceMaps[sourceMaps.length - 1]?.map_uid || ""}`;

  if (state.cache.monitorDerivedSourceKey === sourceKey && state.cache.monitorDerived) {
    return state.cache.monitorDerived;
  }

  const campaignToGroup = new Map();
  const groups = [];
  let trackedCount = 0;
  for (const map of sourceMaps) {
    if (Boolean(map?.tracked)) trackedCount += 1;
    const campaign = String(map?.campaign || "Unassigned");
    let group = campaignToGroup.get(campaign);
    if (!group) {
      group = { campaign, maps: [] };
      campaignToGroup.set(campaign, group);
      groups.push(group);
    }
    group.maps.push(map);
  }

  const derived = {
    sourceMaps,
    groups,
    campaignCount: groups.length,
    trackedCount,
  };
  state.cache.monitorDerivedSourceKey = sourceKey;
  state.cache.monitorDerived = derived;
  return derived;
}

function getMonitorSummaryMetrics() {
  const sourceMaps = getMonitorSourceMaps();
  const mapCount = sourceMaps.length;
  const summaryCampaignCount = Number(state.summary?.campaignCount);
  const summaryTrackedCount = Number(state.summary?.trackedMaps);
  const hookTrackedCount = Number(state.hook?.status?.trackedCount);
  const cachedCampaignCount = Number(state.cache.monitorDerived?.campaignCount);
  const cachedTrackedCount = Number(state.cache.monitorDerived?.trackedCount);

  const campaignCount = Number.isFinite(summaryCampaignCount)
    ? summaryCampaignCount
    : Number.isFinite(cachedCampaignCount)
      ? cachedCampaignCount
      : null;
  const trackedCount = Number.isFinite(summaryTrackedCount)
    ? summaryTrackedCount
    : Number.isFinite(hookTrackedCount)
      ? hookTrackedCount
      : Number.isFinite(cachedTrackedCount)
        ? cachedTrackedCount
        : null;

  return { mapCount, campaignCount, trackedCount };
}

function renderMonitorSummary() {
  const summary = getMonitorSummaryMetrics();
  const campaignText = Number.isFinite(summary.campaignCount) ? formatCount(summary.campaignCount) : "?";
  const trackedText = Number.isFinite(summary.trackedCount) ? formatCount(summary.trackedCount) : "?";
  if (elements.monitorSummaryLine) {
    elements.monitorSummaryLine.textContent = `${campaignText} campaigns | ${formatCount(summary.mapCount)} maps | ${trackedText} tracked`;
  }
}

function renderConnectedMapsSnapshot() {
  if (!elements.connectedMapsSummary || !elements.connectedMapsLiveMeta || !elements.connectedMapsBody) return;
  if (state.ui.monitorSubTab !== "maps") return;

  const sourceMaps = getMonitorSourceMaps();
  const summary = getMonitorSummaryMetrics();
  const pager = resolvePager(sourceMaps.length, state.ui.connectedMapsPage, CONNECTED_MAP_PAGE_SIZE);
  state.ui.connectedMapsPage = pager.page;
  renderPagerControls({
    prevButton: elements.connectedMapsPrevBtn,
    nextButton: elements.connectedMapsNextBtn,
    infoNode: elements.connectedMapsPageInfo,
    pager,
    label: "Connected maps",
  });

  if (!sourceMaps.length) {
    elements.connectedMapsSummary.textContent = "No connected maps stored yet. Run a live sync to populate this list.";
    elements.connectedMapsLiveMeta.textContent = "Last live scan: -";
    elements.connectedMapsBody.innerHTML = '<tr><td colspan="5" class="hook-map-meta">No map rows available yet.</td></tr>';
    return;
  }

  const campaignText = Number.isFinite(summary.campaignCount) ? formatCount(summary.campaignCount) : "?";
  const trackedText = Number.isFinite(summary.trackedCount) ? formatCount(summary.trackedCount) : "?";
  elements.connectedMapsSummary.textContent = `${formatCount(sourceMaps.length)} connected maps across ${campaignText} campaigns (${trackedText} tracked). Showing ${formatCount(pager.from)}-${formatCount(pager.to)}.`;

  const monitor = state.live.status?.monitor || {};
  const lastSummary = monitor.lastSummary || null;
  if (lastSummary) {
    const activeOnlyUsed = lastSummary.activeOnlyUsed === undefined ? lastSummary.activeOnly : lastSummary.activeOnlyUsed;
    const fallbackApplied = Boolean(lastSummary.activityFallbackApplied);
    elements.connectedMapsLiveMeta.textContent = `Last live scan: ${Number(lastSummary.campaignsLoaded || 0)} campaigns, ${Number(lastSummary.mapsLoaded || 0)} maps | activeOnly=${Boolean(activeOnlyUsed)}${fallbackApplied ? " (fallback)" : ""} | ${formatAgo(monitor.lastFinishedAt)}`;
  } else if (monitor.lastError) {
    elements.connectedMapsLiveMeta.textContent = `Last live scan failed: ${monitor.lastError}`;
  } else {
    elements.connectedMapsLiveMeta.textContent = "Last live scan: -";
  }

  elements.connectedMapsBody.innerHTML = "";
  sourceMaps.slice(pager.start, pager.end).forEach((map) => {
    const row = document.createElement("tr");
    const campaignCell = document.createElement("td");
    campaignCell.textContent = String(map.campaign || "Unassigned");
    const slotCell = document.createElement("td");
    slotCell.textContent = String(Number(map.slot || 0));
    const mapCell = document.createElement("td");
    mapCell.textContent = String(map.name || "Unknown map");
    const uidCell = document.createElement("td");
    uidCell.textContent = String(map.uid || "-");
    const statusCell = document.createElement("td");
    const statusPill = document.createElement("span");
    statusPill.className = statusClass(map.status);
    statusPill.textContent = String(map.status || "live");
    statusCell.appendChild(statusPill);
    row.appendChild(campaignCell);
    row.appendChild(slotCell);
    row.appendChild(mapCell);
    row.appendChild(uidCell);
    row.appendChild(statusCell);
    elements.connectedMapsBody.appendChild(row);
  });
}

function getClubStructureGroups() {
  return getMonitorDerivedData().groups;
}

function createClubCampaignCard(group) {
  const card = document.createElement("article");
  card.className = "campaign-card";
  const head = document.createElement("div");
  head.className = "campaign-head";
  const title = document.createElement("h3");
  title.textContent = group.campaign;
  const count = document.createElement("span");
  count.className = "campaign-count";
  count.textContent = `${group.maps.length} maps`;
  head.appendChild(title);
  head.appendChild(count);
  const list = document.createElement("ul");
  list.className = "campaign-map-list";
  group.maps.slice(0, CLUB_RENDER_MAP_LIMIT_PER_CAMPAIGN).forEach((map) => {
    const item = document.createElement("li");
    const top = document.createElement("div");
    top.className = "campaign-map-top";
    const name = document.createElement("strong");
    name.textContent = `#${Number(map.slot || 0)} ${map.name}`;
    const statusEl = document.createElement("span");
    statusEl.className = statusClass(map.status);
    statusEl.textContent = map.status;
    top.appendChild(name);
    top.appendChild(statusEl);
    const meta = document.createElement("p");
    meta.className = "campaign-map-meta";
    meta.textContent = `${map.uid || "-"} | WR ${formatMs(map.wrMs)} by ${map.wrHolder || "-"} | ${map.tracked ? "tracked" : "not tracked"}`;
    item.appendChild(top);
    item.appendChild(meta);
    list.appendChild(item);
  });
  if (group.maps.length > CLUB_RENDER_MAP_LIMIT_PER_CAMPAIGN) {
    const overflow = document.createElement("li");
    overflow.innerHTML = `<span class="campaign-map-meta">Showing ${CLUB_RENDER_MAP_LIMIT_PER_CAMPAIGN} of ${group.maps.length} maps in this campaign.</span>`;
    list.appendChild(overflow);
  }
  card.appendChild(head);
  card.appendChild(list);
  return card;
}

function renderClubStructurePanel() {
  if (!elements.clubStructureBoard) return;
  if (state.ui.monitorSubTab !== "campaigns") return;

  const token = ++state.ui.clubStructureRenderToken;
  renderPagerControls({
    prevButton: elements.clubStructurePrevBtn,
    nextButton: elements.clubStructureNextBtn,
    infoNode: elements.clubStructurePageInfo,
    pager: resolvePager(0, 1, CLUB_CAMPAIGNS_PAGE_SIZE),
    label: "Campaigns",
  });
  elements.clubStructureBoard.innerHTML =
    '<article class="admin-card"><h3>Loading campaigns...</h3><p class="hook-map-meta">Preparing campaign groups from cached map data.</p></article>';

  window.requestAnimationFrame(() => {
    if (token !== state.ui.clubStructureRenderToken) return;

    const groups = getClubStructureGroups();
    elements.clubStructureBoard.innerHTML = "";
    if (!groups.length) {
      state.ui.clubStructurePage = 1;
      renderPagerControls({
        prevButton: elements.clubStructurePrevBtn,
        nextButton: elements.clubStructureNextBtn,
        infoNode: elements.clubStructurePageInfo,
        pager: resolvePager(0, 1, CLUB_CAMPAIGNS_PAGE_SIZE),
        label: "Campaigns",
      });
      const empty = document.createElement("article");
      empty.className = "admin-card";
      empty.innerHTML =
        '<h3>No monitored structure yet</h3><p class="hook-map-meta">Configure tracker hook and sync a club snapshot to populate campaign structure.</p>';
      elements.clubStructureBoard.appendChild(empty);
      return;
    }

    const pager = resolvePager(groups.length, state.ui.clubStructurePage, CLUB_CAMPAIGNS_PAGE_SIZE);
    state.ui.clubStructurePage = pager.page;
    renderPagerControls({
      prevButton: elements.clubStructurePrevBtn,
      nextButton: elements.clubStructureNextBtn,
      infoNode: elements.clubStructurePageInfo,
      pager,
      label: "Campaigns",
    });

    const pageGroups = groups.slice(pager.start, pager.end);
    let index = 0;

    const renderChunk = () => {
      if (token !== state.ui.clubStructureRenderToken) return;
      const fragment = document.createDocumentFragment();
      const end = Math.min(index + CLUB_RENDER_CARD_CHUNK_SIZE, pageGroups.length);
      for (let i = index; i < end; i += 1) {
        fragment.appendChild(createClubCampaignCard(pageGroups[i]));
      }
      elements.clubStructureBoard.appendChild(fragment);
      index = end;
      if (index < pageGroups.length) {
        window.requestAnimationFrame(renderChunk);
      }
    };

    window.requestAnimationFrame(renderChunk);
  });
}
function makeNamingPill(label, className = "") {
  const pill = document.createElement("span");
  pill.className = `naming-pill ${className}`.trim();
  pill.textContent = label;
  return pill;
}

function createNamingCandidateRow(candidate) {
  const row = document.createElement("tr");

  const campaignCell = document.createElement("td");
  const campaignMain = document.createElement("span");
  campaignMain.className = "naming-primary";
  campaignMain.textContent = `${candidate.campaign || "Unassigned"} #${Number(candidate.slot || 0) || "-"}`;
  const campaignMeta = document.createElement("span");
  campaignMeta.className = "naming-secondary";
  campaignMeta.textContent = candidate.mapUid || "-";
  campaignCell.appendChild(campaignMain);
  campaignCell.appendChild(campaignMeta);

  const currentNameCell = document.createElement("td");
  const currentMain = document.createElement("span");
  currentMain.className = "naming-primary";
  currentMain.textContent = candidate.originalName || "-";
  const currentMeta = document.createElement("span");
  currentMeta.className = "naming-secondary";
  currentMeta.textContent = `sanitized: ${candidate.sanitizedName || "-"}`;
  currentNameCell.appendChild(currentMain);
  currentNameCell.appendChild(currentMeta);

  const proposedCell = document.createElement("td");
  const proposedMain = document.createElement("span");
  proposedMain.className = "naming-primary";
  proposedMain.textContent = candidate.finalName || candidate.proposedName || "-";
  const proposedMeta = document.createElement("span");
  proposedMeta.className = "naming-secondary";
  const alterationText = Array.isArray(candidate.alterationMix) && candidate.alterationMix.length ? candidate.alterationMix.join(" + ") : "-";
  proposedMeta.textContent = `season=${candidate.season || "-"} | year=${candidate.year || "-"} | map=${candidate.mapNumber || "-"} | mix=${alterationText}`;
  proposedCell.appendChild(proposedMain);
  proposedCell.appendChild(proposedMeta);

  const statusCell = document.createElement("td");
  const pills = document.createElement("div");
  pills.className = "naming-pills";
  pills.appendChild(makeNamingPill(candidate.automationState === "matched" ? "auto-match" : "unmatched", candidate.automationState === "matched" ? "match" : "unmatched"));
  pills.appendChild(makeNamingPill(candidate.reviewState || "pending", candidate.reviewState || "pending"));
  const confidence = Number(candidate.parserConfidence || 0);
  pills.appendChild(makeNamingPill(`conf ${Math.round(confidence)}%`));
  if (candidate.requiresRegex) pills.appendChild(makeNamingPill("regex", "unmatched"));
  statusCell.appendChild(pills);
  const statusMeta = document.createElement("span");
  statusMeta.className = "naming-secondary";
  statusMeta.textContent = `pattern: ${candidate.parserPattern || "-"} | updated ${formatAgo(candidate.updatedAt)}`;
  statusCell.appendChild(statusMeta);

  const actionsCell = document.createElement("td");
  const actionWrap = document.createElement("div");
  actionWrap.className = "naming-actions";
  const manualInput = document.createElement("input");
  manualInput.type = "text";
  manualInput.className = "naming-manual-input";
  manualInput.placeholder = "Manual name (optional)";
  manualInput.value = candidate.manualName || "";
  manualInput.setAttribute("data-manual-input", candidate.mapUid || "");
  const actionButtons = document.createElement("div");
  actionButtons.className = "naming-actions-row";
  ["Approve", "Save Manual", "Ignore"].forEach((label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-lite";
    btn.textContent = label;
    const action = label === "Approve" ? "approve" : label === "Save Manual" ? "manual" : "ignore";
    btn.setAttribute("data-naming-action", action);
    btn.setAttribute("data-map-uid", candidate.mapUid || "");
    actionButtons.appendChild(btn);
  });
  actionWrap.appendChild(manualInput);
  actionWrap.appendChild(actionButtons);
  actionsCell.appendChild(actionWrap);

  row.appendChild(campaignCell);
  row.appendChild(currentNameCell);
  row.appendChild(proposedCell);
  row.appendChild(statusCell);
  row.appendChild(actionsCell);
  return row;
}

function renderMapNameStandardizationPanel() {
  if (!elements.namingSummaryLine || !elements.namingCandidatesBody) return;
  if (state.ui.monitorSubTab !== "names") return;

  const summary = state.naming.summary || null;
  const candidates = Array.isArray(state.naming.candidates) ? state.naming.candidates : [];
  if (!summary) {
    elements.namingSummaryLine.textContent = "No naming candidates loaded yet.";
  } else {
    elements.namingSummaryLine.textContent = `${formatCount(summary.total)} total | ${formatCount(summary.matched)} auto-matched | ${formatCount(summary.unmatched)} unmatched | ${formatCount(summary.pending)} pending | ${formatCount(summary.approved)} approved | ${formatCount(summary.requiresRegex)} needs regex`;
  }

  if (
    state.cache.namingRenderedRef === candidates &&
    !state.ui.namingRenderInProgress &&
    elements.namingCandidatesBody.childElementCount > 0
  ) {
    return;
  }

  elements.namingCandidatesBody.innerHTML = "";
  if (!candidates.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "hook-map-meta";
    cell.textContent = "No candidates for the current filter.";
    row.appendChild(cell);
    elements.namingCandidatesBody.appendChild(row);
    state.cache.namingRenderedRef = candidates;
    state.ui.namingRenderInProgress = false;
    return;
  }

  const token = ++state.ui.namingRenderToken;
  state.ui.namingRenderInProgress = true;
  let index = 0;
  const renderChunk = () => {
    if (token !== state.ui.namingRenderToken) return;
    const fragment = document.createDocumentFragment();
    const end = Math.min(index + NAME_CANDIDATE_RENDER_CHUNK_SIZE, candidates.length);
    for (let i = index; i < end; i += 1) {
      fragment.appendChild(createNamingCandidateRow(candidates[i]));
    }
    elements.namingCandidatesBody.appendChild(fragment);
    index = end;
    if (index < candidates.length) {
      window.requestAnimationFrame(renderChunk);
      return;
    }
    state.ui.namingRenderInProgress = false;
    state.cache.namingRenderedRef = candidates;
  };
  window.requestAnimationFrame(renderChunk);
}
function adminMapOptions() {
  const hasOptions = Array.isArray(state.mapOptions) && state.mapOptions.length > 0;
  const source = hasOptions ? state.mapOptions : state.maps;
  const sourceKey = `${hasOptions ? "options" : "maps"}:${source.length}:${
    source[0]?.uid || source[0]?.map_uid || ""
  }:${source[source.length - 1]?.uid || source[source.length - 1]?.map_uid || ""}`;

  if (state.cache.adminOptionsSourceKey === sourceKey && Array.isArray(state.cache.adminOptions)) {
    return state.cache.adminOptions;
  }

  const normalized = hasOptions
    ? state.mapOptions.map((m) => ({
        uid: String(m?.uid || m?.map_uid || ""),
        name: String(m?.name || ""),
        campaign: String(m?.campaign || ""),
        slot: Number(m?.slot || 0),
      }))
    : state.maps.map((m) => ({
        uid: String(m?.uid || m?.map_uid || ""),
        name: String(m?.name || ""),
        campaign: String(m?.campaign || ""),
        slot: Number(m?.slot || 0),
      }));

  state.cache.adminOptionsSourceKey = sourceKey;
  state.cache.adminOptions = normalized;
  return normalized;
}

function setMapOpsStatus(message) {
  if (!elements.mapOpsStatusLine) return;
  elements.mapOpsStatusLine.textContent = String(message || "").trim();
}

function buildMapOptionLabel(map) {
  const campaign = stripTmStyleCodes(map?.campaign || "") || "Unassigned";
  const slot = Number(map?.slot || 0);
  const name = stripTmStyleCodes(map?.name || "") || "Unknown map";
  return `${campaign} #${slot || 0} - ${name}`;
}

function cancelSelectorHydration() {
  state.ui.selectorHydrationToken += 1;
  state.ui.selectorHydrationRunning = false;
}

function hydrateSelectorOptions(options, signature) {
  const adminSelect = elements.adminMapSelect;
  const trackingSelect = elements.trackingMapSelect;
  if (!adminSelect || !trackingSelect) return;

  const currentAdminValue = adminSelect.value || "";
  const currentTrackingValue = trackingSelect.value || "";
  const token = (state.ui.selectorHydrationToken || 0) + 1;
  state.ui.selectorHydrationToken = token;
  state.ui.selectorHydrationRunning = true;
  state.ui.selectorHydrationLoaded = 0;
  state.ui.selectorHydrationTotal = options.length;
  state.ui.selectorSignature = signature;

  adminSelect.innerHTML = "";
  trackingSelect.innerHTML = "";
  adminSelect.appendChild(new Option(`Loading maps... (0/${options.length})`, ""));
  trackingSelect.appendChild(new Option(`Loading maps... (0/${options.length})`, ""));
  setMapOpsStatus(`Loading map selectors... 0/${options.length}`);

  let index = 0;
  let chunkCounter = 0;

  const flushSelection = () => {
    if (currentAdminValue) adminSelect.value = currentAdminValue;
    if (currentTrackingValue) trackingSelect.value = currentTrackingValue;
  };

  const appendChunk = () => {
    if (token !== state.ui.selectorHydrationToken) return;
    const end = Math.min(index + SELECTOR_APPEND_CHUNK_SIZE, options.length);
    if (index === 0) {
      adminSelect.innerHTML = "";
      trackingSelect.innerHTML = "";
    }

    const adminFragment = document.createDocumentFragment();
    const trackingFragment = document.createDocumentFragment();

    for (let i = index; i < end; i += 1) {
      const map = options[i];
      const uid = String(map?.uid || "");
      if (!uid) continue;
      const label = buildMapOptionLabel(map);
      adminFragment.appendChild(new Option(label, uid));
      trackingFragment.appendChild(new Option(label, uid));
    }

    adminSelect.appendChild(adminFragment);
    trackingSelect.appendChild(trackingFragment);

    index = end;
    chunkCounter += 1;
    state.ui.selectorHydrationLoaded = index;
    setMapOpsStatus(`Loading map selectors... ${index}/${options.length}`);

    if (index < options.length) {
      if (chunkCounter <= SELECTOR_EAGER_CHUNKS) {
        window.setTimeout(appendChunk, 0);
      } else {
        window.requestAnimationFrame(appendChunk);
      }
      return;
    }

    state.ui.selectorHydrationRunning = false;
    flushSelection();
    setMapOpsStatus(`Loaded ${options.length} maps.`);
  };

  window.requestAnimationFrame(appendChunk);
}

function renderSelectors() {
  const options = adminMapOptions();
  const nextSignature = `${options.length}:${options[0]?.uid || ""}:${options[options.length - 1]?.uid || ""}`;
  const adminHasOptions = Boolean(elements.adminMapSelect?.options?.length);
  const trackingHasOptions = Boolean(elements.trackingMapSelect?.options?.length);

  if (!options.length) {
    cancelSelectorHydration();
    state.ui.selectorSignature = nextSignature;
    if (elements.adminMapSelect) {
      elements.adminMapSelect.innerHTML = '<option value="">Loading map data...</option>';
    }
    if (elements.trackingMapSelect) {
      elements.trackingMapSelect.innerHTML = '<option value="">Loading map data...</option>';
    }
    if (state.cache.heavyLoaded) {
      setMapOpsStatus("No maps available.");
    } else {
      setMapOpsStatus("Loading map data...");
    }
    return;
  }

  if (state.ui.selectorHydrationRunning && state.ui.selectorSignature === nextSignature) {
    const loaded = Number(state.ui.selectorHydrationLoaded || 0);
    const total = Number(state.ui.selectorHydrationTotal || options.length);
    setMapOpsStatus(`Loading map selectors... ${loaded}/${total}`);
    return;
  }

  if (
    state.ui.selectorSignature === nextSignature &&
    adminHasOptions &&
    trackingHasOptions &&
    !state.ui.selectorHydrationRunning
  ) {
    setMapOpsStatus(`Loaded ${options.length} maps.`);
    return;
  }

  hydrateSelectorOptions(options, nextSignature);
}

function renderHookForm() {
  const hook = state.hook.status;
  if (!hook) return;
  elements.hookClubIdInput.value = String(hook.clubId || "");
  elements.hookClubNameInput.value = stripTmStyleCodes(hook.clubName || "");
  elements.hookSourceInput.value = stripTmStyleCodes(hook.sourceLabel || "");
  elements.hookEnabledToggle.checked = Boolean(hook.enabled);
  elements.hookAutoTrackToggle.checked = Boolean(hook.autoTrackNewMaps);
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
  const hookKey = stripTmStyleCodes(hook.hookKey || "") || "altered-club";
  const clubName = stripTmStyleCodes(hook.clubName || "") || "Unknown club";
  elements.hookStatusLine.textContent = `Hook ${hookKey} | club ${clubName} (${hook.clubId}) | ${enabled} | auto-track ${autoTrack} | maps ${hook.mapCount} (${hook.trackedCount} tracked)`;
  if (hook.latestRun) {
    elements.hookRunLine.textContent = `Latest sync run #${hook.latestRun.runId} | ${hook.latestRun.status} | ${hook.latestRun.mapsSeen} maps seen, ${hook.latestRun.mapsInserted} inserted, ${hook.latestRun.mapsUpdated} updated | ${formatAgo(hook.latestRun.finishedAt)}`;
  } else {
    elements.hookRunLine.textContent = "Latest sync run: none yet";
  }
}

function getFilteredHookMaps() {
  const query = state.filters.hookSearch.toLowerCase().trim();
  return state.hook.maps
    .filter((map) => {
      if (!query) return true;
      return String(map.name || "").toLowerCase().includes(query) || String(map.uid || "").toLowerCase().includes(query);
    })
    .sort((a, b) => {
      const campaignDiff = String(a.campaign || "").localeCompare(String(b.campaign || ""));
      if (campaignDiff !== 0) return campaignDiff;
      const slotDiff = Number(a.slot || 0) - Number(b.slot || 0);
      if (slotDiff !== 0) return slotDiff;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
}

function renderHookMapList() {
  const maps = getFilteredHookMaps();
  const pager = resolvePager(maps.length, state.ui.hookMapsPage, HOOK_MAP_PAGE_SIZE);
  state.ui.hookMapsPage = pager.page;
  renderPagerControls({
    prevButton: elements.hookMapPrevBtn,
    nextButton: elements.hookMapNextBtn,
    infoNode: elements.hookMapPageInfo,
    pager,
    label: "Hook maps",
  });
  elements.hookMapList.innerHTML = "";
  if (!maps.length) {
    const item = document.createElement("li");
    item.innerHTML = '<strong>No hooked maps found.</strong><span class="hook-map-meta">Try syncing or changing search.</span>';
    elements.hookMapList.appendChild(item);
    return;
  }
  maps.slice(pager.start, pager.end).forEach((map) => {
    const tracked = Boolean(map.tracked);
    const item = document.createElement("li");
    item.innerHTML = `
      <div class="hook-map-head"><strong>${escapeHtml(map.name)}</strong><span class="${statusClass(map.status)}">${escapeHtml(map.status)}</span></div>
      <div class="hook-map-meta">${escapeHtml(map.campaign)} #${map.slot} | UID: ${escapeHtml(map.uid)}</div>
      <div class="hook-map-meta">WR ${formatMs(map.wrMs)} by ${escapeHtml(map.wrHolder || "-")}</div>
      <div class="hook-map-actions">
        <button class="hook-action" type="button" data-hook-action="track" data-map-uid="${escapeHtml(map.uid)}" ${tracked ? "disabled" : ""}>Track</button>
        <button class="hook-action" type="button" data-hook-action="pause" data-map-uid="${escapeHtml(map.uid)}" ${!tracked ? "disabled" : ""}>Pause</button>
      </div>
    `;
    elements.hookMapList.appendChild(item);
  });
}
function renderAdminLog() {
  if (!elements.adminLogList) return;
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

function renderOpsEvents() {
  if (!elements.opsEventsList) return;
  const events = state.diagnostics.opsEvents || [];
  const pager = resolvePager(events.length, state.ui.opsEventsPage, OPS_EVENTS_PAGE_SIZE);
  state.ui.opsEventsPage = pager.page;
  renderPagerControls({
    prevButton: elements.opsEventsPrevBtn,
    nextButton: elements.opsEventsNextBtn,
    infoNode: elements.opsEventsPageInfo,
    pager,
    label: "Events",
  });
  if (elements.opsEventsCount) {
    elements.opsEventsCount.textContent = `${formatCount(events.length)} events loaded`;
  }
  elements.opsEventsList.innerHTML = "";
  if (!events.length) {
    const li = document.createElement("li");
    li.textContent = "No server ops events loaded.";
    elements.opsEventsList.appendChild(li);
    return;
  }
  events.slice(pager.start, pager.end).forEach((event) => {
    const li = document.createElement("li");
    const mapName = event.mapName || event.map_name || event.mapUid || event.map_uid || "-";
    const timestamp = formatAgo(event.checkedAt || event.checked_at || event.created_at || event.timestamp);
    const changed = Boolean(event.changed || event.wrChanged);
    const wrInfo = changed ? ` | WR ${formatMs(event.oldWrMs || event.old_wr_ms)} -> ${formatMs(event.newWrMs || event.new_wr_ms)}` : "";
    li.textContent = `[${timestamp}] ${escapeHtml(mapName)}${wrInfo}`;
    if (changed) li.style.borderLeftColor = "rgba(51, 255, 255, 0.8)";
    elements.opsEventsList.appendChild(li);
  });
}

function renderOpsRuns() {
  if (!elements.opsRunsList) return;
  const runs = state.diagnostics.opsRuns || [];
  elements.opsRunsList.innerHTML = "";
  if (!runs.length) {
    const li = document.createElement("li");
    li.textContent = "No poll runs loaded.";
    elements.opsRunsList.appendChild(li);
    return;
  }
  runs.slice(0, 20).forEach((run) => {
    const li = document.createElement("li");
    const status = String(run.status || "ok").toUpperCase();
    const finishedAt = formatAgo(run.finishedAt || run.finished_at || run.startedAt || run.started_at);
    const mapsTotal = Number(run.mapsTotal || run.maps_total || run.mapsChecked || run.maps_checked || 0);
    const mapsChanged = Number(run.mapsChanged || run.maps_changed || 0);
    li.textContent = `[${finishedAt}] ${status} | ${mapsTotal} maps checked | ${mapsChanged} changed`;
    elements.opsRunsList.appendChild(li);
  });
}
function renderDiagStatCards() {
  const stats = state.diagnostics.stats || {};
  const ops = state.diagnostics.opsOverview || {};
  const counts = ops.counts || {};
  const scheduler = ops.scheduler || {};

  if (elements.diagTotalMaps) elements.diagTotalMaps.textContent = formatCount(stats.total_maps || 0);
  if (elements.diagActivelyTracked) elements.diagActivelyTracked.textContent = formatCount(stats.actively_tracked || 0);
  if (elements.diagTotalWrChanges) elements.diagTotalWrChanges.textContent = formatCount(stats.total_wr_changes || 0);
  if (elements.diagCampaigns) elements.diagCampaigns.textContent = formatCount(state.summary?.campaignCount || 0);
  if (elements.diagLastRun) elements.diagLastRun.textContent = formatAgo(stats.last_run_at);
  if (elements.diagSchedulerStatus) {
    elements.diagSchedulerStatus.textContent = scheduler.enabled ? (scheduler.running ? "Running" : "Idle") : "Disabled";
  }
}

function getDiagSourceMaps() {
  if (Array.isArray(state.hook.maps) && state.hook.maps.length) return state.hook.maps;
  if (Array.isArray(state.maps) && state.maps.length) return state.maps;
  return [];
}

function getDiagMapDerived() {
  if (state.cache.diagDerivedVersion === state.cache.mapDataVersion) {
    return state.cache.diagDerived;
  }

  const sourceMaps = getDiagSourceMaps();
  const grouped = new Map();
  let tracked = 0;
  let paused = 0;
  let other = 0;

  sourceMaps.forEach((map) => {
    const campaign = String(map.campaign || "Unassigned");
    grouped.set(campaign, (grouped.get(campaign) || 0) + 1);

    const status = String(map.status || "live").toLowerCase();
    if (status === "live" && map.tracked) tracked += 1;
    else if (status === "paused") paused += 1;
    else other += 1;
  });

  state.cache.diagDerived = {
    mapsPerCampaign: [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
    tracking: {
      tracked,
      paused,
      other,
      total: tracked + paused + other,
    },
  };
  state.cache.diagDerivedVersion = state.cache.mapDataVersion;
  return state.cache.diagDerived;
}

function setupCanvas(canvas, desiredH) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const parent = canvas.parentElement;
  const w = Math.floor(parent ? parent.clientWidth - 16 : 540);
  const h = desiredH || 260;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  return { ctx, w, h };
}

function renderChartMapsPerCampaign() {
  const setup = setupCanvas(elements.chartMapsPerCampaign, 260);
  if (!setup) return;
  const { ctx, w, h } = setup;

  const derived = getDiagMapDerived();
  const entries = Array.isArray(derived.mapsPerCampaign) ? derived.mapsPerCampaign : [];
  if (!entries.length) {
    ctx.fillStyle = DIAG_COLORS.inkDim;
    ctx.font = "13px Manrope, sans-serif";
    ctx.fillText("No campaign data available.", 20, h / 2);
    return;
  }

  const pad = { top: 16, right: 16, bottom: 56, left: 46 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  const maxVal = Math.max(...entries.map((e) => e[1]));
  const barW = Math.max(8, Math.floor(cw / entries.length) - 4);

  ctx.strokeStyle = DIAG_COLORS.gridLine;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = DIAG_COLORS.inkMuted;
    ctx.font = "10px Manrope, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(String(Math.round(maxVal - (maxVal / 4) * i)), pad.left - 6, y + 3);
  }

  entries.forEach((entry, i) => {
    const [name, count] = entry;
    const barH = (count / maxVal) * ch;
    const x = pad.left + (cw / entries.length) * i + (cw / entries.length - barW) / 2;
    const y = pad.top + ch - barH;
    const grad = ctx.createLinearGradient(x, y + barH, x, y);
    grad.addColorStop(0, DIAG_COLORS.purple);
    grad.addColorStop(1, DIAG_COLORS.cyanBright);
    ctx.fillStyle = grad;
    const r = Math.min(4, barW / 2);
    ctx.beginPath();
    ctx.moveTo(x, y + barH);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + barW - r, y);
    ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
    ctx.lineTo(x + barW, y + barH);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.fillStyle = DIAG_COLORS.inkDim;
    ctx.font = "9px Manrope, sans-serif";
    ctx.textAlign = "right";
    ctx.translate(x + barW / 2, pad.top + ch + 8);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(name.length > 14 ? name.slice(0, 12) + ".." : name, 0, 0);
    ctx.restore();
  });
}

function renderChartSyncRuns() {
  const setup = setupCanvas(elements.chartSyncRuns, 260);
  if (!setup) return;
  const { ctx, w, h } = setup;

  const runs = [...(state.diagnostics.syncRuns || [])].reverse().slice(-30);
  if (!runs.length) {
    ctx.fillStyle = DIAG_COLORS.inkDim;
    ctx.font = "13px Manrope, sans-serif";
    ctx.fillText("No sync run data available.", 20, h / 2);
    return;
  }

  const pad = { top: 16, right: 16, bottom: 36, left: 46 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  const values = runs.map((r) => Number(r.mapsSeen || r.maps_seen || 0));
  const maxVal = Math.max(...values, 1);

  ctx.strokeStyle = DIAG_COLORS.gridLine;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = DIAG_COLORS.inkMuted;
    ctx.font = "10px Manrope, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(String(Math.round(maxVal - (maxVal / 4) * i)), pad.left - 6, y + 3);
  }

  const stepX = cw / Math.max(1, values.length - 1);
  const points = values.map((val, i) => ({
    x: pad.left + stepX * i,
    y: pad.top + ch - (val / maxVal) * ch,
  }));

  const areaGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
  areaGrad.addColorStop(0, "rgba(34, 204, 238, 0.3)");
  areaGrad.addColorStop(1, "rgba(34, 204, 238, 0.02)");
  ctx.fillStyle = areaGrad;
  ctx.beginPath();
  ctx.moveTo(points[0].x, pad.top + ch);
  points.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, pad.top + ch);
  ctx.closePath();
  ctx.fill();

  const lineGrad = ctx.createLinearGradient(pad.left, 0, w - pad.right, 0);
  lineGrad.addColorStop(0, DIAG_COLORS.blue);
  lineGrad.addColorStop(1, DIAG_COLORS.cyanBright);
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();

  points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = DIAG_COLORS.cyanBright;
    ctx.fill();
  });

  const labelEvery = Math.max(1, Math.floor(runs.length / 8));
  ctx.fillStyle = DIAG_COLORS.inkMuted;
  ctx.font = "9px Manrope, sans-serif";
  ctx.textAlign = "center";
  runs.forEach((run, i) => {
    if (i % labelEvery !== 0 && i !== runs.length - 1) return;
    const x = pad.left + stepX * i;
    const finishedAt = run.finishedAt || run.finished_at || "";
    ctx.fillText(finishedAt ? formatAgo(finishedAt) : `#${i + 1}`, x, pad.top + ch + 16);
  });
}

function renderChartTrackingStatus() {
  const setup = setupCanvas(elements.chartTrackingStatus, 260);
  if (!setup) return;
  const { ctx, w, h } = setup;

  const derived = getDiagMapDerived();
  const tracked = Number(derived.tracking?.tracked || 0);
  const paused = Number(derived.tracking?.paused || 0);
  const other = Number(derived.tracking?.other || 0);
  const total = tracked + paused + other;
  if (total === 0) {
    ctx.fillStyle = DIAG_COLORS.inkDim;
    ctx.font = "13px Manrope, sans-serif";
    ctx.fillText("No map data.", w / 2 - 30, h / 2);
    return;
  }

  const cx = w / 2;
  const cy = h / 2 - 10;
  const outerR = Math.min(w, h) / 2 - 30;
  const innerR = outerR * 0.55;

  const slices = [
    { label: "Tracked", value: tracked, color: DIAG_COLORS.cyanBright },
    { label: "Paused", value: paused, color: DIAG_COLORS.cyan },
    { label: "Other", value: other, color: DIAG_COLORS.purple },
  ].filter((s) => s.value > 0);

  let startAngle = -Math.PI / 2;
  slices.forEach((slice) => {
    const sliceAngle = (slice.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
    ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.fill();

    const midAngle = startAngle + sliceAngle / 2;
    const labelR = (outerR + innerR) / 2;
    const lx = cx + Math.cos(midAngle) * labelR;
    const ly = cy + Math.sin(midAngle) * labelR;
    const pct = Math.round((slice.value / total) * 100);
    ctx.fillStyle = "#020408";
    ctx.font = "bold 11px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${pct}%`, lx, ly);

    startAngle += sliceAngle;
  });

  ctx.fillStyle = DIAG_COLORS.cyanBright;
  ctx.font = "bold 22px Chakra Petch, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(formatCount(total), cx, cy - 4);
  ctx.fillStyle = DIAG_COLORS.inkDim;
  ctx.font = "10px Manrope, sans-serif";
  ctx.fillText("total maps", cx, cy + 14);

  let legendX = 16;
  const legendY = h - 6;
  ctx.textBaseline = "alphabetic";
  slices.forEach((slice) => {
    ctx.fillStyle = slice.color;
    ctx.fillRect(legendX, legendY - 7, 8, 8);
    ctx.fillStyle = DIAG_COLORS.inkDim;
    ctx.font = "9px Manrope, sans-serif";
    ctx.textAlign = "left";
    const text = `${slice.label} (${slice.value})`;
    ctx.fillText(text, legendX + 12, legendY);
    legendX += ctx.measureText(text).width + 24;
  });
}

function renderDiagOpsOverview() {
  const ops = state.diagnostics.opsOverview || {};
  const counts = ops.counts || {};
  const scheduler = ops.scheduler || {};

  if (elements.diagOpsSchedulerLine) {
    elements.diagOpsSchedulerLine.textContent = `Scheduler: ${scheduler.enabled ? (scheduler.running ? "running" : "idle") : "disabled"} | tick ${formatCount(scheduler.tickSeconds || 0)}s | due: ${formatCount(counts.dueSchedules || 0)} | queued: ${formatCount(counts.queuedBotCommands || 0)}`;
  }

  if (elements.diagOpsGrid) {
    elements.diagOpsGrid.innerHTML = "";
    [
      { label: "Users", value: formatCount(counts.users || 0) },
      { label: "Schedules", value: formatCount(counts.schedules || 0) },
      { label: "Monitored Maps", value: formatCount(counts.monitoredMaps || 0) },
      { label: "Due Schedules", value: formatCount(counts.dueSchedules || 0) },
      { label: "Queued Commands", value: formatCount(counts.queuedBotCommands || 0) },
    ].forEach((m) => {
      const card = document.createElement("article");
      card.className = "live-progress-stat";
      card.innerHTML = `<span class="live-progress-stat-label">${escapeHtml(m.label)}</span><strong class="live-progress-stat-value">${escapeHtml(m.value)}</strong>`;
      elements.diagOpsGrid.appendChild(card);
    });
  }
}

function compressTimelinePointsForChart(points = [], maxPoints = 220) {
  const list = Array.isArray(points) ? points : [];
  if (list.length <= maxPoints) {
    let cumulative = 0;
    return list.map((item) => {
      const count = Number(item?.count || 0);
      cumulative += count;
      return {
        bucketStartAt: item?.bucketStartAt || null,
        label: item?.label || "-",
        count,
        cumulative,
      };
    });
  }
  const chunkSize = Math.max(1, Math.ceil(list.length / maxPoints));
  const out = [];
  let cumulative = 0;
  for (let i = 0; i < list.length; i += chunkSize) {
    const slice = list.slice(i, i + chunkSize);
    const count = slice.reduce((sum, item) => sum + Number(item?.count || 0), 0);
    cumulative += count;
    out.push({
      bucketStartAt: slice[0]?.bucketStartAt || null,
      label: slice[0]?.label || "-",
      count,
      cumulative,
    });
  }
  return out;
}

function renderDiagCampaignTimelineSummary() {
  if (!elements.diagCampaignTimelineSummary) return;
  const timeline = state.diagnostics.timeline || null;
  if (!timeline || !Array.isArray(timeline.points) || !timeline.points.length) {
    elements.diagCampaignTimelineSummary.textContent =
      "No campaign timeline data yet. Run a live fetch/sync to populate publication and creation timestamps.";
    return;
  }
  elements.diagCampaignTimelineSummary.textContent =
    `${formatCount(timeline.campaignsInRange || 0)} campaigns in range (${timeline.days}d) | ` +
    `source=${timeline.source} | bucket=${timeline.bucket} | ` +
    `missing timestamps=${formatCount(timeline.campaignsMissingTimestamp || 0)}`;
}

function renderChartCampaignTimeline() {
  const setup = setupCanvas(elements.chartCampaignTimeline, 260);
  if (!setup) return;
  const { ctx, w, h } = setup;

  const timeline = state.diagnostics.timeline || {};
  const pointsRaw = Array.isArray(timeline.points) ? timeline.points : [];
  const points = compressTimelinePointsForChart(pointsRaw, 220);
  if (!points.length) {
    ctx.fillStyle = DIAG_COLORS.inkDim;
    ctx.font = "13px Manrope, sans-serif";
    ctx.fillText("No timeline data available.", 20, h / 2);
    return;
  }

  const pad = { top: 16, right: 42, bottom: 38, left: 42 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  const maxCount = Math.max(...points.map((item) => Number(item.count || 0)), 1);
  const maxCumulative = Math.max(...points.map((item) => Number(item.cumulative || 0)), 1);
  const stepX = cw / Math.max(1, points.length);
  const barW = Math.max(2, Math.min(16, stepX * 0.72));

  ctx.strokeStyle = DIAG_COLORS.gridLine;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (ch / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = DIAG_COLORS.inkMuted;
    ctx.font = "10px Manrope, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(String(Math.round(maxCount - (maxCount / 4) * i)), pad.left - 6, y + 3);
  }

  const linePoints = [];
  points.forEach((item, index) => {
    const count = Number(item.count || 0);
    const x = pad.left + stepX * index + (stepX - barW) / 2;
    const barH = (count / maxCount) * ch;
    const y = pad.top + ch - barH;
    const grad = ctx.createLinearGradient(x, y + barH, x, y);
    grad.addColorStop(0, DIAG_COLORS.purple);
    grad.addColorStop(1, DIAG_COLORS.cyan);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barW, barH);

    const lineX = x + barW / 2;
    const lineY = pad.top + ch - (Number(item.cumulative || 0) / maxCumulative) * ch;
    linePoints.push({ x: lineX, y: lineY });
  });

  ctx.strokeStyle = DIAG_COLORS.cyanBright;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  linePoints.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  const labelEvery = Math.max(1, Math.floor(points.length / 8));
  ctx.fillStyle = DIAG_COLORS.inkMuted;
  ctx.font = "9px Manrope, sans-serif";
  ctx.textAlign = "center";
  points.forEach((item, index) => {
    if (index % labelEvery !== 0 && index !== points.length - 1) return;
    const x = pad.left + stepX * index + stepX / 2;
    const rawLabel = String(item.label || "-");
    const shortLabel = rawLabel.length > 12 ? `${rawLabel.slice(0, 10)}..` : rawLabel;
    ctx.fillText(shortLabel, x, h - 8);
  });

  ctx.fillStyle = DIAG_COLORS.inkMuted;
  ctx.font = "10px Manrope, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Cumulative max: ${formatCount(maxCumulative)}`, pad.left, pad.top + 10);
  ctx.textAlign = "right";
  ctx.fillText(`Peak bucket: ${formatCount(maxCount)}`, w - pad.right, pad.top + 10);
}

function renderDiagnosticsPanel() {
  renderDiagStatCards();
  renderDiagOpsOverview();
  renderDiagCampaignTimelineSummary();

  const token = ++state.ui.diagRenderToken;
  window.requestAnimationFrame(() => {
    if (state.ui.diagRenderToken !== token) return;
    renderChartMapsPerCampaign();
    window.requestAnimationFrame(() => {
      if (state.ui.diagRenderToken !== token) return;
      renderChartSyncRuns();
      window.requestAnimationFrame(() => {
        if (state.ui.diagRenderToken !== token) return;
        renderChartTrackingStatus();
        window.requestAnimationFrame(() => {
          if (state.ui.diagRenderToken !== token) return;
          renderChartCampaignTimeline();
        });
      });
    });
  });
}
const TAB_RENDERERS = {
  overview: [renderOverviewPanel],
  monitor: [renderMonitorSummary, renderLiveMonitorPanel, renderConnectedMapsSnapshot, renderClubStructurePanel, renderMapNameStandardizationPanel],
  tracker: [renderHookStatus, renderHookForm, renderHookMapList],
  "map-operations": [renderSelectors],
  diagnostics: [renderDiagnosticsPanel],
  "activity-log": [renderOpsEvents, renderOpsRuns, renderAdminLog],
};

function renderAll() {
  renderAuthState();
  renderStats();
  renderTab(state.ui.activeTab);
}
async function loadAuthStatus() {
  const payload = await apiRequest("/api/v1/admin/auth/status");
  state.auth = payload;
  if (!payload?.authenticated && payload?.loginUrl) {
    window.location.href = payload.loginUrl;
    return false;
  }
  return true;
}

async function loadDashboardData({
  silent = false,
  includeHeavy = isHeavyTab(state.ui.activeTab),
  forceHeavy = false,
} = {}) {
  if (state.cache.dashboardLoadPromise) {
    return state.cache.dashboardLoadPromise;
  }

  state.cache.dashboardLoadPromise = (async () => {
    try {
      const runHeavy = Boolean(includeHeavy) && shouldRefreshHeavyData({ force: forceHeavy });

      const [hookPayload, hookRunsPayload, trackerStatusPayload, liveStatusPayload] = await Promise.all([
        apiRequest("/api/v1/hook/altered"),
        apiRequest("/api/v1/hook/altered/runs?limit=12"),
      apiRequest("/api/v1/tracker/status"),
      apiRequest("/api/v1/admin/hook/altered/live/status"),
    ]);

    state.hook.status = hookPayload?.hook
      ? {
          ...hookPayload.hook,
          hookKey: stripTmStyleCodes(hookPayload.hook.hookKey || "") || hookPayload.hook.hookKey || "",
          clubName: stripTmStyleCodes(hookPayload.hook.clubName || "") || hookPayload.hook.clubName || "",
          sourceLabel:
            stripTmStyleCodes(hookPayload.hook.sourceLabel || "") || hookPayload.hook.sourceLabel || "",
        }
      : null;
    state.hook.runs = Array.isArray(hookRunsPayload?.runs) ? hookRunsPayload.runs : [];
    state.tracker = trackerStatusPayload || null;
    state.live.status = liveStatusPayload || null;

    if (runHeavy) {
      const [dashboardPayload, hookMapsPayload] = await Promise.all([
        apiRequest("/api/v1/dashboard"),
        apiRequest("/api/v1/hook/altered/maps?limit=25000"),
      ]);

      state.maps = Array.isArray(dashboardPayload?.maps) ? dashboardPayload.maps.map(normalizeMap) : [];
      state.mapOptions = Array.isArray(dashboardPayload?.mapOptions)
        ? dashboardPayload.mapOptions.map((option) => ({
            ...option,
            uid: String(option?.uid || option?.map_uid || ""),
            name: String(option?.name || "Unknown map"),
            campaign: String(option?.campaign || "Unassigned"),
          }))
        : [];
      state.summary = dashboardPayload?.summary || state.summary || null;
      state.wrFeed = Array.isArray(dashboardPayload?.wrFeed) ? dashboardPayload.wrFeed : [];
      state.tracker = trackerStatusPayload || dashboardPayload?.tracker || null;
      state.hook.maps = Array.isArray(hookMapsPayload?.maps) ? hookMapsPayload.maps.map(normalizeMap) : [];

      state.cache.heavyLoaded = true;
      state.cache.heavyLoadedAt = Date.now();
      state.cache.adminOptionsSourceKey = "";
      state.cache.adminOptions = [];
      state.cache.monitorDerivedSourceKey = "";
      state.cache.monitorDerived = null;
      state.ui.selectorSignature = "";
      state.cache.mapDataVersion += 1;
      state.ui.clubStructureRenderToken += 1;
      state.cache.diagDerivedVersion = -1;
    } else if (!state.summary) {
      const statsPayload = await apiRequest("/api/v1/alterations/stats").catch(() => null);
      const campaignsPayload = await apiRequest("/api/v1/alterations/campaigns").catch(() => null);
      if (statsPayload || campaignsPayload) {
        state.summary = {
          trackedMaps: Number(
            statsPayload?.actively_tracked ??
              statsPayload?.activelyTracked ??
              state.summary?.trackedMaps ??
              0
          ),
          campaignCount: Array.isArray(campaignsPayload?.campaigns)
            ? campaignsPayload.campaigns.length
            : Number(state.summary?.campaignCount || 0),
          latestWrAt:
            statsPayload?.last_run_at ?? statsPayload?.lastRunAt ?? state.summary?.latestWrAt ?? null,
        };
      }
    }

      renderAll();
      return true;
    } catch (error) {
      if (!silent) {
        pushAdminLog(`Failed to load dashboard data: ${error.message}`);
        notify("error", `Failed to load dashboard data: ${error.message}`);
      }
      return false;
    }
  })();

  try {
    return await state.cache.dashboardLoadPromise;
  } finally {
    state.cache.dashboardLoadPromise = null;
  }
}

async function loadLiveStatusOnly({ silent = false } = {}) {
  try {
    const liveStatusPayload = await apiRequest("/api/v1/admin/hook/altered/live/status");
    state.live.status = liveStatusPayload || null;
    renderLiveMonitorPanel();
    return liveStatusPayload;
  } catch (error) {
    if (!silent) {
      pushAdminLog(`Failed to refresh live monitor status: ${error.message}`);
      notify("error", `Failed to refresh live monitor status: ${error.message}`);
    }
    return null;
  }
}

async function loadDiagnosticsData({ silent = false } = {}) {
  if (state.cache.diagnosticsLoadPromise) {
    return state.cache.diagnosticsLoadPromise;
  }

  state.cache.diagnosticsLoadPromise = (async () => {
    try {
      const timelineConfig = readDiagTimelineConfigFromInputs();
      const shouldLoadTimeline =
        state.ui.activeTab === "diagnostics" ||
        !state.diagnostics.timeline ||
        state.diagnostics.timeline.source !== timelineConfig.source ||
        state.diagnostics.timeline.bucket !== timelineConfig.bucket ||
        Number(state.diagnostics.timeline.days || 0) !== Number(timelineConfig.days || 0);

      const [statsPayload, opsPayload, opsRunsPayload, syncRunsPayload] = await Promise.all([
        apiRequest("/api/v1/alterations/stats"),
        apiRequest("/api/v1/admin/ops/overview").catch(() => null),
        apiRequest("/api/v1/admin/ops/runs?limit=100").catch(() => null),
        apiRequest("/api/v1/hook/altered/runs?limit=30"),
      ]);
      const timelinePayload = shouldLoadTimeline
        ? await apiRequest(
            `/api/v1/admin/alterations/campaigns/timeline?${getDiagTimelineQueryParams().toString()}`
          ).catch(() => null)
        : null;

      state.diagnostics.stats = statsPayload || {};
      state.diagnostics.opsOverview = opsPayload || {};
      state.diagnostics.opsRuns = Array.isArray(opsRunsPayload?.runs) ? opsRunsPayload.runs : [];
      state.diagnostics.syncRuns = Array.isArray(syncRunsPayload?.runs) ? syncRunsPayload.runs : [];
      if (timelinePayload) {
        state.diagnostics.timeline = timelinePayload;
      }

      if (state.ui.activeTab === "diagnostics") {
        renderDiagnosticsPanel();
      }
      if (state.ui.activeTab === "overview") {
        renderOverviewPanel();
      }
      return true;
    } catch (error) {
      if (!silent) {
        notify("error", `Failed to load diagnostics: ${error.message}`);
      }
      return false;
    }
  })();

  try {
    return await state.cache.diagnosticsLoadPromise;
  } finally {
    state.cache.diagnosticsLoadPromise = null;
  }
}

async function loadActivityLogData({ silent = false } = {}) {
  try {
    const [eventsPayload, runsPayload] = await Promise.all([
      apiRequest("/api/v1/admin/ops/events?limit=200").catch(() => null),
      apiRequest("/api/v1/admin/ops/runs?limit=100").catch(() => null),
    ]);
    state.diagnostics.opsEvents = Array.isArray(eventsPayload?.events) ? eventsPayload.events : [];
    state.diagnostics.opsRuns = Array.isArray(runsPayload?.runs) ? runsPayload.runs : state.diagnostics.opsRuns;
    renderOpsEvents();
    renderOpsRuns();
  } catch (error) {
    if (!silent) {
      notify("error", `Failed to load activity data: ${error.message}`);
    }
  }
}

function readNamingFiltersFromInputs() {
  if (elements.namingSearchInput) state.naming.filters.search = asText(elements.namingSearchInput.value);
  if (elements.namingAutomationFilter) state.naming.filters.automationState = asText(elements.namingAutomationFilter.value).toLowerCase();
  if (elements.namingReviewFilter) state.naming.filters.reviewState = asText(elements.namingReviewFilter.value).toLowerCase();
  if (elements.namingRegexFilter) state.naming.filters.requiresRegex = asText(elements.namingRegexFilter.value).toLowerCase();
}

function getNamingQueryParams() {
  const params = new URLSearchParams();
  const filters = state.naming.filters || {};
  if (asText(filters.search)) params.set("q", asText(filters.search));
  if (asText(filters.automationState)) params.set("automationState", asText(filters.automationState));
  if (asText(filters.reviewState)) params.set("reviewState", asText(filters.reviewState));
  if (asText(filters.requiresRegex)) params.set("requiresRegex", asText(filters.requiresRegex));
  params.set("limit", String(NAME_CANDIDATE_LIMIT));
  return params;
}

async function loadMapNameCandidates({ silent = false } = {}) {
  if (!elements.namingCandidatesBody) return null;
  readNamingFiltersFromInputs();
  try {
    const params = getNamingQueryParams();
    const payload = await apiRequest(`/api/v1/admin/naming/candidates?${params.toString()}`);
    state.ui.namingRenderToken += 1;
    state.ui.namingRenderInProgress = false;
    state.cache.namingRenderedRef = null;
    state.naming.summary = payload?.summary || null;
    state.naming.candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
    renderMapNameStandardizationPanel();
    return payload;
  } catch (error) {
    if (!silent) {
      pushAdminLog(`Failed to load naming candidates: ${error.message}`);
      notify("error", `Failed to load naming candidates: ${error.message}`);
    }
    return null;
  }
}
async function handleProcessMapNameCandidates() {
  if (!elements.namingProcessBtn) return;
  elements.namingProcessBtn.disabled = true;
  const oldText = elements.namingProcessBtn.textContent;
  elements.namingProcessBtn.textContent = "Processing...";
  notify("info", "Processing stored maps into standardized-name candidates.", { title: "Name Standardization" });
  try {
    const result = await apiRequest("/api/v1/admin/naming/process", { method: "POST", body: { limit: 120000 } });
    const message = `Name processing done: ${result?.processed || 0} maps (${result?.matched || 0} matched, ${result?.unmatched || 0} unmatched).`;
    pushAdminLog(message);
    notify("success", message, { title: "Name Standardization Complete" });
    await loadMapNameCandidates({ silent: true });
  } catch (error) {
    pushAdminLog(`Name processing failed: ${error.message}`);
    notify("error", `Name processing failed: ${error.message}`, { title: "Name Processing Failed" });
  } finally {
    elements.namingProcessBtn.disabled = false;
    elements.namingProcessBtn.textContent = oldText;
  }
}

async function handleRefreshMapNameCandidates() {
  if (elements.namingRefreshBtn) elements.namingRefreshBtn.disabled = true;
  try {
    await loadMapNameCandidates({ silent: false });
  } finally {
    if (elements.namingRefreshBtn) elements.namingRefreshBtn.disabled = false;
  }
}

function getManualNameInputForMap(mapUid) {
  if (!elements.namingCandidatesBody) return "";
  const target = asText(mapUid);
  const inputs = Array.from(elements.namingCandidatesBody.querySelectorAll("input[data-manual-input]"));
  const input = inputs.find((node) => asText(node.getAttribute("data-manual-input")) === target);
  return input ? asText(input.value) : "";
}

async function handleMapNameCandidateAction(event) {
  const button = event.target.closest("[data-naming-action]");
  if (!button) return;
  const action = asText(button.getAttribute("data-naming-action")).toLowerCase();
  const mapUid = asText(button.getAttribute("data-map-uid"));
  if (!mapUid || !action) return;
  const manualName = getManualNameInputForMap(mapUid);
  const payload = {};
  if (action === "approve") {
    payload.reviewState = "approved";
    if (manualName) payload.manualName = manualName;
  } else if (action === "manual") {
    if (!manualName) { notify("warn", "Manual name is empty. Enter a name first."); return; }
    payload.reviewState = "approved";
    payload.manualName = manualName;
  } else if (action === "ignore") {
    payload.reviewState = "ignored";
  } else {
    return;
  }
  button.disabled = true;
  try {
    const result = await apiRequest(`/api/v1/admin/naming/candidates/${encodeURIComponent(mapUid)}/review`, { method: "POST", body: payload });
    state.naming.summary = result?.summary || state.naming.summary;
    pushAdminLog(`Name candidate updated for ${mapUid}: ${payload.reviewState || "updated"}.`);
    notify("success", `Updated ${mapUid} (${payload.reviewState}).`, { title: "Name Queue" });
    await loadMapNameCandidates({ silent: true });
  } catch (error) {
    pushAdminLog(`Failed to update name candidate ${mapUid}: ${error.message}`);
    notify("error", `Failed to update name candidate: ${error.message}`, { title: "Name Queue Update Failed" });
  } finally {
    button.disabled = false;
  }
}

async function saveLiveMonitorConfig(payload, { silent = false } = {}) {
  const result = await apiRequest("/api/v1/admin/hook/altered/live/monitor/config", { method: "POST", body: payload });
  state.live.status = result;
  renderLiveMonitorPanel();
  if (!silent) {
    const message = `Live monitor config saved (club=${payload.clubId}, mode=${payload.scheduleMode}).`;
    pushAdminLog(message);
    notify("success", message, { title: "Saved" });
  }
  return result;
}

async function waitForLiveRunToSettle({ watchButton = null, actionLabel = "Fetching", timeoutMs = LIVE_PROGRESS_TIMEOUT_MS } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const statusPayload = await loadLiveStatusOnly({ silent: true });
    const monitor = statusPayload?.monitor || {};
    const progress = monitor.progress || {};
    const running = Boolean(monitor.running) || String(progress.status || "").toLowerCase() === "running";
    const percent = clampNumber(progress.percent, 0, 100, running ? 1 : 100);
    if (watchButton && running) watchButton.textContent = `${actionLabel} ${percent}%...`;
    if (!running) return statusPayload;
    await sleep(LIVE_PROGRESS_POLL_MS);
  }
  throw new Error("Timed out waiting for live fetch to finish.");
}

async function handleCampaignMove(event) {
  event.preventDefault();
  const uid = elements.adminMapSelect.value;
  const campaignName = elements.adminCampaignInput.value.trim();
  const slot = Number(elements.adminSlotInput.value || 1);
  if (!uid) { setLookupResult("Select a map first.", "bad"); return; }
  if (!campaignName) { setLookupResult("Campaign name is required.", "bad"); return; }
  try {
    const payload = await apiRequest(`/api/v1/admin/maps/${encodeURIComponent(uid)}/campaign`, { method: "POST", body: { campaignName, slot: Number.isFinite(slot) && slot > 0 ? Math.floor(slot) : 1 } });
    const mapName = payload?.updated?.map?.name || uid;
    pushAdminLog(`Campaign placement updated for ${mapName} -> ${payload?.updated?.map?.campaign || campaignName} #${payload?.updated?.map?.slot || slot}.`);
    elements.adminCampaignInput.value = "";
    await loadDashboardData({ silent: true, includeHeavy: true, forceHeavy: true });
  } catch (error) {
    pushAdminLog(`Campaign update failed: ${error.message}`);
    setLookupResult(`Campaign update failed: ${error.message}`, "bad");
  }
}

async function handleTrackingUpdate(event) {
  event.preventDefault();
  const uid = elements.trackingMapSelect.value;
  const nextState = elements.trackingStateSelect.value;
  if (!uid) { setLookupResult("Select a map first.", "bad"); return; }
  const body = nextState === "tracked" ? { tracked: true, status: "live" } : { tracked: false, status: "paused" };
  try {
    const payload = await apiRequest(`/api/v1/admin/maps/${encodeURIComponent(uid)}/tracking`, { method: "POST", body });
    pushAdminLog(`Tracking updated for ${payload?.updated?.map?.name || uid}: ${nextState}.`);
    await loadDashboardData({ silent: true, includeHeavy: true, forceHeavy: true });
  } catch (error) {
    pushAdminLog(`Tracking update failed: ${error.message}`);
    setLookupResult(`Tracking update failed: ${error.message}`, "bad");
  }
}

async function handleUidLookup(event) {
  event.preventDefault();
  const uid = elements.uidLookupInput.value.trim();
  if (!uid) { setLookupResult("Enter a map UID first.", "bad"); return; }
  try {
    const payload = await apiRequest(`/api/v1/maps/info/${encodeURIComponent(uid)}`);
    if (!payload?.exists || !payload?.map) {
      setLookupResult(`UID ${uid} is not currently in altered tracking data.`, "bad");
      pushAdminLog(`UID lookup miss: ${uid}.`);
      return;
    }
    const map = payload.map;
    setLookupResult(`${map.name} found - ${map.campaign} #${map.slot} - tracked=${Boolean(map.tracked)} - status=${map.status}`, "good");
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
  if (!Number.isFinite(clubId) || clubId <= 0) { setLookupResult("Hook config requires a valid club ID.", "bad"); return; }
  try {
    const payload = await apiRequest("/api/v1/admin/hook/altered/config", { method: "POST", body: { clubId, clubName, sourceLabel, enabled, autoTrackNewMaps } });
    state.hook.status = payload?.hook || state.hook.status;
    renderHookStatus();
    renderHookForm();
    pushAdminLog(`Hook config saved for club ${clubId}.`);
  } catch (error) {
    pushAdminLog(`Hook config update failed: ${error.message}`);
    setLookupResult(`Hook config update failed: ${error.message}`, "bad");
  }
}

async function handleHookSyncSubmit(event) {
  event.preventDefault();
  const raw = elements.hookSnapshotInput.value.trim();
  if (!raw) { setLookupResult("Paste a snapshot JSON payload before syncing.", "bad"); return; }
  let snapshot = null;
  try { snapshot = JSON.parse(raw); } catch { setLookupResult("Snapshot JSON is invalid.", "bad"); return; }
  elements.hookSyncBtn.disabled = true;
  const oldText = elements.hookSyncBtn.textContent;
  elements.hookSyncBtn.textContent = "Syncing...";
  try {
    const payload = await apiRequest("/api/v1/admin/hook/altered/sync", { method: "POST", body: snapshot });
    const synced = payload?.synced || {};
    pushAdminLog(`Hook sync completed: ${synced.mapsSeen || 0} maps seen, ${synced.mapsInserted || 0} inserted, ${synced.mapsUpdated || 0} updated.`);
    await loadDashboardData({ silent: true, includeHeavy: true, forceHeavy: true });
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
  const payload = action === "track" ? { tracked: true, status: "live" } : { tracked: false, status: "paused" };
  button.disabled = true;
  try {
    const result = await apiRequest(`/api/v1/admin/hook/altered/maps/${encodeURIComponent(mapUid)}/tracking`, { method: "POST", body: payload });
    pushAdminLog(`Hook map update: ${result?.updated?.map?.name || mapUid} -> ${action === "track" ? "tracked" : "paused"}.`);
    await loadDashboardData({ silent: true, includeHeavy: true, forceHeavy: true });
  } catch (error) {
    pushAdminLog(`Hook map update failed: ${error.message}`);
    setLookupResult(`Hook map update failed: ${error.message}`, "bad");
  } finally {
    button.disabled = false;
  }
}

function readLiveMonitorFormValues() {
  return {
    clubId: Number(elements.liveClubIdInput.value || 0),
    activityPageSize: Number(elements.liveActivityPageSizeInput.value || 250),
    intervalSeconds: Number(elements.liveIntervalInput.value || 21600),
    scheduleMode: String(elements.liveScheduleModeSelect.value || "daily").toLowerCase(),
    dailyHourUtc: Number(elements.liveDailyHourInput.value || 3),
    dailyMinuteUtc: Number(elements.liveDailyMinuteInput.value || 0),
    trackerChunkSize: Number(elements.liveTrackerChunkSizeInput.value || 350),
    enabled: Boolean(elements.liveEnabledToggle.checked),
    activeOnly: Boolean(elements.liveActiveOnlyToggle.checked),
    fetchMapDetails: Boolean(elements.liveFetchDetailsToggle.checked),
  };
}

async function handleLiveMonitorConfigSubmit(event) {
  event.preventDefault();
  const payload = readLiveMonitorFormValues();
  payload.scheduleMode = payload.scheduleMode === "interval" ? "interval" : "daily";
  if (!Number.isFinite(payload.clubId) || payload.clubId <= 0) { setLookupResult("Live monitor requires a valid club ID.", "bad"); return; }
  if (payload.scheduleMode === "daily") {
    payload.dailyHourUtc = clampNumber(payload.dailyHourUtc, 0, 23, 3);
    payload.dailyMinuteUtc = clampNumber(payload.dailyMinuteUtc, 0, 59, 0);
  } else if (!Number.isFinite(payload.intervalSeconds) || payload.intervalSeconds < 60) {
    setLookupResult("Interval schedule requires at least 60 seconds.", "bad");
    return;
  }
  payload.trackerChunkSize = clampNumber(payload.trackerChunkSize, 25, 1000, 350);
  try {
    await saveLiveMonitorConfig(payload, { silent: false });
  } catch (error) {
    pushAdminLog(`Live monitor config failed: ${error.message}`);
    notify("error", `Live monitor config failed: ${error.message}`);
  }
}

async function handleLiveFetchSummary() {
  const payload = readLiveMonitorFormValues();
  elements.liveFetchBtn.disabled = true;
  const oldText = elements.liveFetchBtn.textContent;
  elements.liveFetchBtn.textContent = "Fetching...";
  notify("info", `Fetching live summary for club ${payload.clubId}...`, { title: "Live Fetch" });
  try {
    const result = await apiRequest("/api/v1/admin/hook/altered/live/fetch", { method: "POST", body: { ...payload, summaryOnly: true } });
    const summary = result?.summary || {};
    pushAdminLog(`Live fetch summary: ${summary.campaignsLoaded || 0} campaigns, ${summary.mapsLoaded || 0} maps.`);
    notify("success", `Loaded ${summary.campaignsLoaded || 0} campaigns and ${summary.mapsLoaded || 0} maps.`, { title: "Live Fetch Complete" });
    await loadDashboardData({ silent: true, includeHeavy: true, forceHeavy: true });
  } catch (error) {
    pushAdminLog(`Live fetch failed: ${error.message}`);
    notify("error", `Live fetch failed: ${error.message}`);
  } finally {
    elements.liveFetchBtn.disabled = false;
    elements.liveFetchBtn.textContent = oldText;
  }
}

async function handleLiveRefreshData() {
  const payload = readLiveMonitorFormValues();
  payload.scheduleMode = payload.scheduleMode === "interval" ? "interval" : "daily";
  if (!Number.isFinite(payload.clubId) || payload.clubId <= 0) {
    notify("warn", "Cannot fetch latest data without a valid club ID.");
    return;
  }
  if (payload.scheduleMode === "daily") {
    payload.dailyHourUtc = clampNumber(payload.dailyHourUtc, 0, 23, 3);
    payload.dailyMinuteUtc = clampNumber(payload.dailyMinuteUtc, 0, 59, 0);
  } else if (!Number.isFinite(payload.intervalSeconds) || payload.intervalSeconds < 60) {
    notify("warn", "Interval schedule must be at least 60 seconds.");
    return;
  }
  payload.trackerChunkSize = clampNumber(payload.trackerChunkSize, 25, 1000, 350);
  elements.liveRefreshBtn.disabled = true;
  const oldText = elements.liveRefreshBtn.textContent;
  elements.liveRefreshBtn.textContent = "Starting...";
  try {
    await saveLiveMonitorConfig(payload, { silent: true });
    notify("info", `Starting full live fetch for club ${payload.clubId}.`, { title: "Live Fetch", durationMs: 2400 });
    const runPromise = apiRequest("/api/v1/admin/hook/altered/live/monitor/run", { method: "POST", body: {} });
    const settlePromise = waitForLiveRunToSettle({ watchButton: elements.liveRefreshBtn, actionLabel: "Fetching", timeoutMs: LIVE_PROGRESS_TIMEOUT_MS });
    const [runResult] = await Promise.all([runPromise, settlePromise]);
    await loadLiveStatusOnly({ silent: true });
    const progress = state.live.status?.monitor?.progress || {};
    const progressStatus = String(progress.status || "").toLowerCase();
    if (runResult?.skipped) {
      pushAdminLog("A live monitor run is already active.");
      notify("warn", "A live monitor run is already active.", { title: "Already Running" });
    } else if (progressStatus === "ok") {
      const message = String(progress.message || "").trim() || "Live fetch completed.";
      pushAdminLog(message);
      notify("success", message, { title: "Fetch Complete" });
    } else if (progressStatus === "error") {
      const message = String(progress.message || "Live fetch failed.").trim();
      pushAdminLog(message);
      notify("error", message, { title: "Fetch Failed" });
    } else {
      pushAdminLog("Live fetch finished.");
      notify("info", "Live fetch finished.");
    }
    await loadDashboardData({ silent: true, includeHeavy: true, forceHeavy: true });
  } catch (error) {
    pushAdminLog(`Fetch latest data failed: ${error.message}`);
    notify("error", `Fetch latest data failed: ${error.message}`, { title: "Fetch Failed" });
  } finally {
    elements.liveRefreshBtn.disabled = false;
    elements.liveRefreshBtn.textContent = oldText;
  }
}

async function handleLiveSyncNow() {
  const payload = readLiveMonitorFormValues();
  elements.liveSyncBtn.disabled = true;
  const oldText = elements.liveSyncBtn.textContent;
  elements.liveSyncBtn.textContent = "Syncing...";
  notify("info", `Running one-off sync for club ${payload.clubId}...`, { title: "Sync Start", durationMs: 2400 });
  try {
    const result = await apiRequest("/api/v1/admin/hook/altered/live/sync", { method: "POST", body: payload });
    const fetched = result?.fetched?.summary || {};
    const synced = result?.synced || {};
    pushAdminLog(`Live sync complete: fetched ${fetched.campaignsLoaded || 0} campaigns / ${fetched.mapsLoaded || 0} maps, stored ${synced.mapsSeen || 0} maps.`);
    notify("success", `Synced ${fetched.mapsLoaded || 0} maps (${synced.mapsSeen || 0} stored).`, { title: "Sync Complete" });
    await loadDashboardData({ silent: true, includeHeavy: true, forceHeavy: true });
  } catch (error) {
    pushAdminLog(`Live sync failed: ${error.message}`);
    notify("error", `Live sync failed: ${error.message}`);
  } finally {
    elements.liveSyncBtn.disabled = false;
    elements.liveSyncBtn.textContent = oldText;
  }
}

async function handleLogout() {
  try { await apiRequest("/api/v1/admin/auth/logout", { method: "POST", body: {} }); } catch {}
  window.location.href = "/";
}
function configureLinks() {
  const host = window.location.hostname.toLowerCase();
  const port = window.location.port || "80";
  const isLocalMode = host === "localhost" || host === "127.0.0.1" || host === "xjk.localhost" || host.endsWith(".localhost");
  if (!isLocalMode) return;
  document.querySelectorAll("[data-link='tracker']").forEach((node) => {
    node.setAttribute("href", `http://trackers.localhost:${port}/leaderboard/`);
  });
  document.querySelectorAll("[data-link='trackers']").forEach((node) => {
    node.setAttribute("href", `http://trackers.localhost:${port}/`);
  });
}

function bindEvents() {
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.getAttribute("data-admin-tab") || "overview");
    });
  });
  elements.monitorSubTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const subtab = button.getAttribute("data-monitor-subtab") || "scheduler";
      setMonitorSubTab(subtab, { persist: true, render: true, load: true });
    });
  });
  if (elements.monitorOpenMapOpsBtn) {
    elements.monitorOpenMapOpsBtn.addEventListener("click", () => {
      setActiveTab("map-operations", { persist: true, load: true });
    });
  }

  if (elements.campaignForm) elements.campaignForm.addEventListener("submit", handleCampaignMove);
  if (elements.trackingForm) elements.trackingForm.addEventListener("submit", handleTrackingUpdate);
  if (elements.uidLookupForm) elements.uidLookupForm.addEventListener("submit", handleUidLookup);
  if (elements.hookConfigForm) elements.hookConfigForm.addEventListener("submit", handleHookConfigSubmit);
  if (elements.hookSyncForm) elements.hookSyncForm.addEventListener("submit", handleHookSyncSubmit);
  if (elements.liveMonitorForm) elements.liveMonitorForm.addEventListener("submit", handleLiveMonitorConfigSubmit);
  if (elements.liveScheduleModeSelect) elements.liveScheduleModeSelect.addEventListener("change", toggleLiveScheduleInputs);
  if (elements.liveRefreshBtn) elements.liveRefreshBtn.addEventListener("click", handleLiveRefreshData);
  if (elements.liveFetchBtn) elements.liveFetchBtn.addEventListener("click", handleLiveFetchSummary);
  if (elements.liveSyncBtn) elements.liveSyncBtn.addEventListener("click", handleLiveSyncNow);
  if (elements.hookMapSearch) {
    elements.hookMapSearch.addEventListener("input", debounce(() => {
      state.filters.hookSearch = elements.hookMapSearch.value;
      state.ui.hookMapsPage = 1;
      renderHookMapList();
    }, 200));
  }
  if (elements.hookMapPrevBtn) elements.hookMapPrevBtn.addEventListener("click", () => { state.ui.hookMapsPage = Math.max(1, state.ui.hookMapsPage - 1); renderHookMapList(); });
  if (elements.hookMapNextBtn) elements.hookMapNextBtn.addEventListener("click", () => { state.ui.hookMapsPage += 1; renderHookMapList(); });
  if (elements.connectedMapsPrevBtn) elements.connectedMapsPrevBtn.addEventListener("click", () => { state.ui.connectedMapsPage = Math.max(1, state.ui.connectedMapsPage - 1); renderConnectedMapsSnapshot(); });
  if (elements.connectedMapsNextBtn) elements.connectedMapsNextBtn.addEventListener("click", () => { state.ui.connectedMapsPage += 1; renderConnectedMapsSnapshot(); });
  if (elements.clubStructurePrevBtn) elements.clubStructurePrevBtn.addEventListener("click", () => { state.ui.clubStructurePage = Math.max(1, state.ui.clubStructurePage - 1); renderClubStructurePanel(); });
  if (elements.clubStructureNextBtn) elements.clubStructureNextBtn.addEventListener("click", () => { state.ui.clubStructurePage += 1; renderClubStructurePanel(); });
  if (elements.hookMapList) elements.hookMapList.addEventListener("click", handleHookMapAction);
  if (elements.namingProcessBtn) elements.namingProcessBtn.addEventListener("click", handleProcessMapNameCandidates);
  if (elements.namingRefreshBtn) elements.namingRefreshBtn.addEventListener("click", handleRefreshMapNameCandidates);
  if (elements.namingCandidatesBody) elements.namingCandidatesBody.addEventListener("click", handleMapNameCandidateAction);
  const debouncedLoadNaming = debounce(() => loadMapNameCandidates({ silent: true }), 300);
  [elements.namingSearchInput, elements.namingAutomationFilter, elements.namingReviewFilter, elements.namingRegexFilter]
    .filter(Boolean)
    .forEach((node) => {
      node.addEventListener(node.tagName === "INPUT" ? "input" : "change", debouncedLoadNaming);
    });
  if (elements.logoutBtn) elements.logoutBtn.addEventListener("click", handleLogout);

  if (elements.diagRefreshBtn) elements.diagRefreshBtn.addEventListener("click", () => loadDiagnosticsData({ silent: false }));
  const debouncedDiagTimelineReload = debounce(() => {
    readDiagTimelineConfigFromInputs();
    if (state.ui.activeTab !== "diagnostics") return;
    loadDiagnosticsData({ silent: true });
  }, 150);
  [elements.diagTimelineSource, elements.diagTimelineBucket, elements.diagTimelineDays]
    .filter(Boolean)
    .forEach((node) => node.addEventListener("change", debouncedDiagTimelineReload));
  if (elements.activityLogRefreshBtn) elements.activityLogRefreshBtn.addEventListener("click", () => loadActivityLogData({ silent: false }));
  if (elements.opsEventsPrevBtn) elements.opsEventsPrevBtn.addEventListener("click", () => { state.ui.opsEventsPage = Math.max(1, state.ui.opsEventsPage - 1); renderOpsEvents(); });
  if (elements.opsEventsNextBtn) elements.opsEventsNextBtn.addEventListener("click", () => { state.ui.opsEventsPage += 1; renderOpsEvents(); });
}

async function boot() {
  configureLinks();
  bindEvents();
  readDiagTimelineConfigFromInputs();
  state.ui.monitorSubTab = getInitialMonitorSubTab();
  setMonitorSubTab(state.ui.monitorSubTab, { persist: false, render: false, load: false });
  setActiveTab(getInitialTab(), { persist: false, load: false });
  toggleLiveScheduleInputs();
  setLookupResult("No lookup yet.");
  renderAdminLog();
  const ok = await loadAuthStatus();
  if (!ok) return;

  await loadDataForTab(state.ui.activeTab, { silent: false });

  window.setInterval(() => {
    const activeTab = state.ui.activeTab;
    const allowHeavyRefresh = isHeavyTab(activeTab) && activeTab !== "map-operations";
    loadDashboardData({
      silent: true,
      includeHeavy: allowHeavyRefresh,
    });
  }, REFRESH_INTERVAL_MS);

  window.setInterval(() => {
    loadDiagnosticsData({ silent: true });
  }, DIAGNOSTICS_REFRESH_INTERVAL_MS);

  window.setInterval(() => {
    if (state.ui.activeTab === "activity-log") loadActivityLogData({ silent: true });
  }, REFRESH_INTERVAL_MS * 2);
}

boot();

