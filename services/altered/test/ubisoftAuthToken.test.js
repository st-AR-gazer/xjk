import assert from "node:assert/strict";
import test from "node:test";
import { requestOAuthToken } from "../src/auth/ubisoftAuth.js";

test("requestOAuthToken centralizes form transport and contextual failures", async () => {
  const requests = [];
  const payload = new URLSearchParams({ grant_type: "refresh_token", refresh_token: "token" });
  const token = await requestOAuthToken({
    tokenUrl: "https://example.test/token",
    payload,
    failureLabel: "OAuth refresh failed",
    missingTokenMessage: "missing",
    fetchImpl: async (...args) => {
      requests.push(args);
      return { ok: true, status: 200, json: async () => ({ access_token: "access" }) };
    },
  });

  assert.deepEqual(token, { access_token: "access" });
  assert.equal(requests[0][0], "https://example.test/token");
  assert.equal(requests[0][1].body, payload.toString());
  assert.equal(requests[0][1].headers["content-type"], "application/x-www-form-urlencoded");

  await assert.rejects(
    requestOAuthToken({
      tokenUrl: "https://example.test/token",
      payload,
      failureLabel: "OAuth refresh failed",
      missingTokenMessage: "missing",
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error_description: "expired" }),
      }),
    }),
    /OAuth refresh failed \(401\): expired/
  );
});
