import assert from "node:assert/strict";
import test from "node:test";

import { createDatabase } from "../src/db/index.js";
import { AlteredCatalogRepository } from "../src/repositories/alteredCatalogRepository.js";
import { buildAlterationMapQuery } from "../src/repositories/alteredCatalog/mapQueryPlanner.js";
import { AlteredRepository } from "../src/repositories/alteredRepository.js";

const PUBLIC_METHODS = [
  "clearCampaignAlterations",
  "countAlterations",
  "deleteUnusedAlterations",
  "getAllCampaignAlterationLinks",
  "getAlterationsMapFilters",
  "getAlterationsStats",
  "getCampaignTimeline",
  "getSummary",
  "linkCampaignAlteration",
  "listAlterations",
  "listAlterationsCampaigns",
  "listAlterationsMaps",
  "listAlterationsUploadMaps",
  "listAlteredMapUids",
  "listCampaignsByAlteration",
  "listMostPlayedAlterationsMaps",
  "resolveCampaignDbId",
  "syncAllCampaignAlterations",
  "syncCampaignAlterationsById",
  "upsertAlteration",
];

function withRepository(run) {
  const db = createDatabase({ filePath: ":memory:" });
  const repository = new AlteredRepository(db);
  try {
    return run(repository, db);
  } finally {
    db.close();
  }
}

function ingestCampaigns(repository, campaigns) {
  return repository.ingestion.ingestProjectSourceSnapshot({
    sourceKey: "catalog-test",
    sourceType: "official-seasonal",
    displayName: "Catalog Test",
    campaigns,
  });
}

test("catalog facade preserves its public contract and empty return shapes", () => {
  withRepository((repository) => {
    const catalog = repository.catalog;
    const methods = Object.getOwnPropertyNames(AlteredCatalogRepository.prototype)
      .filter((name) => name !== "constructor")
      .sort();
    assert.deepEqual(methods, PUBLIC_METHODS);
    assert.deepEqual(Object.keys(catalog), ["db"]);
    assert.equal(catalog.upsertAlteration.length, 1);
    assert.equal(catalog.linkCampaignAlteration.length, 2);
    assert.equal(catalog.resolveCampaignDbId.length, 1);

    assert.deepEqual(catalog.getSummary(), {
      trackedMaps: 0,
      campaignCount: 0,
      latestWrAt: null,
    });
    assert.deepEqual(catalog.getAlterationsStats(), {
      totalMaps: 0,
      activelyTracked: 0,
      totalWrChanges: 0,
      lastRunAt: null,
    });
    assert.deepEqual(catalog.listAlterationsMaps(), { total: 0, rows: [] });
    assert.deepEqual(catalog.listAlterationsCampaigns(), { total: 0, rows: [] });
    assert.deepEqual(catalog.listAlterations(), []);
    assert.deepEqual(catalog.getAllCampaignAlterationLinks(), []);
    assert.deepEqual(catalog.listAlterationsUploadMaps(), []);
    assert.deepEqual(catalog.listAlteredMapUids(), []);
    assert.deepEqual(catalog.listMostPlayedAlterationsMaps(), []);
  });
});

