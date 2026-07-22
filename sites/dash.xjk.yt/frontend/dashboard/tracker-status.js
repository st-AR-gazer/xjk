import { state } from "./state.js?v=2";
import { fetchDashJson } from "./api-client.js?v=2";
import { appendTableMessage, appendTextCell, clearElement, setStatus, stampStatus } from "./dom.js?v=2";
import { clampInt, fmtAgo, fmtDateTime, fmtMs, fmtNumber, fmtRate } from "./formatters.js?v=2";

function trackerRuntimeSummary(key, statusPayload) {
  if (!statusPayload || typeof statusPayload !== "object") return "-";
  if (key === "wr" || key === "leaderboard") {
    const runtime = statusPayload.runtime || {};
    const runs = Number(runtime.totalRuns || 0);
    const checked = Number(runtime.totalChecked || 0);
    return `runs:${fmtNumber(runs)} checked:${fmtNumber(checked)} tick:${runtime.tickSeconds || "-"}s`;
  }
  if (key === "displayname") {
    const intervalSeconds = Number(statusPayload.maintenanceIntervalSeconds || 0);
    const minGapMs = Number(statusPayload.minRequestGapMs || 0);
    const gapSeconds = Number.isFinite(minGapMs) ? minGapMs / 1000 : 0;
    return (
      `sched:${statusPayload.schedulerEnabled ? "on" : "off"} ` +
      `tick:${intervalSeconds > 0 ? `${fmtRate(intervalSeconds)}s` : "-"} ` +
      `gap:${gapSeconds > 0 ? `${fmtRate(gapSeconds)}s` : "-"} ` +
      `queue:${fmtNumber(statusPayload.queueSize || 0)}`
    );
  }
  if (key === "club") {
    return `last ingest: ${statusPayload.lastIngestAt ? fmtDateTime(statusPayload.lastIngestAt) : "-"}`;
  }
  return "-";
}

function trackerEnabled(key, statusPayload) {
  if (!statusPayload || typeof statusPayload !== "object") return false;
  if (key === "wr" || key === "leaderboard") return Boolean(statusPayload?.runtime?.enabled);
  return Boolean(statusPayload.enabled);
}

