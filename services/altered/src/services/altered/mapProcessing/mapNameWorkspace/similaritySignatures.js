import { buildContentSimilarityReferenceContext, toText } from "../../serviceSupport.js";

async function prepareReferenceSignatures(run) {
  const referenceSignatures = await run.withProgressHeartbeat(
    () => ({
      status: "running",
      stage: "signatures-references",
      message: `Ensuring content signatures for ${run.globalReferenceMaps.length} reference maps...`,
      counters: run.getProgressCounters(),
      currentMapUid: run.referenceSignatureProgress.currentMapUid || null,
      currentMapName: run.referenceSignatureProgress.currentMapName || "",
      recentMaps: run.recentMaps.slice(),
      signatureSummary: run.signatureSummary,
      targetClubId: run.effectiveClubId,
      rescanAll: Boolean(run.rescanAll),
    }),
    () =>
      run.getMapLocalFileService().ensureMapContentSignatures(run.globalReferenceMaps, {
        force: run.force,
        onProgress: (partial) => {
          run.referenceSignatureProgress.total = Number(partial?.total || run.referenceSignatureProgress.total || 0);
          run.referenceSignatureProgress.ready = Number(partial?.ready || 0);
          run.referenceSignatureProgress.currentMapUid = toText(partial?.currentMapUid) || null;
          run.referenceSignatureProgress.currentMapName = toText(partial?.currentMapName) || "";
        },
      })
  );
  run.signatureSummary.references = {
    ...(referenceSignatures.summary || {}),
    localFiles: referenceSignatures.localFiles || null,
  };

  const referenceSignatureByUid = new Map(
    (Array.isArray(referenceSignatures.records) ? referenceSignatures.records : [])
      .filter((record) => record?.mapUid)
      .map((record) => [String(record.mapUid).toLowerCase(), record])
  );
  const referenceEntries = run.globalReferenceMaps
    .map((entry) => ({
      ...entry,
      signature: referenceSignatureByUid.get(entry.mapUid.toLowerCase())?.signature || null,
    }))
    .filter((entry) => entry.signature);
  const referenceContext = buildContentSimilarityReferenceContext(referenceEntries);
  const familyReferenceEntriesByKey = new Map();
  for (const entry of referenceEntries) {
    const familyKey = toText(entry?.referenceFamilyKey);
    if (!familyKey) continue;
    if (!familyReferenceEntriesByKey.has(familyKey)) familyReferenceEntriesByKey.set(familyKey, []);
    familyReferenceEntriesByKey.get(familyKey).push(entry);
  }
  const familyReferenceContextByKey = new Map(
    [...familyReferenceEntriesByKey.entries()].map(([familyKey, entries]) => [
      familyKey,
      buildContentSimilarityReferenceContext(entries),
    ])
  );
  return { referenceContext, familyReferenceContextByKey };
}

async function prepareTargetSignatures(run, batchMaps, batchStart, batchEnd) {
  run.reportProgress({
    status: "running",
    stage: "signatures-targets",
    message: `Ensuring content signatures for target maps ${batchStart + 1}-${batchEnd} of ${run.normalizedMaps.length}...`,
    percent:
      run.matchingProgressStart > 12
        ? 12 + Math.round((run.processed / run.normalizedMaps.length) * (run.matchingProgressStart - 12))
        : 12,
    counters: run.getProgressCounters(),
    currentMapUid: run.targetSignatureProgress.currentMapUid || null,
    currentMapName: run.targetSignatureProgress.currentMapName || "",
    signatureSummary: run.signatureSummary,
    targetClubId: run.effectiveClubId,
    rescanAll: Boolean(run.rescanAll),
  });

  const batchTargetSignatures = await run.withProgressHeartbeat(
    () => ({
      status: "running",
      stage: "signatures-targets",
      message: `Ensuring content signatures for target maps ${batchStart + 1}-${batchEnd} of ${run.normalizedMaps.length}...`,
      counters: run.getProgressCounters(),
      currentMapUid: run.targetSignatureProgress.currentMapUid || null,
      currentMapName: run.targetSignatureProgress.currentMapName || "",
      recentMaps: run.recentMaps.slice(),
      signatureSummary: run.signatureSummary,
      targetClubId: run.effectiveClubId,
      rescanAll: Boolean(run.rescanAll),
    }),
    () =>
      run.getMapLocalFileService().ensureMapContentSignatures(batchMaps, {
        force: run.force,
        onProgress: (partial) => {
          run.targetSignatureProgress.total = run.normalizedMaps.length;
          run.targetSignatureProgress.ready = Math.max(
            Number(run.targetSignatureProgress.ready || 0),
            batchStart + Number(partial?.ready || 0)
          );
          run.targetSignatureProgress.currentMapUid = toText(partial?.currentMapUid) || null;
          run.targetSignatureProgress.currentMapName = toText(partial?.currentMapName) || "";
        },
      })
  );

  run.addNumericFields(run.targetSignatureTotals, batchTargetSignatures.summary, [
    "total",
    "reused",
    "parsed",
    "errors",
    "missingDownload",
  ]);
  run.addNumericFields(run.targetSignatureTotals.localFiles, batchTargetSignatures.localFiles, [
    "total",
    "reused",
    "downloaded",
    "missing",
    "errors",
  ]);

  return new Map(
    (Array.isArray(batchTargetSignatures.records) ? batchTargetSignatures.records : [])
      .filter((record) => record?.mapUid)
      .map((record) => [String(record.mapUid).toLowerCase(), record])
  );
}

export { prepareReferenceSignatures, prepareTargetSignatures };
