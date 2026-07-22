import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";

import { fetchJsonWithTimeout, readJsonBody, readTextBody } from "../services/shared/httpJson.js";

test("service JSON client serializes object bodies", async () => {
  const payload = await fetchJsonWithTimeout("http://service.test/action", {
    method: "POST",
    body: { ready: true },
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, "POST");
      assert.equal(options.body, '{"ready":true}');
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => '{"accepted":true}',
      };
    },
  });

  assert.deepEqual(payload, { accepted: true });
});

test("service JSON client preserves HTTP status and response payload", async () => {
  await assert.rejects(
    fetchJsonWithTimeout("http://service.test/action", {
      fetchImpl: async () => ({
        ok: false,
        status: 409,
        statusText: "Conflict",
        text: async () => '{"error":{"message":"Already running"}}',
      }),
    }),
    (error) => {
      assert.equal(error.message, "Already running");
      assert.equal(error.statusCode, 409);
      assert.deepEqual(error.payload, { error: { message: "Already running" } });
      return true;
    }
  );
});

test("JSON request bodies are bounded for declared and chunked payloads", async () => {
  let resumed = false;
  const declaredOversize = {
    headers: { "content-length": "9" },
    resume() {
      resumed = true;
    },
    async *[Symbol.asyncIterator]() {},
  };
  await assert.rejects(readJsonBody(declaredOversize, { maxBytes: 8 }), (error) => error.statusCode === 413);
  assert.equal(resumed, true);

  const chunkedOversize = {
    headers: {},
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('{"value":');
      yield Buffer.from('"too long"}');
    },
  };
  await assert.rejects(readJsonBody(chunkedOversize, { maxBytes: 12 }), (error) => error.statusCode === 413);
});

test("JSON request body parsing accepts empty and bounded payloads", async () => {
  const request = (chunks) => ({
    headers: {},
    async *[Symbol.asyncIterator]() {
      yield* chunks;
    },
  });

  assert.deepEqual(await readJsonBody(request([])), {});
  assert.deepEqual(await readJsonBody(request([Buffer.from('{"ready":true}')])), { ready: true });
  await assert.rejects(readJsonBody(request([Buffer.from("not-json")])), SyntaxError);
});

test("text request bodies share the bounded reader without changing content", async () => {
  const request = (chunks) => ({
    headers: {},
    async *[Symbol.asyncIterator]() {
      yield* chunks;
    },
  });

  assert.equal(await readTextBody(request([Buffer.from("  text body  ")])), "  text body  ");
  await assert.rejects(readTextBody(request([Buffer.from("too large")]), { maxBytes: 4 }), (error) => {
    return error.statusCode === 413;
  });
});

test("chunked HTTP requests receive 413 after crossing the body limit", async (context) => {
  const server = http.createServer(async (request, response) => {
    try {
      await readJsonBody(request, { maxBytes: 12 });
      response.writeHead(204).end();
    } catch (error) {
      response.writeHead(Number(error?.statusCode || 500)).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const address = server.address();
  const statusCode = await new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port: address.port,
        path: "/",
        method: "POST",
        headers: { "transfer-encoding": "chunked" },
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      }
    );
    request.once("error", reject);
    request.write('{"value":');
    request.end('"too long"}');
  });

  assert.equal(statusCode, 413);
});
