import fs from "node:fs";
import os from "node:os";
import { ensureParentDirectorySync, readJsonFileSync, safeUnlinkSync, writeJsonFileSync } from "./fsUtils.js";
import { delay as sleep } from "./valueUtils.js";

function toSafeInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function readLastRequestMs(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return toSafeInt(String(raw || "").trim(), 0);
  } catch {
    return 0;
  }
}

function writeLastRequestMs(filePath, value) {
  fs.writeFileSync(filePath, String(toSafeInt(value, 0)), "utf8");
}

function queueFilePathFor(stateFile) {
  return `${String(stateFile || "").trim()}.queue.json`;
}

function asIsoString(value, fallback = null) {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) return fallback;
  return new Date(ts).toISOString();
}

function queueTimestampMs(entry = {}) {
  const ts =
    Date.parse(String(entry?.lastUpdatedAt || "")) ||
    Date.parse(String(entry?.completedAt || "")) ||
    Date.parse(String(entry?.grantedAt || "")) ||
    Date.parse(String(entry?.enqueuedAt || ""));
  return Number.isFinite(ts) ? ts : 0;
}

function sanitizeQueueEntry(raw = {}, nowIso = new Date().toISOString()) {
  const id = String(raw?.id || "").trim();
  if (!id) return null;
  const statusText = String(raw?.status || "pending")
    .trim()
    .toLowerCase();
  const status =
    statusText === "pending" || statusText === "active" || statusText === "done" || statusText === "error"
      ? statusText
      : "pending";
  return {
    id,
    label: String(raw?.label || "").trim() || "nadeo-request",
    pid: toSafeInt(raw?.pid, 0),
    host: String(raw?.host || "").trim() || "",
    status,
    enqueuedAt: asIsoString(raw?.enqueuedAt, nowIso),
    grantedAt: asIsoString(raw?.grantedAt, null),
    completedAt: asIsoString(raw?.completedAt, null),
    requestedWaitMs: toSafeInt(raw?.requestedWaitMs, 0),
    appliedWaitMs: toSafeInt(raw?.appliedWaitMs, 0),
    error: String(raw?.error || "").trim(),
    lastUpdatedAt: asIsoString(raw?.lastUpdatedAt, nowIso),
  };
}

function pruneQueueEntries(
  entries = [],
  { nowMs = Date.now(), completedRetentionMs = 120000, stalePendingMs = 900000, maxItems = 500 } = {}
) {
  const safeCompletedRetentionMs = Math.max(1000, toSafeInt(completedRetentionMs, 120000));
  const safeStalePendingMs = Math.max(30000, toSafeInt(stalePendingMs, 900000));
  const safeMaxItems = Math.max(20, toSafeInt(maxItems, 500));

  const filtered = (Array.isArray(entries) ? entries : []).filter((entry) => {
    const status = String(entry?.status || "").toLowerCase();
    const updatedMs = queueTimestampMs(entry);
    if (!updatedMs) return false;
    const ageMs = Math.max(0, nowMs - updatedMs);
    if (status === "done" || status === "error") {
      return ageMs <= safeCompletedRetentionMs;
    }
    return ageMs <= safeStalePendingMs;
  });

  filtered.sort((a, b) => queueTimestampMs(a) - queueTimestampMs(b));
  if (filtered.length > safeMaxItems) {
    return filtered.slice(filtered.length - safeMaxItems);
  }
  return filtered;
}

function normalizeQueueState(raw = {}, { stateFile = "", minGapMs = 0, nowIso = new Date().toISOString() } = {}) {
  const safeStateFile = String(stateFile || raw?.stateFile || "").trim();
  const safeMinGapMs = Math.max(0, toSafeInt(minGapMs || raw?.minGapMs, 0));
  const entriesRaw = Array.isArray(raw?.waiters) ? raw.waiters : [];
  const entries = entriesRaw.map((entry) => sanitizeQueueEntry(entry, nowIso)).filter(Boolean);
  return {
    version: 1,
    stateFile: safeStateFile,
    minGapMs: safeMinGapMs,
    activeWaiterId: String(raw?.activeWaiterId || "").trim(),
    lastGrantedAt: asIsoString(raw?.lastGrantedAt, null),
    lastRequestAtMs: toSafeInt(raw?.lastRequestAtMs, 0),
    updatedAt: asIsoString(raw?.updatedAt, nowIso),
    waiters: entries,
  };
}

async function acquireLock(lockPath, { pollMs = 25, staleAfterMs = 120000 } = {}) {
  const safePollMs = Math.max(5, toSafeInt(pollMs, 25));
  const safeStaleMs = Math.max(1000, toSafeInt(staleAfterMs, 120000));

  for (;;) {
    try {
      return fs.openSync(lockPath, "wx");
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - Number(stat.mtimeMs || 0) > safeStaleMs) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch {
        // Lock file can disappear between stat/unlink; ignore and retry.
      }
      await sleep(safePollMs);
    }
  }
}

