import assert from "node:assert/strict";
import test from "node:test";

import { createMembershipRoutes } from "../src/routes/membership-routes.js";
import { createRoomSummaryService } from "../src/room-summary.js";

const sessionRow = {
  session_token: "session-token",
  account_id: "account-id",
  display_name: "Driver",
};

function createConnection({ joinResponse = {}, teamChoiceAllowed = false, requiresTeamChoice = false } = {}) {
  return {
    accountId: sessionRow.account_id,
    joinCode: "",
    matchUid: "",
    teamId: null,
    roomSummary: null,
    matchState: null,
    teamChoiceAllowed,
    requiresTeamChoice,
    joinMatchCalls: [],
    leaveCalls: 0,
    async joinLiveRoom(joinCode) {
      this.joinCode = joinCode;
      this.matchUid = String(joinResponse.match_uid || "");
      this.roomSummary = {
        joinCode,
        matchUid: this.matchUid,
        lateJoin: true,
        teams: [],
      };
      return joinResponse;
    },
    async joinMatch(matchUid, teamId) {
      this.joinMatchCalls.push({ matchUid, teamId });
      this.matchUid = matchUid;
      this.requiresTeamChoice = false;
      this.matchState = { uid: matchUid, cells: [{ cell_id: 0 }] };
    },
    leaveCurrentRoom() {
      this.leaveCalls += 1;
      this.matchUid = "";
      this.joinCode = "";
    },
    snapshot() {
      return {
        ok: true,
        matchUid: this.matchUid,
        roomSummary: this.roomSummary,
        matchState: this.matchState,
        teamChoiceAllowed: this.teamChoiceAllowed,
        requiresTeamChoice: this.requiresTeamChoice,
      };
    },
  };
}

function createMembershipHarness({
  connection = createConnection(),
  cachedRoom = null,
  probeRoom = null,
  existingPlayerBinding = null,
} = {}) {
  const result = { status: null, payload: null, headers: null };
  const calls = {
    cleanup: [],
    deletedBindings: [],
    probes: 0,
    published: [],
    upsertMatches: [],
    upsertPlayers: [],
  };
  const playerConnections = new Map();
  const directoryState = { rooms: new Map() };
  if (cachedRoom) directoryState.rooms.set(cachedRoom.joinCode, cachedRoom);
  if (existingPlayerBinding) playerConnections.set(sessionRow.session_token, connection);
  const roomSummary = createRoomSummaryService();
  const repository = {
    buildJoinedMatchPayload: (value) => ({ ok: true, ...value }),
    deletePlayerBinding(accountId, matchUid) {
      calls.deletedBindings.push({ accountId, matchUid });
    },
    deletePlayerBindingByJoinCode() {},
    getLatestMatchBindingByJoinCode: () => null,
    getMatchBinding: () => null,
    getMatchStateMirror: () => null,
    getPlayerBinding: () => null,
    getPlayerBindingByJoinCode: () => existingPlayerBinding,
    getRoomBinding: () => null,
    matchStateHasBoard: (state) => Array.isArray(state?.cells) && state.cells.length > 0,
    playerBindingRequiresTeamChoice: (binding) => Boolean(binding?.requires_team_choice),
    serializeRoomBindingForClient: (binding) => binding,
    upsertMatchBinding(value) {
      calls.upsertMatches.push(value);
    },
    upsertPlayerBinding(value) {
      calls.upsertPlayers.push(value);
    },
  };
  const routes = createMembershipRoutes({
    auth: { ensureFreshOauthSession: async (row) => row },
    directory: { directoryState },
    displayNames: {
      authoritativeSessionIdentity: () => ({ accountId: sessionRow.account_id, displayName: "Driver" }),
    },
    gameState: { hydrateBingoStateDisplayNames: async () => {} },
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
      readJsonBody: async (req) => req.body || {},
      sendJson(_res, status, payload, headers = {}) {
        Object.assign(result, { status, payload, headers });
        return payload;
      },
    },
    lifecycle: {
      async cleanupConsoleResourcesForPlayer(value) {
        calls.cleanup.push(value);
      },
      async privateLookupViaProbe() {
        calls.probes += 1;
        return probeRoom;
      },
    },
    matchEvents: {
      buildClaimStatus: () => null,
      publishMatchUpdate(...args) {
        calls.published.push(args);
      },
    },
    repository,
    roomRuntime: {
      ensurePlayerConnectionForMatch: async () => connection,
      getOrCreatePlayerConnection: () => connection,
      playerConnections,
    },
    roomSummary,
    requireSession: () => ({ token: sessionRow.session_token, row: sessionRow }),
  });
  return { calls, connection, playerConnections, result, routes };
}

