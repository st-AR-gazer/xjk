import { esc, escN, fmtTime, looksLikeAccountId, relTime, stripFmt } from "../../shared/formatters.js?v=2";

export { esc, fmtTime, looksLikeAccountId, relTime, stripFmt };

export function resolveDisplayLabel(primaryValue, fallbackValue, emptyFallback = "Unknown") {
  const preferred = String(primaryValue || "").trim();
  if (isUsableDisplayName(preferred, fallbackValue)) return preferred;
  const fallback = String(fallbackValue || "").trim();
  if (isUsableDisplayName(fallback)) return fallback;
  if (fallback) return fallback;
  if (preferred) return preferred;
  return emptyFallback;
}

export function isUsableDisplayName(value, accountId = "") {
  const text = String(value || "").trim();
  if (!text || looksLikeAccountId(text)) return false;
  const id = String(accountId || "")
    .trim()
    .toLowerCase();
  return !id || text.toLowerCase() !== id;
}

export function firstMapValue(map, keys = [], fallback = "") {
  if (!map || typeof map !== "object") return fallback;
  for (const key of keys) {
    if (!key) continue;
    const value = map[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

export function savedMapperName(map, role = "author") {
  const accountId = String(firstMapValue(map, role === "submitter" ? ["submitter"] : ["author"], "") || "").trim();
  const keys =
    role === "submitter"
      ? ["submitter_saved_display_name", "submitterSavedDisplayName"]
      : ["author_saved_display_name", "authorSavedDisplayName"];
  const candidate = firstMapValue(map, keys, "");
  return isUsableDisplayName(candidate, accountId) ? String(candidate).trim() : "";
}

export function escapeNadeoMarkup(value) {
  return escN(value);
}
