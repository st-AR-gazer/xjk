import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "../src/db/index.js";
import { AlteredRepository } from "../src/repositories/alteredRepository.js";

function withRepository(run) {
  const db = createDatabase({ filePath: ":memory:" });
  try {
    return run(new AlteredRepository(db), db);
  } finally {
    db.close();
  }
}

test("monitoring ingestion normalizes and persists each record family atomically", () => {
  withRepository((repository, db) => {
    const result = repository.monitoring.upsertClubMonitoringData({
      clubId: 42,
      members: [
        { account_id: "player-one", display_name: "Player One", role: "owner" },
        { accountId: "player-one", displayName: "Duplicate" },
      ],
      activities: [
        {
          activity_id: "7",
          type: "campaign",
          item_name: "Weekly maps",
          bucket_id: "9",
          timestamp: 1_752_796_800,
        },
      ],
      uploadBuckets: [
        {
          id: 9,
          title: "Weekly maps",
          maps: [
            { map_uid: "map-a", title: "Map A" },
            { uid: "map-a", title: "Duplicate Map A" },
            { uid: "map-b", position: 4 },
          ],
        },
      ],
    });

    assert.deepEqual(result, {
      membersSeen: 1,
      membersInserted: 1,
      membersUpdated: 0,
      activitiesSeen: 1,
      activitiesInserted: 1,
      activitiesUpdated: 0,
      uploadBucketsSeen: 1,
      uploadBucketsInserted: 1,
      uploadBucketsUpdated: 0,
      uploadMapsSeen: 2,
      uploadMapsInserted: 2,
      uploadMapsUpdated: 0,
    });
    assert.equal(db.prepare("SELECT display_name FROM altered_club_members").get().display_name, "Player One");
    assert.equal(db.prepare("SELECT is_admin FROM altered_club_members").get().is_admin, 1);
    assert.deepEqual(repository.monitoring.getKnownActivityIds({ clubId: 42, activityIds: [7, 7, 99] }), [7]);
    assert.deepEqual(repository.monitoring.getKnownUploadBucketIds({ clubId: 42, bucketIds: [9, 10] }), [9]);

    const update = repository.monitoring.upsertClubMonitoringData({
      clubId: 42,
      members: [{ accountId: "player-one", displayName: "Player 1" }],
      uploadBuckets: [{ id: 9, maps: [{ uid: "map-a", slot: 2 }] }],
    });
    assert.equal(update.membersUpdated, 1);
    assert.equal(update.uploadBucketsUpdated, 1);
    assert.equal(update.uploadMapsUpdated, 1);
  });
});

test("monitoring ingestion reports failures and rolls the complete batch back", () => {
  withRepository((repository, db) => {
    db.exec(`
      CREATE TRIGGER reject_monitoring_activity
      BEFORE INSERT ON altered_club_activities
      BEGIN
        SELECT RAISE(ABORT, 'activity rejected');
      END;
    `);

    const result = repository.monitoring.upsertClubMonitoringData({
      clubId: 42,
      members: [{ accountId: "rolled-back-player" }],
      activities: [{ activityId: 7 }],
    });

    assert.match(result.error, /activity rejected/);
    assert.equal(result.membersSeen, 1);
    assert.equal(result.activitiesSeen, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM altered_club_members").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM altered_club_activities").get().count, 0);
  });
});

test("monitoring ingestion rejects missing club identity before opening a transaction", () => {
  withRepository((repository) => {
    assert.deepEqual(repository.monitoring.upsertClubMonitoringData({ members: [{}] }), {
      error: "clubId is required.",
    });
  });
});
