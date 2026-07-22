export function createMembershipRoutes({
  auth,
  directory,
  displayNames,
  gameState,
  helpers,
  httpSupport,
  lifecycle,
  matchEvents,
  repository,
  roomRuntime,
  roomSummary: roomSummaryService,
  requireSession,
} = {}) {
  const { ensureFreshOauthSession } = auth;
  const { directoryState } = directory;
  const { authoritativeSessionIdentity } = displayNames;
  const { hydrateBingoStateDisplayNames } = gameState;
  const { jsonTryParse } = helpers;
  const { readJsonBody, sendJson } = httpSupport;
  const { cleanupConsoleResourcesForPlayer, privateLookupViaProbe } = lifecycle;
  const { buildClaimStatus, publishMatchUpdate } = matchEvents;
  const {
    buildJoinedMatchPayload,
    deletePlayerBinding,
    deletePlayerBindingByJoinCode,
    getLatestMatchBindingByJoinCode,
    getMatchBinding,
    getMatchStateMirror,
    getPlayerBinding,
    getPlayerBindingByJoinCode,
    getRoomBinding,
    matchStateHasBoard,
    playerBindingRequiresTeamChoice,
    serializeRoomBindingForClient,
    upsertMatchBinding,
    upsertPlayerBinding,
  } = repository;
  const { ensurePlayerConnectionForMatch, getOrCreatePlayerConnection, playerConnections } = roomRuntime;
  const { mergeRoomSummaries, normalizeRoomSummary, roomSummaryNeedsProbe } = roomSummaryService;

  async function handleJoinMatch(req, res) {
    const sessionEntry = requireSession(req, res);
    if (!sessionEntry) return;
    await ensureFreshOauthSession(sessionEntry.row, { persistOperator: true });
    const identity = authoritativeSessionIdentity(sessionEntry.row);
    const accountId = identity.accountId;
    const body = await readJsonBody(req);
    const joinCode = String(body.joinCode || "").trim();
    if (!joinCode) return sendJson(res, 400, { ok: false, error: "joinCode is required." });

    let discoveredRoom = directoryState.rooms.get(joinCode) || null;
    if (roomSummaryNeedsProbe(discoveredRoom)) {
      discoveredRoom = mergeRoomSummaries(discoveredRoom, await privateLookupViaProbe(joinCode));
      if (discoveredRoom?.joinCode) directoryState.rooms.set(discoveredRoom.joinCode, discoveredRoom);
    }
    if (discoveredRoom?.matchUid && !discoveredRoom.lateJoin) {
      return sendJson(res, 409, {
        ok: false,
        error: "Late join is disabled for this Bingo match.",
      });
    }

    const existingPlayerBinding = getPlayerBindingByJoinCode(accountId, joinCode);
    if (existingPlayerBinding) {
      const existingMatchUid = String(existingPlayerBinding.match_uid || "").trim();
      const existingConnection = [...playerConnections.values()].find(
        (entry) =>
          entry.accountId === accountId &&
          (existingMatchUid ? entry.matchUid === existingMatchUid : entry.joinCode === joinCode)
      );
      if (existingConnection && (!existingMatchUid || matchStateHasBoard(existingConnection.matchState))) {
        return sendJson(res, 200, existingConnection.snapshot());
      }
      if (existingMatchUid) {
        const persistedRoomSummary = jsonTryParse(getMatchBinding(existingMatchUid)?.room_json, null) || discoveredRoom;
        const persistedMatchState = getMatchStateMirror(existingMatchUid);
        const existingRoomBinding = getRoomBinding(accountId, existingMatchUid);
        const connection = getOrCreatePlayerConnection(sessionEntry.row);
        connection.joinCode = joinCode;
        connection.matchUid = existingMatchUid;
        connection.roomSummary =
          persistedRoomSummary ||
          discoveredRoom ||
          normalizeRoomSummary({ join_code: joinCode, config: {}, match_config: {} });
        if (existingPlayerBinding.team_id !== null && existingPlayerBinding.team_id !== undefined) {
          connection.teamId = Number(existingPlayerBinding.team_id);
        }
        try {
          await connection.joinMatch(existingMatchUid, connection.teamId);
          return sendJson(res, 200, {
            ...connection.snapshot(),
            detailMessage: "You were already joined to this live Bingo match.",
          });
        } catch (error) {
          upsertPlayerBinding({
            accountId,
            matchUid: existingMatchUid,
            joinCode,
            teamId: connection.teamId,
            requiresTeamChoice: playerBindingRequiresTeamChoice(existingPlayerBinding),
            lastError: error?.message || String(error),
          });
          if (!persistedRoomSummary && !persistedMatchState && !existingRoomBinding) throw error;
        }
        if (persistedRoomSummary || persistedMatchState || existingRoomBinding) {
          await hydrateBingoStateDisplayNames({
            roomSummary: persistedRoomSummary,
            matchState: persistedMatchState,
            reason: "bingo-bridge-join-existing-binding",
          }).catch(() => {});
          return sendJson(
            res,
            200,
            buildJoinedMatchPayload({
              accountId,
              matchUid: existingMatchUid,
              roomSummary: persistedRoomSummary,
              matchState: persistedMatchState,
              binding: existingRoomBinding,
              teamChoiceAllowed: Boolean(existingPlayerBinding.requires_team_choice),
              requiresTeamChoice: playerBindingRequiresTeamChoice(existingPlayerBinding),
              detailMessage: "You were already joined to this live Bingo match.",
            })
          );
        }
      }
    }

    const connection = getOrCreatePlayerConnection(sessionEntry.row);
    let joinResponse;
    try {
      joinResponse = await connection.joinLiveRoom(joinCode);
    } catch (error) {
      const message = String(error?.message || "");
      if (/already joined this room/i.test(message)) {
        const latestMatchBinding = getLatestMatchBindingByJoinCode(joinCode);
        let reboundMatchUid = String(
          existingPlayerBinding?.match_uid || discoveredRoom?.matchUid || latestMatchBinding?.match_uid || ""
        ).trim();
        let probedRoomSummary = null;
        if (!reboundMatchUid) {
          try {
            probedRoomSummary = await privateLookupViaProbe(joinCode);
            reboundMatchUid = String(probedRoomSummary?.matchUid || "").trim();
          } catch {
            probedRoomSummary = null;
          }
        }
        const reboundRoomSummary =
          jsonTryParse(getMatchBinding(reboundMatchUid)?.room_json, null) || probedRoomSummary || discoveredRoom;
        const reboundMatchState = getMatchStateMirror(reboundMatchUid);
        const reboundBinding = reboundMatchUid ? getRoomBinding(accountId, reboundMatchUid) : null;
        if (reboundMatchUid && (reboundRoomSummary || reboundMatchState || reboundBinding)) {
          await hydrateBingoStateDisplayNames({
            roomSummary: reboundRoomSummary,
            matchState: reboundMatchState,
            reason: "bingo-bridge-join-already-joined",
          }).catch(() => {});
          return sendJson(
            res,
            200,
            buildJoinedMatchPayload({
              accountId,
              matchUid: reboundMatchUid,
              roomSummary: reboundRoomSummary,
              matchState: reboundMatchState,
              binding: reboundBinding,
              teamChoiceAllowed: Boolean(existingPlayerBinding?.requires_team_choice),
              requiresTeamChoice: playerBindingRequiresTeamChoice(existingPlayerBinding),
              detailMessage: "You were already joined to this live Bingo match.",
            })
          );
        }
        if (!reboundMatchUid) {
          connection.joinCode = joinCode;
          connection.roomSummary =
            connection.roomSummary ||
            discoveredRoom ||
            normalizeRoomSummary({ join_code: joinCode, config: {}, match_config: {} });
          connection.matchUid = "";
          connection.matchState = null;
          connection.requiresTeamChoice = false;
          connection.teamChoiceAllowed = false;
          upsertPlayerBinding({
            accountId,
            matchUid: "",
            joinCode,
            teamId: connection.teamId,
            requiresTeamChoice: false,
          });
          return sendJson(res, 200, {
            ...connection.snapshot(),
            detailMessage: "You were already joined to this Bingo lobby.",
          });
        }
      }
      throw error;
    }

    const joinedRoomSummary =
      connection.roomSummary ||
      discoveredRoom ||
      normalizeRoomSummary({ join_code: joinCode, config: {}, match_config: {} });
    if (!connection.roomSummary) connection.roomSummary = joinedRoomSummary;
    const liveMatchUid = String(joinResponse?.match_uid || joinedRoomSummary?.matchUid || "").trim();
    if (!liveMatchUid) {
      return sendJson(res, 200, {
        ...connection.snapshot(),
        detailMessage: "You joined the Bingo lobby. Start the match in Trackmania to unlock the room board.",
      });
    }

    if (connection.teamChoiceAllowed && connection.requiresTeamChoice) {
      upsertPlayerBinding({
        accountId: connection.accountId,
        matchUid: liveMatchUid,
        joinCode,
        teamId: null,
        requiresTeamChoice: true,
      });
      upsertMatchBinding({
        matchUid: liveMatchUid,
        joinCode,
        roomSummary: connection.roomSummary,
        matchState: connection.matchState,
      });
      const binding = getRoomBinding(connection.accountId, liveMatchUid);
      return sendJson(
        res,
        200,
        buildJoinedMatchPayload({
          accountId: connection.accountId,
          matchUid: liveMatchUid,
          roomSummary: connection.roomSummary,
          matchState: connection.matchState,
          binding,
          teamChoiceAllowed: true,
          requiresTeamChoice: true,
          detailMessage: "Choose a team to finish joining this live Bingo match.",
        })
      );
    }

    await connection.joinMatch(liveMatchUid, null);
    return sendJson(res, 200, connection.snapshot());
  }

  async function handleLeaveMatch(req, res, matchUid) {
    const sessionEntry = requireSession(req, res);
    if (!sessionEntry) return;
    const accountId = authoritativeSessionIdentity(sessionEntry.row).accountId;
    const requestedMatchUid = String(matchUid || "").trim();
    const connection = playerConnections.get(sessionEntry.row.session_token);
    const currentMatchUid = String(connection?.matchUid || "").trim();
    const targetMatchUid = requestedMatchUid === "current" ? currentMatchUid : requestedMatchUid;

    if (targetMatchUid) {
      publishMatchUpdate(accountId, targetMatchUid, { ok: true, left: true, matchUid: targetMatchUid });
      await cleanupConsoleResourcesForPlayer({ accountId, matchUid: targetMatchUid, reason: "player leave" });
      deletePlayerBinding(accountId, targetMatchUid);
    }
    if (connection && (requestedMatchUid === "current" || !targetMatchUid || currentMatchUid === targetMatchUid)) {
      const currentJoinCode = String(connection.joinCode || "").trim();
      if (!targetMatchUid && currentJoinCode) deletePlayerBindingByJoinCode(accountId, currentJoinCode);
      connection.leaveCurrentRoom();
      playerConnections.delete(sessionEntry.row.session_token);
    }
    return sendJson(res, 200, { ok: true, left: true, matchUid: targetMatchUid || "" });
  }

  async function handleMatchDetails(req, res, matchUid) {
    const sessionEntry = requireSession(req, res);
    if (!sessionEntry) return;
    const accountId = authoritativeSessionIdentity(sessionEntry.row).accountId;
    let connection = [...playerConnections.values()].find(
      (entry) => entry.accountId === accountId && entry.matchUid === matchUid
    );
    const playerBinding = getPlayerBinding(accountId, matchUid);
    if (!connection && !playerBinding) {
      return sendJson(res, 404, { ok: false, error: "No joined match state was found for this session." });
    }
    if (
      playerBinding &&
      (!connection ||
        (!matchStateHasBoard(connection.matchState) &&
          !connection.requiresTeamChoice &&
          connection.teamId !== null &&
          connection.teamId !== undefined))
    ) {
      connection = await ensurePlayerConnectionForMatch(sessionEntry.row, matchUid);
    }
    const roomSummary = connection?.roomSummary || jsonTryParse(getMatchBinding(matchUid)?.room_json, null);
    const matchState = connection?.matchState || getMatchStateMirror(matchUid);
    const binding = getRoomBinding(accountId, matchUid);
    if (!roomSummary && !matchState && !binding) {
      return sendJson(res, 404, { ok: false, error: "No joined match state was found for this session." });
    }
    await hydrateBingoStateDisplayNames({
      roomSummary,
      matchState,
      reason: "bingo-bridge-match-details",
    }).catch(() => {});
    return sendJson(res, 200, {
      ok: true,
      matchUid,
      roomSummary,
      matchState,
      roomBinding: serializeRoomBindingForClient(binding),
      claimStatus: buildClaimStatus(binding),
      teamChoiceAllowed: Boolean(connection?.teamChoiceAllowed),
      requiresTeamChoice: Boolean(connection?.requiresTeamChoice),
      detailMessage: connection?.requiresTeamChoice
        ? "Choose a team to finish joining this live Bingo match."
        : "Your console bridge is connected to the live Bingo match.",
    });
  }

  return { handleJoinMatch, handleLeaveMatch, handleMatchDetails };
}
