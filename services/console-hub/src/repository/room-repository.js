function createRoomRepository({ config, db, helpers, matchEvents }) {
  const { nowMs } = helpers;
  const { roomBindingPath } = matchEvents;

  function serializeRoomBindingForClient(binding) {
    if (!binding) return null;
    return {
      clubId: config.clubId,
      roomActivityId: binding.room_activity_id || null,
      roomServerId: binding.room_server_id || null,
      roomName: binding.room_name || "",
      selectedCellId: binding.selected_cell_id ?? null,
      selectedMapUid: binding.selected_map_uid || null,
      selectedMapId: binding.selected_map_id || null,
      selectedMapName: binding.selected_map_name || null,
      status: binding.status || "idle",
      clubPath: roomBindingPath(binding),
      pathNote:
        "Trackmania > Clubs > Bingo On Console > Rooms > your match folder > your player folder > your generated room.",
    };
  }

  function getRoomBinding(accountId, matchUid) {
    return (
      db.prepare("SELECT * FROM bingo_room_bindings WHERE account_id = ? AND match_uid = ?").get(accountId, matchUid) ||
      null
    );
  }

  function getRoomBindingsForMatch(matchUid) {
    return db.prepare("SELECT * FROM bingo_room_bindings WHERE match_uid = ?").all(matchUid);
  }

  function deleteRoomBinding(accountId, matchUid) {
    db.prepare("DELETE FROM bingo_room_bindings WHERE account_id = ? AND match_uid = ?").run(accountId, matchUid);
  }

  function markRoomBindingStatus(accountId, matchUid, status) {
    db.prepare(
      `UPDATE bingo_room_bindings
       SET status = ?, updated_at = ?
       WHERE account_id = ? AND match_uid = ?`
    ).run(status, nowMs(), accountId, matchUid);
  }

  function activeRoomBindingCountForMatch(matchUid) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM bingo_room_bindings
         WHERE match_uid = ?
           AND COALESCE(status, '') NOT IN ('cleanup_pending', 'cleanup_failed')`
      )
      .get(matchUid);
    return Number(row?.count || 0);
  }

  function upsertRoomBinding({
    accountId,
    matchUid,
    joinCode,
    matchSlug,
    playerSlug,
    rootFolderActivityId = null,
    matchFolderActivityId = null,
    playerFolderActivityId = null,
    roomActivityId = null,
    roomServerId = null,
    roomName = "",
    selectedCellId = null,
    selectedMapUid = null,
    selectedMapId = null,
    selectedMapName = null,
    selectedMapJson = null,
    targetMedal = null,
    status = "idle",
    clubPath = [],
    lastClaimRecordId = null,
    lastVerifiedTime = null,
    lastVerifiedMedal = null,
    lastCheckedAt = null,
    nextCheckAt = null,
  }) {
    const existing = getRoomBinding(accountId, matchUid);
    const bindingId = existing?.binding_id || `${accountId}:${matchUid}`;
    const createdAt = Number(existing?.created_at || nowMs());
    db.prepare(
      `
      INSERT INTO bingo_room_bindings (
        binding_id, account_id, match_uid, join_code, match_slug, player_slug,
        root_folder_activity_id, match_folder_activity_id, player_folder_activity_id,
        room_activity_id, room_server_id, room_name, selected_cell_id, selected_map_uid,
        selected_map_id, selected_map_name, selected_map_json, target_medal, status,
        path_json, last_claim_record_id, last_verified_time, last_verified_medal,
        last_checked_at, next_check_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(binding_id) DO UPDATE SET
        join_code = excluded.join_code,
        match_slug = excluded.match_slug,
        player_slug = excluded.player_slug,
        root_folder_activity_id = excluded.root_folder_activity_id,
        match_folder_activity_id = excluded.match_folder_activity_id,
        player_folder_activity_id = excluded.player_folder_activity_id,
        room_activity_id = excluded.room_activity_id,
        room_server_id = excluded.room_server_id,
        room_name = excluded.room_name,
        selected_cell_id = excluded.selected_cell_id,
        selected_map_uid = excluded.selected_map_uid,
        selected_map_id = excluded.selected_map_id,
        selected_map_name = excluded.selected_map_name,
        selected_map_json = excluded.selected_map_json,
        target_medal = excluded.target_medal,
        status = excluded.status,
        path_json = excluded.path_json,
        last_claim_record_id = excluded.last_claim_record_id,
        last_verified_time = excluded.last_verified_time,
        last_verified_medal = excluded.last_verified_medal,
        last_checked_at = excluded.last_checked_at,
        next_check_at = excluded.next_check_at,
        updated_at = excluded.updated_at
    `
    ).run(
      bindingId,
      accountId,
      matchUid,
      joinCode,
      matchSlug,
      playerSlug,
      rootFolderActivityId,
      matchFolderActivityId,
      playerFolderActivityId,
      roomActivityId,
      roomServerId,
      roomName,
      selectedCellId,
      selectedMapUid,
      selectedMapId,
      selectedMapName,
      selectedMapJson ? JSON.stringify(selectedMapJson) : null,
      targetMedal,
      status,
      JSON.stringify(clubPath || []),
      lastClaimRecordId,
      lastVerifiedTime,
      lastVerifiedMedal,
      lastCheckedAt,
      nextCheckAt,
      createdAt,
      nowMs()
    );
    return getRoomBinding(accountId, matchUid);
  }

  return {
    serializeRoomBindingForClient,
    getRoomBinding,
    getRoomBindingsForMatch,
    deleteRoomBinding,
    markRoomBindingStatus,
    activeRoomBindingCountForMatch,
    upsertRoomBinding,
  };
}

export { createRoomRepository };
