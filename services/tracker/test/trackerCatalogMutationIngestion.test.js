import assert from "node:assert/strict";
import test from "node:test";

import { createDatabase } from "../src/db/index.js";
import { TrackerRepository } from "../src/repositories/trackerRepository.js";

function withRepository(run) {
  const db = createDatabase({ filePath: ":memory:" });
  try {
    return run(new TrackerRepository(db), db);
  } finally {
    db.close();
  }
}

test("catalog ingestion distinguishes inserts, updates, and campaign reconciliation", () => {
  withRepository((repository, db) => {
    const inserted = repository.bulkUpsertMaps({
      maps: [
        { uid: "map-a", name: "Map A", campaign: "Season One", clubId: 42, slot: 1, tracked: true },
        { uid: "map-b", name: "Map B", campaign: "Season One", clubId: 42, slot: 2 },
        { name: "missing uid" },
      ],
    });
    assert.deepEqual(inserted, { inserted: 2, updated: 0, campaignLinks: 2, total: 2 });

    const updated = repository.bulkUpsertMaps({
      maps: [
        { uid: "map-a", name: "Map A Updated", campaign: "season one", clubId: 42, slot: 1 },
        { uid: "map-b", name: "Map B Updated", campaign: "Season Two", clubId: 42, slot: 4 },
      ],
    });
    assert.deepEqual(updated, { inserted: 0, updated: 2, campaignLinks: 1, total: 2 });
    assert.equal(repository.getMapByUid("map-a").name, "Map A Updated");
    assert.equal(repository.getMapInfo("map-b").map.campaign, "Season Two");
    assert.equal(repository.getMapInfo("map-b").map.slot, 4);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM maps").get().count, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM map_campaigns WHERE map_uid = 'map-a'").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM map_campaigns WHERE map_uid = 'map-b'").get().count, 1);
    assert.equal(
      db
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM map_campaigns mc
          JOIN campaigns c ON c.campaign_id = mc.campaign_id
          WHERE mc.map_uid = 'map-b' AND c.name = 'Season One'
        `
        )
        .get().count,
      0
    );
  });
});

test("catalog batch failures roll back preceding map updates and campaign links", () => {
  withRepository((repository, db) => {
    repository.bulkUpsertMaps({ maps: [{ uid: "stable-map", name: "Stable" }] });
    db.exec(`
      CREATE TRIGGER reject_catalog_campaign
      BEFORE INSERT ON campaigns
      BEGIN
        SELECT RAISE(ABORT, 'forced catalog rollback');
      END
    `);

    assert.throws(
      () =>
        repository.bulkUpsertMaps({
          maps: [
            { uid: "stable-map", name: "Must Roll Back" },
            { uid: "new-map", name: "New Map", campaign: "Rejected Campaign", clubId: 42 },
          ],
        }),
      /forced catalog rollback/
    );
    assert.equal(repository.getMapByUid("stable-map").name, "Stable");
    assert.equal(repository.getMapByUid("new-map"), undefined);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM campaigns").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM map_campaigns").get().count, 0);

    db.exec("DROP TRIGGER reject_catalog_campaign");
    assert.deepEqual(repository.bulkUpsertMaps({ maps: [{ uid: "recovered-map" }] }), {
      inserted: 1,
      updated: 0,
      campaignLinks: 0,
      total: 1,
    });
  });
});

test("standalone campaign replacement restores the deleted link when insertion fails", () => {
  withRepository((repository, db) => {
    repository.bulkUpsertMaps({
      maps: [{ uid: "linked-map", campaign: "Original Campaign", clubId: 42, slot: 2 }],
    });
    db.exec(`
      CREATE TRIGGER reject_replacement_link
      BEFORE INSERT ON map_campaigns
      WHEN NEW.slot = 9
      BEGIN
        SELECT RAISE(ABORT, 'forced link rollback');
      END
    `);

    assert.throws(
      () =>
        repository.updateMapCampaign({
          mapUid: "linked-map",
          campaignName: "Replacement Campaign",
          clubId: 42,
          slot: 9,
        }),
      /forced link rollback/
    );
    assert.equal(repository.getMapInfo("linked-map").map.campaign, "Original Campaign");
    assert.equal(repository.getMapInfo("linked-map").map.slot, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM map_campaigns WHERE map_uid = 'linked-map'").get().count, 1);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM campaigns WHERE name = 'Replacement Campaign'").get().count,
      0
    );
  });
});
