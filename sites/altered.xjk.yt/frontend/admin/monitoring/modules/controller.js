import { createClubPanel } from "./clubPanel.js";
import { collectMonitoringElements, createMonitoringState, setLine } from "./context.js";
import { createDisplayNamePanel } from "./displayNamePanel.js";
import { createLeaderboardPanel } from "./leaderboardPanel.js";
import { createLivePanel } from "./livePanel.js";
import { createMonitoringTransport } from "./transport.js";

const TAB_KEY = "altered_admin_monitor_tab_v3";
const VALID_TABS = new Set(["club", "leaderboard", "displayname"]);
const REFRESH_MS = 12000;
const STATUS_MS = 2000;
const RUN_POLL_MS = 1250;
const RUN_TIMEOUT_MS = 25 * 60 * 1000;

function createMonitoringApp() {
  const state = createMonitoringState();
  const el = collectMonitoringElements();
  const { api, resolveUrl } = createMonitoringTransport();

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

  async function loadAuth() {
    const auth = await api("/api/v1/admin/auth/status");
    if (!auth?.authenticated) {
      window.location.href = resolveUrl(auth?.loginUrl || "/auth/ubisoft/login?return_to=%2Fadmin%2Fmonitoring%2F");
      return false;
    }
    return true;
  }

  async function loadMonitor(silent = false) {
    try {
      state.monitorStatus = await api("/api/v1/admin/hook/altered/live/status");
      live.render();
      displayNames.render();
    } catch (error) {
      if (!silent) setLine(el.actionStatus, `Failed to load monitor status: ${error.message}`, "bad");
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

  const club = createClubPanel({ state, el, api });
  const leaderboards = createLeaderboardPanel({ state, el, api });
  const live = createLivePanel({
    state,
    el,
    api,
    loadMonitor,
    loadClub: club.load,
    waitForRun,
  });
  const displayNames = createDisplayNamePanel({ state, el, api, loadMonitor });

  function bindEvents() {
    el.tabs.forEach((button) =>
      button.addEventListener("click", () => {
        setTab(button.getAttribute("data-monitor-tab") || "club");
        if (state.tab === "leaderboard" && !state.leaderboards) leaderboards.load(true);
      })
    );
    club.bindEvents();
    leaderboards.bindEvents();
    live.bindEvents();
    displayNames.bindEvents();
    el.refreshAllBtn?.addEventListener("click", () =>
      Promise.all([
        loadMonitor(false),
        club.load(false),
        state.tab === "leaderboard" ? leaderboards.load(false) : Promise.resolve(),
      ])
    );
    el.logoutBtn?.addEventListener("click", async () => {
      try {
        await api("/api/v1/admin/auth/logout", { method: "POST", body: {} });
      } catch {}
      window.location.href = resolveUrl("/");
    });
  }

  async function boot() {
    leaderboards.initialize();
    setTab(localStorage.getItem(TAB_KEY) || "club", false);
    club.initialize();
    bindEvents();

    setLine(el.configStatus, "Configuration not changed yet.");
    setLine(el.actionStatus, "No action started yet.");
    setLine(el.displayNameActionStatus, "No display name sync action started yet.");
    setLine(el.displayNameConfigStatus, "Display name config not changed yet.");
    setLine(el.leaderboardSchedulerStatus, "Leaderboard scheduler not changed yet.");

    const ok = await loadAuth();
    if (!ok) return;

    await Promise.all([
      loadMonitor(true),
      club.load(true),
      state.tab === "leaderboard" ? leaderboards.load(true) : Promise.resolve(),
    ]);

    setInterval(() => {
      loadMonitor(true);
      if (state.tab === "club") club.load(true);
    }, STATUS_MS);

    setInterval(() => {
      if (state.tab === "leaderboard" && state.lbScheduler.enabled) {
        const elapsed = Date.now() - state.lastLbRefreshAtMs;
        if (elapsed >= state.lbScheduler.intervalSeconds * 1000) leaderboards.load(true);
      }
    }, 1000);

    setInterval(() => {
      if (state.tab === "club") club.load(true);
      if (state.tab === "leaderboard") leaderboards.load(true);
    }, REFRESH_MS);
  }

  return { boot };
}

export { createMonitoringApp };
