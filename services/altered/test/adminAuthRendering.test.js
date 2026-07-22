import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createAdminAuth } from "../src/http/adminAuth.js";
import { registerAdminSessionRoutes } from "../src/http/adminAuthRoutes.js";

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function sessionRouteAuth() {
  return {
    getHeaderAdminToken: () => "",
    isConfiguredAdminToken: () => false,
    getStaticAdminSession: () => null,
    getOAuthLoginUrl: () => "/auth/ubisoft/login",
    buildSharedLogoutCookie: () => "",
    isOAuthEnforced: () => true,
    isLocalRequest: () => false,
    getSharedAdminContext: async () => null,
    isOAuthFallbackOpen: () => false,
    isOAuthRequiredButUnavailable: () => false,
  };
}

test("Altered OAuth callback errors are escaped before HTML rendering", async () => {
  const payload = '<img src=x onerror="globalThis.compromised=true">';
  const app = express();
  registerAdminSessionRoutes({
    app,
    auth: sessionRouteAuth(),
    repository: { admin: { countActiveAdminUsers: () => 0 } },
    ubisoftAuth: {
      completeCallback: async () => ({ ok: false, statusCode: 400, error: payload }),
    },
    sharedAuthStore: null,
    config: {
      ADMIN_TOKEN: "",
      UBI_OAUTH_ENABLED: true,
      ALTERED_DEV_LOCAL_OPEN: false,
      XJK_SHARED_AUTH_ORIGIN: "https://xjk.yt",
    },
  });

  const server = await listen(app);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/auth/ubisoft/callback?code=x&state=y`);
    const html = await response.text();
    assert.equal(response.status, 400);
    assert.doesNotMatch(html, /<img\b/iu);
    assert.match(html, /&lt;img src=x onerror=&quot;globalThis\.compromised=true&quot;&gt;/u);
  } finally {
    await close(server);
  }
});

test("Altered page authorization reasons and errors are escaped", async () => {
  const payload = '<svg onload="globalThis.compromised=true">';
  let throwLookupError = false;
  const repository = {
    admin: {
      isUbisoftAdminAllowed() {
        if (throwLookupError) throw new Error(payload);
        return { allowed: false, reason: payload };
      },
    },
  };
  const auth = createAdminAuth({
    repository,
    ubisoftAuth: {},
    sharedAuthStore: {
      resolveSessionFromRequest: () => ({
        token: "opaque-session",
        row: { subject: "subject", username: "tester" },
      }),
    },
    config: {
      XJK_SHARED_AUTH_ORIGIN: "https://xjk.yt",
      XJK_SHARED_AUTH_LOCAL_ORIGIN: "http://localhost:8080",
      XJK_SHARED_AUTH_ALLOWED_RETURN_HOSTS: ["xjk.yt"],
      XJK_SHARED_AUTH_SESSION_COOKIE_NAME: "xjk_session",
      XJK_SHARED_AUTH_SESSION_COOKIE_DOMAIN: ".xjk.yt",
    },
  });
  const app = express();
  app.get("/admin", auth.requirePageAdmin, (_request, response) => response.send("allowed"));

  const server = await listen(app);
  try {
    const { port } = server.address();
    const deniedResponse = await fetch(`http://127.0.0.1:${port}/admin`);
    const deniedHtml = await deniedResponse.text();
    assert.equal(deniedResponse.status, 403);
    assert.doesNotMatch(deniedHtml, /<svg\b/iu);
    assert.match(deniedHtml, /&lt;svg onload=&quot;globalThis\.compromised=true&quot;&gt;/u);

    throwLookupError = true;
    const errorResponse = await fetch(`http://127.0.0.1:${port}/admin`);
    const errorHtml = await errorResponse.text();
    assert.equal(errorResponse.status, 500);
    assert.doesNotMatch(errorHtml, /<svg\b/iu);
    assert.match(errorHtml, /&lt;svg onload=&quot;globalThis\.compromised=true&quot;&gt;/u);
  } finally {
    await close(server);
  }
});

test("cookie-authenticated admin mutations reject sibling origins", () => {
  const auth = createAdminAuth({
    repository: {},
    ubisoftAuth: {},
    sharedAuthStore: null,
    config: {},
  });
  const createResponse = () => ({
    statusCode: 200,
    payload: null,
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.payload = value;
      return this;
    },
  });

  const siblingResponse = createResponse();
  auth.requireAdminMutationOrigin(
    {
      method: "POST",
      alteredAdminAuthMethod: "shared-session",
      protocol: "https",
      headers: {
        host: "altered.xjk.yt",
        origin: "https://learn.xjk.yt",
        "sec-fetch-site": "same-site",
      },
    },
    siblingResponse,
    () => assert.fail("Sibling-origin mutation reached its handler.")
  );
  assert.equal(siblingResponse.statusCode, 403);

  let sameOriginAccepted = false;
  auth.requireAdminMutationOrigin(
    {
      method: "POST",
      alteredAdminAuthMethod: "shared-session",
      protocol: "https",
      headers: { host: "altered.xjk.yt", origin: "https://altered.xjk.yt" },
    },
    createResponse(),
    () => {
      sameOriginAccepted = true;
    }
  );
  assert.equal(sameOriginAccepted, true);

  let serviceAccepted = false;
  auth.requireAdminMutationOrigin(
    {
      method: "POST",
      alteredAdminAuthMethod: "internal-service",
      protocol: "https",
      headers: { host: "altered.xjk.yt" },
    },
    createResponse(),
    () => {
      serviceAccepted = true;
    }
  );
  assert.equal(serviceAccepted, true);
});
