import { clampNumber, normalizeTextList } from "./normalization.js";

const FINAL_ABSOLUTE_WEIGHT = 0.44;
const FINAL_RELATIVE_WEIGHT = 0.26;
const FINAL_WEIGHTED_PLACEMENT_WEIGHT = 0.22;
const FINAL_MODEL_WEIGHT = 0.08;
const FINAL_NAME_WEIGHT = 0.06;
const FINAL_REGEX_WEIGHT = 0;
const WEIGHTED_PLACEMENT_ABSOLUTE_WEIGHT = 0.68;
const WEIGHTED_PLACEMENT_RELATIVE_WEIGHT = 0.32;
const RELATIONAL_FALLBACK_RELATIVE_WEIGHT = 0.82;
const RELATIONAL_FALLBACK_MODEL_WEIGHT = 0.14;
const RELATIONAL_FALLBACK_ABSOLUTE_WEIGHT = 0.04;
const RELATIONAL_FALLBACK_NAME_WEIGHT = 0.06;

const DEFAULT_SIMILARITY_WEIGHT_PROFILE = Object.freeze({
  final: Object.freeze({
    absolute: FINAL_ABSOLUTE_WEIGHT * 100,
    relative: FINAL_RELATIVE_WEIGHT * 100,
    weightedPlacement: FINAL_WEIGHTED_PLACEMENT_WEIGHT * 100,
    model: FINAL_MODEL_WEIGHT * 100,
    name: FINAL_NAME_WEIGHT * 100,
    regex: FINAL_REGEX_WEIGHT * 100,
  }),
  weightedPlacement: Object.freeze({
    absolute: WEIGHTED_PLACEMENT_ABSOLUTE_WEIGHT * 100,
    relative: WEIGHTED_PLACEMENT_RELATIVE_WEIGHT * 100,
  }),
  relationalFallback: Object.freeze({
    relative: RELATIONAL_FALLBACK_RELATIVE_WEIGHT * 100,
    model: RELATIONAL_FALLBACK_MODEL_WEIGHT * 100,
    absolute: RELATIONAL_FALLBACK_ABSOLUTE_WEIGHT * 100,
    name: RELATIONAL_FALLBACK_NAME_WEIGHT * 100,
  }),
  nameSupport: 0,
  regexOnly: false,
  regexOverwriteWeights: false,
  selectedRegexPresets: Object.freeze([]),
  customRegexPatterns: Object.freeze([]),
});

function cloneSimilarityWeightProfile(profile = DEFAULT_SIMILARITY_WEIGHT_PROFILE) {
  const safeProfile = profile && typeof profile === "object" ? profile : DEFAULT_SIMILARITY_WEIGHT_PROFILE;
  return {
    final: {
      absolute: clampNumber(safeProfile?.final?.absolute, {
        min: 0,
        max: 100,
        fallback: DEFAULT_SIMILARITY_WEIGHT_PROFILE.final.absolute,
      }),
      relative: clampNumber(safeProfile?.final?.relative, {
        min: 0,
        max: 100,
        fallback: DEFAULT_SIMILARITY_WEIGHT_PROFILE.final.relative,
      }),
      weightedPlacement: clampNumber(safeProfile?.final?.weightedPlacement, {
        min: 0,
        max: 100,
        fallback: DEFAULT_SIMILARITY_WEIGHT_PROFILE.final.weightedPlacement,
      }),
      model: clampNumber(safeProfile?.final?.model, {
        min: 0,
        max: 100,
        fallback: DEFAULT_SIMILARITY_WEIGHT_PROFILE.final.model,
      }),
      name: clampNumber(safeProfile?.final?.name, {
        min: 0,
        max: 100,
        fallback: DEFAULT_SIMILARITY_WEIGHT_PROFILE.final.name,
      }),
      regex: clampNumber(safeProfile?.final?.regex, {
        min: 0,
        max: 100,
        fallback: DEFAULT_SIMILARITY_WEIGHT_PROFILE.final.regex,
      }),
    },
    weightedPlacement: {
      absolute: clampNumber(safeProfile?.weightedPlacement?.absolute, {
        min: 0,
        max: 100,
        fallback: DEFAULT_SIMILARITY_WEIGHT_PROFILE.weightedPlacement.absolute,
      }),
      relative: clampNumber(safeProfile?.weightedPlacement?.relative, {
        min: 0,
        max: 100,
        fallback: DEFAULT_SIMILARITY_WEIGHT_PROFILE.weightedPlacement.relative,
      }),
    },
    relationalFallback: {
      relative: clampNumber(safeProfile?.relationalFallback?.relative, {
        min: 0,
        max: 100,
        fallback: DEFAULT_SIMILARITY_WEIGHT_PROFILE.relationalFallback.relative,
      }),
      model: clampNumber(safeProfile?.relationalFallback?.model, {
        min: 0,
        max: 100,
        fallback: DEFAULT_SIMILARITY_WEIGHT_PROFILE.relationalFallback.model,
      }),
      absolute: clampNumber(safeProfile?.relationalFallback?.absolute, {
        min: 0,
        max: 100,
        fallback: DEFAULT_SIMILARITY_WEIGHT_PROFILE.relationalFallback.absolute,
      }),
      name: clampNumber(safeProfile?.relationalFallback?.name, {
        min: 0,
        max: 100,
        fallback: DEFAULT_SIMILARITY_WEIGHT_PROFILE.relationalFallback.name,
      }),
    },
    nameSupport: clampNumber(safeProfile?.nameSupport, {
      min: 0,
      max: 100,
      fallback: DEFAULT_SIMILARITY_WEIGHT_PROFILE.nameSupport,
    }),
    regexOnly: Boolean(safeProfile?.regexOnly),
    regexOverwriteWeights: Boolean(safeProfile?.regexOverwriteWeights),
    selectedRegexPresets: normalizeTextList(safeProfile?.selectedRegexPresets),
    customRegexPatterns: normalizeTextList(safeProfile?.customRegexPatterns),
  };
}

