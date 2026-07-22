import { hasResolvedDisplayName, sanitizeResolvedDisplayName } from "../../../../shared/displayNameResolution.js";
import { parseJsonSafe, toText } from "../../../../shared/valueUtils.js";
import { slugifyText } from "../../domain/inputNormalization.js";
import { buildSimilarityWeightProfile } from "../../services/mapContentSimilarity.js";
import { deriveParserWarning } from "../../services/mapNameStandardizer.js";

const OVERSIZED_SIGNATURE_JSON_MAX_BYTES = 1_000_000;
const OVERSIZED_SIGNATURE_FALLBACK_VERSION = "oversized-signature-fallback-v1";

function pickFirstTextFromObjects(objects = [], keys = []) {
  for (const object of objects) {
    if (!object || typeof object !== "object") continue;
    for (const key of keys) {
      const value = toText(object[key]);
      if (value) return value;
    }
  }
  return "";
}

function resolveSavedMapperDisplayName(payload = null, role = "author", accountId = "") {
  const data = payload && typeof payload === "object" ? payload : {};
  const sources = [data?.mapDetail, data?.map_detail, data?.campaignMap, data?.campaign_map, data?.map, data].filter(
    (value) => value && typeof value === "object"
  );
  const rolePrefix = role === "submitter" ? "submitter" : "author";
  const upperPrefix = role === "submitter" ? "Submitter" : "Author";
  const rawName = pickFirstTextFromObjects(sources, [
    `${rolePrefix}SavedDisplayName`,
    `${rolePrefix}_saved_display_name`,
    `${rolePrefix}SavedName`,
    `${rolePrefix}_saved_name`,
    `${rolePrefix}Nickname`,
    `${rolePrefix}NickName`,
    `${rolePrefix}_nickname`,
    `${rolePrefix}Name`,
    `${rolePrefix}_name`,
    `${upperPrefix}Nickname`,
    `${upperPrefix}NickName`,
    `${upperPrefix}Name`,
    role === "author" ? "nickname" : "",
    role === "author" ? "NickName" : "",
  ]);
  return sanitizeResolvedDisplayName(rawName, { accountId });
}

function buildOversizedSignatureFallback({
  assetTokenCount = 0,
  printableTokenCount = 0,
  signatureJsonLength = 0,
} = {}) {
  return {
    version: OVERSIZED_SIGNATURE_FALLBACK_VERSION,
    printableSegments: Number(printableTokenCount || 0),
    assetTokenCount: Number(assetTokenCount || 0),
    uniqueAssetTokenCount: 0,
    oversized: true,
    originalBytes: Number(signatureJsonLength || 0),
    groups: { modelTokens: [], absolutePlacementTokens: [], relativePlacementTokens: [] },
    tokens: [],
  };
}

function rowToMap(row) {
  return {
    uid: row.uid,
    mapId: row.mapId || null,
    name: row.name,
    mapType: row.mapType || null,
    mapStyle: row.mapStyle || null,
    mapEnvironment: row.mapEnvironment || null,
    campaign: row.campaign || "Unassigned",
    campaignId: row.campaignId || null,
    campaignExternalId: row.campaignExternalId || null,
    campaignMapCount: Number(row.campaignMapCount || 0) || null,
    slot: Number(row.slot || 0),
    author: row.author || "",
    authorDisplayName: row.authorDisplayName || null,
    submitter: row.submitter || "",
    submitterDisplayName: row.submitterDisplayName || null,
    authorMs: Number(row.authorMs || 0),
    wrMs: Number(row.wrMs || 0),
    wrHolder: row.wrHolder || "-",
    wrUpdatedAt: row.wrUpdatedAt || null,
    playerCount: Number(row.playerCount || 0),
    playerCountUpdatedAt: row.playerCountUpdatedAt || null,
    goldMs: Number(row.goldMs || 0),
    silverMs: Number(row.silverMs || 0),
    bronzeMs: Number(row.bronzeMs || 0),
    laps: Number(row.laps || row.nbLaps || 1),
    tracked: Boolean(row.tracked),
    status: row.status || "live",
    checkFrequency: Number(row.checkFrequency || 0),
    lastCheckedAt: row.lastCheckedAt || null,
    mapCreatedAt: row.mapCreatedAt || null,
    mapUpdatedAt: row.mapUpdatedAt || null,
    thumbnailUrl: row.thumbnailUrl || null,
    downloadUrl: row.downloadUrl || null,
  };
}

