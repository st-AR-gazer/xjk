import { normalizeWhitespace, toText } from "./baseText.js";
import { ALTERATION_ALIASES } from "./standardizerData.js";
import { normalizeMapNumber, uniqueLower } from "./normalization.js";

function calculateConfidence({
  hasSeason = false,
  hasYear = false,
  hasMapNumber = false,
  alterationMix = [],
  sanitizedName = "",
  parserPattern = "",
} = {}) {
  let score = 0;
  if (hasSeason) score += 20;
  if (hasYear) score += 20;
  if (hasMapNumber) score += 20;
  if (parserPattern === "spring-2020-code") score += 8;
  if (Array.isArray(alterationMix) && alterationMix.length > 0) {
    score += 18;
    const canonicalCount = alterationMix.filter((item) => ALTERATION_ALIASES.has(toText(item).toLowerCase())).length;
    if (canonicalCount > 0) score += 8;
  }
  if (/\b(training|winter|spring|summer|fall|autumn)\b/i.test(sanitizedName)) score += 6;
  if (/\b\d{1,2}\b/.test(sanitizedName)) score += 4;
  return Math.max(0, Math.min(100, score));
}

function formatProposedName({ season, year, mapNumber, alterationMix = [] } = {}) {
  if (!season || !year || !mapNumber) return "";
  const padded = String(mapNumber).padStart(2, "0");
  const base = `${season} ${year} - ${padded}`;
  const alterations = uniqueLower(alterationMix);
  if (!alterations.length) return base;
  return `${base} | ${alterations.join(" + ")}`;
}

function parseSpring2020Code(code) {
  const normalized = toText(code).toUpperCase();
  if (!normalized || normalized.length !== 3) return null;
  if (!(normalized.startsWith("S") || normalized.startsWith("T"))) return null;
  const tail = Number(normalized.slice(1));
  if (!Number.isFinite(tail)) return null;
  let mapNumber = tail;
  if (normalized.startsWith("T")) mapNumber += 10;
  mapNumber = normalizeMapNumber(mapNumber);
  if (!mapNumber) return null;
  return {
    season: "Spring",
    year: 2020,
    mapNumber,
  };
}

function formatCampaignAlterationLabel(tail) {
  const normalized = normalizeWhitespace(
    toText(tail)
      .replace(/[[\]()]/g, " ")
      .replace(/\s+/g, " ")
  );
  if (!normalized) return null;
  return normalized;
}

export { calculateConfidence, formatCampaignAlterationLabel, formatProposedName, parseSpring2020Code };
