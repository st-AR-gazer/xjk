function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NaN;
}

function toInteger(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function chunkArray(values, size) {
  const list = Array.isArray(values) ? values : [];
  const safeSize = Math.max(1, Number(size) || 1);
  const chunks = [];
  for (let index = 0; index < list.length; index += safeSize) {
    chunks.push(list.slice(index, index + safeSize));
  }
  return chunks;
}

function toText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function parseDelimitedTextValues(value, { splitPattern = /[\s,;]+/ } = {}) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(splitPattern) : [];
  return values.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function toTextOrFallback(value, fallback = "") {
  return toText(value) || toText(fallback);
}

function parseOptionalBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function truncateText(value, maxLength = 255) {
  const text = toText(value);
  if (!text || text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 3)}...`;
}

function normalizeAccountId(value) {
  const accountId = toText(value).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(accountId) ? accountId : "";
}

function normalizeBaseUrl(value, fallback = "") {
  return (toText(value) || toText(fallback)).replace(/\/+$/, "");
}

function toEpochMs(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return null;
    return Math.floor(value < 1e12 ? value * 1000 : value);
  }
  const raw = toText(value);
  if (!raw) return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return Math.floor(numeric < 1e12 ? numeric * 1000 : numeric);
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function toIso(value, fallbackIso = new Date().toISOString()) {
  const epochMs = toEpochMs(value);
  return Number.isFinite(epochMs) && epochMs > 0 ? new Date(epochMs).toISOString() : fallbackIso;
}

function toNullableIso(value) {
  const epochMs = toEpochMs(value);
  return Number.isFinite(epochMs) && epochMs > 0 ? new Date(epochMs).toISOString() : null;
}

function utcNowIso(now = Date.now) {
  const epochMs = typeof now === "function" ? now() : now;
  return new Date(epochMs).toISOString();
}

function delay(ms, { setTimer = globalThis.setTimeout } = {}) {
  const waitMs = Math.max(0, Number(ms) || 0);
  if (!waitMs) return Promise.resolve();
  return new Promise((resolve) => setTimer(resolve, waitMs));
}

function serializeJson(value) {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function parseJsonSafe(value, fallback = null) {
  const raw = toText(value);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function uniqueBy(items, makeKey) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const key = String(makeKey(item));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export {
  chunkArray,
  clampInt,
  delay,
  firstFiniteNumber,
  normalizeAccountId,
  normalizeBaseUrl,
  parseDelimitedTextValues,
  parseOptionalBoolean,
  parseJsonSafe,
  serializeJson,
  toEpochMs,
  toIso,
  toInteger,
  toNullableIso,
  toText,
  toTextOrFallback,
  truncateText,
  uniqueBy,
  utcNowIso,
};
