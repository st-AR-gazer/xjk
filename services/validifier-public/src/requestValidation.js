import { createRequestError } from "./uploadService.js";
import { PUBLIC_TRACKS } from "./verificationModel.js";

export function validateLookupValue(rawValue, label) {
  const value = String(rawValue || "").trim();
  if (!value) throw createRequestError(`${label} is required.`);
  if (value.length > 160) throw createRequestError(`${label} is too long.`);
  return value;
}

export function validateTrack(rawValue, { allowAll = false, fallback = null } = {}) {
  const value = String(rawValue ?? "")
    .trim()
    .toLowerCase();
  if (!value && fallback) return fallback;
  const allowed = allowAll ? ["all", ...PUBLIC_TRACKS] : [...PUBLIC_TRACKS];
  if (allowed.includes(value)) return value;
  throw createRequestError(
    allowAll ? "Track must be one of: all, replay, deep." : "Track must be one of: replay, deep."
  );
}

export function validateLimit(rawValue, fallback = 100, maxValue = 100) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") return fallback;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) throw createRequestError("Limit must be a positive integer.");
  return Math.min(value, maxValue);
}

export function validatePage(rawValue, fallback = 1) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") return fallback;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) throw createRequestError("Page must be a positive integer.");
  return value;
}

export function validateMapSort(rawValue, fallback = "rank_asc") {
  const value = String(rawValue ?? "")
    .trim()
    .toLowerCase();
  if (!value) return fallback;
  if (["rank_asc", "rank_desc", "updated_desc", "record_asc"].includes(value)) return value;
  throw createRequestError("Sort must be one of: rank_asc, rank_desc, updated_desc, record_asc.");
}

export function validateMapStatus(rawValue, fallback = "all") {
  const value = String(rawValue ?? "")
    .trim()
    .toLowerCase();
  if (!value) return fallback;
  if (["all", "pass", "fail", "pending", "unavailable", "not_run"].includes(value)) return value;
  throw createRequestError("Status must be one of: all, pass, fail, pending, unavailable, not_run.");
}

export function uniqueRecordIds(rawValue) {
  if (!Array.isArray(rawValue)) throw createRequestError("record_ids must be an array.");
  const values = [...new Set(rawValue.map((item) => validateLookupValue(item, "Record ID")))];
  if (!values.length) throw createRequestError("record_ids must contain at least one record ID.");
  if (values.length > 100) throw createRequestError("record_ids must contain at most 100 record IDs.");
  return values;
}

export function validateNullableRank(rawValue) {
  if (rawValue === null || rawValue === undefined || String(rawValue).trim() === "") return null;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0) {
    throw createRequestError("rank must be a non-negative integer or null.");
  }
  return value;
}
