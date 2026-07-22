import assert from "node:assert/strict";
import test from "node:test";

import { createMapRecordUpserter } from "../src/repositories/alteredIngestion/mapRecordUpsert.js";

function createMapDb(existingRows = new Map()) {
  const upserts = [];
  return {
    upserts,
    prepare(sql) {
      if (sql.includes("FROM altered_maps")) {
        return {
          get(mapUid) {
            return existingRows.get(mapUid);
          },
        };
      }
      if (sql.includes("INSERT INTO altered_maps")) {
        return {
          run(...args) {
            upserts.push(args);
            return { changes: 1 };
          },
        };
      }
      throw new Error(`Unexpected SQL in map upsert test: ${sql}`);
    },
  };
}

test("shared ingestion map upsert normalizes inserts and updates through one counter contract", () => {
  const db = createMapDb(
    new Map([
      [
        "existing-map",
        {
          tracked: 0,
          status: "paused",
          checkFrequency: 600,
          wrMs: 123,
          wrHolder: "Existing WR",
          playerCount: 8,
          payloadJson: JSON.stringify({ preserved: true, replaced: "old" }),
        },
      ],
    ])
  );
  const counters = { mapsSeen: 0, mapsInserted: 0, mapsUpdated: 0 };
  const touchedMapUids = new Set();
  const upsert = createMapRecordUpserter({
    db,
    counters,
    touchedMapUids,
    trackedDefault: true,
    mergeExistingPayload: true,
  });

  assert.equal(upsert({ name: "missing uid" }), null);
  const updated = upsert(
    { uid: "existing-map", title: "Existing", author_time: "42" },
    { payload: { replaced: "new", incoming: true } }
  );
  const inserted = upsert({ map_uid: "new-map", name: "New", player_count: "4" }, { payload: { source: "new" } });

  assert.equal(updated.mapUid, "existing-map");
  assert.equal(inserted.mapUid, "new-map");
  assert.deepEqual(counters, { mapsSeen: 2, mapsInserted: 1, mapsUpdated: 1 });
  assert.deepEqual([...touchedMapUids], ["existing-map", "new-map"]);
  assert.equal(db.upserts.length, 2);

  const existingArgs = db.upserts[0];
  assert.equal(existingArgs[0], "existing-map");
  assert.equal(existingArgs[10], 42);
  assert.equal(existingArgs[17], 8);
  assert.equal(existingArgs[19], 123);
  assert.equal(existingArgs[20], "Existing WR");
  assert.equal(existingArgs[22], 0);
  assert.equal(existingArgs[23], "paused");
  assert.equal(existingArgs[24], 600);
  assert.deepEqual(JSON.parse(existingArgs[28]), {
    preserved: true,
    replaced: "new",
    incoming: true,
  });

  const insertedArgs = db.upserts[1];
  assert.equal(insertedArgs[0], "new-map");
  assert.equal(insertedArgs[1], "map-new-map");
  assert.equal(insertedArgs[17], 4);
  assert.equal(insertedArgs[22], 1);
  assert.equal(insertedArgs[23], "live");
  assert.equal(insertedArgs[24], 21600);
  assert.deepEqual(JSON.parse(insertedArgs[28]), { source: "new" });
});

test("project-source ingestion can replace payloads without inheriting stored fields", () => {
  const db = createMapDb(new Map([["project-map", { tracked: 1, payloadJson: JSON.stringify({ stale: true }) }]]));
  const upsert = createMapRecordUpserter({
    db,
    counters: { mapsSeen: 0, mapsInserted: 0, mapsUpdated: 0 },
    touchedMapUids: new Set(),
    trackedDefault: false,
    mergeExistingPayload: false,
  });

  upsert({ uid: "project-map" }, { payload: { current: true } });
  assert.deepEqual(JSON.parse(db.upserts[0][28]), { current: true });
});
