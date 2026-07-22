import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createValidifierApp } from "../src/app.js";
import { buildLivePayload } from "../src/liveQueueModel.js";
import { createPublicResponseCache } from "../src/publicCache.js";
import { uniqueRecordIds, validateLookupValue, validateTrack } from "../src/requestValidation.js";

const quietLogger = { error() {}, log() {}, warn() {} };
const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function unusedLocalPort() {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close((error) => (error ? reject(error) : resolve())));
  return port;
}

test("public cache owns hit, expiry, and falsy-payload semantics", async () => {
  let now = 1_000;
  let calls = 0;
  const cache = createPublicResponseCache({ ttlMs: 50, now: () => now });
  const produce = async () => {
    calls += 1;
    return false;
  };
  assert.deepEqual(await cache.withValue("key", produce), { payload: false, cacheStatus: "miss" });
  assert.deepEqual(await cache.withValue("key", produce), { payload: false, cacheStatus: "hit" });
  now += 50;
  assert.deepEqual(await cache.withValue("key", produce), { payload: false, cacheStatus: "miss" });
  assert.equal(calls, 2);
});

test("request validation constrains public lookup and batch trust boundaries", () => {
  assert.equal(validateLookupValue("  record-id  ", "Record ID"), "record-id");
  assert.equal(validateTrack("DEEP"), "deep");
  assert.deepEqual(uniqueRecordIds(["one", "one", "two"]), ["one", "two"]);
  assert.throws(() => validateLookupValue("x".repeat(161), "Record ID"), /too long/);
  assert.throws(() => validateTrack("private-track"), /Track must be one of/);
  assert.throws(() => uniqueRecordIds(Array.from({ length: 101 }, (_, index) => `id-${index}`)), /at most 100/);
});

test("live queue model keeps pending work ahead of completed work", () => {
  const verification = (track, status, updatedAt) => ({
    track,
    status,
    updated_at: updatedAt,
    checked_at: updatedAt,
  });
  const payload = buildLivePayload(
    [
      {
        record_id: "complete",
        map_uid: "map-a",
        rank: 1,
        verifications: [verification("replay", "pass", "2026-01-01T00:00:00.000Z")],
      },
      {
        record_id: "pending",
        map_uid: "map-b",
        rank: 2,
        verifications: [verification("replay", "pending", "2026-01-02T00:00:00.000Z")],
      },
    ],
    { limit: 10, mapLimit: 10 }
  );
  assert.equal(payload.records[0].record_id, "pending");
  assert.equal(payload.totals.replay_pending, 1);
  assert.equal(payload.maps_remaining[0].map_uid, "map-b");
});

test("composed app imports without listening and retains HTTP security/error behavior", async () => {
  const repository = {
    getLatestSubmissionsForRecordIds: () => [],
  };
  const app = createValidifierApp({
    artifactLifecycle: { requireArtifact() {} },
    artifactRoot: ".",
    cacheTtlMs: 60_000,
    configured: false,
    frontendDir: ".",
    internalClient: {},
    liveQueueService: { getLiveQueue: async () => ({}) },
    logger: quietLogger,
    lookupService: {},
    mapUploadMaxBytes: 1,
    publicApiCatalog: { endpoints: [] },
    replayUploadMaxBytes: 1,
    repository,
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  try {
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    const healthResponse = await fetch(`${origin}/api/v1/health`);
    const health = await healthResponse.json();
    assert.equal(health.data.status, "degraded");
    assert.equal(healthResponse.headers.get("x-powered-by"), null);
    assert.match(healthResponse.headers.get("content-security-policy"), /default-src/);

    const invalidJsonResponse = await fetch(`${origin}/api/v1/verdicts/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(invalidJsonResponse.status, 400);
    assert.equal((await invalidJsonResponse.json()).error.code, "invalid_request");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("thin server entrypoint and runtime retain standalone startup behavior", { timeout: 12_000 }, async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "validifier-public-startup-"));
  const port = await unusedLocalPort();
  const priorEnvironment = {
    PORT: process.env.PORT,
    VALIDIFIER_INTERNAL_BASE_URL: process.env.VALIDIFIER_INTERNAL_BASE_URL,
    VALIDIFIER_PUBLIC_DATA_DIR: process.env.VALIDIFIER_PUBLIC_DATA_DIR,
  };
  process.env.PORT = String(port);
  process.env.VALIDIFIER_INTERNAL_BASE_URL = "";
  process.env.VALIDIFIER_PUBLIC_DATA_DIR = tempDirectory;
  const entrySource = fs.readFileSync(path.join(serviceRoot, "server.js"), "utf8");
  assert.match(entrySource, /import \{ startValidifierPublicServer \} from "\.\/src\/runtime\.js";/);
  assert.match(entrySource, /startValidifierPublicServer\(\);/);

  const { startValidifierPublicServer } = await import(`../src/runtime.js?startup-test=${Date.now()}`);
  const runtime = startValidifierPublicServer({ logger: quietLogger });
  try {
    if (!runtime.server.listening) {
      await new Promise((resolve, reject) => {
        runtime.server.once("listening", resolve);
        runtime.server.once("error", reject);
      });
    }
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    assert.equal((await response.json()).data.status, "degraded");
  } finally {
    await new Promise((resolve, reject) => {
      runtime.server.close((error) => (error ? reject(error) : resolve()));
    });
    runtime.repository.db.close();
    for (const [key, value] of Object.entries(priorEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
