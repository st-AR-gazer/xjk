import { toText } from "../../../../shared/valueUtils.js";
import { parseCampaignStandardizedFields } from "../mapNameStandardizer.js";
import { CONTENT_SIGNATURE_VERSION, CONTENT_SIMILARITY_PATTERN } from "./constants.js";
import { clampNumber, normalizeMapNumbers, slugifyText } from "./normalization.js";

function resolveRegexMapNumbers({ targetName = "", targetMapNumbers = [], targetParserPattern = "" } = {}) {
  const explicitMapNumbers = normalizeMapNumbers(targetMapNumbers);
  const parserPattern = toText(targetParserPattern).toLowerCase();
  if (
    explicitMapNumbers.length > 0 &&
    parserPattern &&
    !parserPattern.startsWith(CONTENT_SIMILARITY_PATTERN.toLowerCase())
  ) {
    return explicitMapNumbers;
  }
  const parsed = parseCampaignStandardizedFields(targetName);
  return normalizeMapNumbers(parsed?.mapNumbers || (parsed?.mapNumber ? [parsed.mapNumber] : []));
}

function normalizeCandidateAutomation(candidate = {}) {
  const mapNumbers = normalizeMapNumbers(candidate?.mapNumbers);
  return mapNumbers.length > 0 && (toText(candidate?.season) || Number(candidate?.year || 0)) ? "matched" : "unmatched";
}

function buildCampaignFamily(campaignName = "") {
  const parsed = parseCampaignStandardizedFields(campaignName);
  const environment = toText(parsed?.environment);
  const type = toText(parsed?.type);
  if (toText(parsed?.special)) {
    const specialSlug = slugifyText(parsed.special, "special");
    const year = Number(parsed?.year || 0) || 0;
    const yearPart = year ? `:${year}` : "";
    const monthPart = Number(parsed?.month || 0) > 0 ? `:month:${String(Number(parsed.month)).padStart(2, "0")}` : "";
    const typePart = type ? `:type:${slugifyText(type, "type")}` : "";
    const environmentPart = environment ? `:env:${slugifyText(environment, "env")}` : "";
    return {
      key: `special:${specialSlug}${yearPart}${monthPart}${typePart}${environmentPart}`,
      parsed,
      label: [parsed.special, type ? `(${type})` : null, environment ? `[${environment}]` : null]
        .filter(Boolean)
        .join(" "),
      isReferenceLike:
        !toText(parsed?.alteration) && !(Array.isArray(parsed?.alterationMix) && parsed.alterationMix.length),
    };
  }

  if (toText(parsed?.season)) {
    const year = Number(parsed?.year || 0) || 0;
    const seasonSlug = slugifyText(parsed.season, "season");
    const yearPart = year ? `:${year}` : "";
    const typePart = type ? `:type:${slugifyText(type, "type")}` : "";
    const environmentPart = environment ? `:env:${slugifyText(environment, "env")}` : "";
    return {
      key: `season:${seasonSlug}${yearPart}${typePart}${environmentPart}`,
      parsed,
      label: [parsed.season, year || null, type || null, environment ? `[${environment}]` : null]
        .filter(Boolean)
        .join(" "),
      isReferenceLike:
        !toText(parsed?.alteration) && !(Array.isArray(parsed?.alterationMix) && parsed.alterationMix.length),
    };
  }

  return {
    key: "",
    parsed,
    label: "",
    isReferenceLike: false,
  };
}

function mergeSimilarityIntoCandidate(candidate = {}, similarity = null, { regexOnly = false } = {}) {
  const baseMapNumbers = normalizeMapNumbers(candidate?.mapNumbers);
  const similarityMapNumbers = normalizeMapNumbers(similarity?.mapNumbers);
  const hasManualSelection = Boolean(similarity?.details?.manualSelection);
  const isTraining = toText(candidate?.season).toLowerCase() === "training";
  const preferRegex = !hasManualSelection && baseMapNumbers.length > 0 && (isTraining || baseMapNumbers.length > 1);
  const forceRegexOnly = Boolean(regexOnly);
  let finalMapNumbers = baseMapNumbers;
  let parserPattern = toText(candidate?.parserPattern) || null;
  let parserConfidence = clampNumber(candidate?.parserConfidence, {
    min: 0,
    max: 100,
    fallback: 0,
  });
  let sourceVersion = toText(candidate?.sourceVersion, CONTENT_SIGNATURE_VERSION);
  let requiresRegex = Boolean(candidate?.requiresRegex);

  if (similarityMapNumbers.length > 0 && !preferRegex && !forceRegexOnly) {
    if (!baseMapNumbers.length) {
      finalMapNumbers = similarityMapNumbers;
      parserPattern = CONTENT_SIMILARITY_PATTERN;
      parserConfidence = Math.max(parserConfidence, Math.round(Number(similarity?.confidence || 0) * 100));
      sourceVersion = `${sourceVersion}+${CONTENT_SIGNATURE_VERSION}`;
      requiresRegex = false;
    } else {
      const union = normalizeMapNumbers([...baseMapNumbers, ...similarityMapNumbers]);
      if (union.length !== baseMapNumbers.length) {
        finalMapNumbers = union;
        parserConfidence = Math.max(parserConfidence, Math.round(Number(similarity?.confidence || 0) * 100));
        sourceVersion = `${sourceVersion}+${CONTENT_SIGNATURE_VERSION}`;
      }
      requiresRegex = false;
    }
  }

  const finalMapNumber = finalMapNumbers[0] || null;
  return {
    ...candidate,
    mapNumber: finalMapNumber,
    mapNumbers: finalMapNumbers,
    parserPattern,
    parserConfidence,
    sourceVersion,
    requiresRegex,
    automationState: normalizeCandidateAutomation({
      ...candidate,
      mapNumbers: finalMapNumbers,
    }),
  };
}

export { buildCampaignFamily, mergeSimilarityIntoCandidate, normalizeCandidateAutomation, resolveRegexMapNumbers };
