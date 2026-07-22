import { listKnownAlterationRegexBehavior } from "../mapNameStandardizer.js";
import {
  DEFAULT_SIMILARITY_WEIGHT_PROFILE,
  buildSimilarityWeightProfile,
  similarityWeightProfileFingerprint,
} from "../mapContentSimilarity.js";
import { clampInt } from "./runtimeSupport.js";
import { normalizeUniqueStrings, toText } from "./valueSupport.js";

function resolveRecommendedAlterationRegexProfile(alterationSlugs = []) {
  const behavior = listKnownAlterationRegexBehavior();
  let recommended = null;
  normalizeUniqueStrings(
    (Array.isArray(alterationSlugs) ? alterationSlugs : [alterationSlugs])
      .map((value) => toText(value).toLowerCase())
      .filter(Boolean)
  ).forEach((slug) => {
    const profile = behavior?.[slug]?.recommendedProfile;
    if (!profile || typeof profile !== "object") return;
    recommended = buildSimilarityWeightProfile(profile, {
      baseProfile: recommended || DEFAULT_SIMILARITY_WEIGHT_PROFILE,
    });
  });
  return recommended ? buildSimilarityWeightProfile(recommended) : null;
}

function resolveActiveSimilarityWeightProfile(
  { mapUid = "", campaignId = null } = {},
  { mapOverrideByUid = new Map(), campaignOverrideById = new Map(), scopedRules = [], targetContext = null } = {}
) {
  const normalizedMapUid = toText(mapUid).toLowerCase();
  const normalizedCampaignId = clampInt(campaignId, { min: 1, max: 2147483647, fallback: 0 }) || null;
  const normalizedTarget = normalizeSimilarityWeightTargetContext(targetContext);
  const mapOverride = normalizedMapUid ? mapOverrideByUid.get(normalizedMapUid) || null : null;
  const campaignOverride =
    normalizedCampaignId && campaignOverrideById instanceof Map
      ? campaignOverrideById.get(normalizedCampaignId) || null
      : null;
  const recommendedAlterationWeights = resolveRecommendedAlterationRegexProfile(normalizedTarget.alterationSlugs);
  let scopedWeights = buildSimilarityWeightProfile(recommendedAlterationWeights, {
    baseProfile: DEFAULT_SIMILARITY_WEIGHT_PROFILE,
  });
  const matchedRules = resolveMatchingSimilarityWeightRules(normalizedTarget, scopedRules);
  for (const rule of matchedRules) {
    scopedWeights = buildSimilarityWeightProfile(rule.weights, {
      baseProfile: scopedWeights,
    });
  }
  const campaignWeights = campaignOverride?.weights
    ? buildSimilarityWeightProfile(campaignOverride.weights, { baseProfile: scopedWeights })
    : scopedWeights;
  const effectiveWeights = mapOverride?.weights
    ? buildSimilarityWeightProfile(mapOverride.weights, { baseProfile: campaignWeights })
    : campaignWeights;
  return {
    defaults: buildSimilarityWeightProfile(DEFAULT_SIMILARITY_WEIGHT_PROFILE),
    matchedRules,
    scopedWeights,
    campaignOverride,
    mapOverride,
    recommendedAlterationWeights,
    effectiveWeights,
    fingerprint: similarityWeightProfileFingerprint(effectiveWeights),
    activeScope: mapOverride ? "map" : campaignOverride ? "campaign" : matchedRules.length ? "rule" : "default",
  };
}

function normalizeSimilarityWeightTargetContext(targetContext = null) {
  const safeTarget = targetContext && typeof targetContext === "object" ? targetContext : {};
  return {
    sourceKey: toText(safeTarget.sourceKey).toLowerCase() || "",
    season: toText(safeTarget.season) || "",
    seasonYear: clampInt(safeTarget.seasonYear, { min: 1900, max: 3000, fallback: 0 }) || null,
    environment: toText(safeTarget.environment) || "",
    alterationSlugs: normalizeUniqueStrings(
      (Array.isArray(safeTarget.alterationSlugs) ? safeTarget.alterationSlugs : [safeTarget.alterationSlug])
        .map((value) => toText(value).toLowerCase())
        .filter(Boolean)
    ),
  };
}

function similarityWeightRuleSpecificity(rule = {}) {
  return (
    (toText(rule?.sourceKey) ? 4 : 0) +
    (toText(rule?.season) ? 4 : 0) +
    (Number(rule?.seasonYear || 0) ? 4 : 0) +
    (toText(rule?.environment) ? 5 : 0) +
    (toText(rule?.alterationSlug) ? 6 : 0)
  );
}

function similarityWeightRuleMatches(targetContext = null, rule = {}) {
  const safeTarget = normalizeSimilarityWeightTargetContext(targetContext);
  const sourceKey = toText(rule?.sourceKey).toLowerCase();
  const season = toText(rule?.season);
  const seasonYear = clampInt(rule?.seasonYear, { min: 1900, max: 3000, fallback: 0 }) || null;
  const environment = toText(rule?.environment);
  const alterationSlug = toText(rule?.alterationSlug).toLowerCase();
  if (sourceKey && sourceKey !== safeTarget.sourceKey) return false;
  if (season && season.toLowerCase() !== safeTarget.season.toLowerCase()) return false;
  if (seasonYear && seasonYear !== Number(safeTarget.seasonYear || 0)) return false;
  if (environment && environment.toLowerCase() !== safeTarget.environment.toLowerCase()) return false;
  if (alterationSlug && !safeTarget.alterationSlugs.includes(alterationSlug)) return false;
  return true;
}

function resolveMatchingSimilarityWeightRules(targetContext = null, rules = []) {
  return (Array.isArray(rules) ? rules : [])
    .filter((rule) => Boolean(rule?.enabled) && similarityWeightRuleMatches(targetContext, rule))
    .sort((left, right) => {
      const specificityDiff = similarityWeightRuleSpecificity(left) - similarityWeightRuleSpecificity(right);
      if (specificityDiff !== 0) return specificityDiff;
      const updatedDiff = Date.parse(String(left?.updatedAt || "")) - Date.parse(String(right?.updatedAt || ""));
      if (updatedDiff !== 0) return updatedDiff;
      return Number(left?.ruleId || 0) - Number(right?.ruleId || 0);
    });
}

function buildSimilarityWeightTargetContext({
  sourceKey = "",
  season = "",
  seasonYear = null,
  environment = "",
  alterationSlugs = [],
} = {}) {
  return normalizeSimilarityWeightTargetContext({
    sourceKey,
    season,
    seasonYear,
    environment,
    alterationSlugs,
  });
}

export {
  resolveRecommendedAlterationRegexProfile,
  resolveActiveSimilarityWeightProfile,
  normalizeSimilarityWeightTargetContext,
  similarityWeightRuleSpecificity,
  similarityWeightRuleMatches,
  resolveMatchingSimilarityWeightRules,
  buildSimilarityWeightTargetContext,
};
