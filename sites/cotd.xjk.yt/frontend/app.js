import { fetchJson, unwrapApiData } from "/shared/xjk-core/http.js";
import { setTrackmaniaText, trackmaniaPlainText } from "./trackmania-text.js";

const state = {
  today: null,
  archive: [],
  archiveGroups: new Map(),
  archiveMonthKeys: [],
  activeArchiveMonth: "",
};

const STYLE_COLORS = ["#74a7ff", "#42d392", "#ffc857", "#ff6b55", "#b388ff", "#2dd4bf", "#f472b6", "#a3e635"];

const $ = (selector) => document.querySelector(selector);

const elements = {
  mapVisual: $("#mapVisual"),
  mapImage: $("#mapImage"),
  mapPlaceholder: $("#mapPlaceholder"),
  statusRibbon: $("#statusRibbon"),
  cotdDate: $("#cotdDate"),
  mapName: $("#mapName"),
  authorName: $("#authorName"),
  confidenceValue: $("#confidenceValue"),
  recordCount: $("#recordCount"),
  updatedAt: $("#updatedAt"),
  copyApiButton: $("#copyApiButton"),
  classifierMode: $("#classifierMode"),
  stylePie: $("#stylePie"),
  stylePieLabel: $("#stylePieLabel"),
  styleLegend: $("#styleLegend"),
  styleList: $("#styleList"),
  replayCount: $("#replayCount"),
  evidenceSource: $("#evidenceSource"),
  signalList: $("#signalList"),
  warningBox: $("#warningBox"),
  archiveSummary: $("#archiveSummary"),
  archiveTabs: $("#archiveTabs"),
  historyList: $("#historyList"),
  styleItemTemplate: $("#styleItemTemplate"),
  recentRail: $("#recentRail"),
  archiveDonut: $("#archiveDonut"),
  archiveDonutCount: $("#archiveDonutCount"),
  archiveDonutLegend: $("#archiveDonutLegend"),
  infoArchiveCount: $("#infoArchiveCount"),
  infoClassifier: $("#infoClassifier"),
  nextTotdCountdown: $("#nextTotdCountdown"),
};

function formatDate(value) {
  if (!value) return "Unknown date";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatRelativeTime(value) {
  if (!value) return "--";
  const timestamp = Date.parse(value);
  if (!timestamp) return "--";
  const diffSeconds = Math.round((timestamp - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, seconds] of units) {
    if (abs >= seconds || unit === "minute") {
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
        Math.round(diffSeconds / seconds),
        unit
      );
    }
  }
  return "just now";
}

function formatPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "--";
  return `${Math.round(parsed * 100)}%`;
}

function styleColor(index) {
  return STYLE_COLORS[index % STYLE_COLORS.length];
}

function normalizeRankedStyles(styles = []) {
  return (Array.isArray(styles) ? styles : [])
    .map((style, index) => ({
      ...style,
      rank: style.rank || index + 1,
      score: Number(style.score) || 0,
      style: String(style.style || "unknown").trim() || "unknown",
    }))
    .filter((style) => style.style);
}

function classifiedStyles(styles = []) {
  return normalizeRankedStyles(styles).filter((style) => style.score > 0 && style.style !== "unknown");
}

function topArchiveStyle(item = {}) {
  const styles = classifiedStyles(item.rankedStyles || []);
  if (styles.length) return styles[0];
  return { style: "pending", score: 0 };
}

function archiveMonthKey(item = {}) {
  const date = String(item.cotd?.cotdDate || "").trim();
  return /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : "unknown";
}

