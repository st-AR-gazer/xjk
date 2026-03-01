const SOURCE_VERSION = "sorting-v3-lite";

const TM_STYLE_CODE_PATTERN = /\$([0-9a-fA-F]{1,3}|[iIoOnNmMwWsSzZtTgG<>]|[lLhHpP](\[[^\]]+\])?)/g;

const SEASON_BY_TOKEN = new Map([
  ["winter", "Winter"],
  ["wi", "Winter"],
  ["spring", "Spring"],
  ["sp", "Spring"],
  ["summer", "Summer"],
  ["su", "Summer"],
  ["fall", "Fall"],
  ["autumn", "Fall"],
  ["fa", "Fall"],
  ["training", "Training"],
]);

const ALTERATION_ALIASES = new Map(
  Object.entries({
    dirt: "Dirt",
    dirty: "Dirt",
    flooded: "Flooded",
    grassy: "Grassy",
    grass: "Grassy",
    ice: "Ice",
    icy: "Ice",
    magnet: "Magnet",
    fastmagnet: "Fast-Magnet",
    "fast magnet": "Fast-Magnet",
    mixed: "Mixed",
    penalty: "Penalty",
    plastic: "Plastic",
    road: "Road",
    roady: "Road",
    asphalt: "Road",
    tarmac: "Road",
    tech: "Road",
    wood: "Wood",
    bobsleigh: "Bobsleigh",
    pipe: "Pipe",
    sausage: "Sausage",
    "slot-trak": "Slot-Trak",
    "slot track": "Slot-Trak",
    surfaceless: "Surfaceless",
    underwater: "Underwater",
    uw: "Underwater",
    reverse: "Reverse",
    short: "Short",
    "no grip": "No-Grip",
    "no-grip": "No-Grip",
    nogrip: "No-Grip",
    "no brakes": "No-Brakes",
    "no-brakes": "No-Brakes",
    nobrakes: "No-Brakes",
    slowmo: "Slowmo",
    "slow mo": "Slowmo",
    slowmotion: "Slowmo",
    fragile: "Fragile",
    glider: "Glider",
    freewheel: "Freewheel",
    yeet: "YEET",
    deet: "YEET Down",
    "there and back": "There and Back",
    boomerang: "There and Back",
    checkpointless: "Checkpointless",
    cpless: "Checkpointless",
    sttf: "Straight to the Finish",
    "straight to the finish": "Straight to the Finish",
    "official nadeo map": "Unaltered Nadeo",
  })
);

const SEASONAL_PREFIX_PATTERN =
  /^(?<season>winter|spring|summer|fall|autumn|training|wi|sp|su|fa)\s+(?<year>\d{2,4})\s*-\s*(?<map>\d{1,2})(?:\s+(?<tail>.+))?$/i;
const SEASONAL_SUFFIX_PATTERN =
  /^(?<tail>.+?)\s+(?<season>winter|spring|summer|fall|autumn|training|wi|sp|su|fa)\s+(?<year>\d{2,4})\s*-\s*(?<map>\d{1,2})$/i;
const SPRING_2020_CODE_PATTERN = /^(?<code>[STst][0-1]\d)(?:\s*[-:]\s*|\s+)?(?<tail>.*)$/;

function toText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeWhitespace(value) {
  return toText(value).replace(/\s+/g, " ").trim();
}

function sanitizeMapName(name) {
  const cleanDashes = toText(name).replace(/[\u2013\u2014]/g, "-");
  const withoutStyle = cleanDashes.replace(TM_STYLE_CODE_PATTERN, "");
  return normalizeWhitespace(withoutStyle);
}

function normalizeSeason(token) {
  const key = toText(token).toLowerCase();
  return SEASON_BY_TOKEN.get(key) || null;
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
  const lowered = cleaned.toLowerCase();
  const collapsed = lowered.replace(/\s+/g, " ");
  const noDash = collapsed.replace(/-/g, " ");
  return ALTERATION_ALIASES.get(collapsed) || ALTERATION_ALIASES.get(noDash) || cleaned;
}

