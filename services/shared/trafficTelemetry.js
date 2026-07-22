function normalizeTrafficDirection(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "incoming" ? "incoming" : "outgoing";
}

function normalizeTrafficMethod(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  return (normalized || "GET").slice(0, 12);
}

function normalizeTrafficPath(value, fallback = "/") {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  return (normalized.startsWith("/") ? normalized : `/${normalized}`).slice(0, 300);
}

function normalizeTrafficHost(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, 160);
}

function normalizeTrafficStatusCode(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(999, Math.floor(parsed)));
}

function normalizeTrafficBytes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(parsed));
}

function normalizeTrafficDurationMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(3_600_000, Math.round(parsed));
}

export {
  normalizeTrafficBytes,
  normalizeTrafficDirection,
  normalizeTrafficDurationMs,
  normalizeTrafficHost,
  normalizeTrafficMethod,
  normalizeTrafficPath,
  normalizeTrafficStatusCode,
};
