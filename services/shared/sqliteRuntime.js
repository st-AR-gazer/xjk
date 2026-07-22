import { DatabaseSync } from "node:sqlite";
import { ensureParentDirectorySync } from "./fsUtils.js";

const MAX_BUSY_TIMEOUT_MS = 10 * 60 * 1000;

function normalizeBusyTimeout(value, fallback = 5000) {
  const parsed = Number(value);
  const timeout = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(0, Math.min(MAX_BUSY_TIMEOUT_MS, Math.floor(timeout)));
}

function configureSqliteDatabase(
  db,
  { busyTimeoutMs = 5000, foreignKeys = true, journalMode = "WAL", synchronous = "NORMAL" } = {}
) {
  if (journalMode) db.exec(`PRAGMA journal_mode = ${journalMode};`);
  if (foreignKeys !== null) db.exec(`PRAGMA foreign_keys = ${foreignKeys ? "ON" : "OFF"};`);
  if (synchronous) db.exec(`PRAGMA synchronous = ${synchronous};`);
  db.exec(`PRAGMA busy_timeout = ${normalizeBusyTimeout(busyTimeoutMs)};`);
  return db;
}

function openSqliteDatabase({
  filePath,
  createDatabase = (target) => new DatabaseSync(target),
  prepare,
  initialize,
  pragmas,
} = {}) {
  if (!filePath) throw new Error("A SQLite file path is required.");
  if (filePath !== ":memory:") ensureParentDirectorySync(filePath);

  const db = createDatabase(filePath);
  try {
    prepare?.(db);
    configureSqliteDatabase(db, pragmas);
    initialize?.(db);
    return db;
  } catch (error) {
    try {
      db.close();
    } catch {
      // Preserve the initialization error; close failures cannot make the database usable.
    }
    throw error;
  }
}

function withSqliteTransaction(db, operation, { mode = "IMMEDIATE" } = {}) {
  db.exec(`BEGIN ${mode};`);
  try {
    const result = operation();
    db.exec("COMMIT;");
    return result;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export { configureSqliteDatabase, normalizeBusyTimeout, openSqliteDatabase, withSqliteTransaction };
