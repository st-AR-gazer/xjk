import { withSqliteTransaction } from "../../../../shared/sqliteRuntime.js";
import { serializeJson } from "../alteredRepositorySupport.js";

function createMonitoringCounters() {
  return {
    membersSeen: 0,
    membersInserted: 0,
    membersUpdated: 0,
    activitiesSeen: 0,
    activitiesInserted: 0,
    activitiesUpdated: 0,
    uploadBucketsSeen: 0,
    uploadBucketsInserted: 0,
    uploadBucketsUpdated: 0,
    uploadMapsSeen: 0,
    uploadMapsInserted: 0,
    uploadMapsUpdated: 0,
  };
}

function createMonitoringStatements(db) {
  return {
    selectMember: db.prepare(
      `SELECT 1 AS present
       FROM altered_club_members
       WHERE club_id = ? AND account_id = ?
       LIMIT 1`
    ),
    upsertMember: db.prepare(
      `INSERT INTO altered_club_members (
         club_id, account_id, display_name, role, status, is_admin, is_vip, is_creator,
         joined_at, left_at, payload_json, first_seen_at, last_seen_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(club_id, account_id) DO UPDATE SET
         display_name = COALESCE(NULLIF(excluded.display_name, ''), altered_club_members.display_name),
         role = COALESCE(NULLIF(excluded.role, ''), altered_club_members.role),
         status = COALESCE(NULLIF(excluded.status, ''), altered_club_members.status),
         is_admin = excluded.is_admin,
         is_vip = excluded.is_vip,
         is_creator = excluded.is_creator,
         joined_at = COALESCE(excluded.joined_at, altered_club_members.joined_at),
         left_at = excluded.left_at,
         payload_json = COALESCE(excluded.payload_json, altered_club_members.payload_json),
         last_seen_at = excluded.last_seen_at,
         updated_at = excluded.updated_at`
    ),
    selectActivity: db.prepare(
      `SELECT 1 AS present
       FROM altered_club_activities
       WHERE club_id = ? AND activity_id = ?
       LIMIT 1`
    ),
    upsertActivity: db.prepare(
      `INSERT INTO altered_club_activities (
         club_id, activity_id, activity_type, item_type, name, campaign_external_id,
         bucket_id, map_uid, author_account_id, active, occurred_at, payload_json,
         first_seen_at, last_seen_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(club_id, activity_id) DO UPDATE SET
         activity_type = COALESCE(NULLIF(excluded.activity_type, ''), altered_club_activities.activity_type),
         item_type = COALESCE(NULLIF(excluded.item_type, ''), altered_club_activities.item_type),
         name = COALESCE(NULLIF(excluded.name, ''), altered_club_activities.name),
         campaign_external_id = COALESCE(excluded.campaign_external_id, altered_club_activities.campaign_external_id),
         bucket_id = COALESCE(excluded.bucket_id, altered_club_activities.bucket_id),
         map_uid = COALESCE(NULLIF(excluded.map_uid, ''), altered_club_activities.map_uid),
         author_account_id = COALESCE(NULLIF(excluded.author_account_id, ''), altered_club_activities.author_account_id),
         active = excluded.active,
         occurred_at = COALESCE(excluded.occurred_at, altered_club_activities.occurred_at),
         payload_json = COALESCE(excluded.payload_json, altered_club_activities.payload_json),
         last_seen_at = excluded.last_seen_at,
         updated_at = excluded.updated_at`
    ),
    selectUploadBucket: db.prepare(
      `SELECT 1 AS present
       FROM altered_upload_buckets
       WHERE club_id = ? AND bucket_id = ?
       LIMIT 1`
    ),
    upsertUploadBucket: db.prepare(
      `INSERT INTO altered_upload_buckets (
         club_id, bucket_id, bucket_type, name, activity_id, map_count, active,
         payload_json, first_seen_at, last_seen_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(club_id, bucket_id) DO UPDATE SET
         bucket_type = COALESCE(NULLIF(excluded.bucket_type, ''), altered_upload_buckets.bucket_type),
         name = COALESCE(NULLIF(excluded.name, ''), altered_upload_buckets.name),
         activity_id = COALESCE(excluded.activity_id, altered_upload_buckets.activity_id),
         map_count = excluded.map_count,
         active = excluded.active,
         payload_json = COALESCE(excluded.payload_json, altered_upload_buckets.payload_json),
         last_seen_at = excluded.last_seen_at,
         updated_at = excluded.updated_at`
    ),
    selectUploadMap: db.prepare(
      `SELECT 1 AS present
       FROM altered_upload_maps
       WHERE club_id = ? AND bucket_id = ? AND map_uid = ?
       LIMIT 1`
    ),
    upsertUploadMap: db.prepare(
      `INSERT INTO altered_upload_maps (
         club_id, bucket_id, map_uid, slot, map_name, author_account_id,
         payload_json, first_seen_at, last_seen_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(club_id, bucket_id, map_uid) DO UPDATE SET
         slot = excluded.slot,
         map_name = COALESCE(NULLIF(excluded.map_name, ''), altered_upload_maps.map_name),
         author_account_id = COALESCE(NULLIF(excluded.author_account_id, ''), altered_upload_maps.author_account_id),
         payload_json = COALESCE(excluded.payload_json, altered_upload_maps.payload_json),
         last_seen_at = excluded.last_seen_at,
         updated_at = excluded.updated_at`
    ),
  };
}

