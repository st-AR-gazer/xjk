import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readTextFileWithinLimit, safeRm, safeUnlink } from "../../../shared/backend/filesystem.js";
import { isTrackmaniaMapFilename } from "../../../shared/backend/uploads.js";
import { safeExt } from "../../../shared/backend/values.js";
import { parseJsonSafe } from "../../../../../services/shared/valueUtils.js";

function sanitizeDownloadName(name) {
  return (
    String(name || "download.bin")
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]+/g, "_")
      .replace(/["\\/\r\n]+/g, "_")
      .trim() || "download.bin"
  );
}

function parseBase64Upload(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  return /^data:[^;]+;base64,(.*)$/i.exec(trimmed)?.[1] || trimmed;
}

function sanitizeUploadId(value) {
  const text = String(value || "").trim();
  return /^[a-z0-9-]{16,}$/i.test(text) ? text : "";
}

function uploadInputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function createUploadStore({ runtime, logger = console }) {
  const { uploadCacheDir, uploadMapsDir } = runtime.paths;
  let pendingStoredUploads = 0;
  let maintenanceTimer = null;
  const metadataPath = (uploadId) => path.join(uploadCacheDir, `${uploadId}.json`);

  async function prune() {
    const entries = await fsp.readdir(uploadCacheDir, { withFileTypes: true }).catch(() => []);
    const cutoff = Date.now() - runtime.uploadRetentionMs;
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(uploadCacheDir, entry.name);
        const stat = await fsp.stat(fullPath).catch(() => null);
        if (stat && stat.mtimeMs < cutoff) await safeRm(fullPath);
      })
    );
  }

  function startMaintenance() {
    if (maintenanceTimer) return maintenanceTimer;
    prune().catch((error) => logger.warn("Stored upload cleanup failed:", error));
    maintenanceTimer = setInterval(
      () => prune().catch((error) => logger.warn("Stored upload cleanup failed:", error)),
      Math.min(Math.max(60 * 1000, Math.floor(runtime.uploadRetentionMs / 2)), 15 * 60 * 1000)
    );
    maintenanceTimer.unref?.();
    return maintenanceTimer;
  }

  function stopMaintenance() {
    if (maintenanceTimer) clearInterval(maintenanceTimer);
    maintenanceTimer = null;
  }

  async function store(buffer, originalname) {
    await prune();
    const entries = await fsp.readdir(uploadCacheDir, { withFileTypes: true }).catch(() => []);
    const storedCount = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json")).length;
    if (storedCount + pendingStoredUploads >= runtime.maxStoredUploads) {
      const error = new Error("Stored upload capacity is full. Try again after an older upload expires.");
      error.code = "TOOL_UPLOAD_STORAGE_FULL";
      error.statusCode = 503;
      error.retryAfterSeconds = 60;
      throw error;
    }
    pendingStoredUploads += 1;
    const uploadId = randomUUID();
    const filePath = path.join(uploadCacheDir, `${uploadId}${safeExt(originalname, ".Gbx")}`);
    const metaPath = metadataPath(uploadId);
    try {
      await fsp.writeFile(filePath, buffer);
      await fsp.writeFile(metaPath, JSON.stringify({ uploadId, originalname, path: filePath, createdAt: Date.now() }));
      return { uploadId, originalname, path: filePath, transient: false };
    } catch (error) {
      await Promise.all([safeUnlink(filePath), safeUnlink(metaPath)]);
      throw error;
    } finally {
      pendingStoredUploads -= 1;
    }
  }

  async function get(uploadId) {
    const safeUploadId = sanitizeUploadId(uploadId);
    if (!safeUploadId) return null;
    const raw = await readTextFileWithinLimit(metadataPath(safeUploadId), {
      maxBytes: 64 * 1024,
      missingValue: "",
    }).catch(() => "");
    const meta = raw ? parseJsonSafe(raw) : null;
    if (!meta || typeof meta !== "object" || !meta.path) return null;
    const candidate = path.resolve(String(meta.path));
    const relative = path.relative(path.resolve(uploadCacheDir), candidate);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(candidate)) return null;
    return {
      uploadId: safeUploadId,
      originalname: sanitizeDownloadName(String(meta.originalname || "map.Map.Gbx")),
      path: candidate,
      transient: false,
    };
  }

  async function materializeBase64(req) {
    const rawBase64 = parseBase64Upload(req.body?.mapBase64);
    if (!rawBase64) return null;
    const originalname = sanitizeDownloadName(String(req.body?.mapFileName || "map.Map.Gbx"));
    if (!isTrackmaniaMapFilename(originalname)) throw uploadInputError("mapFileName must be .Map.Gbx / .Gbx.");
    const buffer = Buffer.from(rawBase64, "base64");
    if (!buffer.length) throw uploadInputError("mapBase64 decoded to an empty file.");
    if (buffer.length > runtime.config.maxFileMb * 1024 * 1024) {
      throw uploadInputError(`Decoded map file exceeds max size of ${runtime.config.maxFileMb} MB.`);
    }
    const filePath = path.join(uploadMapsDir, `${randomUUID()}${safeExt(originalname, ".Gbx")}`);
    await fsp.writeFile(filePath, buffer);
    return { path: filePath, originalname, transient: true };
  }

  async function materializeRaw(req) {
    const buffer = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buffer?.length) throw uploadInputError("Raw map upload body is empty.");
    if (buffer.length > runtime.config.maxFileMb * 1024 * 1024) {
      throw uploadInputError(`Uploaded map file exceeds max size of ${runtime.config.maxFileMb} MB.`);
    }
    const originalname = sanitizeDownloadName(
      String(req.query?.mapFileName || req.get("x-map-filename") || "map.Map.Gbx")
    );
    if (!isTrackmaniaMapFilename(originalname)) throw uploadInputError("mapFileName must be .Map.Gbx / .Gbx.");
    return store(buffer, originalname);
  }

  async function fromRequest(req) {
    const uploaded = req.files?.map?.[0];
    if (uploaded) return { ...uploaded, transient: true };
    const uploadId = String(req.body?.uploadId || req.query?.uploadId || "").trim();
    return uploadId ? get(uploadId) : materializeBase64(req);
  }

  return { fromRequest, get, materializeRaw, prune, startMaintenance, stopMaintenance, store };
}

export { createUploadStore, parseBase64Upload, sanitizeDownloadName, sanitizeUploadId, uploadInputError };
