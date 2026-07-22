function createConnectionEventReducer({
  clubRoomLifecycle,
  gameEvents,
  gameState,
  helpers,
  lifecycle,
  persistence,
  playerConnections,
  publication,
  repository,
} = {}) {
  const { cleanupConsoleResourcesForMatch, ensureClubRoomReady } = clubRoomLifecycle;
  const {
    applyMapRerolled,
    applyMatchPlayerJoin,
    applyPlayerDisconnect,
    applyRunSubmitted,
    buildRunSubmittedNotification,
  } = gameEvents;
  const { normalizeMatchState } = gameState;
  const { nowMs } = helpers;
  const { deletePlayerBinding, deletePlayerBindingByJoinCode } = repository;

  async function handleMatchStartEvent(connection, event) {
    connection.matchUid = String(event?.uid || connection.matchUid || "").trim();
    if (!connection.matchUid) return;
    connection.roomSummary = {
      ...(connection.roomSummary || {}),
      matchUid: connection.matchUid,
      started: nowMs(),
      isLive: true,
    };
    connection.matchState = connection.buildMatchStateFromStartEvent(event);
    connection.requiresTeamChoice = false;
    connection.teamChoiceAllowed = false;
    persistence.persistPlayer(connection, { requiresTeamChoice: false });
    deletePlayerBinding(connection.accountId, "");
    persistence.persistMatch(connection);
    await connection.refreshResolvedDisplayNames("bingo-bridge-match-start");
    try {
      await ensureClubRoomReady({
        accountId: connection.accountId,
        displayName: connection.displayName,
        joinCode: connection.joinCode,
        matchUid: connection.matchUid,
        roomSummary: connection.roomSummary,
        matchState: connection.matchState,
      });
    } catch (error) {
      persistence.recordError(connection, error, { requiresTeamChoice: false });
    }
    publication.publishMatchStarted(connection);
  }

  function persistPublishAndHydrate(connection, reason) {
    persistence.persistMatch(connection);
    publication.publishPlayerSnapshot(connection.accountId, connection.matchUid);
    connection.queueResolvedDisplayNameRefresh(reason);
  }

  function closeRoom(connection, event) {
    const closedMatchUid = String(connection.matchUid || "").trim();
    const closedJoinCode = String(connection.joinCode || "").trim();
    publication.publishRoomClosed(connection, event);
    const cleanupPromise = closedMatchUid
      ? cleanupConsoleResourcesForMatch(closedMatchUid, { reason: "host closed Bingo room" })
      : Promise.resolve();
    if (closedMatchUid) {
      deletePlayerBinding(connection.accountId, closedMatchUid);
    } else if (closedJoinCode) {
      deletePlayerBindingByJoinCode(connection.accountId, closedJoinCode);
    }
    lifecycle.leaveCurrentRoom(connection);
    playerConnections.delete(connection.sessionToken);
    cleanupPromise.catch((error) => {
      console.warn(`[console-hub] close-room cleanup failed: ${error?.message || error}`);
    });
  }

  function handleEvent(connection, event) {
    const type = String(event?.event || "");
    switch (type) {
      case "CloseRoom":
        closeRoom(connection, event);
        break;
      case "MatchStart":
        connection.handleMatchStartEvent(event).catch((error) => {
          persistence.recordError(connection, error);
          if (connection.matchUid) publication.publishPlayerSnapshot(connection.accountId, connection.matchUid);
        });
        break;
      case "MatchSync":
        connection.matchState = normalizeMatchState(event);
        connection.matchUid = String(event.uid || connection.matchUid || "").trim();
        persistPublishAndHydrate(connection, "bingo-bridge-match-sync");
        break;
      case "RunSubmitted": {
        const notification = buildRunSubmittedNotification(connection.matchState, event);
        applyRunSubmitted(connection.matchState, event);
        persistence.persistMatch(connection);
        publication.publishConnectionSnapshot(connection, { notification });
        connection.queueResolvedDisplayNameRefresh("bingo-bridge-run-submitted");
        break;
      }
      case "MatchPlayerJoin":
        applyMatchPlayerJoin(connection.matchState, event);
        persistPublishAndHydrate(connection, "bingo-bridge-player-join");
        break;
      case "PlayerDisconnect":
        applyPlayerDisconnect(connection.matchState, event);
        persistPublishAndHydrate(connection, "bingo-bridge-player-disconnect");
        break;
      case "MapRerolled":
        applyMapRerolled(connection.matchState, event);
        persistPublishAndHydrate(connection, "bingo-bridge-map-rerolled");
        break;
      case "PhaseChange":
        if (connection.matchState) connection.matchState.phase = event.phase;
        persistPublishAndHydrate(connection, "bingo-bridge-phase-change");
        break;
      default:
        break;
    }
  }

  return {
    handleEvent,
    handleMatchStartEvent,
  };
}

export { createConnectionEventReducer };
