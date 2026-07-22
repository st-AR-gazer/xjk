import {
  EXTERNAL_NAMING_SIMILARITY_RUNNING_GRACE_MS,
  clampInt,
  isRecentIsoWithin,
  toText,
  writeJsonFileSync,
} from "../../serviceSupport.js";

function recoverExternalMode(context) {
  if (context.namingSimilarityBackfill.mode === "external") return true;
  if (context.recoverNamingSimilarityBackfillExternalState()) return true;

  const state = context.namingSimilarityBackfill;
  if (state.running && !state.currentPromise) {
    state.running = false;
    state.currentRunId = null;
    state.currentReason = null;
  }
  return false;
}

function inspectExternalWorker(context, progress) {
  const state = context.namingSimilarityBackfill;
  const workerPid = Number(progress?.workerPid || state.childPid || 0) || null;
  if (workerPid) state.childPid = workerPid;
  if (progress?.workerIdentity) state.childIdentity = progress.workerIdentity;

  const expectedIdentity = progress?.workerIdentity || state.childIdentity;
  const actualIdentity = workerPid ? context.processRuntime.readProcessIdentity(workerPid) : null;
  const identityMatches = context.processRuntime.managedProcessIdentityMatches(actualIdentity, expectedIdentity);
  const processAlive = Boolean(workerPid && context.processRuntime.isProcessAlive(workerPid));
  const childAlive = processAlive && identityMatches;
  const progressHasWorkerPid = Number(progress?.workerPid || 0) > 0;
  const progressClaimsRunning =
    Boolean(progress) &&
    !Boolean(progress?.complete) &&
    (Boolean(progress?.running) || toText(progress?.status).toLowerCase() === "running");
  const progressRecentlyUpdated = isRecentIsoWithin(
    progress?.updatedAt || progress?.startedAt,
    EXTERNAL_NAMING_SIMILARITY_RUNNING_GRACE_MS
  );
  const shouldRun =
    Boolean(progress) &&
    !Boolean(progress?.complete) &&
    (childAlive || (!progressHasWorkerPid && progressClaimsRunning && progressRecentlyUpdated));

  return {
    childAlive,
    identityMatches,
    processAlive,
    shouldRun,
    workerPid,
  };
}

function staleWorkerMessage(worker) {
  if (worker.workerPid && worker.processAlive && !worker.identityMatches) {
    return "Similarity resolver worker identity no longer matches the recorded process.";
  }
  if (worker.childAlive) {
    return "Similarity resolver worker progress became invalid before completion.";
  }
  return "Similarity resolver worker stopped before reporting completion.";
}

function completeStaleWorkerProgress(context, progress, worker) {
  const finishedAt = new Date().toISOString();
  writeJsonFileSync(context.namingSimilarityBackfill.progressFilePath, {
    ...progress,
    updatedAt: finishedAt,
    finishedAt,
    running: false,
    status: "error",
    complete: true,
    error: toText(progress?.error) || staleWorkerMessage(worker),
  });
}

function finishRunWithoutProgress(context) {
  const state = context.namingSimilarityBackfill;
  const finishedAt = new Date().toISOString();
  state.running = false;
  state.lastFinishedAt = finishedAt;
  state.lastDurationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(state.lastStartedAt || finishedAt));
  state.lastError = state.lastError || "Similarity resolver worker stopped before reporting progress.";
  state.currentReason = null;
  state.currentRunId = null;
  state.childProcess = null;
  state.childPid = null;
}

function externalCounter(progress, totals, key) {
  return Number(progress?.counters?.[key] !== undefined ? progress.counters[key] : totals?.[key] || 0);
}

function deriveBatchWindow(progress, selectedMaps) {
  const currentBatch =
    progress?.currentBatch && typeof progress.currentBatch === "object" ? progress.currentBatch : null;
  const index = clampInt(currentBatch?.index, {
    min: 1,
    max: Math.max(1, Number(progress?.batchesTotal || 1)),
    fallback: 1,
  });
  const size = clampInt(currentBatch?.size, {
    min: 0,
    max: selectedMaps || Number(currentBatch?.size || 0) || 0,
    fallback: 0,
  });
  const start = size ? Math.max(1, (index - 1) * Number(progress?.batchSize || size) + 1) : null;
  const end = size && start ? Math.min(selectedMaps || start + size - 1, start + size - 1) : null;
  return { end, start };
}

function deriveProgressPercent(progress, processed, selectedMaps) {
  if (progress?.complete) return 100;
  if (progress?.percent !== undefined && progress?.percent !== null) {
    return clampInt(progress.percent, { min: 0, max: 100, fallback: 0 });
  }
  if (selectedMaps <= 0) return 0;
  return clampInt(Math.round((processed / selectedMaps) * 100), {
    min: 0,
    max: 100,
    fallback: 0,
  });
}

function deriveProgressStage(progress) {
  return (
    toText(progress?.stage) ||
    (progress.status === "error" ? "failed" : progress.complete ? "complete" : "external-worker")
  );
}

