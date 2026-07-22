import { fetchPublicHttp } from "../../../../../shared/httpEgressPolicy.js";

import {
  createHash,
  fs,
  path,
  ALTERED_MAP_COPY_BACKFILL_BATCH_SIZE,
  ALTERED_MAP_COPY_BACKFILL_ENABLED,
  ALTERED_MAP_COPY_MAX_CONCURRENT_DOWNLOADS,
  ALTERED_MAP_COPY_REQUEST_TIMEOUT_MS,
  DATA_DIR,
  DEFAULT_MAP_COPY_BACKFILL_BATCH_SIZE,
  DEFAULT_MAP_COPY_BOOT_AUTO_START_MAX_PENDING,
  DEFAULT_MAP_COPY_MAX_CONCURRENT_DOWNLOADS,
  MAP_CONTENT_DOWNLOAD_TIMEOUT_MS,
  buildCampaignFamily,
  buildLocalMapFixRelativePath,
  buildLocalMapRelativePath,
  chunk,
  clampInt,
  resolveMapCampaignName,
  resolveMapDownloadUrl,
  resolveMapSlot,
  resolveMapUid,
  runWithConcurrency,
  toText,
  uniqueBy,
} from "../serviceSupport.js";

function createMapCopyState(mapCopyConfig = {}) {
  const dataDir = toText(mapCopyConfig.dataDir || DATA_DIR) || DATA_DIR;
  return {
    dataDir,
    rootDir: path.join(dataDir, "maps", "gbx"),
    enabled:
      mapCopyConfig.enabled === undefined ? Boolean(ALTERED_MAP_COPY_BACKFILL_ENABLED) : Boolean(mapCopyConfig.enabled),
    batchSize: clampInt(
      mapCopyConfig.batchSize === undefined ? ALTERED_MAP_COPY_BACKFILL_BATCH_SIZE : mapCopyConfig.batchSize,
      {
        min: 1,
        max: 2000,
        fallback: DEFAULT_MAP_COPY_BACKFILL_BATCH_SIZE,
      }
    ),
    maxConcurrentDownloads: clampInt(
      mapCopyConfig.maxConcurrentDownloads === undefined
        ? ALTERED_MAP_COPY_MAX_CONCURRENT_DOWNLOADS
        : mapCopyConfig.maxConcurrentDownloads,
      {
        min: 1,
        max: 32,
        fallback: DEFAULT_MAP_COPY_MAX_CONCURRENT_DOWNLOADS,
      }
    ),
    requestTimeoutMs: Math.max(
      2000,
      Number(
        mapCopyConfig.requestTimeoutMs === undefined
          ? ALTERED_MAP_COPY_REQUEST_TIMEOUT_MS
          : mapCopyConfig.requestTimeoutMs
      ) || ALTERED_MAP_COPY_REQUEST_TIMEOUT_MS
    ),
    running: false,
    runCounter: 0,
    currentRunId: null,
    currentReason: null,
    currentProgress: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastDurationMs: null,
    lastError: null,
    lastSummary: null,
  };
}

class MapLocalFileInventoryService {
  constructor({
    repository,
    mapCopy,
    logger = console,
    getMapNameWorkspaceService,
    resolveLocalMapPath,
    loadBackfillMaps,
    updateProgress,
    readStoreStatus,
    startBackfill,
    downloadMap,
  }) {
    this.repository = repository;
    this.mapCopy = mapCopy;
    this.logger = logger;
    this.getMapNameWorkspaceService = getMapNameWorkspaceService;
    this.resolveLocalMapPath = resolveLocalMapPath;
    this.loadBackfillMaps = loadBackfillMaps;
    this.updateProgress = updateProgress;
    this.readStoreStatus = readStoreStatus;
    this.startBackfill = startBackfill;
    this.downloadMap = downloadMap;
  }

  getLocalMapFileAbsolutePath(mapUid, relativePath = "") {
    const safeRelativePath = toText(relativePath) || buildLocalMapRelativePath(mapUid);
    return path.join(this.mapCopy.dataDir, safeRelativePath);
  }

  getMapLocalFixAbsolutePath(mapUid, sourceFilePath = "") {
    const relativePath = buildLocalMapFixRelativePath(mapUid, sourceFilePath);
    return this.resolveLocalMapPath(mapUid, relativePath);
  }

