import {
  boolFromAny,
  clampInt,
  firstTruthy,
  normalizeCampaignSlotValue,
  normalizeLooseId,
  toNullableIso,
  uniqueBy,
} from "../alteredRepositorySupport.js";

function normalizeMember(raw = {}) {
  const accountId = normalizeLooseId(
    raw.accountId ?? raw.account_id ?? raw.memberId ?? raw.member_id ?? raw.playerId ?? raw.id
  );
  if (!accountId) return null;

  const role = firstTruthy([raw.role, raw.memberRole, raw.member_role, raw.clubRole, raw.club_role, raw.type]);
  const normalizedRole = role.toLowerCase();
  return {
    accountId,
    displayName: firstTruthy([raw.displayName, raw.display_name, raw.name, raw.nickname, raw.login, raw.accountName]),
    role,
    status: firstTruthy([raw.status, raw.memberStatus, raw.member_status, raw.state]),
    isAdmin:
      boolFromAny(raw.isAdmin) ||
      boolFromAny(raw.admin) ||
      normalizedRole.includes("admin") ||
      normalizedRole.includes("owner"),
    isVip: boolFromAny(raw.isVip) || boolFromAny(raw.vip) || normalizedRole.includes("vip"),
    isCreator: boolFromAny(raw.isCreator) || boolFromAny(raw.creator) || normalizedRole.includes("creator"),
    joinedAt: toNullableIso(raw.joinedAt ?? raw.joined_at ?? raw.joinDate ?? raw.join_date),
    leftAt: toNullableIso(raw.leftAt ?? raw.left_at ?? raw.leaveDate ?? raw.leave_date),
    payload: raw,
  };
}

function normalizeActivity(raw = {}) {
  const activityId = clampInt(raw.activityId ?? raw.activity_id ?? raw.id, {
    min: 1,
    max: 2147483647,
    fallback: 0,
  });
  if (!activityId) return null;

  return {
    activityId,
    activityType: firstTruthy([raw.activityType, raw.activity_type, raw.type]),
    itemType: firstTruthy([raw.itemType, raw.item_type, raw.targetType, raw.target_type]),
    name: firstTruthy([raw.name, raw.itemName, raw.item_name, raw.title]),
    campaignExternalId:
      clampInt(raw.campaignId ?? raw.campaign_id ?? raw.campaign?.id, {
        min: 1,
        max: 2147483647,
        fallback: 0,
      }) || null,
    bucketId:
      clampInt(raw.bucketId ?? raw.bucket_id ?? raw.activityObjectId ?? raw.objectId, {
        min: 1,
        max: 2147483647,
        fallback: 0,
      }) || null,
    mapUid: firstTruthy([raw.mapUid, raw.map_uid, raw.map?.uid, raw.track?.uid, raw.item?.uid]) || null,
    authorAccountId: normalizeLooseId(raw.author ?? raw.authorId ?? raw.author_id ?? raw.accountId ?? raw.account_id),
    active: boolFromAny(raw.active ?? raw.isActive ?? raw.enabled),
    occurredAt: toNullableIso(
      raw.occurredAt ??
        raw.occurred_at ??
        raw.timestamp ??
        raw.createdAt ??
        raw.created_at ??
        raw.activityAt ??
        raw.activity_at
    ),
    payload: raw,
  };
}

function normalizeUploadMap(raw = {}, index = 0) {
  const mapUid = firstTruthy([raw.uid, raw.mapUid, raw.map_uid]);
  if (!mapUid) return null;
  return {
    mapUid,
    slot: normalizeCampaignSlotValue({
      slot: raw.slot,
      order: raw.order,
      position: raw.position,
      fallbackSlot: index + 1,
      max: 100000,
    }),
    mapName: firstTruthy([raw.name, raw.title, mapUid]),
    authorAccountId: normalizeLooseId(raw.author ?? raw.authorId ?? raw.author_id ?? raw.accountId ?? raw.account_id),
    payload: raw,
  };
}

function normalizeUploadBucket(raw = {}) {
  const bucketId = clampInt(raw.bucketId ?? raw.bucket_id ?? raw.id, {
    min: 1,
    max: 2147483647,
    fallback: 0,
  });
  if (!bucketId) return null;

  const maps = uniqueBy((Array.isArray(raw.maps) ? raw.maps : []).map(normalizeUploadMap).filter(Boolean), (map) =>
    map.mapUid.toLowerCase()
  );
  return {
    bucketId,
    bucketType: firstTruthy([raw.bucketType, raw.bucket_type, raw.type]) || "map",
    name: firstTruthy([raw.name, raw.title, raw.bucketName, raw.bucket_name]),
    activityId:
      clampInt(raw.activityId ?? raw.activity_id ?? raw.activity?.id, {
        min: 1,
        max: 2147483647,
        fallback: 0,
      }) || null,
    mapCount: clampInt(raw.mapCount ?? raw.map_count ?? maps.length, {
      min: 0,
      max: 2147483647,
      fallback: maps.length,
    }),
    active: boolFromAny(raw.active ?? raw.isActive ?? true),
    maps,
    payload: raw,
  };
}

function normalizeClubMonitoringData({ members = [], activities = [], uploadBuckets = [] } = {}) {
  return {
    members: uniqueBy(
      (Array.isArray(members) ? members : []).map(normalizeMember).filter(Boolean),
      (item) => item.accountId
    ),
    activities: uniqueBy(
      (Array.isArray(activities) ? activities : []).map(normalizeActivity).filter(Boolean),
      (item) => item.activityId
    ),
    uploadBuckets: uniqueBy(
      (Array.isArray(uploadBuckets) ? uploadBuckets : []).map(normalizeUploadBucket).filter(Boolean),
      (item) => item.bucketId
    ),
  };
}

export { normalizeActivity, normalizeClubMonitoringData, normalizeMember, normalizeUploadBucket, normalizeUploadMap };
