import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { getChromeConfig } from "../sites/shared/xjk-core/chrome-config.js";
import { getChromeVisibilityState, mountChromeVisibility } from "../sites/shared/xjk-core/chrome-visibility.js";
import { onStylesheetReady } from "../sites/shared/xjk-core/dom-utils.js";
import { isCurrentHref, mountSidenav } from "../sites/shared/xjk-core/sidenav.js";
import { mountTopbar } from "../sites/shared/xjk-core/topbar.js";
import { AccountWidgetElement, createTopbarDocument } from "../services/shared/testing/fakeChromeDom.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function createAccountWidgetRuntime() {
  const documentListeners = new Map();
  const dockedSlot = new AccountWidgetElement({ slot: "topbar" });
  dockedSlot.isConnected = true;
  const document = {
    body: new AccountWidgetElement(),
    addEventListener(type, listener) {
      const listeners = documentListeners.get(type) || [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    },
    createElement() {
      return new AccountWidgetElement();
    },
    dispatch(type, event = {}) {
      for (const listener of documentListeners.get(type) || []) listener(event);
    },
    querySelector(selector) {
      if (selector === '[data-xjk-global-topbar] [data-xjk-account-widget-slot="topbar"]') return dockedSlot;
      return null;
    },
  };
  const location = new URL("https://learn.xjk.test/library/");
  const requests = [];
  const context = vm.createContext({
    URL,
    URLSearchParams,
    console,
    document,
    encodeURIComponent,
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (options.method === "POST") return { ok: false, status: 503 };
      return {
        ok: true,
        async json() {
          return {
            authenticated: true,
            user: { displayName: "Test Driver", roles: ["admin"], username: "driver" },
          };
        },
      };
    },
    setTimeout,
    window: { __xjkAccountWidgetLoaded: true, location },
  });
  const source = fs.readFileSync(path.join(repoRoot, "sites/shared/xjk-core/xjk-account-widget.js"), "utf8");
  vm.runInContext(source, context, { filename: "xjk-account-widget.js" });
  context.initXjkAccountWidget(
    {
      createSiteLinkMap(siteIds) {
        return Object.fromEntries(siteIds.map((siteId) => [siteId, `https://${siteId}.xjk.test/`]));
      },
      getRuntimeContext() {
        return {
          hostname: location.hostname,
          isLocalSubdomain: false,
          localPathOrigin: "http://localhost:8080",
          pathname: location.pathname,
        };
      },
      resolveSiteHref() {
        return "https://xjk.test/";
      },
      userHasAdminRole(user) {
        return user.roles.includes("admin");
      },
    },
    {
      ensureStylesheetLink() {
        return new AccountWidgetElement();
      },
      escapeAttribute(value) {
        return String(value);
      },
      escapeHtml(value) {
        return String(value);
      },
      onStylesheetReady(_stylesheet, options) {
        options.onReady();
      },
      safeNavigationHref(value) {
        return value;
      },
    },
    {
      set(element, html) {
        element.innerHTML = html;
      },
    }
  );
  return { context, dockedSlot, document, requests };
}

function createDeferredStylesheet() {
  const listeners = new Map();
  let fallback = null;
  let cleared = 0;
  const timer = { unref() {} };
  const document = {
    defaultView: {
      clearTimeout(value) {
        if (value === timer) cleared += 1;
      },
      getComputedStyle() {
        return { getPropertyValue: () => "" };
      },
      queueMicrotask() {},
      requestAnimationFrame() {},
      setTimeout(callback) {
        fallback = callback;
        return timer;
      },
    },
  };
  const stylesheet = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  return {
    document,
    getCleared: () => cleared,
    getFallback: () => fallback,
    listeners,
    stylesheet,
  };
}