  getPreferredMapLocalFiles({ mapUids = [] } = {}) {
    const originals = this.repository.mapFiles.getMapLocalFiles({ mapUids });
    const fixes = this.repository.mapFiles.getMapLocalFileFixes({ mapUids });
    const byUid = new Map(
      originals
        .filter((record) => record?.mapUid)
        .map((record) => [
          String(record.mapUid || "").toLowerCase(),
          {
            ...record,
            sourceKind: "downloaded",
            replacementActive: false,
          },
        ])
    );

    for (const fix of fixes) {
      const key = String(fix?.mapUid || "").toLowerCase();
      if (!key) continue;
      const original = byUid.get(key) || null;
      if (String(fix?.status || "").toLowerCase() === "ready") {
        byUid.set(key, {
          mapUid: fix.mapUid,
          relativePath: fix.relativePath,
          downloadUrl: original?.downloadUrl || null,
          fileSha256: fix.fileSha256 || null,
          fileSizeBytes: Number(fix.fileSizeBytes || 0),
          downloadedAt: original?.downloadedAt || fix.importedAt || null,
          verifiedAt: fix.verifiedAt || fix.importedAt || null,
          status: "ready",
          lastError: null,
          updatedAt: fix.updatedAt || null,
          sourceKind: "local-fix",
          sourceFilePath: fix.sourceFilePath || null,
          note: fix.note || null,
          replacementActive: true,
          originalLocalFile: original,
        });
        continue;
      }

      if (!original) {
        byUid.set(key, {
          mapUid: fix.mapUid,
          relativePath: fix.relativePath,
          downloadUrl: null,
          fileSha256: fix.fileSha256 || null,
          fileSizeBytes: Number(fix.fileSizeBytes || 0),
          downloadedAt: fix.importedAt || null,
          verifiedAt: fix.verifiedAt || fix.importedAt || null,
          status: fix.status || "missing",
          lastError: fix.lastError || null,
          updatedAt: fix.updatedAt || null,
          sourceKind: "local-fix",
          sourceFilePath: fix.sourceFilePath || null,
          note: fix.note || null,
          replacementActive: false,
          originalLocalFile: null,
        });
        continue;
      }

      byUid.set(key, {
        ...original,
        replacementActive: false,
        replacementSourceKind: "local-fix",
        replacementStatus: fix.status || null,
        replacementSourceFilePath: fix.sourceFilePath || null,
        replacementNote: fix.note || null,
        replacementError: fix.lastError || null,
      });
    }

    return [...byUid.values()];
  }

  getMapLocalStoreStatus() {
    const summary =
      typeof this.repository?.mapFiles?.getMapLocalStoreSummary === "function"
        ? this.repository.mapFiles.getMapLocalStoreSummary({ includeParserDiagnostics: false })
        : {
            totalMaps: 0,
            downloadedCount: 0,
            missingCount: 0,
            errorCount: 0,
            totalBytes: 0,
            signatureReadyCount: 0,
            signatureErrorCount: 0,
            similarityReadyCount: 0,
          };
    const initialized =
      Number(summary.totalMaps || 0) > 0 &&
      Number(summary.downloadedCount || 0) >= Number(summary.totalMaps || 0) &&
      Number(summary.signatureReadyCount || 0) >= Number(summary.totalMaps || 0);
    return {
      enabled: Boolean(this.mapCopy.enabled),
      dataDir: this.mapCopy.dataDir,
      rootDir: this.mapCopy.rootDir,
      batchSize: this.mapCopy.batchSize,
      maxConcurrentDownloads: this.mapCopy.maxConcurrentDownloads,
      requestTimeoutMs: this.mapCopy.requestTimeoutMs,
      initialized,
      summary,
      job: {
        running: Boolean(this.mapCopy.running),
        runCounter: Number(this.mapCopy.runCounter || 0),
        currentRunId: this.mapCopy.currentRunId || null,
        currentReason: this.mapCopy.currentReason || null,
        progress: this.mapCopy.currentProgress || null,
        lastStartedAt: this.mapCopy.lastStartedAt,
        lastFinishedAt: this.mapCopy.lastFinishedAt,
        lastDurationMs: this.mapCopy.lastDurationMs,
        lastError: this.mapCopy.lastError,
        lastSummary: this.mapCopy.lastSummary,
      },
    };
  }

  updateMapCopyProgress(partial = {}) {
    const previous = this.mapCopy.currentProgress || {};
    const nextCounters =
      partial.replaceCounters === true
        ? { ...(partial.counters || {}) }
        : { ...(previous.counters || {}), ...(partial.counters || {}) };
    this.mapCopy.currentProgress = {
      ...previous,
      ...partial,
      counters: nextCounters,
      updatedAt: new Date().toISOString(),
    };
    delete this.mapCopy.currentProgress.replaceCounters;
    return this.mapCopy.currentProgress;
  }

