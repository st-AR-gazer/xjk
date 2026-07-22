import {
  AGGREGATOR_HUB_PORT,
  ALTERED_BANNER_BUILDER_PORT,
  ALTERED_HUB_PORT,
  CONSOLE_HUB_PORT,
  HUB_PORT,
  LEARN_PROFILE_PORT,
  PLUGINS_HUB_PORT,
  REMOTE_AGGREGATOR_ENABLED,
  REMOTE_ALTERED_ENABLED,
  REMOTE_SERVER_ENABLED,
  REMOTE_TRACKER_ENABLED,
  SITE_ROOTS,
  TOOL_ROUTES,
  TRACKER_CLUB_HUB_PORT,
  TRACKER_DISPLAYNAME_HUB_PORT,
  TRACKER_HUB_PORT,
  TRACKER_LEADERBOARD_HUB_PORT,
  XJK_AUTH_PORT,
} from "./config.js";
import { getPathname, getQuery, redirect, sendText, serveStatic } from "./http.js";
import {
  isServiceRequest,
  proxy,
  proxyCotdToAvailablePort,
  proxyRemoteAggregator,
  proxyRemoteAggregatorWithLocalFallback,
  proxyRemoteAltered,
  proxyRemoteServerHost,
  proxyRemoteTracker,
  proxyValidifierToAvailablePort,
} from "./proxy.js";

function routeToolPath(req, res, prefix) {
  const pathname = getPathname(req);

  for (const route of TOOL_ROUTES) {
    const exactPath = `${prefix}/${route.path}`;
    if (pathname === exactPath) return redirect(res, `${exactPath}/`);
    if (pathname.startsWith(`${exactPath}/`)) return proxy(req, res, route.port, exactPath);
  }

  return null;
}

function isAlteredLocalServiceRequest(pathname) {
  const normalizedPath = String(pathname || "").trim() || "/";
  return (
    normalizedPath === "/health" ||
    normalizedPath === "/api" ||
    normalizedPath === "/api/" ||
    (normalizedPath.startsWith("/api/") &&
      !normalizedPath.startsWith("/api/v1/") &&
      !normalizedPath.startsWith("/api/admin/")) ||
    normalizedPath === "/auth" ||
    normalizedPath.startsWith("/auth/") ||
    normalizedPath === "/admin-login" ||
    normalizedPath === "/admin-login/" ||
    normalizedPath === "/admin-login.html" ||
    normalizedPath === "/admin" ||
    normalizedPath.startsWith("/admin/") ||
    normalizedPath === "/admin.html" ||
    normalizedPath === "/admin-monitoring" ||
    normalizedPath === "/admin-monitoring/" ||
    normalizedPath === "/admin-monitoring.html" ||
    normalizedPath === "/api/v1/admin" ||
    normalizedPath.startsWith("/api/v1/admin/") ||
    normalizedPath === "/api/v1/alterations" ||
    normalizedPath.startsWith("/api/v1/alterations/") ||
    normalizedPath === "/api/v1/public/display-names/resolve" ||
    normalizedPath === "/api/admin" ||
    normalizedPath.startsWith("/api/admin/")
  );
}

function isAlteredRemoteApiRequest(pathname) {
  const normalizedPath = String(pathname || "").trim() || "/";
  return !isAlteredLocalServiceRequest(normalizedPath) && normalizedPath.startsWith("/api/");
}

function isAlteredBannerBuilderRequest(pathname) {
  const normalizedPath = String(pathname || "").trim() || "/";
  return (
    normalizedPath === "/bannerbuilder" ||
    normalizedPath === "/bannerbuilder/" ||
    normalizedPath.startsWith("/bannerbuilder/")
  );
}

function maybeProxySharedAccountRequest(req, res) {
  const pathname = getPathname(req);
  if (!pathname.startsWith("/auth/") && !pathname.startsWith("/api/v1/account/")) return false;

  if (XJK_AUTH_PORT > 0) proxy(req, res, XJK_AUTH_PORT);
  else sendText(res, 502, "Local xjk auth runtime is not configured.");
  return true;
}

