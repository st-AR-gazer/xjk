import { normalizeAccountId } from "../live/trackmaniaOAuthClient.js";
import { buildMapNameCandidate } from "./mapNameStandardizer.js";

const DEFAULT_TRACKER_SYNC_CHUNK_SIZE = 350;
const DEFAULT_DAILY_HOUR_UTC = 3;
const DEFAULT_DAILY_MINUTE_UTC = 0;
const DEFAULT_DISCOVERY_INTERVAL_SECONDS = 3600;
const DEFAULT_DISCOVERY_CAMPAIGN_LIMIT = 25;
const DEFAULT_DISCOVERY_ACTIVITY_PAGE_SIZE = 100;
const DEFAULT_MAPPER_BOOTSTRAP_INTERVAL_SECONDS = 60;
const DEFAULT_MAPPER_MAINTENANCE_INTERVAL_SECONDS = 60;
const DEFAULT_MAPPER_PRIORITY_INTERVAL_SECONDS = 60;
const DEFAULT_MAPPER_SYNC_BATCH_SIZE = 50;
const DEFAULT_MAPPER_PRIORITY_BATCH_SIZE = 25;
const DEFAULT_MAPPER_PRIORITY_TOP_LIMIT = 250;
const DEFAULT_MAPPER_PRIORITY_REFRESH_SECONDS = 600;
const DEFAULT_MAPPER_REQUEST_GAP_MS = 5000;
const DEFAULT_MAPPER_CACHE_TTL_SECONDS = 86400;
const DEFAULT_MAPPER_PRIORITY_CACHE_TTL_SECONDS = 1800;
const DEFAULT_MAPPER_KNOWN_ACCOUNTS_REFRESH_SECONDS = 900;

function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseOptionalBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return undefined;
  const raw = String(value).trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return undefined;
}

function normalizeScheduleMode(value, fallback = "interval") {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "daily" || mode === "interval") return mode;
  return fallback;
}

function toText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function toNullableIso(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toIso(value, fallbackIso = new Date().toISOString()) {
  return toNullableIso(value) || fallbackIso;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function delay(ms) {
  const waitMs = Math.max(0, Number(ms) || 0);
  if (waitMs <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, waitMs));
}

function uniqueBy(items, makeKey) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = String(makeKey(item));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function normalizeWrFeedEntry(value = {}) {
  if (!value || typeof value !== "object") return null;
  const mapUid = toText(value.mapUid || value.uid || value.map_uid);
  const name = toText(value.name || value.mapName || value.map_name);
  const holder = toText(value.holder || value.wrHolder || value.displayName);
  const wrMs = clampInt(value.wrMs ?? value.wr_ms ?? value.recordTime, {
    min: 0,
    max: 2147483647,
    fallback: 0,
  });
  const at = toNullableIso(value.at || value.recordedAt || value.recorded_at || value.timestamp);
  if (!name && !mapUid) return null;
  return {
    mapUid,
    name: name || mapUid || "Unknown map",
    holder: holder || "Unknown",
    wrMs,
    at: at || new Date().toISOString(),
  };
}

function pickLatestWr(primary, secondary) {
  const first = normalizeWrFeedEntry(primary);
  const second = normalizeWrFeedEntry(secondary);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  const firstMs = Date.parse(first.at || "");
  const secondMs = Date.parse(second.at || "");
  if (Number.isFinite(firstMs) && Number.isFinite(secondMs)) {
    return firstMs >= secondMs ? first : second;
  }
  if (Number.isFinite(firstMs)) return first;
  if (Number.isFinite(secondMs)) return second;
  return first;
}

function groupLeaderboardBuckets(rows = [], { order = "alpha" } = {}) {
  const byBucket = new Map();
  for (const row of asArray(rows)) {
    const bucket = toText(row?.bucket, "Other") || "Other";
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket).push({
      rank: Number(row?.rank || 0),
      player: toText(row?.player, "Unknown") || "Unknown",
      wr_count: Number(row?.wr_count || 0),
      latest_wr_at: toNullableIso(row?.latest_wr_at) || null,
    });
  }

  const sortedBuckets = [...byBucket.keys()].sort((a, b) => {
    if (order === "season") {
      const seasonOrder = ["Winter", "Spring", "Summer", "Fall", "Other"];
      const left = seasonOrder.indexOf(a);
      const right = seasonOrder.indexOf(b);
      if (left !== -1 || right !== -1) {
        const safeLeft = left === -1 ? Number.MAX_SAFE_INTEGER : left;
        const safeRight = right === -1 ? Number.MAX_SAFE_INTEGER : right;
        if (safeLeft !== safeRight) return safeLeft - safeRight;
      }
    }

    if (order === "slot") {
      const leftNum = /^\d+$/.test(a) ? Number(a) : Number.MAX_SAFE_INTEGER;
      const rightNum = /^\d+$/.test(b) ? Number(b) : Number.MAX_SAFE_INTEGER;
      if (leftNum !== rightNum) return leftNum - rightNum;
    }

    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });

  return sortedBuckets.map((bucket) => {
    const players = (byBucket.get(bucket) || []).sort((a, b) => {
      const rankDiff = Number(a.rank || 0) - Number(b.rank || 0);
      if (rankDiff !== 0) return rankDiff;
      const countDiff = Number(b.wr_count || 0) - Number(a.wr_count || 0);
      if (countDiff !== 0) return countDiff;
      return String(a.player || "").localeCompare(String(b.player || ""), undefined, {
        sensitivity: "base",
      });
    });

    const totalWrs = players.reduce((sum, item) => sum + Number(item.wr_count || 0), 0);
    return {
      bucket,
      total_wrs: totalWrs,
      players,
    };
  });
}

function inferSeasonFromCampaignName(value) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("winter")) return "Winter";
  if (lower.includes("spring")) return "Spring";
  if (lower.includes("summer")) return "Summer";
  if (lower.includes("fall") || lower.includes("autumn")) return "Fall";
  return "Other";
}

function buildWrLeaderboardsFromTrackerMaps(trackerMaps = []) {
  const normalizedMaps = asArray(trackerMaps)
    .map((item) => {
      const player = toText(item?.wrHolder || item?.wr_holder || "");
      const wrMs = clampInt(item?.wrMs ?? item?.wr_ms, { min: 0, max: 2147483647, fallback: 0 });
      if (!player || wrMs <= 0) return null;
      const campaign = toText(item?.campaign, "Unassigned") || "Unassigned";
      const slotInt = clampInt(item?.slot, { min: 0, max: 5000, fallback: 0 });
      const slot = slotInt >= 1 && slotInt <= 25 ? String(slotInt).padStart(2, "0") : "Other";
      const latestWrAt = toNullableIso(item?.wrUpdatedAt || item?.wr_updated_at) || null;
      return {
        player,
        campaign,
        season: inferSeasonFromCampaignName(campaign),
        slot,
        latestWrAt,
      };
    })
    .filter(Boolean);

  const overallMap = new Map();
  const seasonMap = new Map();
  const campaignMap = new Map();
  const slotMap = new Map();

  const upsert = (target, bucket, player, latestWrAt) => {
    const key = `${bucket}::${player.toLowerCase()}`;
    if (!target.has(key)) {
      target.set(key, {
        bucket,
        player,
        wr_count: 0,
        latest_wr_at: latestWrAt,
      });
    }
    const current = target.get(key);
    current.wr_count += 1;
    if (latestWrAt && (!current.latest_wr_at || new Date(latestWrAt) > new Date(current.latest_wr_at))) {
      current.latest_wr_at = latestWrAt;
    }
  };

  for (const item of normalizedMaps) {
    upsert(overallMap, "overall", item.player, item.latestWrAt);
    upsert(seasonMap, item.season, item.player, item.latestWrAt);
    upsert(campaignMap, item.campaign, item.player, item.latestWrAt);
    upsert(slotMap, item.slot, item.player, item.latestWrAt);
  }

  const overall = [...overallMap.values()]
    .sort((a, b) => {
      const countDiff = Number(b.wr_count || 0) - Number(a.wr_count || 0);
      if (countDiff !== 0) return countDiff;
      const timeDiff =
        new Date(b.latest_wr_at || 0).getTime() - new Date(a.latest_wr_at || 0).getTime();
      if (timeDiff !== 0) return timeDiff;
      return String(a.player || "").localeCompare(String(b.player || ""), undefined, {
        sensitivity: "base",
      });
    })
    .map((row) => ({
      player: row.player,
      wr_count: Number(row.wr_count || 0),
      latest_wr_at: row.latest_wr_at || null,
    }));

  const toRankedRows = (target) => {
    const byBucket = new Map();
    for (const row of target.values()) {
      if (!byBucket.has(row.bucket)) byBucket.set(row.bucket, []);
      byBucket.get(row.bucket).push({
        player: row.player,
        wr_count: Number(row.wr_count || 0),
        latest_wr_at: row.latest_wr_at || null,
      });
    }

    const out = [];
    for (const [bucket, players] of byBucket.entries()) {
      players
        .sort((a, b) => {
          const countDiff = Number(b.wr_count || 0) - Number(a.wr_count || 0);
          if (countDiff !== 0) return countDiff;
          const timeDiff =
            new Date(b.latest_wr_at || 0).getTime() - new Date(a.latest_wr_at || 0).getTime();
          if (timeDiff !== 0) return timeDiff;
          return String(a.player || "").localeCompare(String(b.player || ""), undefined, {
            sensitivity: "base",
          });
        })
        .forEach((entry, index) => {
          out.push({
            bucket,
            player: entry.player,
            wr_count: entry.wr_count,
            latest_wr_at: entry.latest_wr_at,
            rank: index + 1,
          });
        });
    }
    return out;
  };

  return {
    overall,
    by_season_rows: toRankedRows(seasonMap),
    by_campaign_rows: toRankedRows(campaignMap),
    by_slot_rows: toRankedRows(slotMap),
  };
}

function chunk(items, size) {
  const safeSize = Math.max(1, Number(size) || 1);
  const out = [];
  for (let i = 0; i < items.length; i += safeSize) {
    out.push(items.slice(i, i + safeSize));
  }
  return out;
}

