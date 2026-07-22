import assert from "node:assert/strict";
import test from "node:test";

import {
  clampScore,
  confidenceLabel,
  normalizeConfidence,
  normalizeRankedStyles,
} from "../src/classificationNormalization.js";

test("classification scores accept ratios and percentages without escaping the public range", () => {
  assert.equal(clampScore(0.82), 0.82);
  assert.equal(clampScore(82), 0.82);
  assert.equal(clampScore(-1), 0);
  assert.equal(clampScore(101), 1);
  assert.equal(clampScore("not-a-score"), 0);
  assert.equal(confidenceLabel(0.75), "high");
  assert.equal(confidenceLabel(0.5), "medium");
  assert.equal(confidenceLabel(0.1), "low");
  assert.equal(confidenceLabel(0), "unknown");
});

test("classification rankings normalize aliases, evidence, order, and public ranks", () => {
  assert.deepEqual(
    normalizeRankedStyles([
      { label: "Tech", confidence: 35, rank: 4, evidence: ["turns", "", "brakes"] },
      { name: "Speed", score: 0.9, rank: 9 },
      "Mixed",
    ]),
    [
      { rank: 1, style: "Speed", score: 0.9, evidence: undefined },
      { rank: 2, style: "Tech", score: 0.35, evidence: ["turns", "brakes"] },
      { rank: 3, style: "Mixed", score: 0.2 },
    ]
  );
});

test("confidence normalization falls back to the top score and never returns a blank label", () => {
  const styles = [{ rank: 1, style: "Speed", score: 0.82 }];
  assert.deepEqual(normalizeConfidence(undefined, styles), { score: 0.82, label: "high" });
  assert.deepEqual(normalizeConfidence({ value: 60, label: "  " }, styles), {
    score: 0.6,
    label: "medium",
  });
  assert.deepEqual(normalizeConfidence({ score: 0.2, status: "manual" }, styles), {
    score: 0.2,
    label: "manual",
  });
});
