import { BINGO_ROOM_IDENTIFIER_LENGTH, NADEO_NAME_LIMIT } from "../constants.js";

export function createClubRoomLifecycle({ config, db, helpers, nadeo, repository } = {}) {
  const { jsonTryParse, nowMs, prefixedFolderName, shortReadableId, stripTmStyle } = helpers;
  const { nadeoLiveRequest } = nadeo;
  const {
    activeRoomBindingCountForMatch,
    deleteMatchMirror,
    deleteRoomBinding,
    getRoomBinding,
    getRoomBindingsForMatch,
    markRoomBindingStatus,
    upsertRoomBinding,
  } = repository;

  function standardRoomSettings({ timeLimit = -1, chatTime = 1 } = {}) {
    return [
      { key: "S_TimeLimit", value: String(timeLimit), type: "integer" },
      { key: "S_WarmUpNb", value: "0", type: "integer" },
      { key: "S_WarmUpDuration", value: "0", type: "integer" },
      { key: "S_WarmUpTimeout", value: "0", type: "integer" },
      { key: "S_ChatTime", value: String(chatTime), type: "integer" },
      { key: "S_ForceLapsNb", value: "-1", type: "integer" },
      { key: "S_EnableJoinLeaveNotifications", value: "false", type: "boolean" },
    ];
  }

  async function getClubActivitiesByFolder(folderId = 0) {
    const payload = await nadeoLiveRequest(`club/${config.clubId}/activity`, {
      query: {
        length: 250,
        offset: 0,
        active: true,
        folderId,
      },
    });
    return Array.isArray(payload?.activityList) ? payload.activityList : [];
  }

  async function ensureFolder(parentFolderId, folderName) {
    const existingItems = await getClubActivitiesByFolder(parentFolderId);
    const existing = existingItems.find(
      (item) =>
        String(item?.activityType || "").toLowerCase() === "folder" &&
        String(item?.name || "")
          .trim()
          .toLowerCase() === folderName.trim().toLowerCase()
    );
    if (existing) return existing;
    return nadeoLiveRequest(`club/${config.clubId}/folder/create`, {
      method: "POST",
      body: {
        name: folderName,
        folderId: parentFolderId,
      },
    });
  }

  async function createOrUpdateRoom({
    folderActivityId,
    roomName,
    targetMapUid,
    roomActivityId = null,
    timeLimit = -1,
  }) {
    const payload = {
      name: roomName,
      region: config.roomRegion,
      maxPlayersPerServer: config.roomMaxPlayers,
      script: config.roomScript,
      settings: standardRoomSettings({ timeLimit }),
      maps: [targetMapUid],
      scalable: 0,
      shufflePlaylist: 0,
      folderId: folderActivityId,
    };
    if (roomActivityId) {
      return nadeoLiveRequest(`club/${config.clubId}/room/${roomActivityId}/edit`, {
        method: "POST",
        body: payload,
      });
    }
    const created = await nadeoLiveRequest(`club/${config.clubId}/room/create`, {
      method: "POST",
      body: payload,
    });
    if (Number(created?.activityId || 0) > 0) {
      await nadeoLiveRequest(`club/${config.clubId}/activity/${created.activityId}/edit`, {
        method: "POST",
        body: {
          active: 1,
          public: 1,
          folderId: folderActivityId,
        },
      });
    }
    return created;
  }

  async function deactivateClubActivity(activityId, { label = "activity" } = {}) {
    const id = Number(activityId || 0);
    if (!Number.isFinite(id) || id <= 0) return false;
    try {
      await nadeoLiveRequest(`club/${config.clubId}/activity/${id}/edit`, {
        method: "POST",
        body: {
          active: 0,
          public: 0,
        },
      });
      return true;
    } catch (error) {
      if (Number(error?.statusCode || 0) === 404) return true;
      error.message = `Could not remove generated ${label} ${id}: ${error.message || error}`;
      throw error;
    }
  }

  async function cleanupMatchFolderIfUnused(matchUid, fallbackMatchFolderActivityId = 0) {
    const uid = String(matchUid || "").trim();
    if (!uid || activeRoomBindingCountForMatch(uid) > 0) return false;
    const existing = getRoomBindingsForMatch(uid).find((row) => Number(row?.match_folder_activity_id || 0) > 0);
    const matchFolderActivityId = Number(fallbackMatchFolderActivityId || existing?.match_folder_activity_id || 0);
    return deactivateClubActivity(matchFolderActivityId, { label: "match folder" });
  }

  async function cleanupConsoleRoomBinding(binding, { cleanupMatchFolder = true, reason = "cleanup" } = {}) {
    if (!binding) return false;
    const accountId = String(binding.account_id || "").trim();
    const matchUid = String(binding.match_uid || "").trim();
    if (!accountId || !matchUid) return false;
    markRoomBindingStatus(accountId, matchUid, "cleanup_pending");
    const matchFolderActivityId = Number(binding.match_folder_activity_id || 0);
    try {
      await deactivateClubActivity(binding.room_activity_id, { label: "player room" });
      await deactivateClubActivity(binding.player_folder_activity_id, { label: "player folder" });
      if (cleanupMatchFolder) {
        await cleanupMatchFolderIfUnused(matchUid, matchFolderActivityId);
      }
      deleteRoomBinding(accountId, matchUid);
      return true;
    } catch (error) {
      markRoomBindingStatus(accountId, matchUid, "cleanup_failed");
      console.warn(`[console-hub] ${reason} failed: ${error?.message || error}`);
      return false;
    }
  }

  async function cleanupConsoleResourcesForPlayer({ accountId, matchUid, reason = "player leave" }) {
    const binding = getRoomBinding(accountId, matchUid);
    return cleanupConsoleRoomBinding(binding, { cleanupMatchFolder: true, reason });
  }

  async function cleanupConsoleResourcesForMatch(matchUid, { reason = "match cleanup" } = {}) {
    const uid = String(matchUid || "").trim();
    if (!uid) return;
    const bindings = getRoomBindingsForMatch(uid);
    let matchFolderActivityId = Number(
      bindings.find((row) => Number(row?.match_folder_activity_id || 0) > 0)?.match_folder_activity_id || 0
    );
    for (let index = 0; index < bindings.length; index += 1) {
      const binding = bindings[index];
      matchFolderActivityId = matchFolderActivityId || Number(binding.match_folder_activity_id || 0);
      await cleanupConsoleRoomBinding(binding, {
        cleanupMatchFolder: index === bindings.length - 1,
        reason,
      });
    }
    if (!bindings.length) {
      await cleanupMatchFolderIfUnused(uid, matchFolderActivityId);
    }
    db.prepare("DELETE FROM bingo_player_bindings WHERE match_uid = ?").run(uid);
    deleteMatchMirror(uid);
  }

  async function advanceRoomToMap({ roomActivityId, folderActivityId, roomName, mapUid, onProgress = null }) {
    await onProgress?.("sending-map", "Updating the generated club room with the selected map.");
    await createOrUpdateRoom({
      folderActivityId,
      roomName,
      targetMapUid: mapUid,
      roomActivityId,
      timeLimit: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 6000));
    const result = await createOrUpdateRoom({
      folderActivityId,
      roomName,
      targetMapUid: mapUid,
      roomActivityId,
      timeLimit: -1,
    });
    return result;
  }

  function deriveMatchFolderName({ roomSummary, matchUid }) {
    const id = shortReadableId(matchUid || roomSummary?.joinCode || roomSummary?.name, BINGO_ROOM_IDENTIFIER_LENGTH);
    return prefixedFolderName(id, roomSummary?.name || "Bingo Room", "Bingo");
  }

  function derivePlayerFolderName({ accountId, displayName }) {
    const id = shortReadableId(accountId, BINGO_ROOM_IDENTIFIER_LENGTH);
    return prefixedFolderName(id, displayName || "Player", "Player");
  }

  function deriveRoomLeafName(accountId) {
    return `Join ${shortReadableId(accountId, BINGO_ROOM_IDENTIFIER_LENGTH)}`.slice(0, NADEO_NAME_LIMIT);
  }

  function activityId(activity) {
    return Number(activity?.activityId || activity?.id || 0);
  }

  function idleRoomBinding({ accountId, matchUid, joinCode, matchSlug, playerSlug, roomName, existing }) {
    return {
      accountId,
      matchUid,
      joinCode,
      matchSlug,
      playerSlug,
      status: "idle",
      clubPath: [config.clubLabel, config.clubRootName, matchSlug, playerSlug],
      rootFolderActivityId: existing?.root_folder_activity_id || null,
      matchFolderActivityId: existing?.match_folder_activity_id || null,
      playerFolderActivityId: existing?.player_folder_activity_id || null,
      roomActivityId: existing?.room_activity_id || null,
      roomServerId: existing?.room_server_id || null,
      roomName,
      lastClaimRecordId: existing?.last_claim_record_id || null,
      lastVerifiedTime: existing?.last_verified_time ?? null,
      lastVerifiedMedal: existing?.last_verified_medal ?? null,
      lastCheckedAt: existing?.last_checked_at ?? null,
      nextCheckAt: existing?.next_check_at ?? null,
    };
  }

  function readyRoomBinding({
    accountId,
    matchUid,
    joinCode,
    matchSlug,
    playerSlug,
    roomName,
    existing,
    defaultCell,
    matchState,
    forceNewRoom,
    rootFolder,
    matchFolder,
    playerFolder,
    roomPayload,
  }) {
    return {
      accountId,
      matchUid,
      joinCode,
      matchSlug,
      playerSlug,
      rootFolderActivityId: activityId(rootFolder),
      matchFolderActivityId: activityId(matchFolder),
      playerFolderActivityId: activityId(playerFolder),
      roomActivityId: Number(
        roomPayload.activityId || roomPayload.id || (!forceNewRoom ? existing?.room_activity_id : 0) || 0
      ),
      roomServerId: Number(
        roomPayload.roomId || roomPayload.room?.id || (!forceNewRoom ? existing?.room_server_id : 0) || 0
      ),
      roomName,
      selectedCellId: existing?.selected_cell_id ?? Number(defaultCell.cell_id ?? 0),
      selectedMapUid: existing?.selected_map_uid || defaultCell.map.uid,
      selectedMapId: existing?.selected_map_id || defaultCell.map.webservices_id || null,
      selectedMapName:
        existing?.selected_map_name ||
        stripTmStyle(defaultCell.map.track_name || defaultCell.map.name || defaultCell.map.uid),
      selectedMapJson: existing?.selected_map_json ? jsonTryParse(existing.selected_map_json, null) : defaultCell.map,
      targetMedal: existing?.target_medal ?? Number(matchState?.config?.target_medal ?? 0),
      status: forceNewRoom ? "idle" : existing?.status || "idle",
      clubPath: [config.clubLabel, config.clubRootName, matchSlug, playerSlug, roomName],
      lastClaimRecordId: existing?.last_claim_record_id || null,
      lastVerifiedTime: existing?.last_verified_time ?? null,
      lastVerifiedMedal: existing?.last_verified_medal ?? null,
      lastCheckedAt: existing?.last_checked_at ?? null,
      nextCheckAt: existing?.next_check_at ?? nowMs() + config.verifyIntervalSeconds * 1000,
    };
  }

  async function ensureClubRoomReady({
    accountId,
    displayName,
    joinCode,
    matchUid,
    roomSummary,
    matchState,
    forceNewRoom = false,
  }) {
    const existing = getRoomBinding(accountId, matchUid);
    const matchSlug = deriveMatchFolderName({ roomSummary, matchUid });
    const playerSlug = derivePlayerFolderName({ accountId, displayName });
    const roomName = deriveRoomLeafName(accountId);
    const defaultCell = Array.isArray(matchState?.cells) && matchState.cells.length ? matchState.cells[0] : null;
    if (!defaultCell) {
      return upsertRoomBinding(
        idleRoomBinding({ accountId, matchUid, joinCode, matchSlug, playerSlug, roomName, existing })
      );
    }
    if (String(defaultCell?.map?.type || "").toUpperCase() !== "TMX") {
      throw new Error("The bridge currently supports TMX-backed Bingo maps only.");
    }

    const rootFolder = await ensureFolder(0, config.clubRootName);
    const matchFolder = await ensureFolder(activityId(rootFolder), matchSlug);
    const playerFolder = await ensureFolder(activityId(matchFolder), playerSlug);
    if (forceNewRoom && existing?.room_activity_id) {
      await deactivateClubActivity(existing.room_activity_id, { label: "player room" });
    }
    const roomPayload = await createOrUpdateRoom({
      folderActivityId: activityId(playerFolder),
      roomName,
      targetMapUid: existing?.selected_map_uid || defaultCell.map.uid,
      roomActivityId: !forceNewRoom && existing?.room_activity_id ? Number(existing.room_activity_id) : null,
    });

    return upsertRoomBinding(
      readyRoomBinding({
        accountId,
        matchUid,
        joinCode,
        matchSlug,
        playerSlug,
        roomName,
        existing,
        defaultCell,
        matchState,
        forceNewRoom,
        rootFolder,
        matchFolder,
        playerFolder,
        roomPayload,
      })
    );
  }

  return {
    standardRoomSettings,
    getClubActivitiesByFolder,
    ensureFolder,
    createOrUpdateRoom,
    deactivateClubActivity,
    cleanupMatchFolderIfUnused,
    cleanupConsoleRoomBinding,
    cleanupConsoleResourcesForPlayer,
    cleanupConsoleResourcesForMatch,
    advanceRoomToMap,
    deriveMatchFolderName,
    derivePlayerFolderName,
    deriveRoomLeafName,
    ensureClubRoomReady,
  };
}
