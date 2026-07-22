(function initValidifierPaths(global) {
  "use strict";

  const localPaths = global.XjkLocalPaths;
  if (!localPaths) throw new Error("The shared local-path runtime must load before validifier-paths.js.");

  const runtime = localPaths.createLocalPathRuntime({
    sitePath: "/validifier",
    shouldSkip(value) {
      return (
        value === "/shared/xjk-core" ||
        value.startsWith("/shared/xjk-core/") ||
        value === "/shared/xjk-workspace" ||
        value.startsWith("/shared/xjk-workspace/")
      );
    },
  });

  global.__validifierLocalPrefix = runtime.prefix;
  global.__validifierUrl = runtime.resolvePath;
  global.__rewriteValidifierUrls = runtime.rewriteDocument;

  localPaths.runWhenDocumentReady(global.document, () => {
    runtime.rewriteDocument();
    runtime.observeDocument();
    const homeLink = global.document?.querySelector?.("[data-validifier-home-link]");
    localPaths.resolveSiteLink(homeLink, "xjk").catch(() => {});
  });
})(window);
