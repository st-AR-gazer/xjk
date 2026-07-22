import "/shared/xjk-core/safe-html.js?v=2";
import { elements } from "./dom.js";
import { textOrFallback } from "./format.js";
import { apiUrl } from "./routes.js";
import { escapeHtml } from "/shared/xjk-core/dom-utils.js";

export function setStatus(message) {
  elements.status.textContent = message || "";
}

export function setError(message) {
  elements.error.textContent = message || "";
}

export function copyText(text, successMessage) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => setStatus(successMessage),
      () => setStatus(text)
    );
    return;
  }

  setStatus(text);
}

export function safeText(value, fallback = "Not available") {
  return escapeHtml(textOrFallback(value, fallback));
}

export function makeActionButton(label, handler) {
  const button = document.createElement("button");
  button.className = "secondary-btn";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

export function setSubmissionStatus(message, tone = "neutral") {
  elements.submissionStatus.textContent = message || "";
  elements.submissionStatus.dataset.tone = tone || "neutral";
}

export function showOverlay(message) {
  elements.overlayText.textContent = message || "Loading Validifier data...";
  elements.overlay.classList.remove("hidden");
}

export function hideOverlay() {
  elements.overlay.classList.add("hidden");
}

export function setBusyState(isBusy) {
  elements.recordSubmit.disabled = isBusy;
  elements.mapSubmit.disabled = isBusy;
  elements.mapUploadButton.disabled = isBusy;
  elements.replayUploadButton.disabled = isBusy;
  elements.submissionSubmitButton.disabled = isBusy;
  elements.submissionPollButton.disabled = isBusy;
}

export function resetMessages() {
  setStatus("");
  setError("");
}

export function clearResults() {
  elements.recordResult.classList.add("hidden");
  elements.mapResult.classList.add("hidden");
  elements.submissionResult.classList.add("hidden");
  elements.recordEmptyState.classList.remove("hidden");
  elements.mapEmptyState.classList.remove("hidden");
  elements.recordResult.replaceChildren();
  elements.mapResult.replaceChildren();
  elements.submissionResult.replaceChildren();
}

export function showOnly(sectionEl) {
  if (sectionEl === elements.recordResult) {
    elements.recordEmptyState.classList.add("hidden");
  }
  if (sectionEl === elements.mapResult) {
    elements.mapEmptyState.classList.add("hidden");
  }
  sectionEl.classList.remove("hidden");
}

export function setInitialState() {
  clearResults();
}

export function statusClass(status) {
  return `pill pill-${status || "unavailable"}`;
}

export function trackCardClass(status) {
  return `track-card track-${status || "unavailable"}`;
}

export function metaCard(label, value) {
  const card = document.createElement("div");
  card.className = "meta-card";
  globalThis.XjkSafeHtml.set(
    card,
    `<div class="meta-label">${escapeHtml(label)}</div>` +
      `<div class="meta-value">${escapeHtml(textOrFallback(value))}</div>`
  );
  return card;
}

export function trackMetaCard(label, value) {
  const card = document.createElement("div");
  card.className = "track-meta-card";
  globalThis.XjkSafeHtml.set(
    card,
    `<div class="track-meta-label">${escapeHtml(label)}</div>` +
      `<div class="track-meta-value">${escapeHtml(textOrFallback(value))}</div>`
  );
  return card;
}

export function createApiButton(label, href) {
  const link = document.createElement("a");
  link.className = "secondary-btn";
  link.href = apiUrl(href);
  link.textContent = label;
  return link;
}

export function summaryChip(label, value) {
  const chip = document.createElement("div");
  chip.className = "summary-chip";
  globalThis.XjkSafeHtml.set(
    chip,
    `<div class="summary-chip-label">${escapeHtml(label)}</div>` +
      `<div class="summary-chip-value">${escapeHtml(String(value || 0))}</div>`
  );
  return chip;
}

export function recordRowMeta(label, value) {
  const card = document.createElement("div");
  card.className = "record-row-meta-card";
  globalThis.XjkSafeHtml.set(
    card,
    `<div class="record-row-meta-label">${escapeHtml(label)}</div>` +
      `<div class="record-row-meta-value">${escapeHtml(textOrFallback(value))}</div>`
  );
  return card;
}
