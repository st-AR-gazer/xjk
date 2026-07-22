import assert from "node:assert/strict";
import test from "node:test";

import { createAdminAuth } from "../src/http/adminAuth.js";

const DEFAULT_CONFIG = {
  ADMIN_TOKEN: "",
  ALTERED_INTERNAL_TOKEN: "",
  UBI_OAUTH_ENABLED: false,
  UBI_OAUTH_CLIENT_ID: "",
  UBI_OAUTH_CLIENT_SECRET: "",
  UBI_OAUTH_TOKEN_URL: "",
  UBI_OAUTH_USERINFO_URL: "",
  UBI_OAUTH_SCOPE: "openid profile",
  ALTERED_OAUTH_FALLBACK_LOCAL_ONLY: false,
  ALTERED_DEV_LOCAL_OPEN: false,
  XJK_SHARED_AUTH_ORIGIN: "https://xjk.yt",
  XJK_SHARED_AUTH_LOCAL_ORIGIN: "http://localhost:8080",
  XJK_SHARED_AUTH_SESSION_COOKIE_NAME: "xjk_session",
  XJK_SHARED_AUTH_SESSION_COOKIE_DOMAIN: ".xjk.yt",
  XJK_SHARED_AUTH_ALLOWED_RETURN_HOSTS: ["xjk.yt", "altered.xjk.yt", "localhost"],
};

function createUbisoftAuth(overrides = {}) {
  return {
    getStatus: () => ({ enabled: false }),
    getSessionFromRequest: () => null,
    getNadeoAuthContextFromRequest: async () => null,
    ...overrides,
  };
}

function createAuth({ config = {}, repository, ubisoftAuth, sharedAuthStore = null } = {}) {
  return createAdminAuth({
    repository: repository || {
      admin: {
        isUbisoftAdminAllowed: () => ({ allowed: false, reason: "denied" }),
      },
    },
    ubisoftAuth: ubisoftAuth || createUbisoftAuth(),
    sharedAuthStore,
    config: { ...DEFAULT_CONFIG, ...config },
  });
}

function createRequest({ method = "GET", host = "altered.xjk.yt", protocol = "https", headers = {}, ...rest } = {}) {
  return {
    method,
    protocol,
    headers: { host, ...headers },
    ...rest,
  };
}

