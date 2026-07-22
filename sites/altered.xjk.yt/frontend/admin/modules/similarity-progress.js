import "/shared/xjk-core/safe-html.js?v=2";
import { NAMING_SIMILARITY_SEASON_OPTIONS, NAMING_SIMILARITY_SOURCE_OPTIONS } from "./constants.js?v=2";
import { esc } from "./formatters.js?v=2";
import { renderSimilarityDiagnostics } from "./request-client.js?v=2";
import { renderSimilarityBackfillStatusMarkup } from "./similarity-status-renderer.js?v=2";
import {
  getCampaignOptionsForSource,
  getNamingSimilarityScopeError,
  getSeasonalYearOptions,
  getTotdDayOptions,
  getTotdMonthOptions,
  getTotdYearOptions,
  getWeeklyWeekOptions,
  getWeeklyYearOptions,
  isSimilarityBackfillEffectivelyRunning,
  optionListHasValue,
} from "./similarity-scope.js?v=2";
import { state } from "./state.js?v=2";
import { getAllClubs, selOpts } from "./ui.js?v=2";

export function rerenderSimilarityBackfillSurfaces() {
  rerenderNamingSimilarityControlSurfaces();
  document.querySelectorAll("[data-run-naming-similarity]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    const baseLabel = button.getAttribute("data-similarity-button-label") || "Similarity Backfill";
    button.textContent = getSimilarityBackfillButtonLabel(baseLabel);
    button.disabled = isSimilarityBackfillRunning();
  });

  const compactStatus = document.querySelector("[data-similarity-backfill-status-compact]");
  if (compactStatus instanceof HTMLElement) {
    globalThis.XjkSafeHtml.set(compactStatus, renderSimilarityBackfillStatus({ compact: true }));
  }

  const fullStatus = document.querySelector("[data-similarity-backfill-status-full]");
  if (fullStatus instanceof HTMLElement) {
    globalThis.XjkSafeHtml.set(fullStatus, renderSimilarityBackfillStatus());
  }
}

export function rerenderNamingSimilarityControlSurfaces() {
  document.querySelectorAll("[data-naming-similarity-controls]").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const variant = node.getAttribute("data-naming-similarity-variant") || "compact";
    const buttonLabel = node.getAttribute("data-naming-similarity-button-label") || "Run Similarity";
    const buttonClass = node.getAttribute("data-naming-similarity-button-class") || "btn outline small";
    const template = document.createElement("template");
    globalThis.XjkSafeHtml.set(template, renderSimilarityBackfillControls({ variant, buttonLabel, buttonClass }));
    const replacement = template.content.firstElementChild;
    if (replacement) node.replaceWith(replacement);
  });
}

export function isSimilarityBackfillRunning() {
  return isSimilarityBackfillEffectivelyRunning();
}

export function getSimilarityBackfillButtonLabel(baseLabel = "Similarity Backfill") {
  if (!isSimilarityBackfillRunning()) return baseLabel;
  const percent = Math.max(0, Math.min(100, Number(state.similarityBackfill?.progress?.percent || 0)));
  return percent > 0 ? `Similarity ${percent}%` : "Similarity Running...";
}

function renderSimilarityBackfillButton(
  baseLabel = "Similarity Backfill",
  className = "btn outline small",
  { rescanAll = false } = {}
) {
  const mode = rescanAll ? "rescan-all" : "incremental";
  return `<button class="${esc(className)}" type="button" data-run-naming-similarity="${esc(mode)}" data-similarity-button-label="${esc(baseLabel)}" ${isSimilarityBackfillRunning() ? "disabled" : ""}>${esc(getSimilarityBackfillButtonLabel(baseLabel))}</button>`;
}

