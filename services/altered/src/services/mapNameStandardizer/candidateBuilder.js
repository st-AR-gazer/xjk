import { normalizeWhitespace, toText } from "./baseText.js";
import { parseCampaignStandardizedFields } from "./campaignParser.js";
import { createMapNameCandidateContext, objectPayload } from "./candidateContext.js";
import { buildSpecialMapNameCandidate } from "./specialCandidates.js";
import { buildStandardMapNameCandidate } from "./standardCandidate.js";
import { resolveCanonicalWeeklyShortsWeek, resolveWeeklyShortsWeek } from "./weeklyCampaigns.js";

function classifyNamingSimilaritySource(map = {}) {
  const payload = objectPayload(map?.payload);
  const campaignPayload = objectPayload(map?.campaignPayload);
  const payloadSourceKey = toText(
    campaignPayload?.sourceKey ||
      campaignPayload?.source_key ||
      payload?.sourceKey ||
      payload?.source_key ||
      payload?.mapDetail?.sourceKey ||
      payload?.mapDetail?.source_key
  ).toLowerCase();
  if (payloadSourceKey) return payloadSourceKey;

  const campaignName = normalizeWhitespace(map?.campaign || map?.campaignName || "");
  const parsed = parseCampaignStandardizedFields(campaignName, {
    startTimestamp: map?.campaignStartTimestamp || map?.startTimestamp || null,
  });
  const special = toText(parsed?.special).toLowerCase();
  const type = toText(parsed?.type).toLowerCase();

  if (special === "weekly shorts") return "weekly-shorts";
  if (special === "weekly grands") return "weekly-grands";
  if (special === "totd") return "official-totd";
  if (special.includes("discovery")) return "official-discovery";
  if (type === "tmgl" || type === "tmwt" || type === "tmwc") return "official-competition";
  if (toText(parsed?.season)) return "official-seasonal-v2";
  return "";
}

function shouldExcludeFromNamingReview(map = {}) {
  const payload = objectPayload(map?.payload);
  const campaignPayload = objectPayload(map?.campaignPayload);
  const campaignName = normalizeWhitespace(map?.campaign || map?.campaignName || "");
  const campaignParsed = parseCampaignStandardizedFields(campaignName, {
    startTimestamp: map?.campaignStartTimestamp || map?.startTimestamp || null,
  });

  const payloads = [campaignPayload, payload].filter(Boolean);
  for (const entry of payloads) {
    const explicitCanonical =
      entry?.weeklyShorts?.isCanonicalNadeoWeek ??
      entry?.weekly_shorts?.isCanonicalNadeoWeek ??
      entry?.campaign?.weeklyShorts?.isCanonicalNadeoWeek ??
      entry?.campaign?.weekly_shorts?.isCanonicalNadeoWeek ??
      entry?.campaignMetadata?.weeklyShorts?.isCanonicalNadeoWeek ??
      entry?.campaignMetadata?.weekly_shorts?.isCanonicalNadeoWeek;
    if (explicitCanonical === false) {
      return true;
    }
    if (explicitCanonical === true) {
      return false;
    }
  }

  if (toText(campaignParsed?.special).toLowerCase() !== "weekly shorts") {
    return false;
  }

  const week = resolveWeeklyShortsWeek({
    campaignName,
    campaignPayload,
    mapPayload: payload,
  });
  if (!week) return false;
  return !resolveCanonicalWeeklyShortsWeek(week);
}

function buildMapNameCandidate(map = {}) {
  const context = createMapNameCandidateContext(map);
  return buildSpecialMapNameCandidate(map, context) || buildStandardMapNameCandidate(map, context);
}

export { buildMapNameCandidate, classifyNamingSimilaritySource, shouldExcludeFromNamingReview };
