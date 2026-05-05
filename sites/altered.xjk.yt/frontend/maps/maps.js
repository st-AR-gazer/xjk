(() => {
const API = {
  stats: "/api/v1/alterations/stats",
  filters: "/api/v1/alterations/maps/filters",
  maps: "/api/v1/alterations/maps",
  mapDetail: "/api/v1/public/maps",
};
const alteredUrl = window.__alteredUrl || ((value) => value);

const PAGE_SIZE = 48;
const DEFAULT_MAP_SORT = "random";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NADEO_FMT_RE = /\$([0-9a-fA-F]{1,3}|[gimnostuwzGIMNOSTUWZ<>]|[hlpHLP](\[[^\]]+\])?)/g;
const DISPLAY_NAME_REFRESH_DELAYS_MS = [250, 1000, 2500, 5000, 10000, 20000];

function createRandomSeed() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeSeed(value) {
  const seed = String(value || "").trim().toLowerCase();
  return UUID_RE.test(seed) ? seed : "";
}

const SEASON_BASES = ["winter", "spring", "summer", "fall"];
const SEASON_BASE_LABEL = { winter: "Winter", spring: "Spring", summer: "Summer", fall: "Fall" };
const SEASON_YEAR_RE = /^(winter|spring|summer|fall)-(\d{4})$/i;

const state = {
  stats: null,
  options: null,
  maps: [],
  total: 0,
  page: 1,
  filterPanelOpen: false,
  openDropdown: null,
  randomSeed: "",
  explicitQuery: {
    sort: false,
    seed: false,
  },
  tagSearch: {
    alteration: "",
    other: "",
  },
  filters: {
    q: "",
    seasonInclude: [],
    seasonExclude: [],
    yearInclude: [],
    yearExclude: [],
    otherInclude: [],
    otherExclude: [],
    alterationInclude: [],
    alterationExclude: [],
    statusInclude: [],
    statusExclude: [],
    wrInclude: [],
    wrExclude: [],
    mapNumber: "",
    environmentInclude: [],
    environmentExclude: [],
    mapTypeInclude: [],
    mapTypeExclude: [],
    sort: DEFAULT_MAP_SORT,
  },
  displayNameRefresh: {
    timer: null,
    attempts: 0,
    key: "",
  },
  activeModalMapUid: "",
  activeModalDetail: null,
};

const displayNamesByAccountId = {};

function getCachedDisplayName(accountId) {
  const id = String(accountId || "").trim().toLowerCase();
  if (!looksLikeAccountId(id)) return "";
  const displayName = displayNamesByAccountId[id] || "";
  return isUsableDisplayName(displayName, id) ? String(displayName).trim() : "";
}

function rememberResolvedDisplayNames(namesByAccountId = {}) {
  if (!namesByAccountId || typeof namesByAccountId !== "object") return {};
  const remembered = {};
  for (const [rawAccountId, rawDisplayName] of Object.entries(namesByAccountId)) {
    const accountId = String(rawAccountId || "").trim().toLowerCase();
    const displayName = String(rawDisplayName || "").trim();
    if (!looksLikeAccountId(accountId) || !isUsableDisplayName(displayName, accountId)) continue;
    displayNamesByAccountId[accountId] = displayName;
    remembered[accountId] = displayName;
  }
  return remembered;
}

function getCachedDisplayNamesForAccountIds(accountIds = []) {
  const out = {};
  for (const accountId of accountIds) {
    const id = String(accountId || "").trim().toLowerCase();
    const displayName = getCachedDisplayName(id);
    if (displayName) out[id] = displayName;
  }
  return out;
}

const $mapGrid = document.getElementById("map-grid");
const $searchInput = document.getElementById("map-search");
const $sortSelect = document.getElementById("map-sort");
const $mapNumberFilter = document.getElementById("map-number-filter");
const $filterToggle = document.getElementById("filter-toggle");
const $filterPanel = document.getElementById("filter-panel");
const $seasonFilterList = document.getElementById("season-filter-list");
const $seasonFilterSummary = document.getElementById("season-filter-summary");
const $yearFilterList = document.getElementById("year-filter-list");
const $yearFilterSummary = document.getElementById("year-filter-summary");
const $otherFilterList = document.getElementById("other-filter-list");
const $otherFilterSummary = document.getElementById("other-filter-summary");
const $otherTagSearch = document.getElementById("other-tag-search");
const $alterationFilterList = document.getElementById("alteration-filter-list");
const $alterationFilterSummary = document.getElementById("alteration-filter-summary");
const $alterationTagSearch = document.getElementById("alteration-tag-search");
const $statusFilterList = document.getElementById("status-filter-list");
const $statusFilterSummary = document.getElementById("status-filter-summary");
const $wrFilterList = document.getElementById("wr-filter-list");
const $wrFilterSummary = document.getElementById("wr-filter-summary");
const $environmentFilterList = document.getElementById("environment-filter-list");
const $environmentFilterSummary = document.getElementById("environment-filter-summary");
const $mapTypeFilterList = document.getElementById("map-type-filter-list");
const $mapTypeFilterSummary = document.getElementById("map-type-filter-summary");
const $clearFilters = document.getElementById("clear-filters");
const $resultsSummary = document.getElementById("results-summary");
const $activeFilters = document.getElementById("active-filters");
const $loading = document.getElementById("loading-state");
const $empty = document.getElementById("empty-state");
const $error = document.getElementById("error-state");
const $pagination = document.getElementById("pagination");
const $progress = document.getElementById("load-progress");
const $progressBar = document.getElementById("load-progress-bar");
const $modalBackdrop = document.getElementById("map-modal-backdrop");
const $modalContent = document.getElementById("map-modal-content");
const $modalClose = document.getElementById("map-modal-close");

function esc(value) {
  const node = document.createElement("span");
  node.textContent = String(value || "");
  return node.innerHTML;
}

function stripFmt(value) {
  return String(value ?? "").replace(NADEO_FMT_RE, "");
}

function escN(value) {
  return esc(stripFmt(value));
}

function resolveDisplayLabel(primaryValue, fallbackValue, emptyFallback = "Unknown") {
  const preferred = String(primaryValue || "").trim();
  if (isUsableDisplayName(preferred, fallbackValue)) return preferred;
  const fallback = String(fallbackValue || "").trim();
  if (isUsableDisplayName(fallback)) return fallback;
  if (fallback) return fallback;
  if (preferred) return preferred;
  return emptyFallback;
}

function fmtTime(ms) {
  if (!ms || ms <= 0) return "\u2014";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function relTime(iso) {
  if (!iso) return "\u2014";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function looksLikeAccountId(value) {
  return UUID_RE.test(String(value || "").trim());
}

function isUsableDisplayName(value, accountId = "") {
  const text = String(value || "").trim();
  if (!text || looksLikeAccountId(text)) return false;
  const id = String(accountId || "").trim().toLowerCase();
  return !id || text.toLowerCase() !== id;
}

function firstMapValue(map, keys = [], fallback = "") {
  if (!map || typeof map !== "object") return fallback;
  for (const key of keys) {
    if (!key) continue;
    const value = map[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function savedMapperName(map, role = "author") {
  const accountId = String(
    firstMapValue(map, role === "submitter" ? ["submitter"] : ["author"], "") || ""
  ).trim();
  const keys =
    role === "submitter"
      ? ["submitter_saved_display_name", "submitterSavedDisplayName"]
      : ["author_saved_display_name", "authorSavedDisplayName"];
  const candidate = firstMapValue(map, keys, "");
  return isUsableDisplayName(candidate, accountId) ? String(candidate).trim() : "";
}

function resolveMapAuthorLabel(map) {
  const accountId = firstMapValue(map, ["author"], "");
  const confirmed =
    firstMapValue(map, ["author_display_name", "authorDisplayName"], "") ||
    getCachedDisplayName(accountId);
  return resolveDisplayLabel(
    confirmed || savedMapperName(map, "author"),
    accountId,
    "Unknown"
  );
}

function collectPendingDisplayNameAccountIds(rows = []) {
  const out = [];
  const seen = new Set();
  const collect = (accountId, displayName) => {
    const id = String(accountId || "").trim().toLowerCase();
    const name = String(displayName || "").trim();
    if (
      !looksLikeAccountId(id) ||
      isUsableDisplayName(name, id) ||
      seen.has(id)
    ) {
      return;
    }
    seen.add(id);
    out.push(id);
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    collect(row?.author, row?.author_display_name ?? row?.authorDisplayName);
    collect(row?.submitter, row?.submitter_display_name ?? row?.submitterDisplayName);
    collect(
      row?.wr_account_id ?? row?.wrAccountId ?? row?.wr_holder ?? row?.wrHolder,
      looksLikeAccountId(row?.wr_holder ?? row?.wrHolder) ? "" : row?.wr_holder ?? row?.wrHolder
    );
  }

  return out;
}

function rememberMapDisplayNames(rows = []) {
  const namesByAccountId = {};
  const collect = (accountId, displayName) => {
    const id = String(accountId || "").trim().toLowerCase();
    const name = String(displayName || "").trim();
    if (!looksLikeAccountId(id) || !isUsableDisplayName(name, id)) {
      return;
    }
    namesByAccountId[id] = name;
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    collect(row?.author, row?.author_display_name ?? row?.authorDisplayName);
    collect(row?.submitter, row?.submitter_display_name ?? row?.submitterDisplayName);
    collect(
      row?.wr_account_id ?? row?.wrAccountId,
      looksLikeAccountId(row?.wr_holder ?? row?.wrHolder) ? "" : row?.wr_holder ?? row?.wrHolder
    );
  }
  rememberResolvedDisplayNames(namesByAccountId);
}

function clearDisplayNameRefresh({ reset = true } = {}) {
  if (state.displayNameRefresh.timer) {
    clearTimeout(state.displayNameRefresh.timer);
    state.displayNameRefresh.timer = null;
  }
  if (reset) {
    state.displayNameRefresh.attempts = 0;
    state.displayNameRefresh.key = "";
  }
}

function queuePriorityDisplayNameLookups(accountIds = []) {
  const pendingAccountIds = uniqueList(accountIds)
    .map((accountId) => String(accountId || "").trim().toLowerCase())
    .filter((accountId) => looksLikeAccountId(accountId));
  if (!pendingAccountIds.length) return Promise.resolve(null);
  return postJson("/api/v1/public/display-names/queue", {
    accountIds: pendingAccountIds,
  }).catch(() => null);
}

function resolvePriorityDisplayNames(accountIds = []) {
  const pendingAccountIds = uniqueList(accountIds)
    .map((accountId) => String(accountId || "").trim().toLowerCase())
    .filter((accountId) => looksLikeAccountId(accountId));
  if (!pendingAccountIds.length) return Promise.resolve({});
  const cachedNamesByAccountId = getCachedDisplayNamesForAccountIds(pendingAccountIds);
  const missingAccountIds = pendingAccountIds.filter((accountId) => !cachedNamesByAccountId[accountId]);
  if (!missingAccountIds.length) return Promise.resolve(cachedNamesByAccountId);

  return postJson("/api/v1/public/display-names/resolve", {
    accountIds: missingAccountIds,
  })
    .then((payload) => {
      const resolvedNamesByAccountId =
        payload?.namesByAccountId && typeof payload.namesByAccountId === "object"
          ? payload.namesByAccountId
          : {};
      const remembered = rememberResolvedDisplayNames(resolvedNamesByAccountId);
      return {
        ...cachedNamesByAccountId,
        ...remembered,
      };
    })
    .catch(() => cachedNamesByAccountId);
}

function schedulePendingDisplayNameRefresh(accountIds = []) {
  const pendingAccountIds = uniqueList(accountIds)
    .map((accountId) => String(accountId || "").trim().toLowerCase())
    .filter((accountId) => looksLikeAccountId(accountId));
  if (!pendingAccountIds.length) {
    clearDisplayNameRefresh({ reset: true });
    return;
  }

  const refreshKey = pendingAccountIds.join(",");
  if (state.displayNameRefresh.key !== refreshKey) {
    clearDisplayNameRefresh({ reset: false });
    state.displayNameRefresh.key = refreshKey;
    state.displayNameRefresh.attempts = 0;
    void queuePriorityDisplayNameLookups(pendingAccountIds);
  }
  if (
    state.displayNameRefresh.timer ||
    state.displayNameRefresh.attempts >= DISPLAY_NAME_REFRESH_DELAYS_MS.length
  ) {
    return;
  }

  const delayMs =
    DISPLAY_NAME_REFRESH_DELAYS_MS[
      Math.min(state.displayNameRefresh.attempts, DISPLAY_NAME_REFRESH_DELAYS_MS.length - 1)
    ];
  state.displayNameRefresh.attempts += 1;
  state.displayNameRefresh.timer = setTimeout(() => {
    state.displayNameRefresh.timer = null;
    if (state.activeModalMapUid) {
      refreshOpenMapDisplayNames().catch(() => {});
      return;
    }
    refreshVisibleMapDisplayNames().catch(() => {});
  }, delayMs);
}

function fetchJson(url) {
  return fetch(alteredUrl(url), { cache: "no-store" }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
}

function postJson(url, body = {}) {
  return fetch(alteredUrl(url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
}

function setStatValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value ?? "\u2014";
}

function renderStats() {
  setStatValue("stat-maps", state.stats?.total_maps || "\u2014");
  setStatValue("stat-tracked", state.stats?.actively_tracked || "\u2014");
  setStatValue("stat-wr-changes", state.stats?.total_wr_changes || "\u2014");
  setStatValue("stat-last-run", relTime(state.stats?.last_run_at));
}

const STATIC_TAG_OPTIONS = {
  status: [
    { value: "active", label: "Active" },
    { value: "paused", label: "Paused" },
    { value: "idle", label: "Idle" },
  ],
  wr: [
    { value: "with_wr", label: "Has WR" },
    { value: "without_wr", label: "No WR" },
  ],
};

function classifySeasonTagKey(key) {
  const match = SEASON_YEAR_RE.exec(String(key || ""));
  if (match) return { kind: "season-year", base: match[1].toLowerCase(), year: match[2] };
  return { kind: "other" };
}

function getSeasonTagBase(key) {
  const c = classifySeasonTagKey(key);
  return c.kind === "season-year" ? c.base : "";
}

const FILTER_GROUPS = {
  season: {
    includeKey: "seasonInclude",
    excludeKey: "seasonExclude",
    list: $seasonFilterList,
    summary: $seasonFilterSummary,
    searchInput: null,
    getOptions: () => {
      const tags = Array.isArray(state.options?.season_tags) ? state.options.season_tags : [];
      const present = new Set();
      tags.forEach((tag) => {
        const base = getSeasonTagBase(tag.key);
        if (base) present.add(base);
      });
      return SEASON_BASES.filter((base) => present.has(base)).map((base) => ({
        value: base,
        label: SEASON_BASE_LABEL[base],
      }));
    },
    getValue: (row) => row.value,
    getLabel: (row) => row.label,
    getCount: () => 0,
  },
  year: {
    includeKey: "yearInclude",
    excludeKey: "yearExclude",
    list: $yearFilterList,
    summary: $yearFilterSummary,
    searchInput: null,
    getOptions: () => {
      const years = Array.isArray(state.options?.years) ? state.options.years : [];
      return years
        .map((value) => String(value).trim())
        .filter((value) => /^\d{4}$/.test(value))
        .map((value) => ({ value, label: value }));
    },
    getValue: (row) => row.value,
    getLabel: (row) => row.label,
    getCount: () => 0,
  },
  other: {
    includeKey: "otherInclude",
    excludeKey: "otherExclude",
    list: $otherFilterList,
    summary: $otherFilterSummary,
    searchInput: $otherTagSearch,
    getOptions: () => {
      const tags = Array.isArray(state.options?.season_tags) ? state.options.season_tags : [];
      return tags
        .filter((tag) => classifySeasonTagKey(tag.key).kind === "other")
        .map((tag) => ({
          value: tag.key,
          label: tag.label || tag.key,
          count: Number(tag.campaign_count || 0) || 0,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
    getValue: (row) => row.value,
    getLabel: (row) => row.label,
    getCount: (row) => row.count || 0,
  },
  alteration: {
    includeKey: "alterationInclude",
    excludeKey: "alterationExclude",
    list: $alterationFilterList,
    summary: $alterationFilterSummary,
    searchInput: $alterationTagSearch,
    getOptions: () => (Array.isArray(state.options?.alterations) ? state.options.alterations : []),
    getValue: (row) => row.slug,
    getLabel: (row) => row.name,
    getCount: (row) => Number(row.campaign_count || 0) || 0,
  },
  status: {
    includeKey: "statusInclude",
    excludeKey: "statusExclude",
    list: $statusFilterList,
    summary: $statusFilterSummary,
    searchInput: null,
    getOptions: () => STATIC_TAG_OPTIONS.status,
    getValue: (row) => row.value,
    getLabel: (row) => row.label,
    getCount: () => 0,
  },
  wr: {
    includeKey: "wrInclude",
    excludeKey: "wrExclude",
    list: $wrFilterList,
    summary: $wrFilterSummary,
    searchInput: null,
    getOptions: () => STATIC_TAG_OPTIONS.wr,
    getValue: (row) => row.value,
    getLabel: (row) => row.label,
    getCount: () => 0,
  },
  environment: {
    includeKey: "environmentInclude",
    excludeKey: "environmentExclude",
    list: $environmentFilterList,
    summary: $environmentFilterSummary,
    searchInput: null,
    getOptions: () =>
      (Array.isArray(state.options?.environments) ? state.options.environments : []).map((value) => ({
        value,
        label: value,
      })),
    getValue: (row) => row.value,
    getLabel: (row) => row.label,
    getCount: () => 0,
  },
  mapType: {
    includeKey: "mapTypeInclude",
    excludeKey: "mapTypeExclude",
    list: $mapTypeFilterList,
    summary: $mapTypeFilterSummary,
    searchInput: null,
    getOptions: () =>
      (Array.isArray(state.options?.map_types) ? state.options.map_types : []).map((value) => ({
        value,
        label: value,
      })),
    getValue: (row) => row.value,
    getLabel: (row) => row.label,
    getCount: () => 0,
  },
};

function uniqueList(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).map((value) => String(value || "").trim()).filter(Boolean))];
}

function parseListParam(params, key) {
  return uniqueList(String(params.get(key) || "").split(","));
}

function normalizeLegacySeasonKey(season, year) {
  const seasonKey = String(season || "").trim().toLowerCase();
  const yearText = String(year || "").trim();
  if (!seasonKey) return "";
  if (yearText && /^\d{4}$/.test(yearText)) return `${seasonKey}-${yearText}`;
  return seasonKey;
}

function getFilterGroupState(group) {
  const config = FILTER_GROUPS[group];
  if (!config) return { include: [], exclude: [] };
  return {
    include: Array.isArray(state.filters[config.includeKey]) ? state.filters[config.includeKey] : [],
    exclude: Array.isArray(state.filters[config.excludeKey]) ? state.filters[config.excludeKey] : [],
  };
}

function getTagSelectionState(group, value) {
  const { include, exclude } = getFilterGroupState(group);
  if (include.includes(value)) return "include";
  if (exclude.includes(value)) return "exclude";
  return "off";
}

function setTagSelectionState(group, value, nextState) {
  const config = FILTER_GROUPS[group];
  if (!config) return;
  const include = getFilterGroupState(group).include.filter((item) => item !== value);
  const exclude = getFilterGroupState(group).exclude.filter((item) => item !== value);
  if (nextState === "include") include.push(value);
  if (nextState === "exclude") exclude.push(value);
  state.filters[config.includeKey] = uniqueList(include);
  state.filters[config.excludeKey] = uniqueList(exclude);
}

function toggleTagSelection(group, value, mode) {
  const currentState = getTagSelectionState(group, value);
  setTagSelectionState(group, value, currentState === mode ? "off" : mode);
}

function summarizeGroup(group) {
  const config = FILTER_GROUPS[group];
  const { include, exclude } = getFilterGroupState(group);
  if (!include.length && !exclude.length) return "All";

  const labelMap = new Map(
    config.getOptions().map((row) => [String(config.getValue(row) || ""), String(config.getLabel(row) || "")])
  );
  const labelFor = (value) => labelMap.get(String(value)) || String(value);

  const totalSelected = include.length + exclude.length;
  if (totalSelected <= 2) {
    const parts = [
      ...include.map((value) => labelFor(value)),
      ...exclude.map((value) => `−${labelFor(value)}`),
    ];
    return parts.join(", ");
  }
  const segments = [];
  if (include.length) segments.push(`${include.length} included`);
  if (exclude.length) segments.push(`${exclude.length} excluded`);
  return segments.join(" · ");
}

function getActiveFilterCount() {
  return Object.values(FILTER_GROUPS).reduce((sum, config) => {
    const include = Array.isArray(state.filters[config.includeKey]) ? state.filters[config.includeKey].length : 0;
    const exclude = Array.isArray(state.filters[config.excludeKey]) ? state.filters[config.excludeKey].length : 0;
    return sum + include + exclude;
  }, 0);
}

function hasAnyFilterActive() {
  return Boolean(
    state.filters.q ||
    state.filters.mapNumber ||
    getActiveFilterCount() > 0
  );
}

function renderDropdownStates() {
  document.querySelectorAll(".filter-dropdown").forEach((node) => {
    const key = node.dataset.dropdownKey || "";
    const isOpen = state.openDropdown === key;
    node.classList.toggle("is-open", isOpen);
    const trigger = node.querySelector(".filter-dropdown-trigger");
    if (trigger) trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
}

function setOpenDropdown(group) {
  state.openDropdown = group || null;
  renderDropdownStates();
}

function toggleDropdown(group) {
  setOpenDropdown(state.openDropdown === group ? null : group);
}

function renderFilterToggle() {
  if (!$filterToggle || !$filterPanel) return;
  const count = getActiveFilterCount();
  const $badge = document.getElementById("filter-toggle-badge");
  if ($badge) {
    if (count > 0) {
      $badge.textContent = String(count);
      $badge.hidden = false;
    } else {
      $badge.hidden = true;
    }
  }
  $filterToggle.classList.toggle("has-active", count > 0);
  $filterToggle.setAttribute("aria-expanded", state.filterPanelOpen ? "true" : "false");
  $filterPanel.hidden = !state.filterPanelOpen;
  if ($clearFilters) $clearFilters.hidden = !hasAnyFilterActive();
}

function renderFilterItemHtml(group, row, config) {
  const value = String(config.getValue(row) || "");
  const label = String(config.getLabel(row) || value);
  const count = Number(config.getCount(row) || 0) || 0;
  const selection = getTagSelectionState(group, value);
  return `
    <div class="filter-item" data-filter-group="${esc(group)}" data-value="${esc(value)}">
      <span class="filter-item-label" title="${esc(label)}">${esc(label)}</span>
      ${count ? `<span class="filter-item-count">${esc(count)}</span>` : `<span class="filter-item-count" hidden></span>`}
      <button type="button" class="filter-action-btn ${selection === "include" ? "is-active" : ""}" data-filter-group="${esc(group)}" data-value="${esc(value)}" data-mode="include" aria-label="Include ${esc(label)}">+</button>
      <button type="button" class="filter-action-btn ${selection === "exclude" ? "is-active" : ""}" data-filter-group="${esc(group)}" data-value="${esc(value)}" data-mode="exclude" aria-label="Exclude ${esc(label)}">-</button>
    </div>
  `;
}

function renderAlterationTagGroup(config, options) {
  const sectionMap = new Map();
  options.forEach((row) => {
    const name = String(row?.category || "").trim() || "Unsorted";
    const order =
      row?.category_order !== null &&
      row?.category_order !== undefined &&
      Number.isFinite(Number(row.category_order))
        ? Number(row.category_order)
        : Number.MAX_SAFE_INTEGER;
    if (!sectionMap.has(name)) {
      sectionMap.set(name, {
        name,
        order,
        items: [],
      });
    }
    sectionMap.get(name).items.push(row);
  });

  const sections = [...sectionMap.values()].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order;
    return left.name.localeCompare(right.name);
  });

  config.list.classList.add("filter-list--alteration-sections");
  config.list.innerHTML = sections
    .map(
      (section) => `
        <section class="filter-section">
          <h4 class="filter-section-title">${esc(section.name)}</h4>
          <div class="filter-section-list">
            ${section.items.map((row) => renderFilterItemHtml("alteration", row, config)).join("")}
          </div>
        </section>
      `
    )
    .join("");
}

function renderTagGroup(group) {
  const config = FILTER_GROUPS[group];
  if (!config?.list) return;
  const query = String(state.tagSearch[group] || "").trim().toLowerCase();
  const options = config
    .getOptions()
    .filter((row) => {
      const value = String(config.getValue(row) || "");
      const label = String(config.getLabel(row) || "");
      if (!value || !label) return false;
      if (!query) return true;
      return label.toLowerCase().includes(query) || value.toLowerCase().includes(query);
    });

  config.summary.textContent = summarizeGroup(group);
  const { include, exclude } = getFilterGroupState(group);
  const trigger = config.summary.closest(".filter-dropdown")?.querySelector(".filter-dropdown-trigger");
  if (trigger) trigger.classList.toggle("has-active", include.length + exclude.length > 0);
  config.list.classList.remove("filter-list--alteration-sections");
  if (!options.length) {
    config.list.innerHTML = '<p class="filter-tag-empty">No tags available.</p>';
    return;
  }

  if (group === "alteration") {
    renderAlterationTagGroup(config, options);
    return;
  }

  config.list.innerHTML = options.map((row) => renderFilterItemHtml(group, row, config)).join("");
}

function renderTagFilters() {
  renderFilterToggle();
  Object.keys(FILTER_GROUPS).forEach((group) => renderTagGroup(group));
}

function populateFilterControls() {
  renderTagFilters();
}

function partitionLegacySeasonKeys(legacyKeys) {
  const seasons = new Set();
  const years = new Set();
  const others = new Set();
  uniqueList(legacyKeys).forEach((key) => {
    const c = classifySeasonTagKey(key);
    if (c.kind === "season-year") {
      seasons.add(c.base);
      years.add(c.year);
    } else if (key) {
      others.add(key);
    }
  });
  return { seasons: [...seasons], years: [...years], others: [...others] };
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  state.page = Math.max(1, Number(params.get("page") || 1) || 1);
  const hasSortParam = params.has("sort");
  const hasSeedParam = params.has("seed");
  const sort = params.get("sort") || DEFAULT_MAP_SORT;
  const legacySeasonKey = normalizeLegacySeasonKey(params.get("season"), params.get("year"));
  const legacyWrState =
    params.get("has_wr") === "1" ? "with_wr" : params.get("has_wr") === "0" ? "without_wr" : "";

  const legacyInclude = partitionLegacySeasonKeys([
    ...parseListParam(params, "season_keys"),
    legacySeasonKey,
  ]);
  const legacyExclude = partitionLegacySeasonKeys(parseListParam(params, "exclude_season_keys"));

  state.filters = {
    q: params.get("q") || "",
    seasonInclude: uniqueList([...parseListParam(params, "seasons"), ...legacyInclude.seasons]),
    seasonExclude: uniqueList([...parseListParam(params, "exclude_seasons"), ...legacyExclude.seasons]),
    yearInclude: uniqueList([...parseListParam(params, "years"), ...legacyInclude.years]),
    yearExclude: uniqueList([...parseListParam(params, "exclude_years"), ...legacyExclude.years]),
    otherInclude: uniqueList([...parseListParam(params, "others"), ...legacyInclude.others]),
    otherExclude: uniqueList([...parseListParam(params, "exclude_others"), ...legacyExclude.others]),
    alterationInclude: uniqueList([...parseListParam(params, "alterations"), params.get("alteration") || ""]),
    alterationExclude: uniqueList([
      ...parseListParam(params, "exclude_alterations"),
      params.get("exclude_alteration") || "",
    ]),
    statusInclude: uniqueList([...parseListParam(params, "statuses"), params.get("status") || ""]),
    statusExclude: parseListParam(params, "exclude_statuses"),
    wrInclude: uniqueList([...parseListParam(params, "wr_states"), legacyWrState]),
    wrExclude: parseListParam(params, "exclude_wr_states"),
    mapNumber: params.get("map_number") || "",
    environmentInclude: uniqueList([
      ...parseListParam(params, "environments"),
      params.get("environment") || "",
    ]),
    environmentExclude: parseListParam(params, "exclude_environments"),
    mapTypeInclude: uniqueList([
      ...parseListParam(params, "map_types"),
      params.get("map_type") || "",
    ]),
    mapTypeExclude: parseListParam(params, "exclude_map_types"),
    sort,
  };
  state.explicitQuery = {
    sort: hasSortParam,
    seed: hasSeedParam,
  };
  state.randomSeed = sort === "random" ? normalizeSeed(params.get("seed")) || createRandomSeed() : "";
  return {
    map: params.get("map") || "",
  };
}

function syncControlsFromState() {
  if ($searchInput) $searchInput.value = state.filters.q;
  if ($mapNumberFilter) $mapNumberFilter.value = state.filters.mapNumber;
  if ($sortSelect) $sortSelect.value = state.filters.sort;
  if ($alterationTagSearch) $alterationTagSearch.value = state.tagSearch.alteration;
  if ($otherTagSearch) $otherTagSearch.value = state.tagSearch.other;
  renderTagFilters();
}

function writeUrl({ replace = false, map = "" } = {}) {
  const params = new URLSearchParams();
  const sort = state.filters.sort || DEFAULT_MAP_SORT;
  const writeSort = sort !== DEFAULT_MAP_SORT || state.explicitQuery.sort || state.explicitQuery.seed;
  const writeSeed = sort === "random" && state.randomSeed && (state.explicitQuery.sort || state.explicitQuery.seed);
  if (state.filters.q) params.set("q", state.filters.q);
  if (state.filters.seasonInclude.length) params.set("seasons", state.filters.seasonInclude.join(","));
  if (state.filters.seasonExclude.length) params.set("exclude_seasons", state.filters.seasonExclude.join(","));
  if (state.filters.yearInclude.length) params.set("years", state.filters.yearInclude.join(","));
  if (state.filters.yearExclude.length) params.set("exclude_years", state.filters.yearExclude.join(","));
  if (state.filters.otherInclude.length) params.set("others", state.filters.otherInclude.join(","));
  if (state.filters.otherExclude.length) params.set("exclude_others", state.filters.otherExclude.join(","));
  if (state.filters.alterationInclude.length) params.set("alterations", state.filters.alterationInclude.join(","));
  if (state.filters.alterationExclude.length) params.set("exclude_alterations", state.filters.alterationExclude.join(","));
  if (state.filters.statusInclude.length) params.set("statuses", state.filters.statusInclude.join(","));
  if (state.filters.statusExclude.length) params.set("exclude_statuses", state.filters.statusExclude.join(","));
  if (state.filters.wrInclude.length) params.set("wr_states", state.filters.wrInclude.join(","));
  if (state.filters.wrExclude.length) params.set("exclude_wr_states", state.filters.wrExclude.join(","));
  if (state.filters.mapNumber) params.set("map_number", String(state.filters.mapNumber));
  if (state.filters.environmentInclude.length) params.set("environments", state.filters.environmentInclude.join(","));
  if (state.filters.environmentExclude.length) params.set("exclude_environments", state.filters.environmentExclude.join(","));
  if (state.filters.mapTypeInclude.length) params.set("map_types", state.filters.mapTypeInclude.join(","));
  if (state.filters.mapTypeExclude.length) params.set("exclude_map_types", state.filters.mapTypeExclude.join(","));
  if (writeSort) params.set("sort", sort);
  if (state.page > 1) params.set("page", String(state.page));
  if (writeSeed) params.set("seed", state.randomSeed);
  if (map) params.set("map", map);
  const target = params.toString() ? `?${params.toString()}` : window.location.pathname;
  const method = replace ? "replaceState" : "pushState";
  history[method]({ page: state.page, filters: state.filters, map }, "", target);
}

function resolveSeasonCampaignIds(keys = []) {
  const seasonTags = Array.isArray(state.options?.season_tags) ? state.options.season_tags : [];
  const campaignIds = new Set();
  uniqueList(keys).forEach((key) => {
    const match = seasonTags.find((row) => row.key === key);
    (Array.isArray(match?.campaign_ids) ? match.campaign_ids : []).forEach((campaignId) => {
      const id = String(campaignId || "").trim();
      if (id) campaignIds.add(id);
    });
  });
  return [...campaignIds];
}

function resolveCombinedSeasonKeys(side = "include") {
  const seasonTags = Array.isArray(state.options?.season_tags) ? state.options.season_tags : [];
  const seasons = state.filters[side === "include" ? "seasonInclude" : "seasonExclude"];
  const years = (state.filters[side === "include" ? "yearInclude" : "yearExclude"] || []).map(String);
  const others = state.filters[side === "include" ? "otherInclude" : "otherExclude"];

  const matched = new Set();
  if (seasons.length || years.length) {
    seasonTags.forEach((tag) => {
      const c = classifySeasonTagKey(tag.key);
      if (c.kind !== "season-year") return;
      const seasonOk = !seasons.length || seasons.includes(c.base);
      const yearOk = !years.length || years.includes(c.year);
      if (seasonOk && yearOk) matched.add(tag.key);
    });
  }
  others.forEach((key) => matched.add(String(key)));
  return [...matched];
}

function buildMapQuery() {
  const seasonIncludeCampaignIds = resolveSeasonCampaignIds(resolveCombinedSeasonKeys("include"));
  const seasonExcludeCampaignIds = resolveSeasonCampaignIds(resolveCombinedSeasonKeys("exclude"));
  return new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String((state.page - 1) * PAGE_SIZE),
    sort: state.filters.sort || DEFAULT_MAP_SORT,
    ...(state.filters.sort === "random" && state.randomSeed ? { seed: state.randomSeed } : {}),
    ...(state.filters.q ? { q: state.filters.q } : {}),
    ...(seasonIncludeCampaignIds.length ? { campaign_ids: seasonIncludeCampaignIds.join(",") } : {}),
    ...(seasonExcludeCampaignIds.length ? { exclude_campaign_ids: seasonExcludeCampaignIds.join(",") } : {}),
    ...(state.filters.alterationInclude.length ? { alteration_slugs: state.filters.alterationInclude.join(",") } : {}),
    ...(state.filters.alterationExclude.length
      ? { exclude_alteration_slugs: state.filters.alterationExclude.join(",") }
      : {}),
    ...(state.filters.statusInclude.length ? { statuses: state.filters.statusInclude.join(",") } : {}),
    ...(state.filters.statusExclude.length ? { exclude_statuses: state.filters.statusExclude.join(",") } : {}),
    ...(state.filters.wrInclude.length ? { wr_states: state.filters.wrInclude.join(",") } : {}),
    ...(state.filters.wrExclude.length ? { exclude_wr_states: state.filters.wrExclude.join(",") } : {}),
    ...(state.filters.mapNumber ? { map_number: state.filters.mapNumber } : {}),
    ...(state.filters.environmentInclude.length
      ? { environments: state.filters.environmentInclude.join(",") }
      : {}),
    ...(state.filters.environmentExclude.length
      ? { exclude_environments: state.filters.environmentExclude.join(",") }
      : {}),
    ...(state.filters.mapTypeInclude.length ? { map_types: state.filters.mapTypeInclude.join(",") } : {}),
    ...(state.filters.mapTypeExclude.length
      ? { exclude_map_types: state.filters.mapTypeExclude.join(",") }
      : {}),
  });
}

function startProgress() {
  if (!$progress || !$progressBar) return;
  $progress.hidden = false;
  $progressBar.classList.add("is-loading");
  $progressBar.style.width = "100%";
}

function stopProgress() {
  if (!$progress || !$progressBar) return;
  $progress.hidden = true;
  $progressBar.classList.remove("is-loading");
  $progressBar.style.width = "0%";
}

function renderFilterChips() {
  const chips = [];
  const pushTagChips = (group, mode, values, options = []) => {
    const optionMap = new Map(
      options.map((row) => [String(row.key ?? row.slug ?? row.value ?? row.label), row.label ?? row.name ?? row.value])
    );
    values.forEach((value) => {
      const chipValue = String(value || "");
      const label = optionMap.get(chipValue) || chipValue;
      chips.push({ group, mode, value: chipValue, label });
    });
  };

  if (state.filters.q) chips.push({ kind: "q", label: `Search: ${state.filters.q}` });
  const seasonOpts = SEASON_BASES.map((b) => ({ value: b, label: SEASON_BASE_LABEL[b] }));
  const yearOpts = (state.options?.years || []).map((y) => ({ value: String(y), label: String(y) }));
  const otherOpts = (state.options?.season_tags || [])
    .filter((tag) => classifySeasonTagKey(tag.key).kind === "other")
    .map((tag) => ({ value: tag.key, label: tag.label || tag.key }));
  pushTagChips("season", "include", state.filters.seasonInclude, seasonOpts);
  pushTagChips("season", "exclude", state.filters.seasonExclude, seasonOpts);
  pushTagChips("year", "include", state.filters.yearInclude, yearOpts);
  pushTagChips("year", "exclude", state.filters.yearExclude, yearOpts);
  pushTagChips("other", "include", state.filters.otherInclude, otherOpts);
  pushTagChips("other", "exclude", state.filters.otherExclude, otherOpts);
  pushTagChips("alteration", "include", state.filters.alterationInclude, state.options?.alterations || []);
  pushTagChips("alteration", "exclude", state.filters.alterationExclude, state.options?.alterations || []);
  pushTagChips("status", "include", state.filters.statusInclude, STATIC_TAG_OPTIONS.status);
  pushTagChips("status", "exclude", state.filters.statusExclude, STATIC_TAG_OPTIONS.status);
  pushTagChips("wr", "include", state.filters.wrInclude, STATIC_TAG_OPTIONS.wr);
  pushTagChips("wr", "exclude", state.filters.wrExclude, STATIC_TAG_OPTIONS.wr);
  pushTagChips(
    "environment",
    "include",
    state.filters.environmentInclude,
    (state.options?.environments || []).map((value) => ({ value, label: value }))
  );
  pushTagChips(
    "environment",
    "exclude",
    state.filters.environmentExclude,
    (state.options?.environments || []).map((value) => ({ value, label: value }))
  );
  pushTagChips(
    "mapType",
    "include",
    state.filters.mapTypeInclude,
    (state.options?.map_types || []).map((value) => ({ value, label: value }))
  );
  pushTagChips(
    "mapType",
    "exclude",
    state.filters.mapTypeExclude,
    (state.options?.map_types || []).map((value) => ({ value, label: value }))
  );
  if (state.filters.mapNumber) chips.push({ kind: "mapNumber", label: `Map #: ${state.filters.mapNumber}` });

  if (!chips.length) {
    $activeFilters.hidden = true;
    $activeFilters.innerHTML = "";
    return;
  }

  $activeFilters.hidden = false;
  $activeFilters.innerHTML = chips
    .map((chip) => {
      if (chip.kind === "q") {
        return `<button type="button" class="filter-chip" data-chip-kind="q" aria-label="Remove search filter"><span>${esc(chip.label)}</span><span class="filter-chip-remove" aria-hidden="true">×</span></button>`;
      }
      if (chip.kind === "mapNumber") {
        return `<button type="button" class="filter-chip" data-chip-kind="mapNumber" aria-label="Remove map number filter"><span>${esc(chip.label)}</span><span class="filter-chip-remove" aria-hidden="true">×</span></button>`;
      }
      const prefix = chip.mode === "include" ? "+" : "−";
      return `<button type="button" class="filter-chip" data-mode="${esc(chip.mode)}" data-chip-kind="tag" data-chip-group="${esc(chip.group)}" data-chip-value="${esc(chip.value)}" aria-label="Remove ${esc(chip.label)} filter"><span class="filter-chip-prefix">${prefix}</span><span>${esc(chip.label)}</span><span class="filter-chip-remove" aria-hidden="true">×</span></button>`;
    })
    .join("");
}

function mapCardHtml(map) {
  const tracking = map.tracking_status || "idle";
  const trackingClass =
    tracking === "active" || tracking === "live" ? "active" : tracking === "paused" ? "paused" : "idle";
  const authorLabel = resolveMapAuthorLabel(map);
  const thumb = map.thumbnail_url
    ? `<img src="${esc(map.thumbnail_url)}" alt="" loading="lazy" />`
    : "";
  const wrBlock = map.wr_ms
    ? `<span class="wr-time">${fmtTime(map.wr_ms)}</span><span class="wr-holder">${escN(map.wr_holder)}</span>`
    : `<span class="wr-empty">No WR data</span>`;
  const metaBits = [
    map.season_label || "",
    map.alteration || "",
    map.map_number ? `#${map.map_number}` : "",
    map.change_count ? `${map.change_count} changes` : "",
  ].filter(Boolean);

  return `
    <article class="map-card" data-uid="${esc(map.map_uid)}">
      <div class="map-thumb">
        ${thumb}
        <span class="map-status map-status-${trackingClass}">${esc(tracking)}</span>
      </div>
      <div class="map-body">
        <h3 class="map-name" title="${escN(map.name)}">${escN(map.name || "Untitled")}</h3>
        <p class="map-author">by ${escN(authorLabel)}</p>
        <div class="map-wr">${wrBlock}</div>
        <div class="map-medals">
          <span class="medal medal-at">${fmtTime(map.author_time)}</span>
          <span class="medal medal-gold">${fmtTime(map.gold_time)}</span>
          <span class="medal medal-silver">${fmtTime(map.silver_time)}</span>
          <span class="medal medal-bronze">${fmtTime(map.bronze_time)}</span>
        </div>
        ${
          metaBits.length
            ? `<div class="map-card-meta">${metaBits.map((bit) => `<span>${esc(bit)}</span>`).join("")}</div>`
            : ""
        }
      </div>
    </article>
  `;
}

function renderPagination() {
  if (!$pagination) return;
  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  if (state.total <= PAGE_SIZE) {
    $pagination.hidden = true;
    $pagination.innerHTML = "";
    return;
  }

  $pagination.hidden = false;
  const start = (state.page - 1) * PAGE_SIZE + 1;
  const end = Math.min(state.page * PAGE_SIZE, state.total);
  let html = `<span class="page-info">Showing ${start}-${end} of ${state.total}</span><div class="page-buttons">`;
  html += `<button class="page-btn" data-page="prev" ${state.page <= 1 ? "disabled" : ""}>Prev</button>`;

  const totalPagesToShow = totalPages > 7 ? [1, state.page - 1, state.page, state.page + 1, totalPages] : [];
  for (let index = 1; index <= totalPages; index += 1) {
    if (totalPages > 7 && !totalPagesToShow.includes(index)) {
      if (index === 2 || index === totalPages - 1) {
        html += '<span class="page-ellipsis">...</span>';
      }
      continue;
    }
    html += `<button class="page-btn ${index === state.page ? "active" : ""}" data-page="${index}">${index}</button>`;
  }

  html += `<button class="page-btn" data-page="next" ${state.page >= totalPages ? "disabled" : ""}>Next</button></div>`;
  $pagination.innerHTML = html;

  $pagination.querySelectorAll(".page-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const pageValue = button.dataset.page;
      if (pageValue === "prev") state.page = Math.max(1, state.page - 1);
      else if (pageValue === "next") state.page = Math.min(totalPages, state.page + 1);
      else state.page = Math.max(1, Number(pageValue) || 1);
      await loadMaps({ replaceUrl: false });
      $mapGrid.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderPage() {
  renderFilterChips();
  renderFilterToggle();

  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  const start = state.total ? (state.page - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(state.page * PAGE_SIZE, state.total);
  $resultsSummary.textContent = state.total
    ? `Showing ${start}-${end} of ${state.total} maps${totalPages > 1 ? ` · page ${state.page}/${totalPages}` : ""}`
    : "No maps match the current filters.";

  if (!state.maps.length) {
    $mapGrid.hidden = true;
    $mapGrid.innerHTML = "";
    $empty.hidden = false;
    renderPagination();
    return;
  }

  $empty.hidden = true;
  $mapGrid.hidden = false;
  $mapGrid.innerHTML = state.maps.map((map) => mapCardHtml(map)).join("");
  renderPagination();
}

function numberMapValue(map, keys = []) {
  return Number(firstMapValue(map, keys, 0) || 0);
}

function getMapUidValue(map) {
  return String(firstMapValue(map, ["map_uid", "mapUid", "uid"], "") || "").trim();
}

function getMapNumberLabel(map) {
  const direct = firstMapValue(map, ["map_number", "mapNumber"], "");
  if (direct) return direct;
  const mapnumber = firstMapValue(map, ["mapnumber"], []);
  if (Array.isArray(mapnumber) && mapnumber.length) return mapnumber.join(".");
  const slot = firstMapValue(map, ["slot"], "");
  if (slot) return slot;
  return "\u2014";
}

function getChangeCountValue(map) {
  const direct = firstMapValue(map, ["change_count", "changeCount"], "");
  if (direct !== "") return direct;
  const wrHistory = firstMapValue(map, ["wrHistory"], []);
  return Array.isArray(wrHistory) ? wrHistory.length : 0;
}

function getResolvedDisplayName(namesByAccountId = {}, accountId = "") {
  const id = String(accountId || "").trim().toLowerCase();
  if (!looksLikeAccountId(id)) return "";
  const displayName =
    namesByAccountId?.[id] ??
    namesByAccountId?.[String(accountId || "").trim()] ??
    "";
  return isUsableDisplayName(displayName, id) ? String(displayName).trim() : "";
}

function applyResolvedDisplayNamesToMap(map, namesByAccountId = {}) {
  if (!map || !namesByAccountId || typeof namesByAccountId !== "object") {
    return { map, changed: false };
  }
  const next = { ...map };
  let changed = false;
  const apply = (accountKeys, snakeDisplayKey, camelDisplayKey) => {
    const accountId = String(firstMapValue(next, accountKeys, "") || "").trim().toLowerCase();
    const displayName = getResolvedDisplayName(namesByAccountId, accountId);
    if (!displayName) return;
    if (next[snakeDisplayKey] !== displayName || next[camelDisplayKey] !== displayName) {
      changed = true;
    }
    next[snakeDisplayKey] = displayName;
    next[camelDisplayKey] = displayName;
  };

  apply(["author"], "author_display_name", "authorDisplayName");
  apply(["submitter"], "submitter_display_name", "submitterDisplayName");
  const wrAccountId =
    String(firstMapValue(next, ["wr_account_id", "wrAccountId"], "") || "").trim().toLowerCase() ||
    String(firstMapValue(next, ["wr_holder", "wrHolder"], "") || "").trim().toLowerCase();
  const wrDisplayName = getResolvedDisplayName(namesByAccountId, wrAccountId);
  if (wrDisplayName) {
    if (next.wr_holder !== wrDisplayName || next.wrHolder !== wrDisplayName) {
      changed = true;
    }
    next.wr_holder = wrDisplayName;
    next.wrHolder = wrDisplayName;
    if (!next.wr_account_id) next.wr_account_id = wrAccountId;
    if (!next.wrAccountId) next.wrAccountId = wrAccountId;
  }
  return { map: changed ? next : map, changed };
}

function applyResolvedDisplayNamesToState(namesByAccountId = {}) {
  let changed = false;
  state.maps = state.maps.map((map) => {
    const result = applyResolvedDisplayNamesToMap(map, namesByAccountId);
    if (result.changed) changed = true;
    return result.map;
  });
  return changed;
}

function applyCachedDisplayNamesToState() {
  const accountIds = collectPendingDisplayNameAccountIds(state.maps);
  if (!accountIds.length) return false;
  return applyResolvedDisplayNamesToState(getCachedDisplayNamesForAccountIds(accountIds));
}

function applyCachedDisplayNamesToMap(map) {
  const accountIds = collectPendingDisplayNameAccountIds(map ? [map] : []);
  if (!accountIds.length) return { map, changed: false };
  return applyResolvedDisplayNamesToMap(map, getCachedDisplayNamesForAccountIds(accountIds));
}

function mergePublicMapDetailIntoState(map) {
  const uid = getMapUidValue(map).toLowerCase();
  if (!uid) return false;
  const index = state.maps.findIndex((item) => getMapUidValue(item).toLowerCase() === uid);
  if (index < 0) return false;

  const patch = { map_uid: getMapUidValue(map) };
  const put = (key, value) => {
    if (value === undefined || value === null) return;
    if (typeof value === "string" && !value.trim()) return;
    patch[key] = value;
  };

  put("name", firstMapValue(map, ["name"], ""));
  put("thumbnail_url", firstMapValue(map, ["thumbnail_url", "thumbnailUrl"], ""));
  put("author", firstMapValue(map, ["author"], ""));
  put("author_display_name", firstMapValue(map, ["author_display_name", "authorDisplayName"], ""));
  put(
    "author_saved_display_name",
    firstMapValue(map, ["author_saved_display_name", "authorSavedDisplayName"], "")
  );
  put("submitter", firstMapValue(map, ["submitter"], ""));
  put("submitter_display_name", firstMapValue(map, ["submitter_display_name", "submitterDisplayName"], ""));
  put(
    "submitter_saved_display_name",
    firstMapValue(map, ["submitter_saved_display_name", "submitterSavedDisplayName"], "")
  );
  put("author_time", numberMapValue(map, ["author_time", "authorTime", "authorScore"]));
  put("gold_time", numberMapValue(map, ["gold_time", "goldTime", "goldScore"]));
  put("silver_time", numberMapValue(map, ["silver_time", "silverTime", "silverScore"]));
  put("bronze_time", numberMapValue(map, ["bronze_time", "bronzeTime", "bronzeScore"]));
  put("wr_ms", numberMapValue(map, ["wr_ms", "wrMs"]));
  put("wr_holder", firstMapValue(map, ["wr_holder", "wrHolder"], ""));
  put("wr_updated_at", firstMapValue(map, ["wr_updated_at", "wrUpdatedAt"], ""));
  put("campaign_name", firstMapValue(map, ["campaign_name", "campaignName"], ""));
  put("season_label", firstMapValue(map, ["season_label", "seasonLabel", "season"], ""));
  put("alteration", firstMapValue(map, ["alteration"], ""));
  put("map_number", getMapNumberLabel(map) === "\u2014" ? "" : getMapNumberLabel(map));
  put("change_count", getChangeCountValue(map));
  put("tracking_status", firstMapValue(map, ["tracking_status", "trackingStatus", "status"], ""));

  state.maps[index] = {
    ...state.maps[index],
    ...patch,
  };
  return true;
}

function renderMapModal(map, { updateUrl = true, mapUid = "" } = {}) {
  if (!map || !$modalContent) return;

  const uid = getMapUidValue(map) || String(mapUid || "").trim();
  const tracking = firstMapValue(map, ["tracking_status", "trackingStatus", "status"], "idle") || "idle";
  const trackingClass =
    tracking === "active" || tracking === "live" ? "active" : tracking === "paused" ? "paused" : "idle";
  const authorLabel = resolveMapAuthorLabel(map);
  const thumbnailUrl = firstMapValue(map, ["thumbnail_url", "thumbnailUrl"], "");
  const thumb = thumbnailUrl
    ? `<img class="modal-thumb" src="${esc(thumbnailUrl)}" alt="" />`
    : '<div class="modal-thumb modal-thumb-empty"></div>';
  const wrMs = numberMapValue(map, ["wr_ms", "wrMs"]);
  const wrHolder = firstMapValue(map, ["wr_holder", "wrHolder"], "");
  const wrUpdatedAt = firstMapValue(map, ["wr_updated_at", "wrUpdatedAt"], "");
  const wrSection = wrMs
    ? `<div class="modal-wr"><div class="modal-wr-row"><span class="modal-wr-rank">1</span><div class="modal-wr-detail"><span class="modal-wr-holder">${escN(wrHolder)}</span><span class="modal-wr-ago">${relTime(wrUpdatedAt)}</span></div><span class="modal-wr-time">${fmtTime(wrMs)}</span></div></div>`
    : '<div class="modal-wr modal-wr-empty"><span>No WR data recorded yet</span></div>';
  const campaignName = firstMapValue(map, ["campaign_name", "campaignName"], "");
  const seasonLabel = firstMapValue(map, ["season_label", "seasonLabel", "season"], "");
  const alteration = firstMapValue(map, ["alteration"], "");

  $modalContent.innerHTML = `
    <div class="modal-hero">
      ${thumb}
      <div class="modal-info">
        <h2 class="modal-name">${escN(firstMapValue(map, ["name"], "Untitled") || "Untitled")}</h2>
        <p class="modal-author">by ${escN(authorLabel)}</p>
        <div class="modal-tags">
          ${campaignName ? `<span class="modal-campaign">${escN(campaignName)}</span>` : ""}
          ${seasonLabel ? `<span class="modal-campaign">${esc(seasonLabel)}</span>` : ""}
          ${alteration ? `<span class="modal-campaign">${esc(alteration)}</span>` : ""}
          <span class="map-status map-status-${trackingClass}" style="position:static">${esc(tracking)}</span>
        </div>
      </div>
    </div>
    <div class="modal-medals">
      <div class="modal-medal modal-medal-at"><span class="modal-medal-label">Author</span><span class="modal-medal-time">${fmtTime(numberMapValue(map, ["author_time", "authorTime", "authorScore"]))}</span></div>
      <div class="modal-medal modal-medal-gold"><span class="modal-medal-label">Gold</span><span class="modal-medal-time">${fmtTime(numberMapValue(map, ["gold_time", "goldTime", "goldScore"]))}</span></div>
      <div class="modal-medal modal-medal-silver"><span class="modal-medal-label">Silver</span><span class="modal-medal-time">${fmtTime(numberMapValue(map, ["silver_time", "silverTime", "silverScore"]))}</span></div>
      <div class="modal-medal modal-medal-bronze"><span class="modal-medal-label">Bronze</span><span class="modal-medal-time">${fmtTime(numberMapValue(map, ["bronze_time", "bronzeTime", "bronzeScore"]))}</span></div>
    </div>
    <div class="modal-section">
      <h3 class="modal-section-title">World Record</h3>
      ${wrSection}
    </div>
    <div class="modal-section">
      <h3 class="modal-section-title">Tracking</h3>
      <div class="modal-stats">
        <div class="modal-stat"><span class="modal-stat-value">${esc(getMapNumberLabel(map))}</span><span class="modal-stat-label">Map #</span></div>
        <div class="modal-stat"><span class="modal-stat-value">${esc(getChangeCountValue(map))}</span><span class="modal-stat-label">WR Changes</span></div>
      </div>
    </div>
    <div class="modal-uid"><span>UID:</span> ${esc(uid)}</div>
  `;

  $modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  if (uid) state.activeModalMapUid = uid;
  if (updateUrl && uid) writeUrl({ replace: false, map: uid });
}

function openMapModal(mapUid, updateUrl = true) {
  const uid = String(mapUid || "").trim();
  const map = state.maps.find((item) => getMapUidValue(item) === uid);
  if (!map || !$modalContent) return;

  state.activeModalMapUid = getMapUidValue(map);
  state.activeModalDetail = null;
  const pendingAccountIds = collectPendingDisplayNameAccountIds([map]);
  if (pendingAccountIds.length) schedulePendingDisplayNameRefresh(pendingAccountIds);
  renderMapModal(map, { updateUrl, mapUid: uid });
}

function closeMapModal(updateUrl = true) {
  if ($modalBackdrop) $modalBackdrop.hidden = true;
  document.body.style.overflow = "";
  state.activeModalMapUid = "";
  state.activeModalDetail = null;
  if (updateUrl) writeUrl({ replace: false });
}

async function openMapModalByUid(mapUid) {
  const uid = String(mapUid || "").trim();
  const existing = state.maps.find((item) => getMapUidValue(item) === uid);
  if (existing) {
    openMapModal(uid, false);
    return;
  }

  const payload = await fetchJson(`${API.mapDetail}/${encodeURIComponent(uid)}`).catch(() => null);
  let map = payload?.map;
  if (!map || !$modalContent) return;
  rememberMapDisplayNames([map]);
  map = applyCachedDisplayNamesToMap(map).map;
  state.activeModalMapUid = getMapUidValue(map) || uid;
  state.activeModalDetail = map;
  const pendingAccountIds = collectPendingDisplayNameAccountIds([map]);
  if (pendingAccountIds.length) schedulePendingDisplayNameRefresh(pendingAccountIds);
  renderMapModal(map, { updateUrl: false, mapUid: uid });
}

async function refreshOpenMapDisplayNames() {
  const mapUid = String(state.activeModalMapUid || "").trim();
  if (!mapUid) {
    await refreshVisibleMapDisplayNames();
    return;
  }

  const currentMap =
    state.activeModalDetail ||
    state.maps.find((item) => getMapUidValue(item).toLowerCase() === mapUid.toLowerCase()) ||
    null;
  const pendingBefore = collectPendingDisplayNameAccountIds(currentMap ? [currentMap] : []);
  const namesByAccountId = await resolvePriorityDisplayNames(
    pendingBefore.length ? pendingBefore : state.displayNameRefresh.key.split(",")
  );
  const stateNamesChanged = applyResolvedDisplayNamesToState(namesByAccountId);
  const resolvedCurrent = applyResolvedDisplayNamesToMap(currentMap, namesByAccountId);
  if (resolvedCurrent?.changed) {
    state.activeModalDetail = resolvedCurrent.map;
  }
  if (stateNamesChanged || resolvedCurrent?.changed) {
    renderPage();
  }
  if (resolvedCurrent?.map && $modalBackdrop && !$modalBackdrop.hidden) {
    renderMapModal(resolvedCurrent.map, { updateUrl: false, mapUid });
  }

  let payload = null;
  try {
    payload = await fetchJson(`${API.mapDetail}/${encodeURIComponent(mapUid)}`);
  } catch {
    const remainingAccountIds = collectPendingDisplayNameAccountIds(
      resolvedCurrent?.map ? [resolvedCurrent.map] : currentMap ? [currentMap] : []
    );
    if (remainingAccountIds.length) {
      schedulePendingDisplayNameRefresh(remainingAccountIds);
      return;
    }
    clearDisplayNameRefresh({ reset: true });
    return;
  }
  rememberMapDisplayNames(payload?.map ? [payload.map] : []);
  const resolved = applyResolvedDisplayNamesToMap(payload?.map, {
    ...getCachedDisplayNamesForAccountIds(collectPendingDisplayNameAccountIds(payload?.map ? [payload.map] : [])),
    ...namesByAccountId,
  });
  const map = resolved.map;
  if (!map) return;

  state.activeModalDetail = map;
  const mergedIntoList = mergePublicMapDetailIntoState(map);
  if (mergedIntoList || stateNamesChanged || resolvedCurrent?.changed) renderPage();
  if ($modalBackdrop && !$modalBackdrop.hidden) {
    renderMapModal(map, { updateUrl: false, mapUid });
  }

  const pendingAccountIds = collectPendingDisplayNameAccountIds([map]);
  if (pendingAccountIds.length) {
    schedulePendingDisplayNameRefresh(pendingAccountIds);
    return;
  }
  clearDisplayNameRefresh({ reset: true });
}

async function refreshVisibleMapDisplayNames() {
  const pendingAccountIds = collectPendingDisplayNameAccountIds(state.maps);
  if (!pendingAccountIds.length) {
    clearDisplayNameRefresh({ reset: true });
    return;
  }

  const namesByAccountId = await resolvePriorityDisplayNames(pendingAccountIds);
  if (applyResolvedDisplayNamesToState(namesByAccountId)) {
    renderPage();
  }

  const remainingAccountIds = collectPendingDisplayNameAccountIds(state.maps);
  if (remainingAccountIds.length) {
    schedulePendingDisplayNameRefresh(remainingAccountIds);
    return;
  }
  clearDisplayNameRefresh({ reset: true });
}

async function loadMaps({ replaceUrl = true, initialMap = "", resetDisplayNameRefresh = true } = {}) {
  if (resetDisplayNameRefresh) {
    clearDisplayNameRefresh({ reset: true });
  }
  startProgress();
  $loading.hidden = false;
  $error.hidden = true;

  try {
    const payload = await fetchJson(`${API.maps}?${buildMapQuery().toString()}`);
    state.maps = Array.isArray(payload?.maps) ? payload.maps : [];
    rememberMapDisplayNames(state.maps);
    applyCachedDisplayNamesToState();
    state.total = Number(payload?.total || payload?.paging?.total || payload?.count || 0);
    renderPage();
    schedulePendingDisplayNameRefresh(collectPendingDisplayNameAccountIds(state.maps));
    $loading.hidden = true;
    if (replaceUrl) writeUrl({ replace: true, map: initialMap });
    if (initialMap) await openMapModalByUid(initialMap);
  } catch {
    $loading.hidden = true;
    $mapGrid.hidden = true;
    $empty.hidden = true;
    $error.hidden = false;
  } finally {
    stopProgress();
  }
}

function resetFilters() {
  state.filters = {
    q: "",
    seasonInclude: [],
    seasonExclude: [],
    yearInclude: [],
    yearExclude: [],
    otherInclude: [],
    otherExclude: [],
    alterationInclude: [],
    alterationExclude: [],
    statusInclude: [],
    statusExclude: [],
    wrInclude: [],
    wrExclude: [],
    mapNumber: "",
    environmentInclude: [],
    environmentExclude: [],
    mapTypeInclude: [],
    mapTypeExclude: [],
    sort: DEFAULT_MAP_SORT,
  };
  state.tagSearch = {
    alteration: "",
    other: "",
  };
  state.openDropdown = null;
  state.randomSeed = createRandomSeed();
  state.explicitQuery = {
    sort: false,
    seed: false,
  };
  state.page = 1;
  syncControlsFromState();
}

let searchTimer = null;

function bindEvents() {
  $searchInput?.addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      state.filters.q = event.target.value || "";
      state.page = 1;
      await loadMaps();
    }, 180);
  });

  $sortSelect?.addEventListener("change", async (event) => {
    state.filters.sort = event.target.value || DEFAULT_MAP_SORT;
    state.randomSeed = state.filters.sort === "random" ? createRandomSeed() : "";
    state.page = 1;
    await loadMaps();
  });

  $mapNumberFilter?.addEventListener("input", async (event) => {
    state.filters.mapNumber = event.target.value || "";
    state.page = 1;
    await loadMaps();
  });

  [
    [$alterationTagSearch, "alteration"],
    [$otherTagSearch, "other"],
  ].forEach(([element, group]) => {
    element?.addEventListener("input", (event) => {
      state.tagSearch[group] = event.target.value || "";
      renderTagGroup(group);
    });
  });

  $filterToggle?.addEventListener("click", () => {
    state.filterPanelOpen = !state.filterPanelOpen;
    if (!state.filterPanelOpen) setOpenDropdown(null);
    renderFilterToggle();
  });

  document.querySelectorAll(".filter-dropdown-trigger").forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const wrap = trigger.closest(".filter-dropdown");
      const key = wrap?.dataset.dropdownKey || "";
      if (key) toggleDropdown(key);
    });
  });

  document.addEventListener("click", (event) => {
    if (!state.openDropdown) return;
    const inside = event.target.closest(".filter-dropdown");
    if (!inside) setOpenDropdown(null);
  });

  Object.entries(FILTER_GROUPS).forEach(([group, config]) => {
    config.list?.addEventListener("click", async (event) => {
      const action = event.target.closest(".filter-action-btn");
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      const value = action.dataset.value || "";
      const mode = action.dataset.mode === "exclude" ? "exclude" : "include";
      if (!value) return;
      toggleTagSelection(group, value, mode);
      state.page = 1;
      renderTagGroup(group);
      renderFilterToggle();
      await loadMaps();
    });
  });

  $clearFilters?.addEventListener("click", async () => {
    resetFilters();
    await loadMaps();
  });

  $activeFilters?.addEventListener("click", async (event) => {
    const chip = event.target.closest(".filter-chip");
    if (!chip) return;
    event.preventDefault();
    const kind = chip.dataset.chipKind;
    if (kind === "q") {
      state.filters.q = "";
      if ($searchInput) $searchInput.value = "";
    } else if (kind === "mapNumber") {
      state.filters.mapNumber = "";
      if ($mapNumberFilter) $mapNumberFilter.value = "";
    } else if (kind === "tag") {
      const group = chip.dataset.chipGroup || "";
      const value = chip.dataset.chipValue || "";
      if (group && value) {
        setTagSelectionState(group, value, "off");
        renderTagGroup(group);
      }
    }
    state.page = 1;
    renderFilterToggle();
    await loadMaps();
  });

  $mapGrid?.addEventListener("click", (event) => {
    const card = event.target.closest(".map-card");
    if (!card) return;
    openMapModal(card.dataset.uid || "");
  });

  $modalClose?.addEventListener("click", () => closeMapModal());
  $modalBackdrop?.addEventListener("click", (event) => {
    if (event.target === $modalBackdrop) closeMapModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if ($modalBackdrop && !$modalBackdrop.hidden) {
      closeMapModal();
      return;
    }
    if (state.openDropdown) setOpenDropdown(null);
  });

  window.addEventListener("popstate", async () => {
    const { map } = readUrlState();
    syncControlsFromState();
    await loadMaps({ replaceUrl: false });
    if (map) await openMapModalByUid(map);
    else if ($modalBackdrop && !$modalBackdrop.hidden) closeMapModal(false);
  });
}

async function bootstrap() {
  const { map } = readUrlState();
  syncControlsFromState();
  bindEvents();

  const [statsPayload, filterPayload] = await Promise.all([
    fetchJson(API.stats).catch(() => null),
    fetchJson(API.filters).catch(() => null),
  ]);
  if (statsPayload) {
    state.stats = statsPayload;
    renderStats();
  }
  if (filterPayload) {
    state.options = filterPayload;
    populateFilterControls();
  }

  await loadMaps({ replaceUrl: true, initialMap: map });
}

bootstrap();
})();
