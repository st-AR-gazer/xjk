import "/shared/xjk-core/safe-html.js?v=2";
import { fetchJson } from "/shared/xjk-core/http.js";
import {
  clearDisplayNameRefreshState,
  collectPendingDisplayNameAccountIds as collectPendingAccountIds,
  scheduleDisplayNameRefresh,
} from "./shared/display-name-refresh.js?v=2";
import { escN, fmtTime, relTime, stripFmt } from "./shared/formatters.js?v=2";

const WR_FEED_LIMIT = 6;
const WR_HOLDERS_PAGE_SIZE = 10;
const alteredUrl = window.__alteredUrl || ((value) => value);

function isPlaceholderHolder(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  return !text || text === "-" || text === "unknown";
}

function collectPendingDisplayNameAccountIds(rows = []) {
  return collectPendingAccountIds(rows, {
    accountKeys: [
      "accountId",
      "account_id",
      "wrAccountId",
      "wr_account_id",
      "holder",
      "player",
      "display_name",
      "displayName",
      "wr_holder",
      "wrHolder",
    ],
    displayKeys: ["holder", "player", "display_name", "displayName", "wr_holder", "wrHolder"],
  });
}

const $statMaps = document.getElementById("stat-maps");
const $statCampaigns = document.getElementById("stat-campaigns");
const $statPlayers = document.getElementById("stat-players");
const $statLatest = document.getElementById("stat-latest");
const $wrFeed = document.getElementById("wr-feed");
const $miniRankings = document.getElementById("mini-rankings");
const $wrSpotlight = document.getElementById("wr-spotlight");
const $wrSpotlightMap = document.getElementById("wr-spotlight-map");
const $wrSpotlightPlayer = document.getElementById("wr-spotlight-player");
const $wrSpotlightTime = document.getElementById("wr-spotlight-time");
const $wrSpotlightAgo = document.getElementById("wr-spotlight-ago");
const $hubRefresh = document.getElementById("hub-refresh");
const $miniRankPrev = document.getElementById("mini-rank-prev");
const $miniRankNext = document.getElementById("mini-rank-next");
const $miniRankPageInfo = document.getElementById("mini-rank-page-info");

const state = {
  activeWrHoldersPage: 1,
  wrHoldersLoading: false,
  dashboardLoading: false,
  activeWrHoldersData: null,
  dashboardPendingAccountIds: [],
  wrHoldersPendingAccountIds: [],
  displayNameRefresh: { timer: null, attempts: 0, key: "" },
};

const cache = {
  dashboard: null,
  wrHoldersPages: new Map(),
  wrHoldersTotal: null,
};

function renderStats(summary, playersTotal = null) {
  if ($statMaps) $statMaps.textContent = summary?.trackedMaps ?? "\u2014";
  if ($statCampaigns) $statCampaigns.textContent = summary?.campaignCount ?? "\u2014";
  if ($statLatest) $statLatest.textContent = relTime(summary?.latestWrAt);
  if ($statPlayers) {
    const safePlayers = Number(playersTotal);
    $statPlayers.textContent = Number.isFinite(safePlayers) && safePlayers > 0 ? safePlayers : "\u2014";
  }
}

function renderWrFeed(feed) {
  if (!$wrFeed) return;
  if (!Array.isArray(feed) || !feed.length) {
    globalThis.XjkSafeHtml.set($wrFeed, `<p class="activity-empty">No recent WR changes.</p>`);
    return;
  }

  globalThis.XjkSafeHtml.set(
    $wrFeed,
    feed
      .slice(0, WR_FEED_LIMIT)
      .map(
        (entry) => `<div class="wr-feed-item">
      <span class="wr-feed-dot"></span>
      <div class="wr-feed-info">
        <span class="wr-feed-map">${escN(entry.name)}</span>
        <span class="wr-feed-player">by ${escN(entry.holder)}</span>
      </div>
      <div style="text-align:right">
        <span class="wr-feed-time">${fmtTime(entry.wrMs)}</span>
        <div class="wr-feed-ago">${relTime(entry.at)}</div>
      </div>
    </div>`
      )
      .join("")
  );
}

function renderLatestWr(feedOrEntry) {
  if (!$wrSpotlight || !feedOrEntry) return;
  const latest = Array.isArray(feedOrEntry) ? feedOrEntry[0] : feedOrEntry;
  if (!latest) return;

  $wrSpotlightMap.textContent = stripFmt(latest.name) || "\u2014";
  $wrSpotlightPlayer.textContent = "by " + stripFmt(latest.holder || "Unknown");
  $wrSpotlightTime.textContent = fmtTime(latest.wrMs);
  $wrSpotlightAgo.textContent = relTime(latest.at);
  $wrSpotlight.hidden = false;
}

