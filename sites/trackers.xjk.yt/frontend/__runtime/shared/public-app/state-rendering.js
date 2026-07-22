import { clearElement, createElement } from "../dom.js";

function createTrackerState(config) {
  return {
    mode: config.configuredMode || config.scope,
    status: null,
    maps: [],
    runs: [],
    wrFeed: [],
    liveChecks: [],
    filters: { search: "", dueOnly: false },
    pagination: { page: 1, totalPages: 1 },
    activeTab: "live-feed",
    stream: { source: null, connected: false, reconnectTimer: null },
    source: {
      usePrimaryRead: config.isLocalHost && config.directPrimaryRead,
      primaryReadHealthy: config.isLocalHost && config.directPrimaryRead,
      remoteProxyRead: false,
    },
  };
}

function collectTrackerElements(byId) {
  return {
    headerBadge: byId("header-badge"),
    headerMode: byId("header-mode"),
    headerSub: byId("header-sub"),
    statChangesLabel: byId("stat-changes-label"),
    feedTitle: byId("feed-title"),
    feedEmptyText: byId("feed-empty-text"),
    checkStreamTitle: byId("check-stream-title"),
    footMark: byId("foot-mark"),
    statTracked: byId("stat-tracked"),
    statDue: byId("stat-due"),
    statChanges: byId("stat-changes"),
    statLastRun: byId("stat-last-run"),
    spotlight: byId("spotlight"),
    spotlightMap: byId("spotlight-map"),
    spotlightDetail: byId("spotlight-detail"),
    spotlightWr: byId("spotlight-wr"),
    feedNote: byId("feed-note"),
    feedList: byId("feed-list"),
    feedEmpty: byId("feed-empty"),
    checkFeedNote: byId("check-feed-note"),
    checkFeedList: byId("check-feed-list"),
    checkFeedEmpty: byId("check-feed-empty"),
    mapsCount: byId("maps-count"),
    mapSearch: byId("map-search"),
    dueOnly: byId("due-only"),
    mapRows: byId("map-rows"),
    pageInfo: byId("page-info"),
    pagePrev: byId("page-prev"),
    pageNext: byId("page-next"),
    engineProvider: byId("engine-provider"),
    engineTick: byId("engine-tick"),
    engineStatus: byId("engine-status"),
    engineStarted: byId("engine-started"),
    engineFinished: byId("engine-finished"),
    engineError: byId("engine-error"),
    runNowBtn: byId("run-now-btn"),
    runsList: byId("runs-list"),
  };
}