function renderTrackerStatuses(payload = {}, { stale = false, errorMessage = "" } = {}) {
  const trackers = payload?.trackers || {};
  const readOnly = String(payload?.source || "").toLowerCase() === "database";
  state.trackers.readOnly = readOnly;
  const rows = [
    ["wr", "trackerWrStatus", "trackerWrRuntime", "trackerWrToggleBtn", "trackerWrRunNowBtn"],
    ["leaderboard", "trackerLbStatus", "trackerLbRuntime", "trackerLbToggleBtn", "trackerLbRunNowBtn"],
    ["displayname", "trackerDnStatus", "trackerDnRuntime", "trackerDnToggleBtn", "trackerDnRunNowBtn"],
    ["club", "trackerClubStatus", "trackerClubRuntime", "trackerClubToggleBtn", ""],
  ];

  rows.forEach(([key, statusId, runtimeId, toggleId, runNowId]) => {
    const entry = trackers[key] || {};
    const hasEntry = Object.keys(entry).length > 0;
    const statusEl = document.getElementById(statusId);
    const runtimeEl = document.getElementById(runtimeId);
    const toggleBtn = document.getElementById(toggleId);
    const runNowBtn = runNowId ? document.getElementById(runNowId) : null;
    if (statusEl) {
      statusEl.classList.remove("tracker-status-ok", "tracker-status-error", "tracker-status-stale");
    }
    if (runtimeEl) {
      runtimeEl.classList.remove("tracker-status-ok", "tracker-status-error", "tracker-status-stale");
    }
    if (statusEl) {
      if (!hasEntry && errorMessage) {
        statusEl.textContent = "status unavailable";
        statusEl.classList.add("tracker-status-error");
      } else if (!entry.configured) {
        statusEl.textContent = "not configured";
        statusEl.classList.add("tracker-status-error");
      } else if (!entry.ok) {
        statusEl.textContent = `error: ${entry.error || "unreachable"}`;
        statusEl.classList.add("tracker-status-error");
      } else {
        statusEl.textContent = trackerEnabled(key, entry.status)
          ? stale
            ? "enabled (stale)"
            : "enabled"
          : stale
            ? "disabled (stale)"
            : "disabled";
        statusEl.classList.add(stale ? "tracker-status-stale" : "tracker-status-ok");
      }
    }
    if (runtimeEl) {
      if (entry.ok && entry.status) {
        runtimeEl.textContent =
          trackerRuntimeSummary(key, entry.status) + (stale ? ` | stale ${fmtAgo(state.trackers.lastLoadedAt)}` : "");
        runtimeEl.classList.add(stale ? "tracker-status-stale" : "tracker-status-ok");
      } else if (!hasEntry && errorMessage) {
        runtimeEl.textContent = errorMessage;
        runtimeEl.classList.add("tracker-status-error");
      } else {
        runtimeEl.textContent = stale ? `stale snapshot unavailable${errorMessage ? ` | ${errorMessage}` : ""}` : "-";
        if (stale) runtimeEl.classList.add("tracker-status-stale");
      }
    }
    if (toggleBtn) {
      const enabled = entry.ok && trackerEnabled(key, entry.status);
      toggleBtn.textContent = enabled ? "Disable" : "Enable";
      toggleBtn.dataset.enabled = enabled ? "1" : "0";
      toggleBtn.disabled = readOnly || !hasEntry || !entry.configured;
      toggleBtn.title = stale
        ? `Tracker status is stale. Last success ${fmtAgo(state.trackers.lastLoadedAt)}.`
        : readOnly
          ? "Tracker controls are read-only while this dashboard mirrors the server snapshot."
          : errorMessage && !hasEntry
            ? errorMessage
            : "";
    }
    if (runNowBtn) {
      const enabled = entry.ok && trackerEnabled(key, entry.status);
      runNowBtn.disabled = readOnly || !hasEntry || !entry.configured || !entry.ok || !enabled;
      runNowBtn.title = readOnly
        ? "Tracker controls are read-only while this dashboard mirrors the server snapshot."
        : enabled
          ? ""
          : !entry.configured
            ? "Tracker is not configured."
            : !entry.ok
              ? entry.error || "Tracker status is unavailable."
              : "Enable this tracker before running it.";
    }
  });

  const priorityStatusEl = document.getElementById("trackerPriorityStatus");
  if (priorityStatusEl) {
    priorityStatusEl.textContent = readOnly
      ? `Snapshot mode: ${summarizeTrackerPriorityStatus(trackers)}`
      : summarizeTrackerPriorityStatus(trackers);
  }

  setTrackerPriorityControlsReadOnly(readOnly);

  const refreshMetaEl = document.getElementById("trackerRefreshMeta");
  if (refreshMetaEl) {
    if (stale && state.trackers.lastLoadedAt) {
      refreshMetaEl.textContent =
        `Tracker snapshot stale. Last successful refresh ${fmtAgo(state.trackers.lastLoadedAt)} (${fmtDateTime(state.trackers.lastLoadedAt)}).` +
        (errorMessage ? ` Latest error: ${errorMessage}` : "");
      refreshMetaEl.classList.remove("tracker-status-ok", "tracker-status-error");
      refreshMetaEl.classList.add("tracker-status-stale");
    } else if (state.trackers.lastLoadedAt) {
      refreshMetaEl.textContent = `Last successful tracker refresh ${fmtAgo(state.trackers.lastLoadedAt)} (${fmtDateTime(state.trackers.lastLoadedAt)}).`;
      refreshMetaEl.classList.remove("tracker-status-error", "tracker-status-stale");
      refreshMetaEl.classList.add("tracker-status-ok");
    } else if (errorMessage) {
      refreshMetaEl.textContent = `Tracker status unavailable: ${errorMessage}`;
      refreshMetaEl.classList.remove("tracker-status-ok", "tracker-status-stale");
      refreshMetaEl.classList.add("tracker-status-error");
    } else {
      refreshMetaEl.textContent = "Tracker status not loaded yet.";
      refreshMetaEl.classList.remove("tracker-status-ok", "tracker-status-error", "tracker-status-stale");
    }
  }
}

export async function refreshTrackerStatuses() {
  try {
    const payload = await fetchDashJson("/trackers/status");
    state.trackers.payload = payload || {};
    state.trackers.lastLoadedAt = new Date().toISOString();
    state.trackers.lastErrorAt = null;
    state.trackers.lastErrorMessage = "";
    renderTrackerStatuses(state.trackers.payload, { stale: false, errorMessage: "" });
  } catch (error) {
    state.trackers.lastErrorAt = new Date().toISOString();
    state.trackers.lastErrorMessage = error?.message || String(error || "unknown error");
    if (state.trackers.payload) {
      renderTrackerStatuses(state.trackers.payload, {
        stale: true,
        errorMessage: state.trackers.lastErrorMessage,
      });
    } else {
      renderTrackerStatuses(
        { trackers: {} },
        {
          stale: false,
          errorMessage: state.trackers.lastErrorMessage,
        }
      );
    }
    setStatus(`Error: ${error?.message || error}`);
  }
}

