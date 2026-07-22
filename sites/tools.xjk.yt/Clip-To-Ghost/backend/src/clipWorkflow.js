import fsp from "node:fs/promises";
import path from "node:path";
import { readTextFileWithinLimit } from "../../../shared/backend/filesystem.js";
import { stripMapGbxExtension as stripMapExtension } from "../../../shared/backend/values.js";
import { parseJsonSafe } from "../../../../../services/shared/valueUtils.js";
import { sanitizeDownloadName } from "./uploadStore.js";

function parseNonNegativeInt(value) {
  if (value === undefined || value === null || !String(value).trim()) return null;
  const parsed = Number(String(value).trim());
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseTemplateMode(value) {
  const normalized = String(value || "shipped")
    .trim()
    .toLowerCase();
  return ["custom", "blank"].includes(normalized) ? normalized : "shipped";
}

function appendSelectionArguments(args, body) {
  for (const [field, argument] of [
    ["clipIndex", "--clip-index"],
    ["trackIndex", "--track-index"],
    ["blockIndex", "--block-index"],
  ]) {
    const value = parseNonNegativeInt(body?.[field]);
    if (value !== null) args.push(argument, String(value));
  }
  return args;
}

function buildManifestDownloadName(mapOriginalName) {
  return `${stripMapExtension(mapOriginalName) || "map"}.clip-to-ghost.manifest.json`;
}

function buildZipDownloadName(mapOriginalName) {
  return `${stripMapExtension(mapOriginalName) || "map"}-clip-to-ghost.zip`;
}

function createClipWorkflow(runtime) {
  async function readManifest(manifestPath) {
    const text = await readTextFileWithinLimit(manifestPath, {
      maxBytes: runtime.config.maxProcessOutputBytes,
      missingValue: "",
    });
    return text ? parseJsonSafe(text) : null;
  }

  async function collectGhostOutputs(workDir) {
    const entries = await fsp.readdir(workDir, { withFileTypes: true }).catch(() => []);
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".ghost.gbx"))
      .map((entry) => ({ name: sanitizeDownloadName(entry.name), path: path.join(workDir, entry.name) }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async function inspect({ mapPath, manifestPath, selection = {} }) {
    const args = appendSelectionArguments([mapPath, "--list-only", "--manifest", manifestPath], selection);
    const result = await runtime.runTool(args);
    return { ...result, manifest: await readManifest(manifestPath) };
  }

  async function exportGhosts({ mapPath, manifestPath, selection = {}, templateGhostPath, templateMode, workDir }) {
    const args = appendSelectionArguments([mapPath, "--out-dir", workDir, "--manifest", manifestPath], selection);
    if (templateMode !== "shipped") args.push("--template-mode", templateMode);
    if (templateMode === "custom") args.push("--template-ghost", templateGhostPath);
    const result = await runtime.runTool(args);
    return {
      ...result,
      ghosts: await collectGhostOutputs(workDir),
      manifest: await readManifest(manifestPath),
    };
  }

  return { exportGhosts, inspect };
}

export {
  appendSelectionArguments,
  buildManifestDownloadName,
  buildZipDownloadName,
  createClipWorkflow,
  parseNonNegativeInt,
  parseTemplateMode,
  stripMapExtension,
};
