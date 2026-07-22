export { createHash, randomUUID } from "node:crypto";
export { spawn } from "node:child_process";
export { default as fsSync } from "node:fs";
export { default as fs } from "node:fs/promises";
export { default as path } from "node:path";
export { Worker, isMainThread } from "node:worker_threads";
export { normalizeAccountId } from "../../live/trackmaniaOAuthClient.js";
export {
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
  listKnownAlterationRegexLibrary,
  listKnownAlterationRegexBehavior,
} from "../mapNameStandardizer.js";
export {
  ASSET_FALLBACK_SIGNATURE_VERSION,
  CONTENT_SIGNATURE_VERSION,
  CONTENT_SIMILARITY_PATTERN,
  DEFAULT_SIMILARITY_WEIGHT_PROFILE,
  applySimilaritySelectionToMatches,
  buildSimilarityWeightProfile,
  buildContentSimilarityReferenceContext,
  buildCampaignFamily,
  computeContentSimilarity,
  deriveSimilarityUnmatchedReason,
  evaluateSimilarityAutoApproval,
  extractGbxContentSignature,
  mergeSimilarityIntoCandidate,
  normalizeMapNumbers,
  similarityWeightProfileFingerprint,
} from "../mapContentSimilarity.js";
export { parseGbxMapLayouts } from "../gbxMapLayoutParser.js";
export { buildMapViewerDiffPayload } from "../mapViewerDiff.js";
export { applyAlterationGrouping, createAlterationGroupingStore } from "../alterationGrouping.js";
export {
  DATA_DIR,
  DB_FILE,
  ALTERED_MAP_COPY_BACKFILL_BATCH_SIZE,
  ALTERED_MAP_COPY_BACKFILL_ENABLED,
  ALTERED_MAP_COPY_MAX_CONCURRENT_DOWNLOADS,
  ALTERED_MAP_COPY_REQUEST_TIMEOUT_MS,
} from "../../config.js";
export { buildPublicApiCatalog, PUBLIC_API_ENDPOINTS } from "../../publicApi/catalog.js";
export {
  hasResolvedDisplayName,
  resolveKnownDisplayName,
  sanitizeResolvedDisplayName,
} from "../../../../shared/displayNameResolution.js";
export * from "./serviceConstants.js";
export * from "./runtimeSupport.js";
export * from "./similarityPolicySupport.js";
export * from "./valueSupport.js";
export * from "./mapMetadataSupport.js";
export * from "./leaderboardSupport.js";
export * from "./livePayloadSupport.js";
