import { toText } from "../../../../shared/valueUtils.js";
import { resolveRegexMapNumbers } from "./candidate.js";
import { CONTENT_SIGNATURE_VERSION } from "./constants.js";
import { normalizeMapNumbers } from "./normalization.js";
import {
  MIN_SIMILARITY_SCORE,
  MULTI_MATCH_APPROVAL_SCORE,
  WEAK_BEST_SCORE,
  applySimilaritySelectionToMatches,
  buildSimilarityDisposition,
} from "./policy.js";
import {
  computeWeightedJaccard,
  createPreparedSignature,
  hasSignatureGroupEntries,
  isStructuredLayoutSignature,
  normalizeReferenceContext,
} from "./signature.js";
import {
  buildNormalizedSimilarityWeightProfile,
  buildSimilarityWeightProfile,
  similarityWeightProfileFingerprint,
} from "./weightProfile.js";

const MAP_FORMATTING_CODE_PATTERN = /\$([0-9a-fA-F]{1,3}|[gimnostuwzGIMNOSTUWZ<>]|[hlpHLP](\[[^\]]+\])?)/g;
const MAX_CANDIDATE_MATCHES = 25;
const WEIGHTED_RELATIONAL_FALLBACK_THRESHOLD = 0.01;
const COMPONENT_SIGNIFICANCE_FLOOR = 0.001;
const INSIGNIFICANT_WEIGHT_FACTOR = 0.05;

