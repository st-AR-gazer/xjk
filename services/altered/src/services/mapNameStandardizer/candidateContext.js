import { normalizeWhitespace, toText } from "./baseText.js";
import { parseCampaignStandardizedFields } from "./campaignParser.js";
import { sanitizeMapName } from "./normalization.js";
import { resolveWeeklyGrandWeek, resolveWeeklyShortsEntry } from "./weeklyCampaigns.js";

function objectPayload(value) {
  return value && typeof value === "object" ? value : null;
}

function deriveFilename(map, payload) {
  return sanitizeMapName(
    toText(
      map.filename || map.fileName || map.file_name || payload?.filename || payload?.mapDetail?.filename || ""
    ).replace(/\.map\.gbx$/i, "")
  );
}

function createMapNameCandidateContext(map) {
  const mapUid = toText(map.mapUid || map.uid || map.map_uid || "");
  const originalName = normalizeWhitespace(map.name || map.mapName || map.title || "");
  const payload = objectPayload(map.payload);
  const filename = deriveFilename(map, payload);
  const campaignName = normalizeWhitespace(map.campaign || map.campaignName || "");
  const campaignParsed = parseCampaignStandardizedFields(campaignName, {
    startTimestamp: map.campaignStartTimestamp || map.startTimestamp || null,
  });
  const special = toText(campaignParsed.special).toLowerCase();
  const weeklyShortsEntry =
    special === "weekly shorts"
      ? resolveWeeklyShortsEntry({
          campaignName,
          campaignPayload: map.campaignPayload,
          mapPayload: payload,
          slot: map.slot,
          mapName: originalName,
          filename,
        })
      : null;
  const weeklyGrandWeek =
    special === "weekly grands"
      ? resolveWeeklyGrandWeek({
          campaignName,
          campaignPayload: map.campaignPayload,
          mapPayload: payload,
        })
      : null;

  return {
    campaignName,
    campaignParsed,
    filename,
    mapUid,
    originalName,
    payload,
    weeklyGrandWeek,
    weeklyShortsEntry,
  };
}

export { createMapNameCandidateContext, objectPayload };
