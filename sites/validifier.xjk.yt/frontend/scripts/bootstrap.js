import { elements } from "./dom.js";
import { bindLiveQueue, setLiveQueueActive } from "./live-queue.js";
import { loadMap, loadRecord, seedMapViewState } from "./lookups.js";
import { bindProductPanels, renderRecentHistoryPanel } from "./product-panels.js";
import {
  navigateToClients,
  navigateToLive,
  navigateToMap,
  navigateToRecent,
  navigateToRecord,
  navigateToSubmission,
  parseAppRoute,
} from "./routes.js";
import { state } from "./state.js";
import {
  pollSubmittedRecord,
  renderArtifactStatus,
  resetArtifactState,
  submitReplayVerification,
  uploadArtifact,
} from "./submission.js";
import { setInitialState, setSubmissionStatus } from "./ui.js";
import { activateWorkspace, bindWorkspaceTabs } from "./workspace.js";
import { loadServiceHealth } from "./health.js";

function applyRoute(route, options = {}) {
  const currentRoute = route || { workspace: "live" };
  setLiveQueueActive(currentRoute.workspace === "live");

  if (currentRoute.workspace === "live") {
    activateWorkspace("live");
    return;
  }

  if (currentRoute.workspace === "record") {
    activateWorkspace("record");
    if (currentRoute.recordId) {
      elements.recordInput.value = currentRoute.recordId;
      elements.submissionRecordIdInput.value = currentRoute.recordId;
      void loadRecord(currentRoute.recordId, { updateHistory: false, replaceHistory: options.replaceHistory });
      return;
    }
    setInitialState();
    return;
  }

  if (currentRoute.workspace === "map") {
    activateWorkspace("map");
    seedMapViewState(currentRoute.mapView);
    if (currentRoute.mapUid) {
      elements.mapInput.value = currentRoute.mapUid;
      elements.submissionMapUidInput.value = currentRoute.mapUid;
      void loadMap(currentRoute.mapUid, {
        updateHistory: false,
        replaceHistory: options.replaceHistory,
        mapView: currentRoute.mapView,
      });
      return;
    }
    setInitialState();
    return;
  }

  if (currentRoute.workspace === "submission") {
    activateWorkspace("submission");
    if (currentRoute.recordId) elements.submissionRecordIdInput.value = currentRoute.recordId;
    if (currentRoute.mapUid) elements.submissionMapUidInput.value = currentRoute.mapUid;
    return;
  }

  if (currentRoute.workspace === "clients") {
    activateWorkspace("clients");
    return;
  }

  if (currentRoute.workspace === "recent") {
    activateWorkspace("recent");
    renderRecentHistoryPanel();
    return;
  }

  activateWorkspace("live");
  setInitialState();
}

function bootFromLocation() {
  renderArtifactStatus();
  renderRecentHistoryPanel();
  setSubmissionStatus("Select files to prepare a replay submission.");
  applyRoute(parseAppRoute(window.location), { replaceHistory: true });
}

function wireLookupForms() {
  elements.recordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadRecord(elements.recordInput.value, { updateHistory: true });
  });

  elements.mapForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadMap(elements.mapInput.value, {
      updateHistory: true,
      mapView: {
        track: elements.mapTrackSelect.value,
      },
    });
  });

  elements.mapTrackSelect.addEventListener("change", () => {
    const currentMapUid = String(elements.mapInput.value || "").trim();
    if (!currentMapUid) {
      return;
    }
    void loadMap(currentMapUid, {
      updateHistory: true,
      replaceHistory: true,
      mapView: {
        track: elements.mapTrackSelect.value,
        page: 1,
      },
    });
  });
}

function wireSubmissionControls() {
  elements.mapUploadButton.addEventListener("click", () => {
    uploadArtifact("map").catch((error) => {
      if (error.name === "AbortError") {
        return;
      }

      setSubmissionStatus(error?.message || "Map upload failed.", "error");
      renderArtifactStatus();
    });
  });

  elements.replayUploadButton.addEventListener("click", () => {
    uploadArtifact("replay").catch((error) => {
      if (error.name === "AbortError") {
        return;
      }

      setSubmissionStatus(error?.message || "Replay upload failed.", "error");
      renderArtifactStatus();
    });
  });

  elements.submissionSubmitButton.addEventListener("click", () => {
    void submitReplayVerification();
  });

  elements.submissionPollButton.addEventListener("click", () => {
    pollSubmittedRecord().catch((error) => {
      setSubmissionStatus(error?.message || "Record polling failed.", "error");
    });
  });

  elements.mapFileInput.addEventListener("change", () => {
    resetArtifactState("map");
  });

  elements.replayFileInput.addEventListener("change", () => {
    resetArtifactState("replay");
  });
}

function wireLocationSync() {
  window.addEventListener("popstate", () => {
    applyRoute(parseAppRoute(window.location), { replaceHistory: true });
  });
}

function wireWorkspaceRoutes() {
  for (const button of elements.workspaceTabs) {
    button.addEventListener("click", () => {
      const target = button.dataset.workspaceTarget || "record";

      if (target === "live") {
        navigateToLive();
        setLiveQueueActive(true);
        return;
      }

      setLiveQueueActive(false);

      if (target === "clients") {
        navigateToClients();
        return;
      }

      if (target === "recent") {
        navigateToRecent();
        renderRecentHistoryPanel();
        return;
      }

      if (target === "submission") {
        navigateToSubmission({
          recordId: elements.submissionRecordIdInput.value,
          mapUid: elements.submissionMapUidInput.value,
        });
        return;
      }

      if (target === "map") {
        const mapUid = String(state.mapView.mapUid || elements.mapInput.value || "").trim();
        if (mapUid) {
          navigateToMap(mapUid, state.mapView);
        }
        return;
      }

      const recordId = String(elements.recordInput.value || state.lastSubmittedRecordId || "").trim();
      navigateToRecord(recordId);
    });
  }
}

export function bootApp() {
  bindWorkspaceTabs();
  bindLiveQueue();
  bindProductPanels();
  wireLookupForms();
  wireSubmissionControls();
  wireLocationSync();
  wireWorkspaceRoutes();
  loadServiceHealth();
  bootFromLocation();
}
