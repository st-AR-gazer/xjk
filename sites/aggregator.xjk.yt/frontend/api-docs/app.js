(function () {
  "use strict";

  const TAB_IDS = [
    "overview",
    "names",
    "projects",
    "events",
    "clubs",
    "database",
    "recipes",
    "contribute",
  ];

  function setStatus(text) {
    const el = document.getElementById("statusLine");
    if (el) el.textContent = text;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderAuthCards(auth) {
    const items = [
      { label: "Public Reads", value: "No token required", tone: "is-ok" },
      {
        label: "Standard Ingest",
        value: auth?.ingest?.enforcedOnThisServer ? "Token required now" : "Token model documented",
        tone: auth?.ingest?.enforcedOnThisServer ? "is-accent" : "is-warn",
      },
      {
        label: "ARL Auth",
        value: auth?.arlPlugin?.enforcedOnThisServer ? "Configured" : "Not configured",
        tone: auth?.arlPlugin?.enforcedOnThisServer ? "is-ok" : "is-warn",
      },
    ];

    return items
      .map(
        (item) => `
          <article class="auth-card">
            <span class="label">${escapeHtml(item.label)}</span>
            <div class="badge ${item.tone}">${escapeHtml(item.value)}</div>
          </article>
        `
      )
      .join("");
  }

  function renderParams(items) {
    if (!Array.isArray(items) || !items.length) {
      return '<div class="muted">None</div>';
    }
    return (
      '<ul class="param-list">' +
      items
        .map(
          (item) =>
            `<li><code>${escapeHtml(item.name)}</code>` +
            (item.type ? ` <span class="muted">(${escapeHtml(item.type)})</span>` : "") +
            (item.description ? ` - ${escapeHtml(item.description)}` : "") +
            "</li>"
        )
        .join("") +
      "</ul>"
    );
  }

  function renderCodeBlock(value) {
    if (!value) return "";
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return `<pre>${escapeHtml(text)}</pre>`;
  }

  function renderEndpoint(endpoint) {
    return `
      <article class="endpoint-card">
        <div class="endpoint-top">
          <span class="method">${escapeHtml(endpoint.method)}</span>
          <code class="path">${escapeHtml(endpoint.path)}</code>
          <span class="badge">${escapeHtml(endpoint.auth)}</span>
        </div>
        <p class="endpoint-summary">${escapeHtml(endpoint.summary)}</p>
        <div class="meta-grid">
          <section class="meta-box">
            <h5>Path Params</h5>
            ${renderParams(endpoint.pathParams)}
          </section>
          <section class="meta-box">
            <h5>Query</h5>
            ${renderParams(endpoint.query)}
          </section>
        </div>
        ${Array.isArray(endpoint.notes) && endpoint.notes.length
          ? `
            <div class="meta-box" style="margin-top: 0.85rem;">
              <h5>Notes</h5>
              <ul class="param-list">
                ${endpoint.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
              </ul>
            </div>
          `
          : ""}
        ${endpoint.bodyExample
          ? `
            <div class="meta-box" style="margin-top: 0.85rem;">
              <h5>Body Example</h5>
              ${renderCodeBlock(endpoint.bodyExample)}
            </div>
          `
          : ""}
        ${endpoint.responseExample
          ? `
            <div class="meta-box" style="margin-top: 0.85rem;">
              <h5>Response Example</h5>
              ${renderCodeBlock(endpoint.responseExample)}
            </div>
          `
          : ""}
        ${endpoint.example
          ? `
            <div class="meta-box" style="margin-top: 0.85rem;">
              <h5>Example</h5>
              ${renderCodeBlock(endpoint.example)}
            </div>
          `
          : ""}
      </article>
    `;
  }

  function setActiveTab(tabId) {
    const safeTab = TAB_IDS.includes(tabId) ? tabId : "overview";

    document.querySelectorAll(".tab-btn[data-tab]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tab === safeTab);
    });

    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === `tab-${safeTab}`);
    });
  }

  function getInitialTab() {
    const hash = window.location.hash.replace(/^#/, "").trim();
    return TAB_IDS.includes(hash) ? hash : "overview";
  }

  function wireNavigation() {
    document.querySelectorAll(".tab-btn[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        const tabId = button.dataset.tab || "overview";
        history.replaceState(null, "", `#${tabId}`);
        setActiveTab(tabId);
      });
    });

    window.addEventListener("hashchange", () => {
      setActiveTab(getInitialTab());
    });
  }

  function setEndpointSection(targetId, section, emptyCopy = "No endpoints available.") {
    const target = document.getElementById(targetId);
    if (!target) return;
    const endpoints = section?.endpoints || [];
    target.innerHTML = endpoints.length
      ? endpoints.map(renderEndpoint).join("")
      : `<div class="meta-box muted">${escapeHtml(emptyCopy)}</div>`;
  }

  async function boot() {
    const response = await fetch("/api/catalog.json", { cache: "no-store" });
    const catalog = await response.json();
    const sectionsById = new Map((catalog.sections || []).map((section) => [section.id, section]));

    document.title = `${catalog.service} / api`;
    setStatus("Ready");
    document.getElementById("authBadges").innerHTML = renderAuthCards(catalog.auth || {});
    document.getElementById("mSections").textContent = String(
      Array.isArray(catalog.sections) ? catalog.sections.length : 0
    );

    const baseUrls = document.getElementById("baseUrls");
    baseUrls.innerHTML = `
      <div class="base-card">
        <span class="label">Docs</span>
        <code class="value">${escapeHtml(catalog.baseUrls?.docs || "/api/")}</code>
      </div>
      <div class="base-card">
        <span class="label">Public Read Base</span>
        <code class="value">${escapeHtml(catalog.baseUrls?.public || "/api/v1")}</code>
      </div>
      <div class="base-card">
        <span class="label">Contribution Base</span>
        <code class="value">${escapeHtml(catalog.baseUrls?.ingest || "/api/v1/ingest")}</code>
      </div>
    `;

    document.getElementById("currentRole").innerHTML = (catalog.currentRole || [])
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");
    document.getElementById("guidelines").innerHTML = (catalog.contributionGuidelines || [])
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");

    document.getElementById("recipes").innerHTML = (catalog.clientRecipes || [])
      .map(
        (recipe) => `
          <article class="recipe-card">
            <span class="label">${escapeHtml(recipe.endpoint || "")}</span>
            <h4>${escapeHtml(recipe.title)}</h4>
            <p>${escapeHtml(recipe.description)}</p>
            ${renderCodeBlock(recipe.example)}
          </article>
        `
      )
      .join("");

    setEndpointSection("overviewEndpoints", sectionsById.get("meta"));
    setEndpointSection("namesEndpoints", sectionsById.get("identity"));
    setEndpointSection("projectsEndpoints", sectionsById.get("projects"));
    setEndpointSection("eventsEndpoints", sectionsById.get("events"));
    setEndpointSection("clubsEndpoints", sectionsById.get("clubs"));
    setEndpointSection("databaseEndpoints", sectionsById.get("database"));
    setEndpointSection("contributeEndpoints", sectionsById.get("ingest"));

    document.getElementById("overviewCount").textContent = `${TAB_IDS.length} tabs`;
    document.getElementById("namesCount").textContent = `${(sectionsById.get("identity")?.endpoints || []).length} routes`;
    document.getElementById("projectsCount").textContent = `${(sectionsById.get("projects")?.endpoints || []).length} routes`;
    document.getElementById("eventsCount").textContent = `${(sectionsById.get("events")?.endpoints || []).length} routes`;
    document.getElementById("clubsCount").textContent = `${(sectionsById.get("clubs")?.endpoints || []).length} routes`;
    document.getElementById("databaseCount").textContent = `${(sectionsById.get("database")?.endpoints || []).length} routes`;
    document.getElementById("recipesCount").textContent = `${(catalog.clientRecipes || []).length} recipes`;
    document.getElementById("contributeCount").textContent = `${(sectionsById.get("ingest")?.endpoints || []).length} routes`;

    wireNavigation();
    setActiveTab(getInitialTab());
  }

  boot().catch((error) => {
    setStatus("Load failed");
    const sub = document.querySelector(".header-sub");
    if (sub) {
      sub.textContent = `Failed to load API catalog: ${error?.message || error}`;
    }
  });
})();
