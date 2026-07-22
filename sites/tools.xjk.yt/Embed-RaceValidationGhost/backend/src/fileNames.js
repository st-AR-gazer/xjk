import path from "node:path";
import { stripMapGbxExtension } from "../../../shared/backend/values.js";

function pickStoredExtension(originalName, kind) {
  const lower = String(originalName || "").toLowerCase();
  if (kind === "map" && lower.endsWith(".map.gbx")) return ".Map.Gbx";
  if (kind === "input" && lower.endsWith(".ghost.gbx")) return ".Ghost.Gbx";
  if (kind === "input" && lower.endsWith(".replay.gbx")) return ".Replay.Gbx";
  return path.extname(String(originalName || "")) || ".Gbx";
}

function sanitizePathSegment(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
}

function timestampToken(date = new Date()) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(
    date.getUTCHours()
  )}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

function makeEmbeddedMapDownloadName(originalMapName, selectedGhostIndex = null) {
  const base = stripMapGbxExtension(originalMapName) || "map";
  return Number.isInteger(selectedGhostIndex)
    ? `${base}-with-embedded-validation-ghost-${selectedGhostIndex}.Map.Gbx`
    : `${base}-with-embedded-validation-ghost.Map.Gbx`;
}

function processedFilePath(directory, requestId, originalName, kind) {
  const extensionByKind = { ghost: ".Ghost.Gbx", map: ".Map.Gbx", replay: ".Replay.Gbx" };
  const defaultName = kind === "map" ? "map" : kind;
  const base = sanitizePathSegment(
    String(originalName || defaultName)
      .replace(new RegExp(`\\.${kind}\\.gbx$`, "i"), "")
      .replace(/\.gbx$/i, "")
  );
  const labelByKind = {
    ghost: "validation-ghost",
    map: "with-embedded-validation-ghost",
    replay: "validation-replay",
  };
  return path.join(directory, `${requestId}-${labelByKind[kind]}-${timestampToken()}-${base}${extensionByKind[kind]}`);
}

export { makeEmbeddedMapDownloadName, pickStoredExtension, processedFilePath, sanitizePathSegment, timestampToken };
