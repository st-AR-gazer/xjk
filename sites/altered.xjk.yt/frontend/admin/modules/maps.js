import "/shared/xjk-core/safe-html.js?v=2";
import { esc, escN, fmtDateTime, fmtNum, toneClass, toneLabel } from "./formatters.js?v=2";
import { renderNamingMetricCard } from "./naming-ui.js?v=2";
import { renderSimilarityBackfillControls, renderSimilarityBackfillStatus } from "./similarity-progress.js?v=2";
import { syncSelectedAlterationRegexHints, syncSimilarityWeightRegexVisibility } from "./similarity-profile.js?v=2";
import { renderSimilarityWeightsWorkspace } from "./similarity-workspace.js?v=2";
import { el, state } from "./state.js?v=2";
import {
  filterBar,
  loading,
  pagination,
  renderNamingFlags,
  renderNamingSimilarityPreview,
  selOpts,
  subtab,
  tableCard,
} from "./ui.js?v=2";

function namingPresetKey(filters = {}) {
  const reviewState = String(filters.reviewState || "")
    .trim()
    .toLowerCase();
  const automationState = String(filters.automationState || "")
    .trim()
    .toLowerCase();
  const requiresRegex = String(filters.requiresRegex || "")
    .trim()
    .toLowerCase();

  if (!reviewState && !automationState && !requiresRegex) return "all";
  if (reviewState === "pending" && !automationState && !requiresRegex) return "pending";
  if (reviewState === "pending" && automationState === "unmatched" && !requiresRegex) return "unmatched";
  if (reviewState === "pending" && automationState === "matched" && !requiresRegex) return "matched-pending";
  if (reviewState === "pending" && !automationState && requiresRegex === "true") return "regex";
  if (reviewState === "approved" && !automationState && !requiresRegex) return "approved";
  return "";
}

