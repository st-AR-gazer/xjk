import { POLL_REFRESH_MS, state } from "./state.js?v=2";
import { fetchDashJson } from "./api-client.js?v=2";
import { closeDrawer, openErrorDetail, openRouteDetail } from "./drawer.js?v=2";
import { setStatus, stampStatus } from "./dom.js?v=2";
import { clampInt } from "./formatters.js?v=2";
import { isLogOutputNearBottom, refreshLogs } from "./logs.js?v=2";
import {
  readRouteSubTabFromUrl,
  readTabFromUrl,
  setActiveRouteSubTab,
  setActiveTab,
  syncControls,
} from "./navigation.js?v=2";
import {
  refreshErrorsOnly,
  refreshNadeoQueue,
  refreshOverviewPanel,
  refreshRoutesPanel,
  setNadeoQueueOpen,
} from "./traffic.js?v=2";
import {
  refreshTrackerStatuses,
  runTrackerAction,
  runTrackerStatusProbe,
  setTrackerPriorityMode,
  syncTrackerPriorityControls,
} from "./tracker-status.js?v=2";
import { refreshAlteredCheckHistory, refreshAlteredPanel, runAlteredAction } from "./altered-status.js?v=2";

let fullRefreshBusy = false;
let fullRefreshQueued = false;

async function loadFilters({ refreshProjects = false } = {}) {
  let projectsPayload = null;
  if (refreshProjects || !state.projects.length) {
    projectsPayload = await fetchDashJson("/projects?limit=250");
  }
  const facetsPayload = await fetchDashJson(
    `/traffic/facets?window_hours=${encodeURIComponent(state.filters.windowHours)}`
  );
  if (projectsPayload) {
    state.projects = Array.isArray(projectsPayload?.projects) ? projectsPayload.projects : [];
  }
  const facets = facetsPayload?.facets || {};
  state.services = Array.isArray(facets.services) ? facets.services : [];
  syncControls();
}

async function refresh() {
  if (fullRefreshBusy) {
    fullRefreshQueued = true;
    return;
  }
  fullRefreshBusy = true;
  try {
    if (state.activeTab === "logs") {
      const refreshed = await refreshLogs({ silent: true, reloadServices: false });
      if (refreshed) {
        stampStatus("Updated");
      }
      return;
    }
    if (state.activeTab === "trackers") {
      await refreshTrackerStatuses();
      stampStatus("Updated");
      return;
    }
    if (state.activeTab === "altered") {
      await refreshAlteredPanel({ silent: false });
      return;
    }

    if (state.activeTab === "errors") {
      await refreshErrorsOnly({ silent: false });
      return;
    }

    if (state.activeTab === "routes") {
      await refreshRoutesPanel({ silent: false });
      stampStatus("Updated");
      return;
    }

    await refreshOverviewPanel({ silent: false });

    stampStatus("Updated");
  } catch (error) {
    setStatus(`Error: ${error?.message || error}`);
  } finally {
    fullRefreshBusy = false;
    if (fullRefreshQueued) {
      fullRefreshQueued = false;
      setTimeout(() => {
        refresh();
      }, 0);
    }
  }
}

async function runUiAction(action) {
  try {
    await action();
  } catch (error) {
    setStatus(`Error: ${error?.message || error}`);
  }
}

function bindAsyncAction(target, eventName, action) {
  target?.addEventListener(eventName, (event) => {
    void runUiAction(() => action(event));
  });
}