function runMiddleware(middleware, request) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      resolve({ ...outcome, request, response });
    };
    const response = {
      statusCode: 200,
      headers: {},
      contentType: "",
      status(value) {
        this.statusCode = value;
        return this;
      },
      type(value) {
        this.contentType = value;
        return this;
      },
      setHeader(name, value) {
        this.headers[name] = value;
      },
      json(payload) {
        finish({ kind: "json", payload });
        return this;
      },
      send(payload) {
        finish({ kind: "send", payload });
        return this;
      },
      redirect(location) {
        finish({ kind: "redirect", location });
        return this;
      },
    };
    try {
      Promise.resolve(middleware(request, response, () => finish({ kind: "next" }))).catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

test("admin auth facade preserves its public contract", () => {
  const auth = createAuth();
  assert.deepEqual(Object.keys(auth).sort(), [
    "buildSharedLogoutCookie",
    "disableAdminApiCache",
    "disableApiCache",
    "getHeaderAdminToken",
    "getInternalServiceToken",
    "getOAuthLoginUrl",
    "getSharedAdminContext",
    "getStaticAdminSession",
    "isConfiguredAdminToken",
    "isLocalRequest",
    "isOAuthEnforced",
    "isOAuthFallbackOpen",
    "isOAuthRequiredButUnavailable",
    "isTrustedServiceAdminRequest",
    "parseOptionalBoolean",
    "rejectMissingStaticAsset",
    "requireAdminMutationOrigin",
    "requireApiAdmin",
    "requirePageAdmin",
    "resolveLiveAuthContext",
    "tokensMatch",
  ]);
  for (const value of Object.values(auth)) assert.equal(typeof value, "function");
});

test("shared logout cookies retain domain and transport boundaries", () => {
  const auth = createAuth();
  const productionCookie = auth.buildSharedLogoutCookie(createRequest({ headers: { "x-forwarded-proto": "https" } }));
  assert.match(productionCookie, /^xjk_session=; Max-Age=0; Path=\/; Domain=\.xjk\.yt;/u);
  assert.match(productionCookie, /; HttpOnly; SameSite=Lax; Secure$/u);

  const localCookie = auth.buildSharedLogoutCookie(createRequest({ host: "altered.localhost", protocol: "http" }));
  assert.doesNotMatch(localCookie, /Domain=/u);
  assert.doesNotMatch(localCookie, /Secure/u);
  assert.match(localCookie, /HttpOnly; SameSite=Lax$/u);
});

test("API authorization preserves service, OAuth, static-session, and header-token identities", async () => {
  const serviceAuth = createAuth({ config: { ALTERED_INTERNAL_TOKEN: "service-secret" } });
  const serviceRequest = createRequest({
    host: "altered.localhost",
    headers: { "x-service-token": "service-secret" },
  });
  assert.equal((await runMiddleware(serviceAuth.requireApiAdmin, serviceRequest)).kind, "next");
  assert.equal(serviceRequest.alteredAdminAuthMethod, "internal-service");
  assert.equal(serviceRequest.alteredAdmin.role, "service");

  const oauthSession = { user: { provider: "ubisoft", username: "OAuth admin" } };
  const oauthAuth = createAuth({
    config: { UBI_OAUTH_ENABLED: true },
    ubisoftAuth: createUbisoftAuth({
      getStatus: () => ({ enabled: true }),
      getSessionFromRequest: () => oauthSession,
    }),
  });
  const oauthRequest = createRequest();
  assert.equal((await runMiddleware(oauthAuth.requireApiAdmin, oauthRequest)).kind, "next");
  assert.equal(oauthRequest.alteredAdminAuthMethod, "oauth-session");
  assert.equal(oauthRequest.alteredAdminSession, oauthSession);

  const staticSession = { user: { provider: "admin-token", username: "Static admin" } };
  const staticAuth = createAuth({
    config: { ADMIN_TOKEN: "admin-secret" },
    ubisoftAuth: createUbisoftAuth({ getSessionFromRequest: () => staticSession }),
  });
  const staticRequest = createRequest();
  assert.equal((await runMiddleware(staticAuth.requireApiAdmin, staticRequest)).kind, "next");
  assert.equal(staticRequest.alteredAdminAuthMethod, "static-session");

  const tokenAuth = createAuth({ config: { ADMIN_TOKEN: "admin-secret" } });
  const tokenRequest = createRequest({ headers: { "x-admin-token": "admin-secret" } });
  assert.equal((await runMiddleware(tokenAuth.requireApiAdmin, tokenRequest)).kind, "next");
  assert.equal(tokenRequest.alteredAdminAuthMethod, "header-token");

  const rejected = await runMiddleware(
    tokenAuth.requireApiAdmin,
    createRequest({ headers: { "x-admin-token": "wrong" } })
  );
  assert.equal(rejected.response.statusCode, 401);
  assert.deepEqual(rejected.payload, { error: "Unauthorized" });
});

test("shared sessions distinguish missing, denied, failed, and authorized lookups", async () => {
  let entry = null;
  let lookupError = null;
  let allowlist = { allowed: false, reason: "Account is not an Altered admin." };
  const sharedAuthStore = {
    resolveSessionFromRequest() {
      if (lookupError) throw lookupError;
      return entry;
    },
  };
  const repository = {
    admin: {
      isUbisoftAdminAllowed: () => allowlist,
    },
  };
  const auth = createAuth({ repository, sharedAuthStore });

  const missing = await runMiddleware(auth.requireApiAdmin, createRequest());
  assert.equal(missing.response.statusCode, 401);
  assert.equal(missing.payload.error, "Unauthorized");
  assert.match(missing.payload.loginUrl, /^https:\/\/xjk\.yt\/auth\/ubisoft\/login\?/u);

  entry = { token: "session", row: { subject: "subject", username: "tester" } };
  const denied = await runMiddleware(auth.requireApiAdmin, createRequest());
  assert.equal(denied.response.statusCode, 403);
  assert.equal(denied.payload.error, "Account is not an Altered admin.");

  allowlist = { allowed: true, user: { adminUserId: 41, role: "editor", isActive: true } };
  const authorizedRequest = createRequest();
  const authorized = await runMiddleware(auth.requireApiAdmin, authorizedRequest);
  assert.equal(authorized.kind, "next");
  assert.equal(authorizedRequest.alteredAdminAuthMethod, "shared-session");
  assert.equal(authorizedRequest.alteredAdmin.adminUserId, 41);
  assert.equal(authorizedRequest.alteredAdminSession, entry);

  lookupError = new Error("session database unavailable");
  const failed = await runMiddleware(auth.requireApiAdmin, createRequest());
  assert.equal(failed.response.statusCode, 500);
  assert.deepEqual(failed.payload, { error: "session database unavailable" });
});

test("OAuth fallback is local-only and unavailable OAuth fails closed", async () => {
  const auth = createAuth({
    config: {
      UBI_OAUTH_ENABLED: true,
      ALTERED_OAUTH_FALLBACK_LOCAL_ONLY: true,
    },
  });
  const localRequest = createRequest({ host: "altered.localhost" });
  assert.equal(auth.isOAuthFallbackOpen(localRequest), true);
  assert.equal(auth.isOAuthRequiredButUnavailable(localRequest), false);
  assert.equal((await runMiddleware(auth.requireApiAdmin, localRequest)).kind, "next");
  assert.equal(localRequest.alteredAdminAuthMethod, "dev-local-open");

  const remoteRequest = createRequest();
  assert.equal(auth.isOAuthFallbackOpen(remoteRequest), false);
  assert.equal(auth.isOAuthRequiredButUnavailable(remoteRequest), true);
  const unavailable = await runMiddleware(auth.requireApiAdmin, remoteRequest);
  assert.equal(unavailable.response.statusCode, 503);
  assert.equal(unavailable.payload.oauthRequired, true);
});

test("live auth contexts fail closed and expose only the tokens required by Nadeo calls", async () => {
  let entry = null;
  let allowlist = { allowed: true, user: { role: "admin" } };
  const sharedAuthStore = { resolveSessionFromRequest: () => entry };
  const auth = createAuth({
    sharedAuthStore,
    repository: { admin: { isUbisoftAdminAllowed: () => allowlist } },
  });

  await assert.rejects(auth.resolveLiveAuthContext(createRequest()), { message: "Unauthorized", statusCode: 401 });
  entry = { token: "session", row: { subject: "subject", username: "tester" } };
  allowlist = { allowed: false, reason: "disabled account" };
  await assert.rejects(auth.resolveLiveAuthContext(createRequest()), {
    message: "disabled account",
    statusCode: 403,
  });
  allowlist = { allowed: true, user: { role: "admin" } };
  await assert.rejects(auth.resolveLiveAuthContext(createRequest()), { statusCode: 401 });

  entry.row.access_token = "access-token";
  entry.row.refresh_token = "refresh-token";
  const context = await auth.resolveLiveAuthContext(createRequest());
  assert.deepEqual(context, {
    ubisoftAccessToken: "access-token",
    ubisoftRefreshToken: "refresh-token",
    subject: "subject",
    username: "tester",
  });

  const legacyAuth = createAuth({
    config: { UBI_OAUTH_ENABLED: true },
    ubisoftAuth: createUbisoftAuth({
      getStatus: () => ({ enabled: true }),
      getSessionFromRequest: () => ({ user: { username: "legacy" } }),
      getNadeoAuthContextFromRequest: async () => ({ ubisoftAccessToken: "legacy-token" }),
    }),
  });
  assert.deepEqual(await legacyAuth.resolveLiveAuthContext(createRequest()), {
    ubisoftAccessToken: "legacy-token",
  });
});

test("cache and missing-asset middleware preserve dynamic-route semantics", async () => {
  const auth = createAuth();
  const apiRequest = createRequest({
    headers: { "if-none-match": "etag", "if-modified-since": "yesterday" },
  });
  const apiResult = await runMiddleware(auth.disableApiCache, apiRequest);
  assert.equal(apiResult.kind, "next");
  assert.equal(apiRequest.headers["if-none-match"], undefined);
  assert.equal(apiRequest.headers["if-modified-since"], undefined);
  assert.equal(apiResult.response.headers["Cache-Control"], "no-store, no-cache, must-revalidate, proxy-revalidate");
  assert.equal(apiResult.response.headers["Surrogate-Control"], "no-store");

  const adminResult = await runMiddleware(auth.disableAdminApiCache, createRequest());
  assert.equal(adminResult.response.headers["Cache-Control"], "no-store, no-cache, must-revalidate");

  const missingAsset = await runMiddleware(
    auth.rejectMissingStaticAsset,
    createRequest({ method: "GET", path: "/admin/missing.js" })
  );
  assert.equal(missingAsset.response.statusCode, 404);
  assert.equal(missingAsset.response.contentType, "text/plain");
  assert.equal(missingAsset.payload, "Not Found");
  assert.equal(
    (await runMiddleware(auth.rejectMissingStaticAsset, createRequest({ method: "GET", path: "/admin/route" }))).kind,
    "next"
  );
  assert.equal(
    (await runMiddleware(auth.rejectMissingStaticAsset, createRequest({ method: "POST", path: "/admin/file.js" })))
      .kind,
    "next"
  );
});
