import { clampInt, normalizeCampaignStorageName } from "../alteredRepositorySupport.js";

const CAMPAIGN_IDENTITY_SELECT = `SELECT
  campaign_id AS campaignId,
  name,
  external_campaign_id AS externalCampaignId,
  upload_bucket_id AS uploadBucketId
FROM altered_campaigns`;

function findCampaignBy(db, clause, ...params) {
  return db.prepare(`${CAMPAIGN_IDENTITY_SELECT} WHERE ${clause} LIMIT 1`).get(...params) || null;
}

function identifiersAreCompatible(candidate, input) {
  const candidateExternalId = clampInt(candidate?.externalCampaignId, {
    min: 1,
    max: 2147483647,
    fallback: 0,
  });
  const candidateBucketId = clampInt(candidate?.uploadBucketId, {
    min: 1,
    max: 2147483647,
    fallback: 0,
  });
  return (
    (!input.uploadBucketId || !candidateBucketId || candidateBucketId === input.uploadBucketId) &&
    (!input.externalCampaignId || !candidateExternalId || candidateExternalId === input.externalCampaignId)
  );
}

function resolveCampaignIdentity(db, input) {
  const byUploadBucket = input.uploadBucketId
    ? findCampaignBy(db, "club_id = ? AND upload_bucket_id = ?", input.clubId, input.uploadBucketId)
    : null;
  const byExternalId = input.externalCampaignId
    ? findCampaignBy(db, "club_id = ? AND external_campaign_id = ?", input.clubId, input.externalCampaignId)
    : null;
  const byName = findCampaignBy(db, "club_id = ? AND name = ?", input.clubId, input.name);
  const target = byUploadBucket || byExternalId || (byName && identifiersAreCompatible(byName, input) ? byName : null);
  return { byName, target };
}

function resolveDesiredCampaignName(db, input, target) {
  if (!input.externalCampaignId) return input.name;
  const conflict = findCampaignBy(db, "club_id = ? AND name = ?", input.clubId, input.name);
  const conflictId = Number(conflict?.campaignId || 0);
  const conflictExternalId = clampInt(conflict?.externalCampaignId, {
    min: 1,
    max: 2147483647,
    fallback: 0,
  });
  if (
    conflictId &&
    conflictId !== Number(target?.campaignId || 0) &&
    conflictExternalId > 0 &&
    conflictExternalId !== input.externalCampaignId
  ) {
    return normalizeCampaignStorageName(input.name, input.externalCampaignId);
  }
  return input.name;
}

function pickUniqueCampaignName(db, { clubId, desiredName, excludeCampaignId = 0 }) {
  let candidate = desiredName;
  let suffix = 2;
  while (true) {
    const existing = findCampaignBy(db, "club_id = ? AND name = ?", clubId, candidate);
    if (!existing || Number(existing.campaignId || 0) === Number(excludeCampaignId || 0)) return candidate;
    candidate = `${desiredName} (${suffix})`;
    suffix += 1;
  }
}

export { findCampaignBy, pickUniqueCampaignName, resolveCampaignIdentity, resolveDesiredCampaignName };
