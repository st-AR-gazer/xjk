import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  hasFlag,
  normalizeProjectKey,
  readArgument,
  repoRoot,
  resolveDatabasePath,
} from "../deploy/server/backfill-runtime.mjs";

test("deployment backfills share one deterministic CLI contract", () => {
  const argv = ["node", "backfill.mjs", "--dry-run", "--project-key=Main Tracker"];
  assert.equal(hasFlag("dry-run", argv), true);
  assert.equal(readArgument("project-key", "fallback", argv), "Main Tracker");
  assert.equal(readArgument("missing", "fallback", argv), "fallback");
  assert.equal(normalizeProjectKey(" Main Tracker ", "fallback"), "main-tracker");
  assert.equal(normalizeProjectKey("***", "fallback"), "fallback");
});

test("deployment backfills resolve paths from arguments, environment, then the repository", () => {
  const fromArgument = resolveDatabasePath({
    argumentName: "source-db",
    environmentName: "XJK_SOURCE_DB",
    fileName: "source.sqlite",
    argv: ["node", "backfill.mjs", `--source-db=${path.join(repoRoot, "argument.sqlite")}`],
    env: { XJK_SOURCE_DB: path.join(repoRoot, "environment.sqlite") },
  });
  assert.equal(fromArgument, path.join(repoRoot, "argument.sqlite"));

  const fromEnvironment = resolveDatabasePath({
    argumentName: "source-db",
    environmentName: "XJK_SOURCE_DB",
    fileName: "source.sqlite",
    argv: [],
    env: { XJK_SOURCE_DB: path.join(repoRoot, "environment.sqlite") },
  });
  assert.equal(fromEnvironment, path.join(repoRoot, "environment.sqlite"));

  const fromDataRoot = resolveDatabasePath({
    argumentName: "source-db",
    environmentName: "XJK_SOURCE_DB",
    fileName: "source.sqlite",
    argv: [],
    env: { XJK_ALTERED_DATA_ROOT: path.join(repoRoot, "runtime-data") },
  });
  assert.equal(fromDataRoot, path.join(repoRoot, "runtime-data", "source.sqlite"));

  const repositoryDefault = resolveDatabasePath({
    argumentName: "source-db",
    environmentName: "XJK_SOURCE_DB",
    fileName: "source.sqlite",
    argv: [],
    env: {},
  });
  assert.equal(repositoryDefault, path.join(repoRoot, "sites", "altered.xjk.yt", "data", "source.sqlite"));
});
