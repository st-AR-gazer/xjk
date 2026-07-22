import path from "node:path";

export function safeExt(name, fallback = ".tmp") {
  return path.extname(String(name || "")) || fallback;
}

export function sanitizeDownloadName(name, fallback = "download.bin") {
  return String(name || fallback).replace(/["\\/\r\n]+/g, "_");
}

export function stripMapGbxExtension(name, { allowDuplicateSuffix = false } = {}) {
  const mapSuffix = allowDuplicateSuffix ? /\.map(?:\(\d+\))?\.gbx$/i : /\.map\.gbx$/i;
  return String(name || "")
    .replace(mapSuffix, "")
    .replace(/\.gbx$/i, "");
}

export function parseBool(value, fallback = false) {
  if (Array.isArray(value)) return value.some((entry) => parseBool(entry, fallback));
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}
