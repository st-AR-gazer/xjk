import "/shared/xjk-core/safe-html.js?v=2";
import { doLogout } from "./actions.js?v=2";
import { SIMILARITY_UI_REFRESH_EVENT } from "./admin-events.js?v=2";
import { api } from "./api.js?v=2";
import { onClick } from "./click-handler.js?v=2";
import { DEFAULT_DRAWER_WIDTH } from "./constants.js?v=2";
import { loadCampaignCatalog, loadDashboard } from "./data-loaders.js?v=2";
import {
  clampDrawerWidth,
  loadStoredDrawerWidth,
  onPointerMove,
  saveDrawerWidth,
  startDrawerResize,
  stopDrawerResize,
} from "./drawer-size.js?v=2";
import { onFocusIn, onFocusOut, onInput, onSubmit } from "./form-events.js?v=2";
import { isRequestTimeoutError, isTransientGatewayError } from "./request-errors.js?v=2";
import { renderSession, renderSignedOut } from "./session.js?v=2";
import { rerenderSimilarityBackfillSurfaces } from "./similarity-progress.js?v=2";
import { isSimilarityBackfillEffectivelyRunning, loadNamingSimilarityBackfillStatus } from "./similarity-scope.js?v=2";
import { closeDrawer } from "./drawer-controller.js?v=2";
import { el, state } from "./state.js?v=2";
import { loading } from "./ui.js?v=2";
import { ensureLoaded, poll, renderLayout, renderWorkspaceLoadError, syncHash } from "./workspaces.js?v=2";

export function startAdmin() {
  const initialize = () => {
    cacheEls();
    bindEvents();
    syncHash(true);
    boot().catch((error) => {
      if (!isRequestTimeoutError(error)) console.error(error);
      renderWorkspaceLoadError(state.ws || "dashboard", error);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
    return;
  }
  initialize();
}

function cacheEls() {
  el.healthPill = document.getElementById("healthPill");
  el.healthSummary = document.getElementById("healthSummary");
  el.statUser = document.getElementById("statUser");
  el.statRunning = document.getElementById("statRunning");
  el.statAlerts = document.getElementById("statAlerts");
  el.statUpdated = document.getElementById("statUpdated");
  el.sidebarSession = document.getElementById("sidebarSession");
  el.logoutBtn = document.getElementById("logoutBtn");
  el.navClubCount = document.getElementById("navClubCount");
  el.navJobsRunning = document.getElementById("navJobsRunning");
  el.wsDashboard = document.getElementById("wsDashboard");
  el.wsClubs = document.getElementById("wsClubs");
  el.wsMaps = document.getElementById("wsMaps");
  el.wsJobs = document.getElementById("wsJobs");
  el.wsActivity = document.getElementById("wsActivity");
  el.wsApi = document.getElementById("wsApi");
  el.wsSettings = document.getElementById("wsSettings");
  el.drawer = document.getElementById("detailDrawer");
  el.drawerBody = document.getElementById("drawerBody");
  el.drawerTitle = document.getElementById("drawerTitle");
  el.drawerSubtitle = document.getElementById("drawerSubtitle");
  el.drawerKicker = document.getElementById("drawerKicker");
  el.drawerClose = document.getElementById("drawerCloseBtn");
  el.drawerScrim = document.getElementById("drawerScrim");
  el.drawerResize = document.getElementById("drawerResizeHandle");
  el.toastBox = document.getElementById("toastContainer");
  state.drawerUi.width = loadStoredDrawerWidth();
  el.drawer?.style.setProperty("--drawer-width", `${state.drawerUi.width}px`);
}

function bindEvents() {
  window.addEventListener("hashchange", () => syncHash(false));
  window.addEventListener("resize", () => {
    state.drawerUi.width = clampDrawerWidth(state.drawerUi.width);
    el.drawer?.style.setProperty("--drawer-width", `${state.drawerUi.width}px`);
  });
  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("change", onInput);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", stopDrawerResize);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.drawer.open) {
      e.preventDefault();
      closeDrawer();
    }
  });
  document.addEventListener(SIMILARITY_UI_REFRESH_EVENT, rerenderSimilarityBackfillSurfaces);
  el.logoutBtn?.addEventListener("click", doLogout);
  el.drawerClose?.addEventListener("click", closeDrawer);
  el.drawerScrim?.addEventListener("click", closeDrawer);
  el.drawerResize?.addEventListener("pointerdown", startDrawerResize);
  el.drawerResize?.addEventListener("dblclick", () => {
    state.drawerUi.width = clampDrawerWidth(DEFAULT_DRAWER_WIDTH);
    el.drawer?.style.setProperty("--drawer-width", `${state.drawerUi.width}px`);
    saveDrawerWidth(state.drawerUi.width);
  });
  setInterval(poll, 5000);
  setInterval(() => {
    if (!state.auth?.authenticated) return;
    if (!isSimilarityBackfillEffectivelyRunning()) return;
    if (state.busy.has("naming-similarity")) return;
    loadNamingSimilarityBackfillStatus().catch((error) => {
      if (isTransientGatewayError(error)) return;
      console.error(error);
    });
  }, 1000);
}

async function boot() {
  showLoadingAll();
  await loadAuth();
  renderLayout();
  if (!state.auth?.authenticated) {
    renderSignedOut();
    return;
  }

  const campaignCatalogRequest = loadCampaignCatalog().catch(console.error);

  if (state.ws === "dashboard") {
    await loadDashboard();
    schedulePrefetch();
    void campaignCatalogRequest;
    return;
  }

  const dashboardPromise = loadDashboard().catch((err) => {
    if (!isRequestTimeoutError(err)) console.error(err);
  });

  await ensureLoaded(state.ws, true);
  schedulePrefetch();
  void campaignCatalogRequest;
  void dashboardPromise;
}

let prefetchStarted = false;

function schedulePrefetch() {
  if (prefetchStarted) return;
  if (!state.auth?.authenticated) return;
  prefetchStarted = true;
  const kick = () => {
    prefetchWorkspaces().catch(console.error);
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(kick, { timeout: 1500 });
    return;
  }
  window.setTimeout(kick, 450);
}

async function prefetchWorkspaces() {
  const order = ["jobs", "maps", "activity", "settings", "api"];
  for (const ws of order) {
    if (!state.auth?.authenticated) return;
    if (ws === state.ws) continue;
    try {
      await ensureLoaded(ws);
    } catch {}
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
}

function showLoadingAll() {
  globalThis.XjkSafeHtml.set(el.wsDashboard, loading("Loading dashboard..."));
  globalThis.XjkSafeHtml.set(el.wsClubs, loading("Will load when opened."));
  globalThis.XjkSafeHtml.set(el.wsMaps, loading("Will load when opened."));
  globalThis.XjkSafeHtml.set(el.wsJobs, loading("Will load when opened."));
  globalThis.XjkSafeHtml.set(el.wsActivity, loading("Will load when opened."));
  globalThis.XjkSafeHtml.set(el.wsApi, loading("Will load when opened."));
  globalThis.XjkSafeHtml.set(el.wsSettings, loading("Will load when opened."));
}

async function loadAuth() {
  state.auth = await api("/api/v1/admin/auth/status");
  renderSession();
}
