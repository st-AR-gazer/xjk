import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(testDir, "..");
const moduleDir = path.join(frontendDir, "dashboard");
const moduleFiles = fs
  .readdirSync(moduleDir)
  .filter((name) => name.endsWith(".js"))
  .sort()
  .map((name) => path.join(moduleDir, name));
const runtimeFiles = [path.join(frontendDir, "app.js"), ...moduleFiles];

function sourceFor(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function importSpecifiers(source) {
  return [...source.matchAll(/(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)].map((match) => match[1]);
}

function relativeName(filePath) {
  return path.relative(frontendDir, filePath).replaceAll(path.sep, "/");
}

test("dashboard runtime is a small, versioned, acyclic ES-module graph", () => {
  const graph = new Map();

  for (const filePath of runtimeFiles) {
    const source = sourceFor(filePath);
    const lineCount = source.split(/\r?\n/).length;
    const limit = filePath.endsWith(`${path.sep}app.js`) ? 10 : 600;
    assert.ok(lineCount <= limit, `${relativeName(filePath)} has ${lineCount} lines (limit ${limit})`);

    const localDependencies = [];
    for (const specifier of importSpecifiers(source)) {
      assert.match(specifier, /\.js\?v=2$/, `${relativeName(filePath)} must use canonical ?v=2 module URLs`);
      if (!specifier.startsWith(".")) continue;
      const cleanSpecifier = specifier.replace(/\?.*$/, "");
      const resolvedPath = path.resolve(path.dirname(filePath), cleanSpecifier);
      assert.ok(fs.existsSync(resolvedPath), `${relativeName(filePath)} imports missing ${specifier}`);
      if (runtimeFiles.includes(resolvedPath)) localDependencies.push(resolvedPath);
    }
    graph.set(filePath, localDependencies);
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(filePath, trail = []) {
    if (visiting.has(filePath)) {
      assert.fail(`dashboard module cycle: ${[...trail, filePath].map(relativeName).join(" -> ")}`);
    }
    if (visited.has(filePath)) return;
    visiting.add(filePath);
    for (const dependency of graph.get(filePath) || []) visit(dependency, [...trail, filePath]);
    visiting.delete(filePath);
    visited.add(filePath);
  }
  for (const filePath of graph.keys()) visit(filePath);
});

test("dashboard HTML and JavaScript retain the page contract", () => {
  const html = sourceFor(path.join(frontendDir, "index.html"));
  const app = sourceFor(path.join(frontendDir, "app.js"));
  const runtimeSource = moduleFiles.map(sourceFor).join("\n");
  const htmlIds = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
  const referencedIds = new Set(
    [...runtimeSource.matchAll(/getElementById\(["']([^"']+)["']\)/g)].map((match) => match[1])
  );
  const missingIds = [...referencedIds].filter((id) => !htmlIds.has(id)).sort();

  assert.deepEqual(missingIds, [], `dashboard modules reference missing DOM IDs: ${missingIds.join(", ")}`);
  assert.match(html, /<script\s+type="module"\s+src="app\.js\?v=2"><\/script>/);
  assert.equal(app.trim(), 'import { startDashboard } from "./dashboard/lifecycle.js?v=2";\n\nstartDashboard();');
  assert.doesNotMatch(runtimeSource, /\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(/);

  const apiClient = sourceFor(path.join(moduleDir, "api-client.js"));
  assert.match(apiClient, /from "\.\.\/\.\.\/\.\.\/shared\/xjk-core\/http\.js\?v=2"/);
  assert.match(apiClient, /"\/api\/private\/dash", "\/api\/v1\/private\/dash"/);
  assert.match(apiClient, /searchParams\.set\("_t"/);
  assert.doesNotMatch(apiClient, /\bfunction fetchJson\b/);

  const lifecycle = sourceFor(path.join(moduleDir, "lifecycle.js"));
  for (const controlId of [
    "windowHours",
    "projectKey",
    "serviceName",
    "alteredCheckApplyBtn",
    "alteredCheckClearBtn",
    "alteredCheckSearch",
  ]) {
    assert.match(lifecycle, new RegExp(`bindAsyncAction\\(document\\.getElementById\\("${controlId}"\\)`));
  }
  assert.doesNotMatch(lifecycle, /addEventListener\([^\n]*async/);
});

test("formatting and safe route markup helpers remain deterministic", async () => {
  const formatters = await import(pathToFileURL(path.join(moduleDir, "formatters.js")).href);

  assert.equal(formatters.fmtBytes(1536), "1.50 KB");
  assert.equal(formatters.fmtMs(1200), "1.20s");
  assert.equal(formatters.fmtPercent(12.345), "12.35%");
  assert.equal(formatters.clampInt("999", { min: 1, max: 20, fallback: 5 }), 20);
  assert.equal(formatters.clampInt("invalid", { min: 1, max: 20, fallback: 5 }), 5);
  assert.deepEqual(formatters.splitRouteKey("dash.xjk.yt/api/items?q=1"), {
    host: "dash.xjk.yt",
    path: "/api/items",
    query: "?q=1",
    raw: "dash.xjk.yt/api/items?q=1",
  });

  const safeMarkup = formatters.renderKeyCellHtml('dash.xjk.yt/<img src=x onerror="alert(1)">');
  assert.doesNotMatch(safeMarkup, /<img\b/);
  assert.match(safeMarkup, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test("dashboard API client preserves cache busting, JSON bodies, and the legacy fallback", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const calls = [];
  globalThis.window = { location: { origin: "https://dash.xjk.yt" } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const isLegacyFallback = String(url).startsWith("/api/v1/private/dash/");
    return {
      ok: isLegacyFallback,
      status: isLegacyFallback ? 200 : 404,
      statusText: isLegacyFallback ? "OK" : "Not Found",
      async json() {
        return isLegacyFallback ? { dashboard: "ok" } : { error: "missing" };
      },
    };
  };

  try {
    const { fetchDashJson } = await import(pathToFileURL(path.join(moduleDir, "api-client.js")).href);
    const result = await fetchDashJson("/trackers/control?mode=test", {
      method: "POST",
      body: { tracker: "wr" },
    });

    assert.deepEqual(result, { dashboard: "ok" });
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /^\/api\/private\/dash\/trackers\/control\?mode=test&_t=\d+$/);
    assert.match(calls[1].url, /^\/api\/v1\/private\/dash\/trackers\/control\?mode=test&_t=\d+$/);
    assert.equal(calls[1].options.credentials, "same-origin");
    assert.equal(calls[1].options.cache, "no-store");
    assert.equal(calls[1].options.method, "POST");
    assert.equal(calls[1].options.body, JSON.stringify({ tracker: "wr" }));
    assert.equal(calls[1].options.headers["content-type"], "application/json");
    assert.equal(calls[1].options.headers["cache-control"], "no-cache");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("traffic routing and severity helpers preserve dashboard behavior", async () => {
  const traffic = await import(pathToFileURL(path.join(moduleDir, "traffic.js")).href);
  const { state } = await import(pathToFileURL(path.join(moduleDir, "state.js")).href);
  const previousFilters = { ...state.filters };

  try {
    state.filters.windowHours = 168;
    state.filters.projectKey = "project-a";
    state.filters.service = "gateway";

    assert.equal(traffic.routeErrorPercent({ requests: 20, errorRequests: 5 }), 25);
    assert.equal(traffic.routeErrorPercent({ errorRatePct: 150 }), 100);
    assert.equal(traffic.routeErrorHeat(0).severity, "none");
    assert.equal(traffic.routeErrorHeat(9).severity, "low");
    assert.equal(traffic.routeErrorHeat(35).severity, "high");
    assert.equal(traffic.routeErrorHeat(75).severity, "critical");
    assert.equal(traffic.timelineBucketForWindow(6), "minute");
    assert.equal(traffic.timelineBucketForWindow(48), "quarter_hour");
    assert.equal(traffic.timelineBucketForWindow(49), "hour");
    assert.equal(traffic.timelineBucketForWindow(24 * 22), "day");

    const incoming = traffic.routeSubtabRequest("incoming");
    const outgoing = traffic.routeSubtabRequest("outgoing");
    const nadeo = traffic.routeSubtabRequest("nadeo");
    assert.equal(incoming.cacheKey, "incoming");
    assert.match(incoming.path, /direction=incoming&dimension=route&limit=12$/);
    assert.equal(outgoing.cacheKey, "outgoing");
    assert.match(outgoing.path, /direction=outgoing&dimension=target&limit=12$/);
    assert.equal(nadeo.cacheKey, "nadeo");
    assert.match(nadeo.path, /direction=outgoing&dimension=nadeo_route&limit=12$/);
  } finally {
    Object.assign(state.filters, previousFilters);
  }
});
