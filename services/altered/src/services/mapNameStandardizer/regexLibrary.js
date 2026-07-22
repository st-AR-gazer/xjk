import { ALTERATION_REGEX_BEHAVIOR, LEGACY_ALTERATION_REGEX_CATALOG } from "../legacyAlterationRegexCatalog.js";
import {
  BOSS_SEASONAL_PATTERN_1,
  BOSS_SEASONAL_PATTERN_2,
  BOSS_SEASONAL_PATTERN_3,
  SEASONAL_COLOR_COMBINED_PATTERN,
  TRAINING_COLOR_COMBINED_PATTERN,
  TRAINING_MULTI_PAIR_PREFIX_PATTERN,
  TRAINING_MULTI_PAIR_SUFFIX_PATTERN,
  TRAINING_MULTI_RANGE_PATTERN,
  TRAINING_MULTI_SNOW_WOOD_PATTERN,
  TRAINING_MULTI_SURFACELESS_16171819_PATTERN,
  TRAINING_MULTI_WET_ICY_PLASTIC_PAIR_PATTERN,
  TRAINING_MULTI_WET_ICY_WOOD_PATTERN,
  TRAINING_MULTI_WET_PLASTIC_PAIR_PATTERN,
  TRAINING_MULTI_WET_WOOD_PAIR_PATTERN,
} from "./standardizerData.js";

