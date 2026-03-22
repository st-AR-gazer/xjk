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

const ACCOUNT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const displayNameRefresh = {
  timer: null,
  attempts: 0,
  key: "",
};

function looksLikeAccountId(value) {
  return ACCOUNT_ID_RE.test(String(value || "").trim());
}

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

  const out = [];
  const seen = new Set();
  for (const row of scopedRows) {
    const accountId =
      [row?.account_id, row?.accountId, row?.player, row?.display_name, row?.displayName]
        .map((value) => String(value || "").trim().toLowerCase())
        .find((value) => looksLikeAccountId(value)) || "";
    const playerText =
      [row?.player, row?.display_name, row?.displayName]
        .map((value) => String(value || "").trim())
        .find((value) => looksLikeAccountId(value)) || "";
    const pending = Boolean(row?.displayNamePending) || Boolean(accountId && playerText);
    if (!pending || !accountId || seen.has(accountId)) continue;
    seen.add(accountId);
    out.push(accountId);
  }
  return out;
}

function clearDisplayNameRefresh({ reset = true } = {}) {
  if (displayNameRefresh.timer) {
    clearTimeout(displayNameRefresh.timer);
    displayNameRefresh.timer = null;
  }
  if (reset) {
    displayNameRefresh.attempts = 0;
    displayNameRefresh.key = "";
  }
}

function schedulePendingDisplayNameRefresh(accountIds = []) {
  const pendingAccountIds = [...new Set((Array.isArray(accountIds) ? accountIds : []).filter(Boolean))];
  if (!pendingAccountIds.length) {
    clearDisplayNameRefresh({ reset: true });
    return;
  }

  const refreshKey = pendingAccountIds.join(",");
  if (displayNameRefresh.key !== refreshKey) {
    clearDisplayNameRefresh({ reset: false });
    displayNameRefresh.key = refreshKey;
    displayNameRefresh.attempts = 0;
  }
  if (displayNameRefresh.timer || displayNameRefresh.attempts >= 6) return;

  const delaysMs = [4000, 8000, 12000, 20000, 30000, 45000];
  const delayMs = delaysMs[Math.min(displayNameRefresh.attempts, delaysMs.length - 1)];
  displayNameRefresh.attempts += 1;
  displayNameRefresh.timer = setTimeout(() => {
    displayNameRefresh.timer = null;
    loadData({ silent: true, resetDisplayNameRefresh: false });
  }, delayMs);
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
  if (el) el.textContent = value ?? "\u2014";
}

function renderStats() {
  const summary = state.payload?.summary || {};
  const coverage = summary?.leaderboard_coverage || {};
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
  setStat(
    "stat-maps-wr-known",
    `${Number(coverage.maps_with_known_wr || 0)} / ${Number(coverage.total_maps || summary.total_maps || 0)}`
  );
  setStat(
    "stat-maps-fuller-lb",
    `${Number(coverage.maps_with_extended_leaderboard || 0)} / ${Number(coverage.total_maps || summary.total_maps || 0)}`
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
      totalMaps > 0
        ? `${Number(coverage.leaderboard_rows_stored || 0)} rows stored`
        : "No tracker data";
  }

  const barsEl = document.getElementById("coverage-bars");
  if (!barsEl) return;
  barsEl.innerHTML = rows
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
    .join("");
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

  $tbody.innerHTML = pageRows
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
    .join("");

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
  renderCoverageBars();
  renderBucketSelect();
  renderPlayersTable();
  renderMostPlayedMaps();
  renderMedalLeaderboards();
}

async function loadData({ silent = false, resetDisplayNameRefresh = true } = {}) {
  if (resetDisplayNameRefresh) {
    clearDisplayNameRefresh({ reset: true });
  }
  if (!silent) {
    $loading.hidden = false;
    $tableWrap.hidden = true;
    $empty.hidden = true;
    $error.hidden = true;
  }

  try {
    state.payload = await fetchJson(
      "/api/v1/alterations/leaderboards?limit=80&overallLimit=5000&perBucketLimit=12"
    );
    renderAll();
    schedulePendingDisplayNameRefresh(collectPendingDisplayNameAccountIds(state.payload));
    if (!silent) {
      $loading.hidden = true;
    }
  } catch {
    if (!silent) {
      $loading.hidden = true;
      $error.hidden = false;
    }
    schedulePendingDisplayNameRefresh(collectPendingDisplayNameAccountIds(state.payload));
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
