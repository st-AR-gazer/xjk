import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import express from "express";

import { createAdminAuth } from "../src/http/adminAuth.js";
import { createAlteredApp } from "../src/http/createAlteredApp.js";
import { createAlteredLifecycle } from "../src/runtime/alteredLifecycle.js";
import { DEFAULT_PROJECT_CLUBS, createAlteredServiceRuntime } from "../src/runtime/alteredRuntimeFactory.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ALTERED_DIR = path.resolve(TEST_DIR, "..");

describe("Altered runtime composition", () => {
  test("the shared service factory wires one coherent dependency graph", () => {
    const calls = {
      databaseOptions: null,
      clubs: null,
      trackerOptions: [],
      serviceOptions: null,
    };
    const database = { name: "database" };

    class FakeRepository {
      constructor(db) {
        assert.equal(db, database);
        this.configuration = {
          ensureHookConfigs(clubs) {
            calls.clubs = clubs;
          },
        };
      }
    }

    class FakeTrackerClient {
      constructor(options) {
        this.options = options;
        calls.trackerOptions.push(options);
      }
    }

    class FakeClient {
      constructor(options) {
        this.options = options;
      }
    }

    class FakeAlteredService {
      constructor(options) {
        calls.serviceOptions = options;
      }
    }

    const mapCopyConfig = { dataDir: "test-data", enabled: false };
    const alterationGroupingConfig = { filePath: "groups.json" };
    const runtime = createAlteredServiceRuntime({
      databaseOptions: { filePath: "runtime.sqlite", busyTimeoutMs: 42 },
      mapCopyConfig,
      alterationGroupingConfig,
      logger: { log() {}, warn() {}, error() {} },
      implementations: {
        createDatabase(options) {
          calls.databaseOptions = options;
          return database;
        },
        AlteredRepository: FakeRepository,
        TrackerClient: FakeTrackerClient,
        TrackerDisplaynameClient: FakeClient,
        TrackerClubClient: FakeClient,
        AggregatorClient: FakeClient,
        NadeoLiveClient: FakeClient,
        TrackmaniaOAuthClient: FakeClient,
        AlteredService: FakeAlteredService,
      },
    });

    assert.deepEqual(calls.databaseOptions, { filePath: "runtime.sqlite", busyTimeoutMs: 42 });
    assert.equal(calls.clubs, DEFAULT_PROJECT_CLUBS);
    assert.equal(calls.trackerOptions.length, 2);
    assert.equal(calls.serviceOptions.repository, runtime.repository);
    assert.equal(calls.serviceOptions.trackerClient, runtime.trackerClient);
    assert.equal(calls.serviceOptions.trackerMapSyncClients[0].client, runtime.trackerLeaderboardClient);
    assert.equal(calls.serviceOptions.liveClient, runtime.liveClient);
    assert.equal(calls.serviceOptions.mapperNameClient, runtime.mapperNameClient);
    assert.equal(calls.serviceOptions.mapCopyConfig, mapCopyConfig);
    assert.equal(calls.serviceOptions.alterationGroupingConfig, alterationGroupingConfig);
    assert.ok(runtime.alteredService instanceof FakeAlteredService);
  });

  test("admin and internal tokens use the shared parser and dedicated trust boundary", () => {
    const auth = createAdminAuth({
      repository: {},
      ubisoftAuth: {},
      sharedAuthStore: null,
      config: {
        ADMIN_TOKEN: "configured-admin",
        ALTERED_INTERNAL_TOKEN: "altered-internal-secret",
        TRACKER_ADMIN_TOKEN: "tracker-secret",
      },
    });

    const request = {
      headers: {
        "x-admin-token": "header-admin",
        authorization: "Bearer bearer-admin",
        "x-aggregator-token": "aggregator-token",
        "x-internal-token": "internal-token",
        "x-service-token": "service-token",
      },
    };
    assert.equal(auth.getHeaderAdminToken(request), "header-admin");
    assert.equal(auth.getHeaderAdminToken({ headers: { authorization: "raw-admin" } }), "raw-admin");
    assert.equal(auth.getInternalServiceToken(request), "aggregator-token");
    assert.equal(
      auth.getInternalServiceToken({
        headers: { authorization: "Bearer ignored", "x-internal-token": "internal-token" },
      }),
      "internal-token"
    );
    const localRequest = (token) => ({
      headers: { host: "altered.localhost", "x-aggregator-token": token },
    });
    assert.equal(auth.isTrustedServiceAdminRequest(localRequest("altered-internal-secret")), true);
    assert.equal(auth.isTrustedServiceAdminRequest(localRequest("configured-admin")), false);
    assert.equal(auth.isTrustedServiceAdminRequest(localRequest("tracker-secret")), false);
  });

  test("the app mounts session, admin, ops, public, and frontend behavior in order", async () => {
    const factoryCalls = [];
    const middleware = (_req, _res, next) => next();
    const auth = {
      disableApiCache(req, res, next) {
        res.setHeader("x-test-api-cache", "disabled");
        next();
      },
      disableAdminApiCache(req, res, next) {
        res.setHeader("x-test-admin-cache", "disabled");
        next();
      },
      requireApiAdmin: middleware,
      requirePageAdmin: middleware,
      rejectMissingStaticAsset: middleware,
      resolveLiveAuthContext: async () => null,
      parseOptionalBoolean: () => undefined,
      getHeaderAdminToken: () => "",
      isConfiguredAdminToken: () => false,
      getStaticAdminSession: () => null,
      getOAuthLoginUrl: () => "/auth/ubisoft/login",
      buildSharedLogoutCookie: () => "",
      isOAuthEnforced: () => false,
      isLocalRequest: () => false,
      getSharedAdminContext: async () => null,
      isOAuthFallbackOpen: () => false,
      isOAuthRequiredButUnavailable: () => false,
    };
    const routeFactories = {
      createOpsAdminRoutes(service) {
        factoryCalls.push(["ops", service]);
        return express.Router().get("/probe", (_req, res) => res.json({ route: "ops" }));
      },
      createAdminRoutes(service, options) {
        factoryCalls.push(["admin", service, options]);
        return express.Router().get("/probe", (_req, res) => res.json({ route: "admin" }));
      },
      createPublicRoutes(service, options) {
        factoryCalls.push(["public", service, options]);
        return express.Router().get("/probe", (_req, res) => res.json({ route: "public" }));
      },
    };
    const repository = {
      admin: {
        countActiveAdminUsers: () => 0,
      },
    };
    const alteredService = { name: "altered" };
    const opsService = { name: "ops" };
    const ubisoftAuth = {
      getSessionFromRequest: () => null,
      clearSession() {},
    };
    const app = createAlteredApp({
      repository,
      alteredService,
      opsService,
      auth,
      ubisoftAuth,
      sharedAuthStore: null,
      frontendDir: path.join(ALTERED_DIR, "..", "..", "sites", "altered.xjk.yt", "frontend"),
      wrWebhookSecret: "wr-secret",
      authConfig: {
        ADMIN_TOKEN: "",
        UBI_OAUTH_ENABLED: false,
        ALTERED_DEV_LOCAL_OPEN: false,
        XJK_SHARED_AUTH_ORIGIN: "https://xjk.yt",
      },
      logger: { error() {} },
      routeFactories,
    });

    const server = await new Promise((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    try {
      const { port } = server.address();
      const baseUrl = `http://127.0.0.1:${port}`;
      const health = await fetch(`${baseUrl}/health`);
      assert.equal(health.status, 200);
      assert.equal(await health.text(), "ok");

      const ops = await fetch(`${baseUrl}/api/v1/admin/ops/probe`);
      assert.deepEqual(await ops.json(), { route: "ops" });
      assert.equal(ops.headers.get("x-test-api-cache"), "disabled");
      assert.equal(ops.headers.get("x-test-admin-cache"), "disabled");

      const admin = await fetch(`${baseUrl}/api/v1/admin/probe`);
      assert.deepEqual(await admin.json(), { route: "admin" });

      const publicResponse = await fetch(`${baseUrl}/api/v1/probe`);
      assert.deepEqual(await publicResponse.json(), { route: "public" });
      assert.equal(publicResponse.headers.get("x-test-api-cache"), "disabled");
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }

    assert.deepEqual(
      factoryCalls.map(([name]) => name),
      ["ops", "admin", "public"]
    );
    assert.equal(factoryCalls[0][1], opsService);
    assert.equal(factoryCalls[1][1], alteredService);
    assert.equal(factoryCalls[1][2].opsService, opsService);
    assert.equal(factoryCalls[2][1], alteredService);
    assert.equal(factoryCalls[2][2].wrWebhookSecret, "wr-secret");
  });

  test("the lifecycle owns startup and shutdown hooks", async () => {
    const previousMapCopy = process.env.ALTERED_MAP_COPY_AUTO_SYNC_STARTUP;
    const previousProjectSource = process.env.ALTERED_PROJECT_SOURCE_AUTO_SYNC_STARTUP;
    process.env.ALTERED_MAP_COPY_AUTO_SYNC_STARTUP = "0";
    process.env.ALTERED_PROJECT_SOURCE_AUTO_SYNC_STARTUP = "0";

    const calls = [];
    const listener = { name: "listener" };
    const app = {
      listen(port, host, callback) {
        calls.push(["listen", port, host]);
        callback();
        return listener;
      },
    };
    const alteredService = {
      catalog: {},
      maps: {},
      monitoring: {
        getLiveMonitorStatus: () => ({ monitor: { enabled: false, scheduleMode: "interval", intervalSeconds: 30 } }),
        stopLiveMonitor: () => calls.push(["stop-live"]),
      },
      players: {
        startMapperNameSyncScheduler: async () => calls.push(["start-mapper"]),
        stopMapperNameSyncScheduler: async () => calls.push(["stop-mapper"]),
      },
      sources: {
        stopProjectSourceSyncScheduler: () => calls.push(["stop-project-source"]),
      },
    };
    const opsService = {
      startScheduler: () => calls.push(["start-ops"]),
      runDueSchedules: async () => calls.push(["run-ops"]),
      stopScheduler: () => calls.push(["stop-ops"]),
    };
    const lifecycle = createAlteredLifecycle({
      app,
      repository: {
        admin: { countActiveAdminUsers: () => 1 },
        catalog: { countAlterations: () => 1 },
      },
      alteredService,
      opsService,
      ubisoftAuth: {
        getStatus: () => ({
          enabled: false,
          configured: false,
          allowlist: { mode: "database", subjects: 0, usernames: 0 },
        }),
        cleanupExpired() {},
      },
      allowlistBootstrap: { seededCount: 0 },
      logger: { log() {}, warn() {}, error() {} },
      port: 4321,
      frontendDir: "frontend",
      dataDir: "data",
      dbFile: "altered.sqlite",
    });

    try {
      assert.equal(lifecycle.startServer(), listener);
      await Promise.resolve();
      assert.deepEqual(calls[0], ["listen", 4321, "127.0.0.1"]);
      lifecycle.stopServices();
      await Promise.resolve();
      assert.ok(calls.some(([name]) => name === "stop-live"));
      assert.ok(calls.some(([name]) => name === "stop-mapper"));
      assert.ok(calls.some(([name]) => name === "stop-project-source"));
      assert.ok(calls.some(([name]) => name === "stop-ops"));
    } finally {
      if (previousMapCopy === undefined) delete process.env.ALTERED_MAP_COPY_AUTO_SYNC_STARTUP;
      else process.env.ALTERED_MAP_COPY_AUTO_SYNC_STARTUP = previousMapCopy;
      if (previousProjectSource === undefined) delete process.env.ALTERED_PROJECT_SOURCE_AUTO_SYNC_STARTUP;
      else process.env.ALTERED_PROJECT_SOURCE_AUTO_SYNC_STARTUP = previousProjectSource;
    }
  });
});

describe("Altered server module graph", () => {
  const relativeFiles = [
    "server.js",
    "src/http/adminAuth.js",
    "src/http/adminAuth/authorizationMiddleware.js",
    "src/http/adminAuth/cacheMiddleware.js",
    "src/http/adminAuth/mutationOrigin.js",
    "src/http/adminAuth/requestContext.js",
    "src/http/adminAuth/sessionContext.js",
    "src/http/adminAuthRoutes.js",
    "src/http/createAlteredApp.js",
    "src/http/frontendRoutes.js",
    "src/runtime/alteredAuthConfig.js",
    "src/runtime/alteredLifecycle.js",
    "src/runtime/alteredRuntimeFactory.js",
    "src/runtime/alteredServerRuntime.js",
    "src/workers/liveMonitorWorker.js",
  ];
  const files = relativeFiles.map((file) => path.join(ALTERED_DIR, file));
  const fileSet = new Set(files.map((file) => path.normalize(file)));
  const graph = new Map();

  before(() => {
    const importPattern = /(?:from\s+|import\s*)["'](\.[^"']+)["']/g;
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      const dependencies = [];
      for (const match of source.matchAll(importPattern)) {
        const resolved = path.normalize(path.resolve(path.dirname(file), match[1]));
        assert.ok(fs.existsSync(resolved), `${path.relative(ALTERED_DIR, file)} imports missing ${match[1]}`);
        if (fileSet.has(resolved)) dependencies.push(resolved);
      }
      graph.set(path.normalize(file), dependencies);
    }
  });

  after(() => graph.clear());

  test("entry points and cohesive modules stay within their size budgets", () => {
    for (const file of files) {
      const lineCount = fs.readFileSync(file, "utf8").split(/\r?\n/).length;
      const relative = path.relative(ALTERED_DIR, file);
      const maximum = relative === "server.js" ? 150 : 600;
      assert.ok(lineCount <= maximum, `${relative} has ${lineCount} lines; expected at most ${maximum}`);
    }
  });

  test("the extracted server modules form an acyclic graph", () => {
    const visiting = new Set();
    const visited = new Set();

    function visit(file, trail = []) {
      if (visited.has(file)) return;
      assert.ok(
        !visiting.has(file),
        `module cycle: ${[...trail, file].map((item) => path.basename(item)).join(" -> ")}`
      );
      visiting.add(file);
      for (const dependency of graph.get(file) || []) visit(dependency, [...trail, file]);
      visiting.delete(file);
      visited.add(file);
    }

    for (const file of files) visit(path.normalize(file));
    assert.equal(visited.size, files.length);
  });
});
