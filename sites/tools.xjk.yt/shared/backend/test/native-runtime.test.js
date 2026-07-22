import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createNativeToolBackend } from "../native-runtime.js";

function createFakeApp() {
  const calls = [];
  return {
    calls,
    disable: (...args) => calls.push(["disable", ...args]),
    set: (...args) => calls.push(["set", ...args]),
    use: (...args) => calls.push(["use", ...args]),
    get: (...args) => calls.push(["get", ...args]),
  };
}

test("native backend runtime composes config, HTTP policy, admission, upload budget, and process execution", () => {
  const app = createFakeApp();
  const express = () => app;
  express.json = (options) => ({ type: "json", options });
  express.static = (directory) => ({ type: "static", directory });
  const ratePolicies = [];

  const runtime = createNativeToolBackend({
    metaUrl: pathToFileURL(path.resolve("fixture", "backend", "server.js")).href,
    executableName: "Fixture.exe",
    express,
    helmet: (options) => ({ type: "helmet", options }),
    morgan: (format) => ({ type: "morgan", format }),
    rateLimit: (policy) => {
      ratePolicies.push(policy);
      return { type: "rate-limit", policy };
    },
    runtimeOptions: { env: {}, cwd: path.resolve("fixture", "backend") },
    frontendOptions: { jsonLimit: "1mb" },
  });

  assert.equal(runtime.config.maxActiveJobs, 4);
  assert.equal(runtime.config.maxUploadMb, 96);
  assert.equal(ratePolicies.length, 1);
  assert.ok(app.calls.some((call) => call[0] === "set" && call[1] === "trust proxy" && call[2] === 1));

  assert.equal(runtime.admit, runtime.capacity.admit);
  assert.equal(typeof runtime.enforceUploadBudget, "function");
  assert.equal(typeof runtime.execute, "function");
  assert.equal(typeof runtime.run, "function");
});
