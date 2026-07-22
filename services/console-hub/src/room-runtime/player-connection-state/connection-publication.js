function createConnectionPublication({ bingo, matchEvents, playerConnections, repository }) {
  const { BINGO_CLIENT_KIND_WEB_PLAYER } = bingo;
  const { buildClaimStatus, publishMatchUpdate, roomEventScope } = matchEvents;
  const { getRoomBinding, serializeRoomBindingForClient } = repository;

  function snapshot(connection) {
    const binding = getRoomBinding(connection.accountId, connection.matchUid);
    const connectedToMatch = Boolean(connection.matchUid && connection.matchState);
    return {
      ok: true,
      clientKind: BINGO_CLIENT_KIND_WEB_PLAYER,
      identityMode: "shared-user",
      matchUid: connection.matchUid,
      roomSummary: connection.roomSummary,
      matchState: connection.matchState,
      roomBinding: serializeRoomBindingForClient(binding),
      claimStatus: buildClaimStatus(binding),
      teamChoiceAllowed: connection.teamChoiceAllowed,
      requiresTeamChoice: connection.requiresTeamChoice,
      detailMessage: connectedToMatch
        ? connection.teamChoiceAllowed && connection.requiresTeamChoice
          ? "Choose a team to finish joining this active Bingo match."
          : "Your console bridge is connected to the live Bingo match."
        : "You joined the Bingo lobby. Start the match in Trackmania to unlock the room board.",
    };
  }

  function publishPlayerSnapshot(accountId, matchUid) {
    const connection = [...playerConnections.values()].find(
      (entry) => entry.accountId === accountId && entry.matchUid === matchUid
    );
    if (connection) publishMatchUpdate(accountId, matchUid, snapshot(connection));
  }

  function publishConnectionSnapshot(connection, { notification = null } = {}) {
    const payload = snapshot(connection);
    if (notification) payload.notification = notification;
    publishMatchUpdate(connection.accountId, connection.matchUid, payload);
  }

  function publishMatchStarted(connection) {
    const payload = snapshot(connection);
    publishMatchUpdate(connection.accountId, connection.matchUid, payload);
    const pregameScope = roomEventScope(connection.joinCode);
    if (pregameScope) publishMatchUpdate(connection.accountId, pregameScope, payload);
  }

  function publishRoomClosed(connection, event = {}) {
    if (!connection) return;
    const joinCode = String(connection.joinCode || "").trim();
    const matchUid = String(connection.matchUid || "").trim();
    const payload = {
      ok: true,
      left: true,
      roomClosed: true,
      joinCode,
      matchUid,
      message: String(event?.message || "The host closed this Bingo room.").trim(),
    };
    if (matchUid) publishMatchUpdate(connection.accountId, matchUid, payload);
    const roomScope = roomEventScope(joinCode);
    if (roomScope) publishMatchUpdate(connection.accountId, roomScope, payload);
  }

  return {
    snapshot,
    publishPlayerSnapshot,
    publishConnectionSnapshot,
    publishMatchStarted,
    publishRoomClosed,
  };
}

export { createConnectionPublication };