function routeToolsHost(req, res) {
  if (maybeProxySharedAccountRequest(req, res)) return;
  const handled = routeToolPath(req, res, "");
  if (handled !== null) return handled;
  if (HUB_PORT > 0) return proxy(req, res, HUB_PORT);
  if (REMOTE_SERVER_ENABLED) return proxyRemoteServerHost(req, res, "tools.xjk.yt");
  return sendText(res, 502, "Local tools hub is not configured.");
}

async function routeValidifierHost(req, res) {
  const pathname = getPathname(req);
  if (maybeProxySharedAccountRequest(req, res)) return;

  if (isServiceRequest(pathname)) {
    if (await proxyValidifierToAvailablePort(req, res)) return;
    if (REMOTE_SERVER_ENABLED) return proxyRemoteServerHost(req, res, "validifier.xjk.yt");
    return sendText(res, 502, "Local Validifier service is not configured.");
  }

  return serveStatic(req, res, SITE_ROOTS.validifier);
}

async function routeValidifierPath(req, res, basePrefix) {
  const pathname = getPathname(req);
  const localPath = pathname.startsWith(basePrefix) ? pathname.slice(basePrefix.length) || "/" : pathname;

  if (isServiceRequest(localPath)) {
    if (await proxyValidifierToAvailablePort(req, res, basePrefix)) return;
    if (REMOTE_SERVER_ENABLED) {
      return proxyRemoteServerHost(req, res, "validifier.xjk.yt", { stripPrefix: basePrefix });
    }
    return sendText(res, 502, "Local Validifier service is not configured.");
  }

  return serveStatic(req, res, SITE_ROOTS.validifier, basePrefix);
}

async function routeCotdHost(req, res) {
  const pathname = getPathname(req);
  if (maybeProxySharedAccountRequest(req, res)) return;

  if (isServiceRequest(pathname)) {
    if (await proxyCotdToAvailablePort(req, res)) return;
    if (REMOTE_SERVER_ENABLED) return proxyRemoteServerHost(req, res, "cotd.xjk.yt");
    return sendText(res, 502, "Local COTD service is not configured.");
  }

  return serveStatic(req, res, SITE_ROOTS.cotd);
}

async function routeCotdPath(req, res, basePrefix) {
  const pathname = getPathname(req);
  const localPath = pathname.startsWith(basePrefix) ? pathname.slice(basePrefix.length) || "/" : pathname;

  if (isServiceRequest(localPath)) {
    if (await proxyCotdToAvailablePort(req, res, basePrefix)) return;
    if (REMOTE_SERVER_ENABLED) {
      return proxyRemoteServerHost(req, res, "cotd.xjk.yt", { stripPrefix: basePrefix });
    }
    return sendText(res, 502, "Local COTD service is not configured.");
  }

  return serveStatic(req, res, SITE_ROOTS.cotd, basePrefix);
}

function routePluginsHost(req, res) {
  if (maybeProxySharedAccountRequest(req, res)) return;
  if (PLUGINS_HUB_PORT > 0) return proxy(req, res, PLUGINS_HUB_PORT);
  if (REMOTE_SERVER_ENABLED) return proxyRemoteServerHost(req, res, "plugins.xjk.yt");
  return sendText(res, 502, "Local plugins hub is not configured.");
}

function routeLearnHost(req, res) {
  const pathname = getPathname(req);
  if (pathname.startsWith("/auth/") || pathname.startsWith("/api/v1/account/")) {
    if (XJK_AUTH_PORT > 0) return proxy(req, res, XJK_AUTH_PORT);
    return sendText(res, 502, "Local xjk auth runtime is not configured.");
  }
  if (pathname === "/health" || pathname.startsWith("/api/")) {
    if (LEARN_PROFILE_PORT > 0) return proxy(req, res, LEARN_PROFILE_PORT);
    return sendText(res, 502, "Local Learn profile runtime is not configured.");
  }
  return serveStatic(req, res, SITE_ROOTS.learn);
}

