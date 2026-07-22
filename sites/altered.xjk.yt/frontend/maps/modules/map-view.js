import { $empty, $mapGrid, $modalBackdrop, $modalContent, $pagination, $resultsSummary } from "./elements.js?v=2";
import { PAGE_SIZE } from "./config.js?v=2";
import { state } from "./state.js?v=2";
import { appendElement, clearElement, createElement, safeImageUrl } from "./dom.js?v=2";
import { firstMapValue, fmtTime, relTime, stripFmt } from "./formatters.js?v=2";
import { resolveMapAuthorLabel } from "./display-names.js?v=2";
import {
  getChangeCountValue,
  getMapNumberLabel,
  getMapUidValue,
  numberMapValue,
  trackingStatusClass,
} from "./map-model.js?v=2";
import { renderFilterChips, renderFilterToggle } from "./filters.js?v=2";
import { writeUrl } from "./query.js?v=2";

function createMapCard(map) {
  const tracking = map.tracking_status || "idle";
  const authorLabel = resolveMapAuthorLabel(map);
  const metaBits = [
    map.season_label || "",
    map.alteration || "",
    map.map_number ? `#${map.map_number}` : "",
    map.change_count ? `${map.change_count} changes` : "",
  ].filter(Boolean);
  const card = createElement("article", {
    className: "map-card",
    dataset: { uid: map.map_uid || "" },
  });
  const thumb = appendElement(card, "div", { className: "map-thumb" });
  const thumbnailUrl = safeImageUrl(map.thumbnail_url);
  if (thumbnailUrl) {
    appendElement(thumb, "img", {
      attributes: { src: thumbnailUrl, alt: "", loading: "lazy" },
    });
  }
  appendElement(thumb, "span", {
    className: `map-status map-status-${trackingStatusClass(tracking)}`,
    text: tracking,
  });

  const body = appendElement(card, "div", { className: "map-body" });
  const mapName = stripFmt(map.name || "Untitled");
  appendElement(body, "h3", { className: "map-name", text: mapName, title: stripFmt(map.name) });
  appendElement(body, "p", { className: "map-author", text: `by ${stripFmt(authorLabel)}` });
  const worldRecord = appendElement(body, "div", { className: "map-wr" });
  if (map.wr_ms) {
    appendElement(worldRecord, "span", { className: "wr-time", text: fmtTime(map.wr_ms) });
    appendElement(worldRecord, "span", { className: "wr-holder", text: stripFmt(map.wr_holder) });
  } else {
    appendElement(worldRecord, "span", { className: "wr-empty", text: "No WR data" });
  }

  const medals = appendElement(body, "div", { className: "map-medals" });
  for (const [className, value] of [
    ["medal-at", map.author_time],
    ["medal-gold", map.gold_time],
    ["medal-silver", map.silver_time],
    ["medal-bronze", map.bronze_time],
  ]) {
    appendElement(medals, "span", { className: `medal ${className}`, text: fmtTime(value) });
  }

  if (metaBits.length) {
    const metadata = appendElement(body, "div", { className: "map-card-meta" });
    metaBits.forEach((value) => appendElement(metadata, "span", { text: value }));
  }
  return card;
}

export function renderPagination() {
  if (!$pagination) return;
  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  if (state.total <= PAGE_SIZE) {
    $pagination.hidden = true;
    clearElement($pagination);
    return;
  }

  $pagination.hidden = false;
  clearElement($pagination);
  const start = (state.page - 1) * PAGE_SIZE + 1;
  const end = Math.min(state.page * PAGE_SIZE, state.total);
  appendElement($pagination, "span", {
    className: "page-info",
    text: `Showing ${start}-${end} of ${state.total}`,
  });
  const buttons = appendElement($pagination, "div", { className: "page-buttons" });
  const previous = appendElement(buttons, "button", {
    className: "page-btn",
    text: "Prev",
    attributes: { type: "button" },
    dataset: { page: "prev" },
  });
  previous.disabled = state.page <= 1;

  const totalPagesToShow = totalPages > 7 ? [1, state.page - 1, state.page, state.page + 1, totalPages] : [];
  for (let index = 1; index <= totalPages; index += 1) {
    if (totalPages > 7 && !totalPagesToShow.includes(index)) {
      if (index === 2 || index === totalPages - 1) {
        appendElement(buttons, "span", { className: "page-ellipsis", text: "..." });
      }
      continue;
    }
    appendElement(buttons, "button", {
      className: `page-btn ${index === state.page ? "active" : ""}`.trim(),
      text: index,
      attributes: { type: "button" },
      dataset: { page: index },
    });
  }
  const next = appendElement(buttons, "button", {
    className: "page-btn",
    text: "Next",
    attributes: { type: "button" },
    dataset: { page: "next" },
  });
  next.disabled = state.page >= totalPages;
}