function writeMembers({ clubId, members, now, counters, statements }) {
  for (const member of members) {
    counters.membersSeen += 1;
    const existed = Boolean(statements.selectMember.get(clubId, member.accountId));
    statements.upsertMember.run(
      clubId,
      member.accountId,
      member.displayName || null,
      member.role || null,
      member.status || null,
      member.isAdmin ? 1 : 0,
      member.isVip ? 1 : 0,
      member.isCreator ? 1 : 0,
      member.joinedAt,
      member.leftAt,
      serializeJson(member.payload),
      now,
      now,
      now
    );
    counters[existed ? "membersUpdated" : "membersInserted"] += 1;
  }
}

function writeActivities({ clubId, activities, now, counters, statements }) {
  for (const activity of activities) {
    counters.activitiesSeen += 1;
    const existed = Boolean(statements.selectActivity.get(clubId, activity.activityId));
    statements.upsertActivity.run(
      clubId,
      activity.activityId,
      activity.activityType || null,
      activity.itemType || null,
      activity.name || null,
      activity.campaignExternalId,
      activity.bucketId,
      activity.mapUid || null,
      activity.authorAccountId || null,
      activity.active ? 1 : 0,
      activity.occurredAt,
      serializeJson(activity.payload),
      now,
      now,
      now
    );
    counters[existed ? "activitiesUpdated" : "activitiesInserted"] += 1;
  }
}

function writeUploadMap({ clubId, bucketId, map, now, counters, statements }) {
  counters.uploadMapsSeen += 1;
  const existed = Boolean(statements.selectUploadMap.get(clubId, bucketId, map.mapUid));
  statements.upsertUploadMap.run(
    clubId,
    bucketId,
    map.mapUid,
    map.slot,
    map.mapName || null,
    map.authorAccountId || null,
    serializeJson(map.payload),
    now,
    now,
    now
  );
  counters[existed ? "uploadMapsUpdated" : "uploadMapsInserted"] += 1;
}

function writeUploadBuckets({ clubId, uploadBuckets, now, counters, statements }) {
  for (const bucket of uploadBuckets) {
    counters.uploadBucketsSeen += 1;
    const existed = Boolean(statements.selectUploadBucket.get(clubId, bucket.bucketId));
    statements.upsertUploadBucket.run(
      clubId,
      bucket.bucketId,
      bucket.bucketType,
      bucket.name || null,
      bucket.activityId,
      bucket.mapCount,
      bucket.active ? 1 : 0,
      serializeJson(bucket.payload),
      now,
      now,
      now
    );
    counters[existed ? "uploadBucketsUpdated" : "uploadBucketsInserted"] += 1;

    for (const map of bucket.maps) {
      writeUploadMap({ clubId, bucketId: bucket.bucketId, map, now, counters, statements });
    }
  }
}

function persistClubMonitoringData(db, { clubId, records, now, counters = createMonitoringCounters() }) {
  const statements = createMonitoringStatements(db);
  return withSqliteTransaction(
    db,
    () => {
      writeMembers({ clubId, members: records.members, now, counters, statements });
      writeActivities({ clubId, activities: records.activities, now, counters, statements });
      writeUploadBuckets({ clubId, uploadBuckets: records.uploadBuckets, now, counters, statements });
      return counters;
    },
    { mode: "DEFERRED" }
  );
}

export { createMonitoringCounters, createMonitoringStatements, persistClubMonitoringData };
