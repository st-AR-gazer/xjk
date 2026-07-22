import assert from "node:assert/strict";
import test from "node:test";

import { apiErrorMessage, fetchJson, unwrapApiData } from "../sites/shared/xjk-core/http.js";

test("API errors use the most specific server message", () => {
  assert.equal(apiErrorMessage({ error: { message: "Nested" } }, 500), "Nested");
  assert.equal(apiErrorMessage({ error: "Direct" }, 400), "Direct");
  assert.equal(apiErrorMessage({ message: "Generic" }, 422), "Generic");
  assert.equal(apiErrorMessage(null, 503), "Request failed (503).");
});

test("API envelopes must explicitly succeed before data is unwrapped", () => {
  assert.deepEqual(unwrapApiData({ ok: true, data: { ready: true } }), { ready: true });
  assert.throws(() => unwrapApiData(null), /Request failed/);
  assert.throws(() => unwrapApiData({ ok: false, error: { message: "Denied" } }), /Denied/);
});

test("fetchJson attaches response details to request failures", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.headers.accept, "application/json");
    return {
      ok: false,
      status: 418,
      json: async () => ({ error: "Teapot" }),
    };
  };

  try {
    await assert.rejects(fetchJson("/brew"), (error) => {
      assert.equal(error.message, "Teapot");
      assert.equal(error.status, 418);
      assert.deepEqual(error.payload, { error: "Teapot" });
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchJson serializes explicit JSON bodies without guessing from generic bodies", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.body, '{"ready":true}');
    assert.equal(options.headers["content-type"], "application/json");
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  try {
    assert.deepEqual(await fetchJson("/save", { method: "POST", json: { ready: true } }), { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchJson exposes response metadata without changing its payload contract", async () => {
  const originalFetch = globalThis.fetch;
  const response = {
    ok: true,
    status: 200,
    headers: new Headers({ "x-source": "remote" }),
    json: async () => ({ ready: true }),
  };
  globalThis.fetch = async () => response;

  try {
    let observedResponse = null;
    const payload = await fetchJson("/status", {
      onResponse(value) {
        observedResponse = value;
      },
    });
    assert.equal(observedResponse, response);
    assert.deepEqual(payload, { ready: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
