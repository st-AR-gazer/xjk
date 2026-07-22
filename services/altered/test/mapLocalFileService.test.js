import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MapLocalFileService } from "../src/services/altered/mapProcessing/mapLocalFileService.js";

const publicMethods = [
  "buildMapsForLocalCopyBackfill",
  "downloadMapFileBuffer",
  "ensureMapContentSignatures",
  "ensureMapLocalFiles",
  "getLocalMapFileAbsolutePath",
  "getMapLocalFixAbsolutePath",
  "getMapLocalStoreStatus",
  "getMapViewerDiffPayload",
  "getPreferredMapLocalFiles",
  "importMapLocalFileFix",
  "runMapLocalCopyBackfill",
  "startMapLocalCopyBackfillOnBoot",
  "updateMapCopyProgress",
];

test("MapLocalFileService remains a thin compatibility facade with stable method arities", () => {
  const service = new MapLocalFileService({ repository: {}, mapCopyConfig: { dataDir: "." } });
  const methods = Object.getOwnPropertyNames(MapLocalFileService.prototype)
    .filter((name) => name !== "constructor")
    .sort();

  assert.deepEqual(methods, publicMethods);
  assert.deepEqual(Object.keys(service).sort(), [
    "extractContentSignature",
    "getMapNameWorkspaceService",
    "logger",
    "mapCopy",
    "parseMapLayouts",
    "repository",
  ]);
  assert.equal(MapLocalFileService.prototype.getLocalMapFileAbsolutePath.length, 1);
  assert.equal(MapLocalFileService.prototype.getMapLocalFixAbsolutePath.length, 1);
  for (const method of publicMethods.filter(
    (name) => !["getLocalMapFileAbsolutePath", "getMapLocalFixAbsolutePath"].includes(name)
  )) {
    assert.equal(MapLocalFileService.prototype[method].length, 0, `${method} changed its public arity`);
  }
});

test("local-file downloads cross the facade seam and retain persistence summaries", async (context) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "altered-map-local-files-"));
  context.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const upserts = [];
  const repository = {
    mapFiles: {
      getMapLocalFiles: () => [],
      upsertMapLocalFiles: (payload) => {
        upserts.push(payload);
        return { updated: payload.records.length };
      },
    },
  };
  const service = new MapLocalFileService({
    repository,
    mapCopyConfig: { dataDir, maxConcurrentDownloads: 1 },
  });
  service.downloadMapFileBuffer = async () => Buffer.from("map payload");

  const result = await service.ensureMapLocalFiles([
    { mapUid: "Map-Uid", downloadUrl: "https://example.test/map.gbx" },
  ]);

  assert.deepEqual(result.summary, { total: 1, reused: 0, downloaded: 1, missing: 0, errors: 0 });
  assert.equal(result.records[0].status, "ready");
  assert.equal(result.upsert.updated, 1);
  assert.deepEqual(upserts, [{ records: result.records }]);
  assert.equal(await fs.readFile(service.getLocalMapFileAbsolutePath("Map-Uid"), "utf8"), "map payload");
});

test("map downloads enforce public Nadeo egress across redirects", async () => {
  const service = new MapLocalFileService({ repository: {}, mapCopyConfig: { dataDir: "." } });
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const requested = [];
  const fetchImpl = async (url, options) => {
    requested.push({ redirect: options.redirect, url });
    return new Response(Buffer.from("map payload"), { status: 200 });
  };

  const payload = await service.downloadMapFileBuffer({
    mapUid: "safe-map",
    downloadUrl: "https://core.trackmania.nadeo.live/maps/safe-map/file",
    fetchImpl,
    lookup: publicLookup,
  });
  assert.equal(payload.toString("utf8"), "map payload");
  assert.deepEqual(requested, [{ redirect: "manual", url: "https://core.trackmania.nadeo.live/maps/safe-map/file" }]);

  await assert.rejects(
    service.downloadMapFileBuffer({
      mapUid: "unsafe-map",
      downloadUrl: "http://127.0.0.1/private",
      fetchImpl,
      lookup: publicLookup,
    }),
    /not allowlisted|non-public/i
  );

  let redirectRequests = 0;
  await assert.rejects(
    service.downloadMapFileBuffer({
      mapUid: "redirect-map",
      downloadUrl: "https://core.trackmania.nadeo.live/maps/redirect-map/file",
      fetchImpl: async () => {
        redirectRequests += 1;
        return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/metadata" } });
      },
      lookup: publicLookup,
    }),
    /not allowlisted|non-public/i
  );
  assert.equal(redirectRequests, 1);
});

