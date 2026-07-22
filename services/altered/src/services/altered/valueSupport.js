import { delay, parseOptionalBoolean, toIso, toNullableIso, toText, uniqueBy } from "../../../../shared/valueUtils.js";

function normalizeScheduleMode(value, fallback = "interval") {
  const mode = String(value || "")
    .trim()
    .toLowerCase();
  if (mode === "daily" || mode === "interval") return mode;
  return fallback;
}

function isRecentIsoWithin(iso, windowMs) {
  const parsedMs = Date.parse(String(iso || "").trim());
  if (!Number.isFinite(parsedMs)) return false;
  return Date.now() - parsedMs <= Math.max(0, Number(windowMs) || 0);
}

function toFlexibleIso(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return toNullableIso(value < 1e12 ? value * 1000 : value);
  }
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    return toNullableIso(numeric < 1e12 ? numeric * 1000 : numeric);
  }
  return toNullableIso(value);
}

function pickFirstPresent(values = []) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return null;
}

function getPathValue(source, path) {
  if (!source || typeof source !== "object") return undefined;
  const keys = String(path || "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  let current = source;
  for (const key of keys) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function pickFirstNestedValue(sources = [], paths = []) {
  for (const source of sources) {
    for (const path of paths) {
      const value = getPathValue(source, path);
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && !value.trim()) continue;
      return value;
    }
  }
  return null;
}

function stripMapFileExtension(value) {
  return toText(value).replace(/\.map\.gbx$/i, "");
}

function normalizeMaybeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return value !== 0;
  const raw = String(value).trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeUniqueStrings(values = []) {
  return uniqueBy(values.map((value) => toText(value)).filter(Boolean), (value) => value.toLowerCase());
}

export {
  parseOptionalBoolean,
  normalizeScheduleMode,
  toText,
  toNullableIso,
  isRecentIsoWithin,
  toIso,
  toFlexibleIso,
  pickFirstPresent,
  getPathValue,
  pickFirstNestedValue,
  stripMapFileExtension,
  normalizeMaybeBoolean,
  asArray,
  delay,
  uniqueBy,
  normalizeUniqueStrings,
};
