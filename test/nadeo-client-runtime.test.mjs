import assert from "node:assert/strict";
import test from "node:test";

import {
  addNadeoQuery,
  buildNadeoBasicTokenRequest,
  buildNadeoRefreshTokenRequest,
  isTokenFresh,
  jwtExpiryMs,
  mergeNadeoTokenPair,
  NadeoAccessTokenManager,
  NadeoHttpError,
  NadeoRequestRuntime,
  NadeoTokenRequestCoordinator,
  normalizeNadeoRequestPolicy,
  readNadeoTokenPair,
  requestNadeoBasicToken,
  requestNadeoJsonWithToken,
  requestNadeoRefreshToken,
  requireNadeoTokenPair,
} from "../services/shared/nadeoClientRuntime.js";
import { decodeJwtPayload, oauthTokenExpiryMs } from "../services/shared/tokenUtils.js";
import { NadeoLiveClient } from "../services/altered/src/live/nadeoLiveClient.js";

function jwt(payload) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

test("shared token helpers decode JWT expiry without assuming every token is a JWT", () => {
  const token = jwt({ sub: "driver", exp: 1_800_000_000 });

  assert.deepEqual(decodeJwtPayload(token), { sub: "driver", exp: 1_800_000_000 });
  assert.equal(jwtExpiryMs(token), 1_800_000_000_000);
  assert.equal(jwtExpiryMs("opaque-token"), 0);
  assert.equal(isTokenFresh("opaque-token", 0, { nowMs: 1000 }), true);
  assert.equal(isTokenFresh(token, 1_000_000, { minLifetimeSeconds: 45, nowMs: 960_000 }), false);
  assert.equal(oauthTokenExpiryMs({ expires_in: 60 }, 0, { nowMs: 1_000 }), 61_000);
});

