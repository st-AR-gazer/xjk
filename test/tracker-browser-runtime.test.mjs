import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createTrackerRouteResolver,
  detectTrackerMountPath,
  formatDurationMs,
  mapMatchesQuery,
  readFeedEntry,
} from "../sites/shared/xjk-core/tracker-runtime.js";

test("tracker route resolution preserves every supported gateway mount", () => {
  const cases = [
    ["/wr/admin", "wr", "/wr"],
    ["/leaderboard/admin/login", "leaderboard", "/leaderboard"],
    ["/__runtime/leaderboard/index.html", "leaderboard", "/__runtime/leaderboard"],
    ["/trackers/wr/admin", "wr", "/trackers/wr"],
    ["/trackers/__runtime/leaderboard/index.html", "leaderboard", "/trackers/__runtime/leaderboard"],
    ["/admin", "wr", ""],
  ];

  cases.forEach(([pathname, mode, expected]) => {
    assert.equal(detectTrackerMountPath(pathname, mode), expected);
  });
});

test("WR and leaderboard browser routes cannot collapse onto the root WR backend", () => {
  const wr = createTrackerRouteResolver("wr", { pathname: "/wr/admin" });
  const leaderboard = createTrackerRouteResolver("leaderboard", { pathname: "/leaderboard/admin" });

  assert.equal(wr.resolve("/api/v1/tracker/status"), "/wr/api/v1/tracker/status");
  assert.equal(leaderboard.resolve("/api/v1/tracker/status"), "/leaderboard/api/v1/tracker/status");
  assert.equal(wr.admin("login"), "/wr/admin/login");
  assert.equal(leaderboard.admin("login"), "/leaderboard/admin/login");
  assert.equal(leaderboard.asset("admin.css"), "/leaderboard/tracker-shared/admin.css");
  assert.notEqual(wr.resolve("/api/v1/stream"), leaderboard.resolve("/api/v1/stream"));
});

test("tracker runtime ports stay distinct in the platform contract", async () => {
  const manifest = JSON.parse(await readFile(new URL("../config/platform-manifest.json", import.meta.url), "utf8"));
  const services = new Map(manifest.services.map((service) => [service.id, service]));
  const wr = services.get("tracker-hub");
  const leaderboard = services.get("tracker-leaderboard-hub");

  assert.ok(wr);
  assert.ok(leaderboard);
  assert.notEqual(wr.ports.production, leaderboard.ports.production);
  assert.notEqual(wr.ports.local, leaderboard.ports.local);
  assert.equal(wr.ports.production, 3031);
  assert.equal(leaderboard.ports.production, 3043);
});

test("tracker display helpers retain stable formatting and filtering", () => {
  assert.equal(formatDurationMs(62123), "01:02.123");
  assert.equal(mapMatchesQuery({ name: "Summer 01", uid: "abc" }, "summer"), true);
  assert.equal(mapMatchesQuery({ name: "Summer 01", uid: "abc" }, "winter"), false);
  assert.deepEqual(readFeedEntry({ map_name: "Map", wr_holder: "Player", wr_ms: 1234 }, { formatAgo: () => "now" }), {
    mapName: "Map",
    holder: "Player",
    newWr: 1234,
    oldWr: 0,
    ago: "now",
  });
});
