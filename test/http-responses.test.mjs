import assert from "node:assert/strict";
import test from "node:test";

import { writeJsonResponse, writeRedirectResponse, writeTextResponse } from "../services/shared/httpResponses.js";
import { buildServicePublicUrl, buildSharedSessionLogoutCookie } from "../services/shared/xjkAuth.js";

function createResponseRecorder() {
  return {
    body: undefined,
    headers: undefined,
    statusCode: undefined,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}

test("shared HTTP response writers retain caller-owned cache and security policy", () => {
  const json = createResponseRecorder();
  writeJsonResponse(json, 201, { ok: true }, { headers: { "cache-control": "no-store" } });
  assert.equal(json.statusCode, 201);
  assert.deepEqual(json.headers, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  assert.equal(json.body, '{"ok":true}');

  const text = createResponseRecorder();
  writeTextResponse(text, 200, "hello", {
    contentType: "text/html; charset=utf-8",
    headers: { "x-content-type-options": "nosniff" },
  });
  assert.equal(text.headers["content-type"], "text/html; charset=utf-8");
  assert.equal(text.headers["x-content-type-options"], "nosniff");
  assert.equal(text.body, "hello");

  const redirect = createResponseRecorder();
  writeRedirectResponse(redirect, "/account/", { headers: { "cache-control": "no-store" } });
  assert.equal(redirect.statusCode, 302);
  assert.equal(redirect.headers.location, "/account/");
  assert.equal(redirect.body, undefined);
});

test("shared identity navigation maps local services and scopes logout cookies", () => {
  const localRequest = { headers: { host: "learn.localhost:8080" }, socket: {} };
  assert.equal(
    buildServicePublicUrl(localRequest, "/#/profile", {
      localOrigin: "http://localhost:8080",
      localPathPrefix: "/learn",
    }),
    "http://localhost:8080/learn/#/profile"
  );
  assert.equal(
    buildSharedSessionLogoutCookie(localRequest, {
      cookieName: "xjk_session",
      cookieDomain: ".xjk.yt",
    }),
    "xjk_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax"
  );

  const productionRequest = {
    headers: { host: "learn.xjk.yt", "x-forwarded-proto": "https" },
    socket: {},
  };
  assert.equal(buildServicePublicUrl(productionRequest, "/#/profile"), "https://learn.xjk.yt/#/profile");
  assert.equal(
    buildSharedSessionLogoutCookie(productionRequest, {
      cookieName: "xjk_session",
      cookieDomain: ".xjk.yt",
    }),
    "xjk_session=; Max-Age=0; Path=/; Domain=.xjk.yt; HttpOnly; SameSite=Lax; Secure"
  );
});
