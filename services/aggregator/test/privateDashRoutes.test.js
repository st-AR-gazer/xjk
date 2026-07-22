import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";

import { withServer } from "../../shared/testing/httpServer.js";
import { collectServiceLogs, readLogTail } from "../src/routes/privateDash/logFiles.js";
import { createPrivateDashRoutes } from "../src/routes/privateDashRoutes.js";

function createRepository(overrides = {}) {
  return {
    getMeta: () => ({ projectCount: 2 }),
    getMetricsOverview: () => ({ requestCount: 8 }),
    getTrackerStatusSnapshots: () => ({ trackers: { wr: { ok: true } }, source: "database" }),
    ...overrides,
  };
}

async function withTempDirectory(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "xjk-private-dash-"));
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function createDashApp(repository, options = {}) {
  const app = express();
  app.use(express.json());
  app.use("/dash", createPrivateDashRoutes(repository, options));
  return app;
}

test("log discovery recognizes PM2 and local logs and tails the requested lines", async () => {
  await withTempDirectory(async (logDir) => {
    const outputLines = Array.from({ length: 14 }, (_, index) => `line-${index + 1}`);
    const outputPath = path.join(logDir, "alpha-out.log");
    await fs.writeFile(outputPath, `${outputLines.join("\r\n")}\r\n`, "utf8");
    await fs.writeFile(path.join(logDir, "alpha-error.log"), "failure\n", "utf8");
    await fs.writeFile(path.join(logDir, "beta-20260719-010203.log"), "local\n", "utf8");
    await fs.writeFile(path.join(logDir, "ignored.txt"), "ignored\n", "utf8");

    const result = await collectServiceLogs(logDir);
    assert.equal(result.error, null);
    assert.deepEqual(
      result.services.map(({ service, hasOut, hasError }) => ({ service, hasOut, hasError })),
      [
        { service: "alpha", hasOut: true, hasError: true },
        { service: "beta", hasOut: true, hasError: false },
      ]
    );

    const tail = await readLogTail(outputPath, { lines: 10 });
    assert.deepEqual(tail.lines, outputLines.slice(-10));
    assert.equal(tail.truncated, true);
  });
});

test("private dash facade preserves metadata, cache, and log route contracts", async () => {
  await withTempDirectory(async (logDir) => {
    await fs.writeFile(path.join(logDir, "alpha-out.log"), "one\ntwo\n", "utf8");
    await withServer(createDashApp(createRepository(), { logsControl: { logDir } }), async (baseUrl) => {
      const metaResponse = await fetch(`${baseUrl}/dash/meta`);
      assert.equal(metaResponse.status, 200);
      assert.equal(metaResponse.headers.get("cache-control"), "no-store, no-cache, must-revalidate, proxy-revalidate");
      const meta = await metaResponse.json();
      assert.deepEqual(meta.summary, { projectCount: 2 });
      assert.deepEqual(meta.metrics, { requestCount: 8 });

      const servicesResponse = await fetch(`${baseUrl}/dash/logs/services?q=alpha`);
      const services = await servicesResponse.json();
      assert.equal(servicesResponse.status, 200);
      assert.equal(services.count, 1);
      assert.equal(services.services[0].service, "alpha");

      const tailResponse = await fetch(`${baseUrl}/dash/logs/service/alpha?lines=10`);
      const tail = await tailResponse.json();
      assert.equal(tailResponse.status, 200);
      assert.deepEqual(tail.lines, ["one", "two"]);

      const invalidStream = await fetch(`${baseUrl}/dash/logs/service/alpha?stream=combined`);
      assert.equal(invalidStream.status, 400);
      assert.deepEqual(await invalidStream.json(), { error: "Invalid stream. Use 'out' or 'error'." });
    });
  });
});