function formatMonthLabel(key) {
  if (!key || key === "unknown") return "Unknown month";
  const date = new Date(`${key}-01T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}

function groupArchiveByMonth(items = []) {
  const groups = new Map();
  for (const item of items) {
    const key = archiveMonthKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const keys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "unknown") return 1;
    if (b === "unknown") return -1;
    return b.localeCompare(a);
  });

  return { groups, keys };
}

function setStatus(status) {
  const normalized = String(status || "unknown").toLowerCase();
  elements.statusRibbon.textContent = normalized;
  elements.statusRibbon.dataset.status = normalized;
}

function renderMapImage(cotd = {}) {
  const thumbnailUrl = String(cotd.thumbnailUrl || "").trim();
  const hasImage = Boolean(thumbnailUrl);

  elements.mapVisual.dataset.imageState = hasImage ? "ready" : "pending";
  elements.mapPlaceholder.hidden = hasImage;
  elements.mapImage.hidden = !hasImage;
  elements.mapImage.alt = cotd.mapName
    ? `${trackmaniaPlainText(cotd.mapName, "COTD map")} preview`
    : "COTD map preview";

  if (hasImage) {
    if (elements.mapImage.getAttribute("src") !== thumbnailUrl) {
      elements.mapImage.src = thumbnailUrl;
    }
  } else {
    elements.mapImage.removeAttribute("src");
  }
}

function renderStyleChart(styles = []) {
  const chartStyles = classifiedStyles(styles).slice(0, 8);
  elements.styleLegend.replaceChildren();

  if (!chartStyles.length) {
    elements.stylePie.classList.add("is-pending");
    elements.stylePie.style.background = "";
    elements.stylePie.setAttribute("aria-label", "Style distribution pending classifier");
    elements.stylePieLabel.textContent = "Pending";

    const item = document.createElement("div");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    const label = document.createElement("span");
    label.textContent = "Awaiting classifier";
    item.append(swatch, label);
    elements.styleLegend.append(item);
    return;
  }

  elements.stylePie.classList.remove("is-pending");
  const total = chartStyles.reduce((sum, style) => sum + style.score, 0);
  let cursor = 0;
  const segments = chartStyles.map((style, index) => {
    const start = cursor;
    const share = total > 0 ? (style.score / total) * 100 : 0;
    cursor += share;
    const end = index === chartStyles.length - 1 ? 100 : cursor;
    return `${styleColor(index)} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  });

  elements.stylePie.style.background = `conic-gradient(${segments.join(", ")})`;
  elements.stylePieLabel.textContent = formatPercent(chartStyles[0].score);
  elements.stylePie.setAttribute(
    "aria-label",
    chartStyles.map((style) => `${style.style} ${formatPercent(style.score)}`).join(", ")
  );

  chartStyles.forEach((style, index) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = styleColor(index);
    const label = document.createElement("span");
    label.textContent = style.style;
    const value = document.createElement("strong");
    value.textContent = formatPercent(style.score);
    item.append(swatch, label, value);
    elements.styleLegend.append(item);
  });
}

function renderStyles(styles = []) {
  const rankedStyles = normalizeRankedStyles(styles);
  renderStyleChart(rankedStyles);
  elements.styleList.replaceChildren();
  if (!rankedStyles.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No style ranking stored yet.";
    elements.styleList.append(empty);
    return;
  }

  for (const style of rankedStyles) {
    const fragment = elements.styleItemTemplate.content.cloneNode(true);
    const item = fragment.querySelector(".style-item");
    const rank = fragment.querySelector(".rank");
    const title = fragment.querySelector("h3");
    const score = fragment.querySelector(".style-row span");
    const bar = fragment.querySelector(".bar i");

    item.style.setProperty("--style-color", styleColor(style.rank - 1));
    rank.textContent = String(style.rank).padStart(2, "0");
    title.textContent = style.style || "unknown";
    score.textContent = formatPercent(style.score);
    bar.style.width = `${Math.max(4, Math.round((Number(style.score) || 0) * 100))}%`;
    item.title = Array.isArray(style.evidence) && style.evidence.length ? style.evidence.join(" | ") : "";
    elements.styleList.append(fragment);
  }
}

function renderArchiveTabs(keys = []) {
  elements.archiveTabs.replaceChildren();
  elements.archiveTabs.hidden = !keys.length;

  keys.forEach((key) => {
    const monthItems = state.archiveGroups.get(key) || [];
    const button = document.createElement("button");
    const label = document.createElement("span");
    const count = document.createElement("strong");

    button.type = "button";
    button.className = "archive-tab";
    button.id = `archive-tab-${key}`;
    button.dataset.month = key;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", key === state.activeArchiveMonth ? "true" : "false");
    button.setAttribute("aria-controls", "historyList");

    label.textContent = formatMonthLabel(key);
    count.textContent = String(monthItems.length);
    button.append(label, count);

    button.addEventListener("click", () => {
      state.activeArchiveMonth = key;
      renderArchiveTabs(state.archiveMonthKeys);
      renderArchiveMonth(state.archiveGroups.get(key) || [], key);
    });

    elements.archiveTabs.append(button);
  });
}

