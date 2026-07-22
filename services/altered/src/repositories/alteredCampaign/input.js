import { clampInt, serializeJson, toNullableIso } from "../alteredRepositorySupport.js";

function positiveIntegerOrNull(value) {
  return clampInt(value, { min: 1, max: 2147483647, fallback: 0 }) || null;
}

function nullableText(value) {
  return String(value || "").trim() || null;
}

function normalizeCampaignInput({
  clubId,
  campaignName,
  externalCampaignId,
  uploadBucketId,
  activityId,
  activityType = "",
  campaignType = "",
  startTimestamp = null,
  endTimestamp = null,
  published = undefined,
  leaderboardGroupUid = "",
  payload = null,
} = {}) {
  const name = String(campaignName || "").trim();
  if (!name) return null;

  return {
    clubId: clampInt(clubId, { min: 0, max: 2147483647, fallback: 0 }),
    name,
    externalCampaignId: positiveIntegerOrNull(externalCampaignId),
    uploadBucketId: positiveIntegerOrNull(uploadBucketId),
    activityId: positiveIntegerOrNull(activityId),
    activityType: nullableText(activityType),
    campaignType: nullableText(campaignType),
    startTimestamp: toNullableIso(startTimestamp),
    endTimestamp: toNullableIso(endTimestamp),
    published: Boolean(published),
    publishedProvided: typeof published === "boolean",
    leaderboardGroupUid: nullableText(leaderboardGroupUid),
    payloadJson: serializeJson(payload),
  };
}

export { normalizeCampaignInput, nullableText, positiveIntegerOrNull };
