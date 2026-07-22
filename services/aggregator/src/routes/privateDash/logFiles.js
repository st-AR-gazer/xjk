import fs from "node:fs/promises";
import path from "node:path";

import { clampInt } from "../../../../shared/valueUtils.js";

function normalizeLogDir(value) {
  return path.resolve(String(value || "").trim() || ".");
}

function parseLogFilename(fileName) {
  const match = /^(.*)-(out|error)\.log$/i.exec(String(fileName || "").trim());
  if (!match) return null;
  const service = String(match[1] || "").trim();
  const stream = String(match[2] || "")
    .trim()
    .toLowerCase();
  if (!service || (stream !== "out" && stream !== "error")) return null;
  return { service, stream };
}

function parseLocalLogFilename(fileName) {
  const match = /^(.*)-(\d{8}-\d{6})\.log$/i.exec(String(fileName || "").trim());
  if (!match) return null;
  const service = String(match[1] || "").trim();
  return service ? { service, stream: "out" } : null;
}

function createServiceLogEntry(service) {
  return {
    service,
    hasOut: false,
    hasError: false,
    outSizeBytes: 0,
    errorSizeBytes: 0,
    outUpdatedAt: null,
    errorUpdatedAt: null,
    fileCandidates: { out: [], error: [] },
    files: {},
  };
}

function getServiceLogEntry(serviceMap, service) {
  const serviceKey = service.toLowerCase();
  if (!serviceMap.has(serviceKey)) serviceMap.set(serviceKey, createServiceLogEntry(service));
  return serviceMap.get(serviceKey);
}

async function newestReadableFile(filePaths) {
  let best = null;
  for (const filePath of filePaths) {
    try {
      const stats = await fs.stat(filePath);
      const mtimeMs = Number(stats.mtimeMs || 0);
      if (!best || mtimeMs > best.mtimeMs) {
        best = {
          filePath,
          mtimeMs,
          size: Number(stats.size || 0),
          mtimeIso: stats.mtime?.toISOString?.() || null,
        };
      }
    } catch {}
  }
  return best;
}

function applyStreamMetadata(service, stream, file) {
  const isOutput = stream === "out";
  service[isOutput ? "hasOut" : "hasError"] = Boolean(file);
  service[isOutput ? "outSizeBytes" : "errorSizeBytes"] = Number(file?.size || 0);
  service[isOutput ? "outUpdatedAt" : "errorUpdatedAt"] = file?.mtimeIso || null;
  if (file) service.files[stream] = file.filePath;
}

async function collectServiceLogs(logDir) {
  const resolvedLogDir = normalizeLogDir(logDir);
  let entries;
  try {
    entries = await fs.readdir(resolvedLogDir, { withFileTypes: true });
  } catch (error) {
    return {
      logDir: resolvedLogDir,
      services: [],
      error: `Cannot read log directory: ${error?.message || "unknown error"}`,
    };
  }

  const serviceMap = new Map();
  for (const entry of entries) {
    if (!entry?.isFile?.()) continue;
    const parsed = parseLogFilename(entry.name) || parseLocalLogFilename(entry.name);
    if (!parsed) continue;
    const service = getServiceLogEntry(serviceMap, parsed.service);
    service.fileCandidates[parsed.stream].push(path.join(resolvedLogDir, entry.name));
  }

  const services = [...serviceMap.values()].sort((left, right) => left.service.localeCompare(right.service));
  await Promise.all(
    services.flatMap((service) =>
      ["out", "error"].map(async (stream) => {
        const candidates = Array.isArray(service.fileCandidates?.[stream]) ? service.fileCandidates[stream] : [];
        applyStreamMetadata(service, stream, await newestReadableFile(candidates));
      })
    )
  );

  return {
    logDir: resolvedLogDir,
    services: services.map((service) => ({ ...service, fileCandidates: undefined })),
    error: null,
  };
}

function countNewLines(buffer) {
  let count = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 10) count += 1;
  }
  return count;
}

async function readLogTail(filePath, { lines = 200, maxBytes = 1024 * 1024 } = {}) {
  const safeLines = clampInt(lines, { min: 10, max: 2000, fallback: 200 });
  const safeMaxBytes = clampInt(maxBytes, {
    min: 16 * 1024,
    max: 4 * 1024 * 1024,
    fallback: 1024 * 1024,
  });
  const fileHandle = await fs.open(filePath, "r");

  try {
    const stats = await fileHandle.stat();
    const totalSize = Number(stats.size || 0);
    if (totalSize <= 0) return { lines: [], truncated: false, totalSizeBytes: totalSize };

    let position = totalSize;
    let bytesCollected = 0;
    let newlineCount = 0;
    const chunks = [];

    while (position > 0 && bytesCollected < safeMaxBytes && newlineCount <= safeLines) {
      const readSize = Math.min(64 * 1024, position, safeMaxBytes - bytesCollected);
      if (readSize <= 0) break;
      position -= readSize;

      const buffer = Buffer.allocUnsafe(readSize);
      const { bytesRead } = await fileHandle.read(buffer, 0, readSize, position);
      if (bytesRead <= 0) break;
      const chunk = buffer.subarray(0, bytesRead);
      chunks.unshift(chunk);
      bytesCollected += bytesRead;
      newlineCount += countNewLines(chunk);
    }

    const rows = Buffer.concat(chunks).toString("utf8").replace(/\r\n/g, "\n").split("\n");
    if (rows.at(-1) === "") rows.pop();
    const tailRows = rows.slice(-safeLines);
    return {
      lines: tailRows,
      truncated: position > 0 || rows.length > tailRows.length,
      totalSizeBytes: totalSize,
    };
  } finally {
    await fileHandle.close();
  }
}

export { collectServiceLogs, normalizeLogDir, parseLocalLogFilename, parseLogFilename, readLogTail };
