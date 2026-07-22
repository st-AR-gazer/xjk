import { withSqliteTransaction } from "../../../shared/sqliteRuntime.js";

function createMatchRepository({ db, helpers }) {
  const { jsonTryParse, nowMs } = helpers;

  function getMatchBinding(matchUid) {
    return db.prepare("SELECT * FROM bingo_match_bindings WHERE match_uid = ?").get(matchUid) || null;
  }

  function getLatestMatchBindingByJoinCode(joinCode) {
    return (
      db
        .prepare(
          `SELECT * FROM bingo_match_bindings
           WHERE join_code = ?
           ORDER BY updated_at DESC
           LIMIT 1`
        )
        .get(joinCode) || null
    );
  }

  function getMatchStateMirror(matchUid) {
    const row = db.prepare("SELECT * FROM bingo_match_state_mirror WHERE match_uid = ?").get(matchUid);
    return row ? jsonTryParse(row.state_json, null) : null;
  }

  function deleteMatchMirror(matchUid) {
    return withSqliteTransaction(db, () => {
      db.prepare("DELETE FROM bingo_match_state_mirror WHERE match_uid = ?").run(matchUid);
      db.prepare("DELETE FROM bingo_match_bindings WHERE match_uid = ?").run(matchUid);
    });
  }

  function matchStateHasBoard(matchState) {
    return Array.isArray(matchState?.cells) && matchState.cells.length > 0;
  }

  function upsertMatchBinding({ matchUid, joinCode, roomSummary, matchState }) {
    return withSqliteTransaction(db, () => {
      const existing = getMatchBinding(matchUid);
      const roomConfig = roomSummary?.config || {};
      const matchConfig = matchState?.config || roomSummary?.matchConfig || {};
      const phase = matchState ? Number(matchState.phase ?? 0) : null;
      const createdAt = Number(existing?.created_at || nowMs());
      db.prepare(
        `
        INSERT INTO bingo_match_bindings (
          match_uid, join_code, room_name, room_json, room_config_json, match_config_json,
          active, phase, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(match_uid) DO UPDATE SET
          join_code = excluded.join_code,
          room_name = excluded.room_name,
          room_json = excluded.room_json,
          room_config_json = excluded.room_config_json,
          match_config_json = excluded.match_config_json,
          active = excluded.active,
          phase = excluded.phase,
          updated_at = excluded.updated_at
      `
      ).run(
        matchUid,
        joinCode,
        roomSummary?.name || "",
        JSON.stringify(roomSummary || {}),
        JSON.stringify(roomConfig),
        JSON.stringify(matchConfig),
        1,
        phase,
        createdAt,
        nowMs()
      );
      if (matchState) {
        db.prepare(
          `
          INSERT INTO bingo_match_state_mirror (match_uid, state_json, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(match_uid) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
        `
        ).run(matchUid, JSON.stringify(matchState), nowMs());
      }
    });
  }

  return {
    getMatchBinding,
    deleteMatchMirror,
    getLatestMatchBindingByJoinCode,
    getMatchStateMirror,
    matchStateHasBoard,
    upsertMatchBinding,
  };
}

export { createMatchRepository };
