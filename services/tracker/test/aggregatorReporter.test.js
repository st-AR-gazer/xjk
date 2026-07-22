import assert from "node:assert/strict";
import test from "node:test";

import { AggregatorReporter } from "../src/services/aggregatorReporter.js";

test("tracker traffic reports normalize the producer payload before queueing", (context) => {
  const reporter = new AggregatorReporter({
    enabled: true,
    baseUrl: "https://aggregator.example.test",
    serviceName: "tracker-wr",
  });
  context.after(() => clearTimeout(reporter.trafficFlushTimer));

  assert.deepEqual(
    reporter.reportTraffic({
      direction: " OUTGOING ",
      method: " get ",
      path: "leaderboard",
      targetUrl: "https://LIVE-SERVICES.TRACKMANIA.COM/api/maps?season=summer",
      status: 200.9,
      duration: 14.6,
      requestBytes: 12.8,
      responseBytes: -1,
      occurredAt: "2026-07-20T00:00:00.000Z",
    }),
    { queued: true, queueSize: 1 }
  );
  assert.deepEqual(reporter.trafficQueue[0], {
    direction: "outgoing",
    service: "tracker-wr",
    component: "http",
    method: "GET",
    route: "/leaderboard",
    targetHost: "live-services.trackmania.com",
    targetPath: "/api/maps?season=summer",
    statusCode: 200,
    durationMs: 15,
    bytesIn: 12,
    bytesOut: 0,
    occurredAt: "2026-07-20T00:00:00.000Z",
  });
});

test("tracker traffic reporting prevents the aggregator telemetry feedback loop", () => {
  const reporter = new AggregatorReporter({ enabled: true, baseUrl: "https://aggregator.example.test" });
  assert.deepEqual(
    reporter.reportTraffic({
      direction: "outgoing",
      targetUrl: "https://aggregator.example.test/api/v1/ingest/traffic/batch",
    }),
    { skipped: true, reason: "traffic-loop-guard" }
  );
  assert.deepEqual(reporter.trafficQueue, []);
  assert.equal(reporter.trafficFlushTimer, null);
});
