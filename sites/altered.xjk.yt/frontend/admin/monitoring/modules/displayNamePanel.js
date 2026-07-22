import "/shared/xjk-core/safe-html.js?v=2";
import { esc, fmtAgo, fmtCount, fmtTs, n, setLine } from "./context.js";

function createDisplayNamePanel({ state, el, api, loadMonitor }) {
  function render() {
    const s = state.monitorStatus || {};
    const m = s.monitor || {};
    const p = m.progress || {};
    const pct = Math.max(0, Math.min(100, Math.floor(n(p.percent, 0))));
    const d = s.mapperNameSync || {};
    const stats = d.stats || {};
    const sum = d.lastSummary || {};

    if (!state.displayNameFormDirty) {
      el.displayNameEnabledInput.checked = Boolean(d.enabled);
      el.displayNameBootstrapIntervalInput.value = String(
        Math.max(5, Math.min(3600, Math.floor(n(d.bootstrapIntervalSeconds, 5))))
      );
      el.displayNameMaintenanceIntervalInput.value = String(
        Math.max(10, Math.min(86400, Math.floor(n(d.maintenanceIntervalSeconds, 20))))
      );
      el.displayNamePriorityIntervalInput.value = String(
        Math.max(5, Math.min(3600, Math.floor(n(d.priorityIntervalSeconds, 5))))
      );
      el.displayNameCacheTtlInput.value = String(
        Math.max(0, Math.min(2592000, Math.floor(n(d.cacheTtlSeconds, 86400))))
      );
      el.displayNamePriorityCacheTtlInput.value = String(
        Math.max(0, Math.min(2592000, Math.floor(n(d.priorityCacheTtlSeconds, 1800))))
      );
      el.displayNameKnownAccountsRefreshInput.value = String(
        Math.max(60, Math.min(86400, Math.floor(n(d.knownAccountsRefreshSeconds, 900))))
      );
      el.displayNameBatchSizeInput.value = String(Math.max(1, Math.min(50, Math.floor(n(d.batchSize, 50)))));
      el.displayNamePriorityBatchSizeInput.value = String(
        Math.max(1, Math.min(50, Math.floor(n(d.priorityBatchSize, 25))))
      );
      el.displayNameRequestGapInput.value = String(
        Math.max(5000, Math.min(120000, Math.floor(n(d.minRequestGapMs, 5000))))
      );
      el.displayNamePriorityTopLimitInput.value = String(
        Math.max(1, Math.min(2000, Math.floor(n(d.priorityTopLimit, 250))))
      );
    }

    el.displayNameStateLine.textContent = `sync=${d.running ? "running" : d.enabled ? d.mode || "enabled" : "disabled"} | lookup=${s.mapperNameTracking?.configured ? "configured" : "not configured"}`;
    el.displayNameScheduleLine.textContent = `next=${fmtTs(d.nextRunAt)} | next priority=${fmtTs(d.nextPriorityRunAt)} | gap=${fmtCount(d.minRequestGapMs || 0)}ms`;
    el.displayNameLastLine.textContent = d.lastError
      ? `Last failed: ${d.lastError}`
      : d.lastFinishedAt
        ? `Last run: ${fmtAgo(d.lastFinishedAt)}`
        : "Last run: -";
    el.displayNameProgressBar.style.width = d.running ? `${pct}%` : "0%";
    el.displayNameProgressText.textContent = d.running ? `Progress: ${pct}%` : "Progress: idle";
    globalThis.XjkSafeHtml.set(
      el.displayNameStatsGrid,
      `
    <article class="live-progress-stat"><p class="live-progress-stat-label">Known Accounts</p><p class="live-progress-stat-value">${esc(fmtCount(stats.totalAccounts || 0))}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Unresolved</p><p class="live-progress-stat-value">${esc(fmtCount(stats.unresolvedAccounts || 0))}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Tracker Cache Hits (Last)</p><p class="live-progress-stat-value">${esc(fmtCount(sum.trackerCacheHits || 0))}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Nadeo Resolved (Last)</p><p class="live-progress-stat-value">${esc(fmtCount(sum.nadeoResolved || 0))}</p></article>
    <article class="live-progress-stat"><p class="live-progress-stat-label">Names Updated (Last)</p><p class="live-progress-stat-value">${esc(fmtCount(sum.namesUpdated || 0))}</p></article>
  `
    );
  }

  async function runDisplayName(priority = false, force = false) {
    setLine(
      el.displayNameActionStatus,
      `Starting ${priority ? "priority " : force ? "force " : ""}display-name sync...`
    );
    try {
      const r = await api("/api/v1/admin/hook/altered/live/mapper-sync/run", {
        method: "POST",
        body: { priority, force },
      });
      const x = r?.result || {};
      setLine(
        el.displayNameActionStatus,
        x.skipped
          ? `Skipped (${x.reason || "no-op"}).`
          : `Done: tracker hits=${fmtCount(x.trackerCacheHits || 0)}, nadeo resolved=${fmtCount(x.nadeoResolved || 0)}, updated=${fmtCount(x.namesUpdated || 0)}.`,
        "good"
      );
      await loadMonitor(true);
    } catch (e) {
      setLine(el.displayNameActionStatus, `Display-name sync failed: ${e.message}`, "bad");
    }
  }

  async function syncSpecificAccounts() {
    const ids = String(el.displayNameAccountIdsInput.value || "").trim();
    if (!ids) return setLine(el.displayNameActionStatus, "Enter at least one account ID.", "bad");
    el.displayNameSyncAccountsBtn.disabled = true;
    try {
      const r = await api("/api/v1/admin/hook/altered/live/mapper-sync/accounts", {
        method: "POST",
        body: { accountIds: ids, force: Boolean(el.displayNameSpecificForceInput.checked) },
      });
      const x = r?.result || {};
      setLine(
        el.displayNameActionStatus,
        `Targeted sync: requested=${fmtCount(x.requested || x.requestedAccountIds || 0)}, tracker hits=${fmtCount(x.trackerCacheHits || 0)}, nadeo resolved=${fmtCount(x.nadeoResolved || 0)}.`,
        "good"
      );
      await loadMonitor(true);
    } catch (e) {
      setLine(el.displayNameActionStatus, `Targeted sync failed: ${e.message}`, "bad");
    } finally {
      el.displayNameSyncAccountsBtn.disabled = false;
    }
  }

  async function saveDisplayNameConfig(e) {
    e.preventDefault();
    const payload = {
      enabled: Boolean(el.displayNameEnabledInput.checked),
      bootstrapIntervalSeconds: Math.max(
        5,
        Math.min(3600, Math.floor(n(el.displayNameBootstrapIntervalInput.value, 5)))
      ),
      maintenanceIntervalSeconds: Math.max(
        10,
        Math.min(86400, Math.floor(n(el.displayNameMaintenanceIntervalInput.value, 20)))
      ),
      priorityIntervalSeconds: Math.max(5, Math.min(3600, Math.floor(n(el.displayNamePriorityIntervalInput.value, 5)))),
      cacheTtlSeconds: Math.max(0, Math.min(2592000, Math.floor(n(el.displayNameCacheTtlInput.value, 86400)))),
      priorityCacheTtlSeconds: Math.max(
        0,
        Math.min(2592000, Math.floor(n(el.displayNamePriorityCacheTtlInput.value, 1800)))
      ),
      knownAccountsRefreshSeconds: Math.max(
        60,
        Math.min(86400, Math.floor(n(el.displayNameKnownAccountsRefreshInput.value, 900)))
      ),
      batchSize: Math.max(1, Math.min(50, Math.floor(n(el.displayNameBatchSizeInput.value, 50)))),
      priorityBatchSize: Math.max(1, Math.min(50, Math.floor(n(el.displayNamePriorityBatchSizeInput.value, 25)))),
      minRequestGapMs: Math.max(5000, Math.min(120000, Math.floor(n(el.displayNameRequestGapInput.value, 5000)))),
      priorityTopLimit: Math.max(1, Math.min(2000, Math.floor(n(el.displayNamePriorityTopLimitInput.value, 250)))),
    };
    try {
      await api("/api/v1/admin/hook/altered/live/mapper-sync/config", { method: "POST", body: payload });
      state.displayNameFormDirty = false;
      setLine(el.displayNameConfigStatus, "Display-name scheduler saved.", "good");
      await loadMonitor(true);
    } catch (err) {
      setLine(el.displayNameConfigStatus, `Config save failed: ${err.message}`, "bad");
    }
  }

  function bindEvents() {
    el.refreshDisplayNameBtn?.addEventListener("click", () => loadMonitor(false));
    el.displayNameRunBtn?.addEventListener("click", () => runDisplayName(false, false));
    el.displayNameRunForceBtn?.addEventListener("click", () => runDisplayName(false, true));
    el.displayNameRunPriorityBtn?.addEventListener("click", () => runDisplayName(true, false));
    el.displayNameSyncAccountsBtn?.addEventListener("click", syncSpecificAccounts);
    el.displayNameConfigForm?.addEventListener("submit", saveDisplayNameConfig);
    [
      el.displayNameEnabledInput,
      el.displayNameBootstrapIntervalInput,
      el.displayNameMaintenanceIntervalInput,
      el.displayNamePriorityIntervalInput,
      el.displayNameCacheTtlInput,
      el.displayNamePriorityCacheTtlInput,
      el.displayNameKnownAccountsRefreshInput,
      el.displayNameBatchSizeInput,
      el.displayNamePriorityBatchSizeInput,
      el.displayNameRequestGapInput,
      el.displayNamePriorityTopLimitInput,
    ]
      .filter(Boolean)
      .forEach((node) => {
        const eventName = node.tagName === "INPUT" && node.type !== "checkbox" ? "input" : "change";
        node.addEventListener(eventName, () => {
          state.displayNameFormDirty = true;
        });
      });
  }

  return { bindEvents, render };
}

export { createDisplayNamePanel };
