import assert from "node:assert/strict";
import test from "node:test";
import { flattenTotdMonths, normalizeTotdDay } from "../src/totdDay.js";

const fixedNow = () => Date.parse("2026-07-19T12:00:00.000Z");

test("TOTD source payloads normalize through one domain adapter", () => {
  const days = flattenTotdMonths(
    {
      monthList: [
        {
          year: 2026,
          month: 7,
          days: [
            {
              monthDay: 18,
              mapUid: " map-uid ",
              campaignId: "42",
              startTimestamp: 1_752_796_800,
              seasonUid: " ",
            },
            { monthDay: 19, mapUid: "" },
          ],
        },
      ],
    },
    { now: fixedNow }
  );

  assert.deepEqual(days, [
    {
      id: "2026-07-18:map-uid",
      cotdDate: "2026-07-18",
      year: 2026,
      month: 7,
      day: null,
      monthDay: 18,
      campaignId: 42,
      mapUid: "map-uid",
      seasonUid: null,
      leaderboardGroup: null,
      startTimestamp: 1_752_796_800,
      endTimestamp: null,
      startAt: "2025-07-18T00:00:00.000Z",
      endAt: null,
      raw: {
        monthDay: 18,
        mapUid: " map-uid ",
        campaignId: "42",
        startTimestamp: 1_752_796_800,
        seasonUid: " ",
      },
    },
  ]);
});

test("TOTD dates fall back deterministically when source dates are incomplete", () => {
  const day = normalizeTotdDay({ map_uid: "fallback-map" }, { now: fixedNow });
  assert.equal(day.cotdDate, "2026-07-19");
  assert.equal(day.id, "2026-07-19:fallback-map");
});
