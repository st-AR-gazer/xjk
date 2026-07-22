export const alteredUrl = window.__alteredUrl || ((value) => value);
export const WORKSPACES = ["dashboard", "clubs", "maps", "jobs", "activity", "api", "settings"];
export const LEGACY_MAP = {
  command: "dashboard",
  overview: "dashboard",
  sync: "jobs",
  monitor: "jobs",
  tracker: "jobs",
  "map-operations": "maps",
  "activity-log": "activity",
  operations: "activity",
  docs: "api",
  advanced: "settings",
  diagnostics: "settings",
};
export const POLL_MS = { dashboard: 15000, jobs: 5000, activity: 15000, api: 30000 };
export const DRAWER_WIDTH_KEY = "alteredAdmin.drawerWidth";
export const DEFAULT_DRAWER_WIDTH = 640;
export const NAMING_DETAIL_DRAWER_WIDTH = 1120;
export const MIN_DRAWER_WIDTH = 420;
export const MAX_DRAWER_WIDTH = 1400;
export const NETWORK_FALLBACK_STATUS = new Set([502, 503, 504]);
export const FETCH_NETWORK_RETRY_ATTEMPTS = 2;
export const FETCH_NETWORK_RETRY_DELAY_MS = 350;
export const FETCH_TIMEOUT_MS = 20000;
export const SIMILARITY_RUNNING_GRACE_MS = 2 * 60 * 1000;
export const NAMING_SIMILARITY_PAGE_SIZE = 5;
export const CAMPAIGN_CATALOG_PAGE_SIZE = 200;
export const CAMPAIGN_LABEL_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
export const DEFAULT_SIMILARITY_WEIGHT_PROFILE = {
  final: { absolute: 44, relative: 26, weightedPlacement: 22, model: 8, name: 6, regex: 0 },
  weightedPlacement: { absolute: 68, relative: 32 },
  relationalFallback: { relative: 82, model: 14, absolute: 4, name: 6 },
  nameSupport: 0,
  regexOnly: false,
  regexOverwriteWeights: false,
  selectedRegexPresets: [],
  customRegexPatterns: [],
};
export const SIMILARITY_WEIGHT_SECTIONS = [
  {
    key: "final",
    label: "Final Blend",
    fields: [
      ["absolute", "Absolute"],
      ["relative", "Relative"],
      ["weightedPlacement", "Weighted Placement"],
      ["model", "Model"],
      ["name", "Name Similarity"],
      ["regex", "Regex"],
    ],
  },
  {
    key: "weightedPlacement",
    label: "Weighted Placement Blend",
    fields: [
      ["absolute", "Weighted Absolute"],
      ["relative", "Weighted Relative"],
    ],
  },
  {
    key: "relationalFallback",
    label: "Fallback Blend",
    fields: [
      ["relative", "Relative"],
      ["model", "Model"],
      ["absolute", "Absolute"],
      ["name", "Name Similarity"],
    ],
  },
];
export const NAMING_SIMILARITY_SOURCE_OPTIONS = [
  ["", "All Sources"],
  ["official-seasonal-v2", "Seasonal"],
  ["official-totd", "TOTD"],
  ["weekly-shorts", "Weekly Shorts"],
  ["weekly-grands", "Weekly Grands"],
  ["official-discovery", "Discovery"],
  ["official-competition", "Competition"],
  ["official-legacy", "Legacy"],
];
export const NAMING_SIMILARITY_FALLBACK_CAMPAIGNS = {
  "official-discovery": [
    "Snow Discovery",
    "Rally Discovery",
    "Desert Discovery",
    "Stunt Discovery",
    "Platform Discovery",
  ],
  "official-legacy": ["Spring 2020", "Training"],
};
export const NAMING_SIMILARITY_SEASON_OPTIONS = [
  ["", "All Seasons"],
  ["Winter", "Winter"],
  ["Spring", "Spring"],
  ["Summer", "Summer"],
  ["Fall", "Fall"],
];
export const NAMING_SIMILARITY_MONTH_OPTIONS = [
  ["", "All Months"],
  ["01", "January"],
  ["02", "February"],
  ["03", "March"],
  ["04", "April"],
  ["05", "May"],
  ["06", "June"],
  ["07", "July"],
  ["08", "August"],
  ["09", "September"],
  ["10", "October"],
  ["11", "November"],
  ["12", "December"],
];
export const NAMING_SIMILARITY_TOTD_START_UTC = Date.UTC(2020, 6, 1);
export const NAMING_SIMILARITY_WEEKLY_EPOCH_UTC = Date.UTC(2024, 11, 15);
export const NAMING_SIMILARITY_WEEKLY_GRANDS_MIN_WEEK = 59;

export const ADMIN_DEBUG_ENABLED = new URLSearchParams(window.location.search).has("debug");
