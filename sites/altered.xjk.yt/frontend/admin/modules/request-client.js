import { resolveSiteHref } from "/shared/xjk-core/site-runtime.js";
import { notifySimilarityUiChanged } from "./admin-events.js?v=2";
import {
  FETCH_NETWORK_RETRY_ATTEMPTS,
  FETCH_NETWORK_RETRY_DELAY_MS,
  FETCH_TIMEOUT_MS,
  NETWORK_FALLBACK_STATUS,
  alteredUrl,
} from "./constants.js?v=2";
import { esc, fmtDuration } from "./formatters.js?v=2";
import { state } from "./state.js?v=2";

export function normalizeLoginUrl(url) {
  return alteredUrl(url || "/admin/login/");
}

export function resolveWorkspaceHref(path, service = "") {
  const safePath = String(path || "").trim();
  if (!safePath) return alteredUrl("/");
  if (/^https?:\/\//i.test(safePath)) return safePath;

  if (service === "aggregator") {
    return resolveSiteHref("aggregator", {
      path: safePath,
      location: window.location,
    });
  }

  return alteredUrl(safePath);
}

function getAdminApiOrigins() {
  return [window.location.origin];
}

function toAbsoluteApiUrl(origin, url) {
  if (/^https?:\/\//i.test(String(url || ""))) return String(url);
  return new URL(String(url || "/"), origin).toString();
}

function isRetryableFetchError(error) {
  const message = String(error?.message || "")
    .trim()
    .toLowerCase();
  return (
    error?.name === "TypeError" ||
    message.includes("networkerror") ||
    message.includes("failed to fetch") ||
    message.includes("load failed") ||
    message.includes("network request failed")
  );
}

export function waitForFetchRetry(ms = FETCH_NETWORK_RETRY_DELAY_MS) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

export function isTransientGatewayStatus(status) {
  return NETWORK_FALLBACK_STATUS.has(Number(status || 0));
}

function trimRequestText(value = "", maxLength = 120) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function beginRequestMonitor({ logicalUrl = "", requestUrl = "", origin = "", method = "GET", attempt = 1 } = {}) {
  const entry = {
    id: state.requestMonitor.nextId++,
    logicalUrl: trimRequestText(logicalUrl),
    requestUrl: trimRequestText(requestUrl),
    origin: trimRequestText(origin, 60),
    method: String(method || "GET").toUpperCase(),
    attempt: Math.max(1, Number(attempt) || 1),
    startedAtMs: Date.now(),
    startedAt: new Date().toISOString(),
  };
  state.requestMonitor.active = [entry, ...state.requestMonitor.active]
    .sort((left, right) => right.startedAtMs - left.startedAtMs)
    .slice(0, 10);
  notifyRequestMonitorChanged(entry);
  return entry.id;
}

function finishRequestMonitor(id, partial = {}) {
  const index = state.requestMonitor.active.findIndex((entry) => entry.id === id);
  const base =
    index >= 0
      ? state.requestMonitor.active[index]
      : {
          id,
          logicalUrl: trimRequestText(partial.logicalUrl),
          requestUrl: trimRequestText(partial.requestUrl),
          origin: trimRequestText(partial.origin, 60),
          method: String(partial.method || "GET").toUpperCase(),
          attempt: Math.max(1, Number(partial.attempt) || 1),
          startedAtMs: Date.now(),
          startedAt: new Date().toISOString(),
        };
  if (index >= 0) {
    state.requestMonitor.active.splice(index, 1);
  }

  const finished = {
    ...base,
    ...partial,
    finishedAtMs: Date.now(),
  };
  finished.durationMs = Math.max(
    0,
    Number(finished.durationMs || 0) || finished.finishedAtMs - Number(base.startedAtMs || finished.finishedAtMs)
  );
  finished.finishedAt = new Date(finished.finishedAtMs).toISOString();
  state.requestMonitor.recent = [finished, ...state.requestMonitor.recent]
    .sort((left, right) => Number(right.finishedAtMs || 0) - Number(left.finishedAtMs || 0))
    .slice(0, 14);
  if (finished.ok === false) {
    state.requestMonitor.lastFailure = finished;
  }
  notifyRequestMonitorChanged(finished);
  return finished;
}

function isSimilarityDiagnosticsRequest(entry = {}) {
  const haystack = `${entry.logicalUrl || ""} ${entry.requestUrl || ""}`.toLowerCase();
  return haystack.includes("/naming/similarity/backfill");
}

function notifyRequestMonitorChanged(entry = null) {
  if (!isSimilarityDiagnosticsRequest(entry || {})) return;
  notifySimilarityUiChanged(entry);
}

function getSimilarityDiagnosticsSnapshot() {
  const active = (Array.isArray(state.requestMonitor.active) ? state.requestMonitor.active : [])
    .filter(isSimilarityDiagnosticsRequest)
    .slice(0, 3);
  const recent = (Array.isArray(state.requestMonitor.recent) ? state.requestMonitor.recent : [])
    .filter(isSimilarityDiagnosticsRequest)
    .slice(0, 8);
  const recentFailure = recent.find((entry) => entry.ok === false) || null;
  return { active, recentFailure };
}

export function renderSimilarityDiagnostics({ compact = false } = {}) {
  const { active, recentFailure } = getSimilarityDiagnosticsSnapshot();
  const showFailure = recentFailure && Date.now() - Number(recentFailure.finishedAtMs || 0) <= 10 * 60 * 1000;
  if (!active.length && !showFailure) return "";

  const activeMarkup = active.length
    ? active
        .map(
          (entry) => `
        <div class="similarity-diagnostics-item">
          <strong>Checking</strong>
          <span>${esc(entry.method)} ${esc(entry.logicalUrl || entry.requestUrl || "/")} · attempt ${esc(String(entry.attempt || 1))} · ${esc(fmtDuration(Date.now() - Number(entry.startedAtMs || Date.now())))} elapsed</span>
        </div>
      `
        )
        .join("")
    : "";
  const failureMarkup = showFailure
    ? `
      <div class="similarity-diagnostics-item is-error">
        <strong>Last failure</strong>
        <span>${esc(trimRequestText(recentFailure.error || "Request failed.", compact ? 90 : 140))} · ${esc(recentFailure.method || "GET")} ${esc(recentFailure.logicalUrl || recentFailure.requestUrl || "/")}</span>
      </div>
    `
    : "";

  return `
    <div class="similarity-diagnostics${compact ? " is-compact" : ""}">
      <div class="similarity-diagnostics-head">
        <span class="pill ${active.length ? "tone-info" : "tone-warn"}">${active.length ? "Checks Running" : "Recent Failure"}</span>
        <span>${active.length ? "Watching similarity progress requests." : "Similarity polling hit a recent error."}</span>
      </div>
      ${activeMarkup}
      ${failureMarkup}
    </div>
  `;
}

export async function fetchWithAlteredFallback(url, init = {}) {
  const origins = getAdminApiOrigins();
  let lastError = null;
  const timeoutMs = Math.max(250, Number(init.timeoutMs || 0) || FETCH_TIMEOUT_MS);
  const requestInit = { ...init };
  delete requestInit.__monitor;
  delete requestInit.timeoutMs;
  for (let index = 0; index < origins.length; index += 1) {
    const origin = origins[index];
    const requestUrl = toAbsoluteApiUrl(origin, url);
    for (let attempt = 0; attempt <= FETCH_NETWORK_RETRY_ATTEMPTS; attempt += 1) {
      const monitorId = beginRequestMonitor({
        logicalUrl: url,
        requestUrl,
        origin,
        method: requestInit.method || "GET",
        attempt: attempt + 1,
      });
      let timeoutId = null;
      try {
        let signal = requestInit.signal;
        if (!signal && timeoutMs > 0) {
          if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
            signal = AbortSignal.timeout(timeoutMs);
          } else {
            const controller = new AbortController();
            timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
            signal = controller.signal;
          }
        }
        const response = await fetch(requestUrl, {
          ...requestInit,
          ...(signal ? { signal } : {}),
        });
        if (timeoutId) window.clearTimeout(timeoutId);
        timeoutId = null;
        finishRequestMonitor(monitorId, {
          ok: response.ok,
          status: response.status,
          logicalUrl: url,
          requestUrl,
          origin,
          method: requestInit.method || "GET",
          attempt: attempt + 1,
          error: response.ok ? "" : `HTTP ${response.status}`,
        });
        if (!NETWORK_FALLBACK_STATUS.has(response.status) || index === origins.length - 1) {
          return response;
        }
        lastError = new Error(`Request failed (${response.status}).`);
        break;
      } catch (error) {
        try {
          if (timeoutId) window.clearTimeout(timeoutId);
        } catch {}
        finishRequestMonitor(monitorId, {
          ok: false,
          status: "network",
          logicalUrl: url,
          requestUrl,
          origin,
          method: requestInit.method || "GET",
          attempt: attempt + 1,
          error: error?.message || "Network request failed.",
        });
        lastError = error;
        const canRetry =
          attempt < FETCH_NETWORK_RETRY_ATTEMPTS && index === origins.length - 1 && isRetryableFetchError(error);
        if (canRetry) {
          await waitForFetchRetry(FETCH_NETWORK_RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        if (index === origins.length - 1) {
          throw error;
        }
        break;
      }
    }
  }
  throw lastError || new Error("Request failed.");
}

export function getPreferredAlteredOrigin() {
  return getAdminApiOrigins()[0];
}
