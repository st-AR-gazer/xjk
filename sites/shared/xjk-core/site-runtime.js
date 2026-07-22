import {
  REDESIGN_SCOPES,
  SHARED_ASSET_MODES,
  SITE_LINES,
  SITE_STATUSES,
  XJK_SITE_ALIASES,
  XJK_SITES,
} from "./site-registry.js";

const DEFAULT_PORT_BY_PROTOCOL = Object.freeze({
  "http:": "80",
  "https:": "443",
});

const DATA_LINK_SITE_MAP = Object.freeze({
  account: "account",
  aggregator: "aggregator",
  altered: "altered",
  admin: "admin",
  archive: "archive",
  console: "console",
  cotd: "cotd",
  dash: "dash",
  home: "xjk",
  learn: "learn",
  main: "xjk",
  plugins: "plugins",
  tools: "tools",
  tracker: "trackers",
  trackers: "trackers",
  validifier: "validifier",
  xjk: "xjk",
});
const DATA_LINK_ROUTE_MAP = Object.freeze({
  tracker: "leaderboard",
});
const SITES_BY_ID = new Map(XJK_SITES.map((site) => [site.id, site]));

function trimSlashes(value = "") {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function ensureLeadingSlash(value = "/") {
  const text = String(value || "").trim();
  if (!text) return "/";
  return text.startsWith("/") ? text : `/${text}`;
}

function normalizePath(path = "/") {
  const text = ensureLeadingSlash(path);
  return text.replace(/\/{2,}/g, "/");
}

function normalizePathPrefix(prefix = "") {
  const text = String(prefix || "").trim();
  if (!text || text === "/") return "";
  return `/${trimSlashes(text)}`;
}

function joinPath(prefix = "", path = "/") {
  const left = normalizePathPrefix(prefix);
  const right = normalizePath(path);
  if (!left) return right;
  if (right === "/") return `${left}/`;
  return `${left}${right}`;
}

function getLocation(locationLike = globalThis.location) {
  if (!locationLike) {
    return {
      protocol: "https:",
      hostname: "xjk.yt",
      port: "",
      origin: "https://xjk.yt",
      pathname: "/",
      search: "",
      hash: "",
    };
  }

  const protocol = String(locationLike.protocol || "https:").trim() || "https:";
  const hostname = String(locationLike.hostname || "xjk.yt")
    .trim()
    .toLowerCase();
  const port = String(locationLike.port || "").trim();
  const origin = String(locationLike.origin || `${protocol}//${hostname}${port ? `:${port}` : ""}`).trim();

  return {
    protocol,
    hostname,
    port,
    origin,
    pathname: String(locationLike.pathname || "/"),
    search: String(locationLike.search || ""),
    hash: String(locationLike.hash || ""),
  };
}

function getRuntimeContext(locationLike = globalThis.location) {
  const location = getLocation(locationLike);
  const port = location.port || DEFAULT_PORT_BY_PROTOCOL[location.protocol] || "80";
  const isLoopbackHost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const isLocalSubdomain = location.hostname.endsWith(".localhost");
  const isLocal = isLoopbackHost || isLocalSubdomain;

  return {
    ...location,
    port,
    isLocal,
    isLoopbackHost,
    isLocalSubdomain,
    localPathOrigin: `${location.protocol}//localhost:${port}`,
  };
}

function canonicalSiteId(id) {
  const key = String(id || "")
    .trim()
    .toLowerCase();
  return XJK_SITE_ALIASES[key] || key;
}

function normalizeHost(hostOrLocation = globalThis.location) {
  if (!hostOrLocation) return "";

  if (typeof hostOrLocation === "object") {
    return String(hostOrLocation.hostname || "")
      .split(":")[0]
      .trim()
      .toLowerCase();
  }

  const raw = String(hostOrLocation || "").trim();
  if (!raw) return "";

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  return raw
    .replace(/^\[|\]$/g, "")
    .split("/")[0]
    .split(":")[0]
    .trim()
    .toLowerCase();
}

function getSite(id) {
  return SITES_BY_ID.get(canonicalSiteId(id)) || null;
}

function getAllSites() {
  return [...XJK_SITES];
}

function userHasAdminRole(user = null) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return Boolean(user?.admin || roles.includes("admin"));
}

