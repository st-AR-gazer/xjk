(function initAlteredPaths(global) {
  "use strict";

  const localPaths = global.XjkLocalPaths;
  if (!localPaths) throw new Error("The shared local-path runtime must load before altered-paths.js.");

  const runtime = localPaths.createLocalPathRuntime({
    sitePath: "/altered",
    attributeTargets: [...localPaths.DEFAULT_ATTRIBUTE_TARGETS, ["[data-src]", "data-src"]],
    shouldSkip(value, node) {
      return node?.matches?.("[data-xjk-site-link]") || value.startsWith("/shared/");
    },
  });

  global.__alteredLocalPrefix = runtime.prefix;
  global.__alteredUrl = runtime.resolvePath;
  global.__rewriteAlteredUrls = runtime.rewriteDocument;

  function ensureXjkHomeLink() {
    const nav = global.document?.querySelector?.(".site-nav");
    const brand = nav?.querySelector?.(".site-nav-brand");
    if (!nav || !brand || nav.querySelector(".site-nav-home")) return;

    const link = global.document.createElement("a");
    link.className = "site-nav-home";
    link.href = "https://xjk.yt/";
    link.setAttribute("aria-label", "Go to xjk main hub");

    const logo = global.document.createElement("img");
    logo.className = "site-nav-home-logo";
    logo.src = runtime.resolvePath("/assets/xjk.svg");
    logo.alt = "";
    logo.decoding = "async";
    link.appendChild(logo);
    nav.insertBefore(link, brand);

    localPaths.resolveSiteLink(link, "xjk").catch(() => {});
  }

  localPaths.runWhenDocumentReady(global.document, () => {
    runtime.rewriteDocument();
    ensureXjkHomeLink();
    runtime.observeDocument();
  });
})(window);
