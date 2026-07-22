import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ensureDirectorySync } from "../../shared/fsUtils.js";

const GBX_HEADER_PROBE_BYTES = 64;
const GBX_CLASS_IDS = Object.freeze({
  map: new Set([0x03043000]),
  replay: new Set([0x03092000, 0x03093000]),
});

function createRequestError(message, statusCode = 400, code = "invalid_request") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function validateFilename(kind, rawFilename) {
  const filename = String(rawFilename || "").trim();
  if (!filename) {
    throw createRequestError("filename is required.");
  }

  const lower = filename.toLowerCase();
  const allowedSuffixes = kind === "map" ? [".map.gbx", ".gbx"] : [".replay.gbx", ".ghost.gbx", ".gbx"];

  if (!allowedSuffixes.some((suffix) => lower.endsWith(suffix))) {
    throw createRequestError(
      kind === "map"
        ? "Map uploads must use a .Map.Gbx or .Gbx filename."
        : "Replay uploads must use a .Replay.Gbx, .Ghost.Gbx, or .Gbx filename."
    );
  }

  return filename;
}

function parseContentLength(req, maxBytes) {
  const raw = req.headers["content-length"];
  if (!raw) {
    throw createRequestError("Content-Length is required.");
  }

  const length = Number(raw);
  if (!Number.isInteger(length) || length <= 0) {
    throw createRequestError("Content-Length must be a positive integer.");
  }

  if (length > maxBytes) {
    throw createRequestError(`Uploaded file exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MiB size limit.`);
  }

  return length;
}

function validateContentType(req) {
  const contentType = String(req.headers["content-type"] || "")
    .trim()
    .toLowerCase();
  if (contentType && !contentType.startsWith("application/octet-stream")) {
    throw createRequestError("Content-Type must be application/octet-stream.");
  }
}

function validateGbxStructure(kind, buffer, sizeBytes = buffer?.length || 0) {
  if (!Buffer.isBuffer(buffer) || !GBX_CLASS_IDS[kind]) return false;
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || buffer.length < 13) return false;
  if (buffer.subarray(0, 3).toString("ascii") !== "GBX") return false;

  const version = buffer.readUInt16LE(3);
  if (version < 3) return false;
  if (buffer[5] !== 0x42) return false; // B: binary GBX, the format accepted by the validation workers.
  if (buffer[6] !== 0x43 && buffer[6] !== 0x55) return false; // C/U: reference-table compression.
  if (buffer[7] !== 0x43 && buffer[7] !== 0x55) return false; // C/U: body compression.

  let classIdOffset = 8;
  if (version >= 4) {
    if (buffer[8] !== 0x52) return false; // R: remap-aware GBX header marker.
    classIdOffset = 9;
  }

  if (buffer.length < classIdOffset + 12 || sizeBytes < classIdOffset + 12) return false;
  const classId = buffer.readUInt32LE(classIdOffset);
  if (!GBX_CLASS_IDS[kind].has(classId)) return false;

  const userDataSize = buffer.readUInt32LE(classIdOffset + 4);
  if (userDataSize > sizeBytes - (classIdOffset + 8)) return false;
  if (userDataSize > 0) {
    const headerChunkCount = buffer.readUInt32LE(classIdOffset + 8);
    if (headerChunkCount > 4096 || 4 + headerChunkCount * 8 > userDataSize) return false;
  }

  return true;
}

async function streamRequestToTempFile(req, tempPath, maxBytes, declaredLength) {
  ensureDirectorySync(path.dirname(tempPath));

  const hash = crypto.createHash("sha256");
  const writer = fs.createWriteStream(tempPath, { flags: "wx" });
  let bytesWritten = 0;
  let headerBytes = Buffer.alloc(0);

  try {
    await new Promise((resolve, reject) => {
      let settled = false;

      function fail(error) {
        if (settled) return;
        settled = true;
        reject(error);
      }

      function succeed() {
        if (settled) return;
        settled = true;
        resolve();
      }

      req.on("aborted", () => fail(createRequestError("Upload was interrupted by the client.")));
      req.on("error", fail);
      writer.on("error", fail);
      writer.on("finish", succeed);

      req.on("data", (chunk) => {
        bytesWritten += chunk.length;
        if (bytesWritten > declaredLength) {
          fail(createRequestError("Uploaded file length did not match Content-Length."));
          req.destroy();
          writer.destroy();
          return;
        }
        if (bytesWritten > maxBytes) {
          fail(createRequestError(`Uploaded file exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MiB size limit.`));
          req.destroy();
          writer.destroy();
          return;
        }

        if (headerBytes.length < GBX_HEADER_PROBE_BYTES) {
          const needed = GBX_HEADER_PROBE_BYTES - headerBytes.length;
          headerBytes = Buffer.concat([headerBytes, chunk.subarray(0, needed)]);
        }

        hash.update(chunk);
        if (!writer.write(chunk)) {
          req.pause();
          writer.once("drain", () => req.resume());
        }
      });

      req.on("end", () => writer.end());
    });
  } catch (error) {
    try {
      writer.destroy();
    } catch {}
    throw error;
  }

  return {
    bytesWritten,
    headerBytes,
    sha256: hash.digest("hex"),
  };
}

async function storeArtifactUpload({ req, kind, filename, maxBytes, artifactRoot, repository, uploadQuota }) {
  const originalFilename = validateFilename(kind, filename);
  validateContentType(req);
  const declaredLength = parseContentLength(req, maxBytes);
  if (!uploadQuota?.acquire) {
    throw new Error("Upload quota enforcement is not configured.");
  }
  const quotaLease = uploadQuota.acquire({ req, byteCount: declaredLength });
  let tempPath = "";

  try {
    tempPath = path.join(artifactRoot, "tmp", `${kind}-${Date.now()}-${crypto.randomUUID().replace(/-/g, "")}.upload`);
    const streamed = await streamRequestToTempFile(req, tempPath, maxBytes, declaredLength);
    if (streamed.bytesWritten !== declaredLength) {
      throw createRequestError("Uploaded file length did not match Content-Length.");
    }
    if (streamed.bytesWritten <= 0) {
      throw createRequestError("Uploaded file was empty.");
    }
    if (!validateGbxStructure(kind, streamed.headerBytes, streamed.bytesWritten)) {
      throw createRequestError(
        kind === "map"
          ? "Uploaded file was not a structurally valid Trackmania map GBX payload."
          : "Uploaded file was not a structurally valid Trackmania replay or ghost GBX payload."
      );
    }

    const finalDir = path.join(artifactRoot, kind, streamed.sha256.slice(0, 2));
    const finalPath = path.join(finalDir, `${streamed.sha256}.gbx`);
    ensureDirectorySync(finalDir);

    if (fs.existsSync(finalPath)) {
      fs.unlinkSync(tempPath);
    } else {
      fs.renameSync(tempPath, finalPath);
    }

    const result = repository.createOrReuseArtifact({
      kind,
      sha256: streamed.sha256,
      sizeBytes: streamed.bytesWritten,
      originalFilename,
      storagePath: finalPath,
    });

    return {
      artifact_ref: result.artifact.artifact_ref,
      kind: result.artifact.kind,
      size_bytes: result.artifact.size_bytes,
      sha256: result.artifact.sha256,
      expires_at: result.artifact.expires_at,
      reused: result.reused,
    };
  } catch (error) {
    try {
      if (tempPath && fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {}
    throw error;
  } finally {
    quotaLease.release();
  }
}

export { createRequestError, parseContentLength, storeArtifactUpload, validateGbxStructure };
