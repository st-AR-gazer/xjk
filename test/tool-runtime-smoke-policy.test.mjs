import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = path.join(repoRoot, "deploy", "tool-runtime");

test("normal tool-runtime restores require complete native smoke coverage", async () => {
  const restoreSource = await readFile(path.join(runtimeRoot, "restore-tool-runtime.ps1"), "utf8");
  const smokeInvocation = restoreSource.match(
    /if \(-not \$WhatIfPreference -and -not \$SkipSmokeTests\) \{(?<body>[\s\S]*?)\n  \}/
  );

  assert.ok(smokeInvocation, "restore must retain an explicit post-install smoke boundary");
  assert.match(smokeInvocation.groups.body, /smoke-native-tools\.ps1/);
  assert.match(smokeInvocation.groups.body, /-Strict/);
  assert.ok(
    restoreSource.indexOf("smoke-native-tools.ps1") < restoreSource.indexOf("is ready."),
    "restore must not report ready before strict smoke verification"
  );
});

test(
  "strict native smoke rejects a zero-fixture run instead of reporting skips as success",
  { skip: process.platform !== "win32" },
  (context) => {
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(runtimeRoot, "smoke-native-tools.ps1"),
        "-RepoPath",
        repoRoot,
        "-Strict",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          XJK_TOOL_SMOKE_GHOST_PATH: "",
          XJK_TOOL_SMOKE_MAP_PATH: "",
          XJK_TOOL_SMOKE_REPLAY_PATH: "",
          XJK_TOOL_SMOKE_UNDERWATER_MAP_PATH: "",
        },
        timeout: 30_000,
      }
    );
    if (result.error?.code === "EPERM") {
      context.skip("the current sandbox does not permit child PowerShell processes");
      return;
    }
    assert.ifError(result.error);
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;

    assert.notEqual(result.status, 0, output);
    assert.match(output, /cannot run: (?:runtime is not installed|required explicit fixture path is not configured)/);
    assert.doesNotMatch(output, /Native runtime smoke complete: 0 passed, 8 skipped/);
    assert.doesNotMatch(output, /Tool runtime .* is ready/);
  }
);

test("tool-runtime documentation matches the finalized release manifest", async () => {
  const [manifestSource, readme] = await Promise.all([
    readFile(path.join(runtimeRoot, "manifest.json"), "utf8"),
    readFile(path.join(runtimeRoot, "README.md"), "utf8"),
  ]);

  assert.doesNotMatch(manifestSource, /PENDING_/);
  assert.doesNotMatch(readme, /manifest is intentionally blocked|Replace each pending source/i);
  assert.match(readme, /manifest is finalized/i);
  assert.match(readme, /all eight checks execute successfully/i);
});
