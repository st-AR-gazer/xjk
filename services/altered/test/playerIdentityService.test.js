import assert from "node:assert/strict";
import test from "node:test";

import { PlayerIdentityService } from "../src/services/altered/playerIdentityService.js";
import * as mapperBatch from "../src/services/altered/playerIdentity/mapperNameBatch.js";
import * as mapperOrchestration from "../src/services/altered/playerIdentity/mapperNameOrchestration.js";
import * as mapperScheduler from "../src/services/altered/playerIdentity/mapperNameScheduler.js";
import * as playerNameResolution from "../src/services/altered/playerIdentity/playerNameResolution.js";
import * as trackerGateway from "../src/services/altered/playerIdentity/trackerIdentityGateway.js";

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";

const PUBLIC_METHODS = [
  "collectAccountIds",
  "collectHolderAccountIds",
  "pruneViewedPriorityAccountIds",
  "kickoffPriorityDisplayNameFallback",
  "queuePriorityDisplayNameLookups",
  "getCachedPlayerName",
  "cachePlayerName",
  "resolvePlayerNamesByAccountIds",
  "resolveHolderName",
  "applyResolvedHolderNames",
  "shouldUseDisplaynameRelay",
  "shouldUseClubRelay",
  "relayClubSnapshotToTrackerClub",
  "getDisplayNamesFromAggregator",
  "ingestDisplayNamesToAggregator",
  "runTrackerDisplaynameSync",
  "getMapperNameSyncStatus",
  "updateMapperNameSyncConfig",
  "computeNextMapperSyncRunIso",
  "scheduleNextMapperSyncRun",
  "refreshMapperAccountPool",
  "refreshPriorityMapperAccounts",
  "syncMapperNamesBatch",
  "runMapperNameSyncCycle",
  "runMapperNameSyncNow",
  "syncSpecificMapperAccountIds",
  "startMapperNameSyncScheduler",
  "stopMapperNameSyncScheduler",
  "syncMapperNamesForCampaigns",
];

function createRepository(overrides = {}) {
  return {
    mappers: {
      getMapperAccountStats() {
        return {
          totalAccounts: 0,
          unresolvedAccounts: 0,
          neverResolvedAccounts: 0,
          latestResolvedAt: null,
          oldestResolvedAt: null,
        };
      },
      getMapperAccountsForSync() {
        return [];
      },
      seedMapperAccounts() {
        return { inserted: 0, updated: 0 };
      },
      upsertMapperNames() {
        return { namesUpdated: 0, historyInserted: 0 };
      },
      updateMapMapperDisplayNames() {
        return { updated: 0 };
      },
      ...overrides,
    },
  };
}

function createService(overrides = {}) {
  return new PlayerIdentityService({
    repository: createRepository(),
    trackerClient: {},
    mapperNameSyncConfig: { enabled: false },
    logger: { warn() {} },
    ...overrides,
  });
}

test("PlayerIdentityService facade exposes every identity operation", () => {
  const service = createService();

  assert.deepEqual(
    Object.getOwnPropertyNames(PlayerIdentityService.prototype).filter((name) => name !== "constructor"),
    PUBLIC_METHODS
  );
  for (const method of PUBLIC_METHODS) {
    assert.equal(typeof service[method], "function", `${method} should be wired through the facade`);
  }
  assert.equal(service.playerNamesCache instanceof Map, true);
  assert.equal(service.mapperNameSync.viewedPriorityQueuedAtMsByAccountId instanceof Map, true);
  assert.equal(service.trackerIntegrations.displaynameEnabled, true);
});

test("player identity modules publish the operations composed by the facade", () => {
  assert.deepEqual(Object.keys(playerNameResolution), PUBLIC_METHODS.slice(0, 10).sort());
  assert.deepEqual(Object.keys(trackerGateway), PUBLIC_METHODS.slice(10, 16).sort());
  assert.deepEqual(Object.keys(mapperScheduler), PUBLIC_METHODS.slice(16, 22).sort());
  assert.deepEqual(Object.keys(mapperBatch), ["syncMapperNamesBatch"]);
  assert.deepEqual(Object.keys(mapperOrchestration), PUBLIC_METHODS.slice(23).sort());
});

