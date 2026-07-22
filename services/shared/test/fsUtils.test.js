import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { readJsonFile, readJsonFileSync, safeUnlinkSync, writeJsonFile, writeJsonFileSync } from "../fsUtils.js";

test("shared JSON file helpers create parents and return explicit fallbacks", async (context) => {
  const directory = path.join(import.meta.dirname, `.fs-utils-${process.pid}-${Date.now()}`);
  context.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  const filePath = path.join(directory, "nested", "state.json");

  assert.deepEqual(await readJsonFile(filePath, { missing: true }), { missing: true });
  await writeJsonFile(filePath, { ready: true, count: 2 });
  assert.deepEqual(await readJsonFile(filePath), { ready: true, count: 2 });
  assert.equal(fs.readFileSync(filePath, "utf8"), '{\n  "ready": true,\n  "count": 2\n}');
});

test("shared JSON writer rejects an empty destination", async () => {
  await assert.rejects(writeJsonFile("", { ignored: true }), /output path is required/i);
});

test("shared synchronous JSON helpers preserve fallbacks and create parents", (context) => {
  const directory = path.join(import.meta.dirname, `.fs-json-sync-${process.pid}-${Date.now()}`);
  const filePath = path.join(directory, "nested", "state.json");
  context.after(() => fs.rmSync(directory, { force: true, recursive: true }));

  assert.deepEqual(readJsonFileSync(filePath, { missing: true }), { missing: true });
  assert.equal(writeJsonFileSync(filePath, { ready: true }), true);
  assert.deepEqual(readJsonFileSync(filePath), { ready: true });
  assert.equal(writeJsonFileSync("", { ignored: true }), false);
});

test("shared synchronous cleanup is idempotent and reports whether a file was removed", (context) => {
  const directory = path.join(import.meta.dirname, `.fs-unlink-${process.pid}-${Date.now()}`);
  const filePath = path.join(directory, "temporary.txt");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(filePath, "temporary", "utf8");
  context.after(() => fs.rmSync(directory, { force: true, recursive: true }));

  assert.equal(safeUnlinkSync(filePath), true);
  assert.equal(safeUnlinkSync(filePath), false);
  assert.equal(safeUnlinkSync(""), false);
});
