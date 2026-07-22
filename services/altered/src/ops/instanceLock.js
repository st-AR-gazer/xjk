import fs from "node:fs";
import { ensureParentDirectorySync, safeUnlinkSync } from "../../../shared/fsUtils.js";
import { isProcessAlive } from "./processRuntime.js";

function readLockFile(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    return null;
  }
}

function writeLockFile(fd, payload) {
  fs.writeFileSync(fd, JSON.stringify(payload, null, 2), "utf8");
}

function acquireInstanceLock({ lockPath, label = "instance", metadata = {}, allowStaleWithoutPid = true } = {}) {
  const safeLockPath = String(lockPath || "").trim();
  if (!safeLockPath) {
    throw new Error("acquireInstanceLock requires lockPath.");
  }

  const nowIso = new Date().toISOString();
  const payload = {
    label,
    pid: process.pid,
    startedAt: nowIso,
    ...metadata,
  };

  const tryAcquire = () => {
    ensureParentDirectorySync(safeLockPath);
    const fd = fs.openSync(safeLockPath, "wx");
    try {
      writeLockFile(fd, payload);
    } finally {
      fs.closeSync(fd);
    }
  };

  try {
    tryAcquire();
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;

    const existing = readLockFile(safeLockPath);
    const existingPid = Number(existing?.pid || 0) || null;
    if (existingPid && isProcessAlive(existingPid)) {
      const err = new Error(`Another ${label} instance is already running (pid ${existingPid}). Lock: ${safeLockPath}`);
      err.code = "INSTANCE_LOCKED";
      err.lock = existing;
      throw err;
    }

    if (!existingPid && !allowStaleWithoutPid) {
      const err = new Error(
        `Another ${label} instance left a lock file without a pid. Remove it to continue: ${safeLockPath}`
      );
      err.code = "INSTANCE_LOCKED";
      err.lock = existing;
      throw err;
    }

    safeUnlinkSync(safeLockPath);
    tryAcquire();
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    safeUnlinkSync(safeLockPath);
  };

  process.once("exit", release);

  return {
    lockPath: safeLockPath,
    payload,
    release,
  };
}

export { acquireInstanceLock };
