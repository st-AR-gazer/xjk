import "/shared/xjk-core/safe-html.js?v=2";
import { fetchJson } from "/shared/xjk-core/http.js";
import {
  collectPendingDisplayNameAccountIds as collectPendingAccountIds,
  createDisplayNameRefreshController,
} from "../shared/display-name-refresh.js?v=2";
import { esc, relTime, stripFmt } from "../shared/formatters.js?v=2";

const rankingsAlteredUrl = window.__alteredUrl || ((value) => value);

const displayNameRefresh = createDisplayNameRefreshController({
  onRefresh: () => loadData({ silent: true, resetDisplayNameRefresh: false }),
});
const LEADERBOARD_QUERY =
  "/api/v1/alterations/leaderboards?limit=40&overallLimit=250&perBucketLimit=5&includeBuckets=false&includeMedals=false";
const LEADERBOARD_ENRICH_QUERY =
  "/api/v1/alterations/leaderboards?limit=40&overallLimit=250&perBucketLimit=5&includeMedals=false";

function collectPendingDisplayNameAccountIds(payload = null) {
  const wr = payload?.wr || {};
  const scopedRows = []
    .concat(Array.isArray(wr.overall) ? wr.overall : [])
    .concat(
      Array.isArray(wr.by_season)
        ? wr.by_season.flatMap((bucket) => (Array.isArray(bucket?.players) ? bucket.players : []))
        : []
    )
    .concat(
      Array.isArray(wr.by_campaign)
        ? wr.by_campaign.flatMap((bucket) => (Array.isArray(bucket?.players) ? bucket.players : []))
        : []
    )
    .concat(
      Array.isArray(wr.by_slot)
        ? wr.by_slot.flatMap((bucket) => (Array.isArray(bucket?.players) ? bucket.players : []))
        : []
    );

  return collectPendingAccountIds(scopedRows, {
    accountKeys: ["account_id", "accountId", "player", "display_name", "displayName"],
    displayKeys: ["player", "display_name", "displayName"],
  });
}

function cleanTmText(value, fallback = "") {
  const raw = stripFmt(value).trim();
  return raw || fallback;
}

function formatSlot(value) {
  const slot = Number(value || 0);
  if (!Number.isFinite(slot) || slot <= 0) return "\u2014";
  return String(slot).padStart(2, "0");
}

function formatCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "\u2014");
  return number.toLocaleString();
}

