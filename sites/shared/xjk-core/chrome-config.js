import { XJK_SITES } from "./site-registry.js";

const SITES_BY_ID = new Map(XJK_SITES.map((site) => [site.id, site]));

const DEFAULT_TOPBAR = Object.freeze({
  contextLabel: "",
  searchLabel: "",
  searchHint: "This page and the xjk network",
});

const DEFAULT_SIDENAV = Object.freeze({
  initialMode: "expanded",
  networkPlacement: "bottom",
  persistMode: true,
  persistNetwork: true,
  sections: Object.freeze([]),
});

const DEFAULT_CHROME = Object.freeze({
  revealOnScroll: false,
  revealOffset: 20,
});

function consoleModes(self) {
  const mode = (id, label, icon) => ({
    label,
    icon,
    href: self === id ? "./" : `../${id}/`,
    active: self === id,
  });
  return [
    { label: "Console", icon: "home", href: "../" },
    mode("bingo", "Bingo", "grid"),
    mode("rmc", "RMC", "gauge"),
    mode("rms", "RMS", "clock"),
    mode("rmt", "RMT", "users"),
  ];
}

const ALTERED_SECTIONS = Object.freeze([
  { label: "Overview", icon: "home", siteId: "altered", path: "/" },
  { label: "Maps", icon: "map", siteId: "altered", path: "/maps/" },
  { label: "Rankings", icon: "chart", siteId: "altered", path: "/rankings/" },
  { label: "Alterations", icon: "layers", siteId: "altered", path: "/alterations/" },
  { label: "Seasons", icon: "calendar", siteId: "altered", path: "/season/", query: "s=training" },
  { label: "Tools", icon: "wrench", siteId: "altered", path: "/tools/" },
  { label: "API", icon: "plug", siteId: "altered", path: "/api/" },
]);

const TRACKER_DESTINATION_SECTIONS = Object.freeze([
  { label: "Trackers", icon: "gauge", siteId: "trackers", path: "/" },
  { label: "WR history", icon: "trophy", siteId: "trackers", path: "/wr/" },
  { label: "Leaderboards", icon: "chart", siteId: "trackers", path: "/leaderboard/" },
  { label: "Display names", icon: "tag", siteId: "trackers", path: "/displayname/" },
  { label: "Clubs", icon: "users", siteId: "trackers", path: "/club/" },
]);

