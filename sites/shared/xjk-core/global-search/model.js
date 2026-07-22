import { getSite, resolveSiteHref } from "../site-runtime.js";
import { normalizeSearchText, rankSearchItems } from "../search-engine.js";
import { safeCssColor, safeNavigationHref, uniqueById } from "../dom-utils.js";

const MAX_RECENTS = 7;
const MAX_RESULTS = 36;
const RECENT_STORAGE_KEY = "xjk.global-search.recents.v1";

const GROUP_ORDER = Object.freeze([
  "Recent",
  "Actions",
  "On this page",
  "Services",
  "Destinations",
  "Tools",
  "Learn",
  "Plugins",
  "Archive",
  "More",
]);

const KIND_LABELS = Object.freeze({
  action: "Action",
  archive: "Archive",
  destination: "Page",
  guide: "Learn",
  intent: "Smart",
  local: "Here",
  plugin: "Plugin",
  site: "Service",
  tool: "Tool",
});

const KIND_MARKERS = Object.freeze({
  action: "go",
  archive: "arc",
  destination: "pg",
  guide: "doc",
  intent: "ask",
  local: "#",
  plugin: "op",
  site: "xjk",
  tool: "tl",
});

function slug(value = "") {
  return normalizeSearchText(value).replace(/\s+/g, "-").slice(0, 64) || "item";
}

function resolveEntryHref(entry = {}) {
  if (entry.url) return safeNavigationHref(entry.url);
  if (!entry.siteId) return safeNavigationHref(entry.href);
  return safeNavigationHref(
    resolveSiteHref(entry.siteId, {
      path: entry.path || "/",
      query: entry.query,
      hash: entry.hash,
    })
  );
}

function normalizeEntry(entry = {}, fallbackIndex = 0) {
  const site = getSite(entry.siteId);
  const id = String(entry.id || `${entry.kind || "result"}:${slug(entry.title)}:${fallbackIndex}`);
  const keywords = Array.isArray(entry.keywords)
    ? entry.keywords.map(String).filter(Boolean)
    : String(entry.keywords || "")
        .split(/[,\s]+/)
        .filter(Boolean);

  return {
    ...entry,
    id,
    kind: entry.kind || "destination",
    title: String(entry.title || "Untitled"),
    subtitle: String(entry.subtitle || site?.host || entry.section || ""),
    description: String(entry.description || entry.summary || ""),
    siteId: entry.siteId || site?.id || "",
    siteLabel: entry.siteLabel || site?.label || "",
    keywords,
    aliases: Array.isArray(entry.aliases) ? entry.aliases.map(String).filter(Boolean) : [],
    accent: safeCssColor(entry.accent || site?.accent),
    href: resolveEntryHref(entry),
    priority: Number(entry.priority || 0),
  };
}

function loadRecents(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(RECENT_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(String).slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

function saveRecent(item, storage = globalThis.localStorage) {
  if (!item?.id || ["action", "local", "intent"].includes(item.kind)) return;
  const recents = [item.id, ...loadRecents(storage).filter((id) => id !== item.id)].slice(0, MAX_RECENTS);
  try {
    storage?.setItem(RECENT_STORAGE_KEY, JSON.stringify(recents));
  } catch {
    // Storage can be unavailable in hardened/private browsing contexts.
  }
}

function parseScope(rawQuery = "") {
  const text = String(rawQuery || "");
  const prefix = text.trimStart()[0] || "";
  if (prefix === ">") return { query: text.trimStart().slice(1).trim(), kinds: ["action", "intent"] };
  if (prefix === "@") return { query: text.trimStart().slice(1).trim(), kinds: ["site", "destination"] };
  if (prefix === "#") return { query: text.trimStart().slice(1).trim(), kinds: ["local"] };
  return { query: text.trim(), kinds: null };
}

function groupForItem(item) {
  if (item.displayGroup) return item.displayGroup;
  if (item.kind === "action" || item.kind === "intent") return "Actions";
  if (item.kind === "local") return "On this page";
  if (item.kind === "site") return "Services";
  if (item.kind === "tool") return "Tools";
  if (item.kind === "guide") return "Learn";
  if (item.kind === "plugin") return "Plugins";
  if (item.kind === "archive") return "Archive";
  if (item.kind === "destination") return item.siteId === "learn" ? "Learn" : "Destinations";
  return "More";
}

function defaultResults({ items, localItems, actionItems, recentIds = loadRecents() }) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const recent = recentIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((item) => ({ ...item, displayGroup: "Recent", priority: 200 + item.priority }));
  const current = localItems.slice(0, 5);
  const services = rankSearchItems(
    items.filter((item) => item.kind === "site"),
    "",
    { limit: 8 }
  );
  return uniqueById([...recent, ...current, ...services, ...actionItems.slice(0, 3)]).slice(0, 18);
}

function computeResults({ rawQuery, items, localItems, actionItems, intentItems, recentIds }) {
  const scope = parseScope(rawQuery);
  const scopedItems = scope.kinds
    ? [...intentItems, ...items].filter((item) => scope.kinds.includes(item.kind))
    : [...intentItems, ...items];
  if (!scope.query && !scope.kinds) {
    return defaultResults({ items: scopedItems, localItems, actionItems, recentIds });
  }
  return rankSearchItems(scopedItems, scope.query, { limit: MAX_RESULTS });
}

function orderedResultGroups(results, rawQuery) {
  const groups = new Map();
  for (const item of results) {
    const group = groupForItem(item);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }

  const hasActiveQuery = Boolean(parseScope(rawQuery).query);
  return [...groups.entries()].sort((left, right) => {
    if (hasActiveQuery) {
      const leftScore = Math.max(...left[1].map((item) => Number(item.score || 0)));
      const rightScore = Math.max(...right[1].map((item) => Number(item.score || 0)));
      if (rightScore !== leftScore) return rightScore - leftScore;
    }
    const leftIndex = GROUP_ORDER.indexOf(left[0]);
    const rightIndex = GROUP_ORDER.indexOf(right[0]);
    return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
  });
}

export {
  GROUP_ORDER,
  KIND_LABELS,
  KIND_MARKERS,
  computeResults,
  groupForItem,
  loadRecents,
  normalizeEntry,
  orderedResultGroups,
  parseScope,
  saveRecent,
  slug,
};
