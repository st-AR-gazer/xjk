function createConnectionPersistence({ gameState, helpers, identity, repository, roomSummary }) {
  const { hydrateBingoStateDisplayNames, normalizeMatchState } = gameState;
  const { nowMs } = helpers;
  const { findAccountTeamIdInTeams, upsertMatchBinding, upsertPlayerBinding } = repository;
  const { canPlayersChooseTheirOwnTeam, normalizeRoomSummary } = roomSummary;

  function persistMatch(connection) {
    if (!connection.matchUid) return;
    upsertMatchBinding({
      matchUid: connection.matchUid,
      joinCode: connection.joinCode,
      roomSummary: connection.roomSummary,
      matchState: connection.matchState,
    });
  }

  function persistPlayer(connection, overrides = {}) {
    return upsertPlayerBinding({
      accountId: connection.accountId,
      matchUid: connection.matchUid || "",
      joinCode: connection.joinCode || "",
      teamId: connection.teamId,
      requiresTeamChoice: connection.requiresTeamChoice,
      ...overrides,
    });
  }

  function recordError(connection, error, overrides = {}) {
    return persistPlayer(connection, {
      ...overrides,
      lastError: error?.message || String(error),
    });
  }

  function consumeJoinRoom(connection, response, { persist = true } = {}) {
    const normalizedRoomSummary = normalizeRoomSummary({
      join_code: connection.joinCode,
      name: response?.config?.name || "",
      config: response?.config || {},
      match_config: response?.match_config || {},
      teams: response?.teams || [],
      host_name: "",
      started: response?.match_uid ? nowMs() : 0,
      match_uid: response?.match_uid || "",
    });
    connection.roomSummary = normalizedRoomSummary;
    connection.matchUid = String(response?.match_uid || "").trim();
    const roomTeamId = findAccountTeamIdInTeams(response?.teams || normalizedRoomSummary.teams, connection.accountId);
    if (roomTeamId !== null && roomTeamId !== undefined) connection.teamId = roomTeamId;
    connection.teamChoiceAllowed = Boolean(connection.matchUid && canPlayersChooseTheirOwnTeam(normalizedRoomSummary));
    connection.requiresTeamChoice =
      connection.teamChoiceAllowed && (connection.teamId === null || connection.teamId === undefined);
    if (connection.teamChoiceAllowed && connection.requiresTeamChoice) {
      connection.matchState = {
        uid: connection.matchUid,
        config: normalizedRoomSummary.matchConfig || {},
        phase: 0,
        teams: Array.isArray(response?.teams) ? response.teams : [],
        cells: [],
        can_reroll: false,
        started: new Date().toISOString(),
      };
    }
    if (persist) persistPlayer(connection);
    if (persist && connection.matchUid) persistMatch(connection);
  }

  function consumeJoinMatch(connection, response, { persist = true } = {}) {
    const matchState = normalizeMatchState(response?.state || null);
    if (!matchState) throw new Error("Bingo match join did not return match state.");
    connection.matchState = matchState;
    connection.matchUid = String(matchState.uid || connection.matchUid || "").trim();
    connection.requiresTeamChoice = false;
    const currentPlayer = connection.findSelfPlayer();
    connection.teamId = currentPlayer?.team?.base?.id ?? currentPlayer?.team?.id ?? connection.teamId;
    if (persist && connection.matchUid) {
      persistPlayer(connection, { requiresTeamChoice: false });
      persistMatch(connection);
    }
  }

  async function refreshResolvedDisplayNames(connection, reason = "bingo-bridge-bingo-state") {
    if (connection.hydratingNames) return connection.hydratingNames;
    connection.hydratingNames = (async () => {
      identity.refreshDisplayName(connection);
      await hydrateBingoStateDisplayNames({
        roomSummary: connection.roomSummary,
        matchState: connection.matchState,
        reason,
      });
      persistMatch(connection);
    })();
    try {
      return await connection.hydratingNames;
    } finally {
      connection.hydratingNames = null;
    }
  }

  function queueResolvedDisplayNameRefresh(connection, reason, onResolved) {
    refreshResolvedDisplayNames(connection, reason)
      .then(() => onResolved?.())
      .catch((error) => {
        console.warn(`[bingo-bridge-displayname] async state hydration failed: ${error?.message || error}`);
      });
  }

  return {
    persistMatch,
    persistPlayer,
    recordError,
    consumeJoinRoom,
    consumeJoinMatch,
    refreshResolvedDisplayNames,
    queueResolvedDisplayNameRefresh,
  };
}

export { createConnectionPersistence };
