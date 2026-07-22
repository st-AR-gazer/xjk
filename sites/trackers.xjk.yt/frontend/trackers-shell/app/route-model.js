const ROUTE_CONFIG = Object.freeze({
  overview: Object.freeze({ title: "xjk / trackers" }),
  wr: Object.freeze({
    title: "xjk / trackers / wr",
    label: "WR Tracker",
    servicePath: "/wr",
    theme: "wr",
  }),
  leaderboard: Object.freeze({
    title: "xjk / trackers / leaderboard",
    label: "Leaderboard",
    servicePath: "/leaderboard",
    theme: "leaderboard",
  }),
  displayname: Object.freeze({
    title: "xjk / trackers / displayname",
    label: "Displayname",
    servicePath: "/displayname",
    theme: "displayname",
  }),
  club: Object.freeze({
    title: "xjk / trackers / club",
    label: "Club Ingest",
    servicePath: "/club",
    theme: "club",
  }),
});

const RUNTIME_ROUTES = Object.freeze(["wr", "leaderboard", "displayname", "club"]);
const HUB_LINKS = Object.freeze({ main: "xjk", aggregator: "aggregator" });

function getBasePrefix(pathname) {
  const safePath = String(pathname || "/");
  return safePath === "/trackers" || safePath.startsWith("/trackers/") ? "/trackers" : "";
}

function stripBasePrefix(pathname, basePrefix) {
  const safePath = String(pathname || "/");
  if (!basePrefix) return safePath;
  if (safePath === basePrefix) return "/";
  if (safePath.startsWith(`${basePrefix}/`)) return safePath.slice(basePrefix.length) || "/";
  return safePath;
}

function withBase(basePrefix, routePath) {
  const safePath = String(routePath || "").startsWith("/") ? String(routePath) : `/${routePath || ""}`;
  if (!basePrefix) return safePath;
  return safePath === "/" ? `${basePrefix}/` : `${basePrefix}${safePath}`;
}

function routeHref(basePrefix, route) {
  return route === "overview" ? withBase(basePrefix, "/") : withBase(basePrefix, `${ROUTE_CONFIG[route].servicePath}/`);
}

function runtimeEmbedHref({ basePrefix, route }) {
  return withBase(basePrefix, `/__runtime/${route}/index.html`);
}

function runtimeApiHref(basePrefix, route, apiPath) {
  const serviceBase = routeHref(basePrefix, route).replace(/\/$/, "");
  const safePath = String(apiPath || "").startsWith("/") ? String(apiPath) : `/${apiPath || ""}`;
  return `${serviceBase}${safePath}`;
}

function getRouteContext(pathname) {
  const basePrefix = getBasePrefix(pathname);
  const normalized = stripBasePrefix(pathname, basePrefix).replace(/\/+/g, "/");
  const firstSegment = normalized
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)[0]
    ?.toLowerCase();
  return {
    route: RUNTIME_ROUTES.includes(firstSegment) ? firstSegment : "overview",
    basePrefix,
  };
}

export {
  HUB_LINKS,
  ROUTE_CONFIG,
  RUNTIME_ROUTES,
  getBasePrefix,
  getRouteContext,
  routeHref,
  runtimeApiHref,
  runtimeEmbedHref,
  stripBasePrefix,
  withBase,
};
