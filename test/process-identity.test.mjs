import assert from "node:assert/strict";
import test from "node:test";

import {
  buildManagedProcessIdentity,
  managedProcessIdentityMatches,
  readProcessIdentity,
} from "../services/shared/processIdentity.js";

const expected = buildManagedProcessIdentity({
  pid: 4242,
  executable: "C:\\Program Files\\nodejs\\node.exe",
  commandLine: '"C:\\Program Files\\nodejs\\node.exe" "C:\\xjk\\worker.mjs" --run-id similarity-1 --run-nonce nonce-1',
  createdAt: "2026-07-20T01:00:00.0000000Z",
  entrypoint: "C:\\xjk\\worker.mjs",
  runId: "similarity-1",
  runNonce: "nonce-1",
});

test("managed process identity requires executable, creation time, entrypoint, run id, and nonce", () => {
  assert.ok(expected);
  assert.equal(
    managedProcessIdentityMatches(
      {
        pid: 4242,
        executable: "C:\\Program Files\\nodejs\\node.exe",
        commandLine:
          '"C:\\Program Files\\nodejs\\node.exe" "C:\\xjk\\worker.mjs" --run-id similarity-1 --run-nonce nonce-1',
        createdAt: "2026-07-20T01:00:00.0000000Z",
      },
      expected,
      { platform: "win32" }
    ),
    true
  );

  for (const mismatch of [
    { pid: 9999 },
    { executable: "C:\\Windows\\System32\\notepad.exe" },
    { createdAt: "2026-07-20T01:05:00.0000000Z" },
    { commandLine: "" },
    { commandLine: '"C:\\Program Files\\nodejs\\node.exe" unrelated.mjs --run-nonce nonce-1' },
    {
      commandLine:
        '"C:\\Program Files\\nodejs\\node.exe" "C:\\xjk\\worker.mjs" --run-id similarity-1 --run-nonce reused-nonce',
    },
  ]) {
    const actual = {
      pid: 4242,
      executable: "C:\\Program Files\\nodejs\\node.exe",
      commandLine:
        '"C:\\Program Files\\nodejs\\node.exe" "C:\\xjk\\worker.mjs" --run-id similarity-1 --run-nonce nonce-1',
      createdAt: "2026-07-20T01:00:00.0000000Z",
      ...mismatch,
    };
    assert.equal(managedProcessIdentityMatches(actual, expected, { platform: "win32" }), false);
  }
});

test("incomplete managed identities fail closed", () => {
  assert.equal(buildManagedProcessIdentity({ pid: 1, executable: "node" }), null);
  assert.equal(
    buildManagedProcessIdentity({
      pid: 1,
      executable: "node",
      commandLine: "",
      createdAt: "2026-07-20T01:00:00.0000000Z",
      entrypoint: "worker.mjs",
      runId: "run-1",
      runNonce: "nonce-1",
    }),
    null
  );
  assert.equal(managedProcessIdentityMatches(null, expected), false);
  assert.equal(managedProcessIdentityMatches(expected, null), false);
});

test("Windows process identity parses the complete PowerShell contract", () => {
  let invocation = null;
  const identity = readProcessIdentity(4242, {
    platform: "win32",
    spawn: (executable, args, options) => {
      invocation = { executable, args, options };
      return {
        status: 0,
        stdout: JSON.stringify({
          pid: 4242,
          executable: "C:\\Program Files\\nodejs\\node.exe",
          commandLine: '"C:\\Program Files\\nodejs\\node.exe" worker.mjs --run-id run-1 --run-nonce nonce-1',
          createdAt: "2026-07-20T01:00:00.0000000Z",
        }),
      };
    },
  });

  assert.equal(invocation.executable, "powershell.exe");
  assert.deepEqual(invocation.args.slice(0, 3), ["-NoProfile", "-NonInteractive", "-Command"]);
  assert.equal(invocation.options.windowsHide, true);
  assert.deepEqual(identity, {
    pid: 4242,
    executable: "C:\\Program Files\\nodejs\\node.exe",
    commandLine: '"C:\\Program Files\\nodejs\\node.exe" worker.mjs --run-id run-1 --run-nonce nonce-1',
    createdAt: "2026-07-20T01:00:00.0000000Z",
  });
});

test(
  "Windows CI reads a complete identity for the current process",
  { skip: process.platform !== "win32" || !process.env.CI },
  () => {
    const identity = readProcessIdentity(process.pid);
    assert.ok(identity);
    assert.equal(identity.pid, process.pid);
    assert.ok(identity.executable);
    assert.ok(identity.commandLine);
    assert.ok(identity.createdAt);
  }
);
