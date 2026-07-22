import assert from "node:assert/strict";
import test from "node:test";

import { BoundedTtlCache } from "../services/cotd-public/src/publicCache.js";
import {
  parseLimit,
  parseOffset,
  setPrivateNoStore,
  shouldUsePrivateNoStore,
} from "../services/cotd-public/src/publicHttpPolicy.js";

test("COTD public cache expires entries and evicts the least recently used key", () => {
  let now = 1_000;
  const cache = new BoundedTtlCache({ ttlMs: 100, maxEntries: 2, now: () => now });
  cache.set("first", { id: 1 });
  cache.set("second", { id: 2 });

  assert.deepEqual(cache.get("first"), { id: 1 });
  cache.set("third", { id: 3 });
  assert.equal(cache.get("second"), undefined);
  assert.equal(cache.size, 2);

  now = 1_100;
  assert.equal(cache.get("first"), undefined);
  assert.equal(cache.get("third"), undefined);
});

test("COTD pagination rejects malformed values and clamps cache-key cardinality", () => {
  assert.equal(parseLimit("999", { fallback: 30, max: 100 }), 100);
  assert.equal(parseOffset("999999", { fallback: 0, max: 10_000 }), 10_000);
  assert.throws(() => parseLimit("0"), /positive integer/);
  assert.throws(() => parseOffset("-1"), /non-negative integer/);
});

test("COTD debug and admin response policy is private and non-cacheable", () => {
  assert.equal(shouldUsePrivateNoStore({ debugValue: "1" }), true);
  assert.equal(shouldUsePrivateNoStore({ authenticated: true }), true);
  assert.equal(shouldUsePrivateNoStore({ adminRoute: true }), true);
  assert.equal(shouldUsePrivateNoStore({}), false);

  const headers = new Map();
  const response = {
    append(name, value) {
      const key = name.toLowerCase();
      headers.set(key, [...(headers.get(key) || []), value]);
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
  };
  setPrivateNoStore(response);

  assert.equal(headers.get("cache-control"), "private, no-store");
  assert.equal(headers.get("pragma"), "no-cache");
  assert.deepEqual(headers.get("vary"), ["Authorization", "X-Cotd-Admin-Token"]);
});
