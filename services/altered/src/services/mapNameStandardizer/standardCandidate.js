import { toText } from "./baseText.js";
import { parseCompetitionMapAlterationFields } from "./campaignParser.js";
import { deriveMapNumbers, deriveParserWarning, parseStandardizedFields } from "./mapParser.js";
import { calculateConfidence, formatProposedName } from "./namingFormatters.js";
import { normalizeCompetitionType, uniqueLower } from "./normalization.js";
import { SOURCE_VERSION } from "./standardizerData.js";

function parseCandidateSources(map, context) {
  const parsed = parseStandardizedFields(context.originalName);
  const parsedFilename = parseStandardizedFields(context.filename);
  const competitionMapParsed =
    normalizeCompetitionType(context.campaignParsed.type) ||
    toText(context.campaignParsed.special).toUpperCase() === "TMWC"
      ? parseCompetitionMapAlterationFields(context.originalName) ||
        parseCompetitionMapAlterationFields(context.filename)
      : null;
  const mapNumbersResult = deriveMapNumbers({
    mapName: context.originalName,
    filename: context.filename,
    campaignName: context.campaignName,
    slot: map.slot,
    campaignMapCount: map.campaignMapCount,
    season: context.campaignParsed.season || parsedFilename.season || parsed.season || null,
    year: context.campaignParsed.year || parsedFilename.year || parsed.year || null,
  });
  return { competitionMapParsed, mapNumbersResult, parsed, parsedFilename };
}

function deriveAlterationMix(campaignParsed, competitionMapParsed, parsedFilename, parsed) {
  return uniqueLower([
    ...(Array.isArray(campaignParsed.alterations) ? campaignParsed.alterations : campaignParsed.alterationMix || []),
    ...(Array.isArray(competitionMapParsed?.alterations)
      ? competitionMapParsed.alterations
      : competitionMapParsed?.alterationMix || []),
    ...(Array.isArray(parsedFilename.alterations) ? parsedFilename.alterations : parsedFilename.alterationMix || []),
    ...(Array.isArray(parsed.alterations) ? parsed.alterations : parsed.alterationMix || []),
  ]);
}

function deriveParserPattern({ campaignParsed, competitionMapParsed, mapNumbersResult, parsed, parsedFilename }) {
  return (
    (Array.isArray(parsed.mapNumbers) && parsed.mapNumbers.length ? parsed.parserPattern : null) ||
    (Array.isArray(parsedFilename.mapNumbers) && parsedFilename.mapNumbers.length
      ? parsedFilename.parserPattern
      : null) ||
    campaignParsed.parserPattern ||
    competitionMapParsed?.parserPattern ||
    parsedFilename.parserPattern ||
    parsed.parserPattern ||
    (mapNumbersResult.usedSlotFallback ? "campaign-slot-fallback-25" : null)
  );
}

function deriveCandidateFields(context, parsedSources) {
  const { campaignParsed } = context;
  const { competitionMapParsed, mapNumbersResult, parsed, parsedFilename } = parsedSources;
  const mapNumbers = mapNumbersResult.mapNumbers;
  const alterationMix = deriveAlterationMix(campaignParsed, competitionMapParsed, parsedFilename, parsed);
  const season = campaignParsed.season || parsedFilename.season || parsed.season || null;
  const year = campaignParsed.year || parsedFilename.year || parsed.year || null;
  const parserPattern = deriveParserPattern({ ...parsedSources, campaignParsed });
  return {
    alterationMix,
    carType:
      campaignParsed.carType ||
      parsedFilename.carType ||
      parsed.carType ||
      competitionMapParsed?.carType ||
      campaignParsed.environment ||
      null,
    mapNumber: mapNumbers[0] || null,
    mapNumbers,
    parserPattern,
    season,
    year,
  };
}

function deriveAlteration(campaignParsed, alterationMix) {
  if (campaignParsed.alteration) return campaignParsed.alteration;
  if (alterationMix.length === 1) return alterationMix[0];
  return alterationMix.length > 1 ? alterationMix.join(" + ") : null;
}

function buildStandardMapNameCandidate(map, context) {
  const parsedSources = parseCandidateSources(map, context);
  const { competitionMapParsed, parsed, parsedFilename } = parsedSources;
  const fields = deriveCandidateFields(context, parsedSources);
  const parserWarning = deriveParserWarning({
    mapName: context.originalName,
    filename: context.filename,
    campaignName: context.campaignName,
    parserPattern: fields.parserPattern,
  });
  const parserConfidence = calculateConfidence({
    hasSeason: Boolean(fields.season),
    hasYear: Boolean(fields.year),
    hasMapNumber: Boolean(fields.mapNumber),
    alterationMix: fields.alterationMix,
    sanitizedName: context.campaignParsed.sanitizedName || parsedFilename.sanitizedName || parsed.sanitizedName,
    parserPattern: fields.parserPattern,
  });
  const proposedName =
    parsed.proposedName ||
    parsedFilename.proposedName ||
    formatProposedName({
      season: fields.season,
      year: fields.year,
      mapNumber: fields.mapNumber,
      alterationMix: fields.alterationMix,
    });

  return {
    mapUid: context.mapUid,
    originalName: context.originalName || context.mapUid,
    sanitizedName:
      competitionMapParsed?.canonicalTitle ||
      parsed.sanitizedName ||
      parsedFilename.sanitizedName ||
      context.campaignParsed.sanitizedName ||
      context.originalName ||
      context.mapUid,
    proposedName: proposedName || null,
    parserPattern: fields.parserPattern,
    parserConfidence,
    season: fields.season || null,
    year: fields.year || null,
    mapNumber: fields.mapNumber,
    mapNumbers: fields.mapNumbers,
    alteration: deriveAlteration(context.campaignParsed, fields.alterationMix) || null,
    alterationMix: fields.alterationMix,
    alterations: fields.alterationMix,
    carType: fields.carType || null,
    parserWarning,
    automationState: fields.mapNumbers.length && (fields.season || fields.year) ? "matched" : "unmatched",
    requiresRegex: fields.mapNumbers.length === 0,
    sourceVersion: SOURCE_VERSION,
  };
}

export { buildStandardMapNameCandidate };