function renderHistoryStyles(item = {}) {
  const styles = document.createElement("div");
  styles.className = "history-styles";
  const rankedStyles = classifiedStyles(item.rankedStyles || []).slice(0, 3);

  if (rankedStyles.length) {
    rankedStyles.forEach((style, index) => {
      const chip = document.createElement("span");
      chip.style.setProperty("--chip-color", styleColor(index));
      chip.textContent = `${style.style} ${formatPercent(style.score)}`;
      styles.append(chip);
    });
  } else {
    const chip = document.createElement("span");
    chip.className = "is-pending";
    chip.textContent = "pending";
    styles.append(chip);
  }

  return styles;
}

function renderArchiveMonth(items = [], monthKey = "") {
  elements.historyList.replaceChildren();
  elements.historyList.setAttribute("role", "tabpanel");
  elements.historyList.setAttribute("aria-labelledby", `archive-tab-${monthKey}`);

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No stored TOTD maps for this month.";
    elements.historyList.append(empty);
    return;
  }

  for (const item of items) {
    const cotd = item.cotd || {};
    const entry = document.createElement("article");
    const thumbUrl = String(cotd.thumbnailUrl || "").trim();
    const topStyle = topArchiveStyle(item);
    const titleText = trackmaniaPlainText(cotd.mapName, "TOTD map");

    entry.className = "history-item";

    const thumb = document.createElement("div");
    thumb.className = "history-thumb";
    if (thumbUrl) {
      const img = document.createElement("img");
      img.src = thumbUrl;
      img.loading = "lazy";
      img.alt = `${titleText} thumbnail`;
      thumb.append(img);
    } else {
      thumb.classList.add("is-empty");
    }

    const body = document.createElement("div");
    body.className = "history-body";

    const head = document.createElement("div");
    head.className = "history-head";

    const date = document.createElement("span");
    date.className = "map-date";
    date.textContent = formatDate(cotd.cotdDate);

    const primaryStyle = document.createElement("span");
    primaryStyle.className = "history-primary-style";
    primaryStyle.textContent = topStyle.style;

    head.append(date, primaryStyle);

    const title = document.createElement("strong");
    setTrackmaniaText(title, cotd.mapName, "Unknown map");

    const mapper = document.createElement("span");
    mapper.className = "history-mapper";
    setTrackmaniaText(mapper, cotd.authorName, "Mapper unknown", {
      prefix: cotd.authorName ? "by " : "",
    });

    const styles = renderHistoryStyles(item);

    const meta = document.createElement("span");
    meta.className = "history-status";
    meta.textContent = `${item.status || "pending"} - ${formatRelativeTime(item.updatedAt || item.generatedAt)}`;

    body.append(head, title, mapper, styles, meta);
    entry.append(thumb, body);
    elements.historyList.append(entry);
  }
}

function renderRecentRail(items = []) {
  if (!elements.recentRail) return;
  elements.recentRail.replaceChildren();

  const recent = items.slice(0, 6);
  if (!recent.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No stored TOTD maps yet.";
    elements.recentRail.append(empty);
    return;
  }

  for (const item of recent) {
    const cotd = item.cotd || {};
    const card = document.createElement("article");
    card.className = "recent-card";

    const date = document.createElement("span");
    date.className = "recent-date";
    date.textContent = formatDate(cotd.cotdDate);

    const name = document.createElement("strong");
    name.className = "recent-name";
    setTrackmaniaText(name, cotd.mapName, "Unknown map");

    const mapper = document.createElement("span");
    mapper.className = "recent-mapper";
    setTrackmaniaText(mapper, cotd.authorName, "Mapper unknown", {
      prefix: cotd.authorName ? "by " : "",
    });

    const thumb = document.createElement("div");
    thumb.className = "recent-thumb";
    const thumbUrl = String(cotd.thumbnailUrl || "").trim();
    if (thumbUrl) {
      const img = document.createElement("img");
      img.src = thumbUrl;
      img.loading = "lazy";
      img.alt = "";
      thumb.append(img);
    } else {
      thumb.classList.add("is-empty");
    }

    const styles = document.createElement("div");
    styles.className = "recent-styles";
    classifiedStyles(item.rankedStyles || [])
      .slice(0, 3)
      .forEach((style, index) => {
        const chip = document.createElement("span");
        chip.style.setProperty("--chip-color", styleColor(index));
        chip.textContent = style.style;
        styles.append(chip);
      });

    card.append(date, name, mapper, thumb, styles);
    elements.recentRail.append(card);
  }
}

