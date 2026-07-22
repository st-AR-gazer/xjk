import { state } from "./state.js?v=2";
import { fetchDashJson } from "./api-client.js?v=2";
import {
  appendTableMessage,
  appendTextCell,
  clearElement,
  setStatus,
  setText,
  stampStatus,
  waitForNextPaint,
} from "./dom.js?v=2";
import { fmtDateTime, fmtMs, fmtNumber } from "./formatters.js?v=2";

let alteredRefreshBusy = false;
let alteredActionBusy = false;

function renderAlteredSyncRuns(rows = []) {
  const body = document.getElementById("alteredSyncRunsBody");
  if (!body) return;
  clearElement(body);
  if (!rows.length) {
    appendTableMessage(body, "No altered sync runs found.", 5);
    return;
  }
  rows.forEach((run) => {
    const tr = document.createElement("tr");
    const mapsText =
      `${fmtNumber(run.mapsSeen || 0)} seen` +
      ` | +${fmtNumber(run.mapsInserted || 0)}` +
      ` | ~${fmtNumber(run.mapsUpdated || 0)}`;
    appendTextCell(tr, `#${run.runId || "-"}`);
    appendTextCell(tr, run.status || "-");
    appendTextCell(tr, fmtDateTime(run.finishedAt || run.startedAt));
    appendTextCell(tr, mapsText);
    appendTextCell(tr, run.note || "-", { title: run.note || "" });
    body.appendChild(tr);
  });
}

function renderAlteredPollRuns(rows = []) {
  const body = document.getElementById("alteredPollRunsBody");
  if (!body) return;
  clearElement(body);
  if (!rows.length) {
    appendTableMessage(body, "No altered check runs found.", 5);
    return;
  }
  rows.forEach((run) => {
    const tr = document.createElement("tr");
    appendTextCell(tr, `#${run.runId || "-"}`);
    appendTextCell(tr, run.status || "-");
    appendTextCell(tr, fmtDateTime(run.finishedAt || run.startedAt));
    appendTextCell(tr, fmtNumber(run.mapsChecked || run.mapsTotal || 0));
    appendTextCell(tr, fmtNumber(run.mapsChanged || 0));
    body.appendChild(tr);
  });
}

function renderAlteredCheckHistory(rows = []) {
  const body = document.getElementById("alteredCheckBody");
  const metaEl = document.getElementById("alteredCheckMeta");
  if (!body) return;
  clearElement(body);
  const query = String(state.altered.checkQuery || "").trim();
  if (metaEl) {
    metaEl.textContent = rows.length
      ? `${fmtNumber(rows.length)} recent checks loaded${query ? ` | filter: ${query}` : ""}`
      : query
        ? `No recent checks match "${query}".`
        : "No recent checks loaded.";
  }
  if (!rows.length) {
    appendTableMessage(body, "No altered check events found.", 5);
    return;
  }
  rows.forEach((event) => {
    const result = event.error ? "error" : event.changed ? "WR changed" : "checked";
    const changeText = event.changed ? `${fmtMs(event.oldWrMs || 0)} -> ${fmtMs(event.newWrMs || 0)}` : "-";
    const mapText = `${String(event.mapName || "Unknown map")} | ${String(event.mapUid || "-")}`;
    const noteText = event.error ? String(event.error) : changeText;
    const tr = document.createElement("tr");
    appendTextCell(tr, fmtDateTime(event.checkedAt));
    const mapCell = appendTextCell(tr, "", { className: "cell-key", title: mapText });
    const uid = document.createElement("span");
    uid.className = "cell-key-host";
    uid.textContent = String(event.mapUid || "-");
    const name = document.createElement("span");
    name.className = "cell-key-path";
    name.textContent = String(event.mapName || "Unknown map");
    mapCell.append(uid, name);
    appendTextCell(tr, result);
    appendTextCell(tr, noteText, { title: noteText });
    appendTextCell(tr, event.runId ? `#${event.runId}` : "-");
    body.appendChild(tr);
  });
}

