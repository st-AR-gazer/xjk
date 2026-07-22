import assert from "node:assert/strict";
import test from "node:test";

import { createAuthService } from "../src/auth.js";

function createService(fetchImpl) {
  return createAuthService({
    config: {
      authorizeUrl: "https://auth.example/authorize",
      clientId: "client-id",
      clientSecret: "client-secret",
      globalMinRequestGapMs: 0,
      oauthEnabled: true,
      requestTimeoutMs: 5000,
      tokenUrl: "https://auth.example/token",
      userAgent: "console-test",
      userInfoUrl: "https://auth.example/userinfo",
    },
    db: {},
    displayNames: {
      observeDisplayName: async () => {},
      rememberObservedDisplayName: () => "",
    },
    fetchImpl,
    helpers: {
      jsonTryParse: JSON.parse,
      nowMs: Date.now,
      tokenExpiryMs: () => 0,
    },
  });
}

test("Console OAuth delegates code, refresh, and profile requests to the shared protocol", async () => {
  const requests = [];
  const service = createService(async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  assert.equal(service.oauthConfigured(), true);
  await service.exchangeCode({ code: "code-1", redirectUri: "https://console.example/callback" });
  await service.refreshTrackmaniaOauth("refresh-1");
  await service.fetchUserInfo("access-1");

  assert.equal(requests.length, 3);
  assert.equal(requests[0].url, "https://auth.example/token");
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(requests[0].options.body)), {
    grant_type: "authorization_code",
    code: "code-1",
    redirect_uri: "https://console.example/callback",
    client_id: "client-id",
    client_secret: "client-secret",
  });
  assert.deepEqual(Object.fromEntries(new URLSearchParams(requests[1].options.body)), {
    grant_type: "refresh_token",
    refresh_token: "refresh-1",
    client_id: "client-id",
    client_secret: "client-secret",
  });
  assert.equal(requests[2].url, "https://auth.example/userinfo");
  assert.equal(requests[2].options.headers.authorization, "Bearer access-1");
});
