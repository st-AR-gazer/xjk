import {
  EXTERNAL_NAMING_SIMILARITY_BATCH_SIZE,
  NAMING_SIMILARITY_RESOLVER_SCRIPT_PATH,
  fsSync,
  normalizeUniqueStrings,
  path,
  randomUUID,
  readJsonFileSync,
  sanitizeFileComponent,
  spawn,
  toText,
  writeJsonFileSync,
} from "../../serviceSupport.js";
import { refreshNamingSimilarityBackfillExternalState } from "./externalWorkerState.js";

function readNamingSimilarityBackfillExternalProgress(context) {
  return readJsonFileSync(context.namingSimilarityBackfill.progressFilePath, null);
}

function clearNamingSimilarityBackfillExternalArtifacts(context, { clearMapUidsFile = true } = {}) {
  context.namingSimilarityBackfill.mode = "internal";
  context.namingSimilarityBackfill.childProcess = null;
  context.namingSimilarityBackfill.childPid = null;
  context.namingSimilarityBackfill.childIdentity = null;
  const files = [
    context.namingSimilarityBackfill.progressFilePath,
    clearMapUidsFile ? context.namingSimilarityBackfill.mapUidsFilePath : null,
  ].filter(Boolean);
  for (const filePath of files) {
    try {
      fsSync.unlinkSync(filePath);
    } catch {}
  }
}

function recoverNamingSimilarityBackfillExternalState(context) {
  const progress = context.readNamingSimilarityBackfillExternalProgress();
  if (!progress || progress.complete) return null;
  const workerPid = Number(progress?.workerPid || 0) || null;
  context.namingSimilarityBackfill.mode = "external";
  context.namingSimilarityBackfill.currentRunId =
    toText(progress?.runId) || context.namingSimilarityBackfill.currentRunId || null;
  context.namingSimilarityBackfill.currentReason =
    toText(progress?.reason) || context.namingSimilarityBackfill.currentReason || null;
  context.namingSimilarityBackfill.childPid = workerPid;
  context.namingSimilarityBackfill.childIdentity = progress?.workerIdentity || null;
  context.namingSimilarityBackfill.childProcess = null;
  context.namingSimilarityBackfill.lastStartedAt =
    progress.startedAt || context.namingSimilarityBackfill.lastStartedAt || null;
  context.namingSimilarityBackfill.targetClubId =
    Number(progress?.targetClubId || 0) || context.namingSimilarityBackfill.targetClubId || null;
  context.namingSimilarityBackfill.rescanAll =
    progress.rescanAll === undefined
      ? Boolean(context.namingSimilarityBackfill.rescanAll)
      : Boolean(progress.rescanAll);
  return progress;
}

