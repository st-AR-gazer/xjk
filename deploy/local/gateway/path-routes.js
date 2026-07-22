import path from "node:path";

import {
  AGGREGATOR_HUB_PORT,
  ALTERED_HUB_PORT,
  CONSOLE_HUB_PORT,
  HUB_PORT,
  LEARN_PROFILE_PORT,
  PLUGINS_HUB_PORT,
  PORT,
  PREFER_LOCAL_SUBDOMAIN_REDIRECTS,
  REMOTE_AGGREGATOR_ENABLED,
  REMOTE_ALTERED_ENABLED,
  REMOTE_SERVER_ENABLED,
  REMOTE_TRACKER_ENABLED,
  SITE_ROOTS,
  TRACKER_CLUB_HUB_PORT,
  TRACKER_DISPLAYNAME_HUB_PORT,
  TRACKER_HUB_PORT,
  TRACKER_LEADERBOARD_HUB_PORT,
  XJK_AUTH_PORT,
} from "./config.js";
import {
  getPathname,
  getQuery,
  isConsoleRuntimeRequest,
  maybeRedirectPathToSubdomain,
  redirect,
  sendText,
  serveStatic,
} from "./http.js";
import {
  isAlteredLocalServiceRequest,
  isAlteredRemoteApiRequest,
  routeCotdPath,
  routeDashHost,
  routeToolPath,
  routeValidifierPath,
} from "./host-routes.js";
import {
  proxy,
  proxyRemoteAggregator,
  proxyRemoteAltered,
  proxyRemoteServerHost,
  proxyRemoteTracker,
} from "./proxy.js";

function maybeRedirectLegacyTrackerPath(req, res, oldPrefix, targetPrefix) {
  const pathname = getPathname(req);
  if (pathname !== oldPrefix && !pathname.startsWith(`${oldPrefix}/`)) return false;

  const suffix = pathname.slice(oldPrefix.length) || "/";
  const location = `${targetPrefix}${suffix}${getQuery(req)}`;
  redirect(res, PREFER_LOCAL_SUBDOMAIN_REDIRECTS ? `http://trackers.localhost:${PORT}${location}` : location);
  return true;
}

function routeTrackerRuntimePath(req, res, pathname) {
  const runtimeRoutes = [
    ["wr", TRACKER_HUB_PORT, "WR"],
    ["leaderboard", TRACKER_LEADERBOARD_HUB_PORT, "leaderboard"],
    ["displayname", TRACKER_DISPLAYNAME_HUB_PORT, "displayname"],
    ["club", TRACKER_CLUB_HUB_PORT, "club"],
  ];

  for (const [routeName, port, label] of runtimeRoutes) {
    const prefix = `/trackers/__runtime/${routeName}`;
    if (pathname === prefix) {
      redirect(res, `${prefix}/`);
      return true;
    }
    if (!pathname.startsWith(`${prefix}/`)) continue;

    if (port > 0) proxy(req, res, port, prefix);
    else if (REMOTE_TRACKER_ENABLED) proxyRemoteTracker(req, res, { stripPrefix: prefix });
    else if (REMOTE_SERVER_ENABLED) proxyRemoteServerHost(req, res, "trackers.xjk.yt", { stripPrefix: prefix });
    else sendText(res, 502, `Local ${label} tracker runtime is not configured.`);
    return true;
  }

  return false;
}