async function withQueueLock(queueFilePath, { pollMs = 25, staleAfterMs = 120000 } = {}, fn = async () => {}) {
  const lockPath = `${queueFilePath}.lock`;
  const lockFd = await acquireLock(lockPath, { pollMs, staleAfterMs });
  try {
    return await fn();
  } finally {
    try {
      fs.closeSync(lockFd);
    } catch {}
    safeUnlinkSync(lockPath);
  }
}

async function mutateQueueState(
  queueFilePath,
  { stateFile = "", minGapMs = 0, pollMs = 25, staleAfterMs = 120000 } = {},
  mutator = (state) => state
) {
  if (!queueFilePath) return null;
  ensureParentDirectorySync(queueFilePath);
  return withQueueLock(queueFilePath, { pollMs, staleAfterMs }, async () => {
    const nowIso = new Date().toISOString();
    const existing = readJsonFileSync(queueFilePath, {});
    const state = normalizeQueueState(existing, { stateFile, minGapMs, nowIso });
    state.waiters = pruneQueueEntries(state.waiters, {
      nowMs: Date.now(),
      completedRetentionMs: 120000,
      stalePendingMs: Math.max(900000, toSafeInt(staleAfterMs, 120000) * 4),
      maxItems: 500,
    });

    const next = mutator(state) || state;
    const normalized = normalizeQueueState(next, {
      stateFile: stateFile || next?.stateFile,
      minGapMs: minGapMs || next?.minGapMs,
      nowIso: new Date().toISOString(),
    });
    normalized.waiters = pruneQueueEntries(normalized.waiters, {
      nowMs: Date.now(),
      completedRetentionMs: 120000,
      stalePendingMs: Math.max(900000, toSafeInt(staleAfterMs, 120000) * 4),
      maxItems: 500,
    });
    writeJsonFileSync(queueFilePath, normalized);
    return normalized;
  });
}

function parseQueueSnapshot(stateFile, { minGapMs = 0, maxItems = 120 } = {}) {
  const safeStateFile = String(stateFile || "").trim();
  if (!safeStateFile) {
    return {
      configured: false,
      error: "Global throttle state file is not configured.",
      stateFile: "",
      queueFile: "",
      lockFile: "",
      minGapMs: Math.max(0, toSafeInt(minGapMs, 0)),
      pendingCount: 0,
      oldestPendingSeconds: null,
      activeWaiterId: "",
      lastRequestAtMs: 0,
      lastRequestAt: null,
      secondsSinceLastRequest: null,
      lastGrantedAt: null,
      waiters: [],
    };
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const queueFile = queueFilePathFor(safeStateFile);
  const rawQueue = readJsonFileSync(queueFile, {});
  const normalized = normalizeQueueState(rawQueue, {
    stateFile: safeStateFile,
    minGapMs: Math.max(0, toSafeInt(minGapMs || rawQueue?.minGapMs, 0)),
    nowIso,
  });
  normalized.waiters = pruneQueueEntries(normalized.waiters, {
    nowMs,
    completedRetentionMs: 120000,
    stalePendingMs: 900000,
    maxItems: 500,
  });

  const safeMaxItems = Math.max(1, Math.min(500, toSafeInt(maxItems, 120)));
  const waiters = [...normalized.waiters]
    .sort((a, b) => queueTimestampMs(a) - queueTimestampMs(b))
    .slice(-safeMaxItems);
  const pendingWaiters = waiters.filter((entry) => entry.status === "pending" || entry.status === "active");
  const oldestPendingMs = pendingWaiters
    .map((entry) => Date.parse(String(entry.enqueuedAt || "")))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)[0];

  const lastRequestAtMs = readLastRequestMs(safeStateFile);
  const lastRequestAt =
    Number.isFinite(lastRequestAtMs) && lastRequestAtMs > 0 ? new Date(lastRequestAtMs).toISOString() : null;

  return {
    configured: true,
    error: null,
    stateFile: safeStateFile,
    queueFile,
    lockFile: `${safeStateFile}.lock`,
    minGapMs: normalized.minGapMs,
    pendingCount: pendingWaiters.length,
    oldestPendingSeconds:
      Number.isFinite(oldestPendingMs) && oldestPendingMs > 0 ? Math.max(0, (nowMs - oldestPendingMs) / 1000) : null,
    activeWaiterId: normalized.activeWaiterId || "",
    lastRequestAtMs: Number.isFinite(lastRequestAtMs) ? lastRequestAtMs : 0,
    lastRequestAt,
    secondsSinceLastRequest:
      Number.isFinite(lastRequestAtMs) && lastRequestAtMs > 0 ? Math.max(0, (nowMs - lastRequestAtMs) / 1000) : null,
    lastGrantedAt: normalized.lastGrantedAt || null,
    waiters,
  };
}

function safeErrorMessage(error) {
  const message = String(error?.message || error || "").trim();
  if (!message) return "unknown error";
  if (message.length > 200) return `${message.slice(0, 197)}...`;
  return message;
}

