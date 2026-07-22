import { escapeHtml } from "./dom-utils.js?v=2";

function renderApiParamRows(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<div class="param-row"><div class="param-name">None</div><div class="param-detail">No entries for this section.</div></div>';
  }

  return items
    .map(
      (item) => `
        <div class="param-row">
          <div class="param-name">${escapeHtml(item.name || "-")}</div>
          <div class="param-detail">
            ${item.value ? `<div><code>${escapeHtml(item.value)}</code></div>` : ""}
            ${escapeHtml(item.description || "No description.")}
            <div style="margin-top:.15rem;">
              ${item.type ? `type=<code>${escapeHtml(item.type)}</code>` : ""}${
                item.required === true ? " | required" : item.required === false ? " | optional" : ""
              }${item.default !== undefined ? ` | default=<code>${escapeHtml(String(item.default))}</code>` : ""}
            </div>
          </div>
        </div>
      `
    )
    .join("");
}

function renderApiRemarks(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<p class="inline-empty">No additional remarks for this endpoint.</p>';
  }
  return `<ul class="note-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

export { renderApiParamRows, renderApiRemarks };
