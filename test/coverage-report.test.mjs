import assert from "node:assert/strict";
import test from "node:test";

import { areaForSource, buildReport, formatDelta, percentage } from "../scripts/report-coverage.mjs";

function metric(covered, total) {
  return { covered, total };
}

function fileCoverage(covered, total) {
  return {
    branches: metric(covered, total),
    functions: metric(covered, total),
    lines: metric(covered, total),
    statements: metric(covered, total),
  };
}

test("coverage areas follow service, site, and repository ownership", () => {
  assert.equal(areaForSource("services/altered/src/server.js"), "services/altered");
  assert.equal(areaForSource("sites/learn.xjk.yt/frontend/app.js"), "sites/learn.xjk.yt");
  assert.equal(areaForSource("deploy/local/local-gateway.js"), "deploy");
});

test("coverage reports aggregate deterministic per-area and total counters", () => {
  const report = buildReport({
    "services/altered/src/server.js": fileCoverage(5, 10),
    "services/altered/src/app.js": fileCoverage(3, 5),
    "sites/learn.xjk.yt/frontend/app.js": fileCoverage(0, 5),
    total: fileCoverage(999, 999),
  });

  assert.deepEqual(Object.keys(report.areas), ["services/altered", "sites/learn.xjk.yt"]);
  assert.deepEqual(report.areas["services/altered"].lines, { covered: 8, total: 15, pct: 53.33 });
  assert.deepEqual(report.total.lines, { covered: 8, total: 20, pct: 40 });
});

test("empty coverage dimensions report as complete instead of dividing by zero", () => {
  assert.equal(percentage({ covered: 0, total: 0 }), 100);
});

test("coverage deltas distinguish a zero baseline from a new area", () => {
  assert.equal(formatDelta(5, 0), "+5.00");
  assert.equal(formatDelta(5, undefined), "new");
});
