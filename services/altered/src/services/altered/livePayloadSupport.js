import { normalizeAccountId } from "../../live/trackmaniaOAuthClient.js";
import { chunkArray as chunk } from "../../../../shared/valueUtils.js";
import { firstTruthy, normalizeCampaignSlotValue } from "../../domain/inputNormalization.js";
import { clampInt } from "./runtimeSupport.js";
import { parseOptionalBoolean, toFlexibleIso, toNullableIso, toText, uniqueBy } from "./valueSupport.js";

function firstPositiveInt(values = []) {
  for (const value of values) {
    const parsed = clampInt(value, { min: 1, max: 2147483647, fallback: 0 });
    if (parsed > 0) return parsed;
  }
  return 0;
}

function normalizeMapUid(value) {
  return String(value || "").trim();
}

function normalizeMapFromInput(rawMap = {}, fallbackSlot = 1) {
  const uid = normalizeMapUid(rawMap.uid || rawMap.mapUid || rawMap.map_uid);
  if (!uid) return null;
  return {
    uid,
    mapId: toText(rawMap.mapId || rawMap.map_id || rawMap.id || ""),
    name: firstTruthy([rawMap.name, rawMap.title, rawMap.mapName, uid]),
    slot: normalizeCampaignSlotValue({
      slot: rawMap.slot,
      order: rawMap.order,
      position: rawMap.position ?? rawMap.campaignMap?.position,
      fallbackSlot,
      max: 20000,
    }),
    author: toText(rawMap.author || ""),
    submitter: toText(rawMap.submitter || ""),
    authorMs: clampInt(rawMap.authorMs ?? rawMap.authorTime ?? rawMap.author_time, {
      min: 0,
      max: 2147483647,
      fallback: 0,
    }),
    goldMs: clampInt(rawMap.goldMs ?? rawMap.goldTime ?? rawMap.gold_time, {
      min: 0,
      max: 2147483647,
      fallback: 0,
    }),
    silverMs: clampInt(rawMap.silverMs ?? rawMap.silverTime ?? rawMap.silver_time, {
      min: 0,
      max: 2147483647,
      fallback: 0,
    }),
    bronzeMs: clampInt(rawMap.bronzeMs ?? rawMap.bronzeTime ?? rawMap.bronze_time, {
      min: 0,
      max: 2147483647,
      fallback: 0,
    }),
    nbLaps: clampInt(rawMap.nbLaps ?? rawMap.nb_laps, {
      min: 1,
      max: 64,
      fallback: 1,
    }),
    playerCount: clampInt(
      rawMap.playerCount ??
        rawMap.player_count ??
        rawMap.nbPlayers ??
        rawMap.nb_players ??
        rawMap.playCount ??
        rawMap.play_count ??
        rawMap.playersCount ??
        rawMap.players_count,
      {
        min: 0,
        max: 2147483647,
        fallback: 0,
      }
    ),
    thumbnailUrl: toText(rawMap.thumbnailUrl ?? rawMap.thumbnail_url ?? ""),
    downloadUrl: toText(rawMap.downloadUrl ?? rawMap.download_url ?? rawMap.fileUrl ?? ""),
    mapType: toText(rawMap.mapType ?? rawMap.map_type ?? rawMap.type ?? ""),
    mapStyle: toText(rawMap.mapStyle ?? rawMap.map_style ?? rawMap.style ?? ""),
    mapEnvironment: toText(rawMap.mapEnvironment ?? rawMap.map_environment ?? rawMap.environment ?? rawMap.mood ?? ""),
    mapCreatedAt: toFlexibleIso(
      rawMap.mapCreatedAt ?? rawMap.map_created_at ?? rawMap.createdAt ?? rawMap.created_at ?? rawMap.uploadTimestamp
    ),
    mapUpdatedAt: toFlexibleIso(
      rawMap.mapUpdatedAt ?? rawMap.map_updated_at ?? rawMap.updatedAt ?? rawMap.updated_at ?? rawMap.updateTimestamp
    ),
    raw: rawMap,
  };
}

function mergeMapDetail(baseMap, detailMap = null) {
  if (!detailMap) return baseMap;
  const detail = normalizeMapFromInput(detailMap, baseMap.slot);
  if (!detail) return baseMap;
  return {
    ...baseMap,
    ...detail,
    uid: baseMap.uid,
    slot: baseMap.slot,
    raw: {
      campaignMap: baseMap.raw || null,
      mapDetail: detailMap,
    },
  };
}

