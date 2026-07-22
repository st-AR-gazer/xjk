import assert from "node:assert/strict";
import test from "node:test";

import { clampInt as sharedClampInt } from "../../shared/valueUtils.js";
import {
  buildWrLeaderboardsFromTrackerMaps,
  clampInt,
  deriveMapMetadata,
  extractCampaignMaps,
  runWithConcurrency,
} from "../src/services/altered/serviceSupport.js";

test("service number normalization uses the canonical fallback semantics", () => {
  const options = { min: 1, max: 100, fallback: 25 };
  for (const value of [null, "", undefined, "invalid", 50.9, 101]) {
    assert.equal(clampInt(value, options), sharedClampInt(value, options));
  }
});

test("map metadata helpers preserve normalized campaign fields", () => {
  const metadata = deriveMapMetadata({
    name: "Winter 2026 - 01",
    campaign: "Winter 2026",
    slot: 1,
  });

  assert.equal(metadata.season, "Winter");
  assert.equal(metadata.year, 2026);
  assert.deepEqual(metadata.mapnumber, [1]);
});

test("live campaign helpers normalize and deduplicate maps", () => {
  const maps = extractCampaignMaps({
    maps: [
      { uid: "ABC", name: "First", slot: 1 },
      { uid: "abc", name: "Duplicate", slot: 2 },
    ],
  });

  assert.equal(maps.length, 1);
  assert.equal(maps[0].uid, "ABC");
  assert.deepEqual(buildWrLeaderboardsFromTrackerMaps([]).overall, []);
});

test("bounded concurrency preserves input order", async () => {
  const values = await runWithConcurrency([3, 1, 2], 2, async (value) => value * 2);
  assert.deepEqual(values, [6, 2, 4]);
});
