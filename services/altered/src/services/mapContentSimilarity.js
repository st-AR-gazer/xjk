import { parseCampaignStandardizedFields } from "./mapNameStandardizer.js";

const CONTENT_SIGNATURE_VERSION = "gbx-layout-v2";
const ASSET_FALLBACK_SIGNATURE_VERSION = "asset-token-jaccard-v1-fallback";
const CONTENT_SIMILARITY_PATTERN = `content-similarity:${CONTENT_SIGNATURE_VERSION}`;
const SINGLE_MATCH_APPROVAL_SCORE = 0.9;
const SINGLE_MATCH_APPROVAL_GAP = 0.15;
const MULTI_MATCH_APPROVAL_SCORE = 0.95;
const MULTI_MATCH_TIE_WINDOW = 0.92;
const MIN_SIMILARITY_SCORE = 0.12;
const CLOSE_MATCH_SCORE_DELTA = 0.03;
const CLOSE_MATCH_RATIO = 0.97;
const LARGE_SCORE_GAP_AUTO_APPROVAL = 0.35;
const MAX_CANDIDATE_MATCHES = 25;
const WEAK_BEST_SCORE = 0.55;
const NAME_SUPPORT_WEIGHT = 0.06;
const FINAL_ABSOLUTE_WEIGHT = 0.44;
const FINAL_RELATIVE_WEIGHT = 0.26;
const FINAL_WEIGHTED_PLACEMENT_WEIGHT = 0.22;
const FINAL_MODEL_WEIGHT = 0.08;
const WEIGHTED_PLACEMENT_ABSOLUTE_WEIGHT = 0.68;
const WEIGHTED_PLACEMENT_RELATIVE_WEIGHT = 0.32;
const WEIGHTED_RELATIONAL_FALLBACK_THRESHOLD = 0.01;
const RELATIONAL_FALLBACK_RELATIVE_WEIGHT = 0.82;
const RELATIONAL_FALLBACK_MODEL_WEIGHT = 0.14;
const RELATIONAL_FALLBACK_ABSOLUTE_WEIGHT = 0.04;
const COMPONENT_SIGNIFICANCE_FLOOR = 0.001;
const INSIGNIFICANT_WEIGHT_FACTOR = 0.05;

const ASSET_HINT_PATTERN =
  /(road|tech|platform|checkpoint|check|start|finish|curve|slope|grass|dirt|ice|sign|screen|support|deco|wall|tube|tree|forest|cliff|arch|bridge|decal|gate|pillar|ramp|booster|reactor|turbo|jump|loop|hill|podium|stadium|track|zone|spawn|connector|tunnel|deadend|transition|terrain|shore|river|lake|torch|flag|cross|goal|tube|pipe|open|straight|tilt|hill|terrain|void|cliff|wood|plastic|magnet|bump|floor|ground)/i;
const CAMEL_SPLIT_PATTERN = /(?<=[a-z0-9])(?=[A-Z])/g;
const NON_ALNUM_SPLIT_PATTERN = /[^A-Za-z0-9]+/g;
const MAP_FORMATTING_CODE_PATTERN =
  /\$([0-9a-fA-F]{1,3}|[gimnostuwzGIMNOSTUWZ<>]|[hlpHLP](\[[^\]]+\])?)/g;

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

function toText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function slugifyText(value, fallback = "") {
  const normalized = toText(value)
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || toText(fallback) || "item";
}

function clampNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeMapNumbers(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 999)
    .map((value) => Math.floor(value)))]
    .sort((a, b) => a - b);
}

function normalizeSelectedCandidateMapUids(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [values])
      .map((value) => toText(value))
      .filter(Boolean)
      .map((value) => value.toLowerCase())
  )];
}

function normalizeCandidateAutomation(candidate = {}) {
  const mapNumbers = normalizeMapNumbers(candidate?.mapNumbers);
  return mapNumbers.length > 0 && (toText(candidate?.season) || Number(candidate?.year || 0))
    ? "matched"
    : "unmatched";
}

