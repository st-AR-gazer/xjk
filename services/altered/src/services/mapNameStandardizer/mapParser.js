import { toText } from "./baseText.js";
import {
  LEADING_MAP_NUMBER_PATTERN,
  MAP_NUMBER_AFTER_SEASON_PATTERN,
  MAP_NUMBER_AFTER_YEAR_PATTERN,
  SEASONAL_PREFIX_PATTERN,
  SEASONAL_SUFFIX_PATTERN,
  SPRING_2020_CODE_PATTERN,
  TOTD_DAY_PREFIX_PATTERN,
} from "./standardizerData.js";
import { parseSpring2020Code } from "./namingFormatters.js";
import {
  normalizeAlterationFields,
  normalizeMapNumber,
  normalizeSeason,
  normalizeYear,
  sanitizeMapName,
  uniqueLower,
} from "./normalization.js";
import { parseColorMappedFields, parseTrainingFields } from "./trainingParser.js";

function extractMapNumberFromText(rawValue, { season = null, year = null } = {}) {
  const mapNumbers = extractMapNumbersFromText(rawValue, { season, year });
  return mapNumbers[0] || null;
}

function extractMapNumbersFromText(rawValue, { season = null, year = null } = {}) {
  const sanitizedName = sanitizeMapName(rawValue);
  if (!sanitizedName) return [];

  const totdDayMatch = sanitizedName.match(TOTD_DAY_PREFIX_PATTERN);
  if (totdDayMatch?.groups?.day) {
    const parsedYear = normalizeYear(totdDayMatch.groups.year);
    const day = normalizeMapNumber(totdDayMatch.groups.day);
    if (day && (!year || !parsedYear || parsedYear === year)) {
      return [day];
    }
  }

  const training = parseTrainingFields(sanitizedName);
  if (training?.mapNumbers?.length) {
    if (season && training.season && training.season !== season) return [];
    if (year && training.year && training.year !== year) return [];
    return training.mapNumbers;
  }

  const parsed = parseStandardizedFields(sanitizedName);
  if (Array.isArray(parsed?.mapNumbers) && parsed.mapNumbers.length) return parsed.mapNumbers;
  if (parsed?.mapNumber) return [parsed.mapNumber];

  const seasonMatch = sanitizedName.match(MAP_NUMBER_AFTER_SEASON_PATTERN);
  if (seasonMatch?.groups?.map) {
    const parsedSeason = normalizeSeason(seasonMatch.groups.season);
    const mapNumber = normalizeMapNumber(seasonMatch.groups.map);
    if (mapNumber && (!season || !parsedSeason || parsedSeason === season)) {
      return [mapNumber];
    }
  }

  const yearMatch = sanitizedName.match(MAP_NUMBER_AFTER_YEAR_PATTERN);
  if (yearMatch?.groups?.map) {
    const parsedYear = normalizeYear(yearMatch.groups.year);
    const mapNumber = normalizeMapNumber(yearMatch.groups.map);
    if (mapNumber && (!year || !parsedYear || parsedYear === year)) {
      return [mapNumber];
    }
  }

  const spring2020Match = sanitizedName.match(SPRING_2020_CODE_PATTERN);
  if (spring2020Match?.groups?.code) {
    const decoded = parseSpring2020Code(spring2020Match.groups.code);
    if (decoded?.mapNumber) return [decoded.mapNumber];
  }

  const leadingMapMatch = sanitizedName.match(LEADING_MAP_NUMBER_PATTERN);
  if (leadingMapMatch?.groups?.map) {
    const mapNumber = normalizeMapNumber(leadingMapMatch.groups.map);
    if (mapNumber) return [mapNumber];
  }

  return [];
}

function deriveMapNumbers({
  mapName = "",
  filename = "",
  campaignName = "",
  slot = null,
  campaignMapCount = null,
  season = null,
  year = null,
} = {}) {
  const candidates = [
    { values: extractMapNumbersFromText(mapName, { season, year }), source: "map-name-regex" },
    { values: extractMapNumbersFromText(filename, { season, year }), source: "filename-regex" },
    { values: extractMapNumbersFromText(campaignName, { season, year }), source: "campaign-regex" },
  ].filter((item) => item.values.length);

  let source = candidates[0]?.source || "";
  const values = candidates.flatMap((item) => item.values);

  if (!values.length) {
    const normalizedCampaignMapCount = normalizeMapNumber(campaignMapCount);
    const fallbackSlot = normalizeMapNumber(slot);
    if (normalizedCampaignMapCount === 25 && fallbackSlot) {
      values.push(fallbackSlot);
      source = "campaign-slot-fallback-25";
    }
  }

  return {
    mapNumbers: uniqueLower(values)
      .map((value) => normalizeMapNumber(value))
      .filter(Boolean),
    source,
    usedSlotFallback: source === "campaign-slot-fallback-25",
  };
}

