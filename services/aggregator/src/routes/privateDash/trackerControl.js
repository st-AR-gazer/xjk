import { createTrackerDefinitions } from "./trackerControl/definitions.js";
import { buildPrioritySnapshot, restorePrioritySnapshot } from "./trackerControl/prioritySnapshot.js";
import { createPriorityStateStore } from "./trackerControl/priorityStateStore.js";
import { createTrackerProbeClient } from "./trackerControl/probeClient.js";
import { createTrackerClient } from "./trackerControl/trackerClient.js";

function createTrackerController({ logDir = ".", fetchImpl = fetch, env = process.env, ...control } = {}) {
  const trackers = createTrackerDefinitions(control);
  const client = createTrackerClient({
    trackers,
    adminToken: control.adminToken,
    requestJson: control.requestJson,
  });
  const probeClient = createTrackerProbeClient({ trackers, fetchImpl, env });
  const stateStore = createPriorityStateStore({ logDir });

  return Object.freeze({
    buildPrioritySnapshot,
    ensurePriorityStateLoaded: stateStore.ensurePriorityStateLoaded,
    fetchAllStatuses: client.fetchAllStatuses,
    getPriorityState: stateStore.getPriorityState,
    getTracker: client.getTracker,
    persistPriorityState: stateStore.persistPriorityState,
    probeTrackers: probeClient.probeTrackers,
    restorePrioritySnapshot: (snapshot) =>
      restorePrioritySnapshot({ trackers, sendControlRequest: client.sendControlRequest }, snapshot),
    sendControlRequest: client.sendControlRequest,
    setPriorityState: stateStore.setPriorityState,
  });
}

export { createTrackerController };
