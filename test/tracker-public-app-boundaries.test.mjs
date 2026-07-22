import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createTrackerBrowserConfig,
  detectTrackerScopeFromPath,
  directPrimaryReadRequested,
} from "../sites/trackers.xjk.yt/frontend/__runtime/shared/public-app/config.js";
import {
  createTrackerController,
  normalizeFeed,
} from "../sites/trackers.xjk.yt/frontend/__runtime/shared/public-app/controller.js";
import { createTrackerLiveStream } from "../sites/trackers.xjk.yt/frontend/__runtime/shared/public-app/live-stream.js";
import {
  createTrackerState,
  createTrackerView,
} from "../sites/trackers.xjk.yt/frontend/__runtime/shared/public-app/state-rendering.js";
import { createTrackerTransport } from "../sites/trackers.xjk.yt/frontend/__runtime/shared/public-app/transport.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const trackerRuntimeRoot = path.join(repoRoot, "sites/trackers.xjk.yt/frontend/__runtime");
const sharedRuntimeRoot = path.join(trackerRuntimeRoot, "shared");
const implementationModules = [
  "commands-events.js",
  "config.js",
  "controller.js",
  "live-stream.js",
  "state-rendering.js",
  "transport.js",
];

function createRoutes(scope) {
  return {
    admin: (page) => `/${scope}/admin/${page}`,
    resolve: (pathname) => `/${scope}/${String(pathname || "").replace(/^\/+/, "")}`,
  };
}

test("tracker browser config preserves mode shims and route-derived scopes", () => {
  const leaderboard = createTrackerBrowserConfig({
    configuredMode: "leaderboard",
    createRouteResolver: createRoutes,
    location: {
      hostname: "leaderboard.localhost",
      href: "http://leaderboard.localhost/wr/?primary_read=yes",
      pathname: "/wr/",
    },
  });

  assert.equal(leaderboard.scope, "leaderboard");
  assert.equal(leaderboard.configuredMode, "leaderboard");
  assert.equal(leaderboard.directPrimaryRead, true);
  assert.equal(leaderboard.isLocalHost, true);
  assert.equal(leaderboard.primaryTrackerBase, "https://trackers.xjk.yt/leaderboard/");
  assert.equal(leaderboard.routes.resolve("/api/v1/stream"), "/leaderboard/api/v1/stream");

  const routeDerived = createTrackerBrowserConfig({
    configuredMode: "unknown",
    createRouteResolver: createRoutes,
    location: {
      hostname: "trackers.xjk.yt",
      href: "https://trackers.xjk.yt/wr/",
      pathname: "/wr/",
    },
  });
  assert.equal(routeDerived.scope, "wr");
  assert.equal(routeDerived.configuredMode, null);
  assert.equal(routeDerived.directPrimaryRead, false);
  assert.equal(routeDerived.isLocalHost, false);

  assert.equal(detectTrackerScopeFromPath("/displayname/search"), "displayname");
  assert.equal(detectTrackerScopeFromPath("/club/123"), "club");
  assert.equal(directPrimaryReadRequested("not a URL"), false);
});

