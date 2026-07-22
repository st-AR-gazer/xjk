import {
  $activeFilters,
  $alterationFilterList,
  $alterationFilterSummary,
  $alterationTagSearch,
  $clearFilters,
  $filterPanel,
  $filterToggle,
  $mapNumberFilter,
  $mapTypeFilterList,
  $mapTypeFilterSummary,
  $otherFilterList,
  $otherFilterSummary,
  $otherTagSearch,
  $searchInput,
  $seasonFilterList,
  $seasonFilterSummary,
  $sortSelect,
  $statusFilterList,
  $statusFilterSummary,
  $wrFilterList,
  $wrFilterSummary,
  $yearFilterList,
  $yearFilterSummary,
  $environmentFilterList,
  $environmentFilterSummary,
} from "./elements.js?v=2";
import { DEFAULT_MAP_SORT, SEASON_BASES, SEASON_BASE_LABEL } from "./config.js?v=2";
import { state } from "./state.js?v=2";
import { classifySeasonTagKey, createRandomSeed, getSeasonTagBase, uniqueList } from "./query.js?v=2";
import { appendElement, clearElement, createElement } from "./dom.js?v=2";

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

export const FILTER_GROUPS = {
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

export function setTagSelectionState(group, value, nextState) {
  const config = FILTER_GROUPS[group];
  if (!config) return;
  const include = getFilterGroupState(group).include.filter((item) => item !== value);
  const exclude = getFilterGroupState(group).exclude.filter((item) => item !== value);
  if (nextState === "include") include.push(value);
  if (nextState === "exclude") exclude.push(value);
  state.filters[config.includeKey] = uniqueList(include);
  state.filters[config.excludeKey] = uniqueList(exclude);
}

export function toggleTagSelection(group, value, mode) {
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
    const parts = [...include.map((value) => labelFor(value)), ...exclude.map((value) => `−${labelFor(value)}`)];
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
  return Boolean(state.filters.q || state.filters.mapNumber || getActiveFilterCount() > 0);
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

export function setOpenDropdown(group) {
  state.openDropdown = group || null;
  renderDropdownStates();
}

export function toggleDropdown(group) {
  setOpenDropdown(state.openDropdown === group ? null : group);
}

export function renderFilterToggle() {
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

function createFilterItem(group, row, config) {
  const value = String(config.getValue(row) || "");
  const label = String(config.getLabel(row) || value);
  const count = Number(config.getCount(row) || 0) || 0;
  const selection = getTagSelectionState(group, value);
  const item = createElement("div", {
    className: "filter-item",
    dataset: { filterGroup: group, value },
  });
  appendElement(item, "span", { className: "filter-item-label", text: label, title: label });
  const countElement = appendElement(item, "span", {
    className: "filter-item-count",
    text: count || "",
  });
  countElement.hidden = !count;

  for (const mode of ["include", "exclude"]) {
    appendElement(item, "button", {
      className: `filter-action-btn ${selection === mode ? "is-active" : ""}`.trim(),
      text: mode === "include" ? "+" : "-",
      attributes: { type: "button", "aria-label": `${mode === "include" ? "Include" : "Exclude"} ${label}` },
      dataset: { filterGroup: group, value, mode },
    });
  }
  return item;
}

function renderAlterationTagGroup(config, options) {
  const sectionMap = new Map();
  options.forEach((row) => {
    const name = String(row?.category || "").trim() || "Unsorted";
    const order =
      row?.category_order !== null && row?.category_order !== undefined && Number.isFinite(Number(row.category_order))
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
  clearElement(config.list);
  sections.forEach((section) => {
    const sectionElement = appendElement(config.list, "section", { className: "filter-section" });
    appendElement(sectionElement, "h4", { className: "filter-section-title", text: section.name });
    const list = appendElement(sectionElement, "div", { className: "filter-section-list" });
    section.items.forEach((row) => list.appendChild(createFilterItem("alteration", row, config)));
  });
}

export function renderTagGroup(group) {
  const config = FILTER_GROUPS[group];
  if (!config?.list) return;
  const query = String(state.tagSearch[group] || "")
    .trim()
    .toLowerCase();
  const options = config.getOptions().filter((row) => {
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
    clearElement(config.list);
    appendElement(config.list, "p", { className: "filter-tag-empty", text: "No tags available." });
    return;
  }

  if (group === "alteration") {
    renderAlterationTagGroup(config, options);
    return;
  }

  clearElement(config.list);
  options.forEach((row) => config.list.appendChild(createFilterItem(group, row, config)));
}

function renderTagFilters() {
  renderFilterToggle();
  Object.keys(FILTER_GROUPS).forEach((group) => renderTagGroup(group));
}

export function populateFilterControls() {
  renderTagFilters();
}

export function syncControlsFromState() {
  if ($searchInput) $searchInput.value = state.filters.q;
  if ($mapNumberFilter) $mapNumberFilter.value = state.filters.mapNumber;
  if ($sortSelect) $sortSelect.value = state.filters.sort;
  if ($alterationTagSearch) $alterationTagSearch.value = state.tagSearch.alteration;
  if ($otherTagSearch) $otherTagSearch.value = state.tagSearch.other;
  renderTagFilters();
}

export function renderFilterChips() {
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
    clearElement($activeFilters);
    return;
  }

  $activeFilters.hidden = false;
  clearElement($activeFilters);
  chips.forEach((chip) => {
    const isTag = !chip.kind;
    const kind = isTag ? "tag" : chip.kind;
    const button = createElement("button", {
      className: "filter-chip",
      attributes: {
        type: "button",
        "aria-label":
          kind === "q"
            ? "Remove search filter"
            : kind === "mapNumber"
              ? "Remove map number filter"
              : `Remove ${chip.label} filter`,
      },
      dataset: {
        chipKind: kind,
        ...(isTag ? { mode: chip.mode, chipGroup: chip.group, chipValue: chip.value } : {}),
      },
    });
    if (isTag) {
      appendElement(button, "span", {
        className: "filter-chip-prefix",
        text: chip.mode === "include" ? "+" : "\u2212",
      });
    }
    appendElement(button, "span", { text: chip.label });
    appendElement(button, "span", {
      className: "filter-chip-remove",
      text: "\u00d7",
      attributes: { "aria-hidden": "true" },
    });
    $activeFilters.appendChild(button);
  });
}

export function resetFilters() {
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
