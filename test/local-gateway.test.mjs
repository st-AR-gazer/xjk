import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PLATFORM_MANIFEST, PORT, TOOL_ROUTES } from "../deploy/local/gateway/config.js";
import { serveStatic } from "../deploy/local/gateway/http.js";
import { GATEWAY_HOSTS, createUnknownHostMessage } from "../deploy/local/gateway/request-handler.js";
import { createGatewayServer } from "../deploy/local/local-gateway.js";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function request(server, { host, pathname, headers = {} }) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: address.port,
        path: pathname,
        headers: { host, ...headers },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ body, headers: res.headers, statusCode: res.statusCode }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

test("gateway entry is import-safe and creates an idle server", () => {
  const server = createGatewayServer();
  assert.equal(server.listening, false);
  assert.equal(server.listenerCount("request"), 1);
});

test("gateway tool routes are generated from the platform manifest", () => {
  const manifestTools = PLATFORM_MANIFEST.tools.filter((tool) => tool.serviceId);
  assert.deepEqual(
    TOOL_ROUTES.map(({ id, path }) => ({ id, path })),
    manifestTools.map(({ id, path }) => ({ id, path }))
  );
  assert.ok(TOOL_ROUTES.every((route) => Number.isInteger(route.port) && route.port > 0));
});

test("gateway help is rendered from the accepted host routes and active port", () => {
  const message = createUnknownHostMessage(48080);
  for (const host of GATEWAY_HOSTS) assert.match(message, new RegExp(`${host.replaceAll(".", "\\.")}:48080`));
  assert.doesNotMatch(message, /:8080/);
});

test("gateway preserves host aliases, legacy paths, shared assets, and unknown-host behavior", async () => {
  const server = createGatewayServer();
  await listen(server);

  try {
    const alteredAlias = await request(server, {
      host: "alterednadeo.localhost",
      pathname: "/maps/?sort=new",
    });
    assert.equal(alteredAlias.statusCode, 308);
    assert.equal(alteredAlias.headers.location, `http://altered.localhost:${PORT}/maps/?sort=new`);

    const trackerAlias = await request(server, {
      host: "tracker.localhost",
      pathname: "/admin?tab=jobs",
    });
    assert.equal(trackerAlias.statusCode, 308);
    assert.equal(trackerAlias.headers.location, `http://trackers.localhost:${PORT}/wr/admin?tab=jobs`);

    const legacyTrackerPath = await request(server, {
      host: "localhost",
      pathname: "/tracker/leaderboard?season=current",
    });
    assert.equal(legacyTrackerPath.statusCode, 308);
    assert.equal(
      legacyTrackerPath.headers.location,
      `http://trackers.localhost:${PORT}/trackers/wr/leaderboard?season=current`
    );

    const sharedWidget = await request(server, {
      host: "xjk.localhost",
      pathname: "/xjk-account-widget.js",
    });
    assert.equal(sharedWidget.statusCode, 200);
    assert.match(sharedWidget.headers["content-type"], /^application\/javascript/);

    const unknownHost = await request(server, {
      host: "not-xjk.localhost",
      pathname: "/",
    });
    assert.equal(unknownHost.statusCode, 404);
    assert.match(unknownHost.body, /Unknown host/);
  } finally {
    await close(server);
  }
});

test("gateway contains malformed URL, cookie, and handler failures", async () => {
  const server = createGatewayServer();
  await listen(server);

  try {
    const malformedPath = await request(server, {
      host: "xjk.localhost",
      pathname: "/%",
    });
    assert.equal(malformedPath.statusCode, 400);
    assert.equal(malformedPath.body, "Malformed URL encoding.");

    const malformedCookie = await request(server, {
      host: "xjk.localhost",
      pathname: "/learn",
      headers: { cookie: "%=broken; xjk_session=%" },
    });
    assert.equal(malformedCookie.statusCode, 308);

    const followup = await request(server, {
      host: "not-xjk.localhost",
      pathname: "/",
    });
    assert.equal(followup.statusCode, 404);
  } finally {
    await close(server);
  }

  const expectedError = new Error("expected test failure");
  const originalConsoleError = console.error;
  const loggedErrors = [];
  console.error = (...args) => loggedErrors.push(args);
  const rejectingServer = createGatewayServer({
    requestHandler: () => {
      throw expectedError;
    },
  });
  await listen(rejectingServer);

  try {
    const response = await request(rejectingServer, {
      host: "xjk.localhost",
      pathname: "/",
    });
    assert.equal(response.statusCode, 500);
    assert.equal(response.body, "Internal Server Error");
    assert.equal(loggedErrors.length, 1);
    assert.equal(loggedErrors[0][1], expectedError);
  } finally {
    console.error = originalConsoleError;
    await close(rejectingServer);
  }
});

test("gateway static serving opens files before headers and treats missing directory indexes as not found", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "xjk-gateway-static-"));
  await fsp.writeFile(path.join(root, "index.html"), "root index", "utf8");
  await fsp.writeFile(path.join(root, "asset.js"), "asset body", "utf8");
  await fsp.mkdir(path.join(root, "empty"));

  const raceFileSystem = {
    open: async (filePath, flags) => {
      if (path.basename(filePath) === "race.js") {
        const error = new Error("removed between stat and open");
        error.code = "ENOENT";
        throw error;
      }
      return fsp.open(filePath, flags);
    },
    stat: (filePath) => fsp.stat(filePath),
  };
  await fsp.writeFile(path.join(root, "race.js"), "must not leak a 200", "utf8");

  const server = http.createServer((req, res) => {
    void serveStatic(req, res, root, "", { fileSystem: raceFileSystem });
  });
  await listen(server);

  try {
    const asset = await request(server, { host: "localhost", pathname: "/asset.js" });
    assert.equal(asset.statusCode, 200);
    assert.equal(asset.body, "asset body");

    const raced = await request(server, { host: "localhost", pathname: "/race.js" });
    assert.equal(raced.statusCode, 404);
    assert.equal(raced.body, "Not Found");

    const emptyDirectory = await request(server, { host: "localhost", pathname: "/empty/" });
    assert.equal(emptyDirectory.statusCode, 404);
    assert.equal(emptyDirectory.body, "Not Found");
  } finally {
    await close(server);
    await fsp.rm(root, { recursive: true, force: true });
  }
});
