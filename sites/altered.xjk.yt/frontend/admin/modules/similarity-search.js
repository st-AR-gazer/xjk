import { NAMING_SIMILARITY_PAGE_SIZE } from "./constants.js?v=2";
import { fmtNum, stripFmt } from "./formatters.js?v=2";
import { el, state } from "./state.js?v=2";

function normalizeSimilaritySearchText(value) {
  return stripFmt(String(value ?? ""))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSimilarityMatchSearchText(match = {}) {
  return normalizeSimilaritySearchText(
    [
      match.mapName || match.mapUid || "",
      match.campaignName || "",
      match.mapUid || "",
      match.slot != null ? `slot ${match.slot}` : "",
    ].join(" ")
  );
}

export function syncNamingSimilaritySearch() {
  const searchInput = el.drawerBody?.querySelector("[data-naming-similarity-search-input]");
  if (!(searchInput instanceof HTMLInputElement)) return;

  const rows = Array.from(el.drawerBody?.querySelectorAll("[data-naming-similarity-row]") || []);
  const countLabel = el.drawerBody?.querySelector("[data-naming-similarity-search-count]");
  const emptyState = el.drawerBody?.querySelector("[data-naming-similarity-search-empty]");
  const pagination = el.drawerBody?.querySelector("[data-naming-similarity-pagination]");
  const pageLabel = el.drawerBody?.querySelector("[data-naming-similarity-page-label]");
  const prevButton = el.drawerBody?.querySelector("[data-naming-similarity-page='prev']");
  const nextButton = el.drawerBody?.querySelector("[data-naming-similarity-page='next']");
  const query = normalizeSimilaritySearchText(state.drawerUi.namingSimilaritySearch || "");

  if (searchInput.value !== state.drawerUi.namingSimilaritySearch) {
    searchInput.value = state.drawerUi.namingSimilaritySearch || "";
  }

  const filteredRows = [];
  rows.forEach((row) => {
    if (!(row instanceof HTMLElement)) return;
    const searchText = normalizeSimilaritySearchText(row.getAttribute("data-similarity-search-text") || "");
    const matches = !query || searchText.includes(query);
    if (matches) {
      filteredRows.push(row);
    } else {
      row.hidden = true;
    }
  });

  const totalMatches = filteredRows.length;
  const totalPages = totalMatches > 0 ? Math.ceil(totalMatches / NAMING_SIMILARITY_PAGE_SIZE) : 0;
  const safePage =
    totalPages > 0 ? Math.min(Math.max(1, Number(state.drawerUi.namingSimilarityPage || 1)), totalPages) : 1;
  state.drawerUi.namingSimilarityPage = safePage;

  const pageStart = totalPages > 0 ? (safePage - 1) * NAMING_SIMILARITY_PAGE_SIZE : 0;
  const pageEnd = totalPages > 0 ? Math.min(totalMatches, pageStart + NAMING_SIMILARITY_PAGE_SIZE) : 0;

  filteredRows.forEach((row, index) => {
    if (!(row instanceof HTMLElement)) return;
    row.hidden = index < pageStart || index >= pageEnd;
  });

  if (countLabel instanceof HTMLElement) {
    const rangeText =
      totalMatches > 0
        ? `${fmtNum(pageStart + 1)}-${fmtNum(pageEnd)} of ${fmtNum(totalMatches)}`
        : `0 of ${fmtNum(rows.length)}`;
    countLabel.textContent = query
      ? `Showing ${rangeText} filtered matches. Selected rows stay checked while filtered.`
      : `${fmtNum(rows.length)} ranked matches. Showing ${rangeText}.`;
  }

  if (emptyState instanceof HTMLElement) {
    emptyState.hidden = totalMatches !== 0;
  }

  if (pagination instanceof HTMLElement) {
    pagination.hidden = totalPages <= 1;
  }

  if (pageLabel instanceof HTMLElement) {
    pageLabel.textContent = totalPages > 0 ? `Page ${fmtNum(safePage)} of ${fmtNum(totalPages)}` : "";
  }

  if (prevButton instanceof HTMLButtonElement) {
    prevButton.disabled = totalPages <= 1 || safePage <= 1;
  }

  if (nextButton instanceof HTMLButtonElement) {
    nextButton.disabled = totalPages <= 1 || safePage >= totalPages;
  }
}
