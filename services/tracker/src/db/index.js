import { openSqliteDatabase } from "../../../shared/sqliteRuntime.js";
import { MIGRATIONS } from "./schema.js";

function applyMigrations(db) {
  for (const statement of MIGRATIONS) {
    db.exec(statement);
  }
}

function createDatabase({ filePath }) {
  return openSqliteDatabase({ filePath, initialize: applyMigrations });
}

export { createDatabase };
