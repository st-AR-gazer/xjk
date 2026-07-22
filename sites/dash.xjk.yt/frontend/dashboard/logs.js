import { state } from "./state.js?v=2";
import { fetchDashJson } from "./api-client.js?v=2";
import { appendOption, clearElement, setStatus, stampStatus } from "./dom.js?v=2";
import { clampInt, fmtBytes } from "./formatters.js?v=2";

let logsRefreshBusy = false;

export function syncLogsServiceSelect() {
  const select = document.getElementById("logsService");
  if (!select) return;

  const services = Array.isArray(state.logs.services) ? state.logs.services : [];
  const currentService = state.logs.service;

  clearElement(select);
  if (!services.length) {
    appendOption(select, "", "No services found");
    select.disabled = true;
    state.logs.service = "";
    return;
  }

  services.forEach((entry) => {
    const streamLabel = entry.hasOut && entry.hasError ? "" : entry.hasOut ? " (stdout only)" : " (stderr only)";
    appendOption(select, entry.service, `${entry.service}${streamLabel}`);
  });

  const hasCurrent = services.some((entry) => entry.service === currentService);
  state.logs.service = hasCurrent ? currentService : services[0].service;
  select.value = state.logs.service;
  select.disabled = false;
}

export function isLogOutputNearBottom(outputEl) {
  if (!outputEl) return true;
  const distanceFromBottom = outputEl.scrollHeight - (outputEl.scrollTop + outputEl.clientHeight);
  return distanceFromBottom <= 24;
}

function renderLogsResult(payload = {}) {
  const metaEl = document.getElementById("logsMeta");
  const outputEl = document.getElementById("logsOutput");
  if (!metaEl || !outputEl) return;

  const service = String(payload.service || state.logs.service || "-");
  const stream = String(payload.stream || state.logs.stream || "out");
  const rows = Array.isArray(payload.lines) ? payload.lines : [];
  const lineCount = Number(payload.lineCount || rows.length || 0);
  const sizeBytes = Number(payload.totalSizeBytes || 0);
  const truncated = Boolean(payload.truncated);
  const previousScrollTop = outputEl.scrollTop;
  const wasNearBottom = isLogOutputNearBottom(outputEl);

  metaEl.textContent =
    `${service} / ${stream} | ${lineCount} lines | ${fmtBytes(sizeBytes)}` +
    (truncated ? " | showing tail" : "") +
    (!state.logs.followTail ? " | follow off" : "");
  outputEl.textContent = rows.length ? rows.join("\n") : "(No log lines yet.)";
  if (state.logs.followTail || wasNearBottom) {
    outputEl.scrollTop = outputEl.scrollHeight;
  } else {
    outputEl.scrollTop = previousScrollTop;
  }
}

function renderLogsError(message) {
  const metaEl = document.getElementById("logsMeta");
  const outputEl = document.getElementById("logsOutput");
  if (metaEl) metaEl.textContent = "Logs unavailable";
  if (outputEl) outputEl.textContent = String(message || "Failed to load logs.");
}

async function refreshLogServices({ silent = false } = {}) {
  try {
    if (!silent) setStatus("Refreshing log services...");
    const payload = await fetchDashJson("/logs/services");
    state.logs.services = Array.isArray(payload?.services) ? payload.services : [];
    syncLogsServiceSelect();
    if (!silent) stampStatus("Updated");
  } catch (error) {
    state.logs.services = [];
    syncLogsServiceSelect();
    renderLogsError(error?.message || error);
    setStatus(`Error: ${error?.message || error}`);
  }
}

export async function refreshLogs({ silent = false, reloadServices = false } = {}) {
  if (logsRefreshBusy) return;
  logsRefreshBusy = true;
  try {
    if (reloadServices || !state.logs.services.length) {
      await refreshLogServices({ silent: true });
    }

    if (!state.logs.service) {
      renderLogsError("No log services available.");
      return;
    }

    if (silent && !reloadServices && !state.logs.followTail) {
      return false;
    }

    if (!silent) setStatus(`Refreshing logs (${state.logs.service})...`);
    const service = encodeURIComponent(state.logs.service);
    const stream = encodeURIComponent(state.logs.stream || "out");
    const lines = clampInt(state.logs.lines, { min: 10, max: 2000, fallback: 200 });
    const payload = await fetchDashJson(`/logs/service/${service}?stream=${stream}&lines=${lines}`);
    renderLogsResult(payload || {});
    if (!silent) stampStatus("Updated");
    return true;
  } catch (error) {
    renderLogsError(error?.message || error);
    setStatus(`Error: ${error?.message || error}`);
    return false;
  } finally {
    logsRefreshBusy = false;
  }
}
