(function () {
  "use strict";

  const ready = window.XjkSite
    ? Promise.resolve(window.XjkSite)
    : import("/shared/xjk-core/site-runtime.js").then(function (module) {
        return module.XjkSite;
      });

  ready
    .then(function (xjkSite) {
      xjkSite.applySiteDataLinks(document, { location: window.location });
    })
    .catch(function () {});
})();
