import "../../../shared/xjk-core/safe-html.js?v=2";
import { createContentStore } from "./content-store.js";
import { renderLessonView, renderMapView } from "./render-lesson.js";
import { createRouter, navigateToLesson, navigateToView } from "./router.js";
import { createKnowledgeMap } from "./knowledge-map.js";
import { renderLibraryView } from "./library.js";
import { renderToolsView } from "./tools-view.js";
import { renderProfileView } from "./profile.js";
import { renderSettingsView } from "./settings.js";
import { renderAdminView } from "./admin.js";
import { fetchNadeoProfileStatus } from "./nadeo-profile.js";
import { fetchAdminSession } from "./admin-api.js";
import { fetchLearnAccountData, saveLearnAccountData, submitLearnSuggestion } from "./learn-account.js";
import {
  accountDataSnapshot,
  applySettings,
  applyAccountData,
  clearProgress,
  getActiveSlugFallback,
  getState,
  resetLocalState,
  setActiveSlug,
  setLessonNote,
  setState,
  state,
  toggleBookmark,
  toggleCompleted,
  updateSetting,
} from "./state.js";
import { copyText, escapeHtml } from "./utils.js";

const root = document.querySelector("#view-root");
const toast = document.querySelector("#toast");
const navItems = [...document.querySelectorAll("[data-nav]")];
const topbarTitle = document.querySelector("#topbar-title");
const AUTH_REFRESH_VIEWS = new Set(["lesson", "library", "profile", "admin"]);

let store = null;
let router = null;
let cleanupView = () => {};
let graph = null;
let adminSession = null;
let syncedAccountId = "";
let accountSyncTimer = 0;
let accountHydrating = false;

function isLoggedIn() {
  return Boolean(state.authenticated || adminSession?.authenticated);
}