test("account widget disclosure restores focus and reports failed logout", async () => {
  const { dockedSlot, document, requests } = createAccountWidgetRuntime();
  await new Promise((resolve) => setImmediate(resolve));

  const root = dockedSlot.children[0];
  const trigger = root.querySelector("[data-xjk-trigger]");
  const panel = root.querySelector(".xjk-account-widget__panel");
  assert.ok(panel.querySelector('[data-xjk-action="logout"]'));
  assert.doesNotMatch(`${root.innerHTML}\n${panel.innerHTML}`, /role="menu(?:item)?"|aria-haspopup="menu"/);
  assert.match(root.innerHTML, /aria-controls="xjkAccountWidgetPanel"/);
  assert.match(panel.innerHTML, /data-xjk-account-error[^>]*role="status"[^>]*aria-live="polite"/);

  trigger.dispatch("click");
  assert.equal(panel.hidden, false);
  let escapePrevented = false;
  document.dispatch("keydown", {
    key: "Escape",
    preventDefault() {
      escapePrevented = true;
    },
  });
  assert.equal(panel.hidden, true);
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(escapePrevented, true);
  assert.equal(trigger.focusCalls.length, 1);
  assert.equal(trigger.focusCalls[0]?.preventScroll, true);

  trigger.dispatch("click");
  const logoutButton = panel.querySelector('[data-xjk-action="logout"]');
  logoutButton.dispatch("click");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.at(-1).options.method, "POST");
  assert.equal(logoutButton.disabled, false);
  assert.equal(panel.querySelector("[data-xjk-account-error]").textContent, "Unable to log out. Please try again.");
});

