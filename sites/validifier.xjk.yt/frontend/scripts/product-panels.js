import "/shared/xjk-core/safe-html.js?v=2";
import { elements } from "./dom.js";
import { clearRecentEntries, listRecentEntries } from "./recent-history.js";
import { absoluteUrlForPath } from "./routes.js";
import { formatTimestamp, textOrFallback } from "./format.js";
import { copyText, setStatus } from "./ui.js";
import { escapeHtml, safeNavigationHref } from "/shared/xjk-core/dom-utils.js";

export function renderRecentHistoryPanel() {
  const entries = listRecentEntries();
  elements.recentHistoryList.replaceChildren();

  if (!entries.length) {
    elements.recentHistoryEmpty.classList.remove("hidden");
    elements.recentHistoryList.classList.add("hidden");
    return;
  }

  elements.recentHistoryEmpty.classList.add("hidden");
  elements.recentHistoryList.classList.remove("hidden");

  for (const entry of entries) {
    const href = safeNavigationHref(entry.href, { base: window.location.href });
    if (!href) continue;
    const item = document.createElement("a");
    item.className = "recent-history-item";
    item.href = href;
    globalThis.XjkSafeHtml.set(
      item,
      `
      <div class="recent-history-head">
        <span class="track-label">${escapeHtml(textOrFallback(entry.type, "lookup"))}</span>
        <span class="recent-history-time">${escapeHtml(formatTimestamp(entry.updatedAt))}</span>
      </div>
      <h3 class="track-headline">${escapeHtml(textOrFallback(entry.label))}</h3>
      <p class="track-detail">${escapeHtml(textOrFallback(entry.meta, entry.summary || "Recent Validifier view"))}</p>
      ${entry.summary ? `<p class="recent-history-summary">${escapeHtml(textOrFallback(entry.summary))}</p>` : ""}
    `
    );
    elements.recentHistoryList.appendChild(item);
  }
}

export function bindProductPanels() {
  elements.copyApiRootButton?.addEventListener("click", () => {
    copyText(absoluteUrlForPath("/api/v1"), "API root copied.");
  });

  elements.clearRecentButton?.addEventListener("click", () => {
    clearRecentEntries();
    renderRecentHistoryPanel();
    setStatus("Recent Validifier history cleared.");
  });
}
