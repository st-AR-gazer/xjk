import assert from "node:assert/strict";
import test from "node:test";

import { AlteredService } from "../src/services/alteredService.js";

function createService() {
  const repository = {
    configuration: {
      getLiveMonitorConfig() {
        return null;
      },
      upsertLiveMonitorConfig() {},
    },
  };
  const trackerClient = {
    adminBaseUrl: "http://tracker.test/admin",
    bulkUpsertMaps() {},
  };
  return new AlteredService({
    repository,
    trackerClient,
    liveMonitorConfig: { enabled: false },
    mapCopyConfig: { enabled: false },
  });
}

test("AlteredService exposes stateful services through named domain boundaries", () => {
  const service = createService();

  assert.deepEqual(Object.keys(service).sort(), ["catalog", "maps", "monitoring", "players", "sources", "tracker"]);
  assert.equal(service.monitoring.liveMonitor.enabled, false);
  assert.equal(service.maps.mapCopy.enabled, false);
  assert.deepEqual(Object.keys(service.maps).sort(), [
    "mapLocalFileService",
    "mapNameWorkspaceService",
    "similarityBackfillService",
  ]);
  assert.equal(service.players.playerNamesCache instanceof Map, true);
  assert.equal(service.tracker.getTrackerMapSyncTargets().length, 1);
  assert.equal(service.getDashboard, undefined);
  assert.equal(service.listMaps, undefined);

  service.monitoring.stopLiveMonitor();
  service.sources.stopProjectSourceSyncScheduler();
  service.players.stopMapperNameSyncScheduler();
});

test("callers select a domain instead of routing through a flat facade", () => {
  const service = createService();
  const marker = { status: "delegated" };
  service.maps.mapNameWorkspaceService.processMapNameStandardization = (...args) => ({ marker, args });

  assert.deepEqual(service.maps.processMapNameStandardization({ q: "test" }), {
    marker,
    args: [{ q: "test" }],
  });
  assert.deepEqual(service.catalog.getAlterationsSyncStatus(), {
    running: false,
    queued: false,
    runCounter: 0,
    currentReason: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastDurationMs: null,
    lastError: null,
    lastSummary: null,
  });

  service.monitoring.stopLiveMonitor();
  service.sources.stopProjectSourceSyncScheduler();
  service.players.stopMapperNameSyncScheduler();
});
