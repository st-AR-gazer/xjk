import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import express from "express";

import { createPublicRoutes } from "../src/routes/publicRoutes.js";

async function createTestServer(context, service) {
  const app = express();
  app.use(express.json());
  app.use(createPublicRoutes(service));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function getJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { status: response.status, body: await response.json() };
}

test("public routes dispatch through their named service domains", async (context) => {
  const accountId = "11111111-1111-4111-8111-111111111111";
  const calls = [];
  const service = {
    catalog: {
      getPublicApiCatalog: () => ({ version: "test" }),
      recordPublicApiRequest: ({ endpointKey }) => calls.push(["catalog-log", endpointKey]),
    },
    maps: {
      getMapViewerDiffPayload: async ({ targetMapUid, referenceMapUid }) => ({
        ok: true,
        targetMapUid,
        referenceMapUid,
      }),
    },
    players: {
      resolvePlayerNamesByAccountIds: async (accountIds) => ({ [accountIds[0]]: "Player" }),
    },
    tracker: {
      getTrackerStatus: async () => ({ configured: true }),
    },
  };
  const baseUrl = await createTestServer(context, service);

  assert.deepEqual(await getJson(baseUrl, "/public/endpoints"), {
    status: 200,
    body: { version: "test" },
  });
  assert.deepEqual(await getJson(baseUrl, "/public/maps/target/viewer-diff?referenceMapUid=reference"), {
    status: 200,
    body: { ok: true, targetMapUid: "target", referenceMapUid: "reference" },
  });
  assert.deepEqual(await getJson(baseUrl, "/tracker/status"), {
    status: 200,
    body: { configured: true },
  });
  assert.deepEqual(
    await getJson(baseUrl, "/public/display-names/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountIds: [accountId] }),
    }),
    {
      status: 200,
      body: {
        ok: true,
        accountIds: [accountId],
        resolved: 1,
        namesByAccountId: { [accountId]: "Player" },
      },
    }
  );
  assert.deepEqual(
    calls.filter(([operation]) => operation === "catalog-log").map(([, endpointKey]) => endpointKey),
    ["public-api-catalog", "public-map-viewer-diff", "tracker-status", "public-display-names-resolve"]
  );
});
