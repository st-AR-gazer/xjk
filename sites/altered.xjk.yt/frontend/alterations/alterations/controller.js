import {
  createAlterationsState,
  getAlterationBySlug,
  getAlterationCampaigns,
  getAlterationStats,
  getCampaignById,
  getCampaignKey,
  normalizeAlteration,
} from "./state.js?v=2";
import { createAlterationsTransport } from "./transport.js?v=2";
import { createAlterationsViews } from "./views.js?v=2";
import { createMapModal } from "./modal.js?v=2";

function readUrlState(locationObject) {
  const params = new URLSearchParams(locationObject.search);
  return {
    alteration: params.get("alteration") || "",
    campaign: params.get("campaign") || "",
    map: params.get("map") || "",
  };
}

function writeUrlState({ historyObject, locationObject }, values = {}, replace = false) {
  const { alteration = "", campaign = "", map = "" } = values;
  const params = new URLSearchParams();
  if (alteration) params.set("alteration", alteration);
  if (campaign) params.set("campaign", campaign);
  if (map) params.set("map", map);
  const target = params.toString() ? `?${params.toString()}` : locationObject.pathname;
  historyObject[replace ? "replaceState" : "pushState"]({ alteration, campaign, map }, "", target);
}

function createAlterationsController({
  documentObject = document,
  windowObject = window,
  historyObject = history,
  resolveUrl = windowObject.__alteredUrl || ((value) => value),
  fetchJsonImpl,
} = {}) {
  const state = createAlterationsState();
  const elements = findElements(documentObject);
  const transport = createAlterationsTransport({ fetchJsonImpl, resolveUrl });
  const writeUrl = (values, replace = false) =>
    writeUrlState({ historyObject, locationObject: windowObject.location }, values, replace);
  const actions = {
    openAlteration,
    openCampaign,
    openMap: (mapUid) => modal.open(mapUid),
    openOverview,
    searchAlterations,
  };
  const views = createAlterationsViews({ documentObject, elements, state, actions });
  const modal = createMapModal({ documentObject, elements, state, transport, writeUrl });

  async function ensureAlterationMaps(slug) {
    const key = String(slug || "").trim();
    if (!key || state.alterationMaps.has(key)) return;
    state.alterationMaps.set(key, await transport.loadAlterationMaps(key));
  }

  async function ensureCampaignMaps(campaignId) {
    const key = String(campaignId || "");
    if (!key || state.campaignMaps.has(key)) return;
    state.campaignMaps.set(key, await transport.loadCampaignMaps(key));
  }

  function showOverview() {
    state.activeAlterationSlug = "";
    state.activeCampaignId = "";
    state.mapSearch = "";
    views.resetOverviewControls();
    views.renderStats();
    views.renderAlterationOverview();
  }

  async function renderAlterationDetail() {
    const alteration = getAlterationBySlug(state, state.activeAlterationSlug);
    if (!alteration) {
      showOverview();
      return;
    }

    state.activeCampaignId = "";
    state.mapSearch = "";
    views.resetOverviewControls();
    if (!state.alterationMaps.has(state.activeAlterationSlug)) {
      views.renderMessage("Loading alteration campaigns...");
      try {
        await ensureAlterationMaps(state.activeAlterationSlug);
      } catch (_error) {
        views.renderMessage("Could not load alteration data.");
        return;
      }
    }

    const campaigns = getAlterationCampaigns(state, alteration.slug);
    const stats = getAlterationStats(state, alteration.slug);
    views.renderStats();
    views.renderAlterationDetail(alteration, campaigns, stats);
  }

  async function renderCampaignDetail() {
    const campaign = getCampaignById(state, state.activeCampaignId);
    if (!campaign) {
      state.activeCampaignId = "";
      await renderCurrentView();
      return;
    }

    try {
      await ensureAlterationMaps(state.activeAlterationSlug);
    } catch (_error) {
      // Campaign maps remain independently available if the aggregate request fails.
    }
    views.renderStats();
    views.showCampaignControls();
    views.renderMessage("Loading maps...");

    try {
      await ensureCampaignMaps(getCampaignKey(campaign));
      views.renderCampaignMaps(campaign);
    } catch (_error) {
      views.renderMessage("Could not load maps for this campaign.");
    }
  }

  async function renderCurrentView() {
    if (state.activeCampaignId) {
      await renderCampaignDetail();
      return;
    }
    if (state.activeAlterationSlug) {
      await renderAlterationDetail();
      return;
    }
    showOverview();
  }

  function openOverview() {
    showOverview();
    writeUrl({});
  }

  async function openAlteration(slug = state.activeAlterationSlug) {
    state.activeAlterationSlug = typeof slug === "string" ? slug : state.activeAlterationSlug;
    state.activeCampaignId = "";
    writeUrl({ alteration: state.activeAlterationSlug });
    await renderCurrentView();
  }

  async function openCampaign(campaignId) {
    state.activeCampaignId = String(campaignId || "");
    writeUrl({ alteration: state.activeAlterationSlug, campaign: state.activeCampaignId });
    await renderCurrentView();
  }

  function searchAlterations(query) {
    state.alterationSearch = query;
    views.renderAlterationOverview();
  }

  function bindEvents() {
    elements.mapSearch?.addEventListener("input", (event) => {
      state.mapSearch = event.target.value || "";
      if (state.activeCampaignId) views.renderCampaignMaps(getCampaignById(state, state.activeCampaignId));
    });
    elements.mapSort?.addEventListener("change", (event) => {
      state.mapSort = event.target.value || "name";
      if (state.activeCampaignId) views.renderCampaignMaps(getCampaignById(state, state.activeCampaignId));
    });
    elements.modalClose?.addEventListener("click", () => modal.close());
    elements.modalBackdrop?.addEventListener("click", (event) => {
      if (event.target === elements.modalBackdrop) modal.close();
    });
    documentObject.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && elements.modalBackdrop && !elements.modalBackdrop.hidden) modal.close();
    });
    windowObject.addEventListener("popstate", restoreUrlState);
  }

  async function restoreUrlState() {
    const urlState = readUrlState(windowObject.location);
    if (!urlState.map && elements.modalBackdrop && !elements.modalBackdrop.hidden) modal.close(false);
    state.activeAlterationSlug = urlState.alteration;
    state.activeCampaignId = urlState.campaign;
    await renderCurrentView();
    if (urlState.map) await modal.openByUid(urlState.map);
  }

  async function bootstrap() {
    elements.loading.hidden = false;
    elements.error.hidden = true;
    elements.empty.hidden = true;

    try {
      const payload = await transport.loadInitialData();
      state.stats = payload.stats || null;
      state.alterations = (Array.isArray(payload.alterations?.alterations) ? payload.alterations.alterations : [])
        .map(normalizeAlteration)
        .filter((item) => item.slug);
      state.campaigns = Array.isArray(payload.campaigns?.campaigns) ? payload.campaigns.campaigns : [];
      views.renderStats();
      elements.loading.hidden = true;

      const urlState = readUrlState(windowObject.location);
      if (urlState.campaign) {
        const campaign = getCampaignById(state, urlState.campaign);
        state.activeCampaignId = campaign ? getCampaignKey(campaign) : "";
        if (campaign) {
          state.activeAlterationSlug =
            urlState.alteration || campaign?.primary_alteration?.slug || campaign?.alterations?.[0]?.slug || "";
        }
      } else if (urlState.alteration) {
        state.activeAlterationSlug = urlState.alteration;
      }

      await renderCurrentView();
      if (urlState.map) await modal.openByUid(urlState.map);
    } catch (_error) {
      elements.loading.hidden = true;
      elements.error.hidden = false;
    }
  }

  async function boot() {
    bindEvents();
    await bootstrap();
  }

  return { boot, renderCurrentView, state };
}

function findElements(documentObject) {
  return {
    container: documentObject.getElementById("content-container"),
    controlsBar: documentObject.getElementById("controls-bar"),
    empty: documentObject.getElementById("empty-state"),
    error: documentObject.getElementById("error-state"),
    loading: documentObject.getElementById("loading-state"),
    mapSearch: documentObject.getElementById("map-search"),
    mapSort: documentObject.getElementById("map-sort"),
    modalBackdrop: documentObject.getElementById("map-modal-backdrop"),
    modalClose: documentObject.getElementById("map-modal-close"),
    modalContent: documentObject.getElementById("map-modal-content"),
  };
}

function bootAlterations(options) {
  const controller = createAlterationsController(options);
  controller.boot();
  return controller;
}

export { bootAlterations, createAlterationsController, readUrlState, writeUrlState };
