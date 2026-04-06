import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "./schema.js";

function applyMigrations(db) {
  for (const statement of MIGRATIONS) {
    db.exec(statement);
  }
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
