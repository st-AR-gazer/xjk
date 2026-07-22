import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as auth from "../xjkAuth.js";

const expectedExports = [
  "DEFAULT_XJK_SESSION_TTL_SECONDS",
  "XjkAuthStore",
  "accountMatchesXjkAdminIdentity",
  "buildAbsoluteUrl",
  "buildCentralLoginUrl",
  "buildCookie",
  "buildServicePublicUrl",
  "buildSharedSessionLogoutCookie",
  "canonicalizeLocalPathModeUrl",
  "clampInt",
  "decodeJwtPayload",
  "decorateAccountWithXjkRoles",
  "ensureFreshSharedSession",
  "exchangeUbisoftCode",
  "fetchUbisoftUserInfo",
  "firstDefined",
  "isLocalHostname",
  "loadEnvFile",
  "loadXjkAdminIdentityConfig",
  "normalizeOriginRelativePath",
  "normalizePath",
  "normalizeReturnTo",
  "normalizeUbisoftProfile",
  "oauthConfigured",
  "parseBool",
  "parseCookies",
  "parseList",
  "publicAccountFromRow",
  "publicAccountWithRolesFromRow",
  "publicSessionFromRow",
  "publicSessionWithRolesFromRow",
  "refreshUbisoftToken",
  "requestHost",
  "requestHostname",
  "requestIsSecure",
  "requestJson",
  "tokenExpiryMs",
  "xjkAdminIdentityConfigured",
];

test("xjkAuth compatibility facade retains the established public surface", () => {
  assert.deepEqual(Object.keys(auth).sort(), [...expectedExports].sort());
});

test("split SQLite auth store preserves account, session, and request-cookie behavior", () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "xjk-auth-store-"));
  const store = new auth.XjkAuthStore({ dbFile: path.join(tempDirectory, "auth.sqlite") });
  try {
    const row = store.upsertUbisoftAccount(
      { subject: "subject-1", ubisoftAccountId: "account-1", displayName: "Driver", username: "driver" },
      { touchLogin: true }
    );
    const session = store.createSessionForAccount({
      accountId: row.xjk_account_id,
      oauth: { accessToken: "access-token", expiresAt: Date.now() + 3_600_000 },
    });
    const resolved = store.resolveSessionFromRequest({
      headers: { cookie: `${store.sessionCookieName}=${session.session_token}` },
    });
    assert.equal(resolved?.row?.provider_account_id, "account-1");
    assert.equal(auth.publicSessionFromRow(resolved.row)?.user?.displayName, "Driver");
  } finally {
    store.db.close();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("expired shared OAuth sessions refresh through the canonical SQLite row DTO", async () => {
  const store = new auth.XjkAuthStore({ dbFile: ":memory:" });
  try {
    const account = store.upsertUbisoftAccount({
      subject: "refresh-subject",
      ubisoftAccountId: "refresh-account",
      displayName: "Refresh Driver",
    });
    const original = store.createSessionForAccount({
      accountId: account.xjk_account_id,
      oauth: {
        accessToken: "expired-access",
        refreshToken: "preserved-refresh",
        tokenType: "CustomBearer",
        idToken: "preserved-id",
        scope: "preserved-scope",
        expiresAt: Date.now() - 1_000,
      },
    });
    const requests = [];
    const fetchImpl = async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ access_token: "fresh-access", expires_in: 3600 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const refreshed = await auth.ensureFreshSharedSession(
      store,
      { token: original.session_token, row: original },
      {
        enabled: true,
        clientId: "client-id",
        clientSecret: "client-secret",
        authorizeUrl: "https://oauth.example/authorize",
        tokenUrl: "https://oauth.example/token",
        userInfoUrl: "https://oauth.example/userinfo",
        scope: "configured-scope",
        requestTimeoutMs: 2_000,
      },
      { fetchImpl }
    );

    assert.equal(requests.length, 1);
    assert.equal(
      requests[0].options.body,
      "grant_type=refresh_token&refresh_token=preserved-refresh&client_id=client-id&client_secret=client-secret"
    );
    assert.equal(refreshed.row.access_token, "fresh-access");
    assert.equal(refreshed.row.refresh_token, "preserved-refresh");
    assert.equal(refreshed.row.token_type, "CustomBearer");
    assert.equal(refreshed.row.id_token, "preserved-id");
    assert.equal(refreshed.row.scope, "preserved-scope");
    assert.ok(refreshed.row.oauth_expires_at > Date.now());

    const partialUpdate = store.updateSessionOauth(original.session_token, {
      accessToken: "newer-access",
      expiresAt: Date.now() + 7_200_000,
    });
    assert.equal(partialUpdate.access_token, "newer-access");
    assert.equal(partialUpdate.refresh_token, "preserved-refresh");
    assert.equal(partialUpdate.token_type, "CustomBearer");
    assert.equal(partialUpdate.id_token, "preserved-id");
    assert.equal(partialUpdate.scope, "preserved-scope");
  } finally {
    store.db.close();
  }
});
