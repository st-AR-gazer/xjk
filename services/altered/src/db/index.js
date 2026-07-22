import { openSqliteDatabase } from "../../../shared/sqliteRuntime.js";
import { normalizeAccountId } from "../../../shared/valueUtils.js";
import { MIGRATIONS } from "./schema.js";

function applyMigrations(db) {
  for (const statement of MIGRATIONS) {
    db.exec(statement);
  }
}

function tableExists(db, tableName) {
  return Boolean(
    db
      .prepare(
        `
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
        LIMIT 1
        `
      )
      .get(String(tableName || "").trim())
  );
}

function getTableColumns(db, tableName) {
  if (!tableExists(db, tableName)) return new Set();
  return new Set(
    db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()
      .map((row) => String(row?.name || "").trim())
      .filter(Boolean)
  );
}

function ensureColumn(db, tableName, columnName, columnDefinition) {
  if (!tableExists(db, tableName)) return;
  const columns = getTableColumns(db, tableName);
  if (columns.has(columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition};`);
}

function seededRandomSortKey(seed, value) {
  const input = `${String(seed || "")
    .trim()
    .toLowerCase()}|${String(value || "")
    .trim()
    .toLowerCase()}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function registerDatabaseFunctions(db) {
  db.function("altered_seeded_random", { deterministic: true }, seededRandomSortKey);
}

function ensureCompatibilityColumns(db) {
  ensureColumn(db, "altered_campaigns", "external_campaign_id", "external_campaign_id INTEGER");
  ensureColumn(db, "altered_campaigns", "upload_bucket_id", "upload_bucket_id INTEGER");
  ensureColumn(db, "altered_campaigns", "activity_id", "activity_id INTEGER");
  ensureColumn(db, "altered_campaigns", "activity_type", "activity_type TEXT");
  ensureColumn(db, "altered_campaigns", "campaign_type", "campaign_type TEXT");
  ensureColumn(db, "altered_campaigns", "start_timestamp", "start_timestamp TEXT");
  ensureColumn(db, "altered_campaigns", "end_timestamp", "end_timestamp TEXT");
  ensureColumn(db, "altered_campaigns", "published", "published INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "altered_campaigns", "leaderboard_group_uid", "leaderboard_group_uid TEXT");
  ensureColumn(db, "altered_campaigns", "payload_json", "payload_json TEXT");
  ensureColumn(db, "altered_campaigns", "monitor_updated_at", "monitor_updated_at TEXT");

  ensureColumn(db, "altered_maps", "map_type", "map_type TEXT");
  ensureColumn(db, "altered_maps", "map_style", "map_style TEXT");
  ensureColumn(db, "altered_maps", "map_environment", "map_environment TEXT");
  ensureColumn(db, "altered_maps", "author_display_name", "author_display_name TEXT");
  ensureColumn(db, "altered_maps", "submitter_display_name", "submitter_display_name TEXT");
  ensureColumn(db, "altered_maps", "map_created_at", "map_created_at TEXT");
  ensureColumn(db, "altered_maps", "map_updated_at", "map_updated_at TEXT");
  ensureColumn(db, "altered_maps", "payload_json", "payload_json TEXT");
  ensureColumn(db, "altered_maps", "monitor_updated_at", "monitor_updated_at TEXT");

  ensureColumn(db, "altered_live_monitor_config", "schedule_mode", "schedule_mode TEXT NOT NULL DEFAULT 'interval'");
  ensureColumn(db, "altered_live_monitor_config", "daily_hour_utc", "daily_hour_utc INTEGER NOT NULL DEFAULT 3");
  ensureColumn(db, "altered_live_monitor_config", "daily_minute_utc", "daily_minute_utc INTEGER NOT NULL DEFAULT 0");
  ensureColumn(
    db,
    "altered_live_monitor_config",
    "tracker_chunk_size",
    "tracker_chunk_size INTEGER NOT NULL DEFAULT 350"
  );
  ensureColumn(db, "altered_live_monitor_config", "discovery_enabled", "discovery_enabled INTEGER NOT NULL DEFAULT 1");
  ensureColumn(
    db,
    "altered_live_monitor_config",
    "discovery_interval_seconds",
    "discovery_interval_seconds INTEGER NOT NULL DEFAULT 3600"
  );
  ensureColumn(
    db,
    "altered_live_monitor_config",
    "discovery_campaign_limit",
    "discovery_campaign_limit INTEGER NOT NULL DEFAULT 25"
  );
  ensureColumn(
    db,
    "altered_live_monitor_config",
    "discovery_activity_page_size",
    "discovery_activity_page_size INTEGER NOT NULL DEFAULT 100"
  );

  ensureColumn(db, "altered_maps", "player_count", "player_count INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "altered_maps", "player_count_updated_at", "player_count_updated_at TEXT");
  ensureColumn(db, "altered_wr_events", "account_id", "account_id TEXT");
  ensureColumn(db, "altered_map_local_file_fixes", "source_file_path", "source_file_path TEXT");
  ensureColumn(db, "altered_map_local_file_fixes", "note", "note TEXT");
  ensureColumn(db, "altered_map_local_file_fixes", "last_error", "last_error TEXT");
  ensureColumn(db, "altered_map_name_candidates", "map_numbers_json", "map_numbers_json TEXT");
  ensureColumn(db, "altered_map_name_candidates", "alteration_label", "alteration_label TEXT");
  ensureColumn(db, "altered_alterations", "slug", "slug TEXT");
  ensureColumn(db, "altered_similarity_weight_rules", "environment", "environment TEXT");
}

function ensureCompatibilityIndexes(db) {
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_altered_campaigns_external_id ON altered_campaigns(club_id, external_campaign_id);"
  );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_altered_campaigns_upload_bucket ON altered_campaigns(club_id, upload_bucket_id);"
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_altered_club_members_role ON altered_club_members(club_id, role, status);");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_altered_club_members_seen ON altered_club_members(club_id, last_seen_at DESC);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_altered_club_activities_occurred ON altered_club_activities(club_id, occurred_at DESC);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_altered_club_activities_type ON altered_club_activities(club_id, activity_type, item_type);"
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_altered_club_activities_map ON altered_club_activities(map_uid);");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_altered_upload_buckets_seen ON altered_upload_buckets(club_id, last_seen_at DESC);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_altered_upload_maps_bucket ON altered_upload_maps(club_id, bucket_id, slot);"
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_altered_upload_maps_map ON altered_upload_maps(map_uid);");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_altered_alterations_slug ON altered_alterations(slug);");
}

function backfillCompatibilityData(db) {
  const rows = db
    .prepare(
      `
      SELECT event_id AS eventId, holder
      FROM altered_wr_events
      WHERE account_id IS NULL OR TRIM(COALESCE(account_id, '')) = ''
      `
    )
    .all();
  if (!rows.length) return;

  const updateStmt = db.prepare("UPDATE altered_wr_events SET account_id = ? WHERE event_id = ?");
  for (const row of rows) {
    const accountId = normalizeAccountId(row?.holder);
    if (!accountId) continue;
    updateStmt.run(accountId, Number(row?.eventId || 0));
  }
}

function createDatabase({ filePath, busyTimeoutMs = 30000 } = {}) {
  return openSqliteDatabase({
    filePath,
    pragmas: { busyTimeoutMs },
    prepare: registerDatabaseFunctions,
    initialize(db) {
      // Legacy databases need compatibility columns before migrations create newer indexes.
      ensureCompatibilityColumns(db);
      applyMigrations(db);
      ensureCompatibilityColumns(db);
      ensureCompatibilityIndexes(db);
      backfillCompatibilityData(db);
    },
  });
}

export { createDatabase };
