const DEFAULT_BUSY_MESSAGE = "Tool capacity is currently full. Try again shortly.";

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getToolClientKey(req) {
  return String(req?.ip || req?.socket?.remoteAddress || "unknown").trim() || "unknown";
}

export function createToolJobCapacity({
  maxActiveJobs = 4,
  maxActiveJobsPerClient = 2,
  busyRetryAfterSeconds = 5,
  busyMessage = DEFAULT_BUSY_MESSAGE,
  getClientKey = getToolClientKey,
} = {}) {
  const globalLimit = positiveInteger(maxActiveJobs, 4);
  const clientLimit = Math.min(positiveInteger(maxActiveJobsPerClient, 2), globalLimit);
  const retryAfterSeconds = positiveInteger(busyRetryAfterSeconds, 5);
  const activeByClient = new Map();
  let activeJobs = 0;

  function tryAcquire(clientKey) {
    const normalizedClientKey = String(clientKey || "unknown");
    const clientJobs = activeByClient.get(normalizedClientKey) || 0;
    if (activeJobs >= globalLimit || clientJobs >= clientLimit) return null;

    activeJobs += 1;
    activeByClient.set(normalizedClientKey, clientJobs + 1);
    let released = false;
    let retained = false;

    return {
      clientKey: normalizedClientKey,
      get released() {
        return released;
      },
      get retained() {
        return retained;
      },
      retain() {
        if (released) throw new Error("Cannot retain a released tool-capacity lease.");
        retained = true;
        return this;
      },
      release() {
        if (released) return false;
        released = true;
        activeJobs -= 1;

        const remaining = (activeByClient.get(normalizedClientKey) || 1) - 1;
        if (remaining > 0) activeByClient.set(normalizedClientKey, remaining);
        else activeByClient.delete(normalizedClientKey);
        return true;
      },
    };
  }

  function admit(req, res, next) {
    const lease = tryAcquire(getClientKey(req));
    if (!lease) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({
        error: busyMessage,
        code: "TOOL_CAPACITY_EXHAUSTED",
        retryAfterSeconds,
      });
    }

    req.toolJobLease = lease;
    const releaseWithResponse = () => {
      if (!lease.retained) lease.release();
    };
    res.once("finish", releaseWithResponse);
    res.once("close", releaseWithResponse);
    return next();
  }

  return {
    maxActiveJobs: globalLimit,
    maxActiveJobsPerClient: clientLimit,
    busyRetryAfterSeconds: retryAfterSeconds,
    admit,
    tryAcquire,
    getActiveJobs: () => activeJobs,
    getActiveJobsForClient: (clientKey) => activeByClient.get(String(clientKey || "unknown")) || 0,
  };
}