async function sendTrackerControl(tracker, action, payload = {}) {
  const response = await fetchDashJson("/trackers/control", {
    method: "POST",
    body: {
      tracker,
      action,
      ...payload,
    },
  });
  return response;
}

export async function runTrackerAction(tracker, action, payload = {}) {
  if (state.trackers.readOnly) {
    setStatus("Tracker controls are read-only in snapshot mode.");
    return;
  }
  try {
    setStatus(`Applying ${action} on ${tracker}...`);
    await sendTrackerControl(tracker, action, payload);
    await refreshTrackerStatuses();
    stampStatus("Updated");
  } catch (error) {
    setStatus(`Error: ${error?.message || error}`);
  }
}

function trackerLabel(key) {
  const labels = {
    wr: "WR",
    leaderboard: "Leaderboard",
    displayname: "Displayname",
    club: "Club",
  };
  return (
    labels[
      String(key || "")
        .trim()
        .toLowerCase()
    ] || String(key || "-")
  );
}

function trackerProbeScopeLabel(scope) {
  const safe = String(scope || "")
    .trim()
    .toLowerCase();
  if (safe === "local") return "Local";
  if (safe === "configured") return "Mirror";
  return safe || "-";
}

function renderTrackerStatusProbe(payload = {}, { loading = false, errorMessage = "" } = {}) {
  const body = document.getElementById("trackerProbeBody");
  const meta = document.getElementById("trackerProbeMeta");
  const button = document.getElementById("trackerProbeBtn");
  if (button) button.disabled = Boolean(loading);

  if (meta) {
    meta.classList.remove("tracker-status-ok", "tracker-status-error", "tracker-status-stale");
    if (loading) {
      meta.textContent = "Testing status routes...";
      meta.classList.add("tracker-status-stale");
    } else if (errorMessage) {
      meta.textContent = `Route probe failed: ${errorMessage}`;
      meta.classList.add("tracker-status-error");
    } else if (payload?.summary) {
      const summary = payload.summary;
      meta.textContent =
        `Route probe ${fmtNumber(summary.ok || 0)}/${fmtNumber(summary.total || 0)} ok` +
        ` (${fmtDateTime(payload.generatedAt)})`;
      meta.classList.add(Number(summary.failed || 0) > 0 ? "tracker-status-error" : "tracker-status-ok");
    } else {
      meta.textContent = "Route probe not run yet.";
    }
  }

  if (!body) return;
  const probes = Array.isArray(payload?.probes) ? payload.probes : [];
  if (loading && !probes.length) {
    appendTableMessage(body, "Testing...", 6);
    return;
  }
  if (errorMessage) {
    appendTableMessage(body, errorMessage, 6, "tracker-status-error");
    return;
  }
  if (!probes.length) {
    appendTableMessage(body, "No probe data.", 6);
    return;
  }

  clearElement(body);
  probes.forEach((probe) => {
    const ok = Boolean(probe.ok);
    const statusText = `${ok ? "OK" : "FAIL"} ${probe.statusCode || ""}`.trim();
    const row = document.createElement("tr");
    row.className = `tracker-probe-row ${ok ? "tracker-probe-ok" : "tracker-probe-error"}`;
    appendTextCell(row, trackerLabel(probe.tracker));
    appendTextCell(row, trackerProbeScopeLabel(probe.scope));
    appendTextCell(row, probe.path || "-", { className: "mono" });
    appendTextCell(row, statusText, { className: ok ? "tracker-status-ok" : "tracker-status-error" });
    appendTextCell(row, fmtMs(probe.durationMs || 0));
    appendTextCell(row, probe.error || "", { className: "muted" });
    body.appendChild(row);
  });
}

export async function runTrackerStatusProbe() {
  renderTrackerStatusProbe(state.trackers.probe || {}, { loading: true });
  try {
    const mode = String(document.getElementById("trackerProbeMode")?.value || "local").trim() || "local";
    const payload = await fetchDashJson(
      `/trackers/status-probe?mode=${encodeURIComponent(mode)}&timeout_ms=10000&concurrency=4`
    );
    state.trackers.probe = payload || {};
    renderTrackerStatusProbe(state.trackers.probe);
    const failed = Number(payload?.summary?.failed || 0);
    stampStatus(failed > 0 ? "Probe finished with failures" : "Probe passed");
  } catch (error) {
    renderTrackerStatusProbe({}, { errorMessage: error?.message || String(error || "unknown error") });
    setStatus(`Error: ${error?.message || error}`);
  }
}

function trackerSupportsInterval(key) {
  const safe = String(key || "")
    .trim()
    .toLowerCase();
  return safe === "wr" || safe === "leaderboard" || safe === "displayname";
}