  buildMapsForLocalCopyBackfill({ mapUids = [], retryErrorsOnly = false } = {}) {
    let sourceMapUids = Array.isArray(mapUids) ? mapUids.filter(Boolean) : [];
    if (!sourceMapUids.length && retryErrorsOnly) {
      sourceMapUids =
        typeof this.repository?.mapFiles?.listMapUidsForLocalFileStatus === "function"
          ? this.repository.mapFiles.listMapUidsForLocalFileStatus({ statuses: ["error"], limit: 50000 })
          : [];
      if (!sourceMapUids.length) return [];
    }
    const maps = this.repository.naming.listMapsForNameStandardization({
      limit: 120000,
      mapUids: sourceMapUids,
      includePayload: false,
    });
    return uniqueBy(
      maps
        .map((map) => ({
          ...map,
          mapUid: resolveMapUid(map),
          campaignName: resolveMapCampaignName(map),
          slot: resolveMapSlot(map) || 9999,
        }))
        .filter((map) => map.mapUid)
        .sort((left, right) => {
          const leftFamily = buildCampaignFamily(left.campaignName);
          const rightFamily = buildCampaignFamily(right.campaignName);
          if (Boolean(leftFamily.isReferenceLike) !== Boolean(rightFamily.isReferenceLike)) {
            return leftFamily.isReferenceLike ? -1 : 1;
          }
          const campaignDiff = String(left.campaignName || "").localeCompare(
            String(right.campaignName || ""),
            undefined,
            { sensitivity: "base" }
          );
          if (campaignDiff !== 0) return campaignDiff;
          const slotDiff = Number(left.slot || 9999) - Number(right.slot || 9999);
          if (slotDiff !== 0) return slotDiff;
          return String(left.name || "").localeCompare(String(right.name || ""), undefined, {
            sensitivity: "base",
          });
        }),
      (map) => map.mapUid.toLowerCase()
    );
  }

