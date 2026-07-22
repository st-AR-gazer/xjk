import assert from "node:assert/strict";
import test from "node:test";

import {
  parseRequestCookies,
  readAuthorizationToken,
  readHeader,
  readRequestToken,
  timingSafeEqualText,
} from "../services/shared/httpAuth.js";

test("request tokens use explicit header precedence and normalized values", () => {
  const request = {
    headers: {
      "x-ingest-token": "  ingest-token  ",
      "x-admin-token": "admin-token",
      authorization: "Bearer bearer-token",
    },
  };

  assert.equal(readHeader(request, "X-Ingest-Token"), "ingest-token");
  assert.equal(readRequestToken(request, { headerNames: ["x-ingest-token", "x-admin-token"] }), "ingest-token");
  assert.equal(readRequestToken(request, { headerNames: ["x-missing"] }), "bearer-token");
});

test("authorization parsing supports legacy raw tokens only when requested", () => {
  assert.equal(readAuthorizationToken({ headers: { authorization: "Bearer value" } }), "value");
  assert.equal(readAuthorizationToken({ headers: { authorization: "legacy-value" } }), "legacy-value");
  assert.equal(readAuthorizationToken({ headers: { authorization: "legacy-value" } }, { acceptRaw: false }), "");
  assert.equal(readRequestToken({ headers: {} }, { headerNames: ["x-token"] }), "");
});

test("cookie parsing decodes names and values consistently", () => {
  assert.deepEqual(parseRequestCookies({ headers: { cookie: "session=abc%20123; theme=dark; ignored" } }), {
    session: "abc 123",
    theme: "dark",
  });
});

test("cookie parsing preserves malformed percent escapes without throwing", () => {
  assert.deepEqual(parseRequestCookies({ headers: { cookie: "session=%; bad%name=value%2; good=ok" } }), {
    session: "%",
    "bad%name": "value%2",
    good: "ok",
  });
});

test("secret comparison rejects empty, unequal-length, and unequal values", () => {
  assert.equal(timingSafeEqualText("secret", "secret"), true);
  assert.equal(timingSafeEqualText("", ""), false);
  assert.equal(timingSafeEqualText("secret", "short"), false);
  assert.equal(timingSafeEqualText("secret-a", "secret-b"), false);
});
