import "/shared/xjk-core/safe-html.js?v=2";
import { STATUS_LABELS } from "./constants.js";
import { elements } from "./dom.js";
import { formatTimestamp } from "./format.js";
import {
  createApiButton,
  makeActionButton,
  metaCard,
  recordRowMeta,
  safeText,
  showOnly,
  statusClass,
  summaryChip,
  trackCardClass,
  trackMetaCard,
} from "./ui.js";
import { detailFor, headlineFor, shortLineFor, verificationMap } from "./verifications.js";
import { escapeHtml } from "/shared/xjk-core/dom-utils.js";

const MAP_SORT_LABELS = {
  rank_asc: "Rank ascending",
  rank_desc: "Rank descending",
  updated_desc: "Latest update",
  record_asc: "Record ID",
};

const MAP_STATUS_LABELS = {
  all: "All statuses",
  pass: "Verified",
  fail: "Failed",
  pending: "Pending",
  unavailable: "Unavailable",
  not_run: "Not run",
};

function mapStatusForTrack(bundle, track) {
  const verification = verificationMap(bundle?.verifications)[track];
  return verification?.status || "not_run";
}

function recordSummaryLine(bundle) {
  const verifications = verificationMap(bundle?.verifications);
  return `${shortLineFor("replay", verifications.replay)} · ${shortLineFor("deep", verifications.deep)}`;
}

function resultSummaryBanner(text) {
  const summary = document.createElement("div");
  summary.className = "result-summary-banner";
  summary.textContent = text;
  return summary;
}

function buildMapToolbar(view, stats, options) {
  const toolbar = document.createElement("div");
  toolbar.className = "map-controls-toolbar";

  const trackGroup = document.createElement("div");
  trackGroup.className = "map-track-switch";
  for (const track of ["replay", "deep"]) {
    const button = document.createElement("button");
    button.className = `map-track-chip${view.track === track ? " is-active" : ""}`;
    button.type = "button";
    button.textContent = track === "replay" ? "Replay" : "Deep";
    button.addEventListener("click", () => options.onTrackChange?.(track));
    trackGroup.appendChild(button);
  }

  const statusSelect = document.createElement("select");
  statusSelect.className = "form-input map-toolbar-select";
  for (const [value, label] of Object.entries(MAP_STATUS_LABELS)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = view.status === value;
    statusSelect.appendChild(option);
  }
  statusSelect.addEventListener("change", () => options.onViewChange?.({ status: statusSelect.value, page: 1 }));

  const sortSelect = document.createElement("select");
  sortSelect.className = "form-input map-toolbar-select";
  for (const [value, label] of Object.entries(MAP_SORT_LABELS)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = view.sort === value;
    sortSelect.appendChild(option);
  }
  sortSelect.addEventListener("change", () => options.onViewChange?.({ sort: sortSelect.value, page: 1 }));

  const pageSizeSelect = document.createElement("select");
  pageSizeSelect.className = "form-input map-toolbar-select";
  for (const size of [10, 25, 50]) {
    const option = document.createElement("option");
    option.value = String(size);
    option.textContent = `${size} / page`;
    option.selected = view.pageSize === size;
    pageSizeSelect.appendChild(option);
  }
  pageSizeSelect.addEventListener("change", () =>
    options.onViewChange?.({ pageSize: Number(pageSizeSelect.value), page: 1 })
  );

  const pageInfo = document.createElement("span");
  pageInfo.className = "map-page-info";
  pageInfo.textContent = `Page ${stats.page} of ${stats.pageCount}`;

  const prevButton = makeActionButton("Prev", () => options.onViewChange?.({ page: Math.max(1, stats.page - 1) }));
  prevButton.disabled = stats.page <= 1;

  const nextButton = makeActionButton("Next", () =>
    options.onViewChange?.({ page: Math.min(stats.pageCount, stats.page + 1) })
  );
  nextButton.disabled = stats.page >= stats.pageCount;

  toolbar.append(trackGroup, statusSelect, sortSelect, pageSizeSelect, pageInfo, prevButton, nextButton);
  return toolbar;
}

