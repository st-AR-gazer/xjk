import assert from "node:assert/strict";
import test from "node:test";

import { createApiCatalog } from "../src/api/catalog.js";

const expectedEndpoints = {
  meta: ["GET /api/v1/catalog", "GET /api/v1/meta"],
  identity: [
    "GET /api/v1/display-names",
    "POST /api/v1/display-names/resolve",
    "GET /api/v1/display-names/resolve/:accountId",
    "GET /api/v1/display-names/by-name",
    "GET /api/v1/display-names/search",
    "GET /api/v1/display-names/candidates",
    "GET /api/v1/display-names/candidates/details",
  ],
  projects: [
    "GET /api/v1/projects",
    "GET /api/v1/projects/:projectKey",
    "GET /api/v1/projects/:projectKey/maps",
    "GET /api/v1/projects/:projectKey/instances",
    "GET /api/v1/maps/:mapUid/projects",
  ],
  events: [
    "GET /api/v1/events/recent",
    "GET /api/v1/events/facets",
    "GET /api/v1/queue/wr-baseline",
    "GET /api/v1/metrics/overview",
    "GET /api/v1/metrics/timeseries",
    "GET /api/v1/metrics/leaderboards/coverage",
  ],
  clubs: [
    "GET /api/v1/clubs/:clubId/summary",
    "GET /api/v1/clubs/:clubId/campaigns",
    "GET /api/v1/clubs/:clubId/maps",
    "GET /api/v1/clubs/:clubId/members",
  ],
  database: ["GET /api/v1/db/tables", "GET /api/v1/db/tables/:table/schema", "GET /api/v1/db/tables/:table/rows"],
  ingest: [
    "POST /api/v1/ingest/tracker-run",
    "POST /api/v1/ingest/tracker-runs",
    "POST /api/v1/ingest/instance/register",
    "POST /api/v1/ingest/instance/heartbeat",
    "POST /api/v1/ingest/display-names",
    "POST /api/v1/ingest/display-names/arl",
    "POST /api/v1/ingest/club-snapshot",
    "POST /api/v1/ingest/event",
    "POST /api/v1/ingest/events",
    "POST /api/v1/ingest/traffic",
    "POST /api/v1/ingest/traffic/batch",
  ],
};

test("API catalog preserves public section and endpoint order", () => {
  const catalog = createApiCatalog();

  assert.equal(catalog.service, "tracker-aggregator");
  assert.equal(catalog.docsVersion, 1);
  assert.ok(Number.isFinite(Date.parse(catalog.generatedAt)));
  assert.deepEqual(catalog.baseUrls, { docs: "/api/", public: "/api/v1", ingest: "/api/v1/ingest" });
  assert.deepEqual(
    catalog.sections.map((section) => section.id),
    Object.keys(expectedEndpoints)
  );

  for (const section of catalog.sections) {
    assert.deepEqual(
      section.endpoints.map(({ method, path }) => `${method} ${path}`),
      expectedEndpoints[section.id]
    );
    for (const entry of section.endpoints) {
      assert.deepEqual(Object.keys(entry), [
        "method",
        "path",
        "summary",
        "auth",
        "query",
        "pathParams",
        "notes",
        "bodyExample",
        "responseExample",
        "example",
      ]);
    }
  }
});

test("API catalog applies origin and authentication configuration without changing route paths", () => {
  const catalog = createApiCatalog({
    origin: " https://aggregator.example.test/// ",
    ingestTokenConfigured: true,
    arlAuthConfigured: true,
  });

  assert.deepEqual(catalog.baseUrls, {
    docs: "https://aggregator.example.test/api/",
    public: "https://aggregator.example.test/api/v1",
    ingest: "https://aggregator.example.test/api/v1/ingest",
  });
  assert.equal(catalog.auth.ingest.enforcedOnThisServer, true);
  assert.match(catalog.auth.ingest.description, /currently requires a token/);
  assert.equal(catalog.auth.arlPlugin.enforcedOnThisServer, true);
  assert.equal(catalog.auth.arlPlugin.route, "/api/v1/ingest/display-names/arl");
  assert.equal(catalog.clientRecipes.length, 5);
  assert.match(catalog.clientRecipes[0].example, /^curl "https:\/\/aggregator\.example\.test\/api\/v1/);
  assert.match(catalog.clientRecipes[1].example, /\\"accountIds\\"/);

  const identity = catalog.sections.find(({ id }) => id === "identity");
  const fuzzySearch = identity.endpoints.find(({ path }) => path.endsWith("/search"));
  assert.match(fuzzySearch.notes.at(-1), /freshest 5000 cached names/);
  const ingest = catalog.sections.find(({ id }) => id === "ingest");
  assert.deepEqual(
    ingest.endpoints.map(({ auth }) => auth),
    ["token", "token", "token", "token", "token", "arl", "token", "token", "token", "token", "token"]
  );
});