export function renderSimilarityBackfillControls({
  buttonLabel = "Run Similarity",
  buttonClass = "btn outline small",
  variant = "compact",
} = {}) {
  const seenClubIds = new Set();
  const clubOptions = [["", "All Clubs"]];
  getAllClubs().forEach((club) => {
    const clubId = String(club?.clubId || "").trim();
    if (!clubId || seenClubIds.has(clubId)) return;
    seenClubIds.add(clubId);
    clubOptions.push([clubId, club?.clubName || `Club ${clubId}`]);
  });
  const campaignOptions = getCampaignOptionsForSource(state.namingSimilaritySourceKey || "");
  const selectedCampaignName = campaignOptions.some(
    ([value]) => String(value) === String(state.namingSimilarityCampaignName || "")
  )
    ? String(state.namingSimilarityCampaignName || "")
    : "";
  const sourceLabel =
    NAMING_SIMILARITY_SOURCE_OPTIONS.find(
      ([value]) => String(value) === String(state.namingSimilaritySourceKey || "")
    )?.[1] || "All Sources";
  const clubLabel =
    clubOptions.find(([value]) => String(value) === String(state.namingSimilarityClubId || ""))?.[1] || "All Clubs";
  const normalizedSourceKey = String(state.namingSimilaritySourceKey || "")
    .trim()
    .toLowerCase();
  const scopeError = getNamingSimilarityScopeError();
  const scopedRunDisabled = isSimilarityBackfillRunning() || Boolean(scopeError);
  const scopeSummary = [
    sourceLabel,
    selectedCampaignName || "All Containers",
    clubLabel,
    state.namingSimilarityPendingOnly ? "Pending only" : "All review states",
    state.namingSimilarityForce ? "Force recompute" : "Changed-only refresh",
  ].join(" Â· ");

  if (variant === "workspace") {
    let sourceSpecificFieldsMarkup = `
      <label class="field">
        <span>Container Type</span>
        <select data-naming-similarity-campaign-name>
          ${selOpts(campaignOptions, selectedCampaignName)}
        </select>
      </label>
    `;

    if (normalizedSourceKey === "official-seasonal-v2") {
      sourceSpecificFieldsMarkup = `
        <label class="field">
          <span>Season</span>
          <select data-naming-similarity-season>
            ${selOpts(NAMING_SIMILARITY_SEASON_OPTIONS, state.namingSimilaritySeason || "")}
          </select>
        </label>
        <label class="field">
          <span>Year</span>
          <select data-naming-similarity-year>
            ${selOpts(getSeasonalYearOptions(), state.namingSimilarityYear || "")}
          </select>
        </label>
      `;
    } else if (normalizedSourceKey === "official-totd") {
      sourceSpecificFieldsMarkup = `
        <label class="field">
          <span>Year</span>
          <select data-naming-similarity-year>
            ${selOpts(getTotdYearOptions(), state.namingSimilarityYear || "")}
          </select>
        </label>
        <label class="field">
          <span>Month</span>
          <select data-naming-similarity-month>
            ${selOpts(getTotdMonthOptions(state.namingSimilarityYear || ""), state.namingSimilarityMonth || "")}
          </select>
        </label>
        <label class="field">
          <span>Day</span>
          <select data-naming-similarity-day>
            ${selOpts(getTotdDayOptions(state.namingSimilarityYear || "", state.namingSimilarityMonth || ""), state.namingSimilarityDay || "")}
          </select>
        </label>
      `;
    } else if (normalizedSourceKey === "weekly-shorts" || normalizedSourceKey === "weekly-grands") {
      const weeklyWeekOptions = getWeeklyWeekOptions(normalizedSourceKey, state.namingSimilarityYear || "");
      const renderedWeeklyWeekOptions = optionListHasValue(weeklyWeekOptions, state.namingSimilarityWeek || "")
        ? weeklyWeekOptions
        : [
            [String(state.namingSimilarityWeek || ""), `Invalid week ${state.namingSimilarityWeek || ""}`],
            ...weeklyWeekOptions,
          ];
      sourceSpecificFieldsMarkup = `
        <label class="field">
          <span>Year</span>
          <select data-naming-similarity-year>
            ${selOpts(getWeeklyYearOptions(normalizedSourceKey), state.namingSimilarityYear || "")}
          </select>
        </label>
        <label class="field">
          <span>Week</span>
          <select data-naming-similarity-week>
            ${selOpts(renderedWeeklyWeekOptions, state.namingSimilarityWeek || "")}
          </select>
        </label>
      `;
    }

    return `
      <div
        class="naming-similarity-panel"
        data-naming-similarity-controls
        data-naming-similarity-variant="${esc(variant)}"
        data-naming-similarity-button-label="${esc(buttonLabel)}"
        data-naming-similarity-button-class="${esc(buttonClass)}"
      >
        <div class="naming-similarity-grid">
          <label class="field">
            <span>Source</span>
            <select data-naming-similarity-source>
              ${selOpts(NAMING_SIMILARITY_SOURCE_OPTIONS, state.namingSimilaritySourceKey || "")}
            </select>
          </label>
          ${sourceSpecificFieldsMarkup}
          <label class="field">
            <span>Club</span>
            <select data-naming-similarity-club>
              ${selOpts(clubOptions, state.namingSimilarityClubId || "")}
            </select>
          </label>
          <div class="field check naming-inline-check">
            <span>Pending Only</span>
            <input type="checkbox" data-naming-similarity-pending-only ${state.namingSimilarityPendingOnly ? "checked" : ""} />
          </div>
          <div class="field check naming-inline-check">
            <span>Force Recompute</span>
            <input type="checkbox" data-naming-similarity-force ${state.namingSimilarityForce ? "checked" : ""} />
          </div>
        </div>
        <div class="naming-similarity-footer">
          <div class="naming-similarity-scope">${esc(scopeSummary)}</div>
          <div class="naming-similarity-actions">
            <button
              class="${esc(buttonClass)}"
              type="button"
              data-run-naming-similarity="selected-source"
              data-similarity-button-label="${esc(buttonLabel)}"
              ${scopedRunDisabled ? "disabled" : ""}
            >${esc(getSimilarityBackfillButtonLabel(buttonLabel))}</button>
            ${renderSimilarityBackfillButton("Full Similarity Rescan", "btn outline small", { rescanAll: true })}
            ${
              isSimilarityBackfillRunning()
                ? `<button class="btn outline small" type="button" data-cancel-naming-similarity>Cancel</button>`
                : ""
            }
          </div>
        </div>
        ${scopeError ? `<p class="naming-similarity-error">${esc(scopeError)}</p>` : ""}
      </div>
    `;
  }

  return `
    <div
      data-naming-similarity-controls
      data-naming-similarity-variant="${esc(variant)}"
      data-naming-similarity-button-label="${esc(buttonLabel)}"
      data-naming-similarity-button-class="${esc(buttonClass)}"
      style="display:contents;"
    >
      <label class="similarity-source-picker">
        <span>Source</span>
        <select data-naming-similarity-source>
          ${selOpts(NAMING_SIMILARITY_SOURCE_OPTIONS, state.namingSimilaritySourceKey || "")}
        </select>
      </label>
      <label class="similarity-source-picker">
        <span>Club</span>
        <select data-naming-similarity-club>
          ${selOpts(clubOptions, state.namingSimilarityClubId || "")}
        </select>
      </label>
      <label class="similarity-source-picker">
        <span>Container</span>
        <select data-naming-similarity-campaign-name>
          ${selOpts(campaignOptions, selectedCampaignName)}
        </select>
      </label>
      <label class="similarity-source-picker">
        <span>Scope</span>
        <span style="display:flex;align-items:center;gap:.45rem;padding:.65rem .9rem;border:1px solid rgba(120,180,255,.18);border-radius:999px;background:rgba(8,14,24,.65);">
          <input type="checkbox" data-naming-similarity-pending-only ${state.namingSimilarityPendingOnly ? "checked" : ""} />
          <span style="font-size:.78rem;">Pending only</span>
        </span>
      </label>
      <label class="similarity-source-picker">
        <span>Mode</span>
        <span style="display:flex;align-items:center;gap:.45rem;padding:.65rem .9rem;border:1px solid rgba(120,180,255,.18);border-radius:999px;background:rgba(8,14,24,.65);">
          <input type="checkbox" data-naming-similarity-force ${state.namingSimilarityForce ? "checked" : ""} />
          <span style="font-size:.78rem;">Force recompute</span>
        </span>
      </label>
      <button
        class="${esc(buttonClass)}"
        type="button"
        data-run-naming-similarity="selected-source"
        data-similarity-button-label="${esc(buttonLabel)}"
        ${isSimilarityBackfillRunning() ? "disabled" : ""}
      >${esc(getSimilarityBackfillButtonLabel(buttonLabel))}</button>
      ${
        isSimilarityBackfillRunning()
          ? `<button class="btn outline small" type="button" data-cancel-naming-similarity>Cancel</button>`
          : ""
      }
    </div>
  `;
}

export function renderSimilarityBackfillStatus({ compact = false } = {}) {
  return renderSimilarityBackfillStatusMarkup(state.similarityBackfill, {
    compact,
    isRunning: isSimilarityBackfillEffectivelyRunning,
    renderDiagnostics: renderSimilarityDiagnostics,
  });
}
