export {
  ASSET_FALLBACK_SIGNATURE_VERSION,
  CONTENT_SIGNATURE_VERSION,
  CONTENT_SIMILARITY_PATTERN,
} from "./mapContentSimilarity/constants.js";
export { normalizeMapNumbers } from "./mapContentSimilarity/normalization.js";
export {
  buildCampaignFamily,
  mergeSimilarityIntoCandidate,
  normalizeCandidateAutomation,
} from "./mapContentSimilarity/candidate.js";
export {
  applySimilaritySelectionToMatches,
  deriveSimilarityUnmatchedReason,
  evaluateSimilarityAutoApproval,
} from "./mapContentSimilarity/policy.js";
export { computeContentSimilarity } from "./mapContentSimilarity/scoring.js";
export {
  buildContentSimilarityReferenceContext,
  extractGbxContentSignature,
} from "./mapContentSimilarity/signature.js";
export {
  DEFAULT_SIMILARITY_WEIGHT_PROFILE,
  buildNormalizedSimilarityWeightProfile,
  buildSimilarityWeightProfile,
  similarityWeightProfileFingerprint,
} from "./mapContentSimilarity/weightProfile.js";
