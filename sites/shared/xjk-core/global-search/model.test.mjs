import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  computeResults,
  groupForItem,
  loadRecents,
  normalizeEntry,
  orderedResultGroups,
  parseScope,
  saveRecent,
} from "./model.js";
import { createIntentItems, loadIndexedItems } from "./sources.js";

test("search scopes keep actions, services, and local navigation separate", () => {
  assert.deepEqual(parseScope("> reload"), { query: "reload", kinds: ["action", "intent"] });
  assert.deepEqual(parseScope("@ tools"), { query: "tools", kinds: ["site", "destination"] });
  assert.deepEqual(parseScope("# settings"), { query: "settings", kinds: ["local"] });
  assert.deepEqual(parseScope("  learn  "), { query: "learn", kinds: null });
});

test("entry normalization resolves registered destinations and rejects script URLs", () => {
  const destination = normalizeEntry({
    id: "learn:intro",
    kind: "destination",
    title: "Introduction",
    siteId: "learn",
    path: "/intro",
    keywords: "start guide",
  });
  assert.equal(destination.id, "learn:intro");
  assert.deepEqual(destination.keywords, ["start", "guide"]);
  assert.match(destination.href, /learn/);

  const unsafe = normalizeEntry({ title: "Unsafe", url: "javascript:alert(1)" });
  assert.equal(unsafe.href, "");
});

test("recent history is bounded, de-duplicated, and excludes actions", () => {
  let value = "[]";
  const storage = {
    getItem: () => value,
    setItem: (_key, nextValue) => {
      value = nextValue;
    },
  };

  for (let index = 0; index < 9; index += 1) {
    saveRecent({ id: `site:${index}`, kind: "site" }, storage);
  }
  saveRecent({ id: "site:5", kind: "site" }, storage);
  saveRecent({ id: "action:reload", kind: "action" }, storage);

  assert.deepEqual(loadRecents(storage), ["site:5", "site:8", "site:7", "site:6", "site:4", "site:3", "site:2"]);
});

test("result computation preserves default recents and query-ranked groups", () => {
  const service = normalizeEntry({ id: "site:tools", kind: "site", title: "Tools", priority: 80 });
  const guide = normalizeEntry({ id: "guide:tools", kind: "guide", title: "Tool guide", priority: 20 });
  const local = normalizeEntry({ id: "local:tools", kind: "local", title: "Tool settings", priority: 75 });
  const action = normalizeEntry({ id: "action:reload", kind: "action", title: "Reload", priority: 50 });
  const items = [service, guide, local, action];

  const defaults = computeResults({
    rawQuery: "",
    items,
    localItems: [local],
    actionItems: [action],
    intentItems: [],
    recentIds: [guide.id],
  });
  assert.equal(defaults[0].displayGroup, "Recent");
  assert.ok(defaults.some((item) => item.id === local.id));

  const results = computeResults({
    rawQuery: "tool",
    items,
    localItems: [local],
    actionItems: [action],
    intentItems: [],
  });
  assert.equal(results[0].id, service.id);
  assert.equal(groupForItem(guide), "Learn");
  assert.deepEqual(
    orderedResultGroups(results, "tool").map(([group]) => group),
    ["On this page", "Services", "Learn"]
  );
});

test("record and map intents resolve to Validifier routes", () => {
  const [record] = createIntentItems("record abc 123", { accent: "#fff" });
  const [map] = createIntentItems("uid map/one", { accent: "#fff" });
  assert.match(record.href, /records\/abc%2520123|records\/abc%20123/);
  assert.match(map.href, /maps\/map%252Fone|maps\/map%2Fone/);
});

test("the index source validates HTTP responses and normalizes payload entries", async () => {
  const requests = [];
  const entries = await loadIndexedItems(async (url, options) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => ({ entries: [{ id: "site:tools", kind: "site", title: "Tools", siteId: "tools" }] }),
    };
  });
  assert.equal(entries[0].id, "site:tools");
  assert.equal(requests[0].options.cache, "no-cache");
  assert.match(requests[0].url, /search-index\.json$/);

  await assert.rejects(() => loadIndexedItems(async () => ({ ok: false, status: 503 })), /Search index returned 503/);
});

test("global search entry remains a thin stable facade", async () => {
  const root = new URL("../global-search.js", import.meta.url);
  const source = await readFile(root, "utf8");
  assert.ok(source.split(/\r?\n/).length <= 30);
  assert.match(source, /\.\/global-search\/controller\.js/);
  assert.match(source, /export \{ mountGlobalSearch \}/);

  for (const name of ["controller", "model", "sources", "view"]) {
    const moduleSource = await readFile(new URL(`./${name}.js`, import.meta.url), "utf8");
    assert.ok(moduleSource.split(/\r?\n/).length <= 450, `${name}.js exceeded the local boundary`);
  }
});
