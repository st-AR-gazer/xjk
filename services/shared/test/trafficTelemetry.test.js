import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTrafficBytes,
  normalizeTrafficDirection,
  normalizeTrafficDurationMs,
  normalizeTrafficHost,
  normalizeTrafficMethod,
  normalizeTrafficPath,
  normalizeTrafficStatusCode,
} from "../trafficTelemetry.js";

test("traffic wire values use one bounded normalization policy", () => {
  assert.equal(normalizeTrafficDirection(" Incoming "), "incoming");
  assert.equal(normalizeTrafficDirection("sideways"), "outgoing");
  assert.equal(normalizeTrafficMethod(" post "), "POST");
  assert.equal(normalizeTrafficMethod(""), "GET");
  assert.equal(normalizeTrafficMethod("VERYLONGMETHODNAME"), "VERYLONGMETH");
  assert.equal(normalizeTrafficPath("api/v1/maps"), "/api/v1/maps");
  assert.equal(normalizeTrafficPath("", "/fallback"), "/fallback");
  assert.equal(normalizeTrafficHost(" Nadeo.Live "), "nadeo.live");
  assert.equal(normalizeTrafficStatusCode(200.9), 200);
  assert.equal(normalizeTrafficStatusCode(1200), 999);
  assert.equal(normalizeTrafficStatusCode("invalid"), 0);
  assert.equal(normalizeTrafficBytes(10.9), 10);
  assert.equal(normalizeTrafficBytes(-1), 0);
  assert.equal(normalizeTrafficDurationMs(10.9), 11);
  assert.equal(normalizeTrafficDurationMs(4_000_000), 3_600_000);
});
