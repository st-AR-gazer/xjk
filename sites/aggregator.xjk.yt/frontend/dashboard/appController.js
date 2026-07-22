import { fetchJson } from "/shared/xjk-core/http.js";
import { formatDate } from "../rendering.js";
import { loadDbRows, loadDbSchema, loadDbTables } from "./databasePanel.js";
import {
  loadEventFacets,
  loadEvents,
  readEventFiltersFromUI,
  setEventRangeInputsEnabled,
  syncEventFilterControlsFromState,
} from "./eventsPanel.js";
import { loadMetrics } from "./metricsPanel.js";
import { loadClubSummary, loadNames, renderNames } from "./namesClubPanel.js";
import { loadProjectData, loadProjects, renderMaps } from "./projectsPanel.js";
import { POLL_REFRESH_MS, fmtNumber, setStatus, state, switchTab, waitForNextPaint } from "./dashboardRuntime.js";

let xjkSitePromise = null;

function getXjkSite() {
  if (window.XjkSite) return Promise.resolve(window.XjkSite);
  xjkSitePromise ||= import("/shared/xjk-core/site-runtime.js").then((module) => module.XjkSite);
  return xjkSitePromise;
}

async function configureLocalLinks() {
  const xjkSite = await getXjkSite();
  xjkSite.applySiteDataLinks(document, { location: window.location });
}

async function loadMeta() {
  const payload = await fetchJson("/api/v1/meta");
  const summary = payload?.summary || {};
  document.getElementById("mProjects").textContent = fmtNumber(summary.projects);
  document.getElementById("mMaps").textContent = fmtNumber(summary.maps);
  document.getElementById("mEvents").textContent = fmtNumber(summary.events);
  document.getElementById("mLatestEvent").textContent = formatDate(summary.latestEventAt);
}

function stampStatus(prefix = "Updated") {
  setStatus(
    `${prefix} ${new Date().toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    })}`
  );
}

async function refreshMeta({ silent = false } = {}) {
  if (!silent) setStatus("Loading summary...");
  await loadMeta();
}

async function refreshEventsPanel({ silent = false, refreshProjects = false, refreshFacets = false } = {}) {
  if (refreshProjects || !state.projects.length) {
    if (!silent) setStatus("Loading projects...");
    await loadProjects();
    await waitForNextPaint();
  }
  if (refreshFacets || (!state.eventFacets.sources.length && !state.eventFacets.eventTypes.length)) {
    if (!silent) setStatus("Loading event facets...");
    try {
      await loadEventFacets();
    } catch (error) {
      console.warn("Event facets unavailable:", error);
    }
    await waitForNextPaint();
  }
  if (!silent) setStatus("Loading events...");
  await loadEvents();
}

async function refreshProjectsPanel({ silent = false, refreshProjects = false } = {}) {
  if (refreshProjects || !state.projects.length) {
    if (!silent) setStatus("Loading projects...");
    await loadProjects();
    await waitForNextPaint();
  }
  if (!silent) setStatus("Loading project view...");
  await loadProjectData();
}

async function refreshNamesPanel({ silent = false } = {}) {
  if (!silent) setStatus("Loading names...");
  await loadNames();
}

async function refreshDatabasePanel({ silent = false } = {}) {
  if (!silent) setStatus("Loading database tables...");
  await loadDbTables();
  await waitForNextPaint();
  if (!silent) setStatus("Loading database schema...");
  await loadDbSchema();
  await waitForNextPaint();
  if (!silent) setStatus("Loading database rows...");
  await loadDbRows();
}

async function refreshMetricsPanel({ silent = false } = {}) {
  if (!silent) setStatus("Loading metrics...");
  await loadMetrics();
}

async function refreshActiveTab({ silent = false, fromPoll = false } = {}) {
  if (state.activeTab === "projects") {
    await refreshProjectsPanel({ silent });
    return;
  }
  if (state.activeTab === "names") {
    await refreshNamesPanel({ silent });
    return;
  }
  if (state.activeTab === "clubs") {
    return;
  }
  if (state.activeTab === "database") {
    if (fromPoll) return;
    await refreshDatabasePanel({ silent });
    return;
  }
  if (state.activeTab === "metrics") {
    await refreshMetricsPanel({ silent });
    return;
  }
  await refreshEventsPanel({ silent });
}

let refreshBusy = false;

