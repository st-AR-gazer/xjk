import "./safe-html.js?v=2";
/* Shared sidenav renderer. sidenav-boot.js resolves page context through
   chrome-config.js and mounts it independently from page-content sidebars.
   Account controls belong to the shared topbar. */

import { SITE_STATUSES, XJK_SITES } from "./site-registry.js";
import { ensureStylesheetLink, escapeAttribute, escapeHtml, onStylesheetReady, safeCssColor } from "./dom-utils.js";
import { applySiteLinks, getSite, resolveSiteHref, userHasAdminRole } from "./site-runtime.js";

const MODE_KEY = "xjk.sidenav.mode";
const NETWORK_KEY = "xjk.sidenav.network";
const STYLE_VERSION = "2";
const SESSION_URL = "/api/v1/account/session";
const ADMIN_ICON_BY_ID = { dash: "gauge", admin: "wrench" };

const ICONS = {
  dot: '<circle cx="12" cy="12" r="3.2"></circle>',
  home: '<path d="M4 11 12 4l8 7"></path><path d="M6 10v9h12v-9"></path>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1"></rect><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"></rect><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"></rect><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"></rect>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"></path><path d="M4 6h.01M4 12h.01M4 18h.01"></path>',
  search: '<circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4.5 4.5"></path>',
  map: '<path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z"></path><path d="M9 3v15M15 6v15"></path>',
  clock: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5l3.5 2"></path>',
  wrench:
    '<path d="M14.7 6.3a4 4 0 0 0 5 5L11.5 19.5a2.1 2.1 0 0 1-3-3L16.7 8.3a4 4 0 0 1-2-2Z"></path><path d="m6 6 3 3"></path>',
  arrowLeft: '<path d="M19 12H5"></path><path d="m11 6-6 6 6 6"></path>',
  gauge:
    '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"></path><path d="m12 13 3.5-4"></path><circle cx="12" cy="14" r="1.6"></circle>',
  users:
    '<circle cx="9" cy="8.5" r="3"></circle><path d="M3.5 19a5.5 5.5 0 0 1 11 0"></path><path d="M15.5 6a3 3 0 1 1 0 5.4M16 13.6a5.5 5.5 0 0 1 4.5 5.4"></path>',
  database:
    '<ellipse cx="12" cy="5.5" rx="7" ry="2.8"></ellipse><path d="M5 5.5V18c0 1.6 3.1 2.9 7 2.9s7-1.3 7-2.9V5.5"></path><path d="M5 12c0 1.6 3.1 2.9 7 2.9s7-1.3 7-2.9"></path>',
  chart: '<path d="M4 20h16"></path><path d="M7 20v-7M12 20V6M17 20v-10"></path>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"></path>',
  layers: '<path d="m12 3 9 5-9 5-9-5Z"></path><path d="m3 13 9 5 9-5"></path>',
  trophy:
    '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"></path><path d="M8 5H5v1.5A3.5 3.5 0 0 0 8.5 10M16 5h3v1.5A3.5 3.5 0 0 1 15.5 10"></path><path d="M12 13v4M8.5 20h7M12 17v3"></path>',
  plug: '<path d="M9 3v5M15 3v5"></path><path d="M7 8h10v3a5 5 0 0 1-10 0Z"></path><path d="M12 16v5"></path>',
  file: '<path d="M6 3.5h8l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20Z"></path><path d="M14 3.5V8h4"></path>',
  tag: '<path d="m4 12 8-8h8v8l-8 8Z"></path><circle cx="15.5" cy="8.5" r="1.4"></circle>',
  calendar: '<rect x="4" y="6" width="16" height="14" rx="2"></rect><path d="M4 10h16M8 4v4M16 4v4"></path>',
  signal:
    '<path d="M5 19a13 13 0 0 1 14 0"></path><path d="M8 15.5a8.5 8.5 0 0 1 8 0"></path><circle cx="12" cy="19" r="1.6"></circle>',
  network:
    '<circle cx="18" cy="5" r="2.6"></circle><circle cx="6" cy="12" r="2.6"></circle><circle cx="18" cy="19" r="2.6"></circle><path d="m8.4 10.8 7-4.2M8.4 13.2l7 4.2"></path>',
  chevron: '<path d="m9 18 6-6-6-6"></path>',
  collapse: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M9 4v16M16 9l-3 3 3 3"></path>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.dot}</svg>`;
}