function renderArchiveDonut(items = [], total = 0) {
  if (!elements.archiveDonut) return;
  elements.archiveDonutLegend?.replaceChildren();

  const counts = new Map();
  for (const item of items) {
    const top = topArchiveStyle(item);
    if (!top || top.style === "pending" || !top.score) continue;
    counts.set(top.style, (counts.get(top.style) || 0) + 1);
  }

  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const shown = ranked.slice(0, 6);
  const otherCount = ranked.slice(6).reduce((sum, [, count]) => sum + count, 0);
  if (otherCount > 0) shown.push(["other", otherCount]);

  if (elements.archiveDonutCount) {
    elements.archiveDonutCount.textContent = String(total || items.length);
  }

  if (!shown.length) {
    elements.archiveDonut.classList.add("is-pending");
    elements.archiveDonut.style.background = "";
    elements.archiveDonut.setAttribute("aria-label", "Archive style distribution pending");
    return;
  }

  elements.archiveDonut.classList.remove("is-pending");
  const classifiedTotal = shown.reduce((sum, [, count]) => sum + count, 0);
  let cursor = 0;
  const segments = shown.map(([, count], index) => {
    const start = cursor;
    const share = (count / classifiedTotal) * 100;
    cursor += share;
    const end = index === shown.length - 1 ? 100 : cursor;
    return `${styleColor(index)} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  });
  elements.archiveDonut.style.background = `conic-gradient(${segments.join(", ")})`;
  elements.archiveDonut.setAttribute("aria-label", shown.map(([style, count]) => `${style}: ${count} maps`).join(", "));

  shown.forEach(([style, count], index) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = styleColor(index);
    const label = document.createElement("span");
    label.textContent = style;
    const value = document.createElement("strong");
    value.textContent = String(count);
    item.append(swatch, label, value);
    elements.archiveDonutLegend?.append(item);
  });
}

function secondsUntilNextTotd() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  const parisSeconds = (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
  const target = 18 * 3600;
  let delta = target - parisSeconds;
  if (delta <= 0) delta += 86400;
  return delta;
}

function startNextTotdCountdown() {
  if (!elements.nextTotdCountdown) return;
  const tick = () => {
    const total = secondsUntilNextTotd();
    const hours = String(Math.floor(total / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const seconds = String(total % 60).padStart(2, "0");
    elements.nextTotdCountdown.textContent = `${hours}:${minutes}:${seconds}`;
  };
  tick();
  setInterval(tick, 1000);
}

function renderEvidence(summary = {}, warnings = []) {
  elements.replayCount.textContent = String(summary.replayCount ?? 0);
  elements.evidenceSource.textContent = summary.source || "pending";
  elements.signalList.replaceChildren();

  const signals = Array.isArray(summary.signals) ? summary.signals : [];
  if (!signals.length) {
    const item = document.createElement("li");
    item.className = "empty-state";
    item.textContent = "Waiting for map, record, replay, and classifier evidence.";
    elements.signalList.append(item);
  } else {
    for (const signal of signals) {
      const item = document.createElement("li");
      const label = document.createElement("strong");
      const value = document.createElement("span");
      label.textContent = signal.label || "Signal";
      value.textContent = signal.value || "";
      item.append(label, value);
      elements.signalList.append(item);
    }
  }

  if (warnings.length) {
    elements.warningBox.hidden = false;
    elements.warningBox.textContent = warnings.join(" ");
  } else {
    elements.warningBox.hidden = true;
    elements.warningBox.textContent = "";
  }
}

function renderToday(snapshot) {
  state.today = snapshot;
  const cotd = snapshot.cotd || {};
  const confidence = snapshot.confidence || {};
  const evidenceSummary = snapshot.evidenceSummary || {};

  renderMapImage(cotd);
  elements.cotdDate.textContent = formatDate(cotd.cotdDate);
  setTrackmaniaText(elements.mapName, cotd.mapName, "Unknown COTD map");
  setTrackmaniaText(elements.authorName, cotd.authorName, "Mapper unknown", {
    prefix: cotd.authorName ? "by " : "",
  });
  elements.confidenceValue.textContent =
    confidence.label && confidence.label !== "unknown"
      ? `${confidence.label} ${formatPercent(confidence.score)}`
      : formatPercent(confidence.score);
  elements.recordCount.textContent = String(evidenceSummary.recordCount ?? snapshot.records?.length ?? 0);
  elements.updatedAt.textContent = formatRelativeTime(snapshot.updatedAt || snapshot.generatedAt);
  elements.classifierMode.textContent = snapshot.classifier?.mode || "pending";
  setStatus(snapshot.status || "pending");
  renderStyles(snapshot.rankedStyles || []);
  renderEvidence(evidenceSummary, snapshot.warnings || []);
  if (elements.infoClassifier) {
    elements.infoClassifier.textContent = `${snapshot.classifier?.mode || "pending"} · ${snapshot.status || "pending"}`;
  }
}

function renderArchive(page = {}) {
  const items = Array.isArray(page.items) ? page.items : [];
  state.archive = items;
  const { groups, keys } = groupArchiveByMonth(items);
  state.archiveGroups = groups;
  state.archiveMonthKeys = keys;
  renderRecentRail(items);
  renderArchiveDonut(items, page.total ?? items.length);
  if (elements.infoArchiveCount) {
    elements.infoArchiveCount.textContent = `${page.total ?? items.length} maps`;
  }
  if (elements.archiveSummary) {
    elements.archiveSummary.textContent = items.length
      ? `${items.length} of ${page.total ?? items.length} known TOTD maps across ${keys.length} month${keys.length === 1 ? "" : "s"}`
      : "No stored TOTD maps yet.";
  }

  if (!items.length) {
    elements.archiveTabs.replaceChildren();
    elements.archiveTabs.hidden = true;
    elements.historyList.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No ingested TOTD archive yet. The fetcher will populate this once a source is configured.";
    elements.historyList.append(empty);
    return;
  }

  if (!state.activeArchiveMonth || !groups.has(state.activeArchiveMonth)) {
    state.activeArchiveMonth = keys[0];
  }

  renderArchiveTabs(keys);
  renderArchiveMonth(groups.get(state.activeArchiveMonth) || [], state.activeArchiveMonth);
}

function renderError(message) {
  setStatus("error");
  elements.mapName.textContent = "COTD API unavailable";
  elements.authorName.textContent = message;
  elements.confidenceValue.textContent = "--";
  elements.recordCount.textContent = "--";
  elements.updatedAt.textContent = "--";
  renderStyles([]);
  renderEvidence({}, [message]);
  renderArchive({ items: [], total: 0 });
}

async function load() {
  try {
    const [today, archive] = await Promise.all([
      fetchJson(new URL("./api/v1/today", window.location.href)).then(unwrapApiData),
      fetchJson(new URL("./api/v1/totd?limit=200", window.location.href)).then(unwrapApiData),
    ]);
    renderToday(today);
    renderArchive(archive);
  } catch (error) {
    renderError(error.message || "The public COTD service could not be reached.");
  }
}

elements.copyApiButton.addEventListener("click", async () => {
  const url = new URL("./api/v1/today", window.location.href).toString();
  try {
    await navigator.clipboard.writeText(url);
    elements.copyApiButton.textContent = "Copied";
    setTimeout(() => {
      elements.copyApiButton.textContent = "Copy API URL";
    }, 1600);
  } catch {
    window.prompt("API URL", url);
  }
});

elements.mapImage.addEventListener("error", () => {
  elements.mapImage.hidden = true;
  elements.mapImage.removeAttribute("src");
  elements.mapPlaceholder.hidden = false;
  elements.mapVisual.dataset.imageState = "pending";
});

startNextTotdCountdown();
load();