test("name resolution combines local and aggregator identities and updates caches", async () => {
  const upserts = [];
  const ingests = [];
  const repository = createRepository({
    getMapperAccountsForSync({ accountIds }) {
      return accountIds.includes(ACCOUNT_A) ? [{ accountId: ACCOUNT_A, latestDisplayName: "Local Alice" }] : [];
    },
    upsertMapperNames(payload) {
      upserts.push(payload);
      return { namesUpdated: 1, historyInserted: 1 };
    },
    updateMapMapperDisplayNames() {
      return { updated: 1 };
    },
  });
  const aggregatorClient = {
    isConfigured() {
      return true;
    },
    async getDisplayNames(accountIds) {
      assert.deepEqual(accountIds, [ACCOUNT_B]);
      return {
        ok: true,
        data: { names: [{ accountId: ACCOUNT_B, displayName: "Remote Bob" }] },
      };
    },
    async ingestDisplayNames(namesByAccountId, options) {
      ingests.push({ namesByAccountId, options });
      return { ok: true, data: { ingest: { accepted: 1, inserted: 1 } } };
    },
  };
  const service = createService({ repository, aggregatorClient });

  const names = await service.resolvePlayerNamesByAccountIds([ACCOUNT_A, ACCOUNT_B, ACCOUNT_A]);

  assert.deepEqual(names, {
    [ACCOUNT_A]: "Local Alice",
    [ACCOUNT_B]: "Remote Bob",
  });
  assert.equal(service.getCachedPlayerName(ACCOUNT_A), "Local Alice");
  assert.equal(service.getCachedPlayerName(ACCOUNT_B), "Remote Bob");
  assert.equal(service.resolveHolderName(ACCOUNT_B, names), "Remote Bob");
  assert.deepEqual(service.collectAccountIds([{ accountId: ACCOUNT_A }, { accountId: ACCOUNT_A }], ["accountId"]), [
    ACCOUNT_A,
  ]);
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0].accountIds, [ACCOUNT_B]);
  assert.equal(ingests.length, 1);
  assert.deepEqual(ingests[0].namesByAccountId, { [ACCOUNT_B]: "Remote Bob" });
});

test("mapper batch and scheduler calls cross module boundaries through the facade", async () => {
  const repository = createRepository({
    upsertMapperNames({ accountIds, namesByAccountId }) {
      assert.deepEqual(accountIds, [ACCOUNT_A]);
      assert.deepEqual(namesByAccountId, { [ACCOUNT_A]: "Tracker Alice" });
      return { namesUpdated: 1, historyInserted: 1 };
    },
    updateMapMapperDisplayNames({ namesByAccountId }) {
      assert.deepEqual(namesByAccountId, { [ACCOUNT_A]: "Tracker Alice" });
      return { updated: 1 };
    },
  });
  const trackerClient = {
    async getPlayerNames(accountIds) {
      assert.deepEqual(accountIds, [ACCOUNT_A]);
      return { namesByAccountId: { [ACCOUNT_A]: "Tracker Alice" } };
    },
  };
  const service = createService({ repository, trackerClient });

  const batch = await service.syncMapperNamesBatch({ accountIds: [ACCOUNT_A], source: "contract-test" });
  assert.equal(batch.ok, true);
  assert.equal(batch.resolved, 1);
  assert.equal(batch.namesUpdated, 1);

  const status = await service.updateMapperNameSyncConfig({ batchSize: 7 });
  assert.equal(status.batchSize, 7);
  assert.equal(status.enabled, false);
  assert.equal(service.computeNextMapperSyncRunIso({ fromTimeMs: 0 }), "1970-01-01T00:01:00.000Z");
  await service.stopMapperNameSyncScheduler();
});
