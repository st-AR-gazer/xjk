import assert from "node:assert/strict";
import test from "node:test";

import { createPlayerConnectionState } from "../src/room-runtime/player-connection-state.js";
import { createConnectionReconnect } from "../src/room-runtime/player-connection-state/connection-reconnect.js";

test("reconnect scheduling deduplicates timers, records restore failures, and retries", async () => {
  const scheduled = [];
  const recordedErrors = [];
  class ReconnectClient {
    constructor() {
      this.connected = false;
    }

    onEvent(callback) {
      this.eventCallback = callback;
    }

    onClose(callback) {
      this.closeCallback = callback;
    }

    async connect() {
      this.connected = true;
    }

    async request(type) {
      if (type === "JoinRoom") return { match_uid: "match-one" };
      throw new Error("match restore rejected");
    }
  }
  const persistence = {
    consumeJoinRoom() {},
    consumeJoinMatch() {},
    async refreshResolvedDisplayNames() {},
    recordError(_connection, error) {
      recordedErrors.push(error.message);
    },
  };
  const reconnect = createConnectionReconnect({
    bingo: {
      BINGO_CLIENT_KIND_WEB_PLAYER: "web-player",
      BINGO_PURPOSE_PLAYER: "player",
      BingoClient: ReconnectClient,
    },
    persistence,
    reconnectDelayMs: 25,
    setTimer(callback, delay) {
      const handle = {
        callback,
        delay,
        unrefCalled: false,
        unref() {
          this.unrefCalled = true;
        },
      };
      scheduled.push(handle);
      return handle;
    },
  });
  const connection = {
    accountId: "account-one",
    displayName: "Player",
    joinCode: "JOIN",
    matchUid: "match-one",
    teamId: 3,
    client: null,
    connecting: null,
    reconnectTimer: null,
    handleEvent() {},
    scheduleReconnect() {
      reconnect.scheduleReconnect(connection);
    },
  };

  reconnect.scheduleReconnect(connection);
  reconnect.scheduleReconnect(connection);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 25);
  assert.equal(scheduled[0].unrefCalled, true);

  await scheduled[0].callback();

  assert.deepEqual(recordedErrors, ["match restore rejected"]);
  assert.equal(scheduled.length, 2);
  assert.equal(connection.reconnectTimer, scheduled[1]);
});

function createConnectionHarness() {
  const publications = [];
  const playerWrites = [];
  const matchWrites = [];
  const deletions = [];
  const hydrationReasons = [];
  const cleanupCalls = [];
  const roomReadyCalls = [];
  let rejectRoomReady = false;

  class BingoClient {
    constructor({ label }) {
      this.label = label;
      this.connected = false;
    }

    onEvent(callback) {
      this.eventCallback = callback;
    }

    onClose(callback) {
      this.closeCallback = callback;
    }

    async connect(payload) {
      this.connected = true;
      this.connectPayload = payload;
    }

    async request(type) {
      if (type === "JoinRoom") {
        return {
          config: { name: "Room" },
          match_config: { mode: "bingo" },
          teams: [],
          match_uid: "match-one",
        };
      }
      if (type === "JoinMatch") {
        return {
          state: {
            uid: "match-one",
            phase: 1,
            teams: [
              {
                base: { id: 3 },
                members: [{ profile: { uid: 1, account_id: "account-one" } }],
              },
            ],
            cells: [{ cell_id: 0, claims: [] }],
          },
        };
      }
      throw new Error(`Unexpected request ${type}`);
    }

    close() {
      this.connected = false;
    }
  }

  const repository = {
    deletePlayerBinding(accountId, matchUid) {
      deletions.push({ type: "match", accountId, matchUid });
    },
    deletePlayerBindingByJoinCode(accountId, joinCode) {
      deletions.push({ type: "room", accountId, joinCode });
    },
    findAccountTeamIdInTeams() {
      return null;
    },
    getPlayerBinding() {
      return null;
    },
    getRoomBinding() {
      return null;
    },
    matchStateHasBoard(matchState) {
      return Array.isArray(matchState?.cells) && matchState.cells.length > 0;
    },
    playerBindingRequiresTeamChoice() {
      return false;
    },
    serializeRoomBindingForClient() {
      return null;
    },
    upsertMatchBinding(value) {
      matchWrites.push(value);
    },
    upsertPlayerBinding(value) {
      playerWrites.push(value);
      return value;
    },
  };
  const state = createPlayerConnectionState({
    bingo: {
      BINGO_CLIENT_KIND_WEB_PLAYER: "web-player",
      BINGO_PURPOSE_PLAYER: "player",
      BingoClient,
    },
    clubRoomLifecycle: {
      async cleanupConsoleResourcesForMatch(matchUid, options) {
        cleanupCalls.push({ matchUid, options });
      },
      async ensureClubRoomReady(value) {
        roomReadyCalls.push(value);
        if (rejectRoomReady) throw new Error("club room unavailable");
      },
    },
    displayNames: {
      authoritativeSessionIdentity(sessionRow) {
        return { accountId: sessionRow.account_id, displayName: sessionRow.display_name };
      },
    },
    gameEvents: {
      applyMapRerolled(matchState, event) {
        matchState.rerolled = event.map_uid;
      },
      applyMatchPlayerJoin(matchState) {
        matchState.playerJoined = true;
      },
      applyPlayerDisconnect(matchState) {
        matchState.playerDisconnected = true;
      },
      applyRunSubmitted(matchState, event) {
        matchState.lastRun = event.time;
      },
      buildRunSubmittedNotification(_matchState, event) {
        return { time: event.time };
      },
    },
    gameState: {
      async hydrateBingoStateDisplayNames({ reason }) {
        hydrationReasons.push(reason);
      },
      normalizeMatchState(value) {
        return value ? structuredClone(value) : null;
      },
    },
    helpers: {
      nowMs() {
        return 1234;
      },
      sanitizeBridgeDisplayName(value) {
        return String(value || "").trim();
      },
    },
    matchEvents: {
      buildClaimStatus() {
        return { status: "idle" };
      },
      publishMatchUpdate(accountId, scope, payload) {
        publications.push({ accountId, scope, payload });
      },
      roomEventScope(joinCode) {
        return joinCode ? `room:${joinCode}` : "";
      },
    },
    repository,
    roomSummary: {
      canPlayersChooseTheirOwnTeam() {
        return false;
      },
      normalizeRoomSummary(value) {
        return {
          name: value.name,
          config: value.config,
          matchConfig: value.match_config,
          teams: value.teams,
          matchUid: value.match_uid,
        };
      },
    },
  });

  return {
    state,
    publications,
    playerWrites,
    matchWrites,
    deletions,
    hydrationReasons,
    cleanupCalls,
    roomReadyCalls,
    rejectRoomReady() {
      rejectRoomReady = true;
    },
  };
}

