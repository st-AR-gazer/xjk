import assert from "node:assert/strict";
import test from "node:test";
import { appendMonitoringSummaryEvents } from "../src/routes/admin/activityPayloads.js";

test("appendMonitoringSummaryEvents gives recent and paged feeds the same monitor events", () => {
  const events = [];
  appendMonitoringSummaryEvents(
    events,
    {
      lastDiscoverySummary: { campaignsSeen: 2 },
      lastDiscoveryFinishedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      lastError: "resolver unavailable",
      lastFinishedAt: "2026-01-02T00:00:00.000Z",
    }
  );

  assert.equal(events.length, 2);
  assert.equal(events[0].id, "discovery:2026-01-01T00:00:00.000Z");
  assert.equal(events[0].jobKey, "club-discovery-sync");
  assert.equal(events[0].status, "success");
  assert.equal(events[1].id, "displayname:2026-01-02T00:00:00.000Z");
  assert.equal(events[1].jobKey, "displayname-sync");
  assert.equal(events[1].status, "warn");
});
