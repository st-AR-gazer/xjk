(function () {
  "use strict";
  function configureLocalLinks() {
    const host = window.location.hostname.toLowerCase();
    const port = window.location.port || "80";
    const isLocal = host.endsWith(".localhost") || host === "localhost" || host === "127.0.0.1";
    if (!isLocal) return;

    const map = {
      main: `http://xjk.localhost:${port}/`,
      altered: `http://altered.localhost:${port}/`,
      tools: `http://tools.localhost:${port}/`,
      plugins: `http://plugins.localhost:${port}/`,
      learn: `http://learn.localhost:${port}/`,
      trackers: `http://trackers.localhost:${port}/`,
      aggregator: `http://aggregator.localhost:${port}/`,
    };

    document.querySelectorAll("[data-link]").forEach(function (el) {
      var key = el.getAttribute("data-link");
      if (map[key]) el.setAttribute("href", map[key]);
    });
  }
  function initScrollReveal() {
    var els = document.querySelectorAll(".reveal");
    if (!els.length) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    els.forEach(function (el) {
      observer.observe(el);
    });
  }
  configureLocalLinks();
  initScrollReveal();
})();

