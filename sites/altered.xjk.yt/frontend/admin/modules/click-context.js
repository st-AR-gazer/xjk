import {
  doNameReview,
  handleClubAction,
  handleJobAction,
  handleMapCmd,
  handleSourceAction,
  loadMoreHistory,
} from "./actions.js?v=2";
import { api, guarded, post } from "./api.js?v=2";
import { DEFAULT_SIMILARITY_WEIGHT_PROFILE } from "./constants.js?v=2";
import { loadActivity, loadApi, loadDashboard, loadMaps } from "./data-loaders.js?v=2";
import { openDrawer, openNamingDetailDrawer } from "./drawer-controller.js?v=2";
import { syncDrawerTabs } from "./drawer-tabs.js?v=2";
import { stripFmt } from "./formatters.js?v=2";
import { renderMaps } from "./maps.js?v=2";
import { setSimilarityWeightEditorTab } from "./naming-detail.js?v=2";
import { buildNamingDetailFallbackPayload, mergeNamingDetailPayload } from "./naming-payload.js?v=2";
import { isNotFoundError } from "./request-errors.js?v=2";
import {
  buildAdminSimilarityWeightProfile,
  hideAlterationSearchLists,
  updateAlterationSearchSuggestions,
} from "./similarity-profile.js?v=2";
import { rerenderSimilarityBackfillSurfaces } from "./similarity-progress.js?v=2";
import { syncNamingSimilaritySearch } from "./similarity-search.js?v=2";
import { resetSimilarityWeightCampaignDraft, resetSimilarityWeightRuleDraft } from "./similarity-workspace.js?v=2";
import { state } from "./state.js?v=2";
import { findRow, toast } from "./ui.js?v=2";
import { ensureLoaded, setHash } from "./workspaces.js?v=2";

export const clickContext = Object.freeze({
  api,
  buildAdminSimilarityWeightProfile,
  buildNamingDetailFallbackPayload,
  defaultSimilarityWeightProfile: DEFAULT_SIMILARITY_WEIGHT_PROFILE,
  doNameReview,
  ensureLoaded,
  findRow,
  guarded,
  handleClubAction,
  handleJobAction,
  handleMapCmd,
  handleSourceAction,
  hideAlterationSearchLists,
  isHtmlElement: (value) => typeof HTMLElement !== "undefined" && value instanceof HTMLElement,
  isInputElement: (value) => typeof HTMLInputElement !== "undefined" && value instanceof HTMLInputElement,
  isNotFoundError,
  loadActivity,
  loadApi,
  loadDashboard,
  loadMaps,
  loadMoreHistory,
  mergeNamingDetailPayload,
  openDrawer,
  openNamingDetailDrawer,
  post,
  promptForName: (...args) => globalThis.prompt(...args),
  renderMaps,
  rerenderSimilarityBackfillSurfaces,
  resetSimilarityWeightCampaignDraft,
  resetSimilarityWeightRuleDraft,
  setHash,
  setLocationHash: (hash) => {
    globalThis.location.hash = hash;
  },
  setSimilarityWeightEditorTab,
  state,
  stripFmt,
  syncDrawerTabs,
  syncNamingSimilaritySearch,
  toast,
  updateAlterationSearchSuggestions,
});
