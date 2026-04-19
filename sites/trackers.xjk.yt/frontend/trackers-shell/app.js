(function () {
  "use strict";

  const OVERVIEW_REFRESH_MS = 15000;
  const FRAME_RESIZE_MS = 1000;

  const ROUTE_CONFIG = {
    overview: {
      title: "xjk / trackers",
    },
    wr: {
      title: "xjk / trackers / wr",
      label: "WR Tracker",
      badge: "WR Runtime",
      summary: "World-record feed, live checks, and engine controls.",
      servicePath: "/wr",
      directLabel: "Open in New Tab",
      adminPath: "/wr/admin/login",
      theme: "wr",
    },
    leaderboard: {
      title: "xjk / trackers / leaderboard",
      label: "Leaderboard",
      badge: "Leaderboard Runtime",
      summary: "Top-N polling, map tables, and live leaderboard change stream.",
      servicePath: "/leaderboard",
      directLabel: "Open in New Tab",
      adminPath: "/leaderboard/admin/login",
      theme: "leaderboard",
    },
    displayname: {
      title: "xjk / trackers / displayname",
      label: "Displayname",
      badge: "Displayname Runtime",
      summary: "Account ID sync queue and aggregator push controls.",
      servicePath: "/displayname",
      directLabel: "Open in New Tab",
      adminPath: "",
      theme: "displayname",
    },
    club: {
      title: "xjk / trackers / club",
      label: "Club Ingest",
      badge: "Club Runtime",
      summary: "Snapshot ingest controls for club and campaign crawlers.",
      servicePath: "/club",
      directLabel: "Open in New Tab",
      adminPath: "",
      theme: "club",
    },
  };

  const PUBLIC_LINKS = {
    main: "https://xjk.yt/",
    aggregator: "https://aggregator.xjk.yt/",
  };

  let activeCleanup = null;

  function isLocalHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return host.endsWith(".localhost") || host === "localhost" || host === "127.0.0.1";
  }

  function getLocalOrigin() {
    const protocol = window.location.protocol || "http:";
    const port = window.location.port || (protocol === "https:" ? "443" : "80");
    const host = window.location.hostname === "127.0.0.1" ? "127.0.0.1" : "localhost";
    return `${protocol}//${host}:${port}`;
  }

  function resolveHubHref(key) {
    if (!isLocalHost(window.location.hostname)) {
      return PUBLIC_LINKS[key] || "#";
    }

    const origin = getLocalOrigin();
    if (key === "main") return `${origin}/`;
    if (key === "aggregator") return `${origin}/aggregator/`;
    return "#";
  }

  function getBasePrefix(pathname) {
    const safePath = String(pathname || "/");
    if (safePath === "/trackers" || safePath.startsWith("/trackers/")) {
      return "/trackers";
    }
    return "";
  }

  function stripBasePrefix(pathname, basePrefix) {
    const safePath = String(pathname || "/");
    if (!basePrefix) return safePath;
    if (safePath === basePrefix) return "/";
    if (safePath.startsWith(`${basePrefix}/`)) {
      return safePath.slice(basePrefix.length) || "/";
    }
    return safePath;
  }

  function withBase(basePrefix, path) {
    const safePath = String(path || "").startsWith("/") ? String(path) : `/${path || ""}`;
    if (!basePrefix) return safePath;
    if (safePath === "/") return `${basePrefix}/`;
    return `${basePrefix}${safePath}`;
  }

  function routeHref(basePrefix, route) {
    if (route === "overview") return withBase(basePrefix, "/");
    return withBase(basePrefix, ROUTE_CONFIG[route].servicePath + "/");
  }

  function runtimeEmbedHref(ctx) {
    return withBase(ctx.basePrefix, `/__runtime/${ctx.route}/index.html`);
  }

  function runtimeSourceHref(ctx) {
    return runtimeEmbedHref(ctx);
  }

  function runtimeDirectHref(ctx) {
    return routeHref(ctx.basePrefix, ctx.route);
  }

  function runtimeAdminHref(ctx) {
    const config = ROUTE_CONFIG[ctx.route];
    if (!config || !config.adminPath) return "";
    return withBase(ctx.basePrefix, config.adminPath);
  }

  function runtimeApiHref(basePrefix, route, path) {
    const serviceBase = routeHref(basePrefix, route).replace(/\/$/, "");
    const safePath = String(path || "").startsWith("/") ? String(path) : `/${path || ""}`;
    return `${serviceBase}${safePath}`;
  }

  function getRouteContext() {
    const pathname = window.location.pathname || "/";
    const basePrefix = getBasePrefix(pathname);
    const stripped = stripBasePrefix(pathname, basePrefix);
    const normalized = stripped.replace(/\/+/g, "/");
    const segments = normalized.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    const first = (segments[0] || "").toLowerCase();

    if (first === "wr" || first === "leaderboard" || first === "displayname" || first === "club") {
      return {
        route: first,
        basePrefix,
      };
    }

    return {
      route: "overview",
      basePrefix,
    };
  }

  function formatNumber(value) {
    const num = Number(value || 0);
    return Number.isFinite(num) ? num.toLocaleString() : "0";
  }

  function fmtAgo(iso) {
    const timestamp = Date.parse(iso || "");
    if (!Number.isFinite(timestamp)) return "just now";
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      cache: "no-store",
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      throw new Error(payload?.error || `Request failed (${response.status})`);
    }
    return payload;
  }

  function shouldHandleRouteClick(event, anchor) {
    if (!anchor) return false;
    if (event.defaultPrevented) return false;
    if (event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (anchor.target && anchor.target !== "_self") return false;
    if (anchor.hasAttribute("download")) return false;
    return true;
  }

  function teardownActiveRoute() {
    if (typeof activeCleanup === "function") {
      try {
        activeCleanup();
      } catch {
      }
    }
    activeCleanup = null;
  }

  function updateChrome(ctx) {
    document.querySelectorAll("[data-route-link]").forEach((node) => {
      const route = node.getAttribute("data-route");
      if (!route || !ROUTE_CONFIG[route]) return;
      node.setAttribute("href", routeHref(ctx.basePrefix, route));
      node.classList.toggle("is-active", route === ctx.route);
    });

    document.querySelectorAll("[data-link]").forEach((node) => {
      const key = node.getAttribute("data-link");
      if (!key) return;
      node.setAttribute("href", resolveHubHref(key));
    });

    document.title = ROUTE_CONFIG[ctx.route].title;
  }

  function overviewMarkup(ctx) {
    return `
      <section class="overview-page">
        <header class="page-header">
          <h2>Tracker Overview</h2>
          <p>One persistent tracker shell, with WR, leaderboard, displayname, and club runtimes mounted as subtabs inside the same host.</p>
        </header>

        <div class="stats-row">
          <article class="stat-card">
            <span class="stat-label">Active Runtimes</span>
            <span class="stat-value" id="overview-active-value">--</span>
            <p class="stat-copy" id="overview-active-copy">Checking runtime reachability...</p>
          </article>
          <article class="stat-card">
            <span class="stat-label">System Status</span>
            <span class="stat-value" id="overview-health-value">--</span>
            <p class="stat-copy" id="overview-health-copy">Waiting for tracker status responses...</p>
          </article>
          <article class="stat-card">
            <span class="stat-label">Network Sync</span>
            <span class="stat-value" id="overview-network-value">--</span>
            <p class="stat-copy" id="overview-network-copy">Loading service heartbeat data...</p>
          </article>
        </div>

        <div class="overview-grid">
          <a class="overview-card overview-card--wr" data-route="wr" data-route-link href="${routeHref(ctx.basePrefix, "wr")}">
            <div class="overview-card-header">
              <div class="overview-card-title">
                <span class="overview-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </span>
                <div>
                  <h3>WR Tracker</h3>
                </div>
              </div>
              <span class="status-pill status-pill--warn" data-runtime-pill="wr">Checking...</span>
            </div>
            <p>World-record focused tracker with live change feed, run history, and webhook forwarding.</p>
            <span class="overview-card-meta" data-runtime-meta="wr">Loading runtime status...</span>
            <span class="overview-card-go">Open runtime &rarr;</span>
          </a>

          <a class="overview-card overview-card--leaderboard" data-route="leaderboard" data-route-link href="${routeHref(ctx.basePrefix, "leaderboard")}">
            <div class="overview-card-header">
              <div class="overview-card-title">
                <span class="overview-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                </span>
                <div>
                  <h3>Leaderboard</h3>
                </div>
              </div>
              <span class="status-pill status-pill--warn" data-runtime-pill="leaderboard">Checking...</span>
            </div>
            <p>Top-N leaderboard polling and snapshot updates per tracked map, with live check stream.</p>
            <span class="overview-card-meta" data-runtime-meta="leaderboard">Loading runtime status...</span>
            <span class="overview-card-go">Open runtime &rarr;</span>
          </a>

          <a class="overview-card overview-card--displayname" data-route="displayname" data-route-link href="${routeHref(ctx.basePrefix, "displayname")}">
            <div class="overview-card-header">
              <div class="overview-card-title">
                <span class="overview-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </span>
                <div>
                  <h3>Displayname</h3>
                </div>
              </div>
              <span class="status-pill status-pill--warn" data-runtime-pill="displayname">Checking...</span>
            </div>
            <p>Account ID to display-name sync scheduler with manual enqueue and aggregator push.</p>
            <span class="overview-card-meta" data-runtime-meta="displayname">Loading runtime status...</span>
            <span class="overview-card-go">Open runtime &rarr;</span>
          </a>

          <a class="overview-card overview-card--club" data-route="club" data-route-link href="${routeHref(ctx.basePrefix, "club")}">
            <div class="overview-card-header">
              <div class="overview-card-title">
                <span class="overview-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </span>
                <div>
                  <h3>Club Ingest</h3>
                </div>
              </div>
              <span class="status-pill status-pill--warn" data-runtime-pill="club">Checking...</span>
            </div>
            <p>Club, campaign, and upload snapshot ingest API for project-owned structure crawlers.</p>
            <span class="overview-card-meta" data-runtime-meta="club">Loading runtime status...</span>
            <span class="overview-card-go">Open runtime &rarr;</span>
          </a>
        </div>
      </section>
    `;
  }

  function runtimeMarkup(ctx) {
    const config = ROUTE_CONFIG[ctx.route];
    return `
      <section class="runtime-host runtime-host--${config.theme}">
        <div class="runtime-frame-card is-loading" data-loading-label="Loading runtime...">
          <iframe
            class="runtime-frame"
            data-runtime-frame
            src="${runtimeSourceHref(ctx)}"
            title="${config.label}"
            loading="eager"
          ></iframe>
        </div>
      </section>
    `;
  }

  function setOverviewStatus(els, state, copy, tone) {
    els.value.textContent = state;
    els.value.classList.remove("status-text--ok", "status-text--warn", "status-text--bad");
    if (tone) {
      els.value.classList.add(`status-text--${tone}`);
    }
    els.copy.textContent = copy;
  }

  function setCardStatus(card, label, meta, tone) {
    card.pill.textContent = label;
    card.pill.classList.remove("status-pill--ok", "status-pill--warn", "status-pill--bad");
    card.pill.classList.add(`status-pill--${tone}`);
    card.meta.textContent = meta;
  }

  function formatTrackerOverview(status, modeLabel) {
    const runtime = status?.runtime || {};
    const tracked = Number(status?.summary?.trackedMaps || 0);
    const due = Number(status?.trackedDueNow || 0);
    if (runtime?.lastError) {
      return {
        label: "Attention",
        meta: `${modeLabel} runtime reported an error.`,
        tone: "bad",
      };
    }
    if (runtime?.running || runtime?.timerActive) {
      return {
        label: "Running",
        meta: `${formatNumber(tracked)} maps tracked · ${formatNumber(due)} due now`,
        tone: "ok",
      };
    }
    return {
      label: "Reachable",
      meta: `${formatNumber(tracked)} maps tracked · ${formatNumber(due)} due now`,
      tone: "warn",
    };
  }

  function formatDisplaynameOverview(status) {
    if (status?.lastError) {
      return {
        label: "Attention",
        meta: "Displayname runtime reported an error.",
        tone: "bad",
      };
    }

    if (status?.running) {
      return {
        label: "Syncing",
        meta: `${formatNumber(status?.queueSize || 0)} queued · scheduler ${status?.schedulerEnabled ? "active" : "paused"}`,
        tone: "ok",
      };
    }

    return {
      label: "Reachable",
      meta: `${formatNumber(status?.queueSize || 0)} queued · scheduler ${status?.schedulerEnabled ? "active" : "paused"}`,
      tone: "warn",
    };
  }

  function formatClubOverview(status) {
    if (status?.lastError) {
      return {
        label: "Attention",
        meta: "Club runtime reported an ingest error.",
        tone: "bad",
      };
    }

    if (status?.lastIngestAt) {
      return {
        label: "Ingested",
        meta: `Last snapshot ${fmtAgo(status.lastIngestAt)}`,
        tone: "ok",
      };
    }

    return {
      label: "Reachable",
      meta: "Waiting for the first club snapshot.",
      tone: "warn",
    };
  }

  function mountOverview(root, ctx) {
    const statEls = {
      active: {
        value: root.querySelector("#overview-active-value"),
        copy: root.querySelector("#overview-active-copy"),
      },
      health: {
        value: root.querySelector("#overview-health-value"),
        copy: root.querySelector("#overview-health-copy"),
      },
      network: {
        value: root.querySelector("#overview-network-value"),
        copy: root.querySelector("#overview-network-copy"),
      },
    };

    const cards = {
      wr: {
        pill: root.querySelector('[data-runtime-pill="wr"]'),
        meta: root.querySelector('[data-runtime-meta="wr"]'),
      },
      leaderboard: {
        pill: root.querySelector('[data-runtime-pill="leaderboard"]'),
        meta: root.querySelector('[data-runtime-meta="leaderboard"]'),
      },
      displayname: {
        pill: root.querySelector('[data-runtime-pill="displayname"]'),
        meta: root.querySelector('[data-runtime-meta="displayname"]'),
      },
      club: {
        pill: root.querySelector('[data-runtime-pill="club"]'),
        meta: root.querySelector('[data-runtime-meta="club"]'),
      },
    };

    let disposed = false;
    let timerId = 0;

    async function refresh() {
      const requests = [
        { key: "wr", url: runtimeApiHref(ctx.basePrefix, "wr", "/api/v1/tracker/status") },
        { key: "leaderboard", url: runtimeApiHref(ctx.basePrefix, "leaderboard", "/api/v1/tracker/status") },
        { key: "displayname", url: runtimeApiHref(ctx.basePrefix, "displayname", "/api/v1/status") },
        { key: "club", url: runtimeApiHref(ctx.basePrefix, "club", "/api/v1/status") },
      ];

      const results = await Promise.allSettled(
        requests.map((request) => fetchJson(request.url))
      );

      if (disposed) return;

      let reachable = 0;
      results.forEach((result, index) => {
        const request = requests[index];
        if (result.status === "fulfilled") {
          reachable += 1;
          if (request.key === "wr") {
            const formatted = formatTrackerOverview(result.value, "WR");
            setCardStatus(cards.wr, formatted.label, formatted.meta, formatted.tone);
          } else if (request.key === "leaderboard") {
            const formatted = formatTrackerOverview(result.value, "Leaderboard");
            setCardStatus(cards.leaderboard, formatted.label, formatted.meta, formatted.tone);
          } else if (request.key === "displayname") {
            const formatted = formatDisplaynameOverview(result.value);
            setCardStatus(cards.displayname, formatted.label, formatted.meta, formatted.tone);
          } else if (request.key === "club") {
            const formatted = formatClubOverview(result.value);
            setCardStatus(cards.club, formatted.label, formatted.meta, formatted.tone);
          }
          return;
        }

        setCardStatus(cards[request.key], "Offline", "Could not reach this runtime right now.", "bad");
      });

      setOverviewStatus(
        statEls.active,
        String(reachable),
        reachable === 1 ? "1 runtime responded to health checks." : `${reachable} runtimes responded to health checks.`,
        reachable > 0 ? "ok" : "bad"
      );

      if (reachable === requests.length) {
        setOverviewStatus(
          statEls.health,
          "Healthy",
          "All tracker services are reachable from the shared host shell.",
          "ok"
        );
      } else if (reachable > 0) {
        setOverviewStatus(
          statEls.health,
          "Partial",
          `${reachable} of ${requests.length} runtimes are reachable right now.`,
          "warn"
        );
      } else {
        setOverviewStatus(
          statEls.health,
          "Offline",
          "Tracker services did not respond to the shared host shell.",
          "bad"
        );
      }

      setOverviewStatus(
        statEls.network,
        `${reachable}/${requests.length}`,
        reachable === requests.length
          ? "Network sync looks healthy across all tracker runtimes."
          : "One or more runtime services are currently unavailable.",
        reachable === requests.length ? "ok" : reachable > 0 ? "warn" : "bad"
      );
    }

    refresh().catch(() => {
      if (disposed) return;
      setOverviewStatus(statEls.active, "0", "Unable to load tracker runtime status.", "bad");
      setOverviewStatus(statEls.health, "Offline", "Tracker services did not respond.", "bad");
      setOverviewStatus(statEls.network, "0/4", "Shared runtime network is unavailable.", "bad");
      Object.keys(cards).forEach((key) => {
        setCardStatus(cards[key], "Offline", "Could not reach this runtime right now.", "bad");
      });
    });

    timerId = window.setInterval(() => {
      refresh().catch(() => {
        if (disposed) return;
        setOverviewStatus(statEls.health, "Partial", "Refresh failed for one or more runtimes.", "warn");
      });
    }, OVERVIEW_REFRESH_MS);

    return function cleanup() {
      disposed = true;
      if (timerId) {
        window.clearInterval(timerId);
      }
    };
  }

  function mountRuntime(root) {
    const frame = root.querySelector("[data-runtime-frame]");
    const card = root.querySelector(".runtime-frame-card");

    if (!frame || !card) {
      return function cleanup() {};
    }

    function injectEmbeddedStyles(doc) {
      if (!doc) return;
      let style = doc.getElementById("xjk-trackers-shell-embed");
      if (!style) {
        style = doc.createElement("style");
        style.id = "xjk-trackers-shell-embed";
        style.textContent = [
          "html, body { background: transparent !important; }",
          ".backdrop, .sidebar, .corner-back, .foot { display: none !important; }",
          ".content-area { max-width: none !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }",
        ].join("\n");
        doc.head.appendChild(style);
      }
      card.classList.remove("is-loading");
    }

    function handleLoad() {
      try {
        const doc = frame.contentDocument;
        if (doc) injectEmbeddedStyles(doc);
      } catch {
      }
    }

    frame.addEventListener("load", handleLoad);
    handleLoad();

    return function cleanup() {
      frame.removeEventListener("load", handleLoad);
    };
  }

  function renderCurrentRoute() {
    teardownActiveRoute();

    const ctx = getRouteContext();
    updateChrome(ctx);

    const root = document.getElementById("route-content");
    if (!root) return;

    if (ctx.route === "overview") {
      root.innerHTML = overviewMarkup(ctx);
      activeCleanup = mountOverview(root, ctx);
      return;
    }

    root.innerHTML = runtimeMarkup(ctx);
    activeCleanup = mountRuntime(root, ctx);
  }

  function navigate(href) {
    const nextUrl = new URL(href, window.location.origin);
    const currentUrl = new URL(window.location.href);
    if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search && nextUrl.hash === currentUrl.hash) {
      return;
    }
    window.history.pushState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    renderCurrentRoute();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  document.addEventListener("click", function (event) {
    const anchor = event.target.closest("[data-route-link]");
    if (!shouldHandleRouteClick(event, anchor)) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    event.preventDefault();
    navigate(href);
  });

  window.addEventListener("popstate", renderCurrentRoute);
  window.addEventListener("beforeunload", teardownActiveRoute);

  renderCurrentRoute();
})();
