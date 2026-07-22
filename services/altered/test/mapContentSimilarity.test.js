import assert from "node:assert/strict";
import test from "node:test";

import * as mapContentSimilarity from "../src/services/mapContentSimilarity.js";

const expectedExports = [
  "ASSET_FALLBACK_SIGNATURE_VERSION",
  "CONTENT_SIGNATURE_VERSION",
  "CONTENT_SIMILARITY_PATTERN",
  "DEFAULT_SIMILARITY_WEIGHT_PROFILE",
  "applySimilaritySelectionToMatches",
  "buildCampaignFamily",
  "buildContentSimilarityReferenceContext",
  "buildNormalizedSimilarityWeightProfile",
  "buildSimilarityWeightProfile",
  "computeContentSimilarity",
  "deriveSimilarityUnmatchedReason",
  "evaluateSimilarityAutoApproval",
  "extractGbxContentSignature",
  "mergeSimilarityIntoCandidate",
  "normalizeCandidateAutomation",
  "normalizeMapNumbers",
  "similarityWeightProfileFingerprint",
];

function structuredSignature({ model, absolute, relative }) {
  const token = (value) => [{ token: value, count: 1 }];
  return {
    version: mapContentSimilarity.CONTENT_SIGNATURE_VERSION,
    groups: {
      modelTokens: token(model),
      absolutePlacementTokens: token(absolute),
      relativePlacementTokens: token(relative),
    },
  };
}

test("map-content similarity facade preserves its complete public contract", () => {
  assert.deepEqual(Object.keys(mapContentSimilarity).sort(), expectedExports.sort());
});

test("weight profiles retain aliases, bounds, and normalized component totals", () => {
  const raw = mapContentSimilarity.buildSimilarityWeightProfile({
    finalAbsolute: 200,
    finalRelative: -5,
    nameSupport: 17,
    regexOverwriteWeights: true,
    finalRegex: 25,
    selectedRegexPresets: "slot, family; slot",
  });

  assert.equal(raw.final.absolute, 100);
  assert.equal(raw.final.relative, 0);
  assert.equal(raw.final.name, 17);
  assert.equal(raw.final.regex, 25);
  assert.equal(raw.relationalFallback.name, 17);
  assert.deepEqual(raw.selectedRegexPresets, ["slot", "family"]);

  const normalized = mapContentSimilarity.buildNormalizedSimilarityWeightProfile(raw);
  for (const group of [normalized.final, normalized.weightedPlacement, normalized.relationalFallback]) {
    const total = Object.values(group).reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs(total - 1) < Number.EPSILON * 10);
  }
});

test("signature extraction and structured scoring preserve the strongest map assignment", () => {
  const fallback = mapContentSimilarity.extractGbxContentSignature(
    Buffer.from("\0StadiumRoadTech42/CheckpointArch\0StadiumRoadTech42/CheckpointArch\0", "ascii")
  );
  assert.equal(fallback.version, mapContentSimilarity.ASSET_FALLBACK_SIGNATURE_VERSION);
  assert.ok(fallback.assetTokenCount > 0);
  assert.equal(fallback.groups.modelTokens, fallback.tokens);

  const target = structuredSignature({
    model: "RoadTech42",
    absolute: "Absolute-A",
    relative: "Relative-A",
  });
  const result = mapContentSimilarity.computeContentSimilarity(
    target,
    [
      {
        mapUid: "exact-map",
        slot: 3,
        campaignId: 10,
        campaignName: "Summer 2026",
        mapName: "Exact",
        signature: structuredSignature({
          model: "RoadTech42",
          absolute: "Absolute-A",
          relative: "Relative-A",
        }),
      },
      {
        mapUid: "other-map",
        slot: 7,
        campaignId: 11,
        campaignName: "Spring 2026",
        mapName: "Other",
        signature: structuredSignature({
          model: "IceCurve99",
          absolute: "Absolute-B",
          relative: "Relative-B",
        }),
      },
    ],
    { includeNameSupport: false }
  );

  assert.equal(result.resolved, true);
  assert.deepEqual(result.mapNumbers, [3]);
  assert.ok(result.topScore > 0.99);
  assert.equal(result.secondScore, 0);
  assert.equal(result.primaryReferenceMapUid, "exact-map");
  assert.equal(result.details.matchClassification, "unique-strong");
  assert.equal(result.candidateMatches[0].isPrimaryReference, true);
  assert.equal(result.candidateMatches[0].isAssignedBySystem, true);
});

test("auto-approval preserves confidence, ambiguity, fallback, and multi-match policy", () => {
  const evaluate = (overrides = {}) =>
    mapContentSimilarity.evaluateSimilarityAutoApproval({
      signatureStatus: "ready",
      assignedMapNumbers: [3],
      similarity: { topScore: 0.96, secondScore: 0.75, candidateMatches: [] },
      ...overrides,
    });

  assert.deepEqual(evaluate(), {
    eligible: true,
    reason: "single-high-confidence",
  });
  assert.deepEqual(
    evaluate({
      similarity: {
        topScore: 0.96,
        secondScore: 0.75,
        details: { hasAmbiguousCloseSlots: true },
      },
    }),
    { eligible: false, reason: "ambiguous-close-slots" }
  );
  assert.deepEqual(
    evaluate({
      similarity: {
        topScore: 1,
        secondScore: 0,
        details: { targetSignatureFallback: true },
      },
    }),
    { eligible: false, reason: "manual-review-required" }
  );
  assert.deepEqual(
    evaluate({
      assignedMapNumbers: [3, 4],
      similarity: {
        topScore: 0.98,
        secondScore: 0.96,
        candidateMatches: [{ score: 0.98 }, { score: 0.96 }],
      },
    }),
    { eligible: true, reason: "multi-high-confidence-tie" }
  );
});
