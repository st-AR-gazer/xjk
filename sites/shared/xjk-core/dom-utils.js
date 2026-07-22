function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function createTextElement(doc, tagName, { className = "", text } = {}) {
  const element = doc.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text ?? "");
  return element;
}

function replaceWithTextLines(doc, container, lines = []) {
  container.replaceChildren();
  lines.forEach((line, index) => {
    if (index > 0) container.appendChild(doc.createElement("br"));
    container.appendChild(doc.createTextNode(String(line ?? "")));
  });
  return container;
}

function setTextById(id, value, doc = globalThis.document) {
  const element = doc?.getElementById?.(id);
  if (element) element.textContent = String(value ?? "");
  return element || null;
}

function waitForNextPaint(schedule = globalThis.requestAnimationFrame) {
  return new Promise((resolve) => {
    schedule(resolve);
  });
}

function uniqueById(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function uniqueSites(sites = []) {
  return uniqueById(sites);
}

function ensureStylesheetLink(doc, { selector, href, datasetKey } = {}) {
  let link = doc.querySelector(selector);
  if (link) return link;

  link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  if (datasetKey) link.dataset[datasetKey] = "true";
  doc.head.appendChild(link);
  return link;
}

function onStylesheetReady(stylesheet, options = {}) {
  const doc = options.document || stylesheet?.ownerDocument || globalThis.document;
  const view = doc?.defaultView || globalThis;
  const onReady = typeof options.onReady === "function" ? options.onReady : () => {};
  const sentinelTarget = options.sentinelTarget || doc?.documentElement;
  const sentinelProperty = String(options.sentinelProperty || "").trim();
  const fallbackMs = Number.isFinite(options.fallbackMs) ? Math.max(0, options.fallbackMs) : 3000;
  let completed = false;
  let fallbackTimer = null;

  const finish = () => {
    if (completed) return;
    completed = true;
    if (fallbackTimer !== null) view.clearTimeout?.(fallbackTimer);
    onReady();
  };
  const hasSentinel = () =>
    Boolean(
      sentinelProperty &&
        sentinelTarget &&
        view.getComputedStyle?.(sentinelTarget)?.getPropertyValue(sentinelProperty).trim()
    );

  let hasSheet = false;
  try {
    hasSheet = Boolean(stylesheet?.sheet);
  } catch {
    /* Cross-origin stylesheet metadata may be unavailable. */
  }

  if (hasSheet || hasSentinel()) {
    finish();
    return finish;
  }

  stylesheet?.addEventListener?.("load", finish, { once: true });
  stylesheet?.addEventListener?.("error", finish, { once: true });

  const probe = () => {
    if (hasSentinel()) finish();
  };
  view.requestAnimationFrame?.(probe);
  if (typeof view.queueMicrotask === "function") view.queueMicrotask(probe);
  else view.setTimeout?.(probe, 0);

  fallbackTimer = view.setTimeout?.(finish, fallbackMs) ?? null;
  fallbackTimer?.unref?.();
  return finish;
}

function isMacPlatform() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

function shortcutLabel() {
  return isMacPlatform() ? "⌘ K" : "Ctrl K";
}

function safeCssColor(value, fallback = "#e5e7eb") {
  const candidate = String(value || "").trim();
  if (!candidate) return fallback;
  if (globalThis.CSS?.supports?.("color", candidate)) return candidate;
  return fallback;
}

function safeNavigationHref(value, options = {}) {
  const base = options.base || globalThis.location?.href || "http://localhost/";
  const resolveHttpUrl = (input) => {
    const candidate = String(input ?? "").trim();
    if (!candidate) return "";
    try {
      const url = new URL(candidate, base);
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
    } catch {
      return "";
    }
  };

  return resolveHttpUrl(value) || resolveHttpUrl(options.fallback);
}

export {
  createTextElement,
  ensureStylesheetLink,
  escapeAttribute,
  escapeHtml,
  isMacPlatform,
  onStylesheetReady,
  replaceWithTextLines,
  safeCssColor,
  safeNavigationHref,
  setTextById,
  shortcutLabel,
  uniqueById,
  uniqueSites,
  waitForNextPaint,
};
