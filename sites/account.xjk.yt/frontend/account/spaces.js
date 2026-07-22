import "/shared/xjk-core/safe-html.js?v=2";
import {
  REDESIGN_SCOPES,
  SITE_LINES,
  getMapSites,
  getNavigationSites,
  resolveSiteHref,
} from "/shared/xjk-core/site-runtime.js";
import { escapeAttribute, escapeHtml, uniqueSites } from "/shared/xjk-core/dom-utils.js";

const ACCOUNT_VIEW_STORAGE_KEY = "xjk.account.lastView";

const TAB_ALIASES = Object.freeze({
  account: "overview",
  identity: "overview",
  profile: "overview",
  sessions: "overview",
  privacy: "overview",
  data: "overview",
  preferences: "appearance",
});
const VALID_ACCOUNT_TABS = new Set(["overview", "appearance", "spaces"]);

const OVERVIEW_SPACE_COPY = Object.freeze({
  learn: "Guides and references",
  console: "Console companions",
  altered: "Image & media experiments",
});
const OVERVIEW_SPACE_COLORS = Object.freeze({
  learn: "#e5e7eb",
  console: "#a3e635",
  altered: "#22d3ee",
});

const registrySites = uniqueSites([
  ...getMapSites({ includeInternal: false }),
  ...getNavigationSites({ includeHidden: true, includeInternal: false }),
]);
const registryById = new Map(registrySites.map((site) => [site.id, site]));
const connectedSites = getMapSites({ includeInternal: false })
  .filter((site) => site.id !== "xjk" && site.id !== "account" && site.hub?.visible)
  .sort((left, right) => Number(left.hub?.order || 999) - Number(right.hub?.order || 999));

function resolveAccountSpaceHref(siteOrId, location = window.location) {
  const id = typeof siteOrId === "string" ? siteOrId : siteOrId?.id;
  return id ? resolveSiteHref(id, { location }) : "";
}

