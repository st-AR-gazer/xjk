import assert from "node:assert/strict";
import test from "node:test";

import { ProjectSourceService } from "../src/services/altered/projectSourceService.js";

const SOURCE_KEYS = [
  "weekly-shorts",
  "official-seasonal-v2",
  "official-totd",
  "weekly-grands",
  "official-competition",
  "official-discovery",
  "official-legacy",
];

function createService({ repositoryOverrides = {}, liveMonitor = { clubId: 24231 } } = {}) {
  const upsertedSources = [];
  const repository = {
    monitoring: {
      listHookStatuses() {
        return [{ hookKey: "altered-club", clubId: 24231, enabled: true }];
      },
      getHookStatus() {
        return null;
      },
      ...repositoryOverrides.monitoring,
    },
    configuration: {
      getHookConfig() {
        return { hookKey: "altered-club", clubId: 24231 };
      },
      listProjectSources() {
        return [];
      },
      upsertProjectSource(source) {
        const stored = {
          ...source,
          lastSyncedAt: source.lastSyncedAt || null,
          summary: source.summary || null,
        };
        upsertedSources.push(stored);
        return stored;
      },
      ...repositoryOverrides.configuration,
    },
    ingestion: {
      ingestHookSnapshot() {
        return {
          campaignsSeen: 1,
          mapsSeen: 1,
          mapsInserted: 1,
          mapsUpdated: 0,
          mapsLinked: 1,
          uploadBucketsSeen: 0,
          uploadMapsSeen: 0,
          mapsForTracker: [{ mapUid: "map-one" }],
        };
      },
      ...repositoryOverrides.ingestion,
    },
    mapFiles: { ...repositoryOverrides.mapFiles },
  };
  const liveMonitoringService = {
    liveMonitor,
  };
  const mapProcessingService = {
    async runAutomaticNamingAssignments() {
      return {
        metadataAssignment: { mapsUpdated: 1 },
        namingAssignment: { ok: true, mapsAssigned: 1 },
      };
    },
  };
  const playerIdentityService = {
    trackerIntegrations: { clubFallbackLocal: false },
    shouldUseClubRelay() {
      return false;
    },
  };
  const trackerSyncService = {
    async syncMapsToTrackerInChunks(maps) {
      return {
        ok: true,
        targetCount: 1,
        chunkCount: 1,
        mapsSynced: maps.length,
      };
    },
  };
  const service = new ProjectSourceService({
    repository,
    logger: { warn() {}, info() {}, error() {} },
    getLiveMonitoringService: () => liveMonitoringService,
    getMapProcessingService: () => mapProcessingService,
    getPlayerIdentityService: () => playerIdentityService,
    getTrackerSyncService: () => trackerSyncService,
  });

  return {
    service,
    repository,
    upsertedSources,
    liveMonitoringService,
    mapProcessingService,
    playerIdentityService,
    trackerSyncService,
  };
}

test("ProjectSourceService retains its complete public API", () => {
  const methods = Object.getOwnPropertyNames(ProjectSourceService.prototype)
    .filter((name) => name !== "constructor")
    .sort();

  assert.deepEqual(methods, [
    "buildCompetitionCampaignSnapshots",
    "buildDiscoveryCampaignSnapshots",
    "buildLegacyCampaignSnapshots",
    "buildOfficialSeasonalCampaignSnapshots",
    "buildTotdCampaignSnapshots",
    "buildWeeklyGrandsCampaignSnapshots",
    "buildWeeklyShortsCampaignSnapshots",
    "computeProjectSourceNextRunIso",
    "computeProjectSourceNextRunMs",
    "ensureCompetitionSourceAvailable",
    "ensureOfficialSeasonalSourceFresh",
    "ensureTotdSourceAvailable",
    "fetchAllOfficialSeasonalCampaigns",
    "fetchAllTotdMonths",
    "fetchAllWeeklyGrandsCampaigns",
    "fetchAllWeeklyShortsCampaigns",
    "getCompetitionSourceStatus",
    "getDiscoverySourceStatus",
    "getLatestCampaignReleaseWindow",
    "getLatestTotdReleaseWindow",
    "getLegacySourceStatus",
    "getOfficialSeasonalSourceStatus",
    "getPrimaryProjectClubId",
    "getProjectClubs",
    "getProjectSourceScheduleRule",
    "getProjectSources",
    "getTotdSourceStatus",
    "getWeeklyGrandsSourceStatus",
    "getWeeklyShortsSourceStatus",
    "importWeeklyShortsLocalFiles",
    "liveMonitor",
    "normalizeWeeklyShortsImportRoots",
    "runDueProjectSourceSyncs",
    "scheduleNextProjectSourceSyncRun",
    "startProjectSourceSyncScheduler",
    "stopProjectSourceSyncScheduler",
    "syncCompetitionSource",
    "syncDiscoverySource",
    "syncHookSnapshot",
    "syncLegacySource",
    "syncOfficialSeasonalSource",
    "syncProjectSourceByKey",
    "syncTotdSource",
    "syncWeeklyGrandsSource",
    "syncWeeklyShortsSource",
    "trackerIntegrations",
  ]);
});

