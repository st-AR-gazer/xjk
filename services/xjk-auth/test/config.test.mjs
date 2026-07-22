import assert from "node:assert/strict";
import test from "node:test";
import { isSharedXjkAuthSetting, loadXjkAuthConfig, mergeMissingEnvironment } from "../src/config.js";

test("fallback service environments import only shared auth settings", () => {
  const environment = { UBI_OAUTH_CLIENT_ID: "primary" };
  mergeMissingEnvironment(
    environment,
    {
      FRONTEND_DIR: "unrelated-frontend",
      PORT: "9999",
      UBI_OAUTH_CLIENT_ID: "fallback",
      UBI_OAUTH_CLIENT_SECRET: "secret",
      XJK_ADMIN_UBISOFT_SUBJECTS: "admin",
    },
    isSharedXjkAuthSetting
  );

  assert.deepEqual(environment, {
    UBI_OAUTH_CLIENT_ID: "primary",
    UBI_OAUTH_CLIENT_SECRET: "secret",
    XJK_ADMIN_UBISOFT_SUBJECTS: "admin",
  });
});

test("auth config resolves a supplied environment without loading deployment files", () => {
  const config = loadXjkAuthConfig({
    loadEnvironment: false,
    env: {
      PORT: "3208",
      XJK_AUTH_ALLOWED_RETURN_HOSTS: "preview.example.test, invalid/path",
      XJK_AUTH_REQUEST_TIMEOUT_MS: "24000",
      XJK_AUTH_SESSION_TTL_SECONDS: "7200",
      UBI_OAUTH_ENABLED: "1",
      UBI_OAUTH_CLIENT_ID: "client-id",
      UBI_OAUTH_CLIENT_SECRET: "client-secret",
    },
  });

  assert.equal(config.port, 3208);
  assert.equal(config.requestTimeoutMs, 24000);
  assert.equal(config.sessionTtlSeconds, 7200);
  assert.equal(config.oauth.enabled, true);
  assert.equal(config.oauth.requestTimeoutMs, 24000);
  assert.ok(config.allowedReturnHosts.includes("preview.example.test"));
  assert.ok(!config.allowedReturnHosts.includes("invalid/path"));
});

test("auth config clamps invalid numeric settings to service defaults", () => {
  const config = loadXjkAuthConfig({
    loadEnvironment: false,
    env: {
      PORT: "99999",
      XJK_AUTH_OAUTH_STATE_MAX_ENTRIES: "1",
      XJK_AUTH_REQUEST_TIMEOUT_MS: "20",
    },
  });

  assert.equal(config.port, 65535);
  assert.equal(config.oauthStateMaxEntries, 16);
  assert.equal(config.requestTimeoutMs, 1000);
});
