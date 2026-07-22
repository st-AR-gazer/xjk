import { DEFAULT_DRAWER_WIDTH, DEFAULT_SIMILARITY_WEIGHT_PROFILE } from "./constants.js?v=2";

function createDefaultSimilarityWeightProfile() {
  return {
    ...DEFAULT_SIMILARITY_WEIGHT_PROFILE,
    final: { ...DEFAULT_SIMILARITY_WEIGHT_PROFILE.final },
    weightedPlacement: { ...DEFAULT_SIMILARITY_WEIGHT_PROFILE.weightedPlacement },
    relationalFallback: { ...DEFAULT_SIMILARITY_WEIGHT_PROFILE.relationalFallback },
    selectedRegexPresets: [...DEFAULT_SIMILARITY_WEIGHT_PROFILE.selectedRegexPresets],
    customRegexPatterns: [...DEFAULT_SIMILARITY_WEIGHT_PROFILE.customRegexPatterns],
  };
}

export const state = {
  ws: "dashboard",
  auth: null,
  dashboard: null,
  clubs: null,
  jobs: null,
  api: null,
  settings: null,
  similarityBackfill: null,
  similarityBackfillStatusSupported: null,
  similarityBackfillStatusPromise: null,
  campaignCatalog: null,
  namingSimilaritySourceKey: "",
  namingSimilarityClubId: "",
  namingSimilarityCampaignName: "",
  namingSimilaritySeason: "",
  namingSimilarityYear: "",
  namingSimilarityMonth: "",
  namingSimilarityDay: "",
  namingSimilarityWeek: "",
  namingSimilarityForce: false,
  namingSimilarityPendingOnly: true,
  maps: {
    view: "inventory",
    data: null,
    lastRequestKey: "",
    filters: {
      inventory: { q: "", campaign: "", tracked: "", status: "", staleState: "" },
      campaigns: {},
      naming: { q: "", automationState: "", reviewState: "pending", requiresRegex: "" },
      weights: {},
      requests: { q: "", status: "" },
    },
    page: { inventory: 1, campaigns: 1, naming: 1, weights: 1, requests: 1 },
    pageSize: { inventory: 50, campaigns: 24, naming: 10, weights: 1, requests: 40 },
  },
  similarityWeightsWorkspace: {
    ruleDraft: {
      ruleId: "",
      sourceKey: "",
      season: "",
      seasonYear: "",
      environment: "",
      alterationSlug: "",
      profile: createDefaultSimilarityWeightProfile(),
    },
    campaignDraft: {
      campaignId: "",
      profile: createDefaultSimilarityWeightProfile(),
    },
  },
  activity: {
    data: null,
    lastRequestKey: "",
    filters: { kind: "all", mapUid: "", jobKey: "" },
    cursor: 0,
    limit: 40,
  },
  drawer: { open: false, type: null, title: "", subtitle: "", kicker: "Detail", payload: null },
  drawerUi: {
    width: DEFAULT_DRAWER_WIDTH,
    activeTab: "overview",
    resize: null,
    namingSimilaritySearch: "",
    namingSimilarityPage: 1,
  },
  requestMonitor: {
    nextId: 1,
    active: [],
    recent: [],
    lastFailure: null,
  },
  lastActionControl: null,
  busy: new Set(),
  lastLoad: { dashboard: 0, jobs: 0, activity: 0, api: 0 },
};

export const el = {};
