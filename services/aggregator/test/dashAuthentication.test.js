import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import {
  createDashAuthentication,
  DASH_COOKIE_NAME,
  normalizeDashNextPath,
  renderDashLoginPage,
} from "../src/auth/dashAuthentication.js";
import { DashSessionStore } from "../src/auth/dashSessionStore.js";

const ADMIN_TOKEN = "long-lived-admin-secret";

function readSessionCookie(response) {
  const setCookie = response.headers.get("set-cookie") || "";
  return {
    cookie: setCookie.split(";", 1)[0],
    setCookie,
  };
}

async function withDashServer(run) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  const authentication = createDashAuthentication({
    adminToken: ADMIN_TOKEN,
    isDashHostRequest: () => true,
  });
  app.use(authentication.middleware);
  app.get("/dash/login", authentication.showLogin);
  app.post("/dash/login", authentication.login);
  app.get("/dash/logout", authentication.logout);
  app.get("/private", (_req, res) => res.type("text").send("private"));
  app.get("/api/v1/private/dash/status", (_req, res) => res.json({ ok: true }));

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  try {
    await run({
      baseUrl: `http://127.0.0.1:${address.port}`,
      authentication,
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function login(baseUrl, { cookie = "", next = "/private", forwardedProto = "https" } = {}) {
  const headers = {
    "content-type": "application/x-www-form-urlencoded",
    "x-forwarded-proto": forwardedProto,
  };
  if (cookie) headers.cookie = cookie;
  return fetch(`${baseUrl}/dash/login`, {
    method: "POST",
    headers,
    body: new URLSearchParams({ token: ADMIN_TOKEN, next }),
    redirect: "manual",
  });
}

test("dashboard next paths reject network paths and backslashes", () => {
  assert.equal(normalizeDashNextPath("/private?tab=traffic"), "/private?tab=traffic");
  assert.equal(normalizeDashNextPath("//evil.example/collect"), "/");
  assert.equal(normalizeDashNextPath("/\\evil.example/collect"), "/");
  assert.equal(normalizeDashNextPath("\\\\evil.example\\collect"), "/");
  assert.equal(normalizeDashNextPath("https://evil.example/private?tab=traffic"), "/private?tab=traffic");

  const page = renderDashLoginPage({ nextPath: '/"><script data-test="x">' });
  assert.doesNotMatch(page, /<script data-test=/);
  assert.match(page, /value="\/&quot;&gt;&lt;script data-test=&quot;x&quot;&gt;"/);
});

test("dashboard sessions expire, rotate, and remain bounded", () => {
  let now = 1_000;
  let tokenSeed = 0;
  const store = new DashSessionStore({
    ttlMs: 100,
    maxSessions: 2,
    cleanupIntervalMs: 10,
    now: () => now,
    randomBytes: () => Buffer.alloc(32, (tokenSeed += 1)),
  });

  const first = store.issue();
  const second = store.issue();
  assert.equal(store.size, 2);
  assert.equal(store.validate(first), true);

  const third = store.issue();
  assert.equal(store.size, 2);
  assert.equal(store.validate(first), false);
  assert.equal(store.validate(second), true);
  assert.equal(store.validate(third), true);

  const rotated = store.rotate(second);
  assert.equal(store.validate(second), false);
  assert.equal(store.validate(rotated), true);
  assert.equal(store.size, 2);

  now += 101;
  assert.equal(store.validate(rotated), false);
  assert.equal(store.size, 0);
});

test("dashboard login stores only an opaque secure session and rotates it", async () => {
  await withDashServer(async ({ baseUrl }) => {
    const legacySecretCookie = await fetch(`${baseUrl}/private`, {
      headers: { cookie: `${DASH_COOKIE_NAME}=${ADMIN_TOKEN}` },
      redirect: "manual",
    });
    assert.equal(legacySecretCookie.status, 302);

    const firstLogin = await login(baseUrl);
    assert.equal(firstLogin.status, 302);
    assert.equal(firstLogin.headers.get("location"), "/private");
    const first = readSessionCookie(firstLogin);
    assert.match(first.cookie, new RegExp(`^${DASH_COOKIE_NAME}=[A-Za-z0-9_-]{43}$`));
    assert.doesNotMatch(first.setCookie, new RegExp(ADMIN_TOKEN));
    assert.match(first.setCookie, /HttpOnly/i);
    assert.match(first.setCookie, /SameSite=Strict/i);
    assert.match(first.setCookie, /Secure/i);

    const authorized = await fetch(`${baseUrl}/private`, {
      headers: { cookie: first.cookie },
      redirect: "manual",
    });
    assert.equal(authorized.status, 200);

    const secondLogin = await login(baseUrl, { cookie: first.cookie });
    const second = readSessionCookie(secondLogin);
    assert.notEqual(second.cookie, first.cookie);

    const rotatedOut = await fetch(`${baseUrl}/private`, {
      headers: { cookie: first.cookie },
      redirect: "manual",
    });
    assert.equal(rotatedOut.status, 302);

    const rotatedIn = await fetch(`${baseUrl}/private`, {
      headers: { cookie: second.cookie },
      redirect: "manual",
    });
    assert.equal(rotatedIn.status, 200);

    const logout = await fetch(`${baseUrl}/dash/logout`, {
      headers: { cookie: second.cookie, "x-forwarded-proto": "https" },
      redirect: "manual",
    });
    assert.equal(logout.status, 302);
    assert.equal(logout.headers.get("location"), "/dash/login");
    assert.match(logout.headers.get("set-cookie") || "", /Secure/i);

    const loggedOut = await fetch(`${baseUrl}/private`, {
      headers: { cookie: second.cookie },
      redirect: "manual",
    });
    assert.equal(loggedOut.status, 302);
  });
});

test("direct dashboard header tokens remain compatible without creating sessions", async () => {
  await withDashServer(async ({ baseUrl, authentication }) => {
    for (const headers of [
      { "x-dash-token": ADMIN_TOKEN },
      { "x-admin-token": ADMIN_TOKEN },
      { authorization: `Bearer ${ADMIN_TOKEN}` },
      { authorization: ADMIN_TOKEN },
    ]) {
      const response = await fetch(`${baseUrl}/api/v1/private/dash/status`, { headers });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
      assert.equal(response.headers.has("set-cookie"), false);
    }
    assert.equal(authentication.sessionStore.size, 0);

    const rejected = await fetch(`${baseUrl}/api/v1/private/dash/status`, {
      headers: { authorization: "Bearer wrong-token" },
    });
    assert.equal(rejected.status, 401);
  });
});

test("dashboard login redirects malicious next values to the local root", async () => {
  await withDashServer(async ({ baseUrl }) => {
    for (const next of ["//evil.example/collect", "/\\evil.example/collect", "\\\\evil.example\\collect"]) {
      const response = await login(baseUrl, { next });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), "/");
    }

    const httpLogin = await login(baseUrl, { forwardedProto: "http" });
    assert.doesNotMatch(httpLogin.headers.get("set-cookie") || "", /Secure/i);
  });
});