function parseStandardizedFields(rawName) {
  const sanitizedName = sanitizeMapName(rawName);
  const defaultOut = {
    sanitizedName,
    parserPattern: "",
    season: null,
    year: null,
    mapNumber: null,
    mapNumbers: [],
    alterationMix: [],
    alterations: [],
    carType: null,
    proposedName: null,
  };
  if (!sanitizedName) return defaultOut;

  const prefixMatch = sanitizedName.match(SEASONAL_PREFIX_PATTERN);
  if (prefixMatch?.groups) {
    const season = normalizeSeason(prefixMatch.groups.season);
    const year = normalizeYear(prefixMatch.groups.year);
    const mapNumber = normalizeMapNumber(prefixMatch.groups.map);
    const alterationFields = normalizeAlterationFields(prefixMatch.groups.tail || "");
    return {
      sanitizedName,
      parserPattern: "season-year-map-prefix",
      season,
      year,
      mapNumber,
      mapNumbers: mapNumber ? [mapNumber] : [],
      ...alterationFields,
      proposedName: null,
    };
  }

  const suffixMatch = sanitizedName.match(SEASONAL_SUFFIX_PATTERN);
  if (suffixMatch?.groups) {
    const season = normalizeSeason(suffixMatch.groups.season);
    const year = normalizeYear(suffixMatch.groups.year);
    const mapNumber = normalizeMapNumber(suffixMatch.groups.map);
    const alterationFields = normalizeAlterationFields(suffixMatch.groups.tail || "");
    return {
      sanitizedName,
      parserPattern: "season-year-map-suffix",
      season,
      year,
      mapNumber,
      mapNumbers: mapNumber ? [mapNumber] : [],
      ...alterationFields,
      proposedName: null,
    };
  }

  const springCodeMatch = sanitizedName.match(SPRING_2020_CODE_PATTERN);
  if (springCodeMatch?.groups?.code) {
    const decoded = parseSpring2020Code(springCodeMatch.groups.code);
    if (decoded) {
      const alterationFields = normalizeAlterationFields(springCodeMatch.groups.tail || "");
      return {
        sanitizedName,
        parserPattern: "spring-2020-code",
        season: decoded.season,
        year: decoded.year,
        mapNumber: decoded.mapNumber,
        mapNumbers: decoded.mapNumber ? [decoded.mapNumber] : [],
        ...alterationFields,
        proposedName: null,
      };
    }
  }

  const colorMapped = parseColorMappedFields(sanitizedName);
  if (colorMapped?.mapNumbers?.length) {
    return {
      sanitizedName,
      parserPattern: colorMapped.parserPattern,
      season: colorMapped.season,
      year: colorMapped.year,
      mapNumber: colorMapped.mapNumbers[0] || null,
      mapNumbers: colorMapped.mapNumbers,
      alteration: colorMapped.alteration || null,
      alterationMix: colorMapped.alterationMix,
      alterations: colorMapped.alterations || colorMapped.alterationMix || [],
      carType: colorMapped.carType || null,
      proposedName: colorMapped.proposedName || null,
    };
  }

  const training = parseTrainingFields(sanitizedName);
  if (training?.mapNumbers?.length) {
    return {
      sanitizedName,
      parserPattern: training.parserPattern,
      season: training.season,
      year: training.year,
      mapNumber: training.mapNumbers[0] || null,
      mapNumbers: training.mapNumbers,
      alteration: training.alteration || null,
      alterationMix: training.alterationMix,
      alterations: training.alterations || training.alterationMix || [],
      carType: training.carType || null,
      proposedName: training.proposedName || null,
    };
  }

  return defaultOut;
}

function requiresColorMappedRegexWarningText(value = "") {
  const text = sanitizeMapName(value);
  if (!text) return "";
  const hasColor = /\b(?:white|green|blue|red|black)\b/i.test(text);
  if (!hasColor) return "";
  if (/\bcombined\b/i.test(text) && /\b(?:winter|spring|summer|fall|autumn|training|wi|sp|su|fa)\b/i.test(text)) {
    return "Looks like a color-set Combined map, but regex did not resolve its slot range.";
  }
  if (/\bboss\b/i.test(text) && /\b(?:winter|spring|summer|fall|autumn|training|wi|sp|su|fa)\b/i.test(text)) {
    return "Looks like a color-set BOSS map, but regex did not resolve its slot range.";
  }
  return "";
}

function deriveParserWarning({ mapName = "", filename = "", campaignName = "", parserPattern = "" } = {}) {
  const normalizedPattern = toText(parserPattern).toLowerCase();
  if (normalizedPattern.includes("color-combined") || normalizedPattern.includes("boss-")) {
    return null;
  }

  for (const value of [mapName, filename, campaignName]) {
    const warning = requiresColorMappedRegexWarningText(value);
    if (warning) return warning;
  }

  return null;
}

export {
  deriveMapNumbers,
  deriveParserWarning,
  extractMapNumberFromText,
  extractMapNumbersFromText,
  parseStandardizedFields,
};