function bindControls() {
  bindAsyncAction(document.getElementById("windowHours"), "change", async (event) => {
    state.filters.windowHours = Math.max(1, Number(event.target.value || 24));
    state.errors.page = 1;
    await loadFilters({ refreshProjects: false });
    await refresh();
  });

  bindAsyncAction(document.getElementById("projectKey"), "change", async (event) => {
    state.filters.projectKey = String(event.target.value || "").trim();
    state.errors.page = 1;
    await loadFilters({ refreshProjects: false });
    await refresh();
  });

  bindAsyncAction(document.getElementById("serviceName"), "change", async (event) => {
    state.filters.service = String(event.target.value || "").trim();
    state.errors.page = 1;
    await refresh();
  });

  bindAsyncAction(document.getElementById("refreshBtn"), "click", async () => {
    if (state.activeTab === "errors") {
      await refreshErrorsOnly();
    } else if (state.activeTab === "trackers") {
      await refreshTrackerStatuses();
      stampStatus("Updated");
    } else if (state.activeTab === "altered") {
      await refreshAlteredPanel({ silent: false });
    } else if (state.activeTab === "logs") {
      await refreshLogs({ reloadServices: true });
    } else {
      await refresh();
    }
  });

  bindAsyncAction(document.getElementById("nadeoQueueToggleBtn"), "click", async () => {
    const nextOpen = !state.nadeoQueue.open;
    setNadeoQueueOpen(nextOpen);
    if (nextOpen) {
      await refreshNadeoQueue({ silent: true });
    }
  });

  bindAsyncAction(document.getElementById("nadeoQueueRefreshBtn"), "click", async () => {
    await refreshNadeoQueue();
  });

  document.getElementById("nadeoQueueCloseBtn")?.addEventListener("click", () => {
    setNadeoQueueOpen(false);
  });

  document.querySelectorAll(".tab-nav .tab-btn").forEach((btn) => {
    bindAsyncAction(btn, "click", async () => {
      const tab = btn.dataset.tab;
      if (tab === state.activeTab) return;
      setActiveTab(tab);

      if (tab === "errors") {
        state.errors.page = 1;
      }
      await refresh();
    });
  });

  document.querySelectorAll("#tabRoutes .sub-tab-btn").forEach((btn) => {
    bindAsyncAction(btn, "click", async () => {
      const subtab = btn.dataset.subtab;
      if (subtab === state.routeSubTab) return;
      setActiveRouteSubTab(subtab);
      if (state.activeTab === "routes") {
        await refreshRoutesPanel({ silent: false });
        stampStatus("Updated");
      }
    });
  });

  document.addEventListener("click", (event) => {
    const row = event.target.closest("tr.clickable-row");
    if (!row) return;

    const type = row.dataset.detailType;
    const idx = Number(row.dataset.detailIdx);
    if (!type || !Number.isFinite(idx)) return;

    const cache = state.cached[type];
    if (!cache || !cache[idx]) return;

    if (type === "errors") {
      openErrorDetail(cache[idx]);
    } else {
      openRouteDetail(cache[idx], type);
    }
  });

  document.getElementById("drawerCloseBtn")?.addEventListener("click", closeDrawer);
  document.querySelector(".drawer-backdrop")?.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });

  bindAsyncAction(document.getElementById("errorsApplyBtn"), "click", async () => {
    state.errors.q = String(document.getElementById("errorsSearch")?.value || "").trim();
    state.errors.direction = String(document.getElementById("errorsDirection")?.value || "").trim();
    state.errors.page = 1;
    await refreshErrorsOnly();
  });

  bindAsyncAction(document.getElementById("errorsSearch"), "keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    state.errors.q = String(document.getElementById("errorsSearch")?.value || "").trim();
    state.errors.page = 1;
    await refreshErrorsOnly();
  });

  bindAsyncAction(document.getElementById("errorsDirection"), "change", async (event) => {
    state.errors.direction = String(event.target?.value || "").trim();
    state.errors.page = 1;
    await refreshErrorsOnly();
  });

  bindAsyncAction(document.getElementById("errorsPrevBtn"), "click", async () => {
    if (state.errors.page <= 1) return;
    state.errors.page -= 1;
    await refreshErrorsOnly();
  });

  bindAsyncAction(document.getElementById("errorsNextBtn"), "click", async () => {
    if (state.errors.page >= state.errors.totalPages) return;
    state.errors.page += 1;
    await refreshErrorsOnly();
  });

  bindAsyncAction(document.getElementById("trackerRefreshBtn"), "click", async () => {
    await refreshTrackerStatuses();
  });
  bindAsyncAction(document.getElementById("trackerProbeBtn"), "click", async () => {
    await runTrackerStatusProbe();
  });
  document.getElementById("trackerPriorityTarget")?.addEventListener("change", () => {
    syncTrackerPriorityControls();
  });
  bindAsyncAction(document.getElementById("trackerPriorityEnableBtn"), "click", async () => {
    await setTrackerPriorityMode(true);
  });
  bindAsyncAction(document.getElementById("trackerPriorityDisableBtn"), "click", async () => {
    await setTrackerPriorityMode(false);
  });

  bindAsyncAction(document.getElementById("trackerWrRunNowBtn"), "click", async () => {
    await runTrackerAction("wr", "run-now");
  });
  bindAsyncAction(document.getElementById("trackerLbRunNowBtn"), "click", async () => {
    await runTrackerAction("leaderboard", "run-now");
  });
  bindAsyncAction(document.getElementById("trackerDnRunNowBtn"), "click", async () => {
    await runTrackerAction("displayname", "run-now");
  });

  bindAsyncAction(document.getElementById("trackerWrToggleBtn"), "click", async (event) => {
    const enabledNow = String(event.currentTarget?.dataset?.enabled || "0") === "1";
    await runTrackerAction("wr", enabledNow ? "disable" : "enable");
  });
  bindAsyncAction(document.getElementById("trackerLbToggleBtn"), "click", async (event) => {
    const enabledNow = String(event.currentTarget?.dataset?.enabled || "0") === "1";
    await runTrackerAction("leaderboard", enabledNow ? "disable" : "enable");
  });
  bindAsyncAction(document.getElementById("trackerDnToggleBtn"), "click", async (event) => {
    const enabledNow = String(event.currentTarget?.dataset?.enabled || "0") === "1";
    await runTrackerAction("displayname", enabledNow ? "disable" : "enable");
  });
  bindAsyncAction(document.getElementById("trackerClubToggleBtn"), "click", async (event) => {
    const enabledNow = String(event.currentTarget?.dataset?.enabled || "0") === "1";
    await runTrackerAction("club", enabledNow ? "disable" : "enable");
  });

  bindAsyncAction(document.getElementById("alteredRefreshBtn"), "click", async () => {
    await refreshAlteredPanel({ silent: false });
  });
  bindAsyncAction(document.getElementById("alteredRunFullBtn"), "click", async () => {
    await runAlteredAction("run-full-sync");
  });
  bindAsyncAction(document.getElementById("alteredRunDiscoveryBtn"), "click", async () => {
    await runAlteredAction("run-discovery-sync");
  });
  bindAsyncAction(document.getElementById("alteredCheckApplyBtn"), "click", async () => {
    state.altered.checkQuery = String(document.getElementById("alteredCheckSearch")?.value || "").trim();
    await refreshAlteredCheckHistory({ silent: false });
    stampStatus("Updated");
  });
  bindAsyncAction(document.getElementById("alteredCheckClearBtn"), "click", async () => {
    state.altered.checkQuery = "";
    const input = document.getElementById("alteredCheckSearch");
    if (input) input.value = "";
    await refreshAlteredCheckHistory({ silent: false });
    stampStatus("Updated");
  });
  bindAsyncAction(document.getElementById("alteredCheckSearch"), "keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    state.altered.checkQuery = String(event.currentTarget?.value || "").trim();
    await refreshAlteredCheckHistory({ silent: false });
    stampStatus("Updated");
  });

  bindAsyncAction(document.getElementById("logsRefreshBtn"), "click", async () => {
    await refreshLogs({ reloadServices: true });
  });

  bindAsyncAction(document.getElementById("logsService"), "change", async (event) => {
    state.logs.service = String(event.target?.value || "").trim();
    await refreshLogs({ reloadServices: false });
  });

  bindAsyncAction(document.getElementById("logsStream"), "change", async (event) => {
    state.logs.stream =
      String(event.target?.value || "out")
        .trim()
        .toLowerCase() === "error"
        ? "error"
        : "out";
    await refreshLogs({ reloadServices: false });
  });

  bindAsyncAction(document.getElementById("logsLines"), "change", async (event) => {
    state.logs.lines = clampInt(event.target?.value, { min: 10, max: 2000, fallback: 200 });
    await refreshLogs({ reloadServices: false });
  });

  bindAsyncAction(document.getElementById("logsFollowTail"), "change", async (event) => {
    state.logs.followTail = Boolean(event.target?.checked);
    if (state.logs.followTail) {
      const outputEl = document.getElementById("logsOutput");
      if (outputEl) outputEl.scrollTop = outputEl.scrollHeight;
      await refreshLogs({ reloadServices: false });
    }
  });

  document.getElementById("logsOutput")?.addEventListener("scroll", (event) => {
    const outputEl = event.currentTarget;
    if (!outputEl) return;
    const nextFollow = isLogOutputNearBottom(outputEl);
    if (nextFollow === state.logs.followTail) return;
    state.logs.followTail = nextFollow;
    const followToggle = document.getElementById("logsFollowTail");
    if (followToggle) followToggle.checked = nextFollow;
  });
}

