import { createClickRoute } from "./click-router.js?v=2";

export function createNavigationClickRoutes(context) {
  const {
    ensureLoaded,
    guarded,
    isHtmlElement,
    isInputElement,
    setHash,
    setLocationHash,
    setSimilarityWeightEditorTab,
    state,
    syncDrawerTabs,
    syncNamingSimilaritySearch,
    updateAlterationSearchSuggestions,
  } = context;

  return [
    createClickRoute("[data-drawer-tab]", (control) => {
      state.drawerUi.activeTab = control.dataset.drawerTab || "overview";
      syncDrawerTabs();
    }),
    createClickRoute("[data-similarity-weight-tab]", (control) => {
      setSimilarityWeightEditorTab(
        control.closest("[data-similarity-weight-editor]"),
        control.getAttribute("data-similarity-weight-tab") || "final"
      );
    }),
    createClickRoute("[data-alteration-search-input]", (control) => {
      if (isInputElement(control)) updateAlterationSearchSuggestions(control, { showAllOnEmpty: true });
    }),
    createClickRoute("[data-alteration-option]", (control) => {
      const shell = control.closest("[data-alteration-search]");
      const input = shell?.querySelector("[data-alteration-search-input]");
      if (!isInputElement(input)) return;
      input.value = String(control.getAttribute("data-alteration-option") || "").trim();
      const list = shell?.querySelector("[data-alteration-search-list]");
      if (isHtmlElement(list)) list.hidden = true;
    }),
    createClickRoute("[data-naming-similarity-page]", (control) => {
      const action = String(control.getAttribute("data-naming-similarity-page") || "")
        .trim()
        .toLowerCase();
      if (action === "prev") {
        state.drawerUi.namingSimilarityPage = Math.max(1, Number(state.drawerUi.namingSimilarityPage || 1) - 1);
      }
      if (action === "next") {
        state.drawerUi.namingSimilarityPage = Math.max(1, Number(state.drawerUi.namingSimilarityPage || 1) + 1);
      }
      syncNamingSimilaritySearch();
    }),
    createClickRoute("[data-workspace-link]", (control) => setHash(control.dataset.workspaceLink)),
    createClickRoute("[data-nav]", (control) => setHash(control.dataset.nav)),
    createClickRoute("[data-refresh]", (control) =>
      guarded(`refresh-${control.dataset.refresh}`, () => ensureLoaded(control.dataset.refresh, true))
    ),
    createClickRoute(".config-header", (control) => {
      control.closest(".config-section")?.classList.toggle("open");
    }),
    createClickRoute("[data-alert-target]", (control) => {
      setLocationHash(control.dataset.alertTarget || "#dashboard");
    }),
  ];
}
