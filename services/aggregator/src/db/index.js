import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "./schema.js";

function applyMigrations(db) {
  for (const statement of MIGRATIONS) {
    db.exec(statement);
  }

  try {
    db.exec("ALTER TABLE account_display_name_current ADD COLUMN normalized_display_name TEXT;");
  } catch (err) {}
  try {
    db.exec("ALTER TABLE account_display_name_history ADD COLUMN normalized_display_name TEXT;");
  } catch (err) {}
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_account_display_name_current_normalized ON account_display_name_current(normalized_display_name);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_account_display_name_history_normalized ON account_display_name_history(normalized_display_name);");
  } catch (err) {}
}

function createDatabase({ filePath }) {
  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  applyMigrations(db);
  return db;
}

export { createDatabase };

