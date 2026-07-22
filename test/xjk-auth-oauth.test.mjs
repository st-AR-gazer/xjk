import assert from "node:assert/strict";
import test from "node:test";

import {
  exchangeUbisoftCode,
  fetchUbisoftUserInfo,
  normalizeUbisoftProfile,
  refreshUbisoftToken,
} from "../services/shared/xjkAuth.js";
import { createSharedIdentityNavigation } from "../services/shared/xjkIdentityNavigation.js";
import { createIdentityService } from "../services/learn-profile/src/identity.js";

const oauthConfig = {
  authOrigin: "https://account.xjk.yt",
  tokenUrl: "https://oauth.example/token",
  userInfoUrl: "https://oauth.example/userinfo",
  clientId: "client",
  clientSecret: "secret",
  userAgent: "test-agent",
  requestTimeoutMs: 2_000,
};

test("shared Ubisoft OAuth requests support injected transports without changing request contracts", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ access_token: "access", accountId: "account" }));
  };

  await exchangeUbisoftCode(oauthConfig, { code: "code", redirectUri: "https://xjk.yt/callback" }, { fetchImpl });
  await refreshUbisoftToken(oauthConfig, "refresh", { fetchImpl });
  await fetchUbisoftUserInfo(oauthConfig, "access", { fetchImpl });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, oauthConfig.tokenUrl);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(
    calls[0].options.body,
    "grant_type=authorization_code&code=code&redirect_uri=https%3A%2F%2Fxjk.yt%2Fcallback&client_id=client&client_secret=secret"
  );
  assert.equal(
    calls[1].options.body,
    "grant_type=refresh_token&refresh_token=refresh&client_id=client&client_secret=secret"
  );
  assert.equal(calls[2].options.headers.authorization, "Bearer access");
});

test("Ubisoft profile normalization lets domain wrappers retain their display-name fallback policy", () => {
  assert.equal(normalizeUbisoftProfile({ accountId: "account" }).displayName, "account");
  assert.equal(
    normalizeUbisoftProfile({ accountId: "account" }, {}, { fallbackDisplayNameToAccountId: false }).displayName,
    null
  );

  const learnIdentity = createIdentityService({ config: {} });
  assert.deepEqual(learnIdentity.normalizeProfile({ accountId: "account", countryCode: "NO" }), {
    provider: "nadeo-profile",
    accountId: "account",
    subject: "account",
    displayName: null,
    username: null,
    zone: "NO",
    providerPayloadKeys: ["accountId", "countryCode"],
  });
});

test("shared identity navigation applies one login and logout policy around service-owned public URLs", () => {
  const navigation = createSharedIdentityNavigation({
    config: {
      sharedAuthOrigin: "https://account.xjk.yt",
      sharedAuthLocalOrigin: "http://localhost:8080",
      sharedAuthAllowedReturnHosts: ["learn.xjk.yt"],
      sharedAuthSessionCookieName: "xjk_session",
      sharedAuthSessionCookieDomain: ".xjk.yt",
    },
    buildPublicUrl: (_request, pathname) => `https://learn.xjk.yt${pathname}`,
    defaultPath: "/#/profile",
  });
  const request = {
    headers: { host: "learn.xjk.yt", "x-forwarded-proto": "https" },
    socket: {},
  };

  assert.equal(
    navigation.buildLoginUrl(request),
    "https://account.xjk.yt/auth/ubisoft/login?return_to=https%3A%2F%2Flearn.xjk.yt%2F%23%2Fprofile"
  );
  assert.match(navigation.buildLogoutCookie(request), /Domain=\.xjk\.yt/);
  assert.match(navigation.buildLogoutCookie(request), /Secure/);
});
