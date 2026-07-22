import assert from "node:assert/strict";
import test from "node:test";

import { LiveMonitoringService } from "../src/services/altered/liveMonitoringService.js";

const MONITOR_CONFIG = {
  enabled: false,
  scheduleMode: "daily",
  dailyHourUtc: 7,
  dailyMinuteUtc: 15,
  clubId: 99,
  intervalSeconds: 600,
  discoveryEnabled: true,
  discoveryIntervalSeconds: 900,
  discoveryCampaignLimit: 20,
  discoveryActivityPageSize: 25,
  activityPageSize: 50,
  activeOnly: true,
  fetchMapDetails: false,
  trackerChunkSize: 75,
};

function createService({
  repositoryOverrides = {},
  liveClient = null,
  mapCopyRunning = false,
  logger = { warn() {}, info() {}, error() {} },
} = {}) {
  const persistedConfigs = [];
  const repository = {
    configuration: {
      getLiveMonitorConfig() {
        return { ...MONITOR_CONFIG };
      },
      upsertLiveMonitorConfig(config) {
        persistedConfigs.push(config);
      },
      getHookConfig() {
        return null;
      },
      ...repositoryOverrides.configuration,
    },
    monitoring: {
      ...repositoryOverrides.monitoring,
    },
  };
  const alterationCatalogService = {
    alterationsSync: { running: false },
    queueAlterationsSync() {},
  };
  const mapProcessingService = {
    mapCopy: { running: mapCopyRunning },
  };
  const playerIdentityService = {
    trackerIntegrations: { clubFallbackLocal: false },
    getMapperNameSyncStatus() {
      return { running: false };
    },
    shouldUseClubRelay() {
      return false;
    },
    async syncMapperNamesForCampaigns() {
      return { mapperAccountsSeen: 0 };
    },
  };
  const projectSourceService = {
    getProjectClubs() {
      return [];
    },
    async syncHookSnapshot() {
      return { synced: {} };
    },
  };
  const trackerSyncService = {
    getTrackerMapSyncTargets() {
      return [];
    },
  };
  const service = new LiveMonitoringService({
    repository,
    liveClient,
    liveMonitorConfig: MONITOR_CONFIG,
    logger,
    getAlterationCatalogService: () => alterationCatalogService,
    getMapProcessingService: () => mapProcessingService,
    getPlayerIdentityService: () => playerIdentityService,
    getProjectSourceService: () => projectSourceService,
    getTrackerSyncService: () => trackerSyncService,
  });

  return {
    service,
    repository,
    persistedConfigs,
    playerIdentityService,
    projectSourceService,
  };
}

test("LiveMonitoringService retains its public method contract", () => {
  const methods = Object.getOwnPropertyNames(LiveMonitoringService.prototype)
    .filter((name) => name !== "constructor")
    .sort();

  assert.deepEqual(methods, [
    "_runLiveJobInWorker",
    "alterationsSync",
    "computeNextDiscoveryRunIso",
    "computeNextScheduledRunIso",
    "fetchAllClubActivities",
    "fetchAllClubMembers",
    "fetchAllClubUploadBuckets",
    "fetchLiveClubStructure",
    "getLiveMonitorConfigSnapshot",
    "getLiveMonitorStatus",
    "getProjectClubsForSync",
    "mapCopy",
    "persistLiveMonitorConfig",
    "resolveCoreMapClient",
    "resolveLiveClient",
    "resolveLiveOptions",
    "runLiveDiscoveryCycle",
    "runLiveDiscoveryCycleDetached",
    "runLiveMonitorCycle",
    "runLiveMonitorCycleDetached",
    "scheduleNextDiscoveryRun",
    "scheduleNextLiveMonitorRun",
    "startLiveMonitor",
    "stopLiveMonitor",
    "syncLiveClubSnapshot",
    "trackerIntegrations",
    "updateLiveMonitorConfig",
    "updateLiveProgress",
  ]);
});

test("monitor configuration snapshots contain only persistent settings", () => {
  const { service } = createService();

  assert.deepEqual(service.getLiveMonitorConfigSnapshot(), MONITOR_CONFIG);
  assert.equal(service.liveMonitor.running, false);
  assert.equal(service.liveMonitor.progress, null);
  assert.equal(service.getLiveMonitorStatus().monitor.clubId, 99);
  assert.deepEqual(service.getLiveMonitorStatus().projectClubs, []);
});

