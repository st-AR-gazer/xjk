import assert from "node:assert/strict";
import test from "node:test";

import {
  mapTrafficSampleDbRow,
  normalizeTrafficSample,
  parseTrafficRow,
} from "../src/repositories/traffic/trafficNormalization.js";

test("aggregator traffic ingestion applies the shared wire policy and target classification", () => {
  assert.deepEqual(
    normalizeTrafficSample(
      {
        direction: " OUTGOING ",
        service: "tracker",
        component: "nadeo-client",
        method: " get ",
        route: "leaderboard",
        targetHost: " LIVE-SERVICES.TRACKMANIA.COM ",
        targetPath: "api/token/leaderboard/group/map/top",
        statusCode: 200.9,
        durationMs: 14.6,
        bytesIn: 12.8,
        bytesOut: -1,
        occurredAt: "2026-07-20T00:00:00.000Z",
      },
      { projectKey: "altered", sourceLabel: "tracker-wr" }
    ),
    {
      projectKey: "altered",
      sourceLabel: "tracker-wr",
      direction: "outgoing",
      service: "tracker",
      component: "nadeo-client",
      method: "GET",
      route: "/leaderboard",
      targetHost: "live-services.trackmania.com",
      targetPath: "/api/token/leaderboard/group/map/top",
      statusCode: 200,
      statusGroup: "2xx",
      durationMs: 15,
      bytesIn: 12,
      bytesOut: 0,
      occurredAt: "2026-07-20T00:00:00.000Z",
      isNadeoOutgoing: true,
      isInternalOutgoing: false,
    }
  );
});

test("stored and legacy traffic rows retain the same normalized public shape", () => {
  const mapped = mapTrafficSampleDbRow({
    projectKey: "project",
    sourceLabel: "source",
    direction: "incoming",
    service: "gateway",
    component: "http",
    method: "post",
    route: "ingest",
    targetHost: "127.0.0.1",
    targetPath: "api",
    statusCode: 503.4,
    statusGroup: "5xx",
    durationMs: 1.6,
    bytesIn: 2.9,
    bytesOut: 3.9,
    occurredAt: "2026-07-20T01:00:00.000Z",
    isNadeoOutgoing: 0,
    isInternalOutgoing: 1,
  });
  assert.equal(mapped.method, "POST");
  assert.equal(mapped.route, "/ingest");
  assert.equal(mapped.targetPath, "/api");
  assert.equal(mapped.statusCode, 503);
  assert.equal(mapped.durationMs, 2);
  assert.equal(mapped.bytesIn, 2);
  assert.equal(mapped.bytesOut, 3);

  const parsed = parseTrafficRow({
    project_key: "project",
    payload_json: JSON.stringify(mapped),
  });
  assert.equal(parsed.projectKey, "project");
  assert.equal(parsed.statusGroup, "5xx");
  assert.equal(parsed.targetHost, "127.0.0.1");
});
