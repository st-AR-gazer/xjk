import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ALLOWED_EXTERNAL_SEARCH_HOSTS, buildGlobalSearchIndex, OUTPUT_FILE } from "./build-global-search-index.mjs";
import { rankSearchItems } from "../sites/shared/xjk-core/search-engine.js";
import { XJK_SITES } from "../sites/shared/xjk-core/site-registry.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(repoRoot, OUTPUT_FILE);
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const expected = buildGlobalSearchIndex();
const publicSiteIds = new Set(XJK_SITES.filter((site) => site.public && !site.internal).map((site) => site.id));
const supportedKinds = new Set(["site", "destination", "tool", "guide", "plugin", "archive"]);
const ids = new Set();
const destinations = new Set();

assert.equal(index.version, 1, "unexpected global search index version");
assert.ok(Array.isArray(index.entries), "global search index must expose an entries array");
assert.deepEqual(index.sources, expected.sources, "global search source manifest is stale");
assert.deepEqual(index.counts, expected.counts, "global search source counts are stale");
assert.deepEqual(index.entries, expected.entries, "global search index is stale; run build:global-search");

for (const entry of index.entries) {
  assert.match(entry.id, /^[a-z0-9]+(?:(?:[:._/-])[a-z0-9]+)*$/, `invalid search id: ${entry.id}`);
  assert.ok(!ids.has(entry.id), `duplicate search id: ${entry.id}`);
  ids.add(entry.id);

  assert.ok(supportedKinds.has(entry.kind), `${entry.id} has unsupported kind: ${entry.kind}`);
  assert.ok(entry.title, `${entry.id} is missing a title`);
  assert.equal(typeof entry.description, "string", `${entry.id} is missing a description`);
  assert.ok(publicSiteIds.has(entry.siteId), `${entry.id} references a private or unknown site`);
  assert.ok(entry.siteLabel, `${entry.id} is missing a site label`);
  assert.ok(Array.isArray(entry.keywords), `${entry.id} keywords must be an array`);
  assert.ok(Array.isArray(entry.aliases), `${entry.id} aliases must be an array`);
  assert.equal(new Set(entry.keywords).size, entry.keywords.length, `${entry.id} has duplicate keywords`);
  assert.equal(new Set(entry.aliases).size, entry.aliases.length, `${entry.id} has duplicate aliases`);
  assert.ok(Number.isFinite(entry.priority), `${entry.id} has an invalid priority`);

  let destination;
  if (entry.url) {
    const url = new URL(entry.url);
    assert.equal(url.protocol, "https:", `${entry.id} has a non-HTTPS external URL`);
    assert.ok(ALLOWED_EXTERNAL_SEARCH_HOSTS.has(url.hostname), `${entry.id} has an unapproved external host`);
    assert.equal(Boolean(entry.path || entry.query || entry.hash), false, `${entry.id} mixes external and site routes`);
    destination = `external:${url.toString()}`;
  } else {
    assert.match(entry.path, /^\//, `${entry.id} is missing a rooted site path`);
    assert.equal(entry.path.includes("\\"), false, `${entry.id} has an unsafe path`);
    if (entry.query) assert.match(entry.query, /^\?/, `${entry.id} has an invalid query`);
    if (entry.hash) assert.match(entry.hash, /^#/, `${entry.id} has an invalid hash`);
    destination = `site:${entry.siteId}:${entry.path}:${entry.query || ""}:${entry.hash || ""}`;
  }

  assert.ok(!destinations.has(destination), `duplicate search destination: ${destination}`);
  destinations.add(destination);
}

assert.equal(
  index.entries.some((entry) => entry.siteId === "dash" || entry.siteId === "admin"),
  false
);
assert.equal(
  index.entries.some((entry) => /(^|\/)admin(\/|$)/i.test(entry.path || "")),
  false
);
assert.equal(
  index.entries.some((entry) => entry.id === "tool:replay-verification"),
  false,
  "Validifier must remain a standalone site instead of a Tools catalog entry"
);

for (const expectedId of [
  "destination:account:preferences",
  "destination:account:spaces",
  "destination:aggregator:database",
  "destination:validifier:live",
  "destination:validifier:records",
  "destination:validifier:maps",
  "destination:validifier:submit",
  "destination:validifier:clients",
  "destination:validifier:recent",
]) {
  assert.ok(ids.has(expectedId), `global search index is missing ${expectedId}`);
}

const validifierTypo = rankSearchItems(index.entries, "validifer", { limit: 6 });
assert.equal(validifierTypo[0]?.title, "Validifier", "typo search should rank Validifier first");
assert.ok(
  validifierTypo.slice(0, 4).some((entry) => entry.siteId === "validifier"),
  "typo search should keep the canonical Validifier site near the top"
);

const underwater = rankSearchItems(index.entries, "underwater", { limit: 16 });
assert.ok(
  underwater[0]?.title.toLowerCase().includes("underwater"),
  "underwater search should have an exact title match"
);
assert.ok(
  underwater.some((entry) => entry.id === "tool:underwater-converter"),
  "underwater search should find the map converter"
);
assert.ok(
  underwater.some((entry) => entry.id.startsWith("guide:") && entry.siteId === "learn"),
  "underwater search should find Learn guides"
);
assert.equal(
  underwater.some((entry) => entry.id === "site:archive"),
  false,
  "fuzzy matching should not promote unrelated long keyword documents"
);

const rallyUnderwater = rankSearchItems(index.entries, "rally underwater", { limit: 8 });
assert.ok(
  rallyUnderwater.some((entry) => entry.siteId === "learn" && entry.kind === "guide"),
  "multi-token search should rank a Rally underwater guide"
);

console.log(
  `global search ok: ${index.entries.length} entries, ${ids.size} unique ids, ${destinations.size} unique destinations, ranking smoke tests ok`
);