function getLocalHostAliases(site) {
  return (site.localHostAliases || []).map((alias) => {
    if (typeof alias === "string") {
      return {
        host: alias,
        localPathPrefix: site.localPathPrefix,
      };
    }
    return {
      host: alias.host,
      localPathPrefix: typeof alias.localPathPrefix === "string" ? alias.localPathPrefix : site.localPathPrefix,
      route: alias.route || "",
    };
  });
}

function getSiteHostContext(hostOrLocation = globalThis.location) {
  const hostname = normalizeHost(hostOrLocation);
  if (!hostname) return null;

  for (const site of XJK_SITES) {
    if (hostname === site.host || (site.hostAliases || []).includes(hostname)) {
      return {
        site,
        hostname,
        isLocal: false,
        isAlias: hostname !== site.host,
        localPathPrefix: site.localPathPrefix,
      };
    }

    if (hostname === `${site.localSubdomain}.localhost`) {
      return {
        site,
        hostname,
        isLocal: true,
        isAlias: false,
        localPathPrefix: site.localPathPrefix,
      };
    }

    const localAlias = getLocalHostAliases(site).find((alias) => alias.host === hostname);
    if (localAlias) {
      return {
        site,
        hostname,
        isLocal: true,
        isAlias: true,
        localPathPrefix: localAlias.localPathPrefix,
        route: localAlias.route,
      };
    }
  }

  return null;
}

function getSiteByHost(hostOrLocation = globalThis.location) {
  return getSiteHostContext(hostOrLocation)?.site || null;
}

function getNavigationSites({ includeHidden = false, includeInternal = false } = {}) {
  return getAllSites()
    .filter((site) => includeHidden || site.hub?.visible)
    .filter((site) => includeInternal || !site.internal)
    .sort((left, right) => Number(left.hub?.order || 999) - Number(right.hub?.order || 999));
}

function getMapSites({ includeInternal = false } = {}) {
  return getAllSites()
    .filter((site) => site.map)
    .filter((site) => includeInternal || !site.internal)
    .sort((left, right) => {
      const leftLine = String(left.map?.line || "");
      const rightLine = String(right.map?.line || "");
      if (leftLine !== rightLine) return leftLine.localeCompare(rightLine);
      return Number(left.map?.order || 999) - Number(right.map?.order || 999);
    });
}

function resolveSiteHref(id, options = {}) {
  const site = getSite(id);
  if (!site) return "";

  const context = getRuntimeContext(options.location);
  const path = options.route ? site.routes?.[options.route] || "/" : options.path || "/";
  const query = options.query
    ? String(options.query).startsWith("?")
      ? String(options.query)
      : `?${options.query}`
    : "";
  const hash = options.hash ? (String(options.hash).startsWith("#") ? String(options.hash) : `#${options.hash}`) : "";
  const finalPath = normalizePath(path);

  if (context.isLocalSubdomain) {
    return `${context.protocol}//${site.localSubdomain}.localhost:${context.port}${finalPath}${query}${hash}`;
  }

  if (context.isLoopbackHost) {
    return `${context.localPathOrigin}${joinPath(site.localPathPrefix, finalPath)}${query}${hash}`;
  }

  return `https://${site.host}${finalPath}${query}${hash}`;
}

function createSiteLinkMap(siteIds = XJK_SITES.map((site) => site.id), options = {}) {
  return Object.fromEntries(
    siteIds
      .map((id) => {
        const site = getSite(id);
        return site ? [id, resolveSiteHref(site.id, options)] : null;
      })
      .filter(Boolean)
  );
}

