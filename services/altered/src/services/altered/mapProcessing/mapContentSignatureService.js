import {
  fs,
  normalizeAccountId,
  ASSET_FALLBACK_SIGNATURE_VERSION,
  CONTENT_SIGNATURE_VERSION,
  countSignatureTokens,
  resolveMapCampaignName,
  resolveMapDownloadUrl,
  resolveMapSlot,
  resolveMapUid,
  sanitizeResolvedDisplayName,
  toText,
  uniqueBy,
} from "../serviceSupport.js";

function normalizeSignatureMaps(maps) {
  return uniqueBy(
    (Array.isArray(maps) ? maps : [])
      .map((map) => ({
        mapUid: resolveMapUid(map),
        name: toText(map?.name || map?.mapName || map?.title || resolveMapUid(map)),
        author: normalizeAccountId(map?.author || map?.authorAccountId || map?.author_account_id),
        downloadUrl: resolveMapDownloadUrl(map),
        campaignName: resolveMapCampaignName(map),
        slot: resolveMapSlot(map),
      }))
      .filter((map) => map.mapUid),
    (map) => map.mapUid.toLowerCase()
  );
}

function createProgressReporter(onProgress, logger) {
  if (typeof onProgress !== "function") return () => {};
  return (partial = {}) => {
    try {
      onProgress(partial);
    } catch (error) {
      logger.warn(`[altered-signatures] progress callback failed: ${error?.message || error}`);
    }
  };
}

function resolveCachedSignature({ map, localFile, existing, force }) {
  const reusable =
    !force &&
    existing &&
    existing.extractionVersion === CONTENT_SIGNATURE_VERSION &&
    existing.signature &&
    toText(existing.signature?.version) === CONTENT_SIGNATURE_VERSION &&
    existing.sourceStatus === "ready" &&
    localFile?.status === "ready" &&
    existing.fileSha256 &&
    existing.fileSha256 === localFile.fileSha256;
  if (reusable) return { record: existing, summaryKey: "reused", persist: false };

  const extractedAt = new Date().toISOString();
  if (!localFile || localFile.status === "missing") {
    return {
      record: {
        mapUid: map.mapUid,
        extractionVersion: CONTENT_SIGNATURE_VERSION,
        fileSha256: null,
        downloadUrl: map.downloadUrl || null,
        printableTokenCount: 0,
        assetTokenCount: 0,
        signature: null,
        sourceStatus: "missing-download",
        sourceError: localFile?.lastError || "Local map copy is missing.",
        extractedAt,
      },
      summaryKey: "missingDownload",
      persist: true,
    };
  }

  if (localFile.status !== "error") return null;
  return {
    record: {
      mapUid: map.mapUid,
      extractionVersion: CONTENT_SIGNATURE_VERSION,
      fileSha256: localFile.fileSha256 || null,
      downloadUrl: localFile.downloadUrl || map.downloadUrl || null,
      printableTokenCount: 0,
      assetTokenCount: 0,
      signature: null,
      sourceStatus: "error",
      sourceError: localFile.lastError || "Local map copy is in an error state.",
      extractedAt,
    },
    summaryKey: "errors",
    persist: true,
  };
}

class MapContentSignatureService {
  constructor({
    repository,
    logger = console,
    ensureMapLocalFiles,
    getPreferredMapLocalFiles,
    getLocalMapFileAbsolutePath,
    parseMapLayouts,
    extractContentSignature,
  }) {
    this.repository = repository;
    this.logger = logger;
    this.ensureMapLocalFiles = ensureMapLocalFiles;
    this.getPreferredMapLocalFiles = getPreferredMapLocalFiles;
    this.getLocalMapFileAbsolutePath = getLocalMapFileAbsolutePath;
    this.parseMapLayouts = parseMapLayouts;
    this.extractContentSignature = extractContentSignature;
  }