test("ProjectSourceService composes explicit source-domain collaborators", () => {
  const { service } = createService();

  assert.deepEqual(Object.keys(service).sort(), [
    "campaignSnapshotService",
    "curatedSourceSyncService",
    "getLiveMonitoringService",
    "getMapProcessingService",
    "getPlayerIdentityService",
    "getTrackerSyncService",
    "hookSnapshotService",
    "logger",
    "officialSourceSyncService",
    "projectSourceSync",
    "repository",
    "sourceApi",
    "sourceRegistry",
    "sourceSyncScheduler",
    "weeklyShortsSourceService",
  ]);
  assert.equal(service.sourceSyncScheduler.projectSourceSync, service.projectSourceSync);
});

test("source registry supplies every builtin and decorates club status", () => {
  const { service, upsertedSources } = createService();

  const sources = service.getProjectSources({ includeDisabled: true });
  const clubs = service.getProjectClubs({ includeDisabled: true });

  assert.deepEqual(
    sources.map((source) => source.sourceKey),
    SOURCE_KEYS
  );
  assert.equal(upsertedSources.length, SOURCE_KEYS.length);
  assert.equal(typeof sources.find((source) => source.sourceKey === "weekly-shorts")?.nextScheduledSyncAt, "string");
  assert.equal(
    sources.every((source) => source.nextScheduledSyncAt === null || typeof source.nextScheduledSyncAt === "string"),
    true
  );
  assert.deepEqual(clubs, [
    {
      hookKey: "altered-club",
      clubId: 24231,
      enabled: true,
      primary: true,
      liveMonitorClub: true,
    },
  ]);
});

test("source schedules and release summaries stay deterministic", () => {
  const { service } = createService();
  const fromTimeMs = Date.parse("2026-04-05T12:00:00.000Z");

  assert.equal(
    service.computeProjectSourceNextRunIso(
      { sourceKey: "weekly-shorts", enabled: true, lastSyncedAt: null },
      { fromTimeMs }
    ),
    "2026-04-05T12:00:00.000Z"
  );
  assert.equal(
    service.computeProjectSourceNextRunIso(
      { sourceKey: "weekly-shorts", enabled: false, lastSyncedAt: null },
      { fromTimeMs }
    ),
    null
  );
  assert.deepEqual(
    service.getLatestCampaignReleaseWindow([
      {
        name: "Older",
        startTimestamp: "2026-04-01T10:00:00Z",
        endTimestamp: "2026-04-01T11:00:00Z",
      },
      {
        name: "Newest",
        startTimestamp: "2026-04-02T10:00:00Z",
        endTimestamp: "2026-04-02T11:00:00Z",
      },
    ]),
    {
      latestReleaseStartAt: "2026-04-02T10:00:00.000Z",
      latestReleaseEndAt: "2026-04-02T11:00:00.000Z",
      latestReleaseName: "Newest",
    }
  );
});

