function relTime(iso) {
  if (!iso) return "\u2014";
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

function esc(str) {
  if (!str) return "";
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

const TM_FORMAT_CODE_REGEX = /\$([0-9a-f]{1,3}|[gimnostuwz<>]|[hlp](\[[^\]]+\])?)/gi;

function cleanTmText(value, fallback = "") {
  const raw = String(value || "").replace(TM_FORMAT_CODE_REGEX, "").trim();
  return raw || fallback;
}

function formatSlot(value) {
  const slot = Number(value || 0);
  if (!Number.isFinite(slot) || slot <= 0) return "\u2014";
  return String(slot).padStart(2, "0");
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const state = {
  payload: null,
  searchQuery: "",
  sortField: "count",
  playerScope: "overall",
  selectedBucket: "",
  medalType: "author",
};

const $loading = document.getElementById("loading-state");
const $empty = document.getElementById("empty-state");
const $error = document.getElementById("error-state");
const $tableWrap = document.getElementById("rankings-table-wrap");
const $tbody = document.getElementById("rankings-body");
const $search = document.getElementById("player-search");
const $sort = document.getElementById("rank-sort");
const $scope = document.getElementById("player-scope");
const $bucket = document.getElementById("bucket-select");
const $playersTitle = document.getElementById("players-section-title");
const $mostPlayedWrap = document.getElementById("most-played-wrap");
const $mostPlayedBody = document.getElementById("most-played-body");
const $mostPlayedEmpty = document.getElementById("most-played-empty");
const $medalSelect = document.getElementById("medal-select");
const $medalNote = document.getElementById("medal-note");
const $medalWrap = document.getElementById("medal-wrap");
const $medalBody = document.getElementById("medal-body");
const $medalEmpty = document.getElementById("medal-empty");
const $medalCountLabel = document.getElementById("medal-count-label");

function setStat(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "\u2014";
}

function renderStats() {
  const summary = state.payload?.summary || {};
  const overall = Array.isArray(state.payload?.wr?.overall) ? state.payload.wr.overall : [];
  const topCount = overall.length ? Math.max(...overall.map((item) => Number(item.wr_count || 0))) : 0;

  setStat("stat-players", Number(summary.unique_wr_players || overall.length || 0));
  setStat(
    "stat-total-wrs",
    Number(
      summary.total_wrs ||
        overall.reduce((sum, item) => sum + Number(item.wr_count || 0), 0)
    )
  );
  setStat("stat-top-count", topCount || "\u2014");
  setStat("stat-maps", Number(summary.total_maps || 0));
}

function getScopeBuckets(scope) {
  if (!state.payload?.wr) return [];
  if (scope === "season") return state.payload.wr.by_season || [];
  if (scope === "campaign") return state.payload.wr.by_campaign || [];
  if (scope === "slot") return state.payload.wr.by_slot || [];
  return [];
}

function normalizePlayerRows(rows = []) {
  return rows.map((row, idx) => ({
    rank: Number(row.rank || idx + 1),
    player: String(row.player || "Unknown"),
    wrCount: Number(row.wr_count || 0),
    latestWr: row.latest_wr_at || null,
  }));
}

function getCurrentPlayerRows() {
  if (!state.payload?.wr) return [];
  if (state.playerScope === "overall") {
    return normalizePlayerRows(state.payload.wr.overall || []);
  }
  const buckets = getScopeBuckets(state.playerScope);
  const selected = buckets.find((entry) => entry.bucket === state.selectedBucket);
  return normalizePlayerRows(selected?.players || []);
}

function getPlayerScopeTitle() {
  if (state.playerScope === "overall") return "Player WR Leaderboard";
  const labelMap = {
    season: "Season",
    campaign: "Campaign",
    slot: "Map Slot",
  };
  const label = labelMap[state.playerScope] || "Group";
  const bucket = cleanTmText(state.selectedBucket, "Unknown");
  return `Player WR Leaderboard - ${label}: ${bucket}`;
}

function renderBucketSelect() {
  const needsBucket = state.playerScope !== "overall";
  $bucket.hidden = !needsBucket;
  if (!needsBucket) return;

  const buckets = getScopeBuckets(state.playerScope);
  if (!buckets.length) {
    $bucket.innerHTML = '<option value="">No data</option>';
    state.selectedBucket = "";
    return;
  }

  if (!state.selectedBucket || !buckets.some((entry) => entry.bucket === state.selectedBucket)) {
    state.selectedBucket = buckets[0].bucket;
  }

  $bucket.innerHTML = buckets
    .map((entry) => {
      const count = Number(entry.total_wrs || 0);
      const label = `${cleanTmText(entry.bucket, "Unknown")} (${count})`;
      const selected = entry.bucket === state.selectedBucket ? " selected" : "";
      return `<option value="${esc(entry.bucket)}"${selected}>${esc(label)}</option>`;
    })
    .join("");
}

function renderPlayersTable() {
  $playersTitle.textContent = getPlayerScopeTitle();
  let rows = getCurrentPlayerRows();

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    rows = rows.filter((row) => cleanTmText(row.player, "").toLowerCase().includes(q));
  }

  rows.sort((a, b) => {
    if (state.sortField === "latest") {
      return new Date(b.latestWr || 0) - new Date(a.latestWr || 0);
    }
    if (state.sortField === "name") {
      return a.player.localeCompare(b.player, undefined, { sensitivity: "base" });
    }
    return b.wrCount - a.wrCount || a.player.localeCompare(b.player, undefined, { sensitivity: "base" });
  });

  if (!rows.length) {
    $tableWrap.hidden = true;
    $empty.hidden = false;
    return;
  }

  $empty.hidden = true;
  $tableWrap.hidden = false;

  $tbody.innerHTML = rows
    .map((row, idx) => {
      const rank = idx + 1;
      let rankClass = "rank-default";
      if (rank === 1) rankClass = "rank-1";
      else if (rank === 2) rankClass = "rank-2";
      else if (rank === 3) rankClass = "rank-3";

      return `<tr>
        <td class="col-rank"><span class="rank-badge ${rankClass}">${rank}</span></td>
        <td><span class="player-name">${esc(cleanTmText(row.player, "Unknown"))}</span></td>
        <td class="col-count"><span class="wr-count">${row.wrCount}</span></td>
        <td class="col-latest"><span class="latest-wr">${relTime(row.latestWr)}</span></td>
      </tr>`;
    })
    .join("");
}

function renderMostPlayedMaps() {
  const maps = Array.isArray(state.payload?.maps?.most_played) ? state.payload.maps.most_played : [];
  if (!maps.length) {
    $mostPlayedWrap.hidden = true;
    $mostPlayedEmpty.hidden = false;
    return;
  }
  $mostPlayedEmpty.hidden = true;
  $mostPlayedWrap.hidden = false;

  $mostPlayedBody.innerHTML = maps
    .map((row, idx) => {
      return `<tr>
        <td>${idx + 1}</td>
        <td><span class="mini-map-name">${esc(cleanTmText(row.map_name || row.map_uid, row.map_uid || "Map"))}</span></td>
        <td>${esc(cleanTmText(row.campaign_name || "Unassigned", "Unassigned"))}</td>
        <td>${esc(formatSlot(row.slot))}</td>
        <td>${Number(row.player_count || 0)}</td>
      </tr>`;
    })
    .join("");
}

function renderMedalLeaderboards() {
  const medals = state.payload?.medals || {};
  const byMedal = medals?.top_by_medal || {};
  const key = state.medalType;
  const labelMap = {
    author: "Author Clears",
    gold: "Gold Clears",
    silver: "Silver Clears",
    bronze: "Bronze Clears",
  };
  const fieldMap = {
    author: "authorCount",
    gold: "goldCount",
    silver: "silverCount",
    bronze: "bronzeCount",
  };

  $medalCountLabel.textContent = labelMap[key] || "Players";

  if (!medals.available) {
    $medalNote.textContent =
      medals.note || "Medal-clear data is unavailable because tracker did not return data.";
  } else {
    $medalNote.textContent =
      `${medals.note || "Counts based on tracker rows."} (sampled maps: ${Number(
        medals.maps_sampled || 0
      )})`;
  }

  const rows = Array.isArray(byMedal[key]) ? byMedal[key] : [];
  if (!rows.length) {
    $medalWrap.hidden = true;
    $medalEmpty.hidden = false;
    return;
  }

  $medalEmpty.hidden = true;
  $medalWrap.hidden = false;
  const countField = fieldMap[key] || "authorCount";

  $medalBody.innerHTML = rows
    .map((row, idx) => {
      return `<tr>
        <td>${idx + 1}</td>
        <td><span class="mini-map-name">${esc(cleanTmText(row.name || row.uid, row.uid || "Map"))}</span></td>
        <td>${esc(cleanTmText(row.campaign || "Unassigned", "Unassigned"))}</td>
        <td>${esc(formatSlot(row.slot))}</td>
        <td>${Number(row[countField] || 0)}</td>
      </tr>`;
    })
    .join("");
}

function renderAll() {
  renderStats();
  renderBucketSelect();
  renderPlayersTable();
  renderMostPlayedMaps();
  renderMedalLeaderboards();
}

async function loadData() {
  $loading.hidden = false;
  $tableWrap.hidden = true;
  $empty.hidden = true;
  $error.hidden = true;

  try {
    state.payload = await fetchJson(
      "/api/v1/alterations/leaderboards?limit=80&overallLimit=5000&perBucketLimit=12"
    );
    renderAll();
    $loading.hidden = true;
  } catch {
    $loading.hidden = true;
    $error.hidden = false;
  }
}

$search.addEventListener("input", (event) => {
  state.searchQuery = String(event.target.value || "");
  renderPlayersTable();
});

$sort.addEventListener("change", (event) => {
  state.sortField = String(event.target.value || "count");
  renderPlayersTable();
});

$scope.addEventListener("change", (event) => {
  state.playerScope = String(event.target.value || "overall");
  const buckets = getScopeBuckets(state.playerScope);
  state.selectedBucket = buckets.length ? buckets[0].bucket : "";
  renderAll();
});

$bucket.addEventListener("change", (event) => {
  state.selectedBucket = String(event.target.value || "");
  renderPlayersTable();
  $playersTitle.textContent = getPlayerScopeTitle();
});

$medalSelect.addEventListener("change", (event) => {
  state.medalType = String(event.target.value || "author");
  renderMedalLeaderboards();
});

loadData();
