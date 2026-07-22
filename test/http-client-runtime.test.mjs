import assert from "node:assert/strict";
import test from "node:test";

import { ThrottledHttpClientRuntime } from "../services/shared/httpClientRuntime.js";
import { TrackmaniaOAuthClient } from "../services/shared/trackmaniaOAuthClient.js";

test("shared outbound HTTP runtime preserves fetch options, JSON errors, and telemetry", async () => {
  const calls = [];
  const events = [];
  const runtime = new ThrottledHttpClientRuntime({
    now: () => 1_000,
    telemetryComponent: "oauth",
    telemetryService: "identity",
    onHttpEvent: (event) => events.push(event),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ detail: "denied" }), { status: 403 });
    },
  });

  await assert.rejects(
    runtime.requestJson("https://api.example/profile", {
      method: "POST",
      redirect: "manual",
      body: "payload",
      formatError: ({ status, details }) => `profile ${status}: ${details}`,
    }),
    (error) => {
      assert.equal(error.constructor, Error);
      assert.equal(error.message, "profile 403: denied");
      assert.equal(error.statusCode, 403);
      assert.deepEqual(error.payload, { detail: "denied" });
      assert.equal(error.requestMethod, "POST");
      return true;
    }
  );

  assert.equal(calls[0].options.redirect, "manual");
  assert.deepEqual(events[0], {
    direction: "outgoing",
    component: "oauth",
    service: "identity",
    method: "POST",
    route: "/profile",
    targetHost: "api.example",
    targetPath: "/profile",
    statusCode: 403,
    durationMs: 0,
    bytesIn: 7,
    bytesOut: 19,
  });
});

test("Trackmania OAuth keeps its public error and telemetry contracts on the shared runtime", async () => {
  const events = [];
  const client = new TrackmaniaOAuthClient({
    clientId: "client",
    clientSecret: "secret",
    minRequestGapMs: 0,
    onHttpEvent: (event) => events.push(event),
    telemetryService: "test-service",
    fetchImpl: async () => new Response(JSON.stringify({ message: "upstream failed" }), { status: 502 }),
  });

  await assert.rejects(client.requestJson("https://api.trackmania.com/status"), (error) => {
    assert.equal(
      error.message,
      "Trackmania OAuth request failed (502) for GET https://api.trackmania.com/status: upstream failed"
    );
    assert.equal(error.statusCode, 502);
    assert.deepEqual(error.payload, { message: "upstream failed" });
    return true;
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].component, "trackmania-oauth");
  assert.equal(events[0].service, "test-service");
  assert.equal(events[0].statusCode, 502);
});
