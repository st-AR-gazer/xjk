import { clampInt } from "../../../../shared/valueUtils.js";

const FUZZY_SEARCH_ROW_LIMIT = 5000;

function normalizeProjectKey(value) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 120);
}

function normalizeInstanceId(value) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 120);
}

function normalizeMaybeString(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeClubId(value) {
  return clampInt(value, { min: 1, max: 2147483647, fallback: 0 });
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSearchMode(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "prefix" || raw === "contains" || raw === "fuzzy") return raw;
  return "contains";
}

function computeDiceScore(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length === 1 || right.length === 1) {
    return left === right ? 1 : 0;
  }

  const grams = (value) => {
    const out = new Map();
    for (let i = 0; i < value.length - 1; i += 1) {
      const gram = value.slice(i, i + 2);
      out.set(gram, (out.get(gram) || 0) + 1);
    }
    return out;
  };

  const leftGrams = grams(left);
  const rightGrams = grams(right);
  let overlap = 0;
  for (const [gram, count] of leftGrams.entries()) {
    overlap += Math.min(count, rightGrams.get(gram) || 0);
  }
  return (2 * overlap) / (Math.max(1, left.length - 1) + Math.max(1, right.length - 1));
}

function isSafeIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ""));
}

function quoteIdentifier(value) {
  if (!isSafeIdentifier(value)) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}

export {
  normalizeProjectKey,
  normalizeInstanceId,
  normalizeMaybeString,
  normalizeClubId,
  normalizeArray,
  normalizeSearchMode,
  computeDiceScore,
  isSafeIdentifier,
  quoteIdentifier,
  FUZZY_SEARCH_ROW_LIMIT,
};