function trackerIntervalSeconds(key, statusPayload) {
  const safe = String(key || "")
    .trim()
    .toLowerCase();
  if (safe === "wr" || safe === "leaderboard") {
    return Number(statusPayload?.runtime?.tickSeconds || 0);
  }
  if (safe === "displayname") {
    return Number(statusPayload?.maintenanceIntervalSeconds || 0);
  }
  return 0;
}

function summarizeTrackerPriorityStatus(trackers = {}) {
  const keys = ["wr", "leaderboard", "displayname", "club"];
  const enabledKeys = keys.filter((key) => Boolean(trackers?.[key]?.ok && trackerEnabled(key, trackers[key].status)));

  if (!enabledKeys.length) return "All trackers paused";
  if (enabledKeys.length === 1) {
    const key = enabledKeys[0];
    const status = trackers?.[key]?.status || {};
    const intervalSeconds = trackerIntervalSeconds(key, status);
    if (!trackerSupportsInterval(key) || intervalSeconds <= 0) {
      return `Priority mode active: ${trackerLabel(key)} only`;
    }
    if (key === "displayname") {
      const gapSeconds = Math.max(0, Number(status.minRequestGapMs || 0)) / 1000;
      return (
        `Priority mode active: ${trackerLabel(key)} every ${fmtRate(intervalSeconds)}s` +
        ` (gap ${gapSeconds > 0 ? `${fmtRate(gapSeconds)}s` : "-"})`
      );
    }
    return `Priority mode active: ${trackerLabel(key)} every ${fmtRate(intervalSeconds)}s`;
  }
  return `Normal mode (${enabledKeys.map(trackerLabel).join(", ")} enabled)`;
}

function readTrackerPriorityControls() {
  const targetEl = document.getElementById("trackerPriorityTarget");
  const intervalEl = document.getElementById("trackerPriorityInterval");
  const pauseEl = document.getElementById("trackerPriorityPauseOthers");
  const target = String(targetEl?.value || "displayname")
    .trim()
    .toLowerCase();
  const intervalSeconds = clampInt(intervalEl?.value, { min: 3, max: 3600, fallback: 3 });
  const pauseOthers = Boolean(pauseEl?.checked);
  return { target, intervalSeconds, pauseOthers };
}

export function syncTrackerPriorityControls() {
  const targetEl = document.getElementById("trackerPriorityTarget");
  const intervalEl = document.getElementById("trackerPriorityInterval");
  const target = String(targetEl?.value || "displayname")
    .trim()
    .toLowerCase();
  if (intervalEl) {
    intervalEl.disabled = state.trackers.readOnly || !trackerSupportsInterval(target);
  }
}

function setTrackerPriorityControlsReadOnly(readOnly) {
  const disabled = Boolean(readOnly);
  const targetEl = document.getElementById("trackerPriorityTarget");
  const intervalEl = document.getElementById("trackerPriorityInterval");
  const pauseEl = document.getElementById("trackerPriorityPauseOthers");
  if (targetEl) targetEl.disabled = disabled;
  if (intervalEl) intervalEl.disabled = disabled || !trackerSupportsInterval(targetEl?.value || "displayname");
  if (pauseEl) pauseEl.disabled = disabled;
  setTrackerPriorityButtonsDisabled(disabled);
}

function setTrackerPriorityButtonsDisabled(disabled) {
  const enableBtn = document.getElementById("trackerPriorityEnableBtn");
  const disableBtn = document.getElementById("trackerPriorityDisableBtn");
  if (enableBtn) enableBtn.disabled = Boolean(disabled);
  if (disableBtn) disableBtn.disabled = Boolean(disabled);
}

export async function setTrackerPriorityMode(enablePriority) {
  if (state.trackers.readOnly) {
    setStatus("Tracker priority controls are read-only in snapshot mode.");
    return;
  }
  const enable = Boolean(enablePriority);
  try {
    setTrackerPriorityButtonsDisabled(true);
    setStatus(enable ? "Applying priority mode..." : "Restoring tracker mode...");

    if (enable) {
      const { target, intervalSeconds, pauseOthers } = readTrackerPriorityControls();
      await fetchDashJson("/trackers/priority", {
        method: "POST",
        body: {
          action: "apply",
          target,
          intervalSeconds,
          pauseOthers,
        },
      });
    } else {
      await fetchDashJson("/trackers/priority", {
        method: "POST",
        body: {
          action: "restore",
        },
      });
    }

    await refreshTrackerStatuses();
    stampStatus("Updated");
  } catch (error) {
    setStatus(`Error: ${error?.message || error}`);
  } finally {
    setTrackerPriorityButtonsDisabled(false);
  }
}
