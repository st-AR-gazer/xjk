import crypto from "node:crypto";
import { createRequestError } from "./uploadService.js";

function normalizeClientAddress(req) {
  const address = String(req?.ip || req?.socket?.remoteAddress || "unknown")
    .trim()
    .toLowerCase();
  return address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
}

function clientKeyForRequest(req) {
  return crypto
    .createHash("sha256")
    .update(`validifier-upload:${normalizeClientAddress(req)}`)
    .digest("hex");
}

function createQuotaError(message, code, retryAfterSeconds) {
  const error = createRequestError(message, 429, code);
  error.retryAfterSeconds = Math.max(1, Math.ceil(Number(retryAfterSeconds) || 1));
  return error;
}

function secondsUntilNextUtcDay(nowMs) {
  const now = new Date(nowMs);
  const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((nextDay - nowMs) / 1000));
}

function createUploadQuotaManager({
  repository,
  bytesPerDay,
  globalBytesPerDay,
  maxConcurrent,
  globalMaxConcurrent,
  now = Date.now,
} = {}) {
  if (!repository?.reserveUploadBytes) {
    throw new Error("A repository with reserveUploadBytes is required for upload quotas.");
  }

  const dailyLimit = Math.max(1, Number(bytesPerDay) || 1);
  const globalDailyLimit = Math.max(dailyLimit, Number(globalBytesPerDay) || dailyLimit);
  const perClientConcurrency = Math.max(1, Number(maxConcurrent) || 1);
  const globalConcurrency = Math.max(1, Number(globalMaxConcurrent) || perClientConcurrency);
  const activeByClient = new Map();
  let activeTotal = 0;

  function acquire({ req, clientKey = "", byteCount } = {}) {
    const resolvedClientKey = clientKey || clientKeyForRequest(req);
    const bytes = Number(byteCount);
    if (!Number.isSafeInteger(bytes) || bytes <= 0) {
      throw createRequestError("Upload byte count must be a positive integer.");
    }

    const activeForClient = activeByClient.get(resolvedClientKey) || 0;
    if (activeForClient >= perClientConcurrency || activeTotal >= globalConcurrency) {
      throw createQuotaError(
        "Too many uploads are already in progress. Please retry shortly.",
        "upload_concurrency_limited",
        1
      );
    }

    const nowMs = now();
    const reservation = repository.reserveUploadBytes({
      clientKey: resolvedClientKey,
      byteCount: bytes,
      bytesPerDay: dailyLimit,
      globalBytesPerDay: globalDailyLimit,
      nowMs,
    });
    if (!reservation?.allowed) {
      throw createQuotaError(
        reservation?.scope === "global"
          ? "The service-wide daily upload byte allowance has been reached."
          : "The daily upload byte allowance for this client has been reached.",
        "upload_quota_exceeded",
        secondsUntilNextUtcDay(nowMs)
      );
    }

    activeByClient.set(resolvedClientKey, activeForClient + 1);
    activeTotal += 1;
    let released = false;
    return {
      clientKey: resolvedClientKey,
      release() {
        if (released) return;
        released = true;
        activeTotal = Math.max(0, activeTotal - 1);
        const nextCount = Math.max(0, (activeByClient.get(resolvedClientKey) || 1) - 1);
        if (nextCount) activeByClient.set(resolvedClientKey, nextCount);
        else activeByClient.delete(resolvedClientKey);
      },
    };
  }

  function snapshot() {
    return { activeTotal, activeByClient: new Map(activeByClient) };
  }

  return { acquire, snapshot };
}

export { clientKeyForRequest, createUploadQuotaManager, normalizeClientAddress };