function renderWrHoldersPage() {
  if (!$miniRankings) return;
  const pageData = state.activeWrHoldersData;
  if (!pageData || !Array.isArray(pageData.rows) || !pageData.rows.length) {
    globalThis.XjkSafeHtml.set($miniRankings, `<li class="activity-empty">No rankings yet.</li>`);
    updateWrHoldersPager();
    return;
  }

  const posClass = ["gold", "silver", "bronze"];
  const pageOffset = (state.activeWrHoldersPage - 1) * WR_HOLDERS_PAGE_SIZE;
  const ranked = pageData.rows
    .map((row, idx) => ({
      rank: pageOffset + idx + 1,
      player: String(row.display_name || row.displayName || row.player || "Unknown"),
      count: Number(row.wr_count || 0),
    }))
    .filter((row) => row.count > 0 && !isPlaceholderHolder(row.player));

  if (!ranked.length) {
    globalThis.XjkSafeHtml.set($miniRankings, `<li class="activity-empty">No rankings yet.</li>`);
    updateWrHoldersPager();
    return;
  }

  globalThis.XjkSafeHtml.set(
    $miniRankings,
    ranked
      .map(
        (row) => `<li class="mini-rank-item">
      <span class="mini-rank-pos ${row.rank <= 3 ? posClass[row.rank - 1] || "" : ""}">${row.rank}</span>
      <span class="mini-rank-name">${escN(row.player)}</span>
      <span class="mini-rank-count">${row.count} WR${row.count !== 1 ? "s" : ""}</span>
    </li>`
      )
      .join("")
  );

  updateWrHoldersPager();
}

function updateWrHoldersPager() {
  if (!$miniRankPageInfo || !$miniRankPrev || !$miniRankNext) return;

  const totalPlayers = Number(cache.wrHoldersTotal || state.activeWrHoldersData?.total || 0);
  const totalPages =
    Number.isFinite(totalPlayers) && totalPlayers > 0
      ? Math.max(1, Math.ceil(totalPlayers / WR_HOLDERS_PAGE_SIZE))
      : null;
  const activePage = state.activeWrHoldersPage;
  const hasCachedNext = cache.wrHoldersPages.has(activePage + 1);
  const hasMore = Boolean(state.activeWrHoldersData?.hasMore);

  $miniRankPageInfo.textContent = totalPages ? `Page ${activePage} / ${totalPages}` : `Page ${activePage}`;
  $miniRankPrev.disabled = state.wrHoldersLoading || activePage <= 1;
  $miniRankNext.disabled = state.wrHoldersLoading || (!hasCachedNext && !hasMore);
}

function updateRefreshState() {
  if (!$hubRefresh) return;
  const busy = state.dashboardLoading || state.wrHoldersLoading;
  $hubRefresh.disabled = busy;
  $hubRefresh.textContent = busy ? "Refreshing..." : "Refresh";
}

function clearHubCache() {
  cache.dashboard = null;
  cache.wrHoldersPages.clear();
  cache.wrHoldersTotal = null;
}

function clearDisplayNameRefresh({ reset = true } = {}) {
  clearDisplayNameRefreshState(state.displayNameRefresh, { reset });
}

function schedulePendingDisplayNameRefresh() {
  scheduleDisplayNameRefresh({
    state: state.displayNameRefresh,
    accountIds: [...state.dashboardPendingAccountIds, ...state.wrHoldersPendingAccountIds],
    onRefresh: () => refreshHubData({ resetDisplayNameRefresh: false }),
  });
}

async function fetchDashboardData({ force = false } = {}) {
  if (!force && cache.dashboard) return cache.dashboard;

  const dashboardQuery = new URLSearchParams({
    mapsLimit: "0",
    mapsOffset: "0",
    wrFeedLimit: String(WR_FEED_LIMIT),
    includeMapOptions: "0",
    includeTracker: "0",
  });
  const payload = await fetchJson(alteredUrl(`/api/v1/dashboard?${dashboardQuery.toString()}`));
  cache.dashboard = payload;
  return payload;
}

