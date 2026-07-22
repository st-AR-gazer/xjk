import { toText } from "../../../../shared/valueUtils.js";
import { ASSET_FALLBACK_SIGNATURE_VERSION, CONTENT_SIGNATURE_VERSION } from "./constants.js";
import { clampNumber } from "./normalization.js";

const ASSET_HINT_PATTERN =
  /(road|tech|platform|checkpoint|check|start|finish|curve|slope|grass|dirt|ice|sign|screen|support|deco|wall|tube|tree|forest|cliff|arch|bridge|decal|gate|pillar|ramp|booster|reactor|turbo|jump|loop|hill|podium|stadium|track|zone|spawn|connector|tunnel|deadend|transition|terrain|shore|river|lake|torch|flag|cross|goal|tube|pipe|open|straight|tilt|hill|terrain|void|cliff|wood|plastic|magnet|bump|floor|ground)/i;
const CAMEL_SPLIT_PATTERN = /(?<=[a-z0-9])(?=[A-Z])/g;
const NON_ALNUM_SPLIT_PATTERN = /[^A-Za-z0-9]+/g;

const TOKEN_STOP_WORDS = new Set([
  "advertisement",
  "any",
  "author",
  "authorscore",
  "bronze",
  "build",
  "comments",
  "core",
  "day",
  "day64",
  "deps",
  "desc",
  "displaycost",
  "distance",
  "england",
  "envir",
  "europe",
  "exebuild",
  "exever",
  "favorite",
  "file",
  "game",
  "gold",
  "hasclones",
  "hasghostblocks",
  "header",
  "ident",
  "jpg",
  "lightmap",
  "map",
  "maptype",
  "mapstyle",
  "mod",
  "models",
  "mood",
  "name",
  "nadeo",
  "nblaps",
  "objects",
  "playable",
  "playermodel",
  "position",
  "public",
  "race",
  "score",
  "silver",
  "skins",
  "storageobjects",
  "submitter",
  "thumbnail",
  "times",
  "title",
  "trackmania",
  "type",
  "uid",
  "update",
  "upload",
  "validated",
  "valley",
  "version",
  "webm",
  "west",
  "world",
  "zip",
  "zone",
]);

function extractPrintableSegments(buffer) {
  const out = [];
  let current = "";
  for (const byte of buffer) {
    if (byte >= 32 && byte <= 126) {
      current += String.fromCharCode(byte);
      continue;
    }
    if (current.length >= 4) out.push(current);
    current = "";
  }
  if (current.length >= 4) out.push(current);
  return out;
}

function splitCompositeToken(token = "") {
  const base = toText(token);
  if (!base) return [];
  return base
    .replace(CAMEL_SPLIT_PATTERN, " ")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .split(NON_ALNUM_SPLIT_PATTERN)
    .map((part) => toText(part))
    .filter(Boolean);
}

function isUsefulAssetToken(token = "", segment = "") {
  const normalized = toText(token);
  if (normalized.length < 3) return false;
  const lower = normalized.toLowerCase();
  if (TOKEN_STOP_WORDS.has(lower)) return false;
  if (/^\d+$/.test(normalized)) return false;
  if (lower.length <= 4 && !/\d/.test(normalized) && !ASSET_HINT_PATTERN.test(normalized)) {
    return false;
  }
  return (
    /\d/.test(normalized) ||
    /[A-Z].*[A-Z]/.test(normalized) ||
    /[\\/]/.test(segment) ||
    ASSET_HINT_PATTERN.test(normalized)
  );
}

function collectAssetTokens(segment = "") {
  const normalizedSegment = toText(segment).slice(0, 512);
  if (!normalizedSegment) return [];
  const rootParts = normalizedSegment
    .split(NON_ALNUM_SPLIT_PATTERN)
    .map((part) => toText(part))
    .filter(Boolean);
  const out = [];
  for (const part of rootParts) {
    if (isUsefulAssetToken(part, normalizedSegment)) {
      out.push(part);
    }
    for (const splitPart of splitCompositeToken(part)) {
      if (isUsefulAssetToken(splitPart, normalizedSegment)) {
        out.push(splitPart);
      }
    }
  }
  return out;
}

