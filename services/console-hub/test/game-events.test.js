import assert from "node:assert/strict";
import test from "node:test";

import { createGameEventTransforms } from "../src/game-events.js";

test("game events update the mirrored match without replacing unrelated state", () => {
  const transforms = createGameEventTransforms({ helpers: { nowMs: () => 1_234 } });
  const state = {
    config: { secret: false },
    cells: [
      {
        cell_id: 7,
        map: { uid: "map-1", track_name: "First map", type: "TMX" },
        claimant: 1,
        claims: [{ team_id: 1, time: 52_000, player: { uid: 10 } }],
      },
    ],
    teams: [
      { base: { id: 1, name: "Red", color: [255, 0, 0] }, members: [] },
      { base: { id: 2, name: "Blue", color: [0, 0, 255] }, members: [] },
    ],
  };
  const event = {
    cell_id: 7,
    position: 1,
    claim: { team_id: 2, time: 51_000, player: { uid: 20, display_name: "Driver" } },
  };

  const notification = transforms.buildRunSubmittedNotification(state, event);
  transforms.applyRunSubmitted(state, event);
  transforms.applyMatchPlayerJoin(state, { team: 2, profile: { uid: 20, display_name: "Driver" } });

  assert.equal(notification.variant, "reclaim");
  assert.equal(notification.deltaMs, 1_000);
  assert.equal(notification.createdAt, 1_234);
  assert.equal(state.cells[0].claimant, 2);
  assert.deepEqual(
    state.cells[0].claims.map((claim) => claim.time),
    [51_000, 52_000]
  );
  assert.equal(state.teams[1].members[0].profile.display_name, "Driver");

  transforms.applyPlayerDisconnect(state, { uid: 20 });
  assert.deepEqual(state.teams[1].members, []);

  transforms.applyMapRerolled(state, { cell_id: 7, map: { uid: "map-2" } });
  assert.equal(state.cells[0].map.uid, "map-2");
  assert.deepEqual(state.cells[0].claims, []);
  assert.equal(state.cells[0].claimant, null);
});
