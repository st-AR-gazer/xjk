function parseLimit(rawValue, { fallback = 30, max = 100 } = {}) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    return Math.min(Math.max(1, fallback), max);
  }
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    const error = new Error("limit must be a positive integer.");
    error.statusCode = 400;
    throw error;
  }
  return Math.min(value, max);
}

function parseOffset(rawValue, { fallback = 0, max = 10_000 } = {}) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    return Math.min(Math.max(0, fallback), max);
  }
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0) {
    const error = new Error("offset must be a non-negative integer.");
    error.statusCode = 400;
    throw error;
  }
  return Math.min(value, max);
}

function shouldUsePrivateNoStore({ debugValue, authenticated = false, adminRoute = false } = {}) {
  const debugRequested = String(debugValue ?? "").trim() !== "";
  return Boolean(debugRequested || authenticated || adminRoute);
}

function setPrivateNoStore(res, cacheStatus = "bypass") {
  res.setHeader("cache-control", "private, no-store");
  res.setHeader("pragma", "no-cache");
  res.setHeader("x-cotd-cache", cacheStatus);
  if (typeof res.vary === "function") {
    res.vary("Authorization");
    res.vary("X-Cotd-Admin-Token");
  } else {
    res.append("vary", "Authorization");
    res.append("vary", "X-Cotd-Admin-Token");
  }
}

export { parseLimit, parseOffset, setPrivateNoStore, shouldUsePrivateNoStore };
