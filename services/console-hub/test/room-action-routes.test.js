import assert from "node:assert/strict";
import test from "node:test";

import { createRoomActionRoutes } from "../src/routes/room-action-routes.js";

const sessionRow = { session_token: "session", account_id: "account" };

function createActionHarness() {
  const result = { status: null, payload: null, headers: null };
  const calls = { club: [], joinedTeams: [], maps: [], published: [] };
  const connection = {
    displayName: "Driver",
    joinCode: "ROOM",
    matchUid: "match",
    roomSummary: { joinCode: "ROOM" },
    matchState: { cells: [{ cell_id: 4 }] },
    teamChoiceAllowed: true,
    requiresTeamChoice: true,
    async joinMatch(matchUid, teamId) {
      calls.joinedTeams.push({ matchUid, teamId });
      this.requiresTeamChoice = false;
    },
    snapshot() {
      return { ok: true, matchUid: this.matchUid, requiresTeamChoice: this.requiresTeamChoice };
    },
  };
  const routes = createRoomActionRoutes({
    config: { manualCheckLimit: 10, manualCheckWindowMs: 60_000 },
    displayNames: {
      authoritativeSessionIdentity: () => ({ accountId: "account", displayName: "Driver", username: "driver" }),
    },
    helpers: {
      jsonTryParse(value, fallback) {
        try {
          return JSON.parse(value);
        } catch {
          return fallback;
        }
      },
    },
    httpSupport: {
      consumeManualCheckSlot: () => ({ allowed: true, remaining: 9 }),
      readJsonBody: async (req) => req.body || {},
      sendJson(_res, status, payload, headers = {}) {
        Object.assign(result, { status, payload, headers });
        return payload;
      },
    },
    matchEvents: {
      buildClaimStatus: (binding) => ({ status: binding?.status || "idle" }),
      publishMatchUpdate(...args) {
        calls.published.push(args);
      },
    },
    repository: {
      getMatchBinding: () => ({ join_code: "ROOM" }),
      getMatchStateMirror: () => connection.matchState,
      getPlayerBinding: () => ({ join_code: "ROOM" }),
      matchStateHasBoard: (state) => Array.isArray(state?.cells) && state.cells.length > 0,
      serializeRoomBindingForClient: (binding) => binding,
    },
    roomRuntime: {
      async ensureClubRoomReady(value) {
        calls.club.push(value);
        return { status: "ready", room_activity_id: 42 };
      },
      ensurePlayerConnectionForMatch: async () => connection,
      async selectMapForRoom(value) {
        calls.maps.push(value);
        return { status: "selected", selected: value.cellId };
      },
      async verifySelectedMap() {
        return { status: "verified" };
      },
    },
    requireSession: () => ({ row: sessionRow }),
  });
  return { calls, connection, result, routes };
}

test("team choice, map selection, and room regeneration retain their action contracts", async () => {
  const harness = createActionHarness();

  await harness.routes.handleMatchTeam({ body: { teamId: 7 } }, {}, "match");
  assert.equal(harness.result.status, 200);
  assert.deepEqual(harness.calls.joinedTeams, [{ matchUid: "match", teamId: 7 }]);

  await harness.routes.handleSelectMap({}, {}, "match", 4);
  assert.equal(harness.result.status, 200);
  assert.deepEqual(harness.calls.maps, [{ accountId: "account", matchUid: "match", cellId: 4 }]);
  assert.equal(harness.result.payload.roomBinding.selected, 4);

  await harness.routes.handleRegenerateRoom({}, {}, "match");
  assert.equal(harness.result.status, 200);
  assert.equal(harness.result.payload.roomRegenerated, true);
  assert.equal(harness.calls.club[0].forceNewRoom, true);
  assert.equal(harness.calls.club[0].joinCode, "ROOM");
  assert.equal(harness.calls.published.length, 1);
});