function buildCampaignFamily(campaignName = "") {
  const parsed = parseCampaignStandardizedFields(campaignName);
  const environment = toText(parsed?.environment);
  const type = toText(parsed?.type);
  if (toText(parsed?.special)) {
    const specialSlug = slugifyText(parsed.special, "special");
    const year = Number(parsed?.year || 0) || 0;
    const yearPart = year ? `:${year}` : "";
    const monthPart =
      Number(parsed?.month || 0) > 0 ? `:month:${String(Number(parsed.month)).padStart(2, "0")}` : "";
    const typePart = type ? `:type:${slugifyText(type, "type")}` : "";
    const environmentPart = environment ? `:env:${slugifyText(environment, "env")}` : "";
    return {
      key: `special:${specialSlug}${yearPart}${monthPart}${typePart}${environmentPart}`,
      parsed,
      label: [parsed.special, type ? `(${type})` : null, environment ? `[${environment}]` : null]
        .filter(Boolean)
        .join(" "),
      isReferenceLike: !toText(parsed?.alteration) && !(Array.isArray(parsed?.alterationMix) && parsed.alterationMix.length),
    };
  }

  if (toText(parsed?.season)) {
    const year = Number(parsed?.year || 0) || 0;
    const seasonSlug = slugifyText(parsed.season, "season");
    const yearPart = year ? `:${year}` : "";
    const typePart = type ? `:type:${slugifyText(type, "type")}` : "";
    const environmentPart = environment ? `:env:${slugifyText(environment, "env")}` : "";
    return {
      key: `season:${seasonSlug}${yearPart}${typePart}${environmentPart}`,
      parsed,
      label: [parsed.season, year || null, type || null, environment ? `[${environment}]` : null]
        .filter(Boolean)
        .join(" "),
      isReferenceLike: !toText(parsed?.alteration) && !(Array.isArray(parsed?.alterationMix) && parsed.alterationMix.length),
    };
  }

  return {
    key: "",
    parsed,
    label: "",
    isReferenceLike: false,
  };
}

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
  const split = base
    .replace(CAMEL_SPLIT_PATTERN, " ")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .split(NON_ALNUM_SPLIT_PATTERN)
    .map((part) => toText(part))
    .filter(Boolean);
  return split;
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

function normalizeNameForSimilarity(value = "") {
  return toText(value)
    .replace(MAP_FORMATTING_CODE_PATTERN, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(1up|1-up|1down|1-down|sttf|wood|plastic|ice|icy|magnet|underwater|reverse|flooded|grassy|bumper|puzzle|earthquake|walmartmini|staircase|short|tilted|glider|freewheel|fragile|reactor|cpless|cpfull|platform|training)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildBigrams(value = "") {
  const normalized = toText(value);
  if (normalized.length < 2) return new Set(normalized ? [normalized] : []);
  const out = new Set();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    out.add(normalized.slice(index, index + 2));
  }
  return out;
}

function computeNameSimilarity(leftName = "", rightName = "") {
  const left = normalizeNameForSimilarity(leftName);
  const right = normalizeNameForSimilarity(rightName);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.max(0.9, Math.min(left.length, right.length) / Math.max(left.length, right.length));
  }

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  const tokenUnion = new Set([...leftTokens, ...rightTokens]);
  let tokenIntersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) tokenIntersection += 1;
  }
  const tokenJaccard = tokenUnion.size ? tokenIntersection / tokenUnion.size : 0;

  const leftBigrams = buildBigrams(left);
  const rightBigrams = buildBigrams(right);
  let bigramIntersection = 0;
  for (const bigram of leftBigrams) {
    if (rightBigrams.has(bigram)) bigramIntersection += 1;
  }
  const bigramDice =
    leftBigrams.size + rightBigrams.size > 0
      ? (2 * bigramIntersection) / (leftBigrams.size + rightBigrams.size)
      : 0;

  return Math.max(tokenJaccard, bigramDice);
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
    value &&
      typeof value === "object" &&
      value.tokenMaps instanceof Map &&
      value.weightedTotals instanceof Map
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
  const absoluteEntries = Array.isArray(groups?.absolutePlacementTokens)
    ? groups.absolutePlacementTokens
    : [];
  const relativeEntries = Array.isArray(groups?.relativePlacementTokens)
    ? groups.relativePlacementTokens
    : [];
  return (
    toText(signature?.version) === CONTENT_SIGNATURE_VERSION &&
    (absoluteEntries.length > 0 || relativeEntries.length > 0)
  );
}

function hasSignatureGroupEntries(signature = null, groupKey = "modelTokens") {
  return getSignatureGroup(signature, groupKey).length > 0;
}

