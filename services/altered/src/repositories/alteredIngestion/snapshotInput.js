import { clampInt, DEFAULT_HOOK_KEY, toText, utcNowIso } from "../alteredRepositorySupport.js";

function createProjectCounters() {
  return {
    campaignsSeen: 0,
    mapsSeen: 0,
    mapsInserted: 0,
    mapsUpdated: 0,
    mapsLinked: 0,
  };
}

function createHookCounters() {
  return {
    campaignsSeen: 0,
    uploadBucketsSeen: 0,
    uploadMapsSeen: 0,
    mapsSeen: 0,
    mapsInserted: 0,
    mapsUpdated: 0,
    mapsLinked: 0,
  };
}

function normalizeProjectSnapshot(options = {}) {
  const sourceKey = toText(options.sourceKey);
  const campaigns = Array.isArray(options.campaigns) ? options.campaigns : [];
  if (!sourceKey) return { error: "sourceKey is required for source sync." };
  if (!campaigns.length) return { error: "campaigns[] is required for source sync." };

  const campaignType = toText(options.campaignType).toLowerCase() || null;
  const clubId = clampInt(options.clubId, { min: 0, max: 2147483647, fallback: 0 });
  return {
    startedAt: utcNowIso(),
    sourceKey,
    sourceType: options.sourceType || "special",
    displayName: toText(options.displayName) || sourceKey || "Project Source",
    sourceLabel: toText(options.sourceLabel) || sourceKey || "project-source",
    campaignType,
    clubId,
    campaigns,
    note: toText(options.note),
    trackedDefault: options.trackedDefault === undefined ? true : Boolean(options.trackedDefault),
    publishedDefault: true,
  };
}

function normalizeHookSnapshot(options, existingHook) {
  const hookKey = String(options.hookKey || DEFAULT_HOOK_KEY).trim() || DEFAULT_HOOK_KEY;
  const club = options.club && typeof options.club === "object" ? options.club : null;
  const clubId = clampInt(club?.id ?? options.clubId ?? existingHook?.clubId, {
    min: 1,
    max: 2147483647,
    fallback: 0,
  });
  if (!clubId) return { error: "clubId is required for hook sync." };

  const campaignInput = options.campaigns === undefined ? [] : options.campaigns;
  const uploadInput = options.uploadBuckets === undefined ? [] : options.uploadBuckets;
  const campaigns = Array.isArray(campaignInput) ? campaignInput : Array.isArray(club?.campaigns) ? club.campaigns : [];
  const uploadBuckets = Array.isArray(uploadInput)
    ? uploadInput
    : Array.isArray(club?.uploadBuckets)
      ? club.uploadBuckets
      : [];
  if (!campaigns.length && !uploadBuckets.length) {
    return { error: "campaigns[] or uploadBuckets[] is required for hook sync." };
  }

  return {
    startedAt: utcNowIso(),
    hookKey,
    clubId,
    clubName: String(club?.name || options.clubName || existingHook?.clubName || "").trim() || `Club ${clubId}`,
    sourceLabel: String(options.sourceLabel || existingHook?.sourceLabel || "").trim() || "altered-monitor",
    note: options.note,
    campaigns,
    uploadBuckets,
    campaignType: null,
    publishedDefault: false,
  };
}

export { createHookCounters, createProjectCounters, normalizeHookSnapshot, normalizeProjectSnapshot };
