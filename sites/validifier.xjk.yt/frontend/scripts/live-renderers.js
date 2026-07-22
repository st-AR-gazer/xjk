import "/shared/xjk-core/safe-html.js?v=2";
import { STATUS_LABELS } from "./constants.js";
import { formatTimestamp, textOrFallback } from "./format.js";
import { createApiButton, makeActionButton, safeText, statusClass, summaryChip } from "./ui.js";
import { shortLineFor, verificationMap } from "./verifications.js";
import { escapeHtml } from "/shared/xjk-core/dom-utils.js";

function activityLine(activity) {
  const trackLabel = activity.track === "deep" ? "Deep" : "Replay";
  const statusLabel = STATUS_LABELS[activity.status] || "Unavailable";
  return `${trackLabel} ${statusLabel}`;
}

function renderEmptyCard(title, body) {
  const card = document.createElement("section");
  card.className = "empty-panel empty-panel-compact";
  globalThis.XjkSafeHtml.set(
    card,
    `
    <h3>${safeText(title)}</h3>
    <p class="intro-copy">${safeText(body, "")}</p>
  `
  );
  return card;
}

function renderLatestActivity(activity, options = {}) {
  const card = document.createElement("article");
  card.className = `live-ticker-card${options.isFresh ? " is-fresh" : ""}`;

  const head = document.createElement("div");
  head.className = "live-ticker-head";
  globalThis.XjkSafeHtml.set(
    head,
    `
    <div class="live-ticker-kicker">
      <span class="live-ping" aria-hidden="true"></span>
      <span>Latest activity</span>
    </div>
    <span class="tab-count">${escapeHtml(formatTimestamp(activity.updated_at))}</span>
  `
  );

  const title = document.createElement("h3");
  title.className = "live-ticker-title";
  title.textContent = textOrFallback(activity.record_id, "Record");

  const detail = document.createElement("p");
  detail.className = "live-ticker-detail";
  detail.textContent = `${textOrFallback(activity.map_uid, "Unknown map")} - ${activityLine(activity)}`;

  const meta = document.createElement("div");
  meta.className = "live-activity-meta";
  meta.append(
    createMetaPill("Track", activity.track === "deep" ? "Deep" : "Replay"),
    createMetaPill("Rank", activity.rank == null ? "Unranked" : `#${activity.rank}`),
    createMetaPill("Reason", activity.reason_code || "Not available")
  );

  const actions = document.createElement("div");
  actions.className = "result-actions actions";
  actions.append(createApiButton("Open API JSON", `/api/v1/records/${encodeURIComponent(activity.record_id)}`));

  if (typeof options.onOpenRecord === "function") {
    actions.append(makeActionButton("Open Record", () => options.onOpenRecord(activity.record_id)));
  }

  if (activity.map_uid && typeof options.onOpenMap === "function") {
    actions.append(
      makeActionButton("Open Map", () =>
        options.onOpenMap(activity.map_uid, { track: activity.track === "deep" ? "deep" : "replay", page: 1 })
      )
    );
  }

  if (typeof options.onCopyRecordLink === "function") {
    actions.append(makeActionButton("Copy Link", () => options.onCopyRecordLink(activity.record_id)));
  }

  card.append(head, title, detail, meta, actions);
  return card;
}

function createMetaPill(label, value) {
  const item = document.createElement("div");
  item.className = "live-meta-pill";
  globalThis.XjkSafeHtml.set(
    item,
    `
    <span class="live-meta-pill-label">${safeText(label)}</span>
    <span class="live-meta-pill-value">${safeText(value)}</span>
  `
  );
  return item;
}

function renderRecentActivityItem(activity, options = {}) {
  const item = document.createElement("article");
  item.className = `live-feed-item${options.isFresh ? " is-fresh" : ""}`;

  const top = document.createElement("div");
  top.className = "live-feed-item-top";
  globalThis.XjkSafeHtml.set(
    top,
    `
    <span class="track-label">${activity.track === "deep" ? "Deep" : "Replay"}</span>
    <span class="live-feed-time">${escapeHtml(formatTimestamp(activity.updated_at))}</span>
  `
  );

  const title = document.createElement("h3");
  title.className = "live-feed-title";
  title.textContent = textOrFallback(activity.record_id);

  const detail = document.createElement("p");
  detail.className = "track-detail";
  detail.textContent = `${textOrFallback(activity.map_uid, "Unknown map")} - ${activityLine(activity)}`;

  const actions = document.createElement("div");
  actions.className = "live-feed-actions";
  if (typeof options.onOpenRecord === "function") {
    actions.append(makeActionButton("Record", () => options.onOpenRecord(activity.record_id)));
  }
  if (activity.map_uid && typeof options.onOpenMap === "function") {
    actions.append(
      makeActionButton("Map", () =>
        options.onOpenMap(activity.map_uid, { track: activity.track === "deep" ? "deep" : "replay", page: 1 })
      )
    );
  }

  item.append(top, title, detail, actions);
  return item;
}

