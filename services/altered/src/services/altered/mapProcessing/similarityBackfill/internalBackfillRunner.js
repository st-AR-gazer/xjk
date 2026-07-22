import { toText } from "../../serviceSupport.js";

function startNamingSimilarityBackfill(
  context,
  {
    q = "",
    limit = 120000,
    mapUids = [],
    clubId = null,
    sourceKey = "",
    campaignName = "",
    reviewState = "",
    force = false,
    rescanAll = false,
    persistCandidates = true,
    reason = "manual-admin",
  } = {}
) {
  context.refreshNamingSimilarityBackfillExternalState();
  if (context.namingSimilarityBackfill.running) {
    return {
      ok: true,
      started: false,
      alreadyRunning: true,
      runId: context.namingSimilarityBackfill.currentRunId || null,
      status: context.getNamingSimilarityBackfillStatus(),
    };
  }
  context.clearNamingSimilarityBackfillExternalArtifacts();

  const buildRunSummary = (result = {}) => ({
    selectedMaps: Number(result?.selectedMaps || result?.processed || 0),
    emptySelection: Boolean(result?.emptySelection),
    targetClubId: Number(result?.targetClubId || 0) || null,
    rescanAll: Boolean(result?.rescanAll),
    processed: Number(result?.processed || 0),
    resolved: Number(result?.resolved || 0),
    unresolved: Number(result?.unresolved || 0),
    changedCandidates: Number(result?.changedCandidates || 0),
    refreshedSimilarityRecords: Number(result?.refreshedSimilarityRecords || 0),
    upgradedLegacySimilarityRecords: Number(result?.upgradedLegacySimilarityRecords || 0),
    similarityRowsWritten: Number(result?.similarityUpsert?.processed || 0),
    similarityRowsInserted: Number(result?.similarityUpsert?.inserted || 0),
    similarityRowsUpdated: Number(result?.similarityUpsert?.updated || 0),
    candidateRowsWritten: Number(result?.candidateUpsert?.processed || 0),
    candidateRowsInserted: Number(result?.candidateUpsert?.inserted || 0),
    candidateRowsUpdated: Number(result?.candidateUpsert?.updated || 0),
    autoApprovalProcessed: Number(result?.approvals?.processed || 0),
    autoApprovalEligible: Number(result?.approvals?.eligible || 0),
    autoApproved: Number(result?.approvals?.approved || 0),
    missingReferenceFamilies: Array.isArray(result?.missingReferenceFamilies) ? result.missingReferenceFamilies : [],
    recentMaps: Array.isArray(result?.recentMaps) ? result.recentMaps : [],
    targetSignatures: result?.signatures?.targets || null,
    referenceSignatures: result?.signatures?.references || null,
  });
  const buildRunCounters = (result = {}) => ({
    total: Number(result?.processed || 0),
    processed: Number(result?.processed || 0),
    resolved: Number(result?.resolved || 0),
    unresolved: Number(result?.unresolved || 0),
    changedCandidates: Number(result?.changedCandidates || 0),
    refreshedSimilarityRecords: Number(result?.refreshedSimilarityRecords || 0),
    upgradedLegacySimilarityRecords: Number(result?.upgradedLegacySimilarityRecords || 0),
    similarityRowsWritten: Number(result?.similarityUpsert?.processed || 0),
    candidateRowsWritten: Number(result?.candidateUpsert?.processed || 0),
    autoApproved: Number(result?.approvals?.approved || 0),
  });

  const runId = `naming-similarity-${Date.now()}-${context.namingSimilarityBackfill.runCounter + 1}`;
  const startedAt = new Date().toISOString();
  context.namingSimilarityBackfill.runCounter += 1;
  context.updateNamingSimilarityBackfillProgress({
    status: "running",
    stage: "preparing",
    message: "Preparing similarity backfill...",
    percent: 0,
    replaceCounters: true,
    counters: {
      total: 0,
      processed: 0,
      resolved: 0,
      unresolved: 0,
      changedCandidates: 0,
    },
  });

  const targetSelection = context.buildNamingSimilarityBackfillTargets({
    q,
    limit,
    mapUids,
    clubId,
    sourceKey,
    campaignName,
    reviewState,
    rescanAll,
  });
  const selectedMapUids = targetSelection.maps.map((map) => map.mapUid);
  if (!selectedMapUids.length) {
    context.namingSimilarityBackfill.mode = "internal";
    context.namingSimilarityBackfill.running = false;
    context.namingSimilarityBackfill.currentRunId = null;
    context.namingSimilarityBackfill.currentReason = null;
    context.namingSimilarityBackfill.lastStartedAt = startedAt;
    context.namingSimilarityBackfill.lastFinishedAt = startedAt;
    context.namingSimilarityBackfill.lastDurationMs = 0;
    context.namingSimilarityBackfill.lastError = null;
    context.namingSimilarityBackfill.lastSummary = {
      selectedMaps: 0,
      emptySelection: true,
      targetClubId: Number(targetSelection.targetClubId || 0) || null,
      rescanAll: Boolean(rescanAll),
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
      autoApprovalProcessed: 0,
      autoApprovalEligible: 0,
      autoApproved: 0,
      missingReferenceFamilies: [],
      recentMaps: [],
      targetSignatures: null,
      referenceSignatures: null,
    };
    context.updateNamingSimilarityBackfillProgress({
      status: "ok",
      stage: "complete",
      message: "No maps matched the current filter.",
      percent: 0,
      replaceCounters: true,
      counters: {
        total: 0,
        processed: 0,
        resolved: 0,
        unresolved: 0,
        changedCandidates: 0,
      },
      emptySelection: true,
    });
    return {
      ok: true,
      started: false,
      emptySelection: true,
      status: context.getNamingSimilarityBackfillStatus(),
    };
  }

  if (
    context.shouldUseExternalNamingSimilarityBackfill({
      q,
      mapUids,
      rescanAll,
      selectedCount: selectedMapUids.length,
    })
  ) {
    context.launchExternalNamingSimilarityBackfill({
      runId,
      reason,
      mapUids: selectedMapUids,
      clubId: targetSelection.targetClubId,
      rescanAll,
      force,
      persistCandidates,
    });
    return {
      ok: true,
      started: true,
      runId,
      status: context.getNamingSimilarityBackfillStatus(),
    };
  }

  context.namingSimilarityBackfill.mode = "internal";
  context.namingSimilarityBackfill.running = true;
  context.namingSimilarityBackfill.currentRunId = runId;
  context.namingSimilarityBackfill.currentReason = toText(reason) || "manual-admin";
  context.namingSimilarityBackfill.lastStartedAt = startedAt;
  context.namingSimilarityBackfill.lastFinishedAt = null;
  context.namingSimilarityBackfill.lastDurationMs = null;
  context.namingSimilarityBackfill.lastError = null;
  context.namingSimilarityBackfill.lastSummary = null;

  const runPromise = (async () => {
    try {
      const result = await context.getMapNameWorkspaceService().assignStoredMapNumbersBySimilarity({
        q,
        limit,
        mapUids,
        clubId,
        campaignName,
        force,
        rescanAll,
        persistCandidates,
        onProgress: (partial) => {
          context.updateNamingSimilarityBackfillProgress(partial);
        },
      });

      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
      context.namingSimilarityBackfill.lastFinishedAt = finishedAt;
      context.namingSimilarityBackfill.lastDurationMs = durationMs;

      if (result?.error || result?.ok === false) {
        const message =
          result?.error ||
          result?.candidateUpsert?.error ||
          result?.similarityUpsert?.error ||
          "Similarity backfill failed.";
        const runSummary = buildRunSummary(result);
        context.namingSimilarityBackfill.lastError = message;
        if (
          runSummary.processed > 0 ||
          runSummary.similarityRowsWritten > 0 ||
          runSummary.candidateRowsWritten > 0 ||
          runSummary.autoApprovalProcessed > 0 ||
          runSummary.recentMaps.length
        ) {
          context.namingSimilarityBackfill.lastSummary = runSummary;
        }
        context.updateNamingSimilarityBackfillProgress({
          status: "error",
          stage: "failed",
          message,
          percent: 100,
          replaceCounters: true,
          counters: buildRunCounters(result),
          recentMaps: runSummary.recentMaps,
          signatureSummary: {
            targets: runSummary.targetSignatures,
            references: runSummary.referenceSignatures,
          },
        });
        return;
      }

      const runSummary = buildRunSummary(result);
      context.namingSimilarityBackfill.lastSummary = runSummary;
      context.updateNamingSimilarityBackfillProgress({
        status: "ok",
        stage: "complete",
        message:
          Number(result?.processed || 0) > 0
            ? `Similarity backfill complete. ${Number(result?.resolved || 0)} resolved, ${Number(result?.refreshedSimilarityRecords || 0)} refreshed, ${Number(result?.upgradedLegacySimilarityRecords || 0)} upgraded.`
            : "Similarity backfill complete. No maps required updates.",
        percent: 100,
        replaceCounters: true,
        counters: buildRunCounters(result),
        recentMaps: runSummary.recentMaps,
        signatureSummary: {
          targets: runSummary.targetSignatures,
          references: runSummary.referenceSignatures,
        },
      });
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
      const message = error?.message || "Similarity backfill failed.";
      context.namingSimilarityBackfill.lastError = message;
      context.namingSimilarityBackfill.lastFinishedAt = finishedAt;
      context.namingSimilarityBackfill.lastDurationMs = durationMs;
      context.updateNamingSimilarityBackfillProgress({
        status: "error",
        stage: "failed",
        message,
        percent: 100,
      });
      context.logger.warn(`[altered-similarity-backfill] ${message}`);
    } finally {
      context.namingSimilarityBackfill.running = false;
      context.namingSimilarityBackfill.currentRunId = null;
      context.namingSimilarityBackfill.currentReason = null;
      context.namingSimilarityBackfill.currentPromise = null;
    }
  })();

  context.namingSimilarityBackfill.currentPromise = runPromise;
  return {
    ok: true,
    started: true,
    runId,
    status: context.getNamingSimilarityBackfillStatus(),
  };
}

export { startNamingSimilarityBackfill };
