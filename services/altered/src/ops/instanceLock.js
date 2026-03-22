import fs from "node:fs";
import path from "node:path";

function isProcessAlive(pid) {
  const safePid = Number(pid);
  if (!Number.isFinite(safePid) || safePid <= 0) return false;
  try {
    process.kill(safePid, 0);
    return true;
  } catch {
    return false;
  }
}

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

function acquireInstanceLock({
  lockPath,
  label = "instance",
  metadata = {},
  allowStaleWithoutPid = true,
} = {}) {
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

  const ensureDir = () => {
    fs.mkdirSync(path.dirname(safeLockPath), { recursive: true });
  };

  const tryAcquire = () => {
    ensureDir();
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
      const err = new Error(
        `Another ${label} instance is already running (pid ${existingPid}). Lock: ${safeLockPath}`
      );
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

    try {
      fs.unlinkSync(safeLockPath);
    } catch {}
    tryAcquire();
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      fs.unlinkSync(safeLockPath);
    } catch {}
  };

  process.once("exit", release);

  return {
    lockPath: safeLockPath,
    payload,
    release,
  };
}

export { acquireInstanceLock };

