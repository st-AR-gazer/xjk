import { normalizeAliasValue, normalizeWhitespace, toText } from "./baseText.js";
import {
  ALTERATION_ALIASES,
  ALTERATION_SEQUENCE_ALIASES,
  COMPETITION_TYPE_BY_TOKEN,
  ENVIRONMENT_BY_TOKEN,
  SEASON_BY_TOKEN,
  TM_STYLE_CODE_PATTERN,
} from "./standardizerData.js";

function sanitizeMapName(name) {
  const cleanDashes = toText(name).replace(/[\u2013\u2014]/g, "-");
  const withoutStyle = cleanDashes.replace(TM_STYLE_CODE_PATTERN, "");
  return normalizeWhitespace(withoutStyle);
}

function normalizeSeason(token) {
  const key = toText(token).toLowerCase();
  return SEASON_BY_TOKEN.get(key) || null;
}

function normalizeCompetitionType(token) {
  const key = toText(token).toLowerCase();
  return COMPETITION_TYPE_BY_TOKEN.get(key) || null;
}

function normalizeYear(rawYear) {
  const parsed = Number(rawYear);
  if (!Number.isFinite(parsed)) return null;
  const year = Math.floor(parsed);
  if (year >= 2000 && year <= 2099) return year;
  if (year >= 0 && year <= 99) return 2000 + year;
  return null;
}

function normalizeMapNumber(rawMapNumber) {
  const parsed = Number(rawMapNumber);
  if (!Number.isFinite(parsed)) return null;
  const mapNumber = Math.floor(parsed);
  if (mapNumber < 1 || mapNumber > 999) return null;
  return mapNumber;
}

function cleanAlterationToken(token) {
  return normalizeWhitespace(
    toText(token)
      .replace(/^[([{\s]+/, "")
      .replace(/[)\]}]+$/g, "")
      .replace(/\s+\|\s+/g, " ")
  );
}

function normalizeAlterationToken(token) {
  const cleaned = cleanAlterationToken(token);
  if (!cleaned) return "";
  if (/^(?:section\s*\d+\s*joined|last section joined)(?:\s*\((?:all starts|all ends)\))?$/i.test(cleaned)) {
    return "Sections Joined";
  }
  const lowered = cleaned.toLowerCase();
  const collapsed = lowered.replace(/\s+/g, " ");
  const noDash = collapsed.replace(/-/g, " ");
  return ALTERATION_ALIASES.get(collapsed) || ALTERATION_ALIASES.get(noDash) || cleaned;
}

function normalizeAlterationLookupKey(token) {
  return cleanAlterationToken(token).toLowerCase().replace(/[_]/g, " ").replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeCarTypeToken(token) {
  const key = normalizeAliasValue(token);
  if (!key) return null;
  return ENVIRONMENT_BY_TOKEN.get(key) || null;
}

function carTypeFromSpecialCampaign(label) {
  const normalized = normalizeAliasValue(label);
  if (normalized.startsWith("snow discovery")) return "Snow";
  if (normalized.startsWith("rally discovery")) return "Rally";
  if (normalized.startsWith("desert discovery")) return "Desert";
  return null;
}

function consumeLeadingCarType(value) {
  const tokens = tokenizeCampaignName(value);
  if (!tokens.length) {
    return {
      carType: null,
      remainder: "",
    };
  }
  const match = matchAliasFromTokens(tokens, ENVIRONMENT_BY_TOKEN);
  if (!match) {
    return {
      carType: null,
      remainder: normalizeWhitespace(value),
    };
  }
  return {
    carType: match.value,
    remainder: tokens.slice(match.consumed).join(" "),
  };
}

function splitAlterationPart(part) {
  const cleaned = cleanAlterationToken(part);
  if (!cleaned) return [];
  const key = normalizeAlterationLookupKey(cleaned);
  const sequence = ALTERATION_SEQUENCE_ALIASES.get(key);
  if (Array.isArray(sequence) && sequence.length) {
    return uniqueLower(sequence.map((item) => normalizeAlterationToken(item)).filter(Boolean));
  }
  const normalized = normalizeAlterationToken(cleaned);
  return normalized ? [normalized] : [];
}

function tokenizeCampaignName(value) {
  return normalizeWhitespace(
    toText(value)
      .replace(/[[\]()]/g, " ")
      .replace(/[_]/g, " ")
  )
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
}

function matchAliasFromTokens(tokens = [], aliasMap = new Map()) {
  for (let size = Math.min(tokens.length, 3); size >= 1; size -= 1) {
    const candidate = normalizeAliasValue(tokens.slice(0, size).join(" "));
    if (!candidate) continue;
    if (aliasMap.has(candidate)) {
      return {
        value: aliasMap.get(candidate),
        consumed: size,
      };
    }
  }
  return null;
}

function parseAlterationTail(tail) {
  const raw = normalizeWhitespace(toText(tail));
  if (!raw) {
    return {
      alterations: [],
      carType: null,
    };
  }

  let normalized = raw;
  if (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1).trim();
  }

  normalized = normalized
    .replace(/\]\s+\(/g, "], (")
    .replace(/\)\s+\[/g, "), [")
    .replace(/\)\s+\(/g, "), (")
    .replace(/\bcp\s*\/\s*boost\b/gi, "CP Boost")
    .replace(/\bfeat(?:uring)?\b/gi, ",")
    .replace(/\bft\b/gi, ",")
    .replace(/\s+\+\s+/g, ",")
    .replace(/\s+&\s+/g, ",")
    .replace(/\s*\/\s*/g, ",")
    .replace(/\s*;\s*/g, ",")
    .replace(/\s+\|\s+/g, ",")
    .replace(/\s+-\s+/g, ",");
  let carType = null;
  const alterations = [];
  for (const rawPart of normalized.split(",")) {
    const part = cleanAlterationToken(rawPart);
    if (!part) continue;
    const carOnly = normalizeCarTypeToken(part);
    if (carOnly) {
      carType ||= carOnly;
      continue;
    }
    const consumed = consumeLeadingCarType(part);
    const tailPart = cleanAlterationToken(consumed.remainder);
    if (consumed.carType) {
      carType ||= consumed.carType;
      if (!tailPart) continue;
    }
    alterations.push(...splitAlterationPart(tailPart || part));
  }
  return {
    alterations: uniqueLower(alterations),
    carType,
  };
}

function normalizeAlterationFields(tail, { carType = null, fallbackAlteration = null } = {}) {
  const parsed = parseAlterationTail(tail);
  const alterations = uniqueLower(
    parsed.alterations.length ? parsed.alterations : fallbackAlteration ? splitAlterationPart(fallbackAlteration) : []
  );
  const alteration =
    alterations.length === 1 ? alterations[0] : alterations.length > 1 ? alterations.join(" + ") : null;
  return {
    alteration,
    alterationMix: alterations,
    alterations,
    carType: parsed.carType || carType || null,
  };
}

function uniqueLower(items = []) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = toText(item).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(toText(item));
  }
  return out;
}

export {
  carTypeFromSpecialCampaign,
  matchAliasFromTokens,
  normalizeAlterationFields,
  normalizeCompetitionType,
  normalizeMapNumber,
  normalizeSeason,
  normalizeYear,
  parseAlterationTail,
  sanitizeMapName,
  tokenizeCampaignName,
  uniqueLower,
};
