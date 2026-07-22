import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  configureFrontendToolApp,
  createRateLimiter,
  createUnexpectedErrorHandler,
  createUploadErrorHandler,
  installApiRateLimit,
  isMainModule,
  startToolServer,
  startToolServerIfMain,
} from "../http.js";

function createFakeApp() {
  const calls = [];
  const listener = { close() {} };
  const app = {
    disable: (...args) => calls.push(["disable", ...args]),
    set: (...args) => calls.push(["set", ...args]),
    use: (...args) => calls.push(["use", ...args]),
    get: (...args) => calls.push(["get", ...args]),
    listen: (port, host, callback) => {
      calls.push(["listen", port, host]);
      callback();
      return listener;
    },
  };
  return { app, calls, listener };
}

function createJsonResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test("configureFrontendToolApp installs the shared frontend shell in order", () => {
  const { app, calls } = createFakeApp();
  const express = {
    json: (options) => ({ middleware: "json", options }),
    static: (directory) => ({ middleware: "static", directory }),
  };

  configureFrontendToolApp({
    app,
    express,
    helmet: (options) => ({ middleware: "helmet", options }),
    morgan: (format) => ({ middleware: "morgan", format }),
    frontendDir: "frontend",
    jsonLimit: "2mb",
    trustProxy: 1,
  });

  assert.deepEqual(
    calls.map(([method, value]) => [method, value?.middleware || value]),
    [
      ["disable", "x-powered-by"],
      ["set", "trust proxy"],
      ["use", "helmet"],
      ["use", "morgan"],
      ["use", "json"],
      ["use", "static"],
      ["get", "/"],
      ["get", "/health"],
    ]
  );
});

test("rate limit helpers preserve the common policy", () => {
  const policies = [];
  const rateLimit = (policy) => {
    policies.push(policy);
    return { policy };
  };

  assert.deepEqual(createRateLimiter({ rateLimit, limit: 30 }).policy, {
    windowMs: 5 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const { app, calls } = createFakeApp();
  installApiRateLimit({ app, rateLimit });
  assert.equal(calls[0][0], "use");
  assert.equal(calls[0][1], "/api/");
  assert.equal(calls[0][2].policy.limit, 60);
});

test("createUploadErrorHandler maps Multer and request errors", async () => {
  class MulterError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }

  const handler = createUploadErrorHandler({
    multer: { MulterError },
    maxFileMb: 64,
    entityTooLargeMessage: "JSON too large.",
  });

  const tooLarge = createJsonResponse();
  await handler(new MulterError("LIMIT_FILE_SIZE", "limit"), null, tooLarge, null);
  assert.equal(tooLarge.statusCode, 413);
  assert.deepEqual(tooLarge.payload, { error: "File too large. Max 64 MB per file." });

  const entity = createJsonResponse();
  await handler({ type: "entity.too.large" }, null, entity, null);
  assert.equal(entity.statusCode, 413);
  assert.deepEqual(entity.payload, { error: "JSON too large." });

  const invalid = createJsonResponse();
  await handler(new Error("Bad field."), null, invalid, null);
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(invalid.payload, { error: "Bad field." });
});

test("createUnexpectedErrorHandler logs failures and preserves configured messages", () => {
  const errors = [];
  const handler = createUnexpectedErrorHandler({
    logger: { error: (...args) => errors.push(args) },
    errorMessage: "Request failed.",
    missingErrorMessage: "Missing failure.",
  });

  const failed = createJsonResponse();
  const error = new Error("boom");
  handler(error, null, failed, null);
  assert.equal(failed.statusCode, 500);
  assert.deepEqual(failed.payload, { error: "Request failed." });
  assert.deepEqual(errors, [["Unexpected server error:", error]]);

  const missing = createJsonResponse();
  handler(null, null, missing, null);
  assert.equal(missing.statusCode, 500);
  assert.deepEqual(missing.payload, { error: "Missing failure." });
});

test("startToolServer binds localhost and logs supplied details", () => {
  const { app, calls, listener } = createFakeApp();
  const logs = [];
  const result = startToolServer({
    app,
    port: 3456,
    message: "Fixture ready",
    details: ["ONE=1", "TWO=2"],
    logger: { log: (message) => logs.push(message) },
  });

  assert.equal(result, listener);
  assert.deepEqual(calls.at(-1), ["listen", 3456, "127.0.0.1"]);
  assert.deepEqual(logs, ["Fixture ready", "ONE=1", "TWO=2"]);
});

test("isMainModule distinguishes direct execution from imports", () => {
  const entryPath = path.resolve("fixture", "server.js");
  const entryUrl = pathToFileURL(entryPath).href;

  assert.equal(isMainModule(entryUrl, [process.execPath, entryPath]), true);
  assert.equal(isMainModule(entryUrl, [process.execPath, path.resolve("other.js")]), false);
  assert.equal(isMainModule(entryUrl, [process.execPath]), false);
});

test("startToolServerIfMain leaves imported apps inert", () => {
  const entryPath = path.resolve("fixture", "server.js");
  const entryUrl = pathToFileURL(entryPath).href;
  const { app, calls } = createFakeApp();

  const skipped = startToolServerIfMain(entryUrl, { app, port: 3000 }, [process.execPath, path.resolve("other.js")]);
  assert.equal(skipped, undefined);
  assert.equal(calls.length, 0);

  const listener = startToolServerIfMain(entryUrl, { app, port: 3000, logger: { log() {} } }, [
    process.execPath,
    entryPath,
  ]);
  assert.ok(listener);
  assert.deepEqual(calls[0], ["listen", 3000, "127.0.0.1"]);
});
