import assert from "node:assert/strict";
import test from "node:test";

import { AggregatorClient as AlteredAggregatorClient } from "../services/altered/src/tracker/aggregatorClient.js";
import { TrackerDisplaynameClient as AlteredTrackerDisplaynameClient } from "../services/altered/src/tracker/trackerDisplaynameClient.js";
import { TrackmaniaOAuthClient as AlteredOAuthClient } from "../services/altered/src/live/trackmaniaOAuthClient.js";
import { AggregatorClient } from "../services/shared/aggregatorClient.js";
import { TrackerClubClient } from "../services/altered/src/tracker/trackerClubClient.js";
import { JsonServiceClient } from "../services/shared/jsonServiceClient.js";
import { TrackerDisplaynameClient } from "../services/shared/trackerDisplaynameClient.js";
import { TrackmaniaOAuthClient as DisplayNameOAuthClient } from "../services/tracker-displayname/src/services/trackmaniaOAuthClient.js";

const accountId = "00000000-0000-0000-0000-000000000001";

function captureRequests(client) {
  const requests = [];
  client.request = async (path, options = {}) => {
    requests.push({ path, options });
    return { ok: true, status: 200 };
  };
  return requests;
}

test("shared aggregator client centralizes request payload normalization", async () => {
  const client = new AggregatorClient({ baseUrl: "http://aggregator.test/" });
  const requests = captureRequests(client);

  await client.ingestDisplayNames({ [` ${accountId} `]: "Display Name" });

  assert.equal(client.baseUrl, "http://aggregator.test");
  assert.deepEqual(requests, [
    {
      path: "ingest/display-names",
      options: {
        method: "POST",
        body: {
          projectKey: "xjk-shared-displayname",
          projectName: "XJK Shared Displayname",
          sourceLabel: "xjk-shared-displayname",
          observedAt: requests[0].options.body.observedAt,
          namesByAccountId: { [accountId]: "Display Name" },
        },
      },
    },
  ]);
});

test("Altered aggregator wrapper supplies only Altered policy defaults", async () => {
  const client = new AlteredAggregatorClient({ baseUrl: "http://aggregator.test" });
  const requests = captureRequests(client);

  assert.deepEqual(await client.getDisplayNames([]), {
    ok: true,
    data: { names: [], count: 0 },
  });
  await client.ingestDisplayNames({ [accountId]: "Display Name" });

  assert.equal(requests[0].options.body.projectKey, "altered-mapper-displayname");
  assert.equal(requests[0].options.body.projectName, "Altered Mapper Displayname");
  assert.equal(requests[0].options.body.sourceLabel, "altered-mapper-sync");
});

test("tracker display-name wrappers share transport and vary only policy defaults", async () => {
  const shared = new TrackerDisplaynameClient({ baseUrl: "http://tracker.test" });
  const altered = new AlteredTrackerDisplaynameClient({ baseUrl: "http://tracker.test" });
  const sharedRequests = captureRequests(shared);
  const alteredRequests = captureRequests(altered);

  await shared.resolveAccountIds([` ${accountId} `]);
  await altered.resolveAccountIds([` ${accountId} `]);

  assert.equal(sharedRequests[0].options.body.reason, "shared-priority");
  assert.equal(alteredRequests[0].options.body.reason, "altered-priority");
  assert.deepEqual(alteredRequests[0].options.body.accountIds, [accountId]);
});

test("Trackmania OAuth wrappers share token and display-name behavior", async () => {
  const altered = new AlteredOAuthClient({ clientId: "id", clientSecret: "secret", minRequestGapMs: 0 });
  const tracker = new DisplayNameOAuthClient({ clientId: "id", clientSecret: "secret", minRequestGapMs: 0 });

  assert.equal(altered.throttleLabel, "altered-oauth");
  assert.equal(tracker.throttleLabel, "tracker-displayname-oauth");
  assert.equal(tracker.telemetryService, "tracker-displayname");
  assert.equal(altered.isConfigured(), true);

  assert.deepEqual(Object.fromEntries(tracker.parseDisplayNamePayload({ [accountId]: "Mapper Name" })), {
    [accountId]: "Mapper Name",
  });

  let tokenRequests = 0;
  tracker.requestClientCredentialsToken = async () => {
    tokenRequests += 1;
    await Promise.resolve();
    tracker.accessToken = "token";
    tracker.expiresAtMs = Date.now() + 60_000;
    return tracker.accessToken;
  };
  assert.deepEqual(await Promise.all([tracker.ensureAccessToken(), tracker.ensureAccessToken()]), ["token", "token"]);
  assert.equal(tokenRequests, 1);
});

test("JSON service transport centralizes URL, body, and response handling", async (context) => {
  const requests = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ ready: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  const client = new JsonServiceClient({ baseUrl: "http://service.test/api/" });

  assert.deepEqual(await client.request("status", { method: "POST", body: { check: true } }), {
    ok: true,
    status: 200,
    data: { ready: true },
  });
  assert.equal(requests[0].url, "http://service.test/api/status");
  assert.equal(requests[0].options.headers["content-type"], "application/json");
  assert.equal(requests[0].options.body, '{"check":true}');
});

test("tracker club client keeps versioned routes as a policy-only wrapper", async () => {
  const client = new TrackerClubClient({ baseUrl: "http://tracker.test/api/v1/" });
  const requests = captureRequests(client);

  await client.ingestSnapshot({ clubId: 7 });

  assert.equal(client.buildUrl("v1/status"), "http://tracker.test/api/v1/status");
  assert.deepEqual(requests, [
    {
      path: "snapshot/ingest",
      options: { method: "POST", body: { clubId: 7 } },
    },
  ]);
});
