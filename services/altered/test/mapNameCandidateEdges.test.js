import assert from "node:assert/strict";
import test from "node:test";

import { buildMapNameCandidate } from "../src/services/mapNameStandardizer.js";

test("empty candidates remain explicit unmatched records", () => {
  assert.deepEqual(buildMapNameCandidate(), {
    mapUid: "",
    originalName: "",
    sanitizedName: "",
    proposedName: null,
    parserPattern: null,
    parserConfidence: 0,
    season: null,
    year: null,
    mapNumber: null,
    mapNumbers: [],
    alteration: null,
    alterationMix: [],
    alterations: [],
    carType: null,
    parserWarning: null,
    automationState: "unmatched",
    requiresRegex: true,
    sourceVersion: "sorting-v4-campaign-aware",
  });
});

test("filename metadata fills missing map-name structure", () => {
  const candidate = buildMapNameCandidate({
    uid: "filename-map",
    name: "???",
    filename: "Summer 2025 - 07 Ice.Map.Gbx",
    campaign: "Summer 2025",
    slot: 7,
    campaignMapCount: 25,
  });

  assert.deepEqual(
    {
      originalName: candidate.originalName,
      proposedName: candidate.proposedName,
      mapNumbers: candidate.mapNumbers,
      alterationMix: candidate.alterationMix,
      automationState: candidate.automationState,
    },
    {
      originalName: "???",
      proposedName: "Summer 2025 - 07 | Ice",
      mapNumbers: [7],
      alterationMix: ["Ice"],
      automationState: "matched",
    }
  );
});

test("canonical weekly campaigns use their dedicated naming contracts", () => {
  const weeklyShort = buildMapNameCandidate({
    mapUid: "weekly-short",
    name: "whatever",
    campaign: "Weekly Shorts Week 29",
    slot: 3,
  });
  const weeklyGrand = buildMapNameCandidate({
    mapUid: "weekly-grand",
    name: "Grand Map",
    campaign: "Weekly Grands Week 8",
    payload: { weeklyGrand: { isCanonicalNadeoWeek: true, week: 8 } },
  });

  assert.deepEqual(
    {
      proposedName: weeklyShort.proposedName,
      mapNumber: weeklyShort.mapNumber,
      canonicalWeek: weeklyShort.weeklyShortsCanonicalWeek,
    },
    { proposedName: "Weekly Shorts - 23 | 3 - To Play", mapNumber: 23, canonicalWeek: 5 }
  );
  assert.deepEqual(
    {
      proposedName: weeklyGrand.proposedName,
      mapNumber: weeklyGrand.mapNumber,
      week: weeklyGrand.weeklyGrandWeek,
    },
    { proposedName: "Weekly Grands - 08", mapNumber: 8, week: 8 }
  );
});

test("non-canonical weekly grands stay in ordinary review", () => {
  const candidate = buildMapNameCandidate({
    mapUid: "noncanonical-grand",
    name: "Grand Map",
    campaign: "Weekly Grands Week 8",
    payload: { weeklyGrand: { isCanonicalNadeoWeek: false, week: 8 } },
  });

  assert.equal(candidate.proposedName, null);
  assert.equal(candidate.parserPattern, "campaign-special-prefix");
  assert.equal(candidate.automationState, "unmatched");
  assert.equal(candidate.requiresRegex, true);
  assert.equal("weeklyGrandWeek" in candidate, false);
});
