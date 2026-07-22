import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { resolveTrackerSharedFrontendDir } from "../src/frontendPaths.js";

test("resolves the shared tracker frontend beside each mode directory", () => {
  const runtimeDirectory = path.resolve("sites", "trackers.xjk.yt", "frontend", "__runtime");

  assert.equal(
    resolveTrackerSharedFrontendDir(path.join(runtimeDirectory, "wr")),
    path.join(runtimeDirectory, "shared")
  );
  assert.equal(
    resolveTrackerSharedFrontendDir(path.join(runtimeDirectory, "leaderboard")),
    path.join(runtimeDirectory, "shared")
  );
});

test("normalizes mode directory traversal before selecting the shared sibling", () => {
  const runtimeDirectory = path.resolve("sites", "trackers.xjk.yt", "frontend", "__runtime");
  const traversingModeDirectory = path.join(runtimeDirectory, "wr", "nested", "..", "..");

  assert.equal(
    resolveTrackerSharedFrontendDir(path.join(traversingModeDirectory, "leaderboard")),
    path.join(runtimeDirectory, "shared")
  );
});
