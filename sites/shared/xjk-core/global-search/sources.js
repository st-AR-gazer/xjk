import { getAllSites, getRuntimeContext, getSite, getSiteByHost } from "../site-runtime.js";
import { normalizeSearchText } from "../search-engine.js";
import { normalizeEntry, slug } from "./model.js";

const SEARCH_INDEX_URL = new URL("../search-index.json", import.meta.url);

function currentSiteFromLocation(locationLike = globalThis.location) {
  const context = getRuntimeContext(locationLike);
  if (context.isLoopbackHost) {
    const pathname = String(context.pathname || "/");
    const candidates = getAllSites()
      .filter((site) => site.localPathPrefix)
      .sort((left, right) => right.localPathPrefix.length - left.localPathPrefix.length);
    const match = candidates.find((site) => {
      const prefix = site.localPathPrefix;
      return pathname === prefix || pathname.startsWith(`${prefix}/`);
    });
    return match || getSite("xjk");
  }
  return getSiteByHost(locationLike) || getSite("xjk");
}

function pageElementTitle(element) {
  const explicit =
    element.getAttribute("data-xjk-search-title") ||
    element.getAttribute("aria-label") ||
    element.getAttribute("title");
  if (explicit) return explicit.trim();
  const heading = element.matches("h1, h2, h3") ? element : element.querySelector("h1, h2, h3, strong");
  const text = heading?.textContent || element.textContent || "";
  return text.replace(/\s+/g, " ").trim().slice(0, 92);
}

function isVisiblePageElement(element) {
  if (
    !element?.isConnected ||
    element.closest('[hidden], [inert], [aria-hidden="true"], .xjk-search-dialog') ||
    element.getClientRects().length === 0
  ) {
    return false;
  }
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function collectLocalItems(currentSite) {
  const selectors = [
    "[data-xjk-search-item]",
    "main nav a[href]",
    "main nav button",
    "[data-workspace-target]",
    "[data-tab-target]",
    "[data-route-link]",
    "button[data-tab]",
    "main h2[id]",
    "main h3[id]",
  ].join(",");
  const nodes = [...document.querySelectorAll(selectors)].slice(0, 90);
  const seen = new Set();
  const results = [];

  for (const element of nodes) {
    if (!isVisiblePageElement(element)) continue;
    const title = pageElementTitle(element);
    if (!title || title.length < 2 || /^open xjk account menu$/i.test(title)) continue;

    const anchor = element.matches("a[href]") ? element : element.closest("a[href]");
    const href = anchor?.href || "";
    const key = href || normalizeSearchText(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const result = normalizeEntry({
      id: `local:${currentSite?.id || "page"}:${slug(key)}`,
      kind: "local",
      title,
      subtitle: `On ${currentSite?.label || "this page"}`,
      description:
        element.getAttribute("data-xjk-search-description") || `Open ${title} without leaving the current workspace.`,
      siteId: currentSite?.id,
      siteLabel: currentSite?.label,
      accent: currentSite?.accent,
      href,
      keywords: ["current", "page", currentSite?.label || ""],
      priority: 75,
    });

    if (!href) {
      result.action = () => {
        if (element.matches("h1, h2, h3")) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        element.click();
      };
    }
    results.push(result);
    if (results.length >= 36) break;
  }

  return results;
}

async function copyCurrentPageLink() {
  const value = globalThis.location.href;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function createActionItems(currentSite) {
  const actions = [
    normalizeEntry({
      id: "action:copy-link",
      kind: "action",
      title: "Copy link to this page",
      subtitle: globalThis.location.host,
      description: "Copy the current xjk page address to your clipboard.",
      accent: currentSite?.accent,
      keywords: ["copy", "clipboard", "url", "share"],
      priority: 70,
      action: copyCurrentPageLink,
      keepOpen: true,
      successMessage: "Page link copied",
    }),
    normalizeEntry({
      id: "action:reload",
      kind: "action",
      title: "Reload this page",
      subtitle: currentSite?.label || "Current service",
      description: "Refresh the current page and its live data.",
      accent: currentSite?.accent,
      keywords: ["reload", "refresh", "restart"],
      priority: 50,
      action: () => globalThis.location.reload(),
    }),
  ];

  if (globalThis.history.length > 1) {
    actions.unshift(
      normalizeEntry({
        id: "action:back",
        kind: "action",
        title: "Go back",
        subtitle: "Browser history",
        description: "Return to the previous page.",
        accent: currentSite?.accent,
        keywords: ["back", "previous", "history"],
        priority: 55,
        action: () => globalThis.history.back(),
      })
    );
  }
  return actions;
}

function createIntentItems(rawQuery, currentSite) {
  const query = String(rawQuery || "").trim();
  const match = query.match(/^(record|rec|map|uid)\s*[:=]?\s+(.+)$/i);
  if (!match) return [];
  const type = match[1].toLowerCase();
  const value = match[2].trim();
  if (!value) return [];
  const isRecord = type === "record" || type === "rec";
  const encoded = encodeURIComponent(value);

  return [
    normalizeEntry({
      id: `intent:${isRecord ? "record" : "map"}:${slug(value)}`,
      kind: "intent",
      title: `${isRecord ? "Look up record" : "Look up map"} ${value}`,
      subtitle: "Validifier",
      description: `Open this ${isRecord ? "record ID" : "map UID"} directly in Validifier.`,
      siteId: "validifier",
      siteLabel: "Validifier",
      path: isRecord ? `/records/${encoded}` : `/maps/${encoded}`,
      accent: getSite("validifier")?.accent || currentSite?.accent,
      keywords: [isRecord ? "record" : "map", "lookup", "validifier", value],
      priority: 110,
    }),
  ];
}

function createFallbackSites() {
  return getAllSites()
    .filter((site) => site.public && !site.internal)
    .map((site, index) =>
      normalizeEntry({
        id: `site:${site.id}`,
        kind: "site",
        title: site.label,
        subtitle: site.host,
        description: site.summary,
        siteId: site.id,
        siteLabel: site.label,
        path: "/",
        keywords: site.keywords,
        aliases: site.aliases,
        accent: site.accent,
        priority: site.id === "xjk" ? 100 : 60 - index,
      })
    );
}

async function loadIndexedItems(fetchImpl = fetch) {
  const response = await fetchImpl(SEARCH_INDEX_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Search index returned ${response.status}`);
  const payload = await response.json();
  return (Array.isArray(payload?.entries) ? payload.entries : []).map((entry, index) => normalizeEntry(entry, index));
}

export {
  collectLocalItems,
  createActionItems,
  createFallbackSites,
  createIntentItems,
  currentSiteFromLocation,
  loadIndexedItems,
};
