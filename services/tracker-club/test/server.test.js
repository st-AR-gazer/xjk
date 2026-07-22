import assert from "node:assert/strict";
import test from "node:test";

import { withServer } from "../../shared/testing/httpServer.js";
import { createClubTrackerRuntime } from "../server.js";
import { ClubTrackerService } from "../src/services/clubTrackerService.js";

test("club service preserves config and ingest state", async () => {
  const service = new ClubTrackerService({ enabled: false, projectKey: "club-test" });
  assert.equal(service.setConfig({ enabled: true }).enabled, true);
  assert.deepEqual(service.parseTargetParts("https://example.test/club?id=7"), {
    host: "example.test",
    path: "/club?id=7",
  });
  assert.deepEqual(await service.ingestSnapshot({}), {
    error: "club.id/clubId is required for club snapshot ingest.",
  });

  service.requestJson = async (_url, { body }) => {
    assert.equal(body.club.id, 7);
    return { ingest: { accepted: 3 } };
  };
  assert.deepEqual(await service.ingestSnapshot({ club: { id: 7 } }), { accepted: 3 });
  assert.equal(service.getStatus().lastSummary.accepted, 3);
  assert.ok(service.getStatus().lastIngestAt);
});

test("club server factory preserves health, status, config, and ingest endpoints", async () => {
  const calls = [];
  const trackerService = {
    reportTraffic(sample) {
      calls.push({ type: "traffic", sample });
    },
    getStatus() {
      return { enabled: true, service: "club" };
    },
    setConfig(config) {
      calls.push({ type: "config", config });
      return { enabled: Boolean(config.enabled) };
    },
    async ingestSnapshot(snapshot) {
      calls.push({ type: "ingest", snapshot });
      return snapshot.club ? { accepted: 1 } : { error: "missing club" };
    },
  };
  const { app } = createClubTrackerRuntime({ trackerService });

  await withServer(app, async (baseUrl) => {
    assert.equal(await (await fetch(`${baseUrl}/health`)).text(), "ok");
    assert.deepEqual(await (await fetch(`${baseUrl}/api/v1/tracker/status`)).json(), {
      enabled: true,
      service: "club",
    });
    assert.deepEqual(
      await (
        await fetch(`${baseUrl}/api/v1/config`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"enabled":false}',
        })
      ).json(),
      { enabled: false }
    );
    const ingest = await fetch(`${baseUrl}/api/v1/snapshot/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(ingest.status, 400);
    assert.deepEqual(await ingest.json(), { error: "missing club" });
  });

  assert.deepEqual(calls.find((call) => call.type === "config").config, { enabled: false });
  assert.ok(calls.some((call) => call.type === "traffic" && call.sample.route === "/health"));
});
