const API = {
  stats: "/api/v1/alterations/stats",
  filters: "/api/v1/alterations/maps/filters",
  maps: "/api/v1/alterations/maps",
  mapDetail: "/api/v1/public/maps",
};
const alteredUrl = window.__alteredUrl || ((value) => value);

const PAGE_SIZE = 48;
const NADEO_FMT_RE = /\$([0-9a-fA-F]{1,3}|[gimnostuwzGIMNOSTUWZ<>]|[hlpHLP](\[[^\]]+\])?)/g;

const state = {
  stats: null,
  options: null,
  maps: [],
  total: 0,
  page: 1,
  filters: {
    q: "",
    season: "",
    year: "",
    alteration: "",
    status: "",
    hasWr: "",
    mapNumber: "",
    environment: "",
    mapType: "",
    sort: "newest",
  },
};

const $mapGrid = document.getElementById("map-grid");
const $searchInput = document.getElementById("map-search");
const $sortSelect = document.getElementById("map-sort");
const $seasonFilter = document.getElementById("season-filter");
const $yearFilter = document.getElementById("year-filter");
const $alterationFilter = document.getElementById("alteration-filter");
const $statusFilter = document.getElementById("status-filter");
const $wrFilter = document.getElementById("wr-filter");
const $mapNumberFilter = document.getElementById("map-number-filter");
const $environmentFilter = document.getElementById("environment-filter");
const $mapTypeFilter = document.getElementById("map-type-filter");
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