test("unknown rooms can resolve to lobby-only joins without a match_uid", async () => {
  const harness = createMembershipHarness({ connection: createConnection({ joinResponse: { config: {} } }) });

  await harness.routes.handleJoinMatch({ body: { joinCode: "UNKNOWN" } }, {});

  assert.equal(harness.result.status, 200);
  assert.equal(harness.result.payload.matchUid, "");
  assert.equal(harness.result.payload.roomSummary.joinCode, "UNKNOWN");
  assert.match(harness.result.payload.detailMessage, /joined the Bingo lobby/i);
  assert.equal(harness.connection.joinMatchCalls.length, 0);
  assert.equal(harness.calls.probes, 1);
});

test("cached lobby summaries avoid probes and remain lobby-only", async () => {
  const cachedRoom = { joinCode: "LOBBY", matchUid: "", lateJoin: true, teams: [] };
  const harness = createMembershipHarness({
    cachedRoom,
    connection: createConnection({ joinResponse: {} }),
  });

  await harness.routes.handleJoinMatch({ body: { joinCode: "LOBBY" } }, {});

  assert.equal(harness.result.status, 200);
  assert.equal(harness.result.payload.matchUid, "");
  assert.equal(harness.calls.probes, 0);
});

test("already joined bindings reuse the existing player connection", async () => {
  const connection = createConnection();
  connection.joinCode = "JOINED";
  connection.snapshot = () => ({ ok: true, matchUid: "", reused: true });
  const harness = createMembershipHarness({
    connection,
    cachedRoom: { joinCode: "JOINED", matchUid: "", lateJoin: true, teams: [] },
    existingPlayerBinding: { match_uid: "", join_code: "JOINED" },
  });

  await harness.routes.handleJoinMatch({ body: { joinCode: "JOINED" } }, {});

  assert.equal(harness.result.status, 200);
  assert.equal(harness.result.payload.reused, true);
  assert.equal(connection.joinMatchCalls.length, 0);
});

test("live joins branch between team selection and immediate match join", async () => {
  const liveRoom = { joinCode: "LIVE", matchUid: "match-live", lateJoin: true, teams: [{}] };
  const teamConnection = createConnection({
    joinResponse: { match_uid: "match-live" },
    teamChoiceAllowed: true,
    requiresTeamChoice: true,
  });
  const teamHarness = createMembershipHarness({ connection: teamConnection, cachedRoom: liveRoom });

  await teamHarness.routes.handleJoinMatch({ body: { joinCode: "LIVE" } }, {});

  assert.equal(teamHarness.result.payload.requiresTeamChoice, true);
  assert.equal(teamConnection.joinMatchCalls.length, 0);
  assert.equal(teamHarness.calls.upsertPlayers[0].requiresTeamChoice, true);

  const liveConnection = createConnection({ joinResponse: { match_uid: "match-live" } });
  const liveHarness = createMembershipHarness({ connection: liveConnection, cachedRoom: liveRoom });
  await liveHarness.routes.handleJoinMatch({ body: { joinCode: "LIVE" } }, {});

  assert.deepEqual(liveConnection.joinMatchCalls, [{ matchUid: "match-live", teamId: null }]);
  assert.equal(liveHarness.result.payload.matchUid, "match-live");
});

test("leaving the current match cleans persistence, resources, and connection state", async () => {
  const connection = createConnection();
  connection.joinCode = "LEAVE";
  connection.matchUid = "match-leave";
  const harness = createMembershipHarness({ connection });
  harness.playerConnections.set(sessionRow.session_token, connection);

  await harness.routes.handleLeaveMatch({}, {}, "current");

  assert.equal(harness.result.status, 200);
  assert.equal(harness.result.payload.matchUid, "match-leave");
  assert.deepEqual(harness.calls.cleanup, [
    { accountId: sessionRow.account_id, matchUid: "match-leave", reason: "player leave" },
  ]);
  assert.deepEqual(harness.calls.deletedBindings, [{ accountId: sessionRow.account_id, matchUid: "match-leave" }]);
  assert.equal(connection.leaveCalls, 1);
  assert.equal(harness.playerConnections.has(sessionRow.session_token), false);
});