const PAGE_CONFIGS = Object.freeze({
  xjk: {
    "": {
      sidenav: {
        sections: [],
        networkPlacement: "top",
        initialMode: "collapsed",
        persistMode: false,
        persistNetwork: false,
      },
    },
  },
  aggregator: {
    "": {
      sidenav: {
        sections: [
          { label: "Events", icon: "trophy", tab: '.tab-btn[data-tab="events"]' },
          { label: "Projects", icon: "layers", tab: '.tab-btn[data-tab="projects"]' },
          { label: "Names", icon: "tag", tab: '.tab-btn[data-tab="names"]' },
          { label: "Clubs", icon: "users", tab: '.tab-btn[data-tab="clubs"]' },
          { label: "Database", icon: "database", tab: '.tab-btn[data-tab="database"]' },
          { label: "Metrics", icon: "chart", tab: '.tab-btn[data-tab="metrics"]' },
        ],
      },
    },
    "api-docs": {
      sidenav: { sections: [{ label: "Aggregator", icon: "arrowLeft", href: "../" }] },
    },
  },
  altered: {
    "": {
      chrome: { revealOnScroll: true, revealOffset: 16 },
      sidenav: { sections: ALTERED_SECTIONS },
    },
    "*": { sidenav: { sections: ALTERED_SECTIONS } },
  },
  archive: {
    "": {
      sidenav: {
        sections: [
          { label: "Search builds", icon: "search", focus: "#search" },
          { label: "Franchises", icon: "layers", scroll: "body" },
        ],
      },
    },
  },
  console: {
    "": {
      sidenav: {
        sections: [
          { label: "Bingo", icon: "grid", href: "./bingo/" },
          { label: "RMC", icon: "gauge", href: "./rmc/" },
          { label: "RMS", icon: "clock", href: "./rms/" },
          { label: "RMT", icon: "users", href: "./rmt/" },
          { label: "Future route", icon: "layers", href: "./coming-soon/" },
        ],
      },
    },
    bingo: { sidenav: { sections: consoleModes("bingo") } },
    rmc: { sidenav: { sections: consoleModes("rmc") } },
    rms: { sidenav: { sections: consoleModes("rms") } },
    rmt: { sidenav: { sections: consoleModes("rmt") } },
    "coming-soon": { sidenav: { sections: consoleModes("coming-soon") } },
  },
  cotd: {
    "": {
      sidenav: {
        sections: [
          { label: "Latest TOTD", icon: "map", scroll: "#mapVisual" },
          { label: "Recent maps", icon: "list", scroll: "#recentRail" },
          { label: "Archive", icon: "calendar", scroll: "#history" },
        ],
      },
    },
  },
  learn: {
    "": {
      sidenav: {
        sections: [
          { label: "Map", icon: "map", href: "#/", activeHash: "#/" },
          { label: "Library", icon: "list", href: "#/library", activeHash: "#/library" },
          { label: "Tools", icon: "wrench", href: "#/tools", activeHash: "#/tools" },
        ],
      },
    },
  },
  plugins: {
    "": {
      sidenav: {
        sections: [
          { label: "Search plugins", icon: "search", focus: "#pluginSearch" },
          { label: "All plugins", icon: "plug", scroll: "body" },
        ],
      },
    },
  },
  tools: {
    "": {
      sidenav: {
        sections: [{ label: "All tools", icon: "wrench", scroll: "body" }],
        initialMode: "collapsed",
        persistMode: false,
      },
    },
    tool: {
      sidenav: { sections: [{ label: "All tools", icon: "arrowLeft", siteId: "tools", path: "/" }] },
    },
  },
  trackers: {
    "": {
      sidenav: {
        sections: [
          { label: "Overview", icon: "gauge", tab: '[data-route="overview"]' },
          { label: "WR history", icon: "trophy", tab: '[data-route="wr"]' },
          { label: "Leaderboards", icon: "chart", tab: '[data-route="leaderboard"]' },
          { label: "Display names", icon: "tag", tab: '[data-route="displayname"]' },
          { label: "Clubs", icon: "users", tab: '[data-route="club"]' },
        ],
      },
    },
    admin: { sidenav: { sections: TRACKER_DESTINATION_SECTIONS } },
    "admin/login": { sidenav: { sections: TRACKER_DESTINATION_SECTIONS } },
  },
  validifier: {
    "": {
      sidenav: {
        sections: [
          { label: "Live queue", icon: "signal", tab: '[data-workspace-target="live"]' },
          { label: "Record lookup", icon: "search", tab: '[data-workspace-target="record"]' },
          { label: "Map coverage", icon: "map", tab: '[data-workspace-target="map"]' },
          { label: "Submission", icon: "file", tab: '[data-workspace-target="submission"]' },
          { label: "Recent", icon: "clock", tab: '[data-workspace-target="recent"]' },
          { label: "API and clients", icon: "plug", tab: '[data-workspace-target="clients"]' },
        ],
      },
    },
    api: { sidenav: { sections: [{ label: "Validifier", icon: "arrowLeft", href: "../" }] } },
  },
  account: {
    "": {
      sidenav: {
        sections: [
          { label: "Profile", icon: "users", tab: '[data-tab-target="overview"]' },
          { label: "Preferences", icon: "gauge", tab: '[data-tab-target="appearance"]' },
        ],
      },
    },
    session: {
      sidenav: {
        sections: [{ label: "Account settings", icon: "users", siteId: "account", path: "/" }],
      },
    },
  },
  dash: {
    "": {
      sidenav: {
        sections: [
          { label: "Overview", icon: "gauge", tab: '.tab-btn[data-tab="overview"]' },
          { label: "Routes", icon: "network", tab: '.tab-btn[data-tab="routes"]' },
          { label: "Errors", icon: "list", tab: '.tab-btn[data-tab="errors"]' },
          { label: "Trackers", icon: "chart", tab: '.tab-btn[data-tab="trackers"]' },
          { label: "Altered", icon: "layers", tab: '.tab-btn[data-tab="altered"]' },
          { label: "Logs", icon: "file", tab: '.tab-btn[data-tab="logs"]' },
        ],
      },
    },
  },
  admin: {
    "": {
      sidenav: {
        sections: [
          { label: "Map editor", icon: "map", href: "#map" },
          { label: "Export", icon: "file", href: "#export" },
        ],
      },
    },
  },
});

