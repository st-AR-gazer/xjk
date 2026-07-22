const KNOWN_VIEWS = new Set(["map", "library", "tools", "profile", "settings", "admin"]);

function decodeValue(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function stripRoutePrefix(value = "") {
  return decodeValue(String(value || ""))
    .trim()
    .replace(/^#!?\/?/, "")
    .replace(/^#\/?/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/^index\.html$/i, "")
    .replace(/\/index\.html$/i, "");
}

function cleanPathFromLocation(pathname = window.location.pathname) {
  let path = stripRoutePrefix(pathname);
  if (!path || path === "learn") return "";
  if (path.startsWith("learn/")) path = path.slice("learn/".length);
  if (/\.[a-z0-9]{2,8}$/i.test(path.split("/").pop() || "")) return "";
  return path;
}

function splitSource(source = "") {
  const [pathPart = "", queryPart = ""] = String(source).split("?");
  return {
    path: stripRoutePrefix(pathPart),
    query: new URLSearchParams(queryPart),
  };
}

function routeFromSource(source = "", mode = "hash", defaultSlug = "") {
  const { path, query } = splitSource(source);
  if (!path || path === "learn" || path === "map") return { view: "map", slug: "", query, mode };

  const [first = "", ...rest] = path.split("/").filter(Boolean);
  const view = first.toLowerCase();
  if (KNOWN_VIEWS.has(view)) {
    const slug = rest.join("/");
    return { view, slug, tool: view === "tools" ? slug : "", query, mode };
  }

  if (view === "learn") {
    const slug = rest.join("/");
    return { view: "learn", slug, query, mode };
  }

  return { view: "learn", slug: path || defaultSlug, query, mode };
}

function hashSource() {
  return stripRoutePrefix(window.location.hash);
}

function cleanSource() {
  const path = cleanPathFromLocation();
  if (!path) return "";
  return `${path}${window.location.search || ""}`;
}

function hashForRoute(view = "learn", slug = "") {
  const cleanSlug = stripRoutePrefix(slug);
  if (view === "map") return "#/";
  if (view === "learn") return `#/learn${cleanSlug ? `/${cleanSlug}` : ""}`;
  return `#/${view}${cleanSlug ? `/${cleanSlug}` : ""}`;
}

function appBasePath() {
  const path = window.location.pathname;
  return path === "/learn" || path.startsWith("/learn/") ? "/learn/" : "/";
}

function canonicalizeCleanPath() {
  if (window.location.hash) return;
  const clean = cleanPathFromLocation();
  if (!clean) return;
  const route = routeFromSource(`${clean}${window.location.search || ""}`, "clean");
  window.history.replaceState(
    { learnRoute: route },
    "",
    `${appBasePath()}${hashForRoute(route.view, route.slug)}${route.query?.toString() ? `?${route.query}` : ""}`
  );
}

export function parseRoute(defaultSlug = "") {
  const rawHash = hashSource();
  if (rawHash) return routeFromSource(rawHash, "hash", defaultSlug);
  const rawClean = cleanSource();
  if (rawClean) return routeFromSource(rawClean, "clean", defaultSlug);
  return routeFromSource("", "hash", defaultSlug);
}

export function navigateToLesson(slug = "", options = {}) {
  const hash = hashForRoute("learn", slug);
  if (options.replace) window.location.replace(hash);
  else window.location.hash = hash;
}

export function navigateToView(view = "learn", extra = "", options = {}) {
  const hash = hashForRoute(view, extra);
  if (options.replace) window.location.replace(hash);
  else window.location.hash = hash;
}

function routeHashForUrl(url) {
  if (url.hash && /^#\/|^#!\/?|^#learn\/?/i.test(url.hash)) return `#/${stripRoutePrefix(url.hash)}`;
  const path = cleanPathFromLocation(url.pathname);
  if (!path && (url.pathname === "/" || url.pathname === "/learn" || url.pathname === "/learn/")) return "#/";
  if (!path) return "";
  const route = routeFromSource(`${path}${url.search || ""}`, "clean");
  const query = route.query?.toString();
  return `${hashForRoute(route.view, route.slug)}${query ? `?${query}` : ""}`;
}

export function createRouter({ onRoute = () => {}, defaultSlug = "" } = {}) {
  let started = false;
  let current = null;

  function emit() {
    current = parseRoute(defaultSlug);
    onRoute(current);
  }

  function handleClick(event) {
    const anchor = event.target.closest?.("a[href]");
    if (!anchor || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (anchor.target && anchor.target !== "_self") return;
    if (
      anchor.hasAttribute("download") ||
      anchor.hasAttribute("data-router-ignore") ||
      anchor.hasAttribute("data-xjk-site-link")
    ) {
      return;
    }

    const href = anchor.getAttribute("href");
    if (!href || /^(mailto|tel|javascript):/i.test(href)) return;

    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return;

    const hash = routeHashForUrl(url);
    if (!hash) return;

    event.preventDefault();
    if (window.location.hash === hash) emit();
    else window.location.hash = hash;
  }

  function start() {
    if (started) return;
    started = true;
    canonicalizeCleanPath();
    window.addEventListener("hashchange", emit);
    window.addEventListener("popstate", emit);
    document.addEventListener("click", handleClick);
    emit();
  }

  function stop() {
    if (!started) return;
    started = false;
    window.removeEventListener("hashchange", emit);
    window.removeEventListener("popstate", emit);
    document.removeEventListener("click", handleClick);
  }

  return {
    start,
    stop,
    refresh: emit,
    navigateToLesson,
    navigateToView,
    get current() {
      return current;
    },
  };
}
