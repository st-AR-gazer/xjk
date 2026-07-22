import "/shared/xjk-core/safe-html.js?v=2";
import { esc, fmtAgo, fmtCount, fmtTs, n, setLine } from "./context.js";

function createLivePanel({ state, el, api, loadMonitor, loadClub, waitForRun }) {
  function render() {
    const s = state.monitorStatus || {};
    const m = s.monitor || {};
    const p = m.progress || {};
    const pct = Math.max(0, Math.min(100, Math.floor(n(p.percent, 0))));

    if (!state.formDirty) {
      el.clubIdInput.value = String(m.clubId || 24231);
      el.scheduleModeInput.value = m.scheduleMode === "interval" ? "interval" : "daily";
      el.intervalSecondsInput.value = String(Math.max(60, Math.min(86400, Math.floor(n(m.intervalSeconds, 21600)))));
      el.dailyHourInput.value = String(Math.max(0, Math.min(23, Math.floor(n(m.dailyHourUtc, 3)))));
      el.dailyMinuteInput.value = String(Math.max(0, Math.min(59, Math.floor(n(m.dailyMinuteUtc, 0)))));
      el.activityPageSizeInput.value = String(Math.max(1, Math.min(250, Math.floor(n(m.activityPageSize, 250)))));
      el.trackerChunkSizeInput.value = String(Math.max(25, Math.min(1000, Math.floor(n(m.trackerChunkSize, 350)))));
      el.monitorEnabledInput.checked = Boolean(m.enabled);
      el.activeOnlyInput.checked = Boolean(m.activeOnly);
      el.fetchMapDetailsInput.checked = Boolean(m.fetchMapDetails);
      el.discoveryEnabledInput.checked = Boolean(m.discoveryEnabled);
      el.discoveryIntervalInput.value = String(
        Math.max(300, Math.min(86400, Math.floor(n(m.discoveryIntervalSeconds, 3600))))
      );
      el.discoveryCampaignLimitInput.value = String(
        Math.max(1, Math.min(250, Math.floor(n(m.discoveryCampaignLimit, 25))))
      );
      el.discoveryActivityPageSizeInput.value = String(
        Math.max(1, Math.min(250, Math.floor(n(m.discoveryActivityPageSize, 100))))
      );
    }

    el.authState.textContent = s.configured
      ? `Live API ready (${s.auth?.authMode || s.auth?.mode || "configured"})`
      : "Live API auth not configured.";
    el.statFullState.textContent = m.running ? "Running" : m.enabled ? "Enabled" : "Disabled";
    el.statDiscoveryState.textContent = m.discoveryRunning ? "Running" : m.discoveryEnabled ? "Enabled" : "Disabled";
    el.statNextFull.textContent = fmtTs(m.nextRunAt);
    el.statNextDiscovery.textContent = fmtTs(m.nextDiscoveryRunAt);

    el.liveStatusLine.textContent = `full=${m.running ? "running" : "idle"} | discovery=${m.discoveryRunning ? "running" : m.discoveryEnabled ? "enabled" : "disabled"}`;
    el.liveNextRunLine.textContent = `next full=${fmtTs(m.nextRunAt)} | next discovery=${fmtTs(m.nextDiscoveryRunAt)}`;
    el.liveSummaryLine.textContent = m.lastSummary
      ? `Last full scan: ${fmtCount(m.lastSummary.campaignsLoaded || 0)} campaigns, ${fmtCount(m.lastSummary.mapsLoaded || 0)} maps (${fmtAgo(m.lastFinishedAt)})`
      : m.lastError
        ? `Last full scan failed: ${m.lastError}`
        : "Last full scan: -";

    el.liveProgressBar.style.width = `${pct}%`;
    el.actionProgressBar.style.width = `${pct}%`;
    el.liveProgressText.textContent = `Progress: ${pct}% (${String(p.status || "idle")})`;
    el.liveProgressMeta.textContent = p.message ? `${p.message} | phase=${p.phase || "-"}` : "No active run.";

    const counters = p.counters && typeof p.counters === "object" ? p.counters : {};
    const keys = Object.keys(counters);
    globalThis.XjkSafeHtml.set(
      el.liveCounterGrid,
      keys.length
        ? keys
            .map(
              (k) =>
                `<article class="live-progress-stat"><p class="live-progress-stat-label">${esc(k)}</p><p class="live-progress-stat-value">${esc(fmtCount(counters[k]))}</p></article>`
            )
            .join("")
        : '<p class="hook-map-meta">No live counters yet.</p>'
    );
  }

  async function saveMonitorConfig(e) {
    e.preventDefault();
    const payload = {
      clubId: Math.max(1, Math.floor(n(el.clubIdInput.value, 24231))),
      scheduleMode: String(el.scheduleModeInput.value || "daily").toLowerCase() === "interval" ? "interval" : "daily",
      intervalSeconds: Math.max(60, Math.min(86400, Math.floor(n(el.intervalSecondsInput.value, 21600)))),
      dailyHourUtc: Math.max(0, Math.min(23, Math.floor(n(el.dailyHourInput.value, 3)))),
      dailyMinuteUtc: Math.max(0, Math.min(59, Math.floor(n(el.dailyMinuteInput.value, 0)))),
      activityPageSize: Math.max(1, Math.min(250, Math.floor(n(el.activityPageSizeInput.value, 250)))),
      trackerChunkSize: Math.max(25, Math.min(1000, Math.floor(n(el.trackerChunkSizeInput.value, 350)))),
      enabled: Boolean(el.monitorEnabledInput.checked),
      activeOnly: Boolean(el.activeOnlyInput.checked),
      fetchMapDetails: Boolean(el.fetchMapDetailsInput.checked),
      discoveryEnabled: Boolean(el.discoveryEnabledInput.checked),
      discoveryIntervalSeconds: Math.max(300, Math.min(86400, Math.floor(n(el.discoveryIntervalInput.value, 3600)))),
      discoveryCampaignLimit: Math.max(1, Math.min(250, Math.floor(n(el.discoveryCampaignLimitInput.value, 25)))),
      discoveryActivityPageSize: Math.max(
        1,
        Math.min(250, Math.floor(n(el.discoveryActivityPageSizeInput.value, 100)))
      ),
    };
    try {
      state.monitorStatus = await api("/api/v1/admin/hook/altered/live/monitor/config", {
        method: "POST",
        body: payload,
      });
      state.formDirty = false;
      render();
      setLine(el.configStatus, "Club scheduler saved.", "good");
    } catch (err) {
      setLine(el.configStatus, `Config save failed: ${err.message}`, "bad");
    }
  }

  async function runFull() {
    el.runFullBtn.disabled = true;
    setLine(el.actionStatus, "Starting full scan...");
    try {
      const r = await api("/api/v1/admin/hook/altered/live/monitor/run", { method: "POST", body: {} });
      if (!r?.skipped) await waitForRun("full");
      await Promise.all([loadMonitor(true), loadClub(true)]);
      setLine(
        el.actionStatus,
        String(state.monitorStatus?.monitor?.progress?.message || "Full scan finished."),
        "good"
      );
    } catch (e) {
      setLine(el.actionStatus, `Full scan failed: ${e.message}`, "bad");
    } finally {
      el.runFullBtn.disabled = false;
    }
  }

  async function runDiscovery() {
    el.runDiscoveryBtn.disabled = true;
    setLine(el.actionStatus, "Starting discovery scan...");
    try {
      const r = await api("/api/v1/admin/hook/altered/live/monitor/run-discovery", { method: "POST", body: {} });
      if (!r?.skipped) await waitForRun("discovery");
      await Promise.all([loadMonitor(true), loadClub(true)]);
      setLine(
        el.actionStatus,
        String(state.monitorStatus?.monitor?.progress?.message || "Discovery scan finished."),
        "good"
      );
    } catch (e) {
      setLine(el.actionStatus, `Discovery scan failed: ${e.message}`, "bad");
    } finally {
      el.runDiscoveryBtn.disabled = false;
    }
  }

  async function runSummary() {
    el.fetchSummaryBtn.disabled = true;
    setLine(el.actionStatus, "Fetching summary...");
    try {
      const payload = { clubId: Math.max(1, Math.floor(n(el.clubIdInput.value, 24231))), summaryOnly: true };
      const r = await api("/api/v1/admin/hook/altered/live/fetch", { method: "POST", body: payload });
      setLine(
        el.actionStatus,
        `Summary loaded: ${fmtCount(r?.summary?.campaignsLoaded || 0)} campaigns, ${fmtCount(r?.summary?.mapsLoaded || 0)} maps.`,
        "good"
      );
      await Promise.all([loadMonitor(true), loadClub(true)]);
    } catch (e) {
      setLine(el.actionStatus, `Summary fetch failed: ${e.message}`, "bad");
    } finally {
      el.fetchSummaryBtn.disabled = false;
    }
  }

  function bindEvents() {
    el.monitorConfigForm?.addEventListener("submit", saveMonitorConfig);
    [
      el.clubIdInput,
      el.scheduleModeInput,
      el.intervalSecondsInput,
      el.dailyHourInput,
      el.dailyMinuteInput,
      el.activityPageSizeInput,
      el.trackerChunkSizeInput,
      el.monitorEnabledInput,
      el.activeOnlyInput,
      el.fetchMapDetailsInput,
      el.discoveryIntervalInput,
      el.discoveryCampaignLimitInput,
      el.discoveryActivityPageSizeInput,
      el.discoveryEnabledInput,
    ]
      .filter(Boolean)
      .forEach((node) => {
        const eventName = node.tagName === "INPUT" && node.type !== "checkbox" ? "input" : "change";
        node.addEventListener(eventName, () => {
          state.formDirty = true;
        });
      });
    el.refreshStatusBtn?.addEventListener("click", () => loadMonitor(false));
    el.runFullBtn?.addEventListener("click", runFull);
    el.runDiscoveryBtn?.addEventListener("click", runDiscovery);
    el.fetchSummaryBtn?.addEventListener("click", runSummary);
  }

  return { bindEvents, render };
}

export { createLivePanel };
