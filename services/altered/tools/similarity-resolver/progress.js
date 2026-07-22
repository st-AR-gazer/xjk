import { clampInt } from "../../../shared/valueUtils.js";
import { writeJsonFile } from "../../../shared/fsUtils.js";

function createProgressTracker(context, { now = Date.now, writeJson = writeJsonFile } = {}) {
  let queuedWrite = Promise.resolve();

  function buildPayload({
    completedBatches = 0,
    partial = null,
    status = "running",
    complete = false,
    error = null,
    finalSummary = null,
  } = {}) {
    const counters = partial?.counters || {};
    const { totals } = context;
    const effectiveProcessed = Number(totals.processed || 0) + Number(counters.processed || 0);
    const effectiveResolved = Number(totals.resolved || 0) + Number(counters.resolved || 0);
    const effectiveUnresolved = Number(totals.unresolved || 0) + Number(counters.unresolved || 0);
    const effectiveChanged = Number(totals.changedCandidates || 0) + Number(counters.changedCandidates || 0);
    const effectiveRefreshed =
      Number(totals.refreshedSimilarityRecords || 0) + Number(counters.refreshedSimilarityRecords || 0);
    const effectiveUpgraded =
      Number(totals.upgradedLegacySimilarityRecords || 0) + Number(counters.upgradedLegacySimilarityRecords || 0);
    const effectiveSimilarityRows =
      Number(totals.similarityRowsWritten || 0) + Number(counters.similarityRowsWritten || 0);
    const effectiveCandidateRows =
      Number(totals.candidateRowsWritten || 0) + Number(counters.candidateRowsWritten || 0);
    const effectiveAutoApproved = Number(totals.autoApproved || 0) + Number(counters.autoApproved || 0);
    const targetSignaturesReady = Number(
      counters.targetSignaturesReady !== undefined ? counters.targetSignaturesReady : totals.processed
    );
    const targetSignaturesTotal = Number(
      counters.targetSignaturesTotal !== undefined ? counters.targetSignaturesTotal : context.selectedMapsTotal
    );
    const referenceSignaturesReady = Number(counters.referenceSignaturesReady || 0);
    const referenceSignaturesTotal = Number(counters.referenceSignaturesTotal || 0);
    const batchesDone = clampInt(context.startBatchIndex + completedBatches, {
      min: 0,
      max: context.totalBatches,
      fallback: context.startBatchIndex,
    });
    const currentBatchIndex = Math.min(context.totalBatches, batchesDone + 1);
    const currentBatchSize =
      currentBatchIndex <= context.totalBatches
        ? Math.min(
            context.batchSize,
            Math.max(0, context.selectedMapsTotal - (currentBatchIndex - 1) * context.batchSize)
          )
        : 0;
    const currentBatchStart =
      currentBatchSize > 0 ? Math.max(1, (currentBatchIndex - 1) * context.batchSize + 1) : null;
    const currentBatchEnd =
      currentBatchSize > 0 && currentBatchStart
        ? Math.min(context.selectedMapsTotal, currentBatchStart + currentBatchSize - 1)
        : null;
    const percent =
      partial?.percent !== undefined && partial?.percent !== null
        ? Number(partial.percent)
        : context.selectedMapsTotal > 0
          ? clampInt(Math.round((effectiveProcessed / context.selectedMapsTotal) * 100), {
              min: 0,
              max: 100,
              fallback: 0,
            })
          : 0;
    const stage = String(partial?.stage || "").trim();
    const message =
      stage === "signatures-targets" && currentBatchStart && currentBatchEnd
        ? `Ensuring content signatures for target maps ${currentBatchStart}-${currentBatchEnd} of ${context.selectedMapsTotal}...`
        : stage === "matching" && context.selectedMapsTotal > 0
          ? `Compared ${effectiveProcessed} of ${context.selectedMapsTotal} maps...`
          : String(partial?.message || "").trim() || null;

    return {
      runId: context.runId,
      workerPid: context.workerPid,
      workerIdentity: context.workerIdentity,
      reason: context.reason,
      startedAt: context.startedAtIso,
      updatedAt: new Date(now()).toISOString(),
      dbFile: context.dbFile,
      dataDir: context.dataDir,
      logFile: context.logFile || null,
      totalMaps: context.totalMaps,
      startOffset: context.startOffset,
      nextOffset: effectiveProcessed,
      batchSize: context.batchSize,
      batchesCompleted: batchesDone,
      batchesTotal: context.totalBatches,
      selectedMaps: context.selectedMapsTotal,
      targetClubId: context.targetClubId,
      rescanAll: context.rescanAll,
      persistCandidates: context.persistCandidates,
      force: context.force,
      totals: {
        ...totals,
        processed: effectiveProcessed,
        resolved: effectiveResolved,
        unresolved: effectiveUnresolved,
        changedCandidates: effectiveChanged,
        refreshedSimilarityRecords: effectiveRefreshed,
        upgradedLegacySimilarityRecords: effectiveUpgraded,
        similarityRowsWritten: effectiveSimilarityRows,
        candidateRowsWritten: effectiveCandidateRows,
        autoApproved: effectiveAutoApproved,
      },
      counters: {
        ...counters,
        total: context.selectedMapsTotal,
        processed: effectiveProcessed,
        resolved: effectiveResolved,
        unresolved: effectiveUnresolved,
        changedCandidates: effectiveChanged,
        refreshedSimilarityRecords: effectiveRefreshed,
        upgradedLegacySimilarityRecords: effectiveUpgraded,
        similarityRowsWritten: effectiveSimilarityRows,
        candidateRowsWritten: effectiveCandidateRows,
        autoApproved: effectiveAutoApproved,
        targetSignaturesReady,
        targetSignaturesTotal,
        referenceSignaturesReady,
        referenceSignaturesTotal,
      },
      stage: stage || null,
      percent,
      message,
      currentMapUid: String(partial?.currentMapUid || "").trim() || null,
      currentMapName: String(partial?.currentMapName || "").trim() || null,
      recentMaps: Array.isArray(partial?.recentMaps) ? partial.recentMaps : [],
      signatureSummary:
        partial?.signatureSummary && typeof partial.signatureSummary === "object" ? partial.signatureSummary : null,
      currentBatch: {
        index: currentBatchIndex,
        total: context.totalBatches,
        size: currentBatchSize,
        processed: effectiveProcessed,
        message,
        percent,
        stage: stage || null,
        updatedAt: partial?.updatedAt || null,
      },
      running: !complete && status === "running",
      status,
      error: error || null,
      elapsedSeconds: Math.round((now() - context.startedMs) / 1000),
      finalSummary: finalSummary || undefined,
      complete,
    };
  }

  function queueWrite(payload) {
    queuedWrite = queuedWrite.catch(() => {}).then(() => writeJson(context.progressFile, payload));
    return queuedWrite;
  }

  return { buildPayload, queueWrite };
}

export { createProgressTracker };
