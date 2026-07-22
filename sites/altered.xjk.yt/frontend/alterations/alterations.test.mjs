import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readUrlState, writeUrlState } from "./alterations/controller.js";
import { mapModalHtml } from "./alterations/modal.js";
import {
  createAlterationsState,
  filterAndSortCampaignMaps,
  getAlterationCampaigns,
  getAlterationStats,
  getCampaignTimelineInfo,
  normalizeAlteration,
} from "./alterations/state.js";
import { createAlterationsTransport } from "./alterations/transport.js";
import { mapCardHtml } from "./alterations/views.js";

const directory = path.dirname(fileURLToPath(import.meta.url));

test("alteration state normalizes catalog rows and orders campaigns by timeline", () => {
  const state = createAlterationsState();
  state.alterations = [normalizeAlteration({ id: "4", name: "  Ice  ", slug: " ice ", map_count: "3" })];
  state.campaigns = [
    { id: "old", season: "winter", season_year: 2024, alterations: [{ slug: "ice" }], map_count: 2 },
    { id: "discovery", season_key: "snow-discovery", alterations: [{ slug: "ice" }], map_count: 1 },
    { id: "new", season: "spring", season_year: 2024, alterations: [{ slug: "ice" }], map_count: 4 },
  ];

  assert.deepEqual(state.alterations[0], {
    id: 4,
    name: "Ice",
    slug: "ice",
    campaign_count: 0,
    map_count: 3,
  });
  assert.deepEqual(
    getAlterationCampaigns(state, "ice").map((campaign) => campaign.id),
    ["new", "old", "discovery"]
  );
  assert.deepEqual(getCampaignTimelineInfo(state.campaigns[1]), {
    season: "fall",
    year: 2023,
    slot: 4.5,
    value: 20234.5,
  });
  assert.equal(getAlterationStats(state, "ice").mapCount, 7);
});

test("campaign map filtering and sorting are derived without mutating cached rows", () => {
  const state = createAlterationsState();
  const maps = [
    { name: "Beta", author: "Nadeo", wr_ms: 52_000, change_count: 1 },
    { name: "Alpha", author: "Player", wr_ms: 48_000, change_count: 4 },
  ];
  state.mapSearch = "player";
  state.mapSort = "wr_ms";

  assert.deepEqual(
    filterAndSortCampaignMaps(state, maps).map((map) => map.name),
    ["Alpha"]
  );
  assert.deepEqual(
    maps.map((map) => map.name),
    ["Beta", "Alpha"]
  );
});

test("map card and modal templates escape API-provided text", () => {
  const map = {
    map_uid: 'uid" data-danger="true',
    name: '<img src=x onerror="alert(1)">',
    author: "<script>alert(1)</script>",
    campaign_name: "<b>unsafe</b>",
  };

  const card = mapCardHtml(map);
  const modal = mapModalHtml(map);
  assert.doesNotMatch(card, /<script|<img src=x/i);
  assert.doesNotMatch(modal, /<script|<b>unsafe/i);
  assert.match(card, /&lt;img src=x/);
  assert.match(modal, /&lt;script&gt;/);
  assert.doesNotMatch(card, /data-uid="uid" data-danger/);
});

test("alterations transport delegates paging to the shared bounded paginator", async () => {
  const urls = [];
  const pages = [
    { maps: [{ map_uid: "one" }], paging: { has_more: true, next_offset: 250 } },
    { maps: [], paging: { has_more: true, next_offset: 500 } },
  ];
  const transport = createAlterationsTransport({
    fetchJsonImpl: async (url) => {
      urls.push(url);
      return pages.shift();
    },
    resolveUrl: (url) => `/local${url}`,
  });

  assert.deepEqual(await transport.loadAlterationMaps("snow discovery"), [{ map_uid: "one" }]);
  assert.equal(urls.length, 2, "an empty page terminates pagination even when the API reports more rows");
  assert.match(urls[0], /^\/local\/api\/v1\/alterations\/maps\?/);
  assert.match(urls[0], /limit=250/);
  assert.match(urls[0], /alteration=snow\+discovery/);
  assert.match(urls[1], /offset=250/);
});

test("URL state is parsed and written through an injectable browser boundary", () => {
  assert.deepEqual(readUrlState({ search: "?alteration=ice&campaign=42&map=uid" }), {
    alteration: "ice",
    campaign: "42",
    map: "uid",
  });

  const writes = [];
  const historyObject = {
    pushState: (...args) => writes.push(["push", ...args]),
    replaceState: (...args) => writes.push(["replace", ...args]),
  };
  writeUrlState(
    { historyObject, locationObject: { pathname: "/alterations/" } },
    { alteration: "ice", campaign: "42" },
    true
  );
  writeUrlState({ historyObject, locationObject: { pathname: "/alterations/" } });

  assert.equal(writes[0][0], "replace");
  assert.equal(writes[0][3], "?alteration=ice&campaign=42");
  assert.equal(writes[1][3], "/alterations/");
});

test("the HTML-loaded entrypoint remains a thin stable composition root", () => {
  const entrypoint = fs.readFileSync(path.join(directory, "alterations.js"), "utf8");
  const html = fs.readFileSync(path.join(directory, "index.html"), "utf8");
  const transport = fs.readFileSync(path.join(directory, "alterations", "transport.js"), "utf8");

  assert.ok(entrypoint.split(/\r?\n/).length <= 8);
  assert.match(entrypoint, /safe-html\.js\?v=2/);
  assert.match(entrypoint, /alterations\/controller\.js\?v=2/);
  assert.match(html, /<script type="module" src="\.\/alterations\.js\?v=2"><\/script>/);
  assert.match(transport, /shared\/paged-collection\.js\?v=2/);
  assert.doesNotMatch(transport, /function fetchPagedCollection/);
});