test("tracker transport falls back locally and records gateway-backed reads", async () => {
  const state = {
    source: { primaryReadHealthy: true, remoteProxyRead: false, usePrimaryRead: true },
  };
  const calls = [];
  const config = {
    primaryTrackerBase: "https://trackers.xjk.yt/leaderboard/",
    routes: createRoutes("leaderboard"),
  };
  const transport = createTrackerTransport({
    config,
    state,
    async fetchJson(url, options) {
      calls.push({ options, url });
      if (url.startsWith("https://")) throw new Error("primary unavailable");
      options.onResponse({ headers: { get: (name) => (name === "x-xjk-remote-tracker" ? "1" : null) } });
      return { source: "gateway" };
    },
  });

  assert.deepEqual(await transport.api("api/v1/tracker/status"), { source: "gateway" });
  assert.deepEqual(
    calls.map(({ url }) => url),
    ["https://trackers.xjk.yt/leaderboard/api/v1/tracker/status", "/leaderboard/api/v1/tracker/status"]
  );
  assert.equal(state.source.primaryReadHealthy, false);
  assert.equal(state.source.remoteProxyRead, true);

  state.source.primaryReadHealthy = true;
  calls.length = 0;
  await transport.api("api/v1/admin/tracker/run-now", { admin: true, body: {}, method: "POST" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/leaderboard/api/v1/admin/tracker/run-now");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
  assert.equal(calls[0].options.body, "{}");
});

test("tracker controller switches feed endpoints from runtime mode", async () => {
  const state = {
    maps: [],
    mode: "wr",
    runs: [],
    status: null,
    wrFeed: [],
  };
  const calls = [];
  const viewCalls = [];
  const view = {
    applyModeUI: () => viewCalls.push("mode"),
    applyRunNowAvailability: () => viewCalls.push("availability"),
    elements: { engineError: { textContent: "" }, engineStatus: { textContent: "" } },
    renderEngine: () => viewCalls.push("engine"),
    renderFeed: () => viewCalls.push("feed"),
    renderMaps: () => viewCalls.push("maps"),
    renderRuns: () => viewCalls.push("runs"),
    renderSpotlight: () => viewCalls.push("spotlight"),
    renderStats: () => viewCalls.push("stats"),
  };
  const transport = {
    async api(pathname) {
      calls.push(pathname);
      if (pathname.endsWith("status")) return { runtime: { mode: "leaderboard" } };
      if (pathname.includes("runs")) return { runs: [{ runId: 7 }] };
      if (pathname.includes("leaderboard/latest")) return { entries: [{ mapName: "A01" }] };
      if (pathname.includes("tracked/maps")) return { maps: [{ uid: "map-1" }] };
      throw new Error(`unexpected tracker path: ${pathname}`);
    },
  };
  const controller = createTrackerController({
    applySiteDataLinks: async () => {},
    config: { fallbackRefreshMs: 5000, routes: createRoutes("leaderboard") },
    documentRef: {},
    state,
    transport,
    view,
    windowRef: {},
  });

  await controller.refreshData();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(state.mode, "leaderboard");
  assert.deepEqual(state.runs, [{ runId: 7 }]);
  assert.deepEqual(state.wrFeed, [{ mapName: "A01" }]);
  assert.deepEqual(state.maps, [{ uid: "map-1" }]);
  assert.ok(calls.includes("api/v1/leaderboard/latest?limit=30"));
  assert.ok(!calls.includes("api/v1/wr/latest?limit=30"));
  assert.ok(viewCalls.includes("maps"));

  assert.deepEqual(normalizeFeed({ feed: [1] }), [1]);
  assert.deepEqual(normalizeFeed({ entries: [2] }), [2]);
  assert.deepEqual(normalizeFeed([3]), [3]);
  assert.deepEqual(normalizeFeed(null), []);
});

test("tracker view tolerates optional live-status elements in shared templates", () => {
  const state = {
    liveChecks: [],
    source: { primaryReadHealthy: false, remoteProxyRead: false, usePrimaryRead: false },
    stream: { connected: false },
  };
  const view = createTrackerView({
    config: { fallbackRefreshMs: 5000 },
    documentRef: {},
    elements: { checkFeedEmpty: null, checkFeedList: null, checkFeedNote: null, feedNote: null },
    eventSourceAvailable: true,
    formatDurationMs: () => "",
    formatRelativeTime: () => "",
    historyRef: {},
    mapMatchesQuery: () => false,
    readFeedEntry: () => ({}),
    renderTrackerEngine: () => {},
    requestFrame: () => {},
    state,
  });

  assert.doesNotThrow(() => view.updateFeedNote());
  state.stream.connected = true;
  assert.doesNotThrow(() => view.updateFeedNote());
});

test("tracker live stream updates state, queues refreshes, and reconnects after primary failure", async () => {
  const eventSources = [];
  class FakeEventSource {
    constructor(url) {
      this.closed = false;
      this.listeners = new Map();
      this.url = url;
      eventSources.push(this);
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    close() {
      this.closed = true;
    }

    emit(type, data) {
      for (const listener of this.listeners.get(type) || []) listener({ data });
    }
  }

  let nextTimerId = 0;
  const timers = new Map();
  const windowRef = {
    EventSource: FakeEventSource,
    clearTimeout: (timerId) => timers.delete(timerId),
    setTimeout(callback, delay) {
      nextTimerId += 1;
      timers.set(nextTimerId, { callback, delay });
      return nextTimerId;
    },
  };
  const runTimer = async (timerId) => {
    const timer = timers.get(timerId);
    assert.ok(timer, `missing timer ${timerId}`);
    timers.delete(timerId);
    await timer.callback();
  };
  const config = {
    routes: createRoutes("leaderboard"),
    streamReconnectMs: 3000,
  };
  const state = createTrackerState({
    configuredMode: "leaderboard",
    directPrimaryRead: true,
    isLocalHost: true,
    scope: "leaderboard",
  });
  const viewCalls = [];
  const view = {
    elements: { checkFeedNote: { textContent: "" }, feedNote: { textContent: "" } },
    formatAgo: () => "now",
    hasCheckFeed: true,
    renderEngine: () => viewCalls.push("engine"),
    renderFeed: () => viewCalls.push("feed"),
    renderLiveChecks: () => viewCalls.push("checks"),
    renderSpotlight: () => viewCalls.push("spotlight"),
    renderStats: () => viewCalls.push("stats"),
    updateFeedNote: () => viewCalls.push("note"),
  };
  let refreshCount = 0;
  const stream = createTrackerLiveStream({
    config,
    refreshData: async () => {
      refreshCount += 1;
    },
    state,
    transport: {
      primaryApiUrl: (pathname) => `https://trackers.xjk.yt/leaderboard${pathname}`,
    },
    view,
    windowRef,
  });

  stream.connect();
  assert.equal(eventSources.length, 1);
  assert.equal(eventSources[0].url, "https://trackers.xjk.yt/leaderboard/api/v1/stream");
  eventSources[0].emit("open");
  assert.equal(state.stream.connected, true);

  eventSources[0].emit("tracker-update", JSON.stringify({ run: { runId: 42 } }));
  assert.equal(state.status.latestRun.runId, 42);
  assert.deepEqual(
    [...timers.values()].map(({ delay }) => delay),
    [120]
  );
  await runTimer(1);
  assert.equal(refreshCount, 1);

  eventSources[0].emit(
    "map-checked",
    JSON.stringify({
      at: "2026-07-20T10:00:00.000Z",
      map: { name: "Summer 01", uid: "map-1" },
      progress: { current: 2, total: 10 },
      wr: { changed: true, newHolder: "Player", newMs: 1234, oldMs: 1250 },
    })
  );
  assert.equal(state.liveChecks[0].mapName, "Summer 01");
  assert.equal(view.elements.feedNote.textContent, "Live: checked 2/10 - Summer 01");
  assert.ok(viewCalls.includes("checks"));

  eventSources[0].emit("error");
  assert.equal(eventSources[0].closed, true);
  assert.equal(state.stream.connected, false);
  assert.equal(state.source.primaryReadHealthy, false);
  assert.deepEqual(
    [...timers.values()].map(({ delay }) => delay),
    [3000]
  );

  await runTimer(2);
  assert.equal(eventSources.length, 2);
  assert.equal(eventSources[1].url, "/leaderboard/api/v1/stream");
  stream.stop();
  assert.equal(eventSources[1].closed, true);
  assert.equal(timers.size, 0);
});

test("tracker public entrypoint remains a thin shared composition root", async () => {
  const entrySource = await readFile(path.join(sharedRuntimeRoot, "public-app.js"), "utf8");
  assert.ok(entrySource.split(/\r?\n/).length <= 100, "public-app.js should only compose focused modules");

  for (const moduleName of implementationModules) {
    assert.match(entrySource, new RegExp(`from ["']\\./public-app/${moduleName.replace(".", "\\.")}["']`));
    const moduleSource = await readFile(path.join(sharedRuntimeRoot, "public-app", moduleName), "utf8");
    assert.ok(moduleSource.split(/\r?\n/).length <= 400, `${moduleName} should retain one focused responsibility`);
    assert.doesNotMatch(moduleSource, /from ["']\.\.\/public-app\.js["']/);
  }

  for (const mode of ["wr", "leaderboard"]) {
    const shimSource = await readFile(path.join(trackerRuntimeRoot, mode, "app.js"), "utf8");
    assert.match(shimSource, new RegExp(`mode: ["']${mode}["']`));
    assert.match(shimSource, /import\(["']\.\/tracker-shared\/public-app\.js["']\)/);
  }
});
