import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SITE_LINES, XJK_SITES } from "../sites/shared/xjk-core/site-registry.js";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

const SOURCE_FILES = Object.freeze({
  tools: "sites/tools.xjk.yt/Tools-Hub/data/tools.json",
  plugins: "sites/plugins.xjk.yt/Plugins-Hub/data/plugins.json",
  learn: "sites/learn.xjk.yt/frontend/content/index.json",
  archive: "sites/archive.xjk.yt/frontend/data/archive.json",
});

const OUTPUT_FILE = "sites/shared/xjk-core/search-index.json";
const ALLOWED_EXTERNAL_SEARCH_HOSTS = new Set(["openplanet.dev", "www.openplanet.dev"]);

// These are intentionally hand-picked navigable public surfaces. Dynamic records,
// private dashboards, admin pages, login routes, and raw write APIs do not belong in
// the static index.
const CURATED_PUBLIC_ROUTES = Object.freeze([
  {
    id: "destination:account:profile",
    siteId: "account",
    path: "/",
    hash: "#overview",
    title: "Account Profile",
    subtitle: "Account",
    description: "Open your shared xjk identity and Trackmania profile.",
    section: "Account",
    keywords: ["account", "profile", "identity", "trackmania", "login"],
    aliases: ["my profile"],
    priority: 48,
  },
  {
    id: "destination:account:preferences",
    siteId: "account",
    path: "/",
    hash: "#appearance",
    title: "Appearance Preferences",
    subtitle: "Account",
    description: "Change shared xjk appearance, density, and motion preferences.",
    section: "Account",
    keywords: ["account", "appearance", "preferences", "settings", "theme", "motion"],
    aliases: ["account settings"],
    priority: 44,
  },
  {
    id: "destination:account:spaces",
    siteId: "account",
    path: "/",
    hash: "#spaces/xjk",
    title: "Connected xjk Spaces",
    subtitle: "Account",
    description: "Review the xjk services connected to your shared account.",
    section: "Account",
    keywords: ["account", "spaces", "services", "connections", "xjk"],
    aliases: ["connected services"],
    priority: 42,
  },
  {
    id: "destination:trackers:leaderboard",
    siteId: "trackers",
    routeName: "leaderboard",
    title: "Leaderboard Tracker",
    subtitle: "Trackers",
    description: "Browse cached Trackmania leaderboard records and world-record holders.",
    section: "Tracking",
    keywords: ["leaderboard", "world record", "wr", "records", "maps"],
    aliases: ["tracker", "leaderboard"],
    priority: 58,
  },
  {
    id: "destination:trackers:wr",
    siteId: "trackers",
    routeName: "wr",
    title: "World Record Tracker",
    subtitle: "Trackers",
    description: "Open the world-record tracker runtime.",
    section: "Tracking",
    keywords: ["world record", "wr", "record history", "tracker"],
    aliases: ["wr tracker"],
    priority: 56,
  },
  {
    id: "destination:trackers:displayname",
    siteId: "trackers",
    routeName: "displayname",
    title: "Display Name Tracker",
    subtitle: "Trackers",
    description: "Look up and follow Trackmania account display-name changes.",
    section: "Tracking",
    keywords: ["display name", "account name", "name history", "tracker"],
    aliases: ["displayname tracker", "name tracker"],
    priority: 54,
  },
  {
    id: "destination:trackers:club",
    siteId: "trackers",
    routeName: "club",
    title: "Club Tracker",
    subtitle: "Trackers",
    description: "Inspect Trackmania club snapshots and changes.",
    section: "Tracking",
    keywords: ["club", "club history", "snapshot", "tracker"],
    aliases: ["club tracker"],
    priority: 54,
  },
  {
    id: "destination:console:bingo",
    siteId: "console",
    routeName: "bingo",
    title: "Console Bingo",
    subtitle: "Live console companion",
    description: "Use the phone-first Bingo board mirror, room switching, and verification flow.",
    section: "Console",
    keywords: ["bingo", "phone", "room code", "ps4", "ps5", "xbox"],
    aliases: ["bingo companion"],
    priority: 58,
  },
  {
    id: "destination:console:rmc",
    siteId: "console",
    routeName: "rmc",
    title: "RMC",
    subtitle: "Reserved console companion",
    description: "Random Map Challenge companion route.",
    section: "Console",
    keywords: ["rmc", "random map challenge", "phone", "console"],
    aliases: ["random map challenge"],
    priority: 28,
  },
  {
    id: "destination:console:rms",
    siteId: "console",
    routeName: "rms",
    title: "RMS",
    subtitle: "Reserved console companion",
    description: "Random Map Survival companion route.",
    section: "Console",
    keywords: ["rms", "random map survival", "phone", "console"],
    aliases: ["random map survival"],
    priority: 28,
  },
  {
    id: "destination:console:rmt",
    siteId: "console",
    routeName: "rmt",
    title: "RMT",
    subtitle: "Reserved console companion",
    description: "Random Map Together companion route.",
    section: "Console",
    keywords: ["rmt", "random map together", "phone", "console"],
    aliases: ["random map together"],
    priority: 28,
  },
  {
    id: "destination:altered:maps",
    siteId: "altered",
    path: "/maps/",
    title: "Altered Maps",
    subtitle: "Altered",
    description: "Browse Altered campaign maps and map details.",
    section: "Community",
    keywords: ["altered", "maps", "campaign", "map browser"],
    aliases: ["altered map browser"],
    priority: 54,
  },
  {
    id: "destination:altered:rankings",
    siteId: "altered",
    path: "/rankings/",
    title: "Altered Rankings",
    subtitle: "Altered",
    description: "Browse player rankings across Altered campaigns.",
    section: "Community",
    keywords: ["altered", "rankings", "leaderboard", "players"],
    aliases: ["altered leaderboard"],
    priority: 52,
  },
  {
    id: "destination:altered:alterations",
    siteId: "altered",
    path: "/alterations/",
    title: "Alterations",
    subtitle: "Altered",
    description: "Browse campaigns by alteration type, surface, fragile, reactor, and more.",
    section: "Community",
    keywords: ["alteration", "campaign", "surface", "fragile", "reactor"],
    aliases: ["altered alterations"],
    priority: 50,
  },
  {
    id: "destination:altered:seasons",
    siteId: "altered",
    path: "/season/",
    title: "Altered Seasons",
    subtitle: "Altered",
    description: "Explore Altered campaign seasons.",
    section: "Community",
    keywords: ["altered", "season", "campaign", "winter", "spring", "summer", "fall"],
    aliases: ["altered season"],
    priority: 46,
  },
  {
    id: "destination:altered:tools",
    siteId: "altered",
    path: "/tools/",
    title: "Altered Tools",
    subtitle: "Altered",
    description: "Open the tools made for Altered projects.",
    section: "Tools",
    keywords: ["altered", "tools", "utilities", "builder"],
    aliases: ["altered utilities"],
    priority: 44,
  },
  {
    id: "destination:altered:bannerbuilder",
    siteId: "altered",
    path: "/bannerbuilder/",
    title: "Banner Builder",
    subtitle: "Altered tool",
    description: "Build and export an Altered-style campaign banner.",
    section: "Tools",
    keywords: ["banner", "builder", "image", "campaign", "altered"],
    aliases: ["bannerbuilder"],
    priority: 48,
  },
  {
    id: "destination:altered:platonic-solids",
    siteId: "altered",
    path: "/platonic-solids/",
    title: "Platonic Solids Studio",
    subtitle: "Altered tool",
    description: "Open the Platonic Solids visual studio.",
    section: "Tools",
    keywords: ["platonic", "solids", "studio", "geometry", "altered"],
    aliases: ["platonic solids"],
    priority: 42,
  },
  {
    id: "destination:altered:api-docs",
    siteId: "altered",
    path: "/api/",
    title: "Altered API",
    subtitle: "Public API documentation",
    description: "Read the public Altered maps and campaigns API documentation.",
    section: "API",
    keywords: ["altered", "api", "documentation", "maps", "campaigns", "json"],
    aliases: ["altered api docs"],
    priority: 42,
  },
  {
    id: "destination:altered:about",
    siteId: "altered",
    path: "/about/",
    title: "About Altered",
    subtitle: "Altered",
    description: "Learn what the Altered project is about.",
    section: "Community",
    keywords: ["altered", "about", "project"],
    aliases: [],
    priority: 30,
  },
  {
    id: "destination:altered:team",
    siteId: "altered",
    path: "/team/",
    title: "Altered Team",
    subtitle: "Altered",
    description: "Meet the people behind Altered.",
    section: "Community",
    keywords: ["altered", "team", "people", "contributors"],
    aliases: [],
    priority: 28,
  },
  {
    id: "destination:altered:request-update",
    siteId: "altered",
    path: "/request-update/",
    title: "Request an Altered Update",
    subtitle: "Altered",
    description: "Request refreshed data for an Altered map or campaign.",
    section: "Community",
    keywords: ["altered", "request", "update", "refresh", "map", "campaign"],
    aliases: ["altered update request"],
    priority: 34,
  },
  {
    id: "destination:aggregator:events",
    siteId: "aggregator",
    path: "/",
    hash: "#events",
    title: "Aggregator Events",
    subtitle: "Aggregator",
    description: "Browse recent tracker and project events.",
    section: "Data",
    keywords: ["aggregator", "events", "changes", "history", "maps"],
    aliases: ["recent events"],
    priority: 46,
  },
  {
    id: "destination:aggregator:projects",
    siteId: "aggregator",
    path: "/",
    hash: "#projects",
    title: "Aggregator Projects",
    subtitle: "Aggregator",
    description: "Browse tracked projects and their maps.",
    section: "Data",
    keywords: ["aggregator", "projects", "maps", "changes"],
    aliases: ["tracked projects"],
    priority: 44,
  },
  {
    id: "destination:aggregator:names",
    siteId: "aggregator",
    path: "/",
    hash: "#names",
    title: "Display Name Cache",
    subtitle: "Aggregator",
    description: "Search cached Trackmania display names.",
    section: "Data",
    keywords: ["aggregator", "display name", "account", "name cache", "search"],
    aliases: ["display names", "name lookup"],
    priority: 46,
  },
  {
    id: "destination:aggregator:clubs",
    siteId: "aggregator",
    path: "/",
    hash: "#clubs",
    title: "Club Snapshot Lookup",
    subtitle: "Aggregator",
    description: "Look up cached Trackmania club snapshots.",
    section: "Data",
    keywords: ["aggregator", "club", "snapshot", "lookup"],
    aliases: ["club cache"],
    priority: 44,
  },
  {
    id: "destination:aggregator:metrics",
    siteId: "aggregator",
    path: "/",
    hash: "#metrics",
    title: "Aggregator Metrics",
    subtitle: "Aggregator",
    description: "Inspect public aggregation coverage and activity metrics.",
    section: "Data",
    keywords: ["aggregator", "metrics", "coverage", "activity", "charts"],
    aliases: ["data metrics"],
    priority: 38,
  },
  {
    id: "destination:aggregator:database",
    siteId: "aggregator",
    path: "/",
    hash: "#database",
    title: "Aggregator Database",
    subtitle: "Aggregator",
    description: "Inspect the public cache database overview and storage health.",
    section: "Data",
    keywords: ["aggregator", "database", "cache", "storage", "health"],
    aliases: ["cache database"],
    priority: 36,
  },
  {
    id: "destination:aggregator:api-docs",
    siteId: "aggregator",
    path: "/api/",
    title: "Aggregator API",
    subtitle: "Public API documentation",
    description: "Read the public Aggregator API catalog and endpoint documentation.",
    section: "API",
    keywords: ["aggregator", "api", "documentation", "catalog", "json"],
    aliases: ["aggregator api docs"],
    priority: 42,
  },
  {
    id: "destination:validifier:api-docs",
    siteId: "validifier",
    path: "/api/",
    title: "Validifier API",
    subtitle: "Public API documentation",
    description: "Read Validifier endpoint documentation for replay verification records and maps.",
    section: "API",
    keywords: ["validifier", "verification", "api", "documentation", "records", "maps"],
    aliases: ["validifier api docs", "verification api"],
    priority: 46,
  },
  {
    id: "destination:validifier:live",
    siteId: "validifier",
    path: "/live",
    title: "Validifier Live Queue",
    subtitle: "Validifier",
    description: "Watch public replay verification work in progress.",
    section: "Verification",
    keywords: ["validifier", "live", "queue", "verification", "records"],
    aliases: ["verification queue"],
    priority: 54,
  },
  {
    id: "destination:validifier:records",
    siteId: "validifier",
    path: "/records",
    title: "Validifier Record Lookup",
    subtitle: "Validifier",
    description: "Look up a replay verification record by its record ID.",
    section: "Verification",
    keywords: ["validifier", "record", "replay", "lookup", "verification"],
    aliases: ["record lookup"],
    priority: 54,
  },
  {
    id: "destination:validifier:maps",
    siteId: "validifier",
    path: "/maps",
    title: "Validifier Map Coverage",
    subtitle: "Validifier",
    description: "Browse verification coverage and unresolved records for a map.",
    section: "Verification",
    keywords: ["validifier", "map", "uid", "coverage", "records"],
    aliases: ["map lookup"],
    priority: 52,
  },
  {
    id: "destination:validifier:submit",
    siteId: "validifier",
    path: "/submit",
    title: "Submit to Validifier",
    subtitle: "Validifier",
    description: "Submit a public replay verification request.",
    section: "Verification",
    keywords: ["validifier", "submit", "submission", "replay", "verification"],
    aliases: ["verification submission"],
    priority: 50,
  },
  {
    id: "destination:validifier:clients",
    siteId: "validifier",
    path: "/clients",
    title: "Validifier API & Clients",
    subtitle: "Validifier",
    description: "Find public API endpoints and client integration notes.",
    section: "API",
    keywords: ["validifier", "api", "clients", "integration", "documentation"],
    aliases: ["validifier clients"],
    priority: 44,
  },
  {
    id: "destination:validifier:recent",
    siteId: "validifier",
    path: "/recent",
    title: "Recent Validifier Checks",
    subtitle: "Validifier",
    description: "Review recently opened verification records and maps.",
    section: "Verification",
    keywords: ["validifier", "recent", "history", "records", "maps"],
    aliases: ["recent verifications"],
    priority: 42,
  },
  {
    id: "destination:cotd:archive",
    siteId: "cotd",
    path: "/",
    hash: "#history",
    title: "COTD Archive",
    subtitle: "Cup of the Day",
    description: "Browse the recent Cup of the Day map archive.",
    section: "Archive",
    keywords: ["cotd", "totd", "cup of the day", "archive", "history", "maps"],
    aliases: ["totd archive", "cup of the day history"],
    priority: 48,
  },
]);