async function fetchWrHoldersPage(pageNumber, { force = false } = {}) {
  const safePage = Math.max(1, Number(pageNumber) || 1);
  if (!force && cache.wrHoldersPages.has(safePage)) {
    return cache.wrHoldersPages.get(safePage);
  }

  const offset = (safePage - 1) * WR_HOLDERS_PAGE_SIZE;
  const query = new URLSearchParams({
    limit: "1",
    overallLimit: String(WR_HOLDERS_PAGE_SIZE),
    overallOffset: String(offset),
    perBucketLimit: "1",
    includeMaps: "0",
    includeBuckets: "0",
    includeMedals: "0",
  });
  const payload = await fetchJson(alteredUrl(`/api/v1/alterations/leaderboards?${query.toString()}`));
  const rows = Array.isArray(payload?.wr?.overall) ? payload.wr.overall : [];
  const total = Number(payload?.paging?.overall_players?.total ?? payload?.summary?.unique_wr_players ?? rows.length);
  const hasMore = Boolean(payload?.paging?.overall_players?.has_more);

  const pageData = {
    rows,
    total: Number.isFinite(total) ? total : rows.length,
    hasMore,
  };
  cache.wrHoldersPages.set(safePage, pageData);
  if (Number.isFinite(pageData.total) && pageData.total > 0) {
    cache.wrHoldersTotal = pageData.total;
  }
  return pageData;
}

async function loadDashboardSection({ force = false } = {}) {
  state.dashboardLoading = true;
  updateRefreshState();
  try {
    const dashboard = await fetchDashboardData({ force });
    const summary = dashboard?.summary || {};
    const wrFeed = Array.isArray(dashboard?.wrFeed) ? dashboard.wrFeed : [];
    const latestWr = dashboard?.latestWr || (wrFeed.length ? wrFeed[0] : null);

    renderStats(summary, cache.wrHoldersTotal);
    renderLatestWr(latestWr);
    renderWrFeed(wrFeed);
    state.dashboardPendingAccountIds = collectPendingDisplayNameAccountIds([
      ...(latestWr ? [latestWr] : []),
      ...wrFeed,
    ]);
    schedulePendingDisplayNameRefresh();
  } catch {
    if ($wrFeed) {
      globalThis.XjkSafeHtml.set($wrFeed, `<p class="activity-empty">Could not load activity feed.</p>`);
    }
    state.dashboardPendingAccountIds = [];
    schedulePendingDisplayNameRefresh();
  } finally {
    state.dashboardLoading = false;
    updateRefreshState();
  }
}

async function loadWrHoldersPage(pageNumber, { force = false } = {}) {
  state.wrHoldersLoading = true;
  updateWrHoldersPager();
  updateRefreshState();

  try {
    const pageData = await fetchWrHoldersPage(pageNumber, { force });
    state.activeWrHoldersPage = Math.max(1, Number(pageNumber) || 1);
    state.activeWrHoldersData = pageData;
    renderWrHoldersPage();
    state.wrHoldersPendingAccountIds = collectPendingDisplayNameAccountIds(pageData?.rows || []);
    schedulePendingDisplayNameRefresh();
    if ($statPlayers && Number.isFinite(cache.wrHoldersTotal) && cache.wrHoldersTotal > 0) {
      $statPlayers.textContent = String(cache.wrHoldersTotal);
    }
  } catch {
    if ($miniRankings) {
      globalThis.XjkSafeHtml.set($miniRankings, `<li class="activity-empty">Could not load rankings.</li>`);
    }
    state.wrHoldersPendingAccountIds = [];
    schedulePendingDisplayNameRefresh();
  } finally {
    state.wrHoldersLoading = false;
    updateWrHoldersPager();
    updateRefreshState();
  }
}

async function refreshHubData({ resetDisplayNameRefresh = true } = {}) {
  if (resetDisplayNameRefresh) {
    clearDisplayNameRefresh({ reset: true });
  }
  const targetWrHoldersPage = Math.max(1, Number(state.activeWrHoldersPage) || 1);
  clearHubCache();
  state.activeWrHoldersPage = targetWrHoldersPage;
  state.activeWrHoldersData = null;
  loadDashboardSection({ force: true });
  loadWrHoldersPage(targetWrHoldersPage, { force: true });
}

if ($miniRankPrev) {
  $miniRankPrev.addEventListener("click", () => {
    if (state.activeWrHoldersPage <= 1 || state.wrHoldersLoading) return;
    loadWrHoldersPage(state.activeWrHoldersPage - 1);
  });
}

if ($miniRankNext) {
  $miniRankNext.addEventListener("click", () => {
    if (state.wrHoldersLoading) return;
    loadWrHoldersPage(state.activeWrHoldersPage + 1);
  });
}

if ($hubRefresh) {
  $hubRefresh.addEventListener("click", () => {
    refreshHubData();
  });
}

loadDashboardSection();
loadWrHoldersPage(1);