function routeTrackerPublicPath(req, res, pathname) {
  const publicRoutes = [
    ["wr", TRACKER_HUB_PORT, "WR"],
    ["leaderboard", TRACKER_LEADERBOARD_HUB_PORT, "leaderboard"],
    ["displayname", TRACKER_DISPLAYNAME_HUB_PORT, "displayname"],
    ["club", TRACKER_CLUB_HUB_PORT, "club"],
  ];

  for (const [routeName, port, label] of publicRoutes) {
    const prefix = `/trackers/${routeName}`;
    if (pathname === prefix || pathname === `${prefix}/index.html`) {
      redirect(res, `${prefix}/`);
      return true;
    }
    if (pathname === `${prefix}/`) {
      serveStatic(req, res, SITE_ROOTS.trackers, "/trackers");
      return true;
    }
    if (!pathname.startsWith(`${prefix}/`)) continue;

    if (port > 0) proxy(req, res, port, prefix);
    else if (REMOTE_TRACKER_ENABLED) proxyRemoteTracker(req, res, { stripPrefix: "/trackers" });
    else if (REMOTE_SERVER_ENABLED) {
      proxyRemoteServerHost(req, res, "trackers.xjk.yt", { stripPrefix: "/trackers" });
    } else sendText(res, 502, `Local ${label} tracker runtime is not configured.`);
    return true;
  }

  return false;
}

function routeRemoteTrackerPath(req, res, pathname) {
  const isRemoteTrackerPath =
    pathname === "/__remote/trackers" ||
    pathname === "/__remote/trackers/" ||
    pathname.startsWith("/__remote/trackers/");
  if (!isRemoteTrackerPath) return false;
  proxyRemoteTracker(req, res, { stripPrefix: "/__remote/trackers" });
  return true;
}

function routeAlteredBannerBuilderPath(req, res, pathname) {
  if (pathname.startsWith("/altered/bannerbuilder/assets/")) {
    serveStatic(req, res, path.join(SITE_ROOTS.altered, "bannerbuilder"), "/altered/bannerbuilder");
    return true;
  }

  const shouldRedirect =
    PREFER_LOCAL_SUBDOMAIN_REDIRECTS &&
    (pathname === "/altered/bannerbuilder" || pathname.startsWith("/altered/bannerbuilder/"));
  if (!shouldRedirect) return false;
  redirect(res, `http://altered.localhost:${PORT}${pathname.slice("/altered".length)}${getQuery(req)}`);
  return true;
}

function routeSubdomainRedirect(req, res, pathname) {
  const redirects = [
    ["/tools", "tools"],
    ["/plugins", "plugins"],
    ["/learn", "learn"],
    ["/console", "console"],
    ["/archive", "archive"],
    ["/altered", "altered"],
    ["/trackers", "trackers"],
    ["/aggregator", "aggregator"],
    ["/dash", "dash"],
    ["/admin", "admin"],
    ["/validifier", "validifier"],
    ["/cotd", "cotd"],
  ];

  for (const [prefix, subdomain] of redirects) {
    if (prefix === "/console" && isConsoleRuntimeRequest(pathname)) continue;
    if (maybeRedirectPathToSubdomain(req, res, prefix, subdomain)) return true;
  }
  return false;
}

function routeTrackerSupportPath(req, res, pathname) {
  if (pathname.startsWith("/trackers-shell/")) {
    serveStatic(req, res, path.join(SITE_ROOTS.trackers, "trackers-shell"), "/trackers-shell");
    return true;
  }
  return routeTrackerRuntimePath(req, res, pathname);
}

function routePrivateDashApi(req, res, pathname) {
  const isPrivateDashApi =
    pathname.startsWith("/api/private/dash/") ||
    pathname === "/api/private/dash" ||
    pathname.startsWith("/api/v1/private/dash/") ||
    pathname === "/api/v1/private/dash";
  if (!isPrivateDashApi) return false;
  routeDashHost(req, res);
  return true;
}

function routeToolsPath(req, res, pathname) {
  if (pathname === "/tools") {
    redirect(res, "/tools/");
    return true;
  }
  const handledTool = routeToolPath(req, res, "/tools");
  if (handledTool !== null) return true;
  if (!pathname.startsWith("/tools/")) return false;

  if (HUB_PORT > 0) proxy(req, res, HUB_PORT, "/tools");
  else if (REMOTE_SERVER_ENABLED) proxyRemoteServerHost(req, res, "tools.xjk.yt", { stripPrefix: "/tools" });
  else proxy(req, res, HUB_PORT, "/tools");
  return true;
}