function rowToNameCandidate(row) {
  const mapNumber = Number(row.mapNumber || 0) || null;
  const mapNumbers = parseJsonSafe(row.mapNumbersJson, []) || [];
  const similarityDetails = parseJsonSafe(row.similarityDetailsJson, null);
  const similarityCandidateMatches = (parseJsonSafe(row.similarityCandidateMatchesJson, []) || [])
    .filter((entry) => entry && typeof entry === "object")
    .slice(0, 5);
  const parserPattern = row.parserPattern || null;
  return {
    mapUid: row.mapUid,
    originalName: row.originalName || "",
    sanitizedName: row.sanitizedName || "",
    proposedName: row.proposedName || null,
    manualName: row.manualName || null,
    finalName: row.finalName || row.proposedName || row.sanitizedName || row.originalName || "",
    parserPattern,
    parserConfidence: Number(row.parserConfidence || 0),
    season: row.season || null,
    year: Number(row.year || 0) || null,
    mapNumber,
    mapNumbers: mapNumbers.length ? mapNumbers : mapNumber ? [mapNumber] : [],
    alteration: row.alterationLabel || null,
    alterationMix: parseJsonSafe(row.alterationMixJson, []) || [],
    automationState: row.automationState || "unmatched",
    reviewState: row.reviewState || "pending",
    requiresRegex: Boolean(row.requiresRegex),
    parserWarning: deriveParserWarning({
      mapName: row.originalName || row.sanitizedName || "",
      campaignName: row.campaign || "",
      parserPattern,
    }),
    reviewNote: row.reviewNote || null,
    sourceVersion: row.sourceVersion || null,
    campaign: row.campaign || "Unassigned",
    campaignId: Number(row.campaignId || 0) || null,
    slot: Number(row.slot || 0) || 0,
    tracked: Boolean(row.tracked),
    status: row.status || "live",
    localFileStatus: row.localFileStatus || null,
    localFilePath: row.localFilePath || null,
    signatureStatus: row.signatureStatus || null,
    signatureError: row.signatureError || null,
    similarityStatus: row.similarityStatus || null,
    similarityTopScore: Number(row.similarityTopScore || 0) || null,
    similarityConfidence: Number(row.similarityConfidence || 0) || null,
    similarityReferenceCampaignName: row.similarityReferenceCampaignName || null,
    similarityReferenceSlot: Number(row.similarityReferenceSlot || 0) || null,
    similarityCandidateMatches,
    similarityMatchClassification: similarityDetails?.matchClassification || null,
    similarityMatchWarning: similarityDetails?.matchWarning || null,
    similarityCloseSlotCount: Number(similarityDetails?.closeSlotCount || 0) || 0,
    similarityDetails,
    updatedAt: row.updatedAt || null,
    lastProcessedAt: row.lastProcessedAt || null,
  };
}

function rowToMapLocalFileFix(row) {
  return {
    mapUid: row.mapUid,
    relativePath: row.relativePath || null,
    sourceFilePath: row.sourceFilePath || null,
    fileSha256: row.fileSha256 || null,
    fileSizeBytes: Number(row.fileSizeBytes || 0),
    importedAt: row.importedAt || null,
    verifiedAt: row.verifiedAt || null,
    status: row.status || "missing",
    note: row.note || null,
    lastError: row.lastError || null,
    updatedAt: row.updatedAt || null,
  };
}

function rowToSimilarityWeightOverride(row = {}) {
  return {
    mapUid: toText(row.mapUid) || null,
    campaignId: Number(row.campaignId || 0) || null,
    weights: buildSimilarityWeightProfile(parseJsonSafe(row.weightsJson, null)),
    updatedAt: row.updatedAt || null,
  };
}

function rowToSimilarityWeightRule(row = {}) {
  return {
    ruleId: Number(row.ruleId || 0) || null,
    sourceKey: toText(row.sourceKey).toLowerCase() || null,
    season: toText(row.season) || null,
    seasonYear: Number(row.seasonYear || 0) || null,
    environment: toText(row.environment) || null,
    alterationSlug: slugifyText(row.alterationSlug || "", "") || null,
    weights: buildSimilarityWeightProfile(parseJsonSafe(row.weightsJson, null)),
    enabled: Boolean(Number(row.enabled || 0)),
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

export {
  OVERSIZED_SIGNATURE_FALLBACK_VERSION,
  OVERSIZED_SIGNATURE_JSON_MAX_BYTES,
  buildOversizedSignatureFallback,
  hasResolvedDisplayName,
  pickFirstTextFromObjects,
  resolveSavedMapperDisplayName,
  rowToMap,
  rowToMapLocalFileFix,
  rowToNameCandidate,
  rowToSimilarityWeightOverride,
  rowToSimilarityWeightRule,
  sanitizeResolvedDisplayName,
};
