import { navigateWithinShell, shouldHandleRouteClick, updateChrome } from "./navigation.js?v=2";
import { mountOverview } from "./overview-controller.js?v=2";
import { overviewMarkup } from "./overview-view.js?v=2";
import { getRouteContext } from "./route-model.js?v=2";
import { mountRuntime, runtimeMarkup } from "./runtime-frame.js?v=2";

function createTrackerShell({
  documentObject = document,
  windowObject = window,
  fetchJsonImpl,
  resolveSiteHrefImpl,
  safeHtml = globalThis.XjkSafeHtml,
} = {}) {
  let activeCleanup = null;

  function teardownActiveRoute() {
    if (typeof activeCleanup === "function") {
      try {
        activeCleanup();
      } catch {}
    }
    activeCleanup = null;
  }

  function renderCurrentRoute() {
    teardownActiveRoute();
    const context = getRouteContext(windowObject.location.pathname || "/");
    updateChrome(documentObject, context, {
      locationObject: windowObject.location,
      resolveSiteHrefImpl,
    });
    documentObject.body.classList.toggle("route-runtime", context.route !== "overview");

    const root = documentObject.getElementById("route-content");
    if (!root) return;
    if (context.route === "overview") {
      safeHtml.set(root, overviewMarkup(context));
      activeCleanup = mountOverview(root, context, {
        fetchJsonImpl,
        setIntervalImpl: (...args) => windowObject.setInterval(...args),
        clearIntervalImpl: (timerId) => windowObject.clearInterval(timerId),
      });
      return;
    }

    safeHtml.set(root, runtimeMarkup(context));
    activeCleanup = mountRuntime(root);
  }

  function navigate(href) {
    return navigateWithinShell(href, {
      locationObject: windowObject.location,
      historyObject: windowObject.history,
      renderRoute: renderCurrentRoute,
      scrollTo: (...args) => windowObject.scrollTo(...args),
    });
  }

  function handleRouteClick(event) {
    const anchor = event.target?.closest?.("[data-route-link]");
    if (!shouldHandleRouteClick(event, anchor)) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    event.preventDefault();
    navigate(href);
  }

  function start() {
    documentObject.addEventListener("click", handleRouteClick);
    windowObject.addEventListener("popstate", renderCurrentRoute);
    windowObject.addEventListener("beforeunload", teardownActiveRoute);
    renderCurrentRoute();
  }

  function stop() {
    documentObject.removeEventListener("click", handleRouteClick);
    windowObject.removeEventListener("popstate", renderCurrentRoute);
    windowObject.removeEventListener("beforeunload", teardownActiveRoute);
    teardownActiveRoute();
  }

  return { navigate, renderCurrentRoute, start, stop };
}

function bootTrackerShell(options) {
  const shell = createTrackerShell(options);
  shell.start();
  return shell;
}

export { bootTrackerShell, createTrackerShell };
