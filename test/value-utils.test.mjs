import assert from "node:assert/strict";
import test from "node:test";

import {
  chunkArray,
  clampInt,
  firstFiniteNumber,
  normalizeAccountId,
  normalizeBaseUrl,
  parseDelimitedTextValues,
  parseOptionalBoolean,
  parseJsonSafe,
  toEpochMs,
  toIso,
  toInteger,
  uniqueBy,
} from "../services/shared/valueUtils.js";

test("chunkArray creates bounded batches without mutating its input", () => {
  const values = [1, 2, 3, 4, 5];
  assert.deepEqual(chunkArray(values, 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunkArray(values, 0), [[1], [2], [3], [4], [5]]);
  assert.deepEqual(values, [1, 2, 3, 4, 5]);
});

test("clampInt applies explicit bounds and fallbacks", () => {
  assert.equal(clampInt("12.9", { min: 1, max: 10 }), 10);
  assert.equal(clampInt("", { min: 1, fallback: 7 }), 1);
  assert.equal(clampInt("invalid", { fallback: 4 }), 4);
});

test("numeric helpers preserve fallback order and integer conversion semantics", () => {
  assert.equal(firstFiniteNumber(undefined, "12.5", 20), 12.5);
  assert.equal(firstFiniteNumber("invalid", null), 0);
  assert.ok(Number.isNaN(firstFiniteNumber(undefined, "invalid")));
  assert.equal(toInteger("12.9"), 12);
  assert.equal(toInteger("invalid", 7), 7);
});

test("account ids and timestamps normalize into stable storage values", () => {
  const accountId = "A2C1A6A2-9A25-44B8-AC68-35B137CC7780";
  assert.equal(normalizeAccountId(accountId), accountId.toLowerCase());
  assert.equal(normalizeAccountId("not-an-account"), "");
  assert.equal(toEpochMs("1710000000"), 1_710_000_000_000);
  assert.equal(toIso("1710000000"), "2024-03-09T16:00:00.000Z");
});

test("base URLs normalize once for every service client", () => {
  assert.equal(normalizeBaseUrl(" https://example.test/api/// "), "https://example.test/api");
  assert.equal(normalizeBaseUrl("", "http://127.0.0.1:3000/"), "http://127.0.0.1:3000");
});

test("delimited text parsing is shared across service request boundaries", () => {
  assert.deepEqual(parseDelimitedTextValues(" one, two;three\nfour "), ["one", "two", "three", "four"]);
  assert.deepEqual(parseDelimitedTextValues([" one ", "", null, "two"]), ["one", "two"]);
  assert.deepEqual(parseDelimitedTextValues(42), []);
});

test("optional booleans use one explicit configuration and request contract", () => {
  for (const value of [true, 1, "1", "TRUE", " yes ", "on"]) {
    assert.equal(parseOptionalBoolean(value), true);
  }
  for (const value of [false, 0, "0", "FALSE", " no ", "off"]) {
    assert.equal(parseOptionalBoolean(value), false);
  }
  for (const value of [undefined, null, "", "  ", "enabled", {}, []]) {
    assert.equal(parseOptionalBoolean(value), undefined);
  }
});

test("JSON parsing and deduplication fail predictably", () => {
  assert.deepEqual(parseJsonSafe('{"ready":true}'), { ready: true });
  assert.equal(parseJsonSafe("broken", null), null);
  assert.deepEqual(
    uniqueBy(
      [
        { id: 1, name: "first" },
        { id: 1, name: "duplicate" },
        { id: 2, name: "second" },
      ],
      (item) => item.id
    ),
    [
      { id: 1, name: "first" },
      { id: 2, name: "second" },
    ]
  );
});
