import { submitSettings } from "./actions.js?v=2";
import { guarded, post } from "./api.js?v=2";
import {
  loadActivity,
  loadCampaignCatalog,
  loadDashboard,
  loadJobs,
  loadMaps,
  loadSettings,
} from "./data-loaders.js?v=2";
import { stripFmt } from "./formatters.js?v=2";
import { closeDrawer, openDrawer, openNamingDetailDrawer } from "./drawer-controller.js?v=2";
import { renderMaps } from "./maps.js?v=2";
import { hideAlterationSearchLists, updateAlterationSearchSuggestions } from "./similarity-profile.js?v=2";
import {
  deriveNamingSimilarityCampaignName,
  getTotdDayOptions,
  getTotdMonthOptions,
  isWeeklySourceKey,
  optionListHasValue,
  resetNamingSimilarityScopedSelections,
  syncNamingSimilarityCampaignSelects,
} from "./similarity-scope.js?v=2";
import { rerenderNamingSimilarityControlSurfaces } from "./similarity-progress.js?v=2";
import { syncNamingSimilaritySearch } from "./similarity-search.js?v=2";
import {
  parseSimilarityWeightProfileFromFormData,
  resetSimilarityWeightCampaignDraft,
  resetSimilarityWeightRuleDraft,
} from "./similarity-workspace.js?v=2";
import { state } from "./state.js?v=2";
import { findRow, toast } from "./ui.js?v=2";
import { setHash } from "./workspaces.js?v=2";

