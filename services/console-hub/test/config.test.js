import assert from "node:assert/strict";
import test from "node:test";

import {
  joinUrlPath,
  loadConsoleHubConfig,
  loopbackApiBaseUrl,
  normalizeCallbackPath,
  normalizeRoutePrefix,
} from "../src/config.js";

test("route paths are normalized consistently", () => {
  assert.equal(normalizeRoutePrefix("bingo///"), "/bingo");
  assert.equal(normalizeRoutePrefix("/"), "");
  assert.equal(joinUrlPath("/bingo/", "health"), "/bingo/health");
  assert.equal(joinUrlPath("", "/health"), "/health");
  assert.equal(normalizeCallbackPath("/auth/ubisoft/callback", "/bingo"), "/bingo/auth/ubisoft/callback");
  assert.equal(
    normalizeCallbackPath("https://console.xjk.yt/bingo/auth/ubisoft/callback", "/bingo"),
    "/bingo/auth/ubisoft/callback"
  );
  assert.equal(loopbackApiBaseUrl(3140), "http://127.0.0.1:3140/api");
});

test("configuration keeps environment aliases and local-stack defaults", () => {
  const config = loadConsoleHubConfig({
    env: {
      PORT: "3137",
      BINGO_BRIDGE_PUBLIC_BASE_PATH: "console/",
      UBI_OAUTH_CALLBACK_PATH: "/auth/ubisoft/callback",
      BINGO_BRIDGE_SESSION_TTL_SECONDS: "1800",
      XJK_SHARED_AUTH_ENABLED: "0",
    },
    loadEnv: false,
  });

  assert.equal(config.port, 3137);
  assert.equal(config.publicBasePath, "/console");
  assert.equal(config.callbackPath, "/console/auth/ubisoft/callback");
  assert.equal(config.sessionTtlSeconds, 1800);
  assert.equal(config.sharedAuthEnabled, false);
  assert.equal(config.aggregatorBaseUrl, "http://127.0.0.1:3140/api");
  assert.equal(config.trackerDisplaynameBaseUrl, "http://127.0.0.1:3141/api");
});
