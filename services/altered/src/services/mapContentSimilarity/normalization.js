import { toText } from "../../../../shared/valueUtils.js";
import { slugifyText } from "../../domain/inputNormalization.js";

function clampNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeTextList(value = [], { splitPattern = /[\r\n,;]+/ } = {}) {
  const rawValues = Array.isArray(value) ? value : typeof value === "string" ? value.split(splitPattern) : [];
  return [...new Set(rawValues.map((item) => toText(item)).filter(Boolean))];
}

function normalizeMapNumbers(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= 999)
        .map((value) => Math.floor(value))
    ),
  ].sort((a, b) => a - b);
}

function normalizeSelectedCandidateMapUids(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => toText(value))
        .filter(Boolean)
        .map((value) => value.toLowerCase())
    ),
  ];
}

export { clampNumber, normalizeMapNumbers, normalizeSelectedCandidateMapUids, normalizeTextList, slugifyText };
