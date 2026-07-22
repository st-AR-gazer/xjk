import assert from "node:assert/strict";
import test from "node:test";

import { buildContinuationArgs } from "../tools/similarity-resolver/continuation.js";
import { loadSelectedMapUids, remainingMapUids, selectionLimit } from "../tools/similarity-resolver/map-selection.js";
import { createProgressTracker } from "../tools/similarity-resolver/progress.js";
import { buildNamingSimilaritySummaryFromExternalProgress } from "../src/services/altered/mapProcessing/similarityBackfill/backfillState.js";
import {
  accumulateBatchTotals,
  buildTotals,
  normalizeMapUidList,
  parseArgs,
} from "../tools/similarity-resolver/run-state.js";

test("similarity resolver arguments and map selections normalize deterministically", () => {
  assert.deepEqual(
    [...parseArgs(["--batch-size", "25", "--force"])],
    [
      ["batch-size", "25"],
      ["force", "1"],
    ]
  );
  assert.deepEqual(normalizeMapUidList([" map-a ", "MAP-A", "", null, "map-b"]), ["map-a", "map-b"]);
});

test("database-backed selections apply resume offsets exactly once", () => {
  let query = "";
  let requestedLimit = null;
  const repository = {
    db: {
      prepare(sql) {
        query = sql;
        return {
          all(limit) {
            requestedLimit = limit;
            return [{ mapUid: "map-a" }, { mapUid: "map-b" }, { mapUid: "map-c" }];
          },
        };
      },
    },
  };

  const selected = loadSelectedMapUids(repository, { maxMaps: 3 });
  assert.deepEqual(selected, ["map-a", "map-b", "map-c"]);
  assert.deepEqual(remainingMapUids(selected, 1), ["map-b", "map-c"]);
  assert.doesNotMatch(query, /\bOFFSET\b/i);
  assert.equal(requestedLimit, 3);
  assert.equal(selectionLimit(0), 500000);
});

test("file-backed selections de-duplicate before applying the total cap", () => {
  const selected = loadSelectedMapUids(null, {
    mapUidsFromFile: ["map-a", "MAP-A", "map-b", "map-c"],
    maxMaps: 2,
  });
  assert.deepEqual(selected, ["map-a", "map-b"]);
  assert.deepEqual(remainingMapUids(selected, 1), ["map-b"]);
});

test("similarity resolver totals resume and accumulate every batch category", () => {
  const totals = buildTotals({ processed: 5, resolved: 3, unknown: 99 });
  accumulateBatchTotals(totals, {
    processed: 2,
    resolved: 1,
    unresolved: 1,
    similarityUpsert: { processed: 2, inserted: 1, updated: 1 },
    candidateUpsert: { processed: 1, inserted: 1 },
    approvals: { approved: 1 },
    signatures: {
      targets: { reused: 1, parsed: 1, errors: 0, missingDownload: 1 },
      references: { reused: 2, parsed: 3, errors: 1, missingDownload: 0 },
    },
  });

  assert.equal(totals.processed, 7);
  assert.equal(totals.resolved, 4);
  assert.equal(totals.unresolved, 1);
  assert.equal(totals.similarityRowsWritten, 2);
  assert.equal(totals.candidateRowsInserted, 1);
  assert.equal(totals.autoApproved, 1);
  assert.equal(totals.targetMissingDownload, 1);
  assert.equal(totals.referenceParsed, 3);
  assert.equal("unknown" in totals, false);
});

test("continuation arguments preserve all optional worker settings", () => {
  const args = buildContinuationArgs(
    {
      entrypoint: "resolver.mjs",
      progressFile: "progress.json",
      batchSize: 20,
      runId: "run-1",
      reason: "admin",
      persistCandidates: false,
      force: true,
      offset: 40,
      maxBatchesPerProcess: 3,
      mapUidsFile: "maps.json",
      logFile: "resolver.log",
      maxMaps: 100,
      targetClubId: 24231,
      rescanAll: true,
    },
    "nonce-1"
  );

  assert.deepEqual(args.slice(0, 5), ["resolver.mjs", "--progress-file", "progress.json", "--batch-size", "20"]);
  for (const flag of [
    "--run-id",
    "--run-nonce",
    "--map-uids-file",
    "--log-file",
    "--max-maps",
    "--club-id",
    "--rescan-all",
  ]) {
    assert.ok(args.includes(flag), `missing ${flag}`);
  }
});

test("progress tracker merges live counters and serializes writes in order", async () => {
  const writes = [];
  const context = {
    runId: "run-1",
    workerPid: 123,
    workerIdentity: { pid: 123 },
    reason: "test",
    startedAtIso: "2026-01-01T00:00:00.000Z",
    startedMs: Date.parse("2026-01-01T00:00:00.000Z"),
    dbFile: "altered.sqlite",
    dataDir: "data",
    logFile: "",
    progressFile: "progress.json",
    totalMaps: 8,
    startOffset: 0,
    batchSize: 4,
    totalBatches: 2,
    startBatchIndex: 0,
    selectedMapsTotal: 8,
    targetClubId: null,
    rescanAll: false,
    persistCandidates: true,
    force: false,
    totals: buildTotals({ processed: 4, resolved: 3, unresolved: 1 }),
  };
  const tracker = createProgressTracker(context, {
    now: () => Date.parse("2026-01-01T00:00:10.000Z"),
    writeJson: async (filePath, payload) => writes.push({ filePath, payload }),
  });
  const payload = tracker.buildPayload({
    completedBatches: 1,
    partial: { stage: "matching", counters: { processed: 2, resolved: 1, unresolved: 1 } },
  });

  assert.equal(payload.nextOffset, 6);
  assert.equal(payload.percent, 75);
  assert.equal(payload.message, "Compared 6 of 8 maps...");
  assert.deepEqual(payload.currentBatch, {
    index: 2,
    total: 2,
    size: 4,
    processed: 6,
    message: "Compared 6 of 8 maps...",
    percent: 75,
    stage: "matching",
    updatedAt: null,
  });
  await Promise.all([tracker.queueWrite({ sequence: 1 }), tracker.queueWrite({ sequence: 2 })]);
  assert.deepEqual(
    writes.map(({ filePath, payload: written }) => [filePath, written.sequence]),
    [
      ["progress.json", 1],
      ["progress.json", 2],
    ]
  );
});

test("external progress summary prefers live signature details and preserves aggregate fallbacks", () => {
  const summary = buildNamingSimilaritySummaryFromExternalProgress(null, {
    selectedMaps: 8,
    targetClubId: 24231,
    rescanAll: true,
    totals: {
      processed: 6,
      resolved: 4,
      targetReused: 3,
      targetParsed: 2,
      referenceReused: 7,
      referenceErrors: 1,
    },
    counters: {
      targetSignaturesTotal: 8,
      targetSignaturesReady: 6,
      referenceSignaturesTotal: 12,
      referenceSignaturesReady: 10,
    },
    signatureSummary: {
      targets: { reused: 5, missingDownload: 1 },
    },
  });

  assert.equal(summary.emptySelection, false);
  assert.equal(summary.targetClubId, 24231);
  assert.deepEqual(summary.targetSignatures, {
    total: 8,
    ready: 6,
    reused: 5,
    parsed: 2,
    errors: 0,
    missingDownload: 1,
  });
  assert.deepEqual(summary.referenceSignatures, {
    total: 12,
    ready: 10,
    reused: 7,
    parsed: 0,
    errors: 1,
    missingDownload: 0,
  });
});
