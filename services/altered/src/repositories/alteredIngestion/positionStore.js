import { clampInt, toText } from "../alteredRepositorySupport.js";

function createPositionStore(db) {
  const selectPosition = db.prepare(`
    SELECT
      p.campaign_id AS campaignId,
      p.slot,
      c.campaign_type AS campaignType,
      c.upload_bucket_id AS uploadBucketId
    FROM altered_map_positions p
    LEFT JOIN altered_campaigns c ON c.campaign_id = p.campaign_id
    WHERE p.map_uid = ?
    LIMIT 1
  `);
  const upsertPosition = db.prepare(`
    INSERT INTO altered_map_positions (map_uid, campaign_id, slot, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(map_uid) DO UPDATE SET
      campaign_id = excluded.campaign_id,
      slot = excluded.slot,
      updated_at = excluded.updated_at
  `);

  return {
    get(mapUid) {
      return selectPosition.get(mapUid) || null;
    },
    set({ mapUid, campaignId, slot, updatedAt }) {
      upsertPosition.run(mapUid, campaignId, slot, updatedAt);
    },
  };
}

function positionChanged(position, campaignId, slot) {
  return (
    !position || Number(position.campaignId || 0) !== Number(campaignId) || Number(position.slot || 0) !== Number(slot)
  );
}

function linkCampaignPosition(store, { mapUid, campaignId, slot, updatedAt }) {
  const current = store.get(mapUid);
  store.set({ mapUid, campaignId, slot, updatedAt });
  return positionChanged(current, campaignId, slot);
}

function canAssignUploadPosition(position, uploadBucketId) {
  if (!position || !Number(position.campaignId || 0)) return true;
  const currentType = toText(position.campaignType).toLowerCase();
  const currentBucketId = clampInt(position.uploadBucketId, {
    min: 1,
    max: 2147483647,
    fallback: 0,
  });
  return currentType === "upload-bucket" || currentBucketId === uploadBucketId;
}

function linkUploadPosition(store, { mapUid, campaignId, slot, updatedAt, uploadBucketId }) {
  const current = store.get(mapUid);
  if (!canAssignUploadPosition(current, uploadBucketId)) return false;
  store.set({ mapUid, campaignId, slot, updatedAt });
  return positionChanged(current, campaignId, slot);
}

export { createPositionStore, linkCampaignPosition, linkUploadPosition, positionChanged };
