import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SimilarityBackfillService } from "../src/services/altered/mapProcessing/similarityBackfillService.js";

function createService(context, processRuntime = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "altered-external-state-"));
  context.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  return new SimilarityBackfillService({
    repository: {},
    getMapLocalFileService: () => ({ mapCopy: { dataDir } }),
    getMapNameWorkspaceService: () => ({}),
    processRuntime: {
      isProcessAlive: () => false,
      readProcessIdentity: () => null,
      managedProcessIdentityMatches: () => false,
      ...processRuntime,
    },
  });
}

function writeProgress(service, progress) {
  const filePath = service.namingSimilarityBackfill.progressFilePath;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(progress));
}

function activeProgress(overrides = {}) {
  const now = new Date().toISOString();
  return {
    runId: "similarity-test",
    workerPid: 4242,
    workerIdentity: { pid: 4242, runId: "similarity-test" },
    startedAt: now,
    updatedAt: now,
    running: true,
    status: "running",
    complete: false,
    selectedMaps: 10,
    batchesTotal: 2,
    batchSize: 5,
    currentBatch: { index: 1, total: 2, size: 5 },
    totals: { processed: 3, resolved: 2 },
    ...overrides,
  };
}

test("verified external workers remain running and project current progress", (context) => {
  const service = createService(context, {
    isProcessAlive: () => true,
    readProcessIdentity: () => ({ pid: 4242, runId: "similarity-test" }),
    managedProcessIdentityMatches: () => true,
  });
  writeProgress(service, activeProgress({ stage: "matching", counters: { resolved: 7 } }));

  const progress = service.refreshNamingSimilarityBackfillExternalState();

  assert.equal(progress.runId, "similarity-test");
  assert.equal(service.namingSimilarityBackfill.running, true);
  assert.equal(service.namingSimilarityBackfill.currentRunId, "similarity-test");
  assert.deepEqual(
    {
      message: service.namingSimilarityBackfill.currentProgress.message,
      percent: service.namingSimilarityBackfill.currentProgress.percent,
      processed: service.namingSimilarityBackfill.currentProgress.counters.processed,
      resolved: service.namingSimilarityBackfill.currentProgress.counters.resolved,
    },
    { message: "Compared 3 of 10 maps...", percent: 30, processed: 3, resolved: 7 }
  );
});

test("fresh pidless progress retains its startup grace period", (context) => {
  const service = createService(context);
  writeProgress(service, activeProgress({ workerPid: null, workerIdentity: null }));

  service.refreshNamingSimilarityBackfillExternalState();

  assert.equal(service.namingSimilarityBackfill.running, true);
  assert.equal(service.namingSimilarityBackfill.childPid, null);
  assert.equal(service.namingSimilarityBackfill.currentProgress.status, "running");
});

test("stopped external workers become terminal errors", (context) => {
  const service = createService(context, {
    managedProcessIdentityMatches: () => true,
  });
  writeProgress(service, activeProgress());

  const progress = service.refreshNamingSimilarityBackfillExternalState();
  const persisted = JSON.parse(fs.readFileSync(service.namingSimilarityBackfill.progressFilePath, "utf8"));

  assert.equal(progress.complete, true);
  assert.equal(persisted.status, "error");
  assert.match(persisted.error, /stopped before reporting completion/i);
  assert.equal(service.namingSimilarityBackfill.running, false);
  assert.equal(service.namingSimilarityBackfill.currentRunId, null);
  assert.equal(service.namingSimilarityBackfill.currentProgress.status, "error");
});

test("completed external errors preserve their failure details", (context) => {
  const service = createService(context);
  service.namingSimilarityBackfill.mode = "external";
  service.namingSimilarityBackfill.currentRunId = "similarity-error";
  writeProgress(
    service,
    activeProgress({
      runId: "similarity-error",
      workerPid: null,
      workerIdentity: null,
      running: false,
      status: "error",
      stage: "failed",
      complete: true,
      error: "Parser failed safely.",
      elapsedSeconds: 4,
    })
  );

  service.refreshNamingSimilarityBackfillExternalState();

  assert.equal(service.namingSimilarityBackfill.running, false);
  assert.equal(service.namingSimilarityBackfill.currentProgress.status, "error");
  assert.equal(service.namingSimilarityBackfill.currentProgress.message, "Parser failed safely.");
  assert.equal(service.namingSimilarityBackfill.lastError, "Parser failed safely.");
  assert.equal(service.namingSimilarityBackfill.lastDurationMs, 4000);
});

test("successful external completion records a summary and full progress", (context) => {
  const service = createService(context);
  service.namingSimilarityBackfill.mode = "external";
  service.namingSimilarityBackfill.currentRunId = "similarity-complete";
  writeProgress(
    service,
    activeProgress({
      runId: "similarity-complete",
      workerPid: null,
      workerIdentity: null,
      running: false,
      status: "complete",
      complete: true,
      elapsedSeconds: 9,
      totals: { processed: 10, resolved: 8, unresolved: 2, refreshedSimilarityRecords: 6 },
    })
  );

  service.refreshNamingSimilarityBackfillExternalState();

  assert.equal(service.namingSimilarityBackfill.currentProgress.status, "ok");
  assert.equal(service.namingSimilarityBackfill.currentProgress.percent, 100);
  assert.match(service.namingSimilarityBackfill.currentProgress.message, /10 processed, 8 resolved, 6 refreshed/);
  assert.equal(service.namingSimilarityBackfill.lastDurationMs, 9000);
  assert.equal(service.namingSimilarityBackfill.lastSummary.resolved, 8);
  assert.equal(service.namingSimilarityBackfill.lastSummary.unresolved, 2);
});
