import { shortcutLabel, uniqueById } from "../dom-utils.js";
import { resolveSiteHref } from "../site-runtime.js";
import { computeResults as rankResults, normalizeEntry, parseScope, saveRecent } from "./model.js";
import {
  collectLocalItems,
  createActionItems,
  createFallbackSites,
  createIntentItems,
  currentSiteFromLocation,
  loadIndexedItems,
} from "./sources.js";
import { createSearchView, ensureSearchStyles, installAutoTrigger } from "./view.js";

function createGlobalSearch() {
  ensureSearchStyles();
  installAutoTrigger();

  const currentSite = currentSiteFromLocation();
  const fallbackSites = createFallbackSites();
  const state = {
    staticItems: fallbackSites,
    localItems: [],
    actionItems: createActionItems(currentSite),
    registered: new Map(),
    providers: new Map(),
    providerResults: new Map(),
    providerController: null,
    providerTimer: null,
    results: [],
    resultButtons: [],
    selectedIndex: 0,
    lastTrigger: null,
    indexLoaded: false,
    indexCount: fallbackSites.length,
  };

  function catalogItems() {
    return uniqueById([
      ...state.staticItems,
      ...state.localItems,
      ...state.actionItems,
      ...[...state.registered.values()].flat(),
      ...[...state.providerResults.values()].flat(),
    ]);
  }

  function computeResults(rawQuery) {
    const scope = parseScope(rawQuery);
    return rankResults({
      rawQuery,
      items: catalogItems(),
      localItems: state.localItems,
      actionItems: state.actionItems,
      intentItems: createIntentItems(scope.query, currentSite),
    });
  }

  async function activateSelected({ newTab = false } = {}) {
    const item = state.results[state.selectedIndex];
    if (!item) return;
    saveRecent(item);

    if (typeof item.action === "function") {
      if (!item.keepOpen) close();
      try {
        await item.action({ item, query: view.input.value, api });
        if (item.keepOpen && item.successMessage) view.footerStatus.textContent = item.successMessage;
      } catch (error) {
        view.footerStatus.textContent = error?.message || "That action could not be completed";
      }
      return;
    }

    if (!item.href) return;
    if (newTab) {
      globalThis.open(item.href, "_blank", "noopener");
      close();
      return;
    }
    close();
    globalThis.location.assign(item.href);
  }

  const view = createSearchView({ state, computeResults, activateSelected });

  function isOpen() {
    return Boolean(view.dialog.open || view.dialog.hasAttribute("open"));
  }

  function setTriggerExpanded(expanded) {
    document.querySelectorAll("[data-xjk-search-trigger]").forEach((trigger) => {
      trigger.setAttribute("aria-expanded", String(expanded));
    });
  }

  function scheduleProviderSearch() {
    clearTimeout(state.providerTimer);
    state.providerController?.abort();
    const scope = parseScope(view.input.value);
    if (!scope.query || scope.query.length < 2 || state.providers.size === 0) {
      state.providerResults.clear();
      return;
    }

    state.providerTimer = setTimeout(async () => {
      const controller = new AbortController();
      state.providerController = controller;
      const tasks = [...state.providers.entries()].map(async ([id, provider]) => {
        try {
          const items = await provider({
            query: scope.query,
            signal: controller.signal,
            currentSite,
            resolveSiteHref,
          });
          if (controller.signal.aborted) return;
          state.providerResults.set(
            id,
            (Array.isArray(items) ? items : []).map((item, index) => normalizeEntry(item, index))
          );
        } catch (error) {
          if (error?.name !== "AbortError") console.warn(`xjk search provider ${id} failed`, error);
        }
      });
      await Promise.all(tasks);
      if (!controller.signal.aborted && isOpen()) view.renderResults({ preserveSelection: true });
    }, 180);
  }

  function open({ query = "", trigger = null } = {}) {
    if (isOpen()) {
      view.input.focus();
      return;
    }
    state.lastTrigger = trigger || document.activeElement;
    state.localItems = collectLocalItems(currentSite);
    state.actionItems = createActionItems(currentSite);
    state.providerController?.abort();
    state.providerResults.clear();
    view.input.value = String(query || "");
    view.renderResults();
    scheduleProviderSearch();
    document.body.classList.add("xjk-search-is-open");
    setTriggerExpanded(true);
    if (typeof view.dialog.showModal === "function") view.dialog.showModal();
    else view.dialog.setAttribute("open", "");
    requestAnimationFrame(() => view.input.focus({ preventScroll: true }));
  }

  function finishClose() {
    document.body.classList.remove("xjk-search-is-open");
    setTriggerExpanded(false);
    state.providerController?.abort();
    clearTimeout(state.providerTimer);
    const focusTarget = state.lastTrigger;
    state.lastTrigger = null;
    if (focusTarget?.isConnected && typeof focusTarget.focus === "function") {
      requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
    }
  }

  function close() {
    if (!isOpen()) return;
    if (typeof view.dialog.close === "function") view.dialog.close();
    else {
      view.dialog.removeAttribute("open");
      finishClose();
    }
  }

  function toggle(options = {}) {
    if (isOpen()) close();
    else open(options);
  }

  function bindTriggers() {
    installAutoTrigger();
    document.querySelectorAll("[data-xjk-search-trigger]").forEach((trigger) => {
      if (trigger.dataset.xjkSearchBound === "true") return;
      trigger.dataset.xjkSearchBound = "true";
      trigger.setAttribute("aria-haspopup", "dialog");
      trigger.setAttribute("aria-controls", view.dialog.id);
      trigger.setAttribute("aria-expanded", "false");
      const shortcut = trigger.querySelector("[data-xjk-search-shortcut]");
      if (shortcut) shortcut.textContent = shortcutLabel();
      trigger.addEventListener("click", () => open({ trigger }));
    });
  }

  function register(items, registrationOptions = {}) {
    const source = String(registrationOptions.source || `page-${state.registered.size + 1}`);
    const normalized = (Array.isArray(items) ? items : []).map((item, index) => normalizeEntry(item, index));
    state.registered.set(source, normalized);
    if (isOpen()) view.renderResults({ preserveSelection: true });
    return () => {
      state.registered.delete(source);
      if (isOpen()) view.renderResults({ preserveSelection: true });
    };
  }

  function registerProvider(id, provider) {
    const key = String(id || `provider-${state.providers.size + 1}`);
    if (typeof provider !== "function") throw new TypeError("xjk search provider must be a function");
    state.providers.set(key, provider);
    if (isOpen() && parseScope(view.input.value).query) scheduleProviderSearch();
    return () => {
      state.providers.delete(key);
      state.providerResults.delete(key);
    };
  }

  const api = Object.freeze({
    open,
    close,
    toggle,
    register,
    registerProvider,
    refresh: () => {
      state.localItems = collectLocalItems(currentSite);
      bindTriggers();
      if (isOpen()) view.renderResults({ preserveSelection: true });
    },
    get isOpen() {
      return isOpen();
    },
  });

  view.input.addEventListener("input", () => {
    state.providerController?.abort();
    state.providerResults.clear();
    view.renderResults();
    scheduleProviderSearch();
  });

  view.input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      view.updateSelection(state.selectedIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      view.updateSelection(state.selectedIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      view.updateSelection(0);
    } else if (event.key === "End") {
      event.preventDefault();
      view.updateSelection(state.results.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      activateSelected({ newTab: event.metaKey || event.ctrlKey });
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });

  view.closeButton.addEventListener("click", close);
  view.dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  view.dialog.addEventListener("close", finishClose);
  view.dialog.addEventListener("click", (event) => {
    if (event.target === view.dialog) close();
  });

  globalThis.addEventListener(
    "keydown",
    (event) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (document.querySelector("[data-xjk-topbar-local-search]")) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopImmediatePropagation();
        toggle({ trigger: document.activeElement });
      }
    },
    true
  );

  bindTriggers();

  loadIndexedItems()
    .then((indexed) => {
      state.staticItems = uniqueById([...indexed, ...fallbackSites]);
      state.indexLoaded = true;
      state.indexCount = indexed.length;
      if (isOpen()) view.renderResults({ preserveSelection: true });
    })
    .catch((error) => {
      state.indexLoaded = false;
      view.footerStatus.textContent = "Using the local service index";
      console.warn("xjk global search index could not be loaded", error);
    });

  const queued = Array.isArray(globalThis.XjkSearchQueue) ? globalThis.XjkSearchQueue.splice(0) : [];
  for (const entry of queued) {
    if (entry?.provider) registerProvider(entry.id, entry.provider);
    else if (entry?.items) register(entry.items, entry.options);
  }

  globalThis.dispatchEvent(new CustomEvent("xjk-search-ready", { detail: api }));
  return api;
}

export { createGlobalSearch };
