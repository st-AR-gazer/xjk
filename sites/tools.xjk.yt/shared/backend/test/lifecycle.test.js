import assert from "node:assert/strict";
import test from "node:test";
import { createTempCleanup } from "../lifecycle.js";

test("createTempCleanup removes each resource once", async () => {
  const unlinked = [];
  const removed = [];
  const cleanup = createTempCleanup({
    files: ["one", null, "two"],
    directories: ["work"],
    unlink: async (filePath) => unlinked.push(filePath),
    removeDirectory: async (directory) => removed.push(directory),
  });

  await Promise.all([cleanup(), cleanup()]);
  await cleanup();

  assert.deepEqual(unlinked, ["one", "two"]);
  assert.deepEqual(removed, ["work"]);
});

test("createTempCleanup preserves retained resources", async () => {
  let calls = 0;
  const cleanup = createTempCleanup({
    keepFiles: true,
    files: ["input"],
    directories: ["output"],
    unlink: async () => {
      calls += 1;
    },
    removeDirectory: async () => {
      calls += 1;
    },
  });

  await cleanup();
  assert.equal(calls, 0);
});
