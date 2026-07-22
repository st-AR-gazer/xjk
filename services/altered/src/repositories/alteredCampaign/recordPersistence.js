import { nullableText, positiveIntegerOrNull } from "./input.js";

function getCampaignRecord(db, campaignId) {
  if (!campaignId) return null;
  return (
    db
      .prepare(
        `SELECT
           external_campaign_id AS externalCampaignId,
           upload_bucket_id AS uploadBucketId,
           activity_id AS activityId,
           activity_type AS activityType,
           campaign_type AS campaignType,
           start_timestamp AS startTimestamp,
           end_timestamp AS endTimestamp,
           published,
           leaderboard_group_uid AS leaderboardGroupUid,
           payload_json AS payloadJson
         FROM altered_campaigns
         WHERE campaign_id = ?
         LIMIT 1`
      )
      .get(campaignId) || null
  );
}

function mergeCampaignRecord(input, existing = null) {
  return {
    externalCampaignId: input.externalCampaignId ?? positiveIntegerOrNull(existing?.externalCampaignId),
    uploadBucketId: input.uploadBucketId ?? positiveIntegerOrNull(existing?.uploadBucketId),
    activityId: input.activityId ?? positiveIntegerOrNull(existing?.activityId),
    activityType: input.activityType ?? nullableText(existing?.activityType),
    campaignType: input.campaignType ?? nullableText(existing?.campaignType),
    startTimestamp: input.startTimestamp ?? existing?.startTimestamp ?? null,
    endTimestamp: input.endTimestamp ?? existing?.endTimestamp ?? null,
    published: input.publishedProvided ? input.published : Boolean(Number(existing?.published || 0)),
    leaderboardGroupUid: input.leaderboardGroupUid ?? nullableText(existing?.leaderboardGroupUid),
    payloadJson: input.payloadJson ?? existing?.payloadJson ?? null,
  };
}

function insertCampaign(db, { input, record, name, now }) {
  const result = db
    .prepare(
      `INSERT INTO altered_campaigns (
         club_id, name, external_campaign_id, upload_bucket_id, activity_id,
         activity_type, campaign_type, start_timestamp, end_timestamp, published,
         leaderboard_group_uid, payload_json, monitor_updated_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.clubId,
      name,
      record.externalCampaignId,
      record.uploadBucketId,
      record.activityId,
      record.activityType,
      record.campaignType,
      record.startTimestamp,
      record.endTimestamp,
      record.published ? 1 : 0,
      record.leaderboardGroupUid,
      record.payloadJson,
      now,
      now,
      now
    );
  return Number(result.lastInsertRowid || 0);
}

function updateCampaign(db, { campaignId, record, name, now }) {
  db.prepare(
    `UPDATE altered_campaigns
     SET name = ?,
         external_campaign_id = ?,
         upload_bucket_id = ?,
         activity_id = ?,
         activity_type = ?,
         campaign_type = ?,
         start_timestamp = ?,
         end_timestamp = ?,
         published = ?,
         leaderboard_group_uid = ?,
         payload_json = ?,
         monitor_updated_at = ?,
         updated_at = ?
     WHERE campaign_id = ?`
  ).run(
    name,
    record.externalCampaignId,
    record.uploadBucketId,
    record.activityId,
    record.activityType,
    record.campaignType,
    record.startTimestamp,
    record.endTimestamp,
    record.published ? 1 : 0,
    record.leaderboardGroupUid,
    record.payloadJson,
    now,
    now,
    campaignId
  );
  return campaignId;
}

function saveCampaignRecord(db, { input, target, name, now }) {
  const campaignId = Number(target?.campaignId || 0);
  const record = mergeCampaignRecord(input, getCampaignRecord(db, campaignId));
  return campaignId
    ? updateCampaign(db, { campaignId, record, name, now })
    : insertCampaign(db, { input, record, name, now });
}

function getCampaignIdentity(db, campaignId) {
  return (
    db
      .prepare(
        `SELECT
           campaign_id AS campaignId,
           name,
           external_campaign_id AS externalCampaignId
         FROM altered_campaigns
         WHERE campaign_id = ?
         LIMIT 1`
      )
      .get(campaignId) || null
  );
}

export { getCampaignIdentity, getCampaignRecord, mergeCampaignRecord, saveCampaignRecord };
