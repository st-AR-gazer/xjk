(function bootXjkAccountWidget() {
  if (window.__xjkAccountWidgetLoaded) return;
  window.__xjkAccountWidgetLoaded = true;

  const siteReady = window.XjkSite
    ? Promise.resolve(window.XjkSite)
    : import("/shared/xjk-core/site-runtime.js").then((module) => module.XjkSite || window.XjkSite || module);
  const ready = Promise.all([
    siteReady,
    import("/shared/xjk-core/dom-utils.js"),
    import("/shared/xjk-core/safe-html.js?v=2"),
  ]);

  ready
    .then(([xjkSite, domUtils]) => initXjkAccountWidget(xjkSite, domUtils, globalThis.XjkSafeHtml))
    .catch((error) => {
      console.warn("xjk account widget could not load xjk-core", error);
    });
})();

function ensureAccountWidgetStylesheet(ensureStylesheetLink, doc = document) {
  const selector = 'link[data-xjk-account-widget-style], link[href*="/shared/xjk-core/account-widget.css"]';
  const styleVersion = "2";
  const link = ensureStylesheetLink(doc, {
    selector,
    href: `/shared/xjk-core/account-widget.css?v=${styleVersion}`,
    datasetKey: "xjkAccountWidgetStyle",
  });
  return link;
}

function revealAccountWidgetWhenStyled(root, stylesheet, onStylesheetReady) {
  onStylesheetReady(stylesheet, {
    document,
    sentinelTarget: root,
    sentinelProperty: "--xjk-account-widget-button-size",
    onReady: () => root.style.removeProperty("visibility"),
  });
}

