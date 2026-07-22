import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  configureSqliteDatabase,
  normalizeBusyTimeout,
  openSqliteDatabase,
  withSqliteTransaction,
} from "../sqliteRuntime.js";

function createRecordingDatabase() {
  return {
    closed: false,
    statements: [],
    close() {
      this.closed = true;
    },
    exec(statement) {
      this.statements.push(statement);
    },
  };
}

test("SQLite runtime applies one bounded pragma policy", () => {
  const db = createRecordingDatabase();
  configureSqliteDatabase(db, { busyTimeoutMs: Number.POSITIVE_INFINITY });

  assert.deepEqual(db.statements, [
    "PRAGMA journal_mode = WAL;",
    "PRAGMA foreign_keys = ON;",
    "PRAGMA synchronous = NORMAL;",
    "PRAGMA busy_timeout = 5000;",
  ]);
  assert.equal(normalizeBusyTimeout(999_999_999), 600_000);
  assert.equal(normalizeBusyTimeout(-5), 0);
});

test("SQLite runtime closes a partially initialized database", () => {
  const db = createRecordingDatabase();
  assert.throws(
    () =>
      openSqliteDatabase({
        filePath: "fixture.sqlite",
        createDatabase: () => db,
        initialize() {
          throw new Error("migration failed");
        },
      }),
    /migration failed/
  );
  assert.equal(db.closed, true);
});

test("SQLite runtime owns parent-directory creation for every file-backed store", (context) => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xjk-sqlite-runtime-"));
  context.after(() => fs.rmSync(runtimeRoot, { recursive: true, force: true }));
  const filePath = path.join(runtimeRoot, "nested", "service.sqlite");
  const db = createRecordingDatabase();

  assert.equal(openSqliteDatabase({ filePath, createDatabase: () => db }), db);
  assert.equal(fs.statSync(path.dirname(filePath)).isDirectory(), true);
});

test("SQLite transaction helper commits results and rolls failures back", () => {
  const committed = createRecordingDatabase();
  assert.equal(
    withSqliteTransaction(committed, () => 42),
    42
  );
  assert.deepEqual(committed.statements, ["BEGIN IMMEDIATE;", "COMMIT;"]);

  const rolledBack = createRecordingDatabase();
  assert.throws(
    () =>
      withSqliteTransaction(rolledBack, () => {
        throw new Error("write failed");
      }),
    /write failed/
  );
  assert.deepEqual(rolledBack.statements, ["BEGIN IMMEDIATE;", "ROLLBACK;"]);
});
