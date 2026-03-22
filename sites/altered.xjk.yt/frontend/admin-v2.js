/* ================================================================
   Altered Admin v2 — Redesigned
   Club-first admin panel with toast notifications
   ================================================================ */

const WORKSPACES = ["dashboard", "clubs", "maps", "jobs", "activity", "api", "settings"];
const LEGACY_MAP = {
  command: "dashboard", overview: "dashboard",
  sync: "jobs", monitor: "jobs", tracker: "jobs",
  "map-operations": "maps",
  "activity-log": "activity",
  operations: "activity",
  docs: "api",
  advanced: "settings",
  diagnostics: "settings",
};
const POLL_MS = { dashboard: 15000, jobs: 5000, activity: 15000, api: 30000 };
const DRAWER_WIDTH_KEY = "alteredAdmin.drawerWidth";
const DEFAULT_DRAWER_WIDTH = 640;
const NAMING_DETAIL_DRAWER_WIDTH = 1120;
const MIN_DRAWER_WIDTH = 420;
const MAX_DRAWER_WIDTH = 1400;
const NETWORK_FALLBACK_STATUS = new Set([502, 503, 504]);
const FETCH_NETWORK_RETRY_ATTEMPTS = 2;
const FETCH_NETWORK_RETRY_DELAY_MS = 350;
const FETCH_TIMEOUT_MS = 20000;
const SIMILARITY_RUNNING_GRACE_MS = 2 * 60 * 1000;
const NAMING_SIMILARITY_PAGE_SIZE = 5;
const NAMING_SIMILARITY_SOURCE_OPTIONS = [
  ["", "All Sources"],
  ["official-seasonal-v2", "Seasonal"],
  ["official-totd", "TOTD"],
  ["weekly-shorts", "Weekly Shorts"],
  ["weekly-grands", "Weekly Grands"],
  ["official-discovery", "Discovery"],
  ["official-competition", "Competition"],
  ["official-legacy", "Legacy"],
];

/* ── State ────────────────────────────────────────────────── */
const state = {
  ws: "dashboard",
  auth: null,
  dashboard: null,
  clubs: null,
  jobs: null,
  api: null,
  settings: null,
  similarityBackfill: null,
  similarityBackfillStatusSupported: null,
  similarityBackfillStatusPromise: null,
  namingSimilaritySourceKey: "",
  namingSimilarityClubId: "",
  namingSimilarityForce: false,
  namingSimilarityPendingOnly: true,
  maps: {
    view: "inventory",
    data: null,
    lastRequestKey: "",
    filters: {
      inventory: { q: "", campaign: "", tracked: "", status: "", staleState: "" },
      campaigns: {},
      naming: { q: "", automationState: "", reviewState: "pending", requiresRegex: "" },
      requests: { q: "", status: "" },
    },
    page: { inventory: 1, campaigns: 1, naming: 1, requests: 1 },
    pageSize: { inventory: 50, campaigns: 24, naming: 10, requests: 40 },
  },
  activity: {
    data: null,
    lastRequestKey: "",
    filters: { kind: "all", mapUid: "", jobKey: "" },
    cursor: 0, limit: 40,
  },
  drawer: { open: false, type: null, title: "", subtitle: "", kicker: "Detail", payload: null },
  drawerUi: {
    width: DEFAULT_DRAWER_WIDTH,
    activeTab: "overview",
    resize: null,
    namingSimilaritySearch: "",
    namingSimilarityPage: 1,
  },
  requestMonitor: {
    nextId: 1,
    active: [],
    recent: [],
    lastFailure: null,
  },
  lastActionControl: null,
  busy: new Set(),
  lastLoad: { dashboard: 0, jobs: 0, activity: 0, api: 0 },
};

const el = {};

function clampDrawerWidth(value) {
  const viewportMax = Math.max(MIN_DRAWER_WIDTH, Math.min(MAX_DRAWER_WIDTH, window.innerWidth - 24));
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.min(DEFAULT_DRAWER_WIDTH, viewportMax);
  return Math.max(MIN_DRAWER_WIDTH, Math.min(viewportMax, Math.round(parsed)));
}

function loadStoredDrawerWidth() {
  try {
    return clampDrawerWidth(window.localStorage.getItem(DRAWER_WIDTH_KEY));
  } catch {
    return clampDrawerWidth(DEFAULT_DRAWER_WIDTH);
  }
}

function saveDrawerWidth(width) {
  try {
    window.localStorage.setItem(DRAWER_WIDTH_KEY, String(clampDrawerWidth(width)));
  } catch {}
}

function getAdminApiOrigins() {
  return [window.location.origin];
}

