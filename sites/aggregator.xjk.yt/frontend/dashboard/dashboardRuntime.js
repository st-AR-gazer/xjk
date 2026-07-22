import { setTextById, waitForNextPaint } from "../../../shared/xjk-core/dom-utils.js?v=2";
import { formatBytes, formatNumber, formatPercent } from "../../../shared/xjk-core/formatters.js?v=2";

const PER_PAGE = 25;
const POLL_REFRESH_MS = 15000;

function fmtPercent(value, digits = 1) {
  return formatPercent(value, digits);
}

function fmtDurationSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "-";
  if (n < 60) return `${n.toFixed(1)}s`;
  const minutes = Math.floor(n / 60);
  const seconds = Math.round(n % 60);
  return `${minutes}m ${seconds}s`;
}

const fmtBytes = formatBytes;
const fmtNumber = formatNumber;
const setText = setTextById;

function setStatus(text) {
  const el = document.getElementById("statusLine");
  if (el) el.textContent = text;
}

const state = {
  activeTab: "events",
  projectKey: "",
  projects: [],
  projectView: "maps",
  events: [],
  eventsMeta: {
    page: 1,
    pageSize: PER_PAGE,
    total: 0,
    totalPages: 1,
  },
  eventFilters: {
    projectKey: "",
    source: "",
    eventType: "",
    range: "24h",
    fromIso: "",
    toIso: "",
    q: "",
    changedOnly: false,
    includeSystem: false,
  },
  eventFacets: {
    sources: [],
    eventTypes: [],
  },
  maps: [],
  names: [],
  namesMeta: {
    mode: "cached",
    cachedCount: 0,
    candidateCount: 0,
  },
  page: { events: 1, maps: 1, names: 1 },
  db: {
    table: "",
    limit: 50,
    offset: 0,
    sortBy: "",
    sortDir: "desc",
    tableMetaByName: new Map(),
    columns: [],
  },
  metrics: {
    bucket: "hour",
    windowHours: 168,
  },
};

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `tab-${tabId}`);
  });
  history.replaceState(null, "", `#${tabId}`);
}

function paginate(items, page) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const clamped = Math.max(1, Math.min(page, totalPages));
  const start = (clamped - 1) * PER_PAGE;
  return {
    slice: items.slice(start, start + PER_PAGE),
    page: clamped,
    totalPages,
    total,
  };
}

function updatePaginationUI(prefix, page, totalPages) {
  const info = document.getElementById(`${prefix}PageInfo`);
  const prev = document.getElementById(`${prefix}Prev`);
  const next = document.getElementById(`${prefix}Next`);
  if (info) info.textContent = `Page ${page} of ${totalPages}`;
  if (prev) prev.disabled = page <= 1;
  if (next) next.disabled = page >= totalPages;
}

export {
  PER_PAGE,
  POLL_REFRESH_MS,
  fmtBytes,
  fmtDurationSeconds,
  fmtNumber,
  fmtPercent,
  paginate,
  setStatus,
  setText,
  state,
  switchTab,
  updatePaginationUI,
  waitForNextPaint,
};
