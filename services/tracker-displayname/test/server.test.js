import assert from "node:assert/strict";
import test from "node:test";

import { withServer } from "../../shared/testing/httpServer.js";
import { createDisplayNameTrackerRuntime, startDisplayNameTrackerServer } from "../server.js";
import { DisplayNameTrackerService } from "../src/services/displayNameTrackerService.js";

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

test("display-name config preserves scheduler and OAuth state", () => {
  const enabledValues = [];
  const service = new DisplayNameTrackerService({
    oauthClient: {
      setEnabled(value) {
        enabledValues.push(value);
      },
      getStatus() {
        return { configured: true };
      },
    },
    enabled: false,
    schedulerEnabled: false,
  });

  const status = service.setConfig({
    enabled: true,
    schedulerEnabled: false,
    maintenanceIntervalSeconds: 9,
    batchSize: 7,
    minRequestGapMs: 0,
  });
  assert.deepEqual(enabledValues, [false, true]);
  assert.equal(status.enabled, true);
  assert.equal(status.schedulerEnabled, false);
  assert.equal(status.maintenanceIntervalSeconds, 9);
  assert.equal(status.batchSize, 7);
  assert.equal(status.minRequestGapMs, 0);

  service.schedulerEnabled = true;
  service.startScheduler();
  assert.ok(service.timer);
  service.stopScheduler();
  assert.equal(service.timer, null);
});

test("display-name sync records one canonical success lifecycle", async () => {
  const heartbeats = [];
  const service = new DisplayNameTrackerService({
    oauthClient: {
      setEnabled() {},
      isConfigured() {
        return true;
      },
      async getDisplayNames(accountIds) {
        assert.deepEqual(accountIds, [ACCOUNT_ID]);
        return {
          ok: true,
          requested: 1,
          namesByAccountId: { [ACCOUNT_ID]: "Alice" },
        };
      },
    },
    enabled: true,
    schedulerEnabled: false,
  });
  service.ingestDisplayNames = async () => ({ accepted: 1, inserted: 1 });
  service.sendInstanceState = async (state) => heartbeats.push(state);

  const summary = await service.runSync({ accountIds: [ACCOUNT_ID], reason: "contract-test" });

  assert.equal(summary.reason, "contract-test");
  assert.equal(summary.resolved, 1);
  assert.equal(summary.accepted, 1);
  assert.deepEqual(summary.namesByAccountId, { [ACCOUNT_ID]: "Alice" });
  assert.equal(service.lastSummary, summary);
  assert.equal(service.lastError, null);
  assert.deepEqual(heartbeats, [{ register: false, status: "online" }]);
});

test("display-name server startup preserves warmup ordering", async () => {
  const server = {};
  const events = [];
  const runtime = {
    app: {
      listen(port, host, onListening) {
        events.push({ port, host });
        onListening();
        return server;
      },
    },
    service: {
      async warmup() {
        events.push("warmup");
      },
    },
  };
  const logger = {
    log() {},
    error(error) {
      assert.fail(error);
    },
  };

  assert.equal(startDisplayNameTrackerServer({ runtime, port: 4123, logger }), server);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, [{ port: 4123, host: "127.0.0.1" }, "warmup"]);
});

test("display-name server factory preserves status and mutation contracts", async () => {
  const calls = [];
  const trackerService = {
    reportTraffic(sample) {
      calls.push({ type: "traffic", sample });
    },
    getStatus() {
      return { enabled: true, queueSize: 0 };
    },
    enqueueAccountIds(accountIds, options) {
      calls.push({ type: "enqueue", accountIds, options });
      return { queued: accountIds.length, queueSize: accountIds.length };
    },
    async resolveAccountIds(accountIds, options) {
      calls.push({ type: "resolve", accountIds, options });
      return { ok: true, requested: accountIds.length, namesByAccountId: {} };
    },
    async runSync(options) {
      calls.push({ type: "sync", options });
      return { requested: options.accountIds.length };
    },
    setConfig(config) {
      calls.push({ type: "config", config });
      return { enabled: Boolean(config.enabled), batchSize: config.batchSize };
    },
  };
  const { app } = createDisplayNameTrackerRuntime({ trackerService });

  await withServer(app, async (baseUrl) => {
    assert.deepEqual(await (await fetch(`${baseUrl}/status`)).json(), { enabled: true, queueSize: 0 });

    const enqueue = await fetch(`${baseUrl}/api/v1/accounts/enqueue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountIds: [ACCOUNT_ID, ACCOUNT_ID.toUpperCase()], priority: true }),
    });
    assert.deepEqual(await enqueue.json(), { queued: 1, queueSize: 1, requested: 1 });

    const resolve = await fetch(`${baseUrl}/api/v1/accounts/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account_ids: [ACCOUNT_ID] }),
    });
    assert.equal(resolve.status, 200);
    assert.equal((await resolve.json()).ok, true);

    const sync = await fetch(`${baseUrl}/api/v1/sync/run-now`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountIds: [ACCOUNT_ID], forceCandidates: true }),
    });
    assert.deepEqual(await sync.json(), { requested: 1 });

    const config = await fetch(`${baseUrl}/api/v1/config`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"enabled":false,"batchSize":8}',
    });
    assert.deepEqual(await config.json(), { enabled: false, batchSize: 8 });
  });

  assert.deepEqual(calls.find((call) => call.type === "enqueue").options, { front: true });
  assert.deepEqual(calls.find((call) => call.type === "resolve").options, {
    reason: "priority-api",
    front: true,
  });
  assert.equal(calls.find((call) => call.type === "sync").options.prioritizeAccountIds, true);
});
