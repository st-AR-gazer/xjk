import { PlayerConnectionAggregate } from "./player-connection-state/connection-aggregate.js";
import { createConnectionEventReducer } from "./player-connection-state/connection-event-reducer.js";
import { createConnectionIdentity } from "./player-connection-state/connection-identity.js";
import { createConnectionLifecycle } from "./player-connection-state/connection-lifecycle.js";
import { createConnectionPersistence } from "./player-connection-state/connection-persistence.js";
import { createConnectionPublication } from "./player-connection-state/connection-publication.js";
import { createConnectionReconnect } from "./player-connection-state/connection-reconnect.js";

export function createPlayerConnectionState({
  bingo,
  clubRoomLifecycle,
  displayNames,
  gameEvents,
  gameState,
  helpers,
  matchEvents,
  repository,
  roomSummary,
} = {}) {
  const playerConnections = new Map();
  const identity = createConnectionIdentity({ displayNames, helpers });
  const persistence = createConnectionPersistence({
    gameState,
    helpers,
    identity,
    repository,
    roomSummary,
  });
  const publication = createConnectionPublication({
    bingo,
    matchEvents,
    playerConnections,
    repository,
  });
  const reconnect = createConnectionReconnect({ bingo, persistence });
  const lifecycle = createConnectionLifecycle({
    clubRoomLifecycle,
    persistence,
    publication,
    reconnect,
  });
  const eventReducer = createConnectionEventReducer({
    clubRoomLifecycle,
    gameEvents,
    gameState,
    helpers,
    lifecycle,
    persistence,
    playerConnections,
    publication,
    repository,
  });
  const { getPlayerBinding, getRoomBinding, matchStateHasBoard, playerBindingRequiresTeamChoice } = repository;

  class PlayerConnection extends PlayerConnectionAggregate {
    constructor({ sessionRow }) {
      super({ sessionToken: sessionRow.session_token });
      identity.applySession(this, sessionRow);
    }

    ensureConnected() {
      return reconnect.ensureConnected(this);
    }

    scheduleReconnect() {
      return reconnect.scheduleReconnect(this);
    }

    restore() {
      return reconnect.restore(this);
    }

    consumeJoinRoom(...args) {
      return persistence.consumeJoinRoom(this, ...args);
    }

    consumeJoinMatch(...args) {
      return persistence.consumeJoinMatch(this, ...args);
    }

    handleMatchStartEvent(event) {
      return eventReducer.handleMatchStartEvent(this, event);
    }

    refreshResolvedDisplayNames(reason) {
      return persistence.refreshResolvedDisplayNames(this, reason);
    }

    queueResolvedDisplayNameRefresh(reason = "bingo-bridge-bingo-state") {
      return persistence.queueResolvedDisplayNameRefresh(this, reason, () => {
        if (this.matchUid) publication.publishPlayerSnapshot(this.accountId, this.matchUid);
      });
    }

    leaveCurrentRoom() {
      return lifecycle.leaveCurrentRoom(this);
    }

    close() {
      return lifecycle.leaveCurrentRoom(this);
    }

    joinLiveRoom(joinCode) {
      return lifecycle.joinLiveRoom(this, joinCode);
    }

    joinMatch(matchUid, teamId = null) {
      return lifecycle.joinMatch(this, matchUid, teamId);
    }

    handleEvent(event) {
      return eventReducer.handleEvent(this, event);
    }

    snapshot() {
      return publication.snapshot(this);
    }
  }

  function getOrCreatePlayerConnection(sessionRow) {
    const key = sessionRow.session_token;
    let connection = playerConnections.get(key);
    if (!connection) {
      connection = new PlayerConnection({ sessionRow });
      playerConnections.set(key, connection);
    } else {
      identity.applySession(connection, sessionRow);
    }
    return connection;
  }

  async function ensurePlayerConnectionForMatch(sessionRow, matchUid) {
    const connection = getOrCreatePlayerConnection(sessionRow);
    if (connection.matchUid === matchUid && connection.matchState) {
      const hasSavedTeamChoice = connection.teamId !== null && connection.teamId !== undefined;
      if (matchStateHasBoard(connection.matchState) || connection.requiresTeamChoice || !hasSavedTeamChoice) {
        return connection;
      }
    }
    const sessionIdentity = identity.fromSession(sessionRow);
    const playerBinding = getPlayerBinding(sessionIdentity.accountId, matchUid);
    const roomBinding = getRoomBinding(sessionIdentity.accountId, matchUid);
    const joinCode = String(playerBinding?.join_code || connection.joinCode || "").trim();
    if (!joinCode) return connection;
    connection.joinCode = joinCode;
    connection.matchUid = String(matchUid || playerBinding?.match_uid || roomBinding?.match_uid || "").trim();
    if (playerBinding && playerBinding.team_id !== null && playerBinding.team_id !== undefined) {
      connection.teamId = Number(playerBinding.team_id);
    }
    connection.requiresTeamChoice = playerBindingRequiresTeamChoice(playerBinding);
    await connection.restore();
    return connection;
  }

  return {
    playerConnections,
    PlayerConnection,
    getOrCreatePlayerConnection,
    ensurePlayerConnectionForMatch,
    publishPlayerSnapshot: publication.publishPlayerSnapshot,
    publishRoomClosed: publication.publishRoomClosed,
  };
}
