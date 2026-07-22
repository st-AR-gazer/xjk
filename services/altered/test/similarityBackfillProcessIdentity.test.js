import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SimilarityBackfillService } from "../src/services/altered/mapProcessing/similarityBackfillService.js";

function createService({ dataDir, processRuntime }) {
  return new SimilarityBackfillService({
    repository: {},
    getMapLocalFileService: () => ({ mapCopy: { dataDir } }),
    getMapNameWorkspaceService: () => ({}),
    processRuntime,
  });
}

function writeRunningProgress(service, workerIdentity) {
  fs.mkdirSync(path.dirname(service.namingSimilarityBackfill.progressFilePath), { recursive: true });
  fs.writeFileSync(
    service.namingSimilarityBackfill.progressFilePath,
    JSON.stringify({
      runId: workerIdentity.runId,
      workerPid: workerIdentity.pid,
      workerIdentity,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      running: true,
      status: "running",
      complete: false,
    })
  );
}

test("stale similarity worker identity is never terminated after PID reuse", (context) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "altered-worker-identity-"));
  context.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  let killCalls = 0;
  const service = createService({
    dataDir,
    processRuntime: {
      isProcessAlive: () => true,
      readProcessIdentity: () => ({
        pid: 4242,
        executable: "C:\\Program Files\\nodejs\\node.exe",
        commandLine: "node unrelated.mjs --run-id other --run-nonce other",
        createdAt: "2026-07-20T02:00:00.0000000Z",
      }),
      managedProcessIdentityMatches: () => false,
      killProcessTree: () => {
        killCalls += 1;
        return { killed: true };
      },
    },
  });
  writeRunningProgress(service, {
    pid: 4242,
    executable: "C:\\Program Files\\nodejs\\node.exe",
    commandLine: "node worker.mjs --run-id similarity-1 --run-nonce nonce-1",
    createdAt: "2026-07-20T01:00:00.0000000Z",
    entrypoint: "C:\\xjk\\worker.mjs",
    runId: "similarity-1",
    runNonce: "nonce-1",
  });

  const result = service.cancelNamingSimilarityBackfill();
  assert.equal(result.canceled, false);
  assert.equal(result.alreadyStopped, true);
  assert.equal(killCalls, 0);
  const progress = JSON.parse(fs.readFileSync(service.namingSimilarityBackfill.progressFilePath, "utf8"));
  assert.equal(progress.status, "error");
  assert.match(progress.error, /identity no longer matches/i);
});

test("verified similarity worker identity can be terminated", (context) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "altered-worker-owned-"));
  context.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  let killCalls = 0;
  const identity = {
    pid: 5151,
    executable: "node",
    commandLine: "node worker.mjs --run-id similarity-2 --run-nonce nonce-2",
    createdAt: "proc-start-ticks:100",
    entrypoint: "worker.mjs",
    runId: "similarity-2",
    runNonce: "nonce-2",
  };
  const service = createService({
    dataDir,
    processRuntime: {
      isProcessAlive: () => true,
      readProcessIdentity: () => identity,
      managedProcessIdentityMatches: () => true,
      killProcessTree: () => {
        killCalls += 1;
        return { killed: true, error: null };
      },
    },
  });
  writeRunningProgress(service, identity);

  const result = service.cancelNamingSimilarityBackfill({ reason: "test" });
  assert.equal(result.canceled, true);
  assert.equal(result.killed, true);
  assert.equal(killCalls, 1);
});
