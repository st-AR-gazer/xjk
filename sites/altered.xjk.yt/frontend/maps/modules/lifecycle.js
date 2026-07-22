import { getJson } from "./api-client.js?v=2";
import { API, DEFAULT_MAP_SORT, PAGE_SIZE } from "./config.js?v=2";
import {
  $activeFilters,
  $alterationTagSearch,
  $clearFilters,
  $empty,
  $error,
  $filterToggle,
  $loading,
  $mapGrid,
  $mapNumberFilter,
  $modalBackdrop,
  $modalClose,
  $modalContent,
  $otherTagSearch,
  $pagination,
  $progress,
  $progressBar,
  $searchInput,
  $sortSelect,
} from "./elements.js?v=2";
import { state } from "./state.js?v=2";
import { relTime } from "./formatters.js?v=2";
import {
  FILTER_GROUPS,
  populateFilterControls,
  renderFilterToggle,
  renderTagGroup,
  resetFilters,
  setOpenDropdown,
  setTagSelectionState,
  syncControlsFromState,
  toggleDropdown,
  toggleTagSelection,
} from "./filters.js?v=2";
import {
  applyCachedDisplayNamesToMap,
  applyCachedDisplayNamesToState,
  collectPendingDisplayNameAccountIds,
  rememberMapDisplayNames,
  clearDisplayNameRefresh,
} from "./display-names.js?v=2";
import { getMapUidValue } from "./map-model.js?v=2";
import { renderMapModal, renderPage } from "./map-view.js?v=2";
import { buildMapQuery, createRandomSeed, readUrlState, writeUrl } from "./query.js?v=2";
import { schedulePendingDisplayNameRefresh } from "./display-name-refresh.js?v=2";

let searchTimer = null;

function setStatValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value ?? "—";
}

function renderStats() {
  setStatValue("stat-maps", state.stats?.total_maps || "—");
  setStatValue("stat-tracked", state.stats?.actively_tracked || "—");
  setStatValue("stat-wr-changes", state.stats?.total_wr_changes || "—");
  setStatValue("stat-last-run", relTime(state.stats?.last_run_at));
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

  const payload = await getJson(`${API.mapDetail}/${encodeURIComponent(uid)}`).catch(() => null);
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

async function loadMaps({ replaceUrl = true, initialMap = "", resetDisplayNameRefresh = true } = {}) {
  if (resetDisplayNameRefresh) {
    clearDisplayNameRefresh({ reset: true });
  }
  startProgress();
  $loading.hidden = false;
  $error.hidden = true;

  try {
    const payload = await getJson(`${API.maps}?${buildMapQuery().toString()}`);
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

async function runUiAction(action) {
  try {
    await action();
  } catch {
    $loading.hidden = true;
    $mapGrid.hidden = true;
    $empty.hidden = true;
    $error.hidden = false;
    stopProgress();
  }
}

function bindAsyncAction(target, eventName, action) {
  target?.addEventListener(eventName, (event) => {
    void runUiAction(() => action(event));
  });
}

function bindEvents() {
  $searchInput?.addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void runUiAction(async () => {
        state.filters.q = event.target.value || "";
        state.page = 1;
        await loadMaps();
      });
    }, 180);
  });

  bindAsyncAction($sortSelect, "change", async (event) => {
    state.filters.sort = event.target.value || DEFAULT_MAP_SORT;
    state.randomSeed = state.filters.sort === "random" ? createRandomSeed() : "";
    state.page = 1;
    await loadMaps();
  });

  bindAsyncAction($mapNumberFilter, "input", async (event) => {
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
    bindAsyncAction(config.list, "click", async (event) => {
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

  bindAsyncAction($clearFilters, "click", async () => {
    resetFilters();
    await loadMaps();
  });

  bindAsyncAction($activeFilters, "click", async (event) => {
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

  bindAsyncAction($pagination, "click", async (event) => {
    const button = event.target.closest(".page-btn");
    if (!button || button.disabled) return;
    const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    const pageValue = button.dataset.page;
    if (pageValue === "prev") state.page = Math.max(1, state.page - 1);
    else if (pageValue === "next") state.page = Math.min(totalPages, state.page + 1);
    else state.page = Math.max(1, Number(pageValue) || 1);
    await loadMaps({ replaceUrl: false });
    $mapGrid.scrollIntoView({ behavior: "smooth", block: "start" });
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

  bindAsyncAction(window, "popstate", async () => {
    const { map } = readUrlState();
    syncControlsFromState();
    await loadMaps({ replaceUrl: false });
    if (map) await openMapModalByUid(map);
    else if ($modalBackdrop && !$modalBackdrop.hidden) closeMapModal(false);
  });
}

export async function startMaps() {
  const { map } = readUrlState();
  syncControlsFromState();
  bindEvents();

  const [statsPayload, filterPayload] = await Promise.all([
    getJson(API.stats).catch(() => null),
    getJson(API.filters).catch(() => null),
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