test("copy backfill preserves shared mapCopy progress and completion state", async () => {
  const assignmentCalls = [];
  const repository = {
    naming: {
      listMapsForNameStandardization: () => [
        { mapUid: "target-map", name: "Target", campaign: "Spring 2025", slot: 2 },
      ],
    },
  };
  const service = new MapLocalFileService({
    repository,
    mapCopyConfig: { dataDir: ".", batchSize: 1 },
    getMapNameWorkspaceService: () => ({
      async assignStoredMapNumbersBySimilarity(options) {
        assignmentCalls.push(options);
        return {
          resolved: 1,
          unresolved: 0,
          changedCandidates: 1,
          approvals: { approved: 1 },
          signatures: {
            targets: { localFiles: { downloaded: 1, reused: 0, errors: 0, missing: 0 } },
            references: { localFiles: { downloaded: 0, reused: 1, errors: 0, missing: 0 } },
          },
        };
      },
    }),
  });
  const mapCopy = service.mapCopy;
  const progressPhases = [];
  const updateMapCopyProgress = service.updateMapCopyProgress.bind(service);
  service.updateMapCopyProgress = (partial) => {
    progressPhases.push(partial.phase);
    return updateMapCopyProgress(partial);
  };

  const result = await service.runMapLocalCopyBackfill({ reason: "test", force: true });

  assert.equal(service.mapCopy, mapCopy);
  assert.equal(result.ok, true);
  assert.equal(result.summary.processedMaps, 1);
  assert.equal(result.summary.targetDownloads, 1);
  assert.equal(result.summary.referenceReused, 1);
  assert.deepEqual(assignmentCalls, [{ mapUids: ["target-map"], limit: 1, force: true, persistCandidates: true }]);
  assert.equal(mapCopy.running, false);
  assert.equal(mapCopy.currentRunId, null);
  assert.equal(mapCopy.currentReason, null);
  assert.equal(mapCopy.currentProgress.phase, "complete");
  assert.equal(mapCopy.currentProgress.status, "ok");
  assert.equal(mapCopy.currentProgress.percent, 100);
  assert.equal(mapCopy.lastSummary, result.summary);
  assert.deepEqual(progressPhases, ["prepare", "batch", "batch", "complete"]);
});

test("copy backfill keeps established error and cleanup semantics", async () => {
  const service = new MapLocalFileService({
    repository: {
      naming: {
        listMapsForNameStandardization: () => [{ mapUid: "broken-map", name: "Broken" }],
      },
    },
    mapCopyConfig: { dataDir: "." },
    getMapNameWorkspaceService: () => ({
      assignStoredMapNumbersBySimilarity: async () => {
        throw new Error("similarity failed");
      },
    }),
  });

  const result = await service.runMapLocalCopyBackfill();

  assert.deepEqual(result, { error: "similarity failed" });
  assert.equal(service.mapCopy.running, false);
  assert.equal(service.mapCopy.currentRunId, null);
  assert.equal(service.mapCopy.lastError, "similarity failed");
  assert.equal(service.mapCopy.currentProgress.phase, "failed");
  assert.equal(service.mapCopy.currentProgress.status, "error");
});

test("content-signature parsing persists mapper display names from GBX metadata", async () => {
  const savedNameUpdates = [];
  const repository = {
    mapFiles: {
      getMapContentSignatures: () => [],
      upsertMapContentSignatures: ({ records }) => ({ updated: records.length }),
    },
    mappers: {
      updateMapSavedDisplayNames: (payload) => {
        savedNameUpdates.push(payload);
        return { updated: Object.keys(payload.namesByMapUid).length };
      },
    },
  };
  const service = new MapLocalFileService({
    repository,
    mapCopyConfig: { dataDir: "." },
    parseMapLayouts: async () => ({
      maps: [
        {
          mapUid: "map-uid",
          authorLogin: "author-account-id",
          authorNickname: "Mapper Name",
          signature: { version: "gbx-layout-v2", assetTokenCount: 3 },
        },
      ],
    }),
  });

  service.ensureMapLocalFiles = async () => ({ summary: { reused: 1 } });
  service.getPreferredMapLocalFiles = () => [
    {
      mapUid: "map-uid",
      relativePath: "maps/gbx/map-uid.Map.Gbx",
      fileSha256: "sha256",
      status: "ready",
    },
  ];

  const result = await service.ensureMapContentSignatures([
    {
      mapUid: "map-uid",
      author: "fallback-author-id",
      name: "A Map",
    },
  ]);

  assert.equal(result.summary.parsed, 1);
  assert.deepEqual(savedNameUpdates, [
    {
      namesByMapUid: {
        "map-uid": {
          authorSavedDisplayName: "Mapper Name",
          authorAccountId: "author-account-id",
        },
      },
    },
  ]);
});