function routeConsoleHost(req, res) {
  const pathname = getPathname(req);
  if (pathname.startsWith("/auth/") || pathname.startsWith("/api/v1/account/")) {
    if (XJK_AUTH_PORT > 0) return proxy(req, res, XJK_AUTH_PORT);
    return sendText(res, 502, "Local xjk auth runtime is not configured.");
  }

  if (pathname === "/bingo") return redirect(res, "/bingo/");
  if (pathname === "/rmc") return redirect(res, "/rmc/");
  if (pathname === "/rms") return redirect(res, "/rms/");
  if (pathname === "/rmt") return redirect(res, "/rmt/");
  if (pathname === "/coming-soon") return redirect(res, "/coming-soon/");

  const runtimeRequest =
    pathname === "/health" ||
    pathname.startsWith("/bingo/api/") ||
    pathname.startsWith("/bingo/auth/") ||
    pathname.startsWith("/bingo/events/");
  if (runtimeRequest) {
    if (CONSOLE_HUB_PORT > 0) return proxy(req, res, CONSOLE_HUB_PORT);
    if (REMOTE_SERVER_ENABLED) return proxyRemoteServerHost(req, res, "console.xjk.yt");
    return sendText(res, 502, "Local console hub runtime is not configured.");
  }

  if (REMOTE_SERVER_ENABLED && CONSOLE_HUB_PORT <= 0) {
    return proxyRemoteServerHost(req, res, "console.xjk.yt");
  }
  return serveStatic(req, res, SITE_ROOTS.console);
}

function routeArchiveHost(req, res) {
  if (maybeProxySharedAccountRequest(req, res)) return;
  return serveStatic(req, res, SITE_ROOTS.archive);
}

function routeAdminHost(req, res) {
  const pathname = getPathname(req);
  if (pathname === "/map-layout.js" || pathname === "/favicon.svg") {
    return serveStatic(req, res, SITE_ROOTS.xjk);
  }
  if (pathname.startsWith("/auth/") || pathname.startsWith("/api/v1/account/")) {
    if (XJK_AUTH_PORT > 0) return proxy(req, res, XJK_AUTH_PORT);
    return sendText(res, 502, "Local xjk auth runtime is not configured.");
  }
  return serveStatic(req, res, SITE_ROOTS.admin);
}

function routeAlteredHost(req, res) {
  if (maybeProxySharedAccountRequest(req, res)) return;

  const pathname = getPathname(req);
  if (pathname === "/bannerbuilder") return redirect(res, "/bannerbuilder/");
  if (pathname === "/altered/bannerbuilder") return redirect(res, "/bannerbuilder/");
  if (pathname.startsWith("/altered/bannerbuilder/")) {
    return redirect(res, pathname.slice("/altered".length) + getQuery(req));
  }
  if (isAlteredBannerBuilderRequest(pathname)) {
    if (ALTERED_BANNER_BUILDER_PORT > 0) return proxy(req, res, ALTERED_BANNER_BUILDER_PORT);
    return sendText(res, 502, "Local Altered banner builder is not configured.");
  }

  if (REMOTE_SERVER_ENABLED) {
    if (ALTERED_HUB_PORT > 0) {
      if (REMOTE_ALTERED_ENABLED && isAlteredRemoteApiRequest(pathname)) {
        return proxyRemoteAltered(req, res);
      }
      return proxy(req, res, ALTERED_HUB_PORT);
    }
    return proxyRemoteServerHost(req, res, "altered.xjk.yt");
  }
  if (REMOTE_ALTERED_ENABLED) {
    if (isAlteredLocalServiceRequest(pathname)) return proxy(req, res, ALTERED_HUB_PORT);
    if (isAlteredRemoteApiRequest(pathname)) return proxyRemoteAltered(req, res);
    return serveStatic(req, res, SITE_ROOTS.altered);
  }
  if (isAlteredLocalServiceRequest(pathname) || isAlteredRemoteApiRequest(pathname)) {
    return proxy(req, res, ALTERED_HUB_PORT);
  }
  return serveStatic(req, res, SITE_ROOTS.altered);
}

