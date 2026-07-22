import { ROUTE_CONFIG, RUNTIME_ROUTES, routeHref } from "./route-model.js?v=2";

const OVERVIEW_CARDS = Object.freeze([
  Object.freeze({
    route: "wr",
    description: "World-record focused tracker with live change feed, run history, and webhook forwarding.",
    icon: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  }),
  Object.freeze({
    route: "leaderboard",
    description: "Top-N leaderboard polling and snapshot updates per tracked map, with live check stream.",
    icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  }),
  Object.freeze({
    route: "displayname",
    description: "Account ID to display-name sync scheduler with manual enqueue and aggregator push.",
    icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  }),
  Object.freeze({
    route: "club",
    description: "Club, campaign, and upload snapshot ingest API for project-owned structure crawlers.",
    icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  }),
]);

function overviewMarkup(context) {
  return `
    <section class="overview-page">
      <header class="page-header">
        <h2>Tracker Overview</h2>
        <p>One persistent tracker shell, with WR, leaderboard, displayname, and club runtimes mounted as subtabs inside the same host.</p>
      </header>
      <div class="stats-row">
        ${overviewStatMarkup("active", "Active Runtimes", "Checking runtime reachability...")}
        ${overviewStatMarkup("health", "System Status", "Waiting for tracker status responses...")}
        ${overviewStatMarkup("network", "Network Sync", "Loading service heartbeat data...")}
      </div>
      <div class="overview-grid">
        ${OVERVIEW_CARDS.map((card) => overviewCardMarkup(card, context.basePrefix)).join("")}
      </div>
    </section>`;
}

function overviewStatMarkup(key, label, copy) {
  return `
    <article class="stat-card">
      <span class="stat-label">${label}</span>
      <span class="stat-value" id="overview-${key}-value">--</span>
      <p class="stat-copy" id="overview-${key}-copy">${copy}</p>
    </article>`;
}

function overviewCardMarkup(card, basePrefix) {
  const route = ROUTE_CONFIG[card.route];
  return `
    <a class="overview-card overview-card--${card.route}" data-route="${card.route}" data-route-link href="${routeHref(basePrefix, card.route)}">
      <div class="overview-card-header">
        <div class="overview-card-title">
          <span class="overview-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${card.icon}</svg>
          </span>
          <div><h3>${route.label}</h3></div>
        </div>
        <span class="status-pill status-pill--warn" data-runtime-pill="${card.route}">Checking...</span>
      </div>
      <p>${card.description}</p>
      <span class="overview-card-meta" data-runtime-meta="${card.route}">Loading runtime status...</span>
      <span class="overview-card-go">Open runtime &rarr;</span>
    </a>`;
}

function bindOverviewElements(root) {
  const stats = Object.fromEntries(
    ["active", "health", "network"].map((key) => [
      key,
      {
        value: root.querySelector(`#overview-${key}-value`),
        copy: root.querySelector(`#overview-${key}-copy`),
      },
    ])
  );
  const cards = Object.fromEntries(
    RUNTIME_ROUTES.map((route) => [
      route,
      {
        pill: root.querySelector(`[data-runtime-pill="${route}"]`),
        meta: root.querySelector(`[data-runtime-meta="${route}"]`),
      },
    ])
  );
  return { cards, stats };
}

function setOverviewStatus(elements, state, copy, tone) {
  elements.value.textContent = state;
  elements.value.classList.remove("status-text--ok", "status-text--warn", "status-text--bad");
  if (tone) elements.value.classList.add(`status-text--${tone}`);
  elements.copy.textContent = copy;
}

function setCardStatus(card, label, metadata, tone) {
  card.pill.textContent = label;
  card.pill.classList.remove("status-pill--ok", "status-pill--warn", "status-pill--bad");
  card.pill.classList.add(`status-pill--${tone}`);
  card.meta.textContent = metadata;
}

export { OVERVIEW_CARDS, bindOverviewElements, overviewMarkup, setCardStatus, setOverviewStatus };
