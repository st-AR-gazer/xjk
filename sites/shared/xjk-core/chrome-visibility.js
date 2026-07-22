/* Optional page-level visibility behavior for the independent shared chrome.
   Both loaders call this module; the binding is idempotent per document. */

import { ensureStylesheetLink } from "./dom-utils.js";

const STYLE_VERSION = "2";
const BINDING_KEY = Symbol.for("xjk.chrome.scrollRevealBinding");

function getChromeVisibilityState(scrollTop, revealOffset = 20) {
  const offset = Number.isFinite(Number(revealOffset)) ? Math.max(0, Number(revealOffset)) : 20;
  return Number(scrollTop) > offset ? "visible" : "hidden";
}

function readScrollTop(doc) {
  const view = doc.defaultView;
  return Math.max(
    Number(view?.scrollY) || 0,
    Number(doc.scrollingElement?.scrollTop) || 0,
    Number(doc.documentElement?.scrollTop) || 0,
    Number(doc.body?.scrollTop) || 0
  );
}

function dispatchHidden(doc) {
  const EventType = doc.defaultView?.CustomEvent || globalThis.CustomEvent;
  if (!EventType) return;
  doc.documentElement.dispatchEvent(new EventType("xjk:chrome-hide"));
}

function mountChromeVisibility(options = {}) {
  const doc = options.document || globalThis.document;
  const chrome = options.config?.chrome || options.chrome || {};
  if (!doc?.documentElement || !doc?.head || !chrome.revealOnScroll) return null;

  ensureStylesheetLink(doc, {
    selector: "link[data-xjk-chrome-visibility-style]",
    href: `/shared/xjk-core/chrome-visibility.css?v=${STYLE_VERSION}`,
    datasetKey: "xjkChromeVisibilityStyle",
  });

  const root = doc.documentElement;
  const revealOffset = Number.isFinite(Number(chrome.revealOffset)) ? Math.max(0, Number(chrome.revealOffset)) : 20;
  const existing = root[BINDING_KEY];
  if (existing) {
    existing.revealOffset = revealOffset;
    existing.sync();
    return existing;
  }

  const view = doc.defaultView || globalThis;
  let frame = 0;
  let state = "";

  const binding = {
    revealOffset,
    sync() {
      const next = getChromeVisibilityState(readScrollTop(doc), binding.revealOffset);
      if (next === state) return next;
      state = next;
      root.dataset.xjkChromeScrollReveal = next;
      if (next === "hidden") dispatchHidden(doc);
      return next;
    },
  };

  const schedule = () => {
    if (frame) return;
    const requestFrame = view.requestAnimationFrame || ((callback) => view.setTimeout(callback, 16));
    frame = requestFrame(() => {
      frame = 0;
      binding.sync();
    });
  };

  root[BINDING_KEY] = binding;
  binding.sync();
  view.addEventListener?.("scroll", schedule, { passive: true });
  view.addEventListener?.("pageshow", schedule);
  return binding;
}

export { getChromeVisibilityState, mountChromeVisibility, readScrollTop };
