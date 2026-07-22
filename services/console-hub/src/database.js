import fsp from "node:fs/promises";
import { openSqliteDatabase } from "../../shared/sqliteRuntime.js";

function initializeConsoleHubDatabase(db, { now }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bingo_users (
      account_id TEXT PRIMARY KEY,
      subject TEXT,
      display_name TEXT NOT NULL,
      is_operator INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bingo_oauth_sessions (
      session_token TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      subject TEXT,
      display_name TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_type TEXT,
      id_token TEXT,
      scope TEXT,
      oauth_expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      is_operator INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS bingo_player_bindings (
      binding_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      match_uid TEXT NOT NULL,
      join_code TEXT NOT NULL,
      team_id INTEGER,
      requires_team_choice INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(account_id, match_uid)
    );
    CREATE TABLE IF NOT EXISTS bingo_match_bindings (
      match_uid TEXT PRIMARY KEY,
      join_code TEXT NOT NULL,
      room_name TEXT,
      room_json TEXT,
      room_config_json TEXT,
      match_config_json TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      phase INTEGER,
      created_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bingo_match_state_mirror (
      match_uid TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bingo_room_bindings (
      binding_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      match_uid TEXT NOT NULL,
      join_code TEXT NOT NULL,
      match_slug TEXT NOT NULL,
      player_slug TEXT NOT NULL,
      root_folder_activity_id INTEGER,
      match_folder_activity_id INTEGER,
      player_folder_activity_id INTEGER,
      room_activity_id INTEGER,
      room_server_id INTEGER,
      room_name TEXT,
      selected_cell_id INTEGER,
      selected_map_uid TEXT,
      selected_map_id TEXT,
      selected_map_name TEXT,
      selected_map_json TEXT,
      target_medal INTEGER,
      status TEXT,
      path_json TEXT,
      last_claim_record_id TEXT,
      last_verified_time INTEGER,
      last_verified_medal INTEGER,
      last_checked_at INTEGER,
      next_check_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(account_id, match_uid)
    );
    CREATE TABLE IF NOT EXISTS bingo_claim_checks (
      check_id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      match_uid TEXT NOT NULL,
      cell_id INTEGER,
      map_uid TEXT,
      map_id TEXT,
      verified_time INTEGER,
      verified_medal INTEGER,
      record_id TEXT,
      status TEXT NOT NULL,
      detail TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bingo_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  function ensureDbColumn(tableName, columnName, columnSql) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (columns.some((column) => String(column?.name || "") === columnName)) return;
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
  }

  ensureDbColumn("bingo_match_bindings", "created_at", "created_at INTEGER");
  db.prepare(
    "UPDATE bingo_match_bindings SET created_at = COALESCE(created_at, updated_at, ?) WHERE created_at IS NULL"
  ).run(now());

  return db;
}

export async function openConsoleHubDatabase({ dbFile, dataDir, now = Date.now } = {}) {
  if (!dbFile) throw new Error("Console Hub database file is required.");
  if (dataDir) await fsp.mkdir(dataDir, { recursive: true });
  return openSqliteDatabase({
    filePath: dbFile,
    initialize: (db) => initializeConsoleHubDatabase(db, { now }),
  });
}