function routePluginsPath(req, res, pathname) {
  if (pathname === "/plugins") {
    redirect(res, "/plugins/");
    return true;
  }
  if (!pathname.startsWith("/plugins/")) return false;

  if (PLUGINS_HUB_PORT > 0) proxy(req, res, PLUGINS_HUB_PORT, "/plugins");
  else if (REMOTE_SERVER_ENABLED) {
    proxyRemoteServerHost(req, res, "plugins.xjk.yt", { stripPrefix: "/plugins" });
  } else sendText(res, 502, "Local plugins hub is not configured.");
  return true;
}

function routeLearnPath(req, res, pathname) {
  if (pathname === "/learn") {
    redirect(res, "/learn/");
    return true;
  }
  if (!pathname.startsWith("/learn/")) return false;

  const isProfileRequest =
    pathname === "/learn/health" || pathname.startsWith("/learn/api/") || pathname.startsWith("/learn/auth/");
  if (isProfileRequest && LEARN_PROFILE_PORT > 0) proxy(req, res, LEARN_PROFILE_PORT, "/learn");
  else if (isProfileRequest) sendText(res, 502, "Local Learn profile runtime is not configured.");
  else serveStatic(req, res, SITE_ROOTS.learn, "/learn");
  return true;
}

function routeConsolePath(req, res, pathname) {
  const redirectPaths = new Set([
    "/console",
    "/console/bingo",
    "/console/rmc",
    "/console/rms",
    "/console/rmt",
    "/console/coming-soon",
  ]);
  if (redirectPaths.has(pathname)) {
    redirect(res, `${pathname}/`);
    return true;
  }
  if (!pathname.startsWith("/console/")) return false;

  if (isConsoleRuntimeRequest(pathname) && CONSOLE_HUB_PORT > 0) {
    proxy(req, res, CONSOLE_HUB_PORT, "/console");
  } else if (isConsoleRuntimeRequest(pathname) || (REMOTE_SERVER_ENABLED && CONSOLE_HUB_PORT <= 0)) {
    if (REMOTE_SERVER_ENABLED) {
      proxyRemoteServerHost(req, res, "console.xjk.yt", { stripPrefix: "/console" });
    } else sendText(res, 502, "Local console hub runtime is not configured.");
  } else serveStatic(req, res, SITE_ROOTS.console, "/console");
  return true;
}

function routeStaticSitePath(req, res, pathname, prefix, root) {
  if (pathname === prefix) {
    redirect(res, `${prefix}/`);
    return true;
  }
  if (!pathname.startsWith(`${prefix}/`)) return false;
  serveStatic(req, res, root, prefix);
  return true;
}

function routeAlteredPath(req, res, pathname) {
  if (pathname === "/altered") {
    redirect(res, "/altered/");
    return true;
  }
  if (!pathname.startsWith("/altered/")) return false;

  if (REMOTE_SERVER_ENABLED) {
    if (REMOTE_ALTERED_ENABLED) {
      const originalUrl = req.url;
      req.url = pathname.slice("/altered".length) + getQuery(req);
      try {
        if (isAlteredRemoteApiRequest(getPathname(req))) {
          proxyRemoteAltered(req, res);
          return true;
        }
      } finally {
        req.url = originalUrl;
      }
    }
    proxy(req, res, ALTERED_HUB_PORT, "/altered");
    return true;
  }

  if (!REMOTE_ALTERED_ENABLED) {
    proxy(req, res, ALTERED_HUB_PORT, "/altered");
    return true;
  }

  const originalUrl = req.url;
  req.url = pathname.slice("/altered".length) + getQuery(req);
  try {
    const alteredPath = getPathname(req);
    if (isAlteredLocalServiceRequest(alteredPath)) proxy(req, res, ALTERED_HUB_PORT);
    else if (isAlteredRemoteApiRequest(alteredPath)) proxyRemoteAltered(req, res);
    else serveStatic(req, res, SITE_ROOTS.altered);
  } finally {
    req.url = originalUrl;
  }
  return true;
}

