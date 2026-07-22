const EMPTY_TOTALS = Object.freeze({
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
});

function parseArgs(argv = []) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const raw = String(argv[index] || "").trim();
    if (!raw.startsWith("--")) continue;
    const key = raw.slice(2);
    const next = String(argv[index + 1] || "").trim();
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      index += 1;
    } else {
      args.set(key, "1");
    }
  }
  return args;
}

function normalizeMapUidList(values = []) {
  const seen = new Set();
  const mapUids = [];
  for (const value of Array.isArray(values) ? values : []) {
    const mapUid = String(value || "").trim();
    const key = mapUid.toLowerCase();
    if (!mapUid || seen.has(key)) continue;
    seen.add(key);
    mapUids.push(mapUid);
  }
  return mapUids;
}

function buildTotals(seed = null) {
  const totals = { ...EMPTY_TOTALS };
  if (!seed || typeof seed !== "object") return totals;
  for (const key of Object.keys(totals)) totals[key] = Number(seed[key] || 0);
  return totals;
}

function accumulateBatchTotals(totals, result = {}) {
  totals.processed += Number(result.processed || 0);
  totals.resolved += Number(result.resolved || 0);
  totals.unresolved += Number(result.unresolved || 0);
  totals.changedCandidates += Number(result.changedCandidates || 0);
  totals.refreshedSimilarityRecords += Number(result.refreshedSimilarityRecords || 0);
  totals.upgradedLegacySimilarityRecords += Number(result.upgradedLegacySimilarityRecords || 0);
  totals.similarityRowsWritten += Number(result.similarityUpsert?.processed || 0);
  totals.similarityRowsInserted += Number(result.similarityUpsert?.inserted || 0);
  totals.similarityRowsUpdated += Number(result.similarityUpsert?.updated || 0);
  totals.candidateRowsWritten += Number(result.candidateUpsert?.processed || 0);
  totals.candidateRowsInserted += Number(result.candidateUpsert?.inserted || 0);
  totals.candidateRowsUpdated += Number(result.candidateUpsert?.updated || 0);
  totals.autoApproved += Number(result.approvals?.approved || 0);
  totals.targetReused += Number(result.signatures?.targets?.reused || 0);
  totals.targetParsed += Number(result.signatures?.targets?.parsed || 0);
  totals.targetErrors += Number(result.signatures?.targets?.errors || 0);
  totals.targetMissingDownload += Number(result.signatures?.targets?.missingDownload || 0);
  totals.referenceReused += Number(result.signatures?.references?.reused || 0);
  totals.referenceParsed += Number(result.signatures?.references?.parsed || 0);
  totals.referenceErrors += Number(result.signatures?.references?.errors || 0);
  totals.referenceMissingDownload += Number(result.signatures?.references?.missingDownload || 0);
  return totals;
}

export { accumulateBatchTotals, buildTotals, normalizeMapUidList, parseArgs };