export function onInput(e) {
  const t = e.target;
  if (!(t instanceof Element)) return;

  const alterationSearchInput = t.closest("[data-alteration-search-input]");
  if (alterationSearchInput instanceof HTMLInputElement) {
    updateAlterationSearchSuggestions(alterationSearchInput);
  }

  const similaritySearchInput = t.closest("[data-naming-similarity-search-input]");
  if (similaritySearchInput instanceof HTMLInputElement) {
    state.drawerUi.namingSimilaritySearch = similaritySearchInput.value || "";
    state.drawerUi.namingSimilarityPage = 1;
    syncNamingSimilaritySearch();
  }

  const similaritySourceSelect = t.closest("[data-naming-similarity-source]");
  if (similaritySourceSelect instanceof HTMLSelectElement) {
    const previousSourceKey = String(state.namingSimilaritySourceKey || "")
      .trim()
      .toLowerCase();
    state.namingSimilaritySourceKey = similaritySourceSelect.value || "";
    document.querySelectorAll("[data-naming-similarity-source]").forEach((node) => {
      if (node instanceof HTMLSelectElement && node !== similaritySourceSelect) {
        node.value = state.namingSimilaritySourceKey;
      }
    });
    if (!(isWeeklySourceKey(previousSourceKey) && isWeeklySourceKey(state.namingSimilaritySourceKey || ""))) {
      resetNamingSimilarityScopedSelections();
    } else {
      state.namingSimilaritySeason = "";
      state.namingSimilarityMonth = "";
      state.namingSimilarityDay = "";
    }
    state.namingSimilarityCampaignName = "";
    deriveNamingSimilarityCampaignName();
    syncNamingSimilarityCampaignSelects();
    if (!Array.isArray(state.campaignCatalog)) {
      loadCampaignCatalog().catch(console.error);
    }
  }

  const similaritySeasonSelect = t.closest("[data-naming-similarity-season]");
  if (similaritySeasonSelect instanceof HTMLSelectElement) {
    state.namingSimilaritySeason = similaritySeasonSelect.value || "";
    deriveNamingSimilarityCampaignName();
    syncNamingSimilarityCampaignSelects();
  }

  const similarityYearSelect = t.closest("[data-naming-similarity-year]");
  if (similarityYearSelect instanceof HTMLSelectElement) {
    state.namingSimilarityYear = similarityYearSelect.value || "";
    if (!state.namingSimilarityYear) {
      state.namingSimilarityMonth = "";
      state.namingSimilarityDay = "";
      state.namingSimilarityWeek = "";
    } else {
      const monthOptions = getTotdMonthOptions(state.namingSimilarityYear || "");
      if (!optionListHasValue(monthOptions, state.namingSimilarityMonth || "")) {
        state.namingSimilarityMonth = "";
        state.namingSimilarityDay = "";
      }
    }
    deriveNamingSimilarityCampaignName();
    syncNamingSimilarityCampaignSelects();
  }

  const similarityMonthSelect = t.closest("[data-naming-similarity-month]");
  if (similarityMonthSelect instanceof HTMLSelectElement) {
    state.namingSimilarityMonth = similarityMonthSelect.value || "";
    const dayOptions = getTotdDayOptions(state.namingSimilarityYear || "", state.namingSimilarityMonth || "");
    if (!state.namingSimilarityMonth || !optionListHasValue(dayOptions, state.namingSimilarityDay || "")) {
      state.namingSimilarityDay = "";
    }
    deriveNamingSimilarityCampaignName();
    syncNamingSimilarityCampaignSelects();
  }

  const similarityDaySelect = t.closest("[data-naming-similarity-day]");
  if (similarityDaySelect instanceof HTMLSelectElement) {
    state.namingSimilarityDay = similarityDaySelect.value || "";
    deriveNamingSimilarityCampaignName();
    syncNamingSimilarityCampaignSelects();
  }

  const similarityWeekSelect = t.closest("[data-naming-similarity-week]");
  if (similarityWeekSelect instanceof HTMLSelectElement) {
    state.namingSimilarityWeek = similarityWeekSelect.value || "";
    deriveNamingSimilarityCampaignName();
    syncNamingSimilarityCampaignSelects();
  }

  const similarityClubSelect = t.closest("[data-naming-similarity-club]");
  if (similarityClubSelect instanceof HTMLSelectElement) {
    state.namingSimilarityClubId = similarityClubSelect.value || "";
    document.querySelectorAll("[data-naming-similarity-club]").forEach((node) => {
      if (node instanceof HTMLSelectElement && node !== similarityClubSelect) {
        node.value = state.namingSimilarityClubId;
      }
    });
    rerenderNamingSimilarityControlSurfaces();
  }

  const similarityCampaignNameInput = t.closest("[data-naming-similarity-campaign-name]");
  if (similarityCampaignNameInput instanceof HTMLSelectElement) {
    state.namingSimilarityCampaignName = similarityCampaignNameInput.value || "";
    document.querySelectorAll("[data-naming-similarity-campaign-name]").forEach((node) => {
      if (node instanceof HTMLSelectElement && node !== similarityCampaignNameInput) {
        node.value = state.namingSimilarityCampaignName;
      }
    });
    rerenderNamingSimilarityControlSurfaces();
  }

  const similarityForceToggle = t.closest("[data-naming-similarity-force]");
  if (similarityForceToggle instanceof HTMLInputElement) {
    state.namingSimilarityForce = Boolean(similarityForceToggle.checked);
    document.querySelectorAll("[data-naming-similarity-force]").forEach((node) => {
      if (node instanceof HTMLInputElement && node !== similarityForceToggle) {
        node.checked = state.namingSimilarityForce;
      }
    });
    rerenderNamingSimilarityControlSurfaces();
  }

  const similarityPendingToggle = t.closest("[data-naming-similarity-pending-only]");
  if (similarityPendingToggle instanceof HTMLInputElement) {
    state.namingSimilarityPendingOnly = Boolean(similarityPendingToggle.checked);
    document.querySelectorAll("[data-naming-similarity-pending-only]").forEach((node) => {
      if (node instanceof HTMLInputElement && node !== similarityPendingToggle) {
        node.checked = state.namingSimilarityPendingOnly;
      }
    });
    rerenderNamingSimilarityControlSurfaces();
  }
}

export function onFocusIn(e) {
  const t = e.target;
  if (!(t instanceof Element)) return;
  const alterationSearchInput = t.closest("[data-alteration-search-input]");
  if (alterationSearchInput instanceof HTMLInputElement) {
    updateAlterationSearchSuggestions(alterationSearchInput, { showAllOnEmpty: true });
  }
}

export function onFocusOut(e) {
  const t = e.target;
  if (!(t instanceof Element)) return;
  const shell = t.closest("[data-alteration-search]");
  if (!(shell instanceof HTMLElement)) return;
  window.setTimeout(() => {
    if (!shell.contains(document.activeElement)) {
      hideAlterationSearchLists();
    }
  }, 0);
}

