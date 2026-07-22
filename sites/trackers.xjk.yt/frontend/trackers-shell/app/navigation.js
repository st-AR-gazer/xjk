import { HUB_LINKS, ROUTE_CONFIG, routeHref } from "./route-model.js?v=2";

function resolveHubHref(key, { resolveSiteHrefImpl, locationObject }) {
  const siteId = HUB_LINKS[key];
  return siteId ? resolveSiteHrefImpl(siteId, { location: locationObject }) : "#";
}

function updateChrome(documentObject, context, dependencies) {
  documentObject.querySelectorAll("[data-route-link]").forEach((node) => {
    const route = node.getAttribute("data-route");
    if (!route || !ROUTE_CONFIG[route]) return;
    node.setAttribute("href", routeHref(context.basePrefix, route));
    node.classList.toggle("is-active", route === context.route);
  });
  documentObject.querySelectorAll("[data-link]").forEach((node) => {
    const key = node.getAttribute("data-link");
    if (key) node.setAttribute("href", resolveHubHref(key, dependencies));
  });
  documentObject.title = ROUTE_CONFIG[context.route].title;
}

function shouldHandleRouteClick(event, anchor) {
  if (!anchor || event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  return !anchor.hasAttribute("download");
}

function navigateWithinShell(href, { locationObject, historyObject, renderRoute, scrollTo }) {
  const nextUrl = new URL(href, locationObject.origin);
  const currentUrl = new URL(locationObject.href);
  if (
    nextUrl.pathname === currentUrl.pathname &&
    nextUrl.search === currentUrl.search &&
    nextUrl.hash === currentUrl.hash
  ) {
    return false;
  }

  historyObject.pushState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  renderRoute();
  scrollTo({ top: 0, left: 0, behavior: "auto" });
  return true;
}

export { navigateWithinShell, resolveHubHref, shouldHandleRouteClick, updateChrome };