function renderAccountIcon(name) {
  const icons = {
    profile: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="3.5"></circle>
        <path d="M5 20a7 7 0 0 1 14 0"></path>
      </svg>
    `,
    chevronRight: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m9 6 6 6-6 6"></path>
      </svg>
    `,
    settings: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3v3"></path>
        <path d="M12 18v3"></path>
        <path d="M3 12h3"></path>
        <path d="M18 12h3"></path>
        <path d="m5.64 5.64 2.12 2.12"></path>
        <path d="m16.24 16.24 2.12 2.12"></path>
        <path d="m18.36 5.64-2.12 2.12"></path>
        <path d="m7.76 16.24-2.12 2.12"></path>
        <circle cx="12" cy="12" r="3.25"></circle>
      </svg>
    `,
    home: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m4 11 8-6 8 6"></path>
        <path d="M6.5 10.5V20h11V10.5"></path>
      </svg>
    `,
    learn: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h12.5v15H7a2.5 2.5 0 0 0-2.5 2.5z"></path>
        <path d="M7 4a2.5 2.5 0 0 0-2.5 2.5V20"></path>
      </svg>
    `,
    console: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="7" height="7" rx="1.5"></rect>
        <rect x="13" y="4" width="7" height="7" rx="1.5"></rect>
        <rect x="4" y="13" width="7" height="7" rx="1.5"></rect>
        <rect x="13" y="13" width="7" height="7" rx="1.5"></rect>
      </svg>
    `,
    altered: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 4 4.5 8 12 12 19.5 8 12 4Z"></path>
        <path d="M4.5 12 12 16l7.5-4"></path>
        <path d="M4.5 16 12 20l7.5-4"></path>
      </svg>
    `,
    trackers: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 12h4l2.5-5 3 10 2.5-5H20"></path>
      </svg>
    `,
    tools: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m14.5 6.5 3 3"></path>
        <path d="m5 19 7.5-7.5 3 3L8 22H5z"></path>
        <path d="M13 5.5a4 4 0 0 0-4.7 5.13L4.5 14.4"></path>
      </svg>
    `,
    plugins: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 9.5V5.75a1.75 1.75 0 1 1 3.5 0V9.5"></path>
        <path d="M14.5 9.5V7.75a1.75 1.75 0 1 1 3.5 0V12"></path>
        <path d="M9 9.5H6.75a1.75 1.75 0 1 0 0 3.5H9"></path>
        <path d="M9 9.5h5.5a3.5 3.5 0 0 1 0 7H9a3.5 3.5 0 1 1 0-7Z"></path>
      </svg>
    `,
    archive: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="4" y="5" width="16" height="4" rx="1.5"></rect>
        <path d="M6 9.5V19h12V9.5"></path>
        <path d="M10 13h4"></path>
      </svg>
    `,
    aggregator: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="6" cy="12" r="2"></circle>
        <circle cx="18" cy="6" r="2"></circle>
        <circle cx="18" cy="18" r="2"></circle>
        <path d="M8 12h6"></path>
        <path d="M15.5 7.5 8 12"></path>
        <path d="M15.5 16.5 8 12"></path>
      </svg>
    `,
    dash: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 19V9"></path>
        <path d="M12 19V5"></path>
        <path d="M19 19v-7"></path>
      </svg>
    `,
    login: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M10 17 15 12 10 7"></path>
        <path d="M4 12h10"></path>
        <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"></path>
      </svg>
    `,
    logout: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14 17 19 12 14 7"></path>
        <path d="M9 12h10"></path>
        <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"></path>
      </svg>
    `,
  };
  return icons[name] || icons.profile;
}

function initXjkAccountWidget(xjkSite, domUtils, safeHtml = globalThis.XjkSafeHtml) {
  const { ensureStylesheetLink, escapeAttribute, escapeHtml, onStylesheetReady, safeNavigationHref } = domUtils;
  const context = xjkSite.getRuntimeContext(window.location);
  const hostContext = xjkSite.getSiteHostContext?.(window.location);
  const host = context.hostname;
  const pathname = context.pathname || "/";
  const isLocalSubdomainMode = context.isLocalSubdomain;
  const localPathOrigin = context.localPathOrigin;
  const widgetPreviewMode = new URLSearchParams(window.location.search).get("xjkAccountWidgetPreview") === "open";
  const dockedSlot =
    document.querySelector('[data-xjk-global-topbar] [data-xjk-account-widget-slot="topbar"]') ||
    document.querySelector("[data-xjk-account-widget-slot]");
  const dockedSlotMode = dockedSlot?.getAttribute("data-xjk-account-widget-slot") || "";
  const isDocked = Boolean(dockedSlot);
  const isTopbarDock = dockedSlotMode === "topbar";
  const rootOrigin = new URL(xjkSite.resolveSiteHref("xjk", { location: window.location })).origin;
  const serviceLinks = xjkSite.createSiteLinkMap(
    [
      "xjk",
      "account",
      "admin",
      "learn",
      "console",
      "altered",
      "trackers",
      "tools",
      "plugins",
      "archive",
      "aggregator",
      "dash",
    ],
    { location: window.location }
  );
  serviceLinks.home = serviceLinks.xjk;

  const currentSite = {
    sessionUrl: "/api/v1/account/session",
    logoutUrl: "/auth/logout",
  };

  function makeAbsolute(url) {
    const text = String(url || "").trim();
    if (!text) return "";
    if (/^https?:\/\//i.test(text)) return text;
    if (text.startsWith("/")) return `${window.location.origin}${text}`;
    return text;
  }

  function localPathPrefixForHost() {
    return hostContext?.hostname === host ? hostContext.localPathPrefix || "" : "";
  }

  function currentReturnToUrl() {
    if (!isLocalSubdomainMode) return window.location.href;
    const prefix = localPathPrefixForHost();
    const nextPath = `${prefix}${pathname === "/" && prefix ? "/" : pathname}`.replace(/\/{2,}/g, "/");
    return `${localPathOrigin}${nextPath || "/"}${window.location.search || ""}${window.location.hash || ""}`;
  }

  function fallbackLoginUrl() {
    const authOrigin = isLocalSubdomainMode ? localPathOrigin : rootOrigin;
    return `${authOrigin}/auth/ubisoft/login?return_to=${encodeURIComponent(currentReturnToUrl())}`;
  }

  function loginUrlForCurrentPage(rawLoginUrl) {
    const fallback = fallbackLoginUrl();
    try {
      const source = isLocalSubdomainMode ? fallback : makeAbsolute(rawLoginUrl) || fallback;
      const url = new URL(
        safeNavigationHref(source, {
          base: window.location.origin,
          fallback,
        })
      );
      url.searchParams.set("return_to", currentReturnToUrl());
      return url.toString();
    } catch {
      return fallback;
    }
  }

  function normalizePayload(payload) {
    const authenticated = Boolean(payload?.authenticated || payload?.session);
    const rawUser = payload?.session?.user || payload?.user || null;
    const roles = Array.isArray(rawUser?.roles) ? rawUser.roles : [];
    const user = rawUser
      ? {
          displayName: rawUser.displayName || rawUser.username || rawUser.accountId || "xjk account",
          username: rawUser.username || null,
          xjkAccountId: rawUser.xjkAccountId || null,
          ubisoftAccountId: rawUser.ubisoftAccountId || rawUser.accountId || null,
          subject: rawUser.subject || null,
          roles,
          admin: xjkSite.userHasAdminRole(rawUser),
        }
      : null;
    return {
      authenticated,
      user,
      loginUrl: loginUrlForCurrentPage(payload?.loginUrl),
    };
  }

  const stylesheet = ensureAccountWidgetStylesheet(ensureStylesheetLink);

  const panelId = "xjkAccountWidgetPanel";
  const root = document.createElement("div");
  root.style.visibility = "hidden";
  root.className = `xjk-account-widget${isDocked ? " xjk-account-widget--docked" : ""}${isTopbarDock ? " xjk-account-widget--topbar" : ""}`;
  safeHtml.set(
    root,
    isDocked && !isTopbarDock
      ? `
        <button class="xjk-account-widget__mini-profile" type="button" data-xjk-trigger aria-expanded="false" aria-controls="${panelId}" aria-label="Toggle xjk account options">
          <span class="xjk-account-widget__avatar">${renderAccountIcon("profile")}</span>
          <span class="xjk-account-widget__copy">
            <strong data-xjk-name>Account</strong>
            <small data-xjk-meta>Not signed in</small>
          </span>
          <span class="xjk-account-widget__chevron">${renderAccountIcon("chevronRight")}</span>
        </button>
        <div class="xjk-account-widget__panel" id="${panelId}" hidden></div>
      `
      : `
        <button class="xjk-account-widget__button" type="button" data-xjk-trigger aria-expanded="false" aria-controls="${panelId}" aria-label="Toggle xjk account options">
          <span class="xjk-account-widget__avatar">${renderAccountIcon("profile")}</span>
        </button>
        <div class="xjk-account-widget__panel" id="${panelId}" hidden></div>
      `
  );

  if (dockedSlot) dockedSlot.appendChild(root);
  else document.body.appendChild(root);
  revealAccountWidgetWhenStyled(root, stylesheet, onStylesheetReady);

  const trigger = root.querySelector("[data-xjk-trigger]");
  const panel = root.querySelector(".xjk-account-widget__panel");
  const triggerName = root.querySelector("[data-xjk-name]");
  const triggerMeta = root.querySelector("[data-xjk-meta]");

  function updateTrigger(name, meta) {
    if (triggerName) triggerName.textContent = name;
    if (triggerMeta) triggerMeta.textContent = meta;
  }

  function renderPanelLink(label, href, icon, meta) {
    return `
      <a class="xjk-account-widget__item" href="${escapeAttribute(href)}">
        <span class="xjk-account-widget__item-icon">${renderAccountIcon(icon)}</span>
        <span class="xjk-account-widget__item-copy">
          <strong>${escapeHtml(label)}</strong>
          ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
        </span>
        <span class="xjk-account-widget__item-arrow">${renderAccountIcon("chevronRight")}</span>
      </a>
    `;
  }

  function renderActionButton(label, action, icon, meta) {
    return `
      <button class="xjk-account-widget__item" type="button" data-xjk-action="${escapeAttribute(action)}">
        <span class="xjk-account-widget__item-icon">${renderAccountIcon(icon)}</span>
        <span class="xjk-account-widget__item-copy">
          <strong>${escapeHtml(label)}</strong>
          ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
        </span>
        <span class="xjk-account-widget__item-arrow"></span>
      </button>
    `;
  }

  function closePanel({ restoreFocus = false } = {}) {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  function openPanel() {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  }

  function togglePanel() {
    if (panel.hidden) openPanel();
    else closePanel();
  }

  function setPanelError(message = "") {
    const errorNode = panel.querySelector("[data-xjk-account-error]");
    if (errorNode) errorNode.textContent = message;
  }

  async function logoutFromWidget(button) {
    button.disabled = true;
    try {
      setPanelError();
      const response = await fetch(currentSite.logoutUrl, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: "{}",
      });
      if (!response.ok) throw new Error(`Logout failed with status ${response.status}.`);
      closePanel();
      await refreshState();
    } catch {
      setPanelError("Unable to log out. Please try again.");
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  function bindPanelEvents() {
    const logoutButton = panel.querySelector('[data-xjk-action="logout"]');
    logoutButton?.addEventListener("click", () => {
      logoutFromWidget(logoutButton).catch(() => {
        setPanelError("Unable to log out. Please try again.");
        if (logoutButton.isConnected) logoutButton.disabled = false;
      });
    });
  }

  function renderSignedOut(loginUrl) {
    updateTrigger("Log in", "Not signed in");
    safeHtml.set(
      panel,
      `
      <div class="xjk-account-widget__group">
        ${renderPanelLink("Log in", loginUrl, "login")}
        ${renderPanelLink("Settings", serviceLinks.account, "settings")}
      </div>
    `
    );
  }

  function renderSignedIn(payload) {
    const user = payload.user || {};
    const meta = user.username ? `@${user.username}` : "Shared account";

    updateTrigger(user.displayName || "xjk account", meta);
    safeHtml.set(
      panel,
      `
      <div class="xjk-account-widget__group">
        ${user.admin ? renderPanelLink("Admin", serviceLinks.admin, "settings", "Map layout") : ""}
        ${renderPanelLink("Settings", serviceLinks.account, "settings")}
        ${renderActionButton("Log out", "logout", "logout")}
        <p class="xjk-account-widget__error" data-xjk-account-error role="status" aria-live="polite"></p>
      </div>
    `
    );

    bindPanelEvents();
  }

  async function refreshState() {
    try {
      const response = await fetch(currentSite.sessionUrl, {
        credentials: "include",
      });
      const payload = normalizePayload(await response.json());
      if (!payload.authenticated || !payload.user) {
        renderSignedOut(payload.loginUrl || fallbackLoginUrl());
        if (widgetPreviewMode) openPanel();
        return;
      }
      renderSignedIn(payload);
      if (widgetPreviewMode) openPanel();
    } catch {
      renderSignedOut(fallbackLoginUrl());
      if (widgetPreviewMode) openPanel();
    }
  }

  trigger.addEventListener("click", togglePanel);

  document.addEventListener("click", (event) => {
    if (root.contains(event.target)) return;
    closePanel();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || panel.hidden) return;
    event.preventDefault();
    closePanel({ restoreFocus: true });
  });

  renderSignedOut(fallbackLoginUrl());
  refreshState();
}