function createVerificationPills(verifications) {
  const pills = document.createElement("div");
  pills.className = "record-row-pills";
  for (const track of ["replay", "deep"]) {
    const pill = document.createElement("span");
    pill.className = statusClass(verifications[track].status);
    pill.textContent = shortLineFor(track, verifications[track]);
    pills.appendChild(pill);
  }
  return pills;
}

function renderWatchlistRow(bundle, options = {}) {
  const verifications = verificationMap(bundle.verifications);
  const row = document.createElement("article");
  row.className = "live-record-row";

  const head = document.createElement("div");
  head.className = "live-record-row-head";

  const titleBlock = document.createElement("div");
  titleBlock.className = "live-record-row-titleblock";
  globalThis.XjkSafeHtml.set(
    titleBlock,
    `
    <h3 class="live-record-row-title">${safeText(bundle.record_id)}</h3>
    <p class="live-record-row-subtitle">${safeText(bundle.map_uid, "Unknown map")}</p>
  `
  );

  const meta = document.createElement("div");
  meta.className = "live-record-row-inline";
  meta.append(
    createMetaPill("Rank", bundle.rank == null ? "Unranked" : `#${bundle.rank}`),
    createMetaPill("Updated", formatTimestamp(bundle.updated_at))
  );

  head.append(titleBlock, meta);

  const pills = createVerificationPills(verifications);

  const actions = document.createElement("div");
  actions.className = "live-row-actions";
  if (typeof options.onOpenRecord === "function") {
    actions.append(makeActionButton("Open Record", () => options.onOpenRecord(bundle.record_id)));
  }
  if (bundle.map_uid && typeof options.onOpenMap === "function") {
    actions.append(makeActionButton("Open Map", () => options.onOpenMap(bundle.map_uid, { track: "replay", page: 1 })));
  }
  if (typeof options.onCopyRecordLink === "function") {
    actions.append(makeActionButton("Copy Link", () => options.onCopyRecordLink(bundle.record_id)));
  }

  row.append(head, pills, actions);
  return row;
}

