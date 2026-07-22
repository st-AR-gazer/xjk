import {
  NAMING_SIMILARITY_MAP_UIDS_FILE_NAME,
  NAMING_SIMILARITY_PROGRESS_FILE_NAME,
  clampInt,
  path,
} from "../../serviceSupport.js";

function createNamingSimilarityBackfillState(dataDir) {
  return {
    running: false,
    runCounter: 0,
    mode: "internal",
    currentRunId: null,
    currentReason: null,
    currentPromise: null,
    currentProgress: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastDurationMs: null,
    lastError: null,
    lastSummary: null,
    childProcess: null,
    childPid: null,
    childIdentity: null,
    targetClubId: null,
    rescanAll: false,
    progressFilePath: path.join(dataDir, "tmp", NAMING_SIMILARITY_PROGRESS_FILE_NAME),
    mapUidsFilePath: path.join(dataDir, "tmp", NAMING_SIMILARITY_MAP_UIDS_FILE_NAME),
  };
}

function numberOrZero(value) {
  return Number(value || 0);
}

function signatureMetric(summary, totals, key, totalKey) {
  return numberOrZero(summary?.[key] !== undefined ? summary[key] : totals?.[totalKey]);
}

function buildSignatureStatus({ counters, signatureSummary, totals, kind, totalFallback = 0 }) {
  const prefix = kind === "targets" ? "target" : "reference";
  return {
    total: numberOrZero(counters?.[`${prefix}SignaturesTotal`] || totalFallback),
    ready: numberOrZero(counters?.[`${prefix}SignaturesReady`] || totalFallback),
    reused: signatureMetric(signatureSummary?.[kind], totals, "reused", `${prefix}Reused`),
    parsed: signatureMetric(signatureSummary?.[kind], totals, "parsed", `${prefix}Parsed`),
    errors: signatureMetric(signatureSummary?.[kind], totals, "errors", `${prefix}Errors`),
    missingDownload: signatureMetric(signatureSummary?.[kind], totals, "missingDownload", `${prefix}MissingDownload`),
  };
}

function buildNamingSimilaritySummaryFromExternalProgress(_context, progress = null) {
  const totals = progress?.totals || {};
  const counters = progress?.counters || {};
  const signatureSummary = progress?.signatureSummary || {};
  const selectedMaps = numberOrZero(progress?.selectedMaps);
  const processed = numberOrZero(totals.processed);
  return {
    selectedMaps,
    emptySelection: selectedMaps <= 0 && processed <= 0,
    targetClubId: numberOrZero(progress?.targetClubId) || null,
    rescanAll: Boolean(progress?.rescanAll),
    processed,
    resolved: numberOrZero(totals.resolved),
    unresolved: numberOrZero(totals.unresolved),
    changedCandidates: numberOrZero(totals.changedCandidates),
    refreshedSimilarityRecords: numberOrZero(totals.refreshedSimilarityRecords),
    upgradedLegacySimilarityRecords: numberOrZero(totals.upgradedLegacySimilarityRecords),
    similarityRowsWritten: numberOrZero(totals.similarityRowsWritten),
    similarityRowsInserted: numberOrZero(totals.similarityRowsInserted),
    similarityRowsUpdated: numberOrZero(totals.similarityRowsUpdated),
    candidateRowsWritten: numberOrZero(totals.candidateRowsWritten),
    candidateRowsInserted: numberOrZero(totals.candidateRowsInserted),
    candidateRowsUpdated: numberOrZero(totals.candidateRowsUpdated),
    autoApprovalProcessed: processed,
    autoApprovalEligible: processed,
    autoApproved: numberOrZero(totals.autoApproved),
    missingReferenceFamilies: [],
    recentMaps: Array.isArray(progress?.recentMaps) ? progress.recentMaps : [],
    targetSignatures: buildSignatureStatus({
      counters,
      signatureSummary,
      totals,
      kind: "targets",
      totalFallback: processed,
    }),
    referenceSignatures: buildSignatureStatus({ counters, signatureSummary, totals, kind: "references" }),
  };
}

function getNamingSimilarityBackfillStatus(context) {
  context.refreshNamingSimilarityBackfillExternalState();
  return {
    running: Boolean(context.namingSimilarityBackfill.running),
    runCounter: Number(context.namingSimilarityBackfill.runCounter || 0),
    currentRunId: context.namingSimilarityBackfill.currentRunId || null,
    currentReason: context.namingSimilarityBackfill.currentReason || null,
    progress: context.namingSimilarityBackfill.currentProgress || null,
    lastStartedAt: context.namingSimilarityBackfill.lastStartedAt,
    lastFinishedAt: context.namingSimilarityBackfill.lastFinishedAt,
    lastDurationMs: context.namingSimilarityBackfill.lastDurationMs,
    lastError: context.namingSimilarityBackfill.lastError,
    lastSummary: context.namingSimilarityBackfill.lastSummary,
  };
}

function updateNamingSimilarityBackfillProgress(context, partial = {}) {
  const previous = context.namingSimilarityBackfill.currentProgress || {};
  const nextCounters =
    partial.replaceCounters === true
      ? { ...(partial.counters || {}) }
      : { ...(previous.counters || {}), ...(partial.counters || {}) };
  context.namingSimilarityBackfill.currentProgress = {
    ...previous,
    ...partial,
    counters: nextCounters,
    updatedAt: new Date().toISOString(),
  };
  delete context.namingSimilarityBackfill.currentProgress.replaceCounters;
  if (
    context.namingSimilarityBackfill.currentProgress.percent !== undefined &&
    context.namingSimilarityBackfill.currentProgress.percent !== null
  ) {
    context.namingSimilarityBackfill.currentProgress.percent = clampInt(
      context.namingSimilarityBackfill.currentProgress.percent,
      {
        min: 0,
        max: 100,
        fallback: 0,
      }
    );
  }
  return context.namingSimilarityBackfill.currentProgress;
}

export {
  buildNamingSimilaritySummaryFromExternalProgress,
  createNamingSimilarityBackfillState,
  getNamingSimilarityBackfillStatus,
  updateNamingSimilarityBackfillProgress,
};
