import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { navigateWithinShell, shouldHandleRouteClick } from "./app/navigation.js";
import { createOverviewController } from "./app/overview-controller.js";
import { overviewMarkup } from "./app/overview-view.js";
import {
  getRouteContext,
  routeHref,
  runtimeApiHref,
  runtimeEmbedHref,
  stripBasePrefix,
  withBase,
} from "./app/route-model.js";
import { EMBED_STYLE_ID, mountRuntime, runtimeMarkup } from "./app/runtime-frame.js";
import {
  fetchRuntimeStatuses,
  formatAgo,
  formatDisplaynameOverview,
  formatTrackerOverview,
  runtimeStatusRequests,
  summarizeReachability,
} from "./app/service-status.js";

const shellDirectory = path.dirname(fileURLToPath(import.meta.url));

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    contains: (name) => values.has(name),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    toggle: (name, force) => (force ? values.add(name) : values.delete(name)),
  };
}

test("tracker shell route model preserves direct and mounted gateway paths", () => {
  assert.deepEqual(getRouteContext("/trackers/leaderboard/admin/login"), {
    route: "leaderboard",
    basePrefix: "/trackers",
  });
  assert.deepEqual(getRouteContext("/displayname/queue"), { route: "displayname", basePrefix: "" });
  assert.deepEqual(getRouteContext("/trackers/unknown"), { route: "overview", basePrefix: "/trackers" });
  assert.equal(stripBasePrefix("/trackers", "/trackers"), "/");
  assert.equal(withBase("/trackers", "/"), "/trackers/");
  assert.equal(routeHref("/trackers", "wr"), "/trackers/wr/");
  assert.equal(runtimeEmbedHref({ basePrefix: "/trackers", route: "club" }), "/trackers/__runtime/club/index.html");
  assert.equal(runtimeApiHref("/trackers", "leaderboard", "api/v1/status"), "/trackers/leaderboard/api/v1/status");
});

test("shell navigation preserves search and hash while avoiding same-URL iframe remounts", () => {
  const calls = [];
  const dependencies = {
    locationObject: {
      origin: "https://trackers.xjk.yt",
      href: "https://trackers.xjk.yt/trackers/wr/?view=live#latest",
    },
    historyObject: { pushState: (...args) => calls.push(["push", ...args]) },
    renderRoute: () => calls.push("render"),
    scrollTo: (options) => calls.push(["scroll", options]),
  };

  assert.equal(navigateWithinShell("/trackers/leaderboard/?map=abc#changes", dependencies), true);
  assert.deepEqual(calls, [
    ["push", {}, "", "/trackers/leaderboard/?map=abc#changes"],
    "render",
    ["scroll", { top: 0, left: 0, behavior: "auto" }],
  ]);

  calls.length = 0;
  assert.equal(navigateWithinShell("/trackers/wr/?view=live#latest", dependencies), false);
  assert.deepEqual(calls, []);
});

test("route click policy leaves modified, downloaded, and new-tab links to the browser", () => {
  const anchor = { target: "", hasAttribute: () => false };
  const baseEvent = {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  };
  assert.equal(shouldHandleRouteClick(baseEvent, anchor), true);
  assert.equal(shouldHandleRouteClick({ ...baseEvent, ctrlKey: true }, anchor), false);
  assert.equal(shouldHandleRouteClick(baseEvent, { ...anchor, target: "_blank" }), false);
  assert.equal(shouldHandleRouteClick(baseEvent, { ...anchor, hasAttribute: () => true }), false);
});

test("overview status transport keeps per-runtime failures isolated", async () => {
  const urls = [];
  const statuses = await fetchRuntimeStatuses("/trackers", async (url) => {
    urls.push(url);
    if (url.includes("displayname")) throw new Error("offline");
    return { ok: true };
  });

  assert.deepEqual(
    urls,
    runtimeStatusRequests("/trackers").map(({ url }) => url)
  );
  assert.equal(statuses.filter(({ result }) => result.status === "fulfilled").length, 3);
  assert.equal(statuses.find(({ key }) => key === "displayname").result.status, "rejected");
});

test("service status formatting retains runtime and reachability semantics", () => {
  assert.deepEqual(
    formatTrackerOverview({ runtime: { running: true }, summary: { trackedMaps: 12 }, trackedDueNow: 2 }, "WR"),
    { label: "Running", meta: "12 maps tracked · 2 due now", tone: "ok" }
  );
  assert.deepEqual(formatDisplaynameOverview({ queueSize: 4, schedulerEnabled: false }), {
    label: "Reachable",
    meta: "4 queued · scheduler paused",
    tone: "warn",
  });
  assert.equal(formatAgo("2025-01-01T00:00:00.000Z", Date.parse("2025-01-01T01:01:00.000Z")), "1h ago");
  assert.deepEqual(summarizeReachability(2, 4), {
    active: { state: "2", copy: "2 runtimes responded to health checks.", tone: "ok" },
    health: { state: "Partial", copy: "2 of 4 runtimes are reachable right now.", tone: "warn" },
    network: {
      state: "2/4",
      copy: "One or more runtime services are currently unavailable.",
      tone: "warn",
    },
  });
});