function normalizeNameForSimilarity(value = "") {
  return toText(value)
    .replace(MAP_FORMATTING_CODE_PATTERN, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(
      /\b(1up|1-up|1down|1-down|sttf|wood|plastic|ice|icy|magnet|underwater|reverse|flooded|grassy|bumper|puzzle|earthquake|walmartmini|staircase|short|tilted|glider|freewheel|fragile|reactor|cpless|cpfull|platform|training)\b/g,
      " "
    )
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
    leftBigrams.size + rightBigrams.size > 0 ? (2 * bigramIntersection) / (leftBigrams.size + rightBigrams.size) : 0;

  return Math.max(tokenJaccard, bigramDice);
}

function adaptiveWeightedSum(components) {
  let totalAdjustedWeight = 0;
  let sum = 0;
  for (const { score, weight } of components) {
    const adjustedWeight = score < COMPONENT_SIGNIFICANCE_FLOOR ? weight * INSIGNIFICANT_WEIGHT_FACTOR : weight;
    totalAdjustedWeight += adjustedWeight;
    sum += score * adjustedWeight;
  }
  return totalAdjustedWeight > 0 ? sum / totalAdjustedWeight : 0;
}

function computeContentSimilarity(
  targetSignature,
  referenceSource = [],
  {
    targetName = "",
    targetMapNumbers = [],
    targetParserPattern = "",
    includeNameSupport = true,
    weightProfile = null,
  } = {}
) {
  const context = normalizeReferenceContext(referenceSource);
  const list = Array.isArray(context?.entries) ? context.entries : [];
  const structuredEntries = Array.isArray(context?.structuredEntries) ? context.structuredEntries : [];
  const useStructuredEntries = isStructuredLayoutSignature(targetSignature) && structuredEntries.length > 0;
  const activeEntries = useStructuredEntries
    ? [...structuredEntries, ...list.filter((entry) => !entry?.isStructuredSignature)]
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
  const targetUsesFallbackSignature = toText(targetSignature?.version) !== CONTENT_SIGNATURE_VERSION;
  const effectiveIncludeNameSupport = includeNameSupport || targetUsesFallbackSignature;
  const effectiveWeightProfile = buildSimilarityWeightProfile(weightProfile);
  const normalizedWeightProfile = buildNormalizedSimilarityWeightProfile(effectiveWeightProfile);
  const regexMapNumbers = resolveRegexMapNumbers({
    targetName,
    targetMapNumbers,
    targetParserPattern,
  });
  const hasRegexMapNumbers = regexMapNumbers.length > 0;
  const modelDocFrequency = activeDocFrequency?.modelTokens || new Map();
  const absoluteDocFrequency = activeDocFrequency?.absolutePlacementTokens || new Map();
  const relativeDocFrequency = activeDocFrequency?.relativePlacementTokens || new Map();
  const weightedAbsoluteDocFrequency = activeDocFrequency?.weightedAbsolutePlacementTokens || absoluteDocFrequency;
  const weightedRelativeDocFrequency = activeDocFrequency?.weightedRelativePlacementTokens || relativeDocFrequency;
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
      const nameScore = effectiveIncludeNameSupport ? computeNameSimilarity(targetName, entry?.mapName || "") : 0;
      const regexScore = hasRegexMapNumbers && regexMapNumbers.includes(Number(entry?.slot || 0) || 0) ? 1 : 0;
      const weightedScore =
        weightedAbsoluteScore * normalizedWeightProfile.weightedPlacement.absolute +
        weightedRelativeScore * normalizedWeightProfile.weightedPlacement.relative;
      const useWeightedRelationalFallback = weightedScore < WEIGHTED_RELATIONAL_FALLBACK_THRESHOLD;
      const relationalFallbackScore = adaptiveWeightedSum([
        {
          score: weightedRelativeScore,
          weight: normalizedWeightProfile.relationalFallback.relative,
        },
        { score: modelScore, weight: normalizedWeightProfile.relationalFallback.model },
        {
          score: weightedAbsoluteScore,
          weight: normalizedWeightProfile.relationalFallback.absolute,
        },
        {
          score: nameScore,
          weight: normalizedWeightProfile.relationalFallback.name,
        },
      ]);
      const contentScore = useWeightedRelationalFallback
        ? relationalFallbackScore
        : adaptiveWeightedSum([
            { score: absoluteScore, weight: normalizedWeightProfile.final.absolute },
            { score: relativeScore, weight: normalizedWeightProfile.final.relative },
            {
              score: weightedScore,
              weight: normalizedWeightProfile.final.weightedPlacement,
            },
            { score: modelScore, weight: normalizedWeightProfile.final.model },
            { score: nameScore, weight: normalizedWeightProfile.final.name },
            { score: regexScore, weight: normalizedWeightProfile.final.regex },
          ]);
      const effectiveScore =
        effectiveWeightProfile.regexOverwriteWeights && hasRegexMapNumbers ? regexScore : contentScore;
      const fallbackReviewScore =
        nameScore * 0.86 + modelScore * 0.1 + Math.max(relativeScore, weightedRelativeScore) * 0.04;
      const score = targetUsesFallbackSignature ? Math.max(nameScore, fallbackReviewScore) : effectiveScore;
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
        regexScore,
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
  let selectedCandidateMapUids = targetUsesFallbackSignature
    ? []
    : rankedMatches[0]?.mapUid
      ? [rankedMatches[0].mapUid]
      : [];
  if (
    !targetUsesFallbackSignature &&
    disposition.classification === "ambiguous-close-slots" &&
    closeMatches.length > 1 &&
    closeMatches.every((entry) => Number(entry?.score || 0) >= MULTI_MATCH_APPROVAL_SCORE)
  ) {
    selectedCandidateMapUids = closeMatches.map((entry) => entry.mapUid);
  }
  const rawCandidateMatches = rankedMatches.map((entry) => ({
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
    regexScore: Number(entry.regexScore.toFixed(6)),
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
        : topScore * 0.78 + Math.max(0, topScore - secondScore) * 0.32 - ambiguityPenalty - weaknessPenalty
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
        useStructuredEntries
          ? context.structuredCampaignCount || context.campaignCount || 0
          : context.campaignCount || 0
      ),
      referenceMapCount: activeEntries.length,
      referenceMapCountTotal: list.length,
      structuredReferenceMapCount: structuredEntries.length,
      usedStructuredReferences: useStructuredEntries,
      closestMapName: candidateMatches[0]?.mapName || null,
      weightProfile: {
        raw: effectiveWeightProfile,
        normalized: normalizedWeightProfile,
        fingerprint: similarityWeightProfileFingerprint(effectiveWeightProfile),
      },
    },
  };
}

export { computeContentSimilarity };