test("data route registrars preserve query normalization across dashboard domains", async () => {
  const calls = {};
  const repository = createRepository({
    getTrafficOverview: (options) => ((calls.overview = options), {}),
    getTrafficTimeseries: (options) => ((calls.timeseries = options), []),
    getTrafficTop: (options) => ((calls.top = options), []),
    getTrafficFacets: (options) => ((calls.facets = options), {}),
    getTrafficErrors: (options) => ((calls.errors = options), []),
    getNadeoGuardrailSnapshot: (options) => ((calls.guardrail = options), {}),
    listProjects: (options) => ((calls.projects = options), []),
    getAlteredDashboardSummary: (options) => ((calls.alteredSummary = options), {}),
    getAlteredCheckHistory: (options) => ((calls.alteredHistory = options), []),
  });

  await withTempDirectory(async (logDir) => {
    await withServer(createDashApp(repository, { logsControl: { logDir } }), async (baseUrl) => {
      const routes = [
        "/dash/traffic/overview?window_hours=48&project_key=core&service=api",
        "/dash/traffic/timeseries?bucket=day&window_hours=72&project_key=core&service=api",
        "/dash/traffic/top?window_hours=12&project_key=core&service=api&direction=incoming&dimension=route&limit=7",
        "/dash/traffic/facets?window_hours=6&project_key=core",
        "/dash/traffic/errors?window_hours=4&project_key=core&service=api&direction=incoming&status_min=500&q=timeout&limit=8&page=3&offset=16",
        "/dash/nadeo/guardrail?window_hours=2&project_key=core&service=tracker",
        "/dash/projects?limit=9",
        "/dash/altered/summary?sync_runs_limit=5&poll_runs_limit=6",
        "/dash/altered/check-history?q=MiXeD&map_uid=abc&limit=11",
      ];
      for (const route of routes) assert.equal((await fetch(`${baseUrl}${route}`)).status, 200);
    });
  });

  assert.deepEqual(calls, {
    overview: { windowHours: 48, projectKey: "core", service: "api" },
    timeseries: { bucket: "day", windowHours: 72, projectKey: "core", service: "api" },
    top: {
      windowHours: 12,
      projectKey: "core",
      service: "api",
      direction: "incoming",
      dimension: "route",
      limit: 7,
    },
    facets: { windowHours: 6, projectKey: "core" },
    errors: {
      windowHours: 4,
      projectKey: "core",
      service: "api",
      direction: "incoming",
      statusMin: 500,
      q: "timeout",
      limit: 8,
      page: 3,
      offset: 16,
    },
    guardrail: { windowHours: 2, projectKey: "core", service: "tracker" },
    projects: { limit: 9 },
    alteredSummary: { syncRunsLimit: 5, pollRunsLimit: 6 },
    alteredHistory: { q: "mixed", mapUid: "abc", limit: 11 },
  });
});

test("altered control routes forward authentication and retain upstream errors", async () => {
  const upstream = express();
  upstream.use(express.json());
  upstream.post("/api/v1/admin/hook/altered/live/monitor/run", (req, res) => {
    assert.equal(req.get("x-aggregator-token"), "altered-secret");
    assert.deepEqual(req.body, {});
    res.json({ queued: true });
  });
  upstream.post("/api/v1/admin/hook/altered/live/monitor/run-discovery", (_req, res) => {
    res.status(409).json({ error: "discovery already running" });
  });

  await withServer(upstream, async (alteredBaseUrl) => {
    await withTempDirectory(async (logDir) => {
      const app = createDashApp(createRepository(), {
        alteredControl: { baseUrl: alteredBaseUrl, internalToken: "altered-secret" },
        logsControl: { logDir },
      });
      await withServer(app, async (baseUrl) => {
        const fullSyncResponse = await fetch(`${baseUrl}/dash/altered/run-full-sync`, { method: "POST" });
        assert.equal(fullSyncResponse.status, 200);
        assert.deepEqual((await fullSyncResponse.json()).result, { queued: true });

        const discoveryResponse = await fetch(`${baseUrl}/dash/altered/run-discovery-sync`, {
          method: "POST",
        });
        assert.equal(discoveryResponse.status, 409);
        assert.deepEqual(await discoveryResponse.json(), { error: "discovery already running" });
      });
    });
  });
});

