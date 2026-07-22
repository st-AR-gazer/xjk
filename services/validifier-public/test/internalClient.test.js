import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  INTERNAL_ACCESS_TOKEN_HEADER,
  INTERNAL_SUBMISSION_SECRET_HEADER,
  createInternalClient,
} from "../src/internalClient.js";

function createConfig(overrides = {}) {
  return {
    internalBaseUrl: "",
    internalSubmissionSecret: "",
    requestTimeoutMs: 2_000,
    ...overrides,
  };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test("configured private backends require a replay submission secret", () => {
  assert.throws(
    () => createInternalClient(createConfig({ internalBaseUrl: "http://127.0.0.1:8090" })),
    (error) =>
      error?.code === "invalid_internal_configuration" && /VALIDIFIER_INTERNAL_SUBMISSION_SECRET/.test(error.message)
  );
});

test("an unconfigured private backend remains an explicit unavailable state", async () => {
  const client = createInternalClient(createConfig());
  await assert.rejects(client.requestJson("/health"), { code: "upstream_unavailable" });
});

test("private API access credentials are sent in a header and never in the URL", async (context) => {
  const received = {};
  const server = http.createServer((request, response) => {
    received.url = request.url;
    received.accessToken = request.headers[INTERNAL_ACCESS_TOKEN_HEADER.toLowerCase()];
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"ok":true}');
  });
  const port = await listen(server);
  context.after(() => close(server));

  const client = createInternalClient(
    createConfig({
      internalBaseUrl: `http://127.0.0.1:${port}`,
      internalAccessToken: "header-only-secret",
      internalSubmissionSecret: "submission-secret",
    })
  );
  await client.requestJson("/v1/records/record-1/verdicts?track=replay_validation");

  assert.equal(received.url, "/v1/records/record-1/verdicts?track=replay_validation");
  assert.equal(received.accessToken, "header-only-secret");
  assert.doesNotMatch(received.url, /header-only-secret|access_token/i);
});

test("replay submissions authenticate to the private endpoint", async (context) => {
  const received = {};
  const server = http.createServer((request, response) => {
    received.method = request.method;
    received.url = request.url;
    received.secret = request.headers[INTERNAL_SUBMISSION_SECRET_HEADER.toLowerCase()];
    request.resume();
    request.once("end", () => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"accepted":true}');
    });
  });
  const port = await listen(server);
  context.after(() => close(server));

  const directory = await mkdtemp(path.join(os.tmpdir(), "validifier-client-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const mapPath = path.join(directory, "map.Map.Gbx");
  const replayPath = path.join(directory, "run.Replay.Gbx");
  await Promise.all([writeFile(mapPath, "map"), writeFile(replayPath, "replay")]);

  const client = createInternalClient(
    createConfig({
      internalBaseUrl: `http://127.0.0.1:${port}`,
      internalSubmissionSecret: "test-submission-secret",
    })
  );
  const payload = await client.submitReplayMultipart({
    recordId: "record-1",
    mapUid: "map-1",
    mapPath,
    mapFilename: "map.Map.Gbx",
    replayPath,
    replayFilename: "run.Replay.Gbx",
  });

  assert.deepEqual(payload, { accepted: true });
  assert.equal(received.method, "POST");
  assert.equal(received.url, "/internal/api/v1/submissions/replay");
  assert.equal(received.secret, "test-submission-secret");
});
