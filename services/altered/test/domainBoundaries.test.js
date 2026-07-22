import assert from "node:assert/strict";
import test from "node:test";

import { createDatabase } from "../src/db/index.js";
import { AlteredRepository } from "../src/repositories/alteredRepository.js";
import { AlteredService } from "../src/services/alteredService.js";

const SERVICE_BOUNDARIES = {
  catalog: ["getDashboard", "getPublicMapDetail", "submitUpdateRequest"],
  maps: ["getMapLocalStoreStatus", "processMapNameStandardization", "startNamingSimilarityBackfill"],
  monitoring: ["getLiveMonitorStatus", "runLiveMonitorCycle", "stopLiveMonitor"],
  players: ["resolvePlayerNamesByAccountIds", "runMapperNameSyncNow", "stopMapperNameSyncScheduler"],
  sources: ["getProjectSources", "syncProjectSourceByKey", "stopProjectSourceSyncScheduler"],
  tracker: ["getTrackerStatus", "runTrackerNow", "updateMapTracking"],
};

const REPOSITORY_BOUNDARIES = {
  activity: ["insertWrEvent", "recordApiRequest", "listUpdateRequests"],
  admin: ["getAdminUserById", "getAdminSessionByToken", "countActiveAdminUsers"],
  campaigns: ["upsertCampaign", "updateMapTracking", "getMapsForTracker"],
  catalog: ["getSummary", "listAlterations", "resolveCampaignDbId"],
  configuration: ["getHookConfig", "listProjectSources", "upsertLiveMonitorConfig"],
  ingestion: ["ingestProjectSourceSnapshot", "ingestHookSnapshot"],
  leaderboard: ["listWrLeaderboardOverall", "getWrLeaderboardSummary"],
  mapFiles: ["getMapLocalFiles", "getMapContentSignatures", "upsertMapLocalFiles"],
  mappers: ["upsertMapperNames", "getMapperAccountStats", "getMapperAccountsForSync"],
  maps: ["listMaps", "listMapsWorkspace", "getMapInfo"],
  monitoring: ["getHookStatus", "listHookRuns", "upsertClubMonitoringData"],
  naming: ["listMapsForNameStandardization", "getMapNameCandidate", "upsertMapNumberSimilarity"],
};

function assertNamedBoundaries(instance, contract) {
  for (const [boundaryName, representativeMethods] of Object.entries(contract)) {
    const boundary = instance[boundaryName];
    assert.ok(boundary, `${boundaryName} boundary must exist`);
    for (const method of representativeMethods) {
      assert.equal(typeof boundary[method], "function", `${boundaryName}.${method} must exist`);
      assert.equal(instance[method], undefined, `${method} must not leak onto the composition root`);
    }
  }
}

test("AlteredService exposes cohesive named boundaries without a flat compatibility facade", () => {
  const service = new AlteredService({
    repository: {
      configuration: {
        getLiveMonitorConfig: () => null,
        upsertLiveMonitorConfig() {},
      },
    },
    trackerClient: { adminBaseUrl: "http://tracker.test/admin", bulkUpsertMaps() {} },
    liveMonitorConfig: { enabled: false },
    mapCopyConfig: { enabled: false },
  });
  try {
    assert.deepEqual(Object.keys(service).sort(), Object.keys(SERVICE_BOUNDARIES).sort());
    assertNamedBoundaries(service, SERVICE_BOUNDARIES);
  } finally {
    service.monitoring.stopLiveMonitor();
    service.players.stopMapperNameSyncScheduler();
    service.sources.stopProjectSourceSyncScheduler();
  }
});

test("AlteredRepository exposes cohesive named boundaries without a flat compatibility facade", () => {
  const db = createDatabase({ filePath: ":memory:" });
  try {
    const repository = new AlteredRepository(db);
    assert.deepEqual(
      Object.keys(repository)
        .filter((key) => key !== "db")
        .sort(),
      Object.keys(REPOSITORY_BOUNDARIES).sort()
    );
    assertNamedBoundaries(repository, REPOSITORY_BOUNDARIES);
  } finally {
    db.close();
  }
});
