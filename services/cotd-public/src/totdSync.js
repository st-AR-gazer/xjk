import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureDirectorySync } from "../../shared/fsUtils.js";
import { toTextOrFallback as asText, utcNowIso } from "../../shared/valueUtils.js";
import { flattenTotdMonths } from "./totdDay.js";

function safeMapFilename(mapUid) {
  const safeUid = asText(mapUid, "unknown-map").replace(/[^A-Za-z0-9_-]/g, "-");
  return `${safeUid}.Map.Gbx`;
}

async function downloadAndStoreMapFile({ repository, nadeoClient, mapFilesDir, candidate }) {
  const mapUid = asText(candidate.mapUid);
  const filename = safeMapFilename(mapUid);
  const storagePath = path.join(mapFilesDir, filename);
  const relativePath = path.relative(path.dirname(mapFilesDir), storagePath);
  const tmpPath = `${storagePath}.${process.pid}.${Date.now()}.tmp`;

  ensureDirectorySync(mapFilesDir);
  const bytes = await nadeoClient.downloadMapFile(candidate.fileUrl);
  fs.writeFileSync(tmpPath, bytes);
  fs.renameSync(tmpPath, storagePath);

  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  return repository.upsertMapFile({
    mapUid,
    mapId: candidate.mapId,
    fileUrl: candidate.fileUrl,
    filename,
    storagePath,
    relativePath,
    sha256,
    sizeBytes: bytes.length,
    status: "downloaded",
    error: null,
    downloadedAt: utcNowIso(),
  });
}

async function syncTotdArchive({
  repository,
  nadeoClient,
  mapFilesDir,
  length = 1,
  offset = 0,
  royal = false,
  downloadFiles = true,
} = {}) {
  const startedAt = utcNowIso();
  const payload = await nadeoClient.fetchTotdMonths({ length, offset, royal });
  const days = flattenTotdMonths(payload);
  const daysStored = repository.upsertTotdDays(days);
  const mapUids = [...new Set(days.map((day) => day.mapUid).filter(Boolean))];

  const mapInfos = mapUids.length ? await nadeoClient.fetchMapInfosByUids(mapUids) : [];
  const mapInfosStored = repository.upsertMapInfos(mapInfos);

  const downloaded = [];
  const downloadErrors = [];
  if (downloadFiles && mapUids.length) {
    const candidates = repository.listMapFileDownloadCandidates({ mapUids });
    for (const candidate of candidates) {
      try {
        downloaded.push(
          await downloadAndStoreMapFile({
            repository,
            nadeoClient,
            mapFilesDir,
            candidate,
          })
        );
      } catch (error) {
        downloadErrors.push({
          mapUid: candidate.mapUid,
          message: error?.message || "Map file download failed.",
        });
        repository.upsertMapFile({
          mapUid: candidate.mapUid,
          mapId: candidate.mapId,
          fileUrl: candidate.fileUrl,
          filename: candidate.filename,
          status: "error",
          error: error?.message || "Map file download failed.",
        });
      }
    }
  }

  const finishedAt = utcNowIso();
  return {
    status: "ok",
    source: {
      mode: "nadeo",
      totdEndpoint: "https://live-services.trackmania.nadeo.live/api/token/campaign/month",
      mapInfoEndpoint: "https://prod.trackmania.core.nadeo.online/maps/by-uid/",
    },
    startedAt,
    finishedAt,
    request: {
      length: Math.max(1, Number(length) || 1),
      offset: Math.max(0, Number(offset) || 0),
      royal: Boolean(royal),
      downloadFiles: Boolean(downloadFiles),
    },
    monthsSeen: Array.isArray(payload?.monthList) ? payload.monthList.length : 0,
    daysSeen: days.length,
    daysStored,
    uniqueMapUids: mapUids.length,
    mapInfosSeen: mapInfos.length,
    mapInfosStored,
    filesDownloaded: downloaded.length,
    fileDownloadErrors: downloadErrors,
    nextRequestTimestamp: payload?.nextRequestTimestamp ?? null,
    relativeNextRequest: payload?.relativeNextRequest ?? null,
  };
}

export { flattenTotdMonths, syncTotdArchive };
