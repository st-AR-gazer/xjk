import { esc, fmtNum } from "./formatters.js?v=2";

export function renderNamingMetricCard({ label, value, note = "", accent = "info", preset = "", active = false } = {}) {
  const className = `naming-metric-card accent-${esc(accent)}${active ? " is-active" : ""}${preset ? " is-action" : ""}`;
  const valueMarkup = `<strong class="naming-metric-value">${esc(fmtNum(Number(value || 0) || 0))}</strong>`;
  const noteMarkup = note ? `<span class="naming-metric-note">${esc(note)}</span>` : "";

  if (preset) {
    return `<button class="${className}" type="button" data-naming-preset="${esc(preset)}">
      <span class="naming-metric-label">${esc(label)}</span>
      ${valueMarkup}
      ${noteMarkup}
    </button>`;
  }

  return `<div class="${className}">
    <span class="naming-metric-label">${esc(label)}</span>
    ${valueMarkup}
    ${noteMarkup}
  </div>`;
}