function routeTrackersHost(req, res) {
  const pathname = getPathname(req);
  if (pathname.startsWith("/auth/") || pathname.startsWith("/api/v1/account/")) {
    if (XJK_AUTH_PORT > 0) return proxy(req, res, XJK_AUTH_PORT);
    return sendText(res, 502, "Local xjk auth runtime is not configured.");
  }

  const runtimeRoutes = [
    ["wr", TRACKER_HUB_PORT, "WR"],
    ["leaderboard", TRACKER_LEADERBOARD_HUB_PORT, "leaderboard"],
    ["displayname", TRACKER_DISPLAYNAME_HUB_PORT, "displayname"],
    ["club", TRACKER_CLUB_HUB_PORT, "club"],
  ];
  for (const [routeName, port, label] of runtimeRoutes) {
    const prefix = `/__runtime/${routeName}`;
    if (pathname === prefix) return redirect(res, `${prefix}/`);
    if (pathname.startsWith(`${prefix}/`)) {
      if (port > 0) return proxy(req, res, port, prefix);
      if (REMOTE_TRACKER_ENABLED) return proxyRemoteTracker(req, res, { stripPrefix: prefix });
      if (REMOTE_SERVER_ENABLED) return proxyRemoteServerHost(req, res, "trackers.xjk.yt", { stripPrefix: prefix });
      return sendText(res, 502, `Local ${label} tracker runtime is not configured.`);
    }
  }

  const publicRoutes = [
    ["wr", TRACKER_HUB_PORT, "WR"],
    ["leaderboard", TRACKER_LEADERBOARD_HUB_PORT, "leaderboard"],
    ["displayname", TRACKER_DISPLAYNAME_HUB_PORT, "displayname"],
    ["club", TRACKER_CLUB_HUB_PORT, "club"],
  ];
  for (const [routeName, port, label] of publicRoutes) {
    const prefix = `/${routeName}`;
    if (pathname === prefix || pathname === `${prefix}/index.html`) return redirect(res, `${prefix}/`);
    if (pathname === `${prefix}/`) return serveStatic(req, res, SITE_ROOTS.trackers);
    if (pathname.startsWith(`${prefix}/`)) {
      if (port > 0) return proxy(req, res, port, prefix);
      if (REMOTE_TRACKER_ENABLED) return proxyRemoteTracker(req, res);
      if (REMOTE_SERVER_ENABLED) return proxyRemoteServerHost(req, res, "trackers.xjk.yt");
      return sendText(res, 502, `Local ${label} tracker runtime is not configured.`);
    }
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (TRACKER_HUB_PORT > 0) return proxy(req, res, TRACKER_HUB_PORT);
    if (REMOTE_TRACKER_ENABLED) return proxyRemoteTracker(req, res);
    if (REMOTE_SERVER_ENABLED) return proxyRemoteServerHost(req, res, "trackers.xjk.yt");
    return sendText(res, 502, "Local WR tracker admin runtime is not configured.");
  }
  if (pathname.startsWith("/api/")) {
    if (TRACKER_HUB_PORT > 0) return proxy(req, res, TRACKER_HUB_PORT);
    if (REMOTE_TRACKER_ENABLED) return proxyRemoteTracker(req, res);
    if (REMOTE_SERVER_ENABLED) return proxyRemoteServerHost(req, res, "trackers.xjk.yt");
    return sendText(res, 502, "Local tracker API runtime is not configured.");
  }
  return serveStatic(req, res, SITE_ROOTS.trackers);
}

