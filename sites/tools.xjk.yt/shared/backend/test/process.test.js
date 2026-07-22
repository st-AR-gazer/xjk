import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { runProcess } from "../process.js";

function fakeSpawn({ stdout = "", stderr = "", code = 0, close = true } = {}) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;

    if (close) {
      queueMicrotask(() => {
        if (stdout) child.stdout.emit("data", Buffer.from(stdout));
        if (stderr) child.stderr.emit("data", Buffer.from(stderr));
        child.emit("close", code);
      });
    }

    return child;
  };
}

test("runProcess captures stdout and stderr", async () => {
  const result = await runProcess({
    executable: process.execPath,
    timeoutMs: 5_000,
    spawnProcess: fakeSpawn({ stdout: "out", stderr: "err" }),
  });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "out");
  assert.equal(result.stderr, "err");
});

test("runProcess supports both exit-code contracts", async () => {
  const spawnProcess = fakeSpawn({ stderr: "failed", code: 7 });

  await assert.rejects(
    runProcess({ executable: process.execPath, timeoutMs: 5_000, label: "Fixture", spawnProcess }),
    /Fixture exited with code 7\nfailed/
  );

  const result = await runProcess({
    executable: process.execPath,
    timeoutMs: 5_000,
    rejectOnNonZero: false,
    spawnProcess,
  });
  assert.equal(result.code, 7);
  assert.equal(result.stderr, "failed");
});

test("runProcess reports missing paths and timeouts", async () => {
  await assert.rejects(
    runProcess({ executable: "", timeoutMs: 100, pathLabel: "FIXTURE_PATH" }),
    /FIXTURE_PATH is not set/
  );

  await assert.rejects(
    runProcess({
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 10_000)"],
      timeoutMs: 25,
      label: "Fixture",
      spawnProcess: fakeSpawn({ close: false }),
    }),
    /Fixture timed out after 25ms/
  );
});

test("runProcess kills tools whose combined output exceeds the configured budget", async () => {
  let killed = false;
  const spawnProcess = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {
      killed = true;
      return true;
    };
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from("1234"));
      child.stderr.emit("data", Buffer.from("56789"));
    });
    return child;
  };

  await assert.rejects(
    runProcess({
      executable: process.execPath,
      timeoutMs: 5_000,
      maxOutputBytes: 8,
      label: "Fixture",
      spawnProcess,
    }),
    /Fixture exceeded the 8-byte output limit/
  );
  assert.equal(killed, true);
});
