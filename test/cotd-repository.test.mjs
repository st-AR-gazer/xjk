import assert from "node:assert/strict";
import test from "node:test";

import { CotdRepository } from "../services/cotd-public/src/repository.js";
import { COTD_SCHEMA_VERSION, migrateCotdDatabase } from "../services/cotd-public/src/repository/schema.js";

test("COTD repository migrates an in-memory database and supports each CRUD area", () => {
  const repository = new CotdRepository({ dbFile: ":memory:", maxOffset: 5 });
  try {
    assert.equal(repository.db.prepare("PRAGMA user_version").get().user_version, COTD_SCHEMA_VERSION);
    migrateCotdDatabase(repository.db);
    const tables = repository.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map(({ name }) => name);
    assert.deepEqual(tables, ["cotd_days", "map_files", "map_infos", "service_state", "style_snapshots"]);

    assert.equal(
      repository.upsertTotdDays([
        {
          cotdDate: "2026-07-20",
          mapUid: "map-uid-1",
          campaignId: 42,
          startTimestamp: 1_752_969_600,
        },
      ]),
      1
    );
    assert.equal(
      repository.upsertMapInfos([
        {
          mapUid: "map-uid-1",
          mapId: "map-id-1",
          name: "Migration Test Map",
          author: "author-account",
          fileUrl: "https://example.invalid/map.gbx",
        },
      ]),
      1
    );

    const candidates = repository.listMapFileDownloadCandidates({ mapUids: ["map-uid-1"] });
    assert.equal(candidates.length, 1);
    const mapFile = repository.upsertMapFile({
      mapUid: "map-uid-1",
      mapId: "map-id-1",
      filename: "Migration.Map.Gbx",
      storagePath: "C:/tmp/Migration.Map.Gbx",
      sha256: "abc123",
      sizeBytes: 123,
      status: "downloaded",
      downloadedAt: "2026-07-20T00:00:00.000Z",
    });
    assert.equal(mapFile.downloaded, true);
    assert.equal(repository.listMapFileDownloadCandidates({ mapUids: ["map-uid-1"] }).length, 0);

    const pendingPage = repository.listTotdMaps({ limit: 999, offset: 0 });
    assert.equal(pendingPage.limit, 500);
    assert.equal(pendingPage.items[0].cotd.mapName, "Migration Test Map");
    assert.equal(pendingPage.items[0].mapFile.sizeBytes, 123);

    const saved = repository.upsertSnapshot({
      id: "snapshot-1",
      source: "test",
      status: "classified",
      generatedAt: "2026-07-20T01:00:00.000Z",
      cotd: {
        cotdDate: "2026-07-20",
        competitionId: "42",
        mapUid: "map-uid-1",
        mapName: "Migration Test Map",
      },
      rankedStyles: [{ style: "Tech", score: 1 }],
    });
    assert.equal(saved.id, "snapshot-1");
    assert.equal(repository.getLatest().rankedStyles[0].style, "Tech");
    assert.equal(repository.listHistory({ limit: 1 }).total, 1);

    repository.setFetchState({ status: "ok", reason: "test" });
    assert.deepEqual(repository.getFetchState(), { status: "ok", reason: "test" });
    assert.deepEqual(repository.listMapInfosByUids(["", "map-uid-1"])[0].mapUid, "map-uid-1");
    assert.equal(repository.listTotdMaps({ offset: 999 }).offset, 5);

    const summary = repository.getStorageSummary();
    assert.equal(summary.totdCount, 1);
    assert.equal(summary.historyCount, 1);
    assert.equal(summary.mapFileDownloadedCount, 1);
  } finally {
    repository.close();
  }
});
