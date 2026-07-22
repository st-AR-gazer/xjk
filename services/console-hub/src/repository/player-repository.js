function createPlayerRepository({ db, helpers }) {
  const { nowMs } = helpers;

  function getPlayerBinding(accountId, matchUid) {
    return (
      db
        .prepare("SELECT * FROM bingo_player_bindings WHERE account_id = ? AND match_uid = ?")
        .get(accountId, matchUid) || null
    );
  }

  function getPlayerBindingByJoinCode(accountId, joinCode) {
    return (
      db
        .prepare(
          `SELECT * FROM bingo_player_bindings
           WHERE account_id = ? AND join_code = ?
           ORDER BY updated_at DESC
           LIMIT 1`
        )
        .get(accountId, joinCode) || null
    );
  }

  function getPlayerBindingsForAccount(accountId) {
    return db.prepare("SELECT * FROM bingo_player_bindings WHERE account_id = ?").all(accountId);
  }

  function deletePlayerBinding(accountId, matchUid) {
    db.prepare("DELETE FROM bingo_player_bindings WHERE account_id = ? AND match_uid = ?").run(accountId, matchUid);
  }

  function deletePlayerBindingByJoinCode(accountId, joinCode) {
    db.prepare("DELETE FROM bingo_player_bindings WHERE account_id = ? AND join_code = ?").run(accountId, joinCode);
  }

  function deletePlayerBindingById(bindingId) {
    db.prepare("DELETE FROM bingo_player_bindings WHERE binding_id = ?").run(bindingId);
  }

  function playerBindingRequiresTeamChoice(playerBinding) {
    if (!playerBinding?.requires_team_choice) return false;
    return playerBinding.team_id === null || playerBinding.team_id === undefined;
  }

  function upsertPlayerBinding({
    accountId,
    matchUid,
    joinCode,
    teamId = null,
    requiresTeamChoice = false,
    lastError = "",
  }) {
    const existing = getPlayerBinding(accountId, matchUid);
    const bindingId = existing?.binding_id || `${accountId}:${matchUid}`;
    const createdAt = Number(existing?.created_at || nowMs());
    db.prepare(
      `
      INSERT INTO bingo_player_bindings (
        binding_id, account_id, match_uid, join_code, team_id, requires_team_choice, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(binding_id) DO UPDATE SET
        join_code = excluded.join_code,
        team_id = excluded.team_id,
        requires_team_choice = excluded.requires_team_choice,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at
    `
    ).run(
      bindingId,
      accountId,
      matchUid,
      joinCode,
      teamId,
      requiresTeamChoice ? 1 : 0,
      lastError || "",
      createdAt,
      nowMs()
    );
    return getPlayerBinding(accountId, matchUid);
  }

  return {
    getPlayerBinding,
    getPlayerBindingByJoinCode,
    getPlayerBindingsForAccount,
    deletePlayerBinding,
    deletePlayerBindingByJoinCode,
    deletePlayerBindingById,
    playerBindingRequiresTeamChoice,
    upsertPlayerBinding,
  };
}

export { createPlayerRepository };
