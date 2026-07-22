import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { extractVerdictItems, normalizeMapVerdictList, normalizeRecordBundle } from "../src/verificationModel.js";

function readFixture(name) {
  return JSON.parse(fs.readFileSync(new URL(`./fixtures/verification-model/${name}.json`, import.meta.url), "utf8"));
}

test("untracked and unsupported verdicts cannot populate a public track", () => {
  const payload = readFixture("untracked-verdict");

  assert.deepEqual(extractVerdictItems(payload), []);
  assert.deepEqual(
    normalizeRecordBundle(payload, "untracked-record").verifications.map(({ track, status }) => ({ track, status })),
    [
      { track: "replay", status: "not_run" },
      { track: "deep", status: "not_run" },
    ]
  );
  assert.deepEqual(normalizeMapVerdictList(payload, "untracked-map", "replay").items, []);
  assert.deepEqual(normalizeMapVerdictList(payload, "untracked-map", "deep").items, []);
});

test("missing, blank, and null ranks remain null at the private DTO boundary", () => {
  for (const { label, payload } of readFixture("absent-ranks")) {
    const record = normalizeRecordBundle(payload, `requested-${label}`);
    const map = normalizeMapVerdictList(payload, "rank-map", "replay");

    assert.equal(record.rank, null, `${label} record rank`);
    assert.equal(map.items.length, 1, `${label} map item count`);
    assert.equal(map.items[0].rank, null, `${label} map rank`);
  }
});

test("snake-case replay verdicts retain their supported public contract", () => {
  const payload = readFixture("valid-replay");
  const record = normalizeRecordBundle(payload, "valid-replay-record");

  assert.equal(record.record_id, "valid-replay-record");
  assert.equal(record.map_uid, "valid-replay-map");
  assert.equal(record.rank, 7);
  assert.deepEqual(record.verifications, [
    {
      track: "replay",
      status: "pass",
      checked_at: "2026-07-20T14:00:00.000Z",
      confidence: "high",
      reason_code: "verified",
      policy_version: "replay-v3",
      updated_at: "2026-07-20T14:00:00.000Z",
    },
    {
      track: "deep",
      status: "not_run",
      checked_at: null,
      confidence: null,
      reason_code: "not_run",
      policy_version: null,
      updated_at: null,
    },
  ]);

  assert.equal(normalizeMapVerdictList(payload, "valid-replay-map", "replay").items.length, 1);
  assert.equal(normalizeMapVerdictList(payload, "valid-replay-map", "deep").items.length, 0);
});

test("camel-case runtime verdicts normalize to the public deep track", () => {
  const payload = readFixture("valid-deep");
  const record = normalizeRecordBundle(payload, "valid-deep-record");

  assert.equal(record.record_id, "valid-deep-record");
  assert.equal(record.map_uid, "valid-deep-map");
  assert.equal(record.rank, 12);
  assert.equal(record.verifications[0].status, "not_run");
  assert.deepEqual(record.verifications[1], {
    track: "deep",
    status: "fail",
    checked_at: "2026-07-20T15:00:00.000Z",
    confidence: "low",
    reason_code: "failed_verification",
    policy_version: "deep-v2",
    updated_at: "2026-07-20T15:00:00.000Z",
  });

  assert.equal(normalizeMapVerdictList(payload, "valid-deep-map", "replay").items.length, 0);
  assert.equal(normalizeMapVerdictList(payload, "valid-deep-map", "deep").items.length, 1);
});
