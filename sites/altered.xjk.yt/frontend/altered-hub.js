function configureLocalLinks() {
  const host = window.location.hostname.toLowerCase();
  const port = window.location.port || "80";
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "xjk.localhost" ||
    host.endsWith(".localhost");

  if (!isLocal) return;

  const localTargets = {
    main: `http://xjk.localhost:${port}/`,
    tools: `http://tools.localhost:${port}/`,
    plugins: `http://plugins.localhost:${port}/`,
    learn: `http://learn.localhost:${port}/`,
    altered: `http://altered.localhost:${port}/`,
    tracker: `http://trackers.localhost:${port}/leaderboard/`,
    trackers: `http://trackers.localhost:${port}/`,
  };

  document.querySelectorAll("[data-link]").forEach((node) => {
    const key = node.getAttribute("data-link");
    if (localTargets[key]) {
      node.setAttribute("href", localTargets[key]);
    }
  });
}

function initScrollReveal() {
  const reveals = document.querySelectorAll(".reveal");
  if (!reveals.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  reveals.forEach((el) => observer.observe(el));
}

configureLocalLinks();
initScrollReveal();
