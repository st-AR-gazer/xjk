import path from "node:path";

import { PORT, SITE_ROOTS, XJK_AUTH_PORT } from "./config.js";
import {
  routeAdminHost,
  routeAggregatorHost,
  routeAlteredHost,
  routeArchiveHost,
  routeConsoleHost,
  routeCotdHost,
  routeDashHost,
  routeLearnHost,
  routePluginsHost,
  routeToolsHost,
  routeTrackersHost,
  routeValidifierHost,
} from "./host-routes.js";
import {
  getHost,
  getPathname,
  redirectHostPreservePath,
  redirectToTrackersSubpath,
  sendText,
  serveStatic,
} from "./http.js";
import { routePathMode } from "./path-routes.js";
import { proxy } from "./proxy.js";

function routeAccountHost(req, res) {
  if (XJK_AUTH_PORT > 0) return proxy(req, res, XJK_AUTH_PORT);
  return sendText(res, 502, "Local xjk auth runtime is not configured.");
}

const hostRoutes = new Map([
  ["tools.localhost", routeToolsHost],
  ["validifier.localhost", routeValidifierHost],
  ["cotd.localhost", routeCotdHost],
  ["plugins.localhost", routePluginsHost],
  ["account.localhost", routeAccountHost],
  ["account.xjk.yt", routeAccountHost],
  ["learn.localhost", routeLearnHost],
  ["console.localhost", routeConsoleHost],
  ["console.xjk.yt", routeConsoleHost],
  ["archive.localhost", routeArchiveHost],
  ["altered.localhost", routeAlteredHost],
  ["trackers.localhost", routeTrackersHost],
  ["aggregator.localhost", routeAggregatorHost],
  ["dash.localhost", routeDashHost],
  ["dash.xjk.yt", routeDashHost],
  ["admin.localhost", routeAdminHost],
  ["admin.xjk.yt", routeAdminHost],
]);

const hostRedirects = new Map([
  ["alterednadeo.localhost", (req, res) => redirectHostPreservePath(req, res, "altered.localhost")],
  ["bingo.localhost", (req, res) => redirectHostPreservePath(req, res, "console.localhost")],
  ["tracker.localhost", (req, res) => redirectToTrackersSubpath(req, res, "/wr")],
  ["tracker-displayname.localhost", (req, res) => redirectToTrackersSubpath(req, res, "/displayname")],
  ["tracker-club.localhost", (req, res) => redirectToTrackersSubpath(req, res, "/club")],
]);

const pathModeHosts = new Set(["xjk.localhost", "localhost", "127.0.0.1"]);
const GATEWAY_HOSTS = Object.freeze(
  [...new Set([...hostRoutes.keys(), ...hostRedirects.keys(), ...pathModeHosts])].sort()
);

function getRequestPort(req) {
  const match = String(req.headers.host || "").match(/:(\d+)$/);
  return match ? Number(match[1]) : PORT;
}

function createUnknownHostMessage(port = PORT) {
  const addresses = GATEWAY_HOSTS.map((host) => `${host}:${port}`);
  return `Unknown host. Use ${addresses.join(", ")}.`;
}

async function handleGatewayRequest(req, res) {
  const host = getHost(req);
  const pathname = getPathname(req);

  if (pathname === "/xjk-account-widget.js") {
    return serveStatic(req, res, path.join(SITE_ROOTS.shared, "xjk-core"));
  }
  if (pathname.startsWith("/shared/xjk-core/") || pathname.startsWith("/shared/xjk-workspace/")) {
    return serveStatic(req, res, SITE_ROOTS.shared, "/shared");
  }
  if (pathname === "/shared/main.css") {
    return serveStatic(req, res, SITE_ROOTS.trackers);
  }
  if (pathname.startsWith("/shared/")) {
    if (host === "tools.localhost") return serveStatic(req, res, SITE_ROOTS.toolsShared, "/shared");
    if (host === "trackers.localhost") return serveStatic(req, res, SITE_ROOTS.trackers);
    return serveStatic(req, res, SITE_ROOTS.shared, "/shared");
  }

  const hostRoute = hostRoutes.get(host);
  if (hostRoute) return hostRoute(req, res);
  const hostRedirect = hostRedirects.get(host);
  if (hostRedirect) return hostRedirect(req, res);
  if (pathModeHosts.has(host)) return routePathMode(req, res);

  return sendText(res, 404, createUnknownHostMessage(getRequestPort(req)));
}

export { GATEWAY_HOSTS, createUnknownHostMessage, handleGatewayRequest };
