export const POLL_REFRESH_MS = 15000;
export const TABS = ["overview", "routes", "errors", "trackers", "altered", "logs"];
export const ROUTE_SUB_TABS = ["incoming", "outgoing", "nadeo"];

export const state = {
  filters: {
    windowHours: 168,
    projectKey: "",
    service: "",
  },
  activeTab: "overview",
  routeSubTab: "incoming",
  errors: {
    page: 1,
    limit: 50,
    totalPages: 1,
    total: 0,
    q: "",
    direction: "",
  },
  projects: [],
  services: [],
  cached: {
    incoming: [],
    outgoing: [],
    nadeo: [],
    errors: [],
  },
  logs: {
    services: [],
    service: "",
    stream: "out",
    lines: 200,
    followTail: true,
  },
  altered: {
    summary: null,
    syncRuns: [],
    pollRuns: [],
    checkEvents: [],
    checkQuery: "",
  },
  trackers: {
    payload: null,
    lastLoadedAt: null,
    lastErrorAt: null,
    lastErrorMessage: "",
    readOnly: false,
    probe: null,
  },
  nadeoQueue: {
    open: false,
    pendingCount: 0,
    rows: [],
    generatedAt: "",
  },
};

export function buildQuery(extra = {}) {
  const params = new URLSearchParams();
  params.set("window_hours", String(state.filters.windowHours));
  if (state.filters.projectKey) params.set("project_key", state.filters.projectKey);
  if (state.filters.service) params.set("service", state.filters.service);
  Object.entries(extra || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });
  return params.toString();
}