export function renderTrackCard(track, verification) {
  const card = document.createElement("article");
  card.className = trackCardClass(verification.status);

  const head = document.createElement("div");
  head.className = "track-head";

  const headLeft = document.createElement("div");

  const trackLabel = document.createElement("div");
  trackLabel.className = "track-label";
  trackLabel.textContent = track === "replay" ? "Replay verification" : "Deep verification";

  const headline = document.createElement("h3");
  headline.className = "track-headline";
  headline.textContent = headlineFor(track, verification);

  const pill = document.createElement("span");
  pill.className = statusClass(verification.status);
  pill.textContent = STATUS_LABELS[verification.status] || "Unavailable";

  headLeft.append(trackLabel, headline);
  head.append(headLeft, pill);

  const detail = document.createElement("p");
  detail.className = "track-detail";
  detail.textContent = detailFor(track, verification);

  const meta = document.createElement("div");
  meta.className = "track-meta";
  meta.append(
    trackMetaCard("Checked", formatTimestamp(verification.checked_at)),
    trackMetaCard("Confidence", verification.confidence || "Not available"),
    trackMetaCard("Policy", verification.policy_version || "Not available"),
    trackMetaCard("Updated", formatTimestamp(verification.updated_at))
  );

  card.append(head, detail, meta);
  return card;
}

export function renderRecordMessage(targetEl, kicker, heading, body) {
  targetEl.replaceChildren();

  const wrapper = document.createElement("div");
  wrapper.className = "result-header";
  globalThis.XjkSafeHtml.set(
    wrapper,
    `
    <p class="result-kicker">${safeText(kicker, "Record lookup")}</p>
    <h2 class="result-title">${safeText(heading, "Record")}</h2>
    <p class="result-empty-copy">${safeText(body)}</p>
  `
  );

  targetEl.appendChild(wrapper);
  showOnly(targetEl);
}

export function renderMapMessage(mapUid, title, body) {
  elements.mapResult.replaceChildren();

  const wrapper = document.createElement("div");
  wrapper.className = "result-header";
  globalThis.XjkSafeHtml.set(
    wrapper,
    `
    <p class="result-kicker">Map view</p>
    <h2 class="result-title">${safeText(mapUid, "Map")}</h2>
    <p class="result-empty-copy">${safeText(title)} ${safeText(body, "")}</p>
  `
  );

  elements.mapResult.appendChild(wrapper);
  showOnly(elements.mapResult);
}

export function renderRecordBundleInto(targetEl, bundle, options = {}) {
  const verifications = verificationMap(bundle.verifications);
  targetEl.replaceChildren();

  const header = document.createElement("div");
  header.className = "result-header";
  globalThis.XjkSafeHtml.set(
    header,
    `
    <p class="result-kicker">${safeText(options.kicker, "Record lookup")}</p>
    <h2 class="result-title">${safeText(bundle.record_id)}</h2>
    <p class="muted">${safeText(options.helperText, recordSummaryLine(bundle))}</p>
  `
  );

  const metaGrid = document.createElement("div");
  metaGrid.className = "result-meta";
  metaGrid.append(
    metaCard("Map UID", bundle.map_uid || "Not available"),
    metaCard("Rank", bundle.rank == null ? "Not available" : `#${bundle.rank}`),
    metaCard("Updated", formatTimestamp(bundle.updated_at))
  );

  const trackGrid = document.createElement("div");
  trackGrid.className = "track-grid";
  trackGrid.append(renderTrackCard("replay", verifications.replay), renderTrackCard("deep", verifications.deep));

  const actions = document.createElement("div");
  actions.className = "result-actions actions";
  actions.append(createApiButton("Open API JSON", `/api/v1/records/${encodeURIComponent(bundle.record_id)}`));

  if (options.showCompatButton !== false) {
    actions.append(
      createApiButton("Open Compat Route", `/api/v1/records/${encodeURIComponent(bundle.record_id)}/verdicts`)
    );
  }

  if (typeof options.onCopyLink === "function") {
    actions.append(makeActionButton("Copy Link", () => options.onCopyLink(bundle)));
  }

  if (bundle.map_uid && typeof options.onOpenMap === "function") {
    actions.append(makeActionButton("Open Map View", () => options.onOpenMap(bundle.map_uid)));
  }

  targetEl.append(header, resultSummaryBanner(recordSummaryLine(bundle)), metaGrid, trackGrid, actions);
  showOnly(targetEl);
}

export function renderRecordResult(bundle, options = {}) {
  renderRecordBundleInto(elements.recordResult, bundle, {
    kicker: "Record lookup",
    helperText: recordSummaryLine(bundle),
    ...options,
  });
}

export function renderSubmissionResult(bundle, submissionId, options = {}) {
  renderRecordBundleInto(elements.submissionResult, bundle, {
    kicker: `Replay submission${submissionId ? ` - ${submissionId}` : ""}`,
    helperText: `Submission created · ${recordSummaryLine(bundle)}`,
    ...options,
  });
}

