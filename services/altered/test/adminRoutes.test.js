import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import express from "express";

import { createAdminRoutes } from "../src/routes/adminRoutes.js";

const ROUTE_CONTRACT = [
  "GET /command-center",
  "GET /jobs/overview",
  "GET /jobs/:jobKey/history",
  "GET /maps/workspace",
  "POST /similarity-weight-rules",
  "POST /similarity-weight-rules/:ruleId/delete",
  "POST /similarity-weight-campaign-overrides",
  "POST /similarity-weight-campaign-overrides/:campaignId/delete",
  "GET /operations/feed",
  "GET /settings/summary",
  "GET /public-api/summary",
  "GET /advanced/summary",
  "POST /maps/:mapUid/campaign",
  "POST /maps/:mapUid/tracking",
  "POST /tracker/run-now",
  "GET /maps/local-store/summary",
  "POST /maps/local-store/backfill",
  "POST /maps/local-store/retry-errors",
  "POST /hook/altered/config",
  "POST /hook/altered/sync",
  "POST /hook/altered/maps/:mapUid/tracking",
  "GET /hook/altered/live/status",
  "POST /hook/altered/live/fetch",
  "POST /hook/altered/live/sync",
  "POST /sources/:sourceKey/sync",
  "POST /hook/altered/live/monitor/config",
  "POST /hook/altered/live/monitor/run",
  "POST /hook/altered/live/monitor/run-discovery",
  "GET /hook/altered/live/mapper-sync/status",
  "POST /hook/altered/live/mapper-sync/config",
  "POST /hook/altered/live/mapper-sync/run",
  "POST /hook/altered/live/mapper-sync/accounts",
  "GET /alterations/campaigns/timeline",
  "POST /naming/process",
  "POST /naming/backfill",
  "GET /naming/similarity/backfill/status",
  "POST /naming/similarity/backfill/cancel",
  "POST /naming/similarity/backfill/start",
  "POST /naming/similarity/backfill",
  "GET /naming/candidates",
  "GET /naming/candidates/:mapUid/detail",
  "GET /maps/:targetMapUid/viewer-diff",
  "POST /maps/:mapUid/local-fix",
  "POST /naming/candidates/:mapUid/similarity-selection",
  "POST /naming/candidates/:mapUid/similarity-weights",
  "POST /naming/candidates/:mapUid/review",
  "GET /update-requests",
  "POST /update-requests/:requestId/status",
];

function listRoutes(router) {
  return router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) =>
      Object.entries(layer.route.methods)
        .filter(([, enabled]) => enabled)
        .map(([method]) => `${method.toUpperCase()} ${layer.route.path}`)
    );
}

async function createTestServer(t, service, options = {}) {
  const app = express();
  app.use(express.json());
  app.use(createAdminRoutes(service, options));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function requestJson(baseUrl, path, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

test("admin router preserves every route and its registration order", () => {
  assert.deepEqual(listRoutes(createAdminRoutes({})), ROUTE_CONTRACT);
});

test("map tracking preserves parsed inputs and service response", async (t) => {
  let received = null;
  const service = {
    tracker: {
      async updateMapTracking(input) {
        received = input;
        return { ok: true, tracked: input.tracked };
      },
    },
  };
  const baseUrl = await createTestServer(t, service);
  const response = await requestJson(baseUrl, "/maps/example-map/tracking", {
    method: "POST",
    body: { tracked: "yes", status: "paused", checkFrequency: "42" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, tracked: true });
  assert.deepEqual(received, {
    mapUid: "example-map",
    tracked: true,
    status: "paused",
    checkFrequency: 42,
  });
});

test("workspace validation preserves its 400 response", async (t) => {
  const baseUrl = await createTestServer(t, {});
  const response = await requestJson(baseUrl, "/maps/workspace?view=unsupported");

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Unsupported workspace view." });
});

test("live routes preserve auth failures before calling the service", async (t) => {
  let called = false;
  const service = {
    monitoring: {
      async fetchLiveClubStructure() {
        called = true;
        return { ok: true };
      },
    },
  };
  const error = new Error("Ubisoft session expired.");
  error.statusCode = 403;
  const baseUrl = await createTestServer(t, service, {
    resolveLiveAuthContext: async () => {
      throw error;
    },
  });
  const response = await requestJson(baseUrl, "/hook/altered/live/fetch", {
    method: "POST",
    body: {},
  });

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { error: "Ubisoft session expired." });
  assert.equal(called, false);
});

test("similarity backfill preserves defaults and its accepted response", async (t) => {
  let received = null;
  const service = {
    maps: {
      startNamingSimilarityBackfill(input) {
        received = input;
        return { started: true, jobId: "job-1" };
      },
    },
  };
  const baseUrl = await createTestServer(t, service);
  const response = await requestJson(baseUrl, "/naming/similarity/backfill/start", {
    method: "POST",
    body: { force: "true", persistCandidates: "false", source_key: "club" },
  });

  assert.equal(response.status, 202);
  assert.deepEqual(response.body, { started: true, jobId: "job-1" });
  assert.deepEqual(received, {
    q: undefined,
    limit: 120000,
    mapUids: [],
    clubId: null,
    sourceKey: "club",
    campaignName: "",
    reviewState: "",
    force: true,
    rescanAll: false,
    persistCandidates: false,
    reason: undefined,
  });
});

test("unknown jobs and failed update mutations keep their status codes", async (t) => {
  const service = {
    catalog: {
      updateUpdateRequestStatus() {
        return { error: "Invalid status." };
      },
    },
  };
  const baseUrl = await createTestServer(t, service);
  const missingJob = await requestJson(baseUrl, "/jobs/not-a-job/history");
  const failedUpdate = await requestJson(baseUrl, "/update-requests/17/status", {
    method: "POST",
    body: { status: "mystery", resolutionNote: "test" },
  });

  assert.equal(missingJob.status, 404);
  assert.deepEqual(missingJob.body, { error: "Unknown job key." });
  assert.equal(failedUpdate.status, 400);
  assert.deepEqual(failedUpdate.body, { error: "Invalid status." });
});
