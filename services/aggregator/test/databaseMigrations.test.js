import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { applyMigrations, createDatabase } from "../src/db/index.js";

function tableColumns(db, tableName) {
  return db
    .prepare(`PRAGMA table_info("${tableName}");`)
    .all()
    .map((row) => row.name);
}

function createLegacyDisplayNameTables(db) {
  db.exec(`
    CREATE TABLE accounts (
      account_id TEXT PRIMARY KEY,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE TABLE account_display_name_current (
      account_id TEXT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      source TEXT,
      observed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE account_display_name_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      source TEXT,
      valid_from TEXT NOT NULL,
      valid_to TEXT,
      observed_at TEXT NOT NULL
    );
  `);
}

test("fresh aggregator databases include the current display-name schema", (t) => {
  const db = createDatabase({ filePath: ":memory:" });
  t.after(() => db.close());

  assert.ok(tableColumns(db, "account_display_name_current").includes("normalized_display_name"));
  assert.ok(tableColumns(db, "account_display_name_history").includes("normalized_display_name"));
  const indexes = new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index';")
      .all()
      .map((row) => row.name)
  );
  assert.ok(indexes.has("idx_account_display_name_current_normalized"));
  assert.ok(indexes.has("idx_account_display_name_history_normalized"));
});

test("legacy and already-migrated aggregator databases converge idempotently", (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  createLegacyDisplayNameTables(db);

  applyMigrations(db);
  assert.ok(tableColumns(db, "account_display_name_current").includes("normalized_display_name"));
  assert.ok(tableColumns(db, "account_display_name_history").includes("normalized_display_name"));
  assert.doesNotThrow(() => applyMigrations(db));
});

test("migration ALTER and index failures are propagated", (t) => {
  const legacyDb = new DatabaseSync(":memory:");
  const currentDb = createDatabase({ filePath: ":memory:" });
  t.after(() => legacyDb.close());
  t.after(() => currentDb.close());
  createLegacyDisplayNameTables(legacyDb);

  const alterFailure = new Error("database is locked while adding a column");
  const alterFailingDb = {
    exec(statement) {
      if (/^ALTER TABLE/i.test(String(statement).trim())) throw alterFailure;
      return legacyDb.exec(statement);
    },
    prepare: legacyDb.prepare.bind(legacyDb),
  };
  assert.throws(
    () => applyMigrations(alterFailingDb),
    (error) => error === alterFailure
  );

  const indexFailure = new Error("not authorized to create an index");
  const indexFailingDb = {
    exec(statement) {
      if (String(statement).includes("idx_account_display_name_current_normalized")) {
        throw indexFailure;
      }
      return currentDb.exec(statement);
    },
    prepare: currentDb.prepare.bind(currentDb),
  };
  assert.throws(
    () => applyMigrations(indexFailingDb),
    (error) => error === indexFailure
  );

  assert.throws(
    () =>
      applyMigrations({
        exec() {},
        prepare() {
          return { all: () => [] };
        },
      }),
    /Cannot migrate missing table: account_display_name_current/
  );
});