test("viewer diffs use the injected parser through facade-owned file selection", async () => {
  const parserCalls = [];
  const repository = {
    maps: {
      getMapInfo: (mapUid) => ({
        exists: true,
        map: {
          mapUid,
          name: `${mapUid} name`,
          campaign: "Spring 2025",
          slot: mapUid === "target" ? 1 : 2,
        },
      }),
    },
  };
  const service = new MapLocalFileService({
    repository,
    mapCopyConfig: { dataDir: "test-data" },
    parseMapLayouts: async (maps) => {
      parserCalls.push(maps);
      return {
        maps: maps.map((map) => ({
          mapUid: map.mapUid,
          mapName: `${map.mapUid} parsed`,
          elements: [],
        })),
      };
    },
  });
  service.getPreferredMapLocalFiles = ({ mapUids }) =>
    mapUids.map((mapUid) => ({ mapUid, relativePath: `${mapUid}.Map.Gbx`, status: "ready" }));

  const result = await service.getMapViewerDiffPayload({
    targetMapUid: "target",
    referenceMapUid: "reference",
  });

  assert.equal(result.ok, true);
  assert.equal(result.targetMap.mapUid, "target");
  assert.equal(result.referenceMap.mapUid, "reference");
  assert.equal(result.summary.targetCount, 0);
  assert.equal(result.summary.referenceCount, 0);
  assert.deepEqual(parserCalls, [
    [
      { mapUid: "target", filePath: path.join("test-data", "target.Map.Gbx") },
      { mapUid: "reference", filePath: path.join("test-data", "reference.Map.Gbx") },
    ],
  ]);
});

test("local-fix imports retain signature and similarity cross-operation behavior", async (context) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "altered-map-fix-"));
  context.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const sourceFilePath = path.join(dataDir, "replacement.Map.Gbx");
  await fs.writeFile(sourceFilePath, "replacement payload");
  const fixUpserts = [];
  const signatureCalls = [];
  const similarityCalls = [];
  const map = { mapUid: "map-uid", name: "Map Name" };
  const service = new MapLocalFileService({
    repository: {
      maps: {
        getMapInfo: () => ({ exists: true, map }),
      },
      mapFiles: {
        upsertMapLocalFileFixes: (payload) => {
          fixUpserts.push(payload);
          return { updated: payload.records.length };
        },
      },
    },
    mapCopyConfig: { dataDir },
    getMapNameWorkspaceService: () => ({
      async assignStoredMapNumbersBySimilarity(options) {
        similarityCalls.push(options);
        return { resolved: 1 };
      },
    }),
  });
  service.ensureMapContentSignatures = async (...args) => {
    signatureCalls.push(args);
    return { summary: { parsed: 1 } };
  };

  const result = await service.importMapLocalFileFix({
    mapUid: "map-uid",
    sourceFilePath,
    note: "manual repair",
  });

  assert.equal(result.ok, true);
  assert.equal(result.mapUid, "map-uid");
  assert.equal(result.mapName, "Map Name");
  assert.equal(result.fileSizeBytes, Buffer.byteLength("replacement payload"));
  assert.equal(await fs.readFile(result.absolutePath, "utf8"), "replacement payload");
  assert.equal(fixUpserts[0].records[0].note, "manual repair");
  assert.deepEqual(signatureCalls, [[[map], { force: true }]]);
  assert.deepEqual(similarityCalls, [{ mapUids: ["map-uid"], limit: 1, force: true, persistCandidates: true }]);
});