function renderNamingActiveFilterSummary(filters = {}, payload = {}) {
  const chips = [];
  if (filters.q) chips.push(`Search: ${filters.q}`);
  if (filters.automationState) {
    chips.push(`Automation: ${filters.automationState === "matched" ? "Matched" : "Unmatched"}`);
  }
  if (filters.reviewState) {
    chips.push(`Review: ${filters.reviewState.charAt(0).toUpperCase()}${filters.reviewState.slice(1)}`);
  }
  if (filters.requiresRegex === "true") chips.push("Regex Only");
  if (filters.requiresRegex === "false") chips.push("Regex Excluded");
  chips.push(`Rows: ${fmtNum(state.maps.pageSize.naming || payload.pageSize || 10)}`);

  const filteredTotal = Number(payload.total || 0);
  const unfilteredTotal = Number(payload.unfilteredTotal || payload.summary?.total || filteredTotal);
  const summaryLabel =
    filteredTotal !== unfilteredTotal
      ? `${fmtNum(filteredTotal)} of ${fmtNum(unfilteredTotal)} visible`
      : `${fmtNum(filteredTotal)} visible`;

  return `
    <div class="naming-active-filters">
      <span class="naming-active-summary">${esc(summaryLabel)}</span>
      <div class="naming-active-chiplist">
        ${(chips.length ? chips : ["No queue filters applied"]).map((chip) => `<span class="naming-filter-chip">${esc(chip)}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderNamingWorkspaceToolbar(payload, filters) {
  const summary = payload?.summary || {};
  const filteredTotal = Number(payload?.total || 0);
  const unfilteredTotal = Number(payload?.unfilteredTotal || summary.total || filteredTotal);
  const pending = Number(summary.pending || 0);
  const pendingManualReview = Number(summary.pendingManualReview || pending || 0);
  const unmatched = Number(summary.unmatched || 0);
  const pendingMatched = Number(summary.pendingMatched || 0);
  const requiresRegex = Number(summary.requiresRegex || 0);
  const approved = Number(summary.approved || 0);
  const activePreset = namingPresetKey(filters);

  return `
    <section class="naming-workspace-shell">
      <div class="naming-workspace-hero">
        <div>
          <p class="ws-label">Naming Workspace</p>
          <h3>Queue Control Deck</h3>
          <p class="naming-workspace-copy">
            ${esc(filteredTotal !== unfilteredTotal ? `${fmtNum(filteredTotal)} of ${fmtNum(unfilteredTotal)} candidates are visible.` : `${fmtNum(filteredTotal)} candidates are currently visible.`)}
            ${esc(`${fmtNum(pendingManualReview)} likely need human review, ${fmtNum(pendingMatched)} are auto-matched but still pending approval.`)}
          </p>
        </div>
        <div class="naming-workspace-actions">
          <button class="btn outline small" type="button" data-run-naming-process>Rebuild Candidates</button>
          <button class="btn ghost small" type="button" data-open-unmatched-naming>Open Unmatched</button>
          <button class="btn ghost small" type="button" data-reset-maps>Reset Filters</button>
        </div>
      </div>

      <div class="naming-metric-grid">
        ${renderNamingMetricCard({
          label: "Pending Review",
          value: pending,
          note: "Exact pending queue",
          accent: "info",
          preset: "pending",
          active: activePreset === "pending",
        })}
        ${renderNamingMetricCard({
          label: "Needs Human Review",
          value: pendingManualReview,
          note: "Manual-review heuristics",
          accent: "warn",
        })}
        ${renderNamingMetricCard({
          label: "Unmatched",
          value: unmatched,
          note: "No confident automation",
          accent: "warn",
          preset: "unmatched",
          active: activePreset === "unmatched",
        })}
        ${renderNamingMetricCard({
          label: "Regex Flags",
          value: requiresRegex,
          note: "Pattern cleanup bucket",
          accent: "warn",
          preset: "regex",
          active: activePreset === "regex",
        })}
        ${renderNamingMetricCard({
          label: "Matched Pending",
          value: pendingMatched,
          note: "Auto-match awaiting review",
          accent: "success",
          preset: "matched-pending",
          active: activePreset === "matched-pending",
        })}
        ${renderNamingMetricCard({
          label: "Approved",
          value: approved,
          note: "Already cleared",
          accent: "muted",
          preset: "approved",
          active: activePreset === "approved",
        })}
      </div>

      <div class="naming-control-grid">
        <form data-form-kind="maps-filters" class="naming-filter-panel">
          <input type="hidden" name="view" value="naming" />
          <div class="naming-panel-head">
            <div><p class="ws-label">Review Filters</p><h3>Shape the Queue</h3></div>
            <span class="pill tone-info">${esc(filteredTotal !== unfilteredTotal ? "Filtered" : "Live")}</span>
          </div>
          <div class="naming-filter-grid">
            <label class="field">
              <span>Search</span>
              <input name="q" value="${esc(filters.q || "")}" placeholder="Map name, UID, or campaign" />
            </label>
            <label class="field">
              <span>Automation</span>
              <select name="automationState">${selOpts(
                [
                  ["", "All"],
                  ["matched", "Matched"],
                  ["unmatched", "Unmatched"],
                ],
                filters.automationState
              )}</select>
            </label>
            <label class="field">
              <span>Review</span>
              <select name="reviewState">${selOpts(
                [
                  ["", "All"],
                  ["pending", "Pending"],
                  ["approved", "Approved"],
                  ["ignored", "Ignored"],
                ],
                filters.reviewState
              )}</select>
            </label>
            <label class="field">
              <span>Requires Regex</span>
              <select name="requiresRegex">${selOpts(
                [
                  ["", "All"],
                  ["true", "Yes"],
                  ["false", "No"],
                ],
                filters.requiresRegex
              )}</select>
            </label>
            <label class="field">
              <span>Rows</span>
              <select name="pageSize">${selOpts(
                [
                  ["10", "10 / page"],
                  ["25", "25 / page"],
                  ["50", "50 / page"],
                  ["100", "100 / page"],
                ],
                String(state.maps.pageSize.naming || payload.pageSize || 10)
              )}</select>
            </label>
          </div>
          <div class="naming-preset-row">
            <button class="naming-preset-chip ${activePreset === "pending" ? "is-active" : ""}" type="button" data-naming-preset="pending">Pending</button>
            <button class="naming-preset-chip ${activePreset === "unmatched" ? "is-active" : ""}" type="button" data-naming-preset="unmatched">Unmatched</button>
            <button class="naming-preset-chip ${activePreset === "matched-pending" ? "is-active" : ""}" type="button" data-naming-preset="matched-pending">Matched Pending</button>
            <button class="naming-preset-chip ${activePreset === "regex" ? "is-active" : ""}" type="button" data-naming-preset="regex">Regex Only</button>
            <button class="naming-preset-chip ${activePreset === "approved" ? "is-active" : ""}" type="button" data-naming-preset="approved">Approved</button>
            <button class="naming-preset-chip ${activePreset === "all" ? "is-active" : ""}" type="button" data-naming-preset="all">Clear Queue Filters</button>
          </div>
          ${renderNamingActiveFilterSummary(filters, payload)}
          <div class="naming-panel-actions">
            <button class="btn primary small" type="submit">Apply Filters</button>
            <button class="btn ghost small" type="button" data-reset-maps>Reset</button>
          </div>
        </form>

        <div class="naming-ops-panel">
          <div class="naming-panel-head">
            <div><p class="ws-label">Bulk Operations</p><h3>Similarity Tools</h3></div>
            <span class="pill tone-warn">${esc(fmtNum(unmatched))} unmatched</span>
          </div>
          <p class="naming-panel-copy">
            Choose a source, then optionally a container type like Spring 2020, Training, or Snow Discovery
            to rerun similarity for just that slice. Use the full rescan when the broader catalog has changed.
          </p>
          ${renderSimilarityBackfillControls({
            buttonLabel: "Run Scoped Similarity",
            buttonClass: "btn danger small",
            variant: "workspace",
          })}
        </div>
      </div>

      <div data-similarity-backfill-status-full>${renderSimilarityBackfillStatus()}</div>
    </section>
  `;
}

export function renderMaps() {
  const p = state.maps.data;
  if (!p) {
    globalThis.XjkSafeHtml.set(el.wsMaps, loading("Loading maps..."));
    return;
  }
  const v = state.maps.view;
  const f = state.maps.filters[v] || {};
  const rows = Array.isArray(p.rows) ? p.rows : [];

  if (v === "weights") {
    globalThis.XjkSafeHtml.set(
      el.wsMaps,
      `
      <nav class="subtabs">
        ${subtab("inventory", "Inventory", v)}
        ${subtab("campaigns", "Campaigns", v)}
        ${subtab("naming", "Naming", v)}
        ${subtab("weights", "Similarity Weights", v)}
        ${subtab("requests", "Requests", v)}
      </nav>
      ${renderSimilarityWeightsWorkspace(p)}
    `
    );
    syncSelectedAlterationRegexHints(el.wsMaps);
    syncSimilarityWeightRegexVisibility(el.wsMaps);
    return;
  }

  globalThis.XjkSafeHtml.set(
    el.wsMaps,
    `
    <nav class="subtabs">
      ${subtab("inventory", "Inventory", v)}
      ${subtab("campaigns", "Campaigns", v)}
      ${subtab("naming", "Naming", v)}
      ${subtab("weights", "Similarity Weights", v)}
      ${subtab("requests", "Requests", v)}
    </nav>
    ${mapsToolbar(v, p, f)}
    ${mapsTable(v, p, rows)}
    ${pagination({
      page: p.page || 1,
      pageCount: p.pageCount || 1,
      total: p.total || 0,
      unfilteredTotal: p.unfilteredTotal,
      hasMore: Boolean(p.hasMore),
      prevAction: "maps-prev-page",
      nextAction: "maps-next-page",
    })}
  `
  );
}

function mapsToolbar(v, p, f) {
  if (v === "inventory") {
    const camps = Array.isArray(p.filterOptions?.campaigns) ? p.filterOptions.campaigns : [];
    return filterBar(
      "maps-filters",
      `
      <input type="hidden" name="view" value="inventory" />
      <div class="filter-fields">
        <label class="field"><span>Search</span><input name="q" value="${esc(f.q || "")}" placeholder="Name or UID" /></label>
        <label class="field"><span>Campaign</span>
          <select name="campaign"><option value="">All</option>${camps.map((c) => `<option value="${esc(c.name)}" ${c.name === f.campaign ? "selected" : ""}>${escN(c.name)}</option>`).join("")}</select>
        </label>
        <label class="field"><span>Tracked</span><select name="tracked">${selOpts(
          [
            ["", "All"],
            ["true", "Tracked"],
            ["false", "Not tracked"],
          ],
          f.tracked
        )}</select></label>
        <label class="field"><span>Status</span><select name="status">${selOpts(
          [
            ["", "All"],
            ["live", "Live"],
            ["paused", "Paused"],
            ["archived", "Archived"],
          ],
          f.status
        )}</select></label>
        <label class="field"><span>Freshness</span><select name="staleState">${selOpts(
          [
            ["", "All"],
            ["fresh", "Fresh"],
            ["stale", "Stale"],
          ],
          f.staleState
        )}</select></label>
      </div>
    `,
      `<button class="btn primary small" type="submit">Apply</button><button class="btn ghost small" type="button" data-reset-maps>Reset</button>`
    );
  }
  if (v === "naming") {
    return renderNamingWorkspaceToolbar(p, f);
  }
  if (v === "requests") {
    return filterBar(
      "maps-filters",
      `
      <input type="hidden" name="view" value="requests" />
      <div class="filter-fields" style="grid-template-columns:repeat(2,minmax(0,1fr));">
        <label class="field"><span>Search</span><input name="q" value="${esc(f.q || "")}" placeholder="Name or UID" /></label>
        <label class="field"><span>Status</span><select name="status">${selOpts(
          [
            ["", "All"],
            ["queued", "Queued"],
            ["processing", "Processing"],
            ["done", "Done"],
            ["rejected", "Rejected"],
          ],
          f.status
        )}</select></label>
      </div>
    `,
      `<button class="btn primary small" type="submit">Apply</button><button class="btn ghost small" type="button" data-reset-maps>Reset</button>`
    );
  }
  return "";
}

function mapsTable(v, p, rows) {
  if (v === "inventory") {
    return tableCard(
      "Inventory",
      `${fmtNum(p.total || 0)} maps`,
      `
      <table class="data-table">
        <thead><tr><th>Map</th><th>Campaign</th><th>Slot</th><th>Tracked</th><th>Freshness</th><th>Checked</th><th>Last WR</th><th></th></tr></thead>
        <tbody>
          ${
            rows
              .map(
                (r) => `<tr>
            <td><div class="cell-name"><strong>${escN(r.mapName)}</strong></div><div class="cell-uid">${esc(r.mapUid)}</div></td>
            <td>${escN(r.campaignName || "Unassigned")}</td>
            <td>${esc(String(r.slot || "-"))}</td>
            <td><span class="pill ${r.tracked ? "tone-success" : "tone-muted"}">${r.tracked ? "Tracked" : "Idle"}</span></td>
            <td><span class="pill ${toneClass(r.staleState)}">${esc(toneLabel(r.staleState))}</span></td>
            <td>${esc(fmtDateTime(r.lastCheckedAt))}</td>
            <td>${esc(fmtDateTime(r.lastWrChangeAt))}</td>
            <td><div class="cell-actions">
              <button class="btn outline small" type="button" data-open-map-uid="${esc(r.mapUid)}">Open</button>
              <button class="btn ghost small" type="button" data-map-command="${r.tracked ? "pause" : "track"}" data-map-uid="${esc(r.mapUid)}">${r.tracked ? "Pause" : "Track"}</button>
            </div></td>
          </tr>`
              )
              .join("") ||
            `<tr><td colspan="8"><p class="inline-empty">No maps match the current filters.</p></td></tr>`
          }
        </tbody>
      </table>`
    );
  }
  if (v === "campaigns") {
    return tableCard(
      "Campaigns",
      `${fmtNum(p.total || 0)} campaigns`,
      `
      <table class="data-table">
        <thead><tr><th>Campaign</th><th>Season</th><th>Maps</th><th></th></tr></thead>
        <tbody>
          ${
            rows
              .map(
                (r) => `<tr>
            <td><strong>${escN(r.name || "-")}</strong></td>
            <td>${escN(r.season || "-")}</td>
            <td>${esc(fmtNum(r.map_count || 0))}</td>
            <td><button class="btn outline small" type="button" data-open-campaign="${esc(r.name || "")}">View Maps</button></td>
          </tr>`
              )
              .join("") || `<tr><td colspan="4"><p class="inline-empty">No campaigns.</p></td></tr>`
          }
        </tbody>
      </table>`
    );
  }
  if (v === "naming") {
    const needsReview = Number(p.summary?.pendingManualReview || p.summary?.pending || 0);
    const pendingMatched = Number(p.summary?.pendingMatched || 0);
    const unfilteredTotal = Number(p.unfilteredTotal || p.summary?.total || p.total || 0);
    const isFiltered = p.total !== unfilteredTotal;
    const subtitle = isFiltered
      ? `Showing ${fmtNum(p.total || 0)} of ${fmtNum(unfilteredTotal)} &middot; ${fmtNum(needsReview)} need review`
      : `${fmtNum(p.total || 0)} candidates &middot; ${fmtNum(needsReview)} need review`;
    return tableCard(
      "Naming Review",
      subtitle,
      `
      <table class="data-table">
        <thead><tr><th>Flags</th><th>Map Name</th><th>Campaign</th><th>Similarity</th><th>Auto</th><th>Review</th><th>Regex</th><th></th></tr></thead>
        <tbody>
          ${
            rows
              .map((r) => {
                return `<tr>
            <td>${renderNamingFlags(r)}</td>
            <td><div class="cell-name"><strong>${escN(r.finalName || r.proposedName || r.sanitizedName || r.originalName || r.mapUid)}</strong></div><div class="cell-subline">${escN(r.originalName || "-")}</div></td>
            <td><div class="cell-name"><strong>${escN(r.campaign || "Unassigned")}</strong></div><div class="cell-subline">slot ${esc(String(r.slot || "-"))}</div></td>
            <td>${renderNamingSimilarityPreview(r)}</td>
            <td><span class="pill ${r.automationState === "matched" ? "tone-success" : "tone-warn"}">${esc(r.automationState || "unknown")}</span></td>
            <td><span class="pill ${toneClass(r.reviewState)}">${esc(r.reviewState || "pending")}</span></td>
            <td><span class="pill ${r.requiresRegex ? "tone-warn" : "tone-success"}">${r.requiresRegex ? "Yes" : "No"}</span></td>
            <td><div class="cell-actions">
              <button class="btn outline small" type="button" data-candidate-detail="${esc(r.mapUid)}">Details</button>
              <button class="btn primary small" type="button" data-candidate-review="approved" data-map-uid="${esc(r.mapUid)}">Approve</button>
              <button class="btn ghost small" type="button" data-candidate-review="ignored" data-map-uid="${esc(r.mapUid)}">Ignore</button>
              <button class="btn outline small" type="button" data-candidate-manual="${esc(r.mapUid)}">Manual</button>
            </div></td>
          </tr>`;
              })
              .join("") || `<tr><td colspan="8"><p class="inline-empty">No naming candidates.</p></td></tr>`
          }
        </tbody>
      </table>
      <div style="margin-top:.45rem;font-size:.78rem;color:var(--a-muted);">
        ${esc(`${fmtNum(needsReview)} need manual review`)}
        ${pendingMatched > 0 ? ` &middot; ${esc(`${fmtNum(pendingMatched)} matched but still pending`)}` : ""}
      </div>`
    );
  }
  return tableCard(
    "Update Requests",
    `${fmtNum(p.total || 0)} requests`,
    `
    <table class="data-table">
      <thead><tr><th>Map</th><th>Status</th><th>Reason</th><th>Requested</th><th></th></tr></thead>
      <tbody>
        ${
          rows
            .map(
              (r) => `<tr>
          <td><div class="cell-name"><strong>${escN(r.name || r.mapName || r.uid || r.mapUid || "-")}</strong></div><div class="cell-uid">${esc(r.uid || r.mapUid || "-")}</div></td>
          <td><span class="pill ${toneClass(r.status)}">${esc(r.status || "queued")}</span></td>
          <td>${esc(r.reason || "-")}</td>
          <td>${esc(fmtDateTime(r.createdAt || r.requestedAt))}</td>
          <td><div class="cell-actions">
            <button class="btn outline small" type="button" data-request-status="processing" data-request-id="${esc(String(r.requestId || r.id || 0))}">Processing</button>
            <button class="btn primary small" type="button" data-request-status="done" data-request-id="${esc(String(r.requestId || r.id || 0))}">Done</button>
            <button class="btn danger small" type="button" data-request-status="rejected" data-request-id="${esc(String(r.requestId || r.id || 0))}">Reject</button>
          </div></td>
        </tr>`
            )
            .join("") || `<tr><td colspan="5"><p class="inline-empty">No update requests.</p></td></tr>`
        }
      </tbody>
    </table>`
  );
}
