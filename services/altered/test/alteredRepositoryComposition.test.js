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

test("AlteredRepository composes explicit domain repositories", () => {
  withRepository((repository) => {
    assert.deepEqual(Object.keys(repository).sort(), [
      "activity",
      "admin",
      "campaigns",
      "catalog",
      "configuration",
      "db",
      "ingestion",
      "leaderboard",
      "mapFiles",
      "mappers",
      "maps",
      "monitoring",
      "naming",
    ]);

    const marker = [{ uid: "delegated-map" }];
    repository.maps.listMaps = (...args) => ({ marker, args });
    assert.deepEqual(repository.maps.listMaps({ q: "test" }), {
      marker,
      args: [{ q: "test" }],
    });
    assert.equal(repository.listMaps, undefined);
  });
});

test("project-source ingestion crosses campaign, map, and configuration repositories", () => {
  withRepository((repository) => {
    const result = repository.ingestion.ingestProjectSourceSnapshot({
      sourceKey: "test-source",
      sourceType: "official-seasonal",
      displayName: "Test Source",
      campaigns: [
        {
          id: 123,
          name: "Winter 2026 Test",
          maps: [
            {
              uid: "test-map-1",
              name: "Test Map",
              slot: 1,
              author: "00000000-0000-0000-0000-000000000001",
            },
          ],
        },
      ],
    });

    assert.equal(result.campaignsSeen, 1);
    assert.equal(result.mapsInserted, 1);
    assert.equal(result.mapsLinked, 1);
    assert.equal(result.mapsForTracker[0].uid, "test-map-1");
    assert.equal(repository.maps.getMapInfo("test-map-1").map.campaign, "Winter 2026 Test");
    assert.equal(repository.catalog.resolveCampaignDbId({ id: 123 }), 1);
    assert.equal(repository.catalog.resolveCampaignDbId({ name: "Winter 2026 Test" }), 1);
    assert.equal(repository.configuration.getProjectSource("test-source").sourceKey, "test-source");
  });
});

test("repository seams preserve empty-workspace return shapes", () => {
  withRepository((repository) => {
    assert.deepEqual(repository.leaderboard.listWrLeaderboardOverall(), []);
    assert.deepEqual(repository.maps.listMaps(), []);
    assert.deepEqual(repository.naming.listMapNameCandidates(), []);
    assert.deepEqual(repository.mapFiles.getMapLocalFiles(), []);
    assert.deepEqual(repository.mapFiles.getMapContentSignatures(), []);
    assert.deepEqual(repository.mappers.getMapperAccountsForSync(), []);
    assert.deepEqual(repository.monitoring.listHookRuns(), []);
    assert.equal(repository.catalog.getSummary().trackedMaps, 0);
    assert.equal(repository.naming.getMapNameCandidateSummary().total, 0);
  });
});

test("hook ingestion crosses monitoring and campaign repositories", () => {
  withRepository((repository) => {
    const result = repository.ingestion.ingestHookSnapshot({
      clubId: 42,
      clubName: "Test Club",
      campaigns: [
        {
          id: 10,
          name: "Spring 2026 Altered",
          maps: [{ uid: "hook-map", name: "Hook Map", slot: 1 }],
        },
      ],
    });

    assert.equal(result.mapsInserted, 1);
    assert.equal(result.run.status, "ok");
    assert.equal(result.mapsForTracker[0].clubId, 42);
    assert.equal(repository.monitoring.getHookStatus().mapCount, 1);
    assert.equal(repository.monitoring.listHookRuns(1)[0].campaignsSeen, 1);
  });
});
