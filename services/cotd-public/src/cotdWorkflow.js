import { buildPendingTotdSnapshot, normalizeSnapshot, sanitizeSnapshot } from "./cotdModel.js";
import { syncTotdArchive } from "./totdSync.js";

function createCotdWorkflow({ classifierClient, nadeoClient, repository, responseCache, totdClient }, { settings }) {
  const {
    AUTO_CLASSIFY_ENABLED,
    MAP_FILES_DIR,
    TOTD_DOWNLOAD_MAP_FILES,
    TOTD_SYNC_MONTH_LENGTH,
    TOTD_SYNC_MONTH_OFFSET,
    TOTD_SYNC_ROYAL,
  } = settings;
  let fetchInFlight = null;

  async function buildFetchedSnapshot(sourceMap) {
    const warnings = Array.isArray(sourceMap?.warnings) ? [...sourceMap.warnings] : [];
    let classification = null;

    if (!AUTO_CLASSIFY_ENABLED) {
      warnings.push("COTD_AUTO_CLASSIFY_ENABLED=0, so this TOTD map is waiting for manual classifier ingest.");
    } else if (!classifierClient.isConfigured()) {
      warnings.push("COTD_CLASSIFIER_BASE_URL is not configured, so this TOTD map is stored as pending_classifier.");
    } else {
      try {
        classification = await classifierClient.classify({
          map: sourceMap?.cotd || sourceMap?.map || sourceMap,
          evidence: sourceMap?.evidence || sourceMap?.evidenceSummary || sourceMap?.records || {},
        });
      } catch (error) {
        warnings.push(
          `Classifier request failed, so this TOTD map is stored as pending_classifier. ${error?.message || ""}`.trim()
        );
      }
    }

    const snapshotInput = { ...sourceMap, warnings };
    if (classification) {
      delete snapshotInput.status;
      return normalizeSnapshot(snapshotInput, { classification, source: "totd-fetch" });
    }
    return buildPendingTotdSnapshot(snapshotInput, { warnings });
  }

  async function runNadeoSync({ reason = "manual", length, offset, royal, downloadFiles } = {}) {
    const result = await syncTotdArchive({
      repository,
      nadeoClient,
      mapFilesDir: MAP_FILES_DIR,
      length: length ?? TOTD_SYNC_MONTH_LENGTH,
      offset: offset ?? TOTD_SYNC_MONTH_OFFSET,
      royal: royal ?? TOTD_SYNC_ROYAL,
      downloadFiles: downloadFiles ?? TOTD_DOWNLOAD_MAP_FILES,
    });
    const fetchState = repository.setFetchState({
      ...result,
      reason,
      warnings: result.fileDownloadErrors?.length
        ? result.fileDownloadErrors.map((item) => `${item.mapUid}: ${item.message}`)
        : [],
    });
    responseCache.clear();
    const page = repository.listTotdMaps({ limit: Math.min(30, Math.max(1, result.daysSeen || 1)), offset: 0 });
    return { ...fetchState, items: page.items.map((item) => sanitizeSnapshot(item)) };
  }

  async function runFetch({ reason = "manual" } = {}) {
    if (fetchInFlight) return fetchInFlight;
    fetchInFlight = (async () => {
      const startedAt = new Date().toISOString();
      try {
        if (nadeoClient.isConfigured()) return await runNadeoSync({ reason });

        const sourceResult = await totdClient.fetchLatest();
        const savedItems = [];
        for (const sourceMap of sourceResult.maps || []) {
          savedItems.push(repository.upsertSnapshot(await buildFetchedSnapshot(sourceMap)));
        }
        const fetchState = repository.setFetchState({
          status: sourceResult.status,
          reason,
          startedAt,
          finishedAt: new Date().toISOString(),
          mapsSeen: sourceResult.maps?.length || 0,
          mapsStored: savedItems.length,
          source: sourceResult.source || null,
          warnings: sourceResult.warnings || [],
        });
        if (savedItems.length) responseCache.clear();
        return { ...fetchState, items: savedItems.map((item) => sanitizeSnapshot(item)) };
      } catch (error) {
        repository.setFetchState({
          status: "error",
          reason,
          startedAt,
          finishedAt: new Date().toISOString(),
          mapsSeen: 0,
          mapsStored: 0,
          source: { mode: totdClient.isConfigured() ? "http" : "stub", urlConfigured: totdClient.isConfigured() },
          warnings: [error?.message || "TOTD fetch failed."],
        });
        throw error;
      }
    })();

    try {
      return await fetchInFlight;
    } finally {
      fetchInFlight = null;
    }
  }

  async function buildAdminSnapshot(body) {
    const hasManualClassification =
      body?.classification || body?.rankedStyles || body?.ranked_styles || body?.confidence || body?.classifier;
    const classification = hasManualClassification
      ? normalizeSnapshot({ ...body, source: "manual" }, { source: "manual" })
      : await classifierClient.classifyWithFallback({
          map: body?.cotd || body?.map || body,
          evidence: body?.evidence || body?.evidenceSummary || body?.records || {},
        });
    return normalizeSnapshot(body, { classification, source: "manual" });
  }

  async function runExclusiveNadeoSync(options) {
    if (fetchInFlight) return fetchInFlight;
    fetchInFlight = runNadeoSync(options);
    try {
      return await fetchInFlight;
    } finally {
      fetchInFlight = null;
    }
  }

  return {
    buildAdminSnapshot,
    get fetchInFlight() {
      return fetchInFlight;
    },
    runExclusiveNadeoSync,
    runFetch,
    runNadeoSync,
  };
}

export { createCotdWorkflow };