function toAbsoluteApiUrl(origin, url) {
  if (/^https?:\/\//i.test(String(url || ""))) return String(url);
  return new URL(String(url || "/"), origin).toString();
}

function isRetryableFetchError(error) {
  const message = String(error?.message || "").trim().toLowerCase();
  return (
    error?.name === "TypeError" ||
    message.includes("networkerror") ||
    message.includes("failed to fetch") ||
    message.includes("load failed") ||
    message.includes("network request failed")
  );
}

function waitForFetchRetry(ms = FETCH_NETWORK_RETRY_DELAY_MS) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function isTransientGatewayStatus(status) {
  return NETWORK_FALLBACK_STATUS.has(Number(status || 0));
}

function trimRequestText(value = "", maxLength = 120) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function beginRequestMonitor({ logicalUrl = "", requestUrl = "", origin = "", method = "GET", attempt = 1 } = {}) {
  const entry = {
    id: state.requestMonitor.nextId++,
    logicalUrl: trimRequestText(logicalUrl),
    requestUrl: trimRequestText(requestUrl),
    origin: trimRequestText(origin, 60),
    method: String(method || "GET").toUpperCase(),
    attempt: Math.max(1, Number(attempt) || 1),
    startedAtMs: Date.now(),
    startedAt: new Date().toISOString(),
  };
  state.requestMonitor.active = [entry, ...state.requestMonitor.active]
    .sort((left, right) => right.startedAtMs - left.startedAtMs)
    .slice(0, 10);
  notifyRequestMonitorChanged(entry);
  return entry.id;
}

function finishRequestMonitor(id, partial = {}) {
  const index = state.requestMonitor.active.findIndex((entry) => entry.id === id);
  const base =
    index >= 0
      ? state.requestMonitor.active[index]
      : {
          id,
          logicalUrl: trimRequestText(partial.logicalUrl),
          requestUrl: trimRequestText(partial.requestUrl),
          origin: trimRequestText(partial.origin, 60),
          method: String(partial.method || "GET").toUpperCase(),
          attempt: Math.max(1, Number(partial.attempt) || 1),
          startedAtMs: Date.now(),
          startedAt: new Date().toISOString(),
        };
  if (index >= 0) {
    state.requestMonitor.active.splice(index, 1);
  }

  const finished = {
    ...base,
    ...partial,
    finishedAtMs: Date.now(),
  };
  finished.durationMs = Math.max(
    0,
    Number(finished.durationMs || 0) || (finished.finishedAtMs - Number(base.startedAtMs || finished.finishedAtMs))
  );
  finished.finishedAt = new Date(finished.finishedAtMs).toISOString();
  state.requestMonitor.recent = [finished, ...state.requestMonitor.recent]
    .sort((left, right) => Number(right.finishedAtMs || 0) - Number(left.finishedAtMs || 0))
    .slice(0, 14);
  if (finished.ok === false) {
    state.requestMonitor.lastFailure = finished;
  }
  notifyRequestMonitorChanged(finished);
  return finished;
}

function isSimilarityDiagnosticsRequest(entry = {}) {
  const haystack = `${entry.logicalUrl || ""} ${entry.requestUrl || ""}`.toLowerCase();
  return haystack.includes("/naming/similarity/backfill");
}

function notifyRequestMonitorChanged(entry = null) {
  if (!isSimilarityDiagnosticsRequest(entry || {})) return;
  rerenderSimilarityBackfillSurfaces();
}

function getSimilarityDiagnosticsSnapshot() {
  const active = (Array.isArray(state.requestMonitor.active) ? state.requestMonitor.active : [])
    .filter(isSimilarityDiagnosticsRequest)
    .slice(0, 3);
  const recent = (Array.isArray(state.requestMonitor.recent) ? state.requestMonitor.recent : [])
    .filter(isSimilarityDiagnosticsRequest)
    .slice(0, 8);
  const recentFailure = recent.find((entry) => entry.ok === false) || null;
  return { active, recentFailure };
}

function renderSimilarityDiagnostics({ compact = false } = {}) {
  const { active, recentFailure } = getSimilarityDiagnosticsSnapshot();
  const showFailure =
    recentFailure && Date.now() - Number(recentFailure.finishedAtMs || 0) <= 10 * 60 * 1000;
  if (!active.length && !showFailure) return "";

  const activeMarkup = active.length
    ? active.map((entry) => `
        <div class="similarity-diagnostics-item">
          <strong>Checking</strong>
          <span>${esc(entry.method)} ${esc(entry.logicalUrl || entry.requestUrl || "/")} · attempt ${esc(String(entry.attempt || 1))} · ${esc(fmtDuration(Date.now() - Number(entry.startedAtMs || Date.now())))} elapsed</span>
        </div>
      `).join("")
    : "";
  const failureMarkup = showFailure
    ? `
      <div class="similarity-diagnostics-item is-error">
        <strong>Last failure</strong>
        <span>${esc(trimRequestText(recentFailure.error || "Request failed.", compact ? 90 : 140))} · ${esc(recentFailure.method || "GET")} ${esc(recentFailure.logicalUrl || recentFailure.requestUrl || "/")}</span>
      </div>
    `
    : "";

  return `
    <div class="similarity-diagnostics${compact ? " is-compact" : ""}">
      <div class="similarity-diagnostics-head">
        <span class="pill ${active.length ? "tone-info" : "tone-warn"}">${active.length ? "Checks Running" : "Recent Failure"}</span>
        <span>${active.length ? "Watching similarity progress requests." : "Similarity polling hit a recent error."}</span>
      </div>
      ${activeMarkup}
      ${failureMarkup}
    </div>
  `;
}

async function fetchWithAlteredFallback(url, init = {}) {
  const origins = getAdminApiOrigins();
  let lastError = null;
  const timeoutMs = Math.max(250, Number(init.timeoutMs || 0) || FETCH_TIMEOUT_MS);
  const requestInit = { ...init };
  delete requestInit.__monitor;
  delete requestInit.timeoutMs;
  for (let index = 0; index < origins.length; index += 1) {
    const origin = origins[index];
    const requestUrl = toAbsoluteApiUrl(origin, url);
    for (let attempt = 0; attempt <= FETCH_NETWORK_RETRY_ATTEMPTS; attempt += 1) {
      const monitorId = beginRequestMonitor({
        logicalUrl: url,
        requestUrl,
        origin,
        method: requestInit.method || "GET",
        attempt: attempt + 1,
      });
      let timeoutId = null;
      try {
        let signal = requestInit.signal;
        if (!signal && timeoutMs > 0) {
          if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
            signal = AbortSignal.timeout(timeoutMs);
          } else {
            const controller = new AbortController();
            timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
            signal = controller.signal;
          }
        }
        const response = await fetch(requestUrl, {
          ...requestInit,
          ...(signal ? { signal } : {}),
        });
        if (timeoutId) window.clearTimeout(timeoutId);
        timeoutId = null;
        finishRequestMonitor(monitorId, {
          ok: response.ok,
          status: response.status,
          logicalUrl: url,
          requestUrl,
          origin,
          method: requestInit.method || "GET",
          attempt: attempt + 1,
          error: response.ok ? "" : `HTTP ${response.status}`,
        });
        if (!NETWORK_FALLBACK_STATUS.has(response.status) || index === origins.length - 1) {
          return response;
        }
        lastError = new Error(`Request failed (${response.status}).`);
        break;
      } catch (error) {
        // Ensure any manual timeout is cleaned up even if `fetch` throws early.
        try {
          if (timeoutId) window.clearTimeout(timeoutId);
        } catch {}
        finishRequestMonitor(monitorId, {
          ok: false,
          status: "network",
          logicalUrl: url,
          requestUrl,
          origin,
          method: requestInit.method || "GET",
          attempt: attempt + 1,
          error: error?.message || "Network request failed.",
        });
        lastError = error;
        const canRetry =
          attempt < FETCH_NETWORK_RETRY_ATTEMPTS &&
          index === origins.length - 1 &&
          isRetryableFetchError(error);
        if (canRetry) {
          await waitForFetchRetry(FETCH_NETWORK_RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        if (index === origins.length - 1) {
          throw error;
        }
        break;
      }
    }
  }
  throw lastError || new Error("Request failed.");
}

function getPreferredAlteredOrigin() {
  return getAdminApiOrigins()[0];
}

/* ── Boot ─────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  cacheEls();
  bindEvents();
  syncHash(true);
  boot().catch(err => {
    if (!isRequestTimeoutError(err)) console.error(err);
    renderWorkspaceLoadError(state.ws || "dashboard", err);
  });
});

function cacheEls() {
  el.healthPill     = document.getElementById("healthPill");
  el.healthSummary  = document.getElementById("healthSummary");
  el.statUser       = document.getElementById("statUser");
  el.statRunning    = document.getElementById("statRunning");
  el.statAlerts     = document.getElementById("statAlerts");
  el.statUpdated    = document.getElementById("statUpdated");
  el.sidebarSession = document.getElementById("sidebarSession");
  el.logoutBtn      = document.getElementById("logoutBtn");
  el.navClubCount   = document.getElementById("navClubCount");
  el.navJobsRunning = document.getElementById("navJobsRunning");
  el.wsDashboard    = document.getElementById("wsDashboard");
  el.wsClubs        = document.getElementById("wsClubs");
  el.wsMaps         = document.getElementById("wsMaps");
  el.wsJobs         = document.getElementById("wsJobs");
  el.wsActivity     = document.getElementById("wsActivity");
  el.wsApi          = document.getElementById("wsApi");
  el.wsSettings     = document.getElementById("wsSettings");
  el.drawer         = document.getElementById("detailDrawer");
  el.drawerBody     = document.getElementById("drawerBody");
  el.drawerTitle    = document.getElementById("drawerTitle");
  el.drawerSubtitle = document.getElementById("drawerSubtitle");
  el.drawerKicker   = document.getElementById("drawerKicker");
  el.drawerClose    = document.getElementById("drawerCloseBtn");
  el.drawerScrim    = document.getElementById("drawerScrim");
  el.drawerResize   = document.getElementById("drawerResizeHandle");
  el.toastBox       = document.getElementById("toastContainer");
  state.drawerUi.width = loadStoredDrawerWidth();
  el.drawer?.style.setProperty("--drawer-width", `${state.drawerUi.width}px`);
}

function bindEvents() {
  window.addEventListener("hashchange", () => syncHash(false));
  window.addEventListener("resize", () => {
    state.drawerUi.width = clampDrawerWidth(state.drawerUi.width);
    el.drawer?.style.setProperty("--drawer-width", `${state.drawerUi.width}px`);
  });
  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", stopDrawerResize);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && state.drawer.open) { e.preventDefault(); closeDrawer(); } });
  el.logoutBtn?.addEventListener("click", doLogout);
  el.drawerClose?.addEventListener("click", closeDrawer);
  el.drawerScrim?.addEventListener("click", closeDrawer);
  el.drawerResize?.addEventListener("pointerdown", startDrawerResize);
  el.drawerResize?.addEventListener("dblclick", () => {
    state.drawerUi.width = clampDrawerWidth(DEFAULT_DRAWER_WIDTH);
    el.drawer?.style.setProperty("--drawer-width", `${state.drawerUi.width}px`);
    saveDrawerWidth(state.drawerUi.width);
  });
  setInterval(poll, 5000);
  setInterval(() => {
    if (!state.auth?.authenticated) return;
    if (!isSimilarityBackfillEffectivelyRunning()) return;
    if (state.busy.has("naming-similarity")) return;
    loadNamingSimilarityBackfillStatus().catch((error) => {
      if (isTransientGatewayError(error)) return;
      console.error(error);
    });
  }, 1000);
}

async function boot() {
  showLoadingAll();
  await loadAuth();
  renderLayout();
  if (!state.auth?.authenticated) { renderSignedOut(); return; }

  if (state.ws === "dashboard") {
    await loadDashboard();
    schedulePrefetch();
    return;
  }

  const dashboardPromise = loadDashboard().catch(err => {
    if (!isRequestTimeoutError(err)) console.error(err);
  });

  await ensureLoaded(state.ws, true);
  schedulePrefetch();
  void dashboardPromise;
}

let prefetchStarted = false;

function schedulePrefetch() {
  if (prefetchStarted) return;
  if (!state.auth?.authenticated) return;
  prefetchStarted = true;
  const kick = () => {
    prefetchWorkspaces().catch(console.error);
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(kick, { timeout: 1500 });
    return;
  }
  window.setTimeout(kick, 450);
}

async function prefetchWorkspaces() {
  const order = ["jobs", "maps", "activity", "settings", "api"];
  for (const ws of order) {
    if (!state.auth?.authenticated) return;
    if (ws === state.ws) continue;
    try {
      await ensureLoaded(ws);
    } catch {
      // Best-effort prefetch; errors are rendered when a workspace is opened.
    }
    await new Promise(resolve => window.setTimeout(resolve, 150));
  }
}

function showLoadingAll() {
  el.wsDashboard.innerHTML = loading("Loading dashboard...");
  el.wsClubs.innerHTML     = loading("Will load when opened.");
  el.wsMaps.innerHTML      = loading("Will load when opened.");
  el.wsJobs.innerHTML      = loading("Will load when opened.");
  el.wsActivity.innerHTML  = loading("Will load when opened.");
  el.wsApi.innerHTML       = loading("Will load when opened.");
  el.wsSettings.innerHTML  = loading("Will load when opened.");
}

/* ── Auth ─────────────────────────────────────────────────── */
async function loadAuth() {
  state.auth = await api("/api/v1/admin/auth/status");
  renderSession();
}

function renderSession() {
  const a = state.auth;
  if (!a) { el.sidebarSession.innerHTML = `<span class="pill tone-muted">Loading</span>`; el.statUser.textContent = "-"; return; }
  if (a.authenticated) {
    const name = a.user?.displayName || a.user?.username || a.provider || "Admin";
    el.sidebarSession.innerHTML = `
      <span class="pill tone-success">Signed in</span>
      <p style="margin-top:.35rem;font-size:.84rem;">${esc(name)}</p>
      ${a.expiresAt ? `<p style="margin-top:.2rem;font-size:.74rem;color:var(--a-muted)">Expires ${esc(fmtDateTime(a.expiresAt))}</p>` : ""}
    `;
    el.statUser.textContent = name;
  } else {
    const url = a.loginUrl || "/admin-login";
    el.sidebarSession.innerHTML = `
      <span class="pill tone-warn">Signed out</span>
      <p style="margin-top:.35rem;font-size:.84rem;">${esc(a.configError || "Session not active.")}</p>
      <a class="btn primary small" href="${esc(url)}" style="margin-top:.45rem;">Sign In</a>
    `;
    el.statUser.textContent = "Not signed in";
  }
}

function renderSignedOut() {
  const url = state.auth?.loginUrl || "/admin-login/";
  el.healthPill.className = "pill tone-warn"; el.healthPill.textContent = "Signed out";
  el.healthSummary.textContent = "Login required.";
  el.statRunning.textContent = "-"; el.statAlerts.textContent = "-"; el.statUpdated.textContent = "-";
  el.wsDashboard.innerHTML = `
    <div class="empty-state">
      <span class="pill tone-warn">Login required</span>
      <h3>Admin session not active</h3>
      <p>Sign in to access the admin panel.</p>
      <div style="margin-top:1rem;"><a class="btn primary" href="${esc(url)}">Open Login</a></div>
    </div>`;
}

/* ── Data Loading ─────────────────────────────────────────── */
async function loadDashboard() {
  state.dashboard = await api("/api/v1/admin/command-center");
  const manifestSimilarityStatus = state.dashboard?.compatibility?.requiredRoutes?.namingSimilarityBackfillStatus;
  const supportsSimilarityStatus = manifestSimilarityStatus === true;
  if (manifestSimilarityStatus === true) {
    state.similarityBackfillStatusSupported = true;
  } else if (manifestSimilarityStatus === false && state.similarityBackfillStatusSupported === null) {
    state.similarityBackfillStatusSupported = false;
  }
  state.lastLoad.dashboard = Date.now();
  renderDashboard(); renderTopbar(); renderNavBadges();
  if (
    state.similarityBackfillStatusSupported !== false &&
    !state.busy.has("naming-similarity") &&
    !state.similarityBackfill?.running &&
    !state.similarityBackfill
  ) {
    loadNamingSimilarityBackfillStatus().catch(console.error);
  }
}

let jobsOverviewPromise = null;

async function loadJobsOverview() {
  if (jobsOverviewPromise) return jobsOverviewPromise;
  jobsOverviewPromise = (async () => {
    const payload = await api("/api/v1/admin/jobs/overview");
    state.jobs = payload;
    state.clubs = payload;
    state.lastLoad.jobs = Date.now();
    return payload;
  })();
  try {
    return await jobsOverviewPromise;
  } finally {
    jobsOverviewPromise = null;
  }
}

async function loadClubs() {
  await loadJobsOverview();
  renderClubs(); renderTopbar(); renderNavBadges();
}

async function loadJobs() {
  await loadJobsOverview();
  renderJobs(); renderTopbar(); renderNavBadges();
}

let mapsLoadPromise = null;
let mapsLoadKey = "";

async function loadMaps(force = false) {
  const v = state.maps.view;
  const p = state.maps.page[v] || 1;
  const ps = state.maps.pageSize[v] || 50;
  const f = state.maps.filters[v] || {};
  const params = new URLSearchParams({ view: v, page: String(p), pageSize: String(ps) });
  Object.entries(f).forEach(([k, val]) => { if (val !== undefined && val !== null && String(val) !== "") params.set(k, String(val)); });
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

async function loadActivity() {
  const f = state.activity.filters;
  const params = new URLSearchParams({ kind: f.kind || "all", cursor: String(state.activity.cursor || 0), limit: String(state.activity.limit || 40) });
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

async function loadApi() {
  state.api = await api("/api/v1/admin/public-api/summary");
  state.lastLoad.api = Date.now();
  renderApi();
}

async function loadSettings() {
  state.settings = await api("/api/v1/admin/settings/summary");
  renderSettings();
}

function isRequestTimeoutError(error) {
  const name = String(error?.name || "").trim().toLowerCase();
  const message = String(error?.message || "").trim().toLowerCase();
  return (
    name === "timeouterror" ||
    name === "aborterror" ||
    message.includes("timed out") ||
    message.includes("operation timed out")
  );
}

function getMapsRequestKey() {
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

function getActivityRequestKey() {
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

function isNotFoundError(error) {
  return /\(404\)/.test(String(error?.message || "").trim());
}

function isTransientGatewayError(error) {
  return /\((502|503|504)\)/.test(String(error?.message || "").trim());
}

function rerenderSimilarityBackfillSurfaces() {
  document.querySelectorAll("[data-run-naming-similarity]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    const baseLabel = button.getAttribute("data-similarity-button-label") || "Similarity Backfill";
    button.textContent = getSimilarityBackfillButtonLabel(baseLabel);
    button.disabled = isSimilarityBackfillRunning();
  });

  const compactStatus = document.querySelector("[data-similarity-backfill-status-compact]");
  if (compactStatus instanceof HTMLElement) {
    compactStatus.innerHTML = renderSimilarityBackfillStatus({ compact: true });
  }

  const fullStatus = document.querySelector("[data-similarity-backfill-status-full]");
  if (fullStatus instanceof HTMLElement) {
    fullStatus.innerHTML = renderSimilarityBackfillStatus();
  }
}

function parseTimestampMs(value) {
  const parsed = Date.parse(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSimilarityBackfillEffectivelyRunning(status = state.similarityBackfill) {
  if (state.busy.has("naming-similarity")) return true;
  if (!status) return false;
  if (status.running) return true;

  const progress = status.progress || {};
  const progressState = String(progress.status || "").trim().toLowerCase();
  const recentUpdateMs = parseTimestampMs(progress.updatedAt || status.lastStartedAt);
  const hasRecentRunningProgress =
    progressState === "running" &&
    recentUpdateMs > 0 &&
    Date.now() - recentUpdateMs <= SIMILARITY_RUNNING_GRACE_MS;

  return hasRecentRunningProgress;
}

function mergeSimilarityBackfillStatus(previousStatus, nextStatus) {
  if (!nextStatus || typeof nextStatus !== "object") return previousStatus || nextStatus;
  if (!previousStatus || typeof previousStatus !== "object") return nextStatus;

  const nextProgress = nextStatus.progress || {};
  const nextProgressState = String(nextProgress.status || "").trim().toLowerCase();
  const nextTerminal =
    nextProgress.complete === true ||
    nextProgressState === "ok" ||
    nextProgressState === "error" ||
    Boolean(nextStatus.lastFinishedAt) ||
    Boolean(nextStatus.lastSummary) ||
    Boolean(nextStatus.lastError);
  if (nextTerminal) return nextStatus;

  const nextRunning = isSimilarityBackfillEffectivelyRunning(nextStatus);
  if (nextRunning) return nextStatus;

  const previousRunning = isSimilarityBackfillEffectivelyRunning(previousStatus);
  if (!previousRunning) return nextStatus;

  const mergedProgress = {
    ...(previousStatus.progress || {}),
    ...(nextStatus.progress || {}),
    counters: {
      ...((previousStatus.progress && previousStatus.progress.counters) || {}),
      ...((nextStatus.progress && nextStatus.progress.counters) || {}),
    },
  };

  return {
    ...previousStatus,
    ...nextStatus,
    running: true,
    currentRunId: nextStatus.currentRunId || previousStatus.currentRunId || null,
    currentReason: nextStatus.currentReason || previousStatus.currentReason || null,
    progress: mergedProgress,
    lastStartedAt: nextStatus.lastStartedAt || previousStatus.lastStartedAt || null,
    lastFinishedAt: nextStatus.lastFinishedAt || previousStatus.lastFinishedAt || null,
    lastSummary: nextStatus.lastSummary || previousStatus.lastSummary || null,
    lastError: nextStatus.lastError || previousStatus.lastError || null,
  };
}

async function loadNamingSimilarityBackfillStatus() {
  if (state.similarityBackfillStatusPromise) return state.similarityBackfillStatusPromise;
  const requestPromise = (async () => {
  try {
    const nextStatus = await api("/api/v1/admin/naming/similarity/backfill/status");
    state.similarityBackfill = mergeSimilarityBackfillStatus(state.similarityBackfill, nextStatus);
    state.similarityBackfillStatusSupported = true;
    rerenderSimilarityBackfillSurfaces();
    return state.similarityBackfill;
  } catch (error) {
    if (isNotFoundError(error)) {
      state.similarityBackfillStatusSupported = false;
      return state.similarityBackfill;
    }
    throw error;
  }
  })();
  state.similarityBackfillStatusPromise = requestPromise;
  try {
    return await requestPromise;
  } finally {
    if (state.similarityBackfillStatusPromise === requestPromise) {
      state.similarityBackfillStatusPromise = null;
    }
  }
}

async function waitForSimilarityBackfillToFinish({ timeoutMs = 4 * 60 * 60 * 1000, pollMs = 1000 } = {}) {
  const startedAt = Date.now();
  let lastKnownStatus = state.similarityBackfill;
  let transientFailures = 0;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const status = await loadNamingSimilarityBackfillStatus();
      lastKnownStatus = status || lastKnownStatus;
      transientFailures = 0;
      if (!isSimilarityBackfillEffectivelyRunning(status)) return status;
    } catch (error) {
      transientFailures += 1;
      if (!isSimilarityBackfillEffectivelyRunning(lastKnownStatus) || transientFailures >= 30) {
        throw error;
      }
    }
    await new Promise(resolve => window.setTimeout(resolve, pollMs));
  }
  throw new Error("Similarity backfill timed out before it finished.");
}

function getWorkspaceBodyEl(ws) {
  if (ws === "dashboard") return el.wsDashboard;
  if (ws === "clubs") return el.wsClubs;
  if (ws === "maps") return el.wsMaps;
  if (ws === "jobs") return el.wsJobs;
  if (ws === "activity") return el.wsActivity;
  if (ws === "api") return el.wsApi;
  if (ws === "settings") return el.wsSettings;
  return null;
}

function workspaceLabel(ws) {
  if (ws === "dashboard") return "Dashboard";
  if (ws === "clubs") return "Clubs";
  if (ws === "maps") return "Maps";
  if (ws === "jobs") return "Jobs";
  if (ws === "activity") return "Activity";
  if (ws === "api") return "API";
  if (ws === "settings") return "Settings";
  return "Workspace";
}

function showWorkspaceLoading(ws, msg = "") {
  const host = getWorkspaceBodyEl(ws);
  if (!host) return;
  const copy = String(msg || "").trim() || `Loading ${workspaceLabel(ws)}...`;
  host.innerHTML = loading(copy);
}

function renderWorkspaceLoadError(ws, error) {
  const host = getWorkspaceBodyEl(ws);
  if (!host) return;
  const title = workspaceLabel(ws);
  const message = error?.message || "Request failed.";
  host.innerHTML = `
    <div class="empty-state">
      <span class="pill tone-error">Error</span>
      <h3>Failed to load ${esc(title)}</h3>
      <p>${esc(message)}</p>
      <div style="margin-top:1rem;display:flex;gap:.35rem;flex-wrap:wrap;">
        <button class="btn primary" type="button" data-refresh="${esc(ws)}">Retry</button>
        <button class="btn ghost" type="button" data-nav="dashboard">Dashboard</button>
      </div>
    </div>`;
}

async function ensureLoaded(ws, force = false) {
  try {
    if (ws === "dashboard" && (force || !state.dashboard)) {
      if (!state.dashboard) showWorkspaceLoading(ws, "Loading dashboard...");
      await loadDashboard();
      return;
    }

    if (ws === "clubs" && (force || !state.clubs)) {
      if (!state.clubs) showWorkspaceLoading(ws, "Loading clubs...");
      await loadClubs();
      return;
    }

    if (ws === "maps") {
      const requestKey = getMapsRequestKey();
      const needsLoad =
        force ||
        !state.maps.data ||
        state.maps.lastRequestKey !== requestKey;
      if (needsLoad) {
        if (!state.maps.data || state.maps.lastRequestKey !== requestKey) {
          showWorkspaceLoading(ws, "Loading maps...");
        }
        await loadMaps(force);
      }
      return;
    }

    if (ws === "jobs" && (force || !state.jobs)) {
      if (!state.jobs) showWorkspaceLoading(ws, "Loading jobs...");
      await loadJobs();
      return;
    }

    if (ws === "activity") {
      const requestKey = getActivityRequestKey();
      const needsLoad =
        force ||
        !state.activity.data ||
        state.activity.lastRequestKey !== requestKey;
      if (needsLoad) {
        if (!state.activity.data || state.activity.lastRequestKey !== requestKey) {
          showWorkspaceLoading(ws, "Loading activity...");
        }
        await loadActivity();
      }
      return;
    }

    if (ws === "api" && (force || !state.api)) {
      if (!state.api) showWorkspaceLoading(ws, "Loading API workspace...");
      await loadApi();
      return;
    }

    if (ws === "settings" && (force || !state.settings)) {
      if (!state.settings) showWorkspaceLoading(ws, "Loading settings...");
      await loadSettings();
      return;
    }
  } catch (error) {
    if (!isRequestTimeoutError(error)) console.error(error);
    renderWorkspaceLoadError(ws, error);
    throw error;
  }
}

/* ── Polling ──────────────────────────────────────────────── */
function poll() {
  if (!state.auth?.authenticated) return;
  const now = Date.now();
  if (state.ws === "jobs" && now - (state.lastLoad.jobs || 0) >= POLL_MS.jobs) { loadJobs().catch(console.error); return; }
  if (state.ws === "activity" && now - (state.lastLoad.activity || 0) >= POLL_MS.activity) { loadActivity().catch(console.error); return; }
  if (state.ws === "api" && now - (state.lastLoad.api || 0) >= POLL_MS.api) { loadApi().catch(console.error); return; }
  if (state.ws === "dashboard" && now - (state.lastLoad.dashboard || 0) >= POLL_MS.dashboard) {
    loadDashboard().catch(console.error);
  }
}

/* ── Routing ──────────────────────────────────────────────── */
function syncHash(initial) {
  const { ws, params } = parseHash();
  state.ws = ws;
  if (ws === "maps") state.maps.view = params.get("view") || state.maps.view || "inventory";
  if (ws === "activity") {
    state.activity.filters.kind = params.get("kind") || state.activity.filters.kind || "all";
    state.activity.filters.mapUid = params.get("mapUid") || "";
    state.activity.filters.jobKey = params.get("jobKey") || "";
    state.activity.cursor = Number(params.get("cursor") || 0) || 0;
  }
  renderLayout();
  if (!initial) ensureLoaded(ws).catch(console.error);
}

function parseHash() {
  const raw = location.hash.replace(/^#/, "").trim();
  if (!raw) return { ws: "dashboard", params: new URLSearchParams() };
  const [rawWs, rawP = ""] = raw.split("?");
  const mapped = LEGACY_MAP[rawWs] || rawWs || "dashboard";
  const ws = WORKSPACES.includes(mapped) ? mapped : "dashboard";
  return { ws, params: new URLSearchParams(rawP) };
}

function setHash(ws, params = {}) {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && String(v) !== "") s.set(k, String(v)); });
  const h = `#${ws}${s.toString() ? `?${s}` : ""}`;
  if (location.hash === h) { syncHash(false); return; }
  location.hash = h;
}

/* ── Layout Rendering ─────────────────────────────────────── */
function renderLayout() {
  document.querySelectorAll("[data-workspace-link]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.workspaceLink === state.ws);
  });
  document.querySelectorAll("[data-workspace]").forEach(panel => {
    const on = panel.dataset.workspace === state.ws;
    panel.hidden = !on;
    panel.classList.toggle("active", on);
  });
  renderSession();
  renderTopbar();
  if (state.dashboard) renderDashboard();
  if (state.clubs) renderClubs();
  if (state.jobs) renderJobs();
  if (state.maps.data) renderMaps();
  if (state.activity.data) renderActivity();
  if (state.api) renderApi();
  if (state.settings) renderSettings();
  renderDrawer();
}

function renderTopbar() {
  const d = state.dashboard;
  if (!d) return;
  const h = d.health || {};
  const jobs = state.jobs?.jobs || d.jobs || [];
  const running = jobs.filter(j => j.state === "running").length;
  const alerts = Array.isArray(d.alerts) ? d.alerts : [];
  el.healthPill.className = `pill ${toneClass(h.state)}`;
  el.healthPill.textContent = toneLabel(h.state);
  el.healthSummary.textContent = h.summary || "No summary.";
  el.statRunning.textContent = fmtNum(running);
  el.statAlerts.textContent = fmtNum(alerts.length);
  el.statUpdated.textContent = fmtClock(d.generatedAt);
}

function renderNavBadges() {
  const clubs = getAllClubs();
  if (clubs.length > 0) { el.navClubCount.textContent = clubs.length; el.navClubCount.hidden = false; }
  else el.navClubCount.hidden = true;

  const jobs = state.jobs?.jobs || state.dashboard?.jobs || [];
  const running = jobs.filter(j => j.state === "running").length;
  if (running > 0) { el.navJobsRunning.textContent = running; el.navJobsRunning.hidden = false; }
  else el.navJobsRunning.hidden = true;
}

/* ── Dashboard ────────────────────────────────────────────── */
function renderDashboard() {
  const d = state.dashboard;
  if (!d) { el.wsDashboard.innerHTML = loading("Loading..."); return; }
  const c = d.counters || {};
  const alerts = Array.isArray(d.alerts) ? d.alerts : [];
  const events = Array.isArray(d.recentEvents) ? d.recentEvents : [];
  const jobs = Array.isArray(d.jobs) ? d.jobs : [];
  const clubs = d.projectClubs || getAllClubs();
  const sources = d.projectSources || getAllSources();

  el.wsDashboard.innerHTML = `
    ${renderCompatibilityBanner(d)}
    <div class="hero-banner">
      <div>
        <span class="pill ${toneClass(d.health?.state)}">${esc(toneLabel(d.health?.state))}</span>
        <h3>${esc(d.health?.summary || "System ready.")}</h3>
        <p class="card-body">Quick overview of health, jobs, and clubs.</p>
        <div class="hero-actions">
          <button class="btn primary" type="button" data-job-action="run-full-sync" data-job-key="club-full-sync">Run Full Sync</button>
          <button class="btn outline" type="button" data-job-action="run-discovery-sync" data-job-key="club-discovery-sync">Run Discovery</button>
          <button class="btn ghost" type="button" data-nav="clubs">View Clubs</button>
          <button class="btn ghost" type="button" data-nav="jobs">View Jobs</button>
        </div>
      </div>
      <div class="g2">
        ${statCard("Tracked Maps", fmtNum(c.trackedMaps || 0))}
        ${statCard("Campaigns", fmtNum(c.campaigns || 0))}
        ${statCard("Needs Review", fmtNum(c.namingPending || 0))}
        ${statCard("Naming Unmatched", fmtNum(c.namingUnmatched || 0))}
        ${statCard("Queued Requests", fmtNum(c.queuedUpdateRequests || 0))}
      </div>
    </div>

    ${clubs.length ? `
      <div style="margin-bottom:.85rem;">
        <p class="ws-label">Clubs (${clubs.length})</p>
        <div class="g-auto" style="margin-top:.4rem;">
          ${clubs.map(cl => clubMiniCard(cl)).join("")}
        </div>
      </div>
    ` : ""}

    ${sources.length ? `
      <div style="margin-bottom:.85rem;">
        <p class="ws-label">Sources (${sources.length})</p>
        <div class="g-auto" style="margin-top:.4rem;">
          ${sources.map(src => sourceMiniCard(src)).join("")}
        </div>
      </div>
    ` : ""}

    <div class="g2">
      <div class="card">
        <div class="card-header">
          <div><p class="ws-label">Alerts</p><h3>Alerts</h3></div>
          <span class="pill ${alerts.length ? "tone-warn" : "tone-success"}">${alerts.length ? `${alerts.length} active` : "Clear"}</span>
        </div>
        <div class="alert-list" style="margin-top:.45rem;">
          ${alerts.length ? alerts.map(renderAlert).join("") : `
            <div class="alerts-ok">
              <span class="alerts-ok-dot"></span>
              <div>
                <strong>Alert system active</strong>
                <p>Monitoring ${esc(fmtNum(alertCheckCount(d)))} check(s) across auth, sync, discovery, tracker, naming, ops, and integrations. No issues detected.</p>
              </div>
            </div>
          `}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div><p class="ws-label">Recent Events</p><h3>Activity</h3></div>
          <button class="btn ghost small" type="button" data-nav="activity">View All</button>
        </div>
        <div class="tl-list" style="margin-top:.45rem;">
          ${events.length ? events.map(renderTlItem).join("") : `<p class="inline-empty">No recent events.</p>`}
        </div>
      </div>
    </div>

    <div style="margin-top:.85rem;">
      ${renderDashboardNamingPreview(d)}
    </div>

    <div style="margin-top:.85rem;">
      ${renderDashboardLocalStore(d)}
    </div>

    <div style="margin-top:.85rem;">
      <p class="ws-label">Quick Stats</p>
      <div class="g4" style="margin-top:.4rem;">
        ${statCard("Total Maps", fmtNum(c.maps || 0))}
        ${statCard("Ops Errors", fmtNum(c.opsPollErrors || 0))}
        ${statCard("Due Checks", fmtNum(c.dueSchedules || 0))}
        ${statCard("Queued Commands", fmtNum(c.queuedCommands || 0))}
        ${statCard("API 24h", fmtNum(c.apiRequests24h || 0))}
        ${statCard("API 7d", fmtNum(c.apiRequests7d || 0))}
      </div>
    </div>
  `;
}

function renderDashboardLocalStore(d) {
  const store = d?.localStore || {};
  const summary = store.summary || {};
  const job = store.job || {};
  const fallbackCount = Number(summary.fallbackSignatureCount || 0);
  const unknownChunkCount = Number(summary.parserUnknownChunkCount || 0);
  const chunk164A8Count = Number(summary.parserChunk164A8Count || 0);
  const invalidStringLengthCount = Number(summary.parserInvalidStringLengthCount || 0);
  const hasParserWarnings =
    fallbackCount > 0 ||
    unknownChunkCount > 0 ||
    chunk164A8Count > 0 ||
    invalidStringLengthCount > 0;
  return `
    <div class="card">
      <div class="card-header">
        <div><p class="ws-label">Local Map Store</p><h3>${store.initialized ? "Initialized" : "Initializing"}</h3></div>
        <span class="pill ${store.initialized ? "tone-success" : job.running ? "tone-info" : "tone-warn"}">${store.initialized ? "Ready" : job.running ? "Running" : "Needs Backfill"}</span>
      </div>
      <div class="hero-actions" style="margin-top:.55rem;">
        <button class="btn outline small" type="button" data-job-action="run-map-local-copy-backfill" data-job-key="map-local-copy-backfill">Run Full Backfill</button>
        <button class="btn ghost small" type="button" data-job-action="retry-map-local-copy-errors" data-job-key="map-local-copy-backfill">Retry Errors</button>
      </div>
      <div class="g4" style="margin-top:.6rem;">
        ${statCard("Downloaded", fmtNum(summary.downloadedCount || 0))}
        ${statCard("Missing", fmtNum(summary.missingCount || 0))}
        ${statCard("Errors", fmtNum(summary.errorCount || 0))}
        ${statCard("Signature Ready", fmtNum(summary.signatureReadyCount || 0))}
        ${statCard("Similarity Ready", fmtNum(summary.similarityReadyCount || 0))}
        ${statCard("Bytes", fmtBytes(summary.totalBytes || 0))}
      </div>
      ${hasParserWarnings ? `
        <div class="card" style="margin-top:.75rem;border-color:rgba(255,138,92,.45);">
          <div class="card-header">
            <div><p class="ws-label">Parser Health</p><h3>Fallback Signatures Detected</h3></div>
            <span class="pill tone-warn">${esc(fmtNum(fallbackCount))} fallback</span>
          </div>
          <div class="g4" style="margin-top:.5rem;">
            ${statCard("Unknown Chunk", fmtNum(unknownChunkCount))}
            ${statCard("Chunk 0x000164A8", fmtNum(chunk164A8Count))}
            ${statCard("Invalid String", fmtNum(invalidStringLengthCount))}
            ${statCard("Fallback Total", fmtNum(fallbackCount))}
          </div>
          <p class="card-body" style="margin-top:.45rem;">
            These maps were downloaded, but the GBX parser fell back to asset-token signatures. Similarity still works, but rankings can be degraded for affected maps.
          </p>
        </div>
      ` : ""}
    </div>
  `;
}

function renderCompatibilityBanner(d) {
  const compatibility = d?.compatibility;
  if (!compatibility) {
    return `
      <div class="card" style="margin-bottom:.85rem;border-color:rgba(255,138,92,.45);">
        <div class="card-header">
          <div><p class="ws-label">Compatibility</p><h3>Backend Capability Manifest Missing</h3></div>
          <span class="pill tone-warn">Warning</span>
        </div>
        <p class="card-body" style="margin-top:.45rem;">
          The frontend expects a backend compatibility manifest, but this API response did not include one.
          This usually means the static frontend was updated without restarting the altered backend.
        </p>
      </div>
    `;
  }
  if (compatibility.ok) return "";
  const notes = Array.isArray(compatibility.notes) ? compatibility.notes : [];
  return `
    <div class="card" style="margin-bottom:.85rem;border-color:rgba(255,138,92,.45);">
      <div class="card-header">
        <div><p class="ws-label">Compatibility</p><h3>Backend / DB Migration Required</h3></div>
        <span class="pill tone-warn">Action Needed</span>
      </div>
      <p class="card-body" style="margin-top:.45rem;">
        This backend is running without required schema or route support for the current admin UI.
      </p>
      <div class="tl-list" style="margin-top:.45rem;">
        ${notes.length ? notes.map((note) => `<div class="tl-item"><div class="tl-main"><strong>${esc(note)}</strong></div></div>`).join("") : `<p class="inline-empty">No detailed notes were provided.</p>`}
      </div>
    </div>
  `;
}

function isSimilarityBackfillRunning() {
  return isSimilarityBackfillEffectivelyRunning();
}

function getSimilarityBackfillButtonLabel(baseLabel = "Similarity Backfill") {
  if (!isSimilarityBackfillRunning()) return baseLabel;
  const percent = Math.max(0, Math.min(100, Number(state.similarityBackfill?.progress?.percent || 0)));
  return percent > 0 ? `Similarity ${percent}%` : "Similarity Running...";
}

function renderSimilarityBackfillButton(baseLabel = "Similarity Backfill", className = "btn outline small", { rescanAll = false } = {}) {
  const mode = rescanAll ? "rescan-all" : "incremental";
  return `<button class="${esc(className)}" type="button" data-run-naming-similarity="${esc(mode)}" data-similarity-button-label="${esc(baseLabel)}" ${isSimilarityBackfillRunning() ? "disabled" : ""}>${esc(getSimilarityBackfillButtonLabel(baseLabel))}</button>`;
}

function renderSimilarityBackfillControls({
  buttonLabel = "Run Similarity",
  buttonClass = "btn outline small",
} = {}) {
  const seenClubIds = new Set();
  const clubOptions = [["", "All Clubs"]];
  getAllClubs().forEach((club) => {
    const clubId = String(club?.clubId || "").trim();
    if (!clubId || seenClubIds.has(clubId)) return;
    seenClubIds.add(clubId);
    clubOptions.push([clubId, club?.clubName || `Club ${clubId}`]);
  });
  return `
    <label class="similarity-source-picker">
      <span>Source</span>
      <select data-naming-similarity-source>
        ${selOpts(NAMING_SIMILARITY_SOURCE_OPTIONS, state.namingSimilaritySourceKey || "")}
      </select>
    </label>
    <label class="similarity-source-picker">
      <span>Club</span>
      <select data-naming-similarity-club>
        ${selOpts(clubOptions, state.namingSimilarityClubId || "")}
      </select>
    </label>
    <label class="similarity-source-picker">
      <span>Scope</span>
      <span style="display:flex;align-items:center;gap:.45rem;padding:.65rem .9rem;border:1px solid rgba(120,180,255,.18);border-radius:999px;background:rgba(8,14,24,.65);">
        <input type="checkbox" data-naming-similarity-pending-only ${state.namingSimilarityPendingOnly ? "checked" : ""} />
        <span style="font-size:.78rem;">Pending only</span>
      </span>
    </label>
    <label class="similarity-source-picker">
      <span>Mode</span>
      <span style="display:flex;align-items:center;gap:.45rem;padding:.65rem .9rem;border:1px solid rgba(120,180,255,.18);border-radius:999px;background:rgba(8,14,24,.65);">
        <input type="checkbox" data-naming-similarity-force ${state.namingSimilarityForce ? "checked" : ""} />
        <span style="font-size:.78rem;">Force recompute</span>
      </span>
    </label>
    <button
      class="${esc(buttonClass)}"
      type="button"
      data-run-naming-similarity="selected-source"
      data-similarity-button-label="${esc(buttonLabel)}"
      ${isSimilarityBackfillRunning() ? "disabled" : ""}
    >${esc(getSimilarityBackfillButtonLabel(buttonLabel))}</button>
    ${isSimilarityBackfillRunning()
      ? `<button class="btn outline small" type="button" data-cancel-naming-similarity>Cancel</button>`
      : ""}
  `;
}

function renderSimilarityBackfillStatus({ compact = false } = {}) {
  const status = state.similarityBackfill;
  if (!status) return "";

  const progress = status.progress || {};
  const progressState = String(progress.status || "").trim().toLowerCase();
  const progressStage = String(progress.stage || "").trim().toLowerCase();
  const canceled = progressStage === "canceled" || progressState === "canceled";
  const counters = progress.counters || {};
  const summary = status.lastSummary || {};
  const emptySelection = Boolean(progress.emptySelection || summary.emptySelection);
  const total = Number(
    counters.total !== undefined
      ? counters.total
      : emptySelection
        ? 0
        : summary.selectedMaps !== undefined
          ? summary.selectedMaps
          : summary.processed || 0
  );
  const processed = Number(counters.processed !== undefined ? counters.processed : summary.processed || 0);
  const resolved = Number(counters.resolved !== undefined ? counters.resolved : summary.resolved || 0);
  const unresolved = Number(counters.unresolved !== undefined ? counters.unresolved : summary.unresolved || 0);
  const changedCandidates = Number(
    counters.changedCandidates !== undefined ? counters.changedCandidates : summary.changedCandidates || 0
  );
  const refreshedSimilarityRecords = Number(
    counters.refreshedSimilarityRecords !== undefined
      ? counters.refreshedSimilarityRecords
      : summary.refreshedSimilarityRecords || 0
  );
  const upgradedLegacySimilarityRecords = Number(
    counters.upgradedLegacySimilarityRecords !== undefined
      ? counters.upgradedLegacySimilarityRecords
      : summary.upgradedLegacySimilarityRecords || 0
  );
  const similarityRowsWritten = Number(
    counters.similarityRowsWritten !== undefined
      ? counters.similarityRowsWritten
      : summary.similarityRowsWritten || 0
  );
  const candidateRowsWritten = Number(
    counters.candidateRowsWritten !== undefined
      ? counters.candidateRowsWritten
      : summary.candidateRowsWritten || 0
  );
  const autoApproved = Number(
    counters.autoApproved !== undefined
      ? counters.autoApproved
      : summary.autoApproved || 0
  );
  const targetSignaturesReady = Number(counters.targetSignaturesReady || 0);
  const targetSignaturesTotal = Number(counters.targetSignaturesTotal || 0);
  const referenceSignaturesReady = Number(counters.referenceSignaturesReady || 0);
  const referenceSignaturesTotal = Number(counters.referenceSignaturesTotal || 0);
  const percent = Math.max(
    0,
    Math.min(
      100,
      Number(
        emptySelection
          ? 0
          : total > 0
          ? Math.round((processed / total) * 100)
          : progress.percent !== undefined
            ? progress.percent
            : status.lastSummary
              ? 100
              : 0
      ) || 0
    )
  );
  const rescanAll = Boolean(progress.rescanAll || summary.rescanAll);
  const active = isSimilarityBackfillEffectivelyRunning(status);
  const toneClassName = active
    ? "tone-info"
    : canceled
      ? "tone-muted"
    : status.lastError
      ? "tone-error"
      : emptySelection
        ? "tone-muted"
      : status.lastSummary
        ? "tone-success"
        : "tone-muted";
  const title = active
    ? rescanAll
      ? "Similarity Full Rescan Running"
      : "Similarity Backfill Running"
    : canceled
      ? "Similarity Backfill Canceled"
    : status.lastError
      ? "Similarity Backfill Failed"
      : emptySelection
        ? "No Matching Maps"
      : status.lastSummary
        ? rescanAll
          ? "Similarity Full Rescan Complete"
          : "Similarity Backfill Complete"
        : "Similarity Backfill";
  const message =
    (emptySelection ? "No maps matched the current filter." : "") ||
    String(progress.message || "").trim() ||
    String(status.lastError || "").trim() ||
    (canceled ? "Canceled." : "") ||
    (status.lastSummary
      ? `Processed ${fmtNum(summary.processed || 0)} maps in ${fmtDuration(status.lastDurationMs)}.`
      : "");
  const lastTouchedAt = progress.updatedAt || status.lastFinishedAt || status.lastStartedAt || null;
  const elapsedMs =
    status.running && status.lastStartedAt
      ? Math.max(0, Date.now() - Date.parse(status.lastStartedAt))
      : 0;
  const missingFamilies = Array.isArray(summary.missingReferenceFamilies) ? summary.missingReferenceFamilies : [];
  const targetClubId = Number(progress.targetClubId || summary.targetClubId || 0) || null;
  const recentMaps = Array.isArray(progress.recentMaps) && progress.recentMaps.length
    ? progress.recentMaps
    : Array.isArray(summary.recentMaps)
      ? summary.recentMaps
      : [];
  const diagnosticsMarkup = renderSimilarityDiagnostics({ compact });
  const recentMapCards = recentMaps
    .map((entry) => {
      const numbers = Array.isArray(entry?.mapNumbers) && entry.mapNumbers.length
        ? entry.mapNumbers.join(", ")
        : "unresolved";
      const refParts = [
        entry?.referenceCampaignName || "",
        entry?.primaryReferenceSlot != null ? `slot ${entry.primaryReferenceSlot}` : "",
      ].filter(Boolean);
      const confidence = Number.isFinite(Number(entry?.confidence))
        ? `conf ${Number(entry.confidence).toFixed(3)}`
        : "";
      const note = [
        entry?.campaignName || "",
        entry?.slot != null ? `slot ${entry.slot}` : "",
        refParts.length ? `ref ${refParts.join(" / ")}` : "",
        confidence,
        entry?.manualSelection ? "manual selection" : "",
      ].filter(Boolean).join(" | ");
      return `
        <div class="stat-card">
          <div class="label">${escN(entry?.mapName || entry?.mapUid || "Map")}</div>
          <div class="value">${esc(numbers)}</div>
          <div class="note">${escN(note || entry?.mapUid || "-")}</div>
        </div>
      `;
    })
    .join("");

  if (!active && !status.lastError && !status.lastSummary) return "";

  return `
    <div class="similarity-progress ${compact ? "similarity-progress-compact" : ""}">
      <div class="similarity-progress-top">
        <div>
          <strong>${esc(title)}</strong>
          <span>${esc(message || "Preparing similarity backfill...")}</span>
        </div>
        <span class="pill ${toneClassName}">${active ? `${esc(String(percent))}%` : status.lastError ? "Error" : canceled ? "Canceled" : emptySelection ? "No matches" : "Complete"}</span>
      </div>
      <div class="similarity-progress-track" aria-hidden="true">
        <div class="similarity-progress-fill ${status.lastError ? "is-error" : ""}" style="width:${percent}%"></div>
      </div>
      <div class="similarity-progress-meta">
        <span>${esc(`${fmtNum(processed)} / ${fmtNum(total || processed)} processed`)}</span>
        <span>${esc(`${fmtNum(resolved)} resolved`)}</span>
        <span>${esc(`${fmtNum(refreshedSimilarityRecords)} refreshed`)}</span>
        <span>${esc(`${fmtNum(upgradedLegacySimilarityRecords)} upgraded`)}</span>
        <span>${esc(`${fmtNum(changedCandidates)} changed`)}</span>
        ${similarityRowsWritten ? `<span>${esc(`${fmtNum(similarityRowsWritten)} similarity rows`)}</span>` : ""}
        ${candidateRowsWritten ? `<span>${esc(`${fmtNum(candidateRowsWritten)} candidate rows`)}</span>` : ""}
        ${autoApproved ? `<span>${esc(`${fmtNum(autoApproved)} auto-approved`)}</span>` : ""}
        ${targetSignaturesTotal ? `<span>${esc(`target signatures ${fmtNum(targetSignaturesReady)} / ${fmtNum(targetSignaturesTotal)}`)}</span>` : ""}
        ${referenceSignaturesTotal ? `<span>${esc(`reference signatures ${fmtNum(referenceSignaturesReady)} / ${fmtNum(referenceSignaturesTotal)}`)}</span>` : ""}
        ${rescanAll ? `<span>${esc("all-map rescan")}</span>` : ""}
        ${targetClubId ? `<span>${esc(`club ${targetClubId}`)}</span>` : ""}
        ${elapsedMs > 0 ? `<span>${esc(`Running ${fmtDuration(elapsedMs)}`)}</span>` : ""}
        ${lastTouchedAt ? `<span>${esc(active ? `Updated ${fmtTimeAgo(lastTouchedAt)}` : `Finished ${fmtDateTime(lastTouchedAt)}`)}</span>` : ""}
        ${missingFamilies.length ? `<span>${esc(`${fmtNum(missingFamilies.length)} missing families`)}</span>` : ""}
      </div>
      ${active && progress.currentMapName ? `<p class="similarity-progress-current">Current: ${escN(progress.currentMapName)}${progress.currentMapUid ? ` (${esc(progress.currentMapUid)})` : ""}</p>` : ""}
      ${diagnosticsMarkup}
      ${recentMapCards ? `<div class="g-auto" style="margin-top:.55rem;">${recentMapCards}</div>` : ""}
    </div>
  `;
}

function renderDashboardNamingPreview(d) {
  const naming = d?.naming || {};
  const summary = naming.summary || {};
  const unmatched = Array.isArray(naming.unmatchedPreview) ? naming.unmatchedPreview : [];
  return `
    <div class="card">
      <div class="card-header">
        <div><p class="ws-label">Naming Queue</p><h3>Unmatched Preview</h3></div>
        <span class="pill ${Number(summary.unmatched || 0) > 0 ? "tone-warn" : "tone-success"}">${Number(summary.unmatched || 0) > 0 ? `${fmtNum(summary.unmatched || 0)} unmatched` : "Clear"}</span>
      </div>
      <div class="hero-actions" style="margin-top:.55rem;">
        ${renderSimilarityBackfillControls({ buttonLabel: "Run Similarity Rescan", buttonClass: "btn danger small" })}
        <button class="btn ghost small" type="button" data-open-unmatched-naming>Open Naming Queue</button>
      </div>
      <div data-similarity-backfill-status-compact>${renderSimilarityBackfillStatus({ compact: true })}</div>
      <div class="tl-list" style="margin-top:.6rem;">
        ${unmatched.length ? unmatched.map((row) => `
          <div class="tl-item">
            <div class="tl-main">
              <strong>${escN(row.finalName || row.proposedName || row.sanitizedName || row.originalName || row.mapUid || "-")}</strong>
              <span>${escN(row.campaign || "Unassigned")} &middot; slot ${esc(String(row.slot || "-"))} &middot; ${row.requiresRegex ? "needs regex" : "needs similarity/manual"}</span>
            </div>
            <div class="tl-side">
              <span class="pill ${row.automationState === "matched" ? "tone-success" : "tone-warn"}">${esc(row.automationState || "unmatched")}</span>
            </div>
          </div>
        `).join("") : `<p class="inline-empty">No unmatched naming candidates.</p>`}
      </div>
    </div>
  `;
}

/* ── Clubs ────────────────────────────────────────────────── */
function renderClubs() {
  const p = state.clubs;
  if (!p) { el.wsClubs.innerHTML = loading("Loading clubs..."); return; }
  const clubs = Array.isArray(p.projectClubs) ? p.projectClubs : [];

  el.wsClubs.innerHTML = `
    <p class="card-body" style="margin-bottom:.85rem;">
      All clubs tracked inside the Altered project. Each club syncs campaigns and maps independently.
    </p>
    ${clubs.length ? `
      <div class="g-auto">
        ${clubs.map(renderClubCard).join("")}
      </div>
    ` : emptyState("No clubs configured", "Add a club through the Settings panel to begin tracking.")}
  `;
}

function renderClubCard(club) {
  const status = club.enabled === false ? "paused" : club.lastError ? "error" : club.latestRun ? "success" : "info";
  const lastSync = club.lastSyncedAt || club.latestRun?.finishedAt || club.latestRun?.startedAt || null;
  return `
    <div class="club-card">
      <div class="club-top">
        <div>
          <h3>${escN(club.clubName || `Club ${club.clubId || "-"}`)}</h3>
          <span class="club-id">ID: ${esc(String(club.clubId || "-"))}${club.primary ? " &middot; Primary" : ""}${club.liveMonitorClub ? " &middot; Monitor" : ""}</span>
        </div>
        <span class="pill ${toneClass(status)}">${esc(toneLabel(status))}</span>
      </div>
      <div class="club-stats">
        <span>${esc(fmtNum(club.campaignCount || 0))} campaigns</span>
        <span>${esc(fmtNum(club.mapCount || 0))} maps</span>
        <span>${esc(fmtNum(club.trackedCount || 0))} tracked</span>
      </div>
      <div class="card-meta">
        <span>${esc(club.hookKey || "hook")}</span>
        <span>${esc(club.sourceLabel || "-")}</span>
        <span>${esc(fmtDateTime(lastSync))}</span>
      </div>
      ${club.lastError ? `<p style="font-size:.8rem;color:var(--a-err);margin-top:.2rem;">${esc(club.lastError)}</p>` : ""}
      <div class="club-actions">
        <button class="btn primary small" type="button" data-club-action="sync" data-club-id="${esc(String(club.clubId || 0))}" data-hook-key="${esc(club.hookKey || "")}">Sync</button>
        <button class="btn outline small" type="button" data-club-action="monitor" data-club-id="${esc(String(club.clubId || 0))}">Set as Monitor</button>
        <button class="btn ghost small" type="button" data-club-action="manage" data-club-id="${esc(String(club.clubId || 0))}" data-hook-key="${esc(club.hookKey || "")}">Edit</button>
      </div>
    </div>
  `;
}

function clubMiniCard(club) {
  const status = club.enabled === false ? "paused" : club.lastError ? "error" : club.latestRun ? "success" : "info";
  return `
    <div class="club-card" style="padding:.65rem;">
      <div class="club-top">
        <div>
          <h3 style="font-size:.92rem;">${escN(club.clubName || `Club ${club.clubId || "-"}`)}</h3>
          <span class="club-id">ID: ${esc(String(club.clubId || "-"))}</span>
        </div>
        <span class="pill ${toneClass(status)}" style="font-size:.62rem;">${esc(toneLabel(status))}</span>
      </div>
      <div class="club-stats" style="font-size:.75rem;">
        <span>${esc(fmtNum(club.campaignCount || 0))} campaigns</span>
        <span>${esc(fmtNum(club.mapCount || 0))} maps</span>
      </div>
      <div class="club-actions" style="margin-top:.15rem;">
        <button class="btn primary small" type="button" data-club-action="sync" data-club-id="${esc(String(club.clubId || 0))}" data-hook-key="${esc(club.hookKey || "")}">Sync</button>
        <button class="btn ghost small" type="button" data-club-action="manage" data-club-id="${esc(String(club.clubId || 0))}" data-hook-key="${esc(club.hookKey || "")}">Edit</button>
      </div>
    </div>
  `;
}

function renderSourceCard(source) {
  const status = source.enabled === false ? "paused" : source.lastError ? "error" : source.lastSyncedAt ? "success" : "info";
  const summary = source.summary || {};
  return `
    <div class="club-card">
      <div class="club-top">
        <div>
          <h3>${escN(source.displayName || source.sourceKey || "Source")}</h3>
          <span class="club-id">Key: ${esc(String(source.sourceKey || "-"))}</span>
        </div>
        <span class="pill ${toneClass(status)}">${esc(toneLabel(status))}</span>
      </div>
      <div class="club-stats">
        <span>${esc(fmtNum(source.campaignCount || 0))} campaigns</span>
        <span>${esc(fmtNum(source.mapCount || 0))} maps</span>
        <span>${esc(fmtNum(source.trackedCount || 0))} tracked</span>
      </div>
      <div class="club-stats" style="font-size:.75rem;">
        <span>${esc(source.sourceLabel || "-")}</span>
        ${source.lastSyncedAt ? `<span>${esc(fmtDateTime(source.lastSyncedAt))}</span>` : ""}
        ${source.nextScheduledSyncAt ? `<span>Next ${esc(fmtDateTime(source.nextScheduledSyncAt))}</span>` : ""}
      </div>
      ${source.lastError ? `<p style="font-size:.8rem;color:var(--a-err);margin-top:.2rem;">${esc(source.lastError)}</p>` : ""}
      <div class="club-actions">
        <button class="btn primary small" type="button" data-source-action="sync" data-source-key="${esc(String(source.sourceKey || ""))}">Sync</button>
        ${summary?.latestWeek ? `<span class="pill tone-info">Week ${esc(String(summary.latestWeek))}</span>` : ""}
      </div>
    </div>
  `;
}

function sourceMiniCard(source) {
  const status = source.enabled === false ? "paused" : source.lastError ? "error" : source.lastSyncedAt ? "success" : "info";
  return `
    <div class="club-card" style="padding:.65rem;">
      <div class="club-top">
        <div>
          <h3 style="font-size:.92rem;">${escN(source.displayName || source.sourceKey || "Source")}</h3>
          <span class="club-id">Key: ${esc(String(source.sourceKey || "-"))}</span>
        </div>
        <span class="pill ${toneClass(status)}">${esc(toneLabel(status))}</span>
      </div>
      <div class="club-stats" style="font-size:.75rem;">
        <span>${esc(fmtNum(source.campaignCount || 0))} campaigns</span>
        <span>${esc(fmtNum(source.mapCount || 0))} maps</span>
        ${source.nextScheduledSyncAt ? `<span>${esc(fmtDateTime(source.nextScheduledSyncAt))}</span>` : ""}
      </div>
      <div class="club-actions" style="margin-top:.15rem;">
        <button class="btn primary small" type="button" data-source-action="sync" data-source-key="${esc(String(source.sourceKey || ""))}">Sync</button>
      </div>
    </div>
  `;
}

/* ── Maps ─────────────────────────────────────────────────── */
function renderMaps() {
  const p = state.maps.data;
  if (!p) { el.wsMaps.innerHTML = loading("Loading maps..."); return; }
  const v = state.maps.view;
  const f = state.maps.filters[v] || {};
  const rows = Array.isArray(p.rows) ? p.rows : [];

  el.wsMaps.innerHTML = `
    <nav class="subtabs">
      ${subtab("inventory", "Inventory", v)}
      ${subtab("campaigns", "Campaigns", v)}
      ${subtab("naming", "Naming", v)}
      ${subtab("requests", "Requests", v)}
    </nav>
    ${mapsToolbar(v, p, f)}
    ${v === "naming" ? `<div data-similarity-backfill-status-full>${renderSimilarityBackfillStatus()}</div>` : ""}
    ${mapsTable(v, p, rows)}
    ${pagination({
      page: p.page || 1, pageCount: p.pageCount || 1,
      total: p.total || 0, unfilteredTotal: p.unfilteredTotal,
      hasMore: Boolean(p.hasMore),
      prevAction: "maps-prev-page", nextAction: "maps-next-page",
    })}
  `;
}

function mapsToolbar(v, p, f) {
  if (v === "inventory") {
    const camps = Array.isArray(p.filterOptions?.campaigns) ? p.filterOptions.campaigns : [];
    return filterBar("maps-filters", `
      <input type="hidden" name="view" value="inventory" />
      <div class="filter-fields">
        <label class="field"><span>Search</span><input name="q" value="${esc(f.q || "")}" placeholder="Name or UID" /></label>
        <label class="field"><span>Campaign</span>
          <select name="campaign"><option value="">All</option>${camps.map(c => `<option value="${esc(c.name)}" ${c.name === f.campaign ? "selected" : ""}>${escN(c.name)}</option>`).join("")}</select>
        </label>
        <label class="field"><span>Tracked</span><select name="tracked">${selOpts([["","All"],["true","Tracked"],["false","Not tracked"]], f.tracked)}</select></label>
        <label class="field"><span>Status</span><select name="status">${selOpts([["","All"],["live","Live"],["paused","Paused"],["archived","Archived"]], f.status)}</select></label>
        <label class="field"><span>Freshness</span><select name="staleState">${selOpts([["","All"],["fresh","Fresh"],["stale","Stale"]], f.staleState)}</select></label>
      </div>
    `, `<button class="btn primary small" type="submit">Apply</button><button class="btn ghost small" type="button" data-reset-maps>Reset</button>`);
  }
  if (v === "naming") {
    return `
      ${filterBar("maps-filters", `
        <input type="hidden" name="view" value="naming" />
        <div class="filter-fields" style="grid-template-columns:repeat(4,minmax(0,1fr));">
          <label class="field"><span>Search</span><input name="q" value="${esc(f.q || "")}" placeholder="Name or UID" /></label>
          <label class="field"><span>Automation</span><select name="automationState">${selOpts([["","All"],["matched","Matched"],["unmatched","Unmatched"]], f.automationState)}</select></label>
          <label class="field"><span>Review</span><select name="reviewState">${selOpts([["","All"],["pending","Pending"],["approved","Approved"],["ignored","Ignored"]], f.reviewState)}</select></label>
          <label class="field"><span>Requires Regex</span><select name="requiresRegex">${selOpts([["","All"],["true","Yes"],["false","No"]], f.requiresRegex)}</select></label>
        </div>
      `, `<button class="btn primary small" type="submit">Apply</button><button class="btn ghost small" type="button" data-reset-maps>Reset</button><button class="btn outline small" type="button" data-run-naming-process>Rebuild</button>`)}
      <div class="naming-similarity-toolbar">${renderSimilarityBackfillControls({ buttonLabel: "Run Similarity Rescan", buttonClass: "btn danger small" })}</div>
    `;
  }
  if (v === "requests") {
    return filterBar("maps-filters", `
      <input type="hidden" name="view" value="requests" />
      <div class="filter-fields" style="grid-template-columns:repeat(2,minmax(0,1fr));">
        <label class="field"><span>Search</span><input name="q" value="${esc(f.q || "")}" placeholder="Name or UID" /></label>
        <label class="field"><span>Status</span><select name="status">${selOpts([["","All"],["queued","Queued"],["processing","Processing"],["done","Done"],["rejected","Rejected"]], f.status)}</select></label>
      </div>
    `, `<button class="btn primary small" type="submit">Apply</button><button class="btn ghost small" type="button" data-reset-maps>Reset</button>`);
  }
  return "";
}

function mapsTable(v, p, rows) {
  if (v === "inventory") {
    return tableCard("Inventory", `${fmtNum(p.total || 0)} maps`, `
      <table class="data-table">
        <thead><tr><th>Map</th><th>Campaign</th><th>Slot</th><th>Tracked</th><th>Freshness</th><th>Checked</th><th>Last WR</th><th></th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr>
            <td><div class="cell-name"><strong>${escN(r.mapName)}</strong></div><div class="cell-uid">${esc(r.mapUid)}</div></td>
            <td>${escN(r.campaignName || "Unassigned")}</td>
            <td>${esc(String(r.slot || "-"))}</td>
            <td><span class="pill ${r.tracked ? "tone-success" : "tone-muted"}">${r.tracked ? "Tracked" : "Idle"}</span></td>
            <td><span class="pill ${toneClass(r.staleState)}">${esc(toneLabel(r.staleState))}</span></td>
            <td>${esc(fmtDateTime(r.lastCheckedAt))}</td>
            <td>${esc(fmtDateTime(r.lastWrChangeAt))}</td>
            <td><div class="cell-actions">
              <button class="btn outline small" type="button" data-open-map-uid="${esc(r.mapUid)}">Open</button>
              <button class="btn ghost small" type="button" data-map-command="${r.tracked ? "pause" : "track"}" data-map-uid="${esc(r.mapUid)}">${r.tracked ? "Pause" : "Track"}</button>
            </div></td>
          </tr>`).join("") || `<tr><td colspan="8"><p class="inline-empty">No maps match the current filters.</p></td></tr>`}
        </tbody>
      </table>`);
  }
  if (v === "campaigns") {
    return tableCard("Campaigns", `${fmtNum(p.total || 0)} campaigns`, `
      <table class="data-table">
        <thead><tr><th>Campaign</th><th>Season</th><th>Maps</th><th></th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr>
            <td><strong>${escN(r.name || "-")}</strong></td>
            <td>${escN(r.season || "-")}</td>
            <td>${esc(fmtNum(r.map_count || 0))}</td>
            <td><button class="btn outline small" type="button" data-open-campaign="${esc(r.name || "")}">View Maps</button></td>
          </tr>`).join("") || `<tr><td colspan="4"><p class="inline-empty">No campaigns.</p></td></tr>`}
        </tbody>
      </table>`);
  }
  if (v === "naming") {
    const needsReview = Number(p.summary?.pendingManualReview || p.summary?.pending || 0);
    const pendingMatched = Number(p.summary?.pendingMatched || 0);
    const unfilteredTotal = Number(p.unfilteredTotal || p.summary?.total || p.total || 0);
    const isFiltered = p.total !== unfilteredTotal;
    const subtitle = isFiltered
      ? `Showing ${fmtNum(p.total || 0)} of ${fmtNum(unfilteredTotal)} &middot; ${fmtNum(needsReview)} need review`
      : `${fmtNum(p.total || 0)} candidates &middot; ${fmtNum(needsReview)} need review`;
    return tableCard("Naming Review", subtitle, `
      <table class="data-table">
        <thead><tr><th>Flags</th><th>Map Name</th><th>Campaign</th><th>Similarity</th><th>Auto</th><th>Review</th><th>Regex</th><th></th></tr></thead>
        <tbody>
          ${rows.map(r => {
            return `<tr>
            <td>${renderNamingFlags(r)}</td>
            <td><div class="cell-name"><strong>${escN(r.finalName || r.proposedName || r.sanitizedName || r.originalName || r.mapUid)}</strong></div><div class="cell-subline">${escN(r.originalName || "-")}</div></td>
            <td><div class="cell-name"><strong>${escN(r.campaign || "Unassigned")}</strong></div><div class="cell-subline">slot ${esc(String(r.slot || "-"))}</div></td>
            <td>${renderNamingSimilarityPreview(r)}</td>
            <td><span class="pill ${r.automationState === "matched" ? "tone-success" : "tone-warn"}">${esc(r.automationState || "unknown")}</span></td>
            <td><span class="pill ${toneClass(r.reviewState)}">${esc(r.reviewState || "pending")}</span></td>
            <td><span class="pill ${r.requiresRegex ? "tone-warn" : "tone-success"}">${r.requiresRegex ? "Yes" : "No"}</span></td>
            <td><div class="cell-actions">
              <button class="btn outline small" type="button" data-candidate-detail="${esc(r.mapUid)}">Details</button>
              <button class="btn primary small" type="button" data-candidate-review="approved" data-map-uid="${esc(r.mapUid)}">Approve</button>
              <button class="btn ghost small" type="button" data-candidate-review="ignored" data-map-uid="${esc(r.mapUid)}">Ignore</button>
              <button class="btn outline small" type="button" data-candidate-manual="${esc(r.mapUid)}">Manual</button>
            </div></td>
          </tr>`;
          }).join("") || `<tr><td colspan="8"><p class="inline-empty">No naming candidates.</p></td></tr>`}
        </tbody>
      </table>
      <div style="margin-top:.45rem;font-size:.78rem;color:var(--a-muted);">
        ${esc(`${fmtNum(needsReview)} need manual review`)}
        ${pendingMatched > 0 ? ` &middot; ${esc(`${fmtNum(pendingMatched)} matched but still pending`)}` : ""}
      </div>`);
  }
  return tableCard("Update Requests", `${fmtNum(p.total || 0)} requests`, `
    <table class="data-table">
      <thead><tr><th>Map</th><th>Status</th><th>Reason</th><th>Requested</th><th></th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td><div class="cell-name"><strong>${escN(r.name || r.mapName || r.uid || r.mapUid || "-")}</strong></div><div class="cell-uid">${esc(r.uid || r.mapUid || "-")}</div></td>
          <td><span class="pill ${toneClass(r.status)}">${esc(r.status || "queued")}</span></td>
          <td>${esc(r.reason || "-")}</td>
          <td>${esc(fmtDateTime(r.createdAt || r.requestedAt))}</td>
          <td><div class="cell-actions">
            <button class="btn outline small" type="button" data-request-status="processing" data-request-id="${esc(String(r.requestId || r.id || 0))}">Processing</button>
            <button class="btn primary small" type="button" data-request-status="done" data-request-id="${esc(String(r.requestId || r.id || 0))}">Done</button>
            <button class="btn danger small" type="button" data-request-status="rejected" data-request-id="${esc(String(r.requestId || r.id || 0))}">Reject</button>
          </div></td>
        </tr>`).join("") || `<tr><td colspan="5"><p class="inline-empty">No update requests.</p></td></tr>`}
      </tbody>
    </table>`);
}

/* ── Jobs ─────────────────────────────────────────────────── */
function renderJobs() {
  const p = state.jobs;
  if (!p) { el.wsJobs.innerHTML = loading("Loading jobs..."); return; }
  const jobs = Array.isArray(p.jobs) ? p.jobs : [];

  el.wsJobs.innerHTML = `
    <p class="card-body" style="margin-bottom:.85rem;">
      All sync jobs that keep clubs, maps, trackers, and display names in sync.
    </p>
    <div class="g2">
      ${jobs.map(renderJobCard).join("") || emptyState("No jobs", "No sync jobs available yet.")}
    </div>
  `;
}

function renderJobCard(job) {
  const actions = Array.isArray(job.actions) ? job.actions : [];
  return `
    <div class="job-card">
      <div class="job-top">
        <div>
          <span class="job-key">${esc(job.jobKey || "job")}</span>
          <h3>${esc(job.label || "Unnamed Job")}</h3>
        </div>
        <span class="pill ${toneClass(job.state)}">${esc(toneLabel(job.state))}</span>
      </div>
      <p class="job-summary">${esc(job.summaryLine || "No summary.")}</p>
      ${job.errorLine ? `<p class="job-error">${esc(job.errorLine)}</p>` : ""}
      <div class="job-stats">
        ${jobStat("Last Success", fmtDateTime(job.lastSuccessAt || job.lastFinishedAt))}
        ${jobStat("Next Run", fmtDateTime(job.nextRunAt))}
        ${jobStat("Duration", fmtDuration(job.durationMs))}
      </div>
      <div class="job-extra">
        ${jobExtra("Configured", job.configured ? "Yes" : "No")}
        ${jobExtra("Enabled", job.enabled ? "Yes" : "No")}
        ${jobExtra("Last Failure", fmtDateTime(job.lastFailureAt))}
        ${jobExtra("Last Started", fmtDateTime(job.lastStartedAt))}
      </div>
      <div class="job-actions">
        ${actions.map(a => `<button class="${btnClass(a.tone)} small" type="button" data-job-action="${esc(a.key)}" data-job-key="${esc(job.jobKey || "")}">${esc(a.label)}</button>`).join("")}
      </div>
    </div>
  `;
}

/* ── Activity ─────────────────────────────────────────────── */
function renderActivity() {
  const p = state.activity.data;
  if (!p) { el.wsActivity.innerHTML = loading("Loading activity..."); return; }
  const events = Array.isArray(p.events) ? p.events : [];
  const f = state.activity.filters;

  el.wsActivity.innerHTML = `
    ${filterBar("activity-filters", `
      <div class="filter-fields" style="grid-template-columns:repeat(4,minmax(0,1fr));">
        <label class="field"><span>Kind</span><select name="kind">${selOpts([["all","All"],["wr-change","WR Changes"],["error","Errors"],["poll-run","Poll Runs"],["scheduler","Scheduler"],["job","Jobs"]], f.kind)}</select></label>
        <label class="field"><span>Job</span><select name="jobKey">${selOpts([["","All Jobs"],["club-full-sync","Club Full Sync"],["club-discovery-sync","Discovery Sync"],["tracker-run","Tracker Push"],["displayname-sync","Display Name"],["ops-scheduler","Ops Scheduler"]], f.jobKey)}</select></label>
        <label class="field"><span>Map UID</span><input name="mapUid" value="${esc(f.mapUid || "")}" placeholder="Exact UID" /></label>
        <label class="field"><span>Batch Size</span><input name="limit" type="number" min="10" max="100" value="${esc(String(state.activity.limit || 40))}" /></label>
      </div>
    `, `<button class="btn primary small" type="submit">Apply</button><button class="btn ghost small" type="button" data-reset-activity>Reset</button>`)}

    <div class="card">
      <div class="card-header">
        <div><p class="ws-label">Feed</p><h3>${esc(fmtNum(p.total || 0))} events</h3></div>
        <span class="pill tone-info">Cursor ${esc(String(p.cursor || 0))}</span>
      </div>
      <div class="g1" style="margin-top:.5rem;">
        ${events.length ? events.map(renderTlItem).join("") : `<p class="inline-empty">No events matched.</p>`}
      </div>
      <div class="pagination">
        <span class="page-info">${esc(String(events.length))} event(s) from cursor ${esc(String(p.cursor || 0))}</span>
        <div class="page-btns">
          <button class="btn ghost small" type="button" data-activity-page="prev" ${p.cursor > 0 ? "" : "disabled"}>Newer</button>
          <button class="btn outline small" type="button" data-activity-page="next" ${p.hasMore ? "" : "disabled"}>Older</button>
        </div>
      </div>
    </div>
  `;
}

/* ── Settings ─────────────────────────────────────────────── */
function renderSettings() {
  const d = state.settings;
  if (!d) { el.wsSettings.innerHTML = loading("Loading settings..."); return; }
  const mon = d.liveMonitor || {};
  const hook = d.hook || {};
  const clubs = Array.isArray(d.projectClubs) ? d.projectClubs : [];
  const sources = Array.isArray(d.projectSources) ? d.projectSources : [];
  const mapper = d.mapperNameSync || {};
  const sched = d.ops?.scheduler || {};
  const bot = d.ops?.bot || {};
  const publicApi = d.publicApi || {};
  const apiTotals = publicApi.totals || {};

  el.wsSettings.innerHTML = `
    ${clubs.length ? `
      <div style="margin-bottom:.85rem;">
        <p class="ws-label">Project Clubs (${clubs.length})</p>
        <div class="g-auto" style="margin-top:.4rem;">${clubs.map(renderClubCard).join("")}</div>
      </div>
    ` : ""}

    ${sources.length ? `
      <div style="margin-bottom:.85rem;">
        <p class="ws-label">Project Sources (${sources.length})</p>
        <div class="g-auto" style="margin-top:.4rem;">${sources.map(renderSourceCard).join("")}</div>
      </div>
    ` : ""}

    <div class="g1">
      ${configSection("hook-config", "Club Source / Hook", true, `
        <form data-settings-form="hook" class="config-form">
          ${field("Club ID", "clubId", "number", hook.clubId || mon.clubId || 24231, { min: 1 })}
          ${field("Club Name", "clubName", "text", hook.clubName || "Altered")}
          ${field("Source Label", "sourceLabel", "text", hook.sourceLabel || "altered-club")}
          ${checkField("Enabled", "enabled", hook.enabled)}
          ${checkField("Auto-track New Maps", "autoTrackNewMaps", hook.autoTrackNewMaps)}
          <div class="form-footer"><button class="btn primary" type="submit">Save Hook Config</button></div>
        </form>
      `)}

      ${configSection("monitor-config", "Club Monitor Schedule", false, `
        <form data-settings-form="monitor" class="config-form">
          <label class="field"><span>Schedule Mode</span><select name="scheduleMode">${selOpts([["interval","Interval"],["daily","Daily"]], mon.scheduleMode || "interval")}</select></label>
          ${field("Interval Seconds", "intervalSeconds", "number", mon.intervalSeconds || 1800, { min: 60 })}
          ${field("Daily Hour UTC", "dailyHourUtc", "number", mon.dailyHourUtc || 3, { min: 0, max: 23 })}
          ${field("Daily Minute UTC", "dailyMinuteUtc", "number", mon.dailyMinuteUtc || 0, { min: 0, max: 59 })}
          ${field("Activity Page Size", "activityPageSize", "number", mon.activityPageSize || 250, { min: 1, max: 250 })}
          ${field("Tracker Chunk Size", "trackerChunkSize", "number", mon.trackerChunkSize || 350, { min: 25, max: 2000 })}
          ${field("Discovery Interval Sec", "discoveryIntervalSeconds", "number", mon.discoveryIntervalSeconds || 3600, { min: 60 })}
          ${field("Discovery Campaign Limit", "discoveryCampaignLimit", "number", mon.discoveryCampaignLimit || 25, { min: 1 })}
          ${field("Discovery Page Size", "discoveryActivityPageSize", "number", mon.discoveryActivityPageSize || 100, { min: 1, max: 250 })}
          ${checkField("Monitor Enabled", "enabled", mon.enabled)}
          ${checkField("Discovery Enabled", "discoveryEnabled", mon.discoveryEnabled)}
          ${checkField("Active Only", "activeOnly", mon.activeOnly)}
          ${checkField("Fetch Map Details", "fetchMapDetails", mon.fetchMapDetails)}
          <div class="form-footer"><button class="btn primary" type="submit">Save Monitor Config</button></div>
        </form>
      `)}

      ${configSection("displayname-config", "Display Name Sync", false, `
        <form data-settings-form="displayname" class="config-form">
          ${checkField("Enabled", "enabled", mapper.enabled)}
          ${field("Bootstrap Interval Sec", "bootstrapIntervalSeconds", "number", mapper.bootstrapIntervalSeconds || 60, { min: 1 })}
          ${field("Maintenance Interval Sec", "maintenanceIntervalSeconds", "number", mapper.maintenanceIntervalSeconds || 60, { min: 1 })}
          ${field("Priority Interval Sec", "priorityIntervalSeconds", "number", mapper.priorityIntervalSeconds || 60, { min: 1 })}
          ${field("Batch Size", "batchSize", "number", mapper.batchSize || 50, { min: 1 })}
          ${field("Priority Batch Size", "priorityBatchSize", "number", mapper.priorityBatchSize || 25, { min: 1 })}
          ${field("Priority Top Limit", "priorityTopLimit", "number", mapper.priorityTopLimit || 250, { min: 1 })}
          ${field("Priority Refresh Sec", "priorityRefreshSeconds", "number", mapper.priorityRefreshSeconds || 600, { min: 1 })}
          ${field("Known Accounts Refresh", "knownAccountsRefreshSeconds", "number", mapper.knownAccountsRefreshSeconds || 900, { min: 1 })}
          ${field("Cache TTL Sec", "cacheTtlSeconds", "number", mapper.cacheTtlSeconds || 86400, { min: 1 })}
          ${field("Priority Cache TTL", "priorityCacheTtlSeconds", "number", mapper.priorityCacheTtlSeconds || 1800, { min: 1 })}
          ${field("Min Request Gap ms", "minRequestGapMs", "number", mapper.minRequestGapMs || 5000, { min: 0 })}
          <div class="form-footer"><button class="btn primary" type="submit">Save Display Name Config</button></div>
        </form>
      `)}

      ${configSection("ops-config", "Ops Scheduler", false, `
        <form data-settings-form="ops" class="config-form">
          ${checkField("Enabled", "enabled", sched.enabled)}
          ${field("Tick Seconds", "tickSeconds", "number", sched.tickSeconds || 120, { min: 15 })}
          ${field("Max Maps Per Run", "maxMapsPerRun", "number", sched.maxMapsPerRun || 5000, { min: 1 })}
          <div class="form-footer"><button class="btn primary" type="submit">Save Ops Config</button></div>
        </form>
      `)}

      ${configSection("bot-config", "Bot / Discord Webhook", false, `
        <form data-settings-form="bot" class="config-form">
          ${checkField("Enabled", "enabled", bot.enabled)}
          ${checkField("Announce WR Changes", "announceWrChanges", bot.announceWrChanges)}
          ${field("Bot Name", "botName", "text", bot.botName || "")}
          ${field("Guild ID", "guildId", "text", bot.guildId || "")}
          ${field("Channel ID", "channelId", "text", bot.channelId || "")}
          ${field("Mention Role ID", "mentionRoleId", "text", bot.mentionRoleId || "")}
          <label class="field" style="grid-column:1/-1;"><span>Webhook URL</span><input name="webhookUrl" value="${esc(bot.webhookUrl || "")}" /></label>
          <label class="field" style="grid-column:1/-1;"><span>Footer Text</span><input name="footerText" value="${esc(bot.footerText || "")}" /></label>
          <div class="form-footer"><button class="btn primary" type="submit">Save Bot Config</button></div>
        </form>
      `)}

      <div class="card" style="margin-top:.4rem;">
        <div class="card-header"><div><p class="ws-label">Runtime</p><h3>Support State</h3></div></div>
        <div class="g3" style="margin-top:.5rem;">
          ${statCard("Live API Session", d.liveApiSession?.available ? "Available" : "Unavailable", d.liveApiSession?.error || d.liveAuth?.authAdvice || "Resolved.")}
          ${statCard("Displayname Relay", mapper.relayAvailable ? "Healthy" : "Unavailable", mapper.relayLastError || "Responding.")}
          ${statCard("Update Requests", `${fmtNum(d.updateRequestSummary?.queued || 0)} queued`, `${fmtNum(d.updateRequestSummary?.total || 0)} total.`)}
        </div>
      </div>

      <div class="card" style="margin-top:.85rem;">
        <div class="card-header">
          <div><p class="ws-label">Public API</p><h3>Workspace</h3></div>
          <div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;">
            <span class="pill tone-info">${esc(fmtNum(publicApi.catalog?.totalEndpoints || 0))} documented</span>
            <a class="btn ghost small" href="${esc(publicApi.catalog?.docsPath || "/api/")}" target="_blank" rel="noreferrer">Open Docs</a>
          </div>
        </div>
        <div class="g4" style="margin-top:.5rem;">
          ${statCard("Requests 24h", fmtNum(apiTotals.requests24h || 0))}
          ${statCard("Requests 7d", fmtNum(apiTotals.requests7d || 0))}
          ${statCard("Requests 30d", fmtNum(apiTotals.requestsWindow || 0))}
          ${statCard("Unique Clients", fmtNum(apiTotals.uniqueClientsWindow || 0), `${fmtNum(apiTotals.serverErrorCount || 0)} server errors in window.`)}
        </div>
        <p class="card-body" style="margin-top:.75rem;">
          API docs and endpoint analytics now live in the dedicated <strong>API</strong> workspace.
          Use that page to review endpoint coverage, traffic, and direct links for external projects.
        </p>
        <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.65rem;">
          <button class="btn primary small" type="button" data-nav="api">Open API Workspace</button>
          <a class="btn ghost small" href="/api/" target="_blank" rel="noreferrer">Open Public Docs</a>
          <a class="btn ghost small" href="/api/v1/public/endpoints" target="_blank" rel="noreferrer">Open Catalog JSON</a>
        </div>
      </div>
    </div>
  `;
}

function renderApi() {
  const d = state.api;
  if (!d) { el.wsApi.innerHTML = loading("Loading API workspace..."); return; }
  const usage = d.usage || {};
  const catalog = d.catalog || {};
  const apiInfo = catalog.api || {};
  const totals = usage.totals || {};
  const endpoints = Array.isArray(catalog.endpoints) ? catalog.endpoints : [];
  const groups = summarizeApiGroups(endpoints);

  el.wsApi.innerHTML = `
    <div class="hero-banner">
      <div>
        <span class="pill tone-info">Public API</span>
        <h3>Endpoint directory and usage analytics.</h3>
        <p class="card-body">
          This workspace documents the public Altered API for external integrations and tracks how
          those endpoints are being used.
        </p>
        <div class="hero-actions">
          <a class="btn primary" href="${esc(apiInfo.docsPath || "/api/")}" target="_blank" rel="noreferrer">Open Public Docs</a>
          <a class="btn outline" href="/api/v1/public/endpoints" target="_blank" rel="noreferrer">Open Catalog JSON</a>
          <a class="btn ghost" href="/api/" target="_blank" rel="noreferrer">Open Map Tester</a>
          <button class="btn ghost" type="button" data-api-action="backfill-map-metadata">Backfill Map Metadata</button>
        </div>
      </div>
      <div class="g2">
        ${statCard("Version", apiInfo.version || "v1")}
        ${statCard("Docs Path", apiInfo.docsPath || "/api/")}
        ${statCard("Documented", fmtNum(apiInfo.totalEndpoints || endpoints.length || 0))}
        ${statCard("Updated", fmtDateTime(catalog.generatedAt || d.generatedAt))}
      </div>
    </div>

    ${groups.length ? `
      <div style="margin-top:.85rem;">
        <p class="ws-label">Endpoint Groups</p>
        <div class="g4" style="margin-top:.4rem;">
          ${groups.map((group) => statCard(group.group, fmtNum(group.count || 0))).join("")}
        </div>
      </div>
    ` : ""}

    ${renderPublicApiUsage(usage)}
    ${renderPublicApiDirectory(catalog)}
  `;
}

function summarizeApiGroups(endpoints) {
  const counts = new Map();
  (Array.isArray(endpoints) ? endpoints : []).forEach((endpoint) => {
    const key = String(endpoint?.group || "Other").trim() || "Other";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((left, right) => right.count - left.count || left.group.localeCompare(right.group));
}

function endpointLiveHref(endpoint) {
  const path = String(endpoint?.path || "").trim();
  const method = String(endpoint?.method || "GET").trim().toUpperCase();
  if (!path || method !== "GET") return "";
  if (!path.includes(":")) return path;
  if (endpoint?.key === "public-map-detail" || endpoint?.key === "legacy-map-info") return "/api/";
  return "";
}

function renderPublicApiUsage(publicApi) {
  const endpoints = Array.isArray(publicApi?.endpoints) ? publicApi.endpoints : [];
  const recentRequests = Array.isArray(publicApi?.recentRequests) ? publicApi.recentRequests : [];
  const origins = Array.isArray(publicApi?.origins) ? publicApi.origins : [];

  return `
    <div class="g2" style="margin-top:.85rem;">
      <div>
        <p class="ws-label">Top Endpoints</p>
        <div class="table-wrap" style="margin-top:.35rem;">
          <table>
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>24h</th>
                <th>7d</th>
                <th>Avg ms</th>
                <th>Last Hit</th>
              </tr>
            </thead>
            <tbody>
              ${endpoints.length
                ? endpoints
                    .map(
                      (endpoint) => `
                        <tr>
                          <td>
                            <strong>${esc(endpoint.title || endpoint.endpointKey || "Endpoint")}</strong>
                            <div style="font-size:.72rem;color:var(--a-muted);margin-top:.15rem;">
                              <code>${esc(endpoint.method || "GET")}</code> ${esc(endpoint.path || endpoint.requestPath || "-")}
                            </div>
                          </td>
                          <td>${esc(fmtNum(endpoint.requests24h || 0))}</td>
                          <td>${esc(fmtNum(endpoint.requests7d || 0))}</td>
                          <td>${esc(fmtDuration(endpoint.avgDurationMs || 0))}</td>
                          <td>${esc(fmtDateTime(endpoint.lastRequestedAt))}</td>
                        </tr>
                      `
                    )
                    .join("")
                : `<tr><td colspan="5"><span class="inline-empty">No API traffic recorded yet.</span></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <p class="ws-label">Recent Requests</p>
        <div class="table-wrap" style="margin-top:.35rem;">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Endpoint</th>
                <th>Status</th>
                <th>Origin</th>
                <th>ms</th>
              </tr>
            </thead>
            <tbody>
              ${recentRequests.length
                ? recentRequests
                    .map(
                      (request) => `
                        <tr>
                          <td>${esc(fmtDateTime(request.createdAt))}</td>
                          <td>
                            <strong>${esc(request.title || request.endpointKey || "-")}</strong>
                            <div style="font-size:.72rem;color:var(--a-muted);margin-top:.15rem;"><code>${esc(request.method || "GET")}</code> ${esc(request.path || request.requestPath || "-")}</div>
                            ${request.mapUid ? `<div style="font-size:.72rem;color:var(--a-muted);margin-top:.15rem;">Map ${esc(request.mapUid)}</div>` : ""}
                          </td>
                          <td><span class="pill ${toneClass(request.statusCode >= 500 ? "error" : request.statusCode >= 400 ? "warn" : "success")}">${esc(String(request.statusCode || "-"))}</span></td>
                          <td>${esc(request.origin || "direct")}</td>
                          <td>${esc(fmtDuration(request.durationMs || 0))}</td>
                        </tr>
                      `
                    )
                    .join("")
                : `<tr><td colspan="5"><span class="inline-empty">No recent requests.</span></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    ${origins.length
      ? `
        <div style="margin-top:.85rem;">
          <p class="ws-label">Top Origins (${esc(fmtNum(origins.length))})</p>
          <div class="g-auto" style="margin-top:.35rem;">
            ${origins
              .map(
                (origin) =>
                  statCard(origin.origin || "direct", fmtNum(origin.totalRequests || 0), fmtDateTime(origin.lastRequestedAt))
              )
              .join("")}
          </div>
        </div>
      `
      : ""}
  `;
}

function renderPublicApiDirectory(catalog) {
  const endpoints = (Array.isArray(catalog?.endpoints) ? catalog.endpoints : [])
    .slice()
    .sort((left, right) => {
      const leftGroup = String(left?.group || "Other");
      const rightGroup = String(right?.group || "Other");
      if (leftGroup !== rightGroup) return leftGroup.localeCompare(rightGroup);
      return String(left?.title || left?.path || "").localeCompare(String(right?.title || right?.path || ""));
    });

  return tableCard("Endpoint Directory", `${fmtNum(endpoints.length)} documented endpoint(s)`, `
    <table>
      <thead>
        <tr>
          <th>Endpoint</th>
          <th>Group</th>
          <th>Access</th>
          <th>Stability</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${endpoints.length
          ? endpoints.map((endpoint) => {
              const liveHref = endpointLiveHref(endpoint);
              return `
                <tr>
                  <td>
                    <strong>${esc(endpoint.title || endpoint.key || "Endpoint")}</strong>
                    <div style="font-size:.72rem;color:var(--a-muted);margin-top:.15rem;"><code>${esc(endpoint.method || "GET")}</code> ${esc(endpoint.path || "-")}</div>
                    ${endpoint.description ? `<div style="font-size:.72rem;color:var(--a-muted);margin-top:.15rem;">${esc(endpoint.description)}</div>` : ""}
                  </td>
                  <td>${esc(endpoint.group || "Other")}</td>
                  <td><span class="pill ${toneClass(endpoint.access === "protected" ? "warn" : "info")}">${esc(endpoint.access || "public")}</span></td>
                  <td><span class="pill ${toneClass(endpoint.stability === "legacy" ? "warn" : endpoint.stability === "stable" ? "success" : "muted")}">${esc(endpoint.stability || "existing")}</span></td>
                  <td>
                    <div style="display:flex;gap:.35rem;flex-wrap:wrap;">
                      <a class="btn ghost small" href="/api/" target="_blank" rel="noreferrer">Docs</a>
                      ${liveHref ? `<a class="btn outline small" href="${esc(liveHref)}" target="_blank" rel="noreferrer">Open</a>` : ""}
                    </div>
                  </td>
                </tr>
              `;
            }).join("")
          : `<tr><td colspan="5"><span class="inline-empty">No documented endpoints.</span></td></tr>`}
      </tbody>
    </table>
  `);
}

/* ── Drawer ───────────────────────────────────────────────── */
function renderDrawer() {
  const d = state.drawer;
  if (!d.open) {
    el.drawer.hidden = true; el.drawer.setAttribute("aria-hidden", "true");
    el.drawerScrim.hidden = true; return;
  }
  el.drawer.hidden = false; el.drawer.setAttribute("aria-hidden", "false");
  el.drawerScrim.hidden = false;
  el.drawer?.style.setProperty("--drawer-width", `${state.drawerUi.width}px`);
  el.drawerKicker.textContent = d.kicker || "Detail";
  el.drawerTitle.textContent = d.title || "Detail";
  el.drawerSubtitle.textContent = d.subtitle || "";

  if (d.type === "job-history") { renderJobHistoryDrawer(d.payload || {}); return; }
  if (d.type === "map") { renderMapDrawer(d.payload || {}); return; }
  if (d.type === "event") { renderEventDrawer(d.payload || {}); return; }
  if (d.type === "naming-detail") { renderNamingDetailDrawer(d.payload || {}); return; }
  if (d.type === "targeted-displayname") { renderTargetedDnDrawer(); return; }
  if (d.type === "club-config") { renderClubConfigDrawer(d.payload || {}); return; }
  el.drawerBody.innerHTML = emptyState("Nothing to show", "Drawer opened without a payload.");
}

function renderJobHistoryDrawer(p) {
  const items = Array.isArray(p.items) ? p.items : [];
  el.drawerBody.innerHTML = `
    <div class="drawer-section" style="flex-direction:row;align-items:center;gap:.5rem;">
      <span class="pill tone-info">${esc(fmtNum(p.total || 0))} run(s)</span>
      ${p.hasMore ? `<button class="btn outline small" type="button" data-drawer-more-history="${esc(p.jobKey || "")}">Load More</button>` : ""}
    </div>
    ${items.length ? items.map(renderHistoryItem).join("") : emptyState("No history", "No stored runs yet.")}
  `;
}

function renderHistoryItem(item) {
  return `
    <div class="drawer-section">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;">
        <div><h3 style="font-size:.92rem;">${esc(item.summary || "Run")}</h3><p style="font-size:.76rem;color:var(--a-muted);">${esc(fmtDateTime(item.finishedAt || item.startedAt))}</p></div>
        <span class="pill ${toneClass(item.state)}">${esc(toneLabel(item.state))}</span>
      </div>
      ${item.detail ? `<p class="card-body">${esc(item.detail)}</p>` : ""}
      <div class="drawer-kv">
        ${kv("Started", fmtDateTime(item.startedAt))}
        ${kv("Finished", fmtDateTime(item.finishedAt))}
        ${kv("Duration", fmtDuration(item.durationMs))}
        ${kv("ID", item.id || "-")}
      </div>
    </div>
  `;
}

function renderMapDrawer(map) {
  const d = map.detail || {};
  const canCheck = Boolean(d.opsMonitorUserId);
  el.drawerBody.innerHTML = `
    <div class="drawer-section">
      <div class="drawer-kv">
        ${kvN("Campaign", map.campaignName || d.campaign || "Unassigned")}
        ${kv("Slot", d.slot || map.slot || "-")}
        ${kv("Tracked", map.tracked ? "Yes" : "No")}
        ${kv("Status", map.status || d.status || "live")}
        ${kv("Last Checked", fmtDateTime(map.lastCheckedAt))}
        ${kv("Last WR Change", fmtDateTime(map.lastWrChangeAt))}
      </div>
      <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.5rem;">
        <button class="btn primary small" type="button" data-map-command="track" data-map-uid="${esc(map.mapUid)}">Track</button>
        <button class="btn outline small" type="button" data-map-command="pause" data-map-uid="${esc(map.mapUid)}">Pause</button>
        <button class="btn outline small" type="button" data-map-command="history" data-map-uid="${esc(map.mapUid)}">History</button>
        <button class="btn ghost small" type="button" data-map-command="check-now" data-map-uid="${esc(map.mapUid)}" ${canCheck ? "" : "disabled"}>Check Now</button>
        <a class="btn ghost small" href="/api/v1/public/maps/${encodeURIComponent(map.mapUid)}" target="_blank" rel="noreferrer">Open API JSON</a>
      </div>
      ${d.opsLastError ? `<p style="font-size:.82rem;color:var(--a-err);margin-top:.3rem;">${esc(d.opsLastError)}</p>` : ""}
    </div>
    <div class="drawer-section">
      <h3 style="font-size:.92rem;">Move to Campaign</h3>
      <form data-drawer-form="move-map" class="config-form" style="margin-top:.3rem;">
        <input type="hidden" name="mapUid" value="${esc(map.mapUid)}" />
        ${field("Campaign", "campaignName", "text", map.campaignName || d.campaign || "")}
        ${field("Slot", "slot", "number", d.slot || map.slot || 1, { min: 1 })}
        <div class="form-footer"><button class="btn primary small" type="submit">Move</button></div>
      </form>
    </div>
    <div class="drawer-section">
      <h3 style="font-size:.92rem;">Details</h3>
      <div class="drawer-kv">
        ${kv("UID", map.mapUid)}
        ${kv("Map ID", d.mapId || "-")}
        ${kvN("WR Holder", d.wrHolder || "-")}
        ${kv("WR ms", d.wrMs || 0)}
        ${kv("Players", d.playerCount || 0)}
        ${kv("Ops User", d.opsMonitorUserEmail || "-")}
      </div>
    </div>
  `;
}

function renderEventDrawer(ev) {
  const meta = Object.entries(ev.meta || {});
  el.drawerBody.innerHTML = `
    <div class="drawer-section">
      <span class="pill ${toneClass(ev.status || ev.kind)}">${esc(toneLabel(ev.status || ev.kind))}</span>
      <p class="card-body">${esc(ev.summary || "No summary.")}</p>
      ${ev.detail ? `<p style="font-size:.82rem;color:var(--a-muted);margin-top:.2rem;">${esc(ev.detail)}</p>` : ""}
    </div>
    <div class="drawer-section">
      <div class="drawer-kv">
        ${kv("Kind", ev.kind || "-")}
        ${kv("When", fmtDateTime(ev.createdAt))}
        ${kv("Map UID", ev.mapUid || "-")}
        ${kv("Job Key", ev.jobKey || "-")}
      </div>
    </div>
    <div class="drawer-section">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;">
        <h3 style="font-size:.92rem;">Metadata</h3>
        ${ev.mapUid ? `<button class="btn ghost small" type="button" data-map-command="history" data-map-uid="${esc(ev.mapUid)}">Map History</button>` : ""}
      </div>
      <div class="g1" style="margin-top:.3rem;">
        ${meta.length ? meta.map(([k, v]) => `<div class="stat-card"><div class="label">${esc(k)}</div><div class="value">${esc(String(v ?? "-"))}</div></div>`).join("") : `<p class="inline-empty">No metadata.</p>`}
      </div>
    </div>
  `;
}

function renderNamingDetailDrawer(payload) {
  const map = payload?.map || {};
  const localFile = payload?.localFile || null;
  const stored = payload?.storedCandidate || null;
  const fresh = payload?.freshCandidate || null;
  const similarity = payload?.similarity || null;
  const signature = payload?.signature || null;
  const diag = payload?.diagnostics || {};
  const similarityDetails = similarity?.details || {};
  const candidateMatches = Array.isArray(similarity?.candidateMatches) ? similarity.candidateMatches : [];
  const closestMatch = candidateMatches[0] || null;
  const similaritySearch = String(state.drawerUi.namingSimilaritySearch || "");
  const similarityCampaignLabel =
    similarityDetails?.targetCampaignName || map.campaign || similarity?.referenceCampaignName || "Campaign";
  const similarityWarnings = Array.isArray(similarityDetails?.diagnosticWarnings)
    ? similarityDetails.diagnosticWarnings.filter(Boolean)
    : [];
  const parserWarnings = [stored?.parserWarning || null, fresh?.parserWarning || null].filter(Boolean);
  const similarityWarningMarkup = similarityWarnings.length
    ? `<div class="card" style="margin-top:.45rem;border-color:rgba(255,138,92,.45);">
        <div class="card-header">
          <div><p class="ws-label">Similarity Warning</p><h3>Degraded Reference Coverage</h3></div>
          <span class="pill tone-warn">Warning</span>
        </div>
        <div class="card-body" style="margin-top:.35rem;display:grid;gap:.35rem;">
          ${similarityWarnings.map((warning) => `<p style="margin:0;">${esc(warning)}</p>`).join("")}
        </div>
      </div>`
    : "";
  const parserWarningMarkup = parserWarnings.length
    ? `<div class="card" style="margin-top:.45rem;border-color:rgba(255,138,92,.45);">
        <div class="card-header">
          <div><p class="ws-label">Parser Warning</p><h3>Regex Missed A Color-Set Name</h3></div>
          <span class="pill tone-warn">Warning</span>
        </div>
        <div class="card-body" style="margin-top:.35rem;display:grid;gap:.35rem;">
          ${[...new Set(parserWarnings)].map((warning) => `<p style="margin:0;">${esc(warning)}</p>`).join("")}
        </div>
      </div>`
    : "";

  const numbers = (value) => Array.isArray(value) && value.length ? value.join(", ") : "-";
  const score = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(6) : "-";
  const kvs = [];
  kvs.push(kv("Campaign", map.campaign || "-"));
  kvs.push(kv("Slot", map.slot != null ? String(map.slot) : "-"));
  kvs.push(kv("Stored Numbers", numbers(stored?.mapNumbers)));
  kvs.push(kv("Fresh Numbers", numbers(fresh?.mapNumbers)));
  kvs.push(kv("Similarity Numbers", numbers(similarity?.assignedMapNumbers)));
  kvs.push(kv("Stored Auto", stored?.automationState || "-"));
  kvs.push(kv("Fresh Auto", fresh?.automationState || "-"));
  kvs.push(kv("Stale Stored Row", diag.staleStoredCandidate ? "Yes" : "No"));
  kvs.push(kv("Auto Resolvable Now", diag.autoResolvableNow ? "Yes" : "No"));
  kvs.push(kv("Parser Pattern", stored?.parserPattern || fresh?.parserPattern || "-"));
  kvs.push(kv("Parser Confidence", stored?.parserConfidence != null ? String(stored.parserConfidence) : fresh?.parserConfidence != null ? String(fresh.parserConfidence) : "-"));
  kvs.push(kv("Parser Warning", stored?.parserWarning || fresh?.parserWarning || "-"));
  kvs.push(kv("Similarity Top", score(similarity?.topScore)));
  kvs.push(kv("Similarity Second", score(similarity?.secondScore)));
  kvs.push(kv("Similarity Confidence", score(similarity?.confidence)));
  kvs.push(kv("Similarity Weighted", score(candidateMatches[0]?.weightedScore)));
  kvs.push(kv("Similarity Scope", similarityDetails?.referenceScope || "catalog-canonical-global"));
  kvs.push(kv("Reference Campaign", similarity?.referenceCampaignName || "-"));
  kvs.push(kv("Reference Slot", similarity?.primaryReferenceSlot != null ? String(similarity.primaryReferenceSlot) : "-"));
  kvs.push(kv("Local File", localFile?.status || "-"));
  kvs.push(kv("Local Path", localFile?.relativePath || "-"));
  kvs.push(kv("Local Bytes", localFile?.fileSizeBytes != null ? fmtBytes(localFile.fileSizeBytes) : "-"));
  kvs.push(kv("Signature Version", signature?.extractionVersion || "-"));
  kvs.push(kv("Signature Status", signature?.sourceStatus || "-"));
  kvs.push(kv("Signature Error", signature?.sourceError || "-"));
  kvs.push(kv("Why Unmatched", diag.unmatchedReason || "-"));
  kvs.push(kv("Auto-Approve", diag.autoApproval?.eligible ? `Yes (${diag.autoApproval.reason || "eligible"})` : diag.autoApproval?.reason ? `No (${diag.autoApproval.reason})` : "No"));
  kvs.push(kv("Close Slot Count", similarityDetails?.closeSlotCount != null ? String(similarityDetails.closeSlotCount) : "-"));
  kvs.push(kv("Close Slots", numbers(similarityDetails?.closeSlots)));
  kvs.push(kv("Reference Maps Scanned", similarityDetails?.referenceMapCount != null ? fmtNum(similarityDetails.referenceMapCount) : "-"));
  kvs.push(kv("Reference Campaigns Scanned", similarityDetails?.referenceCampaignCount != null ? fmtNum(similarityDetails.referenceCampaignCount) : "-"));

  const signatureSummary = signature?.signatureSummary && typeof signature.signatureSummary === "object"
    ? signature.signatureSummary
    : null;
  const similarityMeta = similarityDetailMeta(similarityDetails?.matchClassification);
  const statusNote = payload?.loading
    ? `<div class="drawer-section"><p class="card-body">Loading the latest naming diagnostics...</p></div>`
    : payload?.loadError
      ? `<div class="drawer-section"><p class="card-body">Showing the row snapshot because the full naming detail request failed: ${esc(payload.loadError)}</p></div>`
      : "";

  el.drawerBody.innerHTML = `
    <div class="drawer-tabbar">
      <button class="drawer-tabbtn" type="button" data-drawer-tab="overview" aria-selected="true">Overview</button>
      <button class="drawer-tabbtn" type="button" data-drawer-tab="similarity" aria-selected="false">Similarity</button>
      <button class="drawer-tabbtn" type="button" data-drawer-tab="signature" aria-selected="false">Signature</button>
    </div>
    ${statusNote}
    <section class="drawer-tabpanel" data-drawer-tab-panel="overview">
      <div class="drawer-section">
        <h3 style="font-size:.92rem;">${escN(map.name || map.mapUid || "Map")}</h3>
        <p class="card-body">${esc(map.mapUid || "-")}</p>
        <div class="drawer-kv">${kvs.join("")}</div>
      </div>
      <div class="drawer-section">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;">
          <h3 style="font-size:.92rem;">Closest Similarity</h3>
          <div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;">
            <span class="pill ${similarityMeta.tone}">${esc(similarityMeta.label)}</span>
            <button class="btn outline small" type="button" data-recompute-similarity="${esc(map.mapUid || "")}">Recompute Similarity</button>
          </div>
        </div>
        ${similarityDetails?.matchWarning ? `<p class="card-body" style="margin-top:.35rem;">${esc(similarityDetails.matchWarning)}</p>` : ""}
      ${parserWarningMarkup}
      ${similarityWarningMarkup}
        ${
          closestMatch
            ? `<div class="drawer-kv" style="margin-top:.45rem;">
                ${kv("Closest Map", closestMatch.mapName || closestMatch.mapUid || "-")}
                ${kv("Closest Campaign", closestMatch.campaignName || "-")}
                ${kv("Closest Slot", closestMatch.slot != null ? String(closestMatch.slot) : "-")}
                ${kv("Closest Final Score", score(closestMatch.score))}
                ${kv("Closest Weighted Score", score(closestMatch.weightedScore))}
                ${kv("Closest Content Score", score(closestMatch.contentScore))}
                ${kv("Closest Name Score", score(closestMatch.nameScore))}
              </div>
              <div style="margin-top:.6rem;display:flex;gap:.35rem;flex-wrap:wrap;">
                ${renderMapViewerAction(map.mapUid || "", closestMatch.mapUid || "")}
              </div>`
            : `<p class="inline-empty">No stored similarity matches.</p>`
        }
      </div>
    </section>
    <section class="drawer-tabpanel" data-drawer-tab-panel="similarity" hidden>
      <div class="drawer-section">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;">
          <h3 style="font-size:.92rem;">${escN(similarityCampaignLabel)} Ranked Similarity</h3>
          <span style="font-size:.76rem;color:var(--a-muted);">Select one or more ranked references to lock the slot numbers.</span>
        </div>
        ${similarityWarningMarkup}
        ${
          candidateMatches.length
            ? `<div style="margin-top:.5rem;display:grid;gap:.45rem;">
                <label class="field" style="max-width:26rem;">
                  <span>Search Similar Maps</span>
                  <input
                    type="search"
                    value="${esc(similaritySearch)}"
                    placeholder="Map, campaign, UID, or slot"
                    data-naming-similarity-search-input
                  />
                </label>
                <span style="font-size:.76rem;color:var(--a-muted);" data-naming-similarity-search-count></span>
              </div>
              <form data-drawer-form="similarity-selection" class="config-form" style="margin-top:.35rem;">
                <input type="hidden" name="mapUid" value="${esc(map.mapUid || "")}" />
                <div class="table-wrap drawer-wide">
                <table class="data-table">
                  <thead><tr><th>#</th><th>Pick</th><th>Reference</th><th>Slot</th><th>Flags</th><th>Viewer</th><th>Model</th><th>Abs</th><th>Rel</th><th>Weighted</th><th>Name</th><th>Final</th></tr></thead>
                  <tbody>
                    ${candidateMatches.map((match, index) => `
                      <tr
                        data-naming-similarity-row
                        data-similarity-rank="${esc(String(index + 1))}"
                        data-similarity-search-text="${esc(buildSimilarityMatchSearchText(match))}"
                      >
                        <td>${esc(String(index + 1))}</td>
                        <td><input type="checkbox" name="candidateMapUid" value="${esc(match.mapUid || "")}" ${match.isAssignedBySystem ? "checked" : ""} /></td>
                        <td><strong>${escN(match.mapName || match.mapUid || "-")}</strong><div style="font-size:.72rem;color:var(--a-muted);margin-top:.15rem;">${esc(match.campaignName || "-")}</div><div style="font-size:.72rem;color:var(--a-muted);margin-top:.12rem;">${esc(match.mapUid || "-")}</div></td>
                        <td>${esc(String(match.slot || "-"))}</td>
                        <td><div style="display:flex;gap:.25rem;flex-wrap:wrap;">${match.isCloseMatch ? `<span class="pill tone-warn">close</span>` : ""}${match.isAssignedBySystem ? `<span class="pill tone-info">selected</span>` : ""}</div></td>
                        <td>${renderMapViewerAction(map.mapUid || "", match.mapUid || "", "Open")}</td>
                        <td>${esc(score(match.modelScore))}</td>
                        <td>${esc(score(match.absoluteScore))}</td>
                        <td>${esc(score(match.relativeScore))}</td>
                        <td>${esc(score(match.weightedScore))}</td>
                        <td>${esc(score(match.nameScore))}</td>
                        <td>${esc(score(match.score))}</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
              <p class="inline-empty" data-naming-similarity-search-empty hidden style="margin-top:.6rem;">No similar maps match this search.</p>
              <div data-naming-similarity-pagination style="margin-top:.55rem;display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;" hidden>
                <span style="font-size:.76rem;color:var(--a-muted);" data-naming-similarity-page-label></span>
                <div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;">
                  <button class="btn outline small" type="button" data-naming-similarity-page="prev">Previous 5</button>
                  <button class="btn outline small" type="button" data-naming-similarity-page="next">Next 5</button>
                </div>
              </div>
              <div class="form-footer" style="margin-top:.6rem;display:flex;gap:.35rem;flex-wrap:wrap;">
                <button class="btn outline small" type="submit" name="selectionMode" value="apply">Apply Selected</button>
                <button class="btn primary small" type="submit" name="selectionMode" value="approve">Apply + Approve</button>
              </div>
            </form>`
            : `<p class="inline-empty">No stored similarity matches.</p>`
        }
      </div>
    </section>
    <section class="drawer-tabpanel" data-drawer-tab-panel="signature" hidden>
      <div class="drawer-section">
        <h3 style="font-size:.92rem;">Signature Summary</h3>
        ${
          signatureSummary
            ? `<div class="drawer-kv">${Object.entries(signatureSummary).map(([key, value]) => kv(key, String(value))).join("")}</div>`
            : `<p class="inline-empty">No signature summary stored.</p>`
        }
      </div>
    </section>
  `;
  syncDrawerTabs();
  syncNamingSimilaritySearch();
}

function renderTargetedDnDrawer() {
  el.drawerBody.innerHTML = `
    <div class="drawer-section">
      <p class="card-body">Sync specific Ubisoft account IDs immediately.</p>
      <form data-drawer-form="targeted-displayname" style="margin-top:.5rem;">
        <label class="field"><span>Account IDs</span><textarea name="accountIds" placeholder="Paste IDs separated by commas, spaces, or newlines"></textarea></label>
        <div class="field check" style="margin-top:.5rem;"><span>Force refresh</span><input name="force" type="checkbox" /></div>
        <div class="form-footer" style="margin-top:.6rem;"><button class="btn primary" type="submit">Run Sync</button></div>
      </form>
    </div>
  `;
}

function renderClubConfigDrawer(club) {
  el.drawerBody.innerHTML = `
    <div class="drawer-section">
      <p class="card-body">Manage this club's hook settings and sync label.</p>
      <form data-drawer-form="club-config" style="margin-top:.5rem;">
        <input type="hidden" name="hookKey" value="${esc(club.hookKey || "")}" />
        ${field("Club ID", "clubId", "number", club.clubId || "", { min: 1 })}
        ${field("Club Name", "clubName", "text", club.clubName || "")}
        ${field("Source Label", "sourceLabel", "text", club.sourceLabel || "")}
        <div class="field check" style="margin-top:.4rem;"><span>Enabled</span><input name="enabled" type="checkbox" ${club.enabled ? "checked" : ""} /></div>
        <div class="field check" style="margin-top:.4rem;"><span>Auto-track New Maps</span><input name="autoTrackNewMaps" type="checkbox" ${club.autoTrackNewMaps ? "checked" : ""} /></div>
        <div style="display:flex;gap:.35rem;margin-top:.6rem;">
          <button class="btn primary" type="submit">Save Club</button>
          <button class="btn outline" type="button" data-club-action="sync" data-club-id="${esc(String(club.clubId || 0))}" data-hook-key="${esc(club.hookKey || "")}">Sync Club</button>
        </div>
      </form>
    </div>
  `;
}

/* ── Click Handler ────────────────────────────────────────── */
async function onClick(e) {
  const t = e.target;
  state.lastActionControl =
    t instanceof HTMLElement ? t.closest("button, a.btn, [role='button']") : null;

  const drawerTab = t.closest("[data-drawer-tab]");
  if (drawerTab) {
    state.drawerUi.activeTab = drawerTab.dataset.drawerTab || "overview";
    syncDrawerTabs();
    return;
  }

  const similarityPageBtn = t.closest("[data-naming-similarity-page]");
  if (similarityPageBtn) {
    const action = String(similarityPageBtn.getAttribute("data-naming-similarity-page") || "").trim().toLowerCase();
    if (action === "prev") state.drawerUi.namingSimilarityPage = Math.max(1, Number(state.drawerUi.namingSimilarityPage || 1) - 1);
    if (action === "next") state.drawerUi.namingSimilarityPage = Math.max(1, Number(state.drawerUi.namingSimilarityPage || 1) + 1);
    syncNamingSimilaritySearch();
    return;
  }

  const navBtn = t.closest("[data-workspace-link]");
  if (navBtn) { setHash(navBtn.dataset.workspaceLink); return; }

  const navTo = t.closest("[data-nav]");
  if (navTo) { setHash(navTo.dataset.nav); return; }

  /* Refresh buttons */
  const refresh = t.closest("[data-refresh]");
  if (refresh) { await guarded(`refresh-${refresh.dataset.refresh}`, () => ensureLoaded(refresh.dataset.refresh, true)); return; }

  /* Config section toggles */
  const cfgHeader = t.closest(".config-header");
  if (cfgHeader) { cfgHeader.closest(".config-section")?.classList.toggle("open"); return; }

  /* Alerts */
  const alertBtn = t.closest("[data-alert-target]");
  if (alertBtn) { location.hash = alertBtn.dataset.alertTarget || "#dashboard"; return; }

  /* Maps subtabs */
  const mapView = t.closest("[data-maps-view]");
  if (mapView) { state.maps.view = mapView.dataset.mapsView || "inventory"; state.maps.page[state.maps.view] = 1; setHash("maps", { view: state.maps.view }); return; }

  /* Open campaign in inventory */
  const openCamp = t.closest("[data-open-campaign]");
  if (openCamp) { state.maps.view = "inventory"; state.maps.filters.inventory.campaign = openCamp.dataset.openCampaign || ""; state.maps.page.inventory = 1; setHash("maps", { view: "inventory" }); await guarded("campaign-filter", () => loadMaps(true)); return; }

  /* Reset maps filters */
  if (t.closest("[data-reset-maps]")) {
    state.maps.filters[state.maps.view] = { inventory: { q: "", campaign: "", tracked: "", status: "", staleState: "" }, campaigns: {}, naming: { q: "", automationState: "", reviewState: "pending", requiresRegex: "" }, requests: { q: "", status: "" } }[state.maps.view] || {};
    state.maps.page[state.maps.view] = 1;
    await guarded("reset-maps", () => loadMaps(true)); return;
  }

  /* Pagination */
  const pageBtn = t.closest("[data-page-action]");
  if (pageBtn) {
    const a = pageBtn.dataset.pageAction; const v = state.maps.view;
    const maxPage = Math.max(1, Number(state.maps.data?.pageCount || 1));
    if (a === "maps-first-page") state.maps.page[v] = 1;
    if (a === "maps-prev-page") state.maps.page[v] = Math.max(1, (state.maps.page[v] || 1) - 1);
    if (a === "maps-next-page") state.maps.page[v] = (state.maps.page[v] || 1) + 1;
    if (a === "maps-last-page") state.maps.page[v] = maxPage;
    state.maps.page[v] = Math.max(1, Math.min(maxPage, Number(state.maps.page[v] || 1) || 1));
    await guarded(`page-${a}`, () => loadMaps(true)); return;
  }

  /* Open map drawer */
  const openMap = t.closest("[data-open-map-uid]");
  if (openMap) { const row = findRow(openMap.dataset.openMapUid); if (row) openDrawer({ type: "map", kicker: "Map Detail", title: stripFmt(row.mapName || row.mapUid), subtitle: row.mapUid, payload: row }); return; }

  /* Map commands */
  const mapCmd = t.closest("[data-map-command]");
  if (mapCmd) { await handleMapCmd(mapCmd.dataset.mapCommand, mapCmd.dataset.mapUid); return; }

  /* Club actions */
  const clubAct = t.closest("[data-club-action]");
  if (clubAct) { await handleClubAction(clubAct.dataset.clubAction, clubAct.dataset.hookKey || "", Number(clubAct.dataset.clubId || 0) || 0); return; }

  /* Source actions */
  const sourceAct = t.closest("[data-source-action]");
  if (sourceAct) { await handleSourceAction(sourceAct.dataset.sourceAction, sourceAct.dataset.sourceKey || ""); return; }

  /* Activity pagination */
  const actPage = t.closest("[data-activity-page]");
  if (actPage) {
    const dir = actPage.dataset.activityPage;
    if (dir === "prev") state.activity.cursor = Math.max(0, (state.activity.cursor || 0) - (state.activity.limit || 40));
    else if (dir === "next" && state.activity.data?.nextCursor !== null) state.activity.cursor = Number(state.activity.data.nextCursor || 0);
    await guarded(`activity-page-${dir}`, loadActivity); return;
  }

  /* Reset activity */
  if (t.closest("[data-reset-activity]")) {
    state.activity.filters = { kind: "all", mapUid: "", jobKey: "" }; state.activity.cursor = 0;
    setHash("activity", {}); await guarded("reset-activity", loadActivity); return;
  }

  /* Open event drawer */
  const openEv = t.closest("[data-open-event]");
  if (openEv) { const p = JSON.parse(openEv.dataset.openEvent || "{}"); openDrawer({ type: "event", kicker: "Event", title: p.title || "Event", subtitle: p.subtitle || "", payload: p }); return; }

  /* Job actions */
  const jobAct = t.closest("[data-job-action]");
  if (jobAct) { await handleJobAction(jobAct.dataset.jobAction, jobAct.dataset.jobKey); return; }

  /* More history */
  const moreHist = t.closest("[data-drawer-more-history]");
  if (moreHist) { await loadMoreHistory(moreHist.dataset.drawerMoreHistory); return; }

  /* Naming review */
  const candDetail = t.closest("[data-candidate-detail]");
  if (candDetail) {
    const mapUid = String(candDetail.dataset.candidateDetail || "").trim();
    const fallbackPayload = buildNamingDetailFallbackPayload(mapUid);
    openNamingDetailDrawer(fallbackPayload, { activeTab: "overview" });
    await guarded(`candidate-detail:${mapUid}`, async () => {
      try {
        const payload = await api(`/api/v1/admin/naming/candidates/${encodeURIComponent(mapUid)}/detail`);
        openNamingDetailDrawer(mergeNamingDetailPayload(fallbackPayload, payload), {
          activeTab: state.drawerUi.activeTab || "overview",
        });
      } catch (error) {
        openNamingDetailDrawer(
          {
            ...fallbackPayload,
            loading: false,
            loadError: error?.message || "Failed to load naming detail.",
          },
          {
            activeTab: state.drawerUi.activeTab || "overview",
          }
        );
        throw error;
      }
    });
    return;
  }

  const recomputeSimilarity = t.closest("[data-recompute-similarity]");
  if (recomputeSimilarity) {
    const mapUid = recomputeSimilarity.dataset.recomputeSimilarity;
    await guarded(`recompute-similarity:${mapUid}`, async () => {
      await post("/api/v1/admin/naming/similarity/backfill", { mapUids: [mapUid], limit: 1 });
      await Promise.all([loadMaps(true), loadDashboard()]);
      const payload = await api(`/api/v1/admin/naming/candidates/${encodeURIComponent(mapUid)}/detail`);
      openNamingDetailDrawer(payload);
      toast(`Similarity recomputed for ${mapUid}.`, "ok");
    });
    return;
  }

  const candReview = t.closest("[data-candidate-review]");
  if (candReview) { await doNameReview({ mapUid: candReview.dataset.mapUid, reviewState: candReview.dataset.candidateReview }); return; }

  const candManual = t.closest("[data-candidate-manual]");
  if (candManual) { const name = prompt("Enter manual name:", ""); if (name === null) return; await doNameReview({ mapUid: candManual.dataset.candidateManual, reviewState: "approved", manualName: name }); return; }

  /* Request status */
  const reqStatus = t.closest("[data-request-status]");
  if (reqStatus) {
    const id = reqStatus.dataset.requestId; const st = reqStatus.dataset.requestStatus;
    await guarded(`req-${id}-${st}`, async () => {
      await post(`/api/v1/admin/update-requests/${id}/status`, { status: st, resolutionNote: `Set from admin v2.` });
      await loadMaps(true); await loadDashboard();
    }, `Request moved to ${st}.`); return;
  }

  if (t.closest("[data-run-naming-process]")) {
    await guarded("naming-rebuild", async () => {
      const r = await post("/api/v1/admin/naming/process", { q: state.maps.filters.naming.q || "" });
      await loadMaps(true); await loadDashboard();
      toast(`Naming rebuilt. ${r.processed || 0} processed.`, "ok");
    }); return;
  }

  if (t.closest("[data-cancel-naming-similarity]")) {
    await guarded("naming-similarity-cancel", async () => {
      const cancel = await post("/api/v1/admin/naming/similarity/backfill/cancel", {
        reason: "admin-v2-cancel",
      });
      state.similarityBackfillStatusSupported = true;
      state.similarityBackfill = cancel.status || state.similarityBackfill;
      rerenderSimilarityBackfillSurfaces();
      toast(cancel.canceled ? "Similarity backfill canceled." : "No similarity backfill was running.", "info");
    });
    return;
  }

  if (t.closest("[data-run-naming-similarity]")) {
    await guarded("naming-similarity", async () => {
      const trigger = t.closest("[data-run-naming-similarity]");
      const mode = String(trigger?.getAttribute("data-run-naming-similarity") || "incremental").trim().toLowerCase();
      const sourceKey = String(state.namingSimilaritySourceKey || "").trim().toLowerCase();
      const rescanAll = mode === "rescan-all" || mode === "selected-source";
      try {
        const kickoff = await post("/api/v1/admin/naming/similarity/backfill/start", {
          reason: sourceKey
            ? `admin-v2-rescan-${sourceKey}`
            : rescanAll
              ? "admin-v2-rescan-all-candidates"
              : "admin-v2-full-all-candidates",
          sourceKey: sourceKey || undefined,
          clubId: state.namingSimilarityClubId ? Number(state.namingSimilarityClubId) : undefined,
          reviewState: state.namingSimilarityPendingOnly ? "pending" : undefined,
          force: state.namingSimilarityForce || undefined,
          rescanAll,
        });
        state.similarityBackfillStatusSupported = true;
        state.similarityBackfill = kickoff.status || state.similarityBackfill;
        rerenderSimilarityBackfillSurfaces();
        toast(
          kickoff.started
            ? sourceKey
              ? `Similarity rescan for ${sourceKey} started. Progress is now live.`
              : rescanAll
                ? "Full similarity rescan started. Progress is now live."
                : "Similarity backfill started. Progress is now live."
            : "Similarity backfill is already running.",
          "info"
        );
        // Run in the background: progress will keep updating via polling + status panels.
        return;
      } catch (error) {
        if (isNotFoundError(error)) {
          state.similarityBackfillStatusSupported = false;
          rerenderSimilarityBackfillSurfaces();
          throw new Error("Live similarity progress is unavailable on the current backend. Restart the altered backend and refresh the page.");
        }
        throw error;
      }
    }); return;
  }

  if (t.closest("[data-open-unmatched-naming]")) {
    state.maps.view = "naming";
    state.maps.filters.naming = {
      ...state.maps.filters.naming,
      automationState: "unmatched",
      reviewState: "pending",
    };
    state.maps.page.naming = 1;
    setHash("maps", { view: "naming" });
    await guarded("open-unmatched-naming", () => loadMaps(true));
    return;
  }

  const apiAction = t.closest("[data-api-action]");
  if (apiAction?.dataset.apiAction === "backfill-map-metadata") {
    await guarded("api-backfill-map-metadata", async () => {
      const result = await post("/api/v1/admin/naming/backfill", { limit: 120000 });
      await Promise.all([loadApi(), loadMaps(true), loadDashboard()]);
      toast(`Map metadata backfill complete. ${result.processed || 0} processed.`, "ok");
    });
    return;
  }
}

/* ── Submit Handler ───────────────────────────────────────── */
function onInput(e) {
  const t = e.target;
  if (!(t instanceof Element)) return;

  const similaritySearchInput = t.closest("[data-naming-similarity-search-input]");
  if (similaritySearchInput instanceof HTMLInputElement) {
    state.drawerUi.namingSimilaritySearch = similaritySearchInput.value || "";
    state.drawerUi.namingSimilarityPage = 1;
    syncNamingSimilaritySearch();
  }

  const similaritySourceSelect = t.closest("[data-naming-similarity-source]");
  if (similaritySourceSelect instanceof HTMLSelectElement) {
    state.namingSimilaritySourceKey = similaritySourceSelect.value || "";
    document.querySelectorAll("[data-naming-similarity-source]").forEach((node) => {
      if (node instanceof HTMLSelectElement && node !== similaritySourceSelect) {
        node.value = state.namingSimilaritySourceKey;
      }
    });
  }

  const similarityClubSelect = t.closest("[data-naming-similarity-club]");
  if (similarityClubSelect instanceof HTMLSelectElement) {
    state.namingSimilarityClubId = similarityClubSelect.value || "";
    document.querySelectorAll("[data-naming-similarity-club]").forEach((node) => {
      if (node instanceof HTMLSelectElement && node !== similarityClubSelect) {
        node.value = state.namingSimilarityClubId;
      }
    });
  }

  const similarityForceToggle = t.closest("[data-naming-similarity-force]");
  if (similarityForceToggle instanceof HTMLInputElement) {
    state.namingSimilarityForce = Boolean(similarityForceToggle.checked);
    document.querySelectorAll("[data-naming-similarity-force]").forEach((node) => {
      if (node instanceof HTMLInputElement && node !== similarityForceToggle) {
        node.checked = state.namingSimilarityForce;
      }
    });
  }

  const similarityPendingToggle = t.closest("[data-naming-similarity-pending-only]");
  if (similarityPendingToggle instanceof HTMLInputElement) {
    state.namingSimilarityPendingOnly = Boolean(similarityPendingToggle.checked);
    document.querySelectorAll("[data-naming-similarity-pending-only]").forEach((node) => {
      if (node instanceof HTMLInputElement && node !== similarityPendingToggle) {
        node.checked = state.namingSimilarityPendingOnly;
      }
    });
  }
}

async function onSubmit(e) {
  state.lastActionControl = e.submitter instanceof HTMLElement ? e.submitter : null;
  const settingsForm = e.target.closest("[data-settings-form]");
  if (settingsForm) { e.preventDefault(); await submitSettings(settingsForm); return; }

  const mapsPageJump = e.target.closest("[data-form-kind='maps-page-jump']");
  if (mapsPageJump) {
    e.preventDefault();
    const fd = new FormData(mapsPageJump);
    const maxPage = Math.max(1, Number(mapsPageJump.getAttribute("data-page-count") || state.maps.data?.pageCount || 1));
    const requestedPage = Math.floor(Number(fd.get("page") || 1) || 1);
    const nextPage = Math.max(1, Math.min(maxPage, requestedPage));
    state.maps.page[state.maps.view] = nextPage;
    await guarded(`page-jump-${state.maps.view}`, () => loadMaps(true));
    return;
  }

  const mapsFilter = e.target.closest("[data-form-kind='maps-filters']");
  if (mapsFilter) {
    e.preventDefault();
    const fd = new FormData(mapsFilter);
    const v = fd.get("view") || state.maps.view; state.maps.view = String(v); state.maps.page[state.maps.view] = 1;
    const nf = {}; for (const [k, val] of fd.entries()) { if (k === "view") continue; nf[k] = String(val || ""); }
    state.maps.filters[state.maps.view] = nf;
    setHash("maps", { view: state.maps.view });
    await guarded("maps-filters", () => loadMaps(true)); return;
  }

  const actFilter = e.target.closest("[data-form-kind='activity-filters']");
  if (actFilter) {
    e.preventDefault();
    const fd = new FormData(actFilter);
    state.activity.filters.kind = String(fd.get("kind") || "all");
    state.activity.filters.jobKey = String(fd.get("jobKey") || "");
    state.activity.filters.mapUid = String(fd.get("mapUid") || "").trim();
    state.activity.limit = Number(fd.get("limit") || 40) || 40;
    state.activity.cursor = 0;
    setHash("activity", { kind: state.activity.filters.kind, jobKey: state.activity.filters.jobKey, mapUid: state.activity.filters.mapUid });
    await guarded("activity-filters", loadActivity); return;
  }

  const moveForm = e.target.closest("[data-drawer-form='move-map']");
  if (moveForm) {
    e.preventDefault();
    const fd = new FormData(moveForm);
    const uid = String(fd.get("mapUid") || ""); const camp = String(fd.get("campaignName") || "").trim(); const slot = Number(fd.get("slot") || 1) || 1;
    await guarded(`move-${uid}`, async () => {
      await post(`/api/v1/admin/maps/${encodeURIComponent(uid)}/campaign`, { campaignName: camp, slot });
      await loadMaps(true); await loadDashboard();
      const row = findRow(uid);
      if (row) openDrawer({ type: "map", kicker: "Map Detail", title: stripFmt(row.mapName || row.mapUid), subtitle: row.mapUid, payload: row });
      toast(`Moved ${uid} to ${camp}.`, "ok");
    }); return;
  }

  const similaritySelectionForm = e.target.closest("[data-drawer-form='similarity-selection']");
  if (similaritySelectionForm) {
    e.preventDefault();
    const fd = new FormData(similaritySelectionForm);
    const mapUid = String(fd.get("mapUid") || "").trim();
    const candidateMapUids = fd.getAll("candidateMapUid").map((value) => String(value || "").trim()).filter(Boolean);
    const selectionMode = String(e.submitter?.value || "apply").trim().toLowerCase();
    if (!candidateMapUids.length) {
      toast("Select at least one similar map first.", "warn");
      return;
    }
    await guarded(`similarity-selection:${mapUid}`, async () => {
      const payload = await post(`/api/v1/admin/naming/candidates/${encodeURIComponent(mapUid)}/similarity-selection`, {
        candidateMapUids,
        reviewState: selectionMode === "approve" ? "approved" : undefined,
        reviewNote:
          selectionMode === "approve"
            ? "admin-v2: approved selected similarity candidates"
            : undefined,
      });
      await Promise.all([loadMaps(true), loadDashboard()]);
      openNamingDetailDrawer(payload?.detail || payload);
      toast(`Similarity selection saved for ${mapUid}.`, "ok");
    });
    return;
  }

  const targetedForm = e.target.closest("[data-drawer-form='targeted-displayname']");
  if (targetedForm) {
    e.preventDefault();
    const fd = new FormData(targetedForm);
    await guarded("targeted-dn", async () => {
      await post("/api/v1/admin/hook/altered/live/mapper-sync/accounts", { accountIds: String(fd.get("accountIds") || "").trim(), force: fd.get("force") === "on" });
      closeDrawer(); await Promise.all([loadJobs(), loadDashboard()]);
      toast("Targeted sync triggered.", "ok");
    }); return;
  }

  const clubForm = e.target.closest("[data-drawer-form='club-config']");
  if (clubForm) {
    e.preventDefault();
    const fd = new FormData(clubForm);
    await guarded(`club-cfg:${fd.get("hookKey")}`, async () => {
      await post("/api/v1/admin/hook/altered/config", {
        hookKey: String(fd.get("hookKey") || "").trim(),
        clubId: Number(fd.get("clubId") || 0) || 0,
        clubName: String(fd.get("clubName") || "").trim(),
        sourceLabel: String(fd.get("sourceLabel") || "").trim(),
        enabled: fd.get("enabled") === "on",
        autoTrackNewMaps: fd.get("autoTrackNewMaps") === "on",
      });
      closeDrawer(); await Promise.all([loadJobs(), loadSettings(), loadDashboard()]);
      toast("Club updated.", "ok");
    }); return;
  }
}

/* ── Action Handlers ──────────────────────────────────────── */
async function handleJobAction(action, jobKey) {
  const routes = {
    "run-full-sync":          { url: "/api/v1/admin/hook/altered/live/monitor/run",          body: {}, msg: "Full sync triggered." },
    "run-discovery-sync":     { url: "/api/v1/admin/hook/altered/live/monitor/run-discovery", body: {}, msg: "Discovery triggered." },
    "run-map-local-copy-backfill": { url: "/api/v1/admin/maps/local-store/backfill", body: {}, msg: "Local map-copy backfill triggered." },
    "retry-map-local-copy-errors": { url: "/api/v1/admin/maps/local-store/retry-errors", body: {}, msg: "Local map-copy retry triggered." },
    "run-tracker-now":        { url: "/api/v1/admin/tracker/run-now",                        body: {}, msg: "Tracker run triggered." },
    "run-displayname-cached": { url: "/api/v1/admin/hook/altered/live/mapper-sync/run",      body: {}, msg: "DN sync triggered." },
    "run-displayname-force":  { url: "/api/v1/admin/hook/altered/live/mapper-sync/run",      body: { force: true }, msg: "Force DN sync triggered." },
    "run-displayname-priority":{ url: "/api/v1/admin/hook/altered/live/mapper-sync/run",     body: { priority: true }, msg: "Priority DN sync triggered." },
    "run-ops-scheduler":      { url: "/api/v1/admin/ops/scheduler/run-now",                  body: {}, msg: "Ops scheduler triggered." },
  };

  if (action === "view-history") { await openJobHistory(jobKey); return; }
  if (action === "run-displayname-targeted") {
    openDrawer({ type: "targeted-displayname", kicker: "Display Name", title: "Sync Specific IDs", subtitle: "Target known Ubisoft account IDs.", payload: {} }); return;
  }
  const cfg = routes[action]; if (!cfg) return;
  await guarded(`${action}:${jobKey}`, async () => {
    await post(cfg.url, cfg.body);
    await Promise.all([loadDashboard(), loadJobs()]);
    toast(cfg.msg, "ok");
  });
}

async function handleMapCmd(cmd, uid) {
  const row = findRow(uid); if (!row) return;
  if (cmd === "history") {
    state.activity.filters.mapUid = uid; state.activity.filters.kind = "all"; state.activity.cursor = 0;
    setHash("activity", { mapUid: uid }); await guarded(`map-hist-${uid}`, loadActivity); return;
  }
  if (cmd === "track" || cmd === "pause") {
    const body = cmd === "track" ? { tracked: true, status: "live" } : { tracked: false, status: "paused" };
    await guarded(`${cmd}-${uid}`, async () => {
      await post(`/api/v1/admin/maps/${encodeURIComponent(uid)}/tracking`, body);
      await Promise.all([loadMaps(true), loadDashboard()]);
      const upd = findRow(uid);
      if (upd && state.drawer.open && state.drawer.type === "map") openDrawer({ type: "map", kicker: "Map Detail", title: stripFmt(upd.mapName || upd.mapUid), subtitle: upd.mapUid, payload: upd });
      toast(`${cmd === "track" ? "Tracking enabled" : "Paused"} for ${uid}.`, "ok");
    }); return;
  }
  if (cmd === "check-now") {
    const userId = row.detail?.opsMonitorUserId;
    if (!userId) { toast("No ops user attached.", "warn"); return; }
    await guarded(`check-${uid}`, async () => {
      await post(`/api/v1/admin/ops/maps/${encodeURIComponent(uid)}/check-now`, { userId, reason: "admin-v2" });
      await Promise.all([loadActivity(), loadDashboard()]);
      toast(`Check triggered for ${uid}.`, "ok");
    });
  }
}

async function handleClubAction(action, hookKey, clubId) {
  const club = findClub({ hookKey, clubId }); if (!club) return;
  if (action === "manage") { openDrawer({ type: "club-config", kicker: "Club", title: stripFmt(club.clubName || `Club ${club.clubId}`), subtitle: `${club.hookKey || "hook"} / ${club.clubId || "-"}`, payload: club }); return; }
  if (action === "sync") {
    await guarded(`club-sync:${club.hookKey}`, async () => {
      await post("/api/v1/admin/hook/altered/live/sync", { hookKey: club.hookKey, clubId: club.clubId, sourceLabel: club.sourceLabel, note: `admin-v2:${club.hookKey}` });
      await Promise.all([loadJobs(), loadSettings(), loadDashboard()]);
      toast(`Sync triggered for ${stripFmt(club.clubName || club.clubId)}.`, "ok");
    }); return;
  }
  if (action === "monitor") {
    await guarded(`club-mon:${club.clubId}`, async () => {
      await post("/api/v1/admin/hook/altered/live/monitor/config", { clubId: club.clubId });
      await Promise.all([loadSettings(), loadDashboard()]);
      toast(`${stripFmt(club.clubName || club.clubId)} is now the monitor club.`, "ok");
    });
  }
}

async function handleSourceAction(action, sourceKey) {
  const source = findSource(sourceKey); if (!source) return;
  if (action === "sync") {
    await guarded(`source-sync:${source.sourceKey}`, async () => {
      await post(`/api/v1/admin/sources/${encodeURIComponent(String(source.sourceKey || ""))}/sync`, {});
      await Promise.all([loadJobs(), loadSettings(), loadDashboard(), loadMaps(true)]);
      toast(`Sync triggered for ${stripFmt(source.displayName || source.sourceKey)}.`, "ok");
    });
  }
}

async function submitSettings(form) {
  const key = form.dataset.settingsForm;
  const fd = new FormData(form);
  const chk = n => fd.get(n) === "on";
  const num = n => { const r = String(fd.get(n) ?? "").trim(); return r ? Number(r) : undefined; };
  const txt = n => String(fd.get(n) ?? "").trim();

  const cfgs = {
    hook: { url: "/api/v1/admin/hook/altered/config", body: { clubId: num("clubId"), clubName: txt("clubName"), sourceLabel: txt("sourceLabel"), enabled: chk("enabled"), autoTrackNewMaps: chk("autoTrackNewMaps") }, msg: "Hook config saved." },
    monitor: { url: "/api/v1/admin/hook/altered/live/monitor/config", body: { enabled: chk("enabled"), discoveryEnabled: chk("discoveryEnabled"), scheduleMode: txt("scheduleMode"), intervalSeconds: num("intervalSeconds"), dailyHourUtc: num("dailyHourUtc"), dailyMinuteUtc: num("dailyMinuteUtc"), activityPageSize: num("activityPageSize"), trackerChunkSize: num("trackerChunkSize"), discoveryIntervalSeconds: num("discoveryIntervalSeconds"), discoveryCampaignLimit: num("discoveryCampaignLimit"), discoveryActivityPageSize: num("discoveryActivityPageSize"), activeOnly: chk("activeOnly"), fetchMapDetails: chk("fetchMapDetails") }, msg: "Monitor config saved." },
    displayname: { url: "/api/v1/admin/hook/altered/live/mapper-sync/config", body: { enabled: chk("enabled"), bootstrapIntervalSeconds: num("bootstrapIntervalSeconds"), maintenanceIntervalSeconds: num("maintenanceIntervalSeconds"), priorityIntervalSeconds: num("priorityIntervalSeconds"), batchSize: num("batchSize"), priorityBatchSize: num("priorityBatchSize"), priorityTopLimit: num("priorityTopLimit"), priorityRefreshSeconds: num("priorityRefreshSeconds"), knownAccountsRefreshSeconds: num("knownAccountsRefreshSeconds"), cacheTtlSeconds: num("cacheTtlSeconds"), priorityCacheTtlSeconds: num("priorityCacheTtlSeconds"), minRequestGapMs: num("minRequestGapMs") }, msg: "Display name config saved." },
    ops: { url: "/api/v1/admin/ops/scheduler/config", body: { enabled: chk("enabled"), tickSeconds: num("tickSeconds"), maxMapsPerRun: num("maxMapsPerRun") }, msg: "Ops config saved." },
    bot: { url: "/api/v1/admin/ops/bot/config", body: { enabled: chk("enabled"), announceWrChanges: chk("announceWrChanges"), botName: txt("botName"), guildId: txt("guildId"), channelId: txt("channelId"), webhookUrl: txt("webhookUrl"), mentionRoleId: txt("mentionRoleId"), footerText: txt("footerText") }, msg: "Bot config saved." },
  };
  const cfg = cfgs[key]; if (!cfg) return;
  await guarded(`settings-${key}`, async () => {
    await post(cfg.url, cfg.body);
    await Promise.all([loadSettings(), loadDashboard(), loadJobs()]);
    toast(cfg.msg, "ok");
  });
}

async function doNameReview({ mapUid, reviewState, manualName = "" }) {
  await guarded(`review-${mapUid}`, async () => {
    await post(`/api/v1/admin/naming/candidates/${encodeURIComponent(mapUid)}/review`, { reviewState, manualName, reviewNote: `admin-v2: ${reviewState}` });
    await Promise.all([loadMaps(true), loadDashboard()]);
    toast(`Review updated for ${mapUid}.`, "ok");
  });
}

async function openJobHistory(jobKey) {
  const p = await api(`/api/v1/admin/jobs/${encodeURIComponent(jobKey)}/history?limit=20&cursor=0`);
  openDrawer({ type: "job-history", kicker: "Run History", title: p.label || "Job History", subtitle: jobKey, payload: { jobKey, items: p.items || [], total: p.total || 0, nextCursor: p.nextCursor, hasMore: p.hasMore } });
}

async function loadMoreHistory(jobKey) {
  const cur = state.drawer.payload || {};
  if (!cur.hasMore) return;
  const p = await api(`/api/v1/admin/jobs/${encodeURIComponent(jobKey)}/history?limit=20&cursor=${Number(cur.nextCursor || 0)}`);
  openDrawer({ type: "job-history", kicker: "Run History", title: state.drawer.title, subtitle: jobKey, payload: { jobKey, items: [...(cur.items || []), ...(p.items || [])], total: p.total || cur.total || 0, nextCursor: p.nextCursor, hasMore: p.hasMore } });
}

async function doLogout() {
  await guarded("logout", async () => {
    await fetch("/api/v1/admin/auth/logout", { method: "POST", credentials: "same-origin" });
    closeDrawer(); state.auth = { authenticated: false, loginUrl: "/admin-login/" };
    location.replace("/admin-login/");
  });
}

/* ── Drawer Helpers ───────────────────────────────────────── */
function startDrawerResize(event) {
  if (!state.drawer.open || window.innerWidth <= 1040) return;
  event.preventDefault();
  const rect = el.drawer?.getBoundingClientRect();
  state.drawerUi.resize = {
    startX: event.clientX,
    startWidth: rect?.width || state.drawerUi.width || DEFAULT_DRAWER_WIDTH,
  };
  el.drawer?.classList.add("drawer--resizing");
  document.body.style.userSelect = "none";
}

function onPointerMove(event) {
  const resize = state.drawerUi.resize;
  if (!resize) return;
  const delta = resize.startX - event.clientX;
  state.drawerUi.width = clampDrawerWidth(resize.startWidth + delta);
  el.drawer?.style.setProperty("--drawer-width", `${state.drawerUi.width}px`);
}

function stopDrawerResize() {
  if (!state.drawerUi.resize) return;
  state.drawerUi.resize = null;
  el.drawer?.classList.remove("drawer--resizing");
  document.body.style.userSelect = "";
  saveDrawerWidth(state.drawerUi.width);
}

function syncDrawerTabs() {
  const buttons = el.drawerBody?.querySelectorAll("[data-drawer-tab]");
  const panels = el.drawerBody?.querySelectorAll("[data-drawer-tab-panel]");
  if (!buttons?.length || !panels?.length) return;
  const availableTabs = Array.from(buttons)
    .map((button) => String(button.getAttribute("data-drawer-tab") || "").trim())
    .filter(Boolean);
  const requestedTab = String(state.drawerUi.activeTab || "").trim();
  const active =
    (requestedTab && availableTabs.includes(requestedTab) ? requestedTab : "") ||
    availableTabs[0] ||
    "overview";
  state.drawerUi.activeTab = active;
  buttons.forEach((button) => {
    const isActive = button.getAttribute("data-drawer-tab") === active;
    button.classList.toggle("drawer-tabbtn--active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  panels.forEach((panel) => {
    panel.hidden = panel.getAttribute("data-drawer-tab-panel") !== active;
  });
}

function normalizeSimilaritySearchText(value) {
  return stripFmt(String(value ?? ""))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildSimilarityMatchSearchText(match = {}) {
  return normalizeSimilaritySearchText([
    match.mapName || match.mapUid || "",
    match.campaignName || "",
    match.mapUid || "",
    match.slot != null ? `slot ${match.slot}` : "",
  ].join(" "));
}

function syncNamingSimilaritySearch() {
  const searchInput = el.drawerBody?.querySelector("[data-naming-similarity-search-input]");
  if (!(searchInput instanceof HTMLInputElement)) return;

  const rows = Array.from(el.drawerBody?.querySelectorAll("[data-naming-similarity-row]") || []);
  const countLabel = el.drawerBody?.querySelector("[data-naming-similarity-search-count]");
  const emptyState = el.drawerBody?.querySelector("[data-naming-similarity-search-empty]");
  const pagination = el.drawerBody?.querySelector("[data-naming-similarity-pagination]");
  const pageLabel = el.drawerBody?.querySelector("[data-naming-similarity-page-label]");
  const prevButton = el.drawerBody?.querySelector("[data-naming-similarity-page='prev']");
  const nextButton = el.drawerBody?.querySelector("[data-naming-similarity-page='next']");
  const query = normalizeSimilaritySearchText(state.drawerUi.namingSimilaritySearch || "");

  if (searchInput.value !== state.drawerUi.namingSimilaritySearch) {
    searchInput.value = state.drawerUi.namingSimilaritySearch || "";
  }

  const filteredRows = [];
  rows.forEach((row) => {
    if (!(row instanceof HTMLElement)) return;
    const searchText = normalizeSimilaritySearchText(row.getAttribute("data-similarity-search-text") || "");
    const matches = !query || searchText.includes(query);
    if (matches) {
      filteredRows.push(row);
    } else {
      row.hidden = true;
    }
  });

  const totalMatches = filteredRows.length;
  const totalPages = totalMatches > 0 ? Math.ceil(totalMatches / NAMING_SIMILARITY_PAGE_SIZE) : 0;
  const safePage =
    totalPages > 0
      ? Math.min(Math.max(1, Number(state.drawerUi.namingSimilarityPage || 1)), totalPages)
      : 1;
  state.drawerUi.namingSimilarityPage = safePage;

  const pageStart = totalPages > 0 ? (safePage - 1) * NAMING_SIMILARITY_PAGE_SIZE : 0;
  const pageEnd = totalPages > 0 ? Math.min(totalMatches, pageStart + NAMING_SIMILARITY_PAGE_SIZE) : 0;

  filteredRows.forEach((row, index) => {
    if (!(row instanceof HTMLElement)) return;
    row.hidden = index < pageStart || index >= pageEnd;
  });

  if (countLabel instanceof HTMLElement) {
    const rangeText =
      totalMatches > 0
        ? `${fmtNum(pageStart + 1)}-${fmtNum(pageEnd)} of ${fmtNum(totalMatches)}`
        : `0 of ${fmtNum(rows.length)}`;
    countLabel.textContent = query
      ? `Showing ${rangeText} filtered matches. Selected rows stay checked while filtered.`
      : `${fmtNum(rows.length)} ranked matches. Showing ${rangeText}.`;
  }

  if (emptyState instanceof HTMLElement) {
    emptyState.hidden = totalMatches !== 0;
  }

  if (pagination instanceof HTMLElement) {
    pagination.hidden = totalPages <= 1;
  }

  if (pageLabel instanceof HTMLElement) {
    pageLabel.textContent = totalPages > 0 ? `Page ${fmtNum(safePage)} of ${fmtNum(totalPages)}` : "";
  }

  if (prevButton instanceof HTMLButtonElement) {
    prevButton.disabled = totalPages <= 1 || safePage <= 1;
  }

  if (nextButton instanceof HTMLButtonElement) {
    nextButton.disabled = totalPages <= 1 || safePage >= totalPages;
  }
}

function openDrawer(d = {}) {
  const { activeTab = "", drawerTab = "", width = null, drawerWidth = null, ...drawerState } = d || {};
  const rawWidth = width ?? drawerWidth;
  const requestedWidth = Number(rawWidth);
  if (Number.isFinite(requestedWidth) && requestedWidth > 0) {
    state.drawerUi.width = clampDrawerWidth(requestedWidth);
    el.drawer?.style.setProperty("--drawer-width", `${state.drawerUi.width}px`);
    saveDrawerWidth(state.drawerUi.width);
  }
  state.drawer = { open: true, ...drawerState };
  state.drawerUi.activeTab = String(activeTab || drawerTab || "overview").trim() || "overview";
  renderDrawer();
}
function closeDrawer() {
  stopDrawerResize();
  state.drawerUi.namingSimilaritySearch = "";
  state.drawerUi.namingSimilarityPage = 1;
  state.drawer = { open: false, type: null, title: "", subtitle: "", kicker: "Detail", payload: null };
  renderDrawer();
}

function openNamingDetailDrawer(payload, { activeTab = "similarity", width = NAMING_DETAIL_DRAWER_WIDTH } = {}) {
  const mapUid = String(payload?.map?.mapUid || payload?.map?.uid || "").trim();
  const currentMapUid =
    state.drawer?.type === "naming-detail"
      ? String(state.drawer?.payload?.map?.mapUid || state.drawer?.payload?.map?.uid || "").trim()
      : "";
  if (mapUid !== currentMapUid) {
    state.drawerUi.namingSimilaritySearch = "";
    state.drawerUi.namingSimilarityPage = 1;
  }
  openDrawer({
    type: "naming-detail",
    kicker: "Naming Detail",
    title: stripFmt(payload?.map?.name || mapUid),
    subtitle: mapUid,
    payload,
    activeTab,
    width,
  });
}

/* ── Helper Renderers ─────────────────────────────────────── */
function renderAlert(a) {
  return `<div class="alert-row">
    <span class="pill ${toneClass(a.level)}" style="flex-shrink:0;">${esc(toneLabel(a.level))}</span>
    <div class="alert-row-body">
      <strong>${esc(a.title || "Alert")}</strong>
      <span class="alert-row-detail">${esc(a.body || "")} <span class="alert-row-src">${esc(a.source || "")} &middot; ${esc(fmtDateTime(a.createdAt))}</span></span>
    </div>
    ${a.actionTarget ? `<button class="btn ghost small" type="button" data-alert-target="${esc(a.actionTarget)}">${esc(a.actionLabel || "Go")}</button>` : ""}
  </div>`;
}

function renderTlItem(ev) {
  return `<div class="tl-row" data-open-event='${esc(JSON.stringify(ev))}'>
    <span class="pill ${toneClass(ev.status || ev.kind)}" style="flex-shrink:0;">${esc(toneLabel(ev.status || ev.kind))}</span>
    <div class="tl-row-body">
      <strong>${escN(ev.title || "Event")}</strong>
      <span class="tl-row-summary">${escN(ev.summary || "")}</span>
    </div>
    <span class="tl-row-time">${esc(fmtTimeAgo(ev.createdAt))}</span>
  </div>`;
}

function statCard(label, value, note = "") {
  return `<div class="stat-card"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>${note ? `<div class="note">${esc(note)}</div>` : ""}</div>`;
}

function jobStat(label, value) {
  return `<div class="job-stat"><div class="label">${esc(label)}</div><strong>${esc(value)}</strong></div>`;
}

function jobExtra(label, value) {
  return `<div class="job-extra-item"><div class="label">${esc(label)}</div><strong>${esc(value)}</strong></div>`;
}

function kv(label, value) {
  return `<div class="kv"><div class="label">${esc(label)}</div><strong>${esc(String(value ?? "-"))}</strong></div>`;
}

function kvN(label, value) {
  return `<div class="kv"><div class="label">${esc(label)}</div><strong>${escN(String(value ?? "-"))}</strong></div>`;
}

function subtab(view, label, active) {
  return `<button class="subtab ${view === active ? "active" : ""}" type="button" data-maps-view="${esc(view)}">${esc(label)}</button>`;
}

function filterBar(formKind, fields, actions) {
  return `<div class="filter-bar"><form data-form-kind="${esc(formKind)}">${fields}<div style="display:flex;gap:.35rem;align-items:end;">${actions}</div></form></div>`;
}

function tableCard(label, summary, tableHtml) {
  return `<div class="card"><div class="card-header"><div><p class="ws-label">${esc(label)}</p><h3>${summary}</h3></div></div><div class="table-wrap" style="margin-top:.5rem;">${tableHtml}</div></div>`;
}

function renderNamingFlags(candidate = {}) {
  const similarityMeta = similarityStateMeta(candidate);
  const similarityWarnings = Array.isArray(candidate?.similarityDetails?.diagnosticWarnings)
    ? candidate.similarityDetails.diagnosticWarnings.filter(Boolean)
    : [];
  const flagRows = [
    {
      tone:
        candidate?.localFileStatus === "ready"
          ? "tone-success"
          : candidate?.localFileStatus === "error"
            ? "tone-warn"
            : "tone-warn",
      label: `local:${candidate?.localFileStatus || "missing"}`,
    },
    {
      tone:
        candidate?.signatureStatus === "ready"
          ? "tone-success"
          : candidate?.signatureStatus === "error"
            ? "tone-warn"
            : "tone-warn",
      label: `sig:${candidate?.signatureStatus || "missing"}`,
    },
    {
      tone: similarityMeta.tone,
      label: similarityMeta.label,
    },
    ...(similarityWarnings.length
      ? [{
          tone: "tone-warn",
          label: "sim:degraded",
        }]
      : []),
    ...(candidate?.parserWarning
      ? [{
          tone: "tone-warn",
          label: "regex:warn",
        }]
      : []),
  ];
  return `<div class="naming-flag-stack">${flagRows
    .map((flag) => `<span class="pill ${flag.tone}">${esc(flag.label)}</span>`)
    .join("")}</div>`;
}

function renderNamingSimilarityPreview(candidate = {}) {
  const matches = Array.isArray(candidate?.similarityCandidateMatches)
    ? candidate.similarityCandidateMatches.slice(0, 5)
    : [];
  if (!matches.length) {
    return `<p class="inline-empty">No close maps.</p>`;
  }
  const topScore = Number.isFinite(Number(matches[0]?.score)) ? Number(matches[0].score) : null;
  return `<div class="naming-sim-list">${matches
    .map((match, i) => {
      const mapName = match?.mapName || match?.mapUid || "-";
      const score = Number.isFinite(Number(match?.score)) ? Number(match.score) : null;
      const scoreStr = score != null ? score.toFixed(6) : "-";
      const diffStr = i > 0 && score != null && topScore != null
        ? (score - topScore).toFixed(3)
        : "";
      return `<div class="naming-sim-row">
        <span class="naming-sim-name">${escN(mapName)}</span>
        ${diffStr ? `<span class="naming-sim-diff">${esc(diffStr)}</span>` : ""}
        <span class="naming-sim-score">${esc(scoreStr)}</span>
      </div>`;
    })
    .join("")}</div>`;
}

function configSection(id, title, defaultOpen, body) {
  return `<div class="config-section ${defaultOpen ? "open" : ""}" id="${esc(id)}">
    <div class="config-header"><h3>${esc(title)}</h3><span class="config-toggle">&#9660;</span></div>
    <div class="config-body">${body}</div>
  </div>`;
}

function field(label, name, type, value, attrs = {}) {
  const extra = Object.entries(attrs).map(([k, v]) => `${k}="${esc(String(v))}"`).join(" ");
  return `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" value="${esc(String(value ?? ""))}" ${extra} /></label>`;
}

function checkField(label, name, checked) {
  return `<div class="field check"><span>${esc(label)}</span><input name="${esc(name)}" type="checkbox" ${checked ? "checked" : ""} /></div>`;
}

function selOpts(options, selected) {
  return options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(selected ?? "") ? "selected" : ""}>${esc(l)}</option>`).join("");
}

function pagination({ page, pageCount, total, unfilteredTotal, hasMore, prevAction, nextAction }) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageCount = Math.max(1, Number(pageCount) || 1);
  const isFiltered = unfilteredTotal !== undefined && Number(unfilteredTotal) !== Number(total);
  const totalLabel = isFiltered
    ? `${esc(fmtNum(total))} of ${esc(fmtNum(unfilteredTotal))} shown`
    : `${esc(fmtNum(total))} total`;
  return `<div class="pagination">
    <span class="page-info">Page <strong>${esc(String(safePage))}</strong> of <strong>${esc(String(safePageCount))}</strong> &middot; ${totalLabel}</span>
    <div class="page-btns">
      <button class="btn ghost small" type="button" data-page-action="maps-first-page" ${safePage > 1 ? "" : "disabled"}>First</button>
      <button class="btn ghost small" type="button" data-page-action="${esc(prevAction)}" ${safePage > 1 ? "" : "disabled"}>Previous</button>
      <form class="page-jump-form" data-form-kind="maps-page-jump" data-page-count="${esc(String(safePageCount))}">
        <span class="page-jump-copy">Go to</span>
        <input
          class="page-jump-input"
          name="page"
          type="number"
          min="1"
          max="${esc(String(safePageCount))}"
          value="${esc(String(safePage))}"
          inputmode="numeric"
        />
        <button class="btn outline small" type="submit">Go</button>
      </form>
      <button class="btn outline small" type="button" data-page-action="${esc(nextAction)}" ${hasMore ? "" : "disabled"}>Next</button>
      <button class="btn outline small" type="button" data-page-action="maps-last-page" ${safePage < safePageCount ? "" : "disabled"}>Last</button>
    </div>
  </div>`;
}

function loading(msg) { return `<div class="empty-state"><span class="pill tone-muted">Loading</span><h3>${esc(msg)}</h3></div>`; }
function emptyState(title, copy, tone = "muted") { return `<div class="empty-state"><span class="pill tone-${esc(tone)}">Empty</span><h3>${esc(title)}</h3><p>${esc(copy)}</p></div>`; }

/* ── Toast Notifications ──────────────────────────────────── */
function createToast(msg, type = "info", { autoHideMs = 3500, busy = false } = {}) {
  const div = document.createElement("div");
  div.className = `toast toast-${type}${busy ? " toast-busy" : ""}`;
  div.innerHTML = `<span class="toast-dot"></span>${esc(msg)}`;
  el.toastBox.appendChild(div);

  const dismiss = () => div.remove();
  if (Number(autoHideMs || 0) > 0) {
    window.setTimeout(() => {
      div.classList.add("leaving");
      div.addEventListener("animationend", dismiss);
    }, autoHideMs);
  }
  return dismiss;
}

function toast(msg, type = "info") {
  createToast(msg, type, { autoHideMs: 3500 });
}

function toastBusy(msg, type = "info") {
  return createToast(msg, type, { autoHideMs: 0, busy: true });
}

function setBusyButtonsState(key, busy) {
  const selectors = {
    "naming-rebuild": "[data-run-naming-process]",
    "naming-similarity": "[data-run-naming-similarity]",
  };
  const selector = selectors[key];
  if (!selector) return;
  document.querySelectorAll(selector).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (busy) {
      node.setAttribute("disabled", "disabled");
      if (!node.hasAttribute("data-idle-label")) {
        node.setAttribute("data-idle-label", node.textContent || "");
      }
      node.textContent = "Running...";
      return;
    }
    node.removeAttribute("disabled");
    if (node.hasAttribute("data-idle-label")) {
      node.textContent = node.getAttribute("data-idle-label") || node.textContent || "";
      node.removeAttribute("data-idle-label");
    }
  });
}

/* ── Data Helpers ─────────────────────────────────────────── */
function findActiveButton() {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    const direct = active.closest("button, a.btn, [role='button']");
    if (direct) return direct;
  }
  if (state.lastActionControl instanceof HTMLElement && document.contains(state.lastActionControl)) {
    return state.lastActionControl;
  }
  return null;
}

function lockButtonWhileBusy(node, { label = "Working..." } = {}) {
  if (!(node instanceof HTMLElement)) return () => {};
  const shouldUpdateLabel = label !== null && label !== undefined && String(label) !== "";
  const previousText = node.textContent || "";
  const previousDisabled = node.hasAttribute("disabled");
  const previousAria = node.getAttribute("aria-disabled");
  const previousPointerEvents = node.style.pointerEvents;
  const previousOpacity = node.style.opacity;

  if (!previousDisabled) node.setAttribute("disabled", "disabled");
  node.setAttribute("aria-disabled", "true");
  node.style.pointerEvents = "none";
  node.style.opacity = "0.75";
  if (shouldUpdateLabel && (node.tagName === "BUTTON" || node.classList.contains("btn"))) {
    node.textContent = label;
  }

  return () => {
    if (!previousDisabled) node.removeAttribute("disabled");
    if (previousAria === null) node.removeAttribute("aria-disabled");
    else node.setAttribute("aria-disabled", previousAria);
    node.style.pointerEvents = previousPointerEvents;
    node.style.opacity = previousOpacity;
    if (shouldUpdateLabel && (node.tagName === "BUTTON" || node.classList.contains("btn"))) {
      node.textContent = previousText;
    }
  };
}

function getAllClubs() {
  const fromSettings = Array.isArray(state.settings?.projectClubs) ? state.settings.projectClubs : [];
  if (fromSettings.length) return fromSettings;
  const fromJobs = Array.isArray(state.clubs?.projectClubs) ? state.clubs.projectClubs : [];
  if (fromJobs.length) return fromJobs;
  const fromJobs2 = Array.isArray(state.jobs?.projectClubs) ? state.jobs.projectClubs : [];
  if (fromJobs2.length) return fromJobs2;
  return Array.isArray(state.dashboard?.projectClubs) ? state.dashboard.projectClubs : [];
}

function getAllSources() {
  const fromSettings = Array.isArray(state.settings?.projectSources) ? state.settings.projectSources : [];
  if (fromSettings.length) return fromSettings;
  const fromJobs = Array.isArray(state.jobs?.projectSources) ? state.jobs.projectSources : [];
  if (fromJobs.length) return fromJobs;
  return Array.isArray(state.dashboard?.projectSources) ? state.dashboard.projectSources : [];
}

function findClub({ hookKey = "", clubId = 0 }) {
  const hk = String(hookKey || "").trim().toLowerCase();
  const cid = Number(clubId || 0) || 0;
  return getAllClubs().find(c => {
    if (hk && String(c?.hookKey || "").trim().toLowerCase() === hk) return true;
    if (cid && Number(c?.clubId || 0) === cid) return true;
    return false;
  }) || null;
}

function findSource(sourceKey = "") {
  const key = String(sourceKey || "").trim().toLowerCase();
  if (!key) return null;
  return getAllSources().find((source) => String(source?.sourceKey || "").trim().toLowerCase() === key) || null;
}

function findRow(uid) {
  return (Array.isArray(state.maps.data?.rows) ? state.maps.data.rows : []).find(r => String(r.mapUid) === String(uid)) || null;
}

function buildNamingDetailFallbackPayload(mapUid) {
  const uid = String(mapUid || "").trim();
  const row = findRow(uid);
  if (!row) {
    return {
      map: {
        mapUid: uid,
        name: uid || "Map",
        campaign: "Unassigned",
        slot: null,
      },
      diagnostics: {},
      loading: true,
      loadError: "",
    };
  }

  const candidate = {
    mapUid: row.mapUid || uid,
    originalName: row.originalName || "",
    sanitizedName: row.sanitizedName || "",
    proposedName: row.proposedName || null,
    manualName: row.manualName || null,
    finalName: row.finalName || row.proposedName || row.sanitizedName || row.originalName || row.mapUid || uid,
    parserPattern: row.parserPattern || null,
    parserConfidence: row.parserConfidence != null ? Number(row.parserConfidence) : null,
    mapNumber: row.mapNumber != null ? Number(row.mapNumber) : null,
    mapNumbers: Array.isArray(row.mapNumbers) ? row.mapNumbers : [],
    automationState: row.automationState || null,
    reviewState: row.reviewState || null,
    requiresRegex: Boolean(row.requiresRegex),
    campaign: row.campaign || "Unassigned",
    campaignId: row.campaignId != null ? Number(row.campaignId) : null,
    slot: row.slot != null ? Number(row.slot) : null,
    tracked: Boolean(row.tracked),
    status: row.status || "live",
    sourceVersion: row.sourceVersion || null,
  };
  const similarityDetails =
    row.similarityDetails && typeof row.similarityDetails === "object"
      ? row.similarityDetails
      : {};
  const similarityMatches = Array.isArray(row.similarityCandidateMatches)
    ? row.similarityCandidateMatches
    : [];

  return {
    map: {
      mapUid: candidate.mapUid,
      name: candidate.finalName || candidate.originalName || candidate.mapUid,
      campaign: candidate.campaign,
      slot: candidate.slot,
    },
    localFile:
      row.localFileStatus || row.localFilePath
        ? {
            status: row.localFileStatus || null,
            relativePath: row.localFilePath || null,
          }
        : null,
    storedCandidate: candidate,
    freshCandidate: candidate,
    similarity:
      row.similarityStatus || similarityMatches.length || Object.keys(similarityDetails).length
        ? {
            assignedMapNumbers: candidate.mapNumbers,
            topScore: row.similarityTopScore != null ? Number(row.similarityTopScore) : null,
            confidence: row.similarityConfidence != null ? Number(row.similarityConfidence) : null,
            referenceCampaignName: row.similarityReferenceCampaignName || null,
            primaryReferenceSlot:
              row.similarityReferenceSlot != null ? Number(row.similarityReferenceSlot) : null,
            candidateMatches: similarityMatches,
            details: similarityDetails,
          }
        : null,
    signature:
      row.signatureStatus || row.signatureError
        ? {
            sourceStatus: row.signatureStatus || null,
            sourceError: row.signatureError || null,
          }
        : null,
    diagnostics: {
      staleStoredCandidate: false,
      unmatchedReason: row.similarityMatchWarning || "",
      autoApproval: null,
      autoResolvableNow: Array.isArray(candidate.mapNumbers) && candidate.mapNumbers.length > 0,
    },
    loading: true,
    loadError: "",
  };
}

function mergeNamingDetailPayload(basePayload, detailPayload) {
  const base = basePayload && typeof basePayload === "object" ? basePayload : {};
  const detail = detailPayload && typeof detailPayload === "object" ? detailPayload : {};
  return {
    ...base,
    ...detail,
    map: {
      ...(base.map || {}),
      ...(detail.map || {}),
    },
    localFile: detail.localFile ?? base.localFile ?? null,
    storedCandidate: detail.storedCandidate ?? base.storedCandidate ?? null,
    freshNameCandidate: detail.freshNameCandidate ?? base.freshNameCandidate ?? null,
    freshCandidate: detail.freshCandidate ?? base.freshCandidate ?? null,
    similarity: detail.similarity ?? base.similarity ?? null,
    signature: detail.signature ?? base.signature ?? null,
    diagnostics: {
      ...(base.diagnostics || {}),
      ...(detail.diagnostics || {}),
    },
    loading: Boolean(detail.loading),
    loadError: detail.loadError || "",
  };
}

const DEFAULT_MAP_VIEWER_BASE_URL = "http://localhost:5174";
const MAP_VIEWER_BASE_URL_STORAGE_KEY = "alteredAdmin.mapViewerBaseUrl";

function getMapViewerBaseUrl() {
  try {
    const stored = String(localStorage.getItem(MAP_VIEWER_BASE_URL_STORAGE_KEY) || "").trim();
    return (stored || DEFAULT_MAP_VIEWER_BASE_URL).replace(/\/+$/, "");
  } catch {
    return DEFAULT_MAP_VIEWER_BASE_URL;
  }
}

function buildMapViewerPayloadUrl(targetMapUid, referenceMapUid) {
  const targetUid = String(targetMapUid || "").trim();
  const referenceUid = String(referenceMapUid || "").trim();
  if (!targetUid || !referenceUid) return "";
  const url = new URL(
    `/api/v1/public/maps/${encodeURIComponent(targetUid)}/viewer-diff`,
    getPreferredAlteredOrigin()
  );
  url.searchParams.set("referenceMapUid", referenceUid);
  return url.toString();
}

function buildMapViewerDiffUrl(targetMapUid, referenceMapUid) {
  const payloadUrl = buildMapViewerPayloadUrl(targetMapUid, referenceMapUid);
  if (!payloadUrl) return "";
  const viewerUrl = new URL("/diff", getMapViewerBaseUrl());
  viewerUrl.searchParams.set("payloadUrl", payloadUrl);
  return viewerUrl.toString();
}

function renderMapViewerAction(targetMapUid, referenceMapUid, label = "Open In Map Viewer") {
  const href = buildMapViewerDiffUrl(targetMapUid, referenceMapUid);
  const payloadUrl = buildMapViewerPayloadUrl(targetMapUid, referenceMapUid);
  if (!href) {
    return `<button class="btn outline small" type="button" disabled>${esc(label)}</button>`;
  }
  return `<a class="btn outline small" href="${esc(href)}" target="_blank" rel="noreferrer" title="${esc(payloadUrl)}">${esc(label)}</a>`;
}

/* ── API ──────────────────────────────────────────────────── */
async function api(url) {
  for (let attempt = 0; attempt <= FETCH_NETWORK_RETRY_ATTEMPTS; attempt += 1) {
    const r = await fetchWithAlteredFallback(url, {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    const p = await safeJson(r);
    if (r.status === 401 || r.status === 403) { location.replace(p?.loginUrl || state.auth?.loginUrl || "/admin-login/"); throw new Error("Unauthorized"); }
    if (!r.ok) {
      if (isTransientGatewayStatus(r.status) && attempt < FETCH_NETWORK_RETRY_ATTEMPTS) {
        await waitForFetchRetry(FETCH_NETWORK_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw new Error(p?.error || p?.message || `Request failed (${r.status}).`);
    }
    return p;
  }
  throw new Error("Request failed.");
}

async function post(url, body) {
  const r = await fetchWithAlteredFallback(url, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    body: JSON.stringify(body || {}),
  });
  const p = await safeJson(r);
  if (r.status === 401 || r.status === 403) { location.replace(p?.loginUrl || state.auth?.loginUrl || "/admin-login/"); throw new Error("Unauthorized"); }
  if (!r.ok) throw new Error(p?.error || p?.message || `Request failed (${r.status}).`);
  return p;
}

async function safeJson(r) { try { return await r.json(); } catch { return {}; } }

async function guarded(key, task, successMsg = "") {
  if (state.busy.has(key)) return;
  state.busy.add(key);
  const activeButton = findActiveButton();
  const activeLabel = String(activeButton?.textContent || "").trim();
  const busyLabel = activeLabel
    ? `${activeLabel}…`
    : `${String(key || "Working").replace(/[-_:]+/g, " ")}…`;
  const lockLabel = activeButton?.hasAttribute("data-similarity-button-label") ? null : "Working...";
  const releaseButton = lockButtonWhileBusy(activeButton, { label: lockLabel });
  const dismissBusyToast = toastBusy(busyLabel, "info");
  setBusyButtonsState(key, true);
  try {
    await task();
    if (successMsg) toast(successMsg, "ok");
  } catch (err) {
    console.error(err);
    toast(err?.message || "Request failed.", "err");
  } finally {
    try { dismissBusyToast(); } catch {}
    try { releaseButton(); } catch {}
    setBusyButtonsState(key, false);
    state.busy.delete(key);
    if (key === "naming-similarity") {
      rerenderSimilarityBackfillSurfaces();
    }
  }
}

/* ── Formatting ───────────────────────────────────────────── */
function toneClass(v) {
  const n = String(v || "").toLowerCase();
  if (["healthy","success","online","fresh","approved","done"].includes(n)) return "tone-success";
  if (["blocked","failed","error","rejected"].includes(n)) return "tone-error";
  if (["degraded","warning","warn","paused","processing","stale"].includes(n)) return "tone-warn";
  if (["running","info","job","poll-run","wr-change","scheduler"].includes(n)) return "tone-info";
  return "tone-muted";
}

function toneLabel(v) {
  const n = String(v || "").trim(); if (!n) return "Unknown";
  return n.replace(/[-_]/g, " ");
}

function similarityStateMeta(candidate = {}) {
  const classification = String(candidate?.similarityMatchClassification || "").trim().toLowerCase();
  if (classification === "fallback-manual-review") {
    return { tone: "tone-warn", label: "sim:manual" };
  }
  if (classification === "ambiguous-close-slots" || classification === "manual-multi-selection") {
    return { tone: "tone-warn", label: "sim:ambiguous" };
  }
  if (classification === "unique-strong" || classification === "manual-selected") {
    return { tone: "tone-success", label: "sim:closest" };
  }
  if (classification === "unique-slot-supported" || classification === "unique-weak") {
    return { tone: "tone-info", label: "sim:review" };
  }
  if (classification === "weak-best") {
    return { tone: "tone-warn", label: "sim:weak" };
  }
  if (candidate?.similarityStatus === "matched") {
    return { tone: "tone-success", label: "sim:matched" };
  }
  if (candidate?.similarityStatus === "scanned") {
    return { tone: "tone-info", label: "sim:scanned" };
  }
  return { tone: "tone-muted", label: "sim:missing" };
}

function similarityDetailMeta(classification) {
  const normalized = String(classification || "").trim().toLowerCase();
  if (normalized === "fallback-manual-review") {
    return { tone: "tone-warn", label: "Manual Review" };
  }
  if (normalized === "unique-strong" || normalized === "manual-selected") {
    return { tone: "tone-success", label: "Unique Closest" };
  }
  if (normalized === "unique-slot-supported") {
    return { tone: "tone-info", label: "Supported Closest" };
  }
  if (normalized === "ambiguous-close-slots" || normalized === "manual-multi-selection") {
    return { tone: "tone-warn", label: "Ambiguous Close Match" };
  }
  if (normalized === "unique-weak" || normalized === "weak-best") {
    return { tone: "tone-warn", label: "Weak Closest Match" };
  }
  return { tone: "tone-muted", label: "No Match" };
}

function btnClass(tone) {
  if (tone === "main") return "btn primary";
  if (tone === "warn") return "btn danger";
  return "btn outline";
}

function fmtNum(v) { return new Intl.NumberFormat("en-US").format(Number(v || 0)); }

function fmtClock(v) {
  if (!v) return "-";
  const d = new Date(v); if (isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtDateTime(v) {
  if (!v) return "-";
  const d = new Date(v); if (isNaN(d.getTime())) return "-";
  return d.toLocaleString([], { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtTimeAgo(v) {
  if (!v) return "-";
  const d = new Date(v); if (isNaN(d.getTime())) return "-";
  const diff = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function alertCheckCount() { return 10; }

function fmtDuration(v) {
  const ms = Number(v || 0);
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function fmtBytes(v) {
  const bytes = Number(v || 0);
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function esc(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ── Nadeo Format Code Stripping ──────────────────────────── */
const NADEO_FMT_RE = /\$([0-9a-fA-F]{1,3}|[gimnostuwzGIMNOSTUWZ<>]|[hlpHLP](\[[^\]]+\])?)/g;
function stripFmt(v) {
  return String(v ?? "").replace(NADEO_FMT_RE, "");
}

/* Escape AND strip format codes — use for any Nadeo-sourced text */
function escN(v) {
  return esc(stripFmt(v));
}