function extractActivities(payload) {
  if (Array.isArray(payload)) return payload;
  const obj = payload && typeof payload === "object" ? payload : {};
  const candidates = [obj.activityList, obj.activities, obj.clubActivityList, obj.results, obj.items, obj.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractMembers(payload) {
  if (Array.isArray(payload)) return payload;
  const obj = payload && typeof payload === "object" ? payload : {};
  const candidates = [
    obj.memberList,
    obj.members,
    obj.clubMemberList,
    obj.clubMembers,
    obj.results,
    obj.items,
    obj.data,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractActivityId(activity = {}) {
  return firstPositiveInt([activity.activityId, activity.activity_id, activity.id, activity.objectId]) || null;
}

function extractBucketId(value = {}) {
  return (
    firstPositiveInt([
      value.bucketId,
      value.bucket_id,
      value.activityObjectId,
      value.activity_object_id,
      value.objectId,
      value.object_id,
      value.bucket?.id,
      value.bucket?.bucketId,
    ]) || null
  );
}

function extractMapUidFromActivity(value = {}) {
  return firstTruthy([
    value.mapUid,
    value.map_uid,
    value.map?.uid,
    value.track?.uid,
    value.item?.uid,
    value.object?.uid,
  ]);
}

function isUploadLikeActivity(activity = {}) {
  const bucketId = extractBucketId(activity);
  if (bucketId) return true;
  const hints = [
    activity.activityType,
    activity.activity_type,
    activity.itemType,
    activity.item_type,
    activity.type,
    activity.targetType,
    activity.target_type,
    activity.objectType,
    activity.object_type,
    activity.name,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  if (hints.includes("bucket") || hints.includes("upload")) return true;
  return Boolean(extractMapUidFromActivity(activity));
}

function extractUploadMaps(payload = {}) {
  const candidates = [
    payload.maps,
    payload.mapList,
    payload.map_list,
    payload.uploadedMaps,
    payload.uploaded_map_list,
    payload.items,
    payload.bucket?.maps,
    payload.bucket?.mapList,
    payload.bucket?.map_list,
  ];
  for (const list of candidates) {
    if (!Array.isArray(list)) continue;
    const maps = [];
    for (let index = 0; index < list.length; index += 1) {
      const map = normalizeMapFromInput(list[index] || {}, index + 1);
      if (map) maps.push(map);
    }
    if (maps.length) return uniqueBy(maps, (map) => map.uid.toLowerCase());
  }
  const singleMap = normalizeMapFromInput(payload, 1);
  if (singleMap) return [singleMap];
  return [];
}

function extractUploadDescriptorFromActivity(activity = {}) {
  if (!isUploadLikeActivity(activity)) return null;
  const bucketId = extractBucketId(activity);
  const mapUid = extractMapUidFromActivity(activity);
  const maps = mapUid
    ? [
        {
          uid: mapUid,
          mapId: toText(activity.mapId ?? activity.map_id ?? ""),
          name: firstTruthy([activity.mapName, activity.map_name, activity.name, mapUid]),
          slot: 1,
          author: toText(activity.author ?? activity.authorId ?? activity.author_id ?? ""),
          submitter: toText(activity.submitter ?? activity.submitterId ?? activity.submitter_id ?? ""),
          raw: activity,
        },
      ]
    : [];
  return {
    bucketId: bucketId || null,
    bucketType: firstTruthy([activity.bucketType, activity.bucket_type, activity.itemType, activity.item_type, "map"]),
    name: firstTruthy([
      activity.bucketName,
      activity.bucket_name,
      activity.itemName,
      activity.item_name,
      activity.name,
    ]),
    activityId: extractActivityId(activity),
    mapCount: maps.length,
    active:
      parseOptionalBoolean(activity.active) ??
      parseOptionalBoolean(activity.isActive) ??
      parseOptionalBoolean(activity.enabled) ??
      true,
    maps,
    raw: activity,
  };
}

function extractUploadBuckets(payload) {
  const rawBuckets = Array.isArray(payload)
    ? payload
    : extractActivities(payload).length
      ? extractActivities(payload)
      : (() => {
          const obj = payload && typeof payload === "object" ? payload : {};
          const candidates = [obj.bucketList, obj.buckets, obj.clubBuckets, obj.results, obj.items, obj.data];
          for (const candidate of candidates) {
            if (Array.isArray(candidate)) return candidate;
          }
          return [];
        })();
  const out = [];
  for (const rawBucket of rawBuckets) {
    if (!rawBucket || typeof rawBucket !== "object") continue;
    const descriptor = {
      bucketId: extractBucketId(rawBucket),
      bucketType: firstTruthy([rawBucket.bucketType, rawBucket.bucket_type, rawBucket.type, "map"]),
      name: firstTruthy([rawBucket.name, rawBucket.title, rawBucket.bucketName, rawBucket.bucket_name]),
      activityId:
        extractActivityId(rawBucket) ||
        firstPositiveInt([rawBucket.activity?.id, rawBucket.activityId, rawBucket.activity_id]) ||
        null,
      mapCount: clampInt(rawBucket.mapCount ?? rawBucket.map_count, {
        min: 0,
        max: 2147483647,
        fallback: 0,
      }),
      active:
        parseOptionalBoolean(rawBucket.active) ??
        parseOptionalBoolean(rawBucket.isActive) ??
        parseOptionalBoolean(rawBucket.enabled) ??
        true,
      maps: extractUploadMaps(rawBucket),
      raw: rawBucket,
    };
    if (!descriptor.bucketId) {
      if (!descriptor.maps.length && !descriptor.name) continue;
      descriptor.bucketId = firstPositiveInt([rawBucket.id, rawBucket.objectId, rawBucket.object_id]) || null;
    }
    descriptor.mapCount = Math.max(descriptor.mapCount, descriptor.maps.length);
    out.push(descriptor);
  }
  return out;
}

function bucketMergeKey(bucket = {}, index = 0) {
  const bucketId = firstPositiveInt([bucket.bucketId, bucket.bucket_id, bucket.id]);
  if (bucketId) return `id:${bucketId}`;
  const activityId = firstPositiveInt([bucket.activityId, bucket.activity_id, bucket.activity?.id]);
  if (activityId) return `activity:${activityId}`;
  const name = firstTruthy([bucket.name, bucket.title, bucket.bucketName]).toLowerCase();
  if (name) return `name:${name}`;
  return `tmp:${index}`;
}

function mergeUploadBuckets(...lists) {
  const merged = new Map();
  for (const list of lists) {
    for (const bucket of Array.isArray(list) ? list : []) {
      if (!bucket) continue;
      const key = bucketMergeKey(bucket, merged.size);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          ...bucket,
          maps: uniqueBy(Array.isArray(bucket.maps) ? bucket.maps : [], (map) =>
            String(map?.uid || map?.mapUid || "").toLowerCase()
          ),
        });
        continue;
      }
      const mergedMaps = uniqueBy(
        [...(Array.isArray(existing.maps) ? existing.maps : []), ...(Array.isArray(bucket.maps) ? bucket.maps : [])],
        (map) => String(map?.uid || map?.mapUid || "").toLowerCase()
      );
      merged.set(key, {
        ...existing,
        ...bucket,
        mapCount: Math.max(Number(existing.mapCount || 0), Number(bucket.mapCount || 0), mergedMaps.length),
        maps: mergedMaps,
      });
    }
  }
  return [...merged.values()];
}

function isCampaignLikeActivity(activity = {}) {
  const hints = [
    activity.activityType,
    activity.activity_type,
    activity.itemType,
    activity.item_type,
    activity.type,
    activity.targetType,
    activity.target_type,
    activity.objectType,
    activity.object_type,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  if (hints.includes("campaign") || hints.includes("playlist")) return true;
  return Boolean(
    firstPositiveInt([activity.campaignId, activity.campaign_id, activity.campaign?.id, activity.campaign?.campaignId])
  );
}

function extractCampaignFromActivity(activity = {}) {
  if (!isCampaignLikeActivity(activity)) return null;
  const campaignId = firstPositiveInt([
    activity.campaignId,
    activity.campaign_id,
    activity.externalId,
    activity.external_id,
    activity.campaign?.id,
    activity.campaign?.campaignId,
  ]);
  const name = firstTruthy([
    activity.campaignName,
    activity.campaign_name,
    activity.campaign?.name,
    activity.name,
    activity.itemName,
    activity.item_name,
  ]);
  return {
    campaignId: campaignId || null,
    name: name || (campaignId ? `Campaign ${campaignId}` : ""),
    activityId: firstPositiveInt([activity.id, activity.activityId, activity.activity_id]) || null,
    activityType: firstTruthy([
      activity.activityType,
      activity.activity_type,
      activity.type,
      activity.itemType,
      activity.item_type,
    ]),
    raw: activity,
  };
}

function extractCampaignDescriptorFromObject(raw = {}) {
  const campaignId = firstPositiveInt([
    raw.campaignId,
    raw.campaign_id,
    raw.id,
    raw.campaign?.id,
    raw.playlistId,
    raw.playlist_id,
  ]);
  const name = firstTruthy([raw.name, raw.campaignName, raw.campaign_name, raw.campaign?.name]);
  if (!campaignId && !name) return null;
  return {
    campaignId: campaignId || null,
    name: name || (campaignId ? `Campaign ${campaignId}` : ""),
    activityId: firstPositiveInt([raw.activityId, raw.activity_id, raw.id]) || null,
    activityType: firstTruthy([raw.activityType, raw.activity_type, raw.type]),
    raw,
  };
}

function extractCampaignMaps(campaignPayload = {}) {
  const candidates = [
    campaignPayload.maps,
    campaignPayload.mapList,
    campaignPayload.map_list,
    campaignPayload.campaign?.maps,
    campaignPayload.campaign?.mapList,
    campaignPayload.campaign?.map_list,
    campaignPayload.campaign?.playlist,
    campaignPayload.campaign?.playlistMapList,
    campaignPayload.playlist,
    campaignPayload.playlistMapList,
  ];
  for (const list of candidates) {
    if (!Array.isArray(list)) continue;
    const normalized = [];
    for (let index = 0; index < list.length; index += 1) {
      const map = normalizeMapFromInput(list[index] || {}, index + 1);
      if (map) normalized.push(map);
    }
    if (normalized.length) {
      return uniqueBy(normalized, (map) => map.uid.toLowerCase());
    }
  }
  return [];
}

function buildCampaignSnapshot({ descriptor = {}, campaignPayload = {}, maps } = {}) {
  const campaignMaps = Array.isArray(maps) ? maps : extractCampaignMaps(campaignPayload);
  const campaignId = firstPositiveInt([
    campaignPayload?.campaignId,
    campaignPayload?.campaign_id,
    campaignPayload?.id,
    campaignPayload?.campaign?.id,
    descriptor.campaignId,
  ]);

  return {
    name:
      firstTruthy([
        campaignPayload?.name,
        campaignPayload?.campaignName,
        campaignPayload?.campaign?.name,
        descriptor.name,
      ]) || `Campaign ${descriptor.campaignId || "unknown"}`,
    campaignId: campaignId || null,
    activityId: descriptor.activityId || null,
    activityType:
      firstTruthy([
        descriptor.activityType,
        campaignPayload?.activityType,
        campaignPayload?.activity_type,
        campaignPayload?.type,
      ]) || null,
    campaignType:
      firstTruthy([campaignPayload?.campaignType, campaignPayload?.campaign_type, campaignPayload?.type]) || null,
    startTimestamp: toNullableIso(
      campaignPayload?.startTimestamp ??
        campaignPayload?.startDate ??
        campaignPayload?.start_date ??
        campaignPayload?.startsAt
    ),
    endTimestamp: toNullableIso(
      campaignPayload?.endTimestamp ?? campaignPayload?.endDate ?? campaignPayload?.end_date ?? campaignPayload?.endsAt
    ),
    published: Boolean(campaignPayload?.published ?? campaignPayload?.isPublished),
    leaderboardGroupUid: firstTruthy([
      campaignPayload?.leaderboardGroupUid,
      campaignPayload?.leaderboard_group_uid,
      campaignPayload?.leaderboardUid,
    ]),
    maps: campaignMaps,
    raw: campaignPayload,
  };
}

function collectMapperAccountIds(campaigns = []) {
  const out = [];
  for (const campaign of Array.isArray(campaigns) ? campaigns : []) {
    const maps = Array.isArray(campaign?.maps) ? campaign.maps : [];
    for (const map of maps) {
      const authorId = normalizeAccountId(map?.author);
      if (authorId) out.push(authorId);
      const submitterId = normalizeAccountId(map?.submitter);
      if (submitterId) out.push(submitterId);
    }
  }
  return uniqueBy(out, (accountId) => accountId);
}

export {
  chunk,
  firstTruthy,
  firstPositiveInt,
  normalizeCampaignSlotValue,
  normalizeMapUid,
  normalizeMapFromInput,
  mergeMapDetail,
  extractActivities,
  extractMembers,
  extractActivityId,
  extractBucketId,
  extractMapUidFromActivity,
  isUploadLikeActivity,
  extractUploadMaps,
  extractUploadDescriptorFromActivity,
  extractUploadBuckets,
  bucketMergeKey,
  mergeUploadBuckets,
  isCampaignLikeActivity,
  extractCampaignFromActivity,
  extractCampaignDescriptorFromObject,
  extractCampaignMaps,
  buildCampaignSnapshot,
  collectMapperAccountIds,
};