async function refreshAll() {
  if (refreshBusy) return;
  refreshBusy = true;
  const issues = [];
  const runStep = async (label, fn) => {
    try {
      await fn();
    } catch (error) {
      issues.push(`${label}: ${error?.message || error}`);
    }
  };

  try {
    await runStep("meta", () => refreshMeta({ silent: false }));
    await waitForNextPaint();
    await runStep(state.activeTab, () => refreshActiveTab({ silent: false, fromPoll: false }));

    const updatedAt = new Date().toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    });
    if (!issues.length) {
      stampStatus("Updated");
    } else {
      const first = issues[0];
      const rest = issues.length - 1;
      setStatus(`Partial update ${updatedAt}: ${first}${rest > 0 ? ` (+${rest} more)` : ""}`);
    }
  } catch (error) {
    setStatus(`Error: ${error?.message || error}`);
  } finally {
    refreshBusy = false;
  }
}
function wireEvents() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      if (tabId === state.activeTab) return;
      switchTab(tabId);
      refreshAll().catch((err) => setStatus(`Refresh failed: ${err?.message || err}`));
    });
  });
  document.getElementById("eventsFirst").addEventListener("click", () => {
    loadEvents({ page: 1 }).catch((err) => setStatus(`Events load failed: ${err?.message || err}`));
  });
  document.getElementById("eventsPrev").addEventListener("click", () => {
    if (state.eventsMeta.page > 1) {
      loadEvents({ page: state.eventsMeta.page - 1 }).catch((err) =>
        setStatus(`Events load failed: ${err?.message || err}`)
      );
    }
  });
  document.getElementById("eventsNext").addEventListener("click", () => {
    if (state.eventsMeta.page < state.eventsMeta.totalPages) {
      loadEvents({ page: state.eventsMeta.page + 1 }).catch((err) =>
        setStatus(`Events load failed: ${err?.message || err}`)
      );
    }
  });
  document.getElementById("eventsLast").addEventListener("click", () => {
    loadEvents({ page: state.eventsMeta.totalPages || 1 }).catch((err) =>
      setStatus(`Events load failed: ${err?.message || err}`)
    );
  });
  document.getElementById("eventsPageGo").addEventListener("click", () => {
    const jumpValue = Number(document.getElementById("eventsPageJump").value || 1);
    const page = Math.max(1, Math.min(jumpValue || 1, state.eventsMeta.totalPages || 1));
    loadEvents({ page }).catch((err) => setStatus(`Events load failed: ${err?.message || err}`));
  });
  document.getElementById("eventsPageJump").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      document.getElementById("eventsPageGo").click();
    }
  });

  document.getElementById("eventsRangeFilter").addEventListener("change", () => {
    setEventRangeInputsEnabled();
  });
  document.getElementById("eventsPageSize").addEventListener("change", () => {
    loadEvents({ page: 1 }).catch((err) => setStatus(`Events load failed: ${err?.message || err}`));
  });
  document.getElementById("eventsApply").addEventListener("click", () => {
    state.eventFilters = readEventFiltersFromUI();
    Promise.all([loadEventFacets(), loadEvents({ page: 1 })]).catch((err) =>
      setStatus(`Events load failed: ${err?.message || err}`)
    );
  });
  document.getElementById("eventsReset").addEventListener("click", () => {
    state.eventFilters = {
      projectKey: "",
      source: "",
      eventType: "",
      range: "24h",
      fromIso: "",
      toIso: "",
      q: "",
      changedOnly: false,
      includeSystem: false,
    };
    syncEventFilterControlsFromState();
    Promise.all([loadEventFacets(), loadEvents({ page: 1 })]).catch((err) =>
      setStatus(`Events load failed: ${err?.message || err}`)
    );
  });
  document.getElementById("eventsRefresh").addEventListener("click", () => {
    state.eventFilters = readEventFiltersFromUI();
    Promise.all([loadEventFacets(), loadEvents({ page: state.eventsMeta.page })]).catch((err) =>
      setStatus(`Events load failed: ${err?.message || err}`)
    );
  });
  document.getElementById("eventsQuery").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      document.getElementById("eventsApply").click();
    }
  });
  document.getElementById("projectSelect").addEventListener("change", () => {
    state.projectKey = document.getElementById("projectSelect").value;
    loadProjectData().catch((err) => setStatus(`Project load failed: ${err?.message || err}`));
  });
  document.getElementById("changedOnly").addEventListener("change", () => {
    loadProjectData().catch((err) => setStatus(`Project load failed: ${err?.message || err}`));
  });
  document.getElementById("refreshProject").addEventListener("click", () => {
    Promise.all([loadProjectData(), loadEvents({ page: state.eventsMeta.page })]).catch((err) =>
      setStatus(`Project refresh failed: ${err?.message || err}`)
    );
  });
  document.getElementById("mapsPrev").addEventListener("click", () => {
    if (state.page.maps > 1) {
      state.page.maps--;
      renderMaps();
    }
  });
  document.getElementById("mapsNext").addEventListener("click", () => {
    state.page.maps++;
    renderMaps();
  });
  document.getElementById("namesPrev").addEventListener("click", () => {
    if (state.page.names > 1) {
      state.page.names--;
      renderNames();
    }
  });
  document.getElementById("namesNext").addEventListener("click", () => {
    state.page.names++;
    renderNames();
  });
  document.getElementById("loadClub").addEventListener("click", () => {
    loadClubSummary().catch((err) => setStatus(`Club load failed: ${err?.message || err}`));
  });
  document.getElementById("dbRefreshTables").addEventListener("click", () => {
    (async () => {
      await loadDbTables();
      await loadDbSchema();
      await loadDbRows();
    })().catch((err) => setStatus(`DB refresh failed: ${err?.message || err}`));
  });

  document.getElementById("dbTableSelect").addEventListener("change", () => {
    state.db.table = document.getElementById("dbTableSelect").value;
    state.db.offset = 0;
    (async () => {
      await loadDbSchema();
      await loadDbRows();
    })().catch((err) => setStatus(`DB table load failed: ${err?.message || err}`));
  });

  document.getElementById("dbSortBy").addEventListener("change", () => {
    state.db.sortBy = document.getElementById("dbSortBy").value;
    state.db.offset = 0;
    loadDbRows().catch((err) => setStatus(`DB sort failed: ${err?.message || err}`));
  });

  document.getElementById("dbSortDir").addEventListener("change", () => {
    state.db.sortDir = document.getElementById("dbSortDir").value;
    state.db.offset = 0;
    loadDbRows().catch((err) => setStatus(`DB sort failed: ${err?.message || err}`));
  });

  document.getElementById("dbLimit").addEventListener("change", () => {
    state.db.limit = Number(document.getElementById("dbLimit").value || 50);
    state.db.offset = 0;
    loadDbRows().catch((err) => setStatus(`DB pagination failed: ${err?.message || err}`));
  });

  document.getElementById("dbPrev").addEventListener("click", () => {
    state.db.offset = Math.max(0, state.db.offset - state.db.limit);
    loadDbRows().catch((err) => setStatus(`DB page change failed: ${err?.message || err}`));
  });

  document.getElementById("dbNext").addEventListener("click", () => {
    state.db.offset += state.db.limit;
    loadDbRows().catch((err) => setStatus(`DB page change failed: ${err?.message || err}`));
  });

  document.getElementById("dbReloadRows").addEventListener("click", () => {
    loadDbRows().catch((err) => setStatus(`DB reload failed: ${err?.message || err}`));
  });
  document.getElementById("metricBucket").addEventListener("change", () => {
    state.metrics.bucket = document.getElementById("metricBucket").value;
    loadMetrics().catch((err) => setStatus(`Metrics load failed: ${err?.message || err}`));
  });

  document.getElementById("metricWindowHours").addEventListener("change", () => {
    state.metrics.windowHours = Number(document.getElementById("metricWindowHours").value || 168);
    loadMetrics().catch((err) => setStatus(`Metrics load failed: ${err?.message || err}`));
  });

  document.getElementById("metricRefresh").addEventListener("click", () => {
    loadMetrics().catch((err) => setStatus(`Metrics refresh failed: ${err?.message || err}`));
  });
}

function startAggregatorDashboard() {
  const hash = window.location.hash.slice(1);
  if (hash && document.querySelector(`.tab-btn[data-tab="${hash}"]`)) {
    switchTab(hash);
  }

  configureLocalLinks().catch(() => {});
  wireEvents();
  refreshAll();
  setInterval(() => {
    if (refreshBusy) return;
    if (state.activeTab === "clubs" || state.activeTab === "database") {
      loadMeta()
        .then(() => stampStatus("Updated"))
        .catch((err) => setStatus(`Error: ${err?.message || err}`));
      return;
    }
    refreshAll().catch((err) => setStatus(`Error: ${err?.message || err}`));
  }, POLL_REFRESH_MS);
}

export { startAggregatorDashboard };