function computeWeightedJaccard(
  leftSignature,
  rightSignature,
  docFrequency = new Map(),
  groupKey = "modelTokens"
) {
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
      hasWeightedAbsolutePlacementTokens: hasSignatureGroupEntries(
        entry?.signature,
        "weightedAbsolutePlacementTokens"
      ),
      hasWeightedRelativePlacementTokens: hasSignatureGroupEntries(
        entry?.signature,
        "weightedRelativePlacementTokens"
      ),
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
      weightedAbsolutePlacementTokens: buildDocumentFrequencyMap(
        structuredEntries,
        "weightedAbsolutePlacementTokens"
      ),
      weightedRelativePlacementTokens: buildDocumentFrequencyMap(
        structuredEntries,
        "weightedRelativePlacementTokens"
      ),
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
      structuredEntries: Array.isArray(referenceSource?.structuredEntries)
        ? referenceSource.structuredEntries
        : entries.filter((entry) => entry?.isStructuredSignature || isStructuredLayoutSignature(entry?.signature)),
      groupDocFrequency,
      structuredGroupDocFrequency:
        structuredGroupDocFrequency?.modelTokens instanceof Map &&
        structuredGroupDocFrequency?.absolutePlacementTokens instanceof Map &&
        structuredGroupDocFrequency?.relativePlacementTokens instanceof Map
          ? structuredGroupDocFrequency
          : {
              modelTokens: buildDocumentFrequencyMap(
                Array.isArray(referenceSource?.structuredEntries)
                  ? referenceSource.structuredEntries
                  : entries.filter(
                      (entry) => entry?.isStructuredSignature || isStructuredLayoutSignature(entry?.signature)
                    ),
                "modelTokens"
              ),
              absolutePlacementTokens: buildDocumentFrequencyMap(
                Array.isArray(referenceSource?.structuredEntries)
                  ? referenceSource.structuredEntries
                  : entries.filter(
                      (entry) => entry?.isStructuredSignature || isStructuredLayoutSignature(entry?.signature)
                    ),
                "absolutePlacementTokens"
              ),
              relativePlacementTokens: buildDocumentFrequencyMap(
                Array.isArray(referenceSource?.structuredEntries)
                  ? referenceSource.structuredEntries
                  : entries.filter(
                      (entry) => entry?.isStructuredSignature || isStructuredLayoutSignature(entry?.signature)
                    ),
                "relativePlacementTokens"
              ),
              weightedAbsolutePlacementTokens: buildDocumentFrequencyMap(
                Array.isArray(referenceSource?.structuredEntries)
                  ? referenceSource.structuredEntries
                  : entries.filter(
                      (entry) => entry?.isStructuredSignature || isStructuredLayoutSignature(entry?.signature)
                    ),
                "weightedAbsolutePlacementTokens"
              ),
              weightedRelativePlacementTokens: buildDocumentFrequencyMap(
                Array.isArray(referenceSource?.structuredEntries)
                  ? referenceSource.structuredEntries
                  : entries.filter(
                      (entry) => entry?.isStructuredSignature || isStructuredLayoutSignature(entry?.signature)
                    ),
                "weightedRelativePlacementTokens"
              ),
            },
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

function buildSimilarityDisposition(matches = [], { topScore = 0, secondScore = 0 } = {}) {
  const rankedMatches = Array.isArray(matches) ? matches : [];
  if (!rankedMatches.length || topScore < MIN_SIMILARITY_SCORE) {
    return {
      classification: "no-match",
      warning: "No normal reference map cleared the minimum similarity threshold.",
      assignedMapNumbers: [],
      closeMatchCount: 0,
      closeSlotCount: 0,
      closeSlots: [],
      closeMatchThreshold: rankedMatches.length ? MIN_SIMILARITY_SCORE : 0,
      hasAmbiguousCloseSlots: false,
      hasUniqueClosestSlot: false,
    };
  }

  const closeMatchThreshold = Math.max(
    MIN_SIMILARITY_SCORE,
    topScore * CLOSE_MATCH_RATIO,
    topScore - CLOSE_MATCH_SCORE_DELTA
  );
  const closeMatches = rankedMatches.filter((entry) => Number(entry?.score || 0) >= closeMatchThreshold);
  const closeSlots = normalizeMapNumbers(closeMatches.map((entry) => entry?.slot));
  const primarySlot = Number(rankedMatches[0]?.slot || 0) || null;
  const hasAmbiguousCloseSlots = closeSlots.length > 1;
  const hasUniqueClosestSlot = closeSlots.length === 1;

  if (hasAmbiguousCloseSlots) {
    return {
      classification: "ambiguous-close-slots",
      warning: `${closeSlots.length} close slot candidates fall within the near-tie window.`,
      assignedMapNumbers: closeSlots,
      closeMatchCount: closeMatches.length,
      closeSlotCount: closeSlots.length,
      closeSlots,
      closeMatchThreshold,
      hasAmbiguousCloseSlots,
      hasUniqueClosestSlot: false,
    };
  }

  if (topScore >= SINGLE_MATCH_APPROVAL_SCORE && topScore - secondScore >= SINGLE_MATCH_APPROVAL_GAP) {
    return {
      classification: "unique-strong",
      warning: primarySlot ? `Slot ${primarySlot} is the unique closest match.` : "Unique closest match.",
      assignedMapNumbers: primarySlot ? [primarySlot] : [],
      closeMatchCount: closeMatches.length,
      closeSlotCount: closeSlots.length,
      closeSlots,
      closeMatchThreshold,
      hasAmbiguousCloseSlots,
      hasUniqueClosestSlot,
    };
  }

  if (closeMatches.length > 1) {
    return {
      classification: "unique-slot-supported",
      warning: primarySlot
        ? `Multiple close references converge on slot ${primarySlot}.`
        : "Multiple close references converge on the same slot.",
      assignedMapNumbers: primarySlot ? [primarySlot] : [],
      closeMatchCount: closeMatches.length,
      closeSlotCount: closeSlots.length,
      closeSlots,
      closeMatchThreshold,
      hasAmbiguousCloseSlots,
      hasUniqueClosestSlot,
    };
  }

  if (topScore >= WEAK_BEST_SCORE) {
    return {
      classification: "unique-weak",
      warning: primarySlot
        ? `Slot ${primarySlot} is the best match, but the score is below auto-approve strength.`
        : "Best match found, but below auto-approve strength.",
      assignedMapNumbers: primarySlot ? [primarySlot] : [],
      closeMatchCount: closeMatches.length,
      closeSlotCount: closeSlots.length,
      closeSlots,
      closeMatchThreshold,
      hasAmbiguousCloseSlots,
      hasUniqueClosestSlot,
    };
  }

  return {
    classification: "weak-best",
    warning: primarySlot
      ? `Slot ${primarySlot} is the closest match, but overall similarity is weak.`
      : "Closest similarity is weak.",
    assignedMapNumbers: primarySlot ? [primarySlot] : [],
    closeMatchCount: closeMatches.length,
    closeSlotCount: closeSlots.length,
    closeSlots,
    closeMatchThreshold,
    hasAmbiguousCloseSlots,
    hasUniqueClosestSlot,
  };
}

function applySimilaritySelectionToMatches(
  candidateMatches = [],
  { selectedCandidateMapUids = [], primaryReferenceMapUid = "" } = {}
) {
  const selectedUids = new Set(normalizeSelectedCandidateMapUids(selectedCandidateMapUids));
  const primaryUid = toText(primaryReferenceMapUid).toLowerCase();
  return (Array.isArray(candidateMatches) ? candidateMatches : []).map((entry) => {
    const mapUid = toText(entry?.mapUid).toLowerCase();
    return {
      ...entry,
      isPrimaryReference: Boolean(mapUid) && mapUid === primaryUid,
      isAssignedBySystem: Boolean(mapUid) && selectedUids.has(mapUid),
    };
  });
}

function adaptiveWeightedSum(components) {
  let totalAdjustedWeight = 0;
  let sum = 0;
  for (const { score, weight } of components) {
    const adjustedWeight =
      score < COMPONENT_SIGNIFICANCE_FLOOR
        ? weight * INSIGNIFICANT_WEIGHT_FACTOR
        : weight;
    totalAdjustedWeight += adjustedWeight;
    sum += score * adjustedWeight;
  }
  return totalAdjustedWeight > 0 ? sum / totalAdjustedWeight : 0;
}

function computeContentSimilarity(
  targetSignature,
  referenceSource = [],
  { targetName = "", includeNameSupport = true } = {}
) {
  const context = normalizeReferenceContext(referenceSource);
  const list = Array.isArray(context?.entries) ? context.entries : [];
  const structuredEntries = Array.isArray(context?.structuredEntries) ? context.structuredEntries : [];
  const useStructuredEntries = isStructuredLayoutSignature(targetSignature) && structuredEntries.length > 0;
  const activeEntries = useStructuredEntries
    ? [
        ...structuredEntries,
        ...list.filter((entry) => !entry?.isStructuredSignature),
      ]
    : list;
  const preparedTargetSignature = createPreparedSignature(targetSignature);
  if (!targetSignature || !list.length) {
    return {
      resolved: false,
      mapNumbers: [],
      topScore: 0,
      secondScore: 0,
      confidence: 0,
      candidateMatches: [],
      details: {
        matchClassification: "no-match",
        matchWarning: "No normal reference maps were available.",
        referenceCampaignCount: 0,
        referenceMapCount: 0,
      },
    };
  }

  const activeDocFrequency = useStructuredEntries
    ? context.structuredGroupDocFrequency || {}
    : context.groupDocFrequency || {};
  const targetUsesFallbackSignature =
    toText(targetSignature?.version) !== CONTENT_SIGNATURE_VERSION;
  const effectiveIncludeNameSupport = includeNameSupport || targetUsesFallbackSignature;
  const modelDocFrequency = activeDocFrequency?.modelTokens || new Map();
  const absoluteDocFrequency = activeDocFrequency?.absolutePlacementTokens || new Map();
  const relativeDocFrequency = activeDocFrequency?.relativePlacementTokens || new Map();
  const weightedAbsoluteDocFrequency =
    activeDocFrequency?.weightedAbsolutePlacementTokens || absoluteDocFrequency;
  const weightedRelativeDocFrequency =
    activeDocFrequency?.weightedRelativePlacementTokens || relativeDocFrequency;
  const matches = activeEntries
    .map((entry) => {
      const preparedReferenceSignature = entry?.preparedSignature || createPreparedSignature(entry?.signature);
      const modelScore = computeWeightedJaccard(
        preparedTargetSignature,
        preparedReferenceSignature,
        modelDocFrequency,
        "modelTokens"
      );
      const absoluteScore = computeWeightedJaccard(
        preparedTargetSignature,
        preparedReferenceSignature,
        absoluteDocFrequency,
        "absolutePlacementTokens"
      );
      const relativeScore = computeWeightedJaccard(
        preparedTargetSignature,
        preparedReferenceSignature,
        relativeDocFrequency,
        "relativePlacementTokens"
      );
      const weightedAbsoluteScore =
        hasSignatureGroupEntries(targetSignature, "weightedAbsolutePlacementTokens") &&
        Boolean(
          entry?.hasWeightedAbsolutePlacementTokens ||
            hasSignatureGroupEntries(entry?.signature, "weightedAbsolutePlacementTokens")
        )
          ? computeWeightedJaccard(
              preparedTargetSignature,
              preparedReferenceSignature,
              weightedAbsoluteDocFrequency,
              "weightedAbsolutePlacementTokens"
            )
          : absoluteScore;
      const weightedRelativeScore =
        hasSignatureGroupEntries(targetSignature, "weightedRelativePlacementTokens") &&
        Boolean(
          entry?.hasWeightedRelativePlacementTokens ||
            hasSignatureGroupEntries(entry?.signature, "weightedRelativePlacementTokens")
        )
          ? computeWeightedJaccard(
              preparedTargetSignature,
              preparedReferenceSignature,
              weightedRelativeDocFrequency,
              "weightedRelativePlacementTokens"
            )
          : relativeScore;
      const weightedScore =
        weightedAbsoluteScore * WEIGHTED_PLACEMENT_ABSOLUTE_WEIGHT +
        weightedRelativeScore * WEIGHTED_PLACEMENT_RELATIVE_WEIGHT;
      const useWeightedRelationalFallback =
        weightedScore < WEIGHTED_RELATIONAL_FALLBACK_THRESHOLD;
      const relationalFallbackScore = adaptiveWeightedSum([
        { score: weightedRelativeScore, weight: RELATIONAL_FALLBACK_RELATIVE_WEIGHT },
        { score: modelScore, weight: RELATIONAL_FALLBACK_MODEL_WEIGHT },
        { score: weightedAbsoluteScore, weight: RELATIONAL_FALLBACK_ABSOLUTE_WEIGHT },
      ]);
      const contentScore = useWeightedRelationalFallback
        ? relationalFallbackScore
        : adaptiveWeightedSum([
            { score: absoluteScore, weight: FINAL_ABSOLUTE_WEIGHT },
            { score: relativeScore, weight: FINAL_RELATIVE_WEIGHT },
            { score: weightedScore, weight: FINAL_WEIGHTED_PLACEMENT_WEIGHT },
            { score: modelScore, weight: FINAL_MODEL_WEIGHT },
          ]);
      const nameScore = effectiveIncludeNameSupport
        ? computeNameSimilarity(targetName, entry?.mapName || "")
        : 0;
      const fallbackReviewScore =
        nameScore * 0.86 +
        modelScore * 0.1 +
        Math.max(relativeScore, weightedRelativeScore) * 0.04;
      const score = targetUsesFallbackSignature
        ? Math.max(nameScore, fallbackReviewScore)
        : effectiveIncludeNameSupport
          ? Math.max(
              contentScore,
              contentScore * (1 - NAME_SUPPORT_WEIGHT) + nameScore * NAME_SUPPORT_WEIGHT
            )
          : contentScore;
      return {
        mapUid: toText(entry?.mapUid),
        slot: Number(entry?.slot || 0) || null,
        campaignId: Number(entry?.campaignId || 0) || null,
        campaignName: toText(entry?.campaignName) || null,
        mapName: toText(entry?.mapName) || null,
        modelScore,
        absoluteScore,
        relativeScore,
        weightedAbsoluteScore,
        weightedRelativeScore,
        weightedScore,
        contentScore,
        relationalFallbackScore,
        fallbackReviewScore,
        useWeightedRelationalFallback,
        nameScore,
        score,
      };
    })
    .filter((entry) => entry.mapUid && entry.slot)
    .sort((left, right) => {
      const scoreDiff = Number(right.score || 0) - Number(left.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const slotDiff = Number(left.slot || 0) - Number(right.slot || 0);
      if (slotDiff !== 0) return slotDiff;
      return String(left.mapUid).localeCompare(String(right.mapUid), undefined, {
        sensitivity: "base",
      });
    });

  const topScore = Number(matches[0]?.score || 0);
  const secondScore = Number(matches[1]?.score || 0);
  const rankedMatches = matches.slice(0, MAX_CANDIDATE_MATCHES);
  const disposition = targetUsesFallbackSignature
    ? {
        classification: "fallback-manual-review",
        warning:
          "GBX parsing failed for the target map, so similarity is using non-GBX signals and requires manual review.",
        assignedMapNumbers: [],
        closeMatchCount: 0,
        closeSlotCount: 0,
        closeSlots: [],
        closeMatchThreshold: 0,
        hasAmbiguousCloseSlots: false,
        hasUniqueClosestSlot: false,
      }
    : buildSimilarityDisposition(rankedMatches, {
        topScore,
        secondScore,
      });
  const closeMatches = rankedMatches.filter(
    (entry) => Number(entry?.score || 0) >= Number(disposition.closeMatchThreshold || 0)
  );
  let selectedCandidateMapUids =
    targetUsesFallbackSignature ? [] : rankedMatches[0]?.mapUid ? [rankedMatches[0].mapUid] : [];
  if (
    !targetUsesFallbackSignature &&
    disposition.classification === "ambiguous-close-slots" &&
    closeMatches.length > 1 &&
    closeMatches.every((entry) => Number(entry?.score || 0) >= MULTI_MATCH_APPROVAL_SCORE)
  ) {
    selectedCandidateMapUids = closeMatches.map((entry) => entry.mapUid);
  }
  const rawCandidateMatches = rankedMatches
    .map((entry) => ({
      mapUid: entry.mapUid,
      slot: entry.slot,
      campaignId: entry.campaignId,
      campaignName: entry.campaignName,
      mapName: entry.mapName,
      modelScore: Number(entry.modelScore.toFixed(6)),
      absoluteScore: Number(entry.absoluteScore.toFixed(6)),
      relativeScore: Number(entry.relativeScore.toFixed(6)),
      weightedAbsoluteScore: Number(entry.weightedAbsoluteScore.toFixed(6)),
      weightedRelativeScore: Number(entry.weightedRelativeScore.toFixed(6)),
      weightedScore: Number(entry.weightedScore.toFixed(6)),
      contentScore: Number(entry.contentScore.toFixed(6)),
      relationalFallbackScore: Number(entry.relationalFallbackScore.toFixed(6)),
      fallbackReviewScore: Number(entry.fallbackReviewScore.toFixed(6)),
      usedWeightedRelationalFallback: Boolean(entry.useWeightedRelationalFallback),
      nameScore: Number(entry.nameScore.toFixed(6)),
      distanceFromTop: Number(Math.max(0, topScore - Number(entry.score || 0)).toFixed(6)),
      isCloseMatch: Number(entry.score || 0) >= Number(disposition.closeMatchThreshold || 0),
      score: Number(entry.score.toFixed(6)),
    }));
  const candidateMatches = applySimilaritySelectionToMatches(rawCandidateMatches, {
    selectedCandidateMapUids,
    primaryReferenceMapUid: rankedMatches[0]?.mapUid || "",
  });
  const mapNumbers = normalizeMapNumbers(disposition.assignedMapNumbers);
  const ambiguityPenalty = disposition.hasAmbiguousCloseSlots ? 0.18 : 0;
  const weaknessPenalty = topScore < WEAK_BEST_SCORE ? 0.12 : 0;
  const confidence = Math.max(
    0,
    Math.min(
      1,
      topScore <= 0
        ? 0
        : topScore * 0.78 +
            Math.max(0, topScore - secondScore) * 0.32 -
            ambiguityPenalty -
            weaknessPenalty
    )
  );

  return {
    resolved: mapNumbers.length > 0 && topScore >= MIN_SIMILARITY_SCORE,
    mapNumbers,
    topScore,
    secondScore,
    confidence,
    primaryReferenceMapUid: candidateMatches[0]?.mapUid || null,
    primaryReferenceSlot: Number(candidateMatches[0]?.slot || 0) || null,
    referenceCampaignId: Number(candidateMatches[0]?.campaignId || 0) || null,
    referenceCampaignName: candidateMatches[0]?.campaignName || null,
    candidateMatches,
    details: {
      matchClassification: disposition.classification,
      matchWarning: disposition.warning,
      closeMatchCount: Number(disposition.closeMatchCount || 0),
      closeSlotCount: Number(disposition.closeSlotCount || 0),
      closeSlots: disposition.closeSlots,
      closeMatchThreshold: Number(disposition.closeMatchThreshold || 0),
      hasAmbiguousCloseSlots: Boolean(disposition.hasAmbiguousCloseSlots),
      hasUniqueClosestSlot: Boolean(disposition.hasUniqueClosestSlot),
      selectedCandidateMapUids,
      selectedCandidateCount: selectedCandidateMapUids.length,
      targetSignatureFallback: targetUsesFallbackSignature,
      manualReviewRequired: targetUsesFallbackSignature,
      referenceCampaignCount: Number(
        useStructuredEntries ? context.structuredCampaignCount || context.campaignCount || 0 : context.campaignCount || 0
      ),
      referenceMapCount: activeEntries.length,
      referenceMapCountTotal: list.length,
      structuredReferenceMapCount: structuredEntries.length,
      usedStructuredReferences: useStructuredEntries,
      closestMapName: candidateMatches[0]?.mapName || null,
    },
  };
}

function mergeSimilarityIntoCandidate(candidate = {}, similarity = null) {
  const baseMapNumbers = normalizeMapNumbers(candidate?.mapNumbers);
  const similarityMapNumbers = normalizeMapNumbers(similarity?.mapNumbers);
  const hasManualSelection = Boolean(similarity?.details?.manualSelection);
  const isTraining = toText(candidate?.season).toLowerCase() === "training";
  const preferRegex =
    !hasManualSelection &&
    baseMapNumbers.length > 0 &&
    (isTraining || baseMapNumbers.length > 1);
  let finalMapNumbers = baseMapNumbers;
  let parserPattern = toText(candidate?.parserPattern) || null;
  let parserConfidence = clampNumber(candidate?.parserConfidence, {
    min: 0,
    max: 100,
    fallback: 0,
  });
  let sourceVersion = toText(candidate?.sourceVersion, CONTENT_SIGNATURE_VERSION);
  let requiresRegex = Boolean(candidate?.requiresRegex);

  if (similarityMapNumbers.length > 0 && !preferRegex) {
    if (!baseMapNumbers.length) {
      finalMapNumbers = similarityMapNumbers;
      parserPattern = CONTENT_SIMILARITY_PATTERN;
      parserConfidence = Math.max(parserConfidence, Math.round(Number(similarity?.confidence || 0) * 100));
      sourceVersion = `${sourceVersion}+${CONTENT_SIGNATURE_VERSION}`;
      requiresRegex = false;
    } else {
      const union = normalizeMapNumbers([...baseMapNumbers, ...similarityMapNumbers]);
      if (union.length !== baseMapNumbers.length) {
        finalMapNumbers = union;
        parserConfidence = Math.max(
          parserConfidence,
          Math.round(Number(similarity?.confidence || 0) * 100)
        );
        sourceVersion = `${sourceVersion}+${CONTENT_SIGNATURE_VERSION}`;
      }
      requiresRegex = false;
    }
  }

  const finalMapNumber = finalMapNumbers[0] || null;
  return {
    ...candidate,
    mapNumber: finalMapNumber,
    mapNumbers: finalMapNumbers,
    parserPattern,
    parserConfidence,
    sourceVersion,
    requiresRegex,
    automationState: normalizeCandidateAutomation({
      ...candidate,
      mapNumbers: finalMapNumbers,
    }),
  };
}

function evaluateSimilarityAutoApproval({
  similarity = null,
  signatureStatus = "",
  assignedMapNumbers = [],
} = {}) {
  const mapNumbers = normalizeMapNumbers(assignedMapNumbers);
  const topScore = Number(similarity?.topScore || 0);
  const secondScore = Number(similarity?.secondScore || 0);
  const candidateMatches = Array.isArray(similarity?.candidateMatches) ? similarity.candidateMatches : [];
  const similarityDetails = similarity?.details || {};
  if (String(signatureStatus || "").toLowerCase() !== "ready") {
    return { eligible: false, reason: "signature-not-ready" };
  }
  if (!mapNumbers.length) {
    return { eligible: false, reason: "no-assigned-map-number" };
  }
  if (
    Boolean(similarityDetails?.hasAmbiguousCloseSlots) ||
    Number(similarityDetails?.closeSlotCount || 0) > 1 ||
    String(similarityDetails?.matchClassification || "") === "ambiguous-close-slots"
  ) {
    return { eligible: false, reason: "ambiguous-close-slots" };
  }
  if (Boolean(similarityDetails?.manualReviewRequired) || Boolean(similarityDetails?.targetSignatureFallback)) {
    return { eligible: false, reason: "manual-review-required" };
  }
  if (mapNumbers.length === 1) {
    if (topScore - secondScore >= LARGE_SCORE_GAP_AUTO_APPROVAL) {
      return { eligible: true, reason: "large-score-gap" };
    }
    if (candidateMatches.length >= 2) {
      const top = candidateMatches[0];
      const second = candidateMatches[1];
      const dominantComponents = [
        { name: "contentScore", top: Number(top?.contentScore || 0), second: Number(second?.contentScore || 0) },
        { name: "modelScore", top: Number(top?.modelScore || 0), second: Number(second?.modelScore || 0) },
      ];
      for (const comp of dominantComponents) {
        if (
          comp.top >= SINGLE_MATCH_APPROVAL_SCORE &&
          comp.top - comp.second >= LARGE_SCORE_GAP_AUTO_APPROVAL
        ) {
          return { eligible: true, reason: `dominant-component-gap:${comp.name}` };
        }
      }
    }
    if (topScore < SINGLE_MATCH_APPROVAL_SCORE) {
      return { eligible: false, reason: "top-score-below-threshold" };
    }
    if (topScore - secondScore < SINGLE_MATCH_APPROVAL_GAP) {
      return { eligible: false, reason: "insufficient-score-gap" };
    }
    return { eligible: true, reason: "single-high-confidence" };
  }

  const withinTieWindow = candidateMatches.length > 1 &&
    candidateMatches.every((match) => Number(match?.score || 0) >= topScore * MULTI_MATCH_TIE_WINDOW);
  const allHigh = candidateMatches.length > 1 &&
    candidateMatches.every((match) => Number(match?.score || 0) >= MULTI_MATCH_APPROVAL_SCORE);
  if (withinTieWindow && allHigh) {
    return { eligible: true, reason: "multi-high-confidence-tie" };
  }
  return { eligible: false, reason: "ambiguous-multi-match" };
}

function deriveSimilarityUnmatchedReason({
  candidate = null,
  similarity = null,
  localFileStatus = "",
  signatureStatus = "",
  referenceMapCount = 0,
} = {}) {
  if (Array.isArray(candidate?.mapNumbers) && candidate.mapNumbers.length > 0) return null;
  const safeLocalStatus = String(localFileStatus || "").toLowerCase();
  const safeSignatureStatus = String(signatureStatus || "").toLowerCase();
  if (!safeLocalStatus || safeLocalStatus === "missing") return "no local copy";
  if (safeLocalStatus === "error") return "local copy error";
  if (!safeSignatureStatus) return "signature missing";
  if (safeSignatureStatus === "error") return "parser error";
  if (!Number(referenceMapCount || 0)) return "no normal reference maps";
  if (Boolean(similarity?.details?.manualReviewRequired) || Boolean(similarity?.details?.targetSignatureFallback)) {
    return "parser fallback: manual review";
  }
  const topScore = Number(similarity?.topScore || 0);
  if (topScore <= 0) return "no similarity result";
  if (String(similarity?.details?.matchClassification || "") === "ambiguous-close-slots") {
    return "ambiguous close matches";
  }
  if (topScore < MIN_SIMILARITY_SCORE) return "low confidence";
  const assigned = normalizeMapNumbers(similarity?.assignedMapNumbers || similarity?.mapNumbers || []);
  if (assigned.length > 1) return "ambiguous multi-match";
  if (String(similarity?.details?.matchClassification || "") === "weak-best") {
    return "weak closest match";
  }
  return "unresolved";
}

export {
  ASSET_FALLBACK_SIGNATURE_VERSION,
  CONTENT_SIGNATURE_VERSION,
  CONTENT_SIMILARITY_PATTERN,
  buildContentSimilarityReferenceContext,
  buildCampaignFamily,
  computeContentSimilarity,
  deriveSimilarityUnmatchedReason,
  evaluateSimilarityAutoApproval,
  extractGbxContentSignature,
  applySimilaritySelectionToMatches,
  mergeSimilarityIntoCandidate,
  normalizeMapNumbers,
  normalizeCandidateAutomation,
};
