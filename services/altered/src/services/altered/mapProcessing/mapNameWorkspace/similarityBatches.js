import { normalizeUniqueStrings, waitForEventLoopTurn } from "../../serviceSupport.js";
import { matchTargetMap } from "./similarityMatcher.js";
import { prepareTargetSignatures } from "./similaritySignatures.js";

async function processSimilarityBatches(run) {
  for (let batchStart = 0; batchStart < run.normalizedMaps.length; batchStart += run.targetBatchSize) {
    const batchMaps = run.normalizedMaps.slice(batchStart, batchStart + run.targetBatchSize);
    if (!batchMaps.length) continue;
    const batchEnd = batchStart + batchMaps.length;
    const targetSignatureByUid = await prepareTargetSignatures(run, batchMaps, batchStart, batchEnd);
    const existingSimilarityByUid = new Map(
      run.repository.naming
        .getMapNumberSimilarity({ mapUids: batchMaps.map((map) => map.mapUid) })
        .map((item) => [String(item.mapUid || "").toLowerCase(), item])
    );
    const batchCandidates = [];
    const batchSimilarityRecords = [];

    for (const map of batchMaps) {
      const mapUidKey = map.mapUid.toLowerCase();
      const match = matchTargetMap(
        run,
        map,
        targetSignatureByUid.get(mapUidKey) || null,
        existingSimilarityByUid.get(mapUidKey) || null
      );
      if (match.changed) run.changedCandidates += 1;
      if (match.resolved) run.resolved += 1;
      else run.unresolved += 1;
      if (match.refreshed) run.refreshedSimilarityRecords += 1;
      if (match.upgraded) run.upgradedLegacySimilarityRecords += 1;
      batchCandidates.push(match.candidate);
      batchSimilarityRecords.push(match.similarityRecord);
      run.pushRecentMap(match.recentMap);

      run.processed += 1;
      const shouldReportProgress =
        run.processed === 1 ||
        run.processed === run.normalizedMaps.length ||
        run.processed % run.progressUpdateInterval === 0;
      const shouldYieldToEventLoop =
        run.processed === run.normalizedMaps.length || run.processed % run.eventLoopYieldInterval === 0;
      if (shouldReportProgress) reportMapProgress(run, map);
      if (shouldYieldToEventLoop) await waitForEventLoopTurn();
    }

    const batchSimilarityUpsert = run.repository.naming.upsertMapNumberSimilarity({ records: batchSimilarityRecords });
    if (batchSimilarityUpsert?.error) {
      return buildPersistenceFailure(run, batchSimilarityUpsert.error, "similarity");
    }
    run.addNumericFields(run.similarityUpsert, batchSimilarityUpsert, ["processed", "inserted", "updated"]);

    if (run.persistCandidates) {
      const batchCandidateUpsert = run.repository.naming.upsertMapNameCandidates({ candidates: batchCandidates });
      if (batchCandidateUpsert?.error) {
        return buildPersistenceFailure(run, batchCandidateUpsert.error, "candidate");
      }
      run.addNumericFields(run.candidateUpsert, batchCandidateUpsert, ["processed", "inserted", "updated"]);

      const batchApprovals = run.applyAutoApprovalFromSimilarity({
        mapUids: batchMaps.map((map) => map.mapUid),
      });
      run.approvals.processed += Number(batchApprovals?.processed || 0);
      run.approvals.eligible += Number(batchApprovals?.eligible || 0);
      run.approvals.approved += Number(batchApprovals?.approved || 0);
      run.approvals.mapUids = normalizeUniqueStrings([
        ...(run.approvals.mapUids || []),
        ...(Array.isArray(batchApprovals?.mapUids) ? batchApprovals.mapUids : []),
      ]);
    }

    run.reportProgress({
      status: "running",
      stage: "persisting-candidates",
      message: `Persisted ${run.processed} of ${run.normalizedMaps.length} maps.`,
      percent:
        run.matchingProgressStart + Math.round((run.processed / run.normalizedMaps.length) * run.matchingProgressSpan),
      counters: run.getProgressCounters(),
      recentMaps: run.recentMaps.slice(),
      signatureSummary: run.signatureSummary,
      targetClubId: run.effectiveClubId,
      rescanAll: Boolean(run.rescanAll),
    });
  }

  return run.buildResult();
}

function reportMapProgress(run, map) {
  run.reportProgress({
    status: "running",
    stage: "matching",
    message: `Compared ${run.processed} of ${run.normalizedMaps.length} maps...`,
    percent:
      run.matchingProgressStart + Math.round((run.processed / run.normalizedMaps.length) * run.matchingProgressSpan),
    counters: run.getProgressCounters(),
    currentMapUid: map.mapUid,
    currentMapName: map.name || map.mapUid,
    recentMaps: run.recentMaps.slice(),
    signatureSummary: run.signatureSummary,
    targetClubId: run.effectiveClubId,
    rescanAll: Boolean(run.rescanAll),
  });
}

function buildPersistenceFailure(run, error, type) {
  return {
    ok: false,
    error,
    processed: run.processed,
    resolved: run.resolved,
    unresolved: run.unresolved,
    changedCandidates: run.changedCandidates,
    refreshedSimilarityRecords: run.refreshedSimilarityRecords,
    upgradedLegacySimilarityRecords: run.upgradedLegacySimilarityRecords,
    missingReferenceFamilies: run.missingReferenceFamilies,
    signatures: run.signatureSummary,
    similarityUpsert: type === "similarity" ? { ...run.similarityUpsert, error } : run.similarityUpsert,
    candidateUpsert: type === "candidate" ? { ...run.candidateUpsert, error } : run.candidateUpsert,
    approvals: run.approvals,
    recentMaps: run.recentMaps.slice(),
    targetClubId: run.effectiveClubId,
    rescanAll: Boolean(run.rescanAll),
  };
}

export { processSimilarityBatches };