test("official campaign pagination and snapshot normalization retain their contracts", async () => {
  const { service } = createService();
  const calls = [];
  const liveClient = {
    async getOfficialSeasonalCampaignsV2(options) {
      calls.push(options);
      if (options.offset === 0) {
        return {
          campaignList: [
            { id: 1, name: "Spring", seasonUid: "season-one", playlist: [{ mapUid: "Map-One", position: 0 }] },
          ],
          itemCount: 1,
        };
      }
      return { campaignList: [], itemCount: 1 };
    },
  };

  const campaigns = await service.fetchAllOfficialSeasonalCampaigns(liveClient, { length: 1 });
  const snapshots = service.buildOfficialSeasonalCampaignSnapshots(
    campaigns,
    new Map([["map-one", { name: "First Map", fileUrl: "https://example.test/map-one" }]])
  );

  assert.deepEqual(calls, [{ length: 1, offset: 0 }]);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].campaignType, "official-seasonal");
  assert.equal(snapshots[0].maps[0].mapUid, "Map-One");
  assert.equal(snapshots[0].maps[0].name, "First Map");
  assert.equal(snapshots[0].maps[0].slot, 1);
  assert.equal(snapshots[0].maps[0].raw.sourceKey, "official-seasonal-v2");
});

test("source dispatch remains overridable through the facade", async () => {
  const { service } = createService();
  const authContext = { accountId: "tester" };
  const dispatches = [
    ["official-seasonal-v2", "syncOfficialSeasonalSource"],
    ["official-totd", "syncTotdSource"],
    ["weekly-grands", "syncWeeklyGrandsSource"],
    ["official-competition", "syncCompetitionSource"],
    ["official-discovery", "syncDiscoverySource"],
    ["official-legacy", "syncLegacySource"],
    ["weekly-shorts", "syncWeeklyShortsSource"],
  ];
  for (const [, method] of dispatches) {
    service[method] = async (options) => ({ marker: method, options });
  }

  for (const [sourceKey, method] of dispatches) {
    const result = await service.syncProjectSourceByKey(sourceKey, { authContext });
    assert.equal(result.marker, method);
    assert.equal(result.options.authContext, authContext);
    if (sourceKey === "weekly-shorts") {
      assert.equal(result.options.importLocalFiles, true);
      assert.deepEqual(result.options.importRoots, []);
    }
  }
  assert.deepEqual(await service.syncProjectSourceByKey("missing-source"), {
    error: "Unsupported project source 'missing-source'.",
  });
});

test("due-source orchestration preserves facade dispatch and scheduler state", async () => {
  const sources = SOURCE_KEYS.map((sourceKey) => ({
    sourceKey,
    enabled: sourceKey === "weekly-shorts",
    lastSyncedAt: null,
    summary: null,
  }));
  const { service } = createService({
    repositoryOverrides: {
      configuration: {
        listProjectSources() {
          return sources;
        },
      },
    },
  });
  const dispatched = [];
  service.syncProjectSourceByKey = async (sourceKey) => {
    dispatched.push(sourceKey);
    return { ingest: { campaignsSeen: 2, mapsSeen: 4 } };
  };

  const result = await service.runDueProjectSourceSyncs({
    reason: "contract-test",
    fromTimeMs: Date.parse("2026-04-05T12:00:00.000Z"),
  });
  service.stopProjectSourceSyncScheduler();

  assert.deepEqual(dispatched, ["weekly-shorts"]);
  assert.equal(result.ok, true);
  assert.equal(result.processedSources, 1);
  assert.equal(result.sourceResults[0].campaignsSeen, 2);
  assert.equal(service.projectSourceSync.running, false);
  assert.equal(service.projectSourceSync.currentSourceKey, null);
  assert.equal(service.projectSourceSync.nextRunAt, null);
});

test("hook snapshots compose storage, naming, and tracker synchronization", async () => {
  const { service } = createService();
  const progress = [];

  const result = await service.syncHookSnapshot(
    {
      hookKey: "altered-club",
      campaigns: [{ id: 1, maps: [{ mapUid: "map-one" }] }],
      uploadBuckets: [],
    },
    {
      relayClubSnapshot: false,
      onProgress(update) {
        progress.push(update.phase);
      },
    }
  );

  assert.equal(result.synced.mapsSeen, 1);
  assert.equal(result.synced.metadataAssignment.mapsUpdated, 1);
  assert.equal(result.synced.similarityAssignment.mapsAssigned, 1);
  assert.equal(result.synced.trackerSync.mapsSynced, 1);
  assert.deepEqual(progress, ["sync-snapshot", "sync-finished"]);
});