function splitAlterationTail(tail) {
  const raw = normalizeWhitespace(toText(tail));
  if (!raw) return [];
  const normalized = raw
    .replace(/^\(|\)$/g, "")
    .replace(/\bfeat(?:uring)?\b/gi, ",")
    .replace(/\bft\b/gi, ",")
    .replace(/\s+\+\s+/g, ",")
    .replace(/\s+&\s+/g, ",")
    .replace(/\s*\/\s*/g, ",")
    .replace(/\s*;\s*/g, ",")
    .replace(/\s+\|\s+/g, ",")
    .replace(/\s+-\s+/g, ",");
  return normalized
    .split(",")
    .map((part) => normalizeAlterationToken(part))
    .filter(Boolean);
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
    const canonicalCount = alterationMix.filter((item) => ALTERATION_ALIASES.has(toText(item).toLowerCase()))
      .length;
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

function parseStandardizedFields(rawName) {
  const sanitizedName = sanitizeMapName(rawName);
  const defaultOut = {
    sanitizedName,
    parserPattern: "",
    season: null,
    year: null,
    mapNumber: null,
    alterationMix: [],
  };
  if (!sanitizedName) return defaultOut;

  const prefixMatch = sanitizedName.match(SEASONAL_PREFIX_PATTERN);
  if (prefixMatch?.groups) {
    const season = normalizeSeason(prefixMatch.groups.season);
    const year = normalizeYear(prefixMatch.groups.year);
    const mapNumber = normalizeMapNumber(prefixMatch.groups.map);
    const alterationMix = splitAlterationTail(prefixMatch.groups.tail || "");
    return {
      sanitizedName,
      parserPattern: "season-year-map-prefix",
      season,
      year,
      mapNumber,
      alterationMix,
    };
  }

  const suffixMatch = sanitizedName.match(SEASONAL_SUFFIX_PATTERN);
  if (suffixMatch?.groups) {
    const season = normalizeSeason(suffixMatch.groups.season);
    const year = normalizeYear(suffixMatch.groups.year);
    const mapNumber = normalizeMapNumber(suffixMatch.groups.map);
    const alterationMix = splitAlterationTail(suffixMatch.groups.tail || "");
    return {
      sanitizedName,
      parserPattern: "season-year-map-suffix",
      season,
      year,
      mapNumber,
      alterationMix,
    };
  }

  const springCodeMatch = sanitizedName.match(SPRING_2020_CODE_PATTERN);
  if (springCodeMatch?.groups?.code) {
    const decoded = parseSpring2020Code(springCodeMatch.groups.code);
    if (decoded) {
      const alterationMix = splitAlterationTail(springCodeMatch.groups.tail || "");
      return {
        sanitizedName,
        parserPattern: "spring-2020-code",
        season: decoded.season,
        year: decoded.year,
        mapNumber: decoded.mapNumber,
        alterationMix,
      };
    }
  }

  return defaultOut;
}

function buildMapNameCandidate(map = {}) {
  const mapUid = toText(map.mapUid || map.uid || map.map_uid || "");
  const originalName = normalizeWhitespace(map.name || map.mapName || map.title || "");
  const parsed = parseStandardizedFields(originalName);
  const alterationMix = uniqueLower(parsed.alterationMix || []);

  const confidence = calculateConfidence({
    hasSeason: Boolean(parsed.season),
    hasYear: Boolean(parsed.year),
    hasMapNumber: Boolean(parsed.mapNumber),
    alterationMix,
    sanitizedName: parsed.sanitizedName,
    parserPattern: parsed.parserPattern,
  });
  const proposedName = formatProposedName({
    season: parsed.season,
    year: parsed.year,
    mapNumber: parsed.mapNumber,
    alterationMix,
  });
  const automationState = proposedName && confidence >= 70 ? "matched" : "unmatched";

  return {
    mapUid,
    originalName: originalName || mapUid,
    sanitizedName: parsed.sanitizedName || originalName || mapUid,
    proposedName: proposedName || null,
    parserPattern: parsed.parserPattern || null,
    parserConfidence: confidence,
    season: parsed.season || null,
    year: parsed.year || null,
    mapNumber: parsed.mapNumber || null,
    alterationMix,
    automationState,
    requiresRegex: automationState !== "matched",
    sourceVersion: SOURCE_VERSION,
  };
}

export { SOURCE_VERSION, sanitizeMapName, parseStandardizedFields, buildMapNameCandidate };
