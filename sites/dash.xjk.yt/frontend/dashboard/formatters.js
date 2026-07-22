import { escapeHtml } from "../../../shared/xjk-core/dom-utils.js?v=2";
import { formatBytes, formatNumber, formatPercent } from "../../../shared/xjk-core/formatters.js?v=2";

export const fmtNumber = formatNumber;

export function fmtPercent(value) {
  return formatPercent(value, 2);
}

export function fmtRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

export function fmtOneReqEverySeconds(rateValue) {
  const rate = Number(rateValue);
  if (!Number.isFinite(rate) || rate <= 0) return "-";
  const seconds = 1 / rate;
  if (seconds >= 100) return `${seconds.toFixed(0)} sec`;
  if (seconds >= 10) return `${seconds.toFixed(1)} sec`;
  return `${seconds.toFixed(2)} sec`;
}

export function fmtMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "-";
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

export function fmtSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "-";
  if (n >= 3600) return `${(n / 3600).toFixed(2)}h`;
  if (n >= 60) return `${(n / 60).toFixed(1)}m`;
  if (n >= 10) return `${n.toFixed(1)}s`;
  return `${n.toFixed(2)}s`;
}

export const fmtBytes = formatBytes;

export function fmtMaybeBytes(value) {
  if (value === null || value === undefined || value === "") return "-";
  return fmtBytes(value);
}

export function fmtDateTime(value) {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) return "-";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
}

export function fmtAgo(value) {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) return "-";
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (deltaSeconds < 5) return "just now";
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m ago`;
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}h ago`;
  return `${Math.floor(deltaSeconds / 86400)}d ago`;
}

export function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function splitRouteKey(key) {
  const str = String(key || "-");
  if (str === "-") return { host: null, path: str, query: null, raw: str };

  const slashIdx = str.indexOf("/");
  let host = null;
  let fullPath = str;

  if (slashIdx > 0 && !str.startsWith("/")) {
    host = str.substring(0, slashIdx);
    fullPath = str.substring(slashIdx);
  }

  const qIdx = fullPath.indexOf("?");
  const path = qIdx >= 0 ? fullPath.substring(0, qIdx) : fullPath;
  const query = qIdx >= 0 ? fullPath.substring(qIdx) : null;

  return { host, path, query, raw: str };
}

export function renderKeyCellHtml(key) {
  const parsed = splitRouteKey(key);
  if (parsed.host) {
    return (
      `<span class="cell-key-host">${escapeHtml(parsed.host)}</span>` +
      `<span class="cell-key-path">${escapeHtml(parsed.path)}</span>`
    );
  }
  return `<span class="cell-key-path">${escapeHtml(parsed.path)}</span>`;
}