function read(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage can be unavailable; navigation still works without persistence. */
  }
}

function releasePrepaintGuard(doc, stylesheet) {
  const reveal = () => {
    doc.documentElement.classList.add("xjk-sidenav-ready");
    doc.documentElement.classList.remove("xjk-sidenav-boot");
  };
  onStylesheetReady(stylesheet, {
    document: doc,
    sentinelTarget: doc.documentElement,
    sentinelProperty: "--xjk-sidenav-w",
    onReady: reveal,
  });
}

function networkSites(currentId) {
  return XJK_SITES.filter(
    (site) =>
      site.public &&
      !site.internal &&
      site.status === SITE_STATUSES.active &&
      site.id !== currentId &&
      site.id !== "xjk"
  ).sort((a, b) => (a.map?.order ?? 999) - (b.map?.order ?? 999));
}

/* Internal admin surfaces (dash + admin). Listed in their own sidenav
   section that is only revealed once the session confirms admin access. */
function adminSites() {
  return XJK_SITES.filter((site) => site.internal && site.category === "admin").sort(
    (a, b) => (a.map?.order ?? 999) - (b.map?.order ?? 999)
  );
}

/* Resolves once per page: is the signed-in account an xjk admin? Mirrors the
   check used by admin.xjk.yt / the account widget (user.admin or roles). */
let adminAccessPromise = null;
function hasAdminAccess() {
  if (!adminAccessPromise) {
    adminAccessPromise = (async () => {
      try {
        const response = await fetch(SESSION_URL, { credentials: "include", cache: "no-store" });
        if (!response.ok) return false;
        const payload = await response.json().catch(() => ({}));
        const user = payload?.session?.user || payload?.user || null;
        return userHasAdminRole(user);
      } catch {
        return false;
      }
    })();
  }
  return adminAccessPromise;
}

export function isCurrentHref(href, location, options = {}) {
  if (!href || !location?.href) return false;
  try {
    const target = new URL(href, location.href);
    if (target.origin !== location.origin) return false;
    const currentPath = location.pathname.replace(/\/+$/, "") || "/";
    const targetPath = target.pathname.replace(/\/+$/, "") || "/";
    if (options.exact || targetPath === "/") return currentPath === targetPath;
    return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
  } catch {
    return false;
  }
}

function renderItem(item, index, location) {
  const href = item.siteId
    ? resolveSiteHref(item.siteId, { path: item.path || "/", query: item.query, hash: item.hash })
    : item.href;
  const exact = item.exact ?? Boolean(item.siteId && (item.path || "/") === "/");
  const active = item.active || isCurrentHref(href, location, { exact }) ? " is-active" : "";
  const inner = `<span class="xjk-sidenav-node">${icon(item.icon)}</span><span class="xjk-sidenav-label">${escapeHtml(item.label)}</span>`;
  if (href) {
    return `<a class="xjk-sidenav-item${active}" data-xjk-item="${index}" href="${escapeAttribute(href)}"${item.title ? ` title="${escapeAttribute(item.title)}"` : ""}>${inner}</a>`;
  }
  return `<button class="xjk-sidenav-item${active}" data-xjk-item="${index}" type="button"${item.title ? ` title="${escapeAttribute(item.title)}"` : ""}>${inner}</button>`;
}