const state = {
  payload: null,
  searchQuery: "",
  sortField: "count",
  playerScope: "overall",
  selectedBucket: "",
  medalType: "author",
  page: 1,
  pageSize: 25,
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
const $pager = document.getElementById("pager");
const $pageInfo = document.getElementById("page-info");
const $pagePrev = document.getElementById("page-prev");
const $pageNext = document.getElementById("page-next");
const $pageSize = document.getElementById("page-size");

function setStat(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("stat-value--ratio");
  el.closest(".stat")?.classList.remove("stat-is-ratio");
  el.textContent = value === "\u2014" ? value : formatCount(value ?? "\u2014");
}

function setRatioStat(id, value, total, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  const safeValue = Number(value || 0);
  const safeTotal = Number(total || 0);
  const safePct = Number.isFinite(Number(pct)) ? Number(pct) : safeTotal > 0 ? (safeValue / safeTotal) * 100 : 0;
  el.classList.add("stat-value--ratio");
  el.closest(".stat")?.classList.add("stat-is-ratio");
  globalThis.XjkSafeHtml.set(
    el,
    `
    <span class="stat-ratio">
      <span class="stat-ratio-main">${esc(formatCount(safeValue))}</span>
      <span class="stat-ratio-total">of ${esc(formatCount(safeTotal))}</span>
    </span>
    <span class="stat-ratio-sub">${esc(`${safePct.toFixed(1)}% coverage`)}</span>
  `
  );
}

function renderStats() {
  const summary = state.payload?.summary || {};
  const coverage = summary?.leaderboard_coverage || {};
  const overall = Array.isArray(state.payload?.wr?.overall) ? state.payload.wr.overall : [];
  const topCount = overall.length ? Math.max(...overall.map((item) => Number(item.wr_count || 0))) : 0;
  const totalCoverageMaps = Number(coverage.total_maps || summary.total_maps || 0);

  setStat("stat-players", Number(summary.unique_wr_players || overall.length || 0));
  setStat(
    "stat-total-wrs",
    Number(summary.total_wrs || overall.reduce((sum, item) => sum + Number(item.wr_count || 0), 0))
  );
  setStat("stat-top-count", topCount || "\u2014");
  setStat("stat-maps", Number(summary.total_maps || 0));
  setRatioStat(
    "stat-maps-wr-known",
    Number(coverage.maps_with_known_wr || 0),
    totalCoverageMaps,
    Number(coverage.wr_coverage_pct || 0)
  );
  setRatioStat(
    "stat-maps-fuller-lb",
    Number(coverage.maps_with_extended_leaderboard || 0),
    totalCoverageMaps,
    Number(coverage.extended_coverage_pct || 0)
  );
}

function renderCoverageBars() {
  const summary = state.payload?.summary || {};
  const coverage = summary?.leaderboard_coverage || {};
  const totalMaps = Number(coverage.total_maps || summary.total_maps || 0);
  const rows = [
    {
      label: "WR Known",
      value: Number(coverage.maps_with_known_wr || 0),
      pct: Number(coverage.wr_coverage_pct || 0),
      tone: "is-known",
    },
    {
      label: "Any Leaderboard Rows",
      value: Number(coverage.maps_with_leaderboard_rows || 0),
      pct: Number(coverage.leaderboard_coverage_pct || 0),
      tone: "is-any",
    },
    {
      label: "Fuller Leaderboard",
      value: Number(coverage.maps_with_extended_leaderboard || 0),
      pct: Number(coverage.extended_coverage_pct || 0),
      tone: "is-fuller",
    },
  ];

  const metaEl = document.getElementById("coverage-card-meta");
  if (metaEl) {
    metaEl.textContent =
      totalMaps > 0 ? `${Number(coverage.leaderboard_rows_stored || 0)} rows stored` : "No tracker data";
  }

  const barsEl = document.getElementById("coverage-bars");
  if (!barsEl) return;
  globalThis.XjkSafeHtml.set(
    barsEl,
    rows
      .map((row) => {
        const pct = Math.max(0, Math.min(100, Number(row.pct || 0)));
        return `
        <div class="coverage-bar-row">
          <div class="coverage-bar-head">
            <span class="coverage-bar-label">${esc(row.label)}</span>
            <span class="coverage-bar-value">${esc(`${row.value} / ${totalMaps} (${pct.toFixed(1)}%)`)}</span>
          </div>
          <div class="coverage-bar-track">
            <span class="coverage-bar-fill ${row.tone}" style="width:${pct.toFixed(2)}%"></span>
          </div>
        </div>
      `;
      })
      .join("")
  );
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
    player: String(row.display_name || row.displayName || row.player || "Unknown"),
    accountId: String(row.account_id || row.accountId || ""),
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
    globalThis.XjkSafeHtml.set($bucket, '<option value="">No data</option>');
    state.selectedBucket = "";
    return;
  }

  if (!state.selectedBucket || !buckets.some((entry) => entry.bucket === state.selectedBucket)) {
    state.selectedBucket = buckets[0].bucket;
  }

  globalThis.XjkSafeHtml.set(
    $bucket,
    buckets
      .map((entry) => {
        const count = Number(entry.total_wrs || 0);
        const label = `${cleanTmText(entry.bucket, "Unknown")} (${count})`;
        const selected = entry.bucket === state.selectedBucket ? " selected" : "";
        return `<option value="${esc(entry.bucket)}"${selected}>${esc(label)}</option>`;
      })
      .join("")
  );
}