test("topbar identity remains a native link to xjk home", () => {
  const handle = mountTopbar({
    config: getChromeConfig({ site: "account", page: "" }),
    document: createTopbarDocument(),
    safeHtml: { set() {} },
  });
  const identity = handle.root.querySelector("[data-xjk-site-link]");
  assert.ok(identity);
  assert.equal(handle.root.querySelectorAll("[data-xjk-global-search-slot]").length, 1);
  assert.equal(handle.root.querySelectorAll('[data-xjk-account-widget-slot="topbar"]').length, 1);
  assert.equal(identity.tagName, "A");
  assert.equal(identity.getAttribute("href"), "https://xjk.yt/");
  assert.equal(identity.getAttribute("aria-label"), "Go to xjk home");

  const clickEvent = {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  identity.dispatch("click", clickEvent);
  assert.equal(clickEvent.defaultPrevented, false);
});

test("topbar and sidenav mounts are idempotent", () => {
  const slots = new Map([
    ["[data-xjk-global-search-slot]", {}],
    ["[data-xjk-topbar-actions-slot]", {}],
    ['[data-xjk-account-widget-slot="topbar"]', {}],
  ]);
  const existingTopbar = { querySelector: (selector) => slots.get(selector) || null };
  const pageToolbar = {};
  const config = { siteId: "account" };
  const handle = mountTopbar({
    config,
    document: {
      body: {},
      head: {},
      querySelector(selector) {
        if (selector === "[data-xjk-global-topbar]") return existingTopbar;
        if (selector === "[data-xjk-page-toolbar]") return pageToolbar;
        return null;
      },
    },
  });
  assert.equal(handle.root, existingTopbar);
  assert.equal(handle.config, config);
  assert.equal(handle.searchSlot, slots.get("[data-xjk-global-search-slot]"));
  assert.equal(handle.pageToolbar, pageToolbar);

  const existingSidenav = {};
  assert.equal(
    mountSidenav({
      document: {
        body: {},
        querySelector: (selector) => (selector === ".xjk-sidenav" ? existingSidenav : null),
      },
    }),
    existingSidenav
  );
});

test("stylesheet readiness handles cached, failed, and timed-out stylesheets once", () => {
  let cachedReady = 0;
  onStylesheetReady(
    { sheet: {} },
    {
      document: {
        defaultView: {
          clearTimeout() {},
          getComputedStyle: () => ({ getPropertyValue: () => "" }),
          setTimeout() {
            throw new Error("cached stylesheets must not schedule a fallback");
          },
        },
      },
      onReady() {
        cachedReady += 1;
      },
    }
  );
  assert.equal(cachedReady, 1);

  const failed = createDeferredStylesheet();
  let failedReady = 0;
  onStylesheetReady(failed.stylesheet, {
    document: failed.document,
    fallbackMs: 25,
    onReady() {
      failedReady += 1;
    },
  });
  assert.equal(failedReady, 0);
  failed.listeners.get("error")();
  assert.equal(failedReady, 1);
  assert.equal(failed.getCleared(), 1);
  failed.getFallback()();
  assert.equal(failedReady, 1);

  const timedOut = createDeferredStylesheet();
  let fallbackReady = 0;
  onStylesheetReady(timedOut.stylesheet, {
    document: timedOut.document,
    fallbackMs: 25,
    onReady() {
      fallbackReady += 1;
    },
  });
  timedOut.getFallback()();
  assert.equal(fallbackReady, 1);
});

test("sidenav current-link matching respects nested and exact routes", () => {
  const alteredLocation = new URL("http://localhost:8080/altered/maps/");
  assert.equal(isCurrentHref("http://localhost:8080/altered/maps/", alteredLocation), true);
  assert.equal(isCurrentHref("http://localhost:8080/altered/", alteredLocation, { exact: true }), false);
  assert.equal(
    isCurrentHref("http://localhost:8080/altered/api/", new URL("http://localhost:8080/altered/api/endpoints/catalog")),
    true
  );
});

test("chrome configuration keeps page-specific navigation declarative", () => {
  assert.equal(getChromeConfig({ site: "altered", page: "" }).chrome.revealOnScroll, true);
  assert.equal(getChromeConfig({ site: "altered", page: "maps" }).chrome.revealOnScroll, false);
  assert.deepEqual(getChromeConfig({ site: "tools", page: "tool" }).sidenav.sections, [
    { label: "All tools", icon: "arrowLeft", siteId: "tools", path: "/" },
  ]);
  for (const page of ["admin", "admin/login"]) {
    const sections = getChromeConfig({ site: "trackers", page }).sidenav.sections;
    assert.ok(sections.length > 0);
    assert.equal(
      sections.every((item) => item.siteId === "trackers" && typeof item.path === "string" && !item.tab && !item.focus),
      true
    );
  }
});

test("scroll-reveal chrome transitions at its boundary and dispatches hide events", () => {
  assert.equal(getChromeVisibilityState(0, 16), "hidden");
  assert.equal(getChromeVisibilityState(16, 16), "hidden");
  assert.equal(getChromeVisibilityState(17, 16), "visible");

  const listeners = new Map();
  const events = [];
  let queuedFrame = null;
  const root = {
    dataset: {},
    dispatchEvent(event) {
      events.push(event.type);
    },
  };
  const document = {
    body: { scrollTop: 0 },
    createElement() {
      return { dataset: {} };
    },
    defaultView: {
      scrollY: 0,
      CustomEvent: class FakeCustomEvent {
        constructor(type) {
          this.type = type;
        }
      },
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      requestAnimationFrame(callback) {
        queuedFrame = callback;
        return 1;
      },
      setTimeout,
    },
    documentElement: root,
    head: { appendChild() {} },
    querySelector() {
      return null;
    },
    scrollingElement: { scrollTop: 0 },
  };

  mountChromeVisibility({ document, config: getChromeConfig({ site: "altered", page: "" }) });
  assert.equal(root.dataset.xjkChromeScrollReveal, "hidden");
  document.defaultView.scrollY = 17;
  listeners.get("scroll")();
  queuedFrame();
  assert.equal(root.dataset.xjkChromeScrollReveal, "visible");
  document.defaultView.scrollY = 0;
  listeners.get("scroll")();
  queuedFrame();
  assert.equal(root.dataset.xjkChromeScrollReveal, "hidden");
  assert.deepEqual(events, ["xjk:chrome-hide", "xjk:chrome-hide"]);
});
