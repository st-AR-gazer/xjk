export function createRoomSummaryService() {
  function normalizeRoomSummary(rawRoom = {}) {
    const room = rawRoom || {};
    const configObj = room.config || room.roomConfig || room.room_config || {};
    const matchObj = room.match_config || room.matchConfig || {};
    const matchUid = String(room.match_uid || room.matchUid || "").trim();
    const startedValue = Number(room.started || room.start_time || room.startedTimestamp || 0);
    const teams = Array.isArray(room.teams) ? room.teams : [];
    const playerCount =
      Number(room.player_count ?? room.playerCount) ||
      teams.reduce((sum, team) => sum + (Array.isArray(team.members) ? team.members.length : 0), 0);
    return {
      joinCode: String(room.join_code || room.joinCode || room.code || "").trim(),
      name: String(room.name || configObj.name || "Bingo Room").trim(),
      hostName: String(room.host_name || room.hostName || room.hostname || "").trim(),
      playerCount,
      config: configObj,
      matchConfig: matchObj,
      public: Boolean(configObj.public),
      randomize: Boolean(configObj.randomize),
      hostControl: Boolean(configObj.host_control ?? configObj.hostControl),
      lateJoin: Boolean(matchObj.late_join ?? matchObj.lateJoin ?? true),
      gridSize: Number(matchObj.grid_size ?? matchObj.gridSize ?? 0),
      selection: Number(matchObj.selection ?? 0),
      targetMedal: Number(matchObj.target_medal ?? 0),
      started: startedValue,
      isLive: startedValue > 0 || Boolean(matchUid),
      matchUid,
      teams,
    };
  }

  function roomSummaryNeedsProbe(roomSummary) {
    if (!roomSummary) return true;
    if (roomSummary.joinCode && !roomSummary.matchUid) return false;
    if (!roomSummary.matchUid) return true;
    return !Array.isArray(roomSummary.teams) || roomSummary.teams.length === 0;
  }

  function mergeRoomSummaries(cachedRoom = null, probedRoom = null) {
    if (!cachedRoom) return probedRoom;
    if (!probedRoom) return cachedRoom;
    return normalizeRoomSummary({
      ...cachedRoom,
      ...probedRoom,
      join_code: probedRoom.joinCode || cachedRoom.joinCode || "",
      joinCode: probedRoom.joinCode || cachedRoom.joinCode || "",
      host_name: cachedRoom.hostName || probedRoom.hostName || "",
      hostName: cachedRoom.hostName || probedRoom.hostName || "",
      player_count: cachedRoom.playerCount ?? probedRoom.playerCount ?? 0,
      playerCount: cachedRoom.playerCount ?? probedRoom.playerCount ?? 0,
      teams:
        Array.isArray(probedRoom.teams) && probedRoom.teams.length
          ? probedRoom.teams
          : Array.isArray(cachedRoom.teams)
            ? cachedRoom.teams
            : [],
      match_uid: probedRoom.matchUid || cachedRoom.matchUid || "",
      matchUid: probedRoom.matchUid || cachedRoom.matchUid || "",
      started: probedRoom.started || cachedRoom.started || 0,
    });
  }

  function canPlayersChooseTheirOwnTeam(roomSummary) {
    return !roomSummary.hostControl && !roomSummary.randomize;
  }

  return { normalizeRoomSummary, roomSummaryNeedsProbe, mergeRoomSummaries, canPlayersChooseTheirOwnTeam };
}