function normalizePath(value = "/") {
  const path = String(value || "/").split(/[?#]/, 1)[0] || "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function inferSiteId(locationLike = globalThis.location) {
  const hostname = String(locationLike?.hostname || "").toLowerCase();
  const pathname = normalizePath(locationLike?.pathname || "/");

  const direct = XJK_SITES.find((site) =>
    [site.host, ...(site.hostAliases || [])].some((host) => String(host).toLowerCase() === hostname)
  );
  if (direct) return direct.id;

  if (hostname.endsWith(".localhost")) {
    const subdomain = hostname.slice(0, -".localhost".length);
    const local = XJK_SITES.find((site) => site.localSubdomain === subdomain);
    if (local) return local.id;
  }

  if (["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    const local = [...XJK_SITES]
      .filter((site) => site.localPathPrefix)
      .sort((left, right) => right.localPathPrefix.length - left.localPathPrefix.length)
      .find((site) => pathname === site.localPathPrefix || pathname.startsWith(`${site.localPathPrefix}/`));
    return local?.id || "xjk";
  }

  return "xjk";
}

function inferPageId(siteId, locationLike = globalThis.location) {
  const site = SITES_BY_ID.get(siteId);
  let pathname = normalizePath(locationLike?.pathname || "/");
  if (site?.localPathPrefix && (pathname === site.localPathPrefix || pathname.startsWith(`${site.localPathPrefix}/`))) {
    pathname = pathname.slice(site.localPathPrefix.length) || "/";
  }
  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length) return "";
  if (siteId === "aggregator" && segments[0] === "api-docs") return "api-docs";
  if (siteId === "validifier" && segments[0] === "api") return "api";
  if (siteId === "console") return segments[0];
  if (siteId === "tools") return "tool";
  if (siteId === "altered") return segments.join("/");
  return segments[0];
}

function resolveChromeContext(options = {}) {
  const doc = options.document || globalThis.document;
  const locationLike = options.location || doc?.location || globalThis.location;
  const taggedScript = options.script || doc?.querySelector("script[data-xjk-sidenav], script[data-xjk-topbar]");
  const siteId = String(
    options.site ||
      taggedScript?.dataset?.xjkSidenav ||
      taggedScript?.dataset?.xjkTopbar ||
      doc?.documentElement?.dataset?.xjkSite ||
      inferSiteId(locationLike)
  );
  const pageId = String(
    options.page ??
      taggedScript?.dataset?.xjkPage ??
      doc?.documentElement?.dataset?.xjkPage ??
      inferPageId(siteId, locationLike)
  );
  return { siteId, pageId, site: SITES_BY_ID.get(siteId) || SITES_BY_ID.get("xjk") };
}

function getChromeConfig(options = {}) {
  const context = resolveChromeContext(options);
  const siteConfigs = PAGE_CONFIGS[context.siteId] || {};
  const pageConfig = siteConfigs[context.pageId] || siteConfigs["*"] || siteConfigs[""] || {};
  const label = context.site?.label || context.siteId || "xjk";
  return {
    ...context,
    accent: context.site?.accent || "#d8d8d8",
    accentRgb: context.site?.accentRgb || "216, 216, 216",
    chrome: {
      ...DEFAULT_CHROME,
      ...(pageConfig.chrome || {}),
    },
    topbar: {
      ...DEFAULT_TOPBAR,
      contextLabel: label,
      searchLabel: `Search ${label}`,
      ...(pageConfig.topbar || {}),
    },
    sidenav: {
      ...DEFAULT_SIDENAV,
      ...(pageConfig.sidenav || {}),
      sections: [...(pageConfig.sidenav?.sections || DEFAULT_SIDENAV.sections)],
    },
  };
}

export {
  DEFAULT_CHROME,
  DEFAULT_SIDENAV,
  DEFAULT_TOPBAR,
  PAGE_CONFIGS,
  getChromeConfig,
  inferPageId,
  inferSiteId,
  resolveChromeContext,
};