  async runMapLocalCopyBackfill({
    reason = "manual-admin",
    force = false,
    retryErrorsOnly = false,
    mapUids = [],
  } = {}) {
    if (this.mapCopy.running) {
      return {
        skipped: true,
        reason: "map-local-copy-backfill already running",
      };
    }

    const maps = this.loadBackfillMaps({ mapUids, retryErrorsOnly });
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const runId = `map-copy:${startedMs}`;
    this.mapCopy.running = true;
    this.mapCopy.runCounter += 1;
    this.mapCopy.currentRunId = runId;
    this.mapCopy.currentReason = reason;
    this.mapCopy.lastStartedAt = startedAt;
    this.mapCopy.lastError = null;
    this.mapCopy.lastFinishedAt = null;
    this.mapCopy.lastDurationMs = null;
    this.updateProgress({
      runId,
      reason,
      phase: "prepare",
      status: "running",
      percent: 0,
      startedAt,
      counters: {
        totalMaps: maps.length,
        processedMaps: 0,
        approvedMaps: 0,
      },
      replaceCounters: true,
    });

    try {
      const batches = chunk(maps, this.mapCopy.batchSize);
      const summary = {
        totalMaps: maps.length,
        processedMaps: 0,
        resolvedMaps: 0,
        unresolvedMaps: 0,
        changedCandidates: 0,
        approvedMaps: 0,
        targetDownloads: 0,
        targetReused: 0,
        targetErrors: 0,
        targetMissing: 0,
        referenceDownloads: 0,
        referenceReused: 0,
        referenceErrors: 0,
        referenceMissing: 0,
      };

      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const batchUids = batch.map((map) => map.mapUid);
        this.updateProgress({
          runId,
          reason,
          phase: "batch",
          status: "running",
          percent: Math.floor((index / Math.max(1, batches.length)) * 100),
          counters: {
            batchIndex: index + 1,
            batchTotal: batches.length,
            batchSize: batch.length,
            processedMaps: summary.processedMaps,
          },
        });

        const similarity = await this.getMapNameWorkspaceService().assignStoredMapNumbersBySimilarity({
          mapUids: batchUids,
          limit: Math.max(batchUids.length, 1),
          force,
          persistCandidates: true,
        });

        summary.processedMaps += batch.length;
        summary.resolvedMaps += Number(similarity.resolved || 0);
        summary.unresolvedMaps += Number(similarity.unresolved || 0);
        summary.changedCandidates += Number(similarity.changedCandidates || 0);
        summary.approvedMaps += Number(similarity.approvals?.approved || 0);
        summary.targetDownloads += Number(similarity.signatures?.targets?.localFiles?.downloaded || 0);
        summary.targetReused += Number(similarity.signatures?.targets?.localFiles?.reused || 0);
        summary.targetErrors += Number(similarity.signatures?.targets?.localFiles?.errors || 0);
        summary.targetMissing += Number(similarity.signatures?.targets?.localFiles?.missing || 0);
        summary.referenceDownloads += Number(similarity.signatures?.references?.localFiles?.downloaded || 0);
        summary.referenceReused += Number(similarity.signatures?.references?.localFiles?.reused || 0);
        summary.referenceErrors += Number(similarity.signatures?.references?.localFiles?.errors || 0);
        summary.referenceMissing += Number(similarity.signatures?.references?.localFiles?.missing || 0);

        this.updateProgress({
          runId,
          reason,
          phase: "batch",
          status: "running",
          percent: Math.floor(((index + 1) / Math.max(1, batches.length)) * 100),
          counters: {
            ...summary,
            batchIndex: index + 1,
            batchTotal: batches.length,
            batchSize: batch.length,
          },
          replaceCounters: true,
        });
      }

      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.now() - startedMs);
      this.mapCopy.lastFinishedAt = finishedAt;
      this.mapCopy.lastDurationMs = durationMs;
      this.mapCopy.lastSummary = summary;
      this.updateProgress({
        runId,
        reason,
        phase: "complete",
        status: "ok",
        percent: 100,
        finishedAt,
        durationMs,
        counters: {
          ...summary,
          durationMs,
        },
        replaceCounters: true,
      });
      return {
        ok: true,
        runId,
        summary,
      };
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.now() - startedMs);
      const message = error?.message || "Map local-copy backfill failed.";
      this.mapCopy.lastError = message;
      this.mapCopy.lastFinishedAt = finishedAt;
      this.mapCopy.lastDurationMs = durationMs;
      this.updateProgress({
        runId,
        reason,
        phase: "failed",
        status: "error",
        finishedAt,
        durationMs,
        error: message,
      });
      return {
        error: message,
      };
    } finally {
      this.mapCopy.running = false;
      this.mapCopy.currentRunId = null;
      this.mapCopy.currentReason = null;
    }
  }

  startMapLocalCopyBackfillOnBoot() {
    if (!this.mapCopy.enabled) return false;
    const status = this.readStoreStatus();
    if (status.initialized || this.mapCopy.running) return false;
    const pendingMapUids =
      typeof this.repository?.mapFiles?.listMapUidsNeedingLocalStoreBackfill === "function"
        ? this.repository.mapFiles.listMapUidsNeedingLocalStoreBackfill({ limit: 50000 })
        : [];
    if (!pendingMapUids.length) return false;
    if (pendingMapUids.length > DEFAULT_MAP_COPY_BOOT_AUTO_START_MAX_PENDING) {
      this.logger.warn(
        `[altered-map-copy] startup backfill skipped: ${pendingMapUids.length} pending maps exceeds safe auto-start threshold ${DEFAULT_MAP_COPY_BOOT_AUTO_START_MAX_PENDING}. Run it from admin when needed.`
      );
      return false;
    }
    this.startBackfill({
      reason: "startup-incomplete-backfill",
      force: false,
      retryErrorsOnly: false,
      mapUids: pendingMapUids,
    }).catch((error) => {
      this.logger.warn(`[altered-map-copy] startup backfill failed: ${error?.message || error}`);
    });
    return true;
  }

  async ensureMapLocalFiles(maps = [], { force = false } = {}) {
    const normalizedMaps = uniqueBy(
      (Array.isArray(maps) ? maps : [])
        .map((map) => ({
          ...map,
          mapUid: resolveMapUid(map),
          downloadUrl: resolveMapDownloadUrl(map),
          relativePath: buildLocalMapRelativePath(resolveMapUid(map)),
        }))
        .filter((map) => map.mapUid),
      (map) => map.mapUid.toLowerCase()
    );
    if (!normalizedMaps.length) {
      return {
        records: [],
        summary: {
          total: 0,
          reused: 0,
          downloaded: 0,
          missing: 0,
          errors: 0,
        },
      };
    }

    await fs.mkdir(this.mapCopy.rootDir, { recursive: true });
    const existingByUid = new Map(
      this.repository.mapFiles
        .getMapLocalFiles({
          mapUids: normalizedMaps.map((map) => map.mapUid),
        })
        .map((record) => [record.mapUid.toLowerCase(), record])
    );

    const records = [];
    const upsertRecords = [];
    const summary = {
      total: normalizedMaps.length,
      reused: 0,
      downloaded: 0,
      missing: 0,
      errors: 0,
    };

    const results = await runWithConcurrency(normalizedMaps, this.mapCopy.maxConcurrentDownloads, async (map) => {
      const existing = existingByUid.get(map.mapUid.toLowerCase()) || null;
      const absolutePath = this.resolveLocalMapPath(map.mapUid, map.relativePath);
      const now = new Date().toISOString();
      try {
        if (
          !force &&
          existing &&
          existing.status === "ready" &&
          existing.relativePath === map.relativePath &&
          (!map.downloadUrl || !existing.downloadUrl || existing.downloadUrl === map.downloadUrl)
        ) {
          const stat = await fs.stat(absolutePath).catch(() => null);
          if (stat?.isFile()) {
            summary.reused += 1;
            return {
              mapUid: map.mapUid,
              relativePath: map.relativePath,
              downloadUrl: map.downloadUrl,
              fileSha256: existing.fileSha256 || null,
              fileSizeBytes: Number(existing.fileSizeBytes || stat.size || 0),
              downloadedAt: existing.downloadedAt || now,
              verifiedAt: now,
              status: "ready",
              lastError: null,
            };
          }
        }

        if (!map.downloadUrl) {
          summary.missing += 1;
          return {
            mapUid: map.mapUid,
            relativePath: map.relativePath,
            downloadUrl: null,
            fileSha256: null,
            fileSizeBytes: 0,
            downloadedAt: existing?.downloadedAt || null,
            verifiedAt: now,
            status: "missing",
            lastError: "Map downloadUrl is missing.",
          };
        }

        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        const buffer = await this.downloadMap({
          mapUid: map.mapUid,
          downloadUrl: map.downloadUrl,
        });
        const tempPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
        await fs.writeFile(tempPath, buffer);
        await fs.rename(tempPath, absolutePath);
        summary.downloaded += 1;
        return {
          mapUid: map.mapUid,
          relativePath: map.relativePath,
          downloadUrl: map.downloadUrl,
          fileSha256: createHash("sha256").update(buffer).digest("hex"),
          fileSizeBytes: buffer.length,
          downloadedAt: now,
          verifiedAt: now,
          status: "ready",
          lastError: null,
        };
      } catch (error) {
        summary.errors += 1;
        return {
          mapUid: map.mapUid,
          relativePath: map.relativePath,
          downloadUrl: map.downloadUrl || null,
          fileSha256: existing?.fileSha256 || null,
          fileSizeBytes: Number(existing?.fileSizeBytes || 0),
          downloadedAt: existing?.downloadedAt || null,
          verifiedAt: now,
          status: "error",
          lastError: error?.message || "Failed downloading local map copy.",
        };
      }
    });

    for (const record of results) {
      if (!record) continue;
      records.push(record);
      upsertRecords.push(record);
    }

    const upsert = this.repository.mapFiles.upsertMapLocalFiles({
      records: upsertRecords,
    });

    return {
      records,
      summary,
      upsert,
    };
  }

  async downloadMapFileBuffer({ mapUid, downloadUrl, fetchImpl = fetch, lookup } = {}) {
    const safeUrl = toText(downloadUrl);
    if (!safeUrl) {
      throw new Error(`Map ${toText(mapUid, "<unknown>")} is missing downloadUrl.`);
    }
    const { response } = await fetchPublicHttp(safeUrl, {
      allowedHostSuffixes: ["nadeo.live", "nadeo.online"],
      fetchImpl,
      lookup,
      maxRedirects: 5,
      method: "GET",
      headers: {
        "user-agent": "altered.xjk.yt/1.0 (+https://xjk.yt/)",
      },
      signal: AbortSignal.timeout(
        Math.max(2000, Number(this.mapCopy.requestTimeoutMs || MAP_CONTENT_DOWNLOAD_TIMEOUT_MS))
      ),
    });
    if (!response.ok) {
      throw new Error(`Failed downloading ${toText(mapUid, "<unknown>")} (${response.status}).`);
    }
    const payload = await response.arrayBuffer();
    return Buffer.from(payload);
  }
}

export { MapLocalFileInventoryService, createMapCopyState };
