import { normalizeAliasValue, normalizeWhitespace, toText } from "./baseText.js";
import {
  COMPETITION_CAMPAIGN_ALIAS_BY_NAME,
  ENVIRONMENT_BY_TOKEN,
  SEASON_BY_TOKEN,
  SPECIAL_CAMPAIGN_BY_TOKEN,
  TOTD_DAY_PREFIX_PATTERN,
  TOTD_MONTH_PATTERN,
  TYPE_BY_TOKEN,
} from "./standardizerData.js";
import {
  carTypeFromSpecialCampaign,
  matchAliasFromTokens,
  normalizeAlterationFields,
  normalizeCompetitionType,
  normalizeMapNumber,
  normalizeSeason,
  normalizeYear,
  sanitizeMapName,
  tokenizeCampaignName,
} from "./normalization.js";
import { formatCampaignAlterationLabel } from "./namingFormatters.js";

function parseCompetitionCampaignStandardizedFields(rawCampaignName) {
  const sanitizedName = sanitizeMapName(rawCampaignName);
  if (!sanitizedName) return null;

  const aliasMatch = COMPETITION_CAMPAIGN_ALIAS_BY_NAME.get(normalizeAliasValue(sanitizedName)) || null;
  if (aliasMatch) {
    const alterationFields = normalizeAlterationFields(aliasMatch.alteration || "");
    return {
      sanitizedName,
      parserPattern: "competition-campaign-alias",
      season: aliasMatch.season || null,
      year: aliasMatch.year || null,
      ...alterationFields,
      type: aliasMatch.type || null,
      environment: null,
      carType: null,
      special: aliasMatch.season ? null : aliasMatch.type || null,
    };
  }

  const compactMatch = sanitizedName.match(
    /^(?<type>tmgl|tmwt)\s+(?<season>wi|sp|su|fa|winter|spring|summer|fall|autumn)\s*(?<year>\d{2,4})(?:\s+(?<tail>.+))?$/i
  );
  if (compactMatch?.groups) {
    const type = normalizeCompetitionType(compactMatch.groups.type);
    const season = normalizeSeason(compactMatch.groups.season);
    const year = normalizeYear(compactMatch.groups.year);
    const alteration = formatCampaignAlterationLabel(compactMatch.groups.tail || "");
    const alterationFields = normalizeAlterationFields(compactMatch.groups.tail || "", {
      fallbackAlteration: alteration,
    });
    if (type && season && year) {
      return {
        sanitizedName,
        parserPattern: "competition-campaign-compact",
        season,
        year,
        ...alterationFields,
        type,
        environment: null,
        carType: alterationFields.carType || null,
        special: null,
      };
    }
  }

  const fullMatch = sanitizedName.match(
    /^(?<type>tmgl|tmwt)\s*(?:-\s*)?(?<season>winter|spring|summer|fall|autumn)\s+(?<year>\d{2,4})(?:\s+(?<tail>.+))?$/i
  );
  if (fullMatch?.groups) {
    const type = normalizeCompetitionType(fullMatch.groups.type);
    const season = normalizeSeason(fullMatch.groups.season);
    const year = normalizeYear(fullMatch.groups.year);
    const alteration = formatCampaignAlterationLabel(fullMatch.groups.tail || "");
    const alterationFields = normalizeAlterationFields(fullMatch.groups.tail || "", {
      fallbackAlteration: alteration,
    });
    if (type && season && year) {
      return {
        sanitizedName,
        parserPattern: "competition-campaign-full",
        season,
        year,
        ...alterationFields,
        type,
        environment: null,
        carType: alterationFields.carType || null,
        special: null,
      };
    }
  }

  const tmwcMatch = sanitizedName.match(/^(?<type>tmwc)\s*(?:-\s*)?(?<year>\d{2,4})(?:\s+(?<tail>.+))?$/i);
  if (tmwcMatch?.groups) {
    const type = normalizeCompetitionType(tmwcMatch.groups.type);
    const year = normalizeYear(tmwcMatch.groups.year);
    const alteration = formatCampaignAlterationLabel(tmwcMatch.groups.tail || "");
    const alterationFields = normalizeAlterationFields(tmwcMatch.groups.tail || "", {
      fallbackAlteration: alteration,
    });
    if (type && year) {
      return {
        sanitizedName,
        parserPattern: "competition-campaign-year-only",
        season: null,
        year,
        ...alterationFields,
        type,
        environment: null,
        carType: alterationFields.carType || null,
        special: type,
      };
    }
  }

  return null;
}

