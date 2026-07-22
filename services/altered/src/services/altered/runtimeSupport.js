import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { CONTENT_SIGNATURE_VERSION } from "../mapContentSimilarity.js";
import { readJsonFileSync, writeJsonFileSync } from "../../../../shared/fsUtils.js";
import {
  buildManagedProcessIdentity,
  managedProcessIdentityMatches,
  readProcessIdentity,
} from "../../../../shared/processIdentity.js";
import { clampInt } from "../../../../shared/valueUtils.js";
import { isProcessAlive } from "../../ops/processRuntime.js";
import { DEFAULT_WEEKLY_SHORTS_IMPORT_WEEKS } from "./serviceConstants.js";
import { toText } from "./valueSupport.js";

function waitForEventLoopTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function sanitizeFileComponent(value, fallback = "run") {
  const safeValue = toText(value).replace(/[^A-Za-z0-9._-]+/g, "_");
  return safeValue || fallback;
}

function killProcessTree(pid) {
  const safePid = Number(pid);
  if (!Number.isFinite(safePid) || safePid <= 0) {
    return { killed: false, error: "Invalid pid." };
  }

  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(safePid), "/T", "/F"], {
      stdio: ["ignore", "ignore", "ignore"],
      windowsHide: true,
    });
    if (result.error) {
      return { killed: false, error: result.error?.message || String(result.error) };
    }
    if (Number(result.status || 0) !== 0) {
      return { killed: false, error: `taskkill exited with code ${Number(result.status || 0)}` };
    }
    return { killed: true, error: null };
  }

  try {
    process.kill(safePid, "SIGTERM");
    return { killed: true, error: null };
  } catch (error) {
    try {
      process.kill(safePid, "SIGKILL");
      return { killed: true, error: null };
    } catch {
      return { killed: false, error: error?.message || String(error) };
    }
  }
}

function getDefaultWeeklyShortsImportRoots() {
  return DEFAULT_WEEKLY_SHORTS_IMPORT_WEEKS.map((week) =>
    path.join(os.homedir(), "Downloads", `Week ${String(week).padStart(2, "0")}`)
  );
}

function similarityNeedsRefresh(similarity = null, { expectedWeightFingerprint = "" } = {}) {
  if (!similarity) return true;
  if (toText(similarity?.assignmentMethod) !== CONTENT_SIGNATURE_VERSION) return true;
  const candidateMatches = Array.isArray(similarity?.candidateMatches) ? similarity.candidateMatches : [];
  if (candidateMatches.some((match) => !Number.isFinite(Number(match?.weightedScore)))) return true;
  const storedWeightFingerprint = toText(
    similarity?.details?.weightProfile?.fingerprint || similarity?.details?.weightProfileFingerprint
  );
  return Boolean(toText(expectedWeightFingerprint)) && storedWeightFingerprint !== toText(expectedWeightFingerprint);
}

function normalizeOptionalClubId(value) {
  if (value === undefined || value === null || value === "") return null;
  return clampInt(value, { min: 1, max: 2147483647, fallback: 0 }) || null;
}

function buildSimilarityWeightOverrideMaps({ mapOverrides = [], campaignOverrides = [] } = {}) {
  return {
    mapOverrideByUid: new Map(
      (Array.isArray(mapOverrides) ? mapOverrides : [])
        .filter((item) => toText(item?.mapUid))
        .map((item) => [toText(item.mapUid).toLowerCase(), item])
    ),
    campaignOverrideById: new Map(
      (Array.isArray(campaignOverrides) ? campaignOverrides : [])
        .filter((item) => Number(item?.campaignId || 0) > 0)
        .map((item) => [Number(item.campaignId), item])
    ),
  };
}

export {
  waitForEventLoopTurn,
  readJsonFileSync,
  writeJsonFileSync,
  sanitizeFileComponent,
  isProcessAlive,
  killProcessTree,
  buildManagedProcessIdentity,
  managedProcessIdentityMatches,
  readProcessIdentity,
  getDefaultWeeklyShortsImportRoots,
  similarityNeedsRefresh,
  clampInt,
  normalizeOptionalClubId,
  buildSimilarityWeightOverrideMaps,
};
