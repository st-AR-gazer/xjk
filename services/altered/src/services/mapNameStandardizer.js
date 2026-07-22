export {
  buildMapNameCandidate,
  classifyNamingSimilaritySource,
  shouldExcludeFromNamingReview,
} from "./mapNameStandardizer/candidateBuilder.js";
export { parseCampaignStandardizedFields } from "./mapNameStandardizer/campaignParser.js";
export {
  deriveMapNumbers,
  deriveParserWarning,
  extractMapNumberFromText,
  extractMapNumbersFromText,
  parseStandardizedFields,
} from "./mapNameStandardizer/mapParser.js";
export { parseAlterationTail, sanitizeMapName } from "./mapNameStandardizer/normalization.js";
export {
  listKnownAlterationRegexBehavior,
  listKnownAlterationRegexLibrary,
} from "./mapNameStandardizer/regexLibrary.js";
export { SOURCE_VERSION, WEEKLY_SHORTS_CANONICAL_MAPS } from "./mapNameStandardizer/standardizerData.js";
export {
  normalizeWeeklyShortsTitle,
  resolveCanonicalWeeklyShortsWeek,
  resolveWeeklyGrandWeek,
  resolveWeeklyShortsEntry,
  resolveWeeklyShortsWeek,
} from "./mapNameStandardizer/weeklyCampaigns.js";
