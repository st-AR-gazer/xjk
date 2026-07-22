import { openSqliteDatabase, withSqliteTransaction } from "../../../shared/sqliteRuntime.js";

const COTD_SCHEMA_VERSION = 1;

function migrateCotdDatabase(db) {
  const currentVersion = Number(db.prepare("PRAGMA user_version").get()?.user_version || 0);
  if (currentVersion > COTD_SCHEMA_VERSION) {
    throw new Error(`COTD database schema ${currentVersion} is newer than supported version ${COTD_SCHEMA_VERSION}.`);
  }

  withSqliteTransaction(db, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cotd_days (
        id TEXT PRIMARY KEY,
        cotd_date TEXT NOT NULL,
        year INTEGER NULL,
        month INTEGER NULL,
        day INTEGER NULL,
        month_day INTEGER NULL,
        campaign_id INTEGER NULL,
        map_uid TEXT NOT NULL,
        season_uid TEXT NULL,
        leaderboard_group TEXT NULL,
        start_timestamp INTEGER NULL,
        end_timestamp INTEGER NULL,
        start_at TEXT NULL,
        end_at TEXT NULL,
        raw_json TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cotd_days_date ON cotd_days(cotd_date DESC);
      CREATE INDEX IF NOT EXISTS idx_cotd_days_map_uid ON cotd_days(map_uid);

      CREATE TABLE IF NOT EXISTS map_infos (
        map_uid TEXT PRIMARY KEY,
        map_id TEXT NULL,
        name TEXT NULL,
        filename TEXT NULL,
        author_account_id TEXT NULL,
        submitter_account_id TEXT NULL,
        author_score INTEGER NULL,
        bronze_score INTEGER NULL,
        silver_score INTEGER NULL,
        gold_score INTEGER NULL,
        collection_name TEXT NULL,
        map_style TEXT NULL,
        map_type TEXT NULL,
        is_playable INTEGER NULL,
        has_clones INTEGER NULL,
        created_with_gamepad_editor INTEGER NULL,
        created_with_simple_editor INTEGER NULL,
        thumbnail_url TEXT NULL,
        file_url TEXT NULL,
        timestamp TEXT NULL,
        raw_json TEXT NULL,
        fetched_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_map_infos_map_id ON map_infos(map_id);

      CREATE TABLE IF NOT EXISTS map_files (
        map_uid TEXT PRIMARY KEY,
        map_id TEXT NULL,
        file_url TEXT NULL,
        filename TEXT NULL,
        storage_path TEXT NULL,
        relative_path TEXT NULL,
        sha256 TEXT NULL,
        size_bytes INTEGER NULL,
        status TEXT NOT NULL,
        error TEXT NULL,
        downloaded_at TEXT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(map_uid) REFERENCES map_infos(map_uid)
      );

      CREATE INDEX IF NOT EXISTS idx_map_files_status ON map_files(status);

      CREATE TABLE IF NOT EXISTS style_snapshots (
        id TEXT PRIMARY KEY,
        cotd_date TEXT NOT NULL,
        map_uid TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_style_snapshots_date ON style_snapshots(cotd_date DESC);
      CREATE INDEX IF NOT EXISTS idx_style_snapshots_map_uid ON style_snapshots(map_uid);

      CREATE TABLE IF NOT EXISTS service_state (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      PRAGMA user_version = ${COTD_SCHEMA_VERSION};
    `);
  });
  return db;
}

function createCotdDatabase(filePath = ":memory:") {
  const normalizedPath = String(filePath || ":memory:");
  return openSqliteDatabase({
    filePath: normalizedPath,
    pragmas: { journalMode: normalizedPath === ":memory:" ? null : "WAL" },
    initialize: migrateCotdDatabase,
  });
}

export { COTD_SCHEMA_VERSION, createCotdDatabase, migrateCotdDatabase };