function toAlterationSlug(value = "") {
  return String(value || "")
    .trim()
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cloneKnownRegexEntry(entry = {}) {
  return {
    label: String(entry?.label || entry?.parserPattern || entry?.legacyPatternId || "Regex").trim(),
    parserPattern: String(entry?.parserPattern || "").trim(),
    legacyPatternId: String(entry?.legacyPatternId || "").trim(),
    pattern: String(entry?.pattern || "").trim(),
  };
}

function getCurrentAlterationRegexCatalog() {
  return {
    [toAlterationSlug("Combined")]: [
      {
        label: "Seasonal color combined",
        parserPattern: "seasonal-color-combined",
        pattern: SEASONAL_COLOR_COMBINED_PATTERN.toString(),
      },
      {
        label: "Training color combined",
        parserPattern: "training-color-combined",
        pattern: TRAINING_COLOR_COMBINED_PATTERN.toString(),
      },
    ],
    [toAlterationSlug("Mixed")]: [
      {
        label: "Training mixed range",
        parserPattern: "training-mixed-range",
        pattern: TRAINING_MULTI_RANGE_PATTERN.toString(),
      },
    ],
    [toAlterationSlug("Plastic")]: [
      {
        label: "Training plastic pair prefix",
        parserPattern: "training-plastic-pair-prefix",
        pattern: TRAINING_MULTI_PAIR_PREFIX_PATTERN.toString(),
      },
      {
        label: "Training wet plastic pair",
        parserPattern: "training-wet-plastic-pair",
        pattern: TRAINING_MULTI_WET_PLASTIC_PAIR_PATTERN.toString(),
      },
      {
        label: "Training wet icy plastic pair",
        parserPattern: "training-wet-icy-plastic-pair",
        pattern: TRAINING_MULTI_WET_ICY_PLASTIC_PAIR_PATTERN.toString(),
      },
    ],
    [toAlterationSlug("Wood")]: [
      {
        label: "Training pair wood suffix",
        parserPattern: "training-pair-wood-suffix",
        pattern: TRAINING_MULTI_PAIR_SUFFIX_PATTERN.toString(),
      },
      {
        label: "Training snow wood pair",
        parserPattern: "training-snow-wood-pair",
        pattern: TRAINING_MULTI_SNOW_WOOD_PATTERN.toString(),
      },
      {
        label: "Training wet wood pair",
        parserPattern: "training-wet-wood-pair",
        pattern: TRAINING_MULTI_WET_WOOD_PAIR_PATTERN.toString(),
      },
      {
        label: "Training wet icy wood 21-24",
        parserPattern: "training-wet-icy-wood-21222324",
        pattern: TRAINING_MULTI_WET_ICY_WOOD_PATTERN.toString(),
      },
    ],
    [toAlterationSlug("Snow")]: [
      {
        label: "Training snow wood pair",
        parserPattern: "training-snow-wood-pair",
        pattern: TRAINING_MULTI_SNOW_WOOD_PATTERN.toString(),
      },
    ],
    [toAlterationSlug("Wet")]: [
      {
        label: "Training wet plastic pair",
        parserPattern: "training-wet-plastic-pair",
        pattern: TRAINING_MULTI_WET_PLASTIC_PAIR_PATTERN.toString(),
      },
      {
        label: "Training wet wood pair",
        parserPattern: "training-wet-wood-pair",
        pattern: TRAINING_MULTI_WET_WOOD_PAIR_PATTERN.toString(),
      },
      {
        label: "Training wet icy wood 21-24",
        parserPattern: "training-wet-icy-wood-21222324",
        pattern: TRAINING_MULTI_WET_ICY_WOOD_PATTERN.toString(),
      },
      {
        label: "Training wet icy plastic pair",
        parserPattern: "training-wet-icy-plastic-pair",
        pattern: TRAINING_MULTI_WET_ICY_PLASTIC_PAIR_PATTERN.toString(),
      },
    ],
    [toAlterationSlug("Icy")]: [
      {
        label: "Training wet icy wood 21-24",
        parserPattern: "training-wet-icy-wood-21222324",
        pattern: TRAINING_MULTI_WET_ICY_WOOD_PATTERN.toString(),
      },
      {
        label: "Training wet icy plastic pair",
        parserPattern: "training-wet-icy-plastic-pair",
        pattern: TRAINING_MULTI_WET_ICY_PLASTIC_PAIR_PATTERN.toString(),
      },
    ],
    [toAlterationSlug("Ice")]: [
      {
        label: "Training wet icy wood 21-24",
        parserPattern: "training-wet-icy-wood-21222324",
        pattern: TRAINING_MULTI_WET_ICY_WOOD_PATTERN.toString(),
      },
      {
        label: "Training wet icy plastic pair",
        parserPattern: "training-wet-icy-plastic-pair",
        pattern: TRAINING_MULTI_WET_ICY_PLASTIC_PAIR_PATTERN.toString(),
      },
    ],
    [toAlterationSlug("Surfaceless")]: [
      {
        label: "Training surfaceless 16-19",
        parserPattern: "training-surfaceless-16171819",
        pattern: TRAINING_MULTI_SURFACELESS_16171819_PATTERN.toString(),
      },
    ],
    [toAlterationSlug("Boss")]: [
      {
        label: "Boss color prefix apostrophe year",
        parserPattern: "boss-color-prefix-apostrophe-year",
        pattern: BOSS_SEASONAL_PATTERN_1.toString(),
      },
      {
        label: "Boss of season year",
        parserPattern: "boss-of-season-year",
        pattern: BOSS_SEASONAL_PATTERN_2.toString(),
      },
      {
        label: "Boss color prefix year",
        parserPattern: "boss-color-prefix-year",
        pattern: BOSS_SEASONAL_PATTERN_3.toString(),
      },
    ],
  };
}

const ALTERATION_REGEX_LIBRARY_ALIAS_MAP = Object.freeze({
  [toAlterationSlug("Colour Combined")]: [toAlterationSlug("Combined")],
});

function buildKnownAlterationRegexLibrary() {
  const merged = new Map();
  const appendCatalog = (catalog = {}, { keepExisting = true } = {}) => {
    Object.entries(catalog || {}).forEach(([rawSlug, rawValue]) => {
      const entries = Array.isArray(rawValue) ? rawValue : Array.isArray(rawValue?.entries) ? rawValue.entries : [];
      if (!entries.length) return;
      const safeSlug = toAlterationSlug(rawSlug);
      const aliases = ALTERATION_REGEX_LIBRARY_ALIAS_MAP[safeSlug] || [];
      const targetSlugs = [safeSlug, ...aliases].filter(Boolean);
      targetSlugs.forEach((targetSlug) => {
        if (!keepExisting && merged.has(targetSlug)) return;
        const bucket = merged.get(targetSlug) || [];
        const seen = new Set(
          bucket.map(
            (entry) =>
              `${String(entry?.parserPattern || "")
                .trim()
                .toLowerCase()}|${String(entry?.legacyPatternId || "")
                .trim()
                .toLowerCase()}|${String(entry?.pattern || "")
                .trim()
                .toLowerCase()}`
          )
        );
        entries.forEach((entry) => {
          const safeEntry = cloneKnownRegexEntry(entry);
          const dedupeKey = `${safeEntry.parserPattern.toLowerCase()}|${safeEntry.legacyPatternId.toLowerCase()}|${safeEntry.pattern.toLowerCase()}`;
          if (!safeEntry.pattern || seen.has(dedupeKey)) return;
          seen.add(dedupeKey);
          bucket.push(safeEntry);
        });
        merged.set(targetSlug, bucket);
      });
    });
  };
  appendCatalog(LEGACY_ALTERATION_REGEX_CATALOG);
  appendCatalog(getCurrentAlterationRegexCatalog(), { keepExisting: false });
  return Object.freeze(
    Object.fromEntries(
      [...merged.entries()]
        .sort((left, right) => String(left[0]).localeCompare(String(right[0]), undefined, { sensitivity: "base" }))
        .map(([slug, entries]) => [slug, Object.freeze(entries)])
    )
  );
}

const KNOWN_ALTERATION_REGEX_LIBRARY = buildKnownAlterationRegexLibrary();
const KNOWN_ALTERATION_REGEX_BEHAVIOR = Object.freeze(ALTERATION_REGEX_BEHAVIOR);

function listKnownAlterationRegexLibrary() {
  return KNOWN_ALTERATION_REGEX_LIBRARY;
}

function listKnownAlterationRegexBehavior() {
  return KNOWN_ALTERATION_REGEX_BEHAVIOR;
}

export { listKnownAlterationRegexBehavior, listKnownAlterationRegexLibrary };
