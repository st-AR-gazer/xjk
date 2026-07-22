export function createRoomVerificationService({
  config,
  db,
  helpers,
  nadeo,
  playerConnectionState,
  repository,
  roomBindingState,
} = {}) {
  const { jsonTryParse, nowMs } = helpers;
  const { getMapRecordByAccount } = nadeo;
  const { playerConnections, publishPlayerSnapshot } = playerConnectionState;
  const { getRoomBinding, insertClaimCheck } = repository;
  const { transitionRoomBinding } = roomBindingState;

  function deriveMedalFromTime(mapJson, timeMs) {
    const map = mapJson || {};
    if (!Number.isFinite(Number(timeMs)) || Number(timeMs) < 0) return 5;
    const time = Number(timeMs);
    if (Number.isFinite(Number(map.author_time)) && time <= Number(map.author_time)) return 1;
    if (Number.isFinite(Number(map.gold_time)) && time <= Number(map.gold_time)) return 2;
    if (Number.isFinite(Number(map.silver_time)) && time <= Number(map.silver_time)) return 3;
    if (Number.isFinite(Number(map.bronze_time)) && time <= Number(map.bronze_time)) return 4;
    return 5;
  }

  async function verifySelectedMap({ accountId, matchUid, immediate = false }) {
    const connection = [...playerConnections.values()].find(
      (entry) => entry.accountId === accountId && entry.matchUid === matchUid
    );
    if (!connection?.client || !connection.matchState) {
      throw new Error("The player is not connected to a live Bingo match.");
    }
    let binding = getRoomBinding(accountId, matchUid);
    if (!binding?.selected_map_uid || !binding?.selected_map_id) {
      throw new Error("Select a tile before requesting verification.");
    }
    const mapJson = jsonTryParse(binding.selected_map_json, {});
    const startedAt = nowMs();
    const retryUntil = immediate ? startedAt + config.verifyRetrySeconds * 1000 : startedAt;
    binding = transitionRoomBinding(binding, {
      accountId,
      matchUid,
      selectedMapJson: mapJson,
      status: "verifying",
      lastCheckedAt: nowMs(),
      nextCheckAt: nowMs() + config.verifyIntervalSeconds * 1000,
    });
    publishPlayerSnapshot(accountId, matchUid);

    while (true) {
      const latestBinding = getRoomBinding(accountId, matchUid);
      if (!latestBinding) throw new Error("The room binding disappeared during verification.");
      const latestMapJson = jsonTryParse(latestBinding.selected_map_json, {});
      const record = await getMapRecordByAccount({
        accountId,
        mapId: latestBinding.selected_map_id,
        hasClones: Boolean(latestMapJson?.hasClones),
        mapType: latestMapJson?.mapType || "",
      });
      const recordTime = Number(record?.recordScore?.time ?? -1);
      const recordId = String(record?.mapRecordId || "").trim();
      const currentCell = (Array.isArray(connection.matchState?.cells) ? connection.matchState.cells : []).find(
        (entry) => Number(entry?.cell_id) === Number(latestBinding.selected_cell_id)
      );
      const currentMapUid = String(currentCell?.map?.uid || "").trim();
      if (latestBinding.selected_map_uid !== currentMapUid) {
        const movedBinding = transitionRoomBinding(latestBinding, {
          accountId,
          matchUid,
          selectedMapJson: latestMapJson,
          status: "failed",
          lastCheckedAt: nowMs(),
          nextCheckAt: nowMs() + config.verifyIntervalSeconds * 1000,
        });
        insertClaimCheck({
          accountId,
          matchUid,
          cellId: latestBinding.selected_cell_id,
          mapUid: latestBinding.selected_map_uid,
          mapId: latestBinding.selected_map_id,
          status: "failed",
          detail: "The selected Bingo tile changed before verification completed.",
        });
        publishPlayerSnapshot(accountId, matchUid);
        return movedBinding;
      }
      if (record && Number.isFinite(recordTime) && recordTime >= 0 && recordTime !== 4294967295) {
        if (
          recordId &&
          String(latestBinding.last_claim_record_id || "") === recordId &&
          Number(latestBinding.last_verified_time || -1) === recordTime
        ) {
          const unchanged = transitionRoomBinding(latestBinding, {
            accountId,
            matchUid,
            selectedMapJson: latestMapJson,
            status: "unchanged",
            lastCheckedAt: nowMs(),
            nextCheckAt: nowMs() + config.verifyIntervalSeconds * 1000,
          });
          insertClaimCheck({
            accountId,
            matchUid,
            cellId: latestBinding.selected_cell_id,
            mapUid: latestBinding.selected_map_uid,
            mapId: latestBinding.selected_map_id,
            verifiedTime: recordTime,
            verifiedMedal: latestBinding.last_verified_medal,
            recordId,
            status: "unchanged",
            detail: "No new verified improvement was found.",
          });
          publishPlayerSnapshot(accountId, matchUid);
          return unchanged;
        }
        const medal = deriveMedalFromTime(latestMapJson, recordTime);
        await connection.client.request("SubmitRun", {
          tile_index: Number(latestBinding.selected_cell_id),
          time: recordTime,
          medal,
          splits: [],
        });
        const submitted = transitionRoomBinding(latestBinding, {
          accountId,
          matchUid,
          selectedMapJson: latestMapJson,
          status: "submitted",
          lastClaimRecordId: recordId || latestBinding.last_claim_record_id || null,
          lastVerifiedTime: recordTime,
          lastVerifiedMedal: medal,
          lastCheckedAt: nowMs(),
          nextCheckAt: nowMs() + config.verifyIntervalSeconds * 1000,
        });
        insertClaimCheck({
          accountId,
          matchUid,
          cellId: latestBinding.selected_cell_id,
          mapUid: latestBinding.selected_map_uid,
          mapId: latestBinding.selected_map_id,
          verifiedTime: recordTime,
          verifiedMedal: medal,
          recordId,
          status: "submitted",
          detail: "A verified improvement was submitted to Bingo.",
        });
        publishPlayerSnapshot(accountId, matchUid);
        return submitted;
      }
      if (nowMs() >= retryUntil) {
        const failed = transitionRoomBinding(latestBinding, {
          accountId,
          matchUid,
          selectedMapJson: latestMapJson,
          status: "failed",
          lastCheckedAt: nowMs(),
          nextCheckAt: nowMs() + config.verifyIntervalSeconds * 1000,
        });
        insertClaimCheck({
          accountId,
          matchUid,
          cellId: latestBinding.selected_cell_id,
          mapUid: latestBinding.selected_map_uid,
          mapId: latestBinding.selected_map_id,
          status: "failed",
          detail: "The bridge could not verify a new record during the retry window.",
        });
        publishPlayerSnapshot(accountId, matchUid);
        return failed;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  async function runBackgroundVerificationSweep() {
    const dueRows = db
      .prepare(
        `
        SELECT * FROM bingo_room_bindings
        WHERE selected_map_uid IS NOT NULL
          AND next_check_at IS NOT NULL
          AND next_check_at <= ?
      `
      )
      .all(nowMs());
    for (const row of dueRows) {
      try {
        await verifySelectedMap({
          accountId: row.account_id,
          matchUid: row.match_uid,
          immediate: false,
        });
      } catch (error) {
        insertClaimCheck({
          accountId: row.account_id,
          matchUid: row.match_uid,
          cellId: row.selected_cell_id,
          mapUid: row.selected_map_uid,
          mapId: row.selected_map_id,
          status: "failed",
          detail: error?.message || String(error),
        });
      }
    }
  }

  return { deriveMedalFromTime, verifySelectedMap, runBackgroundVerificationSweep };
}