function sortTokenEntries(entries = []) {
  return [...entries].sort((left, right) => {
    const countDiff = Number(right?.count || 0) - Number(left?.count || 0);
    if (countDiff !== 0) return countDiff;
    return String(left?.token || "").localeCompare(String(right?.token || ""), undefined, {
      sensitivity: "base",
    });
  });
}

function extractGbxContentSignature(buffer) {
  const segments = extractPrintableSegments(buffer);
  const assetCounts = new Map();
  for (const segment of segments) {
    for (const token of collectAssetTokens(segment)) {
      const normalized = toText(token);
      if (!normalized) continue;
      assetCounts.set(normalized, Number(assetCounts.get(normalized) || 0) + 1);
    }
  }

  const tokens = sortTokenEntries(
    [...assetCounts.entries()].map(([token, count]) => ({
      token,
      count,
    }))
  );

  return {
    version: ASSET_FALLBACK_SIGNATURE_VERSION,
    printableSegments: segments.length,
    assetTokenCount: tokens.reduce((sum, item) => sum + Number(item.count || 0), 0),
    uniqueAssetTokenCount: tokens.length,
    groups: {
      modelTokens: tokens,
      absolutePlacementTokens: [],
      relativePlacementTokens: [],
    },
    tokens,
  };
}

function getSignatureGroup(signature = null, groupKey = "modelTokens") {
  const groups = signature?.groups;
  if (groups && Array.isArray(groups[groupKey])) return groups[groupKey];
  if (groupKey === "modelTokens" && Array.isArray(signature?.tokens)) return signature.tokens;
  return [];
}

function createPreparedSignature(signature = null) {
  return {
    signature,
    tokenMaps: new Map(),
    weightedTotals: new Map(),
  };
}

function isPreparedSignature(value = null) {
  return Boolean(
    value && typeof value === "object" && value.tokenMaps instanceof Map && value.weightedTotals instanceof Map
  );
}

function buildSignatureTokenMap(signature = null, groupKey = "modelTokens") {
  const counts = new Map();
  const tokens = getSignatureGroup(signature, groupKey);
  for (const entry of tokens) {
    const token = toText(entry?.token);
    if (!token) continue;
    const count = clampNumber(entry?.count, { min: 0, max: 100000, fallback: 0 });
    if (count <= 0) continue;
    counts.set(token, count);
  }
  return counts;
}

function getPreparedSignatureTokenMap(preparedSignature = null, groupKey = "modelTokens") {
  if (!isPreparedSignature(preparedSignature)) return new Map();
  if (preparedSignature.tokenMaps.has(groupKey)) {
    return preparedSignature.tokenMaps.get(groupKey);
  }
  const counts = buildSignatureTokenMap(preparedSignature.signature, groupKey);
  preparedSignature.tokenMaps.set(groupKey, counts);
  return counts;
}

function signatureTokensToMap(signature = null, groupKey = "modelTokens") {
  if (isPreparedSignature(signature)) {
    return getPreparedSignatureTokenMap(signature, groupKey);
  }
  return buildSignatureTokenMap(signature, groupKey);
}

function getPreparedSignatureWeightedTotal(
  preparedSignature = null,
  docFrequency = new Map(),
  groupKey = "modelTokens"
) {
  if (!isPreparedSignature(preparedSignature)) return 0;
  let groupCache = preparedSignature.weightedTotals.get(groupKey);
  if (!groupCache) {
    groupCache = new WeakMap();
    preparedSignature.weightedTotals.set(groupKey, groupCache);
  }
  if (groupCache.has(docFrequency)) {
    return Number(groupCache.get(docFrequency) || 0);
  }

  let total = 0;
  for (const [token, count] of getPreparedSignatureTokenMap(preparedSignature, groupKey)) {
    const df = Math.max(1, Number(docFrequency.get(token) || 1));
    total += count * (1 / Math.sqrt(df));
  }
  groupCache.set(docFrequency, total);
  return total;
}

