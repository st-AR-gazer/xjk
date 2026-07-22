import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const adminDirectory = fileURLToPath(new URL(".", import.meta.url));
const moduleDirectory = path.join(adminDirectory, "modules");
const expectedModules = [
  "actions.js",
  "activity-api-settings.js",
  "admin-events.js",
  "api.js",
  "click-context.js",
  "click-handler.js",
  "click-maps.js",
  "click-naming.js",
  "click-navigation.js",
  "click-operations.js",
  "click-router.js",
  "click-routes.js",
  "clubs.js",
  "constants.js",
  "dashboard.js",
  "data-loaders.js",
  "drawer-size.js",
  "drawer-controller.js",
  "drawer-tabs.js",
  "drawer.js",
  "formatters.js",
  "form-events.js",
  "jobs.js",
  "lifecycle.js",
  "map-viewer.js",
  "maps.js",
  "naming-detail.js",
  "naming-detail-renderer.js",
  "naming-payload.js",
  "naming-ui.js",
  "request-client.js",
  "request-errors.js",
  "session.js",
  "similarity-profile.js",
  "similarity-progress.js",
  "similarity-status-renderer.js",
  "similarity-scope.js",
  "similarity-search.js",
  "similarity-workspace.js",
  "state.js",
  "status-bar.js",
  "ui.js",
  "workspaces.js",
];

async function readAdminSources() {
  const entries = await Promise.all(
    expectedModules.map(async (name) => [name, await readFile(path.join(moduleDirectory, name), "utf8")])
  );
  return new Map(entries);
}

function exportedNames(source) {
  return new Set(
    [...source.matchAll(/^export\s+(?:(?:async\s+)?function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map(
      (match) => match[1]
    )
  );
}

test("admin entrypoint stays thin and uses the canonical asset token", async () => {
  const [entrypoint, html] = await Promise.all([
    readFile(path.join(adminDirectory, "admin-v2.js"), "utf8"),
    readFile(path.join(adminDirectory, "index.html"), "utf8"),
  ]);

  assert.ok(entrypoint.split("\n").length < 500);
  assert.match(entrypoint, /modules\/lifecycle\.js\?v=2/);
  assert.match(entrypoint, /startAdmin\(\)/);
  for (const stylesheet of [
    "foundation",
    "dashboard",
    "naming-workspace",
    "naming-table",
    "naming-weights",
    "overlays",
  ]) {
    assert.match(html, new RegExp(`styles/${stylesheet}\\.css\\?v=2`));
  }
  assert.doesNotMatch(html, /admin-v2\.css/);
  assert.match(html, /admin-v2\.js\?v=2/);
});

test("admin modules stay bounded and every local named import resolves", async () => {
  assert.deepEqual((await readdir(moduleDirectory)).sort(), [...expectedModules].sort());
  const sources = await readAdminSources();

  for (const [name, source] of sources) {
    assert.ok(source.split("\n").length <= 1_200, `${name} exceeded the 1,200-line module limit`);

    for (const match of source.matchAll(/import\s*{([\s\S]*?)}\s*from\s*["'](.+?)["']/g)) {
      const [, rawNames, specifier] = match;
      if (!specifier.startsWith("./")) continue;
      const targetName = path.basename(specifier.split("?")[0]);
      assert.ok(sources.has(targetName), `${name} imports missing module ${targetName}`);
      const targetExports = exportedNames(sources.get(targetName));
      for (const importedName of rawNames
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)) {
        assert.ok(targetExports.has(importedName), `${name} imports missing ${importedName} from ${targetName}`);
      }
    }
  }
});

test("admin feature modules form an acyclic dependency graph", async () => {
  const sources = await readAdminSources();
  const graph = new Map();
  for (const [name, source] of sources) {
    graph.set(
      name,
      [...source.matchAll(/from\s*["']\.\/([^"'?]+)(?:\?v=2)?["']/g)].map((match) => match[1])
    );
  }

  const visited = new Set();
  const active = new Set();
  const visit = (name, trail = []) => {
    if (active.has(name)) {
      assert.fail(`cyclic admin dependency: ${[...trail, name].join(" -> ")}`);
    }
    if (visited.has(name)) return;
    active.add(name);
    for (const dependency of graph.get(name) || []) visit(dependency, [...trail, name]);
    active.delete(name);
    visited.add(name);
  };

  for (const name of graph.keys()) visit(name);
});

test("admin DOM and API contracts remain characterized", async () => {
  const [html, sources] = await Promise.all([
    readFile(path.join(adminDirectory, "index.html"), "utf8"),
    readAdminSources(),
  ]);
  const combinedSource = [...sources.values()].join("\n");
  const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]).sort();
  const requestedIds = [...combinedSource.matchAll(/getElementById\("([^"]+)"\)/g)].map((match) => match[1]).sort();

  assert.deepEqual(requestedIds, htmlIds);
  for (const endpoint of [
    "/api/v1/admin/auth/status",
    "/api/v1/admin/command-center",
    "/api/v1/admin/jobs/overview",
    "/api/v1/admin/public-api/summary",
    "/api/v1/admin/settings/summary",
    "/api/v1/public/endpoints",
  ]) {
    assert.ok(combinedSource.includes(endpoint), `missing characterized endpoint ${endpoint}`);
  }
  assert.doesNotMatch(combinedSource, /raw jobs payload|raw live status payload/i);
  assert.doesNotMatch(
    sources.get("similarity-scope.js"),
    /renderSimilarityBackfillControls/,
    "similarity scope must notify the renderer instead of calling an undeclared UI function"
  );
  assert.match(
    sources.get("similarity-progress.js"),
    /export function rerenderNamingSimilarityControlSurfaces/,
    "similarity progress owns control-surface rendering"
  );
});
