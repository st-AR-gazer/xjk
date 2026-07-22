(function initLocalPathRewriter(global) {
  "use strict";

  const DEFAULT_ATTRIBUTE_TARGETS = Object.freeze([
    ["a[href]", "href"],
    ["link[href]", "href"],
    ["img[src]", "src"],
    ["script[src]", "src"],
    ["source[src]", "src"],
    ["form[action]", "action"],
  ]);

  function isLoopbackHostname(hostname) {
    const host = String(hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  }

  function normalizeSitePath(sitePath) {
    const value = String(sitePath || "").replace(/\/+$/, "");
    return value.startsWith("/") && !value.includes("..") ? value : "";
  }

  function detectLocalPrefix(location, sitePath) {
    const prefix = normalizeSitePath(sitePath);
    if (!prefix || !isLoopbackHostname(location?.hostname)) return "";

    const pathname = String(location?.pathname || "/");
    return pathname === prefix || pathname.startsWith(`${prefix}/`) ? prefix : "";
  }

  function isExternalOrFragment(value) {
    return value.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//");
  }

  function createPathResolver(prefix, { shouldSkip = () => false } = {}) {
    const normalizedPrefix = normalizeSitePath(prefix);

    return function resolvePath(input, node = null) {
      const value = String(input || "");
      if (!value || !normalizedPrefix || isExternalOrFragment(value) || !value.startsWith("/")) return value;
      if (shouldSkip(value, node)) return value;
      if (value === normalizedPrefix || value.startsWith(`${normalizedPrefix}/`)) return value;
      return `${normalizedPrefix}${value}`;
    };
  }

  function createLocalPathRuntime({
    sitePath,
    location = global.location,
    document = global.document,
    MutationObserver = global.MutationObserver,
    attributeTargets = DEFAULT_ATTRIBUTE_TARGETS,
    shouldSkip,
  } = {}) {
    const prefix = detectLocalPrefix(location, sitePath);
    const resolvePath = createPathResolver(prefix, { shouldSkip });
    const observedAttributes = [...new Set(attributeTargets.map(([, attribute]) => attribute))];
    let observer = null;

    function rewriteUrlAttribute(node, attribute) {
      if (!attribute) return;
      const current = node?.getAttribute?.(attribute);
      if (!current) return;

      const next = resolvePath(current, node);
      if (next !== current) node.setAttribute(attribute, next);
    }

    function rewriteAttributes(root, selector, attribute) {
      root?.querySelectorAll?.(selector).forEach((node) => rewriteUrlAttribute(node, attribute));
    }

    function rewriteElementTree(node) {
      if (!prefix || !node || node.nodeType !== 1) return;
      attributeTargets.forEach(([selector, attribute]) => {
        if (node.matches?.(selector)) rewriteUrlAttribute(node, attribute);
        rewriteAttributes(node, selector, attribute);
      });
    }

    function rewriteDocument(root = document) {
      if (!prefix || !root?.querySelectorAll) return;
      attributeTargets.forEach(([selector, attribute]) => rewriteAttributes(root, selector, attribute));
    }

    function observeDocument() {
      if (!prefix || !MutationObserver || !document?.documentElement || observer) return observer;

      observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === "attributes") {
            rewriteUrlAttribute(mutation.target, mutation.attributeName);
            return;
          }
          mutation.addedNodes?.forEach(rewriteElementTree);
        });
      });
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: observedAttributes,
      });
      return observer;
    }

    return Object.freeze({
      observeDocument,
      prefix,
      resolvePath,
      rewriteDocument,
      rewriteElementTree,
      rewriteUrlAttribute,
    });
  }

  function runWhenDocumentReady(document, callback) {
    if (document?.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }
    callback();
  }

  async function resolveSiteLink(link, siteId, { location = global.location } = {}) {
    if (!link) return;
    const xjkSite = global.XjkSite || (await import("/shared/xjk-core/site-runtime.js")).XjkSite;
    link.href = xjkSite.resolveSiteHref(siteId, { location });
  }

  global.XjkLocalPaths = Object.freeze({
    DEFAULT_ATTRIBUTE_TARGETS,
    createLocalPathRuntime,
    createPathResolver,
    detectLocalPrefix,
    isLoopbackHostname,
    resolveSiteLink,
    runWhenDocumentReady,
  });
})(window);