test("progress updates merge counters, normalize maps, and reset map state between phases", () => {
  const { service } = createService();

  service.updateLiveProgress({
    phase: "maps",
    percent: 150,
    counters: { loaded: 2 },
    currentMapUid: "  uid-one  ",
    currentMapName: "  First map  ",
    currentMaps: [{ mapUid: " uid-two ", mapName: " Second map " }, null],
  });
  const next = service.updateLiveProgress({
    phase: "members",
    percent: -4,
    counters: { stored: 1 },
  });

  assert.equal(next.percent, 0);
  assert.deepEqual(next.counters, { loaded: 2, stored: 1 });
  assert.equal(next.currentMapUid, null);
  assert.equal(next.currentMapName, "");
  assert.deepEqual(next.currentMaps, []);
  assert.match(next.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("schedule calculations support daily and interval modes", () => {
  const { service } = createService();
  const beforeDailyRun = Date.parse("2026-02-03T07:00:00.000Z");
  const afterDailyRun = Date.parse("2026-02-03T08:00:00.000Z");

  assert.equal(service.computeNextScheduledRunIso({ fromTimeMs: beforeDailyRun }), "2026-02-03T07:15:00.000Z");
  assert.equal(service.computeNextScheduledRunIso({ fromTimeMs: afterDailyRun }), "2026-02-04T07:15:00.000Z");

  service.liveMonitor.scheduleMode = "interval";
  assert.equal(service.computeNextScheduledRunIso({ fromTimeMs: beforeDailyRun }), "2026-02-03T07:10:00.000Z");
  assert.equal(service.computeNextDiscoveryRunIso({ fromTimeMs: beforeDailyRun }), "2026-02-03T07:15:00.000Z");
});

test("live option resolution clamps values and preserves monitor defaults", () => {
  const { service } = createService();

  assert.deepEqual(service.resolveLiveOptions({}), {
    clubId: 99,
    activityPageSize: 50,
    activeOnly: true,
    fetchMapDetails: false,
  });
  assert.deepEqual(
    service.resolveLiveOptions({
      clubId: 0,
      activityPageSize: 999,
      activeOnly: "false",
      fetchMapDetails: "true",
    }),
    {
      clubId: 1,
      activityPageSize: 250,
      activeOnly: false,
      fetchMapDetails: true,
    }
  );
});

test("activity pagination retries player-not-found responses with active-only filtering", async () => {
  const { service } = createService();
  const calls = [];
  const liveClient = {
    async getClubActivities(_clubId, options) {
      calls.push(options);
      if (calls.length === 1) {
        const error = new Error("player:error-notFound");
        error.statusCode = 404;
        throw error;
      }
      if (calls.length === 2) return { activityList: [{ id: 1 }, { id: 2 }] };
      return { activityList: [] };
    },
  };

  const result = await service.fetchAllClubActivities(liveClient, 99, {
    activityPageSize: 2,
    activeOnly: false,
  });

  assert.deepEqual(result, {
    activities: [{ id: 1 }, { id: 2 }],
    pagesLoaded: 1,
    effectiveActiveOnly: true,
    forcedActiveOnlyFallback: true,
  });
  assert.deepEqual(
    calls.map(({ offset, activeOnly }) => ({ offset, activeOnly })),
    [
      { offset: 0, activeOnly: false },
      { offset: 0, activeOnly: true },
      { offset: 2, activeOnly: true },
    ]
  );
});

test("full club fetch continues with fallback payloads and reports stage warnings", async () => {
  const liveClient = {
    isConfigured() {
      return true;
    },
    async getClubById() {
      return { name: "Altered" };
    },
    async getClubActivities() {
      return {
        activityList: [
          {
            id: 11,
            activityType: "campaign",
            campaignId: 201,
            campaignName: "Fallback campaign",
            maps: [{ uid: "campaign-map", name: "Campaign map" }],
          },
          {
            id: 12,
            activityType: "upload",
            bucketId: 301,
            mapUid: "upload-map",
            mapName: "Upload map",
          },
        ],
      };
    },
    async getClubMembers() {
      throw new Error("members unavailable");
    },
    async getClubBuckets() {
      return { bucketList: [{ bucketId: 301, name: "Uploads" }] };
    },
    async getClubBucketById() {
      throw new Error("bucket unavailable");
    },
    async getClubCampaignById() {
      throw new Error("campaign unavailable");
    },
    async getMapsByUidList(mapUids, options) {
      assert.deepEqual(mapUids, ["campaign-map"]);
      assert.equal(typeof options.onChunk, "function");
      return [{ uid: "campaign-map", name: "Enriched campaign map" }];
    },
  };
  const { service } = createService({ liveClient });

  const result = await service.fetchLiveClubStructure({ fetchMapDetails: true });

  assert.equal(result.campaigns.length, 1);
  assert.equal(result.campaigns[0].maps[0].uid, "campaign-map");
  assert.equal(result.campaigns[0].maps[0].name, "Enriched campaign map");
  assert.equal(result.uploadBuckets.length, 1);
  assert.equal(result.summary.campaignsLoaded, 1);
  assert.equal(result.summary.mapDetailsLoaded, 1);
  assert.equal(result.summary.uploadBucketDetailsLoaded, 0);
  assert.deepEqual(result.warnings, [
    "club members: members unavailable",
    "upload bucket 301: bucket unavailable",
    "campaign 201: campaign unavailable",
  ]);
});

test("hourly discovery shares content stages while keeping upload failures non-fatal", async () => {
  const warnings = [];
  const liveClient = {
    isConfigured() {
      return true;
    },
    async getClubById() {
      return { name: "Altered" };
    },
    async getClubActivities() {
      return {
        activityList: [
          { id: 21, activityType: "campaign", campaignId: 401, campaignName: "New campaign" },
          { id: 22, activityType: "upload", bucketId: 501, mapUid: "upload-map" },
        ],
      };
    },
    async getClubBucketById() {
      throw new Error("bucket discovery unavailable");
    },
    async getClubCampaignById() {
      return { campaignId: 401, name: "New campaign", maps: [{ uid: "new-map" }] };
    },
    async getMapsByUidList(mapUids, ...rest) {
      assert.deepEqual(mapUids, ["new-map"]);
      assert.equal(rest.length, 0);
      return [{ uid: "new-map", name: "Hydrated discovery map" }];
    },
  };
  const { service } = createService({
    liveClient,
    logger: {
      warn(message) {
        warnings.push(message);
      },
      info() {},
      error() {},
    },
    repositoryOverrides: {
      monitoring: {
        getKnownActivityIds() {
          return [];
        },
        getKnownUploadBucketIds() {
          return [];
        },
        getKnownCampaignExternalIds() {
          return [];
        },
        upsertClubMonitoringData() {
          return { activitiesSeen: 2, uploadBucketsSeen: 1 };
        },
      },
    },
  });
  service.liveMonitor.fetchMapDetails = true;

  const result = await service.runLiveDiscoveryCycle({ reason: "stage-contract" });

  assert.equal(result.summary.newCampaignsStored, 1);
  assert.equal(result.summary.discoveredMapUids, 1);
  assert.equal(result.summary.mapDetailsLoaded, 1);
  assert.equal(result.summary.uploadBucketsSeen, 1);
  assert.equal(result.summary.uploadBucketDetailsLoaded, 0);
  assert.equal(service.liveMonitor.discoveryRunning, false);
  assert.deepEqual(warnings, [
    "[altered-live] discovery: failed to hydrate upload bucket 501: bucket discovery unavailable",
  ]);
});

test("hourly discovery keeps campaign hydration failures cycle-fatal", async () => {
  const warnings = [];
  const liveClient = {
    isConfigured() {
      return true;
    },
    async getClubById() {
      return { name: "Altered" };
    },
    async getClubActivities() {
      return {
        activityList: [{ id: 31, activityType: "campaign", campaignId: 601, campaignName: "Broken" }],
      };
    },
    async getClubCampaignById() {
      throw new Error("campaign discovery unavailable");
    },
  };
  const { service } = createService({
    liveClient,
    logger: {
      warn(message) {
        warnings.push(message);
      },
      info() {},
      error() {},
    },
    repositoryOverrides: {
      monitoring: {
        getKnownActivityIds() {
          return [];
        },
        getKnownUploadBucketIds() {
          return [];
        },
        getKnownCampaignExternalIds() {
          return [];
        },
      },
    },
  });

  const result = await service.runLiveDiscoveryCycle({ reason: "failure-contract" });

  assert.deepEqual(result, { error: "campaign discovery unavailable" });
  assert.equal(service.liveMonitor.lastDiscoveryError, "campaign discovery unavailable");
  assert.equal(service.liveMonitor.discoveryRunning, false);
  assert.deepEqual(warnings, ["[altered-live] discovery cycle failed: campaign discovery unavailable"]);
});

test("detached cycles retain their existing concurrency guards", async () => {
  const { service } = createService({ mapCopyRunning: true });

  assert.deepEqual(await service.runLiveMonitorCycleDetached(), {
    skipped: true,
    reason: "map-local-copy-backfill running",
  });
  assert.deepEqual(await service.runLiveDiscoveryCycleDetached(), {
    skipped: true,
    reason: "map-local-copy-backfill running",
  });
});

test("composed monitor cycles retain facade seams and aggregate club results", async () => {
  const { service } = createService({
    repositoryOverrides: {
      configuration: {
        getHookConfig() {
          return {
            hookKey: "altered-club",
            clubId: 99,
            clubName: "Altered",
            sourceLabel: "altered-live-monitor",
            enabled: true,
          };
        },
      },
    },
  });
  const phases = [];
  const originalUpdateLiveProgress = service.updateLiveProgress.bind(service);
  service.updateLiveProgress = (partial) => {
    phases.push(partial.phase);
    return originalUpdateLiveProgress(partial);
  };
  service.syncLiveClubSnapshot = async ({ clubId }) => ({
    fetched: {
      summary: {
        campaignsLoaded: 2,
        mapsLoaded: 4,
      },
      warnings: [],
    },
    synced: {
      mapsSeen: 4,
      mapsInserted: 3,
      mapsUpdated: 1,
      mapsLinked: 4,
      monitoring: {},
      mapperNames: {},
      clubId,
    },
  });

  const result = await service.runLiveMonitorCycle({ reason: "contract-test" });

  assert.equal(result.fetched.summary.clubsSynced, 1);
  assert.equal(result.fetched.summary.campaignsLoaded, 2);
  assert.equal(result.fetched.summary.mapsLoaded, 4);
  assert.deepEqual(phases, ["queued", "complete"]);
  assert.equal(service.liveMonitor.running, false);
  assert.equal(service.liveMonitor.lastSummary.mapsInserted, 3);
});

test("club snapshot sync composes fetching, storage, and mapper-name synchronization", async () => {
  const { service, playerIdentityService, projectSourceService } = createService({
    repositoryOverrides: {
      monitoring: {
        upsertClubMonitoringData() {
          return {
            membersSeen: 1,
            activitiesSeen: 2,
            uploadBucketsSeen: 1,
            uploadMapsSeen: 3,
          };
        },
      },
    },
  });
  service.fetchLiveClubStructure = async () => ({
    club: { id: 99, name: "Altered" },
    campaigns: [{ id: 7 }],
    members: [{ accountId: "one" }],
    activities: [{ id: 8 }, { id: 9 }],
    uploadBuckets: [{ bucketId: 10 }],
    summary: { campaignsLoaded: 1, mapsLoaded: 3 },
    warnings: [],
  });
  projectSourceService.syncHookSnapshot = async ({ hookKey, club }) => ({
    synced: { hookKey, clubId: club.id, mapsSeen: 3 },
  });
  playerIdentityService.syncMapperNamesForCampaigns = async () => ({
    mapperAccountsSeen: 2,
    mapperNamesResolved: 2,
  });

  const result = await service.syncLiveClubSnapshot({ hookKey: "altered-club" });

  assert.equal(result.synced.hookKey, "altered-club");
  assert.equal(result.synced.clubId, 99);
  assert.equal(result.synced.monitoring.membersSeen, 1);
  assert.equal(result.synced.monitoring.uploadMapsSeen, 3);
  assert.equal(result.synced.mapperNames.mapperNamesResolved, 2);
});
