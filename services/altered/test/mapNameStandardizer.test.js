import assert from "node:assert/strict";
import test from "node:test";

import * as standardizer from "../src/services/mapNameStandardizer.js";

const PUBLIC_EXPORTS = [
  "SOURCE_VERSION",
  "WEEKLY_SHORTS_CANONICAL_MAPS",
  "buildMapNameCandidate",
  "classifyNamingSimilaritySource",
  "deriveMapNumbers",
  "deriveParserWarning",
  "extractMapNumberFromText",
  "extractMapNumbersFromText",
  "listKnownAlterationRegexBehavior",
  "listKnownAlterationRegexLibrary",
  "normalizeWeeklyShortsTitle",
  "parseAlterationTail",
  "parseCampaignStandardizedFields",
  "parseStandardizedFields",
  "resolveCanonicalWeeklyShortsWeek",
  "resolveWeeklyGrandWeek",
  "resolveWeeklyShortsEntry",
  "resolveWeeklyShortsWeek",
  "sanitizeMapName",
  "shouldExcludeFromNamingReview",
].sort();

test("standardizer facade preserves its complete public API", () => {
  assert.deepEqual(Object.keys(standardizer).sort(), PUBLIC_EXPORTS);
  assert.equal(standardizer.SOURCE_VERSION, "sorting-v4-campaign-aware");
  assert.equal(standardizer.WEEKLY_SHORTS_CANONICAL_MAPS.length, 25);
});

test("map and alteration parsing preserves established normalization", () => {
  assert.equal(standardizer.sanitizeMapName("$f00Winter 2026 - 01   Ice"), "Winter 2026 - 01 Ice");
  assert.deepEqual(standardizer.parseAlterationTail("[Snow], Wet Wood + Reverse"), {
    alterations: ["Wet Wood", "Reverse"],
    carType: "Snow",
  });
  assert.deepEqual(standardizer.parseStandardizedFields("Winter 2026 - 01 Ice + Reverse"), {
    sanitizedName: "Winter 2026 - 01 Ice + Reverse",
    parserPattern: "season-year-map-prefix",
    season: "Winter",
    year: 2026,
    mapNumber: 1,
    mapNumbers: [1],
    alteration: "Ice + Reverse",
    alterationMix: ["Ice", "Reverse"],
    alterations: ["Ice", "Reverse"],
    carType: null,
    proposedName: null,
  });
  assert.deepEqual(
    {
      springCode: standardizer.parseStandardizedFields("T05 - Ice"),
      training: standardizer.parseStandardizedFields("Training - Red Combined"),
    },
    {
      springCode: {
        sanitizedName: "T05 - Ice",
        parserPattern: "spring-2020-code",
        season: "Spring",
        year: 2020,
        mapNumber: 15,
        mapNumbers: [15],
        alteration: "Ice",
        alterationMix: ["Ice"],
        alterations: ["Ice"],
        carType: null,
        proposedName: null,
      },
      training: {
        sanitizedName: "Training - Red Combined",
        parserPattern: "training-color-combined",
        season: "Training",
        year: 2020,
        mapNumber: 16,
        mapNumbers: [16, 17, 18, 19, 20],
        alteration: "Combined",
        alterationMix: ["Combined"],
        alterations: ["Combined"],
        carType: null,
        proposedName: "Training - Red Combined",
      },
    }
  );
});

test("campaign and weekly-short parsing preserves canonical metadata", () => {
  assert.deepEqual(standardizer.parseCampaignStandardizedFields("TMGL Winter 2021"), {
    sanitizedName: "TMGL Winter 2021",
    parserPattern: "competition-campaign-alias",
    season: "Winter",
    year: 2021,
    alteration: null,
    alterationMix: [],
    alterations: [],
    carType: null,
    type: "TMGL",
    environment: null,
    special: null,
  });
  assert.deepEqual(standardizer.parseCampaignStandardizedFields("TOTD 2026-07"), {
    sanitizedName: "TOTD 2026-07",
    parserPattern: "campaign-totd-month",
    season: null,
    year: 2026,
    month: 7,
    day: null,
    alteration: null,
    alterationMix: [],
    alterations: [],
    type: null,
    environment: null,
    carType: null,
    special: "TOTD",
  });
  assert.equal(standardizer.resolveWeeklyShortsWeek({ campaignName: "Weekly Shorts Week 29" }), 29);
  assert.equal(standardizer.resolveCanonicalWeeklyShortsWeek(29), 5);
  assert.deepEqual(
    standardizer.resolveWeeklyShortsEntry({
      campaignName: "Weekly Shorts Week 29",
      slot: 3,
      mapName: "anything",
    }),
    {
      mapNumber: 23,
      week: 29,
      position: 3,
      title: "3 - To Play",
      canonicalWeek: 5,
      source: "weekly-shorts-slot",
    }
  );
  assert.equal(standardizer.normalizeWeeklyShortsTitle("$f00NightRace.Map.Gbx"), "nightrace");
});

test("map-number derivation and warnings preserve fallback behavior", () => {
  assert.equal(standardizer.extractMapNumberFromText("Winter 2026 - 07"), 7);
  assert.deepEqual(standardizer.extractMapNumbersFromText("Training - Red Combined"), [16, 17, 18, 19, 20]);
  assert.deepEqual(
    standardizer.deriveMapNumbers({
      mapName: "Unknown",
      slot: 4,
      campaignMapCount: 25,
    }),
    {
      mapNumbers: [4],
      source: "campaign-slot-fallback-25",
      usedSlotFallback: true,
    }
  );
  assert.equal(
    standardizer.deriveParserWarning({
      mapName: "Winter 2026 - Red Combined",
      parserPattern: "",
    }),
    "Looks like a color-set Combined map, but regex did not resolve its slot range."
  );
});

test("candidate and regex contracts remain stable", () => {
  assert.equal(standardizer.classifyNamingSimilaritySource({ campaign: "TMGL Winter 2021" }), "official-competition");
  assert.equal(standardizer.shouldExcludeFromNamingReview({ campaign: "Weekly Shorts Week 6" }), true);
  assert.deepEqual(
    standardizer.buildMapNameCandidate({
      mapUid: "uid-1",
      name: "Winter 2026 - 03 Ice",
      campaign: "Winter 2026",
      slot: 3,
      campaignMapCount: 25,
    }),
    {
      mapUid: "uid-1",
      originalName: "Winter 2026 - 03 Ice",
      sanitizedName: "Winter 2026 - 03 Ice",
      proposedName: "Winter 2026 - 03 | Ice",
      parserPattern: "season-year-map-prefix",
      parserConfidence: 92,
      season: "Winter",
      year: 2026,
      mapNumber: 3,
      mapNumbers: [3],
      alteration: "Ice",
      alterationMix: ["Ice"],
      alterations: ["Ice"],
      carType: null,
      parserWarning: null,
      automationState: "matched",
      requiresRegex: false,
      sourceVersion: "sorting-v4-campaign-aware",
    }
  );

  const library = standardizer.listKnownAlterationRegexLibrary();
  assert.equal(Object.keys(library).length, 168);
  assert.ok(library.combined.some((entry) => entry.legacyPatternId === "colourcombined_seasonal_pattern_1"));
  assert.equal(standardizer.listKnownAlterationRegexLibrary(), library);
  assert.equal(Object.isFrozen(library), true);
  assert.deepEqual(standardizer.listKnownAlterationRegexBehavior().boss.recommendedProfile, {
    regexOnly: true,
    regexOverwriteWeights: false,
  });
});
