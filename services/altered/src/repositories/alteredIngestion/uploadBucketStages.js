import { clampInt, normalizeCampaignSlotValue, toText } from "../alteredRepositorySupport.js";
import { linkUploadPosition } from "./positionStore.js";
import { selectRawPayload } from "./campaignStages.js";

const ID_OPTIONS = { min: 1, max: 2147483647, fallback: 0 };

function normalizeUploadBucket(bucket) {
  const bucketId = clampInt(bucket?.bucketId ?? bucket?.bucket_id ?? bucket?.id, ID_OPTIONS);
  if (!bucketId) return null;
  const name =
    toText(bucket?.name || bucket?.title || bucket?.bucketName || bucket?.bucket_name) || `Upload Bucket ${bucketId}`;
  return {
    bucketId,
    name,
    type: toText(bucket?.bucketType ?? bucket?.bucket_type ?? bucket?.type, "map") || "map",
    activityId: clampInt(bucket?.activityId ?? bucket?.activity_id ?? bucket?.activity?.id, ID_OPTIONS) || null,
    maps: Array.isArray(bucket?.maps) ? bucket.maps : [],
  };
}

function uploadMetadata(bucket, context, slot) {
  return {
    bucketId: bucket.bucketId,
    name: bucket.name,
    bucketType: bucket.type,
    activityId: bucket.activityId,
    ...(slot === undefined ? {} : { slot }),
    clubId: context.clubId,
    clubName: context.clubName,
    hookKey: context.hookKey,
    sourceLabel: context.sourceLabel,
  };
}

function createUploadCampaign(campaignRepository, rawBucket, bucket, context) {
  return campaignRepository.upsertCampaign({
    clubId: context.clubId,
    campaignName: bucket.name,
    uploadBucketId: bucket.bucketId,
    activityId: bucket.activityId,
    activityType: "club-upload",
    campaignType: "upload-bucket",
    payload: {
      ...selectRawPayload(rawBucket),
      uploadBucket: uploadMetadata(bucket, context),
    },
  });
}

function ingestUploadMaps({ bucket, campaignId, context, upsertMapRecord, positionStore, counters }) {
  for (let index = 0; index < bucket.maps.length; index += 1) {
    const map = bucket.maps[index] || {};
    const mapUid = toText(map?.uid || map?.mapUid || map?.map_uid);
    if (!mapUid) continue;
    counters.uploadMapsSeen += 1;
    const slot = normalizeCampaignSlotValue({
      slot: map.slot,
      order: map.order,
      position: map.position,
      fallbackSlot: index + 1,
      max: 100000,
    });
    const stored = upsertMapRecord(map, {
      payload: {
        ...selectRawPayload(map),
        uploadBucket: uploadMetadata(bucket, context, slot),
      },
    });
    if (!stored || !campaignId) continue;
    if (
      linkUploadPosition(positionStore, {
        mapUid: stored.mapUid,
        campaignId,
        slot,
        updatedAt: stored.now,
        uploadBucketId: bucket.bucketId,
      })
    ) {
      counters.mapsLinked += 1;
    }
  }
}

function ingestUploadBuckets({ buckets, campaignRepository, upsertMapRecord, positionStore, counters, context }) {
  for (const rawBucket of buckets) {
    const bucket = normalizeUploadBucket(rawBucket);
    if (!bucket) continue;
    counters.uploadBucketsSeen += 1;
    const campaign = createUploadCampaign(campaignRepository, rawBucket, bucket, context);
    ingestUploadMaps({
      bucket,
      campaignId: Number(campaign?.campaignId || 0),
      context,
      upsertMapRecord,
      positionStore,
      counters,
    });
  }
}

export { ingestUploadBuckets, normalizeUploadBucket };
