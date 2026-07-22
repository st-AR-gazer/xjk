import { requestJsonQuiet } from "./api.js";
import { elements } from "./dom.js";
import { buildMapPath, buildRecordPath } from "./routes.js";
import { renderLiveQueueMessage, renderLiveQueuePanel } from "./live-renderers.js";
import { loadMap, loadRecord } from "./lookups.js";
import { state } from "./state.js";
import { copyText, setError, setStatus } from "./ui.js";
import { getActiveWorkspace } from "./workspace.js";

const LIVE_POLL_INTERVAL_MS = 7000;
const LIVE_RECORD_LIMIT = 250;
const LIVE_MAP_LIMIT = 18;

function clearLivePollTimer() {
  if (state.livePollTimer) {
    window.clearInterval(state.livePollTimer);
    state.livePollTimer = null;
  }
}

function activityKeyFor(activity) {
  if (!activity?.record_id) {
    return "";
  }
  return [
    activity.record_id,
    activity.map_uid || "",
    activity.track || "",
    activity.status || "",
    activity.updated_at || "",
  ].join(":");
}

function renderCurrentLiveQueue() {
  if (!elements.liveResult || !state.liveQueue.data) {
    return;
  }

  renderLiveQueuePanel(elements.liveResult, state.liveQueue.data, {
    freshActivityKey: state.liveQueue.latestActivityKey,
    activityKeyFor,
    onOpenRecord: (recordId) => {
      setLiveQueueActive(false);
      void loadRecord(recordId, { updateHistory: true });
    },
    onOpenMap: (mapUid, mapView = {}) => {
      setLiveQueueActive(false);
      void loadMap(mapUid, { updateHistory: true, mapView });
    },
    onCopyRecordLink: (recordId) => {
      copyText(new URL(buildRecordPath(recordId), window.location.origin).toString(), "Record link copied.");
    },
    onCopyMapLink: (mapUid) => {
      copyText(new URL(buildMapPath(mapUid), window.location.origin).toString(), "Map link copied.");
    },
  });
}

async function fetchLiveQueue({ announce = false } = {}) {
  if (state.liveQueue.loading) {
    return;
  }

  state.liveQueue.loading = true;
  try {
    const data = await requestJsonQuiet(
      `/api/v1/live?limit=${encodeURIComponent(String(LIVE_RECORD_LIMIT))}&mapLimit=${encodeURIComponent(String(LIVE_MAP_LIMIT))}`
    );

    const latestActivityKey = activityKeyFor(data.latest_activity);
    state.liveQueue.latestActivityKey =
      latestActivityKey && latestActivityKey !== activityKeyFor(state.liveQueue.data?.latest_activity)
        ? latestActivityKey
        : "";
    state.liveQueue.data = data;
    renderCurrentLiveQueue();
    state.liveQueue.latestActivityKey = "";

    if (getActiveWorkspace() === "live") {
      setError("");
    }
    if (announce) {
      setStatus("Live queue refreshed.");
    }
  } catch (error) {
    if (!state.liveQueue.data && elements.liveResult) {
      renderLiveQueueMessage(
        elements.liveResult,
        "Live queue unavailable",
        error?.message || "Could not load public queue data."
      );
    }

    if (getActiveWorkspace() === "live") {
      setError(error?.message || "Live queue refresh failed.");
    }
  } finally {
    state.liveQueue.loading = false;
  }
}

function ensureLivePolling() {
  clearLivePollTimer();

  if (!state.liveQueue.active) {
    return;
  }

  state.livePollTimer = window.setInterval(() => {
    if (!state.liveQueue.active || document.visibilityState !== "visible") {
      return;
    }
    void fetchLiveQueue();
  }, LIVE_POLL_INTERVAL_MS);
}

export function setLiveQueueActive(isActive) {
  state.liveQueue.active = Boolean(isActive);

  if (!state.liveQueue.active) {
    clearLivePollTimer();
    return;
  }

  if (!state.liveQueue.data && elements.liveResult) {
    renderLiveQueueMessage(elements.liveResult, "Loading live queue", "Watching known public records...");
  } else {
    renderCurrentLiveQueue();
  }

  void fetchLiveQueue();
  ensureLivePolling();
}

export function bindLiveQueue() {
  elements.liveRefreshButton?.addEventListener("click", () => {
    void fetchLiveQueue({ announce: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (!state.liveQueue.active) {
      return;
    }

    if (document.visibilityState === "visible") {
      void fetchLiveQueue();
      ensureLivePolling();
      return;
    }

    clearLivePollTimer();
  });
}
