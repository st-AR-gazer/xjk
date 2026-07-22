import { clampInt, normalizeAccountId, toText } from "../../../shared/valueUtils.js";

function normalizeCampaignSlotValue({ slot, order, position, fallbackSlot = 1, max = 999 } = {}) {
  const safeFallback = clampInt(fallbackSlot, { min: 1, max, fallback: 1 });
  const directSlot = clampInt(slot, { min: 1, max, fallback: 0 });
  if (directSlot) return directSlot;
  for (const rawValue of [order, position]) {
    if (rawValue === undefined || rawValue === null || rawValue === "") continue;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) continue;
    return clampInt(parsed + 1, { min: 1, max, fallback: safeFallback });
  }
  return safeFallback;
}

function firstTruthy(values = []) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function normalizeStatus(value, fallback = "live") {
  const status = String(value || "")
    .trim()
    .toLowerCase();
  if (status === "live" || status === "paused" || status === "archived") return status;
  return fallback;
}

function normalizeRandomSeed(value) {
  const seed = String(value || "")
    .trim()
    .toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(seed)) return seed;
  return "00000000-0000-4000-8000-000000000000";
}

function normalizeLooseId(value) {
  const id = String(value || "")
    .trim()
    .toLowerCase();
  if (!id) return "";
  return normalizeAccountId(id) || id;
}

function uniqueTexts(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = toText(value);
    const key = text.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function boolFromAny(value) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return false;
  const raw = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on", "admin", "vip", "creator"].includes(raw);
}

function slugifyText(value, fallback = "") {
  const normalized = toText(value)
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || toText(fallback) || "item";
}

function splitGroupedValues(value, separator) {
  return String(value || "")
    .split(separator)
    .map((item) => toText(item))
    .filter(Boolean);
}

export {
  boolFromAny,
  firstTruthy,
  normalizeCampaignSlotValue,
  normalizeLooseId,
  normalizeRandomSeed,
  normalizeStatus,
  slugifyText,
  splitGroupedValues,
  uniqueTexts,
};