function routeTrackersPath(req, res, pathname) {
  if (pathname === "/trackers") {
    redirect(res, "/trackers/");
    return true;
  }
  if (routeTrackerPublicPath(req, res, pathname)) return true;
  if (!pathname.startsWith("/trackers/")) return false;
  serveStatic(req, res, SITE_ROOTS.trackers, "/trackers");
  return true;
}

function routeAggregatorPath(req, res, pathname) {
  if (pathname === "/aggregator") {
    redirect(res, "/aggregator/");
    return true;
  }
  if (!pathname.startsWith("/aggregator/")) return false;

  if (AGGREGATOR_HUB_PORT > 0) proxy(req, res, AGGREGATOR_HUB_PORT, "/aggregator");
  else if (REMOTE_AGGREGATOR_ENABLED) proxyRemoteAggregator(req, res, { stripPrefix: "/aggregator" });
  else if (REMOTE_SERVER_ENABLED) {
    proxyRemoteServerHost(req, res, "aggregator.xjk.yt", { stripPrefix: "/aggregator" });
  } else sendText(res, 502, "Local aggregator service is not configured.");
  return true;
}

function routeDashPath(req, res, pathname) {
  if (pathname === "/dash") {
    redirect(res, "/dash/");
    return true;
  }
  if (!pathname.startsWith("/dash/")) return false;

  const originalUrl = req.url;
  req.url = pathname.slice("/dash".length) + getQuery(req);
  try {
    routeDashHost(req, res);
  } finally {
    req.url = originalUrl;
  }
  return true;
}

function routePublicProductPath(req, res, pathname) {
  if (pathname === "/validifier") redirect(res, "/validifier/");
  else if (pathname.startsWith("/validifier/")) routeValidifierPath(req, res, "/validifier");
  else if (pathname === "/cotd") redirect(res, "/cotd/");
  else if (pathname.startsWith("/cotd/")) routeCotdPath(req, res, "/cotd");
  else return false;
  return true;
}

function routeAccountPath(req, res, pathname) {
  const isAuthPath = pathname.startsWith("/auth/") || pathname.startsWith("/api/v1/account/");
  const isAccountPath = pathname === "/account" || pathname.startsWith("/account/");
  if (!isAuthPath && !isAccountPath) return false;

  if (XJK_AUTH_PORT > 0) proxy(req, res, XJK_AUTH_PORT);
  else sendText(res, 502, "Local xjk auth runtime is not configured.");
  return true;
}

function routePathMode(req, res) {
  if (maybeRedirectLegacyTrackerPath(req, res, "/tracker", "/trackers/wr")) return;
  if (maybeRedirectLegacyTrackerPath(req, res, "/tracker-displayname", "/trackers/displayname")) return;
  if (maybeRedirectLegacyTrackerPath(req, res, "/tracker-club", "/trackers/club")) return;

  const p = getPathname(req);
  if (routeRemoteTrackerPath(req, res, p)) return;
  if (routeAlteredBannerBuilderPath(req, res, p)) return;
  if (routeSubdomainRedirect(req, res, p)) return;
  if (routeTrackerSupportPath(req, res, p)) return;
  if (routePrivateDashApi(req, res, p)) return;
  if (routeToolsPath(req, res, p)) return;
  if (routePluginsPath(req, res, p)) return;
  if (routeLearnPath(req, res, p)) return;
  if (routeConsolePath(req, res, p)) return;
  if (routeStaticSitePath(req, res, p, "/archive", SITE_ROOTS.archive)) return;
  if (routeAlteredPath(req, res, p)) return;
  if (routeTrackersPath(req, res, p)) return;
  if (routeAggregatorPath(req, res, p)) return;
  if (routeDashPath(req, res, p)) return;
  if (routeStaticSitePath(req, res, p, "/admin", SITE_ROOTS.admin)) return;
  if (routePublicProductPath(req, res, p)) return;
  if (routeAccountPath(req, res, p)) return;

  return serveStatic(req, res, SITE_ROOTS.xjk);
}

export { maybeRedirectLegacyTrackerPath, routePathMode };