function launchExternalNamingSimilarityBackfill(
  context,
  {
    runId,
    reason = "manual-admin",
    mapUids = [],
    clubId = null,
    rescanAll = false,
    force = false,
    persistCandidates = true,
  } = {}
) {
  const safeMapUids = normalizeUniqueStrings(mapUids);
  const batchSize = EXTERNAL_NAMING_SIMILARITY_BATCH_SIZE;
  const startedAt = new Date().toISOString();
  const runNonce = randomUUID();
  const logFilePath = path.join(
    context.mapCopy.dataDir,
    "tmp",
    `similarity-resolver-${sanitizeFileComponent(runId, "current")}.log`
  );
  writeJsonFileSync(context.namingSimilarityBackfill.mapUidsFilePath, safeMapUids);
  writeJsonFileSync(context.namingSimilarityBackfill.progressFilePath, {
    runId,
    reason,
    startedAt,
    updatedAt: startedAt,
    dbFile: null,
    dataDir: context.mapCopy.dataDir,
    logFile: logFilePath,
    totalMaps: safeMapUids.length,
    startOffset: 0,
    nextOffset: 0,
    batchSize,
    batchesCompleted: 0,
    batchesTotal: Math.ceil(safeMapUids.length / Math.max(1, batchSize)),
    selectedMaps: safeMapUids.length,
    targetClubId: Number(clubId || 0) || null,
    rescanAll: Boolean(rescanAll),
    persistCandidates: Boolean(persistCandidates),
    force: Boolean(force),
    totals: {
      processed: 0,
      resolved: 0,
      unresolved: 0,
      changedCandidates: 0,
      refreshedSimilarityRecords: 0,
      upgradedLegacySimilarityRecords: 0,
      similarityRowsWritten: 0,
      similarityRowsInserted: 0,
      similarityRowsUpdated: 0,
      candidateRowsWritten: 0,
      candidateRowsInserted: 0,
      candidateRowsUpdated: 0,
      autoApproved: 0,
      targetReused: 0,
      targetParsed: 0,
      targetErrors: 0,
      targetMissingDownload: 0,
      referenceReused: 0,
      referenceParsed: 0,
      referenceErrors: 0,
      referenceMissingDownload: 0,
    },
    currentBatch: null,
    running: true,
    status: "running",
    elapsedSeconds: 0,
    complete: false,
  });

  const args = [
    NAMING_SIMILARITY_RESOLVER_SCRIPT_PATH,
    "--map-uids-file",
    context.namingSimilarityBackfill.mapUidsFilePath,
    "--progress-file",
    context.namingSimilarityBackfill.progressFilePath,
    "--batch-size",
    String(batchSize),
    "--log-file",
    logFilePath,
    "--run-id",
    runId,
    "--run-nonce",
    runNonce,
    "--reason",
    reason,
    "--persist-candidates",
    persistCandidates ? "1" : "0",
    "--force",
    force ? "1" : "0",
  ];
  if (Number(clubId || 0) > 0) {
    args.push("--club-id", String(Number(clubId)));
  }
  if (rescanAll) {
    args.push("--rescan-all", "1");
  }

  let logFd = null;
  let child = null;
  try {
    fsSync.mkdirSync(path.dirname(logFilePath), { recursive: true });
    logFd = fsSync.openSync(logFilePath, "a");
    child = spawn(process.execPath, args, {
      cwd: path.resolve(path.dirname(NAMING_SIMILARITY_RESOLVER_SCRIPT_PATH), ".."),
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
      detached: true,
    });
  } finally {
    if (logFd !== null) {
      try {
        fsSync.closeSync(logFd);
      } catch {}
    }
  }
  child.unref();

  const childIdentity = context.processRuntime.buildManagedProcessIdentity({
    ...(context.processRuntime.readProcessIdentity(child.pid) || {}),
    pid: child.pid,
    entrypoint: NAMING_SIMILARITY_RESOLVER_SCRIPT_PATH,
    runId,
    runNonce,
  });

  context.namingSimilarityBackfill.mode = "external";
  context.namingSimilarityBackfill.running = true;
  context.namingSimilarityBackfill.currentRunId = runId;
  context.namingSimilarityBackfill.currentReason = toText(reason) || "manual-admin";
  context.namingSimilarityBackfill.lastStartedAt = startedAt;
  context.namingSimilarityBackfill.lastFinishedAt = null;
  context.namingSimilarityBackfill.lastDurationMs = null;
  context.namingSimilarityBackfill.lastError = null;
  context.namingSimilarityBackfill.lastSummary = null;
  context.namingSimilarityBackfill.childProcess = child;
  context.namingSimilarityBackfill.childPid = Number(child.pid || 0) || null;
  context.namingSimilarityBackfill.childIdentity = childIdentity;
  context.namingSimilarityBackfill.targetClubId = Number(clubId || 0) || null;
  context.namingSimilarityBackfill.rescanAll = Boolean(rescanAll);
  context.refreshNamingSimilarityBackfillExternalState();

  const finalizeExternalState = () => {
    context.namingSimilarityBackfill.childProcess = null;
    context.namingSimilarityBackfill.childPid = null;
    context.namingSimilarityBackfill.childIdentity = null;
    context.refreshNamingSimilarityBackfillExternalState();
  };

  child.on("exit", finalizeExternalState);
  child.on("error", (error) => {
    writeJsonFileSync(context.namingSimilarityBackfill.progressFilePath, {
      ...(context.readNamingSimilarityBackfillExternalProgress() || {}),
      updatedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      running: false,
      status: "error",
      complete: true,
      error: error?.message || "Failed to launch similarity resolver worker.",
    });
    finalizeExternalState();
  });
}