function requireLogin(feature = "This feature") {
  if (isLoggedIn()) return true;
  showToast(`${feature} needs a Learn login`);
  navigateToView("profile");
  return false;
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function scheduleAccountSync() {
  if (!isLoggedIn() || accountHydrating) return;
  window.clearTimeout(accountSyncTimer);
  accountSyncTimer = window.setTimeout(() => {
    saveLearnAccountData(accountDataSnapshot()).catch((error) => {
      console.warn("[learn] account sync failed", error);
    });
  }, 450);
}

async function hydrateLearnAccountData(accountId = "") {
  if (!accountId || syncedAccountId === accountId) return;
  accountHydrating = true;
  try {
    const payload = await fetchLearnAccountData();
    if (payload?.data) applyAccountData(payload.data);
    syncedAccountId = accountId;
    accountHydrating = false;
    if (AUTH_REFRESH_VIEWS.has(state.activeView)) router?.refresh();
  } catch (error) {
    accountHydrating = false;
    console.warn("[learn] account data hydrate failed", error);
  }
}

async function saveLessonNote(slug = "", text = "") {
  const note = setLessonNote(slug, text);
  scheduleAccountSync();
  return note;
}

async function submitImprovementSuggestion({ slug = "", title = "", text = "", context = "" } = {}) {
  return submitLearnSuggestion({ slug, title, text, context });
}

function destroyGraph() {
  if (graph) graph.destroy();
  graph = null;
}

function resetView() {
  cleanupView();
  cleanupView = () => {};
  destroyGraph();
}

function updateNav(view) {
  navItems.forEach((item) => {
    const active = item.dataset.nav === view || ((view === "lesson" || view === "map") && item.dataset.nav === "learn");
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
}

async function refreshUserAccountState() {
  const wasAuthenticated = state.authenticated;
  const previousRole = state.account?.role || "";
  try {
    adminSession = await fetchAdminSession();
  } catch {
    adminSession = null;
  }
  const nextAuthenticated = Boolean(adminSession?.authenticated);
  const nextAccount = adminSession?.account || null;
  setState({ authenticated: nextAuthenticated, account: nextAccount });
  if (nextAuthenticated && nextAccount?.id) {
    hydrateLearnAccountData(nextAccount.id);
  } else {
    syncedAccountId = "";
  }
  if (
    router &&
    (wasAuthenticated !== nextAuthenticated || previousRole !== (nextAccount?.role || "")) &&
    AUTH_REFRESH_VIEWS.has(state.activeView)
  ) {
    router.refresh();
  }
}

function routePathFor(route = {}, routeView = "", page = null) {
  if (routeView === "map") return "/";
  if (routeView === "lesson") return `/learn/${route.slug || page?.slug || ""}`.replace(/\/+$/, "");
  const view = route.view || routeView || "";
  const slug = route.slug ? `/${route.slug}` : "";
  const query = route.query?.toString?.();
  return `/${view}${slug}${query ? `?${query}` : ""}`;
}

function setPageTitle(title, currentPath = "") {
  document.title = title ? `${title} / learn.xjk.yt` : "learn.xjk.yt";
  if (topbarTitle) {
    const path = currentPath || "/";
    topbarTitle.textContent = path;
    topbarTitle.title = path;
  }
}

function syncMapModeButton() {
  const button = document.querySelector('[data-action="toggle-map-mode"]');
  if (!button || !graph) return;
  button.textContent = graph.getMode() === "3d" ? "View: 3D" : "View: 2D";
}

function hydrateKnowledgeMap(activeSlug = "") {
  const canvas = document.querySelector("#knowledge-canvas");
  if (!canvas) return;
  graph = createKnowledgeMap(canvas, {
    manifest: state.manifest,
    activeSlug,
    settings: state.settings,
    tooltip: document.querySelector("#graph-tooltip"),
    onSelect: navigateToLesson,
  });
  syncMapModeButton();
}

async function renderRoute(route) {
  if (!store) return;
  resetView();
  const manifest = state.manifest;
  const routeView =
    route.view === "map" || (route.view === "learn" && !route.slug)
      ? "map"
      : route.view === "learn"
        ? "lesson"
        : route.view;
  setState({ activeView: routeView, routeMode: route.mode || "hash" });
  if (root) root.dataset.activeView = routeView;
  updateNav(routeView);

  if (routeView === "map") {
    setState({ activePage: null, activeAst: [], activeSlug: "" });
    setPageTitle("Map", routePathFor(route, routeView));
    cleanupView = renderMapView({ root, manifest }) || (() => {});
    hydrateKnowledgeMap("");
    return;
  }

  if (routeView === "library") {
    setPageTitle("Library", routePathFor(route, routeView));
    cleanupView =
      renderLibraryView({
        root,
        state: getState(),
        store,
        route,
        navigate: navigateToLesson,
        navigateView: navigateToView,
        showToast,
        onAccountSync: scheduleAccountSync,
      }) || (() => {});
    return;
  }

  if (routeView === "tools") {
    setPageTitle("Tools", routePathFor(route, routeView));
    cleanupView =
      renderToolsView({
        root,
        state: getState(),
        store,
        route,
        navigate: navigateToLesson,
        navigateView: navigateToView,
        showToast,
      }) || (() => {});
    return;
  }

  if (routeView === "profile") {
    setPageTitle("Profile", routePathFor(route, routeView));
    cleanupView =
      renderProfileView({
        root,
        state: getState(),
        store,
        navigate: navigateToLesson,
        showToast,
      }) || (() => {});
    return;
  }

  if (routeView === "settings") {
    setPageTitle("Settings", routePathFor(route, routeView));
    cleanupView =
      renderSettingsView({
        root,
        state: getState(),
        showToast,
        onSetting: handleSettingChange,
      }) || (() => {});
    return;
  }

  if (routeView === "admin") {
    setPageTitle("Admin", routePathFor(route, routeView));
    cleanupView =
      renderAdminView({
        root,
        state: getState(),
        showToast,
      }) || (() => {});
    return;
  }

  const requestedSlug = route.slug || state.activeSlug || getActiveSlugFallback() || manifest.defaultSlug;
  const page = store.getPage(requestedSlug) || store.getPage(manifest.defaultSlug);
  const missing = Boolean(requestedSlug && !store.getPage(requestedSlug));
  const ast = await store.loadAst(page.slug);
  setActiveSlug(page.slug);
  scheduleAccountSync();
  setState({ activePage: page, activeAst: ast, activeView: "lesson" });
  setPageTitle(page.title, routePathFor(route, routeView, page));

  cleanupView =
    renderLessonView({
      root,
      page,
      ast,
      manifest,
      store,
      state: getState(),
      route,
      missingSlug: missing ? requestedSlug : "",
      navigate: navigateToLesson,
      navigateView: navigateToView,
      showToast,
      onSaveNote: saveLessonNote,
      onSubmitSuggestion: submitImprovementSuggestion,
    }) || (() => {});

  hydrateKnowledgeMap(page.slug);
}

function handleSettingChange(key, value) {
  const normalized = key === "tendrilIntensity" ? Number(value) : value;
  updateSetting(key, normalized);
  scheduleAccountSync();
  if (key === "graphLabels") graph?.setLabels(Boolean(value));
  if (key === "tendrilIntensity") graph?.setIntensity(Number(value));
  if (key === "motion") graph?.setReducedMotion(value === "reduced");
  showToast("Setting saved");
}

function handleGlobalClick(event) {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const action = actionTarget.dataset.action;

  if (action === "close-lesson-card") {
    navigateToView("map", "", { replace: true });
    return;
  }

  if (action === "toggle-complete") {
    if (!requireLogin("Progress tracking")) return;
    const completed = toggleCompleted(state.activeSlug);
    scheduleAccountSync();
    showToast(completed ? "Marked complete" : "Marked incomplete");
    router.refresh();
  }

  if (action === "toggle-bookmark") {
    if (!requireLogin("Bookmarks")) return;
    const added = toggleBookmark(state.activeSlug);
    scheduleAccountSync();
    showToast(added ? "Bookmarked" : "Bookmark removed");
    router.refresh();
  }

  if (action === "copy-link") {
    copyText(window.location.href).then(() => showToast("Link copied"));
  }

  if (action === "open-discord-preview") navigateToView("tools", "discord");
  if (action === "open-library") navigateToView("library");
  if (action === "random-topic") {
    const pages = state.manifest?.pages || [];
    const page = pages[Math.floor(Math.random() * pages.length)];
    if (page) navigateToLesson(page.slug);
  }

  if (action === "zoom-in") graph?.zoomBy(0.16);
  if (action === "zoom-out") graph?.zoomBy(-0.16);
  if (action === "reset-map" || action === "focus-active") graph?.focusActive();
  if (action === "toggle-map-mode" && graph) {
    const nextMode = graph.getMode() === "3d" ? "2d" : "3d";
    graph.setMode(nextMode);
    updateSetting("mapMode", nextMode);
    syncMapModeButton();
    showToast(nextMode === "3d" ? "Planet view" : "Flat map view");
  }
  if (action === "toggle-labels") {
    updateSetting("graphLabels", !state.settings.graphLabels);
    graph?.setLabels(state.settings.graphLabels);
    showToast(`Graph labels ${state.settings.graphLabels ? "on" : "off"}`);
  }

  if (action === "clear-progress") {
    if (!requireLogin("Progress tracking")) return;
    clearProgress();
    scheduleAccountSync();
    showToast("Progress cleared");
    router.refresh();
  }

  if (action === "reset-local-state") {
    resetLocalState();
    applySettings();
    showToast("Local Learn state reset");
    scheduleAccountSync();
    router.refresh();
  }
}

function handleGlobalInput(event) {
  const control = event.target.closest("[data-setting]");
  if (!control) return;
  const key = control.dataset.setting;
  if (key === "graphLabels") return;
  handleSettingChange(key, control.type === "checkbox" ? control.checked : control.value);
}

function handleGlobalChange(event) {
  const control = event.target.closest("[data-setting]");
  if (!control) return;
  const key = control.dataset.setting;
  if (key === "graphLabels") {
    handleSettingChange(key, control.checked);
  }
}

function setupChrome() {
  document.addEventListener("click", handleGlobalClick);
  document.addEventListener("input", handleGlobalInput);
  document.addEventListener("change", handleGlobalChange);
  window.addEventListener("learn:nadeoprofilechange", () => {
    refreshUserAccountState();
  });
}

async function init() {
  applySettings(state.settings);
  setupChrome();
  fetchNadeoProfileStatus()
    .catch(() => null)
    .finally(() => refreshUserAccountState());
  store = createContentStore({
    mock: new URLSearchParams(window.location.search).get("mock") === "1",
  });
  try {
    const manifest = await store.loadManifest();
    setState({ manifest });
    router = createRouter({ onRoute: renderRoute, defaultSlug: manifest.defaultSlug });
    router.start();
  } catch (error) {
    globalThis.XjkSafeHtml.set(
      root,
      `<section class="learn-error-panel"><p class="learn-eyebrow">learn.xjk.yt</p><h1>Content failed to load</h1><p>${escapeHtml(error.message || "Unknown static content error.")}</p></section>`
    );
    console.error(error);
  }
}

window.learnXjk = {
  get state() {
    return getState();
  },
};

init();