test("map query planning keeps normalization, filtering, and seeded ordering deterministic", () => {
  const seed = "12345678-1234-4234-8234-123456789abc";
  const plan = buildAlterationMapQuery({
    limit: 200000,
    offset: -4,
    campaignIds: ["2,1", "invalid"],
    statuses: ["active", "invalid"],
    excludeWrStates: "without_wr",
    mapNumber: Number.NaN,
    year: Number.NaN,
    sort: "seeded_random",
    randomSeed: seed,
  });

  assert.equal(plan.safeLimit, 100000);
  assert.equal(plan.safeOffset, 0);
  assert.deepEqual(plan.normalizedCampaignIds, ["2", "1"]);
  assert.deepEqual(plan.normalizedStatuses, ["active"]);
  assert.deepEqual(plan.normalizedExcludeWrStates, ["without_wr"]);
  assert.deepEqual(plan.params, ["2", "1"]);
  assert.match(plan.whereSql, /external_campaign_id/);
  assert.match(plan.whereSql, /m\.tracked = 1/);
  assert.match(plan.whereSql, /NOT \(\(COALESCE\(m\.wr_ms/);
  assert.match(plan.orderBy, /altered_seeded_random/);
  assert.deepEqual(plan.orderParams, [seed]);
});

test("catalog components preserve campaign linking, map projection, and filters", () => {
  withRepository((repository, db) => {
    ingestCampaigns(repository, [
      {
        id: 123,
        name: "Winter 2026 RPG Altered",
        maps: [
          { uid: "map-a", name: "Map Alpha", slot: 1, author: "author-a" },
          { uid: "map-b", name: "Map Beta", slot: 2, author: "author-b" },
        ],
      },
    ]);
    db.prepare(
      `UPDATE altered_maps
       SET player_count = ?, wr_ms = ?, wr_holder = ?, wr_updated_at = ?
       WHERE map_uid = ?`
    ).run(42, 12345, "record-holder", "2026-07-01T12:00:00.000Z", "map-a");

    const sync = repository.catalog.syncAllCampaignAlterations();
    assert.deepEqual(sync, {
      campaigns_scanned: 1,
      campaigns_linked: 1,
      links_inserted: 1,
      alterations_touched: 1,
      unused_deleted: 0,
    });

    const alterations = repository.catalog.listAlterations();
    assert.equal(alterations.length, 1);
    assert.equal(alterations[0].name, "RPG Altered");
    assert.equal(alterations[0].campaign_count, 1);
    assert.equal(alterations[0].map_count, 2);
    assert.equal(repository.catalog.upsertAlteration("RPG Altered").id, alterations[0].id);
    assert.equal(repository.catalog.countAlterations(), 1);
    assert.deepEqual(
      repository.catalog.getAllCampaignAlterationLinks().map((row) => ({ ...row })),
      [{ campaignId: 1, alterationId: alterations[0].id }]
    );

    const campaigns = repository.catalog.listAlterationsCampaigns({ alterationSlugs: ["rpg-altered"] });
    assert.equal(campaigns.total, 1);
    assert.equal(campaigns.rows[0].id, "123");
    assert.equal(campaigns.rows[0].map_count, 2);
    assert.equal(repository.catalog.resolveCampaignDbId({ id: 123 }), 1);
    assert.equal(repository.catalog.resolveCampaignDbId({ name: "Winter 2026 RPG Altered" }), 1);

    const maps = repository.catalog.listAlterationsMaps({
      alterationSlugs: ["rpg-altered"],
      mapNumber: Number.NaN,
      year: Number.NaN,
      sort: "campaign_slot",
    });
    assert.equal(maps.total, 2);
    assert.deepEqual(
      maps.rows.map(({ map_uid, slot }) => ({ map_uid, slot })),
      [
        { map_uid: "map-a", slot: 1 },
        { map_uid: "map-b", slot: 2 },
      ]
    );
    assert.equal(maps.rows[0].tracking_status, "active");
    assert.equal(maps.rows[0].wr_ms, 12345);
    assert.equal(maps.rows[0].wr_holder, "record-holder");
    assert.deepEqual(maps.rows[0].alterations, [{ id: alterations[0].id, name: "RPG Altered", slug: "rpg-altered" }]);

    const filters = repository.catalog.getAlterationsMapFilters();
    assert.deepEqual(filters.season_tags, [
      {
        key: "winter-2026",
        label: "Winter 2026",
        campaign_ids: ["123"],
        campaign_count: 1,
        map_count: 2,
      },
    ]);
    assert.deepEqual(repository.catalog.listAlteredMapUids(), ["map-a", "map-b"]);
    assert.equal(repository.catalog.listMostPlayedAlterationsMaps()[0].map_uid, "map-a");
  });
});

test("bulk alteration synchronization rolls back every mutation when one link fails", () => {
  withRepository((repository, db) => {
    ingestCampaigns(repository, [
      {
        id: 101,
        name: "Winter 2026 RPG Altered",
        maps: [{ uid: "rollback-a", name: "Rollback A", slot: 1 }],
      },
      {
        id: 102,
        name: "Spring 2026 Ice Altered",
        maps: [{ uid: "rollback-b", name: "Rollback B", slot: 1 }],
      },
    ]);
    repository.catalog.clearCampaignAlterations(1);
    repository.catalog.clearCampaignAlterations(2);
    repository.catalog.deleteUnusedAlterations();
    assert.equal(repository.catalog.countAlterations(), 0);
    db.exec(`
      CREATE TRIGGER reject_second_catalog_link
      BEFORE INSERT ON altered_campaign_alterations
      WHEN NEW.campaign_id = 2
      BEGIN
        SELECT RAISE(ABORT, 'forced catalog rollback');
      END
    `);

    assert.throws(() => repository.catalog.syncAllCampaignAlterations(), /forced catalog rollback/);
    assert.equal(repository.catalog.countAlterations(), 0);
    assert.deepEqual(repository.catalog.getAllCampaignAlterationLinks(), []);

    db.exec("DROP TRIGGER reject_second_catalog_link");
    assert.equal(repository.catalog.upsertAlteration("After Rollback").name, "After Rollback");
    assert.equal(repository.catalog.countAlterations(), 1);
  });
});