function deriveProgressMessage(progress, { batchWindow, processed, selectedMaps, totals }) {
  const explicitError = toText(progress?.error);
  if (explicitError) return explicitError;
  const stage = toText(progress?.stage);
  if (stage === "signatures-targets" && batchWindow.start && batchWindow.end) {
    return `Ensuring content signatures for target maps ${batchWindow.start}-${batchWindow.end} of ${selectedMaps}...`;
  }
  if (stage === "matching" && selectedMaps > 0) {
    return `Compared ${processed} of ${selectedMaps} maps...`;
  }
  const explicitMessage = toText(progress?.message);
  if (explicitMessage) return explicitMessage;
  if (progress.complete) {
    return `Similarity backfill complete. ${processed} processed, ${Number(totals?.resolved || 0)} resolved, ${Number(
      totals?.refreshedSimilarityRecords || 0
    )} refreshed.`;
  }
  if (progress?.currentBatch) {
    return `Background similarity worker batch ${Number(progress.currentBatch.index || 0)}/${Number(
      progress.currentBatch.total || 0
    )} running...`;
  }
  return "Background similarity backfill running...";
}

function buildExternalProgressView(progress) {
  const totals = progress?.totals || {};
  const processed = Number(totals?.processed || 0);
  const selectedMaps = Number(progress?.selectedMaps || 0);
  const batchWindow = deriveBatchWindow(progress, selectedMaps);
  return {
    status: progress.status === "error" ? "error" : progress.complete ? "ok" : "running",
    stage: deriveProgressStage(progress),
    message: deriveProgressMessage(progress, { batchWindow, processed, selectedMaps, totals }),
    percent: deriveProgressPercent(progress, processed, selectedMaps),
    updatedAt: progress.updatedAt || new Date().toISOString(),
    counters: {
      ...(progress?.counters && typeof progress.counters === "object" ? progress.counters : {}),
      total: selectedMaps,
      processed,
      resolved: externalCounter(progress, totals, "resolved"),
      unresolved: externalCounter(progress, totals, "unresolved"),
      changedCandidates: externalCounter(progress, totals, "changedCandidates"),
      refreshedSimilarityRecords: externalCounter(progress, totals, "refreshedSimilarityRecords"),
      upgradedLegacySimilarityRecords: externalCounter(progress, totals, "upgradedLegacySimilarityRecords"),
      similarityRowsWritten: externalCounter(progress, totals, "similarityRowsWritten"),
      candidateRowsWritten: externalCounter(progress, totals, "candidateRowsWritten"),
      autoApproved: externalCounter(progress, totals, "autoApproved"),
    },
    currentBatch: progress.currentBatch || null,
    elapsedSeconds: Number(progress.elapsedSeconds || 0),
    targetClubId: Number(progress.targetClubId || 0) || null,
    rescanAll: Boolean(progress.rescanAll),
    currentMapUid: toText(progress?.currentMapUid) || null,
    currentMapName: toText(progress?.currentMapName) || "",
    recentMaps: Array.isArray(progress?.recentMaps) ? progress.recentMaps : [],
    logFile: toText(progress?.logFile) || null,
    signatureSummary:
      progress?.signatureSummary && typeof progress.signatureSummary === "object" ? progress.signatureSummary : null,
  };
}

function applyExternalProgress(context, progress) {
  const state = context.namingSimilarityBackfill;
  state.lastStartedAt = progress.startedAt || state.lastStartedAt;
  state.targetClubId = Number(progress.targetClubId || 0) || state.targetClubId || null;
  state.rescanAll = progress.rescanAll === undefined ? Boolean(state.rescanAll) : Boolean(progress.rescanAll);
  state.currentProgress = buildExternalProgressView(progress);
}

function applyCompletedExternalRun(context, progress, worker) {
  const state = context.namingSimilarityBackfill;
  state.lastFinishedAt = progress?.finishedAt || state.lastFinishedAt || new Date().toISOString();
  const elapsedSeconds = Number(progress?.elapsedSeconds || 0);
  state.lastDurationMs = elapsedSeconds > 0 ? elapsedSeconds * 1000 : state.lastDurationMs;
  state.lastError = toText(progress?.error) || null;
  state.lastSummary = progress ? context.buildNamingSimilaritySummaryFromExternalProgress(progress) : state.lastSummary;
  state.currentReason = null;
  state.currentPromise = null;
  state.childPid = worker.childAlive ? state.childPid : null;
  state.childProcess = worker.childAlive ? state.childProcess : null;
  if (!worker.childAlive) state.currentRunId = null;
}

function refreshNamingSimilarityBackfillExternalState(context) {
  if (!recoverExternalMode(context)) return null;

  const progress = context.readNamingSimilarityBackfillExternalProgress();
  const worker = inspectExternalWorker(context, progress);
  if (progress && !progress.complete && !worker.shouldRun) {
    completeStaleWorkerProgress(context, progress, worker);
    return context.refreshNamingSimilarityBackfillExternalState();
  }
  if (!progress && !worker.childAlive && context.namingSimilarityBackfill.currentRunId) {
    finishRunWithoutProgress(context);
    return null;
  }
  if (progress) applyExternalProgress(context, progress);

  context.namingSimilarityBackfill.running = worker.shouldRun;
  if (progress?.complete || (!worker.shouldRun && context.namingSimilarityBackfill.currentRunId)) {
    applyCompletedExternalRun(context, progress, worker);
  }
  return progress;
}

export { buildExternalProgressView, inspectExternalWorker, refreshNamingSimilarityBackfillExternalState };