function applySiteLinks(root = globalThis.document, options = {}) {
  const scope = root || globalThis.document;
  if (!scope?.querySelectorAll) return [];
  const attr = options.attribute || "data-xjk-site-link";
  const nodes = [...scope.querySelectorAll(`[${attr}]`)];

  nodes.forEach((node) => {
    const id = node.getAttribute(attr);
    const route = node.getAttribute("data-xjk-site-route") || "";
    const path = node.getAttribute("data-xjk-site-path") || "";
    const href = resolveSiteHref(id, {
      route,
      path: path || undefined,
      location: options.location,
    });
    if (href) node.setAttribute("href", href);
  });

  return nodes;
}

function applySiteDataLinks(root = globalThis.document, options = {}) {
  const scope = root || globalThis.document;
  if (!scope?.querySelectorAll) return [];
  const attr = options.attribute || "data-link";
  const siteMap = options.siteMap || DATA_LINK_SITE_MAP;
  const routeMap = options.routeMap || DATA_LINK_ROUTE_MAP;
  const nodes = [...scope.querySelectorAll(`[${attr}]`)];

  nodes.forEach((node) => {
    const key = node.getAttribute(attr);
    const siteId = siteMap[key];
    if (!siteId) return;

    const href = resolveSiteHref(siteId, {
      route: routeMap[key],
      location: options.location,
    });
    if (href) node.setAttribute("href", href);
  });

  return nodes;
}

function getAccountWidgetSrc() {
  return "/shared/xjk-core/xjk-account-widget.js?v=2";
}

function loadGlobalSearch(options = {}) {
  const doc = options.document || globalThis.document;
  if (!doc?.body) return Promise.resolve(null);
  if (doc !== globalThis.document) return Promise.resolve(null);

  return import("./global-search.js")
    .then(({ mountGlobalSearch }) => mountGlobalSearch(options))
    .catch((error) => {
      console.warn("xjk global search could not load", error);
      return null;
    });
}

function loadAccountWidgetScript(options = {}) {
  const doc = options.document || globalThis.document;
  if (!doc?.head) return null;

  const existing = [...doc.querySelectorAll("script")].find((node) => {
    if (node.dataset?.xjkAccountWidgetLoader) return true;
    if (!node.src) return false;
    try {
      return new URL(node.src, doc.baseURI || globalThis.location?.href || "https://xjk.yt/").pathname.endsWith(
        "/xjk-account-widget.js"
      );
    } catch {
      return String(node.src).includes("xjk-account-widget.js");
    }
  });

  if (existing) {
    return existing;
  }

  const script = doc.createElement("script");
  script.src = getAccountWidgetSrc(options);
  script.defer = true;
  script.dataset.xjkAccountWidgetLoader = "true";
  doc.head.appendChild(script);
  return script;
}

const XjkSite = Object.freeze({
  REDESIGN_SCOPES,
  SHARED_ASSET_MODES,
  SITE_LINES,
  SITE_STATUSES,
  sites: XJK_SITES,
  getSite,
  getAllSites,
  getNavigationSites,
  getMapSites,
  getRuntimeContext,
  getSiteByHost,
  getSiteHostContext,
  userHasAdminRole,
  resolveSiteHref,
  createSiteLinkMap,
  applySiteLinks,
  applySiteDataLinks,
  getAccountWidgetSrc,
  loadGlobalSearch,
  loadAccountWidgetScript,
});

if (typeof globalThis !== "undefined") {
  globalThis.XjkSite = XjkSite;
}

export {
  REDESIGN_SCOPES,
  SHARED_ASSET_MODES,
  SITE_LINES,
  SITE_STATUSES,
  XjkSite,
  XJK_SITES,
  applySiteDataLinks,
  applySiteLinks,
  createSiteLinkMap,
  getAccountWidgetSrc,
  getAllSites,
  getMapSites,
  getNavigationSites,
  getRuntimeContext,
  getSite,
  getSiteByHost,
  getSiteHostContext,
  loadGlobalSearch,
  loadAccountWidgetScript,
  resolveSiteHref,
  userHasAdminRole,
};