function renderAlteredSummary(payload = {}) {
  const altered = payload?.altered || {};
  const warnings = Array.isArray(payload?.warnings) ? payload.warnings : [];
  const degraded = Boolean(payload?.degraded) || warnings.length > 0;
  const hook = altered.hook || null;
  const syncRuns = Array.isArray(altered.syncRuns) ? altered.syncRuns : [];
  const liveStatus = altered.liveStatus || {};
  const monitor = liveStatus?.monitor || {};
  const pollRuns = Array.isArray(altered.pollRuns) ? altered.pollRuns : [];
  const opsOverview = altered.opsOverview || {};
  const scheduler = opsOverview?.scheduler || {};
  const latestSyncRun = hook?.latestRun || syncRuns[0] || null;
  const latestPollRun = pollRuns[0] || null;

  state.altered.summary = altered;
  state.altered.syncRuns = syncRuns;
  state.altered.pollRuns = pollRuns;

  const summaryLineEl = document.getElementById("alteredSummaryLine");
  if (summaryLineEl) {
    const clubName = String(hook?.clubName || "Altered").trim();
    const clubId = hook?.clubId ? `#${hook.clubId}` : "-";
    const schedulerText = scheduler?.enabled
      ? `ops scheduler ${scheduler.tickSeconds || "-"}s`
      : "ops scheduler paused";
    const warningText = degraded ? ` | partial:${warnings.length}` : "";
    summaryLineEl.textContent = `${clubName} (${clubId}) | full=${monitor.running ? "running" : "idle"} | discovery=${monitor.discoveryRunning ? "running" : monitor.discoveryEnabled ? "enabled" : "disabled"} | ${schedulerText}${warningText}`;
  }

  setText(
    "alteredLastFull",
    monitor.lastFinishedAt ? fmtDateTime(monitor.lastFinishedAt) : monitor.lastError ? "error" : "-"
  );
  setText("alteredNextFull", monitor.nextRunAt ? fmtDateTime(monitor.nextRunAt) : "-");
  setText(
    "alteredLatestSnapshot",
    latestSyncRun?.finishedAt
      ? fmtDateTime(latestSyncRun.finishedAt)
      : hook?.lastSyncedAt
        ? fmtDateTime(hook.lastSyncedAt)
        : "-"
  );
  setText(
    "alteredLatestPollRun",
    latestPollRun?.finishedAt
      ? `${fmtDateTime(latestPollRun.finishedAt)}`
      : latestPollRun?.startedAt
        ? fmtDateTime(latestPollRun.startedAt)
        : "-"
  );

  const hookStatusEl = document.getElementById("alteredHookStatus");
  if (hookStatusEl) {
    if (!hook) {
      const hookWarning = warnings.find((item) => item.key === "hook" || item.key === "syncRuns");
      hookStatusEl.textContent = hookWarning ? `Hook: partial | ${hookWarning.message}` : "Hook: unavailable";
    } else {
      const mapsSeen = latestSyncRun ? `${fmtNumber(latestSyncRun.mapsSeen || 0)} seen` : "-";
      const hookWarning = warnings.find((item) => item.key === "hook" || item.key === "syncRuns");
      hookStatusEl.textContent =
        `Hook ${hook.enabled ? "enabled" : "disabled"} | auto-track ${hook.autoTrackNewMaps ? "on" : "off"} | ` +
        `tracked maps ${fmtNumber(hook.trackedCount || 0)} / ${fmtNumber(hook.mapCount || 0)} | latest snapshot ${mapsSeen}` +
        (hookWarning ? ` | warning: ${hookWarning.message}` : "");
    }
  }

  const liveStatusEl = document.getElementById("alteredLiveStatus");
  if (liveStatusEl) {
    const liveWarning = warnings.find(
      (item) => item.key === "liveStatus" || item.key === "opsOverview" || item.key === "pollRuns"
    );
    if (!liveStatus || typeof liveStatus !== "object") {
      liveStatusEl.textContent = liveWarning ? `Monitor: partial | ${liveWarning.message}` : "Monitor: unavailable";
    } else if (monitor.lastSummary) {
      liveStatusEl.textContent =
        `Monitor ${monitor.enabled ? "enabled" : "disabled"} | last full sync ${fmtNumber(monitor.lastSummary.campaignsLoaded || 0)} campaigns, ` +
        `${fmtNumber(monitor.lastSummary.mapsLoaded || 0)} maps | ${fmtDateTime(monitor.lastFinishedAt)}` +
        (liveWarning ? ` | warning: ${liveWarning.message}` : "");
    } else if (monitor.lastError) {
      liveStatusEl.textContent = `Monitor error: ${monitor.lastError}`;
    } else {
      liveStatusEl.textContent =
        `Monitor ${monitor.enabled ? "enabled" : "disabled"} | last full sync pending` +
        (liveWarning ? ` | warning: ${liveWarning.message}` : "");
    }
  }

  renderAlteredSyncRuns(syncRuns);
  renderAlteredPollRuns(pollRuns);
}

export async function refreshAlteredCheckHistory({ silent = false } = {}) {
  const params = new URLSearchParams();
  params.set("limit", "120");
  if (state.altered.checkQuery) params.set("q", state.altered.checkQuery);
  if (!silent) setStatus("Loading altered check history...");
  const payload = await fetchDashJson(`/altered/check-history?${params.toString()}`);
  state.altered.checkEvents = Array.isArray(payload?.events) ? payload.events : [];
  renderAlteredCheckHistory(state.altered.checkEvents);
}

export async function refreshAlteredPanel({ silent = false } = {}) {
  if (alteredRefreshBusy) return;
  alteredRefreshBusy = true;
  try {
    if (!silent) setStatus("Loading altered summary...");
    const payload = await fetchDashJson("/altered/summary?sync_runs_limit=12&poll_runs_limit=20");
    renderAlteredSummary(payload || {});
    await waitForNextPaint();
    await refreshAlteredCheckHistory({ silent: true });
    if (!silent) stampStatus("Updated");
  } catch (error) {
    setStatus(`Error: ${error?.message || error}`);
    renderAlteredCheckHistory([]);
    const summaryLineEl = document.getElementById("alteredSummaryLine");
    if (summaryLineEl) summaryLineEl.textContent = `Altered unavailable: ${error?.message || error}`;
  } finally {
    alteredRefreshBusy = false;
  }
}

export async function runAlteredAction(action) {
  if (alteredActionBusy) return;
  alteredActionBusy = true;
  const isDiscovery = action === "run-discovery-sync";
  const runFullBtn = document.getElementById("alteredRunFullBtn");
  const runDiscoveryBtn = document.getElementById("alteredRunDiscoveryBtn");
  if (runFullBtn) runFullBtn.disabled = true;
  if (runDiscoveryBtn) runDiscoveryBtn.disabled = true;
  try {
    setStatus(isDiscovery ? "Starting altered discovery sync..." : "Starting altered full sync...");
    await fetchDashJson(isDiscovery ? "/altered/run-discovery-sync" : "/altered/run-full-sync", {
      method: "POST",
      body: {},
    });
    await refreshAlteredPanel({ silent: true });
    stampStatus("Updated");
  } catch (error) {
    setStatus(`Error: ${error?.message || error}`);
  } finally {
    if (runFullBtn) runFullBtn.disabled = false;
    if (runDiscoveryBtn) runDiscoveryBtn.disabled = false;
    alteredActionBusy = false;
  }
}