export function renderPage() {
  renderFilterChips();
  renderFilterToggle();

  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  const start = state.total ? (state.page - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(state.page * PAGE_SIZE, state.total);
  $resultsSummary.textContent = state.total
    ? `Showing ${start}-${end} of ${state.total} maps${totalPages > 1 ? ` · page ${state.page}/${totalPages}` : ""}`
    : "No maps match the current filters.";

  if (!state.maps.length) {
    $mapGrid.hidden = true;
    clearElement($mapGrid);
    $empty.hidden = false;
    renderPagination();
    return;
  }

  $empty.hidden = true;
  $mapGrid.hidden = false;
  clearElement($mapGrid);
  state.maps.forEach((map) => $mapGrid.appendChild(createMapCard(map)));
  renderPagination();
}

export function renderMapModal(map, { updateUrl = true, mapUid = "" } = {}) {
  if (!map || !$modalContent) return;

  const uid = getMapUidValue(map) || String(mapUid || "").trim();
  const tracking = firstMapValue(map, ["tracking_status", "trackingStatus", "status"], "idle") || "idle";
  const authorLabel = resolveMapAuthorLabel(map);
  const thumbnailUrl = firstMapValue(map, ["thumbnail_url", "thumbnailUrl"], "");
  const wrMs = numberMapValue(map, ["wr_ms", "wrMs"]);
  const wrHolder = firstMapValue(map, ["wr_holder", "wrHolder"], "");
  const wrUpdatedAt = firstMapValue(map, ["wr_updated_at", "wrUpdatedAt"], "");
  const campaignName = firstMapValue(map, ["campaign_name", "campaignName"], "");
  const seasonLabel = firstMapValue(map, ["season_label", "seasonLabel", "season"], "");
  const alteration = firstMapValue(map, ["alteration"], "");
  clearElement($modalContent);

  const hero = appendElement($modalContent, "div", { className: "modal-hero" });
  const safeThumbnailUrl = safeImageUrl(thumbnailUrl);
  if (safeThumbnailUrl) {
    appendElement(hero, "img", {
      className: "modal-thumb",
      attributes: { src: safeThumbnailUrl, alt: "" },
    });
  } else {
    appendElement(hero, "div", { className: "modal-thumb modal-thumb-empty" });
  }

  const info = appendElement(hero, "div", { className: "modal-info" });
  appendElement(info, "h2", {
    className: "modal-name",
    text: stripFmt(firstMapValue(map, ["name"], "Untitled") || "Untitled"),
  });
  appendElement(info, "p", { className: "modal-author", text: `by ${stripFmt(authorLabel)}` });
  const tags = appendElement(info, "div", { className: "modal-tags" });
  for (const [value, stripFormatting] of [
    [campaignName, true],
    [seasonLabel, false],
    [alteration, false],
  ]) {
    if (value) {
      appendElement(tags, "span", {
        className: "modal-campaign",
        text: stripFormatting ? stripFmt(value) : value,
      });
    }
  }
  const status = appendElement(tags, "span", {
    className: `map-status map-status-${trackingStatusClass(tracking)}`,
    text: tracking,
  });
  status.style.position = "static";

  const medals = appendElement($modalContent, "div", { className: "modal-medals" });
  for (const [className, label, keys] of [
    ["modal-medal-at", "Author", ["author_time", "authorTime", "authorScore"]],
    ["modal-medal-gold", "Gold", ["gold_time", "goldTime", "goldScore"]],
    ["modal-medal-silver", "Silver", ["silver_time", "silverTime", "silverScore"]],
    ["modal-medal-bronze", "Bronze", ["bronze_time", "bronzeTime", "bronzeScore"]],
  ]) {
    const medal = appendElement(medals, "div", { className: `modal-medal ${className}` });
    appendElement(medal, "span", { className: "modal-medal-label", text: label });
    appendElement(medal, "span", {
      className: "modal-medal-time",
      text: fmtTime(numberMapValue(map, keys)),
    });
  }

  const worldRecordSection = appendElement($modalContent, "div", { className: "modal-section" });
  appendElement(worldRecordSection, "h3", { className: "modal-section-title", text: "World Record" });
  if (wrMs) {
    const worldRecord = appendElement(worldRecordSection, "div", { className: "modal-wr" });
    const row = appendElement(worldRecord, "div", { className: "modal-wr-row" });
    appendElement(row, "span", { className: "modal-wr-rank", text: "1" });
    const detail = appendElement(row, "div", { className: "modal-wr-detail" });
    appendElement(detail, "span", { className: "modal-wr-holder", text: stripFmt(wrHolder) });
    appendElement(detail, "span", { className: "modal-wr-ago", text: relTime(wrUpdatedAt) });
    appendElement(row, "span", { className: "modal-wr-time", text: fmtTime(wrMs) });
  } else {
    const empty = appendElement(worldRecordSection, "div", { className: "modal-wr modal-wr-empty" });
    appendElement(empty, "span", { text: "No WR data recorded yet" });
  }

  const trackingSection = appendElement($modalContent, "div", { className: "modal-section" });
  appendElement(trackingSection, "h3", { className: "modal-section-title", text: "Tracking" });
  const stats = appendElement(trackingSection, "div", { className: "modal-stats" });
  for (const [value, label] of [
    [getMapNumberLabel(map), "Map #"],
    [getChangeCountValue(map), "WR Changes"],
  ]) {
    const stat = appendElement(stats, "div", { className: "modal-stat" });
    appendElement(stat, "span", { className: "modal-stat-value", text: value });
    appendElement(stat, "span", { className: "modal-stat-label", text: label });
  }

  const uidElement = appendElement($modalContent, "div", { className: "modal-uid" });
  appendElement(uidElement, "span", { text: "UID:" });
  uidElement.append(` ${uid}`);

  $modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  if (uid) state.activeModalMapUid = uid;
  if (updateUrl && uid) writeUrl({ replace: false, map: uid });
}
