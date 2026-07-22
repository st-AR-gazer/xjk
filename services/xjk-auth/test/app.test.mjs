import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { createXjkAuthApp } from "../src/app.js";
import { loadXjkAuthConfig } from "../src/config.js";
import { containedPath, mimeForPath } from "../src/staticFiles.js";

test("static paths remain within their configured root", () => {
  const root = path.resolve("xjk-auth-static-root");
  assert.equal(containedPath(root, "/styles/account.css"), path.join(root, "styles", "account.css"));
  assert.equal(containedPath(root, "/..%5c..%5csecret.txt"), null);
  assert.equal(mimeForPath("account.svg"), "image/svg+xml");
  assert.equal(mimeForPath("account.gbx"), "application/octet-stream");
});

test("composed auth app serves health without constructing a database runtime", async (t) => {
  const config = loadXjkAuthConfig({ loadEnvironment: false, env: { PORT: "3038" } });
  const { handleRequest } = createXjkAuthApp({ config, store: {}, oauthStateStore: {} });
  const server = http.createServer(handleRequest);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.service, "xjk-auth");
  assert.equal(body.ok, true);
  assert.equal(body.oauthConfigured, false);
});
