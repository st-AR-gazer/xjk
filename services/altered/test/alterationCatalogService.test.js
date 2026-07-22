import assert from "node:assert/strict";
import test from "node:test";

import { AlterationCatalogService } from "../src/services/altered/alterationCatalogService.js";
import { PublicApiService } from "../src/services/altered/alterationCatalog/publicApiService.js";
import { UpdateRequestService } from "../src/services/altered/alterationCatalog/updateRequestService.js";

function createCatalogService() {
  const liveMonitor = { enabled: false };
  const service = new AlterationCatalogService({
    repository: {},
    trackerClient: {},
    getLiveMonitoringService: () => ({ liveMonitor }),
    getPlayerIdentityService: () => ({}),
    getTrackerSyncService: () => ({}),
  });
  return { liveMonitor, service };
}

test("AlterationCatalogService keeps its public contract while delegating domain work", () => {
  const { service } = createCatalogService();
  const routes = [
    ["getDashboard", "catalogBrowseService", "getDashboard", [{ includeTracker: false }]],
    ["getAlterationsStats", "catalogBrowseService", "getAlterationsStats", []],
    ["getAlterationsMapFilters", "catalogBrowseService", "getAlterationsMapFilters", []],
    ["getConfiguredAlterations", "catalogBrowseService", "getConfiguredAlterations", []],
    ["getAlterationsMaps", "catalogBrowseService", "getAlterationsMaps", [{ limit: 4 }]],
    ["getAlterationsCampaigns", "catalogBrowseService", "getAlterationsCampaigns", [{ q: "spring" }]],
    ["syncAlterations", "alterationSyncService", "syncAlterations", []],
    ["getAlterationsSyncStatus", "alterationSyncService", "getAlterationsSyncStatus", []],
    ["queueAlterationsSync", "alterationSyncService", "queueAlterationsSync", [{ reason: "test" }]],
    ["_resolveCampaignDbId", "catalogBrowseService", "resolveCampaignDbId", ["campaign"]],
    ["getAlterationTypes", "catalogBrowseService", "getAlterationTypes", []],
    ["getAlterationsUploads", "catalogBrowseService", "getAlterationsUploads", [{ limit: 2 }]],
    ["getAlterationsLeaderboards", "leaderboardService", "getAlterationsLeaderboards", [{ limit: 3 }]],
    ["getMonitorLeaderboardLive", "leaderboardService", "getMonitorLeaderboardLive", [{ feedLimit: 7 }]],
    ["receiveWrWebhook", "leaderboardService", "receiveWrWebhook", [{ mapUid: "uid" }]],
    ["getLatestWr", "leaderboardService", "getLatestWr", [{ limit: 8 }]],
    ["submitUpdateRequest", "updateRequestService", "submitUpdateRequest", [{ uid: "uid" }]],
    ["listUpdateRequests", "updateRequestService", "listUpdateRequests", [{ status: "queued" }]],
    ["updateUpdateRequestStatus", "updateRequestService", "updateUpdateRequestStatus", [{ requestId: 4 }]],
    ["getCampaignTimeline", "catalogBrowseService", "getCampaignTimeline", [{ limit: 9 }]],
    ["getHookStatus", "catalogBrowseService", "getHookStatus", []],
    ["getHookMaps", "catalogBrowseService", "getHookMaps", [{ q: "map" }]],
    ["getAdminMapsWorkspace", "catalogBrowseService", "getAdminMapsWorkspace", [{ page: 2 }]],
    ["getHookRuns", "catalogBrowseService", "getHookRuns", [12]],
    ["getMapInfo", "catalogBrowseService", "getMapInfo", ["uid"]],
    ["getPublicApiCatalog", "publicApiService", "getPublicApiCatalog", []],
    ["getLegacyMapInfo", "publicApiService", "getLegacyMapInfo", ["uid"]],
    ["getPublicMapDetail", "publicApiService", "getPublicMapDetail", ["uid", { wrHistoryLimit: 2 }]],
    ["recordPublicApiRequest", "publicApiService", "recordPublicApiRequest", [{ method: "GET" }]],
    ["getPublicApiUsageSummary", "publicApiService", "getPublicApiUsageSummary", [{ days: 3 }]],
  ];

  for (const [facadeMethod, collaborator, collaboratorMethod, args] of routes) {
    const marker = { facadeMethod };
    service[collaborator][collaboratorMethod] = (...receivedArgs) => ({ marker, receivedArgs });
    assert.deepEqual(service[facadeMethod](...args), { marker, receivedArgs: args });
  }
});

test("AlterationCatalogService shares sync state and live-monitor identity with its collaborators", () => {
  const { liveMonitor, service } = createCatalogService();

  assert.equal(service.liveMonitor, liveMonitor);
  assert.equal(service.alterationSyncService.alterationsSync, service.alterationsSync);
  assert.deepEqual(service.alterationsSync, {
    running: false,
    queued: false,
    runCounter: 0,
    currentReason: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastDurationMs: null,
    lastError: null,
    lastSummary: null,
    worker: null,
    promise: null,
  });
});

test("UpdateRequestService validates, stores, and prepares a requested map", async () => {
  const calls = [];
  const inserted = { id: 7, mapUid: "map-uid", mapName: "Stored name" };
  const service = new UpdateRequestService({
    repository: {
      activity: {
        getRecentUpdateRequest: () => null,
        insertUpdateRequest: (request) => {
          calls.push(["insert", request]);
          return inserted;
        },
      },
      maps: {
        getMapInfo: () => ({ map: { name: "Stored name" } }),
      },
    },
    getTrackerSyncService: () => ({
      ensureMapIsKnownToTracker: async (mapUid) => {
        calls.push(["ensure", mapUid]);
        return { ok: true };
      },
      updateMapTrackingAcrossTargets: async (mapUid, update) => {
        calls.push(["track", mapUid, update]);
        return { ok: true };
      },
    }),
  });

  assert.deepEqual(await service.submitUpdateRequest(), { error: "Map UID is required." });
  assert.deepEqual(await service.submitUpdateRequest({ uid: " map-uid " }), {
    ok: true,
    request: inserted,
    tracker: { prepared: true, warning: null },
  });
  assert.equal(calls[0][0], "insert");
  assert.equal(calls[0][1].mapName, "Stored name");
  assert.deepEqual(calls.slice(1), [
    ["ensure", "map-uid"],
    ["track", "map-uid", { tracked: true, status: "live" }],
  ]);
});

test("PublicApiService preserves the not-found and request-recording contracts", () => {
  const request = { endpointKey: "public-map-detail" };
  const service = new PublicApiService({
    repository: {
      activity: {
        recordApiRequest: (value) => ({ recorded: value }),
      },
      maps: {
        getMapInfo: () => ({ exists: false }),
      },
    },
    getPlayerIdentityService: () => ({}),
  });

  assert.deepEqual(service.getPublicMapDetail("missing"), {
    exists: false,
    mapUid: "missing",
  });
  assert.deepEqual(service.getLegacyMapInfo("missing"), {
    exists: false,
    mapUid: "missing",
  });
  assert.deepEqual(service.recordPublicApiRequest(request), { recorded: request });
});
