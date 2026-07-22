import "/shared/xjk-core/safe-html.js?v=2";
import { renderActivity, renderApi, renderSettings } from "./activity-api-settings.js?v=2";
import { renderClubs } from "./clubs.js?v=2";
import { LEGACY_MAP, POLL_MS, WORKSPACES } from "./constants.js?v=2";
import { renderDashboard } from "./dashboard.js?v=2";
import {
  getActivityRequestKey,
  getMapsRequestKey,
  loadActivity,
  loadApi,
  loadClubs,
  loadDashboard,
  loadJobs,
  loadLiveMonitorStatusForJobs,
  loadMaps,
  loadSettings,
  logJobsConsole,
  logJobsOverviewConsole,
} from "./data-loaders.js?v=2";
import { refreshDrawer } from "./drawer-controller.js?v=2";
import { esc } from "./formatters.js?v=2";
import { renderJobs } from "./jobs.js?v=2";
import { renderMaps } from "./maps.js?v=2";
import { isRequestTimeoutError } from "./request-errors.js?v=2";
import { renderSession } from "./session.js?v=2";
import { el, state } from "./state.js?v=2";
import { renderTopbar } from "./status-bar.js?v=2";
import { loading } from "./ui.js?v=2";

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
  globalThis.XjkSafeHtml.set(host, loading(copy));
}

export function renderWorkspaceLoadError(ws, error) {
  const host = getWorkspaceBodyEl(ws);
  if (!host) return;
  const title = workspaceLabel(ws);
  const message = error?.message || "Request failed.";
  globalThis.XjkSafeHtml.set(
    host,
    `
    <div class="empty-state">
      <span class="pill tone-error">Error</span>
      <h3>Failed to load ${esc(title)}</h3>
      <p>${esc(message)}</p>
      <div style="margin-top:1rem;display:flex;gap:.35rem;flex-wrap:wrap;">
        <button class="btn primary" type="button" data-refresh="${esc(ws)}">Retry</button>
        <button class="btn ghost" type="button" data-nav="dashboard">Dashboard</button>
      </div>
    </div>`
  );
}

export async function ensureLoaded(ws, force = false) {
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
      const needsLoad = force || !state.maps.data || state.maps.lastRequestKey !== requestKey;
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
      await loadJobs({ source: force ? "jobs-force-refresh" : "jobs-open" });
      return;
    }

    if (ws === "activity") {
      const requestKey = getActivityRequestKey();
      const needsLoad = force || !state.activity.data || state.activity.lastRequestKey !== requestKey;
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

export function poll() {
  if (!state.auth?.authenticated) return;
  const now = Date.now();
  if (state.ws === "jobs" && now - (state.lastLoad.jobs || 0) >= POLL_MS.jobs) {
    loadJobs({ source: "jobs-poll" }).catch((error) => {
      logJobsConsole("jobs poll failed", { message: error?.message || String(error || "Unknown error.") }, "error");
      console.error(error);
    });
    return;
  }
  if (state.ws === "activity" && now - (state.lastLoad.activity || 0) >= POLL_MS.activity) {
    loadActivity().catch(console.error);
    return;
  }
  if (state.ws === "api" && now - (state.lastLoad.api || 0) >= POLL_MS.api) {
    loadApi().catch(console.error);
    return;
  }
  if (state.ws === "dashboard" && now - (state.lastLoad.dashboard || 0) >= POLL_MS.dashboard) {
    loadDashboard().catch(console.error);
  }
}

export function syncHash(initial) {
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
  if (ws === "jobs" && state.jobs) {
    logJobsOverviewConsole(state.jobs, { source: initial ? "jobs-initial-view" : "jobs-view", force: true });
    loadLiveMonitorStatusForJobs({
      source: initial ? "jobs-initial-view:live" : "jobs-view:live",
      forceConsole: true,
    }).catch((error) => {
      logJobsConsole(
        "live monitor status fetch failed",
        { message: error?.message || String(error || "Unknown error.") },
        "warn"
      );
    });
  }
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

export function setHash(ws, params = {}) {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v) !== "") s.set(k, String(v));
  });
  const h = `#${ws}${s.toString() ? `?${s}` : ""}`;
  if (location.hash === h) {
    syncHash(false);
    return;
  }
  location.hash = h;
}

export function renderLayout() {
  document.querySelectorAll("[data-workspace-link]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.workspaceLink === state.ws);
  });
  document.querySelectorAll("[data-workspace]").forEach((panel) => {
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
  refreshDrawer();
}
