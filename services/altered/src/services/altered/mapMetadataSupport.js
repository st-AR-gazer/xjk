import path from "node:path";

import {
  deriveMapNumbers,
  parseCampaignStandardizedFields,
  parseStandardizedFields,
  sanitizeMapName,
} from "../mapNameStandardizer.js";
import { buildCampaignFamily } from "../mapContentSimilarity.js";
import {
  COMPETITION_CAMPAIGN_TYPE,
  DISCOVERY_CAMPAIGN_TYPE,
  GLOBAL_REFERENCE_FALLBACK_MAX_CAMPAIGNS,
  GLOBAL_REFERENCE_FALLBACK_MAX_MAPS,
  LEGACY_CAMPAIGN_TYPE,
  OFFICIAL_SEASONAL_CAMPAIGN_TYPE,
} from "./serviceConstants.js";
import { clampInt } from "./runtimeSupport.js";
import {
  normalizeMaybeBoolean,
  normalizeUniqueStrings,
  pickFirstNestedValue,
  pickFirstPresent,
  stripMapFileExtension,
  toFlexibleIso,
  toText,
} from "./valueSupport.js";

function deriveMapMetadata(map = {}) {
  const mapPayload = map.payload && typeof map.payload === "object" ? map.payload : null;
  const campaignPayload = map.campaignPayload && typeof map.campaignPayload === "object" ? map.campaignPayload : null;
  const payloadSources = [mapPayload?.mapDetail, mapPayload?.campaignMap, mapPayload, campaignPayload].filter(
    (value) => value && typeof value === "object"
  );
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
    map.derivedNameCandidate && typeof map.derivedNameCandidate === "object" ? map.derivedNameCandidate : null;

  const season =
    parsedCampaign.season || derivedCandidate?.season || parsedFilename.season || parsedMapName.season || null;
  const year = parsedCampaign.year || derivedCandidate?.year || parsedFilename.year || parsedMapName.year || null;
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
  const computedMapNumbers = normalizeUniqueStrings([...storedMapNumbers, ...computedMapNumbersResult.mapNumbers])
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
      pickFirstNestedValue(payloadSources, ["fileUrl", "downloadUrl", "url", "map.fileUrl", "map.downloadUrl"]),
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
    collectionName:
      toText(
        pickFirstPresent([
          pickFirstNestedValue(payloadSources, ["collectionName", "collection", "environment"]),
          map.mapEnvironment,
        ]) || ""
      ) || null,
    createdWithGamepadEditor: normalizeMaybeBoolean(
      pickFirstPresent([
        pickFirstNestedValue(payloadSources, ["createdWithGamepadEditor", "created_with_gamepad_editor"]),
      ])
    ),
    createdWithSimpleEditor: normalizeMaybeBoolean(
      pickFirstPresent([
        pickFirstNestedValue(payloadSources, ["createdWithSimpleEditor", "created_with_simple_editor"]),
      ])
    ),
    isPlayable: normalizeMaybeBoolean(
      pickFirstPresent([pickFirstNestedValue(payloadSources, ["isPlayable", "is_playable"])])
    ),
    timestamp,
    type: pickFirstPresent([pickFirstNestedValue(payloadSources, ["type", "map.type"])]),
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
  return (
    Number(next?.campaign_db_id || next?.campaignDbId || 0) >
    Number(current?.campaign_db_id || current?.campaignDbId || 0)
  );
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
    if (selected.length > 0 && selectedMapCount + campaignMapCount > GLOBAL_REFERENCE_FALLBACK_MAX_MAPS) {
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
  const safeName = baseName
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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

export {
  deriveMapMetadata,
  resolveMapDownloadUrl,
  resolveMapUid,
  resolveMapSlot,
  resolveMapCampaignName,
  isBetterReferenceCampaign,
  isNormalNadeoReferenceCampaign,
  isCompetitionFamily,
  limitReferenceCampaignFallback,
  countSignatureTokens,
  toPosixPath,
  buildLocalMapRelativePath,
  sanitizeLocalFixFileName,
  buildLocalMapFixRelativePath,
  runWithConcurrency,
};