test("tracker routes preserve control authentication, status, and validation behavior", async () => {
  const requests = [];
  const upstream = express();
  upstream.use(express.json());
  upstream.post("/api/v1/admin/tracker/run-now", (req, res) => {
    requests.push({ authorization: req.get("authorization"), token: req.get("x-admin-token"), body: req.body });
    res.json({ started: true });
  });

  await withServer(upstream, async (wrBaseUrl) => {
    await withTempDirectory(async (logDir) => {
      const app = createDashApp(createRepository(), {
        logsControl: { logDir },
        trackerControl: { wrBaseUrl, adminToken: "tracker-secret" },
      });
      await withServer(app, async (baseUrl) => {
        const statusResponse = await fetch(`${baseUrl}/dash/trackers/status`);
        const status = await statusResponse.json();
        assert.equal(statusResponse.status, 200);
        assert.deepEqual(status.trackers, { wr: { ok: true } });
        assert.equal(status.priority.restoreAvailable, false);

        const controlResponse = await fetch(`${baseUrl}/dash/trackers/control`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tracker: "wr", action: "run-now" }),
        });
        assert.equal(controlResponse.status, 200);
        assert.deepEqual((await controlResponse.json()).result, { started: true });
        assert.deepEqual(requests, [{ authorization: "Bearer tracker-secret", token: "tracker-secret", body: {} }]);

        const unknownPriority = await fetch(`${baseUrl}/dash/trackers/priority`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "apply", target: "unknown" }),
        });
        assert.equal(unknownPriority.status, 400);
        assert.deepEqual(await unknownPriority.json(), {
          error: "Unknown tracker target. Use wr, leaderboard, displayname, or club.",
        });
      });
    });
  });
});

test("tracker priority can be applied, persisted, and restored through the facade", async () => {
  const commands = [];
  const upstream = express();
  upstream.use(express.json());
  upstream.get("/api/v1/tracker/status", (_req, res) => {
    res.json({
      runtime: {
        enabled: true,
        tickSeconds: 20,
        batchSize: 6,
        maxCheckIntervalSeconds: 0,
        leaderboardTopN: 100,
      },
    });
  });
  upstream.get("/api/v1/status", (_req, res) => {
    res.json({
      enabled: true,
      schedulerEnabled: true,
      maintenanceIntervalSeconds: 60,
      staleAfterSeconds: 86400,
      batchSize: 50,
      maxAccountsPerCycle: 200,
      minRequestGapMs: 5000,
    });
  });
  upstream.post(
    ["/api/v1/admin/tracker/config", "/api/v1/admin/tracker/run-now", "/api/v1/config", "/api/v1/sync/run-now"],
    (req, res) => {
      commands.push({ path: req.path, body: req.body });
      res.json({ ok: true });
    }
  );

  await withServer(upstream, async (trackerBaseUrl) => {
    await withTempDirectory(async (logDir) => {
      const trackerControl = {
        wrBaseUrl: trackerBaseUrl,
        leaderboardBaseUrl: trackerBaseUrl,
        displaynameBaseUrl: trackerBaseUrl,
        clubBaseUrl: trackerBaseUrl,
        adminToken: "tracker-secret",
      };
      await withServer(
        createDashApp(createRepository(), { logsControl: { logDir }, trackerControl }),
        async (baseUrl) => {
          const applyResponse = await fetch(`${baseUrl}/dash/trackers/priority`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "apply", target: "wr", pauseOthers: false }),
          });
          const applied = await applyResponse.json();
          assert.equal(applyResponse.status, 200);
          assert.deepEqual(applied.priority, {
            active: true,
            target: "wr",
            intervalSeconds: 3,
            pauseOthers: false,
            restoreAvailable: true,
            updatedAt: applied.priority.updatedAt,
          });
          assert.deepEqual(commands.slice(0, 2), [
            { path: "/api/v1/admin/tracker/config", body: { enabled: true, tickSeconds: 3 } },
            { path: "/api/v1/admin/tracker/run-now", body: {} },
          ]);

          const statePath = path.join(logDir, "dash-tracker-priority-state.json");
          const state = JSON.parse(await fs.readFile(statePath, "utf8"));
          assert.equal(state.meta.active, true);
          assert.equal(state.meta.targetKey, "wr");

          const restoreResponse = await fetch(`${baseUrl}/dash/trackers/priority`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "restore" }),
          });
          assert.equal(restoreResponse.status, 200);
          assert.deepEqual((await restoreResponse.json()).priority, {
            active: false,
            restoreAvailable: false,
          });
          await assert.rejects(fs.access(statePath));
        }
      );
    });
  });
});

test("unconfigured altered control retains its client-error response", async () => {
  await withTempDirectory(async (logDir) => {
    await withServer(createDashApp(createRepository(), { logsControl: { logDir } }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/dash/altered/run-full-sync`, { method: "POST" });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "Altered base URL is not configured." });
    });
  });
});
