import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../src/db/index.js";
import { AlteredRepository } from "../src/repositories/alteredRepository.js";
import { AlteredService } from "../src/services/alteredService.js";
import { DB_FILE, DATA_DIR } from "../src/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_MAX_BATCHES_PER_PROCESS = 2;

const EMPTY_TOTALS = {
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
};

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
      continue;
    }
    args.set(key, "1");
  }
  return args;
}

function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function chunk(items = [], size = 250) {
  const out = [];
  const safeSize = Math.max(1, Number(size) || 1);
  for (let index = 0; index < items.length; index += safeSize) {
    out.push(items.slice(index, index + safeSize));
  }
  return out;
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function normalizeMapUidList(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const mapUid = String(value || "").trim();
    if (!mapUid) continue;
    const key = mapUid.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(mapUid);
  }
  return out;
}

function buildTotals(seed = null) {
  const out = { ...EMPTY_TOTALS };
  if (!seed || typeof seed !== "object") return out;
  for (const key of Object.keys(out)) {
    out[key] = Number(seed?.[key] || 0);
  }
  return out;
}

function createService(repository) {
  return new AlteredService({
    repository,
    trackerClient: null,
    trackerMapSyncClients: [],
    trackerDisplaynameClient: null,
    trackerClubClient: null,
    aggregatorClient: null,
    liveClient: null,
    mapperNameClient: null,
    trackerIntegrations: {
      displaynameEnabled: false,
      displaynameFallbackLocal: false,
      clubEnabled: false,
      clubFallbackLocal: false,
    },
    liveMonitorConfig: {
      enabled: false,
      discoveryEnabled: false,
    },
    mapperNameSyncConfig: {
      enabled: false,
    },
    mapCopyConfig: {
      enabled: true,
      dataDir: DATA_DIR,
    },
    logger: console,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const batchSize = clampInt(args.get("batch-size") || 250, {
    min: 1,
    max: 2000,
    fallback: 250,
  });
  const maxMaps = clampInt(args.get("max-maps") || 0, {
    min: 0,
    max: 500000,
    fallback: 0,
  });
  const progressFile =
    String(args.get("progress-file") || "").trim() ||
    path.resolve(__dirname, "..", "..", "..", "tmp", "similarity-resolver-progress.json");
  const mapUidsFile = String(args.get("map-uids-file") || "").trim();
  const logFile = String(args.get("log-file") || "").trim();
  const maxBatchesPerProcess = clampInt(
    args.get("max-batches-per-process") || DEFAULT_MAX_BATCHES_PER_PROCESS,
    {
      min: 1,
      max: 100,
      fallback: DEFAULT_MAX_BATCHES_PER_PROCESS,
    }
  );
  const resetProgress = String(args.get("reset") || "").trim() === "1";
  const savedProgress = resetProgress ? null : await readJson(progressFile, null);
  const startOffset = clampInt(args.get("offset") ?? savedProgress?.nextOffset ?? 0, {
    min: 0,
    max: 500000,
    fallback: 0,
  });
  const reason = String(args.get("reason") || "manual-admin").trim() || "manual-admin";
  const runId = String(args.get("run-id") || "").trim() || `naming-similarity-worker-${Date.now()}`;
  const targetClubId = clampInt(args.get("club-id") || 0, {
    min: 0,
    max: 2147483647,
    fallback: 0,
  }) || null;
  const rescanAll = String(args.get("rescan-all") || "").trim() === "1";
  const persistCandidates = String(args.get("persist-candidates") || "1").trim() !== "0";
  const force = String(args.get("force") || "").trim() === "1";
  const persistedRunId = String(savedProgress?.runId || "").trim();
  const canResumeSavedProgress = Boolean(savedProgress) && (!persistedRunId || persistedRunId === runId);

  const db = createDatabase({ filePath: DB_FILE });
  const repository = new AlteredRepository(db);
  const service = createService(repository);

  try {
    const logLine = (message) => console.log(message);

    const totalMaps =
      Number(
        repository.db.prepare("SELECT COUNT(*) AS count FROM altered_maps").get()?.count || 0
      ) || 0;
    const mapUidsFromFile = mapUidsFile ? await readJson(mapUidsFile, []) : null;
    const rows = mapUidsFromFile
      ? []
      : repository.db
          .prepare(
            `
            SELECT map_uid AS mapUid
            FROM altered_maps
            ORDER BY map_uid ASC
            LIMIT ?
            OFFSET ?
            `
          )
          .all(maxMaps > 0 ? maxMaps : 500000, startOffset);
    const selectedMapUids = mapUidsFromFile
      ? normalizeMapUidList(mapUidsFromFile)
      : normalizeMapUidList(rows.map((row) => String(row.mapUid || "").trim()).filter(Boolean));
    const selectedMapsTotal = selectedMapUids.length;
    const remainingMapUids = selectedMapUids.slice(
      startOffset,
      maxMaps > 0 ? Math.min(selectedMapsTotal, startOffset + maxMaps) : undefined
    );
    const batches = chunk(remainingMapUids, batchSize);
    const totalBatches = Math.ceil(selectedMapsTotal / Math.max(1, batchSize));
    const startBatchIndex = clampInt(Math.floor(startOffset / Math.max(1, batchSize)), {
      min: 0,
      max: totalBatches,
      fallback: 0,
    });
    const startedAtIso =
      canResumeSavedProgress && String(savedProgress?.startedAt || "").trim()
        ? String(savedProgress.startedAt).trim()
        : new Date().toISOString();
    const parsedStartedMs = Date.parse(startedAtIso);
    const startedMs = Number.isFinite(parsedStartedMs) ? parsedStartedMs : Date.now();
    const totals = buildTotals(canResumeSavedProgress ? savedProgress?.totals : null);
    let lastLiveProgressWriteAtMs = 0;
    let queuedProgressWrite = Promise.resolve();

    const buildProgressPayload = ({
      completedBatches = 0,
      partial = null,
      status = "running",
      complete = false,
      error = null,
      finalSummary = null,
    } = {}) => {
      const partialCounters = partial?.counters || {};
      const effectiveProcessed = Number(totals.processed || 0) + Number(partialCounters.processed || 0);
      const effectiveResolved = Number(totals.resolved || 0) + Number(partialCounters.resolved || 0);
      const effectiveUnresolved = Number(totals.unresolved || 0) + Number(partialCounters.unresolved || 0);
      const effectiveChanged = Number(totals.changedCandidates || 0) + Number(partialCounters.changedCandidates || 0);
      const effectiveRefreshed =
        Number(totals.refreshedSimilarityRecords || 0) +
        Number(partialCounters.refreshedSimilarityRecords || 0);
      const effectiveUpgraded =
        Number(totals.upgradedLegacySimilarityRecords || 0) +
        Number(partialCounters.upgradedLegacySimilarityRecords || 0);
      const effectiveSimilarityRows =
        Number(totals.similarityRowsWritten || 0) +
        Number(partialCounters.similarityRowsWritten || 0);
      const effectiveCandidateRows =
        Number(totals.candidateRowsWritten || 0) +
        Number(partialCounters.candidateRowsWritten || 0);
      const effectiveAutoApproved =
        Number(totals.autoApproved || 0) + Number(partialCounters.autoApproved || 0);
      const effectiveTargetSignaturesReady = Number(
        partialCounters.targetSignaturesReady !== undefined
          ? partialCounters.targetSignaturesReady
          : totals.processed
      );
      const effectiveTargetSignaturesTotal = Number(
        partialCounters.targetSignaturesTotal !== undefined
          ? partialCounters.targetSignaturesTotal
          : selectedMapsTotal
      );
      const effectiveReferenceSignaturesReady = Number(
        partialCounters.referenceSignaturesReady !== undefined
          ? partialCounters.referenceSignaturesReady
          : 0
      );
      const effectiveReferenceSignaturesTotal = Number(
        partialCounters.referenceSignaturesTotal !== undefined
          ? partialCounters.referenceSignaturesTotal
          : 0
      );
      const batchesDone = clampInt(startBatchIndex + completedBatches, {
        min: 0,
        max: totalBatches,
        fallback: startBatchIndex,
      });
      const currentBatchIndex = Math.min(totalBatches, batchesDone + 1);
      const currentBatchSize = currentBatchIndex <= totalBatches
        ? Math.min(
            batchSize,
            Math.max(0, selectedMapsTotal - (currentBatchIndex - 1) * batchSize)
          )
        : 0;
      const currentBatchStart = currentBatchSize
        ? Math.max(1, (currentBatchIndex - 1) * batchSize + 1)
        : null;
      const currentBatchEnd = currentBatchSize && currentBatchStart
        ? Math.min(selectedMapsTotal, currentBatchStart + currentBatchSize - 1)
        : null;
      const percent =
        partial?.percent !== undefined && partial?.percent !== null
          ? Number(partial.percent)
          : selectedMapsTotal > 0
            ? clampInt(Math.round((effectiveProcessed / selectedMapsTotal) * 100), {
                min: 0,
                max: 100,
                fallback: 0,
              })
            : 0;
      const partialStage = String(partial?.stage || "").trim();
      const normalizedMessage =
        partialStage === "signatures-targets" && currentBatchStart && currentBatchEnd
          ? `Ensuring content signatures for target maps ${currentBatchStart}-${currentBatchEnd} of ${selectedMapsTotal}...`
          : partialStage === "matching" && selectedMapsTotal > 0
            ? `Compared ${effectiveProcessed} of ${selectedMapsTotal} maps...`
            : String(partial?.message || "").trim() || null;
      return {
        runId,
        workerPid: process.pid,
        reason,
        startedAt: startedAtIso,
        updatedAt: new Date().toISOString(),
        dbFile: DB_FILE,
        dataDir: DATA_DIR,
        logFile: logFile || null,
        totalMaps,
        startOffset,
        nextOffset: effectiveProcessed,
        batchSize,
        batchesCompleted: batchesDone,
        batchesTotal: totalBatches,
        selectedMaps: selectedMapsTotal,
        targetClubId,
        rescanAll,
        persistCandidates,
        force,
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
          ...partialCounters,
          total: selectedMapsTotal,
          processed: effectiveProcessed,
          resolved: effectiveResolved,
          unresolved: effectiveUnresolved,
          changedCandidates: effectiveChanged,
          refreshedSimilarityRecords: effectiveRefreshed,
          upgradedLegacySimilarityRecords: effectiveUpgraded,
          similarityRowsWritten: effectiveSimilarityRows,
          candidateRowsWritten: effectiveCandidateRows,
          autoApproved: effectiveAutoApproved,
          targetSignaturesReady: effectiveTargetSignaturesReady,
          targetSignaturesTotal: effectiveTargetSignaturesTotal,
          referenceSignaturesReady: effectiveReferenceSignaturesReady,
          referenceSignaturesTotal: effectiveReferenceSignaturesTotal,
        },
        stage: String(partial?.stage || "").trim() || null,
        percent,
        message: normalizedMessage,
        currentMapUid: String(partial?.currentMapUid || "").trim() || null,
        currentMapName: String(partial?.currentMapName || "").trim() || null,
        recentMaps: Array.isArray(partial?.recentMaps) ? partial.recentMaps : [],
        signatureSummary:
          partial?.signatureSummary && typeof partial.signatureSummary === "object"
            ? partial.signatureSummary
            : null,
        currentBatch: {
          index: currentBatchIndex,
          total: totalBatches,
          size: currentBatchSize,
          processed: effectiveProcessed,
          message: normalizedMessage,
          percent,
          stage: String(partial?.stage || "").trim() || null,
          updatedAt: partial?.updatedAt || null,
        },
        running: !complete && status === "running",
        status,
        error: error || null,
        elapsedSeconds: Math.round((Date.now() - startedMs) / 1000),
        finalSummary: finalSummary || undefined,
        complete,
      };
    };

    const queueProgressFileWrite = (payload) => {
      queuedProgressWrite = queuedProgressWrite
        .catch(() => {})
        .then(() => writeJson(progressFile, payload));
      return queuedProgressWrite;
    };

    const spawnContinuationWorker = (offset) => {
      const childArgs = [
        __filename,
        "--progress-file",
        progressFile,
        "--batch-size",
        String(batchSize),
        "--run-id",
        runId,
        "--reason",
        reason,
        "--persist-candidates",
        persistCandidates ? "1" : "0",
        "--force",
        force ? "1" : "0",
        "--offset",
        String(offset),
        "--max-batches-per-process",
        String(maxBatchesPerProcess),
      ];
      if (mapUidsFile) {
        childArgs.push("--map-uids-file", mapUidsFile);
      }
      if (logFile) {
        childArgs.push("--log-file", logFile);
      }
      if (maxMaps > 0) {
        childArgs.push("--max-maps", String(maxMaps));
      }
      if (Number(targetClubId || 0) > 0) {
        childArgs.push("--club-id", String(Number(targetClubId)));
      }
      if (rescanAll) {
        childArgs.push("--rescan-all", "1");
      }

      let logFd = null;
      try {
        if (logFile) {
          fsSync.mkdirSync(path.dirname(logFile), { recursive: true });
          logFd = fsSync.openSync(logFile, "a");
        }
        const child = spawn(process.execPath, childArgs, {
          cwd: path.resolve(__dirname, ".."),
          stdio: logFd !== null ? ["ignore", logFd, logFd] : ["ignore", "ignore", "ignore"],
          windowsHide: true,
          detached: true,
        });
        child.unref();
        return child;
      } finally {
        if (logFd !== null) {
          try {
            fsSync.closeSync(logFd);
          } catch {}
        }
      }
    };

    logLine(
      `[resolver] start db=${DB_FILE} totalMaps=${totalMaps} startOffset=${startOffset} selectedMaps=${selectedMapsTotal} batchSize=${batchSize} progressFile=${progressFile} runId=${runId}`
    );

    await queueProgressFileWrite(buildProgressPayload({
      completedBatches: 0,
      partial: null,
      status: "running",
      complete: false,
    }));

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      const result = await service.assignStoredMapNumbersBySimilarity({
        mapUids: batch,
        limit: batch.length,
        force,
        rescanAll,
        persistCandidates,
        onProgress: (partial) => {
          const nowMs = Date.now();
          if (nowMs - lastLiveProgressWriteAtMs < 1000) return;
          lastLiveProgressWriteAtMs = nowMs;
          void queueProgressFileWrite(
            buildProgressPayload({
              completedBatches: index,
              partial,
              status: "running",
              complete: false,
            })
          );
        },
      });
      if (result?.error || result?.ok === false) {
        throw new Error(result?.error || `Similarity batch ${index + 1} failed.`);
      }

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
      totals.referenceMissingDownload += Number(
        result.signatures?.references?.missingDownload || 0
      );

      const elapsedSeconds = Math.round((Date.now() - startedMs) / 1000);
      await queueProgressFileWrite(buildProgressPayload({
        completedBatches: index + 1,
        partial: {
          message: `Completed batch ${startBatchIndex + index + 1} of ${totalBatches}.`,
          percent: 100,
          stage: "batch-complete",
        },
        status: "running",
        complete: false,
      }));
      logLine(
        `[resolver] batch=${startBatchIndex + index + 1}/${totalBatches} processed=${totals.processed}/${selectedMapsTotal} resolved=${totals.resolved} unresolved=${totals.unresolved} changed=${totals.changedCandidates} elapsed=${elapsedSeconds}s`
      );

      const localCompletedBatches = index + 1;
      const hasRemainingBatches = localCompletedBatches < batches.length;
      if (hasRemainingBatches && localCompletedBatches >= maxBatchesPerProcess) {
        const continuationChild = spawnContinuationWorker(Number(totals.processed || 0));
        const handoffProgress = {
          ...buildProgressPayload({
            completedBatches: localCompletedBatches,
            partial: {
              message: `Continuing with fresh worker after batch ${startBatchIndex + localCompletedBatches} of ${totalBatches}.`,
              percent:
                selectedMapsTotal > 0
                  ? clampInt(Math.round((Number(totals.processed || 0) / selectedMapsTotal) * 100), {
                      min: 0,
                      max: 100,
                      fallback: 0,
                    })
                  : 0,
              stage: "handoff",
            },
            status: "running",
            complete: false,
          }),
          workerPid: Number(continuationChild?.pid || 0) || null,
        };
        await queueProgressFileWrite(handoffProgress);
        logLine(
          `[resolver] handoff nextPid=${handoffProgress.workerPid} after batch=${startBatchIndex + localCompletedBatches}/${totalBatches} processed=${totals.processed}/${selectedMapsTotal}`
        );
        return;
      }
    }

    const finalSummary = repository.getMapNameCandidateSummary();
    const finalProgress = {
      ...buildProgressPayload({
        completedBatches: batches.length,
        partial: null,
        status: "ok",
        complete: true,
        finalSummary,
      }),
      finishedAt: new Date().toISOString(),
      currentBatch: null,
    };
    await queueProgressFileWrite(finalProgress);
    logLine(`[resolver] done processed=${totals.processed} elapsed=${finalProgress.elapsedSeconds}s`);
    logLine(JSON.stringify(finalProgress, null, 2));
  } finally {
    try {
      db.close();
    } catch {}
  }
}

main().catch(async (error) => {
  const args = parseArgs(process.argv.slice(2));
  const progressFile =
    String(args.get("progress-file") || "").trim() ||
    path.resolve(__dirname, "..", "..", "..", "tmp", "similarity-resolver-progress.json");
  const logFile = String(args.get("log-file") || "").trim();
  const existing = await readJson(progressFile, null);
  const message = error?.message || String(error || "Similarity resolver failed.");
  try {
    await writeJson(progressFile, {
      ...(existing || {}),
      workerPid: process.pid,
      updatedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      running: false,
      status: "error",
      complete: true,
      error: message,
    });
  } catch {}
  console.error(`[resolver] fatal: ${message}`);
  process.exitCode = 1;
});
