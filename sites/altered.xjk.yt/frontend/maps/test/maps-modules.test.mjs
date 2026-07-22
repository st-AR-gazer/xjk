import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const mapsDirectory = path.resolve(testDirectory, "..");
const moduleDirectory = path.join(mapsDirectory, "modules");
const expectedModules = [
  "api-client.js",
  "config.js",
  "display-name-refresh.js",
  "display-names.js",
  "dom.js",
  "elements.js",
  "filters.js",
  "formatters.js",
  "lifecycle.js",
  "map-model.js",
  "map-view.js",
  "query.js",
  "state.js",
];
const moduleFiles = expectedModules.map((name) => path.join(moduleDirectory, name));
const runtimeFiles = [path.join(mapsDirectory, "maps.js"), ...moduleFiles];

function sourceFor(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function importSpecifiers(source) {
  return [...source.matchAll(/(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)].map((match) => match[1]);
}

function exportedNames(source) {
  const names = new Set(
    [...source.matchAll(/^export\s+(?:(?:async\s+)?function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map(
      (match) => match[1]
    )
  );
  for (const match of source.matchAll(/^export\s*{([^}]+)}/gm)) {
    for (const entry of match[1].split(",")) {
      const exportedName = entry
        .trim()
        .split(/\s+as\s+/)
        .at(-1);
      if (exportedName) names.add(exportedName);
    }
  }
  return names;
}

function relativeName(filePath) {
  return path.relative(mapsDirectory, filePath).replaceAll(path.sep, "/");
}

function moduleUrl(name) {
  const url = pathToFileURL(path.join(moduleDirectory, name));
  url.searchParams.set("v", "2");
  return url.href;
}

test("maps runtime is a bounded, versioned, acyclic ES-module graph", () => {
  assert.deepEqual(
    fs
      .readdirSync(moduleDirectory)
      .filter((name) => name.endsWith(".js"))
      .sort(),
    expectedModules
  );

  const graph = new Map();
  const sources = new Map(runtimeFiles.map((filePath) => [filePath, sourceFor(filePath)]));
  for (const filePath of runtimeFiles) {
    const source = sources.get(filePath);
    const lineCount = source.split(/\r?\n/).length;
    const limit = filePath.endsWith(`${path.sep}maps.js`) ? 10 : 600;
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

    for (const match of source.matchAll(/import\s*{([^}]*)}\s*from\s*["']([^"']+)["']/g)) {
      const [, rawNames, specifier] = match;
      if (!specifier.startsWith(".")) continue;
      const resolvedPath = path.resolve(path.dirname(filePath), specifier.replace(/\?.*$/, ""));
      const targetSource = sources.get(resolvedPath);
      if (!targetSource) continue;
      const targetExports = exportedNames(targetSource);
      for (const entry of rawNames.split(",")) {
        const importedName = entry.trim().split(/\s+as\s+/)[0];
        if (importedName) {
          assert.ok(
            targetExports.has(importedName),
            `${relativeName(filePath)} imports missing ${importedName} from ${relativeName(resolvedPath)}`
          );
        }
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(filePath, trail = []) {
    if (visiting.has(filePath)) {
      assert.fail(`maps module cycle: ${[...trail, filePath].map(relativeName).join(" -> ")}`);
    }
    if (visited.has(filePath)) return;
    visiting.add(filePath);
    for (const dependency of graph.get(filePath) || []) visit(dependency, [...trail, filePath]);
    visiting.delete(filePath);
    visited.add(filePath);
  }
  for (const filePath of graph.keys()) visit(filePath);
});

test("maps HTML, selectors, endpoints, and shared primitives retain the page contract", () => {
  const html = sourceFor(path.join(mapsDirectory, "index.html"));
  const entrypoint = sourceFor(path.join(mapsDirectory, "maps.js"));
  const runtimeSource = moduleFiles.map(sourceFor).join("\n");
  const htmlIds = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
  const referencedIds = new Set(
    [...runtimeSource.matchAll(/getElementById\(["']([^"']+)["']\)/g)].map((match) => match[1])
  );

  assert.deepEqual(
    [...referencedIds].filter((id) => !htmlIds.has(id)).sort(),
    [],
    "maps modules reference missing DOM IDs"
  );
  assert.match(html, /<script\s+type="module"\s+src="\.\/maps\.js\?v=2"><\/script>/);
  assert.equal(entrypoint.trim(), 'import { startMaps } from "./modules/lifecycle.js?v=2";\n\nstartMaps();');
  assert.doesNotMatch(runtimeSource, /\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(runtimeSource, /addEventListener\([^\n]*async/);

  const apiClient = sourceFor(path.join(moduleDirectory, "api-client.js"));
  const dom = sourceFor(path.join(moduleDirectory, "dom.js"));
  const mapView = sourceFor(path.join(moduleDirectory, "map-view.js"));
  assert.match(apiClient, /from "\.\.\/\.\.\/\.\.\/\.\.\/shared\/xjk-core\/http\.js\?v=2"/);
  assert.doesNotMatch(apiClient, /\bfunction fetchJson\b/);
  assert.match(dom, /from "\.\.\/\.\.\/\.\.\/\.\.\/shared\/xjk-core\/dom-utils\.js\?v=2"/);
  assert.match(mapView, /\bsafeImageUrl\(/);
  assert.match(mapView, /\b(?:appendElement|createElement)\(/);

  for (const endpoint of [
    "/api/v1/alterations/stats",
    "/api/v1/alterations/maps/filters",
    "/api/v1/alterations/maps",
    "/api/v1/public/maps",
    "/api/v1/public/display-names/queue",
    "/api/v1/public/display-names/resolve",
  ]) {
    assert.ok(runtimeSource.includes(endpoint), `missing characterized endpoint ${endpoint}`);
  }
});

test("maps formatting, URL guards, and display-name data resist markup injection", async () => {
  const [dom, formatters, displayNames] = await Promise.all([
    import(moduleUrl("dom.js")),
    import(moduleUrl("formatters.js")),
    import(moduleUrl("display-names.js")),
  ]);
  const attack = '<img src=x onerror="globalThis.compromised=true">';

  assert.equal(
    formatters.escapeNadeoMarkup(`$f00${attack}`),
    "&lt;img src=x onerror=&quot;globalThis.compromised=true&quot;&gt;"
  );
  assert.equal(dom.safeImageUrl("javascript:alert(1)"), "");
  assert.equal(dom.safeImageUrl("data:text/html,<script>alert(1)</script>"), "");
  assert.equal(dom.safeImageUrl("https://images.example.test/map.jpg"), "https://images.example.test/map.jpg");

  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement(tagName) {
      return {
        tagName,
        className: "",
        textContent: "",
        title: "",
        attributes: {},
        dataset: {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
      };
    },
  };
  try {
    const element = dom.createElement("span", {
      className: "map-name",
      text: attack,
      title: attack,
      attributes: { "aria-label": attack },
      dataset: { uid: attack },
    });
    assert.equal(element.textContent, attack);
    assert.equal(element.title, attack);
    assert.equal(element.attributes["aria-label"], attack);
    assert.equal(element.dataset.uid, attack);
    assert.equal("innerHTML" in element, false);
  } finally {
    globalThis.document = originalDocument;
  }

  const accountId = "00112233-4455-6677-8899-aabbccddeeff";
  const resolved = displayNames.applyResolvedDisplayNamesToMap(
    { author: accountId, author_display_name: "" },
    { [accountId]: attack }
  );
  assert.equal(resolved.changed, true);
  assert.equal(resolved.map.author_display_name, attack);
});

test("maps query and model helpers preserve filtering semantics", async () => {
  const [query, model, stateModule] = await Promise.all([
    import(moduleUrl("query.js")),
    import(moduleUrl("map-model.js")),
    import(moduleUrl("state.js")),
  ]);
  const { state } = stateModule;
  const previous = {
    filters: structuredClone(state.filters),
    options: state.options,
    page: state.page,
    randomSeed: state.randomSeed,
  };

  try {
    state.options = {
      season_tags: [
        { key: "summer-2025", campaign_ids: ["summer-campaign"] },
        { key: "community", campaign_ids: ["community-campaign"] },
      ],
    };
    state.page = 3;
    state.randomSeed = "00112233-4455-4677-8899-aabbccddeeff";
    state.filters = {
      ...state.filters,
      q: "technical",
      seasonInclude: ["summer"],
      yearInclude: ["2025"],
      otherInclude: ["community"],
      alterationInclude: ["ice"],
      statusInclude: ["active"],
      wrInclude: ["with_wr"],
      mapNumber: "12",
      environmentInclude: ["Stadium"],
      mapTypeInclude: ["Race"],
      sort: "random",
    };

    const params = query.buildMapQuery();
    assert.equal(params.get("limit"), "48");
    assert.equal(params.get("offset"), "96");
    assert.equal(params.get("sort"), "random");
    assert.equal(params.get("seed"), state.randomSeed);
    assert.equal(params.get("q"), "technical");
    assert.equal(params.get("campaign_ids"), "summer-campaign,community-campaign");
    assert.equal(params.get("alteration_slugs"), "ice");
    assert.equal(params.get("statuses"), "active");
    assert.equal(params.get("wr_states"), "with_wr");
    assert.equal(params.get("map_number"), "12");
    assert.equal(params.get("environments"), "Stadium");
    assert.equal(params.get("map_types"), "Race");

    assert.equal(query.normalizeSeed(state.randomSeed.toUpperCase()), state.randomSeed);
    assert.equal(query.normalizeSeed("not-a-seed"), "");
    assert.deepEqual(query.classifySeasonTagKey("Summer-2025"), {
      kind: "season-year",
      base: "summer",
      year: "2025",
    });
    assert.equal(model.getMapUidValue({ mapUid: " map-uid " }), "map-uid");
    assert.equal(model.getMapNumberLabel({ mapnumber: [1, 2] }), "1.2");
    assert.equal(model.getChangeCountValue({ wrHistory: [{}, {}] }), 2);
    assert.equal(model.trackingStatusClass("live"), "active");
    assert.equal(model.trackingStatusClass("unexpected"), "idle");
  } finally {
    state.filters = previous.filters;
    state.options = previous.options;
    state.page = previous.page;
    state.randomSeed = previous.randomSeed;
  }
});

test("maps API client routes through the shared JSON request primitive", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const calls = [];
  globalThis.window = {
    __alteredUrl(pathname) {
      return `/altered${pathname}`;
    },
  };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return { ok: true };
      },
    };
  };

  try {
    const api = await import(moduleUrl("api-client.js"));
    assert.deepEqual(await api.getJson("/api/test"), { ok: true });
    assert.deepEqual(await api.postJson("/api/test", { mapUid: "abc" }), { ok: true });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "/altered/api/test");
    assert.equal(calls[0].options.credentials, "same-origin");
    assert.equal(calls[0].options.cache, "no-store");
    assert.equal(calls[1].url, "/altered/api/test");
    assert.equal(calls[1].options.method, "POST");
    assert.equal(calls[1].options.body, JSON.stringify({ mapUid: "abc" }));
    assert.equal(calls[1].options.headers["content-type"], "application/json");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});
