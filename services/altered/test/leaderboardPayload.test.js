import assert from "node:assert/strict";
import test from "node:test";

import { LeaderboardService } from "../src/services/altered/alterationCatalog/leaderboardService.js";
import {
  loadMedalPayload,
  normalizeLeaderboardOptions,
  resolveLeaderboardRows,
  trackerPayloadRows,
} from "../src/services/altered/alterationCatalog/leaderboardPayload.js";

test("leaderboard options clamp paging and independently disable expensive sections", () => {
  assert.deepEqual(
    normalizeLeaderboardOptions({
      limit: 900,
      mapsOffset: -2,
      overallLimit: 0,
      overallOffset: 3_000_000,
      perBucketLimit: 90,
      includeMaps: false,
      includeBuckets: false,
      includeMedals: false,
    }),
    {
      limit: 500,
      mapsOffset: 0,
      overallLimit: 1,
      overallOffset: 2_000_000,
      perBucketLimit: 50,
      includeMaps: false,
      includeBuckets: false,
      includeMedals: false,
    }
  );
});

test("tracker leaderboard payload accepts camel and snake bucket fields and pages ranked rows", () => {
  const resolved = trackerPayloadRows(
    {
      overall: [{ player: "one" }, { player: "two" }, { player: "three" }],
      bySeasonRows: [{ bucket: "Spring" }],
      by_campaign_rows: [{ bucket: "Campaign" }],
      by_slot_rows: [{ bucket: "01" }],
      summary: { uniquePlayers: 9, totalWrs: 14 },
      source: "rank-one",
    },
    { overallOffset: 1, overallLimit: 1 }
  );

  assert.deepEqual(resolved.rows.overall, [{ player: "two" }]);
  assert.equal(resolved.rows.bySeasonRows[0].bucket, "Spring");
  assert.equal(resolved.rows.byCampaignRows[0].bucket, "Campaign");
  assert.equal(resolved.summary.unique_players, 9);
  assert.equal(resolved.source, "rank-one");
});

test("leaderboard row resolution falls through endpoint errors to tracked-map ranking", async () => {
  const calls = [];
  const resolved = await resolveLeaderboardRows({
    storedRows: { overall: [], bySeasonRows: [], byCampaignRows: [], bySlotRows: [] },
    trackerCoverageClient: {
      getLeaderboardWrLeaderboards: async () => {
        calls.push("leaderboard");
        return { ok: false, error: "offline" };
      },
      getTrackedMaps: async () => {
        calls.push("maps");
        return {
          ok: true,
          data: {
            maps: [
              { wrHolder: "Alpha", wrMs: 10, campaign: "Spring 2026", slot: 1 },
              { wrHolder: "Alpha", wrMs: 11, campaign: "Spring 2026", slot: 2 },
              { wrHolder: "Beta", wrMs: 12, campaign: "Winter 2026", slot: 1 },
            ],
          },
        };
      },
    },
    options: { overallLimit: 50, overallOffset: 0, perBucketLimit: 10, includeBuckets: true },
  });

  assert.deepEqual(calls, ["leaderboard", "maps"]);
  assert.equal(resolved.source, "tracker-fallback");
  assert.equal(resolved.rows.overall[0].player, "Alpha");
  assert.equal(resolved.rows.overall[0].wr_count, 2);
});

test("medal loading covers disabled, unavailable, and successful responses", async () => {
  const disabled = await loadMedalPayload({ trackerClient: {}, options: { includeMedals: false } });
  assert.equal(disabled.available, false);
  assert.match(disabled.note, /disabled/);

  const unavailable = await loadMedalPayload({
    trackerClient: { getMedalLeaderboards: async () => ({ ok: false, error: "no medals" }) },
    options: { includeMedals: true, limit: 4 },
  });
  assert.equal(unavailable.note, "no medals");

  const successful = await loadMedalPayload({
    trackerClient: {
      getMedalLeaderboards: async () => ({ ok: true, data: { mapsSampled: 7, topByMedal: { author: [1] } } }),
    },
    options: { includeMedals: true, limit: 4 },
  });
  assert.equal(successful.available, true);
  assert.equal(successful.maps_sampled, 7);
  assert.deepEqual(successful.top_by_medal, { author: [1] });
});

test("LeaderboardService preserves stored ranking, name resolution, coverage, and empty optional sections", async () => {
  const alphaId = "00000000-0000-0000-0000-000000000001";
  const betaId = "00000000-0000-0000-0000-000000000002";
  const repository = {
    catalog: {
      listMostPlayedAlterationsMaps: () => {
        throw new Error("maps should be disabled");
      },
      getAlterationsStats: () => ({ totalMaps: 20, activelyTracked: 12 }),
    },
    leaderboard: {
      listWrLeaderboardOverall: () => [
        { account_id: alphaId, player: alphaId, wr_count: 1 },
        { account_id: betaId, player: betaId, wr_count: 3 },
      ],
      listWrLeaderboardBySeason: () => {
        throw new Error("buckets should be disabled");
      },
      listWrLeaderboardByCampaign: () => [],
      listWrLeaderboardBySlot: () => [],
      getWrLeaderboardSummary: () => ({ total_wrs: 4, unique_players: 2 }),
    },
  };
  const trackerClient = {
    getLeaderboardCoverage: async () => ({ ok: true, data: { coverage: { mapsWithKnownWr: 8 } } }),
  };
  const service = new LeaderboardService({
    repository,
    trackerClient,
    getTrackerSyncService: () => ({ getTrackerSyncTargetClient: () => null }),
    getPlayerIdentityService: () => ({
      resolvePlayerNamesByAccountIds: async () => ({ [alphaId]: "Alpha", [betaId]: "Beta" }),
    }),
  });

  const payload = await service.getAlterationsLeaderboards({
    includeMaps: false,
    includeBuckets: false,
    includeMedals: false,
  });
  assert.deepEqual(
    payload.wr.overall.map((row) => row.display_name),
    ["Beta", "Alpha"]
  );
  assert.deepEqual(payload.maps.most_played, []);
  assert.deepEqual(payload.wr.by_season, []);
  assert.equal(payload.summary.wr_source, "altered-db");
  assert.equal(payload.summary.leaderboard_coverage.maps_with_known_wr, 8);
  assert.equal(payload.medals.available, false);
});