function renderMapRemainingCard(group, options = {}) {
  const card = document.createElement("article");
  card.className = "live-map-card";

  const head = document.createElement("div");
  head.className = "live-map-card-head";
  globalThis.XjkSafeHtml.set(
    head,
    `
    <div>
      <h3 class="live-map-card-title">${safeText(group.map_uid)}</h3>
      <p class="live-map-card-subtitle">${escapeHtml(String(group.unresolved_records ?? 0))} unresolved of ${escapeHtml(String(group.total_records ?? 0))}</p>
    </div>
    <div class="live-map-counts">
      <span class="pill pill-pending">Replay left: ${escapeHtml(String(group.replay_remaining ?? 0))}</span>
      <span class="pill pill-not_run">Deep left: ${escapeHtml(String(group.deep_remaining ?? 0))}</span>
    </div>
  `
  );

  const summary = document.createElement("div");
  summary.className = "live-map-summary";
  summary.append(
    createMetaPill("Replay pending", group.replay_pending),
    createMetaPill("Replay blocked", group.replay_unavailable),
    createMetaPill("Deep pending", group.deep_pending),
    createMetaPill("Deep blocked", group.deep_unavailable)
  );

  const actions = document.createElement("div");
  actions.className = "live-row-actions";
  if (typeof options.onOpenMap === "function") {
    actions.append(
      makeActionButton("Open Map", () =>
        options.onOpenMap(group.map_uid, {
          track:
            group.replay_remaining > 0 || group.replay_pending > 0 || group.replay_unavailable > 0 ? "replay" : "deep",
          page: 1,
        })
      )
    );
  }
  if (typeof options.onCopyMapLink === "function") {
    actions.append(makeActionButton("Copy Link", () => options.onCopyMapLink(group.map_uid)));
  }

  const list = document.createElement("div");
  list.className = "live-map-records";
  for (const bundle of group.records) {
    const verifications = verificationMap(bundle.verifications);
    const item = document.createElement("article");
    item.className = "live-map-record";
    globalThis.XjkSafeHtml.set(
      item,
      `
      <div class="live-map-record-head">
        <strong>${safeText(bundle.record_id)}</strong>
        <span>${escapeHtml(bundle.rank == null ? "Unranked" : `#${bundle.rank}`)}</span>
      </div>
    `
    );

    const pills = createVerificationPills(verifications);

    const itemActions = document.createElement("div");
    itemActions.className = "live-map-record-actions";
    if (typeof options.onOpenRecord === "function") {
      itemActions.append(makeActionButton("Record", () => options.onOpenRecord(bundle.record_id)));
    }

    item.append(pills, itemActions);
    list.appendChild(item);
  }

  card.append(head, summary, actions, list);
  return card;
}

function renderSection(title, countLabel, body) {
  const section = document.createElement("section");
  section.className = "live-section-card";

  const head = document.createElement("div");
  head.className = "workspace-block-head";
  globalThis.XjkSafeHtml.set(
    head,
    `
    <h3>${safeText(title)}</h3>
    <span class="tab-count">${safeText(countLabel, "")}</span>
  `
  );

  section.append(head, body);
  return section;
}

export function renderLiveQueuePanel(targetEl, data, options = {}) {
  targetEl.replaceChildren();

  const summary = document.createElement("div");
  summary.className = "summary-strip live-summary-strip";
  summary.append(
    summaryChip("Records watched", data?.totals?.known_records || 0),
    summaryChip("Maps watched", data?.totals?.known_maps || 0),
    summaryChip("Replay remaining", data?.totals?.replay_remaining || 0),
    summaryChip("Deep remaining", data?.totals?.deep_remaining || 0),
    summaryChip("Replay pending", data?.totals?.replay_pending || 0),
    summaryChip("Deep pending", data?.totals?.deep_pending || 0)
  );
  targetEl.appendChild(summary);

  const grid = document.createElement("div");
  grid.className = "live-grid";

  const primary = document.createElement("div");
  primary.className = "live-primary-stack";

  if (data?.latest_activity) {
    const latestActivityKey = options.activityKeyFor?.(data.latest_activity) || "";
    primary.appendChild(
      renderLatestActivity(data.latest_activity, {
        isFresh: latestActivityKey && latestActivityKey === options.freshActivityKey,
        onOpenRecord: options.onOpenRecord,
        onOpenMap: options.onOpenMap,
        onCopyRecordLink: options.onCopyRecordLink,
      })
    );
  } else {
    primary.appendChild(renderEmptyCard("No activity yet", "Waiting for known public records."));
  }

  const recentFeed = document.createElement("div");
  recentFeed.className = "live-feed-list";
  if (Array.isArray(data?.recent_activity) && data.recent_activity.length) {
    for (const activity of data.recent_activity) {
      const activityKey = options.activityKeyFor?.(activity) || "";
      recentFeed.appendChild(
        renderRecentActivityItem(activity, {
          isFresh: activityKey && activityKey === options.freshActivityKey,
          onOpenRecord: options.onOpenRecord,
          onOpenMap: options.onOpenMap,
        })
      );
    }
  } else {
    recentFeed.appendChild(renderEmptyCard("Recent checks", "No recent public changes yet."));
  }

  const watchlist = document.createElement("div");
  watchlist.className = "live-record-list";
  if (Array.isArray(data?.records) && data.records.length) {
    for (const bundle of data.records) {
      watchlist.appendChild(
        renderWatchlistRow(bundle, {
          onOpenRecord: options.onOpenRecord,
          onOpenMap: options.onOpenMap,
          onCopyRecordLink: options.onCopyRecordLink,
        })
      );
    }
  } else {
    watchlist.appendChild(renderEmptyCard("Watchlist", "No known public records."));
  }
  primary.appendChild(renderSection("Current watchlist", `${data?.records?.length || 0} records`, watchlist));

  const secondary = document.createElement("div");
  secondary.className = "live-secondary-stack";
  secondary.appendChild(renderSection("Recent checks", `${data?.recent_activity?.length || 0} rows`, recentFeed));

  const maps = document.createElement("div");
  maps.className = "live-map-list";
  if (Array.isArray(data?.maps_remaining) && data.maps_remaining.length) {
    for (const group of data.maps_remaining) {
      maps.appendChild(
        renderMapRemainingCard(group, {
          onOpenMap: options.onOpenMap,
          onOpenRecord: options.onOpenRecord,
          onCopyMapLink: options.onCopyMapLink,
        })
      );
    }
  } else {
    maps.appendChild(renderEmptyCard("Maps remaining", "No unresolved maps right now."));
  }
  secondary.appendChild(renderSection("Maps remaining", `${data?.maps_remaining?.length || 0} maps`, maps));

  grid.append(primary, secondary);
  targetEl.appendChild(grid);
}

export function renderLiveQueueMessage(targetEl, title, body) {
  targetEl.replaceChildren();
  targetEl.appendChild(renderEmptyCard(title, body));
}