function firstTruthy(values = []) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

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
    slot: clampInt(rawMap.slot ?? rawMap.order ?? rawMap.position ?? fallbackSlot, {
      min: 1,
      max: 20000,
      fallback: fallbackSlot,
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
    mapEnvironment: toText(
      rawMap.mapEnvironment ?? rawMap.map_environment ?? rawMap.environment ?? rawMap.mood ?? ""
    ),
    mapCreatedAt: toNullableIso(
      rawMap.mapCreatedAt ??
        rawMap.map_created_at ??
        rawMap.createdAt ??
        rawMap.created_at ??
        rawMap.uploadTimestamp
    ),
    mapUpdatedAt: toNullableIso(
      rawMap.mapUpdatedAt ??
        rawMap.map_updated_at ??
        rawMap.updatedAt ??
        rawMap.updated_at ??
        rawMap.updateTimestamp
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
  const candidates = [
    obj.activityList,
    obj.activities,
    obj.clubActivityList,
    obj.results,
    obj.items,
    obj.data,
  ];
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
  return (
    firstPositiveInt([activity.activityId, activity.activity_id, activity.id, activity.objectId]) || null
  );
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
    bucketType: firstTruthy([
      activity.bucketType,
      activity.bucket_type,
      activity.itemType,
      activity.item_type,
      "map",
    ]),
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
          const candidates = [
            obj.bucketList,
            obj.buckets,
            obj.clubBuckets,
            obj.results,
            obj.items,
            obj.data,
          ];
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
      descriptor.bucketId =
        firstPositiveInt([rawBucket.id, rawBucket.objectId, rawBucket.object_id]) || null;
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
        mapCount: Math.max(
          Number(existing.mapCount || 0),
          Number(bucket.mapCount || 0),
          mergedMaps.length
        ),
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
    firstPositiveInt([
      activity.campaignId,
      activity.campaign_id,
      activity.campaign?.id,
      activity.campaign?.campaignId,
    ])
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
  const name = firstTruthy([
    raw.name,
    raw.campaignName,
    raw.campaign_name,
    raw.campaign?.name,
  ]);
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

class AlteredService {
  constructor({
    repository,
    trackerClient,
    trackerMapSyncClients = [],
    trackerDisplaynameClient = null,
    trackerClubClient = null,
    aggregatorClient = null,
    liveClient = null,
    mapperNameClient = null,
    trackerIntegrations = {},
    liveMonitorConfig = {},
    mapperNameSyncConfig = {},
    logger = console,
  }) {
    this.repository = repository;
    this.trackerClient = trackerClient;
    this.trackerDisplaynameClient = trackerDisplaynameClient;
    this.trackerClubClient = trackerClubClient;
    this.aggregatorClient = aggregatorClient;
    this.liveClient = liveClient;
    this.mapperNameClient = mapperNameClient;
    this.logger = logger;
    this.trackerMapSyncTargets = [];
    const pushTrackerTarget = ({ key, label, client, primary = false } = {}) => {
      if (!client || typeof client.bulkUpsertMaps !== "function") return;
      const targetKey = String(key || label || "tracker").trim().toLowerCase() || "tracker";
      const targetLabel = String(label || targetKey).trim() || targetKey;
      const adminBaseUrl = String(client?.adminBaseUrl || "").trim();
      const dedupeKey = adminBaseUrl ? `${targetKey}|${adminBaseUrl}` : targetKey;
      if (this.trackerMapSyncTargets.some((item) => item.dedupeKey === dedupeKey)) return;
      this.trackerMapSyncTargets.push({
        key: targetKey,
        label: targetLabel,
        dedupeKey,
        primary: Boolean(primary),
        adminBaseUrl,
        client,
      });
    };
    pushTrackerTarget({
      key: "wr",
      label: "tracker-wr",
      client: trackerClient,
      primary: true,
    });
    for (const target of Array.isArray(trackerMapSyncClients) ? trackerMapSyncClients : []) {
      pushTrackerTarget({
        key: target?.key,
        label: target?.label,
        client: target?.client,
        primary: false,
      });
    }
    this.trackerIntegrations = {
      displaynameEnabled:
        trackerIntegrations.displaynameEnabled === undefined
          ? true
          : Boolean(trackerIntegrations.displaynameEnabled),
      displaynameFallbackLocal:
        trackerIntegrations.displaynameFallbackLocal === undefined
          ? true
          : Boolean(trackerIntegrations.displaynameFallbackLocal),
      displaynameRelayAvailable: true,
      clubEnabled:
        trackerIntegrations.clubEnabled === undefined
          ? true
          : Boolean(trackerIntegrations.clubEnabled),
      clubFallbackLocal:
        trackerIntegrations.clubFallbackLocal === undefined
          ? true
          : Boolean(trackerIntegrations.clubFallbackLocal),
      clubRelayAvailable: true,
      lastDisplaynameRelay: null,
      lastDisplaynameRelayError: null,
      lastClubRelay: null,
      lastClubRelayError: null,
    };
    const storedMonitorConfig =
      typeof this.repository?.getLiveMonitorConfig === "function"
        ? this.repository.getLiveMonitorConfig()
        : null;
    const mergedMonitorConfig = {
      ...liveMonitorConfig,
      ...(storedMonitorConfig || {}),
    };
    this.liveMonitor = {
      enabled: Boolean(mergedMonitorConfig.enabled),
      scheduleMode: normalizeScheduleMode(mergedMonitorConfig.scheduleMode, "daily"),
      dailyHourUtc: clampInt(mergedMonitorConfig.dailyHourUtc, {
        min: 0,
        max: 23,
        fallback: DEFAULT_DAILY_HOUR_UTC,
      }),
      dailyMinuteUtc: clampInt(mergedMonitorConfig.dailyMinuteUtc, {
        min: 0,
        max: 59,
        fallback: DEFAULT_DAILY_MINUTE_UTC,
      }),
      clubId: clampInt(mergedMonitorConfig.clubId, {
        min: 1,
        max: 2147483647,
        fallback: 24231,
      }),
      intervalSeconds: clampInt(mergedMonitorConfig.intervalSeconds, {
        min: 60,
        max: 86400,
        fallback: 21600,
      }),
      discoveryEnabled:
        mergedMonitorConfig.discoveryEnabled === undefined
          ? true
          : Boolean(mergedMonitorConfig.discoveryEnabled),
      discoveryIntervalSeconds: clampInt(mergedMonitorConfig.discoveryIntervalSeconds, {
        min: 300,
        max: 86400,
        fallback: DEFAULT_DISCOVERY_INTERVAL_SECONDS,
      }),
      discoveryCampaignLimit: clampInt(mergedMonitorConfig.discoveryCampaignLimit, {
        min: 1,
        max: 250,
        fallback: DEFAULT_DISCOVERY_CAMPAIGN_LIMIT,
      }),
      discoveryActivityPageSize: clampInt(mergedMonitorConfig.discoveryActivityPageSize, {
        min: 1,
        max: 250,
        fallback: DEFAULT_DISCOVERY_ACTIVITY_PAGE_SIZE,
      }),
      activityPageSize: clampInt(mergedMonitorConfig.activityPageSize, {
        min: 1,
        max: 250,
        fallback: 250,
      }),
      activeOnly: Boolean(mergedMonitorConfig.activeOnly),
      fetchMapDetails:
        mergedMonitorConfig.fetchMapDetails === undefined
          ? true
          : Boolean(mergedMonitorConfig.fetchMapDetails),
      trackerChunkSize: clampInt(mergedMonitorConfig.trackerChunkSize, {
        min: 25,
        max: 1000,
        fallback: DEFAULT_TRACKER_SYNC_CHUNK_SIZE,
      }),
      timer: null,
      nextRunAt: null,
      discoveryTimer: null,
      nextDiscoveryRunAt: null,
      running: false,
      discoveryRunning: false,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastDurationMs: null,
      lastError: null,
      lastSummary: null,
      lastDiscoveryStartedAt: null,
      lastDiscoveryFinishedAt: null,
      lastDiscoveryDurationMs: null,
      lastDiscoveryError: null,
      lastDiscoverySummary: null,
      progress: null,
      runCounter: 0,
    };
    if (
      !storedMonitorConfig &&
      typeof this.repository?.upsertLiveMonitorConfig === "function"
    ) {
      this.repository.upsertLiveMonitorConfig(this.getLiveMonitorConfigSnapshot());
    }

    this.mapperNameSync = {
      enabled:
        mapperNameSyncConfig.enabled === undefined ? true : Boolean(mapperNameSyncConfig.enabled),
      bootstrapIntervalSeconds: clampInt(mapperNameSyncConfig.bootstrapIntervalSeconds, {
        min: 60,
        max: 86400,
        fallback: DEFAULT_MAPPER_BOOTSTRAP_INTERVAL_SECONDS,
      }),
      maintenanceIntervalSeconds: clampInt(mapperNameSyncConfig.maintenanceIntervalSeconds, {
        min: 60,
        max: 86400,
        fallback: DEFAULT_MAPPER_MAINTENANCE_INTERVAL_SECONDS,
      }),
      priorityIntervalSeconds: clampInt(mapperNameSyncConfig.priorityIntervalSeconds, {
        min: 60,
        max: 86400,
        fallback: DEFAULT_MAPPER_PRIORITY_INTERVAL_SECONDS,
      }),
      batchSize: clampInt(mapperNameSyncConfig.batchSize, {
        min: 1,
        max: 50,
        fallback: DEFAULT_MAPPER_SYNC_BATCH_SIZE,
      }),
      priorityBatchSize: clampInt(mapperNameSyncConfig.priorityBatchSize, {
        min: 1,
        max: 50,
        fallback: DEFAULT_MAPPER_PRIORITY_BATCH_SIZE,
      }),
      priorityTopLimit: clampInt(mapperNameSyncConfig.priorityTopLimit, {
        min: 1,
        max: 2000,
        fallback: DEFAULT_MAPPER_PRIORITY_TOP_LIMIT,
      }),
      priorityRefreshSeconds: clampInt(mapperNameSyncConfig.priorityRefreshSeconds, {
        min: 30,
        max: 86400,
        fallback: DEFAULT_MAPPER_PRIORITY_REFRESH_SECONDS,
      }),
      cacheTtlSeconds: clampInt(mapperNameSyncConfig.cacheTtlSeconds, {
        min: 0,
        max: 30 * 24 * 60 * 60,
        fallback: DEFAULT_MAPPER_CACHE_TTL_SECONDS,
      }),
      priorityCacheTtlSeconds: clampInt(mapperNameSyncConfig.priorityCacheTtlSeconds, {
        min: 0,
        max: 30 * 24 * 60 * 60,
        fallback: DEFAULT_MAPPER_PRIORITY_CACHE_TTL_SECONDS,
      }),
      minRequestGapMs: clampInt(mapperNameSyncConfig.minRequestGapMs, {
        min: DEFAULT_MAPPER_REQUEST_GAP_MS,
        max: 120000,
        fallback: DEFAULT_MAPPER_REQUEST_GAP_MS,
      }),
      mode: "bootstrap",
      timer: null,
      priorityTimer: null,
      nextRunAt: null,
      nextPriorityRunAt: null,
      running: false,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastError: null,
      lastSummary: null,
      nextLookupAllowedAtMs: 0,
      knownAccountsRefreshedAtMs: 0,
      knownAccountsRefreshSeconds: clampInt(mapperNameSyncConfig.knownAccountsRefreshSeconds, {
        min: 60,
        max: 86400,
        fallback: DEFAULT_MAPPER_KNOWN_ACCOUNTS_REFRESH_SECONDS,
      }),
      priorityAccountsRefreshedAtMs: 0,
      priorityAccountIds: [],
      runCounter: 0,
    };
  }

  getLiveMonitorConfigSnapshot() {
    return {
      enabled: this.liveMonitor.enabled,
      scheduleMode: this.liveMonitor.scheduleMode,
      dailyHourUtc: this.liveMonitor.dailyHourUtc,
      dailyMinuteUtc: this.liveMonitor.dailyMinuteUtc,
      clubId: this.liveMonitor.clubId,
      intervalSeconds: this.liveMonitor.intervalSeconds,
      discoveryEnabled: this.liveMonitor.discoveryEnabled,
      discoveryIntervalSeconds: this.liveMonitor.discoveryIntervalSeconds,
      discoveryCampaignLimit: this.liveMonitor.discoveryCampaignLimit,
      discoveryActivityPageSize: this.liveMonitor.discoveryActivityPageSize,
      activityPageSize: this.liveMonitor.activityPageSize,
      activeOnly: this.liveMonitor.activeOnly,
      fetchMapDetails: this.liveMonitor.fetchMapDetails,
      trackerChunkSize: this.liveMonitor.trackerChunkSize,
    };
  }

  persistLiveMonitorConfig() {
    if (typeof this.repository?.upsertLiveMonitorConfig !== "function") return;
    try {
      this.repository.upsertLiveMonitorConfig(this.getLiveMonitorConfigSnapshot());
    } catch (error) {
      this.logger.warn(
        `[altered-live] failed to persist monitor config: ${error?.message || error}`
      );
    }
  }

  updateLiveProgress(partial = {}) {
    const now = new Date().toISOString();
    const previous = this.liveMonitor.progress || {};
    const replaceCounters = Boolean(partial.replaceCounters);
    const nextCounters = replaceCounters
      ? { ...(partial.counters || {}) }
      : {
          ...(previous.counters || {}),
          ...(partial.counters || {}),
        };
    const next = {
      ...previous,
      ...partial,
      counters: nextCounters,
      updatedAt: now,
    };
    delete next.replaceCounters;
    if (next.percent !== undefined && next.percent !== null) {
      next.percent = clampInt(next.percent, { min: 0, max: 100, fallback: 0 });
    }
    this.liveMonitor.progress = next;
    return next;
  }

  computeNextScheduledRunIso({ fromTimeMs = Date.now() } = {}) {
    if (this.liveMonitor.scheduleMode === "daily") {
      const fromDate = new Date(fromTimeMs);
      const candidateMs = Date.UTC(
        fromDate.getUTCFullYear(),
        fromDate.getUTCMonth(),
        fromDate.getUTCDate(),
        this.liveMonitor.dailyHourUtc,
        this.liveMonitor.dailyMinuteUtc,
        0,
        0
      );
      const nextMs = candidateMs > fromTimeMs ? candidateMs : candidateMs + 24 * 60 * 60 * 1000;
      return new Date(nextMs).toISOString();
    }
    return new Date(fromTimeMs + this.liveMonitor.intervalSeconds * 1000).toISOString();
  }

  computeNextDiscoveryRunIso({ fromTimeMs = Date.now() } = {}) {
    return new Date(fromTimeMs + this.liveMonitor.discoveryIntervalSeconds * 1000).toISOString();
  }

  scheduleNextLiveMonitorRun({ fromTimeMs = Date.now() } = {}) {
    if (this.liveMonitor.timer) {
      clearTimeout(this.liveMonitor.timer);
      this.liveMonitor.timer = null;
    }
    if (!this.liveMonitor.enabled) {
      this.liveMonitor.nextRunAt = null;
      return false;
    }

    const nextRunAt = this.computeNextScheduledRunIso({ fromTimeMs });
    const delayMs = Math.max(1000, Date.parse(nextRunAt) - Date.now());
    this.liveMonitor.nextRunAt = nextRunAt;
    this.liveMonitor.timer = setTimeout(() => {
      this.liveMonitor.timer = null;
      this.runLiveMonitorCycle({
        reason:
          this.liveMonitor.scheduleMode === "daily" ? "daily-full-schedule" : "interval-full-schedule",
      })
        .catch((error) => {
          const message = error?.message || "Live monitor scheduled cycle failed.";
          this.liveMonitor.lastError = message;
          this.logger.warn(`[altered-live] scheduled cycle failed: ${message}`);
        })
        .finally(() => {
          this.scheduleNextLiveMonitorRun({ fromTimeMs: Date.now() });
        });
    }, delayMs);
    this.liveMonitor.timer.unref?.();
    return true;
  }

  scheduleNextDiscoveryRun({ fromTimeMs = Date.now() } = {}) {
    if (this.liveMonitor.discoveryTimer) {
      clearTimeout(this.liveMonitor.discoveryTimer);
      this.liveMonitor.discoveryTimer = null;
    }
    if (!this.liveMonitor.enabled || !this.liveMonitor.discoveryEnabled) {
      this.liveMonitor.nextDiscoveryRunAt = null;
      return false;
    }

    const nextRunAt = this.computeNextDiscoveryRunIso({ fromTimeMs });
    const delayMs = Math.max(1000, Date.parse(nextRunAt) - Date.now());
    this.liveMonitor.nextDiscoveryRunAt = nextRunAt;
    this.liveMonitor.discoveryTimer = setTimeout(() => {
      this.liveMonitor.discoveryTimer = null;
      this.runLiveDiscoveryCycle({
        reason: "hourly-discovery-schedule",
      })
        .catch((error) => {
          const message = error?.message || "Live discovery scheduled cycle failed.";
          this.liveMonitor.lastDiscoveryError = message;
          this.logger.warn(`[altered-live] scheduled discovery cycle failed: ${message}`);
        })
        .finally(() => {
          this.scheduleNextDiscoveryRun({ fromTimeMs: Date.now() });
        });
    }, delayMs);
    this.liveMonitor.discoveryTimer.unref?.();
    return true;
  }

  async getDashboard() {
    const [trackerStatusResult, wrFeedResult] = await Promise.all([
      this.trackerClient.getTrackerStatus(),
      this.trackerClient.getWrFeed(24),
    ]);
    const maps = this.repository.listMaps({
      limit: 5000,
    });
    const mapOptions = this.repository.getMapOptions();
    const summary = this.repository.getSummary();
    const wrFeed = Array.isArray(wrFeedResult?.data?.feed) ? wrFeedResult.data.feed : [];
    const latestWrEvent = this.repository.getLatestWrEvent();
    const latestWr = pickLatestWr(latestWrEvent
      ? {
          mapUid: latestWrEvent.mapUid,
          mapName: latestWrEvent.mapName,
          holder: latestWrEvent.holder,
          wrMs: latestWrEvent.wrMs,
          recordedAt: latestWrEvent.recordedAt,
        }
      : null, wrFeed[0] || null);
    const tracker = trackerStatusResult?.ok ? trackerStatusResult.data : null;
    return {
      maps,
      mapOptions,
      summary,
      wrFeed,
      latestWr,
      tracker,
    };
  }

  async getAlterationsStats() {
    const base = this.repository.getAlterationsStats();
    let totalWrChanges = 0;
    let lastRunAt = base.lastRunAt || null;

    const trackerRunsResult = await this.trackerClient.getTrackerRuns(300);
    if (trackerRunsResult?.ok) {
      const runs = Array.isArray(trackerRunsResult.data?.runs) ? trackerRunsResult.data.runs : [];
      totalWrChanges = runs.reduce((sum, run) => sum + Number(run?.wrChanges || 0), 0);
      if (runs[0]?.finishedAt) lastRunAt = runs[0].finishedAt;
    }

    return {
      total_maps: Number(base.totalMaps || 0),
      actively_tracked: Number(base.activelyTracked || 0),
      total_wr_changes: Number(totalWrChanges || 0),
      last_run_at: lastRunAt,
    };
  }

  async getAlterationsMaps({ limit = 50000 } = {}) {
    const maps = this.repository.listAlterationsMaps({
      limit,
    });

    const trackerResult = await this.trackerClient.getTrackedMaps(5000);
    if (!trackerResult?.ok) {
      return {
        maps,
        warnings: [`Tracker map counters unavailable: ${trackerResult?.error || "unknown error"}`],
      };
    }

    const trackedMaps = Array.isArray(trackerResult.data?.maps) ? trackerResult.data.maps : [];
    const countersByUid = new Map();
    for (const map of trackedMaps) {
      const uid = String(map?.uid || map?.mapUid || map?.map_uid || "").trim().toLowerCase();
      if (!uid) continue;
      countersByUid.set(uid, {
        check_count: Number(map?.checkCount || map?.check_count || 0),
        change_count: Number(map?.changeCount || map?.change_count || 0),
      });
    }

    return {
      maps: maps.map((map) => {
        const counter = countersByUid.get(String(map.map_uid || "").toLowerCase());
        if (!counter) return map;
        return {
          ...map,
          check_count: counter.check_count,
          change_count: counter.change_count,
        };
      }),
    };
  }

  getAlterationsCampaigns({ limit = 5000 } = {}) {
    return {
      campaigns: this.repository.listAlterationsCampaigns({
        limit,
      }),
    };
  }

  getAlterationsUploads({ limit = 20000 } = {}) {
    const uploads = this.repository.listAlterationsUploadMaps({
      limit,
    });
    return {
      uploads,
      count: uploads.length,
      generatedAt: new Date().toISOString(),
    };
  }

  async getAlterationsLeaderboards({
    limit = 50,
    overallLimit = 5000,
    perBucketLimit = 10,
  } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 500, fallback: 50 });
    const safeOverallLimit = clampInt(overallLimit, { min: 1, max: 5000, fallback: 400 });
    const safePerBucketLimit = clampInt(perBucketLimit, { min: 1, max: 50, fallback: 10 });

    const mostPlayedMaps = this.repository.listMostPlayedAlterationsMaps({
      limit: safeLimit,
    });
    const wrOverall = this.repository.listWrLeaderboardOverall({
      limit: safeOverallLimit,
    });
    const wrBySeasonRows = this.repository.listWrLeaderboardBySeason({
      perBucketLimit: safePerBucketLimit,
      maxRows: safePerBucketLimit * 24,
    });
    const wrByCampaignRows = this.repository.listWrLeaderboardByCampaign({
      perBucketLimit: safePerBucketLimit,
      maxRows: safePerBucketLimit * 800,
    });
    const wrBySlotRows = this.repository.listWrLeaderboardBySlot({
      perBucketLimit: safePerBucketLimit,
      maxRows: safePerBucketLimit * 40,
    });
    const baseStats = this.repository.getAlterationsStats();
    let resolvedWrOverall = wrOverall;
    let resolvedWrBySeasonRows = wrBySeasonRows;
    let resolvedWrByCampaignRows = wrByCampaignRows;
    let resolvedWrBySlotRows = wrBySlotRows;

    if (!resolvedWrOverall.length) {
      const trackerMapsResult = await this.trackerClient.getTrackedMaps(60000);
      if (trackerMapsResult?.ok) {
        const fallback = buildWrLeaderboardsFromTrackerMaps(trackerMapsResult?.data?.maps || []);
        if (fallback.overall.length) {
          resolvedWrOverall = fallback.overall.slice(0, safeOverallLimit);
          resolvedWrBySeasonRows = fallback.by_season_rows.filter(
            (row) => Number(row.rank || 0) <= safePerBucketLimit
          );
          resolvedWrByCampaignRows = fallback.by_campaign_rows.filter(
            (row) => Number(row.rank || 0) <= safePerBucketLimit
          );
          resolvedWrBySlotRows = fallback.by_slot_rows.filter(
            (row) => Number(row.rank || 0) <= safePerBucketLimit
          );
        }
      }
    }

    const totalWrs = resolvedWrOverall.reduce((sum, row) => sum + Number(row?.wr_count || 0), 0);

    const trackerMedalResult = await this.trackerClient.getMedalLeaderboards(safeLimit);
    const medalPayload = trackerMedalResult?.ok
      ? {
          available: true,
          note:
            toText(trackerMedalResult?.data?.note) ||
            "Counts are based on tracker leaderboard rows.",
          sampled_at: trackerMedalResult?.data?.sampledAt || new Date().toISOString(),
          maps_sampled: Number(trackerMedalResult?.data?.mapsSampled || 0),
          top_by_medal: trackerMedalResult?.data?.topByMedal || {
            author: [],
            gold: [],
            silver: [],
            bronze: [],
          },
        }
      : {
          available: false,
          note:
            toText(trackerMedalResult?.error) ||
            "Tracker medal leaderboard endpoint is unavailable.",
          sampled_at: null,
          maps_sampled: 0,
          top_by_medal: {
            author: [],
            gold: [],
            silver: [],
            bronze: [],
          },
        };

    return {
      generated_at: new Date().toISOString(),
      limits: {
        maps: safeLimit,
        overall_players: safeOverallLimit,
        per_bucket_players: safePerBucketLimit,
      },
      summary: {
        total_maps: Number(baseStats?.totalMaps || 0),
        active_maps: Number(baseStats?.activelyTracked || 0),
        unique_wr_players: resolvedWrOverall.length,
        wr_source: resolvedWrOverall === wrOverall ? "altered-db" : "tracker-fallback",
        total_wrs: totalWrs,
      },
      maps: {
        most_played: mostPlayedMaps,
      },
      wr: {
        overall: resolvedWrOverall,
        by_season: groupLeaderboardBuckets(resolvedWrBySeasonRows, { order: "season" }),
        by_campaign: groupLeaderboardBuckets(resolvedWrByCampaignRows, { order: "alpha" }),
        by_slot: groupLeaderboardBuckets(resolvedWrBySlotRows, { order: "slot" }),
      },
      medals: medalPayload,
    };
  }

  async getMonitorLeaderboardLive({ leaderboardLimit = 18, feedLimit = 80 } = {}) {
    const [leaderboards, trackerStatusResult, trackerFeedResult] = await Promise.all([
      this.getAlterationsLeaderboards({
        limit: leaderboardLimit,
        overallLimit: 350,
        perBucketLimit: 12,
      }),
      this.trackerClient.getTrackerStatus(),
      this.trackerClient.getWrFeed(feedLimit),
    ]);

    const alteredMapUids = new Set(
      this.repository
        .listAlteredMapUids({
          trackedOnly: true,
          limit: 200000,
        })
        .map((mapUid) => String(mapUid || "").toLowerCase())
        .filter(Boolean)
    );
    const trackerFeed = asArray(trackerFeedResult?.data?.feed);
    const filteredFeed = trackerFeed
      .filter((event) => alteredMapUids.has(String(event?.uid || event?.mapUid || "").toLowerCase()))
      .slice(0, Math.max(1, Math.min(Number(feedLimit) || 80, 300)));

    return {
      generatedAt: new Date().toISOString(),
      leaderboards,
      tracker: trackerStatusResult?.ok
        ? trackerStatusResult.data
        : { error: trackerStatusResult?.error || "Unable to load tracker status." },
      feed: filteredFeed,
      feedCount: filteredFeed.length,
      feedSourceCount: trackerFeed.length,
      alteredTrackedMapCount: alteredMapUids.size,
      warnings: [
        !trackerStatusResult?.ok
          ? trackerStatusResult?.error || "Tracker status unavailable."
          : null,
        !trackerFeedResult?.ok ? trackerFeedResult?.error || "Tracker feed unavailable." : null,
      ].filter(Boolean),
    };
  }

  receiveWrWebhook({ mapUid, mapName, holder, wrMs, recordedAt } = {}) {
    const uid = normalizeMapUid(mapUid);
    if (!uid) return { error: "mapUid is required." };

    const nowIso = new Date().toISOString();
    const mapInfo = this.repository.getMapInfo(uid);
    const resolvedName =
      toText(mapName) || toText(mapInfo?.map?.name) || toText(mapInfo?.name) || uid;
    const resolvedHolder = toText(holder) || "Unknown";
    const safeWrMs = clampInt(wrMs, { min: 0, max: 2147483647, fallback: 0 });
    const safeRecordedAt = toIso(recordedAt, nowIso);

    const inserted = this.repository.insertWrEvent({
      mapUid: uid,
      mapName: resolvedName,
      holder: resolvedHolder,
      wrMs: safeWrMs,
      recordedAt: safeRecordedAt,
      receivedAt: nowIso,
    });
    if (!inserted) return { error: "Failed to persist WR webhook event." };

    return {
      ok: true,
      event: {
        eventId: inserted.eventId,
        mapUid: inserted.mapUid,
        name: inserted.mapName,
        holder: inserted.holder,
        wrMs: inserted.wrMs,
        at: inserted.recordedAt,
        receivedAt: inserted.receivedAt,
      },
    };
  }

  getLatestWr({ includeRecent = true, limit = 10 } = {}) {
    const latest = this.repository.getLatestWrEvent();
    const recent = includeRecent ? this.repository.getRecentWrEvents(limit) : [];
    return {
      latestWr: latest
        ? {
            eventId: latest.eventId,
            mapUid: latest.mapUid,
            name: latest.mapName,
            holder: latest.holder,
            wrMs: latest.wrMs,
            at: latest.recordedAt,
            receivedAt: latest.receivedAt,
          }
        : null,
      feed: recent.map((item) => ({
        eventId: item.eventId,
        mapUid: item.mapUid,
        name: item.mapName,
        holder: item.holder,
        wrMs: item.wrMs,
        at: item.recordedAt,
        receivedAt: item.receivedAt,
      })),
    };
  }

  async submitUpdateRequest({
    uid,
    name,
    reason,
    requesterIp = "",
    requesterUserAgent = "",
  } = {}) {
    const mapUid = normalizeMapUid(uid);
    if (!mapUid) return { error: "Map UID is required." };

    const recent = this.repository.getRecentUpdateRequest(mapUid, 60);
    if (recent) {
      return {
        error:
          "This map was already requested recently. Please wait before requesting again.",
      };
    }

    const mapInfo = this.repository.getMapInfo(mapUid);
    const mapName =
      toText(name) || toText(mapInfo?.map?.name) || toText(mapInfo?.name) || mapUid;
    const nowIso = new Date().toISOString();
    const request = this.repository.insertUpdateRequest({
      mapUid,
      mapName,
      reason: toText(reason),
      status: "queued",
      requesterIp: toText(requesterIp),
      requesterUserAgent: toText(requesterUserAgent),
      createdAt: nowIso,
    });
    if (!request) return { error: "Unable to store update request." };

    let trackerWarning = null;
    try {
      const ensureResult = await this.ensureMapIsKnownToTracker(mapUid);
      if (!ensureResult?.ok) {
        trackerWarning = ensureResult?.error || "Tracker sync failed.";
      } else {
        const trackingResult = await this.updateMapTrackingAcrossTargets(mapUid, {
          tracked: true,
          status: "live",
        });
        if (!trackingResult?.ok) {
          trackerWarning = trackingResult?.error || "Unable to update tracker map status.";
        }
      }
    } catch (error) {
      trackerWarning = error?.message || "Tracker prep failed.";
    }

    return {
      ok: true,
      request,
      tracker: {
        prepared: !trackerWarning,
        warning: trackerWarning,
      },
    };
  }

  listUpdateRequests({ status = "", q = "", limit = 100, offset = 0 } = {}) {
    const requests = this.repository.listUpdateRequests({
      status,
      q,
      limit,
      offset,
    });
    return {
      requests,
      count: requests.length,
    };
  }

  updateUpdateRequestStatus({ requestId, status, resolutionNote = "" } = {}) {
    const updated = this.repository.updateUpdateRequestStatus({
      requestId,
      status,
      resolutionNote,
    });
    if (!updated) return { error: "Request not found or invalid status." };
    return {
      ok: true,
      request: updated,
    };
  }

  getCampaignTimeline(options = {}) {
    return this.repository.getCampaignTimeline(options);
  }

  getHookStatus() {
    return this.repository.getHookStatus();
  }

  getHookMaps({ q = "", limit = 1200 } = {}) {
    return this.repository.listMaps({ q, limit });
  }

  getHookRuns(limit = 30) {
    return this.repository.listHookRuns(limit);
  }

  getMapInfo(mapUid) {
    return this.repository.getMapInfo(mapUid);
  }

  processMapNameStandardization({ q = "", limit = 60000 } = {}) {
    const sourceMaps = this.repository.listMapsForNameStandardization({
      q,
      limit,
    });
    const candidates = sourceMaps
      .map((map) => buildMapNameCandidate(map))
      .filter((candidate) => String(candidate?.mapUid || "").trim().length > 0);

    const matched = candidates.reduce(
      (sum, candidate) => sum + (String(candidate.automationState) === "matched" ? 1 : 0),
      0
    );
    const unmatched = Math.max(0, candidates.length - matched);

    const upsert = this.repository.upsertMapNameCandidates({
      candidates,
    });
    if (upsert?.error) {
      return {
        error: upsert.error,
      };
    }

    return {
      ok: true,
      processed: Number(upsert.processed || 0),
      inserted: Number(upsert.inserted || 0),
      updated: Number(upsert.updated || 0),
      matched,
      unmatched,
      summary: this.repository.getMapNameCandidateSummary(),
    };
  }

  getMapNameStandardizationCandidates({
    q = "",
    automationState = "",
    reviewState = "",
    requiresRegex = undefined,
    limit = 220,
    offset = 0,
  } = {}) {
    return {
      summary: this.repository.getMapNameCandidateSummary(),
      candidates: this.repository.listMapNameCandidates({
        q,
        automationState,
        reviewState,
        requiresRegex,
        limit,
        offset,
      }),
    };
  }

  updateMapNameStandardizationCandidateReview({
    mapUid,
    reviewState = undefined,
    manualName = undefined,
    reviewNote = undefined,
  } = {}) {
    const result = this.repository.updateMapNameCandidateReview({
      mapUid,
      reviewState,
      manualName,
      reviewNote,
    });
    if (result?.error) return result;
    return {
      ok: true,
      candidate: result.candidate,
      summary: this.repository.getMapNameCandidateSummary(),
    };
  }

  updateHookConfig(payload = {}) {
    const hook = this.repository.updateHookConfig({
      hookKey: "altered-club",
      clubId: payload.clubId,
      clubName: payload.clubName,
      sourceLabel: payload.sourceLabel,
      enabled: payload.enabled,
      autoTrackNewMaps: payload.autoTrackNewMaps,
    });
    if (!hook) return { error: "Unable to update altered hook config." };
    return { hook };
  }

  updateMapCampaign({ mapUid, campaignName, slot }) {
    if (!campaignName || !String(campaignName).trim()) {
      return { error: "campaignName is required." };
    }
    const updated = this.repository.updateMapCampaign({
      mapUid,
      campaignName: String(campaignName).trim(),
      slot: Number(slot) || 1,
    });
    if (!updated) return { error: "Map not found." };
    return { updated };
  }

  getTrackerMapSyncTargets() {
    const targets = Array.isArray(this.trackerMapSyncTargets)
      ? this.trackerMapSyncTargets
      : [];
    return targets.filter((target) => target?.client && typeof target.client.bulkUpsertMaps === "function");
  }

  async updateMapTrackingAcrossTargets(mapUid, payload = {}) {
    const targets = this.getTrackerMapSyncTargets();
    if (!targets.length) {
      return {
        ok: false,
        error: "No tracker map-sync targets are configured.",
        targets: [],
      };
    }

    const results = [];
    for (const target of targets) {
      const result = await target.client.updateMapTracking(mapUid, payload);
      results.push({
        key: target.key,
        label: target.label,
        ok: Boolean(result?.ok),
        error: result?.ok ? null : result?.error || "Tracker map-tracking update failed.",
      });
    }

    const failed = results.filter((item) => !item.ok);
    return {
      ok: failed.length === 0,
      targets: results,
      error:
        failed.length > 0
          ? `Map tracking update failed on ${failed[0].label}: ${failed[0].error}`
          : null,
    };
  }

  async syncMapsToTrackerInChunks(maps = [], { onChunk } = {}) {
    const list = Array.isArray(maps) ? maps : [];
    if (!list.length) {
      return {
        ok: true,
        targetCount: 0,
        targetResults: [],
        chunkCount: 0,
        mapsSynced: 0,
      };
    }
    const targets = this.getTrackerMapSyncTargets();
    if (!targets.length) {
      return {
        ok: false,
        error: "No tracker map-sync targets are configured.",
        targetCount: 0,
        targetResults: [],
        chunkCount: 0,
        mapsSynced: 0,
      };
    }

    const targetResults = [];
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      const target = targets[targetIndex];
      const chunks = chunk(list, this.liveMonitor.trackerChunkSize);
      let mapsSynced = 0;
      let ok = true;
      let errorMessage = null;
      let chunksSynced = 0;
      for (let index = 0; index < chunks.length; index += 1) {
        const part = chunks[index];
        const result = await target.client.bulkUpsertMaps(part);
        if (!result?.ok) {
          ok = false;
          errorMessage = `Tracker sync failed on ${target.label} chunk ${index + 1}/${chunks.length}: ${
            result?.error || "unknown error"
          }`;
          chunksSynced = index;
          break;
        }
        mapsSynced += part.length;
        chunksSynced = index + 1;
        if (typeof onChunk === "function") {
          onChunk({
            index: index + 1,
            total: chunks.length,
            mapsSynced,
            chunkSize: part.length,
            targetKey: target.key,
            targetLabel: target.label,
            targetIndex: targetIndex + 1,
            targetTotal: targets.length,
          });
        }
      }

      targetResults.push({
        key: target.key,
        label: target.label,
        ok,
        error: errorMessage,
        chunkCount: chunks.length,
        chunksSynced,
        mapsSynced,
      });

      if (!ok) {
        return {
          ok: false,
          error: errorMessage,
          targetCount: targets.length,
          targetResults,
          chunkCount: chunks.length,
          chunksSynced,
          mapsSynced,
        };
      }
    }

    const primaryResult =
      targetResults.find((result) =>
        targets.find((target) => target.key === result.key && target.primary)
      ) || targetResults[0];
    return {
      ok: true,
      targetCount: targets.length,
      targetResults,
      chunkCount: Number(primaryResult?.chunkCount || 0),
      mapsSynced: Number(primaryResult?.mapsSynced || 0),
    };
  }

  async ensureMapIsKnownToTracker(mapUid) {
    const trackerMaps = this.repository.getMapsForTracker([mapUid]);
    if (!trackerMaps.length) {
      return { ok: false, error: "Map not found in altered storage." };
    }
    const upsertResult = await this.syncMapsToTrackerInChunks(trackerMaps);
    if (!upsertResult.ok) return upsertResult;
    return { ok: true, syncedMaps: trackerMaps.length };
  }

  async updateMapTracking({ mapUid, tracked, status, checkFrequency }) {
    const hasTracked = typeof tracked === "boolean";
    const hasStatus = typeof status === "string";
    const hasFrequency = Number.isFinite(checkFrequency);
    if (!hasTracked && !hasStatus && !hasFrequency) {
      return { error: "Nothing to update. Provide tracked/status/checkFrequency." };
    }

    const updated = this.repository.updateMapTracking({
      mapUid,
      tracked: hasTracked ? tracked : undefined,
      status: hasStatus ? String(status) : undefined,
      checkFrequency: hasFrequency ? Number(checkFrequency) : undefined,
    });
    if (!updated) return { error: "Map not found." };

    const ensureResult = await this.ensureMapIsKnownToTracker(mapUid);
    if (!ensureResult.ok) {
      return {
        updated,
        warning: `Updated altered storage but failed to sync map into tracker: ${ensureResult.error}`,
      };
    }

    const trackerUpdate = await this.updateMapTrackingAcrossTargets(mapUid, {
      tracked: hasTracked ? tracked : undefined,
      status: hasStatus ? String(status) : undefined,
      checkFrequency: hasFrequency ? Number(checkFrequency) : undefined,
    });

    if (!trackerUpdate.ok) {
      return {
        updated,
        warning: `Updated altered storage but failed to update tracker state: ${trackerUpdate.error}`,
      };
    }

    return { updated };
  }

  async syncHookSnapshot(snapshot = {}, options = {}) {
    const onProgress = typeof options?.onProgress === "function" ? options.onProgress : null;
    const relayClubSnapshotOption = parseOptionalBoolean(options?.relayClubSnapshot);
    const relayClubSnapshot =
      relayClubSnapshotOption === undefined ? true : Boolean(relayClubSnapshotOption);
    const snapshotCampaigns = Array.isArray(snapshot?.campaigns) ? snapshot.campaigns : [];
    const snapshotMaps = snapshotCampaigns.reduce((sum, campaign) => {
      const count = Array.isArray(campaign?.maps) ? campaign.maps.length : 0;
      return sum + count;
    }, 0);
    if (onProgress) {
      onProgress({
        phase: "sync-snapshot",
        percent: 78,
        message: `Storing fetched club snapshot in altered database (${snapshotCampaigns.length} campaigns, ${snapshotMaps} maps).`,
        counters: {
          campaignsToStore: snapshotCampaigns.length,
          mapsToStore: snapshotMaps,
        },
      });
    }
    const result = this.repository.ingestHookSnapshot({
      hookKey: "altered-club",
      ...snapshot,
    });
    if (result?.error) return { error: result.error, details: result };

    let clubRelay = null;
    if (relayClubSnapshot && this.shouldUseClubRelay()) {
      if (onProgress) {
        onProgress({
          phase: "relay-tracker-club",
          percent: 82,
          message: "Relaying hook snapshot to tracker-club service.",
          counters: {
            relayCampaigns: snapshotCampaigns.length,
            relayMembers: asArray(snapshot?.members).length,
            relayActivities: asArray(snapshot?.activities).length,
            relayUploadBuckets: asArray(snapshot?.uploadBuckets).length,
          },
        });
      }
      clubRelay = await this.relayClubSnapshotToTrackerClub({
        club: snapshot?.club || {
          id: firstPositiveInt([snapshot?.clubId]),
          name: toText(snapshot?.clubName || ""),
        },
        campaigns: snapshotCampaigns,
        members: asArray(snapshot?.members),
        activities: asArray(snapshot?.activities),
        uploadBuckets: asArray(snapshot?.uploadBuckets),
        observedAt: new Date().toISOString(),
      });
      if (clubRelay?.error) {
        result.clubRelayWarning = clubRelay.error;
        if (!this.trackerIntegrations.clubFallbackLocal) {
          return {
            error: clubRelay.error,
            details: {
              ...result,
              clubRelay,
            },
          };
        }
      }
    }

    const mapsForTracker = Array.isArray(result.mapsForTracker) ? result.mapsForTracker : [];
    let trackerSync = { ok: true, targetCount: 0, chunkCount: 0, mapsSynced: 0 };
    if (mapsForTracker.length) {
      trackerSync = await this.syncMapsToTrackerInChunks(mapsForTracker, {
        onChunk: ({
          index,
          total,
          mapsSynced,
          chunkSize,
          targetLabel,
          targetIndex,
          targetTotal,
        }) => {
          if (!onProgress) return;
          const percent = 84 + Math.floor((index / Math.max(total, 1)) * 14);
          onProgress({
            phase: "sync-tracker",
            percent,
            message: `Syncing maps into ${targetLabel || "tracker"} (${index}/${total} chunks).`,
            counters: {
              trackerChunksTotal: total,
              trackerChunksSynced: index,
              trackerChunkSize: chunkSize,
              trackerMapsToSync: mapsForTracker.length,
              trackerMapsSynced: mapsSynced,
              trackerTarget: targetLabel || null,
              trackerTargetIndex: Number(targetIndex || 0),
              trackerTargetTotal: Number(targetTotal || 0),
            },
          });
        },
      });
    }
    if (!trackerSync.ok) {
      result.trackerWarning = `Snapshot stored, but tracker sync failed: ${trackerSync.error}`;
      this.logger.warn(`[altered] tracker bulk-upsert failed after snapshot sync: ${trackerSync.error}`);
    }

    if (onProgress) {
      onProgress({
        phase: "sync-finished",
        percent: 99,
        message: "Snapshot + tracker sync completed.",
        counters: {
          campaignsToStore: snapshotCampaigns.length,
          mapsToStore: snapshotMaps,
          campaignsStored: Number(result.campaignsSeen || 0),
          mapsStored: Number(result.mapsSeen || 0),
          mapsInserted: Number(result.mapsInserted || 0),
          mapsUpdated: Number(result.mapsUpdated || 0),
          mapsLinked: Number(result.mapsLinked || 0),
          trackerTargetsTotal: Number(trackerSync.targetCount || 0),
          trackerChunksTotal: Number(trackerSync.chunkCount || 0),
          trackerChunksSynced: Number(trackerSync.chunkCount || 0),
          trackerMapsToSync: Number(mapsForTracker.length || 0),
          trackerMapsSynced: Number(trackerSync.mapsSynced || 0),
        },
      });
    }

    return {
      synced: {
        ...result,
        clubRelay,
        trackerSync,
      },
    };
  }

  shouldUseDisplaynameRelay() {
    return Boolean(
      this.trackerIntegrations.displaynameEnabled &&
        this.trackerIntegrations.displaynameRelayAvailable &&
        this.trackerDisplaynameClient?.isConfigured?.()
    );
  }

  shouldUseClubRelay() {
    return Boolean(
      this.trackerIntegrations.clubEnabled &&
        this.trackerIntegrations.clubRelayAvailable &&
        this.trackerClubClient?.isConfigured?.()
    );
  }

  async relayClubSnapshotToTrackerClub(snapshot = {}) {
    if (!this.shouldUseClubRelay()) {
      return {
        relayed: false,
        reason: "tracker-club relay disabled or not configured",
      };
    }

    const relay = await this.trackerClubClient.ingestSnapshot(snapshot);
    if (!relay?.ok) {
      const message = relay?.error || "Tracker-club snapshot ingest failed.";
      this.trackerIntegrations.lastClubRelayError = message;
      if (/not configured|disabled/i.test(message)) {
        this.trackerIntegrations.clubRelayAvailable = false;
      }
      return {
        relayed: false,
        error: message,
      };
    }

    const data = relay.data || {};
    const nowIso = new Date().toISOString();
    this.trackerIntegrations.lastClubRelay = {
      at: nowIso,
      ...data,
    };
    this.trackerIntegrations.clubRelayAvailable = true;
    this.trackerIntegrations.lastClubRelayError = null;
    return {
      relayed: true,
      at: nowIso,
      ...data,
    };
  }

  async getDisplayNamesFromAggregator(accountIds = []) {
    if (!this.aggregatorClient?.isConfigured?.()) {
      return {
        ok: false,
        error: "Aggregator client is not configured.",
        namesByAccountId: {},
      };
    }

    const normalizedAccountIds = uniqueBy(
      asArray(accountIds)
        .map((accountId) => normalizeAccountId(accountId))
        .filter(Boolean),
      (accountId) => accountId
    );
    if (!normalizedAccountIds.length) {
      return {
        ok: true,
        namesByAccountId: {},
        resolved: 0,
      };
    }

    const result = await this.aggregatorClient.getDisplayNames(normalizedAccountIds);
    if (!result?.ok) {
      return {
        ok: false,
        error: result?.error || "Failed to query display names from aggregator.",
        namesByAccountId: {},
      };
    }

    const rows = asArray(result?.data?.names);
    const namesByAccountId = {};
    for (const row of rows) {
      const accountId = normalizeAccountId(row?.accountId);
      const displayName = toText(row?.displayName);
      if (!accountId || !displayName) continue;
      namesByAccountId[accountId] = displayName;
    }

    return {
      ok: true,
      namesByAccountId,
      resolved: Object.keys(namesByAccountId).length,
    };
  }

  async runTrackerDisplaynameSync({
    accountIds = [],
    reason = "altered-sync",
    forceCandidates = false,
  } = {}) {
    if (!this.shouldUseDisplaynameRelay()) {
      return {
        ok: false,
        error: "tracker-displayname relay disabled or not configured",
      };
    }

    const normalizedAccountIds = uniqueBy(
      asArray(accountIds)
        .map((accountId) => normalizeAccountId(accountId))
        .filter(Boolean),
      (accountId) => accountId
    );

    const run = await this.trackerDisplaynameClient.runSync({
      accountIds: normalizedAccountIds,
      forceCandidates: Boolean(forceCandidates),
    });
    if (!run?.ok) {
      const message = run?.error || "Tracker-displayname sync failed.";
      this.trackerIntegrations.lastDisplaynameRelayError = message;
      if (/not configured|disabled/i.test(message)) {
        this.trackerIntegrations.displaynameRelayAvailable = false;
      }
      return {
        ok: false,
        error: message,
      };
    }

    const namesResult = await this.getDisplayNamesFromAggregator(normalizedAccountIds);
    if (!namesResult?.ok) {
      const message = namesResult?.error || "Tracker-displayname sync completed but names could not be read.";
      this.trackerIntegrations.lastDisplaynameRelayError = message;
      return {
        ok: false,
        error: message,
      };
    }

    const data = run.data || {};
    const nowIso = new Date().toISOString();
    this.trackerIntegrations.lastDisplaynameRelay = {
      at: nowIso,
      reason,
      requested: Number(data.requested || normalizedAccountIds.length),
      resolved: Number(data.resolved || namesResult.resolved || 0),
      accepted: Number(data.accepted || 0),
      inserted: Number(data.inserted || 0),
      updated: Number(data.updated || 0),
      unchanged: Number(data.unchanged || 0),
      queueRemaining: Number(data.queueRemaining || 0),
    };
    this.trackerIntegrations.displaynameRelayAvailable = true;
    this.trackerIntegrations.lastDisplaynameRelayError = null;

    return {
      ok: true,
      summary: this.trackerIntegrations.lastDisplaynameRelay,
      namesByAccountId: namesResult.namesByAccountId,
    };
  }

  getLiveMonitorStatus() {
    const configured = Boolean(this.liveClient?.isConfigured?.());
    const mapperNameTracking =
      this.mapperNameClient?.getStatus?.() || {
        enabled: false,
        configured: false,
      };
    return {
      configured,
      authRequired: "nadeo-account",
      authAdvice: configured
        ? null
        : "Configure ALTERED_LIVE_DEDI_LOGIN and ALTERED_LIVE_DEDI_PASSWORD (or ALTERED_LIVE_ACCESS_TOKEN / ALTERED_LIVE_REFRESH_TOKEN).",
      integrations: {
        trackerDisplayname: {
          enabled: this.trackerIntegrations.displaynameEnabled,
          configured: Boolean(this.trackerDisplaynameClient?.isConfigured?.()),
          relayAvailable: this.trackerIntegrations.displaynameRelayAvailable,
          fallbackLocal: this.trackerIntegrations.displaynameFallbackLocal,
          lastRelay: this.trackerIntegrations.lastDisplaynameRelay,
          lastRelayError: this.trackerIntegrations.lastDisplaynameRelayError,
        },
        trackerClub: {
          enabled: this.trackerIntegrations.clubEnabled,
          configured: Boolean(this.trackerClubClient?.isConfigured?.()),
          relayAvailable: this.trackerIntegrations.clubRelayAvailable,
          fallbackLocal: this.trackerIntegrations.clubFallbackLocal,
          lastRelay: this.trackerIntegrations.lastClubRelay,
          lastRelayError: this.trackerIntegrations.lastClubRelayError,
        },
        trackerMapSync: {
          targets: this.getTrackerMapSyncTargets().map((target) => ({
            key: target.key,
            label: target.label,
            primary: Boolean(target.primary),
            adminBaseUrl: target.adminBaseUrl || null,
          })),
        },
      },
      monitor: {
        enabled: this.liveMonitor.enabled,
        running: this.liveMonitor.running,
        scheduleMode: this.liveMonitor.scheduleMode,
        dailyHourUtc: this.liveMonitor.dailyHourUtc,
        dailyMinuteUtc: this.liveMonitor.dailyMinuteUtc,
        nextRunAt: this.liveMonitor.nextRunAt,
        discoveryEnabled: this.liveMonitor.discoveryEnabled,
        discoveryIntervalSeconds: this.liveMonitor.discoveryIntervalSeconds,
        discoveryCampaignLimit: this.liveMonitor.discoveryCampaignLimit,
        discoveryActivityPageSize: this.liveMonitor.discoveryActivityPageSize,
        nextDiscoveryRunAt: this.liveMonitor.nextDiscoveryRunAt,
        discoveryRunning: this.liveMonitor.discoveryRunning,
        clubId: this.liveMonitor.clubId,
        intervalSeconds: this.liveMonitor.intervalSeconds,
        activityPageSize: this.liveMonitor.activityPageSize,
        activeOnly: this.liveMonitor.activeOnly,
        fetchMapDetails: this.liveMonitor.fetchMapDetails,
        trackerChunkSize: this.liveMonitor.trackerChunkSize,
        progress: this.liveMonitor.progress,
        lastStartedAt: this.liveMonitor.lastStartedAt,
        lastFinishedAt: this.liveMonitor.lastFinishedAt,
        lastDurationMs: this.liveMonitor.lastDurationMs,
        lastError: this.liveMonitor.lastError,
        lastSummary: this.liveMonitor.lastSummary,
        lastDiscoveryStartedAt: this.liveMonitor.lastDiscoveryStartedAt,
        lastDiscoveryFinishedAt: this.liveMonitor.lastDiscoveryFinishedAt,
        lastDiscoveryDurationMs: this.liveMonitor.lastDiscoveryDurationMs,
        lastDiscoveryError: this.liveMonitor.lastDiscoveryError,
        lastDiscoverySummary: this.liveMonitor.lastDiscoverySummary,
      },
      auth: this.liveClient?.getStatus?.() || null,
      mapperNameTracking,
      mapperNameSync: this.getMapperNameSyncStatus(),
    };
  }

  getMapperNameSyncStatus() {
    const stats =
      typeof this.repository?.getMapperAccountStats === "function"
        ? this.repository.getMapperAccountStats()
        : {
            totalAccounts: 0,
            unresolvedAccounts: 0,
            neverResolvedAccounts: 0,
            latestResolvedAt: null,
            oldestResolvedAt: null,
          };
    return {
      enabled: this.mapperNameSync.enabled,
      relayMode:
        this.shouldUseDisplaynameRelay()
          ? "tracker-displayname-primary"
          : "local-primary",
      relayEnabled: this.trackerIntegrations.displaynameEnabled,
      relayConfigured: Boolean(this.trackerDisplaynameClient?.isConfigured?.()),
      relayAvailable: this.trackerIntegrations.displaynameRelayAvailable,
      relayFallbackLocal: this.trackerIntegrations.displaynameFallbackLocal,
      relayLast: this.trackerIntegrations.lastDisplaynameRelay,
      relayLastError: this.trackerIntegrations.lastDisplaynameRelayError,
      mode: this.mapperNameSync.mode,
      running: this.mapperNameSync.running,
      nextRunAt: this.mapperNameSync.nextRunAt,
      nextPriorityRunAt: this.mapperNameSync.nextPriorityRunAt,
      bootstrapIntervalSeconds: this.mapperNameSync.bootstrapIntervalSeconds,
      maintenanceIntervalSeconds: this.mapperNameSync.maintenanceIntervalSeconds,
      priorityIntervalSeconds: this.mapperNameSync.priorityIntervalSeconds,
      batchSize: this.mapperNameSync.batchSize,
      priorityBatchSize: this.mapperNameSync.priorityBatchSize,
      priorityTopLimit: this.mapperNameSync.priorityTopLimit,
      cacheTtlSeconds: this.mapperNameSync.cacheTtlSeconds,
      priorityCacheTtlSeconds: this.mapperNameSync.priorityCacheTtlSeconds,
      knownAccountsRefreshSeconds: this.mapperNameSync.knownAccountsRefreshSeconds,
      minRequestGapMs: this.mapperNameSync.minRequestGapMs,
      knownAccountsRefreshedAt:
        this.mapperNameSync.knownAccountsRefreshedAtMs > 0
          ? new Date(this.mapperNameSync.knownAccountsRefreshedAtMs).toISOString()
          : null,
      priorityAccountsRefreshedAt:
        this.mapperNameSync.priorityAccountsRefreshedAtMs > 0
          ? new Date(this.mapperNameSync.priorityAccountsRefreshedAtMs).toISOString()
          : null,
      priorityAccountsTracked: Number(this.mapperNameSync.priorityAccountIds.length || 0),
      lastStartedAt: this.mapperNameSync.lastStartedAt,
      lastFinishedAt: this.mapperNameSync.lastFinishedAt,
      lastError: this.mapperNameSync.lastError,
      lastSummary: this.mapperNameSync.lastSummary,
      stats,
    };
  }

  async updateMapperNameSyncConfig(options = {}) {
    if (options.enabled !== undefined) {
      this.mapperNameSync.enabled = Boolean(options.enabled);
    }
    if (options.bootstrapIntervalSeconds !== undefined) {
      this.mapperNameSync.bootstrapIntervalSeconds = clampInt(options.bootstrapIntervalSeconds, {
        min: 60,
        max: 86400,
        fallback: this.mapperNameSync.bootstrapIntervalSeconds,
      });
    }
    if (options.maintenanceIntervalSeconds !== undefined) {
      this.mapperNameSync.maintenanceIntervalSeconds = clampInt(
        options.maintenanceIntervalSeconds,
        {
          min: 60,
          max: 86400,
          fallback: this.mapperNameSync.maintenanceIntervalSeconds,
        }
      );
    }
    if (options.priorityIntervalSeconds !== undefined) {
      this.mapperNameSync.priorityIntervalSeconds = clampInt(options.priorityIntervalSeconds, {
        min: 60,
        max: 86400,
        fallback: this.mapperNameSync.priorityIntervalSeconds,
      });
    }
    if (options.batchSize !== undefined) {
      this.mapperNameSync.batchSize = clampInt(options.batchSize, {
        min: 1,
        max: 50,
        fallback: this.mapperNameSync.batchSize,
      });
    }
    if (options.priorityBatchSize !== undefined) {
      this.mapperNameSync.priorityBatchSize = clampInt(options.priorityBatchSize, {
        min: 1,
        max: 50,
        fallback: this.mapperNameSync.priorityBatchSize,
      });
    }
    if (options.priorityTopLimit !== undefined) {
      this.mapperNameSync.priorityTopLimit = clampInt(options.priorityTopLimit, {
        min: 1,
        max: 2000,
        fallback: this.mapperNameSync.priorityTopLimit,
      });
    }
    if (options.priorityRefreshSeconds !== undefined) {
      this.mapperNameSync.priorityRefreshSeconds = clampInt(options.priorityRefreshSeconds, {
        min: 30,
        max: 86400,
        fallback: this.mapperNameSync.priorityRefreshSeconds,
      });
    }
    if (options.knownAccountsRefreshSeconds !== undefined) {
      this.mapperNameSync.knownAccountsRefreshSeconds = clampInt(
        options.knownAccountsRefreshSeconds,
        {
          min: 60,
          max: 86400,
          fallback: this.mapperNameSync.knownAccountsRefreshSeconds,
        }
      );
    }
    if (options.cacheTtlSeconds !== undefined) {
      this.mapperNameSync.cacheTtlSeconds = clampInt(options.cacheTtlSeconds, {
        min: 0,
        max: 30 * 24 * 60 * 60,
        fallback: this.mapperNameSync.cacheTtlSeconds,
      });
    }
    if (options.priorityCacheTtlSeconds !== undefined) {
      this.mapperNameSync.priorityCacheTtlSeconds = clampInt(options.priorityCacheTtlSeconds, {
        min: 0,
        max: 30 * 24 * 60 * 60,
        fallback: this.mapperNameSync.priorityCacheTtlSeconds,
      });
    }
    if (options.minRequestGapMs !== undefined) {
      this.mapperNameSync.minRequestGapMs = clampInt(options.minRequestGapMs, {
        min: DEFAULT_MAPPER_REQUEST_GAP_MS,
        max: 120000,
        fallback: this.mapperNameSync.minRequestGapMs,
      });
    }
    if (options.resetKnownAccountsCache) {
      this.mapperNameSync.knownAccountsRefreshedAtMs = 0;
    }
    if (options.resetPriorityAccountsCache) {
      this.mapperNameSync.priorityAccountsRefreshedAtMs = 0;
      this.mapperNameSync.priorityAccountIds = [];
    }

    const useRelay = this.shouldUseDisplaynameRelay();
    if (useRelay) {
      await this.stopMapperNameSyncScheduler();
      const relayConfig = await this.trackerDisplaynameClient.updateConfig({
        enabled: this.mapperNameSync.enabled,
        schedulerEnabled: this.mapperNameSync.enabled,
        maintenanceIntervalSeconds: this.mapperNameSync.maintenanceIntervalSeconds,
        staleAfterSeconds: this.mapperNameSync.cacheTtlSeconds,
        batchSize: this.mapperNameSync.batchSize,
        maxAccountsPerCycle: Math.max(
          this.mapperNameSync.batchSize,
          this.mapperNameSync.priorityBatchSize,
          this.mapperNameSync.priorityTopLimit
        ),
      });
      if (!relayConfig?.ok) {
        this.trackerIntegrations.lastDisplaynameRelayError =
          relayConfig?.error || "Failed to update tracker-displayname config.";
        if (/not configured|disabled/i.test(this.trackerIntegrations.lastDisplaynameRelayError)) {
          this.trackerIntegrations.displaynameRelayAvailable = false;
        }
        if (this.trackerIntegrations.displaynameFallbackLocal && this.mapperNameSync.enabled) {
          this.scheduleNextMapperSyncRun({ priority: false, fromTimeMs: Date.now() });
          this.scheduleNextMapperSyncRun({ priority: true, fromTimeMs: Date.now() });
        }
      } else {
        this.trackerIntegrations.displaynameRelayAvailable = true;
        this.trackerIntegrations.lastDisplaynameRelayError = null;
      }
    } else if (!this.mapperNameSync.enabled) {
      await this.stopMapperNameSyncScheduler();
    } else {
      this.scheduleNextMapperSyncRun({ priority: false, fromTimeMs: Date.now() });
      this.scheduleNextMapperSyncRun({ priority: true, fromTimeMs: Date.now() });
    }
    return this.getMapperNameSyncStatus();
  }

  computeNextMapperSyncRunIso({ priority = false, fromTimeMs = Date.now() } = {}) {
    const delaySeconds = priority
      ? this.mapperNameSync.priorityIntervalSeconds
      : this.mapperNameSync.mode === "bootstrap"
        ? this.mapperNameSync.bootstrapIntervalSeconds
        : this.mapperNameSync.maintenanceIntervalSeconds;
    return new Date(fromTimeMs + Math.max(1, delaySeconds) * 1000).toISOString();
  }

  scheduleNextMapperSyncRun({ priority = false, fromTimeMs = Date.now() } = {}) {
    if (priority) {
      if (this.mapperNameSync.priorityTimer) {
        clearTimeout(this.mapperNameSync.priorityTimer);
        this.mapperNameSync.priorityTimer = null;
      }
    } else if (this.mapperNameSync.timer) {
      clearTimeout(this.mapperNameSync.timer);
      this.mapperNameSync.timer = null;
    }

    if (!this.mapperNameSync.enabled) {
      if (priority) this.mapperNameSync.nextPriorityRunAt = null;
      else this.mapperNameSync.nextRunAt = null;
      return false;
    }

    const nextRunAt = this.computeNextMapperSyncRunIso({ priority, fromTimeMs });
    const delayMs = Math.max(1000, Date.parse(nextRunAt) - Date.now());

    if (priority) {
      this.mapperNameSync.nextPriorityRunAt = nextRunAt;
      this.mapperNameSync.priorityTimer = setTimeout(() => {
        this.mapperNameSync.priorityTimer = null;
        this.runMapperNameSyncCycle({
          priority: true,
          reason: "priority-schedule",
        }).catch((error) => {
          this.logger.warn(`[altered-mapper-sync] priority cycle failed: ${error?.message || error}`);
        });
      }, delayMs);
      this.mapperNameSync.priorityTimer.unref?.();
      return true;
    }

    this.mapperNameSync.nextRunAt = nextRunAt;
    this.mapperNameSync.timer = setTimeout(() => {
      this.mapperNameSync.timer = null;
      this.runMapperNameSyncCycle({
        priority: false,
        reason: "schedule",
      }).catch((error) => {
        this.logger.warn(`[altered-mapper-sync] cycle failed: ${error?.message || error}`);
      });
    }, delayMs);
    this.mapperNameSync.timer.unref?.();
    return true;
  }

  async refreshMapperAccountPool({ force = false } = {}) {
    if (
      typeof this.repository?.listKnownMapperAccountIds !== "function" ||
      typeof this.repository?.seedMapperAccounts !== "function"
    ) {
      return {
        ok: false,
        error: "Mapper account repository methods are unavailable.",
      };
    }
    const nowMs = Date.now();
    const ageMs = nowMs - Number(this.mapperNameSync.knownAccountsRefreshedAtMs || 0);
    if (
      !force &&
      Number(this.mapperNameSync.knownAccountsRefreshedAtMs || 0) > 0 &&
      ageMs < this.mapperNameSync.knownAccountsRefreshSeconds * 1000
    ) {
      return {
        ok: true,
        refreshed: false,
      };
    }

    const accountIds = this.repository.listKnownMapperAccountIds({
      limit: 200000,
    });
    const seed = this.repository.seedMapperAccounts({
      accountIds,
      source: "altered-monitor",
    });
    if (seed?.error) {
      return {
        ok: false,
        error: seed.error,
      };
    }

    this.mapperNameSync.knownAccountsRefreshedAtMs = nowMs;
    return {
      ok: true,
      refreshed: true,
      accountIdsSeen: Number(accountIds.length || 0),
      inserted: Number(seed.inserted || 0),
      updated: Number(seed.updated || 0),
    };
  }

  async refreshPriorityMapperAccounts({ force = false } = {}) {
    const nowMs = Date.now();
    const ageMs = nowMs - Number(this.mapperNameSync.priorityAccountsRefreshedAtMs || 0);
    if (
      !force &&
      Number(this.mapperNameSync.priorityAccountsRefreshedAtMs || 0) > 0 &&
      ageMs < this.mapperNameSync.priorityRefreshSeconds * 1000
    ) {
      return {
        ok: true,
        refreshed: false,
        count: this.mapperNameSync.priorityAccountIds.length,
      };
    }

    if (!this.trackerClient?.getTopWrAccounts) {
      this.mapperNameSync.priorityAccountIds = [];
      this.mapperNameSync.priorityAccountsRefreshedAtMs = nowMs;
      return {
        ok: true,
        refreshed: true,
        count: 0,
      };
    }

    const response = await this.trackerClient.getTopWrAccounts(this.mapperNameSync.priorityTopLimit);
    if (!response?.ok) {
      return {
        ok: false,
        error: response?.error || "Failed to fetch top WR accounts from tracker.",
      };
    }

    const accounts = asArray(response?.data?.accounts);
    this.mapperNameSync.priorityAccountIds = uniqueBy(
      accounts
        .map((entry) => normalizeAccountId(entry?.accountId ?? entry?.account_id))
        .filter(Boolean),
      (accountId) => accountId
    );
    this.mapperNameSync.priorityAccountsRefreshedAtMs = nowMs;
    return {
      ok: true,
      refreshed: true,
      count: this.mapperNameSync.priorityAccountIds.length,
    };
  }

  async syncMapperNamesBatch({ accountIds = [], source = "mapper-sync" } = {}) {
    const normalizedAccountIds = uniqueBy(
      asArray(accountIds)
        .map((accountId) => normalizeAccountId(accountId))
        .filter(Boolean),
      (accountId) => accountId
    );
    if (!normalizedAccountIds.length) {
      return {
        ok: true,
        requested: 0,
        resolved: 0,
        trackerCacheHits: 0,
        nadeoRequested: 0,
        nadeoResolved: 0,
        namesUpdated: 0,
        historyInserted: 0,
        mapLinksUpdated: 0,
        trackerPlayersSynced: 0,
      };
    }

    if (this.shouldUseDisplaynameRelay()) {
      const relayResult = await this.runTrackerDisplaynameSync({
        accountIds: normalizedAccountIds,
        reason: source || "mapper-sync",
        forceCandidates: false,
      });
      if (relayResult?.ok) {
        const namesByAccountId = relayResult.namesByAccountId || {};
        const nameUpsert = this.repository.upsertMapperNames({
          accountIds: normalizedAccountIds,
          namesByAccountId,
          source,
        });
        if (nameUpsert?.error) {
          return {
            ok: false,
            error: nameUpsert.error,
            requested: normalizedAccountIds.length,
          };
        }
        const mapLinks = this.repository.updateMapMapperDisplayNames({
          namesByAccountId,
        });
        if (mapLinks?.error) {
          this.logger.warn(
            `[altered-mapper-sync] map mapper-name link update failed: ${mapLinks.error}`
          );
        }
        const playersPayload = Object.entries(namesByAccountId)
          .map(([accountId, displayName]) => ({
            accountId: normalizeAccountId(accountId),
            displayName: String(displayName || "").trim(),
            observedAt: new Date().toISOString(),
          }))
          .filter((entry) => entry.accountId && entry.displayName);
        let trackerPlayersSynced = 0;
        let trackerWarning = null;
        if (playersPayload.length && this.trackerClient?.bulkUpsertPlayerNames) {
          const trackerSync = await this.trackerClient.bulkUpsertPlayerNames(playersPayload, source);
          if (trackerSync?.ok) {
            trackerPlayersSynced = Number(
              trackerSync?.data?.playersSeen ||
                trackerSync?.data?.synced?.playersSeen ||
                playersPayload.length
            );
          } else {
            trackerWarning = trackerSync?.error || "Failed to sync player names to tracker.";
          }
        }
        return {
          ok: true,
          relay: "tracker-displayname",
          warning: trackerWarning,
          requested: normalizedAccountIds.length,
          resolved: Object.keys(namesByAccountId).length,
          trackerCacheHits: Object.keys(namesByAccountId).length,
          nadeoRequested: Number(relayResult.summary?.requested || normalizedAccountIds.length),
          nadeoResolved: Number(relayResult.summary?.resolved || Object.keys(namesByAccountId).length),
          namesUpdated: Number(nameUpsert.namesUpdated || 0),
          historyInserted: Number(nameUpsert.historyInserted || 0),
          mapLinksUpdated: Number(mapLinks?.updated || 0),
          trackerPlayersSynced,
        };
      }
      if (!this.trackerIntegrations.displaynameFallbackLocal) {
        return {
          ok: false,
          error: relayResult?.error || "Tracker-displayname sync failed.",
          requested: normalizedAccountIds.length,
        };
      }
    }

    let trackerLookupWarning = null;
    let trackerNamesByAccountId = {};
    if (this.trackerClient?.getPlayerNames) {
      const trackerLookup = await this.trackerClient.getPlayerNames(normalizedAccountIds, {
        chunkSize: 50,
      });
      if (trackerLookup?.namesByAccountId && typeof trackerLookup.namesByAccountId === "object") {
        trackerNamesByAccountId = trackerLookup.namesByAccountId;
      }
      if (trackerLookup?.error) {
        trackerLookupWarning = trackerLookup.error;
      }
    }

    const unresolvedAccountIds = normalizedAccountIds.filter(
      (accountId) => !trackerNamesByAccountId[accountId]
    );
    let nadeoRequested = 0;
    let nadeoResolved = 0;
    let nadeoNamesByAccountId = {};

    if (unresolvedAccountIds.length > 0) {
      if (!this.mapperNameClient || !this.mapperNameClient.isConfigured?.()) {
        return {
          ok: false,
          error: "Mapper name client is not configured.",
          requested: normalizedAccountIds.length,
          trackerCacheHits: Object.keys(trackerNamesByAccountId).length,
          nadeoRequested,
          nadeoResolved,
          trackerLookupWarning,
        };
      }

      const waitMs = Math.max(
        0,
        Number(this.mapperNameSync.nextLookupAllowedAtMs || 0) - Date.now()
      );
      if (waitMs > 0) {
        await delay(waitMs);
      }

      let resolved;
      try {
        resolved = await this.mapperNameClient.getDisplayNames(unresolvedAccountIds);
      } finally {
        this.mapperNameSync.nextLookupAllowedAtMs = Date.now() + this.mapperNameSync.minRequestGapMs;
      }

      nadeoRequested = Number(resolved?.requested || unresolvedAccountIds.length);
      nadeoResolved = Number(resolved?.resolved || 0);
      nadeoNamesByAccountId =
        resolved?.namesByAccountId && typeof resolved.namesByAccountId === "object"
          ? resolved.namesByAccountId
          : {};

      if (!resolved?.ok) {
        return {
          ok: false,
          error: resolved?.error || "Failed to resolve mapper display names.",
          requested: normalizedAccountIds.length,
          trackerCacheHits: Object.keys(trackerNamesByAccountId).length,
          nadeoRequested,
          nadeoResolved,
          trackerLookupWarning,
        };
      }
    }

    const namesByAccountId = {
      ...trackerNamesByAccountId,
      ...nadeoNamesByAccountId,
    };
    const nameUpsert = this.repository.upsertMapperNames({
      accountIds: normalizedAccountIds,
      namesByAccountId,
      source,
    });
    if (nameUpsert?.error) {
      return {
        ok: false,
        error: nameUpsert.error,
        requested: normalizedAccountIds.length,
      };
    }

    const mapLinks = this.repository.updateMapMapperDisplayNames({
      namesByAccountId,
    });
    if (mapLinks?.error) {
      this.logger.warn(`[altered-mapper-sync] map mapper-name link update failed: ${mapLinks.error}`);
    }

    const playersPayload = Object.entries(nadeoNamesByAccountId)
      .map(([accountId, displayName]) => ({
        accountId: normalizeAccountId(accountId),
        displayName: String(displayName || "").trim(),
        observedAt: new Date().toISOString(),
      }))
      .filter((entry) => entry.accountId && entry.displayName);

    let trackerPlayersSynced = 0;
    let trackerWarning = null;
    if (playersPayload.length && this.trackerClient?.bulkUpsertPlayerNames) {
      const trackerSync = await this.trackerClient.bulkUpsertPlayerNames(playersPayload, source);
      if (trackerSync?.ok) {
        trackerPlayersSynced = Number(
          trackerSync?.data?.playersSeen ||
            trackerSync?.data?.synced?.playersSeen ||
            playersPayload.length
        );
      } else {
        trackerWarning = trackerSync?.error || "Failed to sync player names to tracker.";
      }
    }
    const warning = [trackerLookupWarning, trackerWarning].filter(Boolean).join(" | ") || null;

    return {
      ok: true,
      warning,
      requested: normalizedAccountIds.length,
      resolved: Object.keys(namesByAccountId).length,
      trackerCacheHits: Object.keys(trackerNamesByAccountId).length,
      nadeoRequested,
      nadeoResolved,
      namesUpdated: Number(nameUpsert.namesUpdated || 0),
      historyInserted: Number(nameUpsert.historyInserted || 0),
      mapLinksUpdated: Number(mapLinks?.updated || 0),
      trackerPlayersSynced,
    };
  }

  async runMapperNameSyncCycle({
    priority = false,
    reason = "schedule",
    force = false,
    accountIds = [],
    allowWhenDisabled = false,
    limit = null,
  } = {}) {
    const normalizedRequestedAccountIds = uniqueBy(
      asArray(accountIds)
        .map((accountId) => normalizeAccountId(accountId))
        .filter(Boolean),
      (accountId) => accountId
    );
    const targetedSync = normalizedRequestedAccountIds.length > 0;

    if (!this.mapperNameSync.enabled && !allowWhenDisabled) {
      return { skipped: true, reason: "disabled" };
    }
    if (this.mapperNameSync.running) {
      return { skipped: true, reason: "already-running" };
    }

    const startedAt = new Date().toISOString();
    this.mapperNameSync.running = true;
    this.mapperNameSync.lastStartedAt = startedAt;
    this.mapperNameSync.lastError = null;
    this.mapperNameSync.runCounter += 1;

    try {
      const poolRefresh = await this.refreshMapperAccountPool({
        force: reason === "startup" || force || targetedSync,
      });
      if (poolRefresh?.error) {
        this.mapperNameSync.lastError = poolRefresh.error;
        return {
          error: poolRefresh.error,
        };
      }

      if (targetedSync && typeof this.repository?.seedMapperAccounts === "function") {
        const seeded = this.repository.seedMapperAccounts({
          accountIds: normalizedRequestedAccountIds,
          source: "manual-targeted",
        });
        if (seeded?.error) {
          this.mapperNameSync.lastError = seeded.error;
          return {
            error: seeded.error,
          };
        }
      }

      const statsBefore = this.repository.getMapperAccountStats();
      this.mapperNameSync.mode =
        Number(statsBefore.unresolvedAccounts || 0) > 0 ? "bootstrap" : "maintenance";

      const priorityRefresh = await this.refreshPriorityMapperAccounts({
        force: reason === "startup" || priority,
      });
      if (priorityRefresh?.error) {
        this.logger.warn(
          `[altered-mapper-sync] failed to refresh priority accounts: ${priorityRefresh.error}`
        );
      }

      const syncLimit = clampInt(
        limit !== null && limit !== undefined
          ? Number(limit)
          : targetedSync
            ? normalizedRequestedAccountIds.length
            : priority
              ? this.mapperNameSync.priorityBatchSize
              : this.mapperNameSync.batchSize,
        {
          min: 1,
          max: 5000,
          fallback: priority ? this.mapperNameSync.priorityBatchSize : this.mapperNameSync.batchSize,
        }
      );
      const minResolvedAgeSeconds = force
        ? 0
        : priority
          ? this.mapperNameSync.priorityCacheTtlSeconds
          : this.mapperNameSync.cacheTtlSeconds;
      const preferredAccountIds = targetedSync
        ? normalizedRequestedAccountIds
        : this.mapperNameSync.priorityAccountIds;
      let batchRows = this.repository.getMapperAccountsForSync({
        limit: syncLimit,
        accountIds: preferredAccountIds,
        minResolvedAgeSeconds,
      });
      if (!batchRows.length && !targetedSync && preferredAccountIds.length) {
        batchRows = this.repository.getMapperAccountsForSync({
          limit: syncLimit,
          accountIds: [],
          minResolvedAgeSeconds,
        });
      }
      const accountIds = batchRows.map((row) => row.accountId).filter(Boolean);
      if (!accountIds.length) {
        const statsAfter = this.repository.getMapperAccountStats();
        this.mapperNameSync.mode =
          Number(statsAfter.unresolvedAccounts || 0) > 0 ? "bootstrap" : "maintenance";
        const cacheSkipped = targetedSync
          ? Math.max(0, normalizedRequestedAccountIds.length - accountIds.length)
          : 0;
        this.mapperNameSync.lastSummary = {
          cycle: priority ? "priority" : "main",
          reason,
          skipped: true,
          force,
          targetedSync,
          requestedAccountIds: normalizedRequestedAccountIds.length,
          cacheTtlSeconds: minResolvedAgeSeconds,
          cacheSkipped,
          batchSize: 0,
          statsBefore,
          statsAfter,
          completedAt: new Date().toISOString(),
        };
        return this.mapperNameSync.lastSummary;
      }

      const source = priority ? "mapper-sync-priority" : "mapper-sync";
      const syncResult = await this.syncMapperNamesBatch({
        accountIds,
        source,
      });
      if (syncResult?.error) {
        this.mapperNameSync.lastError = syncResult.error;
      }

      const statsAfter = this.repository.getMapperAccountStats();
      this.mapperNameSync.mode =
        Number(statsAfter.unresolvedAccounts || 0) > 0 ? "bootstrap" : "maintenance";

      this.mapperNameSync.lastSummary = {
        cycle: priority ? "priority" : "main",
        reason,
        force,
        targetedSync,
        requestedAccountIds: normalizedRequestedAccountIds.length,
        cacheTtlSeconds: minResolvedAgeSeconds,
        batchSize: accountIds.length,
        ...syncResult,
        statsBefore,
        statsAfter,
        completedAt: new Date().toISOString(),
      };
      return this.mapperNameSync.lastSummary;
    } catch (error) {
      const message = error?.message || "Mapper sync cycle failed.";
      this.mapperNameSync.lastError = message;
      return {
        error: message,
      };
    } finally {
      this.mapperNameSync.running = false;
      this.mapperNameSync.lastFinishedAt = new Date().toISOString();
      this.scheduleNextMapperSyncRun({ priority: false });
      this.scheduleNextMapperSyncRun({ priority: true });
    }
  }

  async runMapperNameSyncNow({ priority = false, force = false, reason = "manual-api" } = {}) {
    if (this.shouldUseDisplaynameRelay()) {
      const relayResult = await this.runTrackerDisplaynameSync({
        accountIds: [],
        reason,
        forceCandidates: Boolean(force),
      });
      if (relayResult?.ok) {
        return {
          ok: true,
          relay: "tracker-displayname",
          ...relayResult.summary,
        };
      }
      if (!this.trackerIntegrations.displaynameFallbackLocal) {
        return {
          error: relayResult?.error || "Tracker-displayname sync failed.",
        };
      }
    }
    return this.runMapperNameSyncCycle({
      priority: Boolean(priority),
      force: Boolean(force),
      allowWhenDisabled: true,
      reason,
    });
  }

  async syncSpecificMapperAccountIds({
    accountIds = [],
    force = false,
    reason = "manual-targeted-api",
  } = {}) {
    const normalizedRequested = uniqueBy(
      asArray(accountIds)
        .map((accountId) => normalizeAccountId(accountId))
        .filter(Boolean),
      (accountId) => accountId
    );
    if (this.shouldUseDisplaynameRelay()) {
      const relayResult = await this.runTrackerDisplaynameSync({
        accountIds: normalizedRequested,
        reason,
        forceCandidates: Boolean(force),
      });
      if (relayResult?.ok) {
        const upsert = this.repository.upsertMapperNames({
          accountIds: normalizedRequested,
          namesByAccountId: relayResult.namesByAccountId || {},
          source: reason || "manual-targeted-api",
        });
        if (upsert?.error) {
          return {
            error: upsert.error,
          };
        }
        const mapLinks = this.repository.updateMapMapperDisplayNames({
          namesByAccountId: relayResult.namesByAccountId || {},
        });
        return {
          ok: true,
          relay: "tracker-displayname",
          requested: normalizedRequested.length,
          resolved: Object.keys(relayResult.namesByAccountId || {}).length,
          namesUpdated: Number(upsert.namesUpdated || 0),
          historyInserted: Number(upsert.historyInserted || 0),
          mapLinksUpdated: Number(mapLinks?.updated || 0),
          summary: relayResult.summary || null,
        };
      }
      if (!this.trackerIntegrations.displaynameFallbackLocal) {
        return {
          error: relayResult?.error || "Tracker-displayname sync failed.",
        };
      }
    }
    return this.runMapperNameSyncCycle({
      priority: false,
      force: Boolean(force),
      allowWhenDisabled: true,
      reason,
      accountIds,
      limit: 5000,
    });
  }

  async startMapperNameSyncScheduler() {
    if (!this.mapperNameSync.enabled) {
      await this.stopMapperNameSyncScheduler();
      return false;
    }
    if (this.shouldUseDisplaynameRelay()) {
      await this.stopMapperNameSyncScheduler();
      const relayConfig = await this.trackerDisplaynameClient.updateConfig({
        enabled: true,
        schedulerEnabled: true,
        maintenanceIntervalSeconds: this.mapperNameSync.maintenanceIntervalSeconds,
        staleAfterSeconds: this.mapperNameSync.cacheTtlSeconds,
        batchSize: this.mapperNameSync.batchSize,
        maxAccountsPerCycle: Math.max(
          this.mapperNameSync.batchSize,
          this.mapperNameSync.priorityBatchSize,
          this.mapperNameSync.priorityTopLimit
        ),
      });
      if (!relayConfig?.ok) {
        this.trackerIntegrations.lastDisplaynameRelayError =
          relayConfig?.error || "Failed to start tracker-displayname scheduler.";
        if (/not configured|disabled/i.test(this.trackerIntegrations.lastDisplaynameRelayError)) {
          this.trackerIntegrations.displaynameRelayAvailable = false;
        }
        if (!this.trackerIntegrations.displaynameFallbackLocal) return false;
      } else {
        this.trackerIntegrations.displaynameRelayAvailable = true;
        this.trackerIntegrations.lastDisplaynameRelayError = null;
        return true;
      }
    }
    this.scheduleNextMapperSyncRun({ priority: false, fromTimeMs: Date.now() });
    this.scheduleNextMapperSyncRun({ priority: true, fromTimeMs: Date.now() });
    this.runMapperNameSyncCycle({
      priority: false,
      reason: "startup",
    }).catch((error) => {
      this.logger.warn(`[altered-mapper-sync] startup cycle failed: ${error?.message || error}`);
    });
    return true;
  }

  async stopMapperNameSyncScheduler() {
    if (this.shouldUseDisplaynameRelay()) {
      const relayConfig = await this.trackerDisplaynameClient.updateConfig({
        schedulerEnabled: false,
      });
      if (!relayConfig?.ok) {
        this.trackerIntegrations.lastDisplaynameRelayError =
          relayConfig?.error || "Failed to stop tracker-displayname scheduler.";
      } else {
        this.trackerIntegrations.displaynameRelayAvailable = true;
        this.trackerIntegrations.lastDisplaynameRelayError = null;
      }
    }
    if (this.mapperNameSync.timer) {
      clearTimeout(this.mapperNameSync.timer);
      this.mapperNameSync.timer = null;
    }
    if (this.mapperNameSync.priorityTimer) {
      clearTimeout(this.mapperNameSync.priorityTimer);
      this.mapperNameSync.priorityTimer = null;
    }
    this.mapperNameSync.nextRunAt = null;
    this.mapperNameSync.nextPriorityRunAt = null;
    this.mapperNameSync.running = false;
    return true;
  }

  async resolveLiveClient(options = {}) {
    const baseClient = this.liveClient;
    if (!baseClient) {
      return {
        error: "Live client is not initialized.",
      };
    }

    if (baseClient.isConfigured()) {
      return {
        liveClient: baseClient,
        authSource: "service-config",
      };
    }

    const ubisoftAccessToken = String(options?.authContext?.ubisoftAccessToken || "").trim();
    if (ubisoftAccessToken) {
      try {
        const scopedClient = await baseClient.createUserScopedClient({
          ubisoftAccessToken,
        });
        return {
          liveClient: scopedClient,
          authSource: "ubisoft-session",
        };
      } catch (error) {
        const exchangeError =
          error?.message ||
          "Failed to exchange Ubisoft session token for Nadeo access token.";
        return {
          error: `${exchangeError} Configure a service account for Live API calls using ALTERED_LIVE_DEDI_LOGIN and ALTERED_LIVE_DEDI_PASSWORD (or ALTERED_LIVE_ACCESS_TOKEN / ALTERED_LIVE_REFRESH_TOKEN).`,
        };
      }
    }

    if (!baseClient.isConfigured()) {
      return {
        error:
          "Live monitor is not configured. Provide ALTERED_LIVE auth variables (dedi credentials or access token), or sign in with Ubisoft OAuth.",
      };
    }

    return {
      liveClient: baseClient,
      authSource: "service-config",
    };
  }

  resolveLiveOptions(options = {}) {
    return {
      clubId: clampInt(options.clubId ?? this.liveMonitor.clubId, {
        min: 1,
        max: 2147483647,
        fallback: this.liveMonitor.clubId,
      }),
      activityPageSize: clampInt(
        options.activityPageSize ?? options.activityLength ?? this.liveMonitor.activityPageSize,
        { min: 1, max: 250, fallback: this.liveMonitor.activityPageSize }
      ),
      activeOnly:
        parseOptionalBoolean(options.activeOnly) !== undefined
          ? parseOptionalBoolean(options.activeOnly)
          : this.liveMonitor.activeOnly,
      fetchMapDetails:
        parseOptionalBoolean(options.fetchMapDetails) !== undefined
          ? parseOptionalBoolean(options.fetchMapDetails)
          : this.liveMonitor.fetchMapDetails,
    };
  }

  async fetchAllClubActivities(
    liveClient,
    clubId,
    { activityPageSize, activeOnly, maxPages = 1200, onPageLoaded = null }
  ) {
    const out = [];
    let offset = 0;
    let page = 0;
    let pagesLoaded = 0;
    const maxPageCount = clampInt(maxPages, {
      min: 1,
      max: 5000,
      fallback: 1200,
    });
    let effectiveActiveOnly = Boolean(activeOnly);
    let forcedActiveOnlyFallback = false;
    while (page < maxPageCount) {
      let payload;
      try {
        payload = await liveClient.getClubActivities(clubId, {
          length: activityPageSize,
          offset,
          activeOnly: effectiveActiveOnly,
        });
      } catch (error) {
        const statusCode = Number(error?.statusCode || 0);
        const message = String(error?.message || "");
        const responseText = String(error?.responseText || "");
        const playerNotFound =
          message.includes("player:error-notFound") ||
          responseText.includes("player:error-notFound");
        if (!effectiveActiveOnly && offset === 0 && statusCode === 404 && playerNotFound) {
          effectiveActiveOnly = true;
          forcedActiveOnlyFallback = true;
          continue;
        }
        throw error;
      }
      const activities = extractActivities(payload);
      if (!activities.length) break;
      out.push(...activities);
      pagesLoaded += 1;
      if (typeof onPageLoaded === "function") {
        onPageLoaded({
          page: page + 1,
          offset,
          pageSize: activities.length,
          totalLoaded: out.length,
          activeOnly: effectiveActiveOnly,
          forcedFallback: forcedActiveOnlyFallback,
        });
      }
      if (activities.length < activityPageSize) break;
      offset += activities.length;
      page += 1;
    }
    return {
      activities: out,
      pagesLoaded,
      effectiveActiveOnly,
      forcedActiveOnlyFallback,
    };
  }

  async fetchAllClubMembers(liveClient, clubId, { pageSize = 250, onPageLoaded = null } = {}) {
    const out = [];
    let offset = 0;
    let page = 0;
    let pagesLoaded = 0;
    const maxPageCount = 1200;
    const safePageSize = clampInt(pageSize, { min: 1, max: 250, fallback: 250 });
    while (page < maxPageCount) {
      const payload = await liveClient.getClubMembers(clubId, {
        length: safePageSize,
        offset,
      });
      const members = extractMembers(payload);
      if (!members.length) break;
      out.push(...members);
      pagesLoaded += 1;
      if (typeof onPageLoaded === "function") {
        onPageLoaded({
          page: page + 1,
          offset,
          pageSize: members.length,
          totalLoaded: out.length,
        });
      }
      if (members.length < safePageSize) break;
      offset += members.length;
      page += 1;
    }
    return {
      members: out,
      pagesLoaded,
    };
  }

  async fetchAllClubUploadBuckets(
    liveClient,
    clubId,
    { pageSize = 250, onPageLoaded = null } = {}
  ) {
    const out = [];
    let offset = 0;
    let page = 0;
    let pagesLoaded = 0;
    const maxPageCount = 1200;
    const safePageSize = clampInt(pageSize, { min: 1, max: 250, fallback: 250 });
    while (page < maxPageCount) {
      const payload = await liveClient.getClubBuckets({
        bucketType: "map",
        clubId,
        length: safePageSize,
        offset,
      });
      const buckets = extractUploadBuckets(payload);
      if (!buckets.length) break;
      out.push(...buckets);
      pagesLoaded += 1;
      if (typeof onPageLoaded === "function") {
        onPageLoaded({
          page: page + 1,
          offset,
          pageSize: buckets.length,
          totalLoaded: out.length,
        });
      }
      if (buckets.length < safePageSize) break;
      offset += buckets.length;
      page += 1;
    }
    return {
      buckets: uniqueBy(out, (bucket) => String(bucket.bucketId || 0)),
      pagesLoaded,
    };
  }

  async fetchLiveClubStructure(options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    const report = (partial) => {
      if (onProgress) onProgress(partial);
    };
    report({
      phase: "auth",
      percent: 1,
      message: "Resolving Nadeo Live auth context.",
    });

    const resolvedClient = await this.resolveLiveClient(options);
    if (resolvedClient.error) {
      return { error: resolvedClient.error };
    }
    const liveClient = resolvedClient.liveClient;
    const authSource = resolvedClient.authSource;

    const resolved = this.resolveLiveOptions(options);
    const clubId = resolved.clubId;
    report({
      phase: "fetch-club",
      percent: 4,
      message: `Fetching club ${clubId} metadata.`,
      counters: {
        clubId,
      },
    });
    const clubPayload = await liveClient.getClubById(clubId);
    const clubName = firstTruthy([clubPayload?.name, clubPayload?.clubName, `Club ${clubId}`]);
    const clubCampaignEntries = [
      ...asArray(clubPayload?.campaigns),
      ...asArray(clubPayload?.campaignList),
      ...asArray(clubPayload?.clubCampaigns),
    ];
    report({
      phase: "fetch-club",
      percent: 7,
      message: `Loaded club metadata for ${clubName}.`,
      counters: {
        clubId,
        clubName,
        clubCampaignEntries: clubCampaignEntries.length,
      },
    });
    report({
      phase: "fetch-activities",
      percent: 8,
      message: "Fetching paginated club activities.",
    });
    const activityResult = await this.fetchAllClubActivities(liveClient, clubId, {
      ...resolved,
      onPageLoaded: ({
        page,
        offset,
        totalLoaded,
        pageSize,
        activeOnly,
        forcedFallback,
      }) => {
        report({
          phase: "fetch-activities",
          percent: Math.min(24, 8 + page),
          message: forcedFallback
            ? `Loaded activity page ${page} (${pageSize} records) with active=true fallback.`
            : `Loaded activity page ${page} (${pageSize} records).`,
          counters: {
            activityPagesLoaded: page,
            activityOffset: offset,
            activityLastPageSize: pageSize,
            activitiesSeen: totalLoaded,
            activeOnlyUsed: Boolean(activeOnly),
            activityFallbackApplied: Boolean(forcedFallback),
          },
        });
      },
    });
    const activities = activityResult.activities;
    const fetchWarnings = [];

    let members = [];
    let memberPagesLoaded = 0;
    report({
      phase: "fetch-members",
      percent: 25,
      message: "Fetching club member list.",
    });
    try {
      const memberResult = await this.fetchAllClubMembers(liveClient, clubId, {
        pageSize: resolved.activityPageSize,
        onPageLoaded: ({ page, pageSize, totalLoaded }) => {
          report({
            phase: "fetch-members",
            percent: Math.min(29, 25 + page),
            message: `Loaded member page ${page} (${pageSize} records).`,
            counters: {
              memberPagesLoaded: page,
              membersLoaded: totalLoaded,
            },
          });
        },
      });
      members = memberResult.members;
      memberPagesLoaded = Number(memberResult.pagesLoaded || 0);
    } catch (error) {
      fetchWarnings.push(`club members: ${error?.message || "failed to load members"}`);
    }

    report({
      phase: "fetch-uploads",
      percent: 30,
      message: "Fetching upload buckets and recent upload activity.",
    });
    let uploadBuckets = mergeUploadBuckets(
      activities.map((activity) => extractUploadDescriptorFromActivity(activity)).filter(Boolean)
    );
    let uploadBucketPagesLoaded = 0;
    let uploadBucketDetailsLoaded = 0;
    try {
      const uploadBucketResult = await this.fetchAllClubUploadBuckets(liveClient, clubId, {
        pageSize: resolved.activityPageSize,
        onPageLoaded: ({ page, pageSize, totalLoaded }) => {
          report({
            phase: "fetch-uploads",
            percent: Math.min(34, 30 + page),
            message: `Loaded upload bucket page ${page} (${pageSize} records).`,
            counters: {
              uploadBucketPagesLoaded: page,
              uploadBucketsLoaded: totalLoaded,
            },
          });
        },
      });
      uploadBucketPagesLoaded = Number(uploadBucketResult.pagesLoaded || 0);
      uploadBuckets = mergeUploadBuckets(uploadBuckets, uploadBucketResult.buckets);
    } catch (error) {
      fetchWarnings.push(`upload buckets: ${error?.message || "failed to load upload buckets"}`);
    }

    const hydratedUploadBuckets = [];
    for (let index = 0; index < uploadBuckets.length; index += 1) {
      const bucket = uploadBuckets[index];
      if (!bucket?.bucketId) {
        hydratedUploadBuckets.push(bucket);
        continue;
      }
      let hydrated = bucket;
      try {
        const detailPayload = await liveClient.getClubBucketById(clubId, bucket.bucketId);
        const parsed = extractUploadBuckets([detailPayload]);
        if (parsed.length) {
          hydrated = mergeUploadBuckets([bucket], parsed)[0];
        }
        uploadBucketDetailsLoaded += 1;
      } catch (error) {
        if (fetchWarnings.length < 250) {
          fetchWarnings.push(
            `upload bucket ${bucket.bucketId}: ${error?.message || "failed to load details"}`
          );
        }
      }
      hydratedUploadBuckets.push(hydrated);
      report({
        phase: "fetch-uploads",
        percent:
          uploadBuckets.length > 0
            ? 30 + Math.floor(((index + 1) / uploadBuckets.length) * 4)
            : 34,
        message: `Loaded upload bucket details (${index + 1}/${uploadBuckets.length}).`,
        counters: {
          uploadBucketsLoaded: uploadBuckets.length,
          uploadBucketDetailsLoaded,
        },
      });
    }
    uploadBuckets = mergeUploadBuckets(hydratedUploadBuckets);
    const uploadMapsLoaded = uploadBuckets.reduce((sum, bucket) => {
      const maps = Array.isArray(bucket?.maps) ? bucket.maps : [];
      return sum + maps.length;
    }, 0);

    const descriptors = uniqueBy(
      [
        ...activities.map((activity) => extractCampaignFromActivity(activity)).filter(Boolean),
        ...clubCampaignEntries
          .map((campaign) => extractCampaignDescriptorFromObject(campaign))
          .filter(Boolean),
      ],
      (item) => (item.campaignId ? `id:${item.campaignId}` : `name:${item.name.toLowerCase()}`)
    );
    report({
      phase: "fetch-campaigns",
      percent: 35,
      message: `Discovered ${descriptors.length} campaign descriptors.`,
      counters: {
        clubCampaignEntries: clubCampaignEntries.length,
        activityPagesLoaded: Number(activityResult.pagesLoaded || 0),
        activitiesSeen: activities.length,
        membersLoaded: members.length,
        uploadBucketsLoaded: uploadBuckets.length,
        uploadMapsLoaded,
        campaignsSeen: descriptors.length,
      },
    });

    const campaignErrors = [];
    const campaigns = [];
    let campaignsProcessed = 0;
    let campaignsWithMaps = 0;
    let mapsFromCampaigns = 0;
    const discoveredMapUids = new Set();

    for (const descriptor of descriptors) {
      let campaignPayload = descriptor.raw || {};
      if (descriptor.campaignId) {
        try {
          campaignPayload = await liveClient.getClubCampaignById(clubId, descriptor.campaignId);
        } catch (error) {
          if (campaignErrors.length < 250) {
            campaignErrors.push(
              `campaign ${descriptor.campaignId}: ${error?.message || "failed to load details"}`
            );
          }
        }
      }

      const maps = extractCampaignMaps(campaignPayload);
      const campaignName =
        firstTruthy([
          campaignPayload?.name,
          campaignPayload?.campaignName,
          campaignPayload?.campaign?.name,
          descriptor.name,
        ]) || `Campaign ${descriptor.campaignId || "unknown"}`;
      const campaignId = firstPositiveInt([
        campaignPayload?.campaignId,
        campaignPayload?.campaign_id,
        campaignPayload?.id,
        campaignPayload?.campaign?.id,
        descriptor.campaignId,
      ]);
      if (maps.length) {
        campaignsWithMaps += 1;
        mapsFromCampaigns += maps.length;
        for (const map of maps) {
          if (!map?.uid) continue;
          discoveredMapUids.add(String(map.uid).toLowerCase());
        }
        campaigns.push({
          name: campaignName,
          campaignId,
          activityId: descriptor.activityId || null,
          activityType:
            firstTruthy([
              descriptor.activityType,
              campaignPayload?.activityType,
              campaignPayload?.activity_type,
              campaignPayload?.type,
            ]) || null,
          campaignType:
            firstTruthy([
              campaignPayload?.campaignType,
              campaignPayload?.campaign_type,
              campaignPayload?.type,
            ]) || null,
          startTimestamp: toNullableIso(
            campaignPayload?.startTimestamp ??
              campaignPayload?.startDate ??
              campaignPayload?.start_date ??
              campaignPayload?.startsAt
          ),
          endTimestamp: toNullableIso(
            campaignPayload?.endTimestamp ??
              campaignPayload?.endDate ??
              campaignPayload?.end_date ??
              campaignPayload?.endsAt
          ),
          published: Boolean(campaignPayload?.published ?? campaignPayload?.isPublished),
          leaderboardGroupUid: firstTruthy([
            campaignPayload?.leaderboardGroupUid,
            campaignPayload?.leaderboard_group_uid,
            campaignPayload?.leaderboardUid,
          ]),
          maps,
          raw: campaignPayload,
        });
      }
      campaignsProcessed += 1;
      report({
        phase: "fetch-campaigns",
        percent:
          descriptors.length > 0
            ? 35 + Math.floor((campaignsProcessed / descriptors.length) * 23)
            : 58,
        message: `Loaded campaign details (${campaignsProcessed}/${descriptors.length}).`,
        counters: {
          campaignsSeen: descriptors.length,
          campaignsProcessed,
          campaignsWithMaps,
          campaignErrors: campaignErrors.length,
          mapsFromCampaigns,
          mapUidsDiscovered: discoveredMapUids.size,
          currentCampaignName: campaignName,
          currentCampaignId: campaignId || descriptor.campaignId || null,
          currentCampaignMapCount: maps.length,
        },
      });
    }

    const uniqueCampaigns = uniqueBy(
      campaigns,
      (campaign) =>
        campaign.campaignId ? `id:${campaign.campaignId}` : `name:${campaign.name.toLowerCase()}`
    );

    const allMapUids = uniqueBy(
      uniqueCampaigns.flatMap((campaign) => campaign.maps.map((map) => map.uid)),
      (uid) => String(uid).toLowerCase()
    );
    report({
      phase: "prepare-map-details",
      percent: 59,
      message: `Prepared ${allMapUids.length} unique map UIDs.`,
      counters: {
        campaignsLoaded: uniqueCampaigns.length,
        mapUidsDiscovered: allMapUids.length,
        mapDetailsRequested: resolved.fetchMapDetails ? allMapUids.length : 0,
        mapDetailChunksTotal: resolved.fetchMapDetails ? Math.ceil(allMapUids.length / 100) : 0,
      },
    });

    const mapDetailsByUid = new Map();
    if (resolved.fetchMapDetails && allMapUids.length) {
      const detailPayload = await liveClient.getMapsByUidList(allMapUids, {
        onChunk: ({
          index,
          total,
          loadedCount,
          chunkSize,
          requestedCount,
          firstUid,
          lastUid,
        }) => {
          report({
            phase: "fetch-map-details",
            percent: 59 + Math.floor((index / Math.max(total, 1)) * 19),
            message: `Fetched map metadata chunks (${index}/${total}).`,
            counters: {
              mapDetailChunksTotal: total,
              mapDetailChunksLoaded: index,
              mapDetailChunkSize: chunkSize,
              mapDetailsRequested: requestedCount,
              mapDetailsLoaded: loadedCount,
              mapDetailFirstUid: firstUid || "",
              mapDetailLastUid: lastUid || "",
            },
          });
        },
      });
      for (const item of detailPayload) {
        const uid = normalizeMapUid(item?.uid || item?.mapUid || item?.map_uid);
        if (!uid) continue;
        mapDetailsByUid.set(uid.toLowerCase(), item);
      }
    }

    const enrichedCampaigns = uniqueCampaigns.map((campaign) => ({
      ...campaign,
      maps: campaign.maps.map((map) => mergeMapDetail(map, mapDetailsByUid.get(map.uid.toLowerCase()))),
    }));

    const mapCount = enrichedCampaigns.reduce((sum, campaign) => sum + campaign.maps.length, 0);

    const summary = {
      clubId,
      clubName,
      clubCampaignEntries: clubCampaignEntries.length,
      activityPagesLoaded: Number(activityResult.pagesLoaded || 0),
      activitiesSeen: activities.length,
      campaignsSeen: descriptors.length,
      campaignsLoaded: enrichedCampaigns.length,
      campaignsWithMaps,
      mapsLoaded: mapCount,
      mapUidsDiscovered: allMapUids.length,
      membersLoaded: members.length,
      memberPagesLoaded,
      uploadBucketsLoaded: uploadBuckets.length,
      uploadBucketPagesLoaded,
      uploadBucketDetailsLoaded,
      uploadMapsLoaded,
      mapDetailsRequested: resolved.fetchMapDetails ? allMapUids.length : 0,
      mapDetailsLoaded: mapDetailsByUid.size,
      mapDetailsCoveragePercent:
        resolved.fetchMapDetails && allMapUids.length
          ? Math.floor((mapDetailsByUid.size / allMapUids.length) * 100)
          : resolved.fetchMapDetails
            ? 0
            : 100,
      fetchMapDetails: resolved.fetchMapDetails,
      activeOnlyRequested: resolved.activeOnly,
      activeOnlyUsed: activityResult.effectiveActiveOnly,
      activityFallbackApplied: activityResult.forcedActiveOnlyFallback,
      authSource,
      authWarning: resolvedClient.warning || null,
    };
    report({
      phase: "fetch-complete",
      percent: 79,
      message: `Fetched ${summary.campaignsLoaded} campaigns and ${summary.mapsLoaded} maps.`,
      counters: {
        ...summary,
        campaignErrors: campaignErrors.length,
      },
    });

    const warnings = [...fetchWarnings, ...campaignErrors];
    if (activityResult.forcedActiveOnlyFallback) {
      warnings.unshift(
        "Activity endpoint returned player:error-notFound for active=false; retried with active=true."
      );
    }

    if (parseOptionalBoolean(options.summaryOnly) === true) {
      return {
        club: {
          id: clubId,
          name: clubName,
        },
        summary,
        warnings,
        campaignSample: enrichedCampaigns.slice(0, 20).map((campaign) => ({
          name: campaign.name,
          campaignId: campaign.campaignId || null,
          mapCount: campaign.maps.length,
        })),
        memberSample: members.slice(0, 20),
        uploadBucketSample: uploadBuckets.slice(0, 20).map((bucket) => ({
          bucketId: bucket.bucketId || null,
          name: bucket.name || "",
          bucketType: bucket.bucketType || "map",
          mapCount: Number(bucket.mapCount || 0),
          mapsSeen: Array.isArray(bucket.maps) ? bucket.maps.length : 0,
        })),
      };
    }

    return {
      club: {
        id: clubId,
        name: clubName,
        raw: clubPayload,
      },
      campaigns: enrichedCampaigns,
      activities,
      members,
      uploadBuckets,
      summary,
      warnings,
    };
  }

  async syncLiveClubSnapshot(options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    const fetched = await this.fetchLiveClubStructure({
      ...options,
      onProgress,
    });
    if (fetched?.error) return fetched;

    const noteSuffix = String(options.note || "").trim();
    const syncPayload = {
      club: {
        id: fetched.club.id,
        name: fetched.club.name,
      },
      campaigns: fetched.campaigns,
      sourceLabel: options.sourceLabel || "altered-live-monitor",
      note: noteSuffix || `live-club-${fetched.club.id}`,
    };

    const syncResult = await this.syncHookSnapshot(syncPayload, {
      onProgress,
      relayClubSnapshot: false,
    });
    if (syncResult?.error) return syncResult;

    let monitoringRelay = null;
    if (this.shouldUseClubRelay()) {
      if (onProgress) {
        onProgress({
          phase: "relay-tracker-club",
          percent: 85,
          message: "Relaying club snapshot to tracker-club service.",
          counters: {
            relayClubId: fetched.club.id,
            relayCampaigns: asArray(fetched.campaigns).length,
            relayMembers: asArray(fetched.members).length,
            relayActivities: asArray(fetched.activities).length,
            relayUploadBuckets: asArray(fetched.uploadBuckets).length,
          },
        });
      }
      monitoringRelay = await this.relayClubSnapshotToTrackerClub({
        club: {
          id: fetched.club.id,
          name: fetched.club.name,
        },
        campaigns: fetched.campaigns,
        members: fetched.members,
        activities: fetched.activities,
        uploadBuckets: fetched.uploadBuckets,
        observedAt: new Date().toISOString(),
      });
      if (monitoringRelay?.error) {
        fetched.warnings = [
          ...asArray(fetched.warnings),
          `Tracker-club relay warning: ${monitoringRelay.error}`,
        ];
        if (!this.trackerIntegrations.clubFallbackLocal) {
          return {
            error: monitoringRelay.error,
          };
        }
      }
    }

    let monitoringSync = null;
    const shouldRunLocalMonitoring =
      !this.shouldUseClubRelay() || this.trackerIntegrations.clubFallbackLocal;
    if (shouldRunLocalMonitoring && typeof this.repository?.upsertClubMonitoringData === "function") {
      if (onProgress) {
        onProgress({
          phase: "sync-club-monitoring",
          percent: 88,
          message: "Storing club members, activities, and upload buckets.",
          counters: {
            membersToStore: Array.isArray(fetched.members) ? fetched.members.length : 0,
            activitiesToStore: Array.isArray(fetched.activities) ? fetched.activities.length : 0,
            uploadBucketsToStore: Array.isArray(fetched.uploadBuckets)
              ? fetched.uploadBuckets.length
              : 0,
          },
        });
      }
      monitoringSync = this.repository.upsertClubMonitoringData({
        clubId: fetched.club.id,
        members: fetched.members,
        activities: fetched.activities,
        uploadBuckets: fetched.uploadBuckets,
      });
      if (monitoringSync?.error) {
        fetched.warnings = [
          ...asArray(fetched.warnings),
          `Club monitoring storage warning: ${monitoringSync.error}`,
        ];
      } else if (onProgress) {
        onProgress({
          phase: "sync-club-monitoring",
          percent: 91,
          message: "Club monitoring storage completed.",
          counters: {
            membersSeen: Number(monitoringSync.membersSeen || 0),
            activitiesSeen: Number(monitoringSync.activitiesSeen || 0),
            uploadBucketsSeen: Number(monitoringSync.uploadBucketsSeen || 0),
            uploadMapsSeen: Number(monitoringSync.uploadMapsSeen || 0),
          },
        });
      }
    }

    const mapperNameSync = await this.syncMapperNamesForCampaigns({
      campaigns: fetched.campaigns,
      note: noteSuffix || `live-club-${fetched.club.id}`,
      onProgress,
    });
    if (mapperNameSync?.warning) {
      fetched.warnings = [...asArray(fetched.warnings), mapperNameSync.warning];
    }

    const monitoringSummary = {
      membersSeen: Number(
        monitoringSync?.membersSeen ??
          monitoringRelay?.membersSeen ??
          asArray(fetched.members).length
      ),
      activitiesSeen: Number(
        monitoringSync?.activitiesSeen ??
          monitoringRelay?.activitiesSeen ??
          asArray(fetched.activities).length
      ),
      uploadBucketsSeen: Number(
        monitoringSync?.uploadBucketsSeen ??
          monitoringRelay?.uploadsSeen ??
          asArray(fetched.uploadBuckets).length
      ),
      uploadMapsSeen: Number(
        monitoringSync?.uploadMapsSeen ??
          monitoringRelay?.uploadMapsSeen ??
          0
      ),
      relay: monitoringRelay || null,
      local: monitoringSync || null,
    };

    return {
      fetched: {
        summary: fetched.summary,
        warnings: fetched.warnings,
      },
      synced: {
        ...syncResult.synced,
        monitoring: monitoringSummary,
        mapperNames: mapperNameSync || null,
      },
    };
  }

  async syncMapperNamesForCampaigns({ campaigns = [], note = "", onProgress = null } = {}) {
    const mapperAccountIds = collectMapperAccountIds(campaigns);
    if (onProgress) {
      onProgress({
        phase: "resolve-mapper-names",
        percent: 92,
        message: `Preparing mapper identity sync for ${mapperAccountIds.length} account IDs.`,
        counters: {
          mapperAccountsSeen: mapperAccountIds.length,
        },
      });
    }
    if (!mapperAccountIds.length) {
      return {
        ok: true,
        mapperAccountsSeen: 0,
        mapperNamesResolved: 0,
        mapperNamesUpdated: 0,
        mapperNameHistoryInserted: 0,
        mapperMapNameLinksUpdated: 0,
      };
    }

    const source = String(note || "live-sync").trim() || "live-sync";

    const syncResult = await this.syncMapperNamesBatch({
      accountIds: mapperAccountIds,
      source,
    });
    if (!syncResult?.ok && syncResult?.error) {
      return {
        ok: false,
        warning: syncResult.error,
        mapperAccountsSeen: mapperAccountIds.length,
        mapperNamesResolved: Number(syncResult.resolved || 0),
        mapperNamesUpdated: Number(syncResult.namesUpdated || 0),
        mapperNameHistoryInserted: Number(syncResult.historyInserted || 0),
        mapperMapNameLinksUpdated: Number(syncResult.mapLinksUpdated || 0),
      };
    }

    if (onProgress) {
      onProgress({
        phase: "resolve-mapper-names",
        percent: 97,
        message: `Mapper names synced (${Number(syncResult?.resolved || 0)} resolved, ${Number(
          syncResult?.namesUpdated || 0
        )} updated).`,
        counters: {
          mapperAccountsSeen: mapperAccountIds.length,
          mapperNamesResolved: Number(syncResult?.resolved || 0),
          mapperNamesUpdated: Number(syncResult?.namesUpdated || 0),
          mapperNameHistoryInserted: Number(syncResult?.historyInserted || 0),
          mapperMapNameLinksUpdated: Number(syncResult?.mapLinksUpdated || 0),
          trackerPlayersSynced: Number(syncResult?.trackerPlayersSynced || 0),
        },
      });
    }

    return {
      ok: true,
      warning: syncResult?.warning || null,
      mapperAccountsSeen: mapperAccountIds.length,
      mapperNamesResolved: Number(syncResult?.resolved || 0),
      mapperNamesUpdated: Number(syncResult?.namesUpdated || 0),
      mapperNameHistoryInserted: Number(syncResult?.historyInserted || 0),
      mapperMapNameLinksUpdated: Number(syncResult?.mapLinksUpdated || 0),
      trackerPlayersSynced: Number(syncResult?.trackerPlayersSynced || 0),
    };
  }

  updateLiveMonitorConfig(options = {}) {
    const enabled = parseOptionalBoolean(options.enabled);
    const discoveryEnabled = parseOptionalBoolean(options.discoveryEnabled);
    const activeOnly = parseOptionalBoolean(options.activeOnly);
    const fetchMapDetails = parseOptionalBoolean(options.fetchMapDetails);
    const scheduleMode = normalizeScheduleMode(options.scheduleMode, "");

    if (enabled !== undefined) this.liveMonitor.enabled = enabled;
    if (discoveryEnabled !== undefined) this.liveMonitor.discoveryEnabled = discoveryEnabled;
    if (activeOnly !== undefined) this.liveMonitor.activeOnly = activeOnly;
    if (fetchMapDetails !== undefined) this.liveMonitor.fetchMapDetails = fetchMapDetails;
    if (scheduleMode) this.liveMonitor.scheduleMode = scheduleMode;

    if (options.clubId !== undefined) {
      this.liveMonitor.clubId = clampInt(options.clubId, {
        min: 1,
        max: 2147483647,
        fallback: this.liveMonitor.clubId,
      });
    }
    if (options.intervalSeconds !== undefined) {
      this.liveMonitor.intervalSeconds = clampInt(options.intervalSeconds, {
        min: 60,
        max: 86400,
        fallback: this.liveMonitor.intervalSeconds,
      });
    }
    if (options.activityPageSize !== undefined) {
      this.liveMonitor.activityPageSize = clampInt(options.activityPageSize, {
        min: 1,
        max: 250,
        fallback: this.liveMonitor.activityPageSize,
      });
    }
    if (options.discoveryIntervalSeconds !== undefined) {
      this.liveMonitor.discoveryIntervalSeconds = clampInt(options.discoveryIntervalSeconds, {
        min: 300,
        max: 86400,
        fallback: this.liveMonitor.discoveryIntervalSeconds,
      });
    }
    if (options.discoveryCampaignLimit !== undefined) {
      this.liveMonitor.discoveryCampaignLimit = clampInt(options.discoveryCampaignLimit, {
        min: 1,
        max: 250,
        fallback: this.liveMonitor.discoveryCampaignLimit,
      });
    }
    if (options.discoveryActivityPageSize !== undefined) {
      this.liveMonitor.discoveryActivityPageSize = clampInt(options.discoveryActivityPageSize, {
        min: 1,
        max: 250,
        fallback: this.liveMonitor.discoveryActivityPageSize,
      });
    }
    if (options.dailyHourUtc !== undefined) {
      this.liveMonitor.dailyHourUtc = clampInt(options.dailyHourUtc, {
        min: 0,
        max: 23,
        fallback: this.liveMonitor.dailyHourUtc,
      });
    }
    if (options.dailyMinuteUtc !== undefined) {
      this.liveMonitor.dailyMinuteUtc = clampInt(options.dailyMinuteUtc, {
        min: 0,
        max: 59,
        fallback: this.liveMonitor.dailyMinuteUtc,
      });
    }
    if (options.trackerChunkSize !== undefined) {
      this.liveMonitor.trackerChunkSize = clampInt(options.trackerChunkSize, {
        min: 25,
        max: 1000,
        fallback: this.liveMonitor.trackerChunkSize,
      });
    }

    if (this.liveMonitor.enabled) this.startLiveMonitor();
    else this.stopLiveMonitor();
    this.persistLiveMonitorConfig();
    return this.getLiveMonitorStatus();
  }

  async runLiveMonitorCycle({ reason = "manual", authContext = null } = {}) {
    if (this.liveMonitor.running || this.liveMonitor.discoveryRunning) {
      return {
        skipped: true,
        reason: "monitor already running",
      };
    }
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    this.liveMonitor.runCounter += 1;
    const runId = this.liveMonitor.runCounter;
    this.liveMonitor.running = true;
    this.liveMonitor.lastStartedAt = startedAt;
    this.liveMonitor.lastDurationMs = null;
    this.liveMonitor.lastError = null;
    this.updateLiveProgress({
      runId,
      reason,
      status: "running",
      phase: "queued",
      percent: 0,
      startedAt,
      finishedAt: null,
      message: "Starting live club sync.",
      counters: {},
      replaceCounters: true,
    });

    try {
      const result = await this.syncLiveClubSnapshot({
        clubId: this.liveMonitor.clubId,
        activityPageSize: this.liveMonitor.activityPageSize,
        activeOnly: this.liveMonitor.activeOnly,
        fetchMapDetails: this.liveMonitor.fetchMapDetails,
        note: `live-monitor:${reason}`,
        authContext,
        onProgress: (partial) => {
          this.updateLiveProgress({
            runId,
            reason,
            status: "running",
            startedAt,
            ...partial,
          });
        },
      });
      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.now() - startedMs);
      if (result?.error) {
        this.liveMonitor.lastError = String(result.error);
        this.liveMonitor.lastDurationMs = durationMs;
        this.updateLiveProgress({
          runId,
          reason,
          status: "error",
          phase: "failed",
          percent: this.liveMonitor.progress?.percent || 0,
          finishedAt,
          durationMs,
          message: String(result.error),
        });
      } else {
        const summary = result?.fetched?.summary || {};
        const synced = result?.synced || {};
        const monitoring = result?.synced?.monitoring || {};
        const mapperNames = result?.synced?.mapperNames || {};
        this.liveMonitor.lastDurationMs = durationMs;
        this.updateLiveProgress({
          runId,
          reason,
          status: "ok",
          phase: "complete",
          percent: 100,
          finishedAt,
          durationMs,
          message: `Sync completed: ${Number(summary.campaignsLoaded || 0)} campaigns, ${Number(
            summary.mapsLoaded || 0
          )} maps.`,
          counters: {
            campaignsLoaded: Number(summary.campaignsLoaded || 0),
            mapsLoaded: Number(summary.mapsLoaded || 0),
            mapDetailsLoaded: Number(summary.mapDetailsLoaded || 0),
            mapsStored: Number(synced.mapsSeen || 0),
            mapsInserted: Number(synced.mapsInserted || 0),
            mapsUpdated: Number(synced.mapsUpdated || 0),
            mapsLinked: Number(synced.mapsLinked || 0),
            membersLoaded: Number(summary.membersLoaded || 0),
            activitiesSeen: Number(summary.activitiesSeen || 0),
            uploadBucketsLoaded: Number(summary.uploadBucketsLoaded || 0),
            uploadMapsLoaded: Number(summary.uploadMapsLoaded || 0),
            membersStored: Number(monitoring.membersSeen || 0),
            activitiesStored: Number(monitoring.activitiesSeen || 0),
            uploadBucketsStored: Number(monitoring.uploadBucketsSeen || 0),
            uploadMapsStored: Number(monitoring.uploadMapsSeen || 0),
            mapperAccountsSeen: Number(mapperNames.mapperAccountsSeen || 0),
            mapperNamesResolved: Number(mapperNames.mapperNamesResolved || 0),
            mapperNamesUpdated: Number(mapperNames.mapperNamesUpdated || 0),
            mapperNameHistoryInserted: Number(mapperNames.mapperNameHistoryInserted || 0),
            mapperMapNameLinksUpdated: Number(mapperNames.mapperMapNameLinksUpdated || 0),
            durationMs,
          },
        });
      }
      this.liveMonitor.lastSummary = result?.fetched?.summary || null;
      this.liveMonitor.lastFinishedAt = finishedAt;
      return result;
    } catch (error) {
      const message = error?.message || "Live monitor cycle failed.";
      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.now() - startedMs);
      this.liveMonitor.lastError = message;
      this.liveMonitor.lastFinishedAt = finishedAt;
      this.liveMonitor.lastDurationMs = durationMs;
      this.updateLiveProgress({
        runId,
        reason,
        status: "error",
        phase: "failed",
        percent: this.liveMonitor.progress?.percent || 0,
        finishedAt,
        durationMs,
        message,
      });
      this.logger.warn(`[altered-live] monitor cycle failed: ${message}`);
      return { error: message };
    } finally {
      this.liveMonitor.running = false;
    }
  }

  async runLiveDiscoveryCycle({ reason = "hourly-discovery", authContext = null } = {}) {
    if (this.liveMonitor.running || this.liveMonitor.discoveryRunning) {
      return {
        skipped: true,
        reason: "monitor already running",
      };
    }

    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    this.liveMonitor.discoveryRunning = true;
    this.liveMonitor.lastDiscoveryStartedAt = startedAt;
    this.liveMonitor.lastDiscoveryDurationMs = null;
    this.liveMonitor.lastDiscoveryError = null;

    this.updateLiveProgress({
      reason,
      status: "running",
      phase: "discovery-auth",
      percent: 0,
      startedAt,
      finishedAt: null,
      message: "Starting hourly discovery cycle.",
      counters: {},
      replaceCounters: true,
    });

    try {
      const resolvedClient = await this.resolveLiveClient({
        authContext,
      });
      if (resolvedClient.error) {
        throw new Error(resolvedClient.error);
      }
      const liveClient = resolvedClient.liveClient;
      const authSource = resolvedClient.authSource;
      const clubId = this.liveMonitor.clubId;
      const pageSize = this.liveMonitor.discoveryActivityPageSize;
      const campaignLimit = this.liveMonitor.discoveryCampaignLimit;

      this.updateLiveProgress({
        reason,
        status: "running",
        phase: "discovery-activities",
        percent: 8,
        message: `Loading latest activity page for club ${clubId}.`,
        counters: {
          clubId,
          activityPageSize: pageSize,
          discoveryCampaignLimit: campaignLimit,
          authSource,
        },
      });

      const clubPayload = await liveClient.getClubById(clubId);
      const clubName = firstTruthy([clubPayload?.name, clubPayload?.clubName, `Club ${clubId}`]);
      const activityResult = await this.fetchAllClubActivities(liveClient, clubId, {
        activityPageSize: pageSize,
        activeOnly: this.liveMonitor.activeOnly,
        maxPages: 1,
      });
      const activities = activityResult.activities;
      const activityIds = uniqueBy(
        activities
          .map((activity) => extractActivityId(activity))
          .filter((activityId) => Number(activityId) > 0),
        (activityId) => activityId
      );
      const knownActivityIds = new Set(
        this.repository.getKnownActivityIds({
          clubId,
          activityIds,
        })
      );
      const newActivityCount = activityIds.filter((activityId) => !knownActivityIds.has(activityId)).length;

      let uploadBuckets = mergeUploadBuckets(
        activities.map((activity) => extractUploadDescriptorFromActivity(activity)).filter(Boolean)
      );
      const uploadBucketIds = uploadBuckets
        .map((bucket) => firstPositiveInt([bucket?.bucketId]))
        .filter((bucketId) => bucketId > 0);
      const knownUploadBucketIds = new Set(
        this.repository.getKnownUploadBucketIds({
          clubId,
          bucketIds: uploadBucketIds,
        })
      );
      let uploadBucketDetailsLoaded = 0;
      const hydratedUploadBuckets = [];
      for (const bucket of uploadBuckets) {
        const bucketId = firstPositiveInt([bucket?.bucketId]);
        if (!bucketId || knownUploadBucketIds.has(bucketId)) {
          hydratedUploadBuckets.push(bucket);
          continue;
        }
        try {
          const detailPayload = await liveClient.getClubBucketById(clubId, bucketId);
          const parsed = extractUploadBuckets([detailPayload]);
          const merged = parsed.length ? mergeUploadBuckets([bucket], parsed)[0] : bucket;
          hydratedUploadBuckets.push(merged);
          uploadBucketDetailsLoaded += 1;
        } catch (error) {
          this.logger.warn(
            `[altered-live] discovery: failed to hydrate upload bucket ${bucketId}: ${
              error?.message || error
            }`
          );
          hydratedUploadBuckets.push(bucket);
        }
      }
      uploadBuckets = mergeUploadBuckets(hydratedUploadBuckets);
      const uploadMapsLoaded = uploadBuckets.reduce((sum, bucket) => {
        const maps = Array.isArray(bucket?.maps) ? bucket.maps : [];
        return sum + maps.length;
      }, 0);

      const descriptors = uniqueBy(
        activities.map((activity) => extractCampaignFromActivity(activity)).filter(Boolean),
        (item) =>
          item.campaignId ? `id:${item.campaignId}` : `name:${String(item.name || "").toLowerCase()}`
      );
      descriptors.sort((a, b) => Number(b?.activityId || 0) - Number(a?.activityId || 0));
      const latestDescriptors = descriptors.slice(0, campaignLimit);
      const campaignIds = latestDescriptors
        .map((descriptor) => firstPositiveInt([descriptor?.campaignId]))
        .filter((campaignId) => campaignId > 0);
      const knownCampaignIds = new Set(
        this.repository.getKnownCampaignExternalIds({
          clubId,
          campaignExternalIds: campaignIds,
        })
      );
      const newDescriptors = latestDescriptors.filter((descriptor) => {
        const campaignId = firstPositiveInt([descriptor?.campaignId]);
        if (!campaignId) return false;
        return !knownCampaignIds.has(campaignId);
      });

      this.updateLiveProgress({
        reason,
        status: "running",
        phase: "discovery-campaigns",
        percent: 28,
        message: `Detected ${newDescriptors.length} new campaigns in the latest ${latestDescriptors.length}.`,
        counters: {
          activitiesSeen: activities.length,
          newActivities: newActivityCount,
          latestCampaignsChecked: latestDescriptors.length,
          newCampaignsDetected: newDescriptors.length,
          uploadBucketsSeen: uploadBuckets.length,
          uploadMapsSeen: uploadMapsLoaded,
          uploadBucketDetailsLoaded,
        },
      });

      const campaigns = [];
      const discoveredMapUids = new Set();
      for (let index = 0; index < newDescriptors.length; index += 1) {
        const descriptor = newDescriptors[index];
        let campaignPayload = descriptor.raw || {};
        if (descriptor.campaignId) {
          campaignPayload = await liveClient.getClubCampaignById(clubId, descriptor.campaignId);
        }
        const maps = extractCampaignMaps(campaignPayload);
        for (const map of maps) {
          if (!map?.uid) continue;
          discoveredMapUids.add(String(map.uid).toLowerCase());
        }
        campaigns.push({
          name:
            firstTruthy([
              campaignPayload?.name,
              campaignPayload?.campaignName,
              campaignPayload?.campaign?.name,
              descriptor.name,
            ]) || `Campaign ${descriptor.campaignId || "unknown"}`,
          campaignId:
            firstPositiveInt([
              campaignPayload?.campaignId,
              campaignPayload?.campaign_id,
              campaignPayload?.id,
              campaignPayload?.campaign?.id,
              descriptor.campaignId,
            ]) || null,
          activityId: descriptor.activityId || null,
          activityType:
            firstTruthy([
              descriptor.activityType,
              campaignPayload?.activityType,
              campaignPayload?.activity_type,
              campaignPayload?.type,
            ]) || null,
          campaignType:
            firstTruthy([
              campaignPayload?.campaignType,
              campaignPayload?.campaign_type,
              campaignPayload?.type,
            ]) || null,
          startTimestamp: toNullableIso(
            campaignPayload?.startTimestamp ??
              campaignPayload?.startDate ??
              campaignPayload?.start_date ??
              campaignPayload?.startsAt
          ),
          endTimestamp: toNullableIso(
            campaignPayload?.endTimestamp ??
              campaignPayload?.endDate ??
              campaignPayload?.end_date ??
              campaignPayload?.endsAt
          ),
          published: Boolean(campaignPayload?.published ?? campaignPayload?.isPublished),
          leaderboardGroupUid: firstTruthy([
            campaignPayload?.leaderboardGroupUid,
            campaignPayload?.leaderboard_group_uid,
            campaignPayload?.leaderboardUid,
          ]),
          maps,
          raw: campaignPayload,
        });
        this.updateLiveProgress({
          reason,
          status: "running",
          phase: "discovery-campaigns",
          percent:
            newDescriptors.length > 0
              ? 28 + Math.floor(((index + 1) / newDescriptors.length) * 32)
              : 60,
          message: `Hydrating new campaigns (${index + 1}/${newDescriptors.length}).`,
          counters: {
            newCampaignsDetected: newDescriptors.length,
            newCampaignsHydrated: index + 1,
            discoveredMapUids: discoveredMapUids.size,
          },
        });
      }

      const allMapUids = uniqueBy([...discoveredMapUids], (uid) => String(uid).toLowerCase());
      const mapDetailsByUid = new Map();
      if (this.liveMonitor.fetchMapDetails && allMapUids.length) {
        const detailPayload = await liveClient.getMapsByUidList(allMapUids);
        for (const item of detailPayload) {
          const uid = normalizeMapUid(item?.uid || item?.mapUid || item?.map_uid);
          if (!uid) continue;
          mapDetailsByUid.set(uid.toLowerCase(), item);
        }
      }
      const enrichedCampaigns = campaigns.map((campaign) => ({
        ...campaign,
        maps: campaign.maps.map((map) =>
          mergeMapDetail(map, mapDetailsByUid.get(String(map.uid || "").toLowerCase()))
        ),
      }));

      let monitoringRelay = null;
      if (this.shouldUseClubRelay()) {
        monitoringRelay = await this.relayClubSnapshotToTrackerClub({
          club: {
            id: clubId,
            name: clubName,
          },
          campaigns: enrichedCampaigns,
          members: [],
          activities,
          uploadBuckets,
          observedAt: new Date().toISOString(),
        });
        if (monitoringRelay?.error && !this.trackerIntegrations.clubFallbackLocal) {
          throw new Error(monitoringRelay.error);
        }
      }

      let monitoringLocal = null;
      const shouldRunLocalMonitoring =
        !this.shouldUseClubRelay() || this.trackerIntegrations.clubFallbackLocal;
      if (shouldRunLocalMonitoring && typeof this.repository?.upsertClubMonitoringData === "function") {
        monitoringLocal = this.repository.upsertClubMonitoringData({
          clubId,
          members: [],
          activities,
          uploadBuckets,
        });
      }

      let sync = null;
      if (enrichedCampaigns.length > 0) {
        sync = await this.syncHookSnapshot(
          {
            club: {
              id: clubId,
              name: clubName,
            },
            campaigns: enrichedCampaigns,
            sourceLabel: "altered-live-discovery",
            note: `live-discovery:${reason}`,
          },
          {
            onProgress: (partial) => {
              this.updateLiveProgress({
                reason,
                status: "running",
                ...partial,
              });
            },
            relayClubSnapshot: false,
          }
        );
      }

      let mapperNames = null;
      if (enrichedCampaigns.length > 0) {
        mapperNames = await this.syncMapperNamesForCampaigns({
          campaigns: enrichedCampaigns,
          note: `live-discovery:${reason}`,
        });
      }

      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.now() - startedMs);
      const summary = {
        clubId,
        clubName,
        authSource,
        activitiesSeen: activities.length,
        newActivities: newActivityCount,
        latestCampaignsChecked: latestDescriptors.length,
        newCampaignsDetected: newDescriptors.length,
        newCampaignsStored: enrichedCampaigns.length,
        discoveredMapUids: allMapUids.length,
        mapDetailsLoaded: mapDetailsByUid.size,
        uploadBucketsSeen: uploadBuckets.length,
        uploadMapsSeen: uploadMapsLoaded,
        uploadBucketDetailsLoaded,
        monitoringStored:
          (monitoringLocal && !monitoringLocal.error) ||
          (monitoringRelay && !monitoringRelay.error),
      };

      this.liveMonitor.lastDiscoverySummary = summary;
      this.liveMonitor.lastDiscoveryFinishedAt = finishedAt;
      this.liveMonitor.lastDiscoveryDurationMs = durationMs;

      this.updateLiveProgress({
        reason,
        status: "ok",
        phase: "discovery-complete",
        percent: 100,
        finishedAt,
        durationMs,
        message: `Discovery completed: ${summary.newCampaignsStored} new campaigns, ${summary.uploadBucketsSeen} upload buckets scanned.`,
        counters: {
          ...summary,
          durationMs,
        },
      });

      return {
        summary,
        monitoring: {
          local: monitoringLocal || null,
          relay: monitoringRelay || null,
        },
        sync,
        mapperNames,
      };
    } catch (error) {
      const message = error?.message || "Live discovery cycle failed.";
      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.now() - startedMs);
      this.liveMonitor.lastDiscoveryError = message;
      this.liveMonitor.lastDiscoveryFinishedAt = finishedAt;
      this.liveMonitor.lastDiscoveryDurationMs = durationMs;
      this.updateLiveProgress({
        reason,
        status: "error",
        phase: "discovery-failed",
        percent: this.liveMonitor.progress?.percent || 0,
        finishedAt,
        durationMs,
        message,
      });
      this.logger.warn(`[altered-live] discovery cycle failed: ${message}`);
      return { error: message };
    } finally {
      this.liveMonitor.discoveryRunning = false;
    }
  }

  startLiveMonitor() {
    this.persistLiveMonitorConfig();
    this.scheduleNextLiveMonitorRun({ fromTimeMs: Date.now() });
    this.scheduleNextDiscoveryRun({ fromTimeMs: Date.now() });
    return true;
  }

  stopLiveMonitor() {
    if (this.liveMonitor.timer) {
      clearTimeout(this.liveMonitor.timer);
      this.liveMonitor.timer = null;
    }
    if (this.liveMonitor.discoveryTimer) {
      clearTimeout(this.liveMonitor.discoveryTimer);
      this.liveMonitor.discoveryTimer = null;
    }
    this.liveMonitor.nextRunAt = null;
    this.liveMonitor.nextDiscoveryRunAt = null;
    this.liveMonitor.running = false;
    this.liveMonitor.discoveryRunning = false;
    this.persistLiveMonitorConfig();
    return true;
  }

  async getTrackerStatus() {
    const result = await this.trackerClient.getTrackerStatus();
    if (!result.ok) return { error: result.error };
    return result.data;
  }

  async runTrackerNow() {
    const result = await this.trackerClient.runTrackerNow();
    if (!result.ok) return { error: result.error };
    return result.data;
  }
}

export { AlteredService };