export function mountSidenav(options = {}) {
  const doc = options.document || globalThis.document;
  if (!doc?.body) return null;

  const existing = doc.querySelector(".xjk-sidenav");
  if (existing) return existing;

  const site = getSite(options.site) || null;
  const siteId = site?.id || options.site || "";
  const accent = options.accent || site?.accent || "#d8d8d8";
  const label = (site?.label || siteId || "xjk").toLowerCase();
  const sections = Array.isArray(options.sections) ? options.sections : [];
  const networkPlacement = options.networkPlacement === "top" ? "top" : "bottom";
  const initialMode = options.initialMode === "collapsed" ? "collapsed" : "expanded";
  const persistMode = options.persistMode !== false;
  const persistNetwork = options.persistNetwork !== false;
  const storedMode = persistMode ? read(MODE_KEY) : "";

  const root = doc.documentElement;
  root.classList.add("xjk-has-sidenav", "xjk-sidenav-boot");
  if (siteId) root.dataset.xjkSite = siteId;
  root.dataset.xjkSidenav = storedMode === "collapsed" || storedMode === "expanded" ? storedMode : initialMode;

  const stylesheet = ensureStylesheetLink(doc, {
    selector: "link[data-xjk-sidenav-style]",
    href: `/shared/xjk-core/sidenav.css?v=${STYLE_VERSION}`,
    datasetKey: "xjkSidenavStyle",
  });
  releasePrepaintGuard(doc, stylesheet);

  const aside = doc.createElement("aside");
  aside.id = "xjkSharedSidenav";
  aside.className = "xjk-sidenav";
  aside.dataset.site = siteId;
  aside.dataset.networkPlacement = networkPlacement;
  aside.style.setProperty("--xjk-accent", safeCssColor(accent, "#d8d8d8"));
  aside.setAttribute("aria-label", `${label} navigation`);

  const netSites = networkSites(siteId);
  const networkOpen = persistNetwork && read(NETWORK_KEY) === "open";
  const networkMarkup = `<section class="xjk-sidenav-network${networkOpen ? " is-open" : ""}" aria-label="xjk network">
      <button class="xjk-sidenav-item" data-xjk-nettoggle type="button" aria-expanded="${String(networkOpen)}" title="${networkOpen ? "Hide" : "Show"} xjk network">
        <span class="xjk-sidenav-node">${icon("network")}</span>
        <span class="xjk-sidenav-label">xjk network</span>
        <svg class="xjk-sidenav-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.chevron}</svg>
      </button>
      <div class="xjk-sidenav-drawer">
        <div class="xjk-sidenav-netlist">
          ${netSites.map((entry) => `<a class="xjk-sidenav-netlink" style="--site-accent: ${escapeAttribute(safeCssColor(entry.accent))}" href="https://${escapeAttribute(entry.host)}/" data-xjk-site-link="${escapeAttribute(entry.id)}" title="${escapeAttribute(entry.summary || entry.host)}"><span class="xjk-sidenav-netnode" aria-hidden="true"></span><span class="xjk-sidenav-label">${escapeHtml(entry.label)}</span></a>`).join("")}
        </div>
      </div>
    </section>`;
  const collapseMarkup = `<button class="xjk-sidenav-collapse" type="button" aria-label="Collapse sidebar">
      ${icon("collapse")}
      <span class="xjk-sidenav-label">Collapse</span>
    </button>`;

  const adminEntries = adminSites();
  const adminMarkup = adminEntries.length
    ? `<nav class="xjk-sidenav-nav xjk-sidenav-admin" aria-label="admin" data-xjk-admin-section hidden>
      <p class="xjk-sidenav-eyebrow">Admin</p>
      ${adminEntries.map((entry) => `<a class="xjk-sidenav-item${entry.id === siteId ? " is-active" : ""}" data-xjk-site-link="${escapeAttribute(entry.id)}" href="https://${escapeAttribute(entry.host)}/" title="${escapeAttribute(entry.summary || entry.host)}"><span class="xjk-sidenav-node">${icon(ADMIN_ICON_BY_ID[entry.id] || "gauge")}</span><span class="xjk-sidenav-label">${escapeHtml(entry.label)}</span></a>`).join("")}
    </nav>`
    : "";

  globalThis.XjkSafeHtml.set(
    aside,
    `
    <span class="xjk-sidenav-line" aria-hidden="true"></span>
    ${networkPlacement === "top" ? networkMarkup : ""}
    ${
      sections.length
        ? `<nav class="xjk-sidenav-nav" aria-label="${escapeAttribute(label)} sections">
      <p class="xjk-sidenav-eyebrow">Sections</p>
      ${sections.map((item, index) => renderItem(item, index, doc.location || globalThis.location)).join("")}
    </nav>`
        : ""
    }
    ${adminMarkup}
    <div class="xjk-sidenav-bottom">
      ${networkPlacement === "bottom" ? networkMarkup : ""}
      ${collapseMarkup}
    </div>`
  );

  const mobileToggle = doc.createElement("button");
  mobileToggle.type = "button";
  mobileToggle.className = "xjk-sidenav-mobile-toggle";
  mobileToggle.setAttribute("aria-controls", aside.id);
  mobileToggle.setAttribute("aria-expanded", "false");
  mobileToggle.setAttribute("aria-label", "Open navigation");
  globalThis.XjkSafeHtml.set(mobileToggle, icon("network"));

  const mobileBackdrop = doc.createElement("button");
  mobileBackdrop.type = "button";
  mobileBackdrop.className = "xjk-sidenav-mobile-backdrop";
  mobileBackdrop.setAttribute("aria-label", "Close navigation");
  mobileBackdrop.tabIndex = -1;

  doc.body.append(aside, mobileBackdrop, mobileToggle);
  applySiteLinks(aside);

  const mobileViewport = doc.defaultView?.matchMedia?.("(max-width: 880px)");
  const syncMobileAccessibility = () => {
    const hidden = Boolean(mobileViewport?.matches) && root.dataset.xjkSidenavMobile !== "open";
    aside.toggleAttribute("inert", hidden);
    aside.toggleAttribute("aria-hidden", hidden);
  };
  const setMobileOpen = (open) => {
    root.dataset.xjkSidenavMobile = open ? "open" : "closed";
    mobileToggle.setAttribute("aria-expanded", String(open));
    mobileToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    syncMobileAccessibility();
  };
  mobileViewport?.addEventListener?.("change", syncMobileAccessibility);
  root.addEventListener("xjk:chrome-hide", () => setMobileOpen(false));
  setMobileOpen(false);
  mobileToggle.addEventListener("click", () => {
    setMobileOpen(root.dataset.xjkSidenavMobile !== "open");
  });
  mobileBackdrop.addEventListener("click", () => setMobileOpen(false));
  aside.addEventListener("click", (event) => {
    if (event.target.closest("a[href]")) setMobileOpen(false);
  });
  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root.dataset.xjkSidenavMobile === "open") {
      setMobileOpen(false);
      mobileToggle.focus();
    }
  });

  const collapseButton = aside.querySelector(".xjk-sidenav-collapse");
  const syncCollapse = () => {
    const collapsed = root.dataset.xjkSidenav === "collapsed";
    collapseButton.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    collapseButton.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
    collapseButton.querySelector(".xjk-sidenav-label").textContent = collapsed ? "" : "Collapse";
  };
  collapseButton.addEventListener("click", () => {
    const next = root.dataset.xjkSidenav === "collapsed" ? "expanded" : "collapsed";
    root.dataset.xjkSidenav = next;
    if (persistMode) write(MODE_KEY, next);
    syncCollapse();
  });
  syncCollapse();

  const adminSection = aside.querySelector("[data-xjk-admin-section]");
  if (adminSection) {
    hasAdminAccess().then((allowed) => {
      if (allowed) adminSection.hidden = false;
    });
  }

  const network = aside.querySelector(".xjk-sidenav-network");
  const netToggle = aside.querySelector("[data-xjk-nettoggle]");
  netToggle.addEventListener("click", () => {
    const open = !network.classList.contains("is-open");
    network.classList.toggle("is-open", open);
    netToggle.setAttribute("aria-expanded", String(open));
    netToggle.title = open ? "Hide xjk network" : "Show xjk network";
    if (persistNetwork) write(NETWORK_KEY, open ? "open" : "closed");
  });

  const itemEls = [...aside.querySelectorAll("[data-xjk-item]")];
  itemEls.forEach((el) => {
    const item = sections[Number(el.dataset.xjkItem)];
    if (!item) return;

    if (item.tab) {
      const target = doc.querySelector(item.tab);
      if (target) {
        const sync = () => el.classList.toggle("is-active", target.classList.contains("is-active"));
        new MutationObserver(sync).observe(target, { attributes: true, attributeFilter: ["class"] });
        sync();
      }
      el.addEventListener("click", () => {
        doc.querySelector(item.tab)?.click();
      });
      return;
    }

    if (item.activeHash) {
      const syncHash = () => {
        const current = globalThis.location.hash || "#/";
        const exact = current === item.activeHash;
        const nested = item.activeHash !== "#/" && current.startsWith(`${item.activeHash}/`);
        el.classList.toggle("is-active", exact || nested);
      };
      globalThis.addEventListener("hashchange", syncHash);
      syncHash();
    }

    if (item.focus) {
      el.addEventListener("click", () => {
        const target = doc.querySelector(item.focus);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        target?.focus({ preventScroll: true });
      });
      return;
    }

    if (item.scroll) {
      el.addEventListener("click", () => {
        doc.querySelector(item.scroll)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  });

  return aside;
}
