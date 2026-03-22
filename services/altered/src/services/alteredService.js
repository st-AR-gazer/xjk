import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread } from "node:worker_threads";
import { normalizeAccountId } from "../live/trackmaniaOAuthClient.js";
import {
  buildMapNameCandidate,
  parseStandardizedFields,
  parseCampaignStandardizedFields,
  WEEKLY_SHORTS_CANONICAL_MAPS,
  extractMapNumberFromText,
  deriveMapNumbers,
  normalizeWeeklyShortsTitle,
  resolveCanonicalWeeklyShortsWeek,
  resolveWeeklyGrandWeek,
  resolveWeeklyShortsEntry,
  resolveWeeklyShortsWeek,
  sanitizeMapName,
  shouldExcludeFromNamingReview,
  classifyNamingSimilaritySource,
} from "./mapNameStandardizer.js";
import {
  ASSET_FALLBACK_SIGNATURE_VERSION,
  CONTENT_SIGNATURE_VERSION,
  CONTENT_SIMILARITY_PATTERN,
  applySimilaritySelectionToMatches,
  buildContentSimilarityReferenceContext,
  buildCampaignFamily,
  computeContentSimilarity,
  deriveSimilarityUnmatchedReason,
  evaluateSimilarityAutoApproval,
  extractGbxContentSignature,
  mergeSimilarityIntoCandidate,
  normalizeMapNumbers,
} from "./mapContentSimilarity.js";
import { parseGbxMapLayouts } from "./gbxMapLayoutParser.js";
import { buildMapViewerDiffPayload } from "./mapViewerDiff.js";
import {
  DATA_DIR,
  DB_FILE,
  ALTERED_MAP_COPY_BACKFILL_BATCH_SIZE,
  ALTERED_MAP_COPY_BACKFILL_ENABLED,
  ALTERED_MAP_COPY_MAX_CONCURRENT_DOWNLOADS,
  ALTERED_MAP_COPY_REQUEST_TIMEOUT_MS,
} from "../config.js";
import { buildPublicApiCatalog, PUBLIC_API_ENDPOINTS } from "../publicApi/catalog.js";
import {
  hasResolvedDisplayName,
  sanitizeResolvedDisplayName,
} from "../../../shared/displayNameResolution.js";

const DEFAULT_TRACKER_SYNC_CHUNK_SIZE = 350;
const DEFAULT_DAILY_HOUR_UTC = 3;
const DEFAULT_DAILY_MINUTE_UTC = 0;
const DEFAULT_DISCOVERY_INTERVAL_SECONDS = 3600;
const DEFAULT_DISCOVERY_CAMPAIGN_LIMIT = 25;
const DEFAULT_DISCOVERY_ACTIVITY_PAGE_SIZE = 100;
const DEFAULT_MAPPER_BOOTSTRAP_INTERVAL_SECONDS = 60;
const DEFAULT_MAPPER_MAINTENANCE_INTERVAL_SECONDS = 60;
const DEFAULT_MAPPER_PRIORITY_INTERVAL_SECONDS = 60;
const DEFAULT_MAPPER_SYNC_BATCH_SIZE = 50;
const DEFAULT_MAPPER_PRIORITY_BATCH_SIZE = 25;
const DEFAULT_MAPPER_PRIORITY_TOP_LIMIT = 250;
const DEFAULT_MAPPER_PRIORITY_REFRESH_SECONDS = 600;
const DEFAULT_MAPPER_REQUEST_GAP_MS = 5000;
const DEFAULT_MAPPER_CACHE_TTL_SECONDS = 86400;
const DEFAULT_MAPPER_PRIORITY_CACHE_TTL_SECONDS = 1800;
const DEFAULT_MAPPER_KNOWN_ACCOUNTS_REFRESH_SECONDS = 900;
const VIEW_PRIORITY_ACCOUNT_TTL_MS = 5 * 60 * 1000;
const VIEW_PRIORITY_RELAY_KICKOFF_COOLDOWN_MS = 15 * 1000;
const MAP_CONTENT_DOWNLOAD_TIMEOUT_MS = 25000;
const DEFAULT_MAP_COPY_BACKFILL_BATCH_SIZE = 250;
const DEFAULT_MAP_COPY_MAX_CONCURRENT_DOWNLOADS = 4;
const DEFAULT_MAP_COPY_BOOT_AUTO_START_MAX_PENDING = 500;
const GLOBAL_REFERENCE_FALLBACK_MAX_MAPS = 200;
const GLOBAL_REFERENCE_FALLBACK_MAX_CAMPAIGNS = 8;
const NAMING_SIMILARITY_PROGRESS_MATCHING_START = 30;
const NAMING_SIMILARITY_PROGRESS_MATCHING_SPAN = 55;
const EXTERNAL_NAMING_SIMILARITY_BATCH_SIZE = 250;
const EXTERNAL_NAMING_SIMILARITY_MIN_MAPS = 500;
const EXTERNAL_NAMING_SIMILARITY_RUNNING_GRACE_MS = 2 * 60 * 1000;
const NAMING_SIMILARITY_PROGRESS_FILE_NAME = "similarity-resolver-progress.json";
const NAMING_SIMILARITY_MAP_UIDS_FILE_NAME = "similarity-resolver-map-uids.json";
const NAMING_SIMILARITY_RESOLVER_SCRIPT_PATH = fileURLToPath(
  new URL("../../tools/run-similarity-resolver.mjs", import.meta.url)
);
const WEEKLY_SHORTS_SOURCE_KEY = "weekly-shorts";
const WEEKLY_SHORTS_SOURCE_LABEL = "altered-weekly-shorts";
const WEEKLY_SHORTS_SOURCE_DISPLAY_NAME = "Weekly Shorts";
const WEEKLY_SHORTS_SOURCE_TYPE = "weekly-shorts";
const WEEKLY_SHORTS_CAMPAIGN_TYPE = "weekly-shorts";
const OFFICIAL_SEASONAL_SOURCE_KEY = "official-seasonal-v2";
const OFFICIAL_SEASONAL_SOURCE_LABEL = "official-seasonal-v2";
const OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME = "Official Seasonal Campaigns";
const OFFICIAL_SEASONAL_SOURCE_TYPE = "official-seasonal";
const OFFICIAL_SEASONAL_CAMPAIGN_TYPE = "official-seasonal";
const TOTD_SOURCE_KEY = "official-totd";
const TOTD_SOURCE_LABEL = "official-totd";
const TOTD_SOURCE_DISPLAY_NAME = "Track of the Day";
const TOTD_SOURCE_TYPE = "official-totd";
const TOTD_CAMPAIGN_TYPE = "official-totd";
const WEEKLY_GRANDS_SOURCE_KEY = "weekly-grands";
const WEEKLY_GRANDS_SOURCE_LABEL = "weekly-grands";
const WEEKLY_GRANDS_SOURCE_DISPLAY_NAME = "Weekly Grands";
const WEEKLY_GRANDS_SOURCE_TYPE = "weekly-grands";
const WEEKLY_GRANDS_CAMPAIGN_TYPE = "weekly-grands";
const COMPETITION_SOURCE_KEY = "official-competition";
const COMPETITION_SOURCE_LABEL = "official-competition";
const COMPETITION_SOURCE_DISPLAY_NAME = "Official Competition Maps";
const COMPETITION_SOURCE_TYPE = "official-competition";
const COMPETITION_CAMPAIGN_TYPE = "official-competition";
const COMPETITION_SOURCE_CLUB_ID = 79122;
const DISCOVERY_SOURCE_KEY = "official-discovery";
const DISCOVERY_SOURCE_LABEL = "official-discovery";
const DISCOVERY_SOURCE_DISPLAY_NAME = "Official Discovery Campaigns";
const DISCOVERY_SOURCE_TYPE = "official-discovery";
const DISCOVERY_CAMPAIGN_TYPE = "official-discovery";
const DISCOVERY_SOURCE_CLUB_ID = 150;
const DISCOVERY_SOURCE_CAMPAIGNS = [
  { campaignId: 55779, name: "Snow Discovery" },
  { campaignId: 61394, name: "Rally Discovery" },
  { campaignId: 68071, name: "Desert Discovery" },
  { campaignId: 71524, name: "Stunt Discovery" },
  { campaignId: 78488, name: "Platform Discovery" },
];
const LEGACY_SOURCE_KEY = "official-legacy";
const LEGACY_SOURCE_LABEL = "official-legacy";
const LEGACY_SOURCE_DISPLAY_NAME = "Official Legacy Campaigns";
const LEGACY_SOURCE_TYPE = "official-legacy";
const LEGACY_CAMPAIGN_TYPE = "official-legacy";
const LEGACY_SOURCE_CLUB_ID = 132907;
const LEGACY_SOURCE_CAMPAIGNS = [
  { campaignId: 130429, name: "Spring 2020" },
  { campaignId: 130430, name: "Training" },
];
const OFFICIAL_SEASONAL_SOURCE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const PROJECT_SOURCE_RELEASE_BUFFER_MS = 10 * 60 * 1000;
const PROJECT_SOURCE_SCHEDULES = {
  [OFFICIAL_SEASONAL_SOURCE_KEY]: {
    checkpointsMs: [
      PROJECT_SOURCE_RELEASE_BUFFER_MS,
      24 * 60 * 60 * 1000 + PROJECT_SOURCE_RELEASE_BUFFER_MS,
      5 * 24 * 60 * 60 * 1000 + PROJECT_SOURCE_RELEASE_BUFFER_MS,
      14 * 24 * 60 * 60 * 1000 + PROJECT_SOURCE_RELEASE_BUFFER_MS,
    ],
    followEndTimestamp: true,
  },
  [TOTD_SOURCE_KEY]: {
    checkpointsMs: [
      PROJECT_SOURCE_RELEASE_BUFFER_MS,
      24 * 60 * 60 * 1000 + PROJECT_SOURCE_RELEASE_BUFFER_MS,
    ],
    followEndTimestamp: true,
  },
  [WEEKLY_GRANDS_SOURCE_KEY]: {
    checkpointsMs: [
      PROJECT_SOURCE_RELEASE_BUFFER_MS,
      24 * 60 * 60 * 1000 + PROJECT_SOURCE_RELEASE_BUFFER_MS,
    ],
    followEndTimestamp: true,
  },
  [WEEKLY_SHORTS_SOURCE_KEY]: {
    checkpointsMs: [
      PROJECT_SOURCE_RELEASE_BUFFER_MS,
      24 * 60 * 60 * 1000 + PROJECT_SOURCE_RELEASE_BUFFER_MS,
    ],
    followEndTimestamp: true,
  },
};
const DEFAULT_WEEKLY_SHORTS_IMPORT_WEEKS = [1, 2, 3, 4, 29];
const NAMING_SIMILARITY_SOURCE_OPTIONS = [
  { key: "", label: "All Sources" },
  { key: OFFICIAL_SEASONAL_SOURCE_KEY, label: "Seasonal" },
  { key: TOTD_SOURCE_KEY, label: "TOTD" },
  { key: WEEKLY_SHORTS_SOURCE_KEY, label: "Weekly Shorts" },
  { key: WEEKLY_GRANDS_SOURCE_KEY, label: "Weekly Grands" },
  { key: DISCOVERY_SOURCE_KEY, label: "Discovery" },
  { key: COMPETITION_SOURCE_KEY, label: "Competition" },
  { key: LEGACY_SOURCE_KEY, label: "Legacy" },
];

function waitForEventLoopTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function readJsonFileSync(filePath, fallback = null) {
  const safePath = toText(filePath);
  if (!safePath) return fallback;
  try {
    return JSON.parse(fsSync.readFileSync(safePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFileSync(filePath, value) {
  const safePath = toText(filePath);
  if (!safePath) return false;
  fsSync.mkdirSync(path.dirname(safePath), { recursive: true });
  fsSync.writeFileSync(safePath, JSON.stringify(value, null, 2), "utf8");
  return true;
}

function sanitizeFileComponent(value, fallback = "run") {
  const safeValue = toText(value).replace(/[^A-Za-z0-9._-]+/g, "_");
  return safeValue || fallback;
}

function isProcessAlive(pid) {
  const safePid = Number(pid);
  if (!Number.isFinite(safePid) || safePid <= 0) return false;
  try {
    process.kill(safePid, 0);
    return true;
  } catch {
    return false;
  }
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

function similarityNeedsRefresh(similarity = null) {
  if (!similarity) return true;
  if (toText(similarity?.assignmentMethod) !== CONTENT_SIGNATURE_VERSION) return true;
  const candidateMatches = Array.isArray(similarity?.candidateMatches) ? similarity.candidateMatches : [];
  return candidateMatches.some((match) => !Number.isFinite(Number(match?.weightedScore)));
}

function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeOptionalClubId(value) {
  if (value === undefined || value === null || value === "") return null;
  return clampInt(value, { min: 1, max: 2147483647, fallback: 0 }) || null;
}

function parseOptionalBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return undefined;
  const raw = String(value).trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return undefined;
}

function normalizeScheduleMode(value, fallback = "interval") {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "daily" || mode === "interval") return mode;
  return fallback;
}

function toText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function toNullableIso(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isRecentIsoWithin(iso, windowMs) {
  const parsedMs = Date.parse(String(iso || "").trim());
  if (!Number.isFinite(parsedMs)) return false;
  return Date.now() - parsedMs <= Math.max(0, Number(windowMs) || 0);
}

function toIso(value, fallbackIso = new Date().toISOString()) {
  return toNullableIso(value) || fallbackIso;
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

function delay(ms) {
  const waitMs = Math.max(0, Number(ms) || 0);
  if (waitMs <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, waitMs));
}

function uniqueBy(items, makeKey) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = String(makeKey(item));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function normalizeUniqueStrings(values = []) {
  return uniqueBy(
    values
      .map((value) => toText(value))
      .filter(Boolean),
    (value) => value.toLowerCase()
  );
}

function deriveMapMetadata(map = {}) {
  const mapPayload = map.payload && typeof map.payload === "object" ? map.payload : null;
  const campaignPayload =
    map.campaignPayload && typeof map.campaignPayload === "object" ? map.campaignPayload : null;
  const payloadSources = [
    mapPayload?.mapDetail,
    mapPayload?.campaignMap,
    mapPayload,
    campaignPayload,
  ].filter((value) => value && typeof value === "object");
  const fallbackFilename = toText(map.name) ? `${toText(map.name)}.Map.Gbx` : "";

  const filenameBase = stripMapFileExtension(
    pickFirstPresent([
      pickFirstNestedValue(payloadSources, ["filename", "map.filename"]),
      mapPayload?.filename,
      fallbackFilename,
    ]) || ""
  );
  const sanitizedName = sanitizeMapName(map.name || "");
  const sanitizedFilename = sanitizeMapName(filenameBase || "");
  const parsedMapName = parseStandardizedFields(sanitizedName);
  const parsedFilename = parseStandardizedFields(sanitizedFilename);
  const parsedCampaign = parseCampaignStandardizedFields(map.campaign || "");
  const derivedCandidate =
    map.derivedNameCandidate && typeof map.derivedNameCandidate === "object"
      ? map.derivedNameCandidate
      : null;

  const season =
    parsedCampaign.season ||
    derivedCandidate?.season ||
    parsedFilename.season ||
    parsedMapName.season ||
    null;
  const year =
    parsedCampaign.year ||
    derivedCandidate?.year ||
    parsedFilename.year ||
    parsedMapName.year ||
    null;
  const storedMapNumbers = Array.isArray(derivedCandidate?.mapNumbers)
    ? derivedCandidate.mapNumbers.filter((value) => Number.isFinite(Number(value)) && Number(value) > 0)
    : [];
  const computedMapNumbersResult = deriveMapNumbers({
    mapName: sanitizedName,
    filename: sanitizedFilename,
    campaignName: map.campaign || "",
    slot: map.slot,
    campaignMapCount: map.campaignMapCount,
    season,
    year,
  });
  const computedMapNumbers = normalizeUniqueStrings([
    ...storedMapNumbers,
    ...computedMapNumbersResult.mapNumbers,
  ])
    .map((value) => clampInt(value, { min: 1, max: 999, fallback: 0 }))
    .filter(Boolean);
  const mapNumber = computedMapNumbers[0] || derivedCandidate?.mapNumber || null;

  const alterationMix = normalizeUniqueStrings([
    ...(Array.isArray(parsedCampaign.alterationMix) ? parsedCampaign.alterationMix : []),
    derivedCandidate?.alteration,
    ...(Array.isArray(derivedCandidate?.alterationMix) ? derivedCandidate.alterationMix : []),
    ...(Array.isArray(parsedFilename.alterationMix) ? parsedFilename.alterationMix : []),
    ...(Array.isArray(parsedMapName.alterationMix) ? parsedMapName.alterationMix : []),
  ]);

  const alteration =
    derivedCandidate?.alteration ||
    parsedCampaign.alteration ||
    (alterationMix.length === 1 ? alterationMix[0] : alterationMix.length > 1 ? alterationMix.join(" + ") : null);

  const fileUrl = toText(
    pickFirstPresent([
      pickFirstNestedValue(payloadSources, [
        "fileUrl",
        "downloadUrl",
        "url",
        "map.fileUrl",
        "map.downloadUrl",
      ]),
      map.downloadUrl,
    ]) || ""
  );
  const thumbnailUrl = toText(
    pickFirstPresent([
      pickFirstNestedValue(payloadSources, ["thumbnailUrl", "thumbnail", "map.thumbnailUrl"]),
      map.thumbnailUrl,
    ]) || ""
  );
  const timestamp = toFlexibleIso(
    pickFirstPresent([
      pickFirstNestedValue(payloadSources, [
        "timestamp",
        "uploadTimestamp",
        "createdAt",
        "mapCreatedAt",
        "map.createdAt",
      ]),
      map.mapCreatedAt,
      map.mapUpdatedAt,
    ])
  );

  return {
    season,
    year,
    mapnumber: computedMapNumbers.length ? computedMapNumbers : mapNumber ? [mapNumber] : [],
    alteration,
    alterationMix,
    filename: filenameBase ? `${filenameBase}.Map.Gbx` : null,
    fileUrl: fileUrl || null,
    thumbnailUrl: thumbnailUrl || null,
    collectionName: toText(
      pickFirstPresent([
        pickFirstNestedValue(payloadSources, ["collectionName", "collection", "environment"]),
        map.mapEnvironment,
      ]) || ""
    ) || null,
    createdWithGamepadEditor: normalizeMaybeBoolean(
      pickFirstPresent([
        pickFirstNestedValue(payloadSources, [
          "createdWithGamepadEditor",
          "created_with_gamepad_editor",
        ]),
      ])
    ),
    createdWithSimpleEditor: normalizeMaybeBoolean(
      pickFirstPresent([
        pickFirstNestedValue(payloadSources, [
          "createdWithSimpleEditor",
          "created_with_simple_editor",
        ]),
      ])
    ),
    isPlayable: normalizeMaybeBoolean(
      pickFirstPresent([pickFirstNestedValue(payloadSources, ["isPlayable", "is_playable"])])
    ),
    timestamp,
    type: pickFirstPresent([
      pickFirstNestedValue(payloadSources, ["type", "map.type"]),
    ]),
  };
}

function resolveMapDownloadUrl(map = {}) {
  const directUrl = toText(map.downloadUrl || map.download_url || "");
  if (directUrl) return directUrl;
  const derived = deriveMapMetadata(map);
  return toText(derived.fileUrl || "");
}

function resolveMapUid(map = {}) {
  return toText(map.mapUid || map.uid || map.map_uid || "");
}

function resolveMapSlot(map = {}) {
  const slot = clampInt(map.slot, { min: 1, max: 999, fallback: 0 });
  return slot || null;
}

function resolveMapCampaignName(map = {}) {
  return toText(map.campaign || map.campaignName || "");
}

function isBetterReferenceCampaign(current, next) {
  if (!current) return true;
  const nextCount = Number(next?.map_count || next?.mapCount || 0);
  const currentCount = Number(current?.map_count || current?.mapCount || 0);
  if (nextCount !== currentCount) return nextCount > currentCount;
  const nextTimestamp = Number(next?.sort_timestamp_ms || next?.sortTimestampMs || 0);
  const currentTimestamp = Number(current?.sort_timestamp_ms || current?.sortTimestampMs || 0);
  if (nextTimestamp !== currentTimestamp) return nextTimestamp > currentTimestamp;
  return Number(next?.campaign_db_id || next?.campaignDbId || 0) > Number(current?.campaign_db_id || current?.campaignDbId || 0);
}

function isNormalNadeoReferenceCampaign(campaign = {}) {
  const family = buildCampaignFamily(campaign?.name);
  if (!family.key || !family.isReferenceLike) return false;
  const environment = toText(campaign?.environment || family?.parsed?.environment || "");
  if (environment) return false;
  const campaignType = toText(campaign?.campaign_type || campaign?.campaignType || family?.parsed?.type || "");
  const normalizedCampaignType = campaignType.toLowerCase();
  if (
    campaignType &&
    normalizedCampaignType !== OFFICIAL_SEASONAL_CAMPAIGN_TYPE &&
    normalizedCampaignType !== DISCOVERY_CAMPAIGN_TYPE &&
    normalizedCampaignType !== LEGACY_CAMPAIGN_TYPE &&
    normalizedCampaignType !== COMPETITION_CAMPAIGN_TYPE &&
    normalizedCampaignType !== "tmgl" &&
    normalizedCampaignType !== "tmwt" &&
    normalizedCampaignType !== "tmwc"
  ) {
    return false;
  }
  return true;
}

function isCompetitionFamily(family = null, campaign = null) {
  const parsedType = toText(family?.parsed?.type || family?.parsed?.special).toLowerCase();
  if (parsedType === "tmgl" || parsedType === "tmwt" || parsedType === "tmwc") return true;
  const campaignType = toText(campaign?.campaign_type || campaign?.campaignType).toLowerCase();
  return campaignType === COMPETITION_CAMPAIGN_TYPE;
}

function limitReferenceCampaignFallback(campaigns = []) {
  const list = Array.isArray(campaigns) ? campaigns : [];
  const selected = [];
  let selectedMapCount = 0;
  for (const campaign of list) {
    if (selected.length >= GLOBAL_REFERENCE_FALLBACK_MAX_CAMPAIGNS) break;
    const campaignMapCount = Math.max(1, Number(campaign?.map_count || campaign?.mapCount || 0) || 0);
    if (
      selected.length > 0 &&
      selectedMapCount + campaignMapCount > GLOBAL_REFERENCE_FALLBACK_MAX_MAPS
    ) {
      break;
    }
    selected.push(campaign);
    selectedMapCount += campaignMapCount;
  }
  return selected;
}

function countSignatureTokens(signature = null) {
  const groups = signature?.groups && typeof signature.groups === "object" ? signature.groups : null;
  if (groups) {
    return Object.values(groups).reduce((sum, entries) => {
      const list = Array.isArray(entries) ? entries : [];
      return sum + list.reduce((inner, entry) => inner + (Number(entry?.count || 0) || 0), 0);
    }, 0);
  }
  return Number(signature?.assetTokenCount || 0);
}

function toPosixPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function buildLocalMapRelativePath(mapUid = "") {
  const safeMapUid = toText(mapUid).toLowerCase();
  if (!safeMapUid) return "";
  const shardA = safeMapUid.slice(0, 2) || "__";
  const shardB = safeMapUid.slice(2, 4) || "__";
  return toPosixPath(path.join("maps", "gbx", shardA, shardB, `${safeMapUid}.Map.Gbx`));
}

function sanitizeLocalFixFileName(sourceFilePath = "", fallback = "fixed-map") {
  const parsed = path.parse(toText(sourceFilePath));
  const baseName = toText(parsed.name || fallback).replace(/\.map$/i, "") || fallback;
  const safeName = baseName.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${safeName || fallback}.Map.Gbx`;
}

function buildLocalMapFixRelativePath(mapUid = "", sourceFilePath = "") {
  const safeMapUid = toText(mapUid).toLowerCase();
  if (!safeMapUid) return "";
  const shardA = safeMapUid.slice(0, 2) || "__";
  const shardB = safeMapUid.slice(2, 4) || "__";
  return toPosixPath(
    path.join("maps", "fixes", shardA, shardB, `${safeMapUid}--${sanitizeLocalFixFileName(sourceFilePath)}`)
  );
}

async function runWithConcurrency(items = [], limit = 4, worker) {
  const list = Array.isArray(items) ? items : [];
  const safeLimit = Math.max(1, Number(limit) || 1);
  const results = new Array(list.length);
  let cursor = 0;

  async function consume() {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(list[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(safeLimit, list.length) }, () => consume()));
  return results;
}

function summarizeCandidates(candidates = []) {
  const list = Array.isArray(candidates) ? candidates : [];
  const matched = list.reduce(
    (sum, candidate) => sum + (String(candidate?.automationState || "") === "matched" ? 1 : 0),
    0
  );
  return {
    matched,
    unmatched: Math.max(0, list.length - matched),
  };
}

function normalizeWrFeedEntry(value = {}) {
  if (!value || typeof value !== "object") return null;
  const mapUid = toText(value.mapUid || value.uid || value.map_uid);
  const name = toText(value.name || value.mapName || value.map_name);
  const accountId = normalizeAccountId(
    value.accountId || value.account_id || value.wrAccountId || value.wr_account_id || value.holder
  );
  const holder =
    sanitizeResolvedDisplayName(value.holder || value.wrHolder || value.displayName, { accountId }) ||
    accountId ||
    "Unknown";
  const wrMs = clampInt(value.wrMs ?? value.wr_ms ?? value.recordTime, {
    min: 0,
    max: 2147483647,
    fallback: 0,
  });
  const at = toNullableIso(value.at || value.recordedAt || value.recorded_at || value.timestamp);
  if (!name && !mapUid) return null;
  return {
    mapUid,
    name: name || mapUid || "Unknown map",
    accountId: accountId || null,
    holder: holder || "Unknown",
    wrMs,
    at: at || new Date().toISOString(),
  };
}

function pickLatestWr(primary, secondary) {
  const first = normalizeWrFeedEntry(primary);
  const second = normalizeWrFeedEntry(secondary);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  const firstMs = Date.parse(first.at || "");
  const secondMs = Date.parse(second.at || "");
  if (Number.isFinite(firstMs) && Number.isFinite(secondMs)) {
    return firstMs >= secondMs ? first : second;
  }
  if (Number.isFinite(firstMs)) return first;
  if (Number.isFinite(secondMs)) return second;
  return first;
}

function groupLeaderboardBuckets(rows = [], { order = "alpha" } = {}) {
  const byBucket = new Map();
  for (const row of asArray(rows)) {
    const bucket = toText(row?.bucket, "Other") || "Other";
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    const accountId = normalizeAccountId(row?.account_id ?? row?.accountId ?? row?.player);
    const displayName = toText(row?.display_name ?? row?.displayName ?? row?.player, "Unknown");
    byBucket.get(bucket).push({
      rank: Number(row?.rank || 0),
      player: displayName || "Unknown",
      account_id: accountId || null,
      display_name: displayName || "Unknown",
      wr_count: Number(row?.wr_count || 0),
      latest_wr_at: toNullableIso(row?.latest_wr_at) || null,
    });
  }

  const sortedBuckets = [...byBucket.keys()].sort((a, b) => {
    if (order === "season") {
      const seasonOrder = ["Winter", "Spring", "Summer", "Fall", "Other"];
      const left = seasonOrder.indexOf(a);
      const right = seasonOrder.indexOf(b);
      if (left !== -1 || right !== -1) {
        const safeLeft = left === -1 ? Number.MAX_SAFE_INTEGER : left;
        const safeRight = right === -1 ? Number.MAX_SAFE_INTEGER : right;
        if (safeLeft !== safeRight) return safeLeft - safeRight;
      }
    }

    if (order === "slot") {
      const leftNum = /^\d+$/.test(a) ? Number(a) : Number.MAX_SAFE_INTEGER;
      const rightNum = /^\d+$/.test(b) ? Number(b) : Number.MAX_SAFE_INTEGER;
      if (leftNum !== rightNum) return leftNum - rightNum;
    }

    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });

  return sortedBuckets.map((bucket) => {
    const players = (byBucket.get(bucket) || []).sort((a, b) => {
      const rankDiff = Number(a.rank || 0) - Number(b.rank || 0);
      if (rankDiff !== 0) return rankDiff;
      const countDiff = Number(b.wr_count || 0) - Number(a.wr_count || 0);
      if (countDiff !== 0) return countDiff;
      return String(a.display_name || a.player || "").localeCompare(
        String(b.display_name || b.player || ""),
        undefined,
        {
          sensitivity: "base",
        }
      );
    });

    const totalWrs = players.reduce((sum, item) => sum + Number(item.wr_count || 0), 0);
    return {
      bucket,
      total_wrs: totalWrs,
      players,
    };
  });
}

function collectLeaderboardAccountIds(rows = []) {
  const ids = [];
  const seen = new Set();
  for (const row of asArray(rows)) {
    const accountId = normalizeAccountId(row?.account_id ?? row?.accountId ?? row?.player);
    if (!accountId || seen.has(accountId)) continue;
    seen.add(accountId);
    ids.push(accountId);
  }
  return ids;
}

function applyLeaderboardDisplayNames(rows = [], namesByAccountId = {}) {
  const map = namesByAccountId && typeof namesByAccountId === "object" ? namesByAccountId : {};
  return asArray(rows).map((row) => {
    const accountId = normalizeAccountId(row?.account_id ?? row?.accountId ?? row?.player);
    if (!accountId) {
      const fallback = toText(row?.display_name ?? row?.displayName ?? row?.player, "Unknown");
      return {
        ...row,
        player: fallback || "Unknown",
        account_id: null,
        display_name: fallback || "Unknown",
      };
    }
    const candidate = toText(
      map[accountId] ??
        row?.display_name ??
        row?.displayName ??
        row?.player,
      ""
    );
    const resolvedName = candidate && !normalizeAccountId(candidate) ? candidate : accountId;
    return {
      ...row,
      player: resolvedName,
      account_id: accountId,
      display_name: resolvedName,
    };
  });
}

function mergeWrDisplayNamesFromTracker({
  wrOverall = [],
  wrBySeasonRows = [],
  wrByCampaignRows = [],
  wrBySlotRows = [],
  namesByAccountId = {},
} = {}) {
  return {
    overall: applyLeaderboardDisplayNames(wrOverall, namesByAccountId),
    bySeasonRows: applyLeaderboardDisplayNames(wrBySeasonRows, namesByAccountId),
    byCampaignRows: applyLeaderboardDisplayNames(wrByCampaignRows, namesByAccountId),
    bySlotRows: applyLeaderboardDisplayNames(wrBySlotRows, namesByAccountId),
  };
}

function collectAllWrLeaderboardAccountIds({
  wrOverall = [],
  wrBySeasonRows = [],
  wrByCampaignRows = [],
  wrBySlotRows = [],
} = {}) {
  const seen = new Set();
  const out = [];
  const push = (rows) => {
    for (const accountId of collectLeaderboardAccountIds(rows)) {
      if (seen.has(accountId)) continue;
      seen.add(accountId);
      out.push(accountId);
    }
  };
  push(wrOverall);
  push(wrBySeasonRows);
  push(wrByCampaignRows);
  push(wrBySlotRows);
  return out;
}

function sortOverallWrRows(rows = []) {
  return asArray(rows).sort((a, b) => {
    const countDiff = Number(b.wr_count || 0) - Number(a.wr_count || 0);
    if (countDiff !== 0) return countDiff;
    const timeDiff =
      new Date(b.latest_wr_at || 0).getTime() - new Date(a.latest_wr_at || 0).getTime();
    if (timeDiff !== 0) return timeDiff;
    return String(a.display_name || a.player || "").localeCompare(
      String(b.display_name || b.player || ""),
      undefined,
      {
        sensitivity: "base",
      }
    );
  });
}

function inferSeasonFromCampaignName(value) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("winter")) return "Winter";
  if (lower.includes("spring")) return "Spring";
  if (lower.includes("summer")) return "Summer";
  if (lower.includes("fall") || lower.includes("autumn")) return "Fall";
  return "Other";
}

function buildWrLeaderboardsFromTrackerMaps(trackerMaps = []) {
  const normalizedMaps = asArray(trackerMaps)
    .map((item) => {
      const accountId = normalizeAccountId(
        item?.wrAccountId ?? item?.wr_account_id ?? item?.accountId ?? item?.account_id
      );
      const player =
        sanitizeResolvedDisplayName(item?.wrHolder || item?.wr_holder || "", { accountId }) ||
        accountId ||
        "";
      const wrMs = clampInt(item?.wrMs ?? item?.wr_ms, { min: 0, max: 2147483647, fallback: 0 });
      const lower = player.trim().toLowerCase();
      if (!player || lower === "-" || lower === "unknown") return null;
      const campaign = toText(item?.campaign, "Unassigned") || "Unassigned";
      const slotInt = clampInt(item?.slot, { min: 0, max: 5000, fallback: 0 });
      const slot = slotInt >= 1 && slotInt <= 25 ? String(slotInt).padStart(2, "0") : "Other";
      const latestWrAt = toNullableIso(item?.wrUpdatedAt || item?.wr_updated_at) || null;
      if (wrMs <= 0 && !latestWrAt) return null;
      return {
        accountId: accountId || null,
        player,
        campaign,
        season: inferSeasonFromCampaignName(campaign),
        slot,
        latestWrAt,
      };
    })
    .filter(Boolean);

  const overallMap = new Map();
  const seasonMap = new Map();
  const campaignMap = new Map();
  const slotMap = new Map();

  const upsert = (target, bucket, player, latestWrAt, accountId = "") => {
    const key = `${bucket}::${accountId || player.toLowerCase()}`;
    if (!target.has(key)) {
      target.set(key, {
        bucket,
        account_id: accountId || null,
        player,
        wr_count: 0,
        latest_wr_at: latestWrAt,
      });
    }
    const current = target.get(key);
    current.wr_count += 1;
    if (latestWrAt && (!current.latest_wr_at || new Date(latestWrAt) > new Date(current.latest_wr_at))) {
      current.latest_wr_at = latestWrAt;
    }
  };

  for (const item of normalizedMaps) {
    upsert(overallMap, "overall", item.player, item.latestWrAt, item.accountId || "");
    upsert(seasonMap, item.season, item.player, item.latestWrAt, item.accountId || "");
    upsert(campaignMap, item.campaign, item.player, item.latestWrAt, item.accountId || "");
    upsert(slotMap, item.slot, item.player, item.latestWrAt, item.accountId || "");
  }

  const overall = [...overallMap.values()]
    .sort((a, b) => {
      const countDiff = Number(b.wr_count || 0) - Number(a.wr_count || 0);
      if (countDiff !== 0) return countDiff;
      const timeDiff =
        new Date(b.latest_wr_at || 0).getTime() - new Date(a.latest_wr_at || 0).getTime();
      if (timeDiff !== 0) return timeDiff;
      return String(a.player || "").localeCompare(String(b.player || ""), undefined, {
        sensitivity: "base",
      });
    })
    .map((row) => ({
      account_id: row.account_id || null,
      player: row.player,
      wr_count: Number(row.wr_count || 0),
      latest_wr_at: row.latest_wr_at || null,
    }));

  const toRankedRows = (target) => {
    const byBucket = new Map();
    for (const row of target.values()) {
      if (!byBucket.has(row.bucket)) byBucket.set(row.bucket, []);
      byBucket.get(row.bucket).push({
        account_id: row.account_id || null,
        player: row.player,
        wr_count: Number(row.wr_count || 0),
        latest_wr_at: row.latest_wr_at || null,
      });
    }

    const out = [];
    for (const [bucket, players] of byBucket.entries()) {
      players
        .sort((a, b) => {
          const countDiff = Number(b.wr_count || 0) - Number(a.wr_count || 0);
          if (countDiff !== 0) return countDiff;
          const timeDiff =
            new Date(b.latest_wr_at || 0).getTime() - new Date(a.latest_wr_at || 0).getTime();
          if (timeDiff !== 0) return timeDiff;
          return String(a.player || "").localeCompare(String(b.player || ""), undefined, {
            sensitivity: "base",
          });
        })
        .forEach((entry, index) => {
          out.push({
            bucket,
            account_id: entry.account_id || null,
            player: entry.player,
            wr_count: entry.wr_count,
            latest_wr_at: entry.latest_wr_at,
            rank: index + 1,
          });
        });
    }
    return out;
  };

  return {
    overall,
    by_season_rows: toRankedRows(seasonMap),
    by_campaign_rows: toRankedRows(campaignMap),
    by_slot_rows: toRankedRows(slotMap),
  };
}

function chunk(items, size) {
  const safeSize = Math.max(1, Number(size) || 1);
  const out = [];
  for (let i = 0; i < items.length; i += safeSize) {
    out.push(items.slice(i, i + safeSize));
  }
  return out;
}

function firstTruthy(values = []) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function firstPositiveInt(values = []) {
  for (const value of values) {
    const parsed = clampInt(value, { min: 1, max: 2147483647, fallback: 0 });
    if (parsed > 0) return parsed;
  }
  return 0;
}

function normalizeCampaignSlotValue({ slot, order, position, fallbackSlot = 1, max = 20000 } = {}) {
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

function normalizeMapUid(value) {
  return String(value || "").trim();
}

function normalizeMapFromInput(rawMap = {}, fallbackSlot = 1) {
  const uid = normalizeMapUid(rawMap.uid || rawMap.mapUid || rawMap.map_uid);
  if (!uid) return null;
  return {
    uid,
    mapId: toText(rawMap.mapId || rawMap.map_id || rawMap.id || ""),
    name: firstTruthy([rawMap.name, rawMap.title, rawMap.mapName, uid]),
    slot: normalizeCampaignSlotValue({
      slot: rawMap.slot,
      order: rawMap.order,
      position: rawMap.position ?? rawMap.campaignMap?.position,
      fallbackSlot,
      max: 20000,
    }),
    author: toText(rawMap.author || ""),
    submitter: toText(rawMap.submitter || ""),
    authorMs: clampInt(rawMap.authorMs ?? rawMap.authorTime ?? rawMap.author_time, {
      min: 0,
      max: 2147483647,
      fallback: 0,
    }),
    goldMs: clampInt(rawMap.goldMs ?? rawMap.goldTime ?? rawMap.gold_time, {
      min: 0,
      max: 2147483647,
      fallback: 0,
    }),
    silverMs: clampInt(rawMap.silverMs ?? rawMap.silverTime ?? rawMap.silver_time, {
      min: 0,
      max: 2147483647,
      fallback: 0,
    }),
    bronzeMs: clampInt(rawMap.bronzeMs ?? rawMap.bronzeTime ?? rawMap.bronze_time, {
      min: 0,
      max: 2147483647,
      fallback: 0,
    }),
    nbLaps: clampInt(rawMap.nbLaps ?? rawMap.nb_laps, {
      min: 1,
      max: 64,
      fallback: 1,
    }),
    playerCount: clampInt(
      rawMap.playerCount ??
        rawMap.player_count ??
        rawMap.nbPlayers ??
        rawMap.nb_players ??
        rawMap.playCount ??
        rawMap.play_count ??
        rawMap.playersCount ??
        rawMap.players_count,
      {
        min: 0,
        max: 2147483647,
        fallback: 0,
      }
    ),
    thumbnailUrl: toText(rawMap.thumbnailUrl ?? rawMap.thumbnail_url ?? ""),
    downloadUrl: toText(rawMap.downloadUrl ?? rawMap.download_url ?? rawMap.fileUrl ?? ""),
    mapType: toText(rawMap.mapType ?? rawMap.map_type ?? rawMap.type ?? ""),
    mapStyle: toText(rawMap.mapStyle ?? rawMap.map_style ?? rawMap.style ?? ""),
    mapEnvironment: toText(
      rawMap.mapEnvironment ?? rawMap.map_environment ?? rawMap.environment ?? rawMap.mood ?? ""
    ),
    mapCreatedAt: toFlexibleIso(
      rawMap.mapCreatedAt ??
        rawMap.map_created_at ??
        rawMap.createdAt ??
        rawMap.created_at ??
        rawMap.uploadTimestamp
    ),
    mapUpdatedAt: toFlexibleIso(
      rawMap.mapUpdatedAt ??
        rawMap.map_updated_at ??
        rawMap.updatedAt ??
        rawMap.updated_at ??
        rawMap.updateTimestamp
    ),
    raw: rawMap,
  };
}

function mergeMapDetail(baseMap, detailMap = null) {
  if (!detailMap) return baseMap;
  const detail = normalizeMapFromInput(detailMap, baseMap.slot);
  if (!detail) return baseMap;
  return {
    ...baseMap,
    ...detail,
    uid: baseMap.uid,
    slot: baseMap.slot,
    raw: {
      campaignMap: baseMap.raw || null,
      mapDetail: detailMap,
    },
  };
}

function extractActivities(payload) {
  if (Array.isArray(payload)) return payload;
  const obj = payload && typeof payload === "object" ? payload : {};
  const candidates = [
    obj.activityList,
    obj.activities,
    obj.clubActivityList,
    obj.results,
    obj.items,
    obj.data,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractMembers(payload) {
  if (Array.isArray(payload)) return payload;
  const obj = payload && typeof payload === "object" ? payload : {};
  const candidates = [
    obj.memberList,
    obj.members,
    obj.clubMemberList,
    obj.clubMembers,
    obj.results,
    obj.items,
    obj.data,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractActivityId(activity = {}) {
  return (
    firstPositiveInt([activity.activityId, activity.activity_id, activity.id, activity.objectId]) || null
  );
}

function extractBucketId(value = {}) {
  return (
    firstPositiveInt([
      value.bucketId,
      value.bucket_id,
      value.activityObjectId,
      value.activity_object_id,
      value.objectId,
      value.object_id,
      value.bucket?.id,
      value.bucket?.bucketId,
    ]) || null
  );
}

function extractMapUidFromActivity(value = {}) {
  return firstTruthy([
    value.mapUid,
    value.map_uid,
    value.map?.uid,
    value.track?.uid,
    value.item?.uid,
    value.object?.uid,
  ]);
}

function isUploadLikeActivity(activity = {}) {
  const bucketId = extractBucketId(activity);
  if (bucketId) return true;
  const hints = [
    activity.activityType,
    activity.activity_type,
    activity.itemType,
    activity.item_type,
    activity.type,
    activity.targetType,
    activity.target_type,
    activity.objectType,
    activity.object_type,
    activity.name,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  if (hints.includes("bucket") || hints.includes("upload")) return true;
  return Boolean(extractMapUidFromActivity(activity));
}

function extractUploadMaps(payload = {}) {
  const candidates = [
    payload.maps,
    payload.mapList,
    payload.map_list,
    payload.uploadedMaps,
    payload.uploaded_map_list,
    payload.items,
    payload.bucket?.maps,
    payload.bucket?.mapList,
    payload.bucket?.map_list,
  ];
  for (const list of candidates) {
    if (!Array.isArray(list)) continue;
    const maps = [];
    for (let index = 0; index < list.length; index += 1) {
      const map = normalizeMapFromInput(list[index] || {}, index + 1);
      if (map) maps.push(map);
    }
    if (maps.length) return uniqueBy(maps, (map) => map.uid.toLowerCase());
  }
  const singleMap = normalizeMapFromInput(payload, 1);
  if (singleMap) return [singleMap];
  return [];
}

function extractUploadDescriptorFromActivity(activity = {}) {
  if (!isUploadLikeActivity(activity)) return null;
  const bucketId = extractBucketId(activity);
  const mapUid = extractMapUidFromActivity(activity);
  const maps = mapUid
    ? [
        {
          uid: mapUid,
          mapId: toText(activity.mapId ?? activity.map_id ?? ""),
          name: firstTruthy([activity.mapName, activity.map_name, activity.name, mapUid]),
          slot: 1,
          author: toText(activity.author ?? activity.authorId ?? activity.author_id ?? ""),
          submitter: toText(activity.submitter ?? activity.submitterId ?? activity.submitter_id ?? ""),
          raw: activity,
        },
      ]
    : [];
  return {
    bucketId: bucketId || null,
    bucketType: firstTruthy([
      activity.bucketType,
      activity.bucket_type,
      activity.itemType,
      activity.item_type,
      "map",
    ]),
    name: firstTruthy([
      activity.bucketName,
      activity.bucket_name,
      activity.itemName,
      activity.item_name,
      activity.name,
    ]),
    activityId: extractActivityId(activity),
    mapCount: maps.length,
    active:
      parseOptionalBoolean(activity.active) ??
      parseOptionalBoolean(activity.isActive) ??
      parseOptionalBoolean(activity.enabled) ??
      true,
    maps,
    raw: activity,
  };
}

function extractUploadBuckets(payload) {
  const rawBuckets = Array.isArray(payload)
    ? payload
    : extractActivities(payload).length
      ? extractActivities(payload)
      : (() => {
          const obj = payload && typeof payload === "object" ? payload : {};
          const candidates = [
            obj.bucketList,
            obj.buckets,
            obj.clubBuckets,
            obj.results,
            obj.items,
            obj.data,
          ];
          for (const candidate of candidates) {
            if (Array.isArray(candidate)) return candidate;
          }
          return [];
        })();
  const out = [];
  for (const rawBucket of rawBuckets) {
    if (!rawBucket || typeof rawBucket !== "object") continue;
    const descriptor = {
      bucketId: extractBucketId(rawBucket),
      bucketType: firstTruthy([rawBucket.bucketType, rawBucket.bucket_type, rawBucket.type, "map"]),
      name: firstTruthy([rawBucket.name, rawBucket.title, rawBucket.bucketName, rawBucket.bucket_name]),
      activityId:
        extractActivityId(rawBucket) ||
        firstPositiveInt([rawBucket.activity?.id, rawBucket.activityId, rawBucket.activity_id]) ||
        null,
      mapCount: clampInt(rawBucket.mapCount ?? rawBucket.map_count, {
        min: 0,
        max: 2147483647,
        fallback: 0,
      }),
      active:
        parseOptionalBoolean(rawBucket.active) ??
        parseOptionalBoolean(rawBucket.isActive) ??
        parseOptionalBoolean(rawBucket.enabled) ??
        true,
      maps: extractUploadMaps(rawBucket),
      raw: rawBucket,
    };
    if (!descriptor.bucketId) {
      if (!descriptor.maps.length && !descriptor.name) continue;
      descriptor.bucketId =
        firstPositiveInt([rawBucket.id, rawBucket.objectId, rawBucket.object_id]) || null;
    }
    descriptor.mapCount = Math.max(descriptor.mapCount, descriptor.maps.length);
    out.push(descriptor);
  }
  return out;
}

function bucketMergeKey(bucket = {}, index = 0) {
  const bucketId = firstPositiveInt([bucket.bucketId, bucket.bucket_id, bucket.id]);
  if (bucketId) return `id:${bucketId}`;
  const activityId = firstPositiveInt([bucket.activityId, bucket.activity_id, bucket.activity?.id]);
  if (activityId) return `activity:${activityId}`;
  const name = firstTruthy([bucket.name, bucket.title, bucket.bucketName]).toLowerCase();
  if (name) return `name:${name}`;
  return `tmp:${index}`;
}

function mergeUploadBuckets(...lists) {
  const merged = new Map();
  for (const list of lists) {
    for (const bucket of Array.isArray(list) ? list : []) {
      if (!bucket) continue;
      const key = bucketMergeKey(bucket, merged.size);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          ...bucket,
          maps: uniqueBy(Array.isArray(bucket.maps) ? bucket.maps : [], (map) =>
            String(map?.uid || map?.mapUid || "").toLowerCase()
          ),
        });
        continue;
      }
      const mergedMaps = uniqueBy(
        [...(Array.isArray(existing.maps) ? existing.maps : []), ...(Array.isArray(bucket.maps) ? bucket.maps : [])],
        (map) => String(map?.uid || map?.mapUid || "").toLowerCase()
      );
      merged.set(key, {
        ...existing,
        ...bucket,
        mapCount: Math.max(
          Number(existing.mapCount || 0),
          Number(bucket.mapCount || 0),
          mergedMaps.length
        ),
        maps: mergedMaps,
      });
    }
  }
  return [...merged.values()];
}

function isCampaignLikeActivity(activity = {}) {
  const hints = [
    activity.activityType,
    activity.activity_type,
    activity.itemType,
    activity.item_type,
    activity.type,
    activity.targetType,
    activity.target_type,
    activity.objectType,
    activity.object_type,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  if (hints.includes("campaign") || hints.includes("playlist")) return true;
  return Boolean(
    firstPositiveInt([
      activity.campaignId,
      activity.campaign_id,
      activity.campaign?.id,
      activity.campaign?.campaignId,
    ])
  );
}

function extractCampaignFromActivity(activity = {}) {
  if (!isCampaignLikeActivity(activity)) return null;
  const campaignId = firstPositiveInt([
    activity.campaignId,
    activity.campaign_id,
    activity.externalId,
    activity.external_id,
    activity.campaign?.id,
    activity.campaign?.campaignId,
  ]);
  const name = firstTruthy([
    activity.campaignName,
    activity.campaign_name,
    activity.campaign?.name,
    activity.name,
    activity.itemName,
    activity.item_name,
  ]);
  return {
    campaignId: campaignId || null,
    name: name || (campaignId ? `Campaign ${campaignId}` : ""),
    activityId: firstPositiveInt([activity.id, activity.activityId, activity.activity_id]) || null,
    activityType: firstTruthy([
      activity.activityType,
      activity.activity_type,
      activity.type,
      activity.itemType,
      activity.item_type,
    ]),
    raw: activity,
  };
}

function extractCampaignDescriptorFromObject(raw = {}) {
  const campaignId = firstPositiveInt([
    raw.campaignId,
    raw.campaign_id,
    raw.id,
    raw.campaign?.id,
    raw.playlistId,
    raw.playlist_id,
  ]);
  const name = firstTruthy([
    raw.name,
    raw.campaignName,
    raw.campaign_name,
    raw.campaign?.name,
  ]);
  if (!campaignId && !name) return null;
  return {
    campaignId: campaignId || null,
    name: name || (campaignId ? `Campaign ${campaignId}` : ""),
    activityId: firstPositiveInt([raw.activityId, raw.activity_id, raw.id]) || null,
    activityType: firstTruthy([raw.activityType, raw.activity_type, raw.type]),
    raw,
  };
}

function extractCampaignMaps(campaignPayload = {}) {
  const candidates = [
    campaignPayload.maps,
    campaignPayload.mapList,
    campaignPayload.map_list,
    campaignPayload.campaign?.maps,
    campaignPayload.campaign?.mapList,
    campaignPayload.campaign?.map_list,
    campaignPayload.campaign?.playlist,
    campaignPayload.campaign?.playlistMapList,
    campaignPayload.playlist,
    campaignPayload.playlistMapList,
  ];
  for (const list of candidates) {
    if (!Array.isArray(list)) continue;
    const normalized = [];
    for (let index = 0; index < list.length; index += 1) {
      const map = normalizeMapFromInput(list[index] || {}, index + 1);
      if (map) normalized.push(map);
    }
    if (normalized.length) {
      return uniqueBy(normalized, (map) => map.uid.toLowerCase());
    }
  }
  return [];
}

function collectMapperAccountIds(campaigns = []) {
  const out = [];
  for (const campaign of Array.isArray(campaigns) ? campaigns : []) {
    const maps = Array.isArray(campaign?.maps) ? campaign.maps : [];
    for (const map of maps) {
      const authorId = normalizeAccountId(map?.author);
      if (authorId) out.push(authorId);
      const submitterId = normalizeAccountId(map?.submitter);
      if (submitterId) out.push(submitterId);
    }
  }
  return uniqueBy(out, (accountId) => accountId);
}

class AlteredService {
  constructor({
    repository,
    trackerClient,
    trackerMapSyncClients = [],
    trackerDisplaynameClient = null,
    trackerClubClient = null,
    aggregatorClient = null,
    liveClient = null,
    mapperNameClient = null,
    trackerIntegrations = {},
    liveMonitorConfig = {},
    mapperNameSyncConfig = {},
    mapCopyConfig = {},
    logger = console,
  }) {
    this.repository = repository;
    this.trackerClient = trackerClient;
    this.trackerDisplaynameClient = trackerDisplaynameClient;
    this.trackerClubClient = trackerClubClient;
    this.aggregatorClient = aggregatorClient;
    this.liveClient = liveClient;
    this.mapperNameClient = mapperNameClient;
    this.logger = logger;

    this.alterationsSync = {
      running: false,
      queued: false,
      runCounter: 0,
      currentReason: null,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastDurationMs: null,
      lastError: null,
      lastSummary: null,
      worker: null,
      promise: null,
    };
    this.trackerMapSyncTargets = [];
    const pushTrackerTarget = ({ key, label, client, primary = false } = {}) => {
      if (!client || typeof client.bulkUpsertMaps !== "function") return;
      const targetKey = String(key || label || "tracker").trim().toLowerCase() || "tracker";
      const targetLabel = String(label || targetKey).trim() || targetKey;
      const adminBaseUrl = String(client?.adminBaseUrl || "").trim();
      const dedupeKey = adminBaseUrl ? `${targetKey}|${adminBaseUrl}` : targetKey;
      if (this.trackerMapSyncTargets.some((item) => item.dedupeKey === dedupeKey)) return;
      this.trackerMapSyncTargets.push({
        key: targetKey,
        label: targetLabel,
        dedupeKey,
        primary: Boolean(primary),
        adminBaseUrl,
        client,
      });
    };
    pushTrackerTarget({
      key: "wr",
      label: "tracker-wr",
      client: trackerClient,
      primary: true,
    });
    for (const target of Array.isArray(trackerMapSyncClients) ? trackerMapSyncClients : []) {
      pushTrackerTarget({
        key: target?.key,
        label: target?.label,
        client: target?.client,
        primary: false,
      });
    }
    this.trackerIntegrations = {
      displaynameEnabled:
        trackerIntegrations.displaynameEnabled === undefined
          ? true
          : Boolean(trackerIntegrations.displaynameEnabled),
      displaynameFallbackLocal:
        trackerIntegrations.displaynameFallbackLocal === undefined
          ? true
          : Boolean(trackerIntegrations.displaynameFallbackLocal),
      displaynameRelayAvailable: true,
      clubEnabled:
        trackerIntegrations.clubEnabled === undefined
          ? true
          : Boolean(trackerIntegrations.clubEnabled),
      clubFallbackLocal:
        trackerIntegrations.clubFallbackLocal === undefined
          ? true
          : Boolean(trackerIntegrations.clubFallbackLocal),
      clubRelayAvailable: true,
      lastDisplaynameRelay: null,
      lastDisplaynameRelayError: null,
      lastClubRelay: null,
      lastClubRelayError: null,
    };
    const storedMonitorConfig =
      typeof this.repository?.getLiveMonitorConfig === "function"
        ? this.repository.getLiveMonitorConfig()
        : null;
    const mergedMonitorConfig = {
      ...liveMonitorConfig,
      ...(storedMonitorConfig || {}),
    };
    const hasLiveMonitorEnvOverride = (key) => {
      if (!key) return false;
      const raw = process.env[key];
      return raw !== undefined && raw !== null && String(raw).trim() !== "";
    };
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_MONITOR_ENABLED")) {
      mergedMonitorConfig.enabled = liveMonitorConfig.enabled;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_MONITOR_SCHEDULE_MODE")) {
      mergedMonitorConfig.scheduleMode = liveMonitorConfig.scheduleMode;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_MONITOR_DAILY_HOUR_UTC")) {
      mergedMonitorConfig.dailyHourUtc = liveMonitorConfig.dailyHourUtc;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_MONITOR_DAILY_MINUTE_UTC")) {
      mergedMonitorConfig.dailyMinuteUtc = liveMonitorConfig.dailyMinuteUtc;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_CLUB_ID")) {
      mergedMonitorConfig.clubId = liveMonitorConfig.clubId;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_MONITOR_INTERVAL_SECONDS")) {
      mergedMonitorConfig.intervalSeconds = liveMonitorConfig.intervalSeconds;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_DISCOVERY_ENABLED")) {
      mergedMonitorConfig.discoveryEnabled = liveMonitorConfig.discoveryEnabled;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_DISCOVERY_INTERVAL_SECONDS")) {
      mergedMonitorConfig.discoveryIntervalSeconds = liveMonitorConfig.discoveryIntervalSeconds;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_DISCOVERY_CAMPAIGN_LIMIT")) {
      mergedMonitorConfig.discoveryCampaignLimit = liveMonitorConfig.discoveryCampaignLimit;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_DISCOVERY_ACTIVITY_PAGE_SIZE")) {
      mergedMonitorConfig.discoveryActivityPageSize = liveMonitorConfig.discoveryActivityPageSize;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_ACTIVITY_PAGE_SIZE")) {
      mergedMonitorConfig.activityPageSize = liveMonitorConfig.activityPageSize;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_ACTIVITY_ACTIVE_ONLY")) {
      mergedMonitorConfig.activeOnly = liveMonitorConfig.activeOnly;
    }
    if (hasLiveMonitorEnvOverride("ALTERED_LIVE_FETCH_MAP_DETAILS")) {
      mergedMonitorConfig.fetchMapDetails = liveMonitorConfig.fetchMapDetails;
    }
    this.liveMonitor = {
      enabled: Boolean(mergedMonitorConfig.enabled),
      scheduleMode: normalizeScheduleMode(mergedMonitorConfig.scheduleMode, "daily"),
      dailyHourUtc: clampInt(mergedMonitorConfig.dailyHourUtc, {
        min: 0,
        max: 23,
        fallback: DEFAULT_DAILY_HOUR_UTC,
      }),
      dailyMinuteUtc: clampInt(mergedMonitorConfig.dailyMinuteUtc, {
        min: 0,
        max: 59,
        fallback: DEFAULT_DAILY_MINUTE_UTC,
      }),
      clubId: clampInt(mergedMonitorConfig.clubId, {
        min: 1,
        max: 2147483647,
        fallback: 24231,
      }),
      intervalSeconds: clampInt(mergedMonitorConfig.intervalSeconds, {
        min: 60,
        max: 86400,
        fallback: 21600,
      }),
      discoveryEnabled:
        mergedMonitorConfig.discoveryEnabled === undefined
          ? true
          : Boolean(mergedMonitorConfig.discoveryEnabled),
      discoveryIntervalSeconds: clampInt(mergedMonitorConfig.discoveryIntervalSeconds, {
        min: 300,
        max: 86400,
        fallback: DEFAULT_DISCOVERY_INTERVAL_SECONDS,
      }),
      discoveryCampaignLimit: clampInt(mergedMonitorConfig.discoveryCampaignLimit, {
        min: 1,
        max: 250,
        fallback: DEFAULT_DISCOVERY_CAMPAIGN_LIMIT,
      }),
      discoveryActivityPageSize: clampInt(mergedMonitorConfig.discoveryActivityPageSize, {
        min: 1,
        max: 250,
        fallback: DEFAULT_DISCOVERY_ACTIVITY_PAGE_SIZE,
      }),
      activityPageSize: clampInt(mergedMonitorConfig.activityPageSize, {
        min: 1,
        max: 250,
        fallback: 250,
      }),
      activeOnly: Boolean(mergedMonitorConfig.activeOnly),
      fetchMapDetails:
        mergedMonitorConfig.fetchMapDetails === undefined
          ? true
          : Boolean(mergedMonitorConfig.fetchMapDetails),
      trackerChunkSize: clampInt(mergedMonitorConfig.trackerChunkSize, {
        min: 25,
        max: 1000,
        fallback: DEFAULT_TRACKER_SYNC_CHUNK_SIZE,
      }),
      timer: null,
      nextRunAt: null,
      discoveryTimer: null,
      nextDiscoveryRunAt: null,
      running: false,
      discoveryRunning: false,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastDurationMs: null,
      lastError: null,
      lastSummary: null,
      lastDiscoveryStartedAt: null,
      lastDiscoveryFinishedAt: null,
      lastDiscoveryDurationMs: null,
      lastDiscoveryError: null,
      lastDiscoverySummary: null,
      progress: null,
      runCounter: 0,
    };
    if (
      !storedMonitorConfig &&
      typeof this.repository?.upsertLiveMonitorConfig === "function"
    ) {
      this.repository.upsertLiveMonitorConfig(this.getLiveMonitorConfigSnapshot());
    }

    this.mapperNameSync = {
      enabled:
        mapperNameSyncConfig.enabled === undefined ? true : Boolean(mapperNameSyncConfig.enabled),
      bootstrapIntervalSeconds: clampInt(mapperNameSyncConfig.bootstrapIntervalSeconds, {
        min: 60,
        max: 86400,
        fallback: DEFAULT_MAPPER_BOOTSTRAP_INTERVAL_SECONDS,
      }),
      maintenanceIntervalSeconds: clampInt(mapperNameSyncConfig.maintenanceIntervalSeconds, {
        min: 60,
        max: 86400,
        fallback: DEFAULT_MAPPER_MAINTENANCE_INTERVAL_SECONDS,
      }),
      priorityIntervalSeconds: clampInt(mapperNameSyncConfig.priorityIntervalSeconds, {
        min: 60,
        max: 86400,
        fallback: DEFAULT_MAPPER_PRIORITY_INTERVAL_SECONDS,
      }),
      batchSize: clampInt(mapperNameSyncConfig.batchSize, {
        min: 1,
        max: 50,
        fallback: DEFAULT_MAPPER_SYNC_BATCH_SIZE,
      }),
      priorityBatchSize: clampInt(mapperNameSyncConfig.priorityBatchSize, {
        min: 1,
        max: 50,
        fallback: DEFAULT_MAPPER_PRIORITY_BATCH_SIZE,
      }),
      priorityTopLimit: clampInt(mapperNameSyncConfig.priorityTopLimit, {
        min: 1,
        max: 2000,
        fallback: DEFAULT_MAPPER_PRIORITY_TOP_LIMIT,
      }),
      priorityRefreshSeconds: clampInt(mapperNameSyncConfig.priorityRefreshSeconds, {
        min: 30,
        max: 86400,
        fallback: DEFAULT_MAPPER_PRIORITY_REFRESH_SECONDS,
      }),
      cacheTtlSeconds: clampInt(mapperNameSyncConfig.cacheTtlSeconds, {
        min: 0,
        max: 30 * 24 * 60 * 60,
        fallback: DEFAULT_MAPPER_CACHE_TTL_SECONDS,
      }),
      priorityCacheTtlSeconds: clampInt(mapperNameSyncConfig.priorityCacheTtlSeconds, {
        min: 0,
        max: 30 * 24 * 60 * 60,
        fallback: DEFAULT_MAPPER_PRIORITY_CACHE_TTL_SECONDS,
      }),
      minRequestGapMs: clampInt(mapperNameSyncConfig.minRequestGapMs, {
        min: DEFAULT_MAPPER_REQUEST_GAP_MS,
        max: 120000,
        fallback: DEFAULT_MAPPER_REQUEST_GAP_MS,
      }),
      mode: "bootstrap",
      timer: null,
      priorityTimer: null,
      nextRunAt: null,
      nextPriorityRunAt: null,
      running: false,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastError: null,
      lastSummary: null,
      nextLookupAllowedAtMs: 0,
      knownAccountsRefreshedAtMs: 0,
      knownAccountsRefreshSeconds: clampInt(mapperNameSyncConfig.knownAccountsRefreshSeconds, {
        min: 60,
        max: 86400,
        fallback: DEFAULT_MAPPER_KNOWN_ACCOUNTS_REFRESH_SECONDS,
      }),
      priorityAccountsRefreshedAtMs: 0,
      priorityAccountIds: [],
      viewedPriorityAccountIds: [],
      viewedPriorityQueuedAtMsByAccountId: new Map(),
      viewedPriorityCooldownMs: VIEW_PRIORITY_ACCOUNT_TTL_MS,
      viewedPriorityRelayKickoffCooldownMs: VIEW_PRIORITY_RELAY_KICKOFF_COOLDOWN_MS,
      viewedPriorityLocalKickoffCooldownMs: VIEW_PRIORITY_RELAY_KICKOFF_COOLDOWN_MS,
      lastViewedPriorityRelayKickoffAtMs: 0,
      lastViewedPriorityLocalKickoffAtMs: 0,
      runCounter: 0,
    };

    this.playerNamesCache = new Map();
    this.playerNamesCacheTtlMs = 15 * 60 * 1000;

    this.mapCopy = {
      dataDir: toText(mapCopyConfig.dataDir || DATA_DIR) || DATA_DIR,
      rootDir: path.join(toText(mapCopyConfig.dataDir || DATA_DIR) || DATA_DIR, "maps", "gbx"),
      enabled:
        mapCopyConfig.enabled === undefined
          ? Boolean(ALTERED_MAP_COPY_BACKFILL_ENABLED)
          : Boolean(mapCopyConfig.enabled),
      batchSize: clampInt(
        mapCopyConfig.batchSize === undefined
          ? ALTERED_MAP_COPY_BACKFILL_BATCH_SIZE
          : mapCopyConfig.batchSize,
        {
          min: 1,
          max: 2000,
          fallback: DEFAULT_MAP_COPY_BACKFILL_BATCH_SIZE,
        }
      ),
      maxConcurrentDownloads: clampInt(
        mapCopyConfig.maxConcurrentDownloads === undefined
          ? ALTERED_MAP_COPY_MAX_CONCURRENT_DOWNLOADS
          : mapCopyConfig.maxConcurrentDownloads,
        {
          min: 1,
          max: 32,
          fallback: DEFAULT_MAP_COPY_MAX_CONCURRENT_DOWNLOADS,
        }
      ),
      requestTimeoutMs: Math.max(
        2000,
        Number(
          mapCopyConfig.requestTimeoutMs === undefined
            ? ALTERED_MAP_COPY_REQUEST_TIMEOUT_MS
            : mapCopyConfig.requestTimeoutMs
        ) || ALTERED_MAP_COPY_REQUEST_TIMEOUT_MS
      ),
      running: false,
      runCounter: 0,
      currentRunId: null,
      currentReason: null,
      currentProgress: null,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastDurationMs: null,
      lastError: null,
      lastSummary: null,
    };

    this.namingSimilarityBackfill = {
      running: false,
      runCounter: 0,
      mode: "internal",
      currentRunId: null,
      currentReason: null,
      currentPromise: null,
      currentProgress: null,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastDurationMs: null,
      lastError: null,
      lastSummary: null,
      childProcess: null,
      childPid: null,
      targetClubId: null,
      rescanAll: false,
      progressFilePath: path.join(
        this.mapCopy.dataDir,
        "tmp",
        NAMING_SIMILARITY_PROGRESS_FILE_NAME
      ),
      mapUidsFilePath: path.join(
        this.mapCopy.dataDir,
        "tmp",
        NAMING_SIMILARITY_MAP_UIDS_FILE_NAME
      ),
    };

    this.projectSourceSync = {
      timer: null,
      nextRunAt: null,
      running: false,
      currentSourceKey: null,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastError: null,
      lastSummary: null,
    };
  }

  collectAccountIds(rows = [], keys = []) {
    const safeKeys = Array.isArray(keys) ? keys : [];
    const ids = [];
    const seen = new Set();
    for (const row of asArray(rows)) {
      for (const key of safeKeys) {
        const accountId = normalizeAccountId(row?.[key]);
        if (!accountId || seen.has(accountId)) continue;
        seen.add(accountId);
        ids.push(accountId);
      }
    }
    return ids;
  }

  collectHolderAccountIds(rows = [], keys = []) {
    return this.collectAccountIds(rows, keys);
  }

  getTrackerSyncTargetClient(targetKey = "") {
    const safeKey = String(targetKey || "").trim().toLowerCase();
    if (!safeKey) return null;
    const target = this.trackerMapSyncTargets.find((item) => String(item?.key || "").trim().toLowerCase() === safeKey);
    return target?.client || null;
  }

  pruneViewedPriorityAccountIds(nowMs = Date.now()) {
    const ttlMs = Math.max(1000, Number(this.mapperNameSync.viewedPriorityCooldownMs || 0) || 0);
    const queueMap = this.mapperNameSync.viewedPriorityQueuedAtMsByAccountId;
    if (!(queueMap instanceof Map)) {
      this.mapperNameSync.viewedPriorityQueuedAtMsByAccountId = new Map();
      this.mapperNameSync.viewedPriorityAccountIds = [];
      return;
    }
    for (const [accountId, queuedAtMs] of queueMap.entries()) {
      if (!queuedAtMs || nowMs - Number(queuedAtMs || 0) >= ttlMs) {
        queueMap.delete(accountId);
      }
    }
    this.mapperNameSync.viewedPriorityAccountIds = asArray(
      this.mapperNameSync.viewedPriorityAccountIds
    ).filter((accountId) => queueMap.has(accountId));
  }

  kickoffPriorityDisplayNameFallback({ source = "public-view" } = {}) {
    if (!this.trackerIntegrations.displaynameFallbackLocal) return false;
    this.pruneViewedPriorityAccountIds();

    const nowMs = Date.now();
    const cooldownMs = Math.max(
      1000,
      Number(this.mapperNameSync.viewedPriorityLocalKickoffCooldownMs || 0) || 0
    );
    const lastKickoffAtMs = Number(
      this.mapperNameSync.lastViewedPriorityLocalKickoffAtMs || 0
    );
    if (lastKickoffAtMs && nowMs - lastKickoffAtMs < cooldownMs) {
      return false;
    }

    const accountIds = uniqueBy(
      asArray(this.mapperNameSync.viewedPriorityAccountIds)
        .map((accountId) => normalizeAccountId(accountId))
        .filter(Boolean),
      (accountId) => accountId
    ).slice(
      0,
      Math.max(1, Number(this.mapperNameSync.priorityBatchSize || 0) || DEFAULT_MAPPER_PRIORITY_BATCH_SIZE)
    );
    if (!accountIds.length) return false;

    this.mapperNameSync.lastViewedPriorityLocalKickoffAtMs = nowMs;
    const safeSource = String(source || "public-view").trim() || "public-view";
    this.syncMapperNamesBatch({
      accountIds,
      source: `priority:${safeSource}`,
    })
      .then((result) => {
        if (!result?.ok) {
          const message = result?.error || "Local priority display-name sync failed.";
          this.logger.warn(`[altered-displayname-priority] ${message}`);
        }
      })
      .catch((error) => {
        const message =
          error?.message || String(error || "Local priority display-name sync failed.");
        this.logger.warn(`[altered-displayname-priority] ${message}`);
      });
    return true;
  }

  queuePriorityDisplayNameLookups(accountIds = [], { source = "public-view" } = {}) {
    const normalizedAccountIds = uniqueBy(
      asArray(accountIds)
        .map((accountId) => normalizeAccountId(accountId))
        .filter(Boolean),
      (accountId) => accountId
    );
    if (!normalizedAccountIds.length) {
      return {
        queued: 0,
        relayQueued: false,
      };
    }

    this.pruneViewedPriorityAccountIds();
    const safeSource = String(source || "public-view").trim() || "public-view";
    const nowMs = Date.now();
    const queueMap = this.mapperNameSync.viewedPriorityQueuedAtMsByAccountId;
    const freshAccountIds = normalizedAccountIds.filter((accountId) => {
      const queuedAtMs = Number(queueMap.get(accountId) || 0);
      return !queuedAtMs || nowMs - queuedAtMs >= this.mapperNameSync.viewedPriorityCooldownMs;
    });
    if (!freshAccountIds.length) {
      return {
        queued: 0,
        relayQueued: false,
      };
    }

    for (const accountId of freshAccountIds) {
      queueMap.set(accountId, nowMs);
    }
    this.mapperNameSync.viewedPriorityAccountIds = uniqueBy(
      [...freshAccountIds, ...asArray(this.mapperNameSync.viewedPriorityAccountIds)],
      (accountId) => accountId
    );
    this.mapperNameSync.priorityAccountIds = uniqueBy(
      [...freshAccountIds, ...asArray(this.mapperNameSync.priorityAccountIds)],
      (accountId) => accountId
    );

    if (typeof this.repository?.seedMapperAccounts === "function") {
      const seeded = this.repository.seedMapperAccounts({
        accountIds: freshAccountIds,
        source: `priority:${safeSource}`,
      });
      if (seeded?.error) {
        this.logger.warn(`[altered-mapper-sync] failed to seed priority accounts: ${seeded.error}`);
      }
    }

    let localFallbackQueued = false;
    const queueLocalFallback = () => {
      if (localFallbackQueued) return;
      localFallbackQueued = this.kickoffPriorityDisplayNameFallback({
        source: safeSource,
      });
    };

    if (this.shouldUseDisplaynameRelay()) {
      const relayPromise = this.trackerDisplaynameClient?.enqueueAccountIds?.(freshAccountIds, {
        front: true,
      });
      relayPromise
        ?.then((result) => {
          if (!result?.ok) {
            const message =
              result?.error || "Tracker-displayname priority enqueue failed.";
            this.trackerIntegrations.lastDisplaynameRelayError = message;
            this.logger.warn(`[altered-displayname-priority] ${message}`);
            queueLocalFallback();
            return;
          }
          this.trackerIntegrations.displaynameRelayAvailable = true;
          this.trackerIntegrations.lastDisplaynameRelayError = null;
        })
        ?.catch((error) => {
          const message = error?.message || String(error || "Priority enqueue failed.");
          this.trackerIntegrations.lastDisplaynameRelayError = message;
          this.logger.warn(`[altered-displayname-priority] ${message}`);
          queueLocalFallback();
        });

      const relayKickoffCooldownMs = Math.max(
        1000,
        Number(this.mapperNameSync.viewedPriorityRelayKickoffCooldownMs || 0) || 0
      );
      const lastRelayKickoffAtMs = Number(
        this.mapperNameSync.lastViewedPriorityRelayKickoffAtMs || 0
      );
      if (!lastRelayKickoffAtMs || nowMs - lastRelayKickoffAtMs >= relayKickoffCooldownMs) {
        this.mapperNameSync.lastViewedPriorityRelayKickoffAtMs = nowMs;
        this.trackerDisplaynameClient
          ?.runSync?.({
            accountIds: freshAccountIds,
            forceCandidates: false,
            prioritizeAccountIds: true,
          })
          ?.then((result) => {
            if (!result?.ok) {
              const message =
                result?.error || "Tracker-displayname priority kickoff failed.";
              this.trackerIntegrations.lastDisplaynameRelayError = message;
              this.logger.warn(`[altered-displayname-priority] ${message}`);
              queueLocalFallback();
              return;
            }
            this.trackerIntegrations.displaynameRelayAvailable = true;
            this.trackerIntegrations.lastDisplaynameRelayError = null;
          })
          ?.catch((error) => {
            const message =
              error?.message || String(error || "Priority relay kickoff failed.");
            this.trackerIntegrations.lastDisplaynameRelayError = message;
            this.logger.warn(`[altered-displayname-priority] ${message}`);
            queueLocalFallback();
          });
      }
    } else {
      queueLocalFallback();
    }

    return {
      queued: freshAccountIds.length,
      relayQueued: this.shouldUseDisplaynameRelay(),
      localFallbackQueued,
    };
  }

  getCachedPlayerName(accountId) {
    const safeAccountId = normalizeAccountId(accountId);
    if (!safeAccountId) return "";
    const cached = this.playerNamesCache.get(safeAccountId);
    if (!cached) return "";
    if (Number(cached.expiresAtMs || 0) <= Date.now()) {
      this.playerNamesCache.delete(safeAccountId);
      return "";
    }
    const displayName = sanitizeResolvedDisplayName(cached.displayName, {
      accountId: safeAccountId,
    });
    if (!displayName) return "";
    return displayName;
  }

  cachePlayerName(accountId, displayName) {
    const safeAccountId = normalizeAccountId(accountId);
    const safeDisplayName = sanitizeResolvedDisplayName(displayName, {
      accountId: safeAccountId,
    });
    if (!safeAccountId || !safeDisplayName) return;
    this.playerNamesCache.set(safeAccountId, {
      displayName: safeDisplayName,
      expiresAtMs: Date.now() + this.playerNamesCacheTtlMs,
    });
  }

  async resolvePlayerNamesByAccountIds(accountIds = [], { chunkSize = 100 } = {}) {
    const normalizedAccountIds = [];
    const seen = new Set();
    for (const rawAccountId of asArray(accountIds)) {
      const accountId = normalizeAccountId(rawAccountId);
      if (!accountId || seen.has(accountId)) continue;
      seen.add(accountId);
      normalizedAccountIds.push(accountId);
    }
    if (!normalizedAccountIds.length) return {};

    const namesByAccountId = {};
    const externallyResolvedNamesByAccountId = {};
    const unresolved = [];
    for (const accountId of normalizedAccountIds) {
      const cached = this.getCachedPlayerName(accountId);
      if (cached) {
        namesByAccountId[accountId] = cached;
      } else {
        unresolved.push(accountId);
      }
    }

    if (unresolved.length && typeof this.repository?.getMapperAccountsForSync === "function") {
      const localMapperRows = this.repository.getMapperAccountsForSync({
        accountIds: unresolved,
        limit: Math.max(unresolved.length, 50),
        minResolvedAgeSeconds: 0,
      });
      for (const row of asArray(localMapperRows)) {
        const accountId = normalizeAccountId(row?.accountId);
        const displayName = toText(row?.latestDisplayName);
        if (!accountId || !displayName || normalizeAccountId(displayName)) continue;
        namesByAccountId[accountId] = displayName;
        this.cachePlayerName(accountId, displayName);
      }
    }

    const unresolvedAfterLocal = unresolved.filter((accountId) => !namesByAccountId[accountId]);
    let unresolvedAfterAggregator = unresolvedAfterLocal;

    if (unresolvedAfterLocal.length && this.aggregatorClient?.isConfigured?.()) {
      const aggregatorResult = await this.getDisplayNamesFromAggregator(unresolvedAfterLocal);
      if (aggregatorResult?.ok) {
        for (const [rawAccountId, rawDisplayName] of Object.entries(
          aggregatorResult.namesByAccountId || {}
        )) {
          const accountId = normalizeAccountId(rawAccountId);
          const displayName = sanitizeResolvedDisplayName(rawDisplayName, { accountId });
          if (!accountId || !displayName) continue;
          namesByAccountId[accountId] = displayName;
          externallyResolvedNamesByAccountId[accountId] = displayName;
          this.cachePlayerName(accountId, displayName);
        }
      } else if (aggregatorResult?.error) {
        this.logger.warn(
          `[altered-displayname] aggregator lookup warning: ${aggregatorResult.error}`
        );
      }
      unresolvedAfterAggregator = unresolvedAfterLocal.filter(
        (accountId) => !namesByAccountId[accountId]
      );
    }

    const syncExternallyResolvedNames = () => {
      const syncedAccountIds = Object.keys(externallyResolvedNamesByAccountId);
      if (!syncedAccountIds.length || typeof this.repository?.upsertMapperNames !== "function") {
        return;
      }
      const upsert = this.repository.upsertMapperNames({
        accountIds: syncedAccountIds,
        namesByAccountId: externallyResolvedNamesByAccountId,
        source: "public-displayname-lookup",
      });
      if (upsert?.error) {
        this.logger.warn(`[altered-displayname] local mapper sync warning: ${upsert.error}`);
      } else if (typeof this.repository?.updateMapMapperDisplayNames === "function") {
        const mapLinks = this.repository.updateMapMapperDisplayNames({
          namesByAccountId: externallyResolvedNamesByAccountId,
        });
        if (mapLinks?.error) {
          this.logger.warn(
            `[altered-displayname] map display-name sync warning: ${mapLinks.error}`
          );
        }
      }
    };

    if (!unresolvedAfterAggregator.length || !this.trackerClient?.getPlayerNames) {
      if (unresolvedAfterAggregator.length) {
        this.queuePriorityDisplayNameLookups(unresolvedAfterAggregator, {
          source: "public-resolution",
        });
      }
      syncExternallyResolvedNames();
      return namesByAccountId;
    }

    const namesResult = await this.trackerClient.getPlayerNames(unresolvedAfterAggregator, {
      chunkSize,
    });
    const fromTracker =
      namesResult?.namesByAccountId && typeof namesResult.namesByAccountId === "object"
        ? namesResult.namesByAccountId
        : {};

    for (const [rawAccountId, rawDisplayName] of Object.entries(fromTracker)) {
      const accountId = normalizeAccountId(rawAccountId);
      const displayName = sanitizeResolvedDisplayName(rawDisplayName, { accountId });
      if (!accountId || !displayName) continue;
      namesByAccountId[accountId] = displayName;
      externallyResolvedNamesByAccountId[accountId] = displayName;
      this.cachePlayerName(accountId, displayName);
    }

    const stillUnresolved = unresolvedAfterAggregator.filter((accountId) => !namesByAccountId[accountId]);
    if (stillUnresolved.length) {
      this.queuePriorityDisplayNameLookups(stillUnresolved, {
        source: "public-resolution",
      });
    }
    syncExternallyResolvedNames();

    return namesByAccountId;
  }

  resolveHolderName(holder, namesByAccountId = {}, { accountId = "" } = {}) {
    const holderText = toText(holder);
    const holderAccountId = normalizeAccountId(accountId) || normalizeAccountId(holderText);
    if (!holderAccountId) return holderText || "Unknown";
    const fromLookup = sanitizeResolvedDisplayName(namesByAccountId[holderAccountId], {
      accountId: holderAccountId,
    });
    if (fromLookup) return fromLookup;
    const fromCache = this.getCachedPlayerName(holderAccountId);
    if (fromCache) return fromCache;
    const holderDisplayName = sanitizeResolvedDisplayName(holderText, {
      accountId: holderAccountId,
    });
    if (holderDisplayName) return holderDisplayName;
    return holderAccountId;
  }

  applyResolvedHolderNames(
    rows = [],
    holderKey,
    namesByAccountId = {},
    { accountIdKeys = [], pendingKey = "", accountIdOutputKey = "" } = {}
  ) {
    const key = toText(holderKey);
    if (!key) return asArray(rows);
    const safeAccountIdKeys = Array.isArray(accountIdKeys) ? accountIdKeys : [];
    const safePendingKey = toText(pendingKey);
    const safeAccountIdOutputKey = toText(accountIdOutputKey);
    return asArray(rows).map((row) => {
      const accountId =
        safeAccountIdKeys
          .map((accountKey) => normalizeAccountId(row?.[accountKey]))
          .find(Boolean) || normalizeAccountId(row?.[key]);
      const resolved = this.resolveHolderName(row?.[key], namesByAccountId, { accountId });
      const pending = accountId ? !hasResolvedDisplayName(resolved, { accountId }) : false;
      return {
        ...row,
        [key]: resolved,
        ...(safePendingKey ? { [safePendingKey]: pending } : {}),
        ...(safeAccountIdOutputKey ? { [safeAccountIdOutputKey]: accountId || null } : {}),
      };
    });
  }

  getLiveMonitorConfigSnapshot() {
    return {
      enabled: this.liveMonitor.enabled,
      scheduleMode: this.liveMonitor.scheduleMode,
      dailyHourUtc: this.liveMonitor.dailyHourUtc,
      dailyMinuteUtc: this.liveMonitor.dailyMinuteUtc,
      clubId: this.liveMonitor.clubId,
      intervalSeconds: this.liveMonitor.intervalSeconds,
      discoveryEnabled: this.liveMonitor.discoveryEnabled,
      discoveryIntervalSeconds: this.liveMonitor.discoveryIntervalSeconds,
      discoveryCampaignLimit: this.liveMonitor.discoveryCampaignLimit,
      discoveryActivityPageSize: this.liveMonitor.discoveryActivityPageSize,
      activityPageSize: this.liveMonitor.activityPageSize,
      activeOnly: this.liveMonitor.activeOnly,
      fetchMapDetails: this.liveMonitor.fetchMapDetails,
      trackerChunkSize: this.liveMonitor.trackerChunkSize,
    };
  }

  persistLiveMonitorConfig() {
    if (typeof this.repository?.upsertLiveMonitorConfig !== "function") return;
    try {
      this.repository.upsertLiveMonitorConfig(this.getLiveMonitorConfigSnapshot());
    } catch (error) {
      this.logger.warn(
        `[altered-live] failed to persist monitor config: ${error?.message || error}`
      );
    }
  }

  updateLiveProgress(partial = {}) {
    const now = new Date().toISOString();
    const previous = this.liveMonitor.progress || {};
    const replaceCounters = Boolean(partial.replaceCounters);
    const nextCounters = replaceCounters
      ? { ...(partial.counters || {}) }
      : {
          ...(previous.counters || {}),
          ...(partial.counters || {}),
        };
    const next = {
      ...previous,
      ...partial,
      counters: nextCounters,
      updatedAt: now,
    };
    delete next.replaceCounters;
    if (next.percent !== undefined && next.percent !== null) {
      next.percent = clampInt(next.percent, { min: 0, max: 100, fallback: 0 });
    }
    this.liveMonitor.progress = next;
    return next;
  }

  computeNextScheduledRunIso({ fromTimeMs = Date.now() } = {}) {
    if (this.liveMonitor.scheduleMode === "daily") {
      const fromDate = new Date(fromTimeMs);
      const candidateMs = Date.UTC(
        fromDate.getUTCFullYear(),
        fromDate.getUTCMonth(),
        fromDate.getUTCDate(),
        this.liveMonitor.dailyHourUtc,
        this.liveMonitor.dailyMinuteUtc,
        0,
        0
      );
      const nextMs = candidateMs > fromTimeMs ? candidateMs : candidateMs + 24 * 60 * 60 * 1000;
      return new Date(nextMs).toISOString();
    }
    return new Date(fromTimeMs + this.liveMonitor.intervalSeconds * 1000).toISOString();
  }

  computeNextDiscoveryRunIso({ fromTimeMs = Date.now() } = {}) {
    return new Date(fromTimeMs + this.liveMonitor.discoveryIntervalSeconds * 1000).toISOString();
  }

  _runLiveJobInWorker({ job = "", reason = "job-worker", authContext = null, timeoutMs = null } = {}) {
    const safeJob = toText(job).toLowerCase();
    const safeReason = toText(reason) || "job-worker";
    const safeTimeoutMs = clampInt(timeoutMs, {
      min: 10000,
      max: 6 * 60 * 60 * 1000,
      fallback: 45 * 60 * 1000,
    });
    const workerUrl = new URL("../workers/liveMonitorWorker.js", import.meta.url);

    return new Promise((resolve) => {
      let worker = null;
      try {
        worker = new Worker(workerUrl, {
          type: "module",
          workerData: {
            job: safeJob,
            reason: safeReason,
            authContext,
          },
        });
      } catch (error) {
        resolve({
          ok: false,
          job: safeJob,
          reason: safeReason,
          error: error?.message || String(error || "Failed to start live job worker."),
        });
        return;
      }

      let settled = false;
      const finish = (payload) => {
        if (settled) return;
        settled = true;
        try {
          worker.terminate();
        } catch {}
        resolve(payload);
      };

      const timer = setTimeout(() => {
        finish({
          ok: false,
          job: safeJob,
          reason: safeReason,
          error: `Live job worker timed out after ${safeTimeoutMs}ms.`,
        });
      }, safeTimeoutMs);
      timer.unref?.();

      worker.on("message", (message) => {
        if (!message || typeof message !== "object") return;
        if (message.type !== "complete") return;
        clearTimeout(timer);
        finish(message);
      });

      worker.on("error", (error) => {
        clearTimeout(timer);
        finish({
          ok: false,
          job: safeJob,
          reason: safeReason,
          error: error?.message || String(error || "Live job worker crashed."),
        });
      });

      worker.on("exit", (code) => {
        if (settled) return;
        clearTimeout(timer);
        finish({
          ok: false,
          job: safeJob,
          reason: safeReason,
          error: `Live job worker exited (${Number(code || 0)}).`,
        });
      });
    });
  }

  async runLiveMonitorCycleDetached({ reason = "manual", authContext = null } = {}) {
    if (!isMainThread) {
      return this.runLiveMonitorCycle({ reason, authContext });
    }
    if (this.mapCopy.running) {
      return {
        skipped: true,
        reason: "map-local-copy-backfill running",
      };
    }
    if (this.liveMonitor.running || this.liveMonitor.discoveryRunning) {
      return {
        skipped: true,
        reason: "monitor already running",
      };
    }
    if (this.alterationsSync.running) {
      return {
        skipped: true,
        reason: "alterations-sync running",
      };
    }

    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    this.liveMonitor.runCounter += 1;
    const runId = this.liveMonitor.runCounter;
    this.liveMonitor.running = true;
    this.liveMonitor.lastStartedAt = startedAt;
    this.liveMonitor.lastDurationMs = null;
    this.liveMonitor.lastError = null;
    this.updateLiveProgress({
      runId,
      reason,
      status: "running",
      phase: "job-worker",
      percent: 0,
      startedAt,
      finishedAt: null,
      message: "Starting live club sync (worker).",
      counters: {},
      replaceCounters: true,
    });

    try {
      const jobResult = await this._runLiveJobInWorker({
        job: "monitor",
        reason,
        authContext,
        timeoutMs: Number(process.env.ALTERED_LIVE_JOB_WORKER_TIMEOUT_MS || 45 * 60 * 1000),
      });

      const finishedAt = jobResult.finishedAt || new Date().toISOString();
      const durationMs = Math.max(0, Number(jobResult.durationMs || 0) || Date.now() - startedMs);

      if (!jobResult.ok) {
        const message = toText(jobResult.error) || "Live monitor worker failed.";
        this.liveMonitor.lastError = message;
        this.liveMonitor.lastFinishedAt = finishedAt;
        this.liveMonitor.lastDurationMs = durationMs;
        this.updateLiveProgress({
          runId,
          reason,
          status: "error",
          phase: "failed",
          percent: this.liveMonitor.progress?.percent || 0,
          finishedAt,
          durationMs,
          message,
        });
        return { error: message };
      }

      const liveStatus = jobResult.liveStatus?.monitor || null;
      if (liveStatus?.lastSummary !== undefined) this.liveMonitor.lastSummary = liveStatus.lastSummary;
      if (liveStatus?.lastError !== undefined) this.liveMonitor.lastError = liveStatus.lastError;
      if (liveStatus?.lastFinishedAt) this.liveMonitor.lastFinishedAt = liveStatus.lastFinishedAt;
      else this.liveMonitor.lastFinishedAt = finishedAt;
      if (liveStatus?.lastDurationMs !== undefined) this.liveMonitor.lastDurationMs = liveStatus.lastDurationMs;
      else this.liveMonitor.lastDurationMs = durationMs;

      const result = jobResult.result;
      if (result?.error) {
        const message = toText(result.error) || "Live monitor cycle failed.";
        this.liveMonitor.lastError = message;
        this.updateLiveProgress({
          runId,
          reason,
          status: "error",
          phase: "failed",
          percent: this.liveMonitor.progress?.percent || 0,
          finishedAt: this.liveMonitor.lastFinishedAt,
          durationMs: this.liveMonitor.lastDurationMs,
          message,
        });
        return result;
      }

      this.updateLiveProgress({
        runId,
        reason,
        status: "ok",
        phase: "complete",
        percent: 100,
        finishedAt: this.liveMonitor.lastFinishedAt || finishedAt,
        durationMs: this.liveMonitor.lastDurationMs || durationMs,
        message: this.liveMonitor.progress?.message || "Live monitor sync complete.",
        counters: this.liveMonitor.progress?.counters || {},
      });
      return result;
    } finally {
      this.liveMonitor.running = false;
    }
  }

  async runLiveDiscoveryCycleDetached({ reason = "hourly-discovery", authContext = null } = {}) {
    if (!isMainThread) {
      return this.runLiveDiscoveryCycle({ reason, authContext });
    }
    if (this.mapCopy.running) {
      return {
        skipped: true,
        reason: "map-local-copy-backfill running",
      };
    }
    if (this.liveMonitor.running || this.liveMonitor.discoveryRunning) {
      return {
        skipped: true,
        reason: "monitor already running",
      };
    }
    if (this.alterationsSync.running) {
      return {
        skipped: true,
        reason: "alterations-sync running",
      };
    }

    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    this.liveMonitor.discoveryRunning = true;
    this.liveMonitor.lastDiscoveryStartedAt = startedAt;
    this.liveMonitor.lastDiscoveryDurationMs = null;
    this.liveMonitor.lastDiscoveryError = null;
    this.updateLiveProgress({
      reason,
      status: "running",
      phase: "job-worker-discovery",
      percent: 0,
      startedAt,
      finishedAt: null,
      message: "Starting hourly discovery cycle (worker).",
      counters: {},
      replaceCounters: true,
    });

    try {
      const jobResult = await this._runLiveJobInWorker({
        job: "discovery",
        reason,
        authContext,
        timeoutMs: Number(process.env.ALTERED_LIVE_JOB_WORKER_TIMEOUT_MS || 45 * 60 * 1000),
      });

      const finishedAt = jobResult.finishedAt || new Date().toISOString();
      const durationMs = Math.max(0, Number(jobResult.durationMs || 0) || Date.now() - startedMs);

      if (!jobResult.ok) {
        const message = toText(jobResult.error) || "Live discovery worker failed.";
        this.liveMonitor.lastDiscoveryError = message;
        this.liveMonitor.lastDiscoveryFinishedAt = finishedAt;
        this.liveMonitor.lastDiscoveryDurationMs = durationMs;
        this.updateLiveProgress({
          reason,
          status: "error",
          phase: "discovery-failed",
          percent: this.liveMonitor.progress?.percent || 0,
          finishedAt,
          durationMs,
          message,
        });
        return { error: message };
      }

      const liveStatus = jobResult.liveStatus?.monitor || null;
      if (liveStatus?.lastDiscoverySummary !== undefined) {
        this.liveMonitor.lastDiscoverySummary = liveStatus.lastDiscoverySummary;
      }
      if (liveStatus?.lastDiscoveryError !== undefined) {
        this.liveMonitor.lastDiscoveryError = liveStatus.lastDiscoveryError;
      }
      if (liveStatus?.lastDiscoveryFinishedAt) {
        this.liveMonitor.lastDiscoveryFinishedAt = liveStatus.lastDiscoveryFinishedAt;
      } else {
        this.liveMonitor.lastDiscoveryFinishedAt = finishedAt;
      }
      if (liveStatus?.lastDiscoveryDurationMs !== undefined) {
        this.liveMonitor.lastDiscoveryDurationMs = liveStatus.lastDiscoveryDurationMs;
      } else {
        this.liveMonitor.lastDiscoveryDurationMs = durationMs;
      }

      const result = jobResult.result;
      if (result?.error) {
        const message = toText(result.error) || "Live discovery cycle failed.";
        this.liveMonitor.lastDiscoveryError = message;
        this.updateLiveProgress({
          reason,
          status: "error",
          phase: "discovery-failed",
          percent: this.liveMonitor.progress?.percent || 0,
          finishedAt: this.liveMonitor.lastDiscoveryFinishedAt,
          durationMs: this.liveMonitor.lastDiscoveryDurationMs,
          message,
        });
        return result;
      }

      this.updateLiveProgress({
        reason,
        status: "ok",
        phase: "discovery-complete",
        percent: 100,
        finishedAt: this.liveMonitor.lastDiscoveryFinishedAt || finishedAt,
        durationMs: this.liveMonitor.lastDiscoveryDurationMs || durationMs,
        message: this.liveMonitor.progress?.message || "Hourly discovery complete.",
        counters: this.liveMonitor.progress?.counters || {},
      });

      return result;
    } finally {
      this.liveMonitor.discoveryRunning = false;
    }
  }

  scheduleNextLiveMonitorRun({ fromTimeMs = Date.now() } = {}) {
    if (this.liveMonitor.timer) {
      clearTimeout(this.liveMonitor.timer);
      this.liveMonitor.timer = null;
    }
    if (!this.liveMonitor.enabled) {
      this.liveMonitor.nextRunAt = null;
      return false;
    }

    const nextRunAt = this.computeNextScheduledRunIso({ fromTimeMs });
    const delayMs = Math.max(1000, Date.parse(nextRunAt) - Date.now());
    this.liveMonitor.nextRunAt = nextRunAt;
    this.liveMonitor.timer = setTimeout(() => {
      this.liveMonitor.timer = null;
      this.runLiveMonitorCycleDetached({
        reason:
          this.liveMonitor.scheduleMode === "daily" ? "daily-full-schedule" : "interval-full-schedule",
      })
        .catch((error) => {
          const message = error?.message || "Live monitor scheduled cycle failed.";
          this.liveMonitor.lastError = message;
          this.logger.warn(`[altered-live] scheduled cycle failed: ${message}`);
        })
        .finally(() => {
          this.scheduleNextLiveMonitorRun({ fromTimeMs: Date.now() });
        });
    }, delayMs);
    this.liveMonitor.timer.unref?.();
    return true;
  }

  scheduleNextDiscoveryRun({ fromTimeMs = Date.now() } = {}) {
    if (this.liveMonitor.discoveryTimer) {
      clearTimeout(this.liveMonitor.discoveryTimer);
      this.liveMonitor.discoveryTimer = null;
    }
    if (!this.liveMonitor.enabled || !this.liveMonitor.discoveryEnabled) {
      this.liveMonitor.nextDiscoveryRunAt = null;
      return false;
    }

    const nextRunAt = this.computeNextDiscoveryRunIso({ fromTimeMs });
    const delayMs = Math.max(1000, Date.parse(nextRunAt) - Date.now());
    this.liveMonitor.nextDiscoveryRunAt = nextRunAt;
    this.liveMonitor.discoveryTimer = setTimeout(() => {
      this.liveMonitor.discoveryTimer = null;
      this.runLiveDiscoveryCycleDetached({
        reason: "hourly-discovery-schedule",
      })
        .catch((error) => {
          const message = error?.message || "Live discovery scheduled cycle failed.";
          this.liveMonitor.lastDiscoveryError = message;
          this.logger.warn(`[altered-live] scheduled discovery cycle failed: ${message}`);
        })
        .finally(() => {
          this.scheduleNextDiscoveryRun({ fromTimeMs: Date.now() });
        });
    }, delayMs);
    this.liveMonitor.discoveryTimer.unref?.();
    return true;
  }

  async getDashboard({
    mapsLimit = 5000,
    mapsOffset = 0,
    mapOptionsLimit = 25000,
    mapOptionsOffset = 0,
    wrFeedLimit = 24,
    includeMapOptions = true,
    includeTracker = true,
  } = {}) {
    const safeMapsLimit = clampInt(mapsLimit, { min: 0, max: 5000, fallback: 5000 });
    const safeMapsOffset = clampInt(mapsOffset, { min: 0, max: 2000000, fallback: 0 });
    const safeMapOptionsLimit = clampInt(mapOptionsLimit, {
      min: 0,
      max: 25000,
      fallback: 25000,
    });
    const safeMapOptionsOffset = clampInt(mapOptionsOffset, {
      min: 0,
      max: 2000000,
      fallback: 0,
    });
    const safeWrFeedLimit = clampInt(wrFeedLimit, { min: 0, max: 200, fallback: 24 });
    const safeIncludeMapOptions = includeMapOptions !== false;
    const safeIncludeTracker = includeTracker !== false;

    const [trackerStatusResult, wrFeedResult] = await Promise.all([
      safeIncludeTracker
        ? this.trackerClient.getTrackerStatus()
        : Promise.resolve({ ok: false, data: null }),
      safeWrFeedLimit > 0
        ? this.trackerClient.getWrFeed(safeWrFeedLimit)
        : Promise.resolve({ ok: true, data: { feed: [] } }),
    ]);
    const maps =
      safeMapsLimit > 0
        ? this.repository.listMaps({
            limit: safeMapsLimit,
            offset: safeMapsOffset,
          })
        : [];
    const mapOptions =
      safeIncludeMapOptions && safeMapOptionsLimit > 0
        ? this.repository.getMapOptions({
            limit: safeMapOptionsLimit,
            offset: safeMapOptionsOffset,
          })
        : [];
    const summary = this.repository.getSummary();
    const wrFeed = Array.isArray(wrFeedResult?.data?.feed) ? wrFeedResult.data.feed : [];
    const latestWrEvent = this.repository.getLatestWrEvent();
    const latestWr = pickLatestWr(latestWrEvent
      ? {
          mapUid: latestWrEvent.mapUid,
          mapName: latestWrEvent.mapName,
          accountId: latestWrEvent.accountId,
          holder: latestWrEvent.holder,
          wrMs: latestWrEvent.wrMs,
          recordedAt: latestWrEvent.recordedAt,
        }
      : null, wrFeed[0] || null);
    const holderAccountIds = [
      ...this.collectHolderAccountIds(maps, ["wrAccountId", "wrHolder"]),
      ...this.collectHolderAccountIds(wrFeed, ["accountId", "holder"]),
      ...this.collectHolderAccountIds(latestWr ? [latestWr] : [], ["accountId", "holder"]),
    ];
    const namesByAccountId = await this.resolvePlayerNamesByAccountIds(holderAccountIds, {
      chunkSize: 100,
    });
    const resolvedMaps = this.applyResolvedHolderNames(maps, "wrHolder", namesByAccountId, {
      accountIdKeys: ["wrAccountId"],
      pendingKey: "displayNamePending",
      accountIdOutputKey: "wrAccountId",
    });
    const resolvedWrFeed = this.applyResolvedHolderNames(wrFeed, "holder", namesByAccountId, {
      accountIdKeys: ["accountId"],
      pendingKey: "displayNamePending",
      accountIdOutputKey: "accountId",
    });
    const resolvedLatestWr = latestWr
      ? this.applyResolvedHolderNames([latestWr], "holder", namesByAccountId, {
          accountIdKeys: ["accountId"],
          pendingKey: "displayNamePending",
          accountIdOutputKey: "accountId",
        })[0]
      : null;
    const tracker = safeIncludeTracker && trackerStatusResult?.ok ? trackerStatusResult.data : null;
    return {
      maps: resolvedMaps,
      mapOptions,
      summary,
      wrFeed: resolvedWrFeed,
      latestWr: resolvedLatestWr,
      tracker,
      paging: {
        maps: {
          limit: safeMapsLimit,
          offset: safeMapsOffset,
          count: resolvedMaps.length,
          has_more: safeMapsLimit > 0 && resolvedMaps.length >= safeMapsLimit,
          next_offset:
            safeMapsLimit > 0 && resolvedMaps.length >= safeMapsLimit
              ? safeMapsOffset + resolvedMaps.length
              : null,
        },
        map_options: {
          limit: safeIncludeMapOptions ? safeMapOptionsLimit : 0,
          offset: safeMapOptionsOffset,
          count: mapOptions.length,
          has_more:
            safeIncludeMapOptions &&
            safeMapOptionsLimit > 0 &&
            mapOptions.length >= safeMapOptionsLimit,
          next_offset:
            safeIncludeMapOptions &&
            safeMapOptionsLimit > 0 &&
            mapOptions.length >= safeMapOptionsLimit
              ? safeMapOptionsOffset + mapOptions.length
              : null,
        },
        wr_feed: {
          limit: safeWrFeedLimit,
          offset: 0,
          count: resolvedWrFeed.length,
          has_more: false,
          next_offset: null,
        },
      },
    };
  }

  async getAlterationsStats() {
    const base = this.repository.getAlterationsStats();
    return {
      total_maps: Number(base.totalMaps || 0),
      actively_tracked: Number(base.activelyTracked || 0),
      total_wr_changes: Number(base.totalWrChanges || 0),
      last_run_at: base.lastRunAt || null,
    };
  }

  getAlterationsMapFilters() {
    const filters = this.repository.getAlterationsMapFilters();
    return {
      ...filters,
      alterations: this.repository.listAlterations(),
      generatedAt: new Date().toISOString(),
    };
  }

  async getAlterationsMaps({
    limit = 50000,
    offset = 0,
    q = "",
    sort = "name",
    campaignIds = [],
    status = "",
    season = "",
    year = null,
    alterationSlugs = [],
    alterationIds = [],
    mapNumber = null,
    environment = "",
    mapType = "",
    hasWr = undefined,
  } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 100000, fallback: 50000 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const normalizedCampaignIds = uniqueBy(
      (Array.isArray(campaignIds) ? campaignIds : [campaignIds])
        .flatMap((value) => String(value || "").split(","))
        .map((value) => value.trim())
        .filter((value) => /^\d+$/.test(value)),
      (value) => value
    );
    const normalizedAlterationSlugs = uniqueBy(
      (Array.isArray(alterationSlugs) ? alterationSlugs : [alterationSlugs])
        .flatMap((value) => String(value || "").split(","))
        .map((value) => value.trim())
        .filter(Boolean),
      (value) => value.toLowerCase()
    );
    const normalizedAlterationIds = uniqueBy(
      (Array.isArray(alterationIds) ? alterationIds : [alterationIds])
        .flatMap((value) => String(value || "").split(","))
        .map((value) => clampInt(value, { min: 1, max: 2147483647, fallback: 0 }))
        .filter(Boolean),
      (value) => value
    );
    const { rows: maps, total } = this.repository.listAlterationsMaps({
      limit: safeLimit,
      offset: safeOffset,
      q,
      sort,
      campaignIds: normalizedCampaignIds,
      status,
      season,
      year,
      alterationSlugs: normalizedAlterationSlugs,
      alterationIds: normalizedAlterationIds,
      mapNumber,
      environment,
      mapType,
      hasWr,
    });
    const holderAccountIds = this.collectHolderAccountIds(maps, [
      "wr_account_id",
      "wrAccountId",
      "wr_holder",
    ]);
    const namesByAccountId = await this.resolvePlayerNamesByAccountIds(holderAccountIds, {
      chunkSize: 100,
    });
    const resolvedMaps = this.applyResolvedHolderNames(
      maps,
      "wr_holder",
      namesByAccountId,
      {
        accountIdKeys: ["wr_account_id", "wrAccountId"],
        pendingKey: "displayNamePending",
        accountIdOutputKey: "wr_account_id",
      }
    );

    return {
      maps: resolvedMaps,
      count: resolvedMaps.length,
      total,
      paging: {
        limit: safeLimit,
        offset: safeOffset,
        total,
        has_more: safeOffset + resolvedMaps.length < total,
        next_offset: safeOffset + resolvedMaps.length < total ? safeOffset + resolvedMaps.length : null,
      },
      ...(normalizedCampaignIds.length ? { campaignIds: normalizedCampaignIds } : {}),
      ...(normalizedAlterationSlugs.length ? { alterationSlugs: normalizedAlterationSlugs } : {}),
      ...(normalizedAlterationIds.length ? { alterationIds: normalizedAlterationIds } : {}),
    };
  }

  getAlterationsCampaigns({
    limit = 5000,
    offset = 0,
    catalogOnly = false,
    linkedOnly = false,
    alterationSlugs = [],
    alterationIds = [],
  } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 10000, fallback: 5000 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const { rows: campaigns, total } = this.repository.listAlterationsCampaigns({
      limit: safeLimit,
      offset: safeOffset,
      catalogOnly,
      linkedOnly,
      alterationSlugs,
      alterationIds,
    });
    return {
      campaigns,
      count: campaigns.length,
      total,
      paging: {
        limit: safeLimit,
        offset: safeOffset,
        total,
        has_more: safeOffset + campaigns.length < total,
        next_offset: safeOffset + campaigns.length < total ? safeOffset + campaigns.length : null,
      },
    };
  }

  syncAlterations() {
    return this.repository.syncAllCampaignAlterations({
      cleanupUnused: true,
    });
  }

  getAlterationsSyncStatus() {
    return {
      running: Boolean(this.alterationsSync.running),
      queued: Boolean(this.alterationsSync.queued),
      runCounter: Number(this.alterationsSync.runCounter || 0),
      currentReason: this.alterationsSync.currentReason || null,
      lastStartedAt: this.alterationsSync.lastStartedAt,
      lastFinishedAt: this.alterationsSync.lastFinishedAt,
      lastDurationMs: this.alterationsSync.lastDurationMs,
      lastError: this.alterationsSync.lastError,
      lastSummary: this.alterationsSync.lastSummary,
    };
  }

  queueAlterationsSync({ reason = "auto", wait = false } = {}) {
    const safeReason = toText(reason) || "auto";

    if (!isMainThread) {
      try {
        const startedAt = new Date().toISOString();
        const startedMs = Date.now();
        this.alterationsSync.running = true;
        this.alterationsSync.queued = false;
        this.alterationsSync.runCounter += 1;
        this.alterationsSync.currentReason = safeReason;
        this.alterationsSync.lastStartedAt = startedAt;
        this.alterationsSync.lastError = null;
        const summary = this.syncAlterations();
        const finishedAt = new Date().toISOString();
        const durationMs = Math.max(0, Date.now() - startedMs);
        this.alterationsSync.lastFinishedAt = finishedAt;
        this.alterationsSync.lastDurationMs = durationMs;
        this.alterationsSync.lastSummary = summary;
        return wait
          ? Promise.resolve({ ok: true, summary, status: this.getAlterationsSyncStatus() })
          : { ok: true, summary, status: this.getAlterationsSyncStatus() };
      } catch (error) {
        const finishedAt = new Date().toISOString();
        this.alterationsSync.lastFinishedAt = finishedAt;
        this.alterationsSync.lastError = error?.message || String(error || "Alterations sync failed.");
        return wait
          ? Promise.resolve({ ok: false, error: this.alterationsSync.lastError, status: this.getAlterationsSyncStatus() })
          : { ok: false, error: this.alterationsSync.lastError, status: this.getAlterationsSyncStatus() };
      } finally {
        this.alterationsSync.running = false;
      }
    }

    if (this.alterationsSync.running) {
      this.alterationsSync.queued = true;
      const status = this.getAlterationsSyncStatus();
      return wait
        ? this.alterationsSync.promise || Promise.resolve({ ok: true, started: false, status })
        : { ok: true, started: false, status };
    }

    if (this.liveMonitor?.running || this.liveMonitor?.discoveryRunning) {
      this.alterationsSync.queued = true;
      const status = this.getAlterationsSyncStatus();
      return wait
        ? Promise.resolve({ ok: true, started: false, deferred: true, status })
        : { ok: true, started: false, deferred: true, status };
    }

    this.alterationsSync.running = true;
    this.alterationsSync.queued = false;
    this.alterationsSync.runCounter += 1;
    this.alterationsSync.currentReason = safeReason;
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    this.alterationsSync.lastStartedAt = startedAt;
    this.alterationsSync.lastFinishedAt = null;
    this.alterationsSync.lastDurationMs = null;
    this.alterationsSync.lastError = null;

    let worker = null;
    let runPromise = null;
    try {
      const workerUrl = new URL("../workers/alterationsSyncWorker.js", import.meta.url);
      worker = new Worker(workerUrl, {
        type: "module",
        workerData: {
          dbFile: DB_FILE,
        },
      });
      this.alterationsSync.worker = worker;

      let resolved = false;
      runPromise = new Promise((resolve) => {
        const finalize = (result) => {
          if (resolved) return;
          resolved = true;
          this.alterationsSync.worker = null;
          this.alterationsSync.promise = null;
          this.alterationsSync.running = false;
          const status = this.getAlterationsSyncStatus();
          resolve({ ...result, status });

          if (this.alterationsSync.queued) {
            this.alterationsSync.queued = false;
            this.queueAlterationsSync({ reason: "queued" });
          }
        };

        worker.on("message", (message) => {
          if (!message || typeof message !== "object") return;
          if (message.type !== "complete") return;
          const finishedAt = message.finishedAt || new Date().toISOString();
          const durationMs = Math.max(
            0,
            Number(message.durationMs || 0) || Math.max(0, Date.now() - startedMs)
          );
          this.alterationsSync.lastFinishedAt = finishedAt;
          this.alterationsSync.lastDurationMs = durationMs;
          if (message.ok) {
            this.alterationsSync.lastSummary = message.summary || null;
            this.alterationsSync.lastError = null;
            finalize({ ok: true, summary: message.summary || null });
          } else {
            const errMsg = toText(message.error) || "Alterations sync failed.";
            this.alterationsSync.lastError = errMsg;
            finalize({ ok: false, error: errMsg });
          }
        });

        worker.on("error", (error) => {
          const finishedAt = new Date().toISOString();
          this.alterationsSync.lastFinishedAt = finishedAt;
          this.alterationsSync.lastDurationMs = Math.max(0, Date.now() - startedMs);
          const errMsg = error?.message || String(error || "Alterations sync worker crashed.");
          this.alterationsSync.lastError = errMsg;
          finalize({ ok: false, error: errMsg });
        });

        worker.on("exit", (code) => {
          if (resolved) return;
          const finishedAt = new Date().toISOString();
          this.alterationsSync.lastFinishedAt = finishedAt;
          this.alterationsSync.lastDurationMs = Math.max(0, Date.now() - startedMs);
          const errMsg = `Alterations sync worker exited (${Number(code || 0)}).`;
          this.alterationsSync.lastError = errMsg;
          finalize({ ok: false, error: errMsg });
        });
      });
    } catch (error) {
      const finishedAt = new Date().toISOString();
      this.alterationsSync.lastFinishedAt = finishedAt;
      this.alterationsSync.lastDurationMs = Math.max(0, Date.now() - startedMs);
      const errMsg =
        error?.message || String(error || "Failed to start alterations sync worker.");
      this.alterationsSync.lastError = errMsg;
      this.alterationsSync.worker = null;
      this.alterationsSync.promise = null;
      this.alterationsSync.running = false;
      const status = this.getAlterationsSyncStatus();
      return wait ? Promise.resolve({ ok: false, error: errMsg, status }) : { ok: false, error: errMsg, status };
    }

    this.alterationsSync.promise = runPromise;

    return wait ? runPromise : { ok: true, started: true, status: this.getAlterationsSyncStatus() };
  }

  _resolveCampaignDbId(campaign) {
    if (!campaign) return null;
    const row = this.repository.db
      .prepare(
        campaign.id && !isNaN(Number(campaign.id))
          ? `SELECT campaign_id FROM altered_campaigns
             WHERE external_campaign_id = ? OR campaign_id = ?
             LIMIT 1`
          : `SELECT campaign_id FROM altered_campaigns WHERE name = ? LIMIT 1`
      )
      .get(
        ...(campaign.id && !isNaN(Number(campaign.id))
          ? [Number(campaign.id), Number(campaign.id)]
          : [campaign.name])
      );
    return row ? Number(row.campaign_id) : null;
  }

  getAlterationTypes() {
    const alterations = this.repository.listAlterations();
    return {
      alterations,
      count: alterations.length,
      generatedAt: new Date().toISOString(),
    };
  }

  getAlterationsUploads({ limit = 20000, offset = 0 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 100000, fallback: 20000 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const uploads = this.repository.listAlterationsUploadMaps({
      limit: safeLimit,
      offset: safeOffset,
    });
    return {
      uploads,
      count: uploads.length,
      generatedAt: new Date().toISOString(),
      paging: {
        limit: safeLimit,
        offset: safeOffset,
        has_more: uploads.length >= safeLimit,
        next_offset: uploads.length >= safeLimit ? safeOffset + uploads.length : null,
      },
    };
  }

  async getAlterationsLeaderboards({
    limit = 50,
    mapsOffset = 0,
    overallLimit = 5000,
    overallOffset = 0,
    perBucketLimit = 10,
    includeMaps = true,
    includeBuckets = true,
    includeMedals = true,
  } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 500, fallback: 50 });
    const safeMapsOffset = clampInt(mapsOffset, { min: 0, max: 2000000, fallback: 0 });
    const safeOverallLimit = clampInt(overallLimit, { min: 1, max: 5000, fallback: 400 });
    const safeOverallOffset = clampInt(overallOffset, { min: 0, max: 2000000, fallback: 0 });
    const safePerBucketLimit = clampInt(perBucketLimit, { min: 1, max: 50, fallback: 10 });
    const safeIncludeMaps = includeMaps !== false;
    const safeIncludeBuckets = includeBuckets !== false;
    const safeIncludeMedals = includeMedals !== false;

    const mostPlayedMaps = safeIncludeMaps
      ? this.repository.listMostPlayedAlterationsMaps({
          limit: safeLimit,
          offset: safeMapsOffset,
        })
      : [];
    const wrOverall = this.repository.listWrLeaderboardOverall({
      limit: safeOverallLimit,
      offset: safeOverallOffset,
    });
    const wrBySeasonRows = safeIncludeBuckets
      ? this.repository.listWrLeaderboardBySeason({
          perBucketLimit: safePerBucketLimit,
          maxRows: safePerBucketLimit * 24,
        })
      : [];
    const wrByCampaignRows = safeIncludeBuckets
      ? this.repository.listWrLeaderboardByCampaign({
          perBucketLimit: safePerBucketLimit,
          maxRows: safePerBucketLimit * 800,
        })
      : [];
    const wrBySlotRows = safeIncludeBuckets
      ? this.repository.listWrLeaderboardBySlot({
          perBucketLimit: safePerBucketLimit,
          maxRows: safePerBucketLimit * 40,
        })
      : [];
    const baseStats = this.repository.getAlterationsStats();
    const wrSummary = this.repository.getWrLeaderboardSummary();
    const trackerCoverageClient =
      this.getTrackerSyncTargetClient("leaderboard") || this.trackerClient;
    const trackerCoverageResult = await trackerCoverageClient.getLeaderboardCoverage({
      trackedOnly: true,
    });
    let wrSummaryOverride = null;
    let resolvedWrOverall = wrOverall;
    let resolvedWrBySeasonRows = wrBySeasonRows;
    let resolvedWrByCampaignRows = wrByCampaignRows;
    let resolvedWrBySlotRows = wrBySlotRows;
    let wrSource = "altered-db";

    if (!resolvedWrOverall.length) {
      const trackerMapsResult = await this.trackerClient.getTrackedMaps(60000);
      if (trackerMapsResult?.ok) {
        const fallback = buildWrLeaderboardsFromTrackerMaps(trackerMapsResult?.data?.maps || []);
        if (fallback.overall.length) {
          resolvedWrOverall = fallback.overall.slice(
            safeOverallOffset,
            safeOverallOffset + safeOverallLimit
          );
          resolvedWrBySeasonRows = fallback.by_season_rows.filter(
            (row) => Number(row.rank || 0) <= safePerBucketLimit
          );
          resolvedWrByCampaignRows = fallback.by_campaign_rows.filter(
            (row) => Number(row.rank || 0) <= safePerBucketLimit
          );
          resolvedWrBySlotRows = fallback.by_slot_rows.filter(
            (row) => Number(row.rank || 0) <= safePerBucketLimit
          );
          wrSummaryOverride = {
            unique_players: Number(fallback.overall.length || 0),
            total_wrs: fallback.overall.reduce(
              (sum, row) => sum + Number(row?.wr_count || 0),
              0
            ),
          };
          wrSource = "tracker-fallback";
        }
      }
    }

    const wrAccountIds = collectAllWrLeaderboardAccountIds({
      wrOverall: resolvedWrOverall,
      wrBySeasonRows: resolvedWrBySeasonRows,
      wrByCampaignRows: resolvedWrByCampaignRows,
      wrBySlotRows: resolvedWrBySlotRows,
    });
    const namesByAccountId = wrAccountIds.length
      ? await this.resolvePlayerNamesByAccountIds(wrAccountIds, { chunkSize: 100 })
      : {};

    const namedRows = mergeWrDisplayNamesFromTracker({
      wrOverall: resolvedWrOverall,
      wrBySeasonRows: resolvedWrBySeasonRows,
      wrByCampaignRows: resolvedWrByCampaignRows,
      wrBySlotRows: resolvedWrBySlotRows,
      namesByAccountId,
    });
    resolvedWrOverall = sortOverallWrRows(namedRows.overall);
    resolvedWrBySeasonRows = namedRows.bySeasonRows;
    resolvedWrByCampaignRows = namedRows.byCampaignRows;
    resolvedWrBySlotRows = namedRows.bySlotRows;

    const fallbackTotalWrs = resolvedWrOverall.reduce((sum, row) => sum + Number(row?.wr_count || 0), 0);
    const totalWrs = Number(wrSummaryOverride?.total_wrs || wrSummary?.total_wrs || fallbackTotalWrs);
    const uniqueWrPlayers = Number(
      wrSummaryOverride?.unique_players || wrSummary?.unique_players || resolvedWrOverall.length
    );
    const trackerCoverage =
      trackerCoverageResult?.ok && trackerCoverageResult?.data?.coverage
        ? trackerCoverageResult.data.coverage
        : {};

    let medalPayload = {
      available: false,
      note: "Medal payload disabled for this request.",
      sampled_at: null,
      maps_sampled: 0,
      top_by_medal: {
        author: [],
        gold: [],
        silver: [],
        bronze: [],
      },
    };
    if (safeIncludeMedals) {
      const trackerMedalResult = await this.trackerClient.getMedalLeaderboards(safeLimit);
      medalPayload = trackerMedalResult?.ok
        ? {
            available: true,
            note:
              toText(trackerMedalResult?.data?.note) ||
              "Counts are based on tracker leaderboard rows.",
            sampled_at: trackerMedalResult?.data?.sampledAt || new Date().toISOString(),
            maps_sampled: Number(trackerMedalResult?.data?.mapsSampled || 0),
            top_by_medal: trackerMedalResult?.data?.topByMedal || {
              author: [],
              gold: [],
              silver: [],
              bronze: [],
            },
          }
        : {
            available: false,
            note:
              toText(trackerMedalResult?.error) ||
              "Tracker medal leaderboard endpoint is unavailable.",
            sampled_at: null,
            maps_sampled: 0,
            top_by_medal: {
              author: [],
              gold: [],
              silver: [],
              bronze: [],
            },
          };
    }

    return {
      generated_at: new Date().toISOString(),
      limits: {
        maps: safeLimit,
        maps_offset: safeMapsOffset,
        overall_players: safeOverallLimit,
        overall_offset: safeOverallOffset,
        per_bucket_players: safePerBucketLimit,
      },
      paging: {
        maps: {
          limit: safeLimit,
          offset: safeMapsOffset,
          count: mostPlayedMaps.length,
          has_more: safeIncludeMaps && mostPlayedMaps.length >= safeLimit,
          next_offset:
            safeIncludeMaps && mostPlayedMaps.length >= safeLimit
              ? safeMapsOffset + mostPlayedMaps.length
              : null,
        },
        overall_players: {
          limit: safeOverallLimit,
          offset: safeOverallOffset,
          count: resolvedWrOverall.length,
          total: uniqueWrPlayers,
          has_more: safeOverallOffset + resolvedWrOverall.length < uniqueWrPlayers,
          next_offset:
            safeOverallOffset + resolvedWrOverall.length < uniqueWrPlayers
              ? safeOverallOffset + resolvedWrOverall.length
              : null,
        },
      },
      summary: {
        total_maps: Number(baseStats?.totalMaps || 0),
        active_maps: Number(baseStats?.activelyTracked || 0),
        unique_wr_players: uniqueWrPlayers,
        wr_source: wrSource,
        total_wrs: totalWrs,
        page_wr_players: resolvedWrOverall.length,
        leaderboard_coverage: {
          total_maps: Number(trackerCoverage.totalMaps || baseStats?.activelyTracked || 0),
          maps_with_known_wr: Number(trackerCoverage.mapsWithKnownWr || 0),
          maps_with_leaderboard_rows: Number(trackerCoverage.mapsWithLeaderboardRows || 0),
          maps_with_extended_leaderboard: Number(trackerCoverage.mapsWithExtendedLeaderboard || 0),
          leaderboard_rows_stored: Number(trackerCoverage.leaderboardRowsStored || 0),
          max_rows_per_map: Number(trackerCoverage.maxRowsPerMap || 0),
          avg_rows_per_map: Number(trackerCoverage.avgRowsPerMap || 0),
          avg_rows_per_covered_map: Number(trackerCoverage.avgRowsPerCoveredMap || 0),
          wr_coverage_pct: Number(trackerCoverage.wrCoveragePct || 0),
          leaderboard_coverage_pct: Number(trackerCoverage.leaderboardCoveragePct || 0),
          extended_coverage_pct: Number(trackerCoverage.extendedCoveragePct || 0),
        },
      },
      maps: {
        most_played: mostPlayedMaps,
      },
      wr: {
        overall: resolvedWrOverall,
        by_season: safeIncludeBuckets
          ? groupLeaderboardBuckets(resolvedWrBySeasonRows, { order: "season" })
          : [],
        by_campaign: safeIncludeBuckets
          ? groupLeaderboardBuckets(resolvedWrByCampaignRows, { order: "alpha" })
          : [],
        by_slot: safeIncludeBuckets
          ? groupLeaderboardBuckets(resolvedWrBySlotRows, { order: "slot" })
          : [],
      },
      medals: medalPayload,
    };
  }

  async getMonitorLeaderboardLive({ leaderboardLimit = 18, feedLimit = 80 } = {}) {
    const [leaderboards, trackerStatusResult, trackerFeedResult] = await Promise.all([
      this.getAlterationsLeaderboards({
        limit: leaderboardLimit,
        overallLimit: 350,
        perBucketLimit: 12,
      }),
      this.trackerClient.getTrackerStatus(),
      this.trackerClient.getWrFeed(feedLimit),
    ]);

    const alteredMapUids = new Set(
      this.repository
        .listAlteredMapUids({
          trackedOnly: true,
          limit: 200000,
        })
        .map((mapUid) => String(mapUid || "").toLowerCase())
        .filter(Boolean)
    );
    const trackerFeed = asArray(trackerFeedResult?.data?.feed);
    const filteredFeed = trackerFeed
      .filter((event) => alteredMapUids.has(String(event?.uid || event?.mapUid || "").toLowerCase()))
      .slice(0, Math.max(1, Math.min(Number(feedLimit) || 80, 300)));
    const feedAccountIds = this.collectHolderAccountIds(filteredFeed, ["accountId", "holder"]);
    const feedNamesByAccountId = await this.resolvePlayerNamesByAccountIds(feedAccountIds, {
      chunkSize: 100,
    });
    const resolvedFeed = this.applyResolvedHolderNames(filteredFeed, "holder", feedNamesByAccountId, {
      accountIdKeys: ["accountId"],
      pendingKey: "displayNamePending",
      accountIdOutputKey: "accountId",
    });

    return {
      generatedAt: new Date().toISOString(),
      leaderboards,
      tracker: trackerStatusResult?.ok
        ? trackerStatusResult.data
        : { error: trackerStatusResult?.error || "Unable to load tracker status." },
      feed: resolvedFeed,
      feedCount: resolvedFeed.length,
      feedSourceCount: trackerFeed.length,
      alteredTrackedMapCount: alteredMapUids.size,
      warnings: [
        !trackerStatusResult?.ok
          ? trackerStatusResult?.error || "Tracker status unavailable."
          : null,
        !trackerFeedResult?.ok ? trackerFeedResult?.error || "Tracker feed unavailable." : null,
      ].filter(Boolean),
    };
  }

  receiveWrWebhook({ mapUid, mapName, accountId, holder, wrMs, recordedAt } = {}) {
    const uid = normalizeMapUid(mapUid);
    if (!uid) return { error: "mapUid is required." };

    const nowIso = new Date().toISOString();
    const mapInfo = this.repository.getMapInfo(uid);
    const resolvedAccountId = normalizeAccountId(accountId || holder);
    const resolvedName =
      toText(mapName) || toText(mapInfo?.map?.name) || toText(mapInfo?.name) || uid;
    const resolvedHolder =
      sanitizeResolvedDisplayName(holder, { accountId: resolvedAccountId }) ||
      resolvedAccountId ||
      "Unknown";
    const safeWrMs = clampInt(wrMs, { min: 0, max: 2147483647, fallback: 0 });
    const safeRecordedAt = toIso(recordedAt, nowIso);

    const inserted = this.repository.insertWrEvent({
      mapUid: uid,
      mapName: resolvedName,
      accountId: resolvedAccountId,
      holder: resolvedHolder,
      wrMs: safeWrMs,
      recordedAt: safeRecordedAt,
      receivedAt: nowIso,
    });
    if (!inserted) return { error: "Failed to persist WR webhook event." };

    const displayNamePending =
      Boolean(resolvedAccountId) &&
      !hasResolvedDisplayName(inserted.holder, { accountId: resolvedAccountId });
    if (displayNamePending) {
      this.queuePriorityDisplayNameLookups([resolvedAccountId], {
        source: "wr-webhook",
      });
    }

    return {
      ok: true,
      event: {
        eventId: inserted.eventId,
        mapUid: inserted.mapUid,
        name: inserted.mapName,
        accountId: inserted.accountId,
        holder: inserted.holder,
        displayNamePending,
        wrMs: inserted.wrMs,
        at: inserted.recordedAt,
        receivedAt: inserted.receivedAt,
      },
    };
  }

  async getLatestWr({ includeRecent = true, limit = 10, offset = 0 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 500, fallback: 10 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const latest = this.repository.getLatestWrEvent();
    const recent = includeRecent
      ? this.repository.getRecentWrEvents({
          limit: safeLimit,
          offset: safeOffset,
        })
      : [];
    const rows = [latest, ...recent].filter(Boolean);
    const holderAccountIds = this.collectHolderAccountIds(rows, ["accountId", "holder"]);
    const namesByAccountId = await this.resolvePlayerNamesByAccountIds(holderAccountIds, {
      chunkSize: 100,
    });
    const resolvedLatest = latest
      ? this.applyResolvedHolderNames([latest], "holder", namesByAccountId, {
          accountIdKeys: ["accountId"],
          pendingKey: "displayNamePending",
          accountIdOutputKey: "accountId",
        })[0]
      : null;
    const resolvedRecent = this.applyResolvedHolderNames(recent, "holder", namesByAccountId, {
      accountIdKeys: ["accountId"],
      pendingKey: "displayNamePending",
      accountIdOutputKey: "accountId",
    });
    return {
      latestWr: resolvedLatest
        ? {
            eventId: resolvedLatest.eventId,
            mapUid: resolvedLatest.mapUid,
            name: resolvedLatest.mapName,
            accountId: resolvedLatest.accountId || null,
            holder: resolvedLatest.holder,
            displayNamePending: Boolean(resolvedLatest.displayNamePending),
            wrMs: resolvedLatest.wrMs,
            at: resolvedLatest.recordedAt,
            receivedAt: resolvedLatest.receivedAt,
          }
        : null,
      feed: resolvedRecent.map((item) => ({
        eventId: item.eventId,
        mapUid: item.mapUid,
        name: item.mapName,
        accountId: item.accountId || null,
        holder: item.holder,
        displayNamePending: Boolean(item.displayNamePending),
        wrMs: item.wrMs,
        at: item.recordedAt,
        receivedAt: item.receivedAt,
      })),
      paging: {
        limit: includeRecent ? safeLimit : 0,
        offset: includeRecent ? safeOffset : 0,
        count: recent.length,
        has_more: includeRecent && recent.length >= safeLimit,
        next_offset:
          includeRecent && recent.length >= safeLimit ? safeOffset + recent.length : null,
      },
    };
  }

  async submitUpdateRequest({
    uid,
    name,
    reason,
    requesterIp = "",
    requesterUserAgent = "",
  } = {}) {
    const mapUid = normalizeMapUid(uid);
    if (!mapUid) return { error: "Map UID is required." };

    const recent = this.repository.getRecentUpdateRequest(mapUid, 60);
    if (recent) {
      return {
        error:
          "This map was already requested recently. Please wait before requesting again.",
      };
    }

    const mapInfo = this.repository.getMapInfo(mapUid);
    const mapName =
      toText(name) || toText(mapInfo?.map?.name) || toText(mapInfo?.name) || mapUid;
    const nowIso = new Date().toISOString();
    const request = this.repository.insertUpdateRequest({
      mapUid,
      mapName,
      reason: toText(reason),
      status: "queued",
      requesterIp: toText(requesterIp),
      requesterUserAgent: toText(requesterUserAgent),
      createdAt: nowIso,
    });
    if (!request) return { error: "Unable to store update request." };

    let trackerWarning = null;
    try {
      const ensureResult = await this.ensureMapIsKnownToTracker(mapUid);
      if (!ensureResult?.ok) {
        trackerWarning = ensureResult?.error || "Tracker sync failed.";
      } else {
        const trackingResult = await this.updateMapTrackingAcrossTargets(mapUid, {
          tracked: true,
          status: "live",
        });
        if (!trackingResult?.ok) {
          trackerWarning = trackingResult?.error || "Unable to update tracker map status.";
        }
      }
    } catch (error) {
      trackerWarning = error?.message || "Tracker prep failed.";
    }

    return {
      ok: true,
      request,
      tracker: {
        prepared: !trackerWarning,
        warning: trackerWarning,
      },
    };
  }

  listUpdateRequests({ status = "", q = "", limit = 100, offset = 0 } = {}) {
    const requests = this.repository.listUpdateRequests({
      status,
      q,
      limit,
      offset,
    });
    return {
      requests,
      count: requests.length,
    };
  }

  updateUpdateRequestStatus({ requestId, status, resolutionNote = "" } = {}) {
    const updated = this.repository.updateUpdateRequestStatus({
      requestId,
      status,
      resolutionNote,
    });
    if (!updated) return { error: "Request not found or invalid status." };
    return {
      ok: true,
      request: updated,
    };
  }

  getCampaignTimeline(options = {}) {
    return this.repository.getCampaignTimeline(options);
  }

  getHookStatus() {
    return this.repository.getHookStatus();
  }

  getProjectClubs({ includeDisabled = true } = {}) {
    const hooks =
      typeof this.repository?.listHookStatuses === "function"
        ? this.repository.listHookStatuses({ includeDisabled })
        : [this.repository.getHookStatus()].filter(Boolean);
    return hooks
      .filter(Boolean)
      .map((hook) => ({
        ...hook,
        primary: String(hook.hookKey || "") === "altered-club",
        liveMonitorClub: Number(hook.clubId || 0) === Number(this.liveMonitor.clubId || 0),
      }));
  }

  getProjectSources({ includeDisabled = true } = {}) {
    const sources =
      typeof this.repository?.listProjectSources === "function"
        ? this.repository.listProjectSources({ includeDisabled })
        : [];
    const builtins = [];
    const ensureBuiltinSource = ({
      sourceKey,
      sourceType,
      displayName,
      sourceLabel,
      metadata,
    }) => {
      if (sources.some((source) => String(source?.sourceKey || "") === sourceKey)) return;
      const fallback = typeof this.repository?.upsertProjectSource === "function"
        ? this.repository.upsertProjectSource({
            sourceKey,
            sourceType,
            displayName,
            sourceLabel,
            enabled: true,
            metadata,
          })
        : null;
      if (fallback) builtins.push(fallback);
    };

    ensureBuiltinSource({
      sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
      sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
      displayName: WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
      sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
      metadata: {
        campaignType: WEEKLY_SHORTS_CAMPAIGN_TYPE,
        storageClubId: 0,
        importRoots: getDefaultWeeklyShortsImportRoots(),
      },
    });

    ensureBuiltinSource({
      sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
      sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
      displayName: OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
      sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
      metadata: {
        campaignType: OFFICIAL_SEASONAL_CAMPAIGN_TYPE,
        storageClubId: 0,
      },
    });

    ensureBuiltinSource({
      sourceKey: TOTD_SOURCE_KEY,
      sourceType: TOTD_SOURCE_TYPE,
      displayName: TOTD_SOURCE_DISPLAY_NAME,
      sourceLabel: TOTD_SOURCE_LABEL,
      metadata: {
        campaignType: TOTD_CAMPAIGN_TYPE,
        storageClubId: 0,
      },
    });

    ensureBuiltinSource({
      sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
      sourceType: WEEKLY_GRANDS_SOURCE_TYPE,
      displayName: WEEKLY_GRANDS_SOURCE_DISPLAY_NAME,
      sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
      metadata: {
        campaignType: WEEKLY_GRANDS_CAMPAIGN_TYPE,
        storageClubId: 0,
      },
    });

    ensureBuiltinSource({
      sourceKey: COMPETITION_SOURCE_KEY,
      sourceType: COMPETITION_SOURCE_TYPE,
      displayName: COMPETITION_SOURCE_DISPLAY_NAME,
      sourceLabel: COMPETITION_SOURCE_LABEL,
      metadata: {
        campaignType: COMPETITION_CAMPAIGN_TYPE,
        storageClubId: COMPETITION_SOURCE_CLUB_ID,
      },
    });

    ensureBuiltinSource({
      sourceKey: DISCOVERY_SOURCE_KEY,
      sourceType: DISCOVERY_SOURCE_TYPE,
      displayName: DISCOVERY_SOURCE_DISPLAY_NAME,
      sourceLabel: DISCOVERY_SOURCE_LABEL,
      metadata: {
        campaignType: DISCOVERY_CAMPAIGN_TYPE,
        storageClubId: DISCOVERY_SOURCE_CLUB_ID,
        campaignIds: DISCOVERY_SOURCE_CAMPAIGNS.map((campaign) => campaign.campaignId),
      },
    });

    ensureBuiltinSource({
      sourceKey: LEGACY_SOURCE_KEY,
      sourceType: LEGACY_SOURCE_TYPE,
      displayName: LEGACY_SOURCE_DISPLAY_NAME,
      sourceLabel: LEGACY_SOURCE_LABEL,
      metadata: {
        campaignType: LEGACY_CAMPAIGN_TYPE,
        storageClubId: LEGACY_SOURCE_CLUB_ID,
        campaignIds: LEGACY_SOURCE_CAMPAIGNS.map((campaign) => campaign.campaignId),
      },
    });

    return [...sources, ...builtins].map((source) => ({
      ...source,
      nextScheduledSyncAt: this.computeProjectSourceNextRunIso(source),
    }));
  }

  getWeeklyShortsSourceStatus() {
    return this.getProjectSources({ includeDisabled: true }).find(
      (source) => String(source?.sourceKey || "") === WEEKLY_SHORTS_SOURCE_KEY
    ) || null;
  }

  getOfficialSeasonalSourceStatus() {
    return this.getProjectSources({ includeDisabled: true }).find(
      (source) => String(source?.sourceKey || "") === OFFICIAL_SEASONAL_SOURCE_KEY
    ) || null;
  }

  getTotdSourceStatus() {
    return this.getProjectSources({ includeDisabled: true }).find(
      (source) => String(source?.sourceKey || "") === TOTD_SOURCE_KEY
    ) || null;
  }

  getWeeklyGrandsSourceStatus() {
    return this.getProjectSources({ includeDisabled: true }).find(
      (source) => String(source?.sourceKey || "") === WEEKLY_GRANDS_SOURCE_KEY
    ) || null;
  }

  getCompetitionSourceStatus() {
    return this.getProjectSources({ includeDisabled: true }).find(
      (source) => String(source?.sourceKey || "") === COMPETITION_SOURCE_KEY
    ) || null;
  }

  getDiscoverySourceStatus() {
    return this.getProjectSources({ includeDisabled: true }).find(
      (source) => String(source?.sourceKey || "") === DISCOVERY_SOURCE_KEY
    ) || null;
  }

  getLegacySourceStatus() {
    return this.getProjectSources({ includeDisabled: true }).find(
      (source) => String(source?.sourceKey || "") === LEGACY_SOURCE_KEY
    ) || null;
  }

  getNamingSimilaritySourceOptions() {
    const enabledProjectSources = new Set(
      this.getProjectSources({ includeDisabled: true })
        .filter((source) => source?.enabled !== false)
        .map((source) => toText(source?.sourceKey).toLowerCase())
        .filter(Boolean)
    );
    return NAMING_SIMILARITY_SOURCE_OPTIONS.filter(
      (option) => !option.key || enabledProjectSources.has(option.key)
    );
  }

  collectCampaignSnapshotMapUids(campaigns = [], predicate = null) {
    const filterFn = typeof predicate === "function" ? predicate : null;
    return normalizeUniqueStrings(
      (Array.isArray(campaigns) ? campaigns : []).flatMap((campaign) =>
        (Array.isArray(campaign?.maps) ? campaign.maps : [])
          .filter((map) => (filterFn ? filterFn(map, campaign) : true))
          .map((map) => resolveMapUid(map))
      )
    );
  }

  getAutomaticSimilarityTargetMapUids({ mapUids = [], forceSimilarity = false } = {}) {
    const safeMapUids = normalizeUniqueStrings(mapUids);
    if (!safeMapUids.length) return [];
    if (forceSimilarity) return safeMapUids;
    return normalizeUniqueStrings(
      this.repository
        .listMapsNeedingSimilarityRefresh({
          mapUids: safeMapUids,
          limit: Math.max(1, safeMapUids.length),
          requiredAssignmentMethod: CONTENT_SIGNATURE_VERSION,
          includePayload: false,
        })
        .map((map) => resolveMapUid(map))
        .filter(Boolean)
    );
  }

  async runAutomaticNamingAssignments({
    mapUids = [],
    forceSimilarity = false,
    persistCandidates = true,
  } = {}) {
    const selectedMapUids = this.getAutomaticSimilarityTargetMapUids({
      mapUids,
      forceSimilarity,
    });
    if (!selectedMapUids.length) {
      return {
        selectedMapUids: [],
        metadataAssignment: { ok: true, processed: 0, matched: 0, unmatched: 0 },
        namingAssignment: { ok: true, processed: 0, resolved: 0, unresolved: 0 },
      };
    }

    const metadataAssignment = this.assignStoredMapMetadata({
      mapUids: selectedMapUids,
      limit: Math.max(1, selectedMapUids.length),
    });
    const namingAssignment = await this.assignStoredMapNumbersBySimilarity({
      mapUids: selectedMapUids,
      limit: Math.max(1, selectedMapUids.length),
      persistCandidates,
      force: forceSimilarity,
      rescanAll: false,
    });
    return {
      selectedMapUids,
      metadataAssignment,
      namingAssignment,
    };
  }

  getProjectSourceScheduleRule(sourceKey = "") {
    const safeKey = toText(sourceKey).toLowerCase();
    return PROJECT_SOURCE_SCHEDULES[safeKey] || null;
  }

  computeProjectSourceNextRunMs(source = null, { fromTimeMs = Date.now() } = {}) {
    const rule = this.getProjectSourceScheduleRule(source?.sourceKey);
    if (!rule || source?.enabled === false) return null;

    const releaseStartMs = Date.parse(String(source?.summary?.latestReleaseStartAt || "").trim());
    const releaseEndMs = Date.parse(String(source?.summary?.latestReleaseEndAt || "").trim());
    const lastSyncedMs = Date.parse(String(source?.lastSyncedAt || "").trim());
    const hasLastSynced = Number.isFinite(lastSyncedMs);
    const candidates = [];

    if (!hasLastSynced || !Number.isFinite(releaseStartMs)) {
      return fromTimeMs;
    }

    for (const checkpointMs of Array.isArray(rule.checkpointsMs) ? rule.checkpointsMs : []) {
      const dueMs = releaseStartMs + Math.max(0, Number(checkpointMs) || 0);
      if (!Number.isFinite(dueMs)) continue;
      if (!hasLastSynced || dueMs > lastSyncedMs) {
        candidates.push(dueMs);
      }
    }

    if (rule.followEndTimestamp && Number.isFinite(releaseEndMs)) {
      const nextReleaseDueMs = releaseEndMs + PROJECT_SOURCE_RELEASE_BUFFER_MS;
      if (!hasLastSynced || nextReleaseDueMs > lastSyncedMs) {
        candidates.push(nextReleaseDueMs);
      }
    }

    const nextMs = [...new Set(candidates.filter((value) => Number.isFinite(value)))]
      .sort((left, right) => left - right)[0];
    return Number.isFinite(nextMs) ? nextMs : null;
  }

  computeProjectSourceNextRunIso(source = null, options = {}) {
    const nextMs = this.computeProjectSourceNextRunMs(source, options);
    return Number.isFinite(nextMs) ? new Date(nextMs).toISOString() : null;
  }

  getLatestCampaignReleaseWindow(rawCampaigns = []) {
    let latest = null;
    for (const campaign of Array.isArray(rawCampaigns) ? rawCampaigns : []) {
      const startMs = Date.parse(toFlexibleIso(campaign?.startTimestamp) || "");
      if (!Number.isFinite(startMs)) continue;
      if (!latest || startMs > latest.startMs) {
        latest = {
          startMs,
          endMs: Date.parse(toFlexibleIso(campaign?.endTimestamp) || ""),
          name: toText(campaign?.name) || null,
        };
      }
    }
    return latest
      ? {
          latestReleaseStartAt: new Date(latest.startMs).toISOString(),
          latestReleaseEndAt: Number.isFinite(latest.endMs) ? new Date(latest.endMs).toISOString() : null,
          latestReleaseName: latest.name || null,
        }
      : {
          latestReleaseStartAt: null,
          latestReleaseEndAt: null,
          latestReleaseName: null,
        };
  }

  getLatestTotdReleaseWindow(rawMonths = []) {
    let latest = null;
    for (const month of Array.isArray(rawMonths) ? rawMonths : []) {
      for (const day of Array.isArray(month?.days) ? month.days : []) {
        const startMs = Date.parse(toFlexibleIso(day?.startTimestamp) || "");
        if (!Number.isFinite(startMs)) continue;
        if (!latest || startMs > latest.startMs) {
          latest = {
            startMs,
            endMs: Date.parse(toFlexibleIso(day?.endTimestamp) || ""),
            monthDay: clampInt(day?.monthDay, { min: 1, max: 31, fallback: 0 }) || null,
            year: clampInt(month?.year, { min: 2020, max: 2100, fallback: 0 }) || null,
            month: clampInt(month?.month, { min: 1, max: 12, fallback: 0 }) || null,
          };
        }
      }
    }
    return latest
      ? {
          latestReleaseStartAt: new Date(latest.startMs).toISOString(),
          latestReleaseEndAt: Number.isFinite(latest.endMs) ? new Date(latest.endMs).toISOString() : null,
          latestReleaseName:
            latest.year && latest.month && latest.monthDay
              ? `TOTD ${latest.year}-${String(latest.month).padStart(2, "0")}-${String(latest.monthDay).padStart(2, "0")}`
              : null,
        }
      : {
          latestReleaseStartAt: null,
          latestReleaseEndAt: null,
          latestReleaseName: null,
        };
  }

  getPrimaryProjectClubId() {
    const liveMonitorClubId = clampInt(this.liveMonitor?.clubId, {
      min: 1,
      max: 2147483647,
      fallback: 0,
    });
    if (liveMonitorClubId > 0) return liveMonitorClubId;
    const primaryHookClubId = clampInt(this.repository.getHookConfig("altered-club")?.clubId, {
      min: 1,
      max: 2147483647,
      fallback: 0,
    });
    return primaryHookClubId > 0 ? primaryHookClubId : null;
  }

  getHookMaps({ q = "", limit = 1200 } = {}) {
    return this.repository.listMaps({ q, limit });
  }

  getAdminMapsWorkspace({
    q = "",
    campaign = "",
    tracked = undefined,
    status = "",
    staleState = "",
    page = 1,
    pageSize = 50,
  } = {}) {
    const safePageSize = clampInt(pageSize, { min: 10, max: 200, fallback: 50 });
    const safePage = clampInt(page, { min: 1, max: 50000, fallback: 1 });
    const offset = (safePage - 1) * safePageSize;
    const maps = this.repository.listMapsWorkspace({
      q,
      campaign,
      tracked,
      status,
      staleState,
      limit: safePageSize,
      offset,
    });
    const total = this.repository.countMapsWorkspace({
      q,
      campaign,
      tracked,
      status,
      staleState,
    });
    return {
      maps,
      total,
      page: safePage,
      pageSize: safePageSize,
      pageCount: Math.max(1, Math.ceil(total / safePageSize)),
      hasMore: offset + maps.length < total,
    };
  }

  getHookRuns(limit = 30) {
    return this.repository.listHookRuns(limit);
  }

  getMapInfo(mapUid) {
    return this.repository.getMapInfo(mapUid);
  }

  getPublicApiCatalog() {
    return {
      generatedAt: new Date().toISOString(),
      ...buildPublicApiCatalog(),
    };
  }

  getLegacyMapInfo(mapUid) {
    const payload = this.getPublicMapDetail(mapUid, { wrHistoryLimit: 5 });
    if (!payload?.exists || !payload?.map) {
      return {
        exists: false,
        mapUid: toText(mapUid),
      };
    }

    const map = payload.map;
    return {
      alteration: map.alteration || null,
      author: map.author || "",
      authorScore: Number(map.authorScore || 0),
      bronzeScore: Number(map.bronzeScore || 0),
      collectionName: map.collectionName || null,
      createdWithGamepadEditor:
        map.createdWithGamepadEditor === null ? false : Boolean(map.createdWithGamepadEditor),
      createdWithSimpleEditor:
        map.createdWithSimpleEditor === null ? false : Boolean(map.createdWithSimpleEditor),
      fileUrl: map.fileUrl || null,
      filename: map.filename || "",
      goldScore: Number(map.goldScore || 0),
      isPlayable: map.isPlayable === null ? true : Boolean(map.isPlayable),
      mapId: map.mapId || null,
      mapStyle: map.mapStyle || "",
      mapType: map.mapType || "",
      mapUid: map.mapUid,
      mapnumber: Array.isArray(map.mapnumber) ? map.mapnumber : [],
      name: map.name || "",
      season: map.season || null,
      silverScore: Number(map.silverScore || 0),
      submitter: map.submitter || "",
      thumbnailUrl: map.thumbnailUrl || null,
      timestamp: map.timestamp || map.mapCreatedAt || map.mapUpdatedAt || null,
      type: map.type || null,
      year: Number(map.year || 0) || null,
    };
  }

  getPublicMapDetail(mapUid, { wrHistoryLimit = 5 } = {}) {
    const mapInfo = this.repository.getMapInfo(mapUid);
    if (!mapInfo?.exists || !mapInfo.map) {
      return {
        exists: false,
        mapUid: toText(mapUid),
      };
    }

    const safeWrHistoryLimit = clampInt(wrHistoryLimit, {
      min: 1,
      max: 25,
      fallback: 5,
    });
    const wrHistory = this.repository.getRecentWrEventsForMap({
      mapUid,
      limit: safeWrHistoryLimit,
    });
    const map = mapInfo.map;
    const derived = deriveMapMetadata(map);

    return {
      exists: true,
      generatedAt: new Date().toISOString(),
      api: {
        name: "Altered Public API",
        version: "v1",
        docsPath: "/api/",
      },
      map: {
        mapUid: map.uid,
        mapId: map.mapId || null,
        name: map.name,
        filename: derived.filename,
        fileUrl: derived.fileUrl,
        thumbnailUrl: derived.thumbnailUrl || map.thumbnailUrl || null,
        author: map.author || null,
        authorDisplayName: map.authorDisplayName || null,
        authorScore: Number(map.authorMs || 0),
        submitter: map.submitter || null,
        submitterDisplayName: map.submitterDisplayName || null,
        goldScore: Number(map.goldMs || 0),
        silverScore: Number(map.silverMs || 0),
        bronzeScore: Number(map.bronzeMs || 0),
        wrMs: Number(map.wrMs || 0),
        wrHolder: map.wrHolder || "-",
        wrUpdatedAt: map.wrUpdatedAt || null,
        playerCount: Number(map.playerCount || 0),
        playerCountUpdatedAt: map.playerCountUpdatedAt || null,
        collectionName: derived.collectionName,
        mapStyle: map.mapStyle || "",
        mapType: map.mapType || null,
        type: derived.type || null,
        nbLaps: Number(map.laps || 1),
        isPlayable: derived.isPlayable,
        createdWithGamepadEditor: derived.createdWithGamepadEditor,
        createdWithSimpleEditor: derived.createdWithSimpleEditor,
        timestamp: derived.timestamp,
        mapCreatedAt: map.mapCreatedAt || null,
        mapUpdatedAt: map.mapUpdatedAt || null,
        campaignName: map.campaign || "Unassigned",
        campaignId: Number(map.campaignId || 0) || null,
        campaignExternalId: Number(map.campaignExternalId || 0) || null,
        slot: Number(map.slot || 0) || null,
        tracked: Boolean(map.tracked),
        status: map.status || "live",
        checkFrequencySeconds: Number(map.checkFrequency || 0),
        lastCheckedAt: map.lastCheckedAt || null,
        season: derived.season || null,
        year: Number(derived.year || 0) || null,
        mapnumber: Array.isArray(derived.mapnumber) ? derived.mapnumber : [],
        alteration: derived.alteration || null,
        alterationMix: Array.isArray(derived.alterationMix) ? derived.alterationMix : [],
        latestWrEvent: wrHistory[0] || null,
        cachedPayload: map.payload || null,
        cachedCampaignPayload: map.campaignPayload || null,
      },
      wrHistory,
      links: {
        self: `/api/v1/public/maps/${encodeURIComponent(map.uid)}`,
        legacy: `/api/v1/maps/info/${encodeURIComponent(map.uid)}`,
        docs: "/api/",
      },
    };
  }

  recordPublicApiRequest(request = {}) {
    return this.repository.recordApiRequest(request);
  }

  getPublicApiUsageSummary(options = {}) {
    const catalog = this.getPublicApiCatalog();
    const catalogByKey = new Map(
      (Array.isArray(catalog.endpoints) ? catalog.endpoints : []).map((endpoint) => [
        endpoint.key,
        endpoint,
      ])
    );
    const usage = this.repository.getApiUsageSummary(options);

    return {
      ...usage,
      catalog: {
        docsPath: catalog.api?.docsPath || "/api/",
        totalEndpoints: Number(catalog.api?.totalEndpoints || PUBLIC_API_ENDPOINTS.length || 0),
      },
      endpoints: (Array.isArray(usage.endpoints) ? usage.endpoints : []).map((endpoint) => {
        const meta = catalogByKey.get(endpoint.endpointKey) || null;
        return {
          ...endpoint,
          method: meta?.method || "GET",
          path: meta?.path || endpoint.requestPath,
          title: meta?.title || endpoint.endpointKey,
          group: meta?.group || "Other",
          access: meta?.access || "public",
          stability: meta?.stability || "existing",
        };
      }),
      recentRequests: (Array.isArray(usage.recentRequests) ? usage.recentRequests : []).map(
        (request) => {
          const meta = catalogByKey.get(request.endpointKey) || null;
          return {
            ...request,
            title: meta?.title || request.endpointKey,
            path: meta?.path || request.requestPath,
            method: meta?.method || request.method || "GET",
          };
        }
      ),
    };
  }

  assignStoredMapMetadata({ q = "", limit = 60000, mapUids = [] } = {}) {
    const sourceMaps = this.repository.listMapsForNameStandardization({
      q,
      limit,
      mapUids,
    });
    const excludedMapUids = sourceMaps
      .filter((map) => shouldExcludeFromNamingReview(map))
      .map((map) => String(map?.mapUid || "").trim())
      .filter(Boolean);
    const excludedMapUidSet = new Set(excludedMapUids.map((mapUid) => mapUid.toLowerCase()));
    const candidates = sourceMaps
      .filter((map) => !excludedMapUidSet.has(String(map?.mapUid || "").trim().toLowerCase()))
      .map((map) => buildMapNameCandidate(map))
      .filter((candidate) => String(candidate?.mapUid || "").trim().length > 0);
    const counts = summarizeCandidates(candidates);

    if (excludedMapUids.length) {
      this.repository.deleteMapNameCandidates({
        mapUids: excludedMapUids,
      });
    }

    const upsert = this.repository.upsertMapNameCandidates({
      candidates,
    });
    if (upsert?.error) {
      return {
        error: upsert.error,
      };
    }

    return {
      ok: true,
      processed: Number(upsert.processed || 0),
      inserted: Number(upsert.inserted || 0),
      updated: Number(upsert.updated || 0),
      excluded: excludedMapUids.length,
      matched: counts.matched,
      unmatched: counts.unmatched,
      summary: this.repository.getMapNameCandidateSummary(),
    };
  }

  async getTrackerRunHistory(limit = 50, { timeoutMs = null } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 200, fallback: 50 });
    if (!this.trackerClient?.getTrackerRuns) {
      return {
        ok: false,
        error: "Tracker run history is unavailable.",
        runs: [],
      };
    }
    const result = await this.trackerClient.getTrackerRuns(safeLimit, { timeoutMs });
    if (!result?.ok) {
      return {
        ok: false,
        error: result?.error || "Tracker run history is unavailable.",
        runs: [],
      };
    }
    return {
      ok: true,
      runs: Array.isArray(result.data?.runs) ? result.data.runs : [],
    };
  }

  processMapNameStandardization({ q = "", limit = 60000 } = {}) {
    return this.assignStoredMapMetadata({
      q,
      limit,
    });
  }

  getLocalMapFileAbsolutePath(mapUid, relativePath = "") {
    const safeRelativePath = toText(relativePath) || buildLocalMapRelativePath(mapUid);
    return path.join(this.mapCopy.dataDir, safeRelativePath);
  }

  getMapLocalFixAbsolutePath(mapUid, sourceFilePath = "") {
    const relativePath = buildLocalMapFixRelativePath(mapUid, sourceFilePath);
    return this.getLocalMapFileAbsolutePath(mapUid, relativePath);
  }

  getPreferredMapLocalFiles({ mapUids = [] } = {}) {
    const originals = this.repository.getMapLocalFiles({ mapUids });
    const fixes = this.repository.getMapLocalFileFixes({ mapUids });
    const byUid = new Map(
      originals
        .filter((record) => record?.mapUid)
        .map((record) => [
          String(record.mapUid || "").toLowerCase(),
          {
            ...record,
            sourceKind: "downloaded",
            replacementActive: false,
          },
        ])
    );

    for (const fix of fixes) {
      const key = String(fix?.mapUid || "").toLowerCase();
      if (!key) continue;
      const original = byUid.get(key) || null;
      if (String(fix?.status || "").toLowerCase() === "ready") {
        byUid.set(key, {
          mapUid: fix.mapUid,
          relativePath: fix.relativePath,
          downloadUrl: original?.downloadUrl || null,
          fileSha256: fix.fileSha256 || null,
          fileSizeBytes: Number(fix.fileSizeBytes || 0),
          downloadedAt: original?.downloadedAt || fix.importedAt || null,
          verifiedAt: fix.verifiedAt || fix.importedAt || null,
          status: "ready",
          lastError: null,
          updatedAt: fix.updatedAt || null,
          sourceKind: "local-fix",
          sourceFilePath: fix.sourceFilePath || null,
          note: fix.note || null,
          replacementActive: true,
          originalLocalFile: original,
        });
        continue;
      }

      if (!original) {
        byUid.set(key, {
          mapUid: fix.mapUid,
          relativePath: fix.relativePath,
          downloadUrl: null,
          fileSha256: fix.fileSha256 || null,
          fileSizeBytes: Number(fix.fileSizeBytes || 0),
          downloadedAt: fix.importedAt || null,
          verifiedAt: fix.verifiedAt || fix.importedAt || null,
          status: fix.status || "missing",
          lastError: fix.lastError || null,
          updatedAt: fix.updatedAt || null,
          sourceKind: "local-fix",
          sourceFilePath: fix.sourceFilePath || null,
          note: fix.note || null,
          replacementActive: false,
          originalLocalFile: null,
        });
        continue;
      }

      byUid.set(key, {
        ...original,
        replacementActive: false,
        replacementSourceKind: "local-fix",
        replacementStatus: fix.status || null,
        replacementSourceFilePath: fix.sourceFilePath || null,
        replacementNote: fix.note || null,
        replacementError: fix.lastError || null,
      });
    }

    return [...byUid.values()];
  }

  getMapLocalStoreStatus() {
    const summary =
      typeof this.repository?.getMapLocalStoreSummary === "function"
        ? this.repository.getMapLocalStoreSummary({ includeParserDiagnostics: false })
        : {
            totalMaps: 0,
            downloadedCount: 0,
            missingCount: 0,
            errorCount: 0,
            totalBytes: 0,
            signatureReadyCount: 0,
            signatureErrorCount: 0,
            similarityReadyCount: 0,
          };
    const initialized =
      Number(summary.totalMaps || 0) > 0 &&
      Number(summary.downloadedCount || 0) >= Number(summary.totalMaps || 0) &&
      Number(summary.signatureReadyCount || 0) >= Number(summary.totalMaps || 0);
    return {
      enabled: Boolean(this.mapCopy.enabled),
      dataDir: this.mapCopy.dataDir,
      rootDir: this.mapCopy.rootDir,
      batchSize: this.mapCopy.batchSize,
      maxConcurrentDownloads: this.mapCopy.maxConcurrentDownloads,
      requestTimeoutMs: this.mapCopy.requestTimeoutMs,
      initialized,
      summary,
      job: {
        running: Boolean(this.mapCopy.running),
        runCounter: Number(this.mapCopy.runCounter || 0),
        currentRunId: this.mapCopy.currentRunId || null,
        currentReason: this.mapCopy.currentReason || null,
        progress: this.mapCopy.currentProgress || null,
        lastStartedAt: this.mapCopy.lastStartedAt,
        lastFinishedAt: this.mapCopy.lastFinishedAt,
        lastDurationMs: this.mapCopy.lastDurationMs,
        lastError: this.mapCopy.lastError,
        lastSummary: this.mapCopy.lastSummary,
      },
    };
  }

  updateMapCopyProgress(partial = {}) {
    const previous = this.mapCopy.currentProgress || {};
    const nextCounters =
      partial.replaceCounters === true
        ? { ...(partial.counters || {}) }
        : { ...(previous.counters || {}), ...(partial.counters || {}) };
    this.mapCopy.currentProgress = {
      ...previous,
      ...partial,
      counters: nextCounters,
      updatedAt: new Date().toISOString(),
    };
    delete this.mapCopy.currentProgress.replaceCounters;
    return this.mapCopy.currentProgress;
  }

  buildNamingSimilarityBackfillTargets({
    q = "",
    limit = 120000,
    mapUids = [],
    clubId = null,
    sourceKey = "",
    reviewState = "",
    rescanAll = false,
  } = {}) {
    const requestedMapUids = normalizeUniqueStrings(Array.isArray(mapUids) ? mapUids : []);
    const safeLimit = clampInt(limit, { min: 1, max: 120000, fallback: 250 });
    const safeClubId = normalizeOptionalClubId(clubId);
    const effectiveClubId = requestedMapUids.length ? null : safeClubId;
    const shouldPrioritizeRefreshOnly =
      !rescanAll &&
      !toText(q) &&
      !requestedMapUids.length;
    const sourceMaps = this.repository.listMapsForNameStandardization({
      q,
      limit:
        !toText(q) && !requestedMapUids.length
          ? Math.max(safeLimit * 4, 1000)
          : safeLimit,
      mapUids: requestedMapUids,
      clubId: effectiveClubId,
      reviewState,
      includePayload: false,
    });
    const prioritizedSourceMaps =
      shouldPrioritizeRefreshOnly
        ? this.repository.listMapsNeedingSimilarityRefresh({
            q,
            limit: safeLimit,
            mapUids: requestedMapUids,
            requiredAssignmentMethod: CONTENT_SIGNATURE_VERSION,
            clubId: effectiveClubId,
            reviewState,
            includePayload: false,
          })
        : [];
    const maps = uniqueBy(
      (prioritizedSourceMaps.length ? prioritizedSourceMaps : sourceMaps)
        .map((map) => ({
          ...map,
          mapUid: resolveMapUid(map),
          campaignName: resolveMapCampaignName(map),
          slot: resolveMapSlot(map),
          downloadUrl: resolveMapDownloadUrl(map),
        }))
        .filter((map) => map.mapUid),
      (map) => map.mapUid.toLowerCase()
    )
      .filter((map) => {
        const requiredSourceKey = toText(sourceKey).toLowerCase();
        if (!requiredSourceKey) return true;
        return classifyNamingSimilaritySource(map) === requiredSourceKey;
      })
      .slice(0, safeLimit);

    return {
      maps,
      targetClubId: effectiveClubId,
      sourceKey: toText(sourceKey).toLowerCase() || null,
      requestedMapUids,
      safeLimit,
    };
  }

  shouldUseExternalNamingSimilarityBackfill({
    q = "",
    mapUids = [],
    rescanAll = false,
    selectedCount = 0,
  } = {}) {
    if (Array.isArray(mapUids) && mapUids.length) return false;
    if (toText(q)) return false;
    if (rescanAll) return true;
    return Number(selectedCount || 0) >= EXTERNAL_NAMING_SIMILARITY_MIN_MAPS;
  }

  buildNamingSimilaritySummaryFromExternalProgress(progress = null) {
    const totals = progress?.totals || {};
    const counters = progress?.counters || {};
    const signatureSummary = progress?.signatureSummary || {};
    return {
      selectedMaps: Number(progress?.selectedMaps || 0),
      emptySelection:
        Number(progress?.selectedMaps || 0) <= 0 &&
        Number(totals?.processed || 0) <= 0,
      targetClubId: Number(progress?.targetClubId || 0) || null,
      rescanAll: Boolean(progress?.rescanAll),
      processed: Number(totals?.processed || 0),
      resolved: Number(totals?.resolved || 0),
      unresolved: Number(totals?.unresolved || 0),
      changedCandidates: Number(totals?.changedCandidates || 0),
      refreshedSimilarityRecords: Number(totals?.refreshedSimilarityRecords || 0),
      upgradedLegacySimilarityRecords: Number(totals?.upgradedLegacySimilarityRecords || 0),
      similarityRowsWritten: Number(totals?.similarityRowsWritten || 0),
      similarityRowsInserted: Number(totals?.similarityRowsInserted || 0),
      similarityRowsUpdated: Number(totals?.similarityRowsUpdated || 0),
      candidateRowsWritten: Number(totals?.candidateRowsWritten || 0),
      candidateRowsInserted: Number(totals?.candidateRowsInserted || 0),
      candidateRowsUpdated: Number(totals?.candidateRowsUpdated || 0),
      autoApprovalProcessed: Number(totals?.processed || 0),
      autoApprovalEligible: Number(totals?.processed || 0),
      autoApproved: Number(totals?.autoApproved || 0),
      missingReferenceFamilies: [],
      recentMaps: Array.isArray(progress?.recentMaps) ? progress.recentMaps : [],
      targetSignatures: {
        total: Number(counters?.targetSignaturesTotal || totals?.processed || 0),
        ready: Number(counters?.targetSignaturesReady || totals?.processed || 0),
        reused: Number(
          signatureSummary?.targets?.reused !== undefined
            ? signatureSummary.targets.reused
            : totals?.targetReused || 0
        ),
        parsed: Number(
          signatureSummary?.targets?.parsed !== undefined
            ? signatureSummary.targets.parsed
            : totals?.targetParsed || 0
        ),
        errors: Number(
          signatureSummary?.targets?.errors !== undefined
            ? signatureSummary.targets.errors
            : totals?.targetErrors || 0
        ),
        missingDownload: Number(
          signatureSummary?.targets?.missingDownload !== undefined
            ? signatureSummary.targets.missingDownload
            : totals?.targetMissingDownload || 0
        ),
      },
      referenceSignatures: {
        total: Number(counters?.referenceSignaturesTotal || 0),
        ready: Number(counters?.referenceSignaturesReady || 0),
        reused: Number(
          signatureSummary?.references?.reused !== undefined
            ? signatureSummary.references.reused
            : totals?.referenceReused || 0
        ),
        parsed: Number(
          signatureSummary?.references?.parsed !== undefined
            ? signatureSummary.references.parsed
            : totals?.referenceParsed || 0
        ),
        errors: Number(
          signatureSummary?.references?.errors !== undefined
            ? signatureSummary.references.errors
            : totals?.referenceErrors || 0
        ),
        missingDownload: Number(
          signatureSummary?.references?.missingDownload !== undefined
            ? signatureSummary.references.missingDownload
            : totals?.referenceMissingDownload || 0
        ),
      },
    };
  }

  readNamingSimilarityBackfillExternalProgress() {
    return readJsonFileSync(this.namingSimilarityBackfill.progressFilePath, null);
  }

  clearNamingSimilarityBackfillExternalArtifacts({ clearMapUidsFile = true } = {}) {
    this.namingSimilarityBackfill.mode = "internal";
    this.namingSimilarityBackfill.childProcess = null;
    this.namingSimilarityBackfill.childPid = null;
    const files = [
      this.namingSimilarityBackfill.progressFilePath,
      clearMapUidsFile ? this.namingSimilarityBackfill.mapUidsFilePath : null,
    ].filter(Boolean);
    for (const filePath of files) {
      try {
        fsSync.unlinkSync(filePath);
      } catch {}
    }
  }

  recoverNamingSimilarityBackfillExternalState() {
    const progress = this.readNamingSimilarityBackfillExternalProgress();
    if (!progress || progress.complete) return null;
    const workerPid = Number(progress?.workerPid || 0) || null;
    this.namingSimilarityBackfill.mode = "external";
    this.namingSimilarityBackfill.currentRunId =
      toText(progress?.runId) || this.namingSimilarityBackfill.currentRunId || null;
    this.namingSimilarityBackfill.currentReason =
      toText(progress?.reason) || this.namingSimilarityBackfill.currentReason || null;
    this.namingSimilarityBackfill.childPid = workerPid;
    this.namingSimilarityBackfill.childProcess = null;
    this.namingSimilarityBackfill.lastStartedAt =
      progress.startedAt || this.namingSimilarityBackfill.lastStartedAt || null;
    this.namingSimilarityBackfill.targetClubId =
      Number(progress?.targetClubId || 0) || this.namingSimilarityBackfill.targetClubId || null;
    this.namingSimilarityBackfill.rescanAll =
      progress.rescanAll === undefined
        ? Boolean(this.namingSimilarityBackfill.rescanAll)
        : Boolean(progress.rescanAll);
    return progress;
  }

  refreshNamingSimilarityBackfillExternalState() {
    if (this.namingSimilarityBackfill.mode !== "external") {
      const recovered = this.recoverNamingSimilarityBackfillExternalState();
      if (!recovered) return null;
    }
    const progress = this.readNamingSimilarityBackfillExternalProgress();
    const workerPid = Number(progress?.workerPid || this.namingSimilarityBackfill.childPid || 0) || null;
    if (workerPid) {
      this.namingSimilarityBackfill.childPid = workerPid;
    }
    const childAlive = isProcessAlive(this.namingSimilarityBackfill.childPid);
    const progressHasWorkerPid = Number(progress?.workerPid || 0) > 0;
    const progressClaimsRunning =
      Boolean(progress) &&
      !Boolean(progress?.complete) &&
      (Boolean(progress?.running) || toText(progress?.status).toLowerCase() === "running");
    const progressRecentlyUpdated = isRecentIsoWithin(
      progress?.updatedAt || progress?.startedAt,
      EXTERNAL_NAMING_SIMILARITY_RUNNING_GRACE_MS
    );
    const shouldTreatExternalWorkerAsRunning =
      Boolean(progress) &&
      !Boolean(progress?.complete) &&
      (childAlive || (!progressHasWorkerPid && progressClaimsRunning && progressRecentlyUpdated));
    if (progress && !progress.complete && !shouldTreatExternalWorkerAsRunning) {
      const finishedAt = new Date().toISOString();
      const staleMessage = childAlive
        ? "Similarity resolver worker progress became invalid before completion."
        : "Similarity resolver worker stopped before reporting completion.";
      writeJsonFileSync(this.namingSimilarityBackfill.progressFilePath, {
        ...progress,
        updatedAt: finishedAt,
        finishedAt,
        running: false,
        status: "error",
        complete: true,
        error: toText(progress?.error) || staleMessage,
      });
      return this.refreshNamingSimilarityBackfillExternalState();
    }
    if (!progress && !childAlive && this.namingSimilarityBackfill.currentRunId) {
      const finishedAt = new Date().toISOString();
      this.namingSimilarityBackfill.running = false;
      this.namingSimilarityBackfill.lastFinishedAt = finishedAt;
      this.namingSimilarityBackfill.lastDurationMs = Math.max(
        0,
        Date.parse(finishedAt) - Date.parse(this.namingSimilarityBackfill.lastStartedAt || finishedAt)
      );
      this.namingSimilarityBackfill.lastError =
        this.namingSimilarityBackfill.lastError ||
        "Similarity resolver worker stopped before reporting progress.";
      this.namingSimilarityBackfill.currentReason = null;
      this.namingSimilarityBackfill.currentRunId = null;
      this.namingSimilarityBackfill.childProcess = null;
      this.namingSimilarityBackfill.childPid = null;
      return null;
    }
    const totals = progress?.totals || {};
    const processed = Number(totals?.processed || 0);
    const selectedMaps = Number(progress?.selectedMaps || 0);
    const currentBatch = progress?.currentBatch && typeof progress.currentBatch === "object"
      ? progress.currentBatch
      : null;
    const currentBatchIndex = clampInt(currentBatch?.index, {
      min: 1,
      max: Math.max(1, Number(progress?.batchesTotal || 1)),
      fallback: 1,
    });
    const currentBatchSize = clampInt(currentBatch?.size, {
      min: 0,
      max: selectedMaps || Number(currentBatch?.size || 0) || 0,
      fallback: 0,
    });
    const currentBatchStart = currentBatchSize
      ? Math.max(1, (currentBatchIndex - 1) * Number(progress?.batchSize || currentBatchSize) + 1)
      : null;
    const currentBatchEnd = currentBatchSize && currentBatchStart
      ? Math.min(selectedMaps || currentBatchStart + currentBatchSize - 1, currentBatchStart + currentBatchSize - 1)
      : null;
    const percent =
      progress?.complete
        ? 100
        : progress?.percent !== undefined && progress?.percent !== null
          ? clampInt(progress.percent, {
              min: 0,
              max: 100,
              fallback: 0,
            })
        : selectedMaps > 0
          ? clampInt(Math.round((processed / selectedMaps) * 100), {
              min: 0,
              max: 100,
              fallback: 0,
            })
          : 0;

    if (progress) {
      this.namingSimilarityBackfill.lastStartedAt =
        progress.startedAt || this.namingSimilarityBackfill.lastStartedAt;
      this.namingSimilarityBackfill.targetClubId =
        Number(progress.targetClubId || 0) || this.namingSimilarityBackfill.targetClubId || null;
      this.namingSimilarityBackfill.rescanAll =
        progress.rescanAll === undefined
          ? Boolean(this.namingSimilarityBackfill.rescanAll)
          : Boolean(progress.rescanAll);
      this.namingSimilarityBackfill.currentProgress = {
        status:
          progress.status === "error"
            ? "error"
            : progress.complete
              ? "ok"
              : "running",
        stage:
          toText(progress?.stage) ||
          (progress.status === "error"
            ? "failed"
            : progress.complete
              ? "complete"
              : "external-worker"),
        message:
          toText(progress?.error) ||
          (
            toText(progress?.stage) === "signatures-targets" &&
            currentBatchStart &&
            currentBatchEnd
              ? `Ensuring content signatures for target maps ${currentBatchStart}-${currentBatchEnd} of ${selectedMaps}...`
              : toText(progress?.stage) === "matching" && selectedMaps > 0
                ? `Compared ${processed} of ${selectedMaps} maps...`
                : ""
          ) ||
          toText(progress?.message) ||
          (progress.complete
            ? `Similarity backfill complete. ${processed} processed, ${Number(
                totals?.resolved || 0
              )} resolved, ${Number(totals?.refreshedSimilarityRecords || 0)} refreshed.`
            : progress?.currentBatch
              ? `Background similarity worker batch ${Number(
                  progress.currentBatch.index || 0
                )}/${Number(progress.currentBatch.total || 0)} running...`
              : "Background similarity backfill running..."),
        percent,
        updatedAt: progress.updatedAt || new Date().toISOString(),
        counters: {
          ...(progress?.counters && typeof progress.counters === "object" ? progress.counters : {}),
          total: selectedMaps,
          processed,
          resolved: Number(
            progress?.counters?.resolved !== undefined
              ? progress.counters.resolved
              : totals?.resolved || 0
          ),
          unresolved: Number(
            progress?.counters?.unresolved !== undefined
              ? progress.counters.unresolved
              : totals?.unresolved || 0
          ),
          changedCandidates: Number(
            progress?.counters?.changedCandidates !== undefined
              ? progress.counters.changedCandidates
              : totals?.changedCandidates || 0
          ),
          refreshedSimilarityRecords: Number(
            progress?.counters?.refreshedSimilarityRecords !== undefined
              ? progress.counters.refreshedSimilarityRecords
              : totals?.refreshedSimilarityRecords || 0
          ),
          upgradedLegacySimilarityRecords: Number(
            progress?.counters?.upgradedLegacySimilarityRecords !== undefined
              ? progress.counters.upgradedLegacySimilarityRecords
              : totals?.upgradedLegacySimilarityRecords || 0
          ),
          similarityRowsWritten: Number(
            progress?.counters?.similarityRowsWritten !== undefined
              ? progress.counters.similarityRowsWritten
              : totals?.similarityRowsWritten || 0
          ),
          candidateRowsWritten: Number(
            progress?.counters?.candidateRowsWritten !== undefined
              ? progress.counters.candidateRowsWritten
              : totals?.candidateRowsWritten || 0
          ),
          autoApproved: Number(
            progress?.counters?.autoApproved !== undefined
              ? progress.counters.autoApproved
              : totals?.autoApproved || 0
          ),
        },
        currentBatch: progress.currentBatch || null,
        elapsedSeconds: Number(progress.elapsedSeconds || 0),
        targetClubId: Number(progress.targetClubId || 0) || null,
        rescanAll: Boolean(progress.rescanAll),
        currentMapUid: toText(progress?.currentMapUid) || null,
        currentMapName: toText(progress?.currentMapName) || "",
        recentMaps: Array.isArray(progress?.recentMaps) ? progress.recentMaps : [],
        logFile: toText(progress?.logFile) || null,
        signatureSummary:
          progress?.signatureSummary && typeof progress.signatureSummary === "object"
            ? progress.signatureSummary
            : null,
      };
    }

    this.namingSimilarityBackfill.running = shouldTreatExternalWorkerAsRunning;
    if (
      progress?.complete ||
      (!shouldTreatExternalWorkerAsRunning && this.namingSimilarityBackfill.currentRunId)
    ) {
      this.namingSimilarityBackfill.lastFinishedAt =
        progress?.finishedAt || this.namingSimilarityBackfill.lastFinishedAt || new Date().toISOString();
      const elapsedSeconds = Number(progress?.elapsedSeconds || 0);
      this.namingSimilarityBackfill.lastDurationMs =
        elapsedSeconds > 0
          ? elapsedSeconds * 1000
          : this.namingSimilarityBackfill.lastDurationMs;
      this.namingSimilarityBackfill.lastError = toText(progress?.error) || null;
      this.namingSimilarityBackfill.lastSummary = progress
        ? this.buildNamingSimilaritySummaryFromExternalProgress(progress)
        : this.namingSimilarityBackfill.lastSummary;
      this.namingSimilarityBackfill.currentReason = null;
      this.namingSimilarityBackfill.currentPromise = null;
      this.namingSimilarityBackfill.childPid = childAlive ? this.namingSimilarityBackfill.childPid : null;
      this.namingSimilarityBackfill.childProcess = childAlive
        ? this.namingSimilarityBackfill.childProcess
        : null;
      if (!childAlive) {
        this.namingSimilarityBackfill.currentRunId = null;
      }
    }

    return progress;
  }

  launchExternalNamingSimilarityBackfill({
    runId,
    reason = "manual-admin",
    mapUids = [],
    clubId = null,
    rescanAll = false,
    force = false,
    persistCandidates = true,
  } = {}) {
    const safeMapUids = normalizeUniqueStrings(mapUids);
    const batchSize = EXTERNAL_NAMING_SIMILARITY_BATCH_SIZE;
    const startedAt = new Date().toISOString();
    const logFilePath = path.join(
      this.mapCopy.dataDir,
      "tmp",
      `similarity-resolver-${sanitizeFileComponent(runId, "current")}.log`
    );
    writeJsonFileSync(this.namingSimilarityBackfill.mapUidsFilePath, safeMapUids);
    writeJsonFileSync(this.namingSimilarityBackfill.progressFilePath, {
      runId,
      reason,
      startedAt,
      updatedAt: startedAt,
      dbFile: null,
      dataDir: this.mapCopy.dataDir,
      logFile: logFilePath,
      totalMaps: safeMapUids.length,
      startOffset: 0,
      nextOffset: 0,
      batchSize,
      batchesCompleted: 0,
      batchesTotal: Math.ceil(safeMapUids.length / Math.max(1, batchSize)),
      selectedMaps: safeMapUids.length,
      targetClubId: Number(clubId || 0) || null,
      rescanAll: Boolean(rescanAll),
      persistCandidates: Boolean(persistCandidates),
      force: Boolean(force),
      totals: {
        processed: 0,
        resolved: 0,
        unresolved: 0,
        changedCandidates: 0,
        refreshedSimilarityRecords: 0,
        upgradedLegacySimilarityRecords: 0,
        similarityRowsWritten: 0,
        similarityRowsInserted: 0,
        similarityRowsUpdated: 0,
        candidateRowsWritten: 0,
        candidateRowsInserted: 0,
        candidateRowsUpdated: 0,
        autoApproved: 0,
        targetReused: 0,
        targetParsed: 0,
        targetErrors: 0,
        targetMissingDownload: 0,
        referenceReused: 0,
        referenceParsed: 0,
        referenceErrors: 0,
        referenceMissingDownload: 0,
      },
      currentBatch: null,
      running: true,
      status: "running",
      elapsedSeconds: 0,
      complete: false,
    });

    const args = [
      NAMING_SIMILARITY_RESOLVER_SCRIPT_PATH,
      "--map-uids-file",
      this.namingSimilarityBackfill.mapUidsFilePath,
      "--progress-file",
      this.namingSimilarityBackfill.progressFilePath,
      "--batch-size",
      String(batchSize),
      "--log-file",
      logFilePath,
      "--run-id",
      runId,
      "--reason",
      reason,
      "--persist-candidates",
      persistCandidates ? "1" : "0",
      "--force",
      force ? "1" : "0",
    ];
    if (Number(clubId || 0) > 0) {
      args.push("--club-id", String(Number(clubId)));
    }
    if (rescanAll) {
      args.push("--rescan-all", "1");
    }

    let logFd = null;
    let child = null;
    try {
      fsSync.mkdirSync(path.dirname(logFilePath), { recursive: true });
      logFd = fsSync.openSync(logFilePath, "a");
      child = spawn(process.execPath, args, {
        cwd: path.resolve(path.dirname(NAMING_SIMILARITY_RESOLVER_SCRIPT_PATH), ".."),
        stdio: ["ignore", logFd, logFd],
        windowsHide: true,
        detached: true,
      });
    } finally {
      if (logFd !== null) {
        try {
          fsSync.closeSync(logFd);
        } catch {}
      }
    }
    child.unref();

    this.namingSimilarityBackfill.mode = "external";
    this.namingSimilarityBackfill.running = true;
    this.namingSimilarityBackfill.currentRunId = runId;
    this.namingSimilarityBackfill.currentReason = toText(reason) || "manual-admin";
    this.namingSimilarityBackfill.lastStartedAt = startedAt;
    this.namingSimilarityBackfill.lastFinishedAt = null;
    this.namingSimilarityBackfill.lastDurationMs = null;
    this.namingSimilarityBackfill.lastError = null;
    this.namingSimilarityBackfill.lastSummary = null;
    this.namingSimilarityBackfill.childProcess = child;
    this.namingSimilarityBackfill.childPid = Number(child.pid || 0) || null;
    this.namingSimilarityBackfill.targetClubId = Number(clubId || 0) || null;
    this.namingSimilarityBackfill.rescanAll = Boolean(rescanAll);
    this.refreshNamingSimilarityBackfillExternalState();

    const finalizeExternalState = () => {
      this.namingSimilarityBackfill.childProcess = null;
      this.namingSimilarityBackfill.childPid = null;
      this.refreshNamingSimilarityBackfillExternalState();
    };

    child.on("exit", finalizeExternalState);
    child.on("error", (error) => {
      writeJsonFileSync(this.namingSimilarityBackfill.progressFilePath, {
        ...(this.readNamingSimilarityBackfillExternalProgress() || {}),
        updatedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        running: false,
        status: "error",
        complete: true,
        error: error?.message || "Failed to launch similarity resolver worker.",
      });
      finalizeExternalState();
    });
  }

  getNamingSimilarityBackfillStatus() {
    this.refreshNamingSimilarityBackfillExternalState();
    return {
      running: Boolean(this.namingSimilarityBackfill.running),
      runCounter: Number(this.namingSimilarityBackfill.runCounter || 0),
      currentRunId: this.namingSimilarityBackfill.currentRunId || null,
      currentReason: this.namingSimilarityBackfill.currentReason || null,
      progress: this.namingSimilarityBackfill.currentProgress || null,
      lastStartedAt: this.namingSimilarityBackfill.lastStartedAt,
      lastFinishedAt: this.namingSimilarityBackfill.lastFinishedAt,
      lastDurationMs: this.namingSimilarityBackfill.lastDurationMs,
      lastError: this.namingSimilarityBackfill.lastError,
      lastSummary: this.namingSimilarityBackfill.lastSummary,
    };
  }

  cancelNamingSimilarityBackfill({ reason = "admin-cancel" } = {}) {
    this.refreshNamingSimilarityBackfillExternalState();

    const progress = this.readNamingSimilarityBackfillExternalProgress();
    const hasProgress = Boolean(progress) && typeof progress === "object";
    const alreadyComplete = Boolean(progress?.complete);
    if (!this.namingSimilarityBackfill.running && (!hasProgress || alreadyComplete)) {
      return {
        ok: true,
        canceled: false,
        alreadyStopped: true,
        status: this.getNamingSimilarityBackfillStatus(),
      };
    }

    const workerPid = Number(progress?.workerPid || this.namingSimilarityBackfill.childPid || 0) || null;
    const finishedAt = new Date().toISOString();
    let killed = false;
    let killError = null;

    if (workerPid && isProcessAlive(workerPid)) {
      const killResult = killProcessTree(workerPid);
      killed = Boolean(killResult?.killed);
      killError = toText(killResult?.error) || null;
    }

    writeJsonFileSync(this.namingSimilarityBackfill.progressFilePath, {
      ...(progress || {}),
      runId: toText(progress?.runId) || this.namingSimilarityBackfill.currentRunId || null,
      workerPid: workerPid || Number(progress?.workerPid || 0) || null,
      updatedAt: finishedAt,
      finishedAt,
      running: false,
      status: "canceled",
      stage: "canceled",
      message: toText(reason) ? `Canceled: ${toText(reason)}` : "Canceled by admin.",
      cancelReason: toText(reason) || null,
      complete: true,
    });

    this.namingSimilarityBackfill.mode = "external";
    this.namingSimilarityBackfill.running = false;
    this.namingSimilarityBackfill.currentPromise = null;
    this.namingSimilarityBackfill.childProcess = null;
    this.namingSimilarityBackfill.childPid = null;
    this.namingSimilarityBackfill.currentReason = null;
    this.namingSimilarityBackfill.currentRunId = null;
    this.refreshNamingSimilarityBackfillExternalState();

    return {
      ok: true,
      canceled: true,
      workerPid,
      killed,
      killError,
      status: this.getNamingSimilarityBackfillStatus(),
    };
  }

  updateNamingSimilarityBackfillProgress(partial = {}) {
    const previous = this.namingSimilarityBackfill.currentProgress || {};
    const nextCounters =
      partial.replaceCounters === true
        ? { ...(partial.counters || {}) }
        : { ...(previous.counters || {}), ...(partial.counters || {}) };
    this.namingSimilarityBackfill.currentProgress = {
      ...previous,
      ...partial,
      counters: nextCounters,
      updatedAt: new Date().toISOString(),
    };
    delete this.namingSimilarityBackfill.currentProgress.replaceCounters;
    if (
      this.namingSimilarityBackfill.currentProgress.percent !== undefined &&
      this.namingSimilarityBackfill.currentProgress.percent !== null
    ) {
      this.namingSimilarityBackfill.currentProgress.percent = clampInt(
        this.namingSimilarityBackfill.currentProgress.percent,
        {
          min: 0,
          max: 100,
          fallback: 0,
        }
      );
    }
    return this.namingSimilarityBackfill.currentProgress;
  }

  startNamingSimilarityBackfill({
    q = "",
    limit = 120000,
    mapUids = [],
    clubId = null,
    sourceKey = "",
    reviewState = "",
    force = false,
    rescanAll = false,
    persistCandidates = true,
    reason = "manual-admin",
  } = {}) {
    this.refreshNamingSimilarityBackfillExternalState();
    if (this.namingSimilarityBackfill.running) {
      return {
        ok: true,
        started: false,
        alreadyRunning: true,
        runId: this.namingSimilarityBackfill.currentRunId || null,
        status: this.getNamingSimilarityBackfillStatus(),
      };
    }
    this.clearNamingSimilarityBackfillExternalArtifacts();

    const buildRunSummary = (result = {}) => ({
      selectedMaps: Number(result?.selectedMaps || result?.processed || 0),
      emptySelection: Boolean(result?.emptySelection),
      targetClubId: Number(result?.targetClubId || 0) || null,
      rescanAll: Boolean(result?.rescanAll),
      processed: Number(result?.processed || 0),
      resolved: Number(result?.resolved || 0),
      unresolved: Number(result?.unresolved || 0),
      changedCandidates: Number(result?.changedCandidates || 0),
      refreshedSimilarityRecords: Number(result?.refreshedSimilarityRecords || 0),
      upgradedLegacySimilarityRecords: Number(result?.upgradedLegacySimilarityRecords || 0),
      similarityRowsWritten: Number(result?.similarityUpsert?.processed || 0),
      similarityRowsInserted: Number(result?.similarityUpsert?.inserted || 0),
      similarityRowsUpdated: Number(result?.similarityUpsert?.updated || 0),
      candidateRowsWritten: Number(result?.candidateUpsert?.processed || 0),
      candidateRowsInserted: Number(result?.candidateUpsert?.inserted || 0),
      candidateRowsUpdated: Number(result?.candidateUpsert?.updated || 0),
      autoApprovalProcessed: Number(result?.approvals?.processed || 0),
      autoApprovalEligible: Number(result?.approvals?.eligible || 0),
      autoApproved: Number(result?.approvals?.approved || 0),
      missingReferenceFamilies: Array.isArray(result?.missingReferenceFamilies)
        ? result.missingReferenceFamilies
        : [],
      recentMaps: Array.isArray(result?.recentMaps) ? result.recentMaps : [],
      targetSignatures: result?.signatures?.targets || null,
      referenceSignatures: result?.signatures?.references || null,
    });
    const buildRunCounters = (result = {}) => ({
      total: Number(result?.processed || 0),
      processed: Number(result?.processed || 0),
      resolved: Number(result?.resolved || 0),
      unresolved: Number(result?.unresolved || 0),
      changedCandidates: Number(result?.changedCandidates || 0),
      refreshedSimilarityRecords: Number(result?.refreshedSimilarityRecords || 0),
      upgradedLegacySimilarityRecords: Number(result?.upgradedLegacySimilarityRecords || 0),
      similarityRowsWritten: Number(result?.similarityUpsert?.processed || 0),
      candidateRowsWritten: Number(result?.candidateUpsert?.processed || 0),
      autoApproved: Number(result?.approvals?.approved || 0),
    });

    const runId = `naming-similarity-${Date.now()}-${this.namingSimilarityBackfill.runCounter + 1}`;
    const startedAt = new Date().toISOString();
    this.namingSimilarityBackfill.runCounter += 1;
    this.updateNamingSimilarityBackfillProgress({
      status: "running",
      stage: "preparing",
      message: "Preparing similarity backfill...",
      percent: 0,
      replaceCounters: true,
      counters: {
        total: 0,
        processed: 0,
        resolved: 0,
        unresolved: 0,
        changedCandidates: 0,
      },
    });

    const targetSelection = this.buildNamingSimilarityBackfillTargets({
      q,
      limit,
      mapUids,
      clubId,
      sourceKey,
      reviewState,
      rescanAll,
    });
    const selectedMapUids = targetSelection.maps.map((map) => map.mapUid);
    if (!selectedMapUids.length) {
      this.namingSimilarityBackfill.mode = "internal";
      this.namingSimilarityBackfill.running = false;
      this.namingSimilarityBackfill.currentRunId = null;
      this.namingSimilarityBackfill.currentReason = null;
      this.namingSimilarityBackfill.lastStartedAt = startedAt;
      this.namingSimilarityBackfill.lastFinishedAt = startedAt;
      this.namingSimilarityBackfill.lastDurationMs = 0;
      this.namingSimilarityBackfill.lastError = null;
      this.namingSimilarityBackfill.lastSummary = {
        selectedMaps: 0,
        emptySelection: true,
        targetClubId: Number(targetSelection.targetClubId || 0) || null,
        rescanAll: Boolean(rescanAll),
        processed: 0,
        resolved: 0,
        unresolved: 0,
        changedCandidates: 0,
        refreshedSimilarityRecords: 0,
        upgradedLegacySimilarityRecords: 0,
        similarityRowsWritten: 0,
        similarityRowsInserted: 0,
        similarityRowsUpdated: 0,
        candidateRowsWritten: 0,
        candidateRowsInserted: 0,
        candidateRowsUpdated: 0,
        autoApprovalProcessed: 0,
        autoApprovalEligible: 0,
        autoApproved: 0,
        missingReferenceFamilies: [],
        recentMaps: [],
        targetSignatures: null,
        referenceSignatures: null,
      };
      this.updateNamingSimilarityBackfillProgress({
        status: "ok",
        stage: "complete",
        message: "No maps matched the current filter.",
        percent: 0,
        replaceCounters: true,
        counters: {
          total: 0,
          processed: 0,
          resolved: 0,
          unresolved: 0,
          changedCandidates: 0,
        },
        emptySelection: true,
      });
      return {
        ok: true,
        started: false,
        status: this.getNamingSimilarityBackfillStatus(),
      };
    }

    if (
      this.shouldUseExternalNamingSimilarityBackfill({
        q,
        mapUids,
        rescanAll,
        selectedCount: selectedMapUids.length,
      })
    ) {
      this.launchExternalNamingSimilarityBackfill({
        runId,
        reason,
        mapUids: selectedMapUids,
        clubId: targetSelection.targetClubId,
        rescanAll,
        force,
        persistCandidates,
      });
      return {
        ok: true,
        started: true,
        runId,
        status: this.getNamingSimilarityBackfillStatus(),
      };
    }

    this.namingSimilarityBackfill.mode = "internal";
    this.namingSimilarityBackfill.running = true;
    this.namingSimilarityBackfill.currentRunId = runId;
    this.namingSimilarityBackfill.currentReason = toText(reason) || "manual-admin";
    this.namingSimilarityBackfill.lastStartedAt = startedAt;
    this.namingSimilarityBackfill.lastFinishedAt = null;
    this.namingSimilarityBackfill.lastDurationMs = null;
    this.namingSimilarityBackfill.lastError = null;
    this.namingSimilarityBackfill.lastSummary = null;

    const runPromise = (async () => {
      try {
        const result = await this.assignStoredMapNumbersBySimilarity({
          q,
          limit,
          mapUids,
          clubId,
          force,
          rescanAll,
          persistCandidates,
          onProgress: (partial) => {
            this.updateNamingSimilarityBackfillProgress(partial);
          },
        });

        const finishedAt = new Date().toISOString();
        const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
        this.namingSimilarityBackfill.lastFinishedAt = finishedAt;
        this.namingSimilarityBackfill.lastDurationMs = durationMs;

        if (result?.error || result?.ok === false) {
          const message =
            result?.error ||
            result?.candidateUpsert?.error ||
            result?.similarityUpsert?.error ||
            "Similarity backfill failed.";
          const runSummary = buildRunSummary(result);
          this.namingSimilarityBackfill.lastError = message;
          if (
            runSummary.processed > 0 ||
            runSummary.similarityRowsWritten > 0 ||
            runSummary.candidateRowsWritten > 0 ||
            runSummary.autoApprovalProcessed > 0 ||
            runSummary.recentMaps.length
          ) {
            this.namingSimilarityBackfill.lastSummary = runSummary;
          }
          this.updateNamingSimilarityBackfillProgress({
            status: "error",
            stage: "failed",
            message,
            percent: 100,
            replaceCounters: true,
            counters: buildRunCounters(result),
            recentMaps: runSummary.recentMaps,
            signatureSummary: {
              targets: runSummary.targetSignatures,
              references: runSummary.referenceSignatures,
            },
          });
          return;
        }

        const runSummary = buildRunSummary(result);
        this.namingSimilarityBackfill.lastSummary = runSummary;
        this.updateNamingSimilarityBackfillProgress({
          status: "ok",
          stage: "complete",
          message:
            Number(result?.processed || 0) > 0
              ? `Similarity backfill complete. ${Number(result?.resolved || 0)} resolved, ${Number(result?.refreshedSimilarityRecords || 0)} refreshed, ${Number(result?.upgradedLegacySimilarityRecords || 0)} upgraded.`
              : "Similarity backfill complete. No maps required updates.",
          percent: 100,
          replaceCounters: true,
          counters: buildRunCounters(result),
          recentMaps: runSummary.recentMaps,
          signatureSummary: {
            targets: runSummary.targetSignatures,
            references: runSummary.referenceSignatures,
          },
        });
      } catch (error) {
        const finishedAt = new Date().toISOString();
        const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
        const message = error?.message || "Similarity backfill failed.";
        this.namingSimilarityBackfill.lastError = message;
        this.namingSimilarityBackfill.lastFinishedAt = finishedAt;
        this.namingSimilarityBackfill.lastDurationMs = durationMs;
        this.updateNamingSimilarityBackfillProgress({
          status: "error",
          stage: "failed",
          message,
          percent: 100,
        });
        this.logger.warn(`[altered-similarity-backfill] ${message}`);
      } finally {
        this.namingSimilarityBackfill.running = false;
        this.namingSimilarityBackfill.currentRunId = null;
        this.namingSimilarityBackfill.currentReason = null;
        this.namingSimilarityBackfill.currentPromise = null;
      }
    })();

    this.namingSimilarityBackfill.currentPromise = runPromise;
    return {
      ok: true,
      started: true,
      runId,
      status: this.getNamingSimilarityBackfillStatus(),
    };
  }

  buildMapsForLocalCopyBackfill({ mapUids = [], retryErrorsOnly = false } = {}) {
    let sourceMapUids = Array.isArray(mapUids) ? mapUids.filter(Boolean) : [];
    if (!sourceMapUids.length && retryErrorsOnly) {
      sourceMapUids = typeof this.repository?.listMapUidsForLocalFileStatus === "function"
        ? this.repository.listMapUidsForLocalFileStatus({ statuses: ["error"], limit: 50000 })
        : [];
      if (!sourceMapUids.length) return [];
    }
    const maps = this.repository.listMapsForNameStandardization({
      limit: 120000,
      mapUids: sourceMapUids,
      includePayload: false,
    });
    return uniqueBy(
      maps
        .map((map) => ({
          ...map,
          mapUid: resolveMapUid(map),
          campaignName: resolveMapCampaignName(map),
          slot: resolveMapSlot(map) || 9999,
        }))
        .filter((map) => map.mapUid)
        .sort((left, right) => {
          const leftFamily = buildCampaignFamily(left.campaignName);
          const rightFamily = buildCampaignFamily(right.campaignName);
          if (Boolean(leftFamily.isReferenceLike) !== Boolean(rightFamily.isReferenceLike)) {
            return leftFamily.isReferenceLike ? -1 : 1;
          }
          const campaignDiff = String(left.campaignName || "").localeCompare(
            String(right.campaignName || ""),
            undefined,
            { sensitivity: "base" }
          );
          if (campaignDiff !== 0) return campaignDiff;
          const slotDiff = Number(left.slot || 9999) - Number(right.slot || 9999);
          if (slotDiff !== 0) return slotDiff;
          return String(left.name || "").localeCompare(String(right.name || ""), undefined, {
            sensitivity: "base",
          });
        }),
      (map) => map.mapUid.toLowerCase()
    );
  }

  applyAutoApprovalFromSimilarity({ mapUids = [] } = {}) {
    const similarityByUid = new Map(
      this.repository.getMapNumberSimilarity({ mapUids }).map((item) => [
        String(item.mapUid || "").toLowerCase(),
        item,
      ])
    );
    const signatureByUid = new Map(
      this.repository.getMapContentSignatures({ mapUids }).map((item) => [
        String(item.mapUid || "").toLowerCase(),
        item,
      ])
    );
    const eligibleMapUids = [];
    for (const rawMapUid of Array.isArray(mapUids) ? mapUids : []) {
      const mapUid = toText(rawMapUid);
      if (!mapUid) continue;
      const similarity = similarityByUid.get(mapUid.toLowerCase()) || null;
      const signature = signatureByUid.get(mapUid.toLowerCase()) || null;
      const decision = evaluateSimilarityAutoApproval({
        similarity,
        signatureStatus: signature?.sourceStatus || "",
        assignedMapNumbers: similarity?.assignedMapNumbers || [],
      });
      if (decision.eligible) {
        eligibleMapUids.push(mapUid);
      }
    }
    const reviewNote = "Auto-approved by local map-copy similarity backfill.";
    const approval = this.repository.bulkApproveMapNameCandidates({
      mapUids: eligibleMapUids,
      reviewNote,
    });
    return {
      processed: Array.isArray(mapUids) ? mapUids.length : 0,
      eligible: eligibleMapUids.length,
      approved: Number(approval?.approved || 0),
      mapUids: eligibleMapUids,
    };
  }

  async runMapLocalCopyBackfill({
    reason = "manual-admin",
    force = false,
    retryErrorsOnly = false,
    mapUids = [],
  } = {}) {
    if (this.mapCopy.running) {
      return {
        skipped: true,
        reason: "map-local-copy-backfill already running",
      };
    }

    const maps = this.buildMapsForLocalCopyBackfill({
      mapUids,
      retryErrorsOnly,
    });
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const runId = `map-copy:${startedMs}`;
    this.mapCopy.running = true;
    this.mapCopy.runCounter += 1;
    this.mapCopy.currentRunId = runId;
    this.mapCopy.currentReason = reason;
    this.mapCopy.lastStartedAt = startedAt;
    this.mapCopy.lastError = null;
    this.mapCopy.lastFinishedAt = null;
    this.mapCopy.lastDurationMs = null;
    this.updateMapCopyProgress({
      runId,
      reason,
      phase: "prepare",
      status: "running",
      percent: 0,
      startedAt,
      counters: {
        totalMaps: maps.length,
        processedMaps: 0,
        approvedMaps: 0,
      },
      replaceCounters: true,
    });

    try {
      const batches = chunk(maps, this.mapCopy.batchSize);
      const summary = {
        totalMaps: maps.length,
        processedMaps: 0,
        resolvedMaps: 0,
        unresolvedMaps: 0,
        changedCandidates: 0,
        approvedMaps: 0,
        targetDownloads: 0,
        targetReused: 0,
        targetErrors: 0,
        targetMissing: 0,
        referenceDownloads: 0,
        referenceReused: 0,
        referenceErrors: 0,
        referenceMissing: 0,
      };

      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const batchUids = batch.map((map) => map.mapUid);
        this.updateMapCopyProgress({
          runId,
          reason,
          phase: "batch",
          status: "running",
          percent: Math.floor((index / Math.max(1, batches.length)) * 100),
          counters: {
            batchIndex: index + 1,
            batchTotal: batches.length,
            batchSize: batch.length,
            processedMaps: summary.processedMaps,
          },
        });

        const similarity = await this.assignStoredMapNumbersBySimilarity({
          mapUids: batchUids,
          limit: Math.max(batchUids.length, 1),
          force,
          persistCandidates: true,
        });

        summary.processedMaps += batch.length;
        summary.resolvedMaps += Number(similarity.resolved || 0);
        summary.unresolvedMaps += Number(similarity.unresolved || 0);
        summary.changedCandidates += Number(similarity.changedCandidates || 0);
        summary.approvedMaps += Number(similarity.approvals?.approved || 0);
        summary.targetDownloads += Number(similarity.signatures?.targets?.localFiles?.downloaded || 0);
        summary.targetReused += Number(similarity.signatures?.targets?.localFiles?.reused || 0);
        summary.targetErrors += Number(similarity.signatures?.targets?.localFiles?.errors || 0);
        summary.targetMissing += Number(similarity.signatures?.targets?.localFiles?.missing || 0);
        summary.referenceDownloads += Number(similarity.signatures?.references?.localFiles?.downloaded || 0);
        summary.referenceReused += Number(similarity.signatures?.references?.localFiles?.reused || 0);
        summary.referenceErrors += Number(similarity.signatures?.references?.localFiles?.errors || 0);
        summary.referenceMissing += Number(similarity.signatures?.references?.localFiles?.missing || 0);

        this.updateMapCopyProgress({
          runId,
          reason,
          phase: "batch",
          status: "running",
          percent: Math.floor(((index + 1) / Math.max(1, batches.length)) * 100),
          counters: {
            ...summary,
            batchIndex: index + 1,
            batchTotal: batches.length,
            batchSize: batch.length,
          },
          replaceCounters: true,
        });
      }

      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.now() - startedMs);
      this.mapCopy.lastFinishedAt = finishedAt;
      this.mapCopy.lastDurationMs = durationMs;
      this.mapCopy.lastSummary = summary;
      this.updateMapCopyProgress({
        runId,
        reason,
        phase: "complete",
        status: "ok",
        percent: 100,
        finishedAt,
        durationMs,
        counters: {
          ...summary,
          durationMs,
        },
        replaceCounters: true,
      });
      return {
        ok: true,
        runId,
        summary,
      };
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.now() - startedMs);
      const message = error?.message || "Map local-copy backfill failed.";
      this.mapCopy.lastError = message;
      this.mapCopy.lastFinishedAt = finishedAt;
      this.mapCopy.lastDurationMs = durationMs;
      this.updateMapCopyProgress({
        runId,
        reason,
        phase: "failed",
        status: "error",
        finishedAt,
        durationMs,
        error: message,
      });
      return {
        error: message,
      };
    } finally {
      this.mapCopy.running = false;
      this.mapCopy.currentRunId = null;
      this.mapCopy.currentReason = null;
    }
  }

  startMapLocalCopyBackfillOnBoot() {
    if (!this.mapCopy.enabled) return false;
    const status = this.getMapLocalStoreStatus();
    if (status.initialized || this.mapCopy.running) return false;
    const pendingMapUids =
      typeof this.repository?.listMapUidsNeedingLocalStoreBackfill === "function"
        ? this.repository.listMapUidsNeedingLocalStoreBackfill({ limit: 50000 })
        : [];
    if (!pendingMapUids.length) return false;
    if (pendingMapUids.length > DEFAULT_MAP_COPY_BOOT_AUTO_START_MAX_PENDING) {
      this.logger.warn(
        `[altered-map-copy] startup backfill skipped: ${pendingMapUids.length} pending maps exceeds safe auto-start threshold ${DEFAULT_MAP_COPY_BOOT_AUTO_START_MAX_PENDING}. Run it from admin when needed.`
      );
      return false;
    }
    this.runMapLocalCopyBackfill({
      reason: "startup-incomplete-backfill",
      force: false,
      retryErrorsOnly: false,
      mapUids: pendingMapUids,
    }).catch((error) => {
      this.logger.warn(`[altered-map-copy] startup backfill failed: ${error?.message || error}`);
    });
    return true;
  }

  async ensureMapLocalFiles(maps = [], { force = false } = {}) {
    const normalizedMaps = uniqueBy(
      (Array.isArray(maps) ? maps : [])
        .map((map) => ({
          ...map,
          mapUid: resolveMapUid(map),
          downloadUrl: resolveMapDownloadUrl(map),
          relativePath: buildLocalMapRelativePath(resolveMapUid(map)),
        }))
        .filter((map) => map.mapUid),
      (map) => map.mapUid.toLowerCase()
    );
    if (!normalizedMaps.length) {
      return {
        records: [],
        summary: {
          total: 0,
          reused: 0,
          downloaded: 0,
          missing: 0,
          errors: 0,
        },
      };
    }

    await fs.mkdir(this.mapCopy.rootDir, { recursive: true });
    const existingByUid = new Map(
      this.repository.getMapLocalFiles({
        mapUids: normalizedMaps.map((map) => map.mapUid),
      }).map((record) => [record.mapUid.toLowerCase(), record])
    );

    const records = [];
    const upsertRecords = [];
    const summary = {
      total: normalizedMaps.length,
      reused: 0,
      downloaded: 0,
      missing: 0,
      errors: 0,
    };

    const results = await runWithConcurrency(
      normalizedMaps,
      this.mapCopy.maxConcurrentDownloads,
      async (map) => {
        const existing = existingByUid.get(map.mapUid.toLowerCase()) || null;
        const absolutePath = this.getLocalMapFileAbsolutePath(map.mapUid, map.relativePath);
        const now = new Date().toISOString();
        try {
          if (
            !force &&
            existing &&
            existing.status === "ready" &&
            existing.relativePath === map.relativePath &&
            (!map.downloadUrl || !existing.downloadUrl || existing.downloadUrl === map.downloadUrl)
          ) {
            const stat = await fs.stat(absolutePath).catch(() => null);
            if (stat?.isFile()) {
              summary.reused += 1;
              return {
                mapUid: map.mapUid,
                relativePath: map.relativePath,
                downloadUrl: map.downloadUrl,
                fileSha256: existing.fileSha256 || null,
                fileSizeBytes: Number(existing.fileSizeBytes || stat.size || 0),
                downloadedAt: existing.downloadedAt || now,
                verifiedAt: now,
                status: "ready",
                lastError: null,
              };
            }
          }

          if (!map.downloadUrl) {
            summary.missing += 1;
            return {
              mapUid: map.mapUid,
              relativePath: map.relativePath,
              downloadUrl: null,
              fileSha256: null,
              fileSizeBytes: 0,
              downloadedAt: existing?.downloadedAt || null,
              verifiedAt: now,
              status: "missing",
              lastError: "Map downloadUrl is missing.",
            };
          }

          await fs.mkdir(path.dirname(absolutePath), { recursive: true });
          const buffer = await this.downloadMapFileBuffer({
            mapUid: map.mapUid,
            downloadUrl: map.downloadUrl,
          });
          const tempPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
          await fs.writeFile(tempPath, buffer);
          await fs.rename(tempPath, absolutePath);
          summary.downloaded += 1;
          return {
            mapUid: map.mapUid,
            relativePath: map.relativePath,
            downloadUrl: map.downloadUrl,
            fileSha256: createHash("sha256").update(buffer).digest("hex"),
            fileSizeBytes: buffer.length,
            downloadedAt: now,
            verifiedAt: now,
            status: "ready",
            lastError: null,
          };
        } catch (error) {
          summary.errors += 1;
          return {
            mapUid: map.mapUid,
            relativePath: map.relativePath,
            downloadUrl: map.downloadUrl || null,
            fileSha256: existing?.fileSha256 || null,
            fileSizeBytes: Number(existing?.fileSizeBytes || 0),
            downloadedAt: existing?.downloadedAt || null,
            verifiedAt: now,
            status: "error",
            lastError: error?.message || "Failed downloading local map copy.",
          };
        }
      }
    );

    for (const record of results) {
      if (!record) continue;
      records.push(record);
      upsertRecords.push(record);
    }

    const upsert = this.repository.upsertMapLocalFiles({
      records: upsertRecords,
    });

    return {
      records,
      summary,
      upsert,
    };
  }

  async downloadMapFileBuffer({ mapUid, downloadUrl } = {}) {
    const safeUrl = toText(downloadUrl);
    if (!safeUrl) {
      throw new Error(`Map ${toText(mapUid, "<unknown>")} is missing downloadUrl.`);
    }
    const response = await fetch(safeUrl, {
      method: "GET",
      headers: {
        "user-agent": "altered project by ar, contact @ar___ on discord",
      },
      signal: AbortSignal.timeout(
        Math.max(2000, Number(this.mapCopy.requestTimeoutMs || MAP_CONTENT_DOWNLOAD_TIMEOUT_MS))
      ),
    });
    if (!response.ok) {
      throw new Error(`Failed downloading ${toText(mapUid, "<unknown>")} (${response.status}).`);
    }
    const payload = await response.arrayBuffer();
    return Buffer.from(payload);
  }

  async ensureMapContentSignatures(maps = [], { force = false, onProgress = null } = {}) {
    const reportSignatureProgress = (partial = {}) => {
      if (typeof onProgress !== "function") return;
      try {
        onProgress(partial);
      } catch (error) {
        this.logger.warn(
          `[altered-signatures] progress callback failed: ${error?.message || error}`
        );
      }
    };
    const normalizedMaps = uniqueBy(
      (Array.isArray(maps) ? maps : [])
        .map((map) => ({
          mapUid: resolveMapUid(map),
          name: toText(map?.name || map?.mapName || map?.title || resolveMapUid(map)),
          downloadUrl: resolveMapDownloadUrl(map),
          campaignName: resolveMapCampaignName(map),
          slot: resolveMapSlot(map),
        }))
        .filter((map) => map.mapUid),
      (map) => map.mapUid.toLowerCase()
    );
    if (!normalizedMaps.length) {
      return {
        records: [],
        summary: {
          total: 0,
          reused: 0,
          downloaded: 0,
          errors: 0,
          missingDownload: 0,
        },
      };
    }

    const localFiles = await this.ensureMapLocalFiles(normalizedMaps, { force });
    const localFilesByUid = new Map(
      this.getPreferredMapLocalFiles({
        mapUids: normalizedMaps.map((map) => map.mapUid),
      })
        .filter((record) => record?.mapUid)
        .map((record) => [String(record.mapUid).toLowerCase(), record])
    );

    const existingByUid = new Map(
      this.repository.getMapContentSignatures({
        mapUids: normalizedMaps.map((map) => map.mapUid),
      }).map((record) => [record.mapUid.toLowerCase(), record])
    );

    const records = [];
    const upsertRecords = [];
    const summary = {
      total: normalizedMaps.length,
      reused: 0,
      parsed: 0,
      errors: 0,
      missingDownload: 0,
    };
    reportSignatureProgress({
      phase: "prepare",
      total: normalizedMaps.length,
      ready: 0,
      reused: 0,
      parsed: 0,
      errors: 0,
      missingDownload: 0,
    });
    const resolvedRecordKeys = new Set();

    for (const map of normalizedMaps) {
      const localFile = localFilesByUid.get(map.mapUid.toLowerCase()) || null;
      const cacheKey = map.mapUid.toLowerCase();
      const existing = existingByUid.get(cacheKey) || null;
      if (
        !force &&
        existing &&
        existing.extractionVersion === CONTENT_SIGNATURE_VERSION &&
        existing.signature &&
        toText(existing.signature?.version) === CONTENT_SIGNATURE_VERSION &&
        existing.sourceStatus === "ready" &&
        localFile &&
        localFile.status === "ready" &&
        existing.fileSha256 &&
        existing.fileSha256 === localFile.fileSha256
      ) {
        summary.reused += 1;
        records.push(existing);
        resolvedRecordKeys.add(cacheKey);
        continue;
      }

      if (!localFile || localFile.status === "missing") {
        const record = {
          mapUid: map.mapUid,
          extractionVersion: CONTENT_SIGNATURE_VERSION,
          fileSha256: null,
          downloadUrl: map.downloadUrl || null,
          printableTokenCount: 0,
          assetTokenCount: 0,
          signature: null,
          sourceStatus: "missing-download",
          sourceError: localFile?.lastError || "Local map copy is missing.",
          extractedAt: new Date().toISOString(),
        };
        summary.missingDownload += 1;
        records.push(record);
        upsertRecords.push(record);
        resolvedRecordKeys.add(cacheKey);
        continue;
      }

      if (localFile.status === "error") {
        const record = {
          mapUid: map.mapUid,
          extractionVersion: CONTENT_SIGNATURE_VERSION,
          fileSha256: localFile.fileSha256 || null,
          downloadUrl: localFile.downloadUrl || map.downloadUrl || null,
          printableTokenCount: 0,
          assetTokenCount: 0,
          signature: null,
          sourceStatus: "error",
          sourceError: localFile.lastError || "Local map copy is in an error state.",
          extractedAt: new Date().toISOString(),
        };
        summary.errors += 1;
        records.push(record);
        upsertRecords.push(record);
        resolvedRecordKeys.add(cacheKey);
        continue;
      }
    }
    reportSignatureProgress({
      phase: "local-cache",
      total: normalizedMaps.length,
      ready: records.length,
      reused: summary.reused,
      parsed: summary.parsed,
      errors: summary.errors,
      missingDownload: summary.missingDownload,
    });

    const mapsToParse = normalizedMaps
      .map((map) => {
        if (resolvedRecordKeys.has(map.mapUid.toLowerCase())) return null;
        const localFile = localFilesByUid.get(map.mapUid.toLowerCase()) || null;
        if (!localFile || localFile.status !== "ready") return null;
        return {
          ...map,
          localFile,
          filePath: this.getLocalMapFileAbsolutePath(map.mapUid, localFile.relativePath),
        };
      })
      .filter(Boolean);

    if (mapsToParse.length) {
      const parserBatchSize = 15;
      reportSignatureProgress({
        phase: "parsing",
        total: normalizedMaps.length,
        ready: records.length,
        reused: summary.reused,
        parsed: summary.parsed,
        errors: summary.errors,
        missingDownload: summary.missingDownload,
        parserRemaining: mapsToParse.length,
        currentMapUid: mapsToParse[0]?.mapUid || null,
        currentMapName:
          mapsToParse.length > 1
            ? `${toText(mapsToParse[0]?.name || mapsToParse[0]?.mapUid)} (+${mapsToParse.length - 1} more)`
            : toText(mapsToParse[0]?.name || mapsToParse[0]?.mapUid),
      });
      for (let index = 0; index < mapsToParse.length; index += parserBatchSize) {
        const parserBatch = mapsToParse.slice(index, index + parserBatchSize);
        const currentBatchLead = parserBatch[0] || null;
        let parserPayload = null;
        let parserFailure = null;
        try {
          parserPayload = await parseGbxMapLayouts(parserBatch, {
            timeoutMs: 5 * 60 * 1000,
          });
        } catch (error) {
          parserFailure = error;
        }

        const parsedByUid = new Map(
          (Array.isArray(parserPayload?.maps) ? parserPayload.maps : [])
            .filter((entry) => entry?.mapUid)
            .map((entry) => [String(entry.mapUid).toLowerCase(), entry])
        );

        for (const map of parserBatch) {
          const parsed = parsedByUid.get(map.mapUid.toLowerCase()) || null;
          let signature = parsed?.signature || null;
          let sourceError = toText(parsed?.error) || null;
          if (!signature) {
            const buffer = await fs.readFile(map.filePath);
            signature = extractGbxContentSignature(buffer);
            if (parserFailure?.message) {
              sourceError = sourceError
                ? `${sourceError} | fallback=${parserFailure.message}`
                : `fallback=${parserFailure.message}`;
            } else if (signature?.version === ASSET_FALLBACK_SIGNATURE_VERSION) {
              sourceError = sourceError
                ? `${sourceError} | fallback=asset-token-signature`
                : "fallback=asset-token-signature";
            }
          }

          const record = {
            mapUid: map.mapUid,
            extractionVersion: toText(signature?.version) || CONTENT_SIGNATURE_VERSION,
            fileSha256: map.localFile.fileSha256 || null,
            downloadUrl: map.localFile.downloadUrl || map.downloadUrl,
            printableTokenCount: Number(signature?.printableSegments || 0),
            assetTokenCount: countSignatureTokens(signature),
            signature,
            sourceStatus: signature ? "ready" : "error",
            sourceError,
            extractedAt: new Date().toISOString(),
          };
          if (signature) summary.parsed += 1;
          if (!signature) summary.errors += 1;
          records.push(record);
          upsertRecords.push(record);
        }
        reportSignatureProgress({
          phase: "parsing",
          total: normalizedMaps.length,
          ready: records.length,
          reused: summary.reused,
          parsed: summary.parsed,
          errors: summary.errors,
          missingDownload: summary.missingDownload,
          parserRemaining: Math.max(0, mapsToParse.length - (index + parserBatch.length)),
          currentMapUid: currentBatchLead?.mapUid || null,
          currentMapName:
            parserBatch.length > 1
              ? `${toText(currentBatchLead?.name || currentBatchLead?.mapUid)} (+${parserBatch.length - 1} more)`
              : toText(currentBatchLead?.name || currentBatchLead?.mapUid),
        });
      }
    }

    const upsert = this.repository.upsertMapContentSignatures({
      records: upsertRecords,
    });
    reportSignatureProgress({
      phase: "complete",
      total: normalizedMaps.length,
      ready: records.length,
      reused: summary.reused,
      parsed: summary.parsed,
      errors: summary.errors,
      missingDownload: summary.missingDownload,
    });

    return {
      records,
      summary,
      localFiles: localFiles.summary,
      upsert,
    };
  }

  async assignStoredMapNumbersBySimilarity({
    q = "",
    limit = 250,
    mapUids = [],
    clubId = null,
    sourceKey = "",
    force = false,
    rescanAll = false,
    persistCandidates = true,
    onProgress = null,
  } = {}) {
    const reportProgress = (partial = {}) => {
      if (typeof onProgress !== "function") return;
      try {
        onProgress(partial);
      } catch (error) {
        this.logger.warn(
          `[altered-similarity-backfill] progress callback failed: ${error?.message || error}`
        );
      }
    };
    const withProgressHeartbeat = async (buildPartial, task, intervalMs = 5000) => {
      const safeBuilder = typeof buildPartial === "function" ? buildPartial : () => ({});
      reportProgress(safeBuilder());
      const timer = setInterval(() => {
        reportProgress(safeBuilder());
      }, Math.max(1000, Number(intervalMs) || 5000));
      try {
        return await task();
      } finally {
        clearInterval(timer);
      }
    };
    const safeLimit = clampInt(limit, { min: 1, max: 120000, fallback: 250 });
    const safeClubId = normalizeOptionalClubId(clubId);
    const effectiveClubId =
      Array.isArray(mapUids) && mapUids.length
        ? null
        : safeClubId;
    reportProgress({
      status: "running",
      stage: "loading-targets",
      message: effectiveClubId
        ? `Loading naming candidates for primary club ${effectiveClubId}...`
        : "Loading naming candidates...",
      percent: 2,
      replaceCounters: true,
      counters: {
        total: 0,
        processed: 0,
        resolved: 0,
        unresolved: 0,
        changedCandidates: 0,
      },
      targetClubId: effectiveClubId,
      sourceKey: toText(sourceKey).toLowerCase() || null,
      rescanAll: Boolean(rescanAll),
    });
    const shouldPrioritizeRefreshOnly =
      !rescanAll &&
      !toText(q) &&
      !(Array.isArray(mapUids) && mapUids.length);
    const sourceMaps = this.repository.listMapsForNameStandardization({
      q,
      limit:
        !toText(q) && !(Array.isArray(mapUids) && mapUids.length)
          ? Math.max(safeLimit * 4, 1000)
          : safeLimit,
      mapUids,
      clubId: effectiveClubId,
      includePayload: false,
    });
    const prioritizedSourceMaps =
      shouldPrioritizeRefreshOnly
        ? this.repository.listMapsNeedingSimilarityRefresh({
            q,
            limit: safeLimit,
            mapUids,
            requiredAssignmentMethod: CONTENT_SIGNATURE_VERSION,
            clubId: effectiveClubId,
            includePayload: false,
          })
        : [];
    const normalizedMaps = uniqueBy(
      (prioritizedSourceMaps.length ? prioritizedSourceMaps : sourceMaps)
        .map((map) => ({
          ...map,
          mapUid: resolveMapUid(map),
          campaignName: resolveMapCampaignName(map),
          slot: resolveMapSlot(map),
          downloadUrl: resolveMapDownloadUrl(map),
        }))
        .filter((map) => map.mapUid),
      (map) => map.mapUid.toLowerCase()
    )
      .filter((map) => {
        const requiredSourceKey = toText(sourceKey).toLowerCase();
        if (!requiredSourceKey) return true;
        return classifyNamingSimilaritySource(map) === requiredSourceKey;
      })
      .slice(0, safeLimit);

    if (!normalizedMaps.length) {
      reportProgress({
        status: "ok",
        stage: "complete",
        message: "Similarity backfill complete. No maps matched the current filter.",
        percent: 100,
        replaceCounters: true,
        counters: {
          total: 0,
          processed: 0,
          resolved: 0,
          unresolved: 0,
          changedCandidates: 0,
        },
      });
      return {
        ok: true,
        processed: 0,
        resolved: 0,
        unresolved: 0,
        missingReferenceFamilies: [],
      };
    }
    reportProgress({
      status: "running",
      stage: "loading-references",
      message: `Loaded ${normalizedMaps.length} naming candidates. Building reference catalog...`,
      percent: 6,
      replaceCounters: true,
      counters: {
        total: normalizedMaps.length,
        processed: 0,
        resolved: 0,
        unresolved: 0,
        changedCandidates: 0,
      },
      targetClubId: effectiveClubId,
      sourceKey: toText(sourceKey).toLowerCase() || null,
      rescanAll: Boolean(rescanAll),
    });

    try {
      await this.ensureOfficialSeasonalSourceFresh();
    } catch (error) {
      this.logger.warn(
        `[altered-official-seasonal] unable to refresh official campaign catalog before similarity run: ${error?.message || error}`
      );
    }

    const requiredSourceKeys = new Set(
      normalizedMaps
        .map((map) => classifyNamingSimilaritySource(map))
        .filter(Boolean)
    );
    if (requiredSourceKeys.has(TOTD_SOURCE_KEY)) {
      try {
        await this.ensureTotdSourceAvailable();
      } catch (error) {
        this.logger.warn(
          `[altered-totd] unable to refresh official TOTD catalog before similarity run: ${error?.message || error}`
        );
      }
    }
    if (requiredSourceKeys.has(COMPETITION_SOURCE_KEY)) {
      try {
        await this.ensureCompetitionSourceAvailable();
      } catch (error) {
        this.logger.warn(
          `[altered-competition] unable to refresh competition catalog before similarity run: ${error?.message || error}`
        );
      }
    }

    const requiredFamilyKeys = new Set();
    const requiredReferenceFamilyKeys = new Set();
    const normalizeReferenceFamilyKey = (value) => {
      const raw = toText(value);
      if (!raw) return "";
      return raw.replace(/:env:[^:]+/g, "");
    };
    for (const map of normalizedMaps) {
      const family = buildCampaignFamily(map.campaignName);
      const familyKey = toText(family.key);
      if (!familyKey) continue;
      requiredFamilyKeys.add(familyKey);
      const referenceFamilyKey = normalizeReferenceFamilyKey(familyKey);
      if (referenceFamilyKey) requiredReferenceFamilyKeys.add(referenceFamilyKey);
    }

    const referenceCatalog = this.repository.listAlterationsCampaigns({
      limit: 10000,
      offset: 0,
      catalogOnly: true,
    });
    const canonicalReferenceCampaignByFamily = new Map();
    const availableReferenceFamilies = new Set();
    for (const campaign of Array.isArray(referenceCatalog?.rows) ? referenceCatalog.rows : []) {
      const family = buildCampaignFamily(campaign?.name);
      if (!isNormalNadeoReferenceCampaign(campaign)) continue;
      availableReferenceFamilies.add(family.key);
      const currentList = canonicalReferenceCampaignByFamily.get(family.key) || [];
      if (isCompetitionFamily(family, campaign)) {
        const campaignKey =
          Number(campaign?.campaign_db_id || campaign?.campaignDbId || 0) > 0
            ? `id:${Number(campaign?.campaign_db_id || campaign?.campaignDbId || 0)}`
            : `name:${toText(campaign?.name).toLowerCase()}`;
        if (!currentList.some((item) => {
          const itemKey =
            Number(item?.campaign_db_id || item?.campaignDbId || 0) > 0
              ? `id:${Number(item?.campaign_db_id || item?.campaignDbId || 0)}`
              : `name:${toText(item?.name).toLowerCase()}`;
          return itemKey === campaignKey;
        })) {
          canonicalReferenceCampaignByFamily.set(family.key, [...currentList, campaign]);
        }
        continue;
      }
      const current = currentList[0] || null;
      if (isBetterReferenceCampaign(current, campaign)) {
        canonicalReferenceCampaignByFamily.set(family.key, [campaign]);
      }
    }

    const missingReferenceFamilies = [...requiredReferenceFamilyKeys].filter(
      (familyKey) => familyKey && !availableReferenceFamilies.has(familyKey)
    );
    let canonicalReferenceCampaigns = requiredReferenceFamilyKeys.size
      ? [...canonicalReferenceCampaignByFamily.entries()]
          .filter(([_familyKey]) => requiredReferenceFamilyKeys.has(_familyKey))
          .flatMap(([, campaigns]) => campaigns)
      : [];
    if (!canonicalReferenceCampaigns.length) {
      canonicalReferenceCampaigns = limitReferenceCampaignFallback(
        [...canonicalReferenceCampaignByFamily.values()]
          .flat()
          .sort(
            (a, b) =>
              Number(b?.sort_timestamp_ms || b?.sortTimestampMs || 0) -
              Number(a?.sort_timestamp_ms || a?.sortTimestampMs || 0)
          )
      );
    }
    const referenceCampaignByName = new Map(
      canonicalReferenceCampaigns
        .filter((campaign) => toText(campaign?.name))
        .map((campaign) => [toText(campaign.name), campaign])
    );

    const referenceMapsByCampaignName = new Map();
    for (const map of this.repository.listMapsForCampaignNames({
      campaignNames: [...referenceCampaignByName.keys()],
    })) {
      const campaignName = toText(map.campaignName || map.campaign);
      if (!campaignName) continue;
      if (!referenceMapsByCampaignName.has(campaignName)) {
        referenceMapsByCampaignName.set(campaignName, []);
      }
      referenceMapsByCampaignName.get(campaignName).push(map);
    }

    const globalReferenceMaps = uniqueBy(
      canonicalReferenceCampaigns.flatMap((campaign) => {
        const maps = referenceMapsByCampaignName.get(toText(campaign?.name)) || [];
        return maps
          .map((map) => ({
            ...map,
            mapUid: resolveMapUid(map),
            slot: resolveMapSlot(map),
            campaignName: resolveMapCampaignName(map),
            downloadUrl: resolveMapDownloadUrl(map),
            campaignId: Number(campaign?.campaign_db_id || 0) || null,
            referenceFamilyKey: buildCampaignFamily(campaign?.name).key || null,
          }))
          .filter((map) => map.mapUid && map.slot);
      }),
      (map) => map.mapUid.toLowerCase()
    );

    let resolved = 0;
    let unresolved = 0;
    let changedCandidates = 0;
    let refreshedSimilarityRecords = 0;
    let upgradedLegacySimilarityRecords = 0;
    let processed = 0;
    const recentMaps = [];
    const pushRecentMap = (sample = {}) => {
      const mapUid = toText(sample?.mapUid);
      if (!mapUid) return;
      recentMaps.push({
        mapUid,
        mapName: toText(sample?.mapName) || mapUid,
        campaignName: toText(sample?.campaignName) || null,
        slot: Number(sample?.slot || 0) || null,
        resolved: Boolean(sample?.resolved),
        mapNumbers: normalizeMapNumbers(sample?.mapNumbers || []),
        referenceCampaignName: toText(sample?.referenceCampaignName) || null,
        primaryReferenceMapUid: toText(sample?.primaryReferenceMapUid) || null,
        primaryReferenceSlot: Number(sample?.primaryReferenceSlot || 0) || null,
        topScore: Number.isFinite(Number(sample?.topScore)) ? Number(sample.topScore) : null,
        confidence: Number.isFinite(Number(sample?.confidence)) ? Number(sample.confidence) : null,
        manualSelection: Boolean(sample?.manualSelection),
      });
      if (recentMaps.length > 5) {
        recentMaps.splice(0, recentMaps.length - 5);
      }
    };
    const addNumericFields = (target = {}, source = null, fields = []) => {
      for (const field of fields) {
        target[field] = Number(target[field] || 0) + Number(source?.[field] || 0);
      }
      return target;
    };
    const targetSignatureTotals = {
      total: 0,
      reused: 0,
      parsed: 0,
      errors: 0,
      missingDownload: 0,
      localFiles: {
        total: 0,
        reused: 0,
        downloaded: 0,
        missing: 0,
        errors: 0,
      },
    };
    const signatureSummary = {
      targets: targetSignatureTotals,
      references: null,
    };
    const similarityUpsert = { processed: 0, inserted: 0, updated: 0, error: null };
    const candidateUpsert = { processed: 0, inserted: 0, updated: 0, error: null };
    const approvals = { processed: 0, eligible: 0, approved: 0, mapUids: [] };
    const referenceSignatureProgress = {
      total: globalReferenceMaps.length,
      ready: 0,
      currentMapUid: null,
      currentMapName: "",
    };
    const targetSignatureProgress = {
      total: normalizedMaps.length,
      ready: 0,
      currentMapUid: null,
      currentMapName: "",
    };
    const targetBatchSize = rescanAll ? 25 : 100;
    const progressUpdateInterval = Math.max(1, Math.min(25, Math.floor(normalizedMaps.length / 40) || 1));
    const eventLoopYieldInterval = rescanAll ? 1 : 5;

    reportProgress({
      status: "running",
      stage: "signatures-references",
      message: `Ensuring content signatures for ${globalReferenceMaps.length} reference maps...`,
      percent: 22,
      counters: {
        total: normalizedMaps.length,
        processed: 0,
        resolved: 0,
        unresolved: 0,
        changedCandidates: 0,
      },
      signatureSummary,
      targetClubId: effectiveClubId,
      rescanAll: Boolean(rescanAll),
    });
    const referenceSignatures = await withProgressHeartbeat(
      () => ({
        status: "running",
        stage: "signatures-references",
        message: `Ensuring content signatures for ${globalReferenceMaps.length} reference maps...`,
      counters: {
        total: normalizedMaps.length,
        processed,
        resolved,
        unresolved,
        changedCandidates,
        refreshedSimilarityRecords,
        upgradedLegacySimilarityRecords,
        similarityRowsWritten: Number(similarityUpsert.processed || 0),
        candidateRowsWritten: Number(candidateUpsert.processed || 0),
        autoApproved: Number(approvals.approved || 0),
        targetSignaturesReady: Number(targetSignatureProgress.ready || 0),
        targetSignaturesTotal: Number(targetSignatureProgress.total || normalizedMaps.length),
        referenceSignaturesReady: Number(referenceSignatureProgress.ready || 0),
        referenceSignaturesTotal: Number(referenceSignatureProgress.total || globalReferenceMaps.length),
      },
        currentMapUid: referenceSignatureProgress.currentMapUid || null,
        currentMapName: referenceSignatureProgress.currentMapName || "",
        recentMaps: recentMaps.slice(),
        signatureSummary,
        targetClubId: effectiveClubId,
        rescanAll: Boolean(rescanAll),
      }),
      () =>
        this.ensureMapContentSignatures(globalReferenceMaps, {
          force,
          onProgress: (partial) => {
            referenceSignatureProgress.total = Number(partial?.total || referenceSignatureProgress.total || 0);
            referenceSignatureProgress.ready = Number(partial?.ready || 0);
            referenceSignatureProgress.currentMapUid = toText(partial?.currentMapUid) || null;
            referenceSignatureProgress.currentMapName = toText(partial?.currentMapName) || "";
          },
        })
    );
    signatureSummary.references = {
      ...(referenceSignatures.summary || {}),
      localFiles: referenceSignatures.localFiles || null,
    };
    const referenceSignatureByUid = new Map(
      (Array.isArray(referenceSignatures.records) ? referenceSignatures.records : [])
        .filter((record) => record?.mapUid)
        .map((record) => [String(record.mapUid).toLowerCase(), record])
    );
    const referenceEntries = globalReferenceMaps
      .map((entry) => ({
        ...entry,
        signature: referenceSignatureByUid.get(entry.mapUid.toLowerCase())?.signature || null,
      }))
      .filter((entry) => entry.signature);
    const referenceContext = buildContentSimilarityReferenceContext(referenceEntries);
    const familyReferenceEntriesByKey = new Map();
    for (const entry of referenceEntries) {
      const familyKey = toText(entry?.referenceFamilyKey);
      if (!familyKey) continue;
      if (!familyReferenceEntriesByKey.has(familyKey)) {
        familyReferenceEntriesByKey.set(familyKey, []);
      }
      familyReferenceEntriesByKey.get(familyKey).push(entry);
    }
    const familyReferenceContextByKey = new Map(
      [...familyReferenceEntriesByKey.entries()].map(([familyKey, entries]) => [
        familyKey,
        buildContentSimilarityReferenceContext(entries),
      ])
    );

    reportProgress({
      status: "running",
      stage: "matching",
      message: `Comparing ${normalizedMaps.length} maps against ${referenceContext.entries.length} references...`,
      percent: NAMING_SIMILARITY_PROGRESS_MATCHING_START,
      counters: {
        total: normalizedMaps.length,
        processed: 0,
        resolved: 0,
        unresolved: 0,
        changedCandidates: 0,
      },
      signatureSummary,
      targetClubId: effectiveClubId,
      rescanAll: Boolean(rescanAll),
    });

    for (let batchStart = 0; batchStart < normalizedMaps.length; batchStart += targetBatchSize) {
      const batchMaps = normalizedMaps.slice(batchStart, batchStart + targetBatchSize);
      if (!batchMaps.length) continue;
      const batchEnd = batchStart + batchMaps.length;

      reportProgress({
        status: "running",
        stage: "signatures-targets",
        message: `Ensuring content signatures for target maps ${batchStart + 1}-${batchEnd} of ${normalizedMaps.length}...`,
        percent:
          NAMING_SIMILARITY_PROGRESS_MATCHING_START > 12
            ? 12 + Math.round((processed / normalizedMaps.length) * (NAMING_SIMILARITY_PROGRESS_MATCHING_START - 12))
            : 12,
        counters: {
          total: normalizedMaps.length,
          processed,
          resolved,
          unresolved,
          changedCandidates,
          refreshedSimilarityRecords,
          upgradedLegacySimilarityRecords,
          similarityRowsWritten: Number(similarityUpsert.processed || 0),
          candidateRowsWritten: Number(candidateUpsert.processed || 0),
          autoApproved: Number(approvals.approved || 0),
          targetSignaturesReady: Number(targetSignatureProgress.ready || 0),
          targetSignaturesTotal: Number(targetSignatureProgress.total || normalizedMaps.length),
          referenceSignaturesReady: Number(referenceSignatureProgress.ready || 0),
          referenceSignaturesTotal: Number(referenceSignatureProgress.total || globalReferenceMaps.length),
        },
        currentMapUid: targetSignatureProgress.currentMapUid || null,
        currentMapName: targetSignatureProgress.currentMapName || "",
        signatureSummary,
        targetClubId: effectiveClubId,
        rescanAll: Boolean(rescanAll),
      });

      const batchTargetSignatures = await withProgressHeartbeat(
        () => ({
          status: "running",
          stage: "signatures-targets",
          message: `Ensuring content signatures for target maps ${batchStart + 1}-${batchEnd} of ${normalizedMaps.length}...`,
          counters: {
            total: normalizedMaps.length,
            processed,
            resolved,
            unresolved,
            changedCandidates,
            refreshedSimilarityRecords,
            upgradedLegacySimilarityRecords,
            similarityRowsWritten: Number(similarityUpsert.processed || 0),
            candidateRowsWritten: Number(candidateUpsert.processed || 0),
            autoApproved: Number(approvals.approved || 0),
            targetSignaturesReady: Number(targetSignatureProgress.ready || 0),
            targetSignaturesTotal: Number(targetSignatureProgress.total || normalizedMaps.length),
            referenceSignaturesReady: Number(referenceSignatureProgress.ready || 0),
            referenceSignaturesTotal: Number(referenceSignatureProgress.total || globalReferenceMaps.length),
          },
          currentMapUid: targetSignatureProgress.currentMapUid || null,
          currentMapName: targetSignatureProgress.currentMapName || "",
          recentMaps: recentMaps.slice(),
          signatureSummary,
          targetClubId: effectiveClubId,
          rescanAll: Boolean(rescanAll),
        }),
        () =>
          this.ensureMapContentSignatures(batchMaps, {
            force,
            onProgress: (partial) => {
              targetSignatureProgress.total = normalizedMaps.length;
              targetSignatureProgress.ready = Math.max(
                Number(targetSignatureProgress.ready || 0),
                batchStart + Number(partial?.ready || 0)
              );
              targetSignatureProgress.currentMapUid = toText(partial?.currentMapUid) || null;
              targetSignatureProgress.currentMapName = toText(partial?.currentMapName) || "";
            },
          })
      );
      addNumericFields(targetSignatureTotals, batchTargetSignatures.summary, [
        "total",
        "reused",
        "parsed",
        "errors",
        "missingDownload",
      ]);
      if (!targetSignatureTotals.localFiles) {
        targetSignatureTotals.localFiles = {
          total: 0,
          reused: 0,
          downloaded: 0,
          missing: 0,
          errors: 0,
        };
      }
      addNumericFields(targetSignatureTotals.localFiles, batchTargetSignatures.localFiles, [
        "total",
        "reused",
        "downloaded",
        "missing",
        "errors",
      ]);

      const batchTargetSignatureByUid = new Map(
        (Array.isArray(batchTargetSignatures.records) ? batchTargetSignatures.records : [])
          .filter((record) => record?.mapUid)
          .map((record) => [String(record.mapUid).toLowerCase(), record])
      );
      const existingSimilarityByUid = new Map(
        this.repository.getMapNumberSimilarity({
          mapUids: batchMaps.map((map) => map.mapUid),
        }).map((item) => [String(item.mapUid || "").toLowerCase(), item])
      );
      const batchCandidates = [];
      const batchSimilarityRecords = [];

      for (let index = 0; index < batchMaps.length; index += 1) {
        const map = batchMaps[index];
        const family = buildCampaignFamily(map.campaignName);
        const familyKey = toText(family.key);
        const normalizedFamilyKey = normalizeReferenceFamilyKey(familyKey);
        const familyReferenceContext =
          familyKey
            ? familyReferenceContextByKey.get(familyKey) ||
              familyReferenceContextByKey.get(normalizedFamilyKey) ||
              null
            : null;
        const activeReferenceContext = familyReferenceContext?.entries?.length
          ? familyReferenceContext
          : referenceContext;
        const activeReferenceScope = familyReferenceContext?.entries?.length
          ? "catalog-family"
          : "catalog-base-global";
        const baseCandidate = buildMapNameCandidate(map);
        const targetSignatureRecord = batchTargetSignatureByUid.get(map.mapUid.toLowerCase()) || null;
        const targetSignature = targetSignatureRecord?.signature || null;
        const targetSignatureVersion = toText(targetSignatureRecord?.signature?.version || "") || null;
        const targetUsesFallbackSignature =
          String(targetSignatureRecord?.sourceStatus || "").toLowerCase() === "ready" &&
          targetSignatureVersion !== CONTENT_SIGNATURE_VERSION;
        const fallbackReferenceEntries = Array.isArray(activeReferenceContext?.entries)
          ? activeReferenceContext.entries.filter((entry) => !Boolean(entry?.isStructuredSignature))
          : [];
        const fallbackReferenceSlots = normalizeMapNumbers(
          fallbackReferenceEntries.map((entry) => entry?.slot)
        );
        const fallbackReferenceMapUids = normalizeUniqueStrings(
          fallbackReferenceEntries.map((entry) => toText(entry?.mapUid))
        );
        const diagnosticWarnings = [];
        if (targetUsesFallbackSignature) {
          diagnosticWarnings.push(
            "Target map is using a fallback asset-token signature. Similarity precision is degraded."
          );
        }
        if (fallbackReferenceSlots.length > 0) {
          diagnosticWarnings.push(
            `Reference slots ${fallbackReferenceSlots.join(", ")} are using fallback asset-token signatures. Similarity rankings for those slots are degraded.`
          );
        }
        const isWeeklyShortsFamily = toText(family?.parsed?.special).toLowerCase() === "weekly shorts";
        const includeNameSupport =
          !toText(family?.parsed?.season) || isCompetitionFamily(family, null);
        const computedSimilarity = isWeeklyShortsFamily
          ? {
              resolved: Array.isArray(baseCandidate?.mapNumbers) && baseCandidate.mapNumbers.length > 0,
              mapNumbers: Array.isArray(baseCandidate?.mapNumbers) ? baseCandidate.mapNumbers : [],
              topScore: Array.isArray(baseCandidate?.mapNumbers) && baseCandidate.mapNumbers.length ? 1 : 0,
              secondScore: 0,
              confidence: Array.isArray(baseCandidate?.mapNumbers) && baseCandidate.mapNumbers.length ? 1 : 0,
              primaryReferenceMapUid: null,
              primaryReferenceSlot: Number(baseCandidate?.mapNumber || 0) || null,
              referenceCampaignId: null,
              referenceCampaignName: map.campaignName || null,
              candidateMatches: [],
              details: {
                matchClassification:
                  Array.isArray(baseCandidate?.mapNumbers) && baseCandidate.mapNumbers.length
                    ? "weekly-shorts-canonical"
                    : "weekly-shorts-unresolved",
                matchWarning:
                  Array.isArray(baseCandidate?.mapNumbers) && baseCandidate.mapNumbers.length
                    ? `Weekly Shorts slot ${baseCandidate.mapNumber} resolved from week metadata and title mapping.`
                    : "Weekly Shorts map could not be resolved from title mapping.",
                selectedCandidateMapUids: [],
                selectedCandidateCount: 0,
                referenceCampaignCount: 1,
                referenceMapCount: 5,
                referenceMapCountTotal: 5,
                structuredReferenceMapCount: 0,
                usedStructuredReferences: false,
                closestMapName: toText(baseCandidate?.weeklyShortsTitle) || null,
                weeklyShorts: {
                  week: Number(baseCandidate?.weeklyShortsWeek || 0) || null,
                  position: Number(baseCandidate?.weeklyShortsPosition || 0) || null,
                  title: toText(baseCandidate?.weeklyShortsTitle) || null,
                },
              },
            }
          : computeContentSimilarity(targetSignature, activeReferenceContext, {
              targetName: map.name,
              includeNameSupport,
            });
        const existingSimilarity = existingSimilarityByUid.get(map.mapUid.toLowerCase()) || null;
        if (similarityNeedsRefresh(existingSimilarity)) refreshedSimilarityRecords += 1;
        if (
          existingSimilarity &&
          toText(existingSimilarity?.assignmentMethod) &&
          toText(existingSimilarity?.assignmentMethod) !== CONTENT_SIGNATURE_VERSION
        ) {
          upgradedLegacySimilarityRecords += 1;
        }
        const hasManualSimilaritySelection = Boolean(existingSimilarity?.details?.manualSelection);
        const similarity = hasManualSimilaritySelection
          ? {
              ...computedSimilarity,
              mapNumbers: normalizeMapNumbers(
                existingSimilarity?.assignedMapNumbers || existingSimilarity?.mapNumbers || []
              ),
              primaryReferenceMapUid:
                existingSimilarity?.primaryReferenceMapUid || computedSimilarity?.primaryReferenceMapUid || null,
              primaryReferenceSlot:
                Number(
                  existingSimilarity?.primaryReferenceSlot ||
                    computedSimilarity?.primaryReferenceSlot ||
                    0
                ) || null,
              referenceCampaignId:
                Number(
                  existingSimilarity?.referenceCampaignId ||
                    computedSimilarity?.referenceCampaignId ||
                    0
                ) || null,
              referenceCampaignName:
                existingSimilarity?.referenceCampaignName || computedSimilarity?.referenceCampaignName || null,
              details: {
                ...(computedSimilarity?.details || {}),
                ...(existingSimilarity?.details || {}),
                manualSelection: true,
              },
              candidateMatches: applySimilaritySelectionToMatches(
                Array.isArray(computedSimilarity?.candidateMatches)
                  ? computedSimilarity.candidateMatches
                  : [],
                {
                  selectedCandidateMapUids:
                    existingSimilarity?.details?.manualSelectedCandidateMapUids ||
                    existingSimilarity?.details?.selectedCandidateMapUids ||
                    [],
                  primaryReferenceMapUid:
                    existingSimilarity?.primaryReferenceMapUid ||
                    computedSimilarity?.primaryReferenceMapUid ||
                    "",
                }
              ),
            }
          : computedSimilarity;
        const mergedCandidateBase = mergeSimilarityIntoCandidate(baseCandidate, similarity);
        const mergedCandidate = hasManualSimilaritySelection
          ? {
              ...mergedCandidateBase,
              parserPattern: `${CONTENT_SIMILARITY_PATTERN}:manual-selection`,
              parserConfidence: Math.max(
                clampInt(mergedCandidateBase?.parserConfidence, {
                  min: 0,
                  max: 100,
                  fallback: 0,
                }),
                Math.round(Number(similarity?.confidence || 0) * 100)
              ),
              sourceVersion: toText(
                mergedCandidateBase?.sourceVersion || CONTENT_SIGNATURE_VERSION
              ).includes("manual-similarity-selection")
                ? toText(mergedCandidateBase?.sourceVersion || CONTENT_SIGNATURE_VERSION)
                : `${toText(
                    mergedCandidateBase?.sourceVersion || CONTENT_SIGNATURE_VERSION
                  )}+manual-similarity-selection`,
              requiresRegex: false,
              automationState:
                Array.isArray(similarity?.mapNumbers) && similarity.mapNumbers.length
                  ? "matched"
                  : mergedCandidateBase?.automationState || "unmatched",
            }
          : mergedCandidateBase;
        const baseNumbers = JSON.stringify(
          Array.isArray(baseCandidate.mapNumbers) ? baseCandidate.mapNumbers : []
        );
        const mergedNumbers = JSON.stringify(
          Array.isArray(mergedCandidate.mapNumbers) ? mergedCandidate.mapNumbers : []
        );
        if (baseNumbers !== mergedNumbers) changedCandidates += 1;
        if (Array.isArray(similarity?.mapNumbers) && similarity.mapNumbers.length) resolved += 1;
        else unresolved += 1;

        batchCandidates.push(mergedCandidate);
        batchSimilarityRecords.push({
          mapUid: map.mapUid,
          familyKey: family.key || null,
          referenceCampaignId: similarity.referenceCampaignId || null,
          referenceCampaignName: similarity.referenceCampaignName || null,
          primaryReferenceMapUid: similarity.primaryReferenceMapUid || null,
          primaryReferenceSlot: similarity.primaryReferenceSlot || null,
          assignedMapNumbers: Array.isArray(similarity?.mapNumbers) ? similarity.mapNumbers : [],
          topScore: Number(similarity.topScore || 0),
          secondScore: Number(similarity.secondScore || 0),
          confidence: Number(similarity.confidence || 0),
          assignmentMethod: CONTENT_SIGNATURE_VERSION,
          candidateMatches: Array.isArray(similarity.candidateMatches)
            ? similarity.candidateMatches
            : [],
          details: {
            ...(similarity?.details || {}),
            targetCampaignName: map.campaignName || null,
            targetSlot: map.slot || null,
            targetFamilyKey: family.key || null,
            referenceScope: isWeeklyShortsFamily ? "weekly-shorts-canonical" : activeReferenceScope,
            referenceMapCount: isWeeklyShortsFamily ? 5 : activeReferenceContext.entries.length,
            referenceCampaignCount: isWeeklyShortsFamily ? 1 : Number(activeReferenceContext.campaignCount || 0),
            targetSignatureStatus: targetSignatureRecord?.sourceStatus || "missing",
            targetSignatureVersion,
            targetSignatureFallback: targetUsesFallbackSignature,
            fallbackReferenceCount: fallbackReferenceEntries.length,
            fallbackReferenceSlots,
            fallbackReferenceMapUids,
            diagnosticWarnings,
            includeNameSupport,
          },
        });
        pushRecentMap({
          mapUid: map.mapUid,
          mapName: map.name || map.mapUid,
          campaignName: map.campaignName || null,
          slot: map.slot || null,
          resolved: Array.isArray(similarity?.mapNumbers) && similarity.mapNumbers.length > 0,
          mapNumbers: similarity?.mapNumbers || [],
          referenceCampaignName: similarity?.referenceCampaignName || null,
          primaryReferenceMapUid: similarity?.primaryReferenceMapUid || null,
          primaryReferenceSlot: similarity?.primaryReferenceSlot || null,
          topScore: similarity?.topScore,
          confidence: similarity?.confidence,
          manualSelection: hasManualSimilaritySelection,
        });

        processed += 1;
        const shouldReportProgress =
          processed === 1 ||
          processed === normalizedMaps.length ||
          processed % progressUpdateInterval === 0;
        const shouldYieldToEventLoop =
          processed === normalizedMaps.length || processed % eventLoopYieldInterval === 0;
        if (shouldReportProgress) {
          reportProgress({
            status: "running",
            stage: "matching",
            message: `Compared ${processed} of ${normalizedMaps.length} maps...`,
            percent:
              NAMING_SIMILARITY_PROGRESS_MATCHING_START +
              Math.round((processed / normalizedMaps.length) * NAMING_SIMILARITY_PROGRESS_MATCHING_SPAN),
            counters: {
              total: normalizedMaps.length,
              processed,
              resolved,
              unresolved,
              changedCandidates,
              refreshedSimilarityRecords,
              upgradedLegacySimilarityRecords,
              similarityRowsWritten: Number(similarityUpsert.processed || 0),
              candidateRowsWritten: Number(candidateUpsert.processed || 0),
              autoApproved: Number(approvals.approved || 0),
              targetSignaturesReady: Number(targetSignatureProgress.ready || 0),
              targetSignaturesTotal: Number(targetSignatureProgress.total || normalizedMaps.length),
              referenceSignaturesReady: Number(referenceSignatureProgress.ready || 0),
              referenceSignaturesTotal: Number(referenceSignatureProgress.total || globalReferenceMaps.length),
            },
            currentMapUid: map.mapUid,
            currentMapName: map.name || map.mapUid,
            recentMaps: recentMaps.slice(),
            signatureSummary,
            targetClubId: effectiveClubId,
            rescanAll: Boolean(rescanAll),
          });
        }
        if (shouldYieldToEventLoop) {
          await waitForEventLoopTurn();
        }
      }

      const batchSimilarityUpsert = this.repository.upsertMapNumberSimilarity({
        records: batchSimilarityRecords,
      });
      if (batchSimilarityUpsert?.error) {
        return {
          ok: false,
          error: batchSimilarityUpsert.error,
          processed,
          resolved,
          unresolved,
          changedCandidates,
          refreshedSimilarityRecords,
          upgradedLegacySimilarityRecords,
          missingReferenceFamilies,
          signatures: signatureSummary,
          similarityUpsert: {
            ...similarityUpsert,
            error: batchSimilarityUpsert.error,
          },
          candidateUpsert,
          approvals,
          recentMaps: recentMaps.slice(),
          targetClubId: effectiveClubId,
          rescanAll: Boolean(rescanAll),
        };
      }
      addNumericFields(similarityUpsert, batchSimilarityUpsert, ["processed", "inserted", "updated"]);

      if (persistCandidates) {
        const batchCandidateUpsert = this.repository.upsertMapNameCandidates({
          candidates: batchCandidates,
        });
        if (batchCandidateUpsert?.error) {
          return {
            ok: false,
            error: batchCandidateUpsert.error,
            processed,
            resolved,
            unresolved,
            changedCandidates,
            refreshedSimilarityRecords,
            upgradedLegacySimilarityRecords,
            missingReferenceFamilies,
            signatures: signatureSummary,
            similarityUpsert,
            candidateUpsert: {
              ...candidateUpsert,
              error: batchCandidateUpsert.error,
            },
            approvals,
            recentMaps: recentMaps.slice(),
            targetClubId: effectiveClubId,
            rescanAll: Boolean(rescanAll),
          };
        }
        addNumericFields(candidateUpsert, batchCandidateUpsert, ["processed", "inserted", "updated"]);

        const batchApprovals = this.applyAutoApprovalFromSimilarity({
          mapUids: batchMaps.map((map) => map.mapUid),
        });
        approvals.processed += Number(batchApprovals?.processed || 0);
        approvals.eligible += Number(batchApprovals?.eligible || 0);
        approvals.approved += Number(batchApprovals?.approved || 0);
        approvals.mapUids = normalizeUniqueStrings([
          ...(approvals.mapUids || []),
          ...(Array.isArray(batchApprovals?.mapUids) ? batchApprovals.mapUids : []),
        ]);
      }

      reportProgress({
        status: "running",
        stage: "persisting-candidates",
        message: `Persisted ${processed} of ${normalizedMaps.length} maps.`,
        percent:
          NAMING_SIMILARITY_PROGRESS_MATCHING_START +
          Math.round((processed / normalizedMaps.length) * NAMING_SIMILARITY_PROGRESS_MATCHING_SPAN),
        counters: {
          total: normalizedMaps.length,
          processed,
          resolved,
          unresolved,
          changedCandidates,
          refreshedSimilarityRecords,
          upgradedLegacySimilarityRecords,
          similarityRowsWritten: Number(similarityUpsert.processed || 0),
          candidateRowsWritten: Number(candidateUpsert.processed || 0),
          autoApproved: Number(approvals.approved || 0),
          targetSignaturesReady: Number(targetSignatureProgress.ready || 0),
          targetSignaturesTotal: Number(targetSignatureProgress.total || normalizedMaps.length),
          referenceSignaturesReady: Number(referenceSignatureProgress.ready || 0),
          referenceSignaturesTotal: Number(referenceSignatureProgress.total || globalReferenceMaps.length),
        },
        recentMaps: recentMaps.slice(),
        signatureSummary,
        targetClubId: effectiveClubId,
        rescanAll: Boolean(rescanAll),
      });
    }

    return {
      ok: true,
      processed,
      resolved,
      unresolved,
      changedCandidates,
      refreshedSimilarityRecords,
      upgradedLegacySimilarityRecords,
      missingReferenceFamilies,
      signatures: signatureSummary,
      similarityUpsert,
      candidateUpsert,
      approvals,
      recentMaps: recentMaps.slice(),
      targetClubId: effectiveClubId,
      rescanAll: Boolean(rescanAll),
    };
  }

  getMapNameStandardizationCandidates({
    q = "",
    automationState = "",
    reviewState = "",
    requiresRegex = undefined,
    limit = 220,
    offset = 0,
  } = {}) {
    const hasFilters = !!(q || automationState || reviewState || requiresRegex !== undefined);
    const filterArgs = { q, automationState, reviewState, requiresRegex };
    return {
      summary: this.repository.getMapNameCandidateSummary(),
      filteredTotal: hasFilters
        ? this.repository.countMapNameCandidates(filterArgs)
        : undefined,
      candidates: this.repository.listMapNameCandidates({
        ...filterArgs,
        limit,
        offset,
      }),
    };
  }

  async getMapNameStandardizationCandidateDetail(mapUid) {
    const mapInfo = this.repository.getMapInfo(mapUid);
    if (!mapInfo?.exists || !mapInfo.map) {
      return { error: "Map not found." };
    }

    let storedCandidate =
      this.repository.getMapNameCandidate(mapUid) ||
      (mapInfo.map.derivedNameCandidate
        ? {
            ...mapInfo.map.derivedNameCandidate,
            mapUid: resolveMapUid(mapInfo.map),
            campaign: resolveMapCampaignName(mapInfo.map) || "Unassigned",
            campaignId: Number(mapInfo.map.campaignId || 0) || null,
            slot: resolveMapSlot(mapInfo.map) || 0,
            tracked: Boolean(mapInfo.map.tracked),
            status: mapInfo.map.status || "live",
            finalName:
              mapInfo.map.derivedNameCandidate.manualName ||
              mapInfo.map.derivedNameCandidate.proposedName ||
              mapInfo.map.derivedNameCandidate.sanitizedName ||
              mapInfo.map.derivedNameCandidate.originalName ||
              resolveMapUid(mapInfo.map),
          }
        : null);
    let similarity = this.repository.getMapNumberSimilarity({ mapUids: [mapUid] })[0] || null;
    const signature = this.repository.getMapContentSignatures({ mapUids: [mapUid] })[0] || null;
    const localFile = this.getPreferredMapLocalFiles({ mapUids: [mapUid] })[0] || null;
    const staleSimilarity = similarityNeedsRefresh(similarity);

    if (staleSimilarity) {
      try {
        const refresh = await this.assignStoredMapNumbersBySimilarity({
          mapUids: [mapUid],
          limit: 1,
          persistCandidates: true,
        });
        if (refresh?.ok) {
          similarity = this.repository.getMapNumberSimilarity({ mapUids: [mapUid] })[0] || similarity;
          storedCandidate = this.repository.getMapNameCandidate(mapUid) || storedCandidate;
        }
      } catch (error) {
        this.logger.warn(
          `[altered-similarity-detail] refresh failed for ${mapUid}: ${error?.message || error}`
        );
      }
    }

    const freshNameCandidate = buildMapNameCandidate(mapInfo.map);
    const freshCandidate = mergeSimilarityIntoCandidate(freshNameCandidate, similarity
      ? {
          ...similarity,
          mapNumbers: similarity.assignedMapNumbers,
        }
      : null);
    const autoApproval = evaluateSimilarityAutoApproval({
      similarity,
      signatureStatus: signature?.sourceStatus || "",
      assignedMapNumbers: similarity?.assignedMapNumbers || [],
    });
    const unmatchedReason = deriveSimilarityUnmatchedReason({
      candidate: storedCandidate,
      similarity,
      localFileStatus: localFile?.status || "",
      signatureStatus: signature?.sourceStatus || "",
      referenceMapCount: Number(similarity?.details?.referenceMapCount || 0),
    });

    const storedNumbers = JSON.stringify(Array.isArray(storedCandidate?.mapNumbers) ? storedCandidate.mapNumbers : []);
    const freshNumbers = JSON.stringify(Array.isArray(freshCandidate?.mapNumbers) ? freshCandidate.mapNumbers : []);
    const stale =
      !storedCandidate ||
      storedNumbers !== freshNumbers ||
      String(storedCandidate?.automationState || "") !== String(freshCandidate?.automationState || "") ||
      Number(storedCandidate?.mapNumber || 0) !== Number(freshCandidate?.mapNumber || 0) ||
      similarityNeedsRefresh(similarity);

    return {
      ok: true,
      map: {
        mapUid: resolveMapUid(mapInfo.map),
        name: mapInfo.map.name || "",
        campaign: resolveMapCampaignName(mapInfo.map) || "Unassigned",
        slot: resolveMapSlot(mapInfo.map) || null,
        downloadUrl: resolveMapDownloadUrl(mapInfo.map) || null,
      },
      localFile,
      storedCandidate,
      freshNameCandidate,
      freshCandidate,
      similarity,
      signature: signature
        ? {
            ...signature,
            signatureSummary: signature.signature?.groups
              ? Object.fromEntries(
                  Object.entries(signature.signature.groups).map(([key, entries]) => [
                    key,
                    Array.isArray(entries) ? entries.length : 0,
                  ])
                )
              : null,
          }
        : null,
      diagnostics: {
        staleStoredCandidate: Boolean(stale),
        unmatchedReason,
        autoApproval,
        autoResolvableNow: Boolean(
          (Array.isArray(freshCandidate?.mapNumbers) && freshCandidate.mapNumbers.length) ||
            (Array.isArray(similarity?.assignedMapNumbers) && similarity.assignedMapNumbers.length)
        ),
      },
    };
  }

  async getMapViewerDiffPayload({ targetMapUid, referenceMapUid } = {}) {
    const targetUid = normalizeMapUid(targetMapUid);
    const referenceUid = normalizeMapUid(referenceMapUid);
    if (!targetUid) return { error: "targetMapUid is required." };
    if (!referenceUid) return { error: "referenceMapUid is required." };

    const targetInfo = this.repository.getMapInfo(targetUid);
    if (!targetInfo?.exists || !targetInfo.map) {
      return {
        error: "Target map not found.",
        targetMapUid: targetUid,
      };
    }

    const referenceInfo = this.repository.getMapInfo(referenceUid);
    if (!referenceInfo?.exists || !referenceInfo.map) {
      return {
        error: "Reference map not found.",
        referenceMapUid: referenceUid,
      };
    }

    const localFilesByUid = new Map(
      this.getPreferredMapLocalFiles({ mapUids: [targetUid, referenceUid] })
        .filter((record) => record?.mapUid)
        .map((record) => [String(record.mapUid || "").toLowerCase(), record])
    );
    const targetLocalFile = localFilesByUid.get(targetUid.toLowerCase()) || null;
    const referenceLocalFile = localFilesByUid.get(referenceUid.toLowerCase()) || null;

    if (!targetLocalFile || String(targetLocalFile.status || "") !== "ready") {
      return {
        error: "Target local map copy is not ready.",
        targetMapUid: targetUid,
        localFile: targetLocalFile,
      };
    }
    if (!referenceLocalFile || String(referenceLocalFile.status || "") !== "ready") {
      return {
        error: "Reference local map copy is not ready.",
        referenceMapUid: referenceUid,
        localFile: referenceLocalFile,
      };
    }

    const targetFilePath = this.getLocalMapFileAbsolutePath(targetUid, targetLocalFile.relativePath);
    const referenceFilePath = this.getLocalMapFileAbsolutePath(
      referenceUid,
      referenceLocalFile.relativePath
    );

    const parsedLayouts = await parseGbxMapLayouts([
      { mapUid: targetUid, filePath: targetFilePath },
      { mapUid: referenceUid, filePath: referenceFilePath },
    ]);
    const parsedByUid = new Map(
      (Array.isArray(parsedLayouts?.maps) ? parsedLayouts.maps : [])
        .filter((entry) => entry?.mapUid)
        .map((entry) => [String(entry.mapUid || "").toLowerCase(), entry])
    );
    const targetLayout = parsedByUid.get(targetUid.toLowerCase()) || null;
    const referenceLayout = parsedByUid.get(referenceUid.toLowerCase()) || null;

    if (!targetLayout) {
      return {
        error: "Target map layout could not be parsed.",
        targetMapUid: targetUid,
      };
    }
    if (targetLayout?.error) {
      return {
        error: `Target map parse failed: ${targetLayout.error}`,
        targetMapUid: targetUid,
      };
    }
    if (!referenceLayout) {
      return {
        error: "Reference map layout could not be parsed.",
        referenceMapUid: referenceUid,
      };
    }
    if (referenceLayout?.error) {
      return {
        error: `Reference map parse failed: ${referenceLayout.error}`,
        referenceMapUid: referenceUid,
      };
    }

    return buildMapViewerDiffPayload({
      targetMap: {
        mapUid: resolveMapUid(targetInfo.map),
        name: toText(targetInfo.map.name) || targetLayout.mapName || targetUid,
        campaign: resolveMapCampaignName(targetInfo.map) || "Unassigned",
        slot: resolveMapSlot(targetInfo.map) || null,
      },
      referenceMap: {
        mapUid: resolveMapUid(referenceInfo.map),
        name: toText(referenceInfo.map.name) || referenceLayout.mapName || referenceUid,
        campaign: resolveMapCampaignName(referenceInfo.map) || "Unassigned",
        slot: resolveMapSlot(referenceInfo.map) || null,
      },
      targetLocalFile: {
        ...targetLocalFile,
        absolutePath: targetFilePath,
      },
      referenceLocalFile: {
        ...referenceLocalFile,
        absolutePath: referenceFilePath,
      },
      targetLayout,
      referenceLayout,
    });
  }

  async importMapLocalFileFix({
    mapUid,
    sourceFilePath,
    note = "",
    recomputeSimilarity = true,
  } = {}) {
    const uid = toText(mapUid);
    if (!uid) return { error: "mapUid is required." };

    const safeSourceFilePath = toText(sourceFilePath);
    if (!safeSourceFilePath) return { error: "sourceFilePath is required." };

    const mapInfo = this.repository.getMapInfo(uid);
    if (!mapInfo?.exists || !mapInfo.map) {
      return { error: "Map not found." };
    }

    let sourceStat = null;
    try {
      sourceStat = await fs.stat(safeSourceFilePath);
    } catch (error) {
      return {
        error: `Source file could not be read: ${error?.message || error}`,
      };
    }
    if (!sourceStat?.isFile?.()) {
      return { error: "sourceFilePath must point to a file." };
    }

    const buffer = await fs.readFile(safeSourceFilePath);
    const relativePath = buildLocalMapFixRelativePath(uid, safeSourceFilePath);
    const absolutePath = this.getLocalMapFileAbsolutePath(uid, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    const tempPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempPath, buffer);
    await fs.rename(tempPath, absolutePath);

    const now = new Date().toISOString();
    const fileSha256 = createHash("sha256").update(buffer).digest("hex");
    const fixRecord = {
      mapUid: uid,
      relativePath,
      sourceFilePath: safeSourceFilePath,
      fileSha256,
      fileSizeBytes: buffer.length,
      importedAt: now,
      verifiedAt: now,
      status: "ready",
      note: toText(note) || null,
      lastError: null,
    };

    const fixUpsert = this.repository.upsertMapLocalFileFixes({
      records: [fixRecord],
    });
    if (fixUpsert?.error) {
      return fixUpsert;
    }

    const signatures = await this.ensureMapContentSignatures([mapInfo.map], {
      force: true,
    });
    const similarity = recomputeSimilarity
      ? await this.assignStoredMapNumbersBySimilarity({
          mapUids: [uid],
          limit: 1,
          force: true,
          persistCandidates: true,
        })
      : null;

    return {
      ok: true,
      mapUid: uid,
      mapName: toText(mapInfo.map?.name) || uid,
      relativePath,
      absolutePath,
      sourceFilePath: safeSourceFilePath,
      fileSha256,
      fileSizeBytes: buffer.length,
      fixUpsert,
      signatures,
      similarity,
    };
  }

  async updateMapNameCandidateSimilaritySelection({
    mapUid,
    candidateMapUids = [],
    mapNumbers = [],
    reviewState = undefined,
    reviewNote = undefined,
  } = {}) {
    const uid = toText(mapUid);
    if (!uid) return { error: "mapUid is required." };

    const detail = await this.getMapNameStandardizationCandidateDetail(uid);
    if (detail?.error) return detail;

    const similarity = detail?.similarity || null;
    const storedMatches = Array.isArray(similarity?.candidateMatches) ? similarity.candidateMatches : [];
    if (!storedMatches.length) {
      return { error: "No stored similarity candidates are available for this map." };
    }

    const normalizedCandidateMapUids = uniqueBy(
      (Array.isArray(candidateMapUids) ? candidateMapUids : [candidateMapUids])
        .map((value) => toText(value))
        .filter(Boolean),
      (value) => value.toLowerCase()
    );
    const normalizedRequestedNumbers = normalizeMapNumbers(mapNumbers);

    let selectedMatches = normalizedCandidateMapUids.length
      ? storedMatches.filter((match) =>
          normalizedCandidateMapUids.includes(toText(match?.mapUid).toLowerCase())
        )
      : [];
    if (!selectedMatches.length && normalizedRequestedNumbers.length) {
      selectedMatches = storedMatches.filter((match) =>
        normalizedRequestedNumbers.includes(Number(match?.slot || 0))
      );
    }
    if (!selectedMatches.length) {
      return { error: "Select at least one stored similarity candidate." };
    }

    const selectedMapNumbers = normalizeMapNumbers(selectedMatches.map((match) => match?.slot));
    if (!selectedMapNumbers.length) {
      return { error: "Selected similarity candidates do not expose valid slot numbers." };
    }

    const primaryMatch = selectedMatches[0] || null;
    const baseCandidate = detail?.storedCandidate || detail?.freshCandidate || detail?.freshNameCandidate || {
      mapUid: uid,
      originalName: detail?.map?.name || uid,
      sanitizedName: detail?.map?.name || uid,
      sourceVersion: CONTENT_SIGNATURE_VERSION,
    };
    const baseSourceVersion = toText(baseCandidate?.sourceVersion, CONTENT_SIGNATURE_VERSION);
    const nextSourceVersion = baseSourceVersion.includes("manual-similarity-selection")
      ? baseSourceVersion
      : `${baseSourceVersion}+manual-similarity-selection`;
    const nowIso = new Date().toISOString();

    const candidateUpsert = this.repository.upsertMapNameCandidates({
      candidates: [
        {
          ...baseCandidate,
          mapUid: uid,
          mapNumber: selectedMapNumbers[0] || null,
          mapNumbers: selectedMapNumbers,
          parserPattern: `${CONTENT_SIMILARITY_PATTERN}:manual-selection`,
          parserConfidence: Math.max(
            clampInt(baseCandidate?.parserConfidence, { min: 0, max: 100, fallback: 0 }),
            Math.round(Number(similarity?.confidence || 0) * 100)
          ),
          automationState: selectedMapNumbers.length ? "matched" : "unmatched",
          requiresRegex: false,
          sourceVersion: nextSourceVersion,
        },
      ],
    });
    if (candidateUpsert?.error) return candidateUpsert;

    const similarityUpsert = this.repository.upsertMapNumberSimilarity({
      records: [
        {
          ...similarity,
          mapUid: uid,
          referenceCampaignId: Number(primaryMatch?.campaignId || similarity?.referenceCampaignId || 0) || null,
          referenceCampaignName: primaryMatch?.campaignName || similarity?.referenceCampaignName || null,
          primaryReferenceMapUid: primaryMatch?.mapUid || similarity?.primaryReferenceMapUid || null,
          primaryReferenceSlot: Number(primaryMatch?.slot || similarity?.primaryReferenceSlot || 0) || null,
          assignedMapNumbers: selectedMapNumbers,
          candidateMatches: applySimilaritySelectionToMatches(storedMatches, {
            selectedCandidateMapUids: selectedMatches.map((match) => match?.mapUid).filter(Boolean),
            primaryReferenceMapUid: primaryMatch?.mapUid || similarity?.primaryReferenceMapUid || "",
          }),
          details: {
            ...(similarity?.details || {}),
            matchClassification:
              selectedMapNumbers.length > 1 ? "manual-multi-selection" : "manual-selected",
            matchWarning:
              selectedMapNumbers.length > 1
                ? `Manual selection applied across ${selectedMapNumbers.length} slots.`
                : `Manual selection locked to slot ${selectedMapNumbers[0]}.`,
            hasAmbiguousCloseSlots: selectedMapNumbers.length > 1,
            hasUniqueClosestSlot: selectedMapNumbers.length === 1,
            closeMatchCount: selectedMatches.length,
            closeSlotCount: selectedMapNumbers.length,
            closeSlots: selectedMapNumbers,
            selectedCandidateMapUids: selectedMatches.map((match) => match?.mapUid).filter(Boolean),
            selectedCandidateCount: selectedMatches.length,
            manualSelection: true,
            manualSelectionAt: nowIso,
            manualSelectedCandidateMapUids: selectedMatches.map((match) => match?.mapUid).filter(Boolean),
          },
        },
      ],
    });
    if (similarityUpsert?.error) return similarityUpsert;

    let review = null;
    if (reviewState !== undefined || reviewNote !== undefined) {
      review = this.repository.updateMapNameCandidateReview({
        mapUid: uid,
        reviewState,
        reviewNote:
          reviewNote !== undefined
            ? reviewNote
            : `Similarity selection applied from admin (${selectedMapNumbers.join(", ")}).`,
      });
      if (review?.error) return review;
    }

    return {
      ok: true,
      selectedMapNumbers,
      selectedCandidateMatches: selectedMatches,
      candidateUpsert,
      similarityUpsert,
      review,
      detail: await this.getMapNameStandardizationCandidateDetail(uid),
    };
  }

  updateMapNameStandardizationCandidateReview({
    mapUid,
    reviewState = undefined,
    manualName = undefined,
    reviewNote = undefined,
  } = {}) {
    const result = this.repository.updateMapNameCandidateReview({
      mapUid,
      reviewState,
      manualName,
      reviewNote,
    });
    if (result?.error) return result;
    return {
      ok: true,
      candidate: result.candidate,
      summary: this.repository.getMapNameCandidateSummary(),
    };
  }

  updateHookConfig(payload = {}) {
    const hook = this.repository.updateHookConfig({
      hookKey: payload.hookKey || "altered-club",
      clubId: payload.clubId,
      clubName: payload.clubName,
      sourceLabel: payload.sourceLabel,
      enabled: payload.enabled,
      autoTrackNewMaps: payload.autoTrackNewMaps,
    });
    if (!hook) return { error: "Unable to update altered hook config." };
    return { hook };
  }

  async updateMapCampaign({ mapUid, campaignName, slot }) {
    if (!campaignName || !String(campaignName).trim()) {
      return { error: "campaignName is required." };
    }
    const updated = this.repository.updateMapCampaign({
      mapUid,
      campaignName: String(campaignName).trim(),
        slot: Number(slot) || 1,
      });
    if (!updated) return { error: "Map not found." };
    const metadata = this.assignStoredMapMetadata({
      mapUids: [mapUid],
      limit: 1,
    });
    const similarity = await this.assignStoredMapNumbersBySimilarity({
      mapUids: [mapUid],
      limit: 1,
      persistCandidates: true,
    });
    const refreshed = this.repository.getMapInfo(mapUid);
    const warnings = [metadata?.error || null, similarity?.ok === false ? "Content similarity assignment failed." : null]
      .filter(Boolean)
      .join(" | ");
    return {
      updated: refreshed?.exists ? refreshed : updated,
      metadata: metadata?.error ? null : metadata,
      similarity: similarity?.ok === false ? null : similarity,
      warning: warnings || null,
    };
  }

  getTrackerMapSyncTargets() {
    const targets = Array.isArray(this.trackerMapSyncTargets)
      ? this.trackerMapSyncTargets
      : [];
    return targets.filter((target) => target?.client && typeof target.client.bulkUpsertMaps === "function");
  }

  async updateMapTrackingAcrossTargets(mapUid, payload = {}) {
    const targets = this.getTrackerMapSyncTargets();
    if (!targets.length) {
      return {
        ok: false,
        error: "No tracker map-sync targets are configured.",
        targets: [],
      };
    }

    const results = [];
    for (const target of targets) {
      const result = await target.client.updateMapTracking(mapUid, payload);
      results.push({
        key: target.key,
        label: target.label,
        ok: Boolean(result?.ok),
        error: result?.ok ? null : result?.error || "Tracker map-tracking update failed.",
      });
    }

    const failed = results.filter((item) => !item.ok);
    return {
      ok: failed.length === 0,
      targets: results,
      error:
        failed.length > 0
          ? `Map tracking update failed on ${failed[0].label}: ${failed[0].error}`
          : null,
    };
  }

  async syncMapsToTrackerInChunks(maps = [], { onChunk, chunkSize = null } = {}) {
    const list = Array.isArray(maps) ? maps : [];
    if (!list.length) {
      return {
        ok: true,
        targetCount: 0,
        targetResults: [],
        chunkCount: 0,
        mapsSynced: 0,
      };
    }
    const targets = this.getTrackerMapSyncTargets();
    if (!targets.length) {
      return {
        ok: false,
        error: "No tracker map-sync targets are configured.",
        targetCount: 0,
        targetResults: [],
        chunkCount: 0,
        mapsSynced: 0,
      };
    }

    const targetResults = [];
    const effectiveChunkSize = clampInt(chunkSize, {
      min: 10,
      max: 1000,
      fallback: this.liveMonitor.trackerChunkSize,
    });
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      const target = targets[targetIndex];
      const chunks = chunk(list, effectiveChunkSize);
      let mapsSynced = 0;
      let ok = true;
      let errorMessage = null;
      let chunksSynced = 0;
      for (let index = 0; index < chunks.length; index += 1) {
        const part = chunks[index];
        const result = await target.client.bulkUpsertMaps(part);
        if (!result?.ok) {
          ok = false;
          errorMessage = `Tracker sync failed on ${target.label} chunk ${index + 1}/${chunks.length}: ${
            result?.error || "unknown error"
          }`;
          chunksSynced = index;
          break;
        }
        mapsSynced += part.length;
        chunksSynced = index + 1;
        if (typeof onChunk === "function") {
          onChunk({
            index: index + 1,
            total: chunks.length,
            mapsSynced,
            chunkSize: part.length,
            targetKey: target.key,
            targetLabel: target.label,
            targetIndex: targetIndex + 1,
            targetTotal: targets.length,
          });
        }
      }

      targetResults.push({
        key: target.key,
        label: target.label,
        ok,
        error: errorMessage,
        chunkCount: chunks.length,
        chunksSynced,
        mapsSynced,
      });

      if (!ok) {
        return {
          ok: false,
          error: errorMessage,
          targetCount: targets.length,
          targetResults,
          chunkCount: chunks.length,
          chunksSynced,
          mapsSynced,
        };
      }
    }

    const primaryResult =
      targetResults.find((result) =>
        targets.find((target) => target.key === result.key && target.primary)
      ) || targetResults[0];
    return {
      ok: true,
      targetCount: targets.length,
      targetResults,
      chunkCount: Number(primaryResult?.chunkCount || 0),
      mapsSynced: Number(primaryResult?.mapsSynced || 0),
    };
  }

  async ensureMapIsKnownToTracker(mapUid) {
    const trackerMaps = this.repository.getMapsForTracker([mapUid]);
    if (!trackerMaps.length) {
      return { ok: false, error: "Map not found in altered storage." };
    }
    const upsertResult = await this.syncMapsToTrackerInChunks(trackerMaps);
    if (!upsertResult.ok) return upsertResult;
    return { ok: true, syncedMaps: trackerMaps.length };
  }

  async updateMapTracking({ mapUid, tracked, status, checkFrequency }) {
    const hasTracked = typeof tracked === "boolean";
    const hasStatus = typeof status === "string";
    const hasFrequency = Number.isFinite(checkFrequency);
    if (!hasTracked && !hasStatus && !hasFrequency) {
      return { error: "Nothing to update. Provide tracked/status/checkFrequency." };
    }

    const updated = this.repository.updateMapTracking({
      mapUid,
      tracked: hasTracked ? tracked : undefined,
      status: hasStatus ? String(status) : undefined,
      checkFrequency: hasFrequency ? Number(checkFrequency) : undefined,
    });
    if (!updated) return { error: "Map not found." };

    const ensureResult = await this.ensureMapIsKnownToTracker(mapUid);
    if (!ensureResult.ok) {
      return {
        updated,
        warning: `Updated altered storage but failed to sync map into tracker: ${ensureResult.error}`,
      };
    }

    const trackerUpdate = await this.updateMapTrackingAcrossTargets(mapUid, {
      tracked: hasTracked ? tracked : undefined,
      status: hasStatus ? String(status) : undefined,
      checkFrequency: hasFrequency ? Number(checkFrequency) : undefined,
    });

    if (!trackerUpdate.ok) {
      return {
        updated,
        warning: `Updated altered storage but failed to update tracker state: ${trackerUpdate.error}`,
      };
    }

    return { updated };
  }

  async fetchAllOfficialSeasonalCampaigns(
    liveClient,
    { length = 25, maxPages = 100, onPageLoaded = null } = {}
  ) {
    const out = [];
    const safeLength = clampInt(length, { min: 1, max: 100, fallback: 25 });
    const safeMaxPages = clampInt(maxPages, { min: 1, max: 500, fallback: 100 });
    let offset = 0;

    for (let page = 0; page < safeMaxPages; page += 1) {
      const payload = await liveClient.getOfficialSeasonalCampaignsV2({
        length: safeLength,
        offset,
      });
      const campaigns = Array.isArray(payload?.campaignList) ? payload.campaignList : [];
      if (!campaigns.length) break;
      out.push(...campaigns);
      if (typeof onPageLoaded === "function") {
        onPageLoaded({
          page: page + 1,
          offset,
          pageSize: campaigns.length,
          totalLoaded: out.length,
          totalKnown: Number(payload?.itemCount || 0) || null,
        });
      }
      offset += campaigns.length;
      if (campaigns.length < safeLength) break;
      if (Number(payload?.itemCount || 0) > 0 && out.length >= Number(payload.itemCount || 0)) {
        break;
      }
    }

    return out;
  }

  async fetchAllTotdMonths(
    liveClient,
    { length = 12, maxPages = 200, onPageLoaded = null } = {}
  ) {
    const out = [];
    const safeLength = clampInt(length, { min: 1, max: 100, fallback: 12 });
    const safeMaxPages = clampInt(maxPages, { min: 1, max: 500, fallback: 200 });
    let offset = 0;

    for (let page = 0; page < safeMaxPages; page += 1) {
      const payload = await liveClient.getTotdMonths({
        length: safeLength,
        offset,
        royal: false,
      });
      const months = Array.isArray(payload?.monthList) ? payload.monthList : [];
      if (!months.length) break;
      out.push(...months);
      if (typeof onPageLoaded === "function") {
        onPageLoaded({
          page: page + 1,
          offset,
          pageSize: months.length,
          totalLoaded: out.length,
          totalKnown: Number(payload?.itemCount || 0) || null,
        });
      }
      offset += months.length;
      if (months.length < safeLength) break;
      if (Number(payload?.itemCount || 0) > 0 && out.length >= Number(payload.itemCount || 0)) {
        break;
      }
    }

    return out;
  }

  async fetchAllWeeklyGrandsCampaigns(
    liveClient,
    { length = 25, maxPages = 200, onPageLoaded = null } = {}
  ) {
    const out = [];
    const safeLength = clampInt(length, { min: 1, max: 100, fallback: 25 });
    const safeMaxPages = clampInt(maxPages, { min: 1, max: 500, fallback: 200 });
    let offset = 0;

    for (let page = 0; page < safeMaxPages; page += 1) {
      const payload = await liveClient.getWeeklyGrandsCampaigns({
        length: safeLength,
        offset,
      });
      const campaigns = Array.isArray(payload?.campaignList) ? payload.campaignList : [];
      if (!campaigns.length) break;
      out.push(...campaigns);
      if (typeof onPageLoaded === "function") {
        onPageLoaded({
          page: page + 1,
          offset,
          pageSize: campaigns.length,
          totalLoaded: out.length,
          totalKnown: Number(payload?.itemCount || 0) || null,
        });
      }
      offset += campaigns.length;
      if (campaigns.length < safeLength) break;
      if (Number(payload?.itemCount || 0) > 0 && out.length >= Number(payload.itemCount || 0)) {
        break;
      }
    }

    return out;
  }

  buildOfficialSeasonalCampaignSnapshots(rawCampaigns = [], mapDetailsByUid = new Map()) {
    return (Array.isArray(rawCampaigns) ? rawCampaigns : [])
      .map((campaign) => {
        const playlist = Array.isArray(campaign?.playlist) ? campaign.playlist : [];
        const canonicalWeek = resolveWeeklyGrandWeek({
          campaignName: campaign?.name,
          campaignPayload: campaign,
        });
        const maps = playlist
          .map((item, index) => {
            const mapUid = toText(item?.mapUid);
            if (!mapUid) return null;
            const detail = mapDetailsByUid.get(mapUid.toLowerCase()) || null;
            const slot = clampInt(
              item?.position !== undefined ? Number(item.position) + 1 : index + 1,
              { min: 1, max: 999, fallback: index + 1 }
            );
            return {
              ...(detail && typeof detail === "object" ? detail : {}),
              uid: mapUid,
              mapUid,
              name: toText(detail?.name || mapUid) || mapUid,
              downloadUrl: toText(detail?.fileUrl || detail?.downloadUrl || detail?.download_url) || null,
              thumbnailUrl: toText(detail?.thumbnailUrl || detail?.thumbnail_url) || null,
              tracked: false,
              status: "paused",
              slot,
              position: slot,
              raw: {
                ...(detail && typeof detail === "object" ? detail : {}),
                officialSeasonal: {
                  seasonUid: toText(campaign?.seasonUid) || null,
                  position: slot,
                },
                sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
                sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
              },
            };
          })
          .filter(Boolean);

        return {
          id: campaign?.id,
          name: toText(campaign?.name) || null,
          campaignType: OFFICIAL_SEASONAL_CAMPAIGN_TYPE,
          published: true,
          startTimestamp: campaign?.startTimestamp || null,
          endTimestamp: campaign?.endTimestamp || null,
          raw: {
            ...(campaign && typeof campaign === "object" ? campaign : {}),
            sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
            sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
            sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
          },
          maps,
        };
      })
      .filter((campaign) => toText(campaign?.name) && campaign.maps.length > 0);
  }

  buildTotdCampaignSnapshots(rawMonths = [], mapDetailsByUid = new Map()) {
    return (Array.isArray(rawMonths) ? rawMonths : [])
      .map((month) => {
        const year = clampInt(month?.year, { min: 2020, max: 2100, fallback: 0 }) || null;
        const monthNumber = clampInt(month?.month, { min: 1, max: 12, fallback: 0 }) || null;
        const name =
          year && monthNumber
            ? `TOTD ${String(year)}-${String(monthNumber).padStart(2, "0")}`
            : toText(month?.name) || null;
        const days = Array.isArray(month?.days) ? month.days : [];
        const maps = days
          .map((day, index) => {
            const mapUid = toText(day?.mapUid);
            if (!mapUid) return null;
            const detail = mapDetailsByUid.get(mapUid.toLowerCase()) || null;
            const slot = clampInt(
              day?.monthDay ?? day?.day ?? day?.position ?? index + 1,
              { min: 1, max: 31, fallback: index + 1 }
            );
            return {
              ...(detail && typeof detail === "object" ? detail : {}),
              uid: mapUid,
              mapUid,
              name: toText(detail?.name || mapUid) || mapUid,
              downloadUrl: toText(detail?.fileUrl || detail?.downloadUrl || detail?.download_url) || null,
              thumbnailUrl: toText(detail?.thumbnailUrl || detail?.thumbnail_url) || null,
              tracked: false,
              status: "paused",
              slot,
              position: slot,
              raw: {
                ...(detail && typeof detail === "object" ? detail : {}),
                totd: {
                  campaignId: Number(day?.campaignId || 0) || null,
                  monthDay: slot,
                  year,
                  month: monthNumber,
                  startTimestamp: day?.startTimestamp || null,
                  endTimestamp: day?.endTimestamp || null,
                },
                sourceKey: TOTD_SOURCE_KEY,
                sourceLabel: TOTD_SOURCE_LABEL,
              },
            };
          })
          .filter(Boolean);

        return {
          id: year && monthNumber ? Number(`${year}${String(monthNumber).padStart(2, "0")}`) : null,
          name,
          campaignType: TOTD_CAMPAIGN_TYPE,
          published: true,
          startTimestamp: maps[0]?.raw?.totd?.startTimestamp || null,
          endTimestamp: maps[maps.length - 1]?.raw?.totd?.endTimestamp || null,
          raw: {
            ...(month && typeof month === "object" ? month : {}),
            sourceKey: TOTD_SOURCE_KEY,
            sourceLabel: TOTD_SOURCE_LABEL,
            sourceType: TOTD_SOURCE_TYPE,
          },
          maps,
        };
      })
      .filter((campaign) => toText(campaign?.name) && campaign.maps.length > 0);
  }

  buildWeeklyGrandsCampaignSnapshots(rawCampaigns = [], mapDetailsByUid = new Map()) {
    return (Array.isArray(rawCampaigns) ? rawCampaigns : [])
      .map((campaign) => {
        const playlist = Array.isArray(campaign?.playlist) ? campaign.playlist : [];
        const canonicalWeek = resolveWeeklyGrandWeek({
          campaignName: campaign?.name,
          campaignPayload: campaign,
        });
        const maps = playlist
          .map((item, index) => {
            const mapUid = toText(item?.mapUid);
            if (!mapUid) return null;
            const detail = mapDetailsByUid.get(mapUid.toLowerCase()) || null;
            const slot = clampInt(
              item?.position !== undefined ? Number(item.position) + 1 : index + 1,
              { min: 1, max: 999, fallback: index + 1 }
            );
            return {
              ...(detail && typeof detail === "object" ? detail : {}),
              uid: mapUid,
              mapUid,
              name: toText(detail?.name || mapUid) || mapUid,
              downloadUrl: toText(detail?.fileUrl || detail?.downloadUrl || detail?.download_url) || null,
              thumbnailUrl: toText(detail?.thumbnailUrl || detail?.thumbnail_url) || null,
              tracked: false,
              status: "paused",
              slot,
              position: slot,
              raw: {
                ...(detail && typeof detail === "object" ? detail : {}),
                weeklyGrand: {
                  seasonUid: toText(campaign?.seasonUid) || null,
                  week: clampInt(campaign?.week, { min: 1, max: 60, fallback: 0 }) || null,
                  canonicalWeek: canonicalWeek || null,
                  isCanonicalNadeoWeek: Boolean(canonicalWeek),
                  year: clampInt(campaign?.year, { min: 2020, max: 2100, fallback: 0 }) || null,
                },
                sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
                sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
              },
            };
          })
          .filter(Boolean);

        return {
          id: campaign?.id,
          name: toText(campaign?.name) || null,
          campaignType: WEEKLY_GRANDS_CAMPAIGN_TYPE,
          published: true,
          startTimestamp: campaign?.startTimestamp || null,
          endTimestamp: campaign?.endTimestamp || null,
          raw: {
            ...(campaign && typeof campaign === "object" ? campaign : {}),
            weeklyGrand: {
              week: clampInt(campaign?.week, { min: 1, max: 60, fallback: 0 }) || null,
              canonicalWeek: canonicalWeek || null,
              isCanonicalNadeoWeek: Boolean(canonicalWeek),
            },
            sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
            sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
            sourceType: WEEKLY_GRANDS_SOURCE_TYPE,
          },
          maps,
        };
      })
      .filter((campaign) => toText(campaign?.name) && campaign.maps.length > 0);
  }

  buildDiscoveryCampaignSnapshots(rawCampaigns = [], mapDetailsByUid = new Map()) {
    return (Array.isArray(rawCampaigns) ? rawCampaigns : [])
      .map((payload) => {
        const campaign = payload?.campaign && typeof payload.campaign === "object" ? payload.campaign : payload;
        const playlist = Array.isArray(campaign?.playlist) ? campaign.playlist : [];
        const maps = playlist
          .map((item, index) => {
            const mapUid = toText(item?.mapUid);
            if (!mapUid) return null;
            const detail = mapDetailsByUid.get(mapUid.toLowerCase()) || null;
            const slot = clampInt(
              item?.position !== undefined ? Number(item.position) + 1 : index + 1,
              { min: 1, max: 999, fallback: index + 1 }
            );
            return {
              ...(detail && typeof detail === "object" ? detail : {}),
              uid: mapUid,
              mapUid,
              name: toText(detail?.name || mapUid) || mapUid,
              downloadUrl: toText(detail?.fileUrl || detail?.downloadUrl || detail?.download_url) || null,
              thumbnailUrl: toText(detail?.thumbnailUrl || detail?.thumbnail_url) || null,
              tracked: false,
              status: "paused",
              slot,
              position: slot,
              raw: {
                ...(detail && typeof detail === "object" ? detail : {}),
                discovery: {
                  canonicalClubId: DISCOVERY_SOURCE_CLUB_ID,
                  canonicalCampaignId:
                    Number(payload?.campaignId || campaign?.id || 0) || null,
                  mapsCount: Number(payload?.mapsCount || playlist.length || 0) || null,
                },
                sourceKey: DISCOVERY_SOURCE_KEY,
                sourceLabel: DISCOVERY_SOURCE_LABEL,
              },
            };
          })
          .filter(Boolean);

        return {
          id: Number(payload?.campaignId || campaign?.id || 0) || null,
          name: toText(payload?.name || campaign?.name) || null,
          campaignType: DISCOVERY_CAMPAIGN_TYPE,
          published: true,
          startTimestamp:
            payload?.publicationTimestamp ??
            campaign?.publicationTimestamp ??
            campaign?.startTimestamp ??
            null,
          endTimestamp: campaign?.endTimestamp || null,
          raw: {
            ...(payload && typeof payload === "object" ? payload : {}),
            sourceKey: DISCOVERY_SOURCE_KEY,
            sourceLabel: DISCOVERY_SOURCE_LABEL,
            sourceType: DISCOVERY_SOURCE_TYPE,
          },
          maps,
        };
      })
      .filter((campaign) => toText(campaign?.name) && campaign.maps.length > 0);
  }

  buildLegacyCampaignSnapshots(rawCampaigns = [], mapDetailsByUid = new Map()) {
    return (Array.isArray(rawCampaigns) ? rawCampaigns : [])
      .map((payload) => {
        const campaign = payload?.campaign && typeof payload.campaign === "object" ? payload.campaign : payload;
        const playlist = Array.isArray(campaign?.playlist) ? campaign.playlist : [];
        const descriptor = LEGACY_SOURCE_CAMPAIGNS.find(
          (d) => Number(d.campaignId) === Number(payload?.campaignId || campaign?.id || 0)
        );
        const campaignName = descriptor?.name || toText(payload?.name || campaign?.name) || null;
        const maps = playlist
          .map((item, index) => {
            const mapUid = toText(item?.mapUid);
            if (!mapUid) return null;
            const detail = mapDetailsByUid.get(mapUid.toLowerCase()) || null;
            const slot = clampInt(
              item?.position !== undefined ? Number(item.position) + 1 : index + 1,
              { min: 1, max: 999, fallback: index + 1 }
            );
            return {
              ...(detail && typeof detail === "object" ? detail : {}),
              uid: mapUid,
              mapUid,
              name: toText(detail?.name || mapUid) || mapUid,
              downloadUrl: toText(detail?.fileUrl || detail?.downloadUrl || detail?.download_url) || null,
              thumbnailUrl: toText(detail?.thumbnailUrl || detail?.thumbnail_url) || null,
              tracked: false,
              status: "paused",
              slot,
              position: slot,
              raw: {
                ...(detail && typeof detail === "object" ? detail : {}),
                legacy: {
                  canonicalClubId: LEGACY_SOURCE_CLUB_ID,
                  canonicalCampaignId:
                    Number(payload?.campaignId || campaign?.id || 0) || null,
                  mapsCount: Number(payload?.mapsCount || playlist.length || 0) || null,
                },
                sourceKey: LEGACY_SOURCE_KEY,
                sourceLabel: LEGACY_SOURCE_LABEL,
              },
            };
          })
          .filter(Boolean);

        return {
          id: Number(payload?.campaignId || campaign?.id || 0) || null,
          name: campaignName,
          campaignType: LEGACY_CAMPAIGN_TYPE,
          published: true,
          startTimestamp:
            payload?.publicationTimestamp ??
            campaign?.publicationTimestamp ??
            campaign?.startTimestamp ??
            null,
          endTimestamp: campaign?.endTimestamp || null,
          raw: {
            ...(payload && typeof payload === "object" ? payload : {}),
            sourceKey: LEGACY_SOURCE_KEY,
            sourceLabel: LEGACY_SOURCE_LABEL,
            sourceType: LEGACY_SOURCE_TYPE,
          },
          maps,
        };
      })
      .filter((campaign) => toText(campaign?.name) && campaign.maps.length > 0);
  }

  buildCompetitionCampaignSnapshots(rawCampaigns = []) {
    return (Array.isArray(rawCampaigns) ? rawCampaigns : [])
      .map((campaign) => {
        const maps = (Array.isArray(campaign?.maps) ? campaign.maps : [])
          .map((map, index) => {
            const mapUid = toText(map?.uid || map?.mapUid || map?.map_uid);
            if (!mapUid) return null;
            const slot = clampInt(
              map?.slot ?? map?.position ?? index + 1,
              { min: 1, max: 999, fallback: index + 1 }
            );
            return {
              ...(map && typeof map === "object" ? map : {}),
              uid: mapUid,
              mapUid,
              name: toText(map?.name || mapUid) || mapUid,
              downloadUrl: toText(map?.downloadUrl || map?.fileUrl || map?.download_url) || null,
              thumbnailUrl: toText(map?.thumbnailUrl || map?.thumbnail_url) || null,
              tracked: false,
              status: "paused",
              slot,
              position: slot,
              raw: {
                ...(map?.raw && typeof map.raw === "object" ? map.raw : map && typeof map === "object" ? map : {}),
                sourceKey: COMPETITION_SOURCE_KEY,
                sourceLabel: COMPETITION_SOURCE_LABEL,
              },
            };
          })
          .filter(Boolean);

        return {
          id: Number(campaign?.campaignId || campaign?.id || 0) || null,
          name: toText(campaign?.name) || null,
          campaignType: COMPETITION_CAMPAIGN_TYPE,
          published: true,
          startTimestamp: campaign?.startTimestamp || null,
          endTimestamp: campaign?.endTimestamp || null,
          raw: {
            ...(campaign?.raw && typeof campaign.raw === "object" ? campaign.raw : campaign && typeof campaign === "object" ? campaign : {}),
            sourceKey: COMPETITION_SOURCE_KEY,
            sourceLabel: COMPETITION_SOURCE_LABEL,
            sourceType: COMPETITION_SOURCE_TYPE,
          },
          maps,
        };
      })
      .filter((campaign) => toText(campaign?.name) && campaign.maps.length > 0);
  }

  async fetchAllWeeklyShortsCampaigns(
    liveClient,
    { length = 10, maxPages = 100, onPageLoaded = null } = {}
  ) {
    const out = [];
    const safeLength = clampInt(length, { min: 1, max: 50, fallback: 10 });
    const safeMaxPages = clampInt(maxPages, { min: 1, max: 500, fallback: 100 });
    let offset = 0;

    for (let page = 0; page < safeMaxPages; page += 1) {
      const payload = await liveClient.getWeeklyShortsCampaigns({
        length: safeLength,
        offset,
      });
      const campaigns = Array.isArray(payload?.campaignList) ? payload.campaignList : [];
      if (!campaigns.length) break;
      out.push(...campaigns);
      if (typeof onPageLoaded === "function") {
        onPageLoaded({
          page: page + 1,
          offset,
          pageSize: campaigns.length,
          totalLoaded: out.length,
          totalKnown: Number(payload?.itemCount || 0) || null,
        });
      }
      offset += campaigns.length;
      if (campaigns.length < safeLength) break;
      if (Number(payload?.itemCount || 0) > 0 && out.length >= Number(payload.itemCount || 0)) {
        break;
      }
    }

    return out;
  }

  buildWeeklyShortsCampaignSnapshots(rawCampaigns = [], mapDetailsByUid = new Map()) {
    return (Array.isArray(rawCampaigns) ? rawCampaigns : [])
      .map((campaign) => {
        const week = resolveWeeklyShortsWeek({
          campaignName: campaign?.name,
          campaignPayload: campaign,
        });
        const canonicalWeek = resolveCanonicalWeeklyShortsWeek(week);
        const playlist = Array.isArray(campaign?.playlist) ? campaign.playlist : [];
        const maps = playlist
          .map((item, index) => {
            const mapUid = toText(item?.mapUid);
            if (!mapUid) return null;
            const detail = mapDetailsByUid.get(mapUid.toLowerCase()) || {};
            const slot = clampInt(
              item?.position !== undefined ? Number(item.position) + 1 : index + 1,
              { min: 1, max: 999, fallback: index + 1 }
            );
            const weeklyEntry = resolveWeeklyShortsEntry({
              campaignName: campaign?.name,
              campaignPayload: campaign,
              mapPayload: detail,
              slot,
              mapName: detail?.name,
              filename: detail?.filename,
            });
            return {
              ...detail,
              uid: mapUid,
              mapUid,
              name: toText(detail?.name || weeklyEntry?.title || mapUid),
              tracked: Boolean(canonicalWeek),
              status: canonicalWeek ? "live" : "paused",
              slot,
              position: slot,
              raw: {
                ...(detail && typeof detail === "object" ? detail : {}),
                weeklyShorts: {
                  week: Number(week || 0) || null,
                  canonicalWeek: canonicalWeek || null,
                  isCanonicalNadeoWeek: Boolean(canonicalWeek),
                  position: slot,
                  absoluteMapNumber: Number(weeklyEntry?.mapNumber || 0) || null,
                  canonicalTitle: toText(weeklyEntry?.title) || null,
                },
                sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
                sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
              },
            };
          })
          .filter(Boolean);

        return {
          id: campaign?.id,
          name: toText(campaign?.name) || (week ? `Week ${week}` : "Weekly Shorts"),
          campaignType: WEEKLY_SHORTS_CAMPAIGN_TYPE,
          published: true,
          startTimestamp: campaign?.startTimestamp || null,
          endTimestamp: campaign?.endTimestamp || null,
          raw: {
            ...(campaign && typeof campaign === "object" ? campaign : {}),
            weeklyShorts: {
              week: Number(week || 0) || null,
              canonicalWeek: canonicalWeek || null,
              isCanonicalNadeoWeek: Boolean(canonicalWeek),
            },
            sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
            sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
            sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
          },
          maps,
        };
      })
      .filter((campaign) => campaign.maps.length > 0);
  }

  normalizeWeeklyShortsImportRoots(importRoots = []) {
    const rawRoots = Array.isArray(importRoots) && importRoots.length
      ? importRoots
      : getDefaultWeeklyShortsImportRoots();
    return normalizeUniqueStrings(rawRoots.map((root) => toText(root)).filter(Boolean));
  }

  async importWeeklyShortsLocalFiles({
    campaigns = [],
    importRoots = [],
  } = {}) {
    const roots = this.normalizeWeeklyShortsImportRoots(importRoots);
    const mapInfoByAbsoluteNumber = new Map();
    for (const campaign of Array.isArray(campaigns) ? campaigns : []) {
      const week = resolveWeeklyShortsWeek({
        campaignName: campaign?.name,
        campaignPayload: campaign?.raw,
      });
      for (const map of Array.isArray(campaign?.maps) ? campaign.maps : []) {
        const slot = clampInt(map?.slot, { min: 1, max: 5, fallback: 0 }) || null;
        const weeklyEntry = resolveWeeklyShortsEntry({
          campaignName: campaign?.name,
          campaignPayload: campaign?.raw,
          mapPayload: map?.raw,
          slot,
          mapName: map?.name,
          filename: map?.filename,
        });
        if (!weeklyEntry?.mapNumber) continue;
        mapInfoByAbsoluteNumber.set(weeklyEntry.mapNumber, {
          mapUid: resolveMapUid(map),
          mapName: toText(map?.name || weeklyEntry.title || resolveMapUid(map)),
          downloadUrl: resolveMapDownloadUrl(map),
          campaignName: campaign?.name || null,
          slot,
          week: Number(week || 0) || null,
          title: toText(weeklyEntry.title) || null,
        });
      }
    }

    const summary = {
      rootsScanned: roots.length,
      rootsFound: 0,
      filesSeen: 0,
      filesImported: 0,
      filesSkipped: 0,
      missingRoots: [],
      unmatchedFiles: [],
      signaturesReady: 0,
    };
    const upsertRecords = [];
    const mapInfosForSignatures = [];

    for (const root of roots) {
      try {
        const stat = await fs.stat(root);
        if (!stat.isDirectory()) {
          summary.missingRoots.push(root);
          continue;
        }
      } catch {
        summary.missingRoots.push(root);
        continue;
      }
      summary.rootsFound += 1;
      const week =
        resolveWeeklyShortsWeek({
          campaignName: path.basename(root),
        }) ||
        extractMapNumberFromText(path.basename(root), {});
      const dirEntries = await fs.readdir(root, { withFileTypes: true });
      for (const dirEntry of dirEntries) {
        if (!dirEntry.isFile() || !/\.map\.gbx$/i.test(dirEntry.name)) continue;
        summary.filesSeen += 1;
        const sourcePath = path.join(root, dirEntry.name);
        const title = dirEntry.name.replace(/\.map\.gbx$/i, "");
        const weeklyEntry = resolveWeeklyShortsEntry({
          campaignName: week ? `Week ${week}` : "",
          campaignPayload: week ? { week } : null,
          mapName: title,
          filename: title,
        });
        const absoluteMapNumber = Number(weeklyEntry?.mapNumber || 0) || null;
        const target = absoluteMapNumber ? mapInfoByAbsoluteNumber.get(absoluteMapNumber) : null;
        if (!target?.mapUid) {
          summary.filesSkipped += 1;
          summary.unmatchedFiles.push(sourcePath);
          continue;
        }
        const buffer = await fs.readFile(sourcePath);
        const fileSha256 = createHash("sha256").update(buffer).digest("hex");
        const relativePath = buildLocalMapRelativePath(target.mapUid);
        const absolutePath = this.getLocalMapFileAbsolutePath(target.mapUid, relativePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        const tempPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
        await fs.writeFile(tempPath, buffer);
        await fs.rename(tempPath, absolutePath);
        const now = new Date().toISOString();
        upsertRecords.push({
          mapUid: target.mapUid,
          relativePath,
          downloadUrl: target.downloadUrl || null,
          fileSha256,
          fileSizeBytes: buffer.length,
          downloadedAt: now,
          verifiedAt: now,
          status: "ready",
          lastError: null,
        });
        mapInfosForSignatures.push({
          mapUid: target.mapUid,
          name: target.mapName,
          downloadUrl: target.downloadUrl || null,
          campaignName: target.campaignName || null,
          slot: target.slot || null,
        });
        summary.filesImported += 1;
      }
    }

    if (upsertRecords.length) {
      const upsert = this.repository.upsertMapLocalFiles({ records: upsertRecords });
      if (upsert?.error) {
        return {
          error: upsert.error,
          ...summary,
        };
      }
      const signatures = await this.ensureMapContentSignatures(mapInfosForSignatures, {
        force: false,
      });
      summary.signaturesReady = Number(signatures?.summary?.parsed || 0) + Number(signatures?.summary?.reused || 0);
    }

    return summary;
  }

  async syncOfficialSeasonalSource({ authContext = null } = {}) {
    if (typeof this.repository?.upsertProjectSource === "function") {
      this.repository.upsertProjectSource({
        sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
        sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
        displayName: OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
        sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
        enabled: true,
        metadata: {
          campaignType: OFFICIAL_SEASONAL_CAMPAIGN_TYPE,
          storageClubId: 0,
        },
      });
    }

    const resolvedLive = await this.resolveLiveClient({ authContext });
    if (resolvedLive?.error) {
      this.repository.upsertProjectSource({
        sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
        sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
        displayName: OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
        sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedLive.error,
      });
      return { error: resolvedLive.error };
    }

    const resolvedCore = await this.resolveCoreMapClient({ authContext });
    if (resolvedCore?.error) {
      this.repository.upsertProjectSource({
        sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
        sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
        displayName: OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
        sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedCore.error,
      });
      return { error: resolvedCore.error };
    }

    const liveClient = resolvedLive.liveClient;
    const coreClient = resolvedCore.coreClient;
    const rawCampaigns = await this.fetchAllOfficialSeasonalCampaigns(liveClient, {
      length: 25,
    });
    const mapUids = normalizeUniqueStrings(
      rawCampaigns.flatMap((campaign) =>
        (Array.isArray(campaign?.playlist) ? campaign.playlist : []).map((entry) => toText(entry?.mapUid))
      )
    );
    const mapDetails = await coreClient.getCoreMapsByUidList(mapUids);
    const mapDetailsByUid = new Map(
      (Array.isArray(mapDetails) ? mapDetails : [])
        .filter((map) => toText(map?.mapUid || map?.uid))
        .map((map) => [toText(map.mapUid || map.uid).toLowerCase(), map])
    );
    const campaigns = this.buildOfficialSeasonalCampaignSnapshots(rawCampaigns, mapDetailsByUid);
    if (!campaigns.length) {
      this.repository.upsertProjectSource({
        sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
        sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
        displayName: OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
        sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
        enabled: true,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        summary: {
          campaignCount: 0,
          mapCount: 0,
          trackedCount: 0,
        },
        metadata: {
          campaignType: OFFICIAL_SEASONAL_CAMPAIGN_TYPE,
          storageClubId: 0,
        },
      });
      return {
        ok: true,
        source: this.getOfficialSeasonalSourceStatus(),
        campaigns: [],
        ingest: null,
      };
    }

    const ingest = this.repository.ingestProjectSourceSnapshot({
      sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
      sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
      displayName: OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
      sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
      campaignType: OFFICIAL_SEASONAL_CAMPAIGN_TYPE,
      clubId: 0,
      campaigns,
      note: "official-seasonal-sync",
      trackedDefault: false,
    });
    if (ingest?.error) {
      this.repository.upsertProjectSource({
        sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
        sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
        displayName: OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
        sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
        enabled: true,
        lastError: ingest.error,
      });
      return ingest;
    }

    const touchedMapUids = this.collectCampaignSnapshotMapUids(campaigns);
    const automaticNaming = await this.runAutomaticNamingAssignments({
      mapUids: touchedMapUids,
      persistCandidates: true,
    });

    const summary = {
      campaignCount: Number(ingest?.campaignsSeen || 0),
      mapCount: Number(ingest?.mapsSeen || 0),
      trackedCount: Array.isArray(ingest?.mapsForTracker) ? ingest.mapsForTracker.length : 0,
      metadataAssignment: automaticNaming.metadataAssignment,
      namingAssignment: automaticNaming.namingAssignment,
      authSource: resolvedLive?.authSource || resolvedCore?.authSource || null,
      ...this.getLatestCampaignReleaseWindow(rawCampaigns),
    };

    this.repository.upsertProjectSource({
      sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
      sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
      displayName: OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
      sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
      enabled: true,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      summary,
      metadata: {
        campaignType: OFFICIAL_SEASONAL_CAMPAIGN_TYPE,
        storageClubId: 0,
      },
    });

    return {
      ok: true,
      source: this.getOfficialSeasonalSourceStatus(),
      campaigns,
      ingest,
      metadataAssignment: automaticNaming.metadataAssignment,
      namingAssignment: automaticNaming.namingAssignment,
    };
  }

  async ensureOfficialSeasonalSourceFresh({
    authContext = null,
    force = false,
    maxAgeMs = OFFICIAL_SEASONAL_SOURCE_MAX_AGE_MS,
  } = {}) {
    const source = this.getOfficialSeasonalSourceStatus();
    const lastSyncedAtMs = Date.parse(String(source?.lastSyncedAt || "").trim());
    const hasFreshSync =
      !force &&
      Number.isFinite(lastSyncedAtMs) &&
      Date.now() - lastSyncedAtMs <= Math.max(0, Number(maxAgeMs || 0) || 0) &&
      !toText(source?.lastError);
    if (hasFreshSync && Number(source?.campaignCount || 0) > 0 && Number(source?.mapCount || 0) > 0) {
      return {
        ok: true,
        skipped: true,
        source,
      };
    }
    return this.syncOfficialSeasonalSource({ authContext });
  }

  async ensureTotdSourceAvailable({ authContext = null } = {}) {
    const source = this.getTotdSourceStatus();
    if (Number(source?.campaignCount || 0) > 0 && Number(source?.mapCount || 0) > 0 && !toText(source?.lastError)) {
      return { ok: true, skipped: true, source };
    }
    return this.syncTotdSource({ authContext });
  }

  async ensureCompetitionSourceAvailable({ authContext = null } = {}) {
    const source = this.getCompetitionSourceStatus();
    if (Number(source?.campaignCount || 0) > 0 && Number(source?.mapCount || 0) > 0 && !toText(source?.lastError)) {
      return { ok: true, skipped: true, source };
    }
    return this.syncCompetitionSource({ authContext });
  }

  async syncTotdSource({ authContext = null } = {}) {
    if (typeof this.repository?.upsertProjectSource === "function") {
      this.repository.upsertProjectSource({
        sourceKey: TOTD_SOURCE_KEY,
        sourceType: TOTD_SOURCE_TYPE,
        displayName: TOTD_SOURCE_DISPLAY_NAME,
        sourceLabel: TOTD_SOURCE_LABEL,
        enabled: true,
        metadata: {
          campaignType: TOTD_CAMPAIGN_TYPE,
          storageClubId: 0,
        },
      });
    }

    const resolvedLive = await this.resolveLiveClient({ authContext });
    if (resolvedLive?.error) {
      this.repository.upsertProjectSource({
        sourceKey: TOTD_SOURCE_KEY,
        sourceType: TOTD_SOURCE_TYPE,
        displayName: TOTD_SOURCE_DISPLAY_NAME,
        sourceLabel: TOTD_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedLive.error,
      });
      return { error: resolvedLive.error };
    }

    const resolvedCore = await this.resolveCoreMapClient({ authContext });
    if (resolvedCore?.error) {
      this.repository.upsertProjectSource({
        sourceKey: TOTD_SOURCE_KEY,
        sourceType: TOTD_SOURCE_TYPE,
        displayName: TOTD_SOURCE_DISPLAY_NAME,
        sourceLabel: TOTD_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedCore.error,
      });
      return { error: resolvedCore.error };
    }

    const rawMonths = await this.fetchAllTotdMonths(resolvedLive.liveClient, {
      length: 12,
    });
    const mapUids = normalizeUniqueStrings(
      rawMonths.flatMap((month) =>
        (Array.isArray(month?.days) ? month.days : []).map((entry) => toText(entry?.mapUid))
      )
    );
    const mapDetails = await resolvedCore.coreClient.getCoreMapsByUidList(mapUids);
    const mapDetailsByUid = new Map(
      (Array.isArray(mapDetails) ? mapDetails : [])
        .filter((map) => toText(map?.mapUid || map?.uid))
        .map((map) => [toText(map.mapUid || map.uid).toLowerCase(), map])
    );
    const campaigns = this.buildTotdCampaignSnapshots(rawMonths, mapDetailsByUid);
    const ingest = campaigns.length
      ? this.repository.ingestProjectSourceSnapshot({
          sourceKey: TOTD_SOURCE_KEY,
          sourceType: TOTD_SOURCE_TYPE,
          displayName: TOTD_SOURCE_DISPLAY_NAME,
          sourceLabel: TOTD_SOURCE_LABEL,
          campaignType: TOTD_CAMPAIGN_TYPE,
          clubId: 0,
          campaigns,
          note: "totd-sync",
          trackedDefault: false,
        })
      : null;
    if (ingest?.error) {
      this.repository.upsertProjectSource({
        sourceKey: TOTD_SOURCE_KEY,
        sourceType: TOTD_SOURCE_TYPE,
        displayName: TOTD_SOURCE_DISPLAY_NAME,
        sourceLabel: TOTD_SOURCE_LABEL,
        enabled: true,
        lastError: ingest.error,
      });
      return ingest;
    }

    const touchedMapUids = this.collectCampaignSnapshotMapUids(campaigns);
    const automaticNaming = await this.runAutomaticNamingAssignments({
      mapUids: touchedMapUids,
      persistCandidates: true,
    });

    this.repository.upsertProjectSource({
      sourceKey: TOTD_SOURCE_KEY,
      sourceType: TOTD_SOURCE_TYPE,
      displayName: TOTD_SOURCE_DISPLAY_NAME,
      sourceLabel: TOTD_SOURCE_LABEL,
      enabled: true,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      summary: {
        campaignCount: Number(ingest?.campaignsSeen || campaigns.length || 0),
        mapCount: Number(ingest?.mapsSeen || mapUids.length || 0),
        trackedCount: 0,
        metadataAssignment: automaticNaming.metadataAssignment,
        namingAssignment: automaticNaming.namingAssignment,
        authSource: resolvedLive?.authSource || resolvedCore?.authSource || null,
        ...this.getLatestTotdReleaseWindow(rawMonths),
      },
      metadata: {
        campaignType: TOTD_CAMPAIGN_TYPE,
        storageClubId: 0,
      },
    });

    return {
      ok: true,
      source: this.getTotdSourceStatus(),
      months: rawMonths,
      campaigns,
      ingest,
      metadataAssignment: automaticNaming.metadataAssignment,
      namingAssignment: automaticNaming.namingAssignment,
    };
  }

  async syncWeeklyGrandsSource({ authContext = null } = {}) {
    if (typeof this.repository?.upsertProjectSource === "function") {
      this.repository.upsertProjectSource({
        sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
        sourceType: WEEKLY_GRANDS_SOURCE_TYPE,
        displayName: WEEKLY_GRANDS_SOURCE_DISPLAY_NAME,
        sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
        enabled: true,
        metadata: {
          campaignType: WEEKLY_GRANDS_CAMPAIGN_TYPE,
          storageClubId: 0,
        },
      });
    }

    const resolvedLive = await this.resolveLiveClient({ authContext });
    if (resolvedLive?.error) {
      this.repository.upsertProjectSource({
        sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
        sourceType: WEEKLY_GRANDS_SOURCE_TYPE,
        displayName: WEEKLY_GRANDS_SOURCE_DISPLAY_NAME,
        sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedLive.error,
      });
      return { error: resolvedLive.error };
    }

    const resolvedCore = await this.resolveCoreMapClient({ authContext });
    if (resolvedCore?.error) {
      this.repository.upsertProjectSource({
        sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
        sourceType: WEEKLY_GRANDS_SOURCE_TYPE,
        displayName: WEEKLY_GRANDS_SOURCE_DISPLAY_NAME,
        sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedCore.error,
      });
      return { error: resolvedCore.error };
    }

    const rawCampaigns = await this.fetchAllWeeklyGrandsCampaigns(resolvedLive.liveClient, {
      length: 25,
    });
    const mapUids = normalizeUniqueStrings(
      rawCampaigns.flatMap((campaign) =>
        (Array.isArray(campaign?.playlist) ? campaign.playlist : []).map((entry) => toText(entry?.mapUid))
      )
    );
    const mapDetails = await resolvedCore.coreClient.getCoreMapsByUidList(mapUids);
    const mapDetailsByUid = new Map(
      (Array.isArray(mapDetails) ? mapDetails : [])
        .filter((map) => toText(map?.mapUid || map?.uid))
        .map((map) => [toText(map.mapUid || map.uid).toLowerCase(), map])
    );
    const campaigns = this.buildWeeklyGrandsCampaignSnapshots(rawCampaigns, mapDetailsByUid);
    const ingest = campaigns.length
      ? this.repository.ingestProjectSourceSnapshot({
          sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
          sourceType: WEEKLY_GRANDS_SOURCE_TYPE,
          displayName: WEEKLY_GRANDS_SOURCE_DISPLAY_NAME,
          sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
          campaignType: WEEKLY_GRANDS_CAMPAIGN_TYPE,
          clubId: 0,
          campaigns,
          note: "weekly-grands-sync",
          trackedDefault: false,
        })
      : null;
    if (ingest?.error) {
      this.repository.upsertProjectSource({
        sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
        sourceType: WEEKLY_GRANDS_SOURCE_TYPE,
        displayName: WEEKLY_GRANDS_SOURCE_DISPLAY_NAME,
        sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
        enabled: true,
        lastError: ingest.error,
      });
      return ingest;
    }

    const touchedMapUids = this.collectCampaignSnapshotMapUids(campaigns);
    const automaticNaming = await this.runAutomaticNamingAssignments({
      mapUids: touchedMapUids,
      persistCandidates: true,
    });

    this.repository.upsertProjectSource({
      sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
      sourceType: WEEKLY_GRANDS_SOURCE_TYPE,
      displayName: WEEKLY_GRANDS_SOURCE_DISPLAY_NAME,
      sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
      enabled: true,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      summary: {
        campaignCount: Number(ingest?.campaignsSeen || campaigns.length || 0),
        mapCount: Number(ingest?.mapsSeen || mapUids.length || 0),
        trackedCount: 0,
        metadataAssignment: automaticNaming.metadataAssignment,
        namingAssignment: automaticNaming.namingAssignment,
        canonicalCampaignCount: campaigns.filter((campaign) => Boolean(campaign?.raw?.weeklyGrand?.isCanonicalNadeoWeek)).length,
        canonicalMapCount: campaigns.reduce(
          (sum, campaign) =>
            sum +
            (Array.isArray(campaign?.maps)
              ? campaign.maps.filter((map) => Boolean(map?.raw?.weeklyGrand?.isCanonicalNadeoWeek)).length
              : 0),
          0
        ),
        authSource: resolvedLive?.authSource || resolvedCore?.authSource || null,
        ...this.getLatestCampaignReleaseWindow(rawCampaigns),
      },
      metadata: {
        campaignType: WEEKLY_GRANDS_CAMPAIGN_TYPE,
        storageClubId: 0,
      },
    });

    return {
      ok: true,
      source: this.getWeeklyGrandsSourceStatus(),
      campaigns,
      ingest,
      metadataAssignment: automaticNaming.metadataAssignment,
      namingAssignment: automaticNaming.namingAssignment,
    };
  }

  async syncDiscoverySource({ authContext = null } = {}) {
    if (typeof this.repository?.upsertProjectSource === "function") {
      this.repository.upsertProjectSource({
        sourceKey: DISCOVERY_SOURCE_KEY,
        sourceType: DISCOVERY_SOURCE_TYPE,
        displayName: DISCOVERY_SOURCE_DISPLAY_NAME,
        sourceLabel: DISCOVERY_SOURCE_LABEL,
        enabled: true,
        metadata: {
          campaignType: DISCOVERY_CAMPAIGN_TYPE,
          storageClubId: DISCOVERY_SOURCE_CLUB_ID,
          campaignIds: DISCOVERY_SOURCE_CAMPAIGNS.map((campaign) => campaign.campaignId),
        },
      });
    }

    const resolvedLive = await this.resolveLiveClient({ authContext });
    if (resolvedLive?.error) {
      this.repository.upsertProjectSource({
        sourceKey: DISCOVERY_SOURCE_KEY,
        sourceType: DISCOVERY_SOURCE_TYPE,
        displayName: DISCOVERY_SOURCE_DISPLAY_NAME,
        sourceLabel: DISCOVERY_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedLive.error,
      });
      return { error: resolvedLive.error };
    }

    const resolvedCore = await this.resolveCoreMapClient({ authContext });
    if (resolvedCore?.error) {
      this.repository.upsertProjectSource({
        sourceKey: DISCOVERY_SOURCE_KEY,
        sourceType: DISCOVERY_SOURCE_TYPE,
        displayName: DISCOVERY_SOURCE_DISPLAY_NAME,
        sourceLabel: DISCOVERY_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedCore.error,
      });
      return { error: resolvedCore.error };
    }

    const rawCampaigns = [];
    for (const descriptor of DISCOVERY_SOURCE_CAMPAIGNS) {
      try {
        const payload = await resolvedLive.liveClient.getClubCampaignById(
          DISCOVERY_SOURCE_CLUB_ID,
          descriptor.campaignId
        );
        rawCampaigns.push(payload);
      } catch (error) {
        return {
          error:
            error?.message ||
            `Failed to load discovery campaign ${descriptor.campaignId}.`,
        };
      }
    }

    const mapUids = normalizeUniqueStrings(
      rawCampaigns.flatMap((payload) =>
        (Array.isArray(payload?.campaign?.playlist) ? payload.campaign.playlist : []).map((entry) => toText(entry?.mapUid))
      )
    );
    const mapDetails = await resolvedCore.coreClient.getCoreMapsByUidList(mapUids);
    const mapDetailsByUid = new Map(
      (Array.isArray(mapDetails) ? mapDetails : [])
        .filter((map) => toText(map?.mapUid || map?.uid))
        .map((map) => [toText(map.mapUid || map.uid).toLowerCase(), map])
    );
    const campaigns = this.buildDiscoveryCampaignSnapshots(rawCampaigns, mapDetailsByUid);
    const ingest = campaigns.length
      ? this.repository.ingestProjectSourceSnapshot({
          sourceKey: DISCOVERY_SOURCE_KEY,
          sourceType: DISCOVERY_SOURCE_TYPE,
          displayName: DISCOVERY_SOURCE_DISPLAY_NAME,
          sourceLabel: DISCOVERY_SOURCE_LABEL,
          campaignType: DISCOVERY_CAMPAIGN_TYPE,
          clubId: 0,
          campaigns,
          note: "official-discovery-sync",
          trackedDefault: false,
        })
      : null;
    if (ingest?.error) {
      this.repository.upsertProjectSource({
        sourceKey: DISCOVERY_SOURCE_KEY,
        sourceType: DISCOVERY_SOURCE_TYPE,
        displayName: DISCOVERY_SOURCE_DISPLAY_NAME,
        sourceLabel: DISCOVERY_SOURCE_LABEL,
        enabled: true,
        lastError: ingest.error,
      });
      return ingest;
    }

    const touchedMapUids = this.collectCampaignSnapshotMapUids(campaigns);
    const automaticNaming = await this.runAutomaticNamingAssignments({
      mapUids: touchedMapUids,
      persistCandidates: true,
    });

    this.repository.upsertProjectSource({
      sourceKey: DISCOVERY_SOURCE_KEY,
      sourceType: DISCOVERY_SOURCE_TYPE,
      displayName: DISCOVERY_SOURCE_DISPLAY_NAME,
      sourceLabel: DISCOVERY_SOURCE_LABEL,
      enabled: true,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      summary: {
        campaignCount: Number(ingest?.campaignsSeen || campaigns.length || 0),
        mapCount: Number(ingest?.mapsSeen || mapUids.length || 0),
        trackedCount: 0,
        metadataAssignment: automaticNaming.metadataAssignment,
        namingAssignment: automaticNaming.namingAssignment,
        authSource: resolvedLive?.authSource || resolvedCore?.authSource || null,
        ...this.getLatestCampaignReleaseWindow(rawCampaigns.map((payload) => payload?.campaign || payload)),
      },
      metadata: {
        campaignType: DISCOVERY_CAMPAIGN_TYPE,
        storageClubId: DISCOVERY_SOURCE_CLUB_ID,
        campaignIds: DISCOVERY_SOURCE_CAMPAIGNS.map((campaign) => campaign.campaignId),
      },
    });

    return {
      ok: true,
      source: this.getDiscoverySourceStatus(),
      campaigns,
      ingest,
      metadataAssignment: automaticNaming.metadataAssignment,
      namingAssignment: automaticNaming.namingAssignment,
    };
  }

  async syncLegacySource({ authContext = null } = {}) {
    if (typeof this.repository?.upsertProjectSource === "function") {
      this.repository.upsertProjectSource({
        sourceKey: LEGACY_SOURCE_KEY,
        sourceType: LEGACY_SOURCE_TYPE,
        displayName: LEGACY_SOURCE_DISPLAY_NAME,
        sourceLabel: LEGACY_SOURCE_LABEL,
        enabled: true,
        metadata: {
          campaignType: LEGACY_CAMPAIGN_TYPE,
          storageClubId: LEGACY_SOURCE_CLUB_ID,
          campaignIds: LEGACY_SOURCE_CAMPAIGNS.map((campaign) => campaign.campaignId),
        },
      });
    }

    const resolvedLive = await this.resolveLiveClient({ authContext });
    if (resolvedLive?.error) {
      this.repository.upsertProjectSource({
        sourceKey: LEGACY_SOURCE_KEY,
        sourceType: LEGACY_SOURCE_TYPE,
        displayName: LEGACY_SOURCE_DISPLAY_NAME,
        sourceLabel: LEGACY_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedLive.error,
      });
      return { error: resolvedLive.error };
    }

    const resolvedCore = await this.resolveCoreMapClient({ authContext });
    if (resolvedCore?.error) {
      this.repository.upsertProjectSource({
        sourceKey: LEGACY_SOURCE_KEY,
        sourceType: LEGACY_SOURCE_TYPE,
        displayName: LEGACY_SOURCE_DISPLAY_NAME,
        sourceLabel: LEGACY_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedCore.error,
      });
      return { error: resolvedCore.error };
    }

    const rawCampaigns = [];
    for (const descriptor of LEGACY_SOURCE_CAMPAIGNS) {
      try {
        const payload = await resolvedLive.liveClient.getClubCampaignById(
          LEGACY_SOURCE_CLUB_ID,
          descriptor.campaignId
        );
        rawCampaigns.push(payload);
      } catch (error) {
        return {
          error:
            error?.message ||
            `Failed to load legacy campaign ${descriptor.campaignId}.`,
        };
      }
    }

    const mapUids = normalizeUniqueStrings(
      rawCampaigns.flatMap((payload) =>
        (Array.isArray(payload?.campaign?.playlist) ? payload.campaign.playlist : []).map((entry) => toText(entry?.mapUid))
      )
    );
    const mapDetails = await resolvedCore.coreClient.getCoreMapsByUidList(mapUids);
    const mapDetailsByUid = new Map(
      (Array.isArray(mapDetails) ? mapDetails : [])
        .filter((map) => toText(map?.mapUid || map?.uid))
        .map((map) => [toText(map.mapUid || map.uid).toLowerCase(), map])
    );
    const campaigns = this.buildLegacyCampaignSnapshots(rawCampaigns, mapDetailsByUid);
    const ingest = campaigns.length
      ? this.repository.ingestProjectSourceSnapshot({
          sourceKey: LEGACY_SOURCE_KEY,
          sourceType: LEGACY_SOURCE_TYPE,
          displayName: LEGACY_SOURCE_DISPLAY_NAME,
          sourceLabel: LEGACY_SOURCE_LABEL,
          campaignType: LEGACY_CAMPAIGN_TYPE,
          clubId: 0,
          campaigns,
          note: "official-legacy-sync",
          trackedDefault: false,
        })
      : null;
    if (ingest?.error) {
      this.repository.upsertProjectSource({
        sourceKey: LEGACY_SOURCE_KEY,
        sourceType: LEGACY_SOURCE_TYPE,
        displayName: LEGACY_SOURCE_DISPLAY_NAME,
        sourceLabel: LEGACY_SOURCE_LABEL,
        enabled: true,
        lastError: ingest.error,
      });
      return ingest;
    }

    const touchedMapUids = this.collectCampaignSnapshotMapUids(campaigns);
    const automaticNaming = await this.runAutomaticNamingAssignments({
      mapUids: touchedMapUids,
      persistCandidates: true,
    });

    this.repository.upsertProjectSource({
      sourceKey: LEGACY_SOURCE_KEY,
      sourceType: LEGACY_SOURCE_TYPE,
      displayName: LEGACY_SOURCE_DISPLAY_NAME,
      sourceLabel: LEGACY_SOURCE_LABEL,
      enabled: true,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      summary: {
        campaignCount: Number(ingest?.campaignsSeen || campaigns.length || 0),
        mapCount: Number(ingest?.mapsSeen || mapUids.length || 0),
        trackedCount: 0,
        metadataAssignment: automaticNaming.metadataAssignment,
        namingAssignment: automaticNaming.namingAssignment,
        authSource: resolvedLive?.authSource || resolvedCore?.authSource || null,
        ...this.getLatestCampaignReleaseWindow(rawCampaigns.map((payload) => payload?.campaign || payload)),
      },
      metadata: {
        campaignType: LEGACY_CAMPAIGN_TYPE,
        storageClubId: LEGACY_SOURCE_CLUB_ID,
        campaignIds: LEGACY_SOURCE_CAMPAIGNS.map((campaign) => campaign.campaignId),
      },
    });

    return {
      ok: true,
      source: this.getLegacySourceStatus(),
      campaigns,
      ingest,
      metadataAssignment: automaticNaming.metadataAssignment,
      namingAssignment: automaticNaming.namingAssignment,
    };
  }

  async syncCompetitionSource({ authContext = null } = {}) {
    if (typeof this.repository?.upsertProjectSource === "function") {
      this.repository.upsertProjectSource({
        sourceKey: COMPETITION_SOURCE_KEY,
        sourceType: COMPETITION_SOURCE_TYPE,
        displayName: COMPETITION_SOURCE_DISPLAY_NAME,
        sourceLabel: COMPETITION_SOURCE_LABEL,
        enabled: true,
        metadata: {
          campaignType: COMPETITION_CAMPAIGN_TYPE,
          storageClubId: COMPETITION_SOURCE_CLUB_ID,
        },
      });
    }

    const fetched = await this.fetchLiveClubStructure({
      authContext,
      clubId: COMPETITION_SOURCE_CLUB_ID,
      activeOnly: false,
      fetchMapDetails: true,
    });
    if (fetched?.error) {
      this.repository.upsertProjectSource({
        sourceKey: COMPETITION_SOURCE_KEY,
        sourceType: COMPETITION_SOURCE_TYPE,
        displayName: COMPETITION_SOURCE_DISPLAY_NAME,
        sourceLabel: COMPETITION_SOURCE_LABEL,
        enabled: true,
        lastError: fetched.error,
      });
      return fetched;
    }

    const campaigns = this.buildCompetitionCampaignSnapshots(fetched?.campaigns || []);
    const ingest = campaigns.length
      ? this.repository.ingestProjectSourceSnapshot({
          sourceKey: COMPETITION_SOURCE_KEY,
          sourceType: COMPETITION_SOURCE_TYPE,
          displayName: COMPETITION_SOURCE_DISPLAY_NAME,
          sourceLabel: COMPETITION_SOURCE_LABEL,
          campaignType: COMPETITION_CAMPAIGN_TYPE,
          clubId: 0,
          campaigns,
          note: "competition-sync",
          trackedDefault: false,
        })
      : null;
    if (ingest?.error) {
      this.repository.upsertProjectSource({
        sourceKey: COMPETITION_SOURCE_KEY,
        sourceType: COMPETITION_SOURCE_TYPE,
        displayName: COMPETITION_SOURCE_DISPLAY_NAME,
        sourceLabel: COMPETITION_SOURCE_LABEL,
        enabled: true,
        lastError: ingest.error,
      });
      return ingest;
    }

    const touchedMapUids = this.collectCampaignSnapshotMapUids(campaigns);
    const automaticNaming = await this.runAutomaticNamingAssignments({
      mapUids: touchedMapUids,
      persistCandidates: true,
    });

    this.repository.upsertProjectSource({
      sourceKey: COMPETITION_SOURCE_KEY,
      sourceType: COMPETITION_SOURCE_TYPE,
      displayName: COMPETITION_SOURCE_DISPLAY_NAME,
      sourceLabel: COMPETITION_SOURCE_LABEL,
      enabled: true,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      summary: {
        campaignCount: Number(ingest?.campaignsSeen || campaigns.length || 0),
        mapCount: Number(ingest?.mapsSeen || 0),
        trackedCount: 0,
        metadataAssignment: automaticNaming.metadataAssignment,
        namingAssignment: automaticNaming.namingAssignment,
        authSource: fetched?.summary?.authSource || null,
        warnings: Array.isArray(fetched?.warnings) ? fetched.warnings.length : 0,
        clubName: toText(fetched?.club?.name) || null,
      },
      metadata: {
        campaignType: COMPETITION_CAMPAIGN_TYPE,
        storageClubId: COMPETITION_SOURCE_CLUB_ID,
      },
    });

    return {
      ok: true,
      source: this.getCompetitionSourceStatus(),
      campaigns,
      ingest,
      metadataAssignment: automaticNaming.metadataAssignment,
      namingAssignment: automaticNaming.namingAssignment,
      fetchedSummary: fetched?.summary || null,
      warnings: Array.isArray(fetched?.warnings) ? fetched.warnings : [],
    };
  }

  async syncProjectSourceByKey(sourceKey, options = {}) {
    const authContext = options?.authContext || null;
    const key = toText(sourceKey).toLowerCase();
    if (key === OFFICIAL_SEASONAL_SOURCE_KEY) return this.syncOfficialSeasonalSource({ authContext });
    if (key === TOTD_SOURCE_KEY) return this.syncTotdSource({ authContext });
    if (key === WEEKLY_GRANDS_SOURCE_KEY) return this.syncWeeklyGrandsSource({ authContext });
    if (key === COMPETITION_SOURCE_KEY) return this.syncCompetitionSource({ authContext });
    if (key === DISCOVERY_SOURCE_KEY) return this.syncDiscoverySource({ authContext });
    if (key === LEGACY_SOURCE_KEY) return this.syncLegacySource({ authContext });
    if (key === WEEKLY_SHORTS_SOURCE_KEY) {
      return this.syncWeeklyShortsSource({
        authContext,
        importLocalFiles:
          options?.importLocalFiles === undefined ? true : Boolean(options.importLocalFiles),
        importRoots: Array.isArray(options?.importRoots) ? options.importRoots : [],
      });
    }
    return { error: `Unsupported project source '${sourceKey}'.` };
  }

  async runDueProjectSourceSyncs({ reason = "schedule", fromTimeMs = Date.now() } = {}) {
    if (this.projectSourceSync.running) {
      return {
        ok: true,
        skipped: true,
        reason: "project-source-sync already running",
      };
    }

    const sources = this.getProjectSources({ includeDisabled: false });
    const dueSources = sources
      .map((source) => ({
        source,
        nextRunMs: this.computeProjectSourceNextRunMs(source, { fromTimeMs }),
      }))
      .filter((entry) => Number.isFinite(entry.nextRunMs) && entry.nextRunMs <= fromTimeMs)
      .sort((left, right) => left.nextRunMs - right.nextRunMs);

    if (!dueSources.length) {
      return {
        ok: true,
        processedSources: 0,
        sourceResults: [],
      };
    }

    this.projectSourceSync.running = true;
    this.projectSourceSync.lastStartedAt = new Date().toISOString();
    this.projectSourceSync.lastError = null;
    const results = [];

    try {
      for (const entry of dueSources) {
        const sourceKey = toText(entry?.source?.sourceKey);
        this.projectSourceSync.currentSourceKey = sourceKey || null;
        const result = await this.syncProjectSourceByKey(sourceKey);
        results.push({
          sourceKey,
          ok: !result?.error,
          error: result?.error || null,
          campaignsSeen: Number(result?.ingest?.campaignsSeen || 0),
          mapsSeen: Number(result?.ingest?.mapsSeen || 0),
        });
      }

      const failed = results.filter((entry) => entry.error);
      this.projectSourceSync.lastError =
        failed.length > 0
          ? failed.map((entry) => `${entry.sourceKey}: ${entry.error}`).join(" | ")
          : null;
      this.projectSourceSync.lastSummary = {
        reason,
        processedSources: results.length,
        syncedSources: results.filter((entry) => entry.ok).length,
        failedSources: failed.length,
        sourceResults: results,
      };
      this.projectSourceSync.lastFinishedAt = new Date().toISOString();
      return {
        ok: failed.length === 0,
        processedSources: results.length,
        sourceResults: results,
        error: this.projectSourceSync.lastError,
      };
    } finally {
      this.projectSourceSync.running = false;
      this.projectSourceSync.currentSourceKey = null;
      this.scheduleNextProjectSourceSyncRun({ fromTimeMs: Date.now() });
    }
  }

  scheduleNextProjectSourceSyncRun({ fromTimeMs = Date.now() } = {}) {
    if (this.projectSourceSync.timer) {
      clearTimeout(this.projectSourceSync.timer);
      this.projectSourceSync.timer = null;
    }

    const sources = this.getProjectSources({ includeDisabled: false });
    const nextEntry = sources
      .map((source) => ({
        sourceKey: toText(source?.sourceKey),
        nextRunMs: this.computeProjectSourceNextRunMs(source, { fromTimeMs }),
      }))
      .filter((entry) => Number.isFinite(entry.nextRunMs))
      .sort((left, right) => left.nextRunMs - right.nextRunMs)[0] || null;

    if (!nextEntry) {
      this.projectSourceSync.nextRunAt = null;
      return null;
    }

    const nextRunAt = new Date(nextEntry.nextRunMs).toISOString();
    const delayMs = Math.max(1000, nextEntry.nextRunMs - Date.now());
    this.projectSourceSync.nextRunAt = nextRunAt;
    this.projectSourceSync.timer = setTimeout(() => {
      this.projectSourceSync.timer = null;
      this.runDueProjectSourceSyncs({
        reason: "schedule",
        fromTimeMs: Date.now(),
      }).catch((error) => {
        const message = error?.message || "Project source scheduled sync failed.";
        this.projectSourceSync.lastError = message;
        this.projectSourceSync.lastFinishedAt = new Date().toISOString();
        this.logger.warn(`[altered-project-source] scheduled sync failed: ${message}`);
        this.scheduleNextProjectSourceSyncRun({ fromTimeMs: Date.now() });
      });
    }, delayMs);
    this.projectSourceSync.timer.unref?.();
    return nextRunAt;
  }

  startProjectSourceSyncScheduler() {
    this.scheduleNextProjectSourceSyncRun({ fromTimeMs: Date.now() });
    return true;
  }

  stopProjectSourceSyncScheduler() {
    if (this.projectSourceSync.timer) {
      clearTimeout(this.projectSourceSync.timer);
      this.projectSourceSync.timer = null;
    }
    this.projectSourceSync.nextRunAt = null;
    this.projectSourceSync.running = false;
    this.projectSourceSync.currentSourceKey = null;
    return true;
  }

  async syncWeeklyShortsSource({
    authContext = null,
    importLocalFiles = true,
    importRoots = [],
  } = {}) {
    if (typeof this.repository?.upsertProjectSource === "function") {
      this.repository.upsertProjectSource({
        sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
        sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
        displayName: WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
        sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
        enabled: true,
        metadata: {
          campaignType: WEEKLY_SHORTS_CAMPAIGN_TYPE,
          storageClubId: 0,
          importRoots: this.normalizeWeeklyShortsImportRoots(importRoots),
        },
      });
    }

    const resolved = await this.resolveLiveClient({ authContext });
    if (resolved?.error) {
      if (typeof this.repository?.upsertProjectSource === "function") {
        this.repository.upsertProjectSource({
          sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
          sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
          displayName: WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
          sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
          enabled: true,
          lastError: resolved.error,
        });
      }
      return { error: resolved.error };
    }

    const resolvedCore = await this.resolveCoreMapClient({ authContext });
    if (resolvedCore?.error) {
      this.repository.upsertProjectSource({
        sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
        sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
        displayName: WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
        sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedCore.error,
      });
      return { error: resolvedCore.error };
    }

    const liveClient = resolved.liveClient;
    const coreClient = resolvedCore.coreClient;
    const rawCampaigns = await this.fetchAllWeeklyShortsCampaigns(liveClient, {
      length: 10,
    });
    const mapUids = normalizeUniqueStrings(
      rawCampaigns.flatMap((campaign) =>
        (Array.isArray(campaign?.playlist) ? campaign.playlist : []).map((entry) => toText(entry?.mapUid))
      )
    );
    const mapDetails = await coreClient.getCoreMapsByUidList(mapUids);
    const mapDetailsByUid = new Map(
      (Array.isArray(mapDetails) ? mapDetails : [])
        .filter((map) => toText(map?.mapUid || map?.uid))
        .map((map) => [toText(map.mapUid || map.uid).toLowerCase(), map])
    );
    const campaigns = this.buildWeeklyShortsCampaignSnapshots(rawCampaigns, mapDetailsByUid);
    if (!campaigns.length) {
      this.repository.upsertProjectSource({
        sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
        sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
        displayName: WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
        sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
        enabled: true,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        summary: {
          campaignCount: 0,
          mapCount: 0,
          trackedCount: 0,
          latestWeek: null,
        },
        metadata: {
          campaignType: WEEKLY_SHORTS_CAMPAIGN_TYPE,
          storageClubId: 0,
          importRoots: this.normalizeWeeklyShortsImportRoots(importRoots),
        },
      });
      return {
        ok: true,
        source: this.getWeeklyShortsSourceStatus(),
        campaigns: [],
        ingest: null,
        trackerSync: { ok: true, targetCount: 0, chunkCount: 0, mapsSynced: 0 },
        importSummary: null,
        metadataAssignment: { processed: 0 },
        namingAssignment: { ok: true, processed: 0, resolved: 0, unresolved: 0 },
      };
    }
    const ingest = this.repository.ingestProjectSourceSnapshot({
      sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
      sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
      displayName: WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
      sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
      campaignType: WEEKLY_SHORTS_CAMPAIGN_TYPE,
      clubId: 0,
      campaigns,
      note: "weekly-shorts-sync",
      trackedDefault: true,
    });
    if (ingest?.error) {
      this.repository.upsertProjectSource({
        sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
        sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
        displayName: WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
        sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
        enabled: true,
        lastError: ingest.error,
      });
      return ingest;
    }

    const trackerSync = Array.isArray(ingest?.mapsForTracker) && ingest.mapsForTracker.length
      ? await this.syncMapsToTrackerInChunks(ingest.mapsForTracker, {
          chunkSize: 50,
        })
      : { ok: true, targetCount: 0, chunkCount: 0, mapsSynced: 0 };
    const touchedMapUids = normalizeUniqueStrings(
      campaigns.flatMap((campaign) =>
        (Array.isArray(campaign?.maps) ? campaign.maps : []).map((map) => resolveMapUid(map))
      )
    );
    const canonicalTouchedMapUids = normalizeUniqueStrings(
      campaigns.flatMap((campaign) =>
        (Array.isArray(campaign?.maps) ? campaign.maps : [])
          .filter((map) => Boolean(map?.raw?.weeklyShorts?.isCanonicalNadeoWeek))
          .map((map) => resolveMapUid(map))
      )
    );
    const automaticNaming = await this.runAutomaticNamingAssignments({
      mapUids: canonicalTouchedMapUids,
      persistCandidates: true,
    });
    const metadataAssignment = automaticNaming.metadataAssignment;
    const namingAssignment = automaticNaming.namingAssignment;
    const importSummary =
      importLocalFiles
        ? await this.importWeeklyShortsLocalFiles({
            campaigns,
            importRoots,
          })
        : null;
    const trackerSyncError =
      trackerSync?.ok === false &&
      toText(trackerSync?.error) !== "No tracker map-sync targets are configured."
        ? trackerSync.error || null
        : null;
    const weeklySourceSummary = {
      campaignCount: Number(ingest?.campaignsSeen || 0),
      mapCount: Number(ingest?.mapsSeen || 0),
      trackedCount: canonicalTouchedMapUids.length,
      canonicalCampaignCount: campaigns.filter((campaign) => Boolean(campaign?.raw?.weeklyShorts?.isCanonicalNadeoWeek)).length,
      canonicalMapCount: canonicalTouchedMapUids.length,
      trackerMapsSynced: Number(trackerSync?.mapsSynced || 0),
      importSummary,
      metadataAssignment,
      namingAssignment,
      authSource: resolved?.authSource || null,
      latestWeek: rawCampaigns.reduce(
        (max, campaign) => Math.max(max, Number(campaign?.week || 0) || 0),
        0
      ) || null,
      ...this.getLatestCampaignReleaseWindow(rawCampaigns),
    };

    this.repository.upsertProjectSource({
      sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
      sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
      displayName: WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
      sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
      enabled: true,
      lastSyncedAt: new Date().toISOString(),
      lastError: ingest?.error || trackerSyncError || importSummary?.error || null,
      summary: weeklySourceSummary,
      metadata: {
        campaignType: WEEKLY_SHORTS_CAMPAIGN_TYPE,
        storageClubId: 0,
        importRoots: this.normalizeWeeklyShortsImportRoots(importRoots),
      },
    });

    return {
      ok: true,
      source: this.getWeeklyShortsSourceStatus(),
      campaigns,
      ingest,
      trackerSync,
      importSummary,
      metadataAssignment,
      namingAssignment,
    };
  }

  async syncHookSnapshot(snapshot = {}, options = {}) {
    const onProgress = typeof options?.onProgress === "function" ? options.onProgress : null;
    const relayClubSnapshotOption = parseOptionalBoolean(options?.relayClubSnapshot);
    const relayClubSnapshot =
      relayClubSnapshotOption === undefined ? true : Boolean(relayClubSnapshotOption);
    const snapshotCampaigns = Array.isArray(snapshot?.campaigns) ? snapshot.campaigns : [];
    const snapshotMaps = snapshotCampaigns.reduce((sum, campaign) => {
      const count = Array.isArray(campaign?.maps) ? campaign.maps.length : 0;
      return sum + count;
    }, 0);
    if (onProgress) {
      onProgress({
        phase: "sync-snapshot",
        percent: 78,
        message: `Storing fetched club snapshot in altered database (${snapshotCampaigns.length} campaigns, ${snapshotMaps} maps).`,
        counters: {
          campaignsToStore: snapshotCampaigns.length,
          mapsToStore: snapshotMaps,
        },
      });
    }
    const hookKey = toText(options?.hookKey || snapshot?.hookKey || "altered-club", "altered-club");
    const result = this.repository.ingestHookSnapshot({
      hookKey,
      ...snapshot,
    });
    if (result?.error) return { error: result.error, details: result };

    const touchedMapUids = Array.from(
      new Set(
        snapshotCampaigns.flatMap((campaign) =>
          asArray(campaign?.maps).map((map) => toText(map?.uid || map?.mapUid || map?.map_uid))
        )
      )
    ).filter(Boolean);
    const automaticNaming = await this.runAutomaticNamingAssignments({
      mapUids: touchedMapUids,
      persistCandidates: true,
    });
    const metadataAssignment = automaticNaming.metadataAssignment;
    if (metadataAssignment?.error) {
      result.metadataWarning = metadataAssignment.error;
    } else {
      result.metadataAssignment = metadataAssignment;
    }
    const similarityAssignment = automaticNaming.namingAssignment;
    if (similarityAssignment?.ok === false) {
      result.similarityWarning = "Failed assigning map numbers from GBX content similarity.";
    } else {
      result.similarityAssignment = similarityAssignment;
    }

    let clubRelay = null;
    if (relayClubSnapshot && this.shouldUseClubRelay()) {
      if (onProgress) {
        onProgress({
          phase: "relay-tracker-club",
          percent: 82,
          message: "Relaying hook snapshot to tracker-club service.",
          counters: {
            relayCampaigns: snapshotCampaigns.length,
            relayMembers: asArray(snapshot?.members).length,
            relayActivities: asArray(snapshot?.activities).length,
            relayUploadBuckets: asArray(snapshot?.uploadBuckets).length,
          },
        });
      }
      clubRelay = await this.relayClubSnapshotToTrackerClub({
        club: snapshot?.club || {
          id: firstPositiveInt([snapshot?.clubId]),
          name: toText(snapshot?.clubName || ""),
        },
        campaigns: snapshotCampaigns,
        members: asArray(snapshot?.members),
        activities: asArray(snapshot?.activities),
        uploadBuckets: asArray(snapshot?.uploadBuckets),
        observedAt: new Date().toISOString(),
      });
      if (clubRelay?.error) {
        result.clubRelayWarning = clubRelay.error;
        if (!this.trackerIntegrations.clubFallbackLocal) {
          return {
            error: clubRelay.error,
            details: {
              ...result,
              clubRelay,
            },
          };
        }
      }
    }

    const mapsForTracker = Array.isArray(result.mapsForTracker) ? result.mapsForTracker : [];
    let trackerSync = { ok: true, targetCount: 0, chunkCount: 0, mapsSynced: 0 };
    if (mapsForTracker.length) {
      trackerSync = await this.syncMapsToTrackerInChunks(mapsForTracker, {
        onChunk: ({
          index,
          total,
          mapsSynced,
          chunkSize,
          targetLabel,
          targetIndex,
          targetTotal,
        }) => {
          if (!onProgress) return;
          const percent = 84 + Math.floor((index / Math.max(total, 1)) * 14);
          onProgress({
            phase: "sync-tracker",
            percent,
            message: `Syncing maps into ${targetLabel || "tracker"} (${index}/${total} chunks).`,
            counters: {
              trackerChunksTotal: total,
              trackerChunksSynced: index,
              trackerChunkSize: chunkSize,
              trackerMapsToSync: mapsForTracker.length,
              trackerMapsSynced: mapsSynced,
              trackerTarget: targetLabel || null,
              trackerTargetIndex: Number(targetIndex || 0),
              trackerTargetTotal: Number(targetTotal || 0),
            },
          });
        },
      });
    }
    if (!trackerSync.ok) {
      result.trackerWarning = `Snapshot stored, but tracker sync failed: ${trackerSync.error}`;
      this.logger.warn(`[altered] tracker bulk-upsert failed after snapshot sync: ${trackerSync.error}`);
    }

    if (onProgress) {
      onProgress({
        phase: "sync-finished",
        percent: 99,
        message: "Snapshot + tracker sync completed.",
        counters: {
          campaignsToStore: snapshotCampaigns.length,
          mapsToStore: snapshotMaps,
          campaignsStored: Number(result.campaignsSeen || 0),
          mapsStored: Number(result.mapsSeen || 0),
          mapsInserted: Number(result.mapsInserted || 0),
          mapsUpdated: Number(result.mapsUpdated || 0),
          mapsLinked: Number(result.mapsLinked || 0),
          trackerTargetsTotal: Number(trackerSync.targetCount || 0),
          trackerChunksTotal: Number(trackerSync.chunkCount || 0),
          trackerChunksSynced: Number(trackerSync.chunkCount || 0),
          trackerMapsToSync: Number(mapsForTracker.length || 0),
          trackerMapsSynced: Number(trackerSync.mapsSynced || 0),
        },
      });
    }

    return {
      synced: {
        ...result,
        clubRelay,
        trackerSync,
      },
    };
  }

  shouldUseDisplaynameRelay() {
    return Boolean(
      this.trackerIntegrations.displaynameEnabled &&
        this.trackerIntegrations.displaynameRelayAvailable &&
        this.trackerDisplaynameClient?.isConfigured?.()
    );
  }

  shouldUseClubRelay() {
    return Boolean(
      this.trackerIntegrations.clubEnabled &&
        this.trackerIntegrations.clubRelayAvailable &&
        this.trackerClubClient?.isConfigured?.()
    );
  }

  async relayClubSnapshotToTrackerClub(snapshot = {}) {
    if (!this.shouldUseClubRelay()) {
      return {
        relayed: false,
        reason: "tracker-club relay disabled or not configured",
      };
    }

    const relay = await this.trackerClubClient.ingestSnapshot(snapshot);
    if (!relay?.ok) {
      const message = relay?.error || "Tracker-club snapshot ingest failed.";
      this.trackerIntegrations.lastClubRelayError = message;
      if (/not configured|disabled/i.test(message)) {
        this.trackerIntegrations.clubRelayAvailable = false;
      }
      return {
        relayed: false,
        error: message,
      };
    }

    const data = relay.data || {};
    const nowIso = new Date().toISOString();
    this.trackerIntegrations.lastClubRelay = {
      at: nowIso,
      ...data,
    };
    this.trackerIntegrations.clubRelayAvailable = true;
    this.trackerIntegrations.lastClubRelayError = null;
    return {
      relayed: true,
      at: nowIso,
      ...data,
    };
  }

  async getDisplayNamesFromAggregator(accountIds = []) {
    if (!this.aggregatorClient?.isConfigured?.()) {
      return {
        ok: false,
        error: "Aggregator client is not configured.",
        namesByAccountId: {},
      };
    }

    const normalizedAccountIds = uniqueBy(
      asArray(accountIds)
        .map((accountId) => normalizeAccountId(accountId))
        .filter(Boolean),
      (accountId) => accountId
    );
    if (!normalizedAccountIds.length) {
      return {
        ok: true,
        namesByAccountId: {},
        resolved: 0,
      };
    }

    const result = await this.aggregatorClient.getDisplayNames(normalizedAccountIds);
    if (!result?.ok) {
      return {
        ok: false,
        error: result?.error || "Failed to query display names from aggregator.",
        namesByAccountId: {},
      };
    }

    const rows = asArray(result?.data?.names);
    const namesByAccountId = {};
    for (const row of rows) {
      const accountId = normalizeAccountId(row?.accountId);
      const displayName = sanitizeResolvedDisplayName(row?.displayName, { accountId });
      if (!accountId || !displayName) continue;
      namesByAccountId[accountId] = displayName;
    }

    return {
      ok: true,
      namesByAccountId,
      resolved: Object.keys(namesByAccountId).length,
    };
  }

  async ingestDisplayNamesToAggregator(namesByAccountId = {}, { source = "mapper-sync" } = {}) {
    if (!this.aggregatorClient?.isConfigured?.()) {
      return {
        ok: false,
        skipped: true,
        error: "Aggregator client is not configured.",
      };
    }

    const safeMap = namesByAccountId && typeof namesByAccountId === "object" ? namesByAccountId : {};
    const payloadMap = {};
    for (const [rawAccountId, rawDisplayName] of Object.entries(safeMap)) {
      const accountId = normalizeAccountId(rawAccountId);
      const displayName = String(rawDisplayName || "").trim();
      if (!accountId || !displayName) continue;
      if (normalizeAccountId(displayName) === accountId) continue;
      payloadMap[accountId] = displayName;
    }

    if (!Object.keys(payloadMap).length) {
      return {
        ok: true,
        skipped: true,
        accepted: 0,
        inserted: 0,
        updated: 0,
        unchanged: 0,
      };
    }

    const ingest = await this.aggregatorClient.ingestDisplayNames(payloadMap, {
      source,
      projectKey: "altered-mapper-displayname",
      projectName: "Altered Mapper Displayname",
      observedAt: new Date().toISOString(),
    });

    if (!ingest?.ok) {
      return {
        ok: false,
        error: ingest?.error || "Failed to ingest display names to aggregator.",
      };
    }

    const result = ingest?.data?.ingest || ingest?.data || {};
    return {
      ok: true,
      accepted: Number(result.accepted || 0),
      inserted: Number(result.inserted || 0),
      updated: Number(result.updated || 0),
      unchanged: Number(result.unchanged || 0),
    };
  }

  async runTrackerDisplaynameSync({
    accountIds = [],
    reason = "altered-sync",
    forceCandidates = false,
  } = {}) {
    if (!this.shouldUseDisplaynameRelay()) {
      return {
        ok: false,
        error: "tracker-displayname relay disabled or not configured",
      };
    }

    const normalizedAccountIds = uniqueBy(
      asArray(accountIds)
        .map((accountId) => normalizeAccountId(accountId))
        .filter(Boolean),
      (accountId) => accountId
    );

    const run = await this.trackerDisplaynameClient.runSync({
      accountIds: normalizedAccountIds,
      forceCandidates: Boolean(forceCandidates),
      prioritizeAccountIds: true,
    });
    if (!run?.ok) {
      const message = run?.error || "Tracker-displayname sync failed.";
      this.trackerIntegrations.lastDisplaynameRelayError = message;
      if (/not configured|disabled/i.test(message)) {
        this.trackerIntegrations.displaynameRelayAvailable = false;
      }
      return {
        ok: false,
        error: message,
      };
    }

    const namesResult = await this.getDisplayNamesFromAggregator(normalizedAccountIds);
    if (!namesResult?.ok) {
      const message = namesResult?.error || "Tracker-displayname sync completed but names could not be read.";
      this.trackerIntegrations.lastDisplaynameRelayError = message;
      return {
        ok: false,
        error: message,
      };
    }

    const data = run.data || {};
    const nowIso = new Date().toISOString();
    this.trackerIntegrations.lastDisplaynameRelay = {
      at: nowIso,
      reason,
      requested: Number(data.requested || normalizedAccountIds.length),
      resolved: Number(data.resolved || namesResult.resolved || 0),
      accepted: Number(data.accepted || 0),
      inserted: Number(data.inserted || 0),
      updated: Number(data.updated || 0),
      unchanged: Number(data.unchanged || 0),
      queueRemaining: Number(data.queueRemaining || 0),
    };
    this.trackerIntegrations.displaynameRelayAvailable = true;
    this.trackerIntegrations.lastDisplaynameRelayError = null;

    return {
      ok: true,
      summary: this.trackerIntegrations.lastDisplaynameRelay,
      namesByAccountId: namesResult.namesByAccountId,
    };
  }

  getLiveMonitorStatus() {
    const configured = Boolean(this.liveClient?.isConfigured?.());
    const projectClubs = this.getProjectClubs({ includeDisabled: true });
    const mapperNameTracking =
      this.mapperNameClient?.getStatus?.() || {
        enabled: false,
        configured: false,
      };
    return {
      configured,
      authRequired: "nadeo-account",
      authAdvice: configured
        ? null
        : "Configure ALTERED_LIVE_DEDI_LOGIN and ALTERED_LIVE_DEDI_PASSWORD (or ALTERED_LIVE_ACCESS_TOKEN / ALTERED_LIVE_REFRESH_TOKEN).",
      integrations: {
        trackerDisplayname: {
          enabled: this.trackerIntegrations.displaynameEnabled,
          configured: Boolean(this.trackerDisplaynameClient?.isConfigured?.()),
          relayAvailable: this.trackerIntegrations.displaynameRelayAvailable,
          fallbackLocal: this.trackerIntegrations.displaynameFallbackLocal,
          lastRelay: this.trackerIntegrations.lastDisplaynameRelay,
          lastRelayError: this.trackerIntegrations.lastDisplaynameRelayError,
        },
        trackerClub: {
          enabled: this.trackerIntegrations.clubEnabled,
          configured: Boolean(this.trackerClubClient?.isConfigured?.()),
          relayAvailable: this.trackerIntegrations.clubRelayAvailable,
          fallbackLocal: this.trackerIntegrations.clubFallbackLocal,
          lastRelay: this.trackerIntegrations.lastClubRelay,
          lastRelayError: this.trackerIntegrations.lastClubRelayError,
        },
        trackerMapSync: {
          targets: this.getTrackerMapSyncTargets().map((target) => ({
            key: target.key,
            label: target.label,
            primary: Boolean(target.primary),
            adminBaseUrl: target.adminBaseUrl || null,
          })),
        },
      },
      monitor: {
        enabled: this.liveMonitor.enabled,
        running: this.liveMonitor.running,
        scheduleMode: this.liveMonitor.scheduleMode,
        dailyHourUtc: this.liveMonitor.dailyHourUtc,
        dailyMinuteUtc: this.liveMonitor.dailyMinuteUtc,
        nextRunAt: this.liveMonitor.nextRunAt,
        discoveryEnabled: this.liveMonitor.discoveryEnabled,
        discoveryIntervalSeconds: this.liveMonitor.discoveryIntervalSeconds,
        discoveryCampaignLimit: this.liveMonitor.discoveryCampaignLimit,
        discoveryActivityPageSize: this.liveMonitor.discoveryActivityPageSize,
        nextDiscoveryRunAt: this.liveMonitor.nextDiscoveryRunAt,
        discoveryRunning: this.liveMonitor.discoveryRunning,
        clubId: this.liveMonitor.clubId,
        intervalSeconds: this.liveMonitor.intervalSeconds,
        activityPageSize: this.liveMonitor.activityPageSize,
        activeOnly: this.liveMonitor.activeOnly,
        fetchMapDetails: this.liveMonitor.fetchMapDetails,
        trackerChunkSize: this.liveMonitor.trackerChunkSize,
        progress: this.liveMonitor.progress,
        lastStartedAt: this.liveMonitor.lastStartedAt,
        lastFinishedAt: this.liveMonitor.lastFinishedAt,
        lastDurationMs: this.liveMonitor.lastDurationMs,
        lastError: this.liveMonitor.lastError,
        lastSummary: this.liveMonitor.lastSummary,
        lastDiscoveryStartedAt: this.liveMonitor.lastDiscoveryStartedAt,
        lastDiscoveryFinishedAt: this.liveMonitor.lastDiscoveryFinishedAt,
        lastDiscoveryDurationMs: this.liveMonitor.lastDiscoveryDurationMs,
        lastDiscoveryError: this.liveMonitor.lastDiscoveryError,
        lastDiscoverySummary: this.liveMonitor.lastDiscoverySummary,
      },
      auth: this.liveClient?.getStatus?.() || null,
      mapperNameTracking,
      mapperNameSync: this.getMapperNameSyncStatus(),
      projectClubs,
    };
  }

  getMapperNameSyncStatus() {
    const stats =
      typeof this.repository?.getMapperAccountStats === "function"
        ? this.repository.getMapperAccountStats()
        : {
            totalAccounts: 0,
            unresolvedAccounts: 0,
            neverResolvedAccounts: 0,
            latestResolvedAt: null,
            oldestResolvedAt: null,
          };
    return {
      enabled: this.mapperNameSync.enabled,
      relayMode:
        this.shouldUseDisplaynameRelay()
          ? "tracker-displayname-primary"
          : "local-primary",
      relayEnabled: this.trackerIntegrations.displaynameEnabled,
      relayConfigured: Boolean(this.trackerDisplaynameClient?.isConfigured?.()),
      relayAvailable: this.trackerIntegrations.displaynameRelayAvailable,
      relayFallbackLocal: this.trackerIntegrations.displaynameFallbackLocal,
      relayLast: this.trackerIntegrations.lastDisplaynameRelay,
      relayLastError: this.trackerIntegrations.lastDisplaynameRelayError,
      mode: this.mapperNameSync.mode,
      running: this.mapperNameSync.running,
      nextRunAt: this.mapperNameSync.nextRunAt,
      nextPriorityRunAt: this.mapperNameSync.nextPriorityRunAt,
      bootstrapIntervalSeconds: this.mapperNameSync.bootstrapIntervalSeconds,
      maintenanceIntervalSeconds: this.mapperNameSync.maintenanceIntervalSeconds,
      priorityIntervalSeconds: this.mapperNameSync.priorityIntervalSeconds,
      batchSize: this.mapperNameSync.batchSize,
      priorityBatchSize: this.mapperNameSync.priorityBatchSize,
      priorityTopLimit: this.mapperNameSync.priorityTopLimit,
      cacheTtlSeconds: this.mapperNameSync.cacheTtlSeconds,
      priorityCacheTtlSeconds: this.mapperNameSync.priorityCacheTtlSeconds,
      knownAccountsRefreshSeconds: this.mapperNameSync.knownAccountsRefreshSeconds,
      minRequestGapMs: this.mapperNameSync.minRequestGapMs,
      knownAccountsRefreshedAt:
        this.mapperNameSync.knownAccountsRefreshedAtMs > 0
          ? new Date(this.mapperNameSync.knownAccountsRefreshedAtMs).toISOString()
          : null,
      priorityAccountsRefreshedAt:
        this.mapperNameSync.priorityAccountsRefreshedAtMs > 0
          ? new Date(this.mapperNameSync.priorityAccountsRefreshedAtMs).toISOString()
          : null,
      priorityAccountsTracked: Number(this.mapperNameSync.priorityAccountIds.length || 0),
      viewedPriorityAccountsTracked: Number(this.mapperNameSync.viewedPriorityAccountIds.length || 0),
      lastStartedAt: this.mapperNameSync.lastStartedAt,
      lastFinishedAt: this.mapperNameSync.lastFinishedAt,
      lastError: this.mapperNameSync.lastError,
      lastSummary: this.mapperNameSync.lastSummary,
      stats,
    };
  }

  async updateMapperNameSyncConfig(options = {}) {
    if (options.enabled !== undefined) {
      this.mapperNameSync.enabled = Boolean(options.enabled);
    }
    if (options.bootstrapIntervalSeconds !== undefined) {
      this.mapperNameSync.bootstrapIntervalSeconds = clampInt(options.bootstrapIntervalSeconds, {
        min: 60,
        max: 86400,
        fallback: this.mapperNameSync.bootstrapIntervalSeconds,
      });
    }
    if (options.maintenanceIntervalSeconds !== undefined) {
      this.mapperNameSync.maintenanceIntervalSeconds = clampInt(
        options.maintenanceIntervalSeconds,
        {
          min: 60,
          max: 86400,
          fallback: this.mapperNameSync.maintenanceIntervalSeconds,
        }
      );
    }
    if (options.priorityIntervalSeconds !== undefined) {
      this.mapperNameSync.priorityIntervalSeconds = clampInt(options.priorityIntervalSeconds, {
        min: 60,
        max: 86400,
        fallback: this.mapperNameSync.priorityIntervalSeconds,
      });
    }
    if (options.batchSize !== undefined) {
      this.mapperNameSync.batchSize = clampInt(options.batchSize, {
        min: 1,
        max: 50,
        fallback: this.mapperNameSync.batchSize,
      });
    }
    if (options.priorityBatchSize !== undefined) {
      this.mapperNameSync.priorityBatchSize = clampInt(options.priorityBatchSize, {
        min: 1,
        max: 50,
        fallback: this.mapperNameSync.priorityBatchSize,
      });
    }
    if (options.priorityTopLimit !== undefined) {
      this.mapperNameSync.priorityTopLimit = clampInt(options.priorityTopLimit, {
        min: 1,
        max: 2000,
        fallback: this.mapperNameSync.priorityTopLimit,
      });
    }
    if (options.priorityRefreshSeconds !== undefined) {
      this.mapperNameSync.priorityRefreshSeconds = clampInt(options.priorityRefreshSeconds, {
        min: 30,
        max: 86400,
        fallback: this.mapperNameSync.priorityRefreshSeconds,
      });
    }
    if (options.knownAccountsRefreshSeconds !== undefined) {
      this.mapperNameSync.knownAccountsRefreshSeconds = clampInt(
        options.knownAccountsRefreshSeconds,
        {
          min: 60,
          max: 86400,
          fallback: this.mapperNameSync.knownAccountsRefreshSeconds,
        }
      );
    }
    if (options.cacheTtlSeconds !== undefined) {
      this.mapperNameSync.cacheTtlSeconds = clampInt(options.cacheTtlSeconds, {
        min: 0,
        max: 30 * 24 * 60 * 60,
        fallback: this.mapperNameSync.cacheTtlSeconds,
      });
    }
    if (options.priorityCacheTtlSeconds !== undefined) {
      this.mapperNameSync.priorityCacheTtlSeconds = clampInt(options.priorityCacheTtlSeconds, {
        min: 0,
        max: 30 * 24 * 60 * 60,
        fallback: this.mapperNameSync.priorityCacheTtlSeconds,
      });
    }
    if (options.minRequestGapMs !== undefined) {
      this.mapperNameSync.minRequestGapMs = clampInt(options.minRequestGapMs, {
        min: DEFAULT_MAPPER_REQUEST_GAP_MS,
        max: 120000,
        fallback: this.mapperNameSync.minRequestGapMs,
      });
    }
    if (options.resetKnownAccountsCache) {
      this.mapperNameSync.knownAccountsRefreshedAtMs = 0;
    }
    if (options.resetPriorityAccountsCache) {
      this.mapperNameSync.priorityAccountsRefreshedAtMs = 0;
      this.mapperNameSync.priorityAccountIds = [];
    }

    const useRelay = this.shouldUseDisplaynameRelay();
    if (useRelay) {
      await this.stopMapperNameSyncScheduler();
      const relayConfig = await this.trackerDisplaynameClient.updateConfig({
        enabled: this.mapperNameSync.enabled,
        schedulerEnabled: this.mapperNameSync.enabled,
        maintenanceIntervalSeconds: this.mapperNameSync.maintenanceIntervalSeconds,
        staleAfterSeconds: this.mapperNameSync.cacheTtlSeconds,
        batchSize: this.mapperNameSync.batchSize,
        maxAccountsPerCycle: Math.max(
          this.mapperNameSync.batchSize,
          this.mapperNameSync.priorityBatchSize,
          this.mapperNameSync.priorityTopLimit
        ),
      });
      if (!relayConfig?.ok) {
        this.trackerIntegrations.lastDisplaynameRelayError =
          relayConfig?.error || "Failed to update tracker-displayname config.";
        if (/not configured|disabled/i.test(this.trackerIntegrations.lastDisplaynameRelayError)) {
          this.trackerIntegrations.displaynameRelayAvailable = false;
        }
        if (this.trackerIntegrations.displaynameFallbackLocal && this.mapperNameSync.enabled) {
          this.scheduleNextMapperSyncRun({ priority: false, fromTimeMs: Date.now() });
          this.scheduleNextMapperSyncRun({ priority: true, fromTimeMs: Date.now() });
        }
      } else {
        this.trackerIntegrations.displaynameRelayAvailable = true;
        this.trackerIntegrations.lastDisplaynameRelayError = null;
      }
    } else if (!this.mapperNameSync.enabled) {
      await this.stopMapperNameSyncScheduler();
    } else {
      this.scheduleNextMapperSyncRun({ priority: false, fromTimeMs: Date.now() });
      this.scheduleNextMapperSyncRun({ priority: true, fromTimeMs: Date.now() });
    }
    return this.getMapperNameSyncStatus();
  }

  computeNextMapperSyncRunIso({ priority = false, fromTimeMs = Date.now() } = {}) {
    const delaySeconds = priority
      ? this.mapperNameSync.priorityIntervalSeconds
      : this.mapperNameSync.mode === "bootstrap"
        ? this.mapperNameSync.bootstrapIntervalSeconds
        : this.mapperNameSync.maintenanceIntervalSeconds;
    return new Date(fromTimeMs + Math.max(1, delaySeconds) * 1000).toISOString();
  }

  scheduleNextMapperSyncRun({ priority = false, fromTimeMs = Date.now() } = {}) {
    if (priority) {
      if (this.mapperNameSync.priorityTimer) {
        clearTimeout(this.mapperNameSync.priorityTimer);
        this.mapperNameSync.priorityTimer = null;
      }
    } else if (this.mapperNameSync.timer) {
      clearTimeout(this.mapperNameSync.timer);
      this.mapperNameSync.timer = null;
    }

    if (!this.mapperNameSync.enabled) {
      if (priority) this.mapperNameSync.nextPriorityRunAt = null;
      else this.mapperNameSync.nextRunAt = null;
      return false;
    }

    const nextRunAt = this.computeNextMapperSyncRunIso({ priority, fromTimeMs });
    const delayMs = Math.max(1000, Date.parse(nextRunAt) - Date.now());

    if (priority) {
      this.mapperNameSync.nextPriorityRunAt = nextRunAt;
      this.mapperNameSync.priorityTimer = setTimeout(() => {
        this.mapperNameSync.priorityTimer = null;
        this.runMapperNameSyncCycle({
          priority: true,
          reason: "priority-schedule",
        }).catch((error) => {
          this.logger.warn(`[altered-mapper-sync] priority cycle failed: ${error?.message || error}`);
        });
      }, delayMs);
      this.mapperNameSync.priorityTimer.unref?.();
      return true;
    }

    this.mapperNameSync.nextRunAt = nextRunAt;
    this.mapperNameSync.timer = setTimeout(() => {
      this.mapperNameSync.timer = null;
      this.runMapperNameSyncCycle({
        priority: false,
        reason: "schedule",
      }).catch((error) => {
        this.logger.warn(`[altered-mapper-sync] cycle failed: ${error?.message || error}`);
      });
    }, delayMs);
    this.mapperNameSync.timer.unref?.();
    return true;
  }

  async refreshMapperAccountPool({ force = false } = {}) {
    if (
      typeof this.repository?.listKnownMapperAccountIds !== "function" ||
      typeof this.repository?.seedMapperAccounts !== "function"
    ) {
      return {
        ok: false,
        error: "Mapper account repository methods are unavailable.",
      };
    }
    const nowMs = Date.now();
    const ageMs = nowMs - Number(this.mapperNameSync.knownAccountsRefreshedAtMs || 0);
    if (
      !force &&
      Number(this.mapperNameSync.knownAccountsRefreshedAtMs || 0) > 0 &&
      ageMs < this.mapperNameSync.knownAccountsRefreshSeconds * 1000
    ) {
      return {
        ok: true,
        refreshed: false,
      };
    }

    const accountIds = this.repository.listKnownMapperAccountIds({
      limit: 200000,
    });
    const seed = this.repository.seedMapperAccounts({
      accountIds,
      source: "altered-monitor",
    });
    if (seed?.error) {
      return {
        ok: false,
        error: seed.error,
      };
    }

    this.mapperNameSync.knownAccountsRefreshedAtMs = nowMs;
    return {
      ok: true,
      refreshed: true,
      accountIdsSeen: Number(accountIds.length || 0),
      inserted: Number(seed.inserted || 0),
      updated: Number(seed.updated || 0),
    };
  }

  async refreshPriorityMapperAccounts({ force = false } = {}) {
    this.pruneViewedPriorityAccountIds();
    const nowMs = Date.now();
    const ageMs = nowMs - Number(this.mapperNameSync.priorityAccountsRefreshedAtMs || 0);
    if (
      !force &&
      Number(this.mapperNameSync.priorityAccountsRefreshedAtMs || 0) > 0 &&
      ageMs < this.mapperNameSync.priorityRefreshSeconds * 1000
    ) {
      return {
        ok: true,
        refreshed: false,
        count:
          this.mapperNameSync.priorityAccountIds.length +
          this.mapperNameSync.viewedPriorityAccountIds.length,
      };
    }

    if (!this.trackerClient?.getTopWrAccounts) {
      this.mapperNameSync.priorityAccountIds = [...asArray(this.mapperNameSync.viewedPriorityAccountIds)];
      this.mapperNameSync.priorityAccountsRefreshedAtMs = nowMs;
      return {
        ok: true,
        refreshed: true,
        count: this.mapperNameSync.priorityAccountIds.length,
      };
    }

    const response = await this.trackerClient.getTopWrAccounts(this.mapperNameSync.priorityTopLimit);
    if (!response?.ok) {
      return {
        ok: false,
        error: response?.error || "Failed to fetch top WR accounts from tracker.",
      };
    }

    const accounts = asArray(response?.data?.accounts);
    this.mapperNameSync.priorityAccountIds = uniqueBy(
      [
        ...asArray(this.mapperNameSync.viewedPriorityAccountIds),
        ...accounts
          .map((entry) => normalizeAccountId(entry?.accountId ?? entry?.account_id))
          .filter(Boolean),
      ],
      (accountId) => accountId
    );
    this.mapperNameSync.priorityAccountsRefreshedAtMs = nowMs;
    return {
      ok: true,
      refreshed: true,
      count: this.mapperNameSync.priorityAccountIds.length,
    };
  }

  async syncMapperNamesBatch({ accountIds = [], source = "mapper-sync" } = {}) {
    const normalizedAccountIds = uniqueBy(
      asArray(accountIds)
        .map((accountId) => normalizeAccountId(accountId))
        .filter(Boolean),
      (accountId) => accountId
    );
    if (!normalizedAccountIds.length) {
      return {
        ok: true,
        requested: 0,
        resolved: 0,
        trackerCacheHits: 0,
        nadeoRequested: 0,
        nadeoResolved: 0,
        namesUpdated: 0,
        historyInserted: 0,
        mapLinksUpdated: 0,
        trackerPlayersSynced: 0,
      };
    }

    if (this.shouldUseDisplaynameRelay()) {
      const relayResult = await this.runTrackerDisplaynameSync({
        accountIds: normalizedAccountIds,
        reason: source || "mapper-sync",
        forceCandidates: false,
      });
      if (relayResult?.ok) {
        const namesByAccountId = relayResult.namesByAccountId || {};
        const nameUpsert = this.repository.upsertMapperNames({
          accountIds: normalizedAccountIds,
          namesByAccountId,
          source,
        });
        if (nameUpsert?.error) {
          return {
            ok: false,
            error: nameUpsert.error,
            requested: normalizedAccountIds.length,
          };
        }
        const mapLinks = this.repository.updateMapMapperDisplayNames({
          namesByAccountId,
        });
        if (mapLinks?.error) {
          this.logger.warn(
            `[altered-mapper-sync] map mapper-name link update failed: ${mapLinks.error}`
          );
        }
        const aggregatorIngest = await this.ingestDisplayNamesToAggregator(namesByAccountId, {
          source,
        });
        const playersPayload = Object.entries(namesByAccountId)
          .map(([accountId, displayName]) => ({
            accountId: normalizeAccountId(accountId),
            displayName: String(displayName || "").trim(),
            observedAt: new Date().toISOString(),
          }))
          .filter((entry) => entry.accountId && entry.displayName);
        let trackerPlayersSynced = 0;
        let trackerWarning = null;
        if (playersPayload.length && this.trackerClient?.bulkUpsertPlayerNames) {
          const trackerSync = await this.trackerClient.bulkUpsertPlayerNames(playersPayload, source);
          if (trackerSync?.ok) {
            trackerPlayersSynced = Number(
              trackerSync?.data?.playersSeen ||
                trackerSync?.data?.synced?.playersSeen ||
                playersPayload.length
            );
          } else {
            trackerWarning = trackerSync?.error || "Failed to sync player names to tracker.";
          }
        }
        const warning = [trackerWarning, aggregatorIngest?.ok ? null : aggregatorIngest?.error]
          .filter(Boolean)
          .join(" | ") || null;
        return {
          ok: true,
          relay: "tracker-displayname",
          warning,
          requested: normalizedAccountIds.length,
          resolved: Object.keys(namesByAccountId).length,
          trackerCacheHits: Object.keys(namesByAccountId).length,
          nadeoRequested: Number(relayResult.summary?.requested || normalizedAccountIds.length),
          nadeoResolved: Number(relayResult.summary?.resolved || Object.keys(namesByAccountId).length),
          namesUpdated: Number(nameUpsert.namesUpdated || 0),
          historyInserted: Number(nameUpsert.historyInserted || 0),
          mapLinksUpdated: Number(mapLinks?.updated || 0),
          aggregatorAccepted: Number(aggregatorIngest?.accepted || 0),
          aggregatorInserted: Number(aggregatorIngest?.inserted || 0),
          aggregatorUpdated: Number(aggregatorIngest?.updated || 0),
          trackerPlayersSynced,
        };
      }
      if (!this.trackerIntegrations.displaynameFallbackLocal) {
        return {
          ok: false,
          error: relayResult?.error || "Tracker-displayname sync failed.",
          requested: normalizedAccountIds.length,
        };
      }
    }

    let trackerLookupWarning = null;
    let trackerNamesByAccountId = {};
    if (this.trackerClient?.getPlayerNames) {
      const trackerLookup = await this.trackerClient.getPlayerNames(normalizedAccountIds, {
        chunkSize: 50,
      });
      if (trackerLookup?.namesByAccountId && typeof trackerLookup.namesByAccountId === "object") {
        trackerNamesByAccountId = trackerLookup.namesByAccountId;
      }
      if (trackerLookup?.error) {
        trackerLookupWarning = trackerLookup.error;
      }
    }

    const unresolvedAccountIds = normalizedAccountIds.filter(
      (accountId) => !trackerNamesByAccountId[accountId]
    );
    let nadeoRequested = 0;
    let nadeoResolved = 0;
    let nadeoNamesByAccountId = {};

    if (unresolvedAccountIds.length > 0) {
      if (!this.mapperNameClient || !this.mapperNameClient.isConfigured?.()) {
        return {
          ok: false,
          error: "Mapper name client is not configured.",
          requested: normalizedAccountIds.length,
          trackerCacheHits: Object.keys(trackerNamesByAccountId).length,
          nadeoRequested,
          nadeoResolved,
          trackerLookupWarning,
        };
      }

      const waitMs = Math.max(
        0,
        Number(this.mapperNameSync.nextLookupAllowedAtMs || 0) - Date.now()
      );
      if (waitMs > 0) {
        await delay(waitMs);
      }

      let resolved;
      try {
        resolved = await this.mapperNameClient.getDisplayNames(unresolvedAccountIds);
      } finally {
        this.mapperNameSync.nextLookupAllowedAtMs = Date.now() + this.mapperNameSync.minRequestGapMs;
      }

      nadeoRequested = Number(resolved?.requested || unresolvedAccountIds.length);
      nadeoResolved = Number(resolved?.resolved || 0);
      nadeoNamesByAccountId =
        resolved?.namesByAccountId && typeof resolved.namesByAccountId === "object"
          ? resolved.namesByAccountId
          : {};

      if (!resolved?.ok) {
        return {
          ok: false,
          error: resolved?.error || "Failed to resolve mapper display names.",
          requested: normalizedAccountIds.length,
          trackerCacheHits: Object.keys(trackerNamesByAccountId).length,
          nadeoRequested,
          nadeoResolved,
          trackerLookupWarning,
        };
      }
    }

    const namesByAccountId = {
      ...trackerNamesByAccountId,
      ...nadeoNamesByAccountId,
    };
    const nameUpsert = this.repository.upsertMapperNames({
      accountIds: normalizedAccountIds,
      namesByAccountId,
      source,
    });
    if (nameUpsert?.error) {
      return {
        ok: false,
        error: nameUpsert.error,
        requested: normalizedAccountIds.length,
      };
    }

    const mapLinks = this.repository.updateMapMapperDisplayNames({
      namesByAccountId,
    });
    if (mapLinks?.error) {
      this.logger.warn(`[altered-mapper-sync] map mapper-name link update failed: ${mapLinks.error}`);
    }
    const aggregatorIngest = await this.ingestDisplayNamesToAggregator(namesByAccountId, {
      source,
    });

    const playersPayload = Object.entries(nadeoNamesByAccountId)
      .map(([accountId, displayName]) => ({
        accountId: normalizeAccountId(accountId),
        displayName: String(displayName || "").trim(),
        observedAt: new Date().toISOString(),
      }))
      .filter((entry) => entry.accountId && entry.displayName);

    let trackerPlayersSynced = 0;
    let trackerWarning = null;
    if (playersPayload.length && this.trackerClient?.bulkUpsertPlayerNames) {
      const trackerSync = await this.trackerClient.bulkUpsertPlayerNames(playersPayload, source);
      if (trackerSync?.ok) {
        trackerPlayersSynced = Number(
          trackerSync?.data?.playersSeen ||
            trackerSync?.data?.synced?.playersSeen ||
            playersPayload.length
        );
      } else {
        trackerWarning = trackerSync?.error || "Failed to sync player names to tracker.";
      }
    }
    const warning = [
      trackerLookupWarning,
      trackerWarning,
      aggregatorIngest?.ok ? null : aggregatorIngest?.error,
    ]
      .filter(Boolean)
      .join(" | ") || null;

    return {
      ok: true,
      warning,
      requested: normalizedAccountIds.length,
      resolved: Object.keys(namesByAccountId).length,
      trackerCacheHits: Object.keys(trackerNamesByAccountId).length,
      nadeoRequested,
      nadeoResolved,
      namesUpdated: Number(nameUpsert.namesUpdated || 0),
      historyInserted: Number(nameUpsert.historyInserted || 0),
      mapLinksUpdated: Number(mapLinks?.updated || 0),
      aggregatorAccepted: Number(aggregatorIngest?.accepted || 0),
      aggregatorInserted: Number(aggregatorIngest?.inserted || 0),
      aggregatorUpdated: Number(aggregatorIngest?.updated || 0),
      trackerPlayersSynced,
    };
  }

  async runMapperNameSyncCycle({
    priority = false,
    reason = "schedule",
    force = false,
    accountIds = [],
    allowWhenDisabled = false,
    limit = null,
  } = {}) {
    const normalizedRequestedAccountIds = uniqueBy(
      asArray(accountIds)
        .map((accountId) => normalizeAccountId(accountId))
        .filter(Boolean),
      (accountId) => accountId
    );
    const targetedSync = normalizedRequestedAccountIds.length > 0;

    if (!this.mapperNameSync.enabled && !allowWhenDisabled) {
      return { skipped: true, reason: "disabled" };
    }
    if (this.mapperNameSync.running) {
      return { skipped: true, reason: "already-running" };
    }

    const startedAt = new Date().toISOString();
    this.mapperNameSync.running = true;
    this.mapperNameSync.lastStartedAt = startedAt;
    this.mapperNameSync.lastError = null;
    this.mapperNameSync.runCounter += 1;

    try {
      const poolRefresh = await this.refreshMapperAccountPool({
        force: reason === "startup" || force || targetedSync,
      });
      if (poolRefresh?.error) {
        this.mapperNameSync.lastError = poolRefresh.error;
        return {
          error: poolRefresh.error,
        };
      }

      if (targetedSync && typeof this.repository?.seedMapperAccounts === "function") {
        const seeded = this.repository.seedMapperAccounts({
          accountIds: normalizedRequestedAccountIds,
          source: "manual-targeted",
        });
        if (seeded?.error) {
          this.mapperNameSync.lastError = seeded.error;
          return {
            error: seeded.error,
          };
        }
      }

      const statsBefore = this.repository.getMapperAccountStats();
      this.mapperNameSync.mode =
        Number(statsBefore.unresolvedAccounts || 0) > 0 ? "bootstrap" : "maintenance";

      const priorityRefresh = await this.refreshPriorityMapperAccounts({
        force: reason === "startup" || priority,
      });
      if (priorityRefresh?.error) {
        this.logger.warn(
          `[altered-mapper-sync] failed to refresh priority accounts: ${priorityRefresh.error}`
        );
      }

      const syncLimit = clampInt(
        limit !== null && limit !== undefined
          ? Number(limit)
          : targetedSync
            ? normalizedRequestedAccountIds.length
            : priority
              ? this.mapperNameSync.priorityBatchSize
              : this.mapperNameSync.batchSize,
        {
          min: 1,
          max: 5000,
          fallback: priority ? this.mapperNameSync.priorityBatchSize : this.mapperNameSync.batchSize,
        }
      );
      const minResolvedAgeSeconds = force
        ? 0
        : priority
          ? this.mapperNameSync.priorityCacheTtlSeconds
          : this.mapperNameSync.cacheTtlSeconds;
      const preferredAccountIds = targetedSync
        ? normalizedRequestedAccountIds
        : this.mapperNameSync.priorityAccountIds;
      let batchRows = this.repository.getMapperAccountsForSync({
        limit: syncLimit,
        accountIds: preferredAccountIds,
        minResolvedAgeSeconds,
      });
      if (!batchRows.length && !targetedSync && preferredAccountIds.length) {
        batchRows = this.repository.getMapperAccountsForSync({
          limit: syncLimit,
          accountIds: [],
          minResolvedAgeSeconds,
        });
      }
      const accountIds = batchRows.map((row) => row.accountId).filter(Boolean);
      if (!accountIds.length) {
        const statsAfter = this.repository.getMapperAccountStats();
        this.mapperNameSync.mode =
          Number(statsAfter.unresolvedAccounts || 0) > 0 ? "bootstrap" : "maintenance";
        const cacheSkipped = targetedSync
          ? Math.max(0, normalizedRequestedAccountIds.length - accountIds.length)
          : 0;
        this.mapperNameSync.lastSummary = {
          cycle: priority ? "priority" : "main",
          reason,
          skipped: true,
          force,
          targetedSync,
          requestedAccountIds: normalizedRequestedAccountIds.length,
          cacheTtlSeconds: minResolvedAgeSeconds,
          cacheSkipped,
          batchSize: 0,
          statsBefore,
          statsAfter,
          completedAt: new Date().toISOString(),
        };
        return this.mapperNameSync.lastSummary;
      }

      const source = priority ? "mapper-sync-priority" : "mapper-sync";
      const syncResult = await this.syncMapperNamesBatch({
        accountIds,
        source,
      });
      if (syncResult?.error) {
        this.mapperNameSync.lastError = syncResult.error;
      }

      const statsAfter = this.repository.getMapperAccountStats();
      this.mapperNameSync.mode =
        Number(statsAfter.unresolvedAccounts || 0) > 0 ? "bootstrap" : "maintenance";

      this.mapperNameSync.lastSummary = {
        cycle: priority ? "priority" : "main",
        reason,
        force,
        targetedSync,
        requestedAccountIds: normalizedRequestedAccountIds.length,
        cacheTtlSeconds: minResolvedAgeSeconds,
        batchSize: accountIds.length,
        ...syncResult,
        statsBefore,
        statsAfter,
        completedAt: new Date().toISOString(),
      };
      return this.mapperNameSync.lastSummary;
    } catch (error) {
      const message = error?.message || "Mapper sync cycle failed.";
      this.mapperNameSync.lastError = message;
      return {
        error: message,
      };
    } finally {
      this.mapperNameSync.running = false;
      this.mapperNameSync.lastFinishedAt = new Date().toISOString();
      this.scheduleNextMapperSyncRun({ priority: false });
      this.scheduleNextMapperSyncRun({ priority: true });
    }
  }

  async runMapperNameSyncNow({ priority = false, force = false, reason = "manual-api" } = {}) {
    if (this.shouldUseDisplaynameRelay()) {
      const relayResult = await this.runTrackerDisplaynameSync({
        accountIds: [],
        reason,
        forceCandidates: Boolean(force),
      });
      if (relayResult?.ok) {
        return {
          ok: true,
          relay: "tracker-displayname",
          ...relayResult.summary,
        };
      }
      if (!this.trackerIntegrations.displaynameFallbackLocal) {
        return {
          error: relayResult?.error || "Tracker-displayname sync failed.",
        };
      }
    }
    return this.runMapperNameSyncCycle({
      priority: Boolean(priority),
      force: Boolean(force),
      allowWhenDisabled: true,
      reason,
    });
  }

  async syncSpecificMapperAccountIds({
    accountIds = [],
    force = false,
    reason = "manual-targeted-api",
  } = {}) {
    const normalizedRequested = uniqueBy(
      asArray(accountIds)
        .map((accountId) => normalizeAccountId(accountId))
        .filter(Boolean),
      (accountId) => accountId
    );
    if (this.shouldUseDisplaynameRelay()) {
      const relayResult = await this.runTrackerDisplaynameSync({
        accountIds: normalizedRequested,
        reason,
        forceCandidates: Boolean(force),
      });
      if (relayResult?.ok) {
        const upsert = this.repository.upsertMapperNames({
          accountIds: normalizedRequested,
          namesByAccountId: relayResult.namesByAccountId || {},
          source: reason || "manual-targeted-api",
        });
        if (upsert?.error) {
          return {
            error: upsert.error,
          };
        }
        const mapLinks = this.repository.updateMapMapperDisplayNames({
          namesByAccountId: relayResult.namesByAccountId || {},
        });
        return {
          ok: true,
          relay: "tracker-displayname",
          requested: normalizedRequested.length,
          resolved: Object.keys(relayResult.namesByAccountId || {}).length,
          namesUpdated: Number(upsert.namesUpdated || 0),
          historyInserted: Number(upsert.historyInserted || 0),
          mapLinksUpdated: Number(mapLinks?.updated || 0),
          summary: relayResult.summary || null,
        };
      }
      if (!this.trackerIntegrations.displaynameFallbackLocal) {
        return {
          error: relayResult?.error || "Tracker-displayname sync failed.",
        };
      }
    }
    return this.runMapperNameSyncCycle({
      priority: false,
      force: Boolean(force),
      allowWhenDisabled: true,
      reason,
      accountIds,
      limit: 5000,
    });
  }

  async startMapperNameSyncScheduler() {
    if (!this.mapperNameSync.enabled) {
      await this.stopMapperNameSyncScheduler();
      return false;
    }
    if (this.shouldUseDisplaynameRelay()) {
      await this.stopMapperNameSyncScheduler();
      const relayConfig = await this.trackerDisplaynameClient.updateConfig({
        enabled: true,
        schedulerEnabled: true,
        maintenanceIntervalSeconds: this.mapperNameSync.maintenanceIntervalSeconds,
        staleAfterSeconds: this.mapperNameSync.cacheTtlSeconds,
        batchSize: this.mapperNameSync.batchSize,
        maxAccountsPerCycle: Math.max(
          this.mapperNameSync.batchSize,
          this.mapperNameSync.priorityBatchSize,
          this.mapperNameSync.priorityTopLimit
        ),
      });
      if (!relayConfig?.ok) {
        this.trackerIntegrations.lastDisplaynameRelayError =
          relayConfig?.error || "Failed to start tracker-displayname scheduler.";
        if (/not configured|disabled/i.test(this.trackerIntegrations.lastDisplaynameRelayError)) {
          this.trackerIntegrations.displaynameRelayAvailable = false;
        }
        if (!this.trackerIntegrations.displaynameFallbackLocal) return false;
      } else {
        this.trackerIntegrations.displaynameRelayAvailable = true;
        this.trackerIntegrations.lastDisplaynameRelayError = null;
        return true;
      }
    }
    this.scheduleNextMapperSyncRun({ priority: false, fromTimeMs: Date.now() });
    this.scheduleNextMapperSyncRun({ priority: true, fromTimeMs: Date.now() });
    this.runMapperNameSyncCycle({
      priority: false,
      reason: "startup",
    }).catch((error) => {
      this.logger.warn(`[altered-mapper-sync] startup cycle failed: ${error?.message || error}`);
    });
    return true;
  }

  async stopMapperNameSyncScheduler() {
    if (this.shouldUseDisplaynameRelay()) {
      const relayConfig = await this.trackerDisplaynameClient.updateConfig({
        schedulerEnabled: false,
      });
      if (!relayConfig?.ok) {
        this.trackerIntegrations.lastDisplaynameRelayError =
          relayConfig?.error || "Failed to stop tracker-displayname scheduler.";
      } else {
        this.trackerIntegrations.displaynameRelayAvailable = true;
        this.trackerIntegrations.lastDisplaynameRelayError = null;
      }
    }
    if (this.mapperNameSync.timer) {
      clearTimeout(this.mapperNameSync.timer);
      this.mapperNameSync.timer = null;
    }
    if (this.mapperNameSync.priorityTimer) {
      clearTimeout(this.mapperNameSync.priorityTimer);
      this.mapperNameSync.priorityTimer = null;
    }
    this.mapperNameSync.nextRunAt = null;
    this.mapperNameSync.nextPriorityRunAt = null;
    this.mapperNameSync.running = false;
    return true;
  }

  async resolveLiveClient(options = {}) {
    const baseClient = this.liveClient;
    if (!baseClient) {
      return {
        error: "Live client is not initialized.",
      };
    }

    if (baseClient.isConfigured()) {
      return {
        liveClient: baseClient,
        authSource: "service-config",
      };
    }

    const ubisoftAccessToken = String(options?.authContext?.ubisoftAccessToken || "").trim();
    if (ubisoftAccessToken) {
      try {
        const scopedClient = await baseClient.createUserScopedClient({
          ubisoftAccessToken,
        });
        return {
          liveClient: scopedClient,
          authSource: "ubisoft-session",
        };
      } catch (error) {
        const exchangeError =
          error?.message ||
          "Failed to exchange Ubisoft session token for Nadeo access token.";
        return {
          error: `${exchangeError} Configure a service account for Live API calls using ALTERED_LIVE_DEDI_LOGIN and ALTERED_LIVE_DEDI_PASSWORD (or ALTERED_LIVE_ACCESS_TOKEN / ALTERED_LIVE_REFRESH_TOKEN).`,
        };
      }
    }

    if (!baseClient.isConfigured()) {
      return {
        error:
          "Live monitor is not configured. Provide ALTERED_LIVE auth variables (dedi credentials or access token), or sign in with Ubisoft OAuth.",
      };
    }

    return {
      liveClient: baseClient,
      authSource: "service-config",
    };
  }

  async resolveCoreMapClient(options = {}) {
    const baseClient = this.liveClient;
    if (!baseClient) {
      return {
        error: "Live client is not initialized.",
      };
    }

    if (baseClient.authMode === "basic" && baseClient.dediLogin && baseClient.dediPassword) {
      return {
        coreClient: baseClient.createSiblingClient({ audience: "NadeoServices" }),
        authSource: "service-config-basic",
      };
    }

    const ubisoftAccessToken = String(options?.authContext?.ubisoftAccessToken || "").trim();
    if (ubisoftAccessToken) {
      try {
        const scopedClient = await baseClient.createUserScopedClient({
          ubisoftAccessToken,
          audience: "NadeoServices",
        });
        return {
          coreClient: scopedClient,
          authSource: "ubisoft-session",
        };
      } catch (error) {
        return {
          error:
            error?.message ||
            "Failed to exchange Ubisoft session token for a NadeoServices audience token.",
        };
      }
    }

    if (baseClient.defaultAudience === "NadeoServices" && baseClient.isConfigured()) {
      return {
        coreClient: baseClient,
        authSource: "service-config-token",
      };
    }

    return {
      error:
        "Official seasonal sync requires either service basic credentials or a Ubisoft session that can request the NadeoServices audience.",
    };
  }

  resolveLiveOptions(options = {}) {
    return {
      clubId: clampInt(options.clubId ?? this.liveMonitor.clubId, {
        min: 1,
        max: 2147483647,
        fallback: this.liveMonitor.clubId,
      }),
      activityPageSize: clampInt(
        options.activityPageSize ?? options.activityLength ?? this.liveMonitor.activityPageSize,
        { min: 1, max: 250, fallback: this.liveMonitor.activityPageSize }
      ),
      activeOnly:
        parseOptionalBoolean(options.activeOnly) !== undefined
          ? parseOptionalBoolean(options.activeOnly)
          : this.liveMonitor.activeOnly,
      fetchMapDetails:
        parseOptionalBoolean(options.fetchMapDetails) !== undefined
          ? parseOptionalBoolean(options.fetchMapDetails)
          : this.liveMonitor.fetchMapDetails,
    };
  }

  async fetchAllClubActivities(
    liveClient,
    clubId,
    { activityPageSize, activeOnly, maxPages = 1200, onPageLoaded = null }
  ) {
    const out = [];
    let offset = 0;
    let page = 0;
    let pagesLoaded = 0;
    const maxPageCount = clampInt(maxPages, {
      min: 1,
      max: 5000,
      fallback: 1200,
    });
    let effectiveActiveOnly = Boolean(activeOnly);
    let forcedActiveOnlyFallback = false;
    while (page < maxPageCount) {
      let payload;
      try {
        payload = await liveClient.getClubActivities(clubId, {
          length: activityPageSize,
          offset,
          activeOnly: effectiveActiveOnly,
        });
      } catch (error) {
        const statusCode = Number(error?.statusCode || 0);
        const message = String(error?.message || "");
        const responseText = String(error?.responseText || "");
        const playerNotFound =
          message.includes("player:error-notFound") ||
          responseText.includes("player:error-notFound");
        if (!effectiveActiveOnly && offset === 0 && statusCode === 404 && playerNotFound) {
          effectiveActiveOnly = true;
          forcedActiveOnlyFallback = true;
          continue;
        }
        throw error;
      }
      const activities = extractActivities(payload);
      if (!activities.length) break;
      out.push(...activities);
      pagesLoaded += 1;
      if (typeof onPageLoaded === "function") {
        onPageLoaded({
          page: page + 1,
          offset,
          pageSize: activities.length,
          totalLoaded: out.length,
          activeOnly: effectiveActiveOnly,
          forcedFallback: forcedActiveOnlyFallback,
        });
      }
      if (activities.length < activityPageSize) break;
      offset += activities.length;
      page += 1;
    }
    return {
      activities: out,
      pagesLoaded,
      effectiveActiveOnly,
      forcedActiveOnlyFallback,
    };
  }

  async fetchAllClubMembers(liveClient, clubId, { pageSize = 250, onPageLoaded = null } = {}) {
    const out = [];
    let offset = 0;
    let page = 0;
    let pagesLoaded = 0;
    const maxPageCount = 1200;
    const safePageSize = clampInt(pageSize, { min: 1, max: 250, fallback: 250 });
    while (page < maxPageCount) {
      const payload = await liveClient.getClubMembers(clubId, {
        length: safePageSize,
        offset,
      });
      const members = extractMembers(payload);
      if (!members.length) break;
      out.push(...members);
      pagesLoaded += 1;
      if (typeof onPageLoaded === "function") {
        onPageLoaded({
          page: page + 1,
          offset,
          pageSize: members.length,
          totalLoaded: out.length,
        });
      }
      if (members.length < safePageSize) break;
      offset += members.length;
      page += 1;
    }
    return {
      members: out,
      pagesLoaded,
    };
  }

  async fetchAllClubUploadBuckets(
    liveClient,
    clubId,
    { pageSize = 250, onPageLoaded = null } = {}
  ) {
    const out = [];
    let offset = 0;
    let page = 0;
    let pagesLoaded = 0;
    const maxPageCount = 1200;
    const safePageSize = clampInt(pageSize, { min: 1, max: 250, fallback: 250 });
    while (page < maxPageCount) {
      const payload = await liveClient.getClubBuckets({
        bucketType: "map",
        clubId,
        length: safePageSize,
        offset,
      });
      const buckets = extractUploadBuckets(payload);
      if (!buckets.length) break;
      out.push(...buckets);
      pagesLoaded += 1;
      if (typeof onPageLoaded === "function") {
        onPageLoaded({
          page: page + 1,
          offset,
          pageSize: buckets.length,
          totalLoaded: out.length,
        });
      }
      if (buckets.length < safePageSize) break;
      offset += buckets.length;
      page += 1;
    }
    return {
      buckets: uniqueBy(out, (bucket) => String(bucket.bucketId || 0)),
      pagesLoaded,
    };
  }

  async fetchLiveClubStructure(options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    const report = (partial) => {
      if (onProgress) onProgress(partial);
    };
    report({
      phase: "auth",
      percent: 1,
      message: "Resolving Nadeo Live auth context.",
    });

    const resolvedClient = await this.resolveLiveClient(options);
    if (resolvedClient.error) {
      return { error: resolvedClient.error };
    }
    const liveClient = resolvedClient.liveClient;
    const authSource = resolvedClient.authSource;

    const resolved = this.resolveLiveOptions(options);
    const clubId = resolved.clubId;
    report({
      phase: "fetch-club",
      percent: 4,
      message: `Fetching club ${clubId} metadata.`,
      counters: {
        clubId,
      },
    });
    const clubPayload = await liveClient.getClubById(clubId);
    const clubName = firstTruthy([clubPayload?.name, clubPayload?.clubName, `Club ${clubId}`]);
    const clubCampaignEntries = [
      ...asArray(clubPayload?.campaigns),
      ...asArray(clubPayload?.campaignList),
      ...asArray(clubPayload?.clubCampaigns),
    ];
    report({
      phase: "fetch-club",
      percent: 7,
      message: `Loaded club metadata for ${clubName}.`,
      counters: {
        clubId,
        clubName,
        clubCampaignEntries: clubCampaignEntries.length,
      },
    });
    report({
      phase: "fetch-activities",
      percent: 8,
      message: "Fetching paginated club activities.",
    });
    const activityResult = await this.fetchAllClubActivities(liveClient, clubId, {
      ...resolved,
      onPageLoaded: ({
        page,
        offset,
        totalLoaded,
        pageSize,
        activeOnly,
        forcedFallback,
      }) => {
        report({
          phase: "fetch-activities",
          percent: Math.min(24, 8 + page),
          message: forcedFallback
            ? `Loaded activity page ${page} (${pageSize} records) with active=true fallback.`
            : `Loaded activity page ${page} (${pageSize} records).`,
          counters: {
            activityPagesLoaded: page,
            activityOffset: offset,
            activityLastPageSize: pageSize,
            activitiesSeen: totalLoaded,
            activeOnlyUsed: Boolean(activeOnly),
            activityFallbackApplied: Boolean(forcedFallback),
          },
        });
      },
    });
    const activities = activityResult.activities;
    const fetchWarnings = [];

    let members = [];
    let memberPagesLoaded = 0;
    report({
      phase: "fetch-members",
      percent: 25,
      message: "Fetching club member list.",
    });
    try {
      const memberResult = await this.fetchAllClubMembers(liveClient, clubId, {
        pageSize: resolved.activityPageSize,
        onPageLoaded: ({ page, pageSize, totalLoaded }) => {
          report({
            phase: "fetch-members",
            percent: Math.min(29, 25 + page),
            message: `Loaded member page ${page} (${pageSize} records).`,
            counters: {
              memberPagesLoaded: page,
              membersLoaded: totalLoaded,
            },
          });
        },
      });
      members = memberResult.members;
      memberPagesLoaded = Number(memberResult.pagesLoaded || 0);
    } catch (error) {
      fetchWarnings.push(`club members: ${error?.message || "failed to load members"}`);
    }

    report({
      phase: "fetch-uploads",
      percent: 30,
      message: "Fetching upload buckets and recent upload activity.",
    });
    let uploadBuckets = mergeUploadBuckets(
      activities.map((activity) => extractUploadDescriptorFromActivity(activity)).filter(Boolean)
    );
    let uploadBucketPagesLoaded = 0;
    let uploadBucketDetailsLoaded = 0;
    try {
      const uploadBucketResult = await this.fetchAllClubUploadBuckets(liveClient, clubId, {
        pageSize: resolved.activityPageSize,
        onPageLoaded: ({ page, pageSize, totalLoaded }) => {
          report({
            phase: "fetch-uploads",
            percent: Math.min(34, 30 + page),
            message: `Loaded upload bucket page ${page} (${pageSize} records).`,
            counters: {
              uploadBucketPagesLoaded: page,
              uploadBucketsLoaded: totalLoaded,
            },
          });
        },
      });
      uploadBucketPagesLoaded = Number(uploadBucketResult.pagesLoaded || 0);
      uploadBuckets = mergeUploadBuckets(uploadBuckets, uploadBucketResult.buckets);
    } catch (error) {
      fetchWarnings.push(`upload buckets: ${error?.message || "failed to load upload buckets"}`);
    }

    const hydratedUploadBuckets = [];
    for (let index = 0; index < uploadBuckets.length; index += 1) {
      const bucket = uploadBuckets[index];
      if (!bucket?.bucketId) {
        hydratedUploadBuckets.push(bucket);
        continue;
      }
      let hydrated = bucket;
      try {
        const detailPayload = await liveClient.getClubBucketById(clubId, bucket.bucketId);
        const parsed = extractUploadBuckets([detailPayload]);
        if (parsed.length) {
          hydrated = mergeUploadBuckets([bucket], parsed)[0];
        }
        uploadBucketDetailsLoaded += 1;
      } catch (error) {
        if (fetchWarnings.length < 250) {
          fetchWarnings.push(
            `upload bucket ${bucket.bucketId}: ${error?.message || "failed to load details"}`
          );
        }
      }
      hydratedUploadBuckets.push(hydrated);
      report({
        phase: "fetch-uploads",
        percent:
          uploadBuckets.length > 0
            ? 30 + Math.floor(((index + 1) / uploadBuckets.length) * 4)
            : 34,
        message: `Loaded upload bucket details (${index + 1}/${uploadBuckets.length}).`,
        counters: {
          uploadBucketsLoaded: uploadBuckets.length,
          uploadBucketDetailsLoaded,
        },
      });
    }
    uploadBuckets = mergeUploadBuckets(hydratedUploadBuckets);
    const uploadMapsLoaded = uploadBuckets.reduce((sum, bucket) => {
      const maps = Array.isArray(bucket?.maps) ? bucket.maps : [];
      return sum + maps.length;
    }, 0);

    const descriptors = uniqueBy(
      [
        ...activities.map((activity) => extractCampaignFromActivity(activity)).filter(Boolean),
        ...clubCampaignEntries
          .map((campaign) => extractCampaignDescriptorFromObject(campaign))
          .filter(Boolean),
      ],
      (item) => (item.campaignId ? `id:${item.campaignId}` : `name:${item.name.toLowerCase()}`)
    );
    report({
      phase: "fetch-campaigns",
      percent: 35,
      message: `Discovered ${descriptors.length} campaign descriptors.`,
      counters: {
        clubCampaignEntries: clubCampaignEntries.length,
        activityPagesLoaded: Number(activityResult.pagesLoaded || 0),
        activitiesSeen: activities.length,
        membersLoaded: members.length,
        uploadBucketsLoaded: uploadBuckets.length,
        uploadMapsLoaded,
        campaignsSeen: descriptors.length,
      },
    });

    const campaignErrors = [];
    const campaigns = [];
    let campaignsProcessed = 0;
    let campaignsWithMaps = 0;
    let mapsFromCampaigns = 0;
    const discoveredMapUids = new Set();

    for (const descriptor of descriptors) {
      let campaignPayload = descriptor.raw || {};
      if (descriptor.campaignId) {
        try {
          campaignPayload = await liveClient.getClubCampaignById(clubId, descriptor.campaignId);
        } catch (error) {
          if (campaignErrors.length < 250) {
            campaignErrors.push(
              `campaign ${descriptor.campaignId}: ${error?.message || "failed to load details"}`
            );
          }
        }
      }

      const maps = extractCampaignMaps(campaignPayload);
      const campaignName =
        firstTruthy([
          campaignPayload?.name,
          campaignPayload?.campaignName,
          campaignPayload?.campaign?.name,
          descriptor.name,
        ]) || `Campaign ${descriptor.campaignId || "unknown"}`;
      const campaignId = firstPositiveInt([
        campaignPayload?.campaignId,
        campaignPayload?.campaign_id,
        campaignPayload?.id,
        campaignPayload?.campaign?.id,
        descriptor.campaignId,
      ]);
      if (maps.length) {
        campaignsWithMaps += 1;
        mapsFromCampaigns += maps.length;
        for (const map of maps) {
          if (!map?.uid) continue;
          discoveredMapUids.add(String(map.uid).toLowerCase());
        }
        campaigns.push({
          name: campaignName,
          campaignId,
          activityId: descriptor.activityId || null,
          activityType:
            firstTruthy([
              descriptor.activityType,
              campaignPayload?.activityType,
              campaignPayload?.activity_type,
              campaignPayload?.type,
            ]) || null,
          campaignType:
            firstTruthy([
              campaignPayload?.campaignType,
              campaignPayload?.campaign_type,
              campaignPayload?.type,
            ]) || null,
          startTimestamp: toNullableIso(
            campaignPayload?.startTimestamp ??
              campaignPayload?.startDate ??
              campaignPayload?.start_date ??
              campaignPayload?.startsAt
          ),
          endTimestamp: toNullableIso(
            campaignPayload?.endTimestamp ??
              campaignPayload?.endDate ??
              campaignPayload?.end_date ??
              campaignPayload?.endsAt
          ),
          published: Boolean(campaignPayload?.published ?? campaignPayload?.isPublished),
          leaderboardGroupUid: firstTruthy([
            campaignPayload?.leaderboardGroupUid,
            campaignPayload?.leaderboard_group_uid,
            campaignPayload?.leaderboardUid,
          ]),
          maps,
          raw: campaignPayload,
        });
      }
      campaignsProcessed += 1;
      report({
        phase: "fetch-campaigns",
        percent:
          descriptors.length > 0
            ? 35 + Math.floor((campaignsProcessed / descriptors.length) * 23)
            : 58,
        message: `Loaded campaign details (${campaignsProcessed}/${descriptors.length}).`,
        counters: {
          campaignsSeen: descriptors.length,
          campaignsProcessed,
          campaignsWithMaps,
          campaignErrors: campaignErrors.length,
          mapsFromCampaigns,
          mapUidsDiscovered: discoveredMapUids.size,
          currentCampaignName: campaignName,
          currentCampaignId: campaignId || descriptor.campaignId || null,
          currentCampaignMapCount: maps.length,
        },
      });
    }

    const uniqueCampaigns = uniqueBy(
      campaigns,
      (campaign) =>
        campaign.campaignId ? `id:${campaign.campaignId}` : `name:${campaign.name.toLowerCase()}`
    );

    const allMapUids = uniqueBy(
      uniqueCampaigns.flatMap((campaign) => campaign.maps.map((map) => map.uid)),
      (uid) => String(uid).toLowerCase()
    );
    report({
      phase: "prepare-map-details",
      percent: 59,
      message: `Prepared ${allMapUids.length} unique map UIDs.`,
      counters: {
        campaignsLoaded: uniqueCampaigns.length,
        mapUidsDiscovered: allMapUids.length,
        mapDetailsRequested: resolved.fetchMapDetails ? allMapUids.length : 0,
        mapDetailChunksTotal: resolved.fetchMapDetails ? Math.ceil(allMapUids.length / 100) : 0,
      },
    });

    const mapDetailsByUid = new Map();
    if (resolved.fetchMapDetails && allMapUids.length) {
      const detailPayload = await liveClient.getMapsByUidList(allMapUids, {
        onChunk: ({
          index,
          total,
          loadedCount,
          chunkSize,
          requestedCount,
          firstUid,
          lastUid,
        }) => {
          report({
            phase: "fetch-map-details",
            percent: 59 + Math.floor((index / Math.max(total, 1)) * 19),
            message: `Fetched map metadata chunks (${index}/${total}).`,
            counters: {
              mapDetailChunksTotal: total,
              mapDetailChunksLoaded: index,
              mapDetailChunkSize: chunkSize,
              mapDetailsRequested: requestedCount,
              mapDetailsLoaded: loadedCount,
              mapDetailFirstUid: firstUid || "",
              mapDetailLastUid: lastUid || "",
            },
          });
        },
      });
      for (const item of detailPayload) {
        const uid = normalizeMapUid(item?.uid || item?.mapUid || item?.map_uid);
        if (!uid) continue;
        mapDetailsByUid.set(uid.toLowerCase(), item);
      }
    }

    const enrichedCampaigns = uniqueCampaigns.map((campaign) => ({
      ...campaign,
      maps: campaign.maps.map((map) => mergeMapDetail(map, mapDetailsByUid.get(map.uid.toLowerCase()))),
    }));

    const mapCount = enrichedCampaigns.reduce((sum, campaign) => sum + campaign.maps.length, 0);

    const summary = {
      clubId,
      clubName,
      clubCampaignEntries: clubCampaignEntries.length,
      activityPagesLoaded: Number(activityResult.pagesLoaded || 0),
      activitiesSeen: activities.length,
      campaignsSeen: descriptors.length,
      campaignsLoaded: enrichedCampaigns.length,
      campaignsWithMaps,
      mapsLoaded: mapCount,
      mapUidsDiscovered: allMapUids.length,
      membersLoaded: members.length,
      memberPagesLoaded,
      uploadBucketsLoaded: uploadBuckets.length,
      uploadBucketPagesLoaded,
      uploadBucketDetailsLoaded,
      uploadMapsLoaded,
      mapDetailsRequested: resolved.fetchMapDetails ? allMapUids.length : 0,
      mapDetailsLoaded: mapDetailsByUid.size,
      mapDetailsCoveragePercent:
        resolved.fetchMapDetails && allMapUids.length
          ? Math.floor((mapDetailsByUid.size / allMapUids.length) * 100)
          : resolved.fetchMapDetails
            ? 0
            : 100,
      fetchMapDetails: resolved.fetchMapDetails,
      activeOnlyRequested: resolved.activeOnly,
      activeOnlyUsed: activityResult.effectiveActiveOnly,
      activityFallbackApplied: activityResult.forcedActiveOnlyFallback,
      authSource,
      authWarning: resolvedClient.warning || null,
    };
    report({
      phase: "fetch-complete",
      percent: 79,
      message: `Fetched ${summary.campaignsLoaded} campaigns and ${summary.mapsLoaded} maps.`,
      counters: {
        ...summary,
        campaignErrors: campaignErrors.length,
      },
    });

    const warnings = [...fetchWarnings, ...campaignErrors];
    if (activityResult.forcedActiveOnlyFallback) {
      warnings.unshift(
        "Activity endpoint returned player:error-notFound for active=false; retried with active=true."
      );
    }

    if (parseOptionalBoolean(options.summaryOnly) === true) {
      return {
        club: {
          id: clubId,
          name: clubName,
        },
        summary,
        warnings,
        campaignSample: enrichedCampaigns.slice(0, 20).map((campaign) => ({
          name: campaign.name,
          campaignId: campaign.campaignId || null,
          mapCount: campaign.maps.length,
        })),
        memberSample: members.slice(0, 20),
        uploadBucketSample: uploadBuckets.slice(0, 20).map((bucket) => ({
          bucketId: bucket.bucketId || null,
          name: bucket.name || "",
          bucketType: bucket.bucketType || "map",
          mapCount: Number(bucket.mapCount || 0),
          mapsSeen: Array.isArray(bucket.maps) ? bucket.maps.length : 0,
        })),
      };
    }

    return {
      club: {
        id: clubId,
        name: clubName,
        raw: clubPayload,
      },
      campaigns: enrichedCampaigns,
      activities,
      members,
      uploadBuckets,
      summary,
      warnings,
    };
  }

  async syncLiveClubSnapshot(options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    const hookKey = toText(options.hookKey || "altered-club", "altered-club");
    const fetched = await this.fetchLiveClubStructure({
      ...options,
      onProgress,
    });
    if (fetched?.error) return fetched;

    const noteSuffix = String(options.note || "").trim();
    const syncPayload = {
      hookKey,
      club: {
        id: fetched.club.id,
        name: fetched.club.name,
      },
      campaigns: fetched.campaigns,
      sourceLabel: options.sourceLabel || "altered-live-monitor",
      note: noteSuffix || `live-club-${fetched.club.id}`,
    };

    const syncResult = await this.syncHookSnapshot(syncPayload, {
      onProgress,
      relayClubSnapshot: false,
      hookKey,
    });
    if (syncResult?.error) return syncResult;

    let monitoringRelay = null;
    if (this.shouldUseClubRelay()) {
      if (onProgress) {
        onProgress({
          phase: "relay-tracker-club",
          percent: 85,
          message: "Relaying club snapshot to tracker-club service.",
          counters: {
            relayClubId: fetched.club.id,
            relayCampaigns: asArray(fetched.campaigns).length,
            relayMembers: asArray(fetched.members).length,
            relayActivities: asArray(fetched.activities).length,
            relayUploadBuckets: asArray(fetched.uploadBuckets).length,
          },
        });
      }
      monitoringRelay = await this.relayClubSnapshotToTrackerClub({
        club: {
          id: fetched.club.id,
          name: fetched.club.name,
        },
        campaigns: fetched.campaigns,
        members: fetched.members,
        activities: fetched.activities,
        uploadBuckets: fetched.uploadBuckets,
        observedAt: new Date().toISOString(),
      });
      if (monitoringRelay?.error) {
        fetched.warnings = [
          ...asArray(fetched.warnings),
          `Tracker-club relay warning: ${monitoringRelay.error}`,
        ];
        if (!this.trackerIntegrations.clubFallbackLocal) {
          return {
            error: monitoringRelay.error,
          };
        }
      }
    }

    let monitoringSync = null;
    const shouldRunLocalMonitoring =
      !this.shouldUseClubRelay() || this.trackerIntegrations.clubFallbackLocal;
    if (shouldRunLocalMonitoring && typeof this.repository?.upsertClubMonitoringData === "function") {
      if (onProgress) {
        onProgress({
          phase: "sync-club-monitoring",
          percent: 88,
          message: "Storing club members, activities, and upload buckets.",
          counters: {
            membersToStore: Array.isArray(fetched.members) ? fetched.members.length : 0,
            activitiesToStore: Array.isArray(fetched.activities) ? fetched.activities.length : 0,
            uploadBucketsToStore: Array.isArray(fetched.uploadBuckets)
              ? fetched.uploadBuckets.length
              : 0,
          },
        });
      }
      monitoringSync = this.repository.upsertClubMonitoringData({
        clubId: fetched.club.id,
        members: fetched.members,
        activities: fetched.activities,
        uploadBuckets: fetched.uploadBuckets,
      });
      if (monitoringSync?.error) {
        fetched.warnings = [
          ...asArray(fetched.warnings),
          `Club monitoring storage warning: ${monitoringSync.error}`,
        ];
      } else if (onProgress) {
        onProgress({
          phase: "sync-club-monitoring",
          percent: 91,
          message: "Club monitoring storage completed.",
          counters: {
            membersSeen: Number(monitoringSync.membersSeen || 0),
            activitiesSeen: Number(monitoringSync.activitiesSeen || 0),
            uploadBucketsSeen: Number(monitoringSync.uploadBucketsSeen || 0),
            uploadMapsSeen: Number(monitoringSync.uploadMapsSeen || 0),
          },
        });
      }
    }

    const mapperNameSync = await this.syncMapperNamesForCampaigns({
      campaigns: fetched.campaigns,
      note: noteSuffix || `live-club-${fetched.club.id}`,
      onProgress,
    });
    if (mapperNameSync?.warning) {
      fetched.warnings = [...asArray(fetched.warnings), mapperNameSync.warning];
    }

    const monitoringSummary = {
      membersSeen: Number(
        monitoringSync?.membersSeen ??
          monitoringRelay?.membersSeen ??
          asArray(fetched.members).length
      ),
      activitiesSeen: Number(
        monitoringSync?.activitiesSeen ??
          monitoringRelay?.activitiesSeen ??
          asArray(fetched.activities).length
      ),
      uploadBucketsSeen: Number(
        monitoringSync?.uploadBucketsSeen ??
          monitoringRelay?.uploadsSeen ??
          asArray(fetched.uploadBuckets).length
      ),
      uploadMapsSeen: Number(
        monitoringSync?.uploadMapsSeen ??
          monitoringRelay?.uploadMapsSeen ??
          0
      ),
      relay: monitoringRelay || null,
      local: monitoringSync || null,
    };

    return {
      fetched: {
        summary: fetched.summary,
        warnings: fetched.warnings,
      },
      synced: {
        ...syncResult.synced,
        monitoring: monitoringSummary,
        mapperNames: mapperNameSync || null,
      },
    };
  }

  async syncMapperNamesForCampaigns({ campaigns = [], note = "", onProgress = null } = {}) {
    const mapperAccountIds = collectMapperAccountIds(campaigns);
    if (onProgress) {
      onProgress({
        phase: "resolve-mapper-names",
        percent: 92,
        message: `Preparing mapper identity sync for ${mapperAccountIds.length} account IDs.`,
        counters: {
          mapperAccountsSeen: mapperAccountIds.length,
        },
      });
    }
    if (!mapperAccountIds.length) {
      return {
        ok: true,
        mapperAccountsSeen: 0,
        mapperNamesResolved: 0,
        mapperNamesUpdated: 0,
        mapperNameHistoryInserted: 0,
        mapperMapNameLinksUpdated: 0,
      };
    }

    const source = String(note || "live-sync").trim() || "live-sync";

    const syncResult = await this.syncMapperNamesBatch({
      accountIds: mapperAccountIds,
      source,
    });
    if (!syncResult?.ok && syncResult?.error) {
      return {
        ok: false,
        warning: syncResult.error,
        mapperAccountsSeen: mapperAccountIds.length,
        mapperNamesResolved: Number(syncResult.resolved || 0),
        mapperNamesUpdated: Number(syncResult.namesUpdated || 0),
        mapperNameHistoryInserted: Number(syncResult.historyInserted || 0),
        mapperMapNameLinksUpdated: Number(syncResult.mapLinksUpdated || 0),
      };
    }

    if (onProgress) {
      onProgress({
        phase: "resolve-mapper-names",
        percent: 97,
        message: `Mapper names synced (${Number(syncResult?.resolved || 0)} resolved, ${Number(
          syncResult?.namesUpdated || 0
        )} updated).`,
        counters: {
          mapperAccountsSeen: mapperAccountIds.length,
          mapperNamesResolved: Number(syncResult?.resolved || 0),
          mapperNamesUpdated: Number(syncResult?.namesUpdated || 0),
          mapperNameHistoryInserted: Number(syncResult?.historyInserted || 0),
          mapperMapNameLinksUpdated: Number(syncResult?.mapLinksUpdated || 0),
          trackerPlayersSynced: Number(syncResult?.trackerPlayersSynced || 0),
        },
      });
    }

    return {
      ok: true,
      warning: syncResult?.warning || null,
      mapperAccountsSeen: mapperAccountIds.length,
      mapperNamesResolved: Number(syncResult?.resolved || 0),
      mapperNamesUpdated: Number(syncResult?.namesUpdated || 0),
      mapperNameHistoryInserted: Number(syncResult?.historyInserted || 0),
      mapperMapNameLinksUpdated: Number(syncResult?.mapLinksUpdated || 0),
      trackerPlayersSynced: Number(syncResult?.trackerPlayersSynced || 0),
    };
  }

  updateLiveMonitorConfig(options = {}) {
    const enabled = parseOptionalBoolean(options.enabled);
    const discoveryEnabled = parseOptionalBoolean(options.discoveryEnabled);
    const activeOnly = parseOptionalBoolean(options.activeOnly);
    const fetchMapDetails = parseOptionalBoolean(options.fetchMapDetails);
    const scheduleMode = normalizeScheduleMode(options.scheduleMode, "");

    if (enabled !== undefined) this.liveMonitor.enabled = enabled;
    if (discoveryEnabled !== undefined) this.liveMonitor.discoveryEnabled = discoveryEnabled;
    if (activeOnly !== undefined) this.liveMonitor.activeOnly = activeOnly;
    if (fetchMapDetails !== undefined) this.liveMonitor.fetchMapDetails = fetchMapDetails;
    if (scheduleMode) this.liveMonitor.scheduleMode = scheduleMode;

    if (options.clubId !== undefined) {
      this.liveMonitor.clubId = clampInt(options.clubId, {
        min: 1,
        max: 2147483647,
        fallback: this.liveMonitor.clubId,
      });
    }
    if (options.intervalSeconds !== undefined) {
      this.liveMonitor.intervalSeconds = clampInt(options.intervalSeconds, {
        min: 60,
        max: 86400,
        fallback: this.liveMonitor.intervalSeconds,
      });
    }
    if (options.activityPageSize !== undefined) {
      this.liveMonitor.activityPageSize = clampInt(options.activityPageSize, {
        min: 1,
        max: 250,
        fallback: this.liveMonitor.activityPageSize,
      });
    }
    if (options.discoveryIntervalSeconds !== undefined) {
      this.liveMonitor.discoveryIntervalSeconds = clampInt(options.discoveryIntervalSeconds, {
        min: 300,
        max: 86400,
        fallback: this.liveMonitor.discoveryIntervalSeconds,
      });
    }
    if (options.discoveryCampaignLimit !== undefined) {
      this.liveMonitor.discoveryCampaignLimit = clampInt(options.discoveryCampaignLimit, {
        min: 1,
        max: 250,
        fallback: this.liveMonitor.discoveryCampaignLimit,
      });
    }
    if (options.discoveryActivityPageSize !== undefined) {
      this.liveMonitor.discoveryActivityPageSize = clampInt(options.discoveryActivityPageSize, {
        min: 1,
        max: 250,
        fallback: this.liveMonitor.discoveryActivityPageSize,
      });
    }
    if (options.dailyHourUtc !== undefined) {
      this.liveMonitor.dailyHourUtc = clampInt(options.dailyHourUtc, {
        min: 0,
        max: 23,
        fallback: this.liveMonitor.dailyHourUtc,
      });
    }
    if (options.dailyMinuteUtc !== undefined) {
      this.liveMonitor.dailyMinuteUtc = clampInt(options.dailyMinuteUtc, {
        min: 0,
        max: 59,
        fallback: this.liveMonitor.dailyMinuteUtc,
      });
    }
    if (options.trackerChunkSize !== undefined) {
      this.liveMonitor.trackerChunkSize = clampInt(options.trackerChunkSize, {
        min: 25,
        max: 1000,
        fallback: this.liveMonitor.trackerChunkSize,
      });
    }

    if (this.liveMonitor.enabled) this.startLiveMonitor();
    else this.stopLiveMonitor();
    this.persistLiveMonitorConfig();
    return this.getLiveMonitorStatus();
  }

  getProjectClubsForSync() {
    const clubs = this.getProjectClubs({ includeDisabled: false });
    const primaryClubId = clampInt(this.liveMonitor.clubId, {
      min: 1,
      max: 2147483647,
      fallback: 0,
    });
    const primaryHook =
      clubs.find((club) => Number(club?.clubId || 0) === primaryClubId) ||
      this.repository.getHookConfig("altered-club") ||
      {
        hookKey: "altered-club",
        clubId: primaryClubId,
        clubName: `Club ${primaryClubId}`,
        sourceLabel: "altered-live-monitor",
        enabled: true,
        autoTrackNewMaps: true,
      };

    return uniqueBy(
      [primaryHook, ...clubs].filter((club) => Number(club?.clubId || 0) > 0),
      (club) => Number(club.clubId || 0)
    ).map((club) => ({
      ...club,
      primary:
        Number(club?.clubId || 0) === primaryClubId ||
        String(club?.hookKey || "") === "altered-club",
    }));
  }

  async runLiveMonitorCycle({ reason = "manual", authContext = null } = {}) {
    if (this.mapCopy.running) {
      return {
        skipped: true,
        reason: "map-local-copy-backfill running",
      };
    }
    if (this.liveMonitor.running || this.liveMonitor.discoveryRunning) {
      return {
        skipped: true,
        reason: "monitor already running",
      };
    }
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    this.liveMonitor.runCounter += 1;
    const runId = this.liveMonitor.runCounter;
    this.liveMonitor.running = true;
    this.liveMonitor.lastStartedAt = startedAt;
    this.liveMonitor.lastDurationMs = null;
    this.liveMonitor.lastError = null;
    this.updateLiveProgress({
      runId,
      reason,
      status: "running",
      phase: "queued",
      percent: 0,
      startedAt,
      finishedAt: null,
      message: "Starting live club sync.",
      counters: {},
      replaceCounters: true,
    });

    try {
      const syncTargets = this.getProjectClubsForSync();
      const targetCount = Math.max(1, syncTargets.length);
      const results = [];
      let fatalError = null;

      for (let index = 0; index < syncTargets.length; index += 1) {
        const target = syncTargets[index];
        const clubLabel =
          toText(target?.clubName || "", `Club ${target?.clubId || index + 1}`) ||
          `Club ${target?.clubId || index + 1}`;
        const startPercent = Math.floor((index * 100) / targetCount);
        const endPercent = Math.floor(((index + 1) * 100) / targetCount);

        const result = await this.syncLiveClubSnapshot({
          hookKey: target.hookKey || "altered-club",
          clubId: target.clubId,
          sourceLabel: target.sourceLabel || "altered-live-monitor",
          activityPageSize: this.liveMonitor.activityPageSize,
          activeOnly: this.liveMonitor.activeOnly,
          fetchMapDetails: this.liveMonitor.fetchMapDetails,
          note: `live-monitor:${reason}:${target.hookKey || target.clubId}`,
          authContext,
          onProgress: (partial) => {
            const partialPercent = clampInt(partial?.percent, {
              min: 0,
              max: 100,
              fallback: 0,
            });
            const scaledPercent =
              startPercent + Math.floor(((endPercent - startPercent) * partialPercent) / 100);
            this.updateLiveProgress({
              runId,
              reason,
              status: "running",
              startedAt,
              ...partial,
              percent: scaledPercent,
              message:
                targetCount > 1 && partial?.message
                  ? `${clubLabel}: ${partial.message}`
                  : partial?.message || `Syncing ${clubLabel}.`,
            });
          },
        });

        results.push({
          hookKey: target.hookKey || "altered-club",
          clubId: Number(target.clubId || 0),
          clubName: clubLabel,
          sourceLabel: target.sourceLabel || "altered-live-monitor",
          primary: Boolean(target.primary),
          result,
        });

        if (result?.error) {
          fatalError = `${clubLabel}: ${result.error}`;
          break;
        }
      }

      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.now() - startedMs);
      if (fatalError) {
        this.liveMonitor.lastError = String(fatalError);
        this.liveMonitor.lastDurationMs = durationMs;
        this.updateLiveProgress({
          runId,
          reason,
          status: "error",
          phase: "failed",
          percent: this.liveMonitor.progress?.percent || 0,
          finishedAt,
          durationMs,
          message: String(fatalError),
        });
        return {
          error: fatalError,
          results,
        };
      }

      const aggregate = {
        clubsSynced: 0,
        campaignsLoaded: 0,
        mapsLoaded: 0,
        mapDetailsLoaded: 0,
        mapsStored: 0,
        mapsInserted: 0,
        mapsUpdated: 0,
        mapsLinked: 0,
        membersLoaded: 0,
        activitiesSeen: 0,
        uploadBucketsLoaded: 0,
        uploadMapsLoaded: 0,
        membersStored: 0,
        activitiesStored: 0,
        uploadBucketsStored: 0,
        uploadMapsStored: 0,
        mapperAccountsSeen: 0,
        mapperNamesResolved: 0,
        mapperNamesUpdated: 0,
        mapperNameHistoryInserted: 0,
        mapperMapNameLinksUpdated: 0,
        clubs: [],
      };

      for (const entry of results) {
        const summary = entry?.result?.fetched?.summary || {};
        const synced = entry?.result?.synced || {};
        const monitoring = synced?.monitoring || {};
        const mapperNames = synced?.mapperNames || {};
        aggregate.clubsSynced += 1;
        aggregate.campaignsLoaded += Number(summary.campaignsLoaded || 0);
        aggregate.mapsLoaded += Number(summary.mapsLoaded || 0);
        aggregate.mapDetailsLoaded += Number(summary.mapDetailsLoaded || 0);
        aggregate.mapsStored += Number(synced.mapsSeen || 0);
        aggregate.mapsInserted += Number(synced.mapsInserted || 0);
        aggregate.mapsUpdated += Number(synced.mapsUpdated || 0);
        aggregate.mapsLinked += Number(synced.mapsLinked || 0);
        aggregate.membersLoaded += Number(summary.membersLoaded || 0);
        aggregate.activitiesSeen += Number(summary.activitiesSeen || 0);
        aggregate.uploadBucketsLoaded += Number(summary.uploadBucketsLoaded || 0);
        aggregate.uploadMapsLoaded += Number(summary.uploadMapsLoaded || 0);
        aggregate.membersStored += Number(monitoring.membersSeen || 0);
        aggregate.activitiesStored += Number(monitoring.activitiesSeen || 0);
        aggregate.uploadBucketsStored += Number(monitoring.uploadBucketsSeen || 0);
        aggregate.uploadMapsStored += Number(monitoring.uploadMapsSeen || 0);
        aggregate.mapperAccountsSeen += Number(mapperNames.mapperAccountsSeen || 0);
        aggregate.mapperNamesResolved += Number(mapperNames.mapperNamesResolved || 0);
        aggregate.mapperNamesUpdated += Number(mapperNames.mapperNamesUpdated || 0);
        aggregate.mapperNameHistoryInserted += Number(
          mapperNames.mapperNameHistoryInserted || 0
        );
        aggregate.mapperMapNameLinksUpdated += Number(
          mapperNames.mapperMapNameLinksUpdated || 0
        );
        aggregate.clubs.push({
          hookKey: entry.hookKey,
          clubId: entry.clubId,
          clubName: entry.clubName,
          sourceLabel: entry.sourceLabel,
          primary: entry.primary,
          campaignsLoaded: Number(summary.campaignsLoaded || 0),
          mapsLoaded: Number(summary.mapsLoaded || 0),
          mapsStored: Number(synced.mapsSeen || 0),
          mapsInserted: Number(synced.mapsInserted || 0),
          mapsUpdated: Number(synced.mapsUpdated || 0),
          mapsLinked: Number(synced.mapsLinked || 0),
          lastWarning:
            Array.isArray(entry?.result?.fetched?.warnings) && entry.result.fetched.warnings.length
              ? String(entry.result.fetched.warnings[0] || "")
              : null,
        });
      }

      this.liveMonitor.lastDurationMs = durationMs;
      this.updateLiveProgress({
        runId,
        reason,
        status: "ok",
        phase: "complete",
        percent: 100,
        finishedAt,
        durationMs,
        message:
          aggregate.clubsSynced > 1
            ? `Synced ${aggregate.clubsSynced} clubs: ${aggregate.campaignsLoaded} campaigns, ${aggregate.mapsLoaded} maps.`
            : `Sync completed: ${aggregate.campaignsLoaded} campaigns, ${aggregate.mapsLoaded} maps.`,
        counters: {
          ...aggregate,
          durationMs,
        },
      });
      this.liveMonitor.lastSummary = aggregate;
      this.liveMonitor.lastFinishedAt = finishedAt;
      try {
        this.queueAlterationsSync({ reason: `post-live-monitor:${reason}` });
      } catch (syncErr) {
        this.logger.warn(`[alterations-sync] post-cycle sync failed: ${syncErr?.message || syncErr}`);
      }
      return {
        fetched: {
          summary: aggregate,
        },
        synced: {
          mapsSeen: aggregate.mapsStored,
          mapsInserted: aggregate.mapsInserted,
          mapsUpdated: aggregate.mapsUpdated,
          mapsLinked: aggregate.mapsLinked,
        },
        results,
      };
    } catch (error) {
      const message = error?.message || "Live monitor cycle failed.";
      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.now() - startedMs);
      this.liveMonitor.lastError = message;
      this.liveMonitor.lastFinishedAt = finishedAt;
      this.liveMonitor.lastDurationMs = durationMs;
      this.updateLiveProgress({
        runId,
        reason,
        status: "error",
        phase: "failed",
        percent: this.liveMonitor.progress?.percent || 0,
        finishedAt,
        durationMs,
        message,
      });
      this.logger.warn(`[altered-live] monitor cycle failed: ${message}`);
      return { error: message };
    } finally {
      this.liveMonitor.running = false;
    }
  }

  async runLiveDiscoveryCycle({ reason = "hourly-discovery", authContext = null } = {}) {
    if (this.mapCopy.running) {
      return {
        skipped: true,
        reason: "map-local-copy-backfill running",
      };
    }
    if (this.liveMonitor.running || this.liveMonitor.discoveryRunning) {
      return {
        skipped: true,
        reason: "monitor already running",
      };
    }

    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    this.liveMonitor.discoveryRunning = true;
    this.liveMonitor.lastDiscoveryStartedAt = startedAt;
    this.liveMonitor.lastDiscoveryDurationMs = null;
    this.liveMonitor.lastDiscoveryError = null;

    this.updateLiveProgress({
      reason,
      status: "running",
      phase: "discovery-auth",
      percent: 0,
      startedAt,
      finishedAt: null,
      message: "Starting hourly discovery cycle.",
      counters: {},
      replaceCounters: true,
    });

    try {
      const resolvedClient = await this.resolveLiveClient({
        authContext,
      });
      if (resolvedClient.error) {
        throw new Error(resolvedClient.error);
      }
      const liveClient = resolvedClient.liveClient;
      const authSource = resolvedClient.authSource;
      const clubId = this.liveMonitor.clubId;
      const pageSize = this.liveMonitor.discoveryActivityPageSize;
      const campaignLimit = this.liveMonitor.discoveryCampaignLimit;

      this.updateLiveProgress({
        reason,
        status: "running",
        phase: "discovery-activities",
        percent: 8,
        message: `Loading latest activity page for club ${clubId}.`,
        counters: {
          clubId,
          activityPageSize: pageSize,
          discoveryCampaignLimit: campaignLimit,
          authSource,
        },
      });

      const clubPayload = await liveClient.getClubById(clubId);
      const clubName = firstTruthy([clubPayload?.name, clubPayload?.clubName, `Club ${clubId}`]);
      const activityResult = await this.fetchAllClubActivities(liveClient, clubId, {
        activityPageSize: pageSize,
        activeOnly: this.liveMonitor.activeOnly,
        maxPages: 1,
      });
      const activities = activityResult.activities;
      const activityIds = uniqueBy(
        activities
          .map((activity) => extractActivityId(activity))
          .filter((activityId) => Number(activityId) > 0),
        (activityId) => activityId
      );
      const knownActivityIds = new Set(
        this.repository.getKnownActivityIds({
          clubId,
          activityIds,
        })
      );
      const newActivityCount = activityIds.filter((activityId) => !knownActivityIds.has(activityId)).length;

      let uploadBuckets = mergeUploadBuckets(
        activities.map((activity) => extractUploadDescriptorFromActivity(activity)).filter(Boolean)
      );
      const uploadBucketIds = uploadBuckets
        .map((bucket) => firstPositiveInt([bucket?.bucketId]))
        .filter((bucketId) => bucketId > 0);
      const knownUploadBucketIds = new Set(
        this.repository.getKnownUploadBucketIds({
          clubId,
          bucketIds: uploadBucketIds,
        })
      );
      let uploadBucketDetailsLoaded = 0;
      const hydratedUploadBuckets = [];
      for (const bucket of uploadBuckets) {
        const bucketId = firstPositiveInt([bucket?.bucketId]);
        if (!bucketId || knownUploadBucketIds.has(bucketId)) {
          hydratedUploadBuckets.push(bucket);
          continue;
        }
        try {
          const detailPayload = await liveClient.getClubBucketById(clubId, bucketId);
          const parsed = extractUploadBuckets([detailPayload]);
          const merged = parsed.length ? mergeUploadBuckets([bucket], parsed)[0] : bucket;
          hydratedUploadBuckets.push(merged);
          uploadBucketDetailsLoaded += 1;
        } catch (error) {
          this.logger.warn(
            `[altered-live] discovery: failed to hydrate upload bucket ${bucketId}: ${
              error?.message || error
            }`
          );
          hydratedUploadBuckets.push(bucket);
        }
      }
      uploadBuckets = mergeUploadBuckets(hydratedUploadBuckets);
      const uploadMapsLoaded = uploadBuckets.reduce((sum, bucket) => {
        const maps = Array.isArray(bucket?.maps) ? bucket.maps : [];
        return sum + maps.length;
      }, 0);

      const descriptors = uniqueBy(
        activities.map((activity) => extractCampaignFromActivity(activity)).filter(Boolean),
        (item) =>
          item.campaignId ? `id:${item.campaignId}` : `name:${String(item.name || "").toLowerCase()}`
      );
      descriptors.sort((a, b) => Number(b?.activityId || 0) - Number(a?.activityId || 0));
      const latestDescriptors = descriptors.slice(0, campaignLimit);
      const campaignIds = latestDescriptors
        .map((descriptor) => firstPositiveInt([descriptor?.campaignId]))
        .filter((campaignId) => campaignId > 0);
      const knownCampaignIds = new Set(
        this.repository.getKnownCampaignExternalIds({
          clubId,
          campaignExternalIds: campaignIds,
        })
      );
      const newDescriptors = latestDescriptors.filter((descriptor) => {
        const campaignId = firstPositiveInt([descriptor?.campaignId]);
        if (!campaignId) return false;
        return !knownCampaignIds.has(campaignId);
      });

      this.updateLiveProgress({
        reason,
        status: "running",
        phase: "discovery-campaigns",
        percent: 28,
        message: `Detected ${newDescriptors.length} new campaigns in the latest ${latestDescriptors.length}.`,
        counters: {
          activitiesSeen: activities.length,
          newActivities: newActivityCount,
          latestCampaignsChecked: latestDescriptors.length,
          newCampaignsDetected: newDescriptors.length,
          uploadBucketsSeen: uploadBuckets.length,
          uploadMapsSeen: uploadMapsLoaded,
          uploadBucketDetailsLoaded,
        },
      });

      const campaigns = [];
      const discoveredMapUids = new Set();
      for (let index = 0; index < newDescriptors.length; index += 1) {
        const descriptor = newDescriptors[index];
        let campaignPayload = descriptor.raw || {};
        if (descriptor.campaignId) {
          campaignPayload = await liveClient.getClubCampaignById(clubId, descriptor.campaignId);
        }
        const maps = extractCampaignMaps(campaignPayload);
        for (const map of maps) {
          if (!map?.uid) continue;
          discoveredMapUids.add(String(map.uid).toLowerCase());
        }
        campaigns.push({
          name:
            firstTruthy([
              campaignPayload?.name,
              campaignPayload?.campaignName,
              campaignPayload?.campaign?.name,
              descriptor.name,
            ]) || `Campaign ${descriptor.campaignId || "unknown"}`,
          campaignId:
            firstPositiveInt([
              campaignPayload?.campaignId,
              campaignPayload?.campaign_id,
              campaignPayload?.id,
              campaignPayload?.campaign?.id,
              descriptor.campaignId,
            ]) || null,
          activityId: descriptor.activityId || null,
          activityType:
            firstTruthy([
              descriptor.activityType,
              campaignPayload?.activityType,
              campaignPayload?.activity_type,
              campaignPayload?.type,
            ]) || null,
          campaignType:
            firstTruthy([
              campaignPayload?.campaignType,
              campaignPayload?.campaign_type,
              campaignPayload?.type,
            ]) || null,
          startTimestamp: toNullableIso(
            campaignPayload?.startTimestamp ??
              campaignPayload?.startDate ??
              campaignPayload?.start_date ??
              campaignPayload?.startsAt
          ),
          endTimestamp: toNullableIso(
            campaignPayload?.endTimestamp ??
              campaignPayload?.endDate ??
              campaignPayload?.end_date ??
              campaignPayload?.endsAt
          ),
          published: Boolean(campaignPayload?.published ?? campaignPayload?.isPublished),
          leaderboardGroupUid: firstTruthy([
            campaignPayload?.leaderboardGroupUid,
            campaignPayload?.leaderboard_group_uid,
            campaignPayload?.leaderboardUid,
          ]),
          maps,
          raw: campaignPayload,
        });
        this.updateLiveProgress({
          reason,
          status: "running",
          phase: "discovery-campaigns",
          percent:
            newDescriptors.length > 0
              ? 28 + Math.floor(((index + 1) / newDescriptors.length) * 32)
              : 60,
          message: `Hydrating new campaigns (${index + 1}/${newDescriptors.length}).`,
          counters: {
            newCampaignsDetected: newDescriptors.length,
            newCampaignsHydrated: index + 1,
            discoveredMapUids: discoveredMapUids.size,
          },
        });
      }

      const allMapUids = uniqueBy([...discoveredMapUids], (uid) => String(uid).toLowerCase());
      const mapDetailsByUid = new Map();
      if (this.liveMonitor.fetchMapDetails && allMapUids.length) {
        const detailPayload = await liveClient.getMapsByUidList(allMapUids);
        for (const item of detailPayload) {
          const uid = normalizeMapUid(item?.uid || item?.mapUid || item?.map_uid);
          if (!uid) continue;
          mapDetailsByUid.set(uid.toLowerCase(), item);
        }
      }
      const enrichedCampaigns = campaigns.map((campaign) => ({
        ...campaign,
        maps: campaign.maps.map((map) =>
          mergeMapDetail(map, mapDetailsByUid.get(String(map.uid || "").toLowerCase()))
        ),
      }));

      let monitoringRelay = null;
      if (this.shouldUseClubRelay()) {
        monitoringRelay = await this.relayClubSnapshotToTrackerClub({
          club: {
            id: clubId,
            name: clubName,
          },
          campaigns: enrichedCampaigns,
          members: [],
          activities,
          uploadBuckets,
          observedAt: new Date().toISOString(),
        });
        if (monitoringRelay?.error && !this.trackerIntegrations.clubFallbackLocal) {
          throw new Error(monitoringRelay.error);
        }
      }

      let monitoringLocal = null;
      const shouldRunLocalMonitoring =
        !this.shouldUseClubRelay() || this.trackerIntegrations.clubFallbackLocal;
      if (shouldRunLocalMonitoring && typeof this.repository?.upsertClubMonitoringData === "function") {
        monitoringLocal = this.repository.upsertClubMonitoringData({
          clubId,
          members: [],
          activities,
          uploadBuckets,
        });
      }

      let sync = null;
      if (enrichedCampaigns.length > 0) {
        sync = await this.syncHookSnapshot(
          {
            club: {
              id: clubId,
              name: clubName,
            },
            campaigns: enrichedCampaigns,
            sourceLabel: "altered-live-discovery",
            note: `live-discovery:${reason}`,
          },
          {
            onProgress: (partial) => {
              this.updateLiveProgress({
                reason,
                status: "running",
                ...partial,
              });
            },
            relayClubSnapshot: false,
          }
        );
      }

      let mapperNames = null;
      if (enrichedCampaigns.length > 0) {
        mapperNames = await this.syncMapperNamesForCampaigns({
          campaigns: enrichedCampaigns,
          note: `live-discovery:${reason}`,
        });
      }

      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.now() - startedMs);
      const summary = {
        clubId,
        clubName,
        authSource,
        activitiesSeen: activities.length,
        newActivities: newActivityCount,
        latestCampaignsChecked: latestDescriptors.length,
        newCampaignsDetected: newDescriptors.length,
        newCampaignsStored: enrichedCampaigns.length,
        discoveredMapUids: allMapUids.length,
        mapDetailsLoaded: mapDetailsByUid.size,
        uploadBucketsSeen: uploadBuckets.length,
        uploadMapsSeen: uploadMapsLoaded,
        uploadBucketDetailsLoaded,
        monitoringStored:
          (monitoringLocal && !monitoringLocal.error) ||
          (monitoringRelay && !monitoringRelay.error),
      };

      this.liveMonitor.lastDiscoverySummary = summary;
      this.liveMonitor.lastDiscoveryFinishedAt = finishedAt;
      this.liveMonitor.lastDiscoveryDurationMs = durationMs;

      this.updateLiveProgress({
        reason,
        status: "ok",
        phase: "discovery-complete",
        percent: 100,
        finishedAt,
        durationMs,
        message: `Discovery completed: ${summary.newCampaignsStored} new campaigns, ${summary.uploadBucketsSeen} upload buckets scanned.`,
        counters: {
          ...summary,
          durationMs,
        },
      });

      return {
        summary,
        monitoring: {
          local: monitoringLocal || null,
          relay: monitoringRelay || null,
        },
        sync,
        mapperNames,
      };
    } catch (error) {
      const message = error?.message || "Live discovery cycle failed.";
      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.now() - startedMs);
      this.liveMonitor.lastDiscoveryError = message;
      this.liveMonitor.lastDiscoveryFinishedAt = finishedAt;
      this.liveMonitor.lastDiscoveryDurationMs = durationMs;
      this.updateLiveProgress({
        reason,
        status: "error",
        phase: "discovery-failed",
        percent: this.liveMonitor.progress?.percent || 0,
        finishedAt,
        durationMs,
        message,
      });
      this.logger.warn(`[altered-live] discovery cycle failed: ${message}`);
      return { error: message };
    } finally {
      this.liveMonitor.discoveryRunning = false;
    }
  }

  startLiveMonitor() {
    this.persistLiveMonitorConfig();
    this.scheduleNextLiveMonitorRun({ fromTimeMs: Date.now() });
    this.scheduleNextDiscoveryRun({ fromTimeMs: Date.now() });
    return true;
  }

  stopLiveMonitor() {
    if (this.liveMonitor.timer) {
      clearTimeout(this.liveMonitor.timer);
      this.liveMonitor.timer = null;
    }
    if (this.liveMonitor.discoveryTimer) {
      clearTimeout(this.liveMonitor.discoveryTimer);
      this.liveMonitor.discoveryTimer = null;
    }
    this.liveMonitor.nextRunAt = null;
    this.liveMonitor.nextDiscoveryRunAt = null;
    this.liveMonitor.running = false;
    this.liveMonitor.discoveryRunning = false;
    this.persistLiveMonitorConfig();
    return true;
  }

  async getTrackerStatus({ timeoutMs = null } = {}) {
    const result = await this.trackerClient.getTrackerStatus({ timeoutMs });
    if (!result.ok) return { error: result.error };
    return result.data;
  }

  async runTrackerNow() {
    const result = await this.trackerClient.runTrackerNow();
    if (!result.ok) return { error: result.error };
    return result.data;
  }
}

export { AlteredService };
