export function createMapSwitchingService({
  clubRoomLifecycle,
  config,
  helpers,
  matchEvents,
  nadeo,
  playerConnectionState,
  repository,
  roomBindingState,
} = {}) {
  const { advanceRoomToMap, ensureClubRoomReady } = clubRoomLifecycle;
  const { nowMs, stripTmStyle } = helpers;
  const { publishMapSwitchProgress } = matchEvents;
  const { getMapInfoByUid } = nadeo;
  const { playerConnections, publishPlayerSnapshot } = playerConnectionState;
  const { getRoomBinding } = repository;
  const { transitionRoomBinding } = roomBindingState;

  async function selectMapForRoom({ accountId, matchUid, cellId }) {
    publishMapSwitchProgress({
      accountId,
      matchUid,
      step: "finding-map",
      detail: "Checking the selected Bingo tile and map UID.",
    });
    const connection = [...playerConnections.values()].find(
      (entry) => entry.accountId === accountId && entry.matchUid === matchUid
    );
    if (!connection?.matchState) {
      throw new Error("The live match state is not available yet.");
    }
    const cell = (Array.isArray(connection.matchState.cells) ? connection.matchState.cells : []).find(
      (entry) => Number(entry?.cell_id) === Number(cellId)
    );
    if (!cell) throw new Error("That tile could not be found in the current match.");
    if (String(cell?.map?.type || "").toUpperCase() !== "TMX") {
      throw new Error("Only TMX-backed Bingo maps are supported by the console bridge right now.");
    }
    const mapUid = String(cell.map.uid || "").trim();
    if (!mapUid) throw new Error("The selected tile does not expose a playable map UID.");
    publishMapSwitchProgress({
      accountId,
      matchUid,
      step: "requesting-nadeo",
      detail: "Fetching official map data from Nadeo.",
    });
    const mapInfo = await getMapInfoByUid(mapUid);
    const binding = await ensureClubRoomReady({
      accountId,
      displayName: connection.displayName,
      joinCode: connection.joinCode,
      matchUid,
      roomSummary: connection.roomSummary,
      matchState: connection.matchState,
    });
    const nextBinding = transitionRoomBinding(binding, {
      accountId,
      matchUid,
      joinCode: connection.joinCode,
      selectedCellId: Number(cell.cell_id ?? cellId),
      selectedMapUid: mapUid,
      selectedMapId: String(mapInfo?.mapId || cell.map.webservices_id || "").trim() || null,
      selectedMapName: stripTmStyle(mapInfo?.name || cell.map.track_name || mapUid),
      selectedMapJson: {
        ...cell.map,
        mapId: String(mapInfo?.mapId || cell.map.webservices_id || "").trim() || null,
        hasClones: Boolean(mapInfo?.hasClones),
        mapType: String(mapInfo?.mapType || ""),
      },
      targetMedal: Number(connection.matchState?.config?.target_medal ?? 0),
      status: "switching",
      nextCheckAt: nowMs() + config.verifyIntervalSeconds * 1000,
    });
    publishPlayerSnapshot(accountId, matchUid);
    await advanceRoomToMap({
      roomActivityId: Number(nextBinding.room_activity_id),
      folderActivityId: Number(nextBinding.player_folder_activity_id),
      roomName: nextBinding.room_name,
      mapUid,
      onProgress: (step, detail) =>
        publishMapSwitchProgress({
          accountId,
          matchUid,
          step,
          detail,
        }),
    });
    publishMapSwitchProgress({
      accountId,
      matchUid,
      step: "sending-map",
      state: "done",
      detail: "Map has been updated in your generated console room.",
    });
    transitionRoomBinding(nextBinding, {
      accountId,
      matchUid,
      joinCode: connection.joinCode,
      status: "idle",
      nextCheckAt: nowMs() + config.verifyIntervalSeconds * 1000,
    });
    publishPlayerSnapshot(accountId, matchUid);
    return getRoomBinding(accountId, matchUid);
  }

  return { selectMapForRoom };
}