function getSignatureWeightedTotal(signature = null, docFrequency = new Map(), groupKey = "modelTokens") {
  if (isPreparedSignature(signature)) {
    return getPreparedSignatureWeightedTotal(signature, docFrequency, groupKey);
  }
  let total = 0;
  for (const [token, count] of buildSignatureTokenMap(signature, groupKey)) {
    const df = Math.max(1, Number(docFrequency.get(token) || 1));
    total += count * (1 / Math.sqrt(df));
  }
  return total;
}

function buildDocumentFrequencyMap(entries = [], groupKey = "modelTokens") {
  const docFrequency = new Map();
  for (const entry of entries) {
    const counts = entry?.preparedSignature
      ? getPreparedSignatureTokenMap(entry.preparedSignature, groupKey)
      : signatureTokensToMap(entry?.signature, groupKey);
    for (const token of counts.keys()) {
      docFrequency.set(token, Number(docFrequency.get(token) || 0) + 1);
    }
  }
  return docFrequency;
}

function isStructuredLayoutSignature(signature = null) {
  const groups = signature?.groups;
  const absoluteEntries = Array.isArray(groups?.absolutePlacementTokens) ? groups.absolutePlacementTokens : [];
  const relativeEntries = Array.isArray(groups?.relativePlacementTokens) ? groups.relativePlacementTokens : [];
  return (
    toText(signature?.version) === CONTENT_SIGNATURE_VERSION &&
    (absoluteEntries.length > 0 || relativeEntries.length > 0)
  );
}

function hasSignatureGroupEntries(signature = null, groupKey = "modelTokens") {
  return getSignatureGroup(signature, groupKey).length > 0;
}

function computeWeightedJaccard(leftSignature, rightSignature, docFrequency = new Map(), groupKey = "modelTokens") {
  const left = signatureTokensToMap(leftSignature, groupKey);
  const right = signatureTokensToMap(rightSignature, groupKey);
  if (!left.size && !right.size) return 0;

  let minSum = 0;
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  for (const [token, count] of smaller.entries()) {
    const otherCount = Number(larger.get(token) || 0);
    if (otherCount <= 0) continue;
    const currentCount = Number(count || 0);
    const df = Math.max(1, Number(docFrequency.get(token) || 1));
    const weight = 1 / Math.sqrt(df);
    minSum += Math.min(currentCount, otherCount) * weight;
  }
  const maxSum =
    getSignatureWeightedTotal(leftSignature, docFrequency, groupKey) +
    getSignatureWeightedTotal(rightSignature, docFrequency, groupKey) -
    minSum;
  if (maxSum <= 0) return 0;
  return minSum / maxSum;
}

function buildContentSimilarityReferenceContext(referenceEntries = []) {
  const entries = (Array.isArray(referenceEntries) ? referenceEntries : [])
    .filter((entry) => toText(entry?.mapUid) && Number(entry?.slot || 0) > 0 && entry?.signature)
    .map((entry) => ({
      ...entry,
      preparedSignature: createPreparedSignature(entry?.signature),
      isStructuredSignature: isStructuredLayoutSignature(entry?.signature),
      hasWeightedAbsolutePlacementTokens: hasSignatureGroupEntries(entry?.signature, "weightedAbsolutePlacementTokens"),
      hasWeightedRelativePlacementTokens: hasSignatureGroupEntries(entry?.signature, "weightedRelativePlacementTokens"),
    }));
  const structuredEntries = entries.filter((entry) => entry.isStructuredSignature);
  const context = {
    entries,
    structuredEntries,
    groupDocFrequency: {
      modelTokens: buildDocumentFrequencyMap(entries, "modelTokens"),
      absolutePlacementTokens: buildDocumentFrequencyMap(entries, "absolutePlacementTokens"),
      relativePlacementTokens: buildDocumentFrequencyMap(entries, "relativePlacementTokens"),
      weightedAbsolutePlacementTokens: buildDocumentFrequencyMap(entries, "weightedAbsolutePlacementTokens"),
      weightedRelativePlacementTokens: buildDocumentFrequencyMap(entries, "weightedRelativePlacementTokens"),
    },
    structuredGroupDocFrequency: {
      modelTokens: buildDocumentFrequencyMap(structuredEntries, "modelTokens"),
      absolutePlacementTokens: buildDocumentFrequencyMap(structuredEntries, "absolutePlacementTokens"),
      relativePlacementTokens: buildDocumentFrequencyMap(structuredEntries, "relativePlacementTokens"),
      weightedAbsolutePlacementTokens: buildDocumentFrequencyMap(structuredEntries, "weightedAbsolutePlacementTokens"),
      weightedRelativePlacementTokens: buildDocumentFrequencyMap(structuredEntries, "weightedRelativePlacementTokens"),
    },
    campaignCount: new Set(
      entries.map((entry) => {
        const campaignId = Number(entry?.campaignId || 0);
        if (campaignId > 0) return `id:${campaignId}`;
        return `name:${toText(entry?.campaignName).toLowerCase()}`;
      })
    ).size,
    structuredCampaignCount: new Set(
      structuredEntries.map((entry) => {
        const campaignId = Number(entry?.campaignId || 0);
        if (campaignId > 0) return `id:${campaignId}`;
        return `name:${toText(entry?.campaignName).toLowerCase()}`;
      })
    ).size,
  };
  for (const entry of entries) {
    if (entry?.preparedSignature && isPreparedSignature(entry.preparedSignature)) {
      entry.preparedSignature.signature = null;
    }
    entry.signature = null;
  }
  return context;
}