const SITES_BY_ID = new Map(XJK_SITES.map((site) => [site.id, site]));

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanList(...values) {
  return [...new Set(values.flat(Infinity).map(cleanText).filter(Boolean))];
}

function normalizePath(value = "/") {
  const text = cleanText(value || "/");
  if (!text.startsWith("/")) throw new Error(`Search route must start with /: ${text}`);
  if (text.includes("\\") || /(^|\/)\.\.?(\/|$)/.test(text)) {
    throw new Error(`Unsafe search route: ${text}`);
  }
  return text.replace(/\/{2,}/g, "/");
}

function normalizeQuery(value = "") {
  const text = cleanText(value);
  if (!text) return "";
  return text.startsWith("?") ? text : `?${text}`;
}

function normalizeHash(value = "") {
  const text = cleanText(value);
  if (!text) return "";
  return text.startsWith("#") ? text : `#${text}`;
}

function normalizeExternalUrl(value) {
  const url = new URL(cleanText(value));
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`External search destination must be a credential-free HTTPS URL: ${value}`);
  }
  if (!ALLOWED_EXTERNAL_SEARCH_HOSTS.has(url.hostname)) {
    throw new Error(`External search destination host is not approved: ${value}`);
  }
  return url.toString();
}

function encodeRouteValue(value = "") {
  return cleanText(value).split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function createEntry(raw) {
  const site = SITES_BY_ID.get(cleanText(raw.siteId));
  if (!site || !site.public || site.internal) {
    throw new Error(`Search entry ${raw.id} references a non-public site: ${raw.siteId}`);
  }

  const entry = {
    id: cleanText(raw.id),
    kind: cleanText(raw.kind),
    title: cleanText(raw.title),
  };
  const subtitle = cleanText(raw.subtitle);
  if (subtitle) entry.subtitle = subtitle;
  entry.description = cleanText(raw.description);
  entry.siteId = site.id;
  entry.siteLabel = cleanText(raw.siteLabel || site.label);
  const section = cleanText(raw.section);
  if (section) entry.section = section;

  if (raw.url) {
    entry.url = normalizeExternalUrl(raw.url);
  } else {
    entry.path = normalizePath(raw.path || "/");
    const query = normalizeQuery(raw.query);
    const hash = normalizeHash(raw.hash);
    if (query) entry.query = query;
    if (hash) entry.hash = hash;
  }

  entry.keywords = cleanList(raw.keywords);
  entry.aliases = cleanList(raw.aliases);
  entry.priority = Number(raw.priority || 0);
  return entry;
}

function routePartsFromLink(link, site) {
  const url = new URL(cleanText(link), `https://${site.host}/`);
  if (url.protocol !== "https:" || url.hostname !== site.host) {
    throw new Error(`Expected a ${site.host} route, received: ${link}`);
  }
  return {
    path: url.pathname,
    query: url.search,
    hash: url.hash,
  };
}

function siteEntries() {
  return XJK_SITES.filter((site) => site.public && !site.internal).map((site) =>
    createEntry({
      id: `site:${site.id}`,
      kind: "site",
      title: site.label,
      subtitle: site.title !== site.label ? site.title : site.host,
      description: site.summary,
      siteId: site.id,
      section: SITE_LINES[site.line]?.label || site.line,
      path: "/",
      keywords: [site.keywords, site.category, site.line, site.host],
      aliases: [site.aliases, site.hostAliases],
      priority: site.id === "xjk" ? 100 : 70,
    })
  );
}

function toolEntries(tools) {
  const site = SITES_BY_ID.get("tools");
  return tools
    .filter((tool) => cleanText(tool.status).toLowerCase() === "live")
    .map((tool) => {
      const route = routePartsFromLink(tool.link, site);
      return createEntry({
        id: `tool:${tool.id}`,
        kind: "tool",
        title: tool.name,
        subtitle: tool.category,
        description: tool.description,
        siteId: site.id,
        section: tool.category,
        ...route,
        keywords: [tool.id, tool.category, tool.input, tool.output, tool.status],
        aliases: [tool.id],
        priority: 60,
      });
    });
}

function pluginEntries(plugins) {
  return plugins
    .filter((plugin) => cleanText(plugin.status).toLowerCase() === "live")
    .map((plugin) =>
      createEntry({
        id: `plugin:${plugin.id}`,
        kind: "plugin",
        title: plugin.name,
        subtitle: plugin.target || plugin.category,
        description: plugin.description,
        siteId: "plugins",
        section: plugin.category,
        url: plugin.link,
        keywords: [plugin.id, plugin.category, plugin.status, plugin.target, plugin.install],
        aliases: [plugin.id],
        priority: 44,
      })
    );
}

function learnEntries(learn) {
  const packContextByPage = new Map();
  for (const pack of learn.packs || []) {
    for (const slug of cleanList(pack.pageSlug, pack.cards)) {
      const context = packContextByPage.get(slug) || [];
      context.push(pack.id, pack.title, pack.question, pack.summary, ...(pack.tags || []), ...(pack.concepts || []));
      packContextByPage.set(slug, context);
    }
  }

  const pages = (learn.pages || []).map((page) =>
    createEntry({
      id: `guide:${page.id || page.slug}`,
      kind: "guide",
      title: page.title,
      subtitle: cleanList(page.type, page.difficulty).join(" · "),
      description: page.summary,
      siteId: "learn",
      section: page.section || page.category,
      path: "/",
      hash: `#/learn/${encodeRouteValue(page.slug || page.id)}`,
      keywords: [
        page.tags,
        page.concepts,
        page.packIds,
        page.cluster,
        page.secondaryClusters,
        page.category,
        page.type,
        page.status,
        packContextByPage.get(page.slug || page.id),
      ],
      aliases: [page.id, page.slug],
      priority: page.slug === learn.defaultSlug ? 58 : 52,
    })
  );

  const packs = (learn.packs || []).map((pack) => {
    const pageSlug = pack.pageSlug || pack.cards?.[0];
    return createEntry({
      id: `guide-pack:${pack.id}`,
      kind: "guide",
      title: pack.title,
      subtitle: "Learn pack",
      description: pack.question || pack.summary,
      siteId: "learn",
      section: "Packs",
      path: "/",
      hash: `#/learn/${encodeRouteValue(pageSlug)}?pack=${encodeURIComponent(pack.id)}`,
      keywords: [pack.tags, pack.concepts, pack.cards, pack.summary, pack.question],
      aliases: [pack.id],
      priority: 42,
    });
  });

  const concepts = (learn.concepts || []).map((concept) => {
    const cluster = concept.area || concept.cluster || "all";
    return createEntry({
      id: `guide-concept:${concept.id}`,
      kind: "guide",
      title: concept.title,
      subtitle: `${cleanText(concept.type || "concept")} · Learn concept`,
      description: concept.summary || concept.description,
      siteId: "learn",
      section: cluster,
      path: "/",
      hash: `#/library?cluster=${encodeURIComponent(cluster)}&concept=${encodeURIComponent(concept.id)}`,
      keywords: [concept.tags, concept.relatedConcepts, concept.type, cluster],
      aliases: [concept.id],
      priority: 28,
    });
  });

  const clusters = (learn.clusters || []).map((cluster) =>
    createEntry({
      id: `destination:learn:cluster:${cluster.id}`,
      kind: "destination",
      title: `${cluster.title} Library`,
      subtitle: "Learn topic cluster",
      description: cluster.description,
      siteId: "learn",
      section: "Library",
      path: "/",
      hash: `#/library?cluster=${encodeURIComponent(cluster.id)}`,
      keywords: [cluster.id, cluster.title],
      aliases: [cluster.id],
      priority: 30,
    })
  );

  const tools = (learn.tools || []).map((tool) =>
    createEntry({
      id: `learn-tool:${tool.id}`,
      kind: "tool",
      title: tool.title,
      subtitle: "Learn tool",
      description: tool.summary,
      siteId: "learn",
      section: "Tools",
      path: "/",
      hash: `#/tools/${encodeRouteValue(tool.id)}`,
      keywords: [tool.id, "learn"],
      aliases: [tool.id],
      priority: 36,
    })
  );

  return [...pages, ...packs, ...concepts, ...clusters, ...tools];
}

function archiveEntries(archive) {
  return (archive.games || []).map((game) =>
    createEntry({
      id: `archive:${game.id}`,
      kind: "archive",
      title: game.name,
      subtitle: cleanList(game.years, game.platforms).join(" · "),
      description: game.description,
      siteId: "archive",
      section: game.franchise || "Games",
      path: "/",
      hash: `#${encodeURIComponent(game.id)}`,
      keywords: [game.id, game.franchise, game.years, game.platforms],
      aliases: [game.id],
      priority: 32,
    })
  );
}

function curatedEntries() {
  return CURATED_PUBLIC_ROUTES.map((route) => {
    const site = SITES_BY_ID.get(route.siteId);
    const routePath = route.routeName ? site?.routes?.[route.routeName] : route.path;
    if (!routePath) {
      throw new Error(`Curated search destination ${route.id} references a missing registry route`);
    }
    return createEntry({
      ...route,
      kind: "destination",
      path: routePath,
    });
  });
}

function buildGlobalSearchIndex() {
  const tools = readJson(SOURCE_FILES.tools);
  const plugins = readJson(SOURCE_FILES.plugins);
  const learn = readJson(SOURCE_FILES.learn);
  const archive = readJson(SOURCE_FILES.archive);

  const groups = {
    sites: siteEntries(),
    destinations: curatedEntries(),
    tools: toolEntries(tools),
    plugins: pluginEntries(plugins),
    learn: learnEntries(learn),
    archive: archiveEntries(archive),
  };

  return {
    version: 1,
    sources: {
      registry: "sites/shared/xjk-core/site-registry.js",
      ...SOURCE_FILES,
    },
    counts: Object.fromEntries(Object.entries(groups).map(([name, entries]) => [name, entries.length])),
    entries: Object.values(groups).flat(),
  };
}

function writeGlobalSearchIndex() {
  const index = buildGlobalSearchIndex();
  const outputPath = path.join(repoRoot, OUTPUT_FILE);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  console.log(`global search index: ${index.entries.length} public entries -> ${OUTPUT_FILE}`);
  return index;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  writeGlobalSearchIndex();
}

export {
  ALLOWED_EXTERNAL_SEARCH_HOSTS,
  CURATED_PUBLIC_ROUTES,
  OUTPUT_FILE,
  SOURCE_FILES,
  buildGlobalSearchIndex,
  writeGlobalSearchIndex,
};
