import assert from "node:assert/strict";
import test from "node:test";

import { createDatabase } from "../src/db/index.js";
import { AggregatorRepository } from "../src/repositories/aggregatorRepository.js";

const ACCOUNT_ID = "12345678-1234-4234-8234-123456789abc";

function withRepository(run) {
  const db = createDatabase({ filePath: ":memory:" });
  try {
    return run(new AggregatorRepository(db), db);
  } finally {
    db.close();
  }
}

function snapshot(overrides = {}) {
  return {
    projectKey: "club-test",
    sourceLabel: "test-source",
    observedAt: "2026-07-20T10:00:00.000Z",
    club: { id: 42, name: "Initial Club" },
    campaigns: [
      {
        id: 10,
        name: "Initial Campaign",
        maps: [{ uid: "campaign-map", name: "Campaign Map", slot: 1, authorAccountId: ACCOUNT_ID }],
      },
    ],
    uploadBuckets: [
      {
        id: 20,
        name: "Initial Uploads",
        maps: [{ uid: "upload-map", name: "Upload Map", position: 2 }],
      },
    ],
    members: [{ accountId: ACCOUNT_ID, displayName: "Initial Player", role: "member" }],
    ...overrides,
  };
}

test("club snapshots share one insert and update counter contract across their relation types", () => {
  withRepository((repository, db) => {
    const inserted = repository.ingestClubSnapshot(snapshot());
    assert.deepEqual(
      {
        campaignsSeen: inserted.campaignsSeen,
        campaignMapsSeen: inserted.campaignMapsSeen,
        uploadsSeen: inserted.uploadsSeen,
        uploadMapsSeen: inserted.uploadMapsSeen,
        membersSeen: inserted.membersSeen,
      },
      { campaignsSeen: 1, campaignMapsSeen: 1, uploadsSeen: 1, uploadMapsSeen: 1, membersSeen: 1 }
    );

    const updated = repository.ingestClubSnapshot(
      snapshot({
        observedAt: "2026-07-20T11:00:00.000Z",
        club: { id: 42, name: "Updated Club" },
        campaigns: [
          {
            id: 10,
            name: "Updated Campaign",
            maps: [{ uid: "campaign-map", name: "Updated Map", slot: 7, authorAccountId: ACCOUNT_ID }],
          },
        ],
        uploadBuckets: [],
        members: [{ accountId: ACCOUNT_ID, displayName: "Updated Player", role: "admin" }],
      })
    );

    assert.deepEqual(
      {
        campaignsSeen: updated.campaignsSeen,
        campaignMapsSeen: updated.campaignMapsSeen,
        uploadsSeen: updated.uploadsSeen,
        uploadMapsSeen: updated.uploadMapsSeen,
        membersSeen: updated.membersSeen,
      },
      { campaignsSeen: 1, campaignMapsSeen: 1, uploadsSeen: 0, uploadMapsSeen: 0, membersSeen: 1 }
    );
    assert.equal(repository.getClubSummary(42).clubName, "Updated Club");
    assert.equal(repository.getClubCampaigns(42)[0].name, "Updated Campaign");
    assert.equal(repository.getClubMembers(42)[0].displayName, "Updated Player");
    assert.deepEqual(
      {
        ...db
          .prepare("SELECT map_name AS name, position FROM club_campaign_maps WHERE map_uid = ?")
          .get("campaign-map"),
      },
      { name: "Updated Map", position: 7 }
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM account_display_name_history WHERE account_id = ?").get(ACCOUNT_ID)
        .count,
      2
    );
  });
});

test("club snapshot failures roll back club, relation, name, and event mutations together", () => {
  withRepository((repository, db) => {
    repository.ingestClubSnapshot(snapshot());
    const eventsBefore = db.prepare("SELECT COUNT(*) AS count FROM aggregator_events").get().count;
    db.exec(`
      CREATE TRIGGER reject_snapshot_member
      BEFORE UPDATE ON club_members
      BEGIN
        SELECT RAISE(ABORT, 'forced club rollback');
      END
    `);

    assert.throws(
      () =>
        repository.ingestClubSnapshot(
          snapshot({
            club: { id: 42, name: "Must Roll Back" },
            campaigns: [{ id: 11, name: "Must Roll Back", maps: [{ uid: "rolled-back-map" }] }],
          })
        ),
      /forced club rollback/
    );
    assert.equal(repository.getClubSummary(42).clubName, "Initial Club");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM club_campaigns WHERE campaign_id = 11").get().count, 0);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM map_registry WHERE map_uid = ?").get("rolled-back-map").count,
      0
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM aggregator_events").get().count, eventsBefore);

    db.exec("DROP TRIGGER reject_snapshot_member");
    assert.equal(repository.ingestClubSnapshot(snapshot({ club: { id: 42, name: "Recovered Club" } })).clubId, 42);
  });
});