function renderMapRecord(bundle, track, options = {}) {
  const verifications = verificationMap(bundle.verifications);
  const row = document.createElement("article");
  row.className = "record-row";

  const top = document.createElement("div");
  top.className = "record-row-top";

  const left = document.createElement("div");
  left.className = "record-row-left";

  const rank = document.createElement("div");
  rank.className = "record-rank";
  rank.textContent = bundle.rank == null ? "Unranked record" : `Rank #${bundle.rank}`;

  const title = document.createElement("h3");
  title.className = "record-row-title";
  title.textContent = bundle.record_id;

  const openButton = document.createElement("button");
  openButton.className = "record-link";
  openButton.type = "button";
  openButton.textContent = "Open record";
  openButton.addEventListener("click", () => {
    if (typeof options.onOpenRecord === "function") {
      options.onOpenRecord(bundle.record_id);
    }
  });

  left.append(rank, title, openButton);

  const pills = document.createElement("div");
  pills.className = "record-row-pills";

  const replayPill = document.createElement("span");
  replayPill.className = statusClass(verifications.replay.status);
  replayPill.textContent = `Replay: ${STATUS_LABELS[verifications.replay.status] || "Unavailable"}`;

  const deepPill = document.createElement("span");
  deepPill.className = statusClass(verifications.deep.status);
  deepPill.textContent = `Deep: ${STATUS_LABELS[verifications.deep.status] || "Unavailable"}`;

  const focusPill = document.createElement("span");
  focusPill.className = statusClass(mapStatusForTrack(bundle, track));
  focusPill.textContent = `${track === "replay" ? "Primary replay" : "Primary deep"} · ${
    STATUS_LABELS[mapStatusForTrack(bundle, track)] || "Unavailable"
  }`;

  pills.append(focusPill, replayPill, deepPill);
  top.append(left, pills);

  const meta = document.createElement("div");
  meta.className = "record-row-meta";
  meta.append(
    recordRowMeta("Updated", formatTimestamp(bundle.updated_at)),
    recordRowMeta("Replay reason", verifications.replay.reason_code || "Not available"),
    recordRowMeta("Deep reason", verifications.deep.reason_code || "Not available")
  );

  row.append(top, meta);
  return row;
}

export function renderMapResult(viewData, options = {}) {
  elements.mapResult.replaceChildren();

  const header = document.createElement("div");
  header.className = "result-header";
  globalThis.XjkSafeHtml.set(
    header,
    `
    <p class="result-kicker">Map view</p>
    <h2 class="result-title">${safeText(viewData.map_uid)}</h2>
    <p class="muted">${viewData.track === "replay" ? "Replay coverage list" : "Deep coverage list"} · ${escapeHtml(String(viewData.filteredCount ?? 0))} visible of ${escapeHtml(String(viewData.totalCount ?? 0))} fetched</p>
  `
  );

  const metaGrid = document.createElement("div");
  metaGrid.className = "result-meta";
  metaGrid.append(
    metaCard("Track", viewData.track === "replay" ? "Replay verification" : "Deep verification"),
    metaCard("Visible rows", `${viewData.filteredCount}`),
    metaCard("Latest update", formatTimestamp(viewData.latestUpdate))
  );

  const summary = document.createElement("div");
  summary.className = "summary-strip";
  summary.append(
    summaryChip("Verified", viewData.counts.pass),
    summaryChip("Failed", viewData.counts.fail),
    summaryChip("Pending", viewData.counts.pending),
    summaryChip("Unavailable", viewData.counts.unavailable),
    summaryChip("Not run", viewData.counts.not_run)
  );

  const actions = document.createElement("div");
  actions.className = "result-actions actions";
  actions.append(createApiButton("Open Map API JSON", viewData.apiHref));
  if (typeof options.onCopyLink === "function") {
    actions.append(makeActionButton("Copy Link", () => options.onCopyLink(viewData)));
  }

  elements.mapResult.append(
    header,
    resultSummaryBanner(
      `${viewData.track === "replay" ? "Replay" : "Deep"} view · ${MAP_STATUS_LABELS[viewData.status] || "All statuses"} · ${MAP_SORT_LABELS[viewData.sort] || "Rank ascending"}`
    ),
    metaGrid,
    summary,
    actions
  );
  elements.mapResult.appendChild(buildMapToolbar(viewData, viewData, options));

  if (!viewData.items.length) {
    const empty = document.createElement("div");
    empty.className = "result-empty-copy";
    empty.textContent =
      viewData.filteredCount === 0
        ? "No rows match the current filters."
        : "No public verification results were returned for this map.";
    elements.mapResult.appendChild(empty);
    showOnly(elements.mapResult);
    return;
  }

  const list = document.createElement("div");
  list.className = "record-list";
  viewData.items.forEach((bundle) => list.appendChild(renderMapRecord(bundle, viewData.track, options)));

  elements.mapResult.appendChild(list);
  showOnly(elements.mapResult);
}