test("player connection facade preserves lifecycle, reduction, hydration, and publication behavior", async () => {
  const harness = createConnectionHarness();
  assert.deepEqual(Object.keys(harness.state), [
    "playerConnections",
    "PlayerConnection",
    "getOrCreatePlayerConnection",
    "ensurePlayerConnectionForMatch",
    "publishPlayerSnapshot",
    "publishRoomClosed",
  ]);
  const connection = harness.state.getOrCreatePlayerConnection({
    session_token: "session-one",
    account_id: "account-one",
    display_name: "Player One",
  });
  for (const method of [
    "ensureConnected",
    "scheduleReconnect",
    "restore",
    "consumeJoinRoom",
    "consumeJoinMatch",
    "buildMatchStateFromStartEvent",
    "handleMatchStartEvent",
    "findSelfPlayer",
    "refreshResolvedDisplayNames",
    "queueResolvedDisplayNameRefresh",
    "leaveCurrentRoom",
    "close",
    "joinLiveRoom",
    "joinMatch",
    "handleEvent",
    "snapshot",
  ]) {
    assert.equal(typeof connection[method], "function", method);
  }

  await connection.joinLiveRoom("JOIN");
  await connection.joinMatch("match-one");
  assert.equal(connection.matchUid, "match-one");
  assert.equal(connection.teamId, 3);
  assert.equal(connection.snapshot().detailMessage, "Your console bridge is connected to the live Bingo match.");
  assert.equal(harness.roomReadyCalls.length, 1);
  assert.deepEqual(harness.hydrationReasons.slice(0, 2), ["bingo-bridge-room-join", "bingo-bridge-match-join"]);

  connection.handleEvent({ event: "RunSubmitted", time: 9876 });
  assert.equal(connection.matchState.lastRun, 9876);
  const runPublication = harness.publications.find((entry) => entry.payload.notification?.time === 9876);
  assert.equal(runPublication.scope, "match-one");

  harness.rejectRoomReady();
  await connection.handleMatchStartEvent({ uid: "match-two", maps: [{ uid: "map-one" }] });
  assert.equal(connection.matchState.cells[0].map.uid, "map-one");
  assert.equal(harness.playerWrites.at(-1).lastError, "club room unavailable");
  assert.deepEqual(
    harness.publications.slice(-2).map((entry) => entry.scope),
    ["match-two", "room:JOIN"]
  );

  connection.handleEvent({ event: "CloseRoom", message: "Closed by host" });
  assert.equal(harness.state.playerConnections.has("session-one"), false);
  assert.equal(connection.matchUid, "");
  assert.equal(harness.deletions.at(-1).matchUid, "match-two");
  assert.equal(harness.cleanupCalls.at(-1).matchUid, "match-two");
});