function buildSimilarityWeightProfile(profile = null, { baseProfile = DEFAULT_SIMILARITY_WEIGHT_PROFILE } = {}) {
  const base = cloneSimilarityWeightProfile(baseProfile);
  const safeProfile = profile && typeof profile === "object" ? profile : {};
  const final = safeProfile?.final && typeof safeProfile.final === "object" ? safeProfile.final : {};
  const weightedPlacement =
    safeProfile?.weightedPlacement && typeof safeProfile.weightedPlacement === "object"
      ? safeProfile.weightedPlacement
      : {};
  const relationalFallback =
    safeProfile?.relationalFallback && typeof safeProfile.relationalFallback === "object"
      ? safeProfile.relationalFallback
      : {};
  const regexOverwriteWeights =
    safeProfile.regexOverwriteWeights ?? safeProfile.overwriteWeights ?? base.regexOverwriteWeights;
  return cloneSimilarityWeightProfile({
    final: {
      absolute: final.absolute ?? safeProfile.finalAbsolute ?? base.final.absolute,
      relative: final.relative ?? safeProfile.finalRelative ?? base.final.relative,
      weightedPlacement: final.weightedPlacement ?? safeProfile.finalWeightedPlacement ?? base.final.weightedPlacement,
      model: final.model ?? safeProfile.finalModel ?? base.final.model,
      name: final.name ?? safeProfile.finalName ?? safeProfile.nameSupport ?? base.final.name,
      regex: regexOverwriteWeights ? (final.regex ?? safeProfile.finalRegex ?? base.final.regex) : 0,
    },
    weightedPlacement: {
      absolute: weightedPlacement.absolute ?? safeProfile.weightedPlacementAbsolute ?? base.weightedPlacement.absolute,
      relative: weightedPlacement.relative ?? safeProfile.weightedPlacementRelative ?? base.weightedPlacement.relative,
    },
    relationalFallback: {
      relative:
        relationalFallback.relative ?? safeProfile.relationalFallbackRelative ?? base.relationalFallback.relative,
      model: relationalFallback.model ?? safeProfile.relationalFallbackModel ?? base.relationalFallback.model,
      absolute:
        relationalFallback.absolute ?? safeProfile.relationalFallbackAbsolute ?? base.relationalFallback.absolute,
      name:
        relationalFallback.name ??
        safeProfile.relationalFallbackName ??
        safeProfile.nameSupport ??
        base.relationalFallback.name,
    },
    nameSupport: safeProfile.nameSupport ?? base.nameSupport,
    regexOnly: safeProfile.regexOnly ?? safeProfile.preferRegexOnly ?? base.regexOnly,
    regexOverwriteWeights,
    selectedRegexPresets: safeProfile.selectedRegexPresets ?? safeProfile.regexPresets ?? base.selectedRegexPresets,
    customRegexPatterns: safeProfile.customRegexPatterns ?? safeProfile.regexPatterns ?? base.customRegexPatterns,
  });
}

function normalizeSimilarityWeightGroup(group = {}, fallbackGroup = {}) {
  const safeGroup = group && typeof group === "object" ? group : {};
  const safeFallbackGroup = fallbackGroup && typeof fallbackGroup === "object" ? fallbackGroup : {};
  const entries = Object.keys(safeFallbackGroup).map((key) => [
    key,
    clampNumber(safeGroup?.[key], {
      min: 0,
      max: 100,
      fallback: safeFallbackGroup[key] || 0,
    }),
  ]);
  const sum = entries.reduce((total, [, value]) => total + Number(value || 0), 0);
  if (sum <= 0) {
    const fallbackSum = Object.values(safeFallbackGroup).reduce((total, value) => total + Number(value || 0), 0);
    const normalizer = fallbackSum > 0 ? fallbackSum : 1;
    return Object.fromEntries(
      Object.entries(safeFallbackGroup).map(([key, value]) => [key, Number(value || 0) / normalizer])
    );
  }
  return Object.fromEntries(entries.map(([key, value]) => [key, Number(value || 0) / sum]));
}

function buildNormalizedSimilarityWeightProfile(
  profile = null,
  { baseProfile = DEFAULT_SIMILARITY_WEIGHT_PROFILE } = {}
) {
  const raw = buildSimilarityWeightProfile(profile, { baseProfile });
  return {
    final: normalizeSimilarityWeightGroup(raw.final, DEFAULT_SIMILARITY_WEIGHT_PROFILE.final),
    weightedPlacement: normalizeSimilarityWeightGroup(
      raw.weightedPlacement,
      DEFAULT_SIMILARITY_WEIGHT_PROFILE.weightedPlacement
    ),
    relationalFallback: normalizeSimilarityWeightGroup(
      raw.relationalFallback,
      DEFAULT_SIMILARITY_WEIGHT_PROFILE.relationalFallback
    ),
    nameSupport: 0,
    regexOnly: Boolean(raw.regexOnly),
    regexOverwriteWeights: Boolean(raw.regexOverwriteWeights),
    selectedRegexPresets: normalizeTextList(raw.selectedRegexPresets),
    customRegexPatterns: normalizeTextList(raw.customRegexPatterns),
  };
}

function similarityWeightProfileFingerprint(profile = null) {
  return JSON.stringify(buildSimilarityWeightProfile(profile));
}

export {
  DEFAULT_SIMILARITY_WEIGHT_PROFILE,
  buildNormalizedSimilarityWeightProfile,
  buildSimilarityWeightProfile,
  similarityWeightProfileFingerprint,
};
