export function createRoomBindingState({ helpers, matchEvents, repository } = {}) {
  const { jsonTryParse } = helpers;
  const { roomBindingPath } = matchEvents;
  const { upsertRoomBinding } = repository;

  function buildRoomBindingMutation(binding, overrides = {}) {
    return {
      accountId: binding?.account_id || "",
      matchUid: binding?.match_uid || "",
      joinCode: binding?.join_code || "",
      matchSlug: binding?.match_slug || "",
      playerSlug: binding?.player_slug || "",
      rootFolderActivityId: binding?.root_folder_activity_id ?? null,
      matchFolderActivityId: binding?.match_folder_activity_id ?? null,
      playerFolderActivityId: binding?.player_folder_activity_id ?? null,
      roomActivityId: binding?.room_activity_id ?? null,
      roomServerId: binding?.room_server_id ?? null,
      roomName: binding?.room_name || "",
      selectedCellId: binding?.selected_cell_id ?? null,
      selectedMapUid: binding?.selected_map_uid || null,
      selectedMapId: binding?.selected_map_id || null,
      selectedMapName: binding?.selected_map_name || null,
      selectedMapJson: jsonTryParse(binding?.selected_map_json, null),
      targetMedal: binding?.target_medal ?? null,
      status: binding?.status || "idle",
      clubPath: roomBindingPath(binding),
      lastClaimRecordId: binding?.last_claim_record_id || null,
      lastVerifiedTime: binding?.last_verified_time ?? null,
      lastVerifiedMedal: binding?.last_verified_medal ?? null,
      lastCheckedAt: binding?.last_checked_at ?? null,
      nextCheckAt: binding?.next_check_at ?? null,
      ...overrides,
    };
  }

  function transitionRoomBinding(binding, overrides = {}) {
    return upsertRoomBinding(buildRoomBindingMutation(binding, overrides));
  }

  return { buildRoomBindingMutation, transitionRoomBinding };
}