test("Nadeo auth request builders preserve the protocol headers and token pair shape", () => {
  assert.deepEqual(
    buildNadeoBasicTokenRequest({
      login: "dedicated",
      password: "secret",
      audience: "NadeoLiveServices",
      userAgent: "test-agent",
    }),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from("dedicated:secret").toString("base64")}`,
        "user-agent": "test-agent",
      },
      body: JSON.stringify({ audience: "NadeoLiveServices" }),
    }
  );
  assert.deepEqual(buildNadeoRefreshTokenRequest({ refreshToken: "refresh", userAgent: "test-agent" }), {
    method: "POST",
    headers: {
      authorization: "nadeo_v1 t=refresh",
      "user-agent": "test-agent",
    },
  });

  const accessToken = jwt({ exp: 1_800_000_000 });
  assert.deepEqual(readNadeoTokenPair({ accessToken, refreshToken: "refresh" }), {
    accessToken,
    refreshToken: "refresh",
    expiresAt: 1_800_000_000_000,
  });
  assert.deepEqual(
    mergeNadeoTokenPair(
      { refreshToken: "existing-refresh" },
      { accessToken: "access", refreshToken: "", expiresAt: 123 }
    ),
    {
      accessToken: "access",
      refreshToken: "existing-refresh",
      accessTokenExpiryMs: 123,
    }
  );
  assert.throws(() => requireNadeoTokenPair({}, "missing token"), /missing token/);
});

test("Nadeo token requests keep transport mechanics separate from service policy", async () => {
  const calls = [];
  const accessToken = jwt({ exp: 1_800_000_000 });
  const requestJson = async (url, options) => {
    calls.push({ url, options });
    return { accessToken, refreshToken: "next-refresh" };
  };

  assert.deepEqual(
    await requestNadeoBasicToken({
      requestJson,
      coreBaseUrl: "https://core.example/",
      login: "dedicated",
      password: "secret",
      audience: "NadeoLiveServices",
      userAgent: "test-agent",
      throttleLabel: "test-basic",
    }),
    { accessToken, refreshToken: "next-refresh", expiresAt: 1_800_000_000_000 }
  );
  assert.equal(calls[0].url, "https://core.example/v2/authentication/token/basic");
  assert.equal(calls[0].options.throttleLabel, "test-basic");

  await requestNadeoRefreshToken({
    requestJson,
    coreBaseUrl: "https://core.example/",
    refreshToken: "refresh",
    userAgent: "test-agent",
  });
  assert.equal(calls[1].url, "https://core.example/v2/authentication/token/refresh");
  assert.equal(calls[1].options.headers.authorization, "nadeo_v1 t=refresh");

  assert.deepEqual(
    normalizeNadeoRequestPolicy({
      requestTimeoutMs: 500,
      defaultRequestTimeoutMs: 12_000,
      minRequestGapMs: -1,
      globalThrottleFile: " state.txt ",
      globalMinRequestGapMs: 250,
    }),
    {
      requestTimeoutMs: 1_000,
      minRequestGapMs: 0,
      globalThrottleFile: "state.txt",
      globalMinRequestGapMs: 250,
    }
  );
});

test("Nadeo access token manager applies token responses and runs persistence hooks", async () => {
  const accessToken = jwt({ exp: 1_800_000_000 });
  const requests = [];
  let updateCount = 0;
  const client = {
    coreAuthBaseUrl: "https://core.example",
    dediLogin: "dedicated",
    dediPassword: "secret",
    refreshToken: "existing-refresh",
    userAgent: "test-agent",
    requestJson: async (url, options) => {
      requests.push({ url, options });
      return {
        accessToken,
        refreshToken: url.endsWith("/refresh") ? "refreshed-token" : "basic-token",
      };
    },
  };
  const manager = new NadeoAccessTokenManager(client, {
    onTokenUpdated: () => {
      updateCount += 1;
    },
  });

  assert.equal(await manager.requestBasic("NadeoLiveServices"), accessToken);
  assert.equal(client.refreshToken, "basic-token");
  assert.equal(client.accessTokenExpiryMs, 1_800_000_000_000);
  assert.equal(await manager.requestRefresh(), accessToken);
  assert.equal(client.refreshToken, "refreshed-token");
  assert.equal(updateCount, 2);
  assert.equal(requests[0].url, "https://core.example/v2/authentication/token/basic");
  assert.equal(requests[1].options.headers.authorization, "nadeo_v1 t=basic-token");
});

test("Nadeo token coordination deduplicates only matching audiences and clears settled work", async () => {
  const coordinator = new NadeoTokenRequestCoordinator();
  let liveCalls = 0;
  let releaseLive;
  const liveToken = new Promise((resolve) => {
    releaseLive = resolve;
  });

  const first = coordinator.run("NadeoLiveServices", async () => {
    liveCalls += 1;
    return liveToken;
  });
  const second = coordinator.run("NadeoLiveServices", async () => {
    liveCalls += 1;
    return "unexpected";
  });
  const core = coordinator.run("NadeoServices", async () => "core-token");

  assert.equal(first, second);
  assert.equal(await core, "core-token");
  releaseLive("live-token");
  assert.equal(await first, "live-token");
  assert.equal(liveCalls, 1);

  assert.equal(await coordinator.run("NadeoLiveServices", async () => "fresh-token"), "fresh-token");
});

test("authenticated Nadeo requests refresh once after a 401 and keep normalized query values", async () => {
  const tokenRequests = [];
  const requests = [];
  let unauthorizedCount = 0;
  const url = addNadeoQuery("https://nadeo.example/maps", {
    offset: 0,
    active: false,
    ignored: "",
  });

  const payload = await requestNadeoJsonWithToken({
    url,
    userAgent: "test-agent",
    ensureAccessToken: async (options = {}) => {
      tokenRequests.push(options);
      return options.forceRefresh ? "fresh-token" : "stale-token";
    },
    requestJson: async (requestUrl, options) => {
      requests.push({ requestUrl, options });
      if (requests.length === 1) throw Object.assign(new Error("expired"), { statusCode: 401 });
      return { ok: true };
    },
    onUnauthorized: () => {
      unauthorizedCount += 1;
    },
  });

  assert.deepEqual(payload, { ok: true });
  assert.equal(String(url), "https://nadeo.example/maps?offset=0&active=false");
  assert.deepEqual(tokenRequests, [{}, { forceRefresh: true }]);
  assert.equal(requests[0].options.headers.authorization, "nadeo_v1 t=stale-token");
  assert.equal(requests[1].options.headers.authorization, "nadeo_v1 t=fresh-token");
  assert.equal(unauthorizedCount, 1);
});

test("Altered user-scoped Nadeo clients inherit the complete throttle policy", async () => {
  const parent = new NadeoLiveClient({
    accessToken: "parent-token",
    requestTimeoutMs: 9_000,
    minRequestGapMs: 321,
    globalThrottleFile: "shared-throttle.txt",
    globalMinRequestGapMs: 654,
  });
  parent.requestUbisoftAudienceToken = async () => ({
    accessToken: "user-token",
    refreshToken: "user-refresh",
  });

  const child = await parent.createUserScopedClient({ ubisoftAccessToken: "ubisoft-token" });
  assert.equal(child.requestTimeoutMs, 9_000);
  assert.equal(child.minRequestGapMs, 321);
  assert.equal(child.globalThrottleFile, "shared-throttle.txt");
  assert.equal(child.globalMinRequestGapMs, 654);
});

test("Altered map lookup variants share chunking while retaining their progress contracts", async () => {
  const client = new NadeoLiveClient({ accessToken: "token" });
  const liveProgress = [];
  const coreProgress = [];
  client.liveGet = async (_path, { mapUidList }) => ({
    mapList: mapUidList.split(",").map((uid) => ({ uid, name: `Live ${uid}` })),
  });
  client.coreGet = async (_path, { mapUidList }) => mapUidList.split(",").map((uid) => ({ uid }));

  const uids = Array.from({ length: 101 }, (_, index) => `map-${index + 1}`);
  const liveMaps = await client.getMapsByUidList([...uids, uids[0]], {
    onChunk: (progress) => liveProgress.push(progress),
  });
  const coreMaps = await client.getCoreMapsByUidList(uids, {
    onChunk: (progress) => coreProgress.push(progress),
  });

  assert.equal(liveMaps.length, 101);
  assert.equal(coreMaps.length, 101);
  assert.equal(liveProgress.length, 2);
  assert.equal(liveProgress[0].currentMapUid, "map-1");
  assert.equal(liveProgress[0].currentMaps.length, 6);
  assert.equal(liveProgress[1].loadedCount, 101);
  assert.equal(coreProgress.length, 2);
  assert.equal(coreProgress[1].loadedCount, 101);
  assert.equal(Object.hasOwn(coreProgress[0], "currentMaps"), false);
});

test("Nadeo request runtime parses responses and reports stable error metadata", async () => {
  const requests = [];
  const telemetry = [];
  const runtime = new NadeoRequestRuntime({
    requestTimeoutMs: 2_000,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ message: "rate limited" }), {
        status: 429,
        headers: { "content-type": "application/json" },
      });
    },
    telemetryComponent: "nadeo-live",
    telemetryService: "test-service",
    onHttpEvent: (sample) => telemetry.push(sample),
    now: () => 1_000,
  });

  await assert.rejects(
    runtime.requestJson("https://nadeo.example/api/maps?offset=2", {
      method: "POST",
      body: "payload",
      formatError: ({ status, details }) => `upstream ${status}: ${details}`,
    }),
    (error) => {
      assert.ok(error instanceof NadeoHttpError);
      assert.equal(error.message, "upstream 429: rate limited");
      assert.equal(error.statusCode, 429);
      assert.deepEqual(error.payload, { message: "rate limited" });
      assert.equal(error.requestMethod, "POST");
      assert.equal(error.requestUrl, "https://nadeo.example/api/maps?offset=2");
      return true;
    }
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.body, "payload");
  assert.deepEqual(telemetry[0], {
    direction: "outgoing",
    component: "nadeo-live",
    service: "test-service",
    method: "POST",
    route: "/api/maps?offset=2",
    targetHost: "nadeo.example",
    targetPath: "/api/maps?offset=2",
    statusCode: 429,
    durationMs: 0,
    bytesIn: 7,
    bytesOut: 26,
  });
});

test("Nadeo request runtime shares local spacing across JSON and binary requests", async () => {
  let nowMs = 1_000;
  const waits = [];
  const runtime = new NadeoRequestRuntime({
    minRequestGapMs: 50,
    now: () => nowMs,
    sleep: async (delayMs) => {
      waits.push(delayMs);
      nowMs += delayMs;
    },
    fetchImpl: async (url) =>
      String(url).endsWith(".gbx")
        ? new Response(Uint8Array.from([1, 2, 3]))
        : new Response(JSON.stringify({ ok: true })),
  });

  assert.deepEqual(await runtime.requestJson("https://nadeo.example/status"), { ok: true });
  assert.deepEqual(await runtime.requestBinary("https://nadeo.example/map.gbx"), Buffer.from([1, 2, 3]));
  assert.deepEqual(waits, [50]);
});

test("Nadeo request runtime records network failures before rethrowing them", async () => {
  const telemetry = [];
  const networkError = new Error("network unavailable");
  const runtime = new NadeoRequestRuntime({
    fetchImpl: async () => {
      throw networkError;
    },
    onHttpEvent: (sample) => telemetry.push(sample),
  });

  await assert.rejects(runtime.requestJson("https://nadeo.example/status"), networkError);
  assert.equal(telemetry.length, 1);
  assert.equal(telemetry[0].statusCode, 0);
  assert.equal(telemetry[0].targetHost, "nadeo.example");
});
