import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../src/db/index.js";
import { AlteredRepository } from "../src/repositories/alteredRepository.js";
import { AlteredService } from "../src/services/alteredService.js";
import { DB_FILE, DATA_DIR } from "../src/config.js";
import { chunkArray, clampInt } from "../../shared/valueUtils.js";
import { readJsonFile, writeJsonFile } from "../../shared/fsUtils.js";
import { buildManagedProcessIdentity, readProcessIdentity } from "../../shared/processIdentity.js";
import { spawnContinuationWorker } from "./similarity-resolver/continuation.js";
import { loadSelectedMapUids, remainingMapUids } from "./similarity-resolver/map-selection.js";
import { createProgressTracker } from "./similarity-resolver/progress.js";
import { accumulateBatchTotals, buildTotals, parseArgs } from "./similarity-resolver/run-state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_MAX_BATCHES_PER_PROCESS = 2;

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
  const maxBatchesPerProcess = clampInt(args.get("max-batches-per-process") || DEFAULT_MAX_BATCHES_PER_PROCESS, {
    min: 1,
    max: 100,
    fallback: DEFAULT_MAX_BATCHES_PER_PROCESS,
  });
  const resetProgress = String(args.get("reset") || "").trim() === "1";
  const savedProgress = resetProgress ? null : await readJsonFile(progressFile, null);
  const startOffset = clampInt(args.get("offset") ?? savedProgress?.nextOffset ?? 0, {
    min: 0,
    max: 500000,
    fallback: 0,
  });
  const reason = String(args.get("reason") || "manual-admin").trim() || "manual-admin";
  const runId = String(args.get("run-id") || "").trim() || `naming-similarity-worker-${Date.now()}`;
  const runNonce = String(args.get("run-nonce") || "").trim() || randomUUID();
  const workerIdentity = buildManagedProcessIdentity({
    ...(readProcessIdentity(process.pid) || {}),
    pid: process.pid,
    entrypoint: __filename,
    runId,
    runNonce,
  });
  const targetClubId =
    clampInt(args.get("club-id") || 0, {
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
      Number(repository.db.prepare("SELECT COUNT(*) AS count FROM altered_maps").get()?.count || 0) || 0;
    const mapUidsFromFile = mapUidsFile ? await readJsonFile(mapUidsFile, []) : null;
    const selectedMapUids = loadSelectedMapUids(repository, { mapUidsFromFile, maxMaps });
    const selectedMapsTotal = selectedMapUids.length;
    const batches = chunkArray(remainingMapUids(selectedMapUids, startOffset), batchSize);
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
    const progress = createProgressTracker({
      runId,
      workerPid: process.pid,
      workerIdentity,
      reason,
      startedAtIso,
      startedMs,
      dbFile: DB_FILE,
      dataDir: DATA_DIR,
      logFile,
      progressFile,
      totalMaps,
      startOffset,
      batchSize,
      totalBatches,
      startBatchIndex,
      selectedMapsTotal,
      targetClubId,
      rescanAll,
      persistCandidates,
      force,
      totals,
    });

    logLine(
      `[resolver] start db=${DB_FILE} totalMaps=${totalMaps} startOffset=${startOffset} selectedMaps=${selectedMapsTotal} batchSize=${batchSize} progressFile=${progressFile} runId=${runId}`
    );

    await progress.queueWrite(
      progress.buildPayload({
        completedBatches: 0,
        partial: null,
        status: "running",
        complete: false,
      })
    );

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
          void progress.queueWrite(
            progress.buildPayload({
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

      accumulateBatchTotals(totals, result);

      const elapsedSeconds = Math.round((Date.now() - startedMs) / 1000);
      await progress.queueWrite(
        progress.buildPayload({
          completedBatches: index + 1,
          partial: {
            message: `Completed batch ${startBatchIndex + index + 1} of ${totalBatches}.`,
            percent: 100,
            stage: "batch-complete",
          },
          status: "running",
          complete: false,
        })
      );
      logLine(
        `[resolver] batch=${startBatchIndex + index + 1}/${totalBatches} processed=${totals.processed}/${selectedMapsTotal} resolved=${totals.resolved} unresolved=${totals.unresolved} changed=${totals.changedCandidates} elapsed=${elapsedSeconds}s`
      );

      const localCompletedBatches = index + 1;
      const hasRemainingBatches = localCompletedBatches < batches.length;
      if (hasRemainingBatches && localCompletedBatches >= maxBatchesPerProcess) {
        const continuation = spawnContinuationWorker({
          entrypoint: __filename,
          cwd: path.resolve(__dirname, ".."),
          progressFile,
          batchSize,
          runId,
          reason,
          persistCandidates,
          force,
          offset: Number(totals.processed || 0),
          maxBatchesPerProcess,
          mapUidsFile,
          logFile,
          maxMaps,
          targetClubId,
          rescanAll,
        });
        const handoffProgress = {
          ...progress.buildPayload({
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
          workerPid: Number(continuation.child?.pid || 0) || null,
          workerIdentity: continuation.identity,
        };
        await progress.queueWrite(handoffProgress);
        logLine(
          `[resolver] handoff nextPid=${handoffProgress.workerPid} after batch=${startBatchIndex + localCompletedBatches}/${totalBatches} processed=${totals.processed}/${selectedMapsTotal}`
        );
        return;
      }
    }

    const finalSummary = repository.naming.getMapNameCandidateSummary();
    const finalProgress = {
      ...progress.buildPayload({
        completedBatches: batches.length,
        partial: null,
        status: "ok",
        complete: true,
        finalSummary,
      }),
      finishedAt: new Date().toISOString(),
      currentBatch: null,
    };
    await progress.queueWrite(finalProgress);
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
  const existing = await readJsonFile(progressFile, null);
  const runId = String(args.get("run-id") || existing?.runId || "").trim();
  const runNonce = String(args.get("run-nonce") || "").trim();
  const message = error?.message || String(error || "Similarity resolver failed.");
  try {
    await writeJsonFile(progressFile, {
      ...(existing || {}),
      workerPid: process.pid,
      workerIdentity: buildManagedProcessIdentity({
        ...(readProcessIdentity(process.pid) || {}),
        pid: process.pid,
        entrypoint: __filename,
        runId,
        runNonce,
      }),
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