export async function onSubmit(e) {
  state.lastActionControl = e.submitter instanceof HTMLElement ? e.submitter : null;
  const settingsForm = e.target.closest("[data-settings-form]");
  if (settingsForm) {
    e.preventDefault();
    await submitSettings(settingsForm);
    return;
  }

  const mapsPageJump = e.target.closest("[data-form-kind='maps-page-jump']");
  if (mapsPageJump) {
    e.preventDefault();
    const fd = new FormData(mapsPageJump);
    const maxPage = Math.max(
      1,
      Number(mapsPageJump.getAttribute("data-page-count") || state.maps.data?.pageCount || 1)
    );
    const requestedPage = Math.floor(Number(fd.get("page") || 1) || 1);
    const nextPage = Math.max(1, Math.min(maxPage, requestedPage));
    state.maps.page[state.maps.view] = nextPage;
    await guarded(`page-jump-${state.maps.view}`, () => loadMaps(true));
    return;
  }

  const mapsFilter = e.target.closest("[data-form-kind='maps-filters']");
  if (mapsFilter) {
    e.preventDefault();
    const fd = new FormData(mapsFilter);
    const v = fd.get("view") || state.maps.view;
    state.maps.view = String(v);
    state.maps.page[state.maps.view] = 1;
    const nf = {};
    for (const [k, val] of fd.entries()) {
      if (k === "view") continue;
      if (k === "pageSize") {
        state.maps.pageSize[state.maps.view] = Math.max(1, Number(val) || state.maps.pageSize[state.maps.view] || 1);
        continue;
      }
      nf[k] = String(val || "");
    }
    state.maps.filters[state.maps.view] = nf;
    setHash("maps", { view: state.maps.view });
    await guarded("maps-filters", () => loadMaps(true));
    return;
  }

  const actFilter = e.target.closest("[data-form-kind='activity-filters']");
  if (actFilter) {
    e.preventDefault();
    const fd = new FormData(actFilter);
    state.activity.filters.kind = String(fd.get("kind") || "all");
    state.activity.filters.jobKey = String(fd.get("jobKey") || "");
    state.activity.filters.mapUid = String(fd.get("mapUid") || "").trim();
    state.activity.limit = Number(fd.get("limit") || 40) || 40;
    state.activity.cursor = 0;
    setHash("activity", {
      kind: state.activity.filters.kind,
      jobKey: state.activity.filters.jobKey,
      mapUid: state.activity.filters.mapUid,
    });
    await guarded("activity-filters", loadActivity);
    return;
  }

  const moveForm = e.target.closest("[data-drawer-form='move-map']");
  if (moveForm) {
    e.preventDefault();
    const fd = new FormData(moveForm);
    const uid = String(fd.get("mapUid") || "");
    const camp = String(fd.get("campaignName") || "").trim();
    const slot = Number(fd.get("slot") || 1) || 1;
    await guarded(`move-${uid}`, async () => {
      await post(`/api/v1/admin/maps/${encodeURIComponent(uid)}/campaign`, { campaignName: camp, slot });
      await loadMaps(true);
      await loadDashboard();
      const row = findRow(uid);
      if (row) {
        openDrawer({
          type: "map",
          kicker: "Map Detail",
          title: stripFmt(row.mapName || row.mapUid),
          subtitle: row.mapUid,
          payload: row,
        });
      }
      toast(`Moved ${uid} to ${camp}.`, "ok");
    });
    return;
  }

  const similaritySelectionForm = e.target.closest("[data-drawer-form='similarity-selection']");
  if (similaritySelectionForm) {
    e.preventDefault();
    const fd = new FormData(similaritySelectionForm);
    const mapUid = String(fd.get("mapUid") || "").trim();
    const candidateMapUids = fd
      .getAll("candidateMapUid")
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const selectionMode = String(e.submitter?.value || "apply")
      .trim()
      .toLowerCase();
    if (!candidateMapUids.length) {
      toast("Select at least one similar map first.", "warn");
      return;
    }
    await guarded(`similarity-selection:${mapUid}`, async () => {
      const payload = await post(`/api/v1/admin/naming/candidates/${encodeURIComponent(mapUid)}/similarity-selection`, {
        candidateMapUids,
        reviewState: selectionMode === "approve" ? "approved" : undefined,
        reviewNote: selectionMode === "approve" ? "admin-v2: approved selected similarity candidates" : undefined,
      });
      await Promise.all([loadMaps(true), loadDashboard()]);
      openNamingDetailDrawer(payload?.detail || payload);
      toast(`Similarity selection saved for ${mapUid}.`, "ok");
    });
    return;
  }

  const similarityWeightsForm = e.target.closest("[data-drawer-form='similarity-weights']");
  if (similarityWeightsForm) {
    e.preventDefault();
    const fd = new FormData(similarityWeightsForm);
    const mapUid = String(fd.get("mapUid") || "").trim();
    const scope = String(fd.get("scope") || "map")
      .trim()
      .toLowerCase();
    const action = String(e.submitter?.value || fd.get("weightAction") || "save")
      .trim()
      .toLowerCase();
    if (!mapUid) {
      toast("This similarity weight form is missing a map UID.", "warn");
      return;
    }
    await guarded(`similarity-weights:${scope}:${mapUid}`, async () => {
      const payload = await post(`/api/v1/admin/naming/candidates/${encodeURIComponent(mapUid)}/similarity-weights`, {
        scope,
        reset: action === "reset",
        weights: parseSimilarityWeightProfileFromFormData(fd),
      });
      await Promise.all([loadMaps(true), loadDashboard()]);
      openNamingDetailDrawer(payload?.detail || payload);
      toast(
        action === "reset"
          ? `${scope === "campaign" ? "Campaign" : "Map"} similarity weights reset.`
          : `${scope === "campaign" ? "Campaign" : "Map"} similarity weights saved.`,
        "ok"
      );
    });
    return;
  }

  const similarityWeightRuleForm = e.target.closest("[data-similarity-weight-rule-form]");
  if (similarityWeightRuleForm) {
    e.preventDefault();
    const fd = new FormData(similarityWeightRuleForm);
    const profile = parseSimilarityWeightProfileFromFormData(fd);
    await guarded(`similarity-weight-rule:${fd.get("ruleId") || "new"}`, async () => {
      const payload = await post("/api/v1/admin/similarity-weight-rules", {
        ruleId: String(fd.get("ruleId") || "").trim() || undefined,
        sourceKey: String(fd.get("sourceKey") || "").trim() || undefined,
        season: String(fd.get("season") || "").trim() || undefined,
        seasonYear: String(fd.get("seasonYear") || "").trim() || undefined,
        environment: String(fd.get("environment") || "").trim() || undefined,
        alterationSlug: String(fd.get("alterationSlug") || "").trim() || undefined,
        weights: profile,
      });
      if (payload?.workspace) {
        state.maps.data = payload.workspace;
        state.maps.lastRequestKey = "weights";
      } else {
        await loadMaps(true);
      }
      resetSimilarityWeightRuleDraft();
      if (state.maps.view === "weights" && state.maps.data) renderMaps();
      toast("Scoped similarity weight rule saved.", "ok");
    });
    return;
  }

  const similarityWeightCampaignForm = e.target.closest("[data-similarity-weight-campaign-form]");
  if (similarityWeightCampaignForm) {
    e.preventDefault();
    const fd = new FormData(similarityWeightCampaignForm);
    const campaignId = String(fd.get("campaignId") || "").trim();
    if (!campaignId) {
      toast("Choose a campaign first.", "warn");
      return;
    }
    const profile = parseSimilarityWeightProfileFromFormData(fd);
    await guarded(`similarity-weight-campaign:${campaignId}`, async () => {
      const payload = await post("/api/v1/admin/similarity-weight-campaign-overrides", {
        campaignId,
        weights: profile,
      });
      if (payload?.workspace) {
        state.maps.data = payload.workspace;
        state.maps.lastRequestKey = "weights";
      } else {
        await loadMaps(true);
      }
      resetSimilarityWeightCampaignDraft(campaignId);
      if (state.maps.view === "weights" && state.maps.data) renderMaps();
      toast("Campaign similarity weight override saved.", "ok");
    });
    return;
  }

  const targetedForm = e.target.closest("[data-drawer-form='targeted-displayname']");
  if (targetedForm) {
    e.preventDefault();
    const fd = new FormData(targetedForm);
    await guarded("targeted-dn", async () => {
      await post("/api/v1/admin/hook/altered/live/mapper-sync/accounts", {
        accountIds: String(fd.get("accountIds") || "").trim(),
        force: fd.get("force") === "on",
      });
      closeDrawer();
      await Promise.all([loadJobs(), loadDashboard()]);
      toast("Targeted sync triggered.", "ok");
    });
    return;
  }

  const clubForm = e.target.closest("[data-drawer-form='club-config']");
  if (clubForm) {
    e.preventDefault();
    const fd = new FormData(clubForm);
    await guarded(`club-cfg:${fd.get("hookKey")}`, async () => {
      await post("/api/v1/admin/hook/altered/config", {
        hookKey: String(fd.get("hookKey") || "").trim(),
        clubId: Number(fd.get("clubId") || 0) || 0,
        clubName: String(fd.get("clubName") || "").trim(),
        sourceLabel: String(fd.get("sourceLabel") || "").trim(),
        enabled: fd.get("enabled") === "on",
        autoTrackNewMaps: fd.get("autoTrackNewMaps") === "on",
      });
      closeDrawer();
      await Promise.all([loadJobs(), loadSettings(), loadDashboard()]);
      toast("Club updated.", "ok");
    });
    return;
  }
}
