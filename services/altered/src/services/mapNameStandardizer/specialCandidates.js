import { sanitizeMapName } from "./normalization.js";
import { SOURCE_VERSION } from "./standardizerData.js";

function candidateIdentity(context) {
  return {
    mapUid: context.mapUid,
    originalName: context.originalName || context.mapUid,
  };
}

function matchedCandidateMetadata() {
  return {
    alteration: null,
    alterationMix: [],
    alterations: [],
    carType: null,
    automationState: "matched",
    requiresRegex: false,
    sourceVersion: SOURCE_VERSION,
  };
}

function buildWeeklyShortsCandidate(context) {
  const entry = context.weeklyShortsEntry;
  if (!entry) return null;
  return {
    ...candidateIdentity(context),
    sanitizedName: sanitizeMapName(entry.title) || context.originalName || context.mapUid,
    proposedName: `Weekly Shorts - ${String(entry.mapNumber).padStart(2, "0")} | ${entry.title}`,
    parserPattern: entry.source,
    parserConfidence: 100,
    season: "Weekly Shorts",
    year: null,
    mapNumber: entry.mapNumber,
    mapNumbers: [entry.mapNumber],
    ...matchedCandidateMetadata(),
    weeklyShortsWeek: entry.week,
    weeklyShortsCanonicalWeek: entry.canonicalWeek || null,
    weeklyShortsPosition: entry.position,
    weeklyShortsTitle: entry.title,
  };
}

function isCanonicalWeeklyGrand(map, context) {
  const payload = context.payload;
  return Boolean(
    payload?.weeklyGrand?.isCanonicalNadeoWeek ||
      payload?.weekly_grand?.isCanonicalNadeoWeek ||
      map.campaignPayload?.weeklyGrand?.isCanonicalNadeoWeek ||
      map.campaignPayload?.weekly_grand?.isCanonicalNadeoWeek
  );
}

function buildWeeklyGrandCandidate(map, context) {
  if (!context.weeklyGrandWeek || !isCanonicalWeeklyGrand(map, context)) return null;
  return {
    ...candidateIdentity(context),
    sanitizedName: context.originalName || context.mapUid,
    proposedName: `Weekly Grands - ${String(context.weeklyGrandWeek).padStart(2, "0")}`,
    parserPattern: "weekly-grands-week",
    parserConfidence: 100,
    season: "Weekly Grands",
    year: null,
    mapNumber: context.weeklyGrandWeek,
    mapNumbers: [context.weeklyGrandWeek],
    ...matchedCandidateMetadata(),
    weeklyGrandWeek: context.weeklyGrandWeek,
  };
}

function buildSpecialMapNameCandidate(map, context) {
  return buildWeeklyShortsCandidate(context) || buildWeeklyGrandCandidate(map, context);
}

export { buildSpecialMapNameCandidate };
