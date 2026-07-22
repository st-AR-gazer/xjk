import assert from "node:assert/strict";
import test from "node:test";

import { createConsoleHubRequestHandler } from "../src/router.js";

test("the router removes the public prefix and decodes match identifiers", async () => {
  const calls = [];
  const routes = {
    handleMatchEvents(_req, _res, matchUid) {
      calls.push(["events", matchUid]);
    },
    notFound() {
      calls.push(["not-found"]);
    },
  };
  const handler = createConsoleHubRequestHandler({
    config: { callbackPath: "/bingo/auth/ubisoft/callback" },
    helpers: {
      stripPublicBasePath(pathname) {
        return pathname.startsWith("/bingo/") ? pathname.slice("/bingo".length) : pathname;
      },
    },
    httpSupport: { sendJson() {} },
    routes,
  });

  await handler({ method: "GET", url: "/bingo/events/matches/a%20match" }, {});
  await handler({ method: "GET", url: "/bingo/not-a-route" }, {});

  assert.deepEqual(calls, [["events", "a match"], ["not-found"]]);
});
