import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AGGREGATOR_HUB_PORT,
  ALTERED_HUB_PORT,
  CONSOLE_HUB_PORT,
  COTD_PUBLIC_PORT,
  HUB_PORT,
  LEARN_PROFILE_PORT,
  PLATFORM_MANIFEST,
  PLUGINS_HUB_PORT,
  PORT,
  PREFER_LOCAL_SUBDOMAIN_REDIRECTS,
  REMOTE_AGGREGATOR_ENABLED,
  REMOTE_AGGREGATOR_HOST_HEADER,
  REMOTE_AGGREGATOR_URL,
  REMOTE_ALTERED_ENABLED,
  REMOTE_ALTERED_HOST_HEADER,
  REMOTE_ALTERED_URL,
  REMOTE_SERVER_ENABLED,
  REMOTE_SERVER_URL,
  REMOTE_TRACKER_ENABLED,
  REMOTE_TRACKER_HOST_HEADER,
  REMOTE_TRACKER_URL,
  TOOL_ROUTES,
  TRACKER_CLUB_HUB_PORT,
  TRACKER_DISPLAYNAME_HUB_PORT,
  TRACKER_HUB_PORT,
  TRACKER_LEADERBOARD_HUB_PORT,
  VALIDIFIER_PUBLIC_PORT,
  XJK_AUTH_PORT,
} from "./gateway/config.js";
import { handleGatewayRequest } from "./gateway/request-handler.js";

function createGatewayServer({ requestHandler = handleGatewayRequest } = {}) {
  return http.createServer((request, response) => {
    Promise.resolve()
      .then(() => requestHandler(request, response))
      .catch((error) => {
        console.error("Local gateway request failed:", error);
        if (response.headersSent || response.writableEnded) {
          response.destroy();
          return;
        }
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
        response.end("Internal Server Error");
      });
  });
}

function logGatewayStartup() {
  const toolUpstreams = TOOL_ROUTES.map((route) => `${route.id}:${route.port}`).join(" ");
  console.log(`Local gateway listening on http://127.0.0.1:${PORT}`);
  console.log(
    "Hosts: xjk.localhost, account.localhost, console.localhost, bingo.localhost (redirect), tools.localhost, validifier.localhost, cotd.localhost, plugins.localhost, learn.localhost, archive.localhost, altered.localhost, trackers.localhost, aggregator.localhost, dash.localhost, admin.localhost, dash.xjk.yt, admin.xjk.yt, alterednadeo.localhost (redirect)"
  );
  console.log(`Path aliases redirect to subdomains: ${PREFER_LOCAL_SUBDOMAIN_REDIRECTS}`);
  if (REMOTE_SERVER_ENABLED) console.log(`Remote full proxy enabled -> origin:${REMOTE_SERVER_URL.origin}`);
  console.log(
    `Upstreams -> xjk-auth:${XJK_AUTH_PORT} console-hub:${CONSOLE_HUB_PORT} tools-hub:${HUB_PORT} validifier-public:${VALIDIFIER_PUBLIC_PORT} cotd-public:${COTD_PUBLIC_PORT} plugins-hub:${PLUGINS_HUB_PORT} learn-profile:${LEARN_PROFILE_PORT} altered-hub:${ALTERED_HUB_PORT} tracker-wr-hub:${TRACKER_HUB_PORT} tracker-leaderboard-hub:${TRACKER_LEADERBOARD_HUB_PORT} tracker-displayname-hub:${TRACKER_DISPLAYNAME_HUB_PORT} tracker-club-hub:${TRACKER_CLUB_HUB_PORT} aggregator-hub:${AGGREGATOR_HUB_PORT} ${toolUpstreams}`
  );
  if (REMOTE_TRACKER_ENABLED) {
    console.log(
      `Remote tracker proxy enabled -> origin:${REMOTE_TRACKER_URL.origin} hostHeader:${REMOTE_TRACKER_HOST_HEADER}`
    );
  }
  if (REMOTE_ALTERED_ENABLED) {
    console.log(
      `Remote altered proxy enabled -> origin:${REMOTE_ALTERED_URL.origin} hostHeader:${REMOTE_ALTERED_HOST_HEADER}`
    );
  }
  if (REMOTE_AGGREGATOR_ENABLED) {
    console.log(
      `Remote aggregator proxy enabled -> origin:${REMOTE_AGGREGATOR_URL.origin} hostHeader:${REMOTE_AGGREGATOR_HOST_HEADER}`
    );
  }
}

function startGateway({ host = "127.0.0.1", port = PORT } = {}) {
  const server = createGatewayServer();
  server.listen(port, host, logGatewayStartup);
  return server;
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) startGateway();

export { PLATFORM_MANIFEST, createGatewayServer, handleGatewayRequest, startGateway };
