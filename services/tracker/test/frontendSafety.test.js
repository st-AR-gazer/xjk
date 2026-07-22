import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const runtimeRoot = path.join(repoRoot, "sites", "trackers.xjk.yt", "frontend", "__runtime");

async function readRuntimeFile(...segments) {
  return readFile(path.join(runtimeRoot, ...segments), "utf8");
}

test("shared tracker applications do not inject HTML strings", async () => {
  const applications = await Promise.all([
    readRuntimeFile("shared", "public-app.js"),
    readRuntimeFile("shared", "admin-app.js"),
    readRuntimeFile("shared", "admin-login-app.js"),
  ]);

  applications.forEach((source) => {
    assert.doesNotMatch(source, /\.innerHTML\s*=/);
    assert.doesNotMatch(source, /insertAdjacentHTML\s*\(/);
    assert.doesNotMatch(source, /\.outerHTML\s*=/);
  });
});

test("tracker modes contain only explicit shared-application entrypoints", async () => {
  const expectations = [
    ["wr", "wr"],
    ["leaderboard", "leaderboard"],
  ];

  for (const [directory, mode] of expectations) {
    const publicEntrypoint = await readRuntimeFile(directory, "app.js");
    const adminEntrypoint = await readRuntimeFile(directory, "admin.js");

    assert.match(publicEntrypoint, new RegExp(`mode: "${mode}"`));
    assert.match(publicEntrypoint, /tracker-shared\/public-app\.js/);
    assert.match(adminEntrypoint, new RegExp(`mode: "${mode}"`));
    assert.match(adminEntrypoint, /tracker-shared\/admin-app\.js/);
    assert.ok(publicEntrypoint.split(/\r?\n/).filter(Boolean).length <= 2);
    assert.ok(adminEntrypoint.split(/\r?\n/).filter(Boolean).length <= 2);
  }
});
