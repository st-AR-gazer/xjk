import assert from "node:assert/strict";
import test from "node:test";

import { buildCampaignSnapshot } from "../src/services/altered/livePayloadSupport.js";

test("buildCampaignSnapshot gives discovery paths one campaign payload contract", () => {
  const raw = {
    campaign_id: 42,
    campaignName: "Summer Altered",
    activity_type: "campaign",
    start_date: "2026-06-01T00:00:00.000Z",
    end_date: "2026-07-01T00:00:00.000Z",
    isPublished: 1,
    leaderboard_group_uid: "group-uid",
    maps: [{ uid: "map-1", name: "Map One" }],
  };

  const snapshot = buildCampaignSnapshot({
    descriptor: { activityId: 7, activityType: "descriptor-type" },
    campaignPayload: raw,
  });

  assert.equal(snapshot.name, "Summer Altered");
  assert.equal(snapshot.campaignId, 42);
  assert.equal(snapshot.activityId, 7);
  assert.equal(snapshot.activityType, "descriptor-type");
  assert.equal(snapshot.startTimestamp, "2026-06-01T00:00:00.000Z");
  assert.equal(snapshot.endTimestamp, "2026-07-01T00:00:00.000Z");
  assert.equal(snapshot.published, true);
  assert.equal(snapshot.leaderboardGroupUid, "group-uid");
  assert.equal(snapshot.maps[0].uid, "map-1");
  assert.equal(snapshot.raw, raw);
});
