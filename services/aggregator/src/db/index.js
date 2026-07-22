import { openSqliteDatabase } from "../../../shared/sqliteRuntime.js";
import { MIGRATIONS } from "./schema.js";

const DISPLAY_NAME_COLUMNS = [
  {
    tableName: "account_display_name_current",
    columnName: "normalized_display_name",
    definition: "TEXT",
  },
  {
    tableName: "account_display_name_history",
    columnName: "normalized_display_name",
    definition: "TEXT",
  },
];

function quoteIdentifier(value) {
  const identifier = String(value || "");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQLite identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function getTableColumns(db, tableName) {
  const rows = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)});`).all();
  if (!rows.length) throw new Error(`Cannot migrate missing table: ${tableName}`);
  return new Set(rows.map((row) => String(row.name || "")));
}

function addColumnIfMissing(db, { tableName, columnName, definition }) {
  if (getTableColumns(db, tableName).has(columnName)) return false;
  db.exec(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${definition};`);
  return true;
}

function applyMigrations(db) {
  for (const statement of MIGRATIONS) {
    db.exec(statement);
  }

  for (const column of DISPLAY_NAME_COLUMNS) addColumnIfMissing(db, column);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_account_display_name_current_normalized ON account_display_name_current(normalized_display_name);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_account_display_name_history_normalized ON account_display_name_history(normalized_display_name);"
  );
}

function createDatabase({ filePath }) {
  return openSqliteDatabase({ filePath, initialize: applyMigrations });
}

export { applyMigrations, createDatabase };
