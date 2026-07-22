const FALLBACK_REFRESH_MS = 5000;
const STREAM_RECONNECT_MS = 3000;
const MAPS_PER_PAGE = 25;
const trackerModes = new Set(["wr", "leaderboard"]);

function isLocalHostName(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host.endsWith(".localhost") || host === "localhost" || host === "127.0.0.1";
}

function detectTrackerScopeFromPath(pathname) {
  const lower = String(pathname || "").toLowerCase();
  if (lower.includes("/leaderboard")) return "leaderboard";
  if (lower.includes("/displayname")) return "displayname";
  if (lower.includes("/club")) return "club";
  return "wr";
}

function directPrimaryReadRequested(href) {
  try {
    const value = String(new URL(href).searchParams.get("primary_read") || "")
      .trim()
      .toLowerCase();
    return ["1", "true", "yes"].includes(value);
  } catch {
    return false;
  }
}

function createTrackerBrowserConfig({ location, configuredMode, createRouteResolver }) {
  const mode = trackerModes.has(configuredMode) ? configuredMode : null;
  const isLocalHost = isLocalHostName(location.hostname);
  const scope = mode || detectTrackerScopeFromPath(location.pathname);
  const directPrimaryRead = directPrimaryReadRequested(location.href);
  return {
    configuredMode: mode,
    directPrimaryRead,
    fallbackRefreshMs: FALLBACK_REFRESH_MS,
    isLocalHost,
    mapsPerPage: MAPS_PER_PAGE,
    primaryTrackerBase: `https://trackers.xjk.yt/${scope}/`,
    routes: createRouteResolver(scope),
    scope,
    streamReconnectMs: STREAM_RECONNECT_MS,
  };
}

function toLocalApiPath(config, pathname) {
  const raw = String(pathname || "").trim();
  return config.routes.resolve(raw || "/");
}

function toPrimaryApiUrl(config, pathname) {
  const normalized = String(pathname || "")
    .trim()
    .replace(/^\/+/, "");
  return new URL(normalized, config.primaryTrackerBase).toString();
}

export {
  createTrackerBrowserConfig,
  detectTrackerScopeFromPath,
  directPrimaryReadRequested,
  FALLBACK_REFRESH_MS,
  isLocalHostName,
  MAPS_PER_PAGE,
  STREAM_RECONNECT_MS,
  toLocalApiPath,
  toPrimaryApiUrl,
};