function createTrackerView({
  config,
  documentRef,
  elements,
  eventSourceAvailable,
  formatDurationMs,
  formatRelativeTime,
  historyRef,
  mapMatchesQuery,
  readFeedEntry,
  renderTrackerEngine,
  requestFrame,
  state,
}) {
  const hasCheckFeed = Boolean(elements.checkFeedNote && elements.checkFeedList && elements.checkFeedEmpty);
  const fmtMs = formatDurationMs;
  const fmtAgo = formatRelativeTime;

  function applyModeUI() {
    const isLeaderboard = state.mode === "leaderboard";
    if (elements.headerBadge) elements.headerBadge.textContent = isLeaderboard ? "Leaderboard" : "World Records";
    if (elements.headerMode) elements.headerMode.textContent = isLeaderboard ? "LB" : "WR";
    if (elements.headerSub) {
      elements.headerSub.textContent = isLeaderboard
        ? "Top-N leaderboard monitoring for Trackmania maps, with live check stream and snapshot updates."
        : "Real-time world-record monitoring for Trackmania — powering WR alerts and live map status.";
    }
    if (elements.statChangesLabel) elements.statChangesLabel.textContent = isLeaderboard ? "Top Changes" : "WR Changes";
    if (elements.feedTitle) elements.feedTitle.textContent = isLeaderboard ? "Leaderboard Top Changes" : "WR Changes";
    if (elements.feedEmptyText) {
      elements.feedEmptyText.textContent = isLeaderboard
        ? "Waiting for leaderboard data…"
        : "Waiting for world-record data…";
    }
    if (elements.checkStreamTitle) {
      elements.checkStreamTitle.textContent = isLeaderboard ? "Leaderboard Check Stream" : "Check Stream";
    }
    if (elements.footMark) {
      elements.footMark.textContent = isLeaderboard ? "trackers.xjk.yt/leaderboard" : "trackers.xjk.yt/wr";
    }
    documentRef.title = isLeaderboard ? "xjk / leaderboard" : "xjk / world records";

    documentRef.querySelectorAll(".sidebar-nav .tab-btn").forEach((tab) => tab.classList.remove("is-active"));
    documentRef.querySelector(`.sidebar-nav .tab-btn[data-nav="${config.scope}"]`)?.classList.add("is-active");
  }

  function switchTab(viewId) {
    state.activeTab = viewId;
    documentRef.querySelectorAll(".dock-btn").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === viewId);
    });
    documentRef.querySelectorAll(".view-layer").forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === `view-${viewId}`);
    });
    historyRef.replaceState(null, "", `#${viewId}`);
  }

  function renderStats() {
    const tracked = Number(state.status?.summary?.trackedMaps || 0);
    const due = Number(state.status?.trackedDueNow || 0);
    const latest = state.status?.latestRun;
    const totalChanges = state.runs.reduce((sum, run) => sum + (Number(run.wrChanges) || 0), 0);
    if (elements.statTracked) elements.statTracked.textContent = String(tracked);
    if (elements.statDue) elements.statDue.textContent = String(due);
    if (elements.statChanges) elements.statChanges.textContent = String(totalChanges);
    if (elements.statLastRun) {
      elements.statLastRun.textContent = latest ? `#${latest.runId || "—"} · ${fmtAgo(latest.finishedAt)}` : "—";
    }
  }

  function renderSpotlight(entry) {
    if (!elements.spotlight || !entry) return;
    const { mapName, holder, newWr: wrMs, oldWr, ago: feedAgo } = readFeedEntry(entry);
    const changed = Boolean(entry.changed);
    const ago = entry.checkedAt ? fmtAgo(entry.checkedAt) : feedAgo;
    if (elements.spotlightMap) elements.spotlightMap.textContent = mapName;
    if (elements.spotlightWr) elements.spotlightWr.textContent = fmtMs(wrMs);
    if (elements.spotlightDetail) {
      elements.spotlightDetail.textContent = changed
        ? `WR changed! ${fmtMs(oldWr)} → ${fmtMs(wrMs)} · by ${holder} · ${ago}`
        : `WR ${fmtMs(wrMs)} · by ${holder} · ${ago}`;
    }
    elements.spotlight.classList.add("is-active");
    elements.spotlight.style.transition = "none";
    elements.spotlight.style.borderColor = changed ? "rgba(240, 191, 103, 0.6)" : "rgba(105, 214, 212, 0.4)";
    requestFrame(() => {
      elements.spotlight.style.transition = "border-color 1.5s ease";
      elements.spotlight.style.borderColor = "";
    });
  }

  function renderFeed() {
    if (!state.wrFeed.length) {
      clearElement(elements.feedList);
      elements.feedList.appendChild(elements.feedEmpty);
      elements.feedEmpty.hidden = false;
      return;
    }
    elements.feedEmpty.hidden = true;
    clearElement(elements.feedList);
    state.wrFeed.forEach((entry) => {
      const card = documentRef.createElement("div");
      card.className = "terminal-feed-line";
      const { mapName, holder, newWr, oldWr, ago } = readFeedEntry(entry);
      const timeDetail = oldWr && newWr && oldWr !== newWr ? `${fmtMs(oldWr)} -> ${fmtMs(newWr)}` : fmtMs(newWr);
      createElement(card, "span", { className: "feed-time", text: `[${ago}]` });
      createElement(card, "span", {
        className: "feed-action",
        text: state.mode === "leaderboard" ? "LB_UPDATE" : "WR_SET",
      });
      createElement(card, "span", { className: "feed-data", text: `${mapName} : ${timeDetail} : ${holder}` });
      elements.feedList.appendChild(card);
    });
  }

  function renderLiveChecks() {
    if (!hasCheckFeed) return;
    clearElement(elements.checkFeedList);
    if (!state.liveChecks.length) {
      elements.checkFeedList.appendChild(elements.checkFeedEmpty);
      elements.checkFeedEmpty.hidden = false;
      return;
    }
    elements.checkFeedEmpty.hidden = true;
    state.liveChecks.forEach((entry) => {
      const card = documentRef.createElement("div");
      card.className = "terminal-feed-line";
      const isError = String(entry.note || "")
        .toLowerCase()
        .startsWith("error:");
      const changed = Boolean(entry.changed);
      const wrDetail = changed
        ? `${fmtMs(entry.oldWrMs || 0)} -> ${fmtMs(entry.newWrMs || 0)}`
        : fmtMs(entry.newWrMs || entry.oldWrMs || 0);
      const action = isError ? "CHK_ERR" : changed ? "CHK_NEW" : "CHK_OK";
      createElement(card, "span", { className: "feed-time", text: `[${fmtAgo(entry.checkedAt)}]` });
      const actionElement = createElement(card, "span", { className: "feed-action", text: action });
      actionElement.style.color = isError ? "var(--bad)" : changed ? "var(--warn)" : "var(--ok)";
      createElement(card, "span", {
        className: "feed-data",
        text: `${entry.mapName || "Unknown"} : ${wrDetail}`,
      });
      elements.checkFeedList.appendChild(card);
    });
  }

  function getFilteredMaps() {
    const query = state.filters.search.toLowerCase().trim();
    return state.maps
      .filter((map) => (state.filters.dueOnly ? map.dueNow : true))
      .filter((map) => mapMatchesQuery(map, query))
      .sort((left, right) => {
        if (left.dueNow !== right.dueNow) return left.dueNow ? -1 : 1;
        return (Number(left.nextCheckInSeconds) || 0) - (Number(right.nextCheckInSeconds) || 0);
      });
  }

  function renderMaps() {
    const filteredMaps = getFilteredMaps();
    const total = filteredMaps.length;
    const totalPages = Math.max(1, Math.ceil(total / config.mapsPerPage));
    state.pagination.page = Math.max(1, Math.min(state.pagination.page, totalPages));
    state.pagination.totalPages = totalPages;
    const start = (state.pagination.page - 1) * config.mapsPerPage;
    const pageItems = filteredMaps.slice(start, start + config.mapsPerPage);
    elements.mapsCount.textContent = `${total} maps`;
    clearElement(elements.mapRows);

    if (!pageItems.length) {
      const row = documentRef.createElement("tr");
      const cell = createElement(row, "td", {
        text: "No maps match the current filter.",
        attributes: { colspan: 6 },
      });
      cell.style.textAlign = "center";
      cell.style.color = "var(--ink-muted)";
      cell.style.padding = "1.5rem";
      elements.mapRows.appendChild(row);
    } else {
      pageItems.forEach((map) => {
        const row = documentRef.createElement("tr");
        const next = map.dueNow ? "now" : map.nextCheckInSeconds ? `${map.nextCheckInSeconds}s` : "—";
        const mapCell = createElement(row, "td");
        createElement(mapCell, "strong", { text: map.name || "Unknown" });
        createElement(mapCell, "br");
        createElement(mapCell, "span", { text: map.uid || "—" });
        createElement(row, "td", { text: `${map.campaign || "Unassigned"} #${map.slot || 0}` });
        createElement(row, "td", { text: fmtMs(map.wrMs || 0) });
        createElement(row, "td", { text: map.wrHolder || "—" });
        const statusCell = createElement(row, "td");
        createElement(statusCell, "span", {
          className: map.dueNow ? "flag flag-due" : "flag flag-wait",
          text: map.dueNow ? "due now" : "scheduled",
        });
        createElement(row, "td", { text: next });
        elements.mapRows.appendChild(row);
      });
    }
    elements.pageInfo.textContent = `Page ${state.pagination.page} of ${totalPages}`;
    elements.pagePrev.disabled = state.pagination.page <= 1;
    elements.pageNext.disabled = state.pagination.page >= totalPages;
  }

  function renderEngine() {
    renderTrackerEngine(
      {
        provider: elements.engineProvider,
        tick: elements.engineTick,
        status: elements.engineStatus,
        started: elements.engineStarted,
        finished: elements.engineFinished,
        error: elements.engineError,
      },
      state.status?.runtime
    );
  }

  function renderRuns() {
    clearElement(elements.runsList);
    if (!state.runs.length) {
      createElement(elements.runsList, "div", { className: "feed-empty", text: "No runs recorded." });
      return;
    }
    state.runs.forEach((run) => {
      const row = documentRef.createElement("div");
      row.className = "terminal-feed-line";
      const changeLabel = state.mode === "leaderboard" ? "top_changes" : "changes";
      createElement(row, "span", { className: "feed-time", text: `[${fmtAgo(run.finishedAt)}]` });
      createElement(row, "span", { className: "feed-action", text: `RUN_#${run.runId || "?"}` });
      createElement(row, "span", {
        className: "feed-data",
        text: `ck=${run.mapsChecked || 0}/${run.mapsConsidered || 0} ${changeLabel}=${run.wrChanges || 0} src=${run.provider || "unknown"}`,
      });
      elements.runsList.appendChild(row);
    });
  }

  function updateFeedNote() {
    if (state.stream.connected) {
      const sourceLabel = state.source.remoteProxyRead
        ? "primary-via-gateway"
        : state.source.usePrimaryRead && state.source.primaryReadHealthy
          ? "primary"
          : "local";
      if (elements.feedNote) elements.feedNote.textContent = `Live stream connected (${sourceLabel})`;
      if (hasCheckFeed && !state.liveChecks.length) {
        elements.checkFeedNote.textContent = "Live stream connected. Waiting for checked maps...";
      }
      return;
    }
    if (!eventSourceAvailable) {
      if (elements.feedNote) {
        elements.feedNote.textContent = `Auto-updates every ${Math.floor(config.fallbackRefreshMs / 1000)}s`;
      }
      if (hasCheckFeed && !state.liveChecks.length) {
        elements.checkFeedNote.textContent = `Fallback refresh every ${Math.floor(config.fallbackRefreshMs / 1000)}s`;
      }
      return;
    }
    if (elements.feedNote) {
      elements.feedNote.textContent = `Reconnecting live stream (fallback ${Math.floor(config.fallbackRefreshMs / 1000)}s)`;
    }
    if (hasCheckFeed && !state.liveChecks.length) elements.checkFeedNote.textContent = "Reconnecting check stream...";
  }

  function applyRunNowAvailability() {
    if (!elements.runNowBtn) return;
    const disabled = (state.source.usePrimaryRead && state.source.primaryReadHealthy) || state.source.remoteProxyRead;
    elements.runNowBtn.disabled = disabled;
    elements.runNowBtn.title = disabled ? "Disabled while reading tracker data from primary." : "";
    elements.runNowBtn.textContent = disabled ? "Run Now (disabled on primary)" : "Run Now";
  }

  return {
    applyModeUI,
    applyRunNowAvailability,
    elements,
    formatAgo: fmtAgo,
    hasCheckFeed,
    renderEngine,
    renderFeed,
    renderLiveChecks,
    renderMaps,
    renderRuns,
    renderSpotlight,
    renderStats,
    switchTab,
    updateFeedNote,
  };
}

export { collectTrackerElements, createTrackerState, createTrackerView };
