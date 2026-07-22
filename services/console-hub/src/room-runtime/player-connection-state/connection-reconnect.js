function createConnectionReconnect({ bingo, persistence, reconnectDelayMs = 4000, setTimer = setTimeout } = {}) {
  const { BINGO_CLIENT_KIND_WEB_PLAYER, BINGO_PURPOSE_PLAYER, BingoClient } = bingo;

  async function ensureConnected(connection) {
    if (connection.client && connection.client.connected) return connection.client;
    if (connection.connecting) return connection.connecting;
    connection.connecting = (async () => {
      const client = new BingoClient({ label: `web-player:${connection.accountId}` });
      client.onEvent((event) => connection.handleEvent(event));
      client.onClose(() => connection.scheduleReconnect());
      await client.connect({
        accountId: connection.accountId,
        displayName: connection.displayName,
        purpose: BINGO_PURPOSE_PLAYER,
        clientKind: BINGO_CLIENT_KIND_WEB_PLAYER,
      });
      connection.client = client;
      return client;
    })();
    try {
      return await connection.connecting;
    } finally {
      connection.connecting = null;
    }
  }

  function scheduleReconnect(connection) {
    if (connection.reconnectTimer) return;
    connection.reconnectTimer = setTimer(() => {
      connection.reconnectTimer = null;
      return restore(connection).catch((error) => {
        persistence.recordError(connection, error);
        scheduleReconnect(connection);
      });
    }, reconnectDelayMs);
    connection.reconnectTimer.unref?.();
  }

  async function restore(connection) {
    if (!connection.joinCode) return;
    await ensureConnected(connection);
    const joinResponse = await connection.client.request("JoinRoom", { join_code: connection.joinCode });
    persistence.consumeJoinRoom(connection, joinResponse, { persist: false });
    await persistence.refreshResolvedDisplayNames(connection, "bingo-bridge-room-restore");
    if (connection.matchUid && !connection.requiresTeamChoice) {
      const response = await connection.client.request("JoinMatch", {
        uid: connection.matchUid,
        ...(connection.teamId !== null && connection.teamId !== undefined ? { team_id: connection.teamId } : {}),
      });
      persistence.consumeJoinMatch(connection, response, { persist: false });
      await persistence.refreshResolvedDisplayNames(connection, "bingo-bridge-match-restore");
    }
  }

  return {
    ensureConnected,
    scheduleReconnect,
    restore,
  };
}

export { createConnectionReconnect };
