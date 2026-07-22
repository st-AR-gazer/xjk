import { normalizeWhitespace, toText } from "./baseText.js";
import {
  BOSS_SEASONAL_PATTERN_1,
  BOSS_SEASONAL_PATTERN_2,
  BOSS_SEASONAL_PATTERN_3,
  MAPNUMBER_COLOR_RANGES,
  SEASONAL_COLOR_COMBINED_PATTERN,
  TRAINING_COLOR_COMBINED_PATTERN,
  TRAINING_DEFAULT_YEAR,
  TRAINING_MULTI_PAIR_PREFIX_PATTERN,
  TRAINING_MULTI_PAIR_SUFFIX_PATTERN,
  TRAINING_MULTI_RANGE_PATTERN,
  TRAINING_MULTI_SNOW_WOOD_PATTERN,
  TRAINING_MULTI_SURFACELESS_16171819_PATTERN,
  TRAINING_MULTI_WET_ICY_PLASTIC_PAIR_PATTERN,
  TRAINING_MULTI_WET_ICY_WOOD_PATTERN,
  TRAINING_MULTI_WET_PLASTIC_PAIR_PATTERN,
  TRAINING_MULTI_WET_WOOD_PAIR_PATTERN,
  TRAINING_NUMBER_BEFORE_DASH_PATTERN,
  TRAINING_PREFIX_BEFORE_SEASON_PATTERN,
  TRAINING_PREFIX_PATTERN,
  TRAINING_TAIL_BEFORE_DASH_PATTERN,
} from "./standardizerData.js";
import {
  normalizeAlterationFields,
  normalizeMapNumber,
  normalizeSeason,
  normalizeYear,
  parseAlterationTail,
  sanitizeMapName,
  uniqueLower,
} from "./normalization.js";

function normalizeTrainingYear(year) {
  const text = toText(year);
  if (!text) return TRAINING_DEFAULT_YEAR;
  const normalized = normalizeYear(text);
  if (normalized) return normalized;
  return TRAINING_DEFAULT_YEAR;
}