test("overview controller renders partial reachability and owns its polling timer", async () => {
  const elements = new Map();
  const createElement = () => ({ classList: createClassList(), textContent: "" });
  for (const key of ["active", "health", "network"]) {
    elements.set(`#overview-${key}-value`, createElement());
    elements.set(`#overview-${key}-copy`, createElement());
  }
  for (const route of ["wr", "leaderboard", "displayname", "club"]) {
    elements.set(`[data-runtime-pill="${route}"]`, createElement());
    elements.set(`[data-runtime-meta="${route}"]`, createElement());
  }

  let scheduled;
  let cleared = 0;
  const controller = createOverviewController({
    root: { querySelector: (selector) => elements.get(selector) },
    context: { basePrefix: "/trackers" },
    fetchJsonImpl: async (url) => {
      if (url.includes("displayname")) throw new Error("offline");
      if (url.includes("/wr/")) return { runtime: { running: true }, summary: { trackedMaps: 5 } };
      return {};
    },
    setIntervalImpl: (callback, milliseconds) => {
      scheduled = { callback, milliseconds };
      return 17;
    },
    clearIntervalImpl: (timerId) => {
      cleared = timerId;
    },
  });

  await controller.refresh();
  assert.equal(elements.get("#overview-active-value").textContent, "3");
  assert.equal(elements.get("#overview-health-value").textContent, "Partial");
  assert.equal(elements.get('[data-runtime-pill="wr"]').textContent, "Running");
  assert.equal(elements.get('[data-runtime-pill="displayname"]').textContent, "Offline");

  controller.start();
  assert.equal(scheduled.milliseconds, 15_000);
  controller.stop();
  assert.equal(cleared, 17);
});

test("overview and runtime views derive mounted links from one route model", () => {
  const overview = overviewMarkup({ route: "overview", basePrefix: "/trackers" });
  assert.equal((overview.match(/data-route-link/g) || []).length, 4);
  assert.match(overview, /href="\/trackers\/wr\/"/);
  assert.match(overview, /href="\/trackers\/club\/"/);

  const runtime = runtimeMarkup({ route: "leaderboard", basePrefix: "/trackers" });
  assert.match(runtime, /runtime-host--leaderboard/);
  assert.match(runtime, /src="\/trackers\/__runtime\/leaderboard\/index\.html"/);
  assert.match(runtime, /title="Leaderboard"/);
});

test("runtime mounting injects iframe styles once and removes its load listener", () => {
  const styles = new Map();
  const documentObject = {
    getElementById: (id) => styles.get(id) || null,
    createElement: () => ({}),
    head: { appendChild: (style) => styles.set(style.id, style) },
  };
  const listeners = new Map();
  const frame = {
    contentDocument: documentObject,
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name, listener) => {
      if (listeners.get(name) === listener) listeners.delete(name);
    },
  };
  const card = { classList: createClassList(["is-loading"]) };
  const root = {
    querySelector: (selector) => (selector === "[data-runtime-frame]" ? frame : card),
  };

  const cleanup = mountRuntime(root);
  assert.equal(styles.size, 1);
  assert.ok(styles.has(EMBED_STYLE_ID));
  assert.equal(card.classList.contains("is-loading"), false);
  listeners.get("load")();
  assert.equal(styles.size, 1);
  cleanup();
  assert.equal(listeners.has("load"), false);
});

test("tracker shell entrypoint remains a thin module bootstrap", () => {
  const entrypoint = fs.readFileSync(path.join(shellDirectory, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(shellDirectory, "..", "index.html"), "utf8");
  const moduleDirectory = path.join(shellDirectory, "app");
  const modules = fs.readdirSync(moduleDirectory).filter((name) => name.endsWith(".js"));

  assert.ok(entrypoint.split(/\r?\n/).length <= 8);
  assert.doesNotMatch(entrypoint, /\(function|=>\s*\{/);
  assert.match(entrypoint, /\.\/app\/controller\.js\?v=2/);
  assert.match(html, /<script type="module" src="\/trackers-shell\/app\.js\?v=2"><\/script>/);
  modules.forEach((name) => {
    const lines = fs.readFileSync(path.join(moduleDirectory, name), "utf8").split(/\r?\n/).length;
    assert.ok(lines <= 250, `${name} should remain a focused tracker-shell module`);
  });
  assert.ok(fs.existsSync(path.join(shellDirectory, "README.md")));
});