function routeAggregatorHost(req, res) {
  const pathname = getPathname(req);
  if (pathname.startsWith("/auth/") || pathname.startsWith("/api/v1/account/")) {
    if (XJK_AUTH_PORT > 0) return proxy(req, res, XJK_AUTH_PORT);
    return sendText(res, 502, "Local xjk auth runtime is not configured.");
  }

  if (pathname === "/health" || pathname.startsWith("/api/")) {
    if (AGGREGATOR_HUB_PORT > 0) return proxy(req, res, AGGREGATOR_HUB_PORT);
    if (REMOTE_AGGREGATOR_ENABLED) return proxyRemoteAggregator(req, res);
    if (REMOTE_SERVER_ENABLED) return proxyRemoteServerHost(req, res, "aggregator.xjk.yt");
    return sendText(res, 502, "Local aggregator service is not configured.");
  }
  if (AGGREGATOR_HUB_PORT > 0) return proxy(req, res, AGGREGATOR_HUB_PORT);
  if (REMOTE_AGGREGATOR_ENABLED) return proxyRemoteAggregator(req, res);
  if (REMOTE_SERVER_ENABLED) return proxyRemoteServerHost(req, res, "aggregator.xjk.yt");
  return sendText(res, 502, "Local aggregator service is not configured.");
}

function routeDashHost(req, res) {
  if (maybeProxySharedAccountRequest(req, res)) return;

  const pathname = getPathname(req);
  if (
    pathname === "/__remote/trackers" ||
    pathname === "/__remote/trackers/" ||
    pathname.startsWith("/__remote/trackers/")
  ) {
    return proxyRemoteTracker(req, res, { stripPrefix: "/__remote/trackers" });
  }

  const isPrivateDashApi =
    pathname.startsWith("/api/private/dash/") ||
    pathname === "/api/private/dash" ||
    pathname.startsWith("/api/v1/private/dash/") ||
    pathname === "/api/v1/private/dash";
  if (isPrivateDashApi) {
    if (REMOTE_AGGREGATOR_ENABLED) return proxyRemoteAggregatorWithLocalFallback(req, res);
    if (AGGREGATOR_HUB_PORT > 0) return proxy(req, res, AGGREGATOR_HUB_PORT);
    if (REMOTE_SERVER_ENABLED) return proxyRemoteServerHost(req, res, "dash.xjk.yt");
    return sendText(res, 502, "Local aggregator service is not configured.");
  }

  if (pathname === "/health" || pathname.startsWith("/api/") || pathname.startsWith("/dash/")) {
    if (REMOTE_AGGREGATOR_ENABLED) return proxyRemoteAggregatorWithLocalFallback(req, res);
    if (AGGREGATOR_HUB_PORT > 0) return proxy(req, res, AGGREGATOR_HUB_PORT);
    if (REMOTE_SERVER_ENABLED) return proxyRemoteServerHost(req, res, "dash.xjk.yt");
    return sendText(res, 502, "Local aggregator service is not configured.");
  }

  if (AGGREGATOR_HUB_PORT > 0 || REMOTE_AGGREGATOR_ENABLED || REMOTE_SERVER_ENABLED) {
    return serveStatic(req, res, SITE_ROOTS.dash);
  }
  return proxy(req, res, AGGREGATOR_HUB_PORT);
}

export {
  isAlteredLocalServiceRequest,
  isAlteredRemoteApiRequest,
  maybeProxySharedAccountRequest,
  routeAdminHost,
  routeAggregatorHost,
  routeAlteredHost,
  routeArchiveHost,
  routeConsoleHost,
  routeCotdHost,
  routeCotdPath,
  routeDashHost,
  routeLearnHost,
  routePluginsHost,
  routeToolPath,
  routeToolsHost,
  routeTrackersHost,
  routeValidifierHost,
  routeValidifierPath,
};
