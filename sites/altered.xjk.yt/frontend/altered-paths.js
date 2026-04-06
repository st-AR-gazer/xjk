(function initAlteredPaths(global) {
  const host = String(global.location?.hostname || "").toLowerCase();
  const path = String(global.location?.pathname || "/");
  const isLoopbackHost = host === "localhost" || host === "127.0.0.1";
  const prefix = isLoopbackHost && (path === "/altered" || path.startsWith("/altered/")) ? "/altered" : "";
  const ATTR_TARGETS = [
    ["a[href]", "href"],
    ["link[href]", "href"],
    ["img[src]", "src"],
    ["script[src]", "src"],
    ["source[src]", "src"],
    ["form[action]", "action"],
    ["[data-src]", "data-src"],
  ];

  function alteredUrl(input) {
    const value = String(input || "");
    if (!value) return value;
    if (!prefix) return value;
    if (value.startsWith("#")) return value;
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) return value;
    if (!value.startsWith("/")) return value;
    if (value === prefix || value.startsWith(`${prefix}/`)) return value;
    return `${prefix}${value}`;
  }

  function rewriteUrlAttribute(node, attr) {
    const current = node?.getAttribute?.(attr);
    if (!current) return;
    const next = alteredUrl(current);
    if (next !== current) {
      node.setAttribute(attr, next);
    }
  }

  function rewriteAttributes(root, selector, attr) {
    root.querySelectorAll(selector).forEach((node) => {
      rewriteUrlAttribute(node, attr);
    });
  }

  function rewriteElementTree(node) {
    if (!prefix || !node || node.nodeType !== 1) return;
    ATTR_TARGETS.forEach(([selector, attr]) => {
      if (node.matches?.(selector)) {
        rewriteUrlAttribute(node, attr);
      }
      rewriteAttributes(node, selector, attr);
    });
  }

  function rewriteDomUrls(root = global.document) {
    if (!prefix || !root?.querySelectorAll) return;
    ATTR_TARGETS.forEach(([selector, attr]) => rewriteAttributes(root, selector, attr));
  }

  function observeDomRewrites() {
    if (!prefix || !global.MutationObserver || !global.document?.documentElement) return;

    const observer = new global.MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "attributes" && mutation.target) {
          rewriteUrlAttribute(mutation.target, mutation.attributeName);
          return;
        }

        mutation.addedNodes?.forEach((node) => rewriteElementTree(node));
      });
    });

    observer.observe(global.document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["href", "src", "action", "data-src"],
    });
  }

  global.__alteredLocalPrefix = prefix;
  global.__alteredUrl = alteredUrl;
  global.__rewriteAlteredUrls = rewriteDomUrls;

  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", () => {
      rewriteDomUrls();
      observeDomRewrites();
    }, { once: true });
  } else {
    rewriteDomUrls();
    observeDomRewrites();
  }
})(window);
