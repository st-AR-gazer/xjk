function createConnectionLifecycle({
  clearTimer = clearTimeout,
  clubRoomLifecycle,
  persistence,
  publication,
  reconnect,
} = {}) {
  const { ensureClubRoomReady } = clubRoomLifecycle;

  function leaveCurrentRoom(connection) {
    if (connection.reconnectTimer) {
      clearTimer(connection.reconnectTimer);
      connection.reconnectTimer = null;
    }
    connection.client?.close();
    connection.client = null;
    connection.connecting = null;
    connection.resetRoomState();
  }

  async function joinLiveRoom(connection, joinCode) {
    connection.joinCode = joinCode;
    await reconnect.ensureConnected(connection);
    const response = await connection.client.request("JoinRoom", { join_code: joinCode });
    persistence.consumeJoinRoom(connection, response, { persist: true });
    await persistence.refreshResolvedDisplayNames(connection, "bingo-bridge-room-join");
    return response;
  }

  async function joinMatch(connection, matchUid, teamId = null) {
    await reconnect.ensureConnected(connection);
    const response = await connection.client.request("JoinMatch", {
      uid: matchUid,
      ...(teamId !== null && teamId !== undefined ? { team_id: teamId } : {}),
    });
    connection.teamId = teamId;
    persistence.consumeJoinMatch(connection, response, { persist: true });
    await persistence.refreshResolvedDisplayNames(connection, "bingo-bridge-match-join");
    await ensureClubRoomReady({
      accountId: connection.accountId,
      displayName: connection.displayName,
      joinCode: connection.joinCode,
      matchUid: connection.matchUid,
      roomSummary: connection.roomSummary,
      matchState: connection.matchState,
    });
    publication.publishPlayerSnapshot(connection.accountId, connection.matchUid);
    return response;
  }

  return {
    leaveCurrentRoom,
    joinLiveRoom,
    joinMatch,
  };
}

export { createConnectionLifecycle };
