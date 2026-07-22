import "./safe-html.js?v=2";
import { getChromeConfig } from "./chrome-config.js";
import { ensureStylesheetLink, onStylesheetReady, safeCssColor, shortcutLabel } from "./dom-utils.js";
import { applySiteLinks } from "./site-runtime.js";

const STYLE_VERSION = "2";

const SEARCH_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.5"></circle>
    <path d="m16 16 5 5"></path>
  </svg>`;

const XJK_LOGO = `<svg viewBox="0 0 797 554" aria-hidden="true" focusable="false">
  <path fill="currentColor" fill-rule="evenodd" d="M451,433V110l-126,118,126,122-42,37-126-121-186,185H20l221-225-101-98-80-1L0,75h168l115,112,94-88h75v-58L511,0v307l135-128h148l-59,53h-64l-100,99,226,223h-80l-205-199v96l-83,77h-57l-57-59h95l41-36Z"/>
</svg>`;

function enforceViewportOwnership(doc, root, stylesheet, config) {
  const view = doc.defaultView || globalThis;

  const inspect = () => {
    if (!root.isConnected) return;

    const position = view.getComputedStyle?.(root).position || "static";
    const overlaysPage = Boolean(config?.chrome?.revealOnScroll);
    if (!overlaysPage && position !== "fixed" && !root.previousElementSibling?.matches?.(".xjk-global-topbar-spacer")) {
      const spacer = doc.createElement("div");
      spacer.className = "xjk-global-topbar-spacer";
      spacer.setAttribute("aria-hidden", "true");
      root.before(spacer);
    }

    // The canonical chrome owns the viewport on every page, including legacy
    // headers nested inside max-width or overflow containers. Flow-based hosts
    // leave a spacer behind; scroll-reveal chrome intentionally overlays its
    // page so Altered's hero never moves as the controls fly in and out.
    root.dataset.xjkTopbarPosition = "viewport";
    doc.documentElement.classList.add("xjk-topbar-ready");
  };

  onStylesheetReady(stylesheet, {
    document: doc,
    sentinelTarget: root,
    sentinelProperty: "--xjk-topbar-height",
    onReady: inspect,
  });
}

function findLegacyTopbar(doc, config) {
  const explicit = doc.querySelector("[data-xjk-topbar-mount]");
  if (explicit) return explicit;

  const actionsHost = doc.querySelector("[data-xjk-topbar-actions]");
  if (actionsHost?.closest("header, [role='banner'], nav.site-nav")) {
    return actionsHost.closest("header, [role='banner'], nav.site-nav");
  }

  const accountSlot = doc.querySelector('[data-xjk-account-widget-slot="topbar"]');
  if (accountSlot?.closest("header, [role='banner'], nav.site-nav")) {
    return accountSlot.closest("header, [role='banner'], nav.site-nav");
  }

  // Altered uses content-level <header> elements for page heroes. Reusing a
  // broad `.shell > header` match would replace that content with the shared
  // chrome. Its only legacy chrome host is the old site navigation; pages
  // without one should receive a new standalone topbar.
  if (config?.siteId === "altered") {
    return doc.querySelector("body > nav.site-nav");
  }

  return doc.querySelector(
    [
      "body > header",
      "body > nav.site-nav",
      "body > .hub-shell > header",
      "body > .learn-shell > header",
      "body > .account-shell > header",
      "body > .agg-shell > header",
      "body > .val-shell > header",
      "body > .app > header",
      "body > .shell > header",
    ].join(", ")
  );
}

function pruneEmptyContainers(root) {
  const containers = [...root.querySelectorAll("div, nav, span, label")].reverse();
  for (const node of containers) {
    if (node.querySelector("input, select, textarea, button, a[href]") || node.textContent.trim()) continue;
    node.remove();
  }
}

function preservePageToolbar(doc, legacyNodes, root, config) {
  if (!legacyNodes.length) return null;
  const toolbar = doc.createElement("div");
  toolbar.className = "xjk-page-toolbar";
  toolbar.dataset.xjkPageToolbar = "true";
  toolbar.setAttribute("aria-label", "Page actions");
  toolbar.append(...legacyNodes);

  // The canonical Altered navigation now lives in the shared sidenav. Keeping
  // the old link row here duplicates every destination and leaves an empty
  // toolbar-height gap at mobile breakpoints.
  if (config?.siteId === "altered") {
    toolbar.querySelectorAll(".site-nav-links").forEach((node) => node.remove());
  }

  toolbar
    .querySelectorAll(
      [
        '[data-xjk-account-widget-slot="topbar"]',
        "[data-xjk-search-trigger]",
        "[data-xjk-topbar-local-search]",
        "[data-xjk-topbar-legacy-account]",
        ".top-account-panel",
        ".site-nav-brand",
        ".site-nav-home",
        ".site-nav-toggle",
        ".site-nav-login",
        ".network-brand",
        ".account-brand",
        ".agg-brand",
        ".arc-brand",
        ".con-brand",
        ".cotd-brand",
        ".plg-brand",
        ".tls-brand",
        ".trk-brand",
        ".val-brand",
        ".topbar-brand",
        ".agg-status",
        ".arc-status",
        ".con-status",
        ".cotd-status",
        ".plg-status",
        ".tls-status",
        ".trk-status",
        ".val-status",
        ".service-status",
      ].join(", ")
    )
    .forEach((node) => node.remove());

  pruneEmptyContainers(toolbar);
  const hasControls = toolbar.querySelector("input, select, textarea, button, a[href]");
  const hasCopy = toolbar.textContent.replace(/\s+/g, " ").trim();
  if (!hasControls && !hasCopy) return null;

  root.insertAdjacentElement("afterend", toolbar);
  return toolbar;
}

function createSearchTrigger(doc, config, safeHtml) {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "xjk-global-search-trigger xjk-topbar-search";
  button.dataset.xjkSearchTrigger = "";
  button.dataset.xjkSearchOwner = "topbar";
  button.setAttribute("aria-label", `${config.topbar.searchLabel} and the xjk network (${shortcutLabel()})`);
  safeHtml.set(
    button,
    `
    <span class="xjk-topbar-search__icon">${SEARCH_ICON}</span>
    <span class="xjk-topbar-search__copy">
      <strong>${config.topbar.searchLabel}</strong>
      <small>${config.topbar.searchHint}</small>
    </span>
    <kbd data-xjk-search-shortcut aria-hidden="true">${shortcutLabel()}</kbd>`
  );
  return button;
}

function createCanonicalRow(doc, config, safeHtml) {
  const row = doc.createElement("div");
  row.className = "xjk-global-topbar__row";

  const identity = doc.createElement("a");
  identity.className = "xjk-global-topbar__identity";
  identity.href = "https://xjk.yt/";
  identity.dataset.xjkSiteLink = "xjk";
  identity.setAttribute("aria-label", "Go to xjk home");
  const pageCopy = config.pageId ? config.pageId.split("/").filter(Boolean).join(" / ") : "xjk network";
  safeHtml.set(
    identity,
    `
    <span class="xjk-global-topbar__mark">${XJK_LOGO}</span>
    <span class="xjk-global-topbar__context">
      <strong>${config.topbar.contextLabel}</strong>
      <small>${pageCopy}</small>
    </span>`
  );

  const searchSlot = doc.createElement("div");
  searchSlot.className = "xjk-global-topbar__search";
  searchSlot.dataset.xjkGlobalSearchSlot = "true";
  searchSlot.appendChild(createSearchTrigger(doc, config, safeHtml));

  const actionsSlot = doc.createElement("div");
  actionsSlot.className = "xjk-global-topbar__actions";
  actionsSlot.dataset.xjkTopbarActionsSlot = "true";

  const accountSlot = doc.createElement("div");
  accountSlot.className = "xjk-global-topbar__account";
  accountSlot.dataset.xjkAccountWidgetSlot = "topbar";
  accountSlot.setAttribute("aria-label", "xjk account");

  row.append(identity, searchSlot, actionsSlot, accountSlot);
  return { row, identity, searchSlot, actionsSlot, accountSlot };
}

function createTopbarHandle(root, doc, config, pageToolbar = doc.querySelector("[data-xjk-page-toolbar]")) {
  return {
    root,
    searchSlot: root.querySelector("[data-xjk-global-search-slot]"),
    actionsSlot: root.querySelector("[data-xjk-topbar-actions-slot]"),
    accountSlot: root.querySelector('[data-xjk-account-widget-slot="topbar"]'),
    pageToolbar,
    config,
  };
}

function mountTopbar(options = {}) {
  const doc = options.document || globalThis.document;
  if (!doc?.head || !doc?.body) return null;
  const safeHtml = options.safeHtml || globalThis.XjkSafeHtml;
  if (typeof safeHtml?.set !== "function") throw new Error("The shared HTML renderer is not available.");

  const config = options.config || getChromeConfig({ ...options, document: doc });
  const existing = doc.querySelector("[data-xjk-global-topbar]");
  if (existing) return createTopbarHandle(existing, doc, config);

  const stylesheet = ensureStylesheetLink(doc, {
    selector: "link[data-xjk-global-topbar-styles]",
    href: `/shared/xjk-core/topbar.css?v=${STYLE_VERSION}`,
    datasetKey: "xjkGlobalTopbarStyles",
  });

  let root = findLegacyTopbar(doc, config);
  let reusedLegacyRoot = Boolean(root);
  const replacesAlteredNav = config.siteId === "altered" && root?.matches?.("nav.site-nav");
  const legacyNodes = reusedLegacyRoot ? [...root.childNodes] : [];

  // Altered's legacy nav carries fixed-position selectors and scroll handlers.
  // Replace the host itself so those page styles cannot leak onto the shared
  // topbar; its redundant children are discarded by preservePageToolbar().
  if (replacesAlteredNav) {
    const replacement = doc.createElement("header");
    root.replaceWith(replacement);
    root = replacement;
    reusedLegacyRoot = false;
  }

  if (!root) {
    root = doc.createElement("header");
    doc.body.prepend(root);
  }

  const canonical = createCanonicalRow(doc, config, safeHtml);
  root.replaceChildren(canonical.row);
  root.classList.add("xjk-global-topbar");
  root.dataset.xjkGlobalTopbar = "true";
  root.dataset.xjkTopbarMode = reusedLegacyRoot ? "hosted" : "standalone";
  // A few older shells position their header against the viewport and also
  // reserve the sidebar gutter with `left`. Mark that layout explicitly so
  // the shared stylesheet can make the topbar own the viewport edge without
  // applying the normal in-flow gutter compensation a second time.
  root.dataset.xjkTopbarPosition = doc.defaultView?.getComputedStyle?.(root).position === "fixed" ? "viewport" : "flow";
  root.dataset.xjkSite = config.siteId;
  root.style.setProperty("--xjk-topbar-accent", safeCssColor(config.accent, "#d8d8d8"));
  root.style.setProperty("--xjk-topbar-accent-rgb", config.accentRgb);
  root.setAttribute("aria-label", `${config.topbar.contextLabel} navigation`);

  doc.documentElement.dataset.xjkSite = config.siteId;
  doc.documentElement.dataset.xjkPage = config.pageId;
  const pageToolbar = preservePageToolbar(doc, legacyNodes, root, config);
  applySiteLinks(root);
  enforceViewportOwnership(doc, root, stylesheet, config);

  return createTopbarHandle(root, doc, config, pageToolbar);
}

export { mountTopbar };
