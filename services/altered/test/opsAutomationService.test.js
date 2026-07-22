import assert from "node:assert/strict";
import test from "node:test";
import { recordMapCheckFailure } from "../src/services/opsAutomationService.js";

test("recordMapCheckFailure applies the same state and event update for all tracker failures", () => {
  const calls = [];
  const repository = {
    updateMonitoredMapState: (payload) => calls.push(["state", payload]),
    recordMapPollEvent: (payload) => calls.push(["event", payload]),
  };
  const result = recordMapCheckFailure(repository, {
    schedule: { scheduleId: 3, userId: 7 },
    runId: 11,
    map: { mapUid: "uid", mapName: "Map", lastWrMs: 1234, lastWrHolder: "Player" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    error: "unavailable",
  });

  assert.deepEqual(result, { mapUid: "uid", changed: false, error: "unavailable" });
  assert.deepEqual(calls[0], [
    "state",
    {
      userId: 7,
      mapUid: "uid",
      lastCheckedAt: "2026-01-01T00:00:00.000Z",
      lastError: "unavailable",
    },
  ]);
  assert.equal(calls[1][1].changed, false);
  assert.equal(calls[1][1].oldWrMs, calls[1][1].newWrMs);
  assert.equal(calls[1][1].oldWrHolder, calls[1][1].newWrHolder);
});