async function applyTabFromUrl() {
  const tab = readTabFromUrl();
  const routeSubTab = readRouteSubTabFromUrl();
  const tabChanged = tab !== state.activeTab;
  const routeSubTabChanged = tab === "routes" && routeSubTab !== state.routeSubTab;
  if (!tabChanged && !routeSubTabChanged) return;

  setActiveTab(tab, { updateUrl: false });
  if (tab === "routes") {
    setActiveRouteSubTab(routeSubTab, { updateUrl: false });
  }
  if (tab === "errors") {
    state.errors.page = 1;
  }
  await refresh();
}

export function startDashboard() {
  setActiveRouteSubTab(readRouteSubTabFromUrl(), { updateUrl: false });
  setActiveTab(readTabFromUrl(), { replaceUrl: true });
  setNadeoQueueOpen(false);
  bindControls();
  syncTrackerPriorityControls();
  window.addEventListener("popstate", () => {
    void runUiAction(applyTabFromUrl);
  });
  window.addEventListener("hashchange", () => {
    void runUiAction(applyTabFromUrl);
  });
  const initialRefresh = refresh().catch((error) => {
    setStatus(`Error: ${error?.message || error}`);
  });
  initialRefresh
    .then(() => loadFilters({ refreshProjects: true }))
    .catch((error) => {
      setStatus(`Error: ${error?.message || error}`);
    });
  initialRefresh.then(() => {
    if (state.activeTab === "overview" && !fullRefreshBusy) {
      stampStatus("Updated");
    }
  });
  setInterval(() => {
    if (document.visibilityState === "visible") {
      refresh();
    }
  }, POLL_REFRESH_MS);
}
