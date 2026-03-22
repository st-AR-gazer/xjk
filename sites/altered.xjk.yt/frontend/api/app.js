const GROUP_ORDER = ["Maps", "Alterations", "Leaderboards", "Clubs", "Hub", "Tracker", "Aggregator", "Webhooks", "Catalog"];

const state = {
  catalog: null,
  filter: "",
};

const el = {
  topbarSummary: document.getElementById("topbarSummary"),
  statVersion: document.getElementById("statVersion"),
  statEndpoints: document.getElementById("statEndpoints"),
  searchInput: document.getElementById("searchInput"),
  resetSearchBtn: document.getElementById("resetSearchBtn"),
  sidebarGroups: document.getElementById("sidebarGroups"),
  endpointSections: document.getElementById("endpointSections"),
  mapTesterForm: document.getElementById("mapTesterForm"),
  mapUidInput: document.getElementById("mapUidInput"),
  wrHistoryLimitInput: document.getElementById("wrHistoryLimitInput"),
  mapTesterStatus: document.getElementById("mapTesterStatus"),
  mapTesterOutput: document.getElementById("mapTesterOutput"),
  catalogCurl: document.getElementById("catalogCurl"),
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function endpointHref(endpoint) {
  return `/api/endpoints/${encodeURIComponent(String(endpoint?.key || "").trim())}`;
}

function matchesFilter(endpoint, filter) {
  if (!filter) return true;
  const haystack = [
    endpoint?.title, endpoint?.path, endpoint?.group,
    endpoint?.method, endpoint?.description, endpoint?.access,
    endpoint?.stability, endpoint?.service,
  ].join(" ").toLowerCase();
  return haystack.includes(filter);
}

function groupEndpoints(endpoints) {
  const grouped = new Map();
  endpoints.forEach((ep) => {
    const group = String(ep?.group || "Other").trim() || "Other";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(ep);
  });

  const order = state.catalog?.api?.groupOrder || GROUP_ORDER;

  return [...grouped.entries()]
    .map(([group, items]) => ({
      group,
      items: items.sort((a, b) =>
        String(a?.title || a?.path || "").localeCompare(String(b?.title || b?.path || ""))
      ),
    }))
    .sort((a, b) => {
      const ai = order.indexOf(a.group);
      const bi = order.indexOf(b.group);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.group.localeCompare(b.group);
    });
}

function getFilteredEndpoints() {
  const endpoints = Array.isArray(state.catalog?.endpoints) ? state.catalog.endpoints : [];
  const filter = String(state.filter || "").trim().toLowerCase();
  return endpoints.filter((ep) => matchesFilter(ep, filter));
}

function renderOverview() {
  const catalog = state.catalog;
  if (!catalog) return;
  const filtered = getFilteredEndpoints();
  const groups = groupEndpoints(filtered);

  el.topbarSummary.textContent = `${filtered.length} endpoint${filtered.length !== 1 ? "s" : ""} in ${groups.length} group${groups.length !== 1 ? "s" : ""}`;
  el.statVersion.textContent = String(catalog.api?.version || "1").replace(/^v/i, "");
  el.statEndpoints.textContent = String(catalog.api?.totalEndpoints || filtered.length || 0);
  el.catalogCurl.textContent = `curl "${window.location.origin}/api/v1/public/endpoints"`;
}

function withDepth(items) {
  const sorted = [...items].sort((a, b) => String(a.path || "").localeCompare(String(b.path || "")));
  return sorted.map((ep) => {
    const p = String(ep.path || "");
    const depth = sorted.filter((o) => { const op = String(o.path || ""); return op !== p && p.startsWith(op + "/"); }).length;
    return { ep, depth };
  });
}

function renderSidebar() {
  const groups = groupEndpoints(getFilteredEndpoints());
  const hasFilter = Boolean(state.filter);
  el.sidebarGroups.innerHTML = groups.length
    ? groups.map(({ group, items }) => `
        <details class="sidebar-dropdown"${hasFilter ? " open" : ""}>
          <summary>${esc(group)}<span class="sidebar-count">${items.length}</span></summary>
          <div class="sidebar-dropdown-items">
            ${withDepth(items).map(({ ep, depth }) =>
              `<a class="sidebar-ep" style="--depth:${depth}" href="${esc(endpointHref(ep))}">
                <span class="method-pip ${esc(String(ep.method || "GET").toLowerCase())}">${esc(ep.method || "GET")}</span>
                <span class="sidebar-ep-title">${esc(ep.title || ep.key || ep.path || "Endpoint")}</span>
                ${ep.service === "aggregator" ? '<span class="sidebar-svc">agg</span>' : ""}
              </a>`
            ).join("")}
          </div>
        </details>
      `).join("")
    : `<div class="sidebar-group"><p class="sidebar-group-title">No matches</p></div>`;
}

function renderEndpointSections() {
  const groups = groupEndpoints(getFilteredEndpoints());

  el.endpointSections.innerHTML = groups.length
    ? groups.map(({ group, items }) => `
        <section id="group-${esc(group.toLowerCase().replace(/\s+/g, "-"))}" class="doc-section doc-section-group">
          <div class="group-header">
            <h2 class="group-title">${esc(group)}</h2>
            <span class="group-count">${items.length} endpoint${items.length !== 1 ? "s" : ""}</span>
          </div>
          <div class="endpoint-list">
            ${items.map((ep) => `
              <a class="endpoint-row" href="${esc(endpointHref(ep))}">
                <span class="method-badge ${esc(String(ep.method || "GET").toLowerCase())}">${esc(ep.method || "GET")}</span>
                <div class="endpoint-row-info">
                  <span class="endpoint-row-title">${esc(ep.title || ep.key)}${ep.service === "aggregator" ? '<span class="svc-tag">aggregator</span>' : ""}</span>
                  <code class="endpoint-row-path">${esc(ep.path || "")}</code>
                </div>
                <div class="endpoint-row-badges">
                  ${ep.stability === "legacy" ? '<span class="status-badge legacy">legacy</span>' : ""}
                  ${ep.stability === "stable" ? '<span class="status-badge stable">stable</span>' : ""}
                  ${ep.access === "protected" ? '<span class="status-badge protected">auth</span>' : ""}
                </div>
                <span class="endpoint-row-arrow">&rarr;</span>
              </a>
            `).join("")}
          </div>
        </section>
      `).join("")
    : `<section class="doc-section"><p class="inline-empty">No endpoints match that filter.</p></section>`;
}

function renderAll() {
  renderOverview();
  renderSidebar();
  renderEndpointSections();
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status}).`);
  return payload;
}

async function loadCatalog() {
  state.catalog = await fetchJson("/api/v1/public/endpoints");
  renderAll();
}

async function handleMapFetch(event) {
  event.preventDefault();
  const mapUid = String(el.mapUidInput?.value || "").trim();
  const wrHistoryLimit = Math.max(1, Math.min(25, Number(el.wrHistoryLimitInput?.value || 5) || 5));

  if (!mapUid) {
    el.mapTesterStatus.textContent = "Enter a map UID first.";
    el.mapTesterOutput.textContent = "Awaiting request.";
    return;
  }

  el.mapTesterStatus.textContent = `Fetching ${mapUid}...`;
  el.mapTesterOutput.textContent = "Loading...";

  try {
    const payload = await fetchJson(`/api/v1/public/maps/${encodeURIComponent(mapUid)}?wrHistoryLimit=${wrHistoryLimit}`);
    el.mapTesterStatus.textContent = `Loaded ${mapUid}.`;
    el.mapTesterOutput.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    el.mapTesterStatus.textContent = error.message || "Request failed.";
    el.mapTesterOutput.textContent = JSON.stringify({ error: error.message || "Request failed." }, null, 2);
  }
}

function bindEvents() {
  el.searchInput?.addEventListener("input", () => {
    state.filter = String(el.searchInput.value || "").trim();
    renderAll();
  });

  el.resetSearchBtn?.addEventListener("click", () => {
    state.filter = "";
    if (el.searchInput) el.searchInput.value = "";
    renderAll();
  });

  el.mapTesterForm?.addEventListener("submit", handleMapFetch);
}

async function boot() {
  bindEvents();
  await loadCatalog();

  const url = new URL(window.location.href);
  const mapUid = String(url.searchParams.get("mapUid") || "").trim();
  if (mapUid) {
    el.mapUidInput.value = mapUid;
    el.mapTesterForm.requestSubmit();
  }
}

boot().catch((error) => {
  console.error(error);
  el.topbarSummary.textContent = error.message || "Failed to load catalog.";
  el.endpointSections.innerHTML = `<section class="doc-section"><p class="inline-empty">${esc(error.message || "Failed to load catalog.")}</p></section>`;
  el.sidebarGroups.innerHTML = "";
  el.mapTesterStatus.textContent = error.message || "Failed to load catalog.";
});