function normalizeTrainingMapNumbers(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = normalizeMapNumber(value);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeColorRange(color) {
  return normalizeTrainingMapNumbers(MAPNUMBER_COLOR_RANGES.get(toText(color).toLowerCase()) || []);
}

function normalizeTrainingAlterationFields(parts = []) {
  const out = [];
  let carType = null;
  for (const part of parts) {
    if (!part) continue;
    const parsed = parseAlterationTail(part);
    out.push(...parsed.alterations);
    carType ||= parsed.carType;
  }
  return normalizeAlterationFields(uniqueLower(out).join(" + "), { carType });
}

function buildColorMappedProposedName(value = "") {
  return sanitizeMapName(value) || null;
}

function parseColorMappedFields(sanitizedName) {
  const name = normalizeWhitespace(toText(sanitizedName));
  if (!name) return null;

  const seasonalCombinedMatch = name.match(SEASONAL_COLOR_COMBINED_PATTERN);
  if (seasonalCombinedMatch?.groups) {
    const season = normalizeSeason(seasonalCombinedMatch.groups.season);
    const year = normalizeYear(seasonalCombinedMatch.groups.year);
    const mapNumbers = normalizeColorRange(seasonalCombinedMatch.groups.color);
    if (season && year && mapNumbers.length) {
      const alterationFields = normalizeTrainingAlterationFields([seasonalCombinedMatch.groups.tail]);
      return {
        season,
        year,
        mapNumbers,
        ...alterationFields,
        parserPattern: "seasonal-color-combined",
        proposedName: buildColorMappedProposedName(name),
      };
    }
  }

  const bossPatterns = [
    { pattern: BOSS_SEASONAL_PATTERN_1, parserPattern: "boss-color-prefix-apostrophe-year" },
    { pattern: BOSS_SEASONAL_PATTERN_2, parserPattern: "boss-of-season-year" },
    { pattern: BOSS_SEASONAL_PATTERN_3, parserPattern: "boss-color-prefix-year" },
  ];

  for (const entry of bossPatterns) {
    const match = name.match(entry.pattern);
    if (!match?.groups) continue;
    const season = normalizeSeason(match.groups.season);
    const year = normalizeYear(match.groups.year);
    const mapNumbers = normalizeColorRange(match.groups.color);
    if (!season || !year || !mapNumbers.length) continue;
    const alterationFields = normalizeTrainingAlterationFields([match.groups.tail]);
    return {
      season,
      year,
      mapNumbers,
      ...alterationFields,
      parserPattern: entry.parserPattern,
      proposedName: buildColorMappedProposedName(name),
    };
  }

  return null;
}

function parseTrainingFields(sanitizedName) {
  const name = normalizeWhitespace(toText(sanitizedName));
  if (!name) return null;

  const colorMatch = name.match(TRAINING_COLOR_COMBINED_PATTERN);
  if (colorMatch?.groups?.color) {
    const mapNumbers = normalizeColorRange(colorMatch.groups.color);
    if (mapNumbers.length) {
      const alterationFields = normalizeTrainingAlterationFields(["Combined"]);
      return {
        season: "Training",
        year: normalizeTrainingYear(null),
        mapNumbers,
        ...alterationFields,
        parserPattern: "training-color-combined",
        proposedName: buildColorMappedProposedName(name),
      };
    }
  }

  const multiPatterns = [
    {
      parserPattern: "training-mixed-range",
      pattern: TRAINING_MULTI_RANGE_PATTERN,
      mapKeys: ["map1", "map2"],
      tailKeys: ["alteration"],
    },
    {
      parserPattern: "training-plastic-pair-prefix",
      pattern: TRAINING_MULTI_PAIR_PREFIX_PATTERN,
      mapKeys: ["map1", "map2"],
      tailKeys: ["alteration"],
    },
    {
      parserPattern: "training-pair-wood-suffix",
      pattern: TRAINING_MULTI_PAIR_SUFFIX_PATTERN,
      mapKeys: ["map1", "map2"],
      tailKeys: ["tail"],
    },
    {
      parserPattern: "training-surfaceless-16171819",
      pattern: TRAINING_MULTI_SURFACELESS_16171819_PATTERN,
      mapKeys: ["map1", "map2", "map3", "map4"],
      tailKeys: ["tail"],
    },
    {
      parserPattern: "training-snow-wood-pair",
      pattern: TRAINING_MULTI_SNOW_WOOD_PATTERN,
      mapKeys: ["map1", "map2"],
      tailKeys: ["tail1", "tail2"],
    },
    {
      parserPattern: "training-wet-plastic-pair",
      pattern: TRAINING_MULTI_WET_PLASTIC_PAIR_PATTERN,
      mapKeys: ["map1", "map2"],
      tailKeys: ["tail"],
    },
    {
      parserPattern: "training-wet-wood-pair",
      pattern: TRAINING_MULTI_WET_WOOD_PAIR_PATTERN,
      mapKeys: ["map1", "map2"],
      tailKeys: ["tail"],
    },
    {
      parserPattern: "training-wet-icy-wood-21222324",
      pattern: TRAINING_MULTI_WET_ICY_WOOD_PATTERN,
      mapKeys: ["map1", "map2", "map3", "map4"],
      tailKeys: ["tail"],
    },
    {
      parserPattern: "training-wet-icy-plastic-pair",
      pattern: TRAINING_MULTI_WET_ICY_PLASTIC_PAIR_PATTERN,
      mapKeys: ["map1", "map2"],
      tailKeys: ["tail"],
    },
  ];

  for (const entry of multiPatterns) {
    const match = name.match(entry.pattern);
    if (!match?.groups) continue;
    const mapNumbers = normalizeTrainingMapNumbers(entry.mapKeys.map((key) => match.groups[key]));
    if (!mapNumbers.length) continue;
    const tails = entry.tailKeys.map((key) => match.groups[key]).filter(Boolean);
    const alterationFields = normalizeTrainingAlterationFields(tails);
    return {
      season: "Training",
      year: normalizeTrainingYear(null),
      mapNumbers,
      ...alterationFields,
      parserPattern: entry.parserPattern,
    };
  }

  const beforeSeasonMatch = name.match(TRAINING_PREFIX_BEFORE_SEASON_PATTERN);
  if (beforeSeasonMatch?.groups?.map) {
    const mapNumbers = normalizeTrainingMapNumbers([beforeSeasonMatch.groups.map]);
    if (mapNumbers.length) {
      const alterationFields = normalizeTrainingAlterationFields([
        beforeSeasonMatch.groups.tail,
        beforeSeasonMatch.groups.postTail,
      ]);
      return {
        season: "Training",
        year: normalizeTrainingYear(null),
        mapNumbers,
        ...alterationFields,
        parserPattern: "training-prefix-before-season",
      };
    }
  }

  const prefixMatch = name.match(TRAINING_PREFIX_PATTERN);
  if (prefixMatch?.groups?.map) {
    const mapNumbers = normalizeTrainingMapNumbers([prefixMatch.groups.map]);
    const tail = toText(prefixMatch.groups.tail || "")
      .replace(/^[\s|:-]+/, "")
      .trim();
    if (mapNumbers.length) {
      const alterationFields = normalizeTrainingAlterationFields([tail]);
      return {
        season: "Training",
        year: normalizeTrainingYear(null),
        mapNumbers,
        ...alterationFields,
        parserPattern: "training-prefix",
      };
    }
  }

  const numberBeforeDashMatch = name.match(TRAINING_NUMBER_BEFORE_DASH_PATTERN);
  if (numberBeforeDashMatch?.groups?.map) {
    const mapNumbers = normalizeTrainingMapNumbers([numberBeforeDashMatch.groups.map]);
    if (mapNumbers.length) {
      const alterationFields = normalizeTrainingAlterationFields([numberBeforeDashMatch.groups.tail]);
      return {
        season: "Training",
        year: normalizeTrainingYear(null),
        mapNumbers,
        ...alterationFields,
        parserPattern: "training-number-before-dash",
      };
    }
  }

  const tailBeforeDashMatch = name.match(TRAINING_TAIL_BEFORE_DASH_PATTERN);
  if (tailBeforeDashMatch?.groups?.map) {
    const mapNumbers = normalizeTrainingMapNumbers([tailBeforeDashMatch.groups.map]);
    if (mapNumbers.length) {
      const alterationFields = normalizeTrainingAlterationFields([tailBeforeDashMatch.groups.tail]);
      return {
        season: "Training",
        year: normalizeTrainingYear(null),
        mapNumbers,
        ...alterationFields,
        parserPattern: "training-tail-before-dash",
      };
    }
  }

  return null;
}

export { parseColorMappedFields, parseTrainingFields };