  async ensureMapContentSignatures(maps = [], { force = false, onProgress = null } = {}) {
    const reportSignatureProgress = createProgressReporter(onProgress, this.logger);
    const normalizedMaps = normalizeSignatureMaps(maps);
    if (!normalizedMaps.length) {
      return {
        records: [],
        summary: {
          total: 0,
          reused: 0,
          downloaded: 0,
          errors: 0,
          missingDownload: 0,
        },
      };
    }

    const localFiles = await this.ensureMapLocalFiles(normalizedMaps, { force });
    const localFilesByUid = new Map(
      this.getPreferredMapLocalFiles({
        mapUids: normalizedMaps.map((map) => map.mapUid),
      })
        .filter((record) => record?.mapUid)
        .map((record) => [String(record.mapUid).toLowerCase(), record])
    );

    const existingByUid = new Map(
      this.repository.mapFiles
        .getMapContentSignatures({
          mapUids: normalizedMaps.map((map) => map.mapUid),
        })
        .map((record) => [record.mapUid.toLowerCase(), record])
    );

    const records = [];
    const upsertRecords = [];
    const savedDisplayNamesByMapUid = {};
    const summary = {
      total: normalizedMaps.length,
      reused: 0,
      parsed: 0,
      errors: 0,
      missingDownload: 0,
    };
    reportSignatureProgress({
      phase: "prepare",
      total: normalizedMaps.length,
      ready: 0,
      reused: 0,
      parsed: 0,
      errors: 0,
      missingDownload: 0,
    });
    const resolvedRecordKeys = new Set();

    for (const map of normalizedMaps) {
      const localFile = localFilesByUid.get(map.mapUid.toLowerCase()) || null;
      const cacheKey = map.mapUid.toLowerCase();
      const existing = existingByUid.get(cacheKey) || null;
      const cached = resolveCachedSignature({ map, localFile, existing, force });
      if (!cached) continue;
      summary[cached.summaryKey] += 1;
      records.push(cached.record);
      if (cached.persist) upsertRecords.push(cached.record);
      resolvedRecordKeys.add(cacheKey);
    }
    reportSignatureProgress({
      phase: "local-cache",
      total: normalizedMaps.length,
      ready: records.length,
      reused: summary.reused,
      parsed: summary.parsed,
      errors: summary.errors,
      missingDownload: summary.missingDownload,
    });

    const mapsToParse = normalizedMaps
      .map((map) => {
        if (resolvedRecordKeys.has(map.mapUid.toLowerCase())) return null;
        const localFile = localFilesByUid.get(map.mapUid.toLowerCase()) || null;
        if (!localFile || localFile.status !== "ready") return null;
        return {
          ...map,
          localFile,
          filePath: this.getLocalMapFileAbsolutePath(map.mapUid, localFile.relativePath),
        };
      })
      .filter(Boolean);

    if (mapsToParse.length) {
      const parserBatchSize = 15;
      reportSignatureProgress({
        phase: "parsing",
        total: normalizedMaps.length,
        ready: records.length,
        reused: summary.reused,
        parsed: summary.parsed,
        errors: summary.errors,
        missingDownload: summary.missingDownload,
        parserRemaining: mapsToParse.length,
        currentMapUid: mapsToParse[0]?.mapUid || null,
        currentMapName:
          mapsToParse.length > 1
            ? `${toText(mapsToParse[0]?.name || mapsToParse[0]?.mapUid)} (+${mapsToParse.length - 1} more)`
            : toText(mapsToParse[0]?.name || mapsToParse[0]?.mapUid),
      });
      for (let index = 0; index < mapsToParse.length; index += parserBatchSize) {
        const parserBatch = mapsToParse.slice(index, index + parserBatchSize);
        const currentBatchLead = parserBatch[0] || null;
        let parserPayload = null;
        let parserFailure = null;
        try {
          parserPayload = await this.parseMapLayouts(parserBatch, {
            timeoutMs: 5 * 60 * 1000,
          });
        } catch (error) {
          parserFailure = error;
        }

        const parsedByUid = new Map(
          (Array.isArray(parserPayload?.maps) ? parserPayload.maps : [])
            .filter((entry) => entry?.mapUid)
            .map((entry) => [String(entry.mapUid).toLowerCase(), entry])
        );

        for (const map of parserBatch) {
          const parsed = parsedByUid.get(map.mapUid.toLowerCase()) || null;
          const parsedAuthorNickname = sanitizeResolvedDisplayName(parsed?.authorNickname, {
            accountId: parsed?.authorLogin || map.author || "",
          });
          if (parsedAuthorNickname) {
            savedDisplayNamesByMapUid[map.mapUid] = {
              authorSavedDisplayName: parsedAuthorNickname,
              authorAccountId: parsed?.authorLogin || map.author || "",
            };
          }
          let signature = parsed?.signature || null;
          let sourceError = toText(parsed?.error) || null;
          if (!signature) {
            const buffer = await fs.readFile(map.filePath);
            signature = this.extractContentSignature(buffer);
            if (parserFailure?.message) {
              sourceError = sourceError
                ? `${sourceError} | fallback=${parserFailure.message}`
                : `fallback=${parserFailure.message}`;
            } else if (signature?.version === ASSET_FALLBACK_SIGNATURE_VERSION) {
              sourceError = sourceError
                ? `${sourceError} | fallback=asset-token-signature`
                : "fallback=asset-token-signature";
            }
          }

          const record = {
            mapUid: map.mapUid,
            extractionVersion: toText(signature?.version) || CONTENT_SIGNATURE_VERSION,
            fileSha256: map.localFile.fileSha256 || null,
            downloadUrl: map.localFile.downloadUrl || map.downloadUrl,
            printableTokenCount: Number(signature?.printableSegments || 0),
            assetTokenCount: countSignatureTokens(signature),
            signature,
            sourceStatus: signature ? "ready" : "error",
            sourceError,
            extractedAt: new Date().toISOString(),
          };
          if (signature) summary.parsed += 1;
          if (!signature) summary.errors += 1;
          records.push(record);
          upsertRecords.push(record);
        }
        reportSignatureProgress({
          phase: "parsing",
          total: normalizedMaps.length,
          ready: records.length,
          reused: summary.reused,
          parsed: summary.parsed,
          errors: summary.errors,
          missingDownload: summary.missingDownload,
          parserRemaining: Math.max(0, mapsToParse.length - (index + parserBatch.length)),
          currentMapUid: currentBatchLead?.mapUid || null,
          currentMapName:
            parserBatch.length > 1
              ? `${toText(currentBatchLead?.name || currentBatchLead?.mapUid)} (+${parserBatch.length - 1} more)`
              : toText(currentBatchLead?.name || currentBatchLead?.mapUid),
        });
      }
    }

    const upsert = this.repository.mapFiles.upsertMapContentSignatures({
      records: upsertRecords,
    });
    if (Object.keys(savedDisplayNamesByMapUid).length) {
      const savedNames = this.repository.mappers.updateMapSavedDisplayNames({
        namesByMapUid: savedDisplayNamesByMapUid,
      });
      if (savedNames?.error) {
        this.logger.warn(`[altered-signatures] saved mapper nickname sync warning: ${savedNames.error}`);
      }
    }
    reportSignatureProgress({
      phase: "complete",
      total: normalizedMaps.length,
      ready: records.length,
      reused: summary.reused,
      parsed: summary.parsed,
      errors: summary.errors,
      missingDownload: summary.missingDownload,
    });

    return {
      records,
      summary,
      localFiles: localFiles.summary,
      upsert,
    };
  }
}

export { MapContentSignatureService };
