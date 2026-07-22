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

test("campaign upsert resolves identity, preserves omitted metadata, and synchronizes the catalog", () => {
  withRepository((repository, db) => {
    const synchronized = [];
    repository.catalog.syncCampaignAlterationsById = (campaignId) => synchronized.push(campaignId);

    const inserted = repository.campaigns.upsertCampaign({
      clubId: 42,
      campaignName: "Spring 2026",
      externalCampaignId: 10,
      uploadBucketId: 20,
      activityId: 30,
      activityType: "campaign",
      campaignType: "seasonal",
      startTimestamp: 1_752_796_800,
      published: true,
      leaderboardGroupUid: "group-1",
      payload: { source: "fixture" },
    });
    const updated = repository.campaigns.upsertCampaign({
      clubId: 42,
      campaignName: "Spring 2026 Updated",
      externalCampaignId: 10,
    });

    assert.equal(updated.campaignId, inserted.campaignId);
    assert.deepEqual(synchronized, [inserted.campaignId, inserted.campaignId]);
    assert.deepEqual(
      {
        ...db
          .prepare(
            `SELECT name, external_campaign_id, upload_bucket_id, activity_id,
                  activity_type, campaign_type, published, leaderboard_group_uid,
                  payload_json
           FROM altered_campaigns
           WHERE campaign_id = ?`
          )
          .get(inserted.campaignId),
      },
      {
        name: "Spring 2026 Updated",
        external_campaign_id: 10,
        upload_bucket_id: 20,
        activity_id: 30,
        activity_type: "campaign",
        campaign_type: "seasonal",
        published: 1,
        leaderboard_group_uid: "group-1",
        payload_json: '{"source":"fixture"}',
      }
    );
  });
});

test("campaign upsert keeps external identities separate when display names collide", () => {
  withRepository((repository) => {
    const first = repository.campaigns.upsertCampaign({
      clubId: 42,
      campaignName: "Shared Name",
      externalCampaignId: 10,
    });
    const second = repository.campaigns.upsertCampaign({
      clubId: 42,
      campaignName: "Shared Name",
      externalCampaignId: 11,
    });

    assert.notEqual(second.campaignId, first.campaignId);
    assert.equal(first.name, "Shared Name");
    assert.equal(second.name, "Shared Name [11]");
    assert.equal(second.externalCampaignId, 11);
  });
});

test("campaign upsert rejects records without a usable name", () => {
  withRepository((repository) => {
    assert.equal(repository.campaigns.upsertCampaign({ clubId: 42, campaignName: " " }), null);
  });
});
