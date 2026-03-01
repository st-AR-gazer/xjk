function esc(str) {
  if (!str) return "";
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

function relTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function parseMeta(map) {
  const campaign = map.campaign || "";
  const name = map.name || "";

  let season = "";
  let year = "";
  let alteration = "";
  let mapNum = "";
  const campMatch = campaign.match(/^(Spring|Summer|Fall|Winter)\s+(\d{4})(?:\s*[-â€“]\s*(.+))?$/i);
  if (campMatch) {
    season = campMatch[1].charAt(0).toUpperCase() + campMatch[1].slice(1).toLowerCase();
    year = campMatch[2];
    if (campMatch[3]) alteration = campMatch[3].trim();
  }
  const numMatch = name.match(/#(\d+)\s*$/);
  if (numMatch) mapNum = numMatch[1];
  if (!alteration && numMatch) {
    alteration = name.slice(0, numMatch.index).trim();
  }

  return { season, year, alteration, mapNum };
}
function scoreMatch(map, query) {
  if (!query) return 1;
  const q = query.toLowerCase();
  const name = (map.name || "").toLowerCase();
  const uid = (map.uid || "").toLowerCase();
  if (name === q) return 100;
  if (uid === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(" " + q) || name.includes("-" + q)) return 60;
  if (name.includes(q)) return 40;
  if (uid.includes(q)) return 20;

  return 0;
}
const state = {
  allMaps: null,
  parsed: [],
  results: [],
  filters: { season: "", year: "", alteration: "", mapNum: "" },
  query: "",
  history: JSON.parse(localStorage.getItem("ru_history") || "[]"),
};
const $mapInput = document.getElementById("map-input");
const $filterSeason = document.getElementById("filter-season");
const $filterYear = document.getElementById("filter-year");
const $filterAlteration = document.getElementById("filter-alteration");
const $filterMapNum = document.getElementById("filter-map-num");
const $resultsInfo = document.getElementById("results-info");
const $resultsSection = document.getElementById("search-results");
const $resultsList = document.getElementById("results-list");
const $statusMsg = document.getElementById("status-msg");
const $historySection = document.getElementById("requests-history");
const $historyList = document.getElementById("history-list");
async function loadMaps() {
  if (state.allMaps) return;
  try {
    const data = await fetchJson("/api/v1/alterations/maps");
    const rawMaps = data.maps || data || [];
    state.allMaps = (Array.isArray(rawMaps) ? rawMaps : []).map((map) => ({
      ...map,
      uid: String(map.uid || map.map_uid || map.mapUid || "").trim(),
      name: String(map.name || map.map_name || map.mapName || "").trim(),
      campaign: String(map.campaign || map.campaign_name || map.campaignName || "").trim(),
      wrHolder: String(map.wrHolder || map.wr_holder || "").trim(),
    }));
    state.parsed = state.allMaps.map((m) => ({
      ...m,
      _meta: parseMeta(m),
    }));

    populateFilters();
  } catch {
    state.allMaps = [];
    state.parsed = [];
  }
}
function populateFilters() {
  const seasons = new Set();
  const years = new Set();
  const alterations = new Set();
  const mapNums = new Set();

  for (const m of state.parsed) {
    const meta = m._meta;
    if (meta.season) seasons.add(meta.season);
    if (meta.year) years.add(meta.year);
    if (meta.alteration) alterations.add(meta.alteration);
    if (meta.mapNum) mapNums.add(meta.mapNum);
  }

  fillSelect($filterSeason, "All Seasons", [...seasons].sort());
  fillSelect($filterYear, "All Years", [...years].sort().reverse());
  fillSelect($filterAlteration, "All Alterations", [...alterations].sort());
  fillSelect($filterMapNum, "All", [...mapNums].sort((a, b) => Number(a) - Number(b)));
}

function fillSelect(el, defaultLabel, options) {
  el.innerHTML = `<option value="">${esc(defaultLabel)}</option>` +
    options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("");
}
function getFilteredResults() {
  if (!state.parsed.length) return [];

  const { season, year, alteration, mapNum } = state.filters;
  const query = state.query.trim();

  let maps = state.parsed;
  if (season) maps = maps.filter((m) => m._meta.season === season);
  if (year) maps = maps.filter((m) => m._meta.year === year);
  if (alteration) maps = maps.filter((m) => m._meta.alteration === alteration);
  if (mapNum) maps = maps.filter((m) => m._meta.mapNum === mapNum);
  if (query) {
    maps = maps
      .map((m) => ({ map: m, score: scoreMatch(m, query) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.map);
  }

  return maps.slice(0, 30);
}
function renderResults() {
  state.results = getFilteredResults();
  const hasInput = state.query || state.filters.season || state.filters.year ||
    state.filters.alteration || state.filters.mapNum;

  if (!hasInput) {
    $resultsSection.hidden = true;
    $resultsInfo.hidden = true;
    return;
  }

  $resultsInfo.hidden = false;

  if (!state.results.length) {
    $resultsInfo.textContent = "No maps match your search.";
    $resultsSection.hidden = true;
    return;
  }

  const total = state.results.length;
  $resultsInfo.textContent = total >= 30 ? "Showing top 30 results" : `${total} map${total !== 1 ? "s" : ""} found`;

  $resultsSection.hidden = false;
  $resultsList.innerHTML = state.results
    .map(
      (m) => `<div class="ru-result-item" data-uid="${esc(m.uid)}">
      <div class="ru-result-info">
        <span class="ru-result-name">${esc(m.name)}</span>
        <span class="ru-result-meta">${esc(m.campaign || "")}${m.wrHolder ? " &middot; WR: " + esc(m.wrHolder) : ""}</span>
      </div>
      <span class="ru-result-action">Request &rarr;</span>
    </div>`
    )
    .join("");

  $resultsList.querySelectorAll(".ru-result-item").forEach((el) => {
    el.addEventListener("click", () => {
      const uid = el.dataset.uid;
      const map = state.results.find((m) => m.uid === uid);
      if (map) submitForMap(map);
    });
  });
}

function showStatus(message, type) {
  $statusMsg.hidden = false;
  $statusMsg.className = `ru-status ${type}`;
  $statusMsg.textContent = message;
  $statusMsg.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderHistory() {
  if (!state.history.length) {
    $historySection.hidden = true;
    return;
  }

  $historySection.hidden = false;
  $historyList.innerHTML = state.history
    .slice(0, 10)
    .map(
      (r) => `<div class="ru-history-item">
      <span class="ru-history-name">${esc(r.name)}</span>
      <span class="ru-history-time">${relTime(r.at)}</span>
      <span class="ru-history-badge ${r.status === "done" ? "done" : "queued"}">${esc(r.status)}</span>
    </div>`
    )
    .join("");
}
async function submitForMap(map) {
  showStatus(`Submitting request for "${map.name}"...`, "pending");

  try {
    const res = await fetch("/api/v1/request-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: map.uid, name: map.name, reason: "" }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || `Server returned ${res.status}`);
    }

    showStatus(
      `Request submitted for "${map.name}". It will be reviewed and processed.`,
      "success"
    );
    state.history.unshift({
      uid: map.uid,
      name: map.name,
      at: new Date().toISOString(),
      status: "queued",
    });
    localStorage.setItem("ru_history", JSON.stringify(state.history.slice(0, 20)));
    renderHistory();
  } catch (e) {
    showStatus(`Could not submit: ${e.message}`, "error");
  }
}
let searchTimeout = null;

$mapInput.addEventListener("input", () => {
  state.query = $mapInput.value;
  $statusMsg.hidden = true;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(renderResults, 150);
});

$filterSeason.addEventListener("change", () => {
  state.filters.season = $filterSeason.value;
  $statusMsg.hidden = true;
  renderResults();
});

$filterYear.addEventListener("change", () => {
  state.filters.year = $filterYear.value;
  $statusMsg.hidden = true;
  renderResults();
});

$filterAlteration.addEventListener("change", () => {
  state.filters.alteration = $filterAlteration.value;
  $statusMsg.hidden = true;
  renderResults();
});

$filterMapNum.addEventListener("change", () => {
  state.filters.mapNum = $filterMapNum.value;
  $statusMsg.hidden = true;
  renderResults();
});
async function boot() {
  renderHistory();
  await loadMaps();
  if (state.query || state.filters.season || state.filters.year ||
      state.filters.alteration || state.filters.mapNum) {
    renderResults();
  }
}

boot();