function parseCompetitionMapAlterationFields(rawName) {
  const sanitizedName = sanitizeMapName(rawName);
  if (!sanitizedName) return null;

  const easyModeMatch = sanitizedName.match(/^(?<title>.+?)\s+\[(?<tail>easy mode)\]$/i);
  if (easyModeMatch?.groups) {
    const alterationFields = normalizeAlterationFields(easyModeMatch.groups.tail);
    return {
      sanitizedName,
      canonicalTitle: sanitizeMapName(easyModeMatch.groups.title) || sanitizedName,
      ...alterationFields,
      parserPattern: "competition-map-easy-mode",
    };
  }

  const podiumMatch = sanitizedName.match(/^(?<title>.+?)\s+-\s+(?<tail>podium)$/i);
  if (podiumMatch?.groups) {
    const alterationFields = normalizeAlterationFields(podiumMatch.groups.tail);
    return {
      sanitizedName,
      canonicalTitle: sanitizeMapName(podiumMatch.groups.title) || sanitizedName,
      ...alterationFields,
      parserPattern: "competition-map-podium",
    };
  }

  return null;
}

function parseCampaignStandardizedFields(rawCampaignName, { startTimestamp = null } = {}) {
  const sanitizedName = sanitizeMapName(rawCampaignName);
  const defaultOut = {
    sanitizedName,
    parserPattern: "",
    season: null,
    year: null,
    month: null,
    day: null,
    alteration: null,
    alterationMix: [],
    alterations: [],
    type: null,
    environment: null,
    carType: null,
    special: null,
  };
  if (!sanitizedName) return defaultOut;

  const totdMonthMatch = sanitizedName.match(TOTD_MONTH_PATTERN);
  if (totdMonthMatch?.groups) {
    const year = normalizeYear(totdMonthMatch.groups.year);
    const month = normalizeMapNumber(totdMonthMatch.groups.month);
    if (year && month && month >= 1 && month <= 12) {
      return {
        ...defaultOut,
        parserPattern: "campaign-totd-month",
        year,
        month,
        special: "TOTD",
      };
    }
  }

  const totdDayMatch = sanitizedName.match(TOTD_DAY_PREFIX_PATTERN);
  if (totdDayMatch?.groups) {
    const year = normalizeYear(totdDayMatch.groups.year);
    const month = normalizeMapNumber(totdDayMatch.groups.month);
    const day = normalizeMapNumber(totdDayMatch.groups.day);
    if (year && month && month >= 1 && month <= 12 && day && day >= 1 && day <= 31) {
      return {
        ...defaultOut,
        parserPattern: "campaign-totd-day-prefix",
        year,
        month,
        day,
        special: "TOTD",
      };
    }
  }

  const competitionMatch = parseCompetitionCampaignStandardizedFields(sanitizedName);
  if (competitionMatch) {
    return competitionMatch;
  }

  const tokens = tokenizeCampaignName(sanitizedName);
  if (!tokens.length) return defaultOut;

  const specialMatch = matchAliasFromTokens(tokens, SPECIAL_CAMPAIGN_BY_TOKEN);
  if (specialMatch) {
    const remaining = tokens.slice(specialMatch.consumed);
    const environmentMatch = matchAliasFromTokens(remaining, ENVIRONMENT_BY_TOKEN);
    const environment =
      (environmentMatch ? environmentMatch.value : null) || carTypeFromSpecialCampaign(specialMatch.value.label);
    const afterEnvironment = remaining.slice(environmentMatch ? environmentMatch.consumed : 0);
    const typeMatch = matchAliasFromTokens(afterEnvironment, TYPE_BY_TOKEN);
    const alterationTail = afterEnvironment.slice(typeMatch ? typeMatch.consumed : 0).join(" ");
    const startYear = normalizeYear(new Date(startTimestamp || "").getUTCFullYear());
    const year = specialMatch.value.defaultYear || startYear || null;
    const weeklyIndexOnly =
      (specialMatch.value.label === "Weekly Shorts" || specialMatch.value.label === "Weekly Grands") &&
      /^\d{1,3}$/.test(normalizeWhitespace(alterationTail || ""));
    const ignorableTail = /^(?:old)$/i.test(normalizeWhitespace(alterationTail || ""));
    const fallbackAlteration = weeklyIndexOnly ? null : formatCampaignAlterationLabel(alterationTail);
    const alterationFields =
      weeklyIndexOnly || ignorableTail
        ? { alteration: null, alterationMix: [], alterations: [], carType: environment || null }
        : normalizeAlterationFields(alterationTail, {
            carType: environment,
            fallbackAlteration,
          });
    return {
      sanitizedName,
      parserPattern: "campaign-special-prefix",
      season: specialMatch.value.label,
      year,
      ...alterationFields,
      type: typeMatch ? typeMatch.value : null,
      environment: alterationFields.carType || environment || null,
      special: specialMatch.value.label,
    };
  }

  const seasonMatch = matchAliasFromTokens(tokens, SEASON_BY_TOKEN);
  if (!seasonMatch) {
    const combinedToken = toText(tokens[0]);
    const combinedMatch = combinedToken.match(/^(?<season>[A-Za-z]{2})(?<year>\d{2,4})$/);
    if (!combinedMatch?.groups) return defaultOut;
    const combinedSeason = normalizeSeason(combinedMatch.groups.season);
    const combinedYear = normalizeYear(combinedMatch.groups.year);
    if (!combinedSeason || !combinedYear) return defaultOut;

    const remainingAfterCombined = tokens.slice(1);
    const typeMatch = matchAliasFromTokens(remainingAfterCombined, TYPE_BY_TOKEN);
    const afterType = remainingAfterCombined.slice(typeMatch ? typeMatch.consumed : 0);
    const environmentMatch = matchAliasFromTokens(afterType, ENVIRONMENT_BY_TOKEN);
    const afterEnvironment = afterType.slice(environmentMatch ? environmentMatch.consumed : 0);
    const alterationTail = afterEnvironment.join(" ");
    const alterationFields = normalizeAlterationFields(alterationTail, {
      carType: environmentMatch ? environmentMatch.value : null,
      fallbackAlteration: formatCampaignAlterationLabel(alterationTail),
    });

    return {
      sanitizedName,
      parserPattern: "campaign-season-year-combined-token",
      season: combinedSeason,
      year: combinedYear,
      ...alterationFields,
      type: typeMatch ? typeMatch.value : null,
      environment: alterationFields.carType || (environmentMatch ? environmentMatch.value : null),
      special: null,
    };
  }

  const remainingAfterSeason = tokens.slice(seasonMatch.consumed);
  if (!remainingAfterSeason.length) {
    return {
      ...defaultOut,
      season: seasonMatch.value,
      parserPattern: "campaign-season-only",
    };
  }

  const yearToken = toText(remainingAfterSeason[0]);
  const year = normalizeYear(yearToken);
  const remainingAfterYear = year ? remainingAfterSeason.slice(1) : remainingAfterSeason;
  const typeMatch = matchAliasFromTokens(remainingAfterYear, TYPE_BY_TOKEN);
  const afterType = remainingAfterYear.slice(typeMatch ? typeMatch.consumed : 0);
  const environmentMatch = matchAliasFromTokens(afterType, ENVIRONMENT_BY_TOKEN);
  const afterEnvironment = afterType.slice(environmentMatch ? environmentMatch.consumed : 0);
  const alterationTail = afterEnvironment.join(" ");
  const alterationFields = normalizeAlterationFields(alterationTail, {
    carType: environmentMatch ? environmentMatch.value : null,
    fallbackAlteration: formatCampaignAlterationLabel(alterationTail),
  });

  return {
    sanitizedName,
    parserPattern: "campaign-season-year-prefix",
    season: seasonMatch.value,
    year,
    ...alterationFields,
    type: typeMatch ? typeMatch.value : null,
    environment: alterationFields.carType || (environmentMatch ? environmentMatch.value : null),
    special: null,
  };
}

export { parseCampaignStandardizedFields, parseCompetitionMapAlterationFields };
