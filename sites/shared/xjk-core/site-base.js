(function configureXjkSiteBase(global, document) {
  const script = document.currentScript;
  const base = document.querySelector("base[data-xjk-site-base]");
  const sitePath = String(script?.dataset.xjkSitePath || "").replace(/\/+$/, "");
  if (!base || !sitePath.startsWith("/") || sitePath.includes("..")) return;

  const hostname = String(global.location?.hostname || "").toLowerCase();
  const pathname = String(global.location?.pathname || "/");
  const isLoopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  const isPathMode = isLoopback && (pathname === sitePath || pathname.startsWith(`${sitePath}/`));
  base.setAttribute("href", isPathMode ? `${sitePath}/` : "/");
})(window, document);
