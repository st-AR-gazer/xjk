import assert from "node:assert/strict";
import test from "node:test";

import { createDatabase } from "../src/db/index.js";
import { AlteredRepository } from "../src/repositories/alteredRepository.js";

function withRepository(run) {
  const db = createDatabase({ filePath: ":memory:" });
  try {
    return run(new AlteredRepository(db), db);
  } finally {
    db.close();
  }
}

test("project-source snapshots distinguish map inserts, updates, and position reconciliation", () => {
  withRepository((repository, db) => {
    const inserted = repository.ingestion.ingestProjectSourceSnapshot({
      sourceKey: "transaction-test",
      campaignType: "seasonal-test",
      campaigns: [{ id: 10, name: "Test Season", maps: [{ uid: "map-a", slot: 1 }] }],
    });
    assert.deepEqual(
      {
        campaignsSeen: inserted.campaignsSeen,
        mapsSeen: inserted.mapsSeen,
        mapsInserted: inserted.mapsInserted,
        mapsUpdated: inserted.mapsUpdated,
        mapsLinked: inserted.mapsLinked,
      },
      { campaignsSeen: 1, mapsSeen: 1, mapsInserted: 1, mapsUpdated: 0, mapsLinked: 1 }
    );

    const updated = repository.ingestion.ingestProjectSourceSnapshot({
      sourceKey: "transaction-test",
      campaignType: "seasonal-test",
      campaigns: [
        {
          id: 10,
          name: "Test Season Renamed",
          maps: [
            { uid: "map-a", name: "Map A Updated", slot: 3 },
            { uid: "map-b", name: "Map B", slot: 4 },
          ],
        },
      ],
    });
    assert.deepEqual(
      {
        campaignsSeen: updated.campaignsSeen,
        mapsSeen: updated.mapsSeen,
        mapsInserted: updated.mapsInserted,
        mapsUpdated: updated.mapsUpdated,
        mapsLinked: updated.mapsLinked,
      },
      { campaignsSeen: 1, mapsSeen: 2, mapsInserted: 1, mapsUpdated: 1, mapsLinked: 2 }
    );
    assert.equal(repository.maps.getMapInfo("map-a").map.name, "Map A Updated");
    assert.equal(repository.maps.getMapInfo("map-a").map.slot, 3);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM altered_map_positions WHERE map_uid = 'map-a'").get().count,
      1
    );
  });
});

test("hook uploads update map data without replacing an assigned campaign identity", () => {
  withRepository((repository) => {
    const payload = {
      clubId: 42,
      clubName: "Hook Club",
      campaigns: [{ id: 10, name: "Curated Campaign", maps: [{ uid: "shared-map", slot: 2 }] }],
      uploadBuckets: [
        {
          id: 20,
          name: "Uploads",
          maps: [
            { uid: "shared-map", name: "Shared Upload", slot: 8 },
            { uid: "upload-map", name: "Upload Only", slot: 4 },
          ],
        },
      ],
    };
    const inserted = repository.ingestion.ingestHookSnapshot(payload);
    assert.deepEqual(
      {
        campaignsSeen: inserted.campaignsSeen,
        uploadBucketsSeen: inserted.uploadBucketsSeen,
        uploadMapsSeen: inserted.uploadMapsSeen,
        mapsSeen: inserted.mapsSeen,
        mapsInserted: inserted.mapsInserted,
        mapsUpdated: inserted.mapsUpdated,
        mapsLinked: inserted.mapsLinked,
      },
      {
        campaignsSeen: 1,
        uploadBucketsSeen: 1,
        uploadMapsSeen: 2,
        mapsSeen: 3,
        mapsInserted: 2,
        mapsUpdated: 1,
        mapsLinked: 2,
      }
    );
    assert.equal(repository.maps.getMapInfo("shared-map").map.campaign, "Curated Campaign");
    assert.equal(repository.maps.getMapInfo("shared-map").map.slot, 2);
    assert.equal(repository.maps.getMapInfo("upload-map").map.campaign, "Uploads");

    const repeated = repository.ingestion.ingestHookSnapshot(payload);
    assert.equal(repeated.mapsInserted, 0);
    assert.equal(repeated.mapsUpdated, 3);
    assert.equal(repeated.mapsLinked, 0);
  });
});

test("project-source transaction failures leave no partial campaign, map, or position rows", () => {
  withRepository((repository, db) => {
    db.exec(`
      CREATE TRIGGER reject_second_position
      BEFORE INSERT ON altered_map_positions
      WHEN NEW.map_uid = 'rejected-map'
      BEGIN
        SELECT RAISE(ABORT, 'forced source rollback');
      END
    `);
    const result = repository.ingestion.ingestProjectSourceSnapshot({
      sourceKey: "rollback-source",
      campaigns: [
        {
          id: 90,
          name: "Rollback Campaign",
          maps: [
            { uid: "first-map", slot: 1 },
            { uid: "rejected-map", slot: 2 },
          ],
        },
      ],
    });

    assert.match(result.error, /forced source rollback/);
    assert.deepEqual(
      {
        campaignsSeen: result.campaignsSeen,
        mapsSeen: result.mapsSeen,
        mapsInserted: result.mapsInserted,
        mapsUpdated: result.mapsUpdated,
        mapsLinked: result.mapsLinked,
      },
      { campaignsSeen: 1, mapsSeen: 2, mapsInserted: 2, mapsUpdated: 0, mapsLinked: 1 }
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM altered_campaigns").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM altered_maps").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM altered_map_positions").get().count, 0);
    assert.equal(repository.configuration.getProjectSource("rollback-source").sourceKey, "rollback-source");
    assert.equal(repository.monitoring.listHookRuns(1, "source:rollback-source")[0].status, "error");
  });
});

test("hook transaction failures persist only the operational error state", () => {
  withRepository((repository, db) => {
    db.exec(`
      CREATE TRIGGER reject_hook_map
      BEFORE INSERT ON altered_maps
      BEGIN
        SELECT RAISE(ABORT, 'forced hook rollback');
      END
    `);
    const result = repository.ingestion.ingestHookSnapshot({
      hookKey: "rollback-hook",
      clubId: 42,
      campaigns: [{ id: 12, name: "Rejected Hook", maps: [{ uid: "hook-map" }] }],
    });

    assert.match(result.error, /forced hook rollback/);
    assert.equal(result.mapsSeen, 1);
    assert.equal(result.mapsInserted, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM altered_campaigns").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM altered_maps").get().count, 0);
    assert.match(repository.configuration.getHookConfig("rollback-hook").lastError, /forced hook rollback/);
    assert.equal(repository.monitoring.listHookRuns(1, "rollback-hook")[0].status, "error");
  });
});
