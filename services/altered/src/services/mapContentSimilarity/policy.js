import { toText } from "../../../../shared/valueUtils.js";
import { normalizeMapNumbers, normalizeSelectedCandidateMapUids } from "./normalization.js";

const SINGLE_MATCH_APPROVAL_SCORE = 0.9;
const SINGLE_MATCH_APPROVAL_GAP = 0.15;
const MULTI_MATCH_APPROVAL_SCORE = 0.95;
const MULTI_MATCH_TIE_WINDOW = 0.92;
const MIN_SIMILARITY_SCORE = 0.12;
const CLOSE_MATCH_SCORE_DELTA = 0.03;
const CLOSE_MATCH_RATIO = 0.97;
const LARGE_SCORE_GAP_AUTO_APPROVAL = 0.35;
const WEAK_BEST_SCORE = 0.55;

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

function evaluateSimilarityAutoApproval({ similarity = null, signatureStatus = "", assignedMapNumbers = [] } = {}) {
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
        {
          name: "contentScore",
          top: Number(top?.contentScore || 0),
          second: Number(second?.contentScore || 0),
        },
        {
          name: "modelScore",
          top: Number(top?.modelScore || 0),
          second: Number(second?.modelScore || 0),
        },
      ];
      for (const comp of dominantComponents) {
        if (comp.top >= SINGLE_MATCH_APPROVAL_SCORE && comp.top - comp.second >= LARGE_SCORE_GAP_AUTO_APPROVAL) {
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

  const withinTieWindow =
    candidateMatches.length > 1 &&
    candidateMatches.every((match) => Number(match?.score || 0) >= topScore * MULTI_MATCH_TIE_WINDOW);
  const allHigh =
    candidateMatches.length > 1 &&
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
  MIN_SIMILARITY_SCORE,
  MULTI_MATCH_APPROVAL_SCORE,
  WEAK_BEST_SCORE,
  applySimilaritySelectionToMatches,
  buildSimilarityDisposition,
  deriveSimilarityUnmatchedReason,
  evaluateSimilarityAutoApproval,
};
