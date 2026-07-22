import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";

import { ensureParentDirectorySync } from "../../../shared/fsUtils.js";
import { buildManagedProcessIdentity, readProcessIdentity } from "../../../shared/processIdentity.js";

function buildContinuationArgs(options, runNonce) {
  const args = [
    options.entrypoint,
    "--progress-file",
    options.progressFile,
    "--batch-size",
    String(options.batchSize),
    "--run-id",
    options.runId,
    "--run-nonce",
    runNonce,
    "--reason",
    options.reason,
    "--persist-candidates",
    options.persistCandidates ? "1" : "0",
    "--force",
    options.force ? "1" : "0",
    "--offset",
    String(options.offset),
    "--max-batches-per-process",
    String(options.maxBatchesPerProcess),
  ];
  if (options.mapUidsFile) args.push("--map-uids-file", options.mapUidsFile);
  if (options.logFile) args.push("--log-file", options.logFile);
  if (options.maxMaps > 0) args.push("--max-maps", String(options.maxMaps));
  if (Number(options.targetClubId || 0) > 0) args.push("--club-id", String(options.targetClubId));
  if (options.rescanAll) args.push("--rescan-all", "1");
  return args;
}

function spawnContinuationWorker(options) {
  const runNonce = randomUUID();
  const childArgs = buildContinuationArgs(options, runNonce);
  let logDescriptor = null;

  try {
    if (options.logFile) {
      ensureParentDirectorySync(options.logFile);
      logDescriptor = fs.openSync(options.logFile, "a");
    }
    const child = spawn(process.execPath, childArgs, {
      cwd: options.cwd,
      stdio: logDescriptor !== null ? ["ignore", logDescriptor, logDescriptor] : ["ignore", "ignore", "ignore"],
      windowsHide: true,
      detached: true,
    });
    child.unref();
    return {
      child,
      identity: buildManagedProcessIdentity({
        ...(readProcessIdentity(child.pid) || {}),
        pid: child.pid,
        entrypoint: options.entrypoint,
        runId: options.runId,
        runNonce,
      }),
    };
  } finally {
    if (logDescriptor !== null) {
      try {
        fs.closeSync(logDescriptor);
      } catch {}
    }
  }
}

export { buildContinuationArgs, spawnContinuationWorker };
