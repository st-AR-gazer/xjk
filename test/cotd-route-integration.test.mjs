import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1");
    server.once("error", reject);
    server.once("listening", () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function requestJson(port, { method = "GET", pathname, headers = {}, body } = {}) {
  const encodedBody = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        method,
        path: pathname,
        headers: {
          accept: "application/json",
          ...(encodedBody
            ? { "content-length": Buffer.byteLength(encodedBody), "content-type": "application/json" }
            : {}),
          ...headers,
        },
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          resolve({
            body: responseBody ? JSON.parse(responseBody) : null,
            headers: response.headers,
            statusCode: response.statusCode,
          });
        });
      }
    );
    request.once("error", reject);
    if (encodedBody) request.write(encodedBody);
    request.end();
  });
}

test("COTD routes never share debug/admin responses with anonymous cache entries", async () => {
  const dataDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), "xjk-cotd-route-"));
  const configuredEnvironment = {
    COTD_ADMIN_TOKEN: "route-test-token",
    COTD_ALLOW_DEBUG_RAW: "1",
    COTD_PUBLIC_CACHE_MAX_ENTRIES: "4",
    COTD_PUBLIC_CACHE_TTL_MS: "60000",
    COTD_PUBLIC_DATA_DIR: dataDirectory,
    COTD_PUBLIC_DB_FILE: path.join(dataDirectory, "cotd.sqlite"),
    COTD_MAP_FILES_DIR: path.join(dataDirectory, "maps"),
    COTD_TOTD_FETCH_ENABLED: "0",
  };
  const previousEnvironment = Object.fromEntries(
    Object.keys(configuredEnvironment).map((name) => [name, process.env[name]])
  );
  Object.assign(process.env, configuredEnvironment);

  let runtime;
  let server;

  try {
    runtime = await import(`../services/cotd-public/server.js?route-test=${Date.now()}`);
    server = await listen(runtime.app);
    const { port } = server.address();
    const adminHeaders = { "x-cotd-admin-token": "route-test-token" };
    const ingest = await requestJson(port, {
      method: "POST",
      pathname: "/api/v1/admin/ingest",
      headers: adminHeaders,
      body: {
        cotd: { cotdDate: "2026-07-20", mapUid: "route-map", mapName: "Route Test" },
        classification: { rankedStyles: [{ style: "Tech", score: 1 }] },
        raw: { privateMarker: "admin-only" },
      },
    });
    assert.equal(ingest.statusCode, 201);
    assert.equal(ingest.headers["cache-control"], "private, no-store");

    const deniedAdmin = await requestJson(port, {
      method: "POST",
      pathname: "/api/v1/admin/fetch-now",
      body: {},
    });
    assert.equal(deniedAdmin.statusCode, 401);
    assert.equal(deniedAdmin.headers["cache-control"], "private, no-store");

    const firstPublic = await requestJson(port, { pathname: "/api/v1/today" });
    assert.equal(firstPublic.headers["x-cotd-cache"], "miss");
    assert.equal(firstPublic.body.data.raw, undefined);
    const cachedPublic = await requestJson(port, { pathname: "/api/v1/today" });
    assert.equal(cachedPublic.headers["x-cotd-cache"], "hit");

    const debug = await requestJson(port, {
      pathname: "/api/v1/today?debug=1",
      headers: adminHeaders,
    });
    assert.equal(debug.headers["cache-control"], "private, no-store");
    assert.equal(debug.headers["x-cotd-cache"], "bypass");
    assert.equal(debug.body.data.raw.privateMarker, "admin-only");

    const publicAfterDebug = await requestJson(port, { pathname: "/api/v1/today" });
    assert.equal(publicAfterDebug.headers["x-cotd-cache"], "hit");
    assert.equal(publicAfterDebug.body.data.raw, undefined);

    const deniedDebug = await requestJson(port, { pathname: "/api/v1/today?debug=1" });
    assert.equal(deniedDebug.headers["cache-control"], "private, no-store");
    assert.equal(deniedDebug.body.data.raw, undefined);
  } finally {
    if (server) await close(server);
    runtime?.repository.close();
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await fsp.rm(dataDirectory, { recursive: true, force: true });
  }
});