function fetchJson(url) {
  return fetch(alteredUrl(url), { cache: "no-store" }).then((res) => {
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

function fillSelect(select, placeholder, rows, valueKey = "value", labelKey = "label") {
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${esc(placeholder)}</option>`;
  rows.forEach((row) => {
    const value = typeof row === "object" ? row?.[valueKey] : row;
    const label = typeof row === "object" ? row?.[labelKey] : row;
    if (value === undefined || value === null || value === "") return;
    select.insertAdjacentHTML(
      "beforeend",
      `<option value="${esc(value)}">${esc(label)}</option>`
    );
  });
  select.value = current;
}

function populateFilterControls() {
  if (!state.options) return;
  fillSelect($seasonFilter, "Season: All", state.options.seasons || []);
  fillSelect($yearFilter, "Year: All", state.options.years || []);
  fillSelect(
    $alterationFilter,
    "Alteration: All",
    Array.isArray(state.options.alterations) ? state.options.alterations : [],
    "slug",
    "name"
  );
  fillSelect($environmentFilter, "Environment: All", state.options.environments || []);
  fillSelect($mapTypeFilter, "Map Type: All", state.options.map_types || []);

  fillSelect(
    $statusFilter,
    "Status: All",
    [
      { value: "active", label: "Status: Active" },
      { value: "paused", label: "Status: Paused" },
      { value: "idle", label: "Status: Idle" },
    ]
  );
  fillSelect(
    $wrFilter,
    "WR: Any",
    [
      { value: "with_wr", label: "WR: Has WR" },
      { value: "without_wr", label: "WR: No WR" },
    ]
  );

  syncControlsFromState();
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  state.page = Math.max(1, Number(params.get("page") || 1) || 1);
  state.filters = {
    q: params.get("q") || "",
    season: params.get("season") || "",
    year: params.get("year") || "",
    alteration: params.get("alteration") || "",
    status: params.get("status") || "",
    hasWr: params.get("has_wr") || "",
    mapNumber: params.get("map_number") || "",
    environment: params.get("environment") || "",
    mapType: params.get("map_type") || "",
    sort: params.get("sort") || "newest",
  };
  return {
    map: params.get("map") || "",
  };
}

function syncControlsFromState() {
  if ($searchInput) $searchInput.value = state.filters.q;
  if ($seasonFilter) $seasonFilter.value = state.filters.season;
  if ($yearFilter) $yearFilter.value = state.filters.year;
  if ($alterationFilter) $alterationFilter.value = state.filters.alteration;
  if ($statusFilter) $statusFilter.value = state.filters.status;
  if ($wrFilter) $wrFilter.value = state.filters.hasWr;
  if ($mapNumberFilter) $mapNumberFilter.value = state.filters.mapNumber;
  if ($environmentFilter) $environmentFilter.value = state.filters.environment;
  if ($mapTypeFilter) $mapTypeFilter.value = state.filters.mapType;
  if ($sortSelect) $sortSelect.value = state.filters.sort;
}

function writeUrl({ replace = false, map = "" } = {}) {
  const params = new URLSearchParams();
  Object.entries(state.filters).forEach(([key, value]) => {
    if (!value) return;
    const paramKey =
      key === "hasWr"
        ? "has_wr"
        : key === "mapNumber"
          ? "map_number"
          : key === "mapType"
            ? "map_type"
            : key;
    params.set(paramKey, String(value));
  });
  if (state.page > 1) params.set("page", String(state.page));
  if (map) params.set("map", map);
  const target = params.toString() ? `?${params.toString()}` : window.location.pathname;
  const method = replace ? "replaceState" : "pushState";
  history[method]({ page: state.page, filters: state.filters, map }, "", target);
}

function getHasWrParam() {
  if (state.filters.hasWr === "with_wr") return 1;
  if (state.filters.hasWr === "without_wr") return 0;
  return "";
}

function buildMapQuery() {
  return new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String((state.page - 1) * PAGE_SIZE),
    sort: state.filters.sort || "newest",
    ...(state.filters.q ? { q: state.filters.q } : {}),
    ...(state.filters.season ? { season: state.filters.season } : {}),
    ...(state.filters.year ? { year: state.filters.year } : {}),
    ...(state.filters.alteration ? { alteration: state.filters.alteration } : {}),
    ...(state.filters.status ? { status: state.filters.status } : {}),
    ...(getHasWrParam() !== "" ? { has_wr: String(getHasWrParam()) } : {}),
    ...(state.filters.mapNumber ? { map_number: state.filters.mapNumber } : {}),
    ...(state.filters.environment ? { environment: state.filters.environment } : {}),
    ...(state.filters.mapType ? { map_type: state.filters.mapType } : {}),
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
  if (state.filters.q) chips.push(`Search: ${state.filters.q}`);
  if (state.filters.season) chips.push(`Season: ${state.filters.season}`);
  if (state.filters.year) chips.push(`Year: ${state.filters.year}`);
  if (state.filters.alteration) {
    const match = (state.options?.alterations || []).find((item) => item.slug === state.filters.alteration);
    chips.push(`Alteration: ${match?.name || state.filters.alteration}`);
  }
  if (state.filters.status) chips.push(`Status: ${state.filters.status}`);
  if (state.filters.hasWr === "with_wr") chips.push("WR: Has WR");
  if (state.filters.hasWr === "without_wr") chips.push("WR: No WR");
  if (state.filters.mapNumber) chips.push(`Map #: ${state.filters.mapNumber}`);
  if (state.filters.environment) chips.push(`Environment: ${state.filters.environment}`);
  if (state.filters.mapType) chips.push(`Type: ${state.filters.mapType}`);
  $activeFilters.innerHTML = chips.length
    ? chips.map((chip) => `<span class="filter-chip">${esc(chip)}</span>`).join("")
    : '<span class="filter-chip filter-chip-muted">No filters</span>';
}

function mapCardHtml(map) {
  const tracking = map.tracking_status || "idle";
  const trackingClass =
    tracking === "active" || tracking === "live" ? "active" : tracking === "paused" ? "paused" : "idle";
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
        <p class="map-author">by ${escN(map.author || "Unknown")}</p>
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

function openMapModal(mapUid, updateUrl = true) {
  const map = state.maps.find((item) => item.map_uid === mapUid);
  if (!map || !$modalContent) return;

  const tracking = map.tracking_status || "idle";
  const trackingClass =
    tracking === "active" || tracking === "live" ? "active" : tracking === "paused" ? "paused" : "idle";
  const thumb = map.thumbnail_url
    ? `<img class="modal-thumb" src="${esc(map.thumbnail_url)}" alt="" />`
    : '<div class="modal-thumb modal-thumb-empty"></div>';
  const wrSection = map.wr_ms
    ? `<div class="modal-wr"><div class="modal-wr-row"><span class="modal-wr-rank">1</span><div class="modal-wr-detail"><span class="modal-wr-holder">${escN(map.wr_holder)}</span><span class="modal-wr-ago">${relTime(map.wr_updated_at)}</span></div><span class="modal-wr-time">${fmtTime(map.wr_ms)}</span></div></div>`
    : '<div class="modal-wr modal-wr-empty"><span>No WR data recorded yet</span></div>';

  $modalContent.innerHTML = `
    <div class="modal-hero">
      ${thumb}
      <div class="modal-info">
        <h2 class="modal-name">${escN(map.name || "Untitled")}</h2>
        <p class="modal-author">by ${escN(map.author || "Unknown")}</p>
        <div class="modal-tags">
          ${map.campaign_name ? `<span class="modal-campaign">${escN(map.campaign_name)}</span>` : ""}
          ${map.season_label ? `<span class="modal-campaign">${esc(map.season_label)}</span>` : ""}
          ${map.alteration ? `<span class="modal-campaign">${esc(map.alteration)}</span>` : ""}
          <span class="map-status map-status-${trackingClass}" style="position:static">${esc(tracking)}</span>
        </div>
      </div>
    </div>
    <div class="modal-medals">
      <div class="modal-medal modal-medal-at"><span class="modal-medal-label">Author</span><span class="modal-medal-time">${fmtTime(map.author_time)}</span></div>
      <div class="modal-medal modal-medal-gold"><span class="modal-medal-label">Gold</span><span class="modal-medal-time">${fmtTime(map.gold_time)}</span></div>
      <div class="modal-medal modal-medal-silver"><span class="modal-medal-label">Silver</span><span class="modal-medal-time">${fmtTime(map.silver_time)}</span></div>
      <div class="modal-medal modal-medal-bronze"><span class="modal-medal-label">Bronze</span><span class="modal-medal-time">${fmtTime(map.bronze_time)}</span></div>
    </div>
    <div class="modal-section">
      <h3 class="modal-section-title">World Record</h3>
      ${wrSection}
    </div>
    <div class="modal-section">
      <h3 class="modal-section-title">Tracking</h3>
      <div class="modal-stats">
        <div class="modal-stat"><span class="modal-stat-value">${map.map_number || "\u2014"}</span><span class="modal-stat-label">Map #</span></div>
        <div class="modal-stat"><span class="modal-stat-value">${map.change_count ?? 0}</span><span class="modal-stat-label">WR Changes</span></div>
      </div>
    </div>
    <div class="modal-uid"><span>UID:</span> ${esc(map.map_uid)}</div>
  `;

  $modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  if (updateUrl) writeUrl({ replace: false, map: mapUid });
}

function closeMapModal(updateUrl = true) {
  if ($modalBackdrop) $modalBackdrop.hidden = true;
  document.body.style.overflow = "";
  if (updateUrl) writeUrl({ replace: false });
}

async function openMapModalByUid(mapUid) {
  const existing = state.maps.find((item) => item.map_uid === mapUid);
  if (existing) {
    openMapModal(mapUid, false);
    return;
  }

  try {
    const payload = await fetchJson(`${API.mapDetail}/${encodeURIComponent(mapUid)}`);
    const map = payload?.map;
    if (!map || !$modalContent) return;
    $modalContent.innerHTML = `
      <div class="modal-hero">
        ${map.thumbnailUrl ? `<img class="modal-thumb" src="${esc(map.thumbnailUrl)}" alt="" />` : '<div class="modal-thumb modal-thumb-empty"></div>'}
        <div class="modal-info">
          <h2 class="modal-name">${escN(map.name || "Untitled")}</h2>
          <p class="modal-author">by ${escN(map.author || "Unknown")}</p>
        </div>
      </div>
      <div class="modal-section">
        <h3 class="modal-section-title">World Record</h3>
        ${
          map.wrMs
            ? `<div class="modal-wr"><div class="modal-wr-row"><span class="modal-wr-rank">1</span><div class="modal-wr-detail"><span class="modal-wr-holder">${escN(map.wrHolder)}</span><span class="modal-wr-ago">${relTime(map.wrUpdatedAt)}</span></div><span class="modal-wr-time">${fmtTime(map.wrMs)}</span></div></div>`
            : '<div class="modal-wr modal-wr-empty"><span>No WR data recorded yet</span></div>'
        }
      </div>
      <div class="modal-uid"><span>UID:</span> ${esc(map.mapUid)}</div>
    `;
    $modalBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
  } catch (_error) {
    // Ignore invalid deep links.
  }
}

async function loadMaps({ replaceUrl = true, initialMap = "" } = {}) {
  startProgress();
  $loading.hidden = false;
  $error.hidden = true;

  try {
    const payload = await fetchJson(`${API.maps}?${buildMapQuery().toString()}`);
    state.maps = Array.isArray(payload?.maps) ? payload.maps : [];
    state.total = Number(payload?.total || payload?.paging?.total || payload?.count || 0);
    renderPage();
    $loading.hidden = true;
    if (replaceUrl) writeUrl({ replace: true });
    if (initialMap) await openMapModalByUid(initialMap);
  } catch (_error) {
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
    season: "",
    year: "",
    alteration: "",
    status: "",
    hasWr: "",
    mapNumber: "",
    environment: "",
    mapType: "",
    sort: "newest",
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

  [
    [$seasonFilter, "season"],
    [$yearFilter, "year"],
    [$alterationFilter, "alteration"],
    [$statusFilter, "status"],
    [$wrFilter, "hasWr"],
    [$environmentFilter, "environment"],
    [$mapTypeFilter, "mapType"],
    [$sortSelect, "sort"],
  ].forEach(([element, key]) => {
    element?.addEventListener("change", async (event) => {
      state.filters[key] = event.target.value || "";
      state.page = 1;
      await loadMaps();
    });
  });

  $mapNumberFilter?.addEventListener("input", async (event) => {
    state.filters.mapNumber = event.target.value || "";
    state.page = 1;
    await loadMaps();
  });

  $clearFilters?.addEventListener("click", async () => {
    resetFilters();
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
    if (event.key === "Escape" && $modalBackdrop && !$modalBackdrop.hidden) {
      closeMapModal();
    }
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

  try {
    const [statsPayload, filterPayload] = await Promise.all([
      fetchJson(API.stats),
      fetchJson(API.filters),
    ]);
    state.stats = statsPayload || null;
    state.options = filterPayload || null;
    renderStats();
    populateFilterControls();
  } catch (_error) {
    // Filters can fail independently; the page still tries to load maps.
  }

  await loadMaps({ replaceUrl: true, initialMap: map });
}

bootstrap();