function createWaiterId() {
  return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createWaiterLabel(label) {
  const safe = String(label || "").trim();
  if (safe) return safe.slice(0, 120);
  const host = String(os.hostname?.() || "").trim();
  return host ? `pid:${process.pid}@${host}` : `pid:${process.pid}`;
}

async function safeMutateQueueState(queueFile, options, mutator) {
  try {
    await mutateQueueState(queueFile, options, mutator);
  } catch {
    // Queue telemetry must not block outbound requests.
  }
}

async function waitForGlobalNadeoSlot({
  stateFile = "",
  minGapMs = 0,
  pollMs = 25,
  staleAfterMs = 120000,
  maxFutureSkewMs = 60000,
  maxWaitMs = 120000,
  label = "",
} = {}) {
  const safeStateFile = String(stateFile || "").trim();
  const safeMinGapMs = Math.max(0, toSafeInt(minGapMs, 0));
  if (!safeStateFile || safeMinGapMs <= 0) return;
  const safeMaxFutureSkewMs = Math.max(1000, toSafeInt(maxFutureSkewMs, 60000));
  const safeMaxWaitMs = Math.max(safeMinGapMs, toSafeInt(maxWaitMs, Math.max(120000, safeMinGapMs * 10)));

  ensureParentDirectorySync(safeStateFile);
  const lockPath = `${safeStateFile}.lock`;
  const queueFile = queueFilePathFor(safeStateFile);
  const waiterId = createWaiterId();
  const waiterLabel = createWaiterLabel(label);
  const queueOptions = {
    stateFile: safeStateFile,
    minGapMs: safeMinGapMs,
    pollMs,
    staleAfterMs,
  };
  await safeMutateQueueState(queueFile, queueOptions, (queueState) => {
    queueState.waiters = Array.isArray(queueState.waiters) ? queueState.waiters : [];
    queueState.waiters.push(
      sanitizeQueueEntry(
        {
          id: waiterId,
          label: waiterLabel,
          pid: process.pid,
          host: String(os.hostname?.() || "").trim(),
          status: "pending",
          enqueuedAt: new Date().toISOString(),
          requestedWaitMs: 0,
          appliedWaitMs: 0,
          error: "",
          lastUpdatedAt: new Date().toISOString(),
        },
        new Date().toISOString()
      )
    );
    return queueState;
  });

  const lockFd = await acquireLock(lockPath, { pollMs, staleAfterMs });

  try {
    const nowMs = Date.now();
    let lastRequestMs = readLastRequestMs(safeStateFile);
    if (lastRequestMs > nowMs + safeMaxFutureSkewMs) {
      // Recover from copied/corrupted throttle state that points far into the future.
      lastRequestMs = 0;
    }

    const requestedWaitMs = Math.max(0, lastRequestMs + safeMinGapMs - nowMs);
    const waitMs = Math.min(requestedWaitMs, safeMaxWaitMs);

    await safeMutateQueueState(queueFile, queueOptions, (queueState) => {
      const waiter = (queueState.waiters || []).find((item) => item.id === waiterId);
      if (waiter) {
        waiter.status = "active";
        waiter.grantedAt = new Date().toISOString();
        waiter.requestedWaitMs = requestedWaitMs;
        waiter.lastUpdatedAt = new Date().toISOString();
      }
      queueState.activeWaiterId = waiterId;
      return queueState;
    });

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    const grantedAtMs = Date.now();
    writeLastRequestMs(safeStateFile, grantedAtMs);

    await safeMutateQueueState(queueFile, queueOptions, (queueState) => {
      const waiter = (queueState.waiters || []).find((item) => item.id === waiterId);
      if (waiter) {
        waiter.status = "done";
        waiter.completedAt = new Date().toISOString();
        waiter.appliedWaitMs = waitMs;
        waiter.lastUpdatedAt = new Date().toISOString();
      }
      if (queueState.activeWaiterId === waiterId) {
        queueState.activeWaiterId = "";
      }
      queueState.lastGrantedAt = new Date(grantedAtMs).toISOString();
      queueState.lastRequestAtMs = grantedAtMs;
      return queueState;
    });
  } catch (error) {
    await safeMutateQueueState(queueFile, queueOptions, (queueState) => {
      const waiter = (queueState.waiters || []).find((item) => item.id === waiterId);
      if (waiter) {
        waiter.status = "error";
        waiter.error = safeErrorMessage(error);
        waiter.completedAt = new Date().toISOString();
        waiter.lastUpdatedAt = new Date().toISOString();
      }
      if (queueState.activeWaiterId === waiterId) {
        queueState.activeWaiterId = "";
      }
      return queueState;
    });
    throw error;
  } finally {
    try {
      fs.closeSync(lockFd);
    } catch {}
    safeUnlinkSync(lockPath);
  }
}

function readGlobalNadeoQueueSnapshot({ stateFile = "", minGapMs = 0, maxItems = 120 } = {}) {
  return parseQueueSnapshot(stateFile, { minGapMs, maxItems });
}

export { waitForGlobalNadeoSlot, readGlobalNadeoQueueSnapshot };