function createSpacesFeature({ state, elements }) {
  state.activeSpace = state.activeSpace || connectedSites[0]?.id || "learn";

  function normalizeViewState(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const requestedTab = String(source.tab || "").trim();
    const aliasedTab = TAB_ALIASES[requestedTab] || requestedTab;
    const tab = VALID_ACCOUNT_TABS.has(aliasedTab) ? aliasedTab : "overview";
    const space = registryById.has(String(source.space || "").trim())
      ? String(source.space || "").trim()
      : state.activeSpace;
    return { tab, space };
  }

  function buildViewHash(view) {
    const safe = normalizeViewState(view);
    return safe.tab === "spaces" ? `#spaces/${safe.space}` : `#${safe.tab}`;
  }

  function parseLocationView() {
    const raw = String(window.location.hash || "")
      .replace(/^#/, "")
      .trim();
    if (!raw) return null;
    const [tabPart, spacePart] = raw.split("/");
    return normalizeViewState({ tab: tabPart, space: spacePart });
  }

  function readStoredView() {
    try {
      const raw = window.sessionStorage.getItem(ACCOUNT_VIEW_STORAGE_KEY);
      return raw ? normalizeViewState(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  function writeStoredView(view) {
    try {
      window.sessionStorage.setItem(ACCOUNT_VIEW_STORAGE_KEY, JSON.stringify(normalizeViewState(view)));
    } catch {
      // Session storage can be unavailable in private or embedded contexts.
    }
  }

  function lineForSite(site) {
    return SITE_LINES[site?.map?.line || site?.line] || SITE_LINES.core;
  }

  function hrefForSite(siteOrId) {
    return resolveAccountSpaceHref(siteOrId, window.location);
  }

  function accountIcon(name) {
    const icons = {
      profile:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"></circle><path d="M5 20a7 7 0 0 1 14 0"></path></svg>',
      settings:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3"></path><path d="m5.64 5.64 2.12 2.12M16.24 16.24l2.12 2.12M18.36 5.64l-2.12 2.12M7.76 16.24l-2.12 2.12"></path><circle cx="12" cy="12" r="3.25"></circle></svg>',
      home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m4 11 8-6 8 6"></path><path d="M6.5 10.5V20h11V10.5"></path></svg>',
      learn:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h12.5v15H7a2.5 2.5 0 0 0-2.5 2.5z"></path><path d="M7 4a2.5 2.5 0 0 0-2.5 2.5V20"></path></svg>',
      console:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"></rect><rect x="13" y="4" width="7" height="7" rx="1.5"></rect><rect x="4" y="13" width="7" height="7" rx="1.5"></rect><rect x="13" y="13" width="7" height="7" rx="1.5"></rect></svg>',
      altered:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 4.5 8 12 12 19.5 8 12 4Z"></path><path d="M4.5 12 12 16l7.5-4"></path><path d="M4.5 16 12 20l7.5-4"></path></svg>',
      tools:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 6.5 3 3"></path><path d="m5 19 7.5-7.5 3 3L8 22H5z"></path><path d="M13 5.5a4 4 0 0 0-4.7 5.13L4.5 14.4"></path></svg>',
      validifier:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12.5 11.2 15 16 9"></path><circle cx="12" cy="12" r="8"></circle></svg>',
      trackers:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h4l2.5-5 3 10 2.5-5H20"></path></svg>',
      plugins:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9.5V5.75a1.75 1.75 0 1 1 3.5 0V9.5"></path><path d="M14.5 9.5V7.75a1.75 1.75 0 1 1 3.5 0V12"></path><path d="M9 9.5H6.75a1.75 1.75 0 1 0 0 3.5H9"></path><path d="M9 9.5h5.5a3.5 3.5 0 0 1 0 7H9a3.5 3.5 0 1 1 0-7Z"></path></svg>',
      archive:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="4" rx="1.5"></rect><path d="M6 9.5V19h12V9.5"></path><path d="M10 13h4"></path></svg>',
      aggregator:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2"></circle><circle cx="18" cy="6" r="2"></circle><circle cx="18" cy="18" r="2"></circle><path d="M8 12h6"></path><path d="M15.5 7.5 8 12M15.5 16.5 8 12"></path></svg>',
      logout:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 17 19 12 14 7"></path><path d="M9 12h10"></path><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"></path></svg>',
      login:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17 15 12 10 7"></path><path d="M4 12h10"></path><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"></path></svg>',
      chevron:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"></path></svg>',
    };
    return (
      icons[name] ||
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"></circle><path d="M12 5v14M5 12h14"></path></svg>'
    );
  }

  function metaForSite(site) {
    const line = lineForSite(site);
    const excluded = site.redesign?.scope === REDESIGN_SCOPES.excluded;
    return {
      id: site.id,
      label: site.label || site.title || site.id,
      title: site.title || site.label || site.id,
      href: hrefForSite(site),
      color: site.accent || line.color || "#e5e7eb",
      lineLabel: line.label || site.line || "Core",
      description: OVERVIEW_SPACE_COPY[site.id] || site.summary || "Shared xjk space.",
      loginMode: "Shared xjk identity",
      settingsMode: excluded ? "Keeps its own visual system" : `${line.label || "xjk"} space settings`,
      roleMode: excluded ? "App-owned roles and visuals" : "Resolved inside the app",
      note: excluded
        ? `Shared auth only. ${site.label} keeps its own visual system.`
        : `Shared sign-in gets you into ${site.label}; app-specific controls stay with that space.`,
    };
  }

  function displayColorForSite(site, fallback = "#e5e7eb") {
    if (!site) return fallback;
    return OVERVIEW_SPACE_COLORS[site?.id] || metaForSite(site).color || fallback;
  }

  function setActiveTab(tabName) {
    const safeTab = VALID_ACCOUNT_TABS.has(tabName) ? tabName : "overview";
    state.activeTab = safeTab;
    elements.tabButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tabTarget === safeTab);
    });
    Object.entries(elements.panels).forEach(([name, panel]) => {
      panel?.classList.toggle("is-active", name === safeTab);
    });
  }

  function setActiveSpace(spaceName) {
    const safeSpace = connectedSites.some((site) => site.id === spaceName)
      ? spaceName
      : connectedSites[0]?.id || "learn";
    state.activeSpace = safeSpace;
    document.querySelectorAll("[data-space-pill], [data-space-card]").forEach((node) => {
      const nodeSpace = node.dataset.spacePill || node.dataset.spaceCard;
      node.classList.toggle("is-active", nodeSpace === safeSpace);
    });
    renderSpacePanel();
  }

  function applyViewState(nextView, options = {}) {
    const { historyMode = "replace" } = options;
    const normalized = normalizeViewState(nextView);
    const nextHash = buildViewHash(normalized);
    const currentHash = window.location.hash || "";

    setActiveTab(normalized.tab);
    setActiveSpace(normalized.space);
    writeStoredView(normalized);

    if (historyMode === "push") {
      if (currentHash !== nextHash) {
        window.history.pushState(normalized, "", `${window.location.pathname}${nextHash}`);
      } else {
        window.history.replaceState(normalized, "", `${window.location.pathname}${nextHash}`);
      }
    } else if (historyMode === "replace") {
      window.history.replaceState(normalized, "", `${window.location.pathname}${nextHash}`);
    }
  }

  function renderSpacePills() {
    globalThis.XjkSafeHtml.set(
      elements.spacePills,
      connectedSites
        .map((site) => {
          const meta = metaForSite(site);
          const color = displayColorForSite(site, meta.color);
          return `<button class="space-pill${site.id === state.activeSpace ? " is-active" : ""}" type="button" data-space-pill="${escapeAttribute(site.id)}" style="--space-color:${escapeAttribute(color)}">${escapeHtml(meta.label)}</button>`;
        })
        .join("")
    );
    elements.spacePills.querySelectorAll("[data-space-pill]").forEach((button) => {
      button.addEventListener("click", () => {
        applyViewState({ tab: "spaces", space: button.dataset.spacePill }, { historyMode: "push" });
      });
    });
  }

  function renderSpacePanel() {
    const site = registryById.get(state.activeSpace) || connectedSites[0];
    if (!site) return;
    const meta = metaForSite(site);
    elements.spacePanelTitle.textContent = `${meta.label} access`;
    elements.spacePanelMeta.textContent = "Shared sign-in, local space controls";
    elements.spaceSummaryTitle.textContent = meta.label;
    elements.spaceSummaryText.textContent = meta.description;
    elements.spaceLoginMode.textContent = meta.loginMode;
    elements.spaceSettingsMode.textContent = meta.settingsMode;
    elements.spaceRoleMode.textContent = meta.roleMode;
    elements.spaceNote.textContent = meta.note;
    elements.spaceRouteTitle.textContent = `${meta.label} access`;
    elements.spaceRouteText.textContent = "Shared identity is handled here. Opening the app is just the handoff.";
    elements.spaceOpenLink.href = meta.href;
    const displayColor = displayColorForSite(site, meta.color);
    elements.spaceSummaryCard?.style.setProperty("--space-color", displayColor);
    elements.spaceRouteCard?.style.setProperty("--space-color", displayColor);
    try {
      elements.spaceRouteHost.textContent = site.host || new URL(meta.href, window.location.origin).host || meta.href;
    } catch {
      elements.spaceRouteHost.textContent = site.host || meta.href || "-";
    }
    globalThis.XjkSafeHtml.set(elements.spaceSummaryIcon, accountIcon(site.id));
    elements.spaceSummaryIcon.style.setProperty("--space-color", displayColor);
    document.querySelectorAll("[data-space-pill], [data-space-card]").forEach((node) => {
      const nodeSpace = node.dataset.spacePill || node.dataset.spaceCard;
      node.classList.toggle("is-active", nodeSpace === state.activeSpace);
    });
  }

  function bindEvents() {
    elements.tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        applyViewState({ tab: button.dataset.tabTarget, space: state.activeSpace }, { historyMode: "push" });
      });
    });
    elements.jumpButtons.forEach((button) => {
      button.addEventListener("click", () => {
        applyViewState({ tab: button.dataset.jumpTab, space: state.activeSpace }, { historyMode: "push" });
      });
    });
    elements.spaceJumpAccountButton.addEventListener("click", () => {
      applyViewState({ tab: "account", space: state.activeSpace }, { historyMode: "push" });
    });
    window.addEventListener("popstate", (event) => {
      const fallbackView = parseLocationView() || readStoredView() || { tab: "overview", space: state.activeSpace };
      applyViewState(event.state || fallbackView, { historyMode: "none" });
    });
    window.addEventListener("hashchange", () => {
      const view = parseLocationView();
      if (view) applyViewState(view, { historyMode: "none" });
    });
  }

  return {
    applyViewState,
    bindEvents,
    buildViewHash,
    hrefForSite,
    parseLocationView,
    readStoredView,
    renderSpacePanel,
    renderSpacePills,
  };
}

export { connectedSites, createSpacesFeature, resolveAccountSpaceHref };
