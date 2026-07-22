import { createClickRoute } from "./click-router.js?v=2";

export function createMapClickRoutes(context) {
  const {
    buildAdminSimilarityWeightProfile,
    defaultSimilarityWeightProfile,
    findRow,
    guarded,
    handleMapCmd,
    loadMaps,
    openDrawer,
    post,
    renderMaps,
    resetSimilarityWeightCampaignDraft,
    resetSimilarityWeightRuleDraft,
    setHash,
    state,
    stripFmt,
    toast,
  } = context;

  const renderWeightWorkspace = () => {
    if (state.maps.view === "weights" && state.maps.data) renderMaps();
  };
  const applyWeightWorkspace = async (payload) => {
    if (payload?.workspace) {
      state.maps.data = payload.workspace;
      state.maps.lastRequestKey = "weights";
    } else {
      await loadMaps(true);
    }
  };

  return [
    createClickRoute("[data-maps-view]", (control) => {
      state.maps.view = control.dataset.mapsView || "inventory";
      state.maps.page[state.maps.view] = 1;
      setHash("maps", { view: state.maps.view });
    }),
    createClickRoute("[data-open-campaign]", async (control) => {
      state.maps.view = "inventory";
      state.maps.filters.inventory.campaign = control.dataset.openCampaign || "";
      state.maps.page.inventory = 1;
      setHash("maps", { view: "inventory" });
      await guarded("campaign-filter", () => loadMaps(true));
    }),
    createClickRoute("[data-reset-maps]", async () => {
      state.maps.filters[state.maps.view] = defaultMapFilters(state.maps.view);
      state.maps.page[state.maps.view] = 1;
      await guarded("reset-maps", () => loadMaps(true));
    }),
    createClickRoute("[data-reset-similarity-weight-rule-form]", () => {
      resetSimilarityWeightRuleDraft();
      renderWeightWorkspace();
    }),
    createClickRoute("[data-reset-similarity-weight-campaign-form]", () => {
      resetSimilarityWeightCampaignDraft();
      renderWeightWorkspace();
    }),
    createClickRoute("[data-similarity-weight-rule-edit]", (control) => {
      const ruleId = Number(control.getAttribute("data-similarity-weight-rule-edit") || 0) || 0;
      const rule = (Array.isArray(state.maps.data?.scopedRules) ? state.maps.data.scopedRules : []).find(
        (entry) => Number(entry?.ruleId || 0) === ruleId
      );
      if (!rule) return;
      state.maps.view = "weights";
      state.similarityWeightsWorkspace.ruleDraft = {
        ruleId: String(rule.ruleId || ""),
        sourceKey: rule.sourceKey || "",
        season: rule.season || "",
        seasonYear: rule.seasonYear ? String(rule.seasonYear) : "",
        environment: rule.environment || "",
        alterationSlug: rule.alterationSlug || "",
        profile: buildAdminSimilarityWeightProfile(rule.weights || defaultSimilarityWeightProfile),
      };
      setHash("maps", { view: "weights" });
      renderMaps();
    }),
    createClickRoute("[data-similarity-weight-rule-delete]", async (control) => {
      const ruleId = Number(control.getAttribute("data-similarity-weight-rule-delete") || 0) || 0;
      if (!ruleId) return;
      await guarded(`delete-similarity-weight-rule:${ruleId}`, async () => {
        const payload = await post(
          `/api/v1/admin/similarity-weight-rules/${encodeURIComponent(String(ruleId))}/delete`,
          {}
        );
        await applyWeightWorkspace(payload);
        if (String(state.similarityWeightsWorkspace.ruleDraft?.ruleId || "") === String(ruleId)) {
          resetSimilarityWeightRuleDraft();
        }
        renderWeightWorkspace();
        toast(`Scoped similarity weight rule #${ruleId} deleted.`, "ok");
      });
    }),
    createClickRoute("[data-similarity-weight-campaign-edit]", (control) => {
      const campaignId = Number(control.getAttribute("data-similarity-weight-campaign-edit") || 0) || 0;
      const override = (
        Array.isArray(state.maps.data?.campaignOverrides) ? state.maps.data.campaignOverrides : []
      ).find((entry) => Number(entry?.campaignId || 0) === campaignId);
      if (!override) return;
      state.maps.view = "weights";
      state.similarityWeightsWorkspace.campaignDraft = {
        campaignId: String(campaignId),
        profile: buildAdminSimilarityWeightProfile(override.weights || defaultSimilarityWeightProfile),
      };
      setHash("maps", { view: "weights" });
      renderMaps();
    }),
    createClickRoute("[data-similarity-weight-campaign-delete]", async (control) => {
      const campaignId = Number(control.getAttribute("data-similarity-weight-campaign-delete") || 0) || 0;
      if (!campaignId) return;
      await guarded(`delete-similarity-weight-campaign:${campaignId}`, async () => {
        const payload = await post(
          `/api/v1/admin/similarity-weight-campaign-overrides/${encodeURIComponent(String(campaignId))}/delete`,
          {}
        );
        await applyWeightWorkspace(payload);
        if (String(state.similarityWeightsWorkspace.campaignDraft?.campaignId || "") === String(campaignId)) {
          resetSimilarityWeightCampaignDraft();
        }
        renderWeightWorkspace();
        toast("Campaign similarity override removed.", "ok");
      });
    }),
    createClickRoute("[data-open-similarity-weights]", async (control) => {
      const campaignId = String(control.getAttribute("data-open-similarity-weights") || "").trim();
      state.maps.view = "weights";
      state.maps.page.weights = 1;
      if (campaignId) {
        state.similarityWeightsWorkspace.campaignDraft = {
          campaignId,
          profile: buildAdminSimilarityWeightProfile(defaultSimilarityWeightProfile),
        };
      }
      setHash("maps", { view: "weights" });
      await guarded("open-similarity-weights", () => loadMaps(true));
    }),
    createClickRoute("[data-naming-preset]", async (control) => {
      const preset = String(control.getAttribute("data-naming-preset") || "")
        .trim()
        .toLowerCase();
      const filters = namingPresetFilters(preset, state.maps.filters.naming);
      if (!filters) return;
      state.maps.view = "naming";
      state.maps.filters.naming = filters;
      state.maps.page.naming = 1;
      await guarded(`naming-preset-${preset}`, () => loadMaps(true));
    }),
    createClickRoute("[data-page-action]", async (control) => {
      const action = control.dataset.pageAction;
      const view = state.maps.view;
      const maxPage = Math.max(1, Number(state.maps.data?.pageCount || 1));
      if (action === "maps-first-page") state.maps.page[view] = 1;
      if (action === "maps-prev-page") state.maps.page[view] = Math.max(1, (state.maps.page[view] || 1) - 1);
      if (action === "maps-next-page") state.maps.page[view] = (state.maps.page[view] || 1) + 1;
      if (action === "maps-last-page") state.maps.page[view] = maxPage;
      state.maps.page[view] = Math.max(1, Math.min(maxPage, Number(state.maps.page[view] || 1) || 1));
      await guarded(`page-${action}`, () => loadMaps(true));
    }),
    createClickRoute("[data-open-map-uid]", (control) => {
      const row = findRow(control.dataset.openMapUid);
      if (!row) return;
      openDrawer({
        type: "map",
        kicker: "Map Detail",
        title: stripFmt(row.mapName || row.mapUid),
        subtitle: row.mapUid,
        payload: row,
      });
    }),
    createClickRoute("[data-map-command]", (control) =>
      handleMapCmd(control.dataset.mapCommand, control.dataset.mapUid)
    ),
  ];
}

export function defaultMapFilters(view) {
  return (
    {
      inventory: { q: "", campaign: "", tracked: "", status: "", staleState: "" },
      campaigns: {},
      naming: { q: "", automationState: "", reviewState: "pending", requiresRegex: "" },
      weights: {},
      requests: { q: "", status: "" },
    }[view] || {}
  );
}

export function namingPresetFilters(preset, currentFilters) {
  const filters = {
    q: String(currentFilters?.q || ""),
    automationState: "",
    reviewState: "",
    requiresRegex: "",
  };
  if (preset === "pending") filters.reviewState = "pending";
  else if (preset === "unmatched") {
    filters.reviewState = "pending";
    filters.automationState = "unmatched";
  } else if (preset === "matched-pending") {
    filters.reviewState = "pending";
    filters.automationState = "matched";
  } else if (preset === "regex") {
    filters.reviewState = "pending";
    filters.requiresRegex = "true";
  } else if (preset === "approved") filters.reviewState = "approved";
  else if (preset !== "all") return null;
  return filters;
}