function cancelNamingSimilarityBackfill(context, { reason = "admin-cancel" } = {}) {
  context.refreshNamingSimilarityBackfillExternalState();

  const progress = context.readNamingSimilarityBackfillExternalProgress();
  const hasProgress = Boolean(progress) && typeof progress === "object";
  const alreadyComplete = Boolean(progress?.complete);
  if (!context.namingSimilarityBackfill.running && (!hasProgress || alreadyComplete)) {
    return {
      ok: true,
      canceled: false,
      alreadyStopped: true,
      status: context.getNamingSimilarityBackfillStatus(),
    };
  }

  const workerPid = Number(progress?.workerPid || context.namingSimilarityBackfill.childPid || 0) || null;
  const expectedIdentity = progress?.workerIdentity || context.namingSimilarityBackfill.childIdentity;
  const finishedAt = new Date().toISOString();
  let killed = false;
  let killError = null;

  if (workerPid && context.processRuntime.isProcessAlive(workerPid)) {
    const actualIdentity = context.processRuntime.readProcessIdentity(workerPid);
    if (!context.processRuntime.managedProcessIdentityMatches(actualIdentity, expectedIdentity)) {
      return {
        ok: false,
        canceled: false,
        workerPid,
        killed: false,
        killError: "Worker identity could not be verified; refusing to terminate the recorded PID.",
        status: context.getNamingSimilarityBackfillStatus(),
      };
    }
    const killResult = context.processRuntime.killProcessTree(workerPid);
    killed = Boolean(killResult?.killed);
    killError = toText(killResult?.error) || null;
  }

  writeJsonFileSync(context.namingSimilarityBackfill.progressFilePath, {
    ...(progress || {}),
    runId: toText(progress?.runId) || context.namingSimilarityBackfill.currentRunId || null,
    workerPid: workerPid || Number(progress?.workerPid || 0) || null,
    workerIdentity: expectedIdentity || null,
    updatedAt: finishedAt,
    finishedAt,
    running: false,
    status: "canceled",
    stage: "canceled",
    message: toText(reason) ? `Canceled: ${toText(reason)}` : "Canceled by admin.",
    cancelReason: toText(reason) || null,
    complete: true,
  });

  context.namingSimilarityBackfill.mode = "external";
  context.namingSimilarityBackfill.running = false;
  context.namingSimilarityBackfill.currentPromise = null;
  context.namingSimilarityBackfill.childProcess = null;
  context.namingSimilarityBackfill.childPid = null;
  context.namingSimilarityBackfill.childIdentity = null;
  context.namingSimilarityBackfill.currentReason = null;
  context.namingSimilarityBackfill.currentRunId = null;
  context.refreshNamingSimilarityBackfillExternalState();

  return {
    ok: true,
    canceled: true,
    workerPid,
    killed,
    killError,
    status: context.getNamingSimilarityBackfillStatus(),
  };
}

export {
  cancelNamingSimilarityBackfill,
  clearNamingSimilarityBackfillExternalArtifacts,
  launchExternalNamingSimilarityBackfill,
  readNamingSimilarityBackfillExternalProgress,
  recoverNamingSimilarityBackfillExternalState,
  refreshNamingSimilarityBackfillExternalState,
};
