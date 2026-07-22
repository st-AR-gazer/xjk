import assert from "node:assert/strict";
import test from "node:test";
import {
  persistResolvedMapperNames,
  syncResolvedPlayersToTracker,
} from "../src/services/altered/playerIdentity/mapperNamePersistence.js";

test("persistResolvedMapperNames applies repository and aggregator writes in one contract", async () => {
  const calls = [];
  const result = await persistResolvedMapperNames(
    {
      repository: {
        mappers: {
          upsertMapperNames: (payload) => {
            calls.push(["names", payload]);
            return { namesUpdated: 1 };
          },
          updateMapMapperDisplayNames: (payload) => {
            calls.push(["maps", payload]);
            return { updated: 2 };
          },
        },
      },
      logger: { warn() {} },
      ingestDisplayNamesToAggregator: async (names, options) => {
        calls.push(["aggregator", names, options]);
        return { ok: true, accepted: 1 };
      },
    },
    { accountIds: ["id"], namesByAccountId: { id: "Player" }, source: "sync" }
  );

  assert.equal(result.nameUpsert.namesUpdated, 1);
  assert.equal(result.mapLinks.updated, 2);
  assert.equal(result.aggregatorIngest.accepted, 1);
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["names", "maps", "aggregator"]
  );
});

test("syncResolvedPlayersToTracker normalizes entries and returns warnings without throwing", async () => {
  const id = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
  const requests = [];
  const success = await syncResolvedPlayersToTracker(
    {
      trackerClient: {
        bulkUpsertPlayerNames: async (...args) => {
          requests.push(args);
          return { ok: true, data: { playersSeen: 1 } };
        },
      },
    },
    { [id]: " Player ", invalid: "Ignored" },
    "sync"
  );

  assert.deepEqual(success, { playersSynced: 1, warning: null });
  assert.equal(requests[0][0][0].accountId, id.toLowerCase());
  assert.equal(requests[0][0][0].displayName, "Player");
  assert.equal(requests[0][1], "sync");
});
