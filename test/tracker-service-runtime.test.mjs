import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { initializeTrackerServiceConfig } from "../services/shared/serviceConfigRuntime.js";
import {
  TrackerServiceRuntime,
  createTrafficSample,
  parseTargetParts,
} from "../services/shared/trackerServiceRuntime.js";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("tracker runtime normalizes service state and traffic samples", () => {
  const runtime = new TrackerServiceRuntime({
    enabled: false,
    aggregatorBaseUrl: "https://aggregator.test/api/v1///",
    aggregatorToken: " secret ",
    projectKey: "club",
    requestTimeoutMs: 200,
  });

  assert.equal(runtime.enabled, false);
  assert.equal(runtime.setEnabled(true), true);
  assert.equal(runtime.aggregatorBaseUrl, "https://aggregator.test/api/v1");
  assert.deepEqual(parseTargetParts("https://Example.test/path?q=1"), {
    host: "example.test",
    path: "/path?q=1",
  });
  const sample = createTrafficSample(
    {
      direction: "invalid",
      route: "status",
      method: "post",
      statusCode: 5000,
      durationMs: -4,
    },
    "club"
  );
  assert.match(sample.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
  delete sample.occurredAt;
  assert.deepEqual(sample, {
    direction: "outgoing",
    service: "club",
    component: "http",
    method: "POST",
    route: "/status",
    targetHost: "",
    targetPath: "/status",
    statusCode: 999,
    durationMs: 0,
    bytesIn: 0,
    bytesOut: 0,
  });
});

test("tracker config runtime preserves environment overrides and parser semantics", () => {
  let dotenvCalls = 0;
  const config = initializeTrackerServiceConfig({
    dotenv: {
      config() {
        dotenvCalls += 1;
      },
    },
    moduleUrl: new URL("../services/tracker-club/src/config.js", import.meta.url).href,
    defaultPort: 3142,
    frontendMode: (env) => env.TRACKER_MODE,
    env: {
      PORT: "4123",
      FRONTEND_DIR: "C:/tracker-ui",
      TRACKER_MODE: "club",
    },
  });

  assert.equal(dotenvCalls, 1);
  assert.equal(config.PORT, 4123);
  assert.equal(config.FRONTEND_DIR, "C:/tracker-ui");
  assert.equal(config.FRONTEND_MODE, "club");
  assert.match(config.moduleDir.replaceAll("\\", "/"), /services\/tracker-club\/src$/);
  assert.equal(config.parseBool("off", true), false);
  assert.equal(config.clampInt("500", { min: 1, max: 100, fallback: 4 }), 100);
  assert.equal(config.normalizeBaseUrl("https://example.test/api///"), "https://example.test/api");
});

test("tracker runtime preserves authenticated JSON requests and traffic telemetry", async () => {
  let resolveTraffic;
  const trafficReceived = new Promise((resolve) => {
    resolveTraffic = resolve;
  });
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({
      path: request.url,
      authorization: request.headers.authorization,
      ingestToken: request.headers["x-ingest-token"],
      body: body ? JSON.parse(body) : null,
    });
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/v1/ingest/traffic") {
      response.end('{"ok":true}');
      resolveTraffic();
      return;
    }
    response.end('{"ok":true,"value":7}');
  });
  const address = await listen(server);
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  const runtime = new TrackerServiceRuntime({
    aggregatorBaseUrl: baseUrl,
    aggregatorToken: "token",
    projectKey: "display",
    projectName: "Display",
    sourceLabel: "tracker-displayname",
  });

  try {
    const result = await runtime.requestJson(`${baseUrl}/resource`, {
      method: "POST",
      body: { value: 7 },
    });
    await trafficReceived;

    assert.deepEqual(result, { ok: true, value: 7 });
    assert.equal(requests[0].authorization, "Bearer token");
    assert.equal(requests[0].ingestToken, "token");
    assert.deepEqual(requests[0].body, { value: 7 });
    assert.equal(requests[1].path, "/api/v1/ingest/traffic");
    assert.equal(requests[1].body.sample.direction, "outgoing");
    assert.equal(requests[1].body.sample.statusCode, 200);
  } finally {
    await close(server);
  }
});

test("tracker runtime owns the restartable timeout lifecycle", async () => {
  const runtime = new TrackerServiceRuntime();
  const events = [];
  await new Promise((resolve) => {
    runtime.scheduleRecurringTask({
      delayMs: 1,
      task() {
        events.push("run");
      },
      onSettled() {
        events.push("settled");
        resolve();
      },
    });
  });

  assert.deepEqual(events, ["run", "settled"]);
  assert.ok(runtime.timer);
  runtime.stopRecurringTask();
  assert.equal(runtime.timer, null);
});
