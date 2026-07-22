import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createTrackerController } from "../src/routes/privateDash/trackerControl.js";

async function withTempDirectory(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "xjk-tracker-controller-"));
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("tracker controller preserves status fallback order and command contracts", async () => {
  const requests = [];
  const requestJson = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/api/v1/tracker/status")) throw new Error("legacy route unavailable");
    return { ok: true };
  };
  const controller = createTrackerController({
    wrBaseUrl: "https://wr.example.test/",
    displaynameBaseUrl: "https://names.example.test/",
    clubBaseUrl: "https://club.example.test/",
    adminToken: " tracker-secret ",
    requestJson,
  });

  assert.equal(controller.getTracker(" WR ").baseUrl, "https://wr.example.test");
  assert.equal(controller.getTracker("missing"), null);

  const statuses = await controller.fetchAllStatuses();
  assert.deepEqual(statuses.wr, {
    ok: true,
    configured: true,
    status: { ok: true },
    error: null,
    baseUrl: "https://wr.example.test",
  });
  assert.equal(statuses.leaderboard.configured, false);
  assert.deepEqual(
    requests.slice(0, 3).map(({ url }) => url),
    [
      "https://wr.example.test/api/v1/tracker/status",
      "https://wr.example.test/api/v1/status",
      "https://names.example.test/api/v1/status",
    ]
  );

  requests.length = 0;
  await controller.sendControlRequest(controller.getTracker("wr"), "run-now", { reason: "manual" });
  await controller.sendControlRequest(controller.getTracker("displayname"), "set", { enabled: false });
  assert.deepEqual(requests, [
    {
      url: "https://wr.example.test/api/v1/admin/tracker/run-now",
      options: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-token": "tracker-secret",
          authorization: "Bearer tracker-secret",
        },
        body: { reason: "manual" },
        timeoutMs: 30000,
      },
    },
    {
      url: "https://names.example.test/api/v1/config",
      options: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { enabled: false, schedulerEnabled: false },
        timeoutMs: 15000,
      },
    },
  ]);

  await assert.rejects(
    controller.sendControlRequest(controller.getTracker("club"), "run-now"),
    (error) => error.statusCode === 400 && error.message === "Tracker 'club' does not support run-now."
  );
});

test("tracker controller keeps admin-token failures explicit", async () => {
  const controller = createTrackerController({
    wrBaseUrl: "https://wr.example.test",
    requestJson: async () => ({ ok: true }),
  });

  await assert.rejects(
    controller.sendControlRequest(controller.getTracker("wr"), "enable"),
    (error) =>
      error.statusCode === 400 &&
      error.message === "Tracker 'wr' requires DASH_TRACKER_ADMIN_TOKEN to control from dash."
  );
  await assert.rejects(
    controller.sendControlRequest(null, "enable"),
    (error) => error.statusCode === 400 && error.message === "Unknown tracker."
  );
});

test("tracker probes preserve target and route order", async () => {
  const urls = [];
  const controller = createTrackerController({
    wrBaseUrl: "https://gateway.example.test/__remote/trackers/wr",
    env: { DASH_TRACKER_WR_LOCAL_BASE_URL: "http://127.0.0.1:4131/" },
    fetchImpl: async (url) => {
      urls.push(url);
      return { ok: true, status: 200, statusText: "OK", text: async () => "ready" };
    },
  });

  const probes = await controller.probeTrackers({ mode: "all", timeoutMs: 2000, concurrency: 3 });
  assert.equal(probes.length, 14);
  assert.deepEqual(
    probes.map(({ scope, path }) => `${scope} ${path}`),
    [
      "local /health",
      "local /status",
      "local /tracker/status",
      "local /api/status",
      "local /api/tracker/status",
      "local /api/v1/status",
      "local /api/v1/tracker/status",
      "configured /health",
      "configured /status",
      "configured /tracker/status",
      "configured /api/status",
      "configured /api/tracker/status",
      "configured /api/v1/status",
      "configured /api/v1/tracker/status",
    ]
  );
  assert.equal(urls[0], "http://127.0.0.1:4131/health");
  assert.equal(urls.at(-1), "https://gateway.example.test/__remote/trackers/wr/api/v1/tracker/status");
  assert.ok(probes.every(({ ok, statusCode, bytes }) => ok && statusCode === 200 && bytes === 5));
});

test("priority snapshots persist, restore every configured tracker, and aggregate errors", async () => {
  await withTempDirectory(async (logDir) => {
    const commands = [];
    const requestJson = async (url, options) => {
      commands.push({ url, body: options.body });
      if (url.startsWith("https://club.example.test")) throw new Error("club unavailable");
      return { ok: true };
    };
    const options = {
      logDir,
      wrBaseUrl: "https://wr.example.test",
      leaderboardBaseUrl: "https://leaderboard.example.test",
      displaynameBaseUrl: "https://names.example.test",
      clubBaseUrl: "https://club.example.test",
      adminToken: "secret",
      requestJson,
    };
    const controller = createTrackerController(options);
    const snapshot = controller.buildPrioritySnapshot({
      wr: { configured: true, ok: true, status: { runtime: { enabled: true, leaderboardTopN: 0 } } },
      leaderboard: { configured: true, ok: true, status: { runtime: { enabled: false } } },
      displayname: { configured: true, ok: true, status: { enabled: true, schedulerEnabled: true } },
      club: { configured: true, ok: true, status: { enabled: true } },
    });
    assert.equal(snapshot.wr.leaderboardTopN, 1);
    assert.equal(snapshot.leaderboard.leaderboardTopN, 100);
    assert.equal(snapshot.displayname.maintenanceIntervalSeconds, 60);

    controller.setPriorityState({ snapshot, meta: { active: true, targetKey: "wr" } });
    await controller.persistPriorityState();
    const reloaded = createTrackerController(options);
    assert.deepEqual(await reloaded.ensurePriorityStateLoaded(), {
      snapshot,
      meta: { active: true, targetKey: "wr" },
    });

    const restored = await reloaded.restorePrioritySnapshot(snapshot);
    assert.deepEqual(restored, { ok: false, errors: ["club: club unavailable"] });
    assert.deepEqual(
      commands.map(({ url }) => url),
      [
        "https://wr.example.test/api/v1/admin/tracker/config",
        "https://leaderboard.example.test/api/v1/admin/tracker/config",
        "https://names.example.test/api/v1/config",
        "https://club.example.test/api/v1/config",
      ]
    );
  });
});