function renderPlayersTable() {
  $playersTitle.textContent = getPlayerScopeTitle();
  let rows = getCurrentPlayerRows();

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    rows = rows.filter((row) => {
      const player = cleanTmText(row.player, "").toLowerCase();
      const account = String(row.accountId || "").toLowerCase();
      return player.includes(q) || account.includes(q);
    });
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
    if ($pager) $pager.hidden = true;
    return;
  }

  $empty.hidden = true;
  $tableWrap.hidden = false;
  const safePageSize = Math.max(1, Number(state.pageSize || 25));
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / safePageSize));
  if (state.page > totalPages) state.page = totalPages;
  if (state.page < 1) state.page = 1;

  const start = (state.page - 1) * safePageSize;
  const pageRows = rows.slice(start, start + safePageSize);

  globalThis.XjkSafeHtml.set(
    $tbody,
    pageRows
      .map((row, idx) => {
        const rank = start + idx + 1;
        let rankClass = "rank-default";
        if (rank === 1) rankClass = "rank-1";
        else if (rank === 2) rankClass = "rank-2";
        else if (rank === 3) rankClass = "rank-3";
        const displayName = cleanTmText(row.player, "Unknown");

        return `<tr>
        <td class="col-rank"><span class="rank-badge ${rankClass}">${rank}</span></td>
        <td>
          <span class="player-name">${esc(displayName)}</span>
        </td>
        <td class="col-count"><span class="wr-count">${row.wrCount}</span></td>
        <td class="col-latest"><span class="latest-wr">${relTime(row.latestWr)}</span></td>
      </tr>`;
      })
      .join("")
  );

  if ($pager && $pageInfo && $pagePrev && $pageNext) {
    $pager.hidden = false;
    $pageInfo.textContent = `Page ${state.page} of ${totalPages} - ${totalRows} players`;
    $pagePrev.disabled = state.page <= 1;
    $pageNext.disabled = state.page >= totalPages;
  }
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

  globalThis.XjkSafeHtml.set(
    $mostPlayedBody,
    maps
      .map((row, idx) => {
        return `<tr>
        <td>${idx + 1}</td>
        <td><span class="mini-map-name">${esc(cleanTmText(row.map_name || row.map_uid, row.map_uid || "Map"))}</span></td>
        <td>${esc(cleanTmText(row.campaign_name || "Unassigned", "Unassigned"))}</td>
        <td>${esc(formatSlot(row.slot))}</td>
        <td>${Number(row.player_count || 0)}</td>
      </tr>`;
      })
      .join("")
  );
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
    $medalNote.textContent = medals.note || "Medal-clear data is unavailable because tracker did not return data.";
  } else {
    $medalNote.textContent = `${medals.note || "Counts based on tracker rows."} (sampled maps: ${Number(
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

  globalThis.XjkSafeHtml.set(
    $medalBody,
    rows
      .map((row, idx) => {
        return `<tr>
        <td>${idx + 1}</td>
        <td><span class="mini-map-name">${esc(cleanTmText(row.name || row.uid, row.uid || "Map"))}</span></td>
        <td>${esc(cleanTmText(row.campaign || "Unassigned", "Unassigned"))}</td>
        <td>${esc(formatSlot(row.slot))}</td>
        <td>${Number(row[countField] || 0)}</td>
      </tr>`;
      })
      .join("")
  );
}

function renderAll() {
  renderStats();
  renderCoverageBars();
  renderBucketSelect();
  renderPlayersTable();
  renderMostPlayedMaps();
  renderMedalLeaderboards();
}

async function loadEnrichedData() {
  const payload = await fetchJson(rankingsAlteredUrl(LEADERBOARD_ENRICH_QUERY)).catch(() => null);
  if (!Array.isArray(payload?.wr?.overall) || !payload.wr.overall.length) return;
  state.payload = payload;
  renderAll();
  displayNameRefresh.schedule(collectPendingDisplayNameAccountIds(payload));
}

async function loadData({ silent = false, resetDisplayNameRefresh = true } = {}) {
  if (resetDisplayNameRefresh) {
    displayNameRefresh.clear();
  }
  if (!silent) {
    $loading.hidden = false;
    $tableWrap.hidden = true;
    $empty.hidden = true;
    $error.hidden = true;
  }

  try {
    state.payload = await fetchJson(rankingsAlteredUrl(LEADERBOARD_QUERY));
    renderAll();
    displayNameRefresh.schedule(collectPendingDisplayNameAccountIds(state.payload));
    if (!silent) {
      $loading.hidden = true;
      loadEnrichedData();
    }
  } catch {
    if (!silent) {
      $loading.hidden = true;
      $error.hidden = false;
    }
    displayNameRefresh.schedule(collectPendingDisplayNameAccountIds(state.payload));
  }
}

$search.addEventListener("input", (event) => {
  state.searchQuery = String(event.target.value || "");
  state.page = 1;
  renderPlayersTable();
});

$sort.addEventListener("change", (event) => {
  state.sortField = String(event.target.value || "count");
  state.page = 1;
  renderPlayersTable();
});

$scope.addEventListener("change", (event) => {
  state.playerScope = String(event.target.value || "overall");
  const buckets = getScopeBuckets(state.playerScope);
  state.selectedBucket = buckets.length ? buckets[0].bucket : "";
  state.page = 1;
  renderAll();
});

$bucket.addEventListener("change", (event) => {
  state.selectedBucket = String(event.target.value || "");
  state.page = 1;
  renderPlayersTable();
  $playersTitle.textContent = getPlayerScopeTitle();
});

$medalSelect.addEventListener("change", (event) => {
  state.medalType = String(event.target.value || "author");
  renderMedalLeaderboards();
});

if ($pagePrev) {
  $pagePrev.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      renderPlayersTable();
    }
  });
}

if ($pageNext) {
  $pageNext.addEventListener("click", () => {
    state.page += 1;
    renderPlayersTable();
  });
}

if ($pageSize) {
  $pageSize.addEventListener("change", (event) => {
    const parsed = Number(event.target.value || 25);
    state.pageSize = Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
    state.page = 1;
    renderPlayersTable();
  });
}

loadData();