function getStructuredEntries(referenceSource, entries) {
  return Array.isArray(referenceSource?.structuredEntries)
    ? referenceSource.structuredEntries
    : entries.filter((entry) => entry?.isStructuredSignature || isStructuredLayoutSignature(entry?.signature));
}

function buildStructuredDocumentFrequencies(referenceSource, entries) {
  const structuredEntries = getStructuredEntries(referenceSource, entries);
  return {
    modelTokens: buildDocumentFrequencyMap(structuredEntries, "modelTokens"),
    absolutePlacementTokens: buildDocumentFrequencyMap(structuredEntries, "absolutePlacementTokens"),
    relativePlacementTokens: buildDocumentFrequencyMap(structuredEntries, "relativePlacementTokens"),
    weightedAbsolutePlacementTokens: buildDocumentFrequencyMap(structuredEntries, "weightedAbsolutePlacementTokens"),
    weightedRelativePlacementTokens: buildDocumentFrequencyMap(structuredEntries, "weightedRelativePlacementTokens"),
  };
}

function normalizeReferenceContext(referenceSource = []) {
  if (Array.isArray(referenceSource)) {
    return buildContentSimilarityReferenceContext(referenceSource);
  }
  const entries = Array.isArray(referenceSource?.entries) ? referenceSource.entries : [];
  const groupDocFrequency = referenceSource?.groupDocFrequency;
  if (
    groupDocFrequency?.modelTokens instanceof Map &&
    groupDocFrequency?.absolutePlacementTokens instanceof Map &&
    groupDocFrequency?.relativePlacementTokens instanceof Map
  ) {
    const structuredGroupDocFrequency = referenceSource?.structuredGroupDocFrequency;
    return {
      entries,
      structuredEntries: getStructuredEntries(referenceSource, entries),
      groupDocFrequency,
      structuredGroupDocFrequency:
        structuredGroupDocFrequency?.modelTokens instanceof Map &&
        structuredGroupDocFrequency?.absolutePlacementTokens instanceof Map &&
        structuredGroupDocFrequency?.relativePlacementTokens instanceof Map
          ? structuredGroupDocFrequency
          : buildStructuredDocumentFrequencies(referenceSource, entries),
      campaignCount: clampNumber(referenceSource?.campaignCount, {
        min: 0,
        max: 100000,
        fallback: 0,
      }),
      structuredCampaignCount: clampNumber(referenceSource?.structuredCampaignCount, {
        min: 0,
        max: 100000,
        fallback: 0,
      }),
    };
  }
  return buildContentSimilarityReferenceContext(entries);
}

export {
  buildContentSimilarityReferenceContext,
  computeWeightedJaccard,
  createPreparedSignature,
  extractGbxContentSignature,
  hasSignatureGroupEntries,
  isStructuredLayoutSignature,
  normalizeReferenceContext,
};
