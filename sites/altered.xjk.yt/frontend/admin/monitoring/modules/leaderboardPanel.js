import "/shared/xjk-core/safe-html.js?v=2";
import { esc, fmtAgo, fmtCount, fmtPct, fmtTs, n, renderList, setLine } from "./context.js";

const LB_SCHED_KEY = "altered_admin_monitor_lb_sched_v1";

function createLeaderboardPanel({ state, el, api }) {
  function readLbScheduler() {
    return {
      enabled: Boolean(el.leaderboardSchedulerEnabledInput?.checked),
      intervalSeconds: Math.max(5, Math.min(120, Math.floor(n(el.leaderboardSchedulerIntervalInput?.value, 15)))),
      feedLimit: Math.max(10, Math.min(200, Math.floor(n(el.leaderboardFeedLimitInput?.value, 80)))),
    };
  }

  function loadLbScheduler() {
    try {
      const raw = localStorage.getItem(LB_SCHED_KEY);
      if (!raw) return;
      const x = JSON.parse(raw);
      state.lbScheduler.enabled = Boolean(x?.enabled);
      state.lbScheduler.intervalSeconds = Math.max(5, Math.min(120, Math.floor(n(x?.intervalSeconds, 15))));
      state.lbScheduler.feedLimit = Math.max(10, Math.min(200, Math.floor(n(x?.feedLimit, 80))));
    } catch {}
  }

  function hydrateLbScheduler() {
    el.leaderboardSchedulerEnabledInput.checked = state.lbScheduler.enabled;
    el.leaderboardSchedulerIntervalInput.value = String(state.lbScheduler.intervalSeconds);
    el.leaderboardFeedLimitInput.value = String(state.lbScheduler.feedLimit);
  }

  function renderLeaderboards() {
    const p = state.leaderboards || {};
    const l = p.leaderboards || {};
    const s = l.summary || {};
    const coverage = s.leaderboard_coverage || {};
    const feed = Array.isArray(p.feed) ? p.feed : [];
    const wr = Array.isArray(l?.wr?.overall) ? l.wr.overall : [];
    const mp = Array.isArray(l?.maps?.most_played) ? l.maps.most_played : [];

    el.leaderboardStatusLine.textContent = state.leaderboards
      ? `Updated ${fmtAgo(state.leaderboardsLoadedAt)} | feed=${fmtCount(p.feedCount || 0)}/${fmtCount(p.feedSourceCount || 0)} | altered tracked maps=${fmtCount(p.alteredTrackedMapCount || 0)}`
      : "Loading leaderboard snapshot...";
    el.leaderboardLastUpdatedLine.textContent = `Last update: ${fmtTs(state.leaderboardsLoadedAt)}`;

    globalThis.XjkSafeHtml.set(
      el.leaderboardSummaryGrid,
      `
    <article class="live-progress-stat"><p class="live-progress-stat-label">Altered Total Maps</p><p class="live-progress-stat-value">${esc(fmtCount(s.total_maps || 0))}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Altered Active Maps</p><p class="live-progress-stat-value">${esc(fmtCount(s.active_maps || 0))}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Unique WR Players</p><p class="live-progress-stat-value">${esc(fmtCount(s.unique_wr_players || 0))}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Total WRs</p><p class="live-progress-stat-value">${esc(fmtCount(s.total_wrs || 0))}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Maps With WR Known</p><p class="live-progress-stat-value">${esc(`${fmtCount(coverage.maps_with_known_wr || 0)} / ${fmtCount(coverage.total_maps || 0)}`)}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Maps With Fuller LB</p><p class="live-progress-stat-value">${esc(`${fmtCount(coverage.maps_with_extended_leaderboard || 0)} / ${fmtCount(coverage.total_maps || 0)}`)}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Stored LB Rows</p><p class="live-progress-stat-value">${esc(fmtCount(coverage.leaderboard_rows_stored || 0))}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Extended Coverage</p><p class="live-progress-stat-value">${esc(fmtPct(coverage.extended_coverage_pct || 0))}</p></article>
  `
    );

    renderList(
      el.leaderboardLiveFeedList,
      feed.slice(0, 40),
      (r) =>
        `<strong>${esc(r.name || r.uid || "Unknown map")}</strong><span class="hook-map-meta">UID: ${esc(r.uid || "-")} | Holder: ${esc(r.holder || "Unknown")} | WR: ${esc(fmtCount(r.wrMs || 0))} ms | ${esc(fmtTs(r.at))}</span>`,
      "No live tracker events for altered maps yet."
    );

    renderList(
      el.leaderboardWrList,
      wr.slice(0, 16),
      (r) =>
        `<strong>${esc(r.display_name || r.player || r.account_id || "Unknown")} - ${esc(fmtCount(r.wr_count || 0))} WRs</strong><span class="hook-map-meta">${r.account_id ? `Account: ${esc(r.account_id)}` : "No account ID linked yet."}</span>`,
      "No WR player rows yet."
    );

    renderList(
      el.leaderboardMostPlayedList,
      mp.slice(0, 16),
      (r) =>
        `<strong>${esc(r.name || r.map_name || r.map_uid || "Unknown map")}</strong><span class="hook-map-meta">Players: ${esc(fmtCount(r.players || r.player_count || 0))} | UID: ${esc(r.map_uid || r.uid || "-")}</span>`,
      "No map activity rows yet."
    );
  }

  async function loadLb(silent = false) {
    try {
      const payload = await api(
        `/api/v1/alterations/leaderboards/live?limit=18&feedLimit=${state.lbScheduler.feedLimit}`
      );
      state.leaderboards = payload || {};
      state.leaderboardsLoadedAt = new Date().toISOString();
      state.lastLbRefreshAtMs = Date.now();
      renderLeaderboards();
    } catch (e) {
      if (!silent) setLine(el.leaderboardSchedulerStatus, `Failed to load leaderboard data: ${e.message}`, "bad");
    }
  }

  function bindEvents() {
    el.refreshLeaderboardBtn?.addEventListener("click", () => loadLb(false));
    el.leaderboardSchedulerForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      state.lbScheduler = readLbScheduler();
      localStorage.setItem(LB_SCHED_KEY, JSON.stringify(state.lbScheduler));
      setLine(el.leaderboardSchedulerStatus, "Leaderboard scheduler saved.", "good");
    });
  }

  function initialize() {
    loadLbScheduler();
    hydrateLbScheduler();
  }

  return { bindEvents, initialize, load: loadLb, render: renderLeaderboards };
}

export { createLeaderboardPanel };
