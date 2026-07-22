import assert from "node:assert/strict";
import test from "node:test";

import { createRoomBindingState } from "../src/room-runtime/room-binding-state.js";
import { createRoomVerificationService } from "../src/room-runtime/room-verification-service.js";

test("room binding transitions rebuild persistence input through one contract", () => {
  const writes = [];
  const state = createRoomBindingState({
    helpers: {
      jsonTryParse(value, fallback) {
        try {
          return JSON.parse(value);
        } catch {
          return fallback;
        }
      },
    },
    matchEvents: { roomBindingPath: () => ["Console", "Match", "Player"] },
    repository: {
      upsertRoomBinding(value) {
        writes.push(value);
        return { persisted: true, ...value };
      },
    },
  });
  const binding = {
    account_id: "account",
    match_uid: "match",
    join_code: "JOIN",
    match_slug: "match-folder",
    player_slug: "player-folder",
    room_activity_id: 12,
    selected_map_json: '{"uid":"map"}',
    last_verified_time: 123,
    status: "idle",
  };

  const transitioned = state.transitionRoomBinding(binding, {
    status: "failed",
    lastCheckedAt: 456,
  });

  assert.equal(transitioned.persisted, true);
  assert.equal(writes[0].accountId, "account");
  assert.equal(writes[0].roomActivityId, 12);
  assert.deepEqual(writes[0].selectedMapJson, { uid: "map" });
  assert.deepEqual(writes[0].clubPath, ["Console", "Match", "Player"]);
  assert.equal(writes[0].lastVerifiedTime, 123);
  assert.equal(writes[0].status, "failed");
  assert.equal(writes[0].lastCheckedAt, 456);
});

test("verification medal thresholds remain isolated from transport and persistence", () => {
  const service = createRoomVerificationService({
    config: {},
    db: {},
    helpers: {},
    nadeo: {},
    playerConnectionState: { playerConnections: new Map() },
    repository: {},
    roomBindingState: {},
  });
  const map = { author_time: 10_000, gold_time: 12_000, silver_time: 14_000, bronze_time: 16_000 };

  assert.equal(service.deriveMedalFromTime(map, 9_999), 1);
  assert.equal(service.deriveMedalFromTime(map, 11_000), 2);
  assert.equal(service.deriveMedalFromTime(map, 13_000), 3);
  assert.equal(service.deriveMedalFromTime(map, 15_000), 4);
  assert.equal(service.deriveMedalFromTime(map, 20_000), 5);
});
