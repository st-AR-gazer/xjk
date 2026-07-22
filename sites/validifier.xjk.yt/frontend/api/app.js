import "/shared/xjk-core/safe-html.js?v=2";
import { escapeHtml as esc } from "/shared/xjk-core/dom-utils.js";
import { fetchJson, unwrapApiData } from "/shared/xjk-core/http.js";
import {
  renderApiParamRows as renderParamRows,
  renderApiRemarks as renderRemarks,
} from "/shared/xjk-core/api-docs-rendering.js?v=2";

const validifierUrl = window.__validifierUrl || ((value) => value);

const state = {
  catalog: null,
  filter: "",
};

const elements = {
  topbarSummary: document.getElementById("topbarSummary"),
  statVersion: document.getElementById("statVersion"),
  statEndpoints: document.getElementById("statEndpoints"),
  baseUrlValue: document.getElementById("baseUrlValue"),
  authValue: document.getElementById("authValue"),
  envelopeBlock: document.getElementById("envelopeBlock"),
  enumTracks: document.getElementById("enumTracks"),
  enumStatuses: document.getElementById("enumStatuses"),
  enumReasons: document.getElementById("enumReasons"),
  searchInput: document.getElementById("searchInput"),
  resetSearchBtn: document.getElementById("resetSearchBtn"),
  sidebarGroups: document.getElementById("sidebarGroups"),
  endpointSections: document.getElementById("endpointSections"),
  recordTesterForm: document.getElementById("recordTesterForm"),
  recordIdInput: document.getElementById("recordIdInput"),
  recordTesterStatus: document.getElementById("recordTesterStatus"),
  recordTesterOutput: document.getElementById("recordTesterOutput"),
};

function endpointId(endpoint) {
  return `ep-${String(endpoint?.key || "").trim()}`;
}

function endpointAnchorHref(endpoint) {
  return `#${endpointId(endpoint)}`;
}

function endpointDocHref(endpoint) {
  return validifierUrl(
    `/api/?endpoint=${encodeURIComponent(String(endpoint?.key || "").trim())}#${endpointId(endpoint)}`
  );
}

function matchesFilter(endpoint, filter) {
  if (!filter) return true;
  const haystack = [
    endpoint?.title,
    endpoint?.path,
    endpoint?.group,
    endpoint?.method,
    endpoint?.description,
    endpoint?.access,
    endpoint?.stability,
    ...(Array.isArray(endpoint?.notes) ? endpoint.notes : []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(filter);
}

function groupEndpoints(endpoints) {
  const grouped = new Map();
  endpoints.forEach((endpoint) => {
    const group = String(endpoint?.group || "Other").trim() || "Other";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(endpoint);
  });

  const order = Array.isArray(state.catalog?.api?.group_order) ? state.catalog.api.group_order : [];

  return [...grouped.entries()]
    .map(([group, items]) => ({
      group,
      items: items.sort((left, right) =>
        String(left?.title || left?.path || "").localeCompare(String(right?.title || right?.path || ""))
      ),
    }))
    .sort((left, right) => {
      const leftIndex = order.indexOf(left.group);
      const rightIndex = order.indexOf(right.group);
      if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
      if (leftIndex !== -1) return -1;
      if (rightIndex !== -1) return 1;
      return left.group.localeCompare(right.group);
    });
}

function getFilteredEndpoints() {
  const endpoints = Array.isArray(state.catalog?.endpoints) ? state.catalog.endpoints : [];
  const filter = String(state.filter || "")
    .trim()
    .toLowerCase();
  return endpoints.filter((endpoint) => matchesFilter(endpoint, filter));
}

function renderPills(target, values = []) {
  globalThis.XjkSafeHtml.set(
    target,
    values.map((value) => `<span class="enum-pill">${esc(value === null ? "null" : String(value))}</span>`).join("")
  );
}

function renderOverview() {
  const catalog = state.catalog;
  if (!catalog) return;

  const filtered = getFilteredEndpoints();
  const groups = groupEndpoints(filtered);

  elements.topbarSummary.textContent = `${filtered.length} endpoint${filtered.length !== 1 ? "s" : ""} in ${groups.length} group${groups.length !== 1 ? "s" : ""}`;
  elements.statVersion.textContent = String(catalog.api?.version || "1").replace(/^v/i, "");
  elements.statEndpoints.textContent = String(catalog.api?.total_endpoints || filtered.length || 0);
  elements.baseUrlValue.textContent = catalog.api?.base_url || `${window.location.origin}/api/v1`;
  elements.authValue.textContent = catalog.guide?.auth || "Public endpoints are documented here.";
  elements.envelopeBlock.textContent = JSON.stringify(
    catalog.guide?.response_envelope || { ok: true, data: "..." },
    null,
    2
  );
  renderPills(elements.enumTracks, catalog.guide?.enums?.track || []);
  renderPills(elements.enumStatuses, catalog.guide?.enums?.status || []);
  renderPills(elements.enumReasons, catalog.guide?.enums?.reason_code || []);
}

function renderSidebar() {
  const groups = groupEndpoints(getFilteredEndpoints());
  const activeKey = String(new URL(window.location.href).searchParams.get("endpoint") || "").trim();

  globalThis.XjkSafeHtml.set(
    elements.sidebarGroups,
    groups.length
      ? groups
          .map(
            ({ group, items }) => `
            <div class="sidebar-group-block">
              <div class="sidebar-group-head">
                <span class="sidebar-group-name">${esc(group)}</span>
                <span class="sidebar-count">${items.length}</span>
              </div>
              <div class="sidebar-endpoint-list">
                ${items
                  .map(
                    (endpoint) => `
                      <a class="sidebar-endpoint-link${activeKey === endpoint.key ? " active" : ""}" href="${esc(endpointDocHref(endpoint))}">
                        <span class="method-pip ${esc(String(endpoint.method || "GET").toLowerCase())}">${esc(endpoint.method || "GET")}</span>
                        <span>${esc(endpoint.title || endpoint.key || endpoint.path || "Endpoint")}</span>
                      </a>
                    `
                  )
                  .join("")}
              </div>
            </div>
          `
          )
          .join("")
      : `<div class="sidebar-group"><p class="sidebar-group-title">No matches</p></div>`
  );
}

function buildExamplePath(endpoint) {
  let path = String(endpoint?.path || "").trim();
  const params = Array.isArray(endpoint?.pathParams) ? endpoint.pathParams : [];
  params.forEach((param) => {
    const replacement = param.example || `<${param.name}>`;
    path = path.replace(`:${param.name}`, replacement);
  });
  return path;
}

function buildCurl(endpoint) {
  const path = buildExamplePath(endpoint);
  const url = new URL(validifierUrl(path), window.location.origin).toString();
  if (String(endpoint?.method || "GET").toUpperCase() === "POST") {
    if (endpoint.key === "upload-map" || endpoint.key === "upload-replay") {
      return `curl -X POST "${url}" \\\n  -H "Content-Type: application/octet-stream" \\\n  --data-binary "@artifact.gbx"`;
    }
    return `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -d '${endpoint.requestBodyExample || '{"example":true}'}'`;
  }
  return `curl "${url}"`;
}

function renderExampleResponses(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<p class="inline-empty">No example responses provided.</p>`;
  }

  return items
    .map(
      (item) => `
        <article class="response-card">
          <div class="response-label">${esc(String(item.status || 200))} ${esc(item.label || "Response")}</div>
          <div class="code-block"><pre>${esc(item.body || "{}")}</pre></div>
        </article>
      `
    )
    .join("");
}

function renderEndpointCard(endpoint) {
  const isGet = String(endpoint?.method || "GET").toUpperCase() === "GET";
  const liveAction = isGet
    ? `<a class="btn ghost" href="${esc(validifierUrl(buildExamplePath(endpoint)))}" target="_blank" rel="noreferrer">Open Live</a>`
    : `<span class="btn ghost" aria-hidden="true">Use cURL</span>`;

  return `
    <article id="${esc(endpointId(endpoint))}" class="endpoint-card">
      <div class="endpoint-head">
        <div class="endpoint-title-row">
          <h3>${esc(endpoint.title || endpoint.key || "Endpoint")}</h3>
          <p class="endpoint-description">${esc(endpoint.description || "")}</p>
        </div>
        <div class="endpoint-meta">
          <span class="method-badge ${esc(String(endpoint.method || "GET").toLowerCase())}">${esc(endpoint.method || "GET")}</span>
          <span class="status-badge ${esc(endpoint.access || "public")}">${esc(endpoint.access || "public")}</span>
          <span class="status-badge ${esc(endpoint.stability || "stable")}">${esc(endpoint.stability || "stable")}</span>
        </div>
      </div>

      <div class="endpoint-path-block">
        <code>${esc(endpoint.path || "")}</code>
      </div>

      <div class="endpoint-actions">
        ${liveAction}
        <a class="btn ghost" href="${esc(endpointAnchorHref(endpoint))}">Anchor</a>
      </div>

      <div class="endpoint-grid">
        <section class="endpoint-subsection">
          <span class="ep-sub-label">Headers</span>
          <div class="param-table">${renderParamRows(endpoint.headers)}</div>
        </section>
        <section class="endpoint-subsection">
          <span class="ep-sub-label">Path Parameters</span>
          <div class="param-table">${renderParamRows(endpoint.pathParams)}</div>
        </section>
        <section class="endpoint-subsection">
          <span class="ep-sub-label">Query Parameters</span>
          <div class="param-table">${renderParamRows(endpoint.queryParams)}</div>
        </section>
        <section class="endpoint-subsection">
          <span class="ep-sub-label">Remarks</span>
          ${renderRemarks(endpoint.remarks)}
        </section>
      </div>

      ${
        endpoint.requestBodyExample
          ? `
            <section class="endpoint-subsection">
              <span class="ep-sub-label">Request Body</span>
              <div class="code-block"><pre>${esc(endpoint.requestBodyExample)}</pre></div>
            </section>
          `
          : ""
      }

      <section class="endpoint-subsection">
        <span class="ep-sub-label">cURL</span>
        <div class="code-block"><pre>${esc(buildCurl(endpoint))}</pre></div>
      </section>

      <section class="endpoint-subsection">
        <span class="ep-sub-label">Responses</span>
        <div class="response-grid">${renderExampleResponses(endpoint.exampleResponses)}</div>
      </section>
    </article>
  `;
}

function renderEndpointSections() {
  const groups = groupEndpoints(getFilteredEndpoints());

  globalThis.XjkSafeHtml.set(
    elements.endpointSections,
    groups.length
      ? groups
          .map(
            ({ group, items }) => `
            <section class="endpoint-group-section">
              <div class="group-header">
                <h2>${esc(group)}</h2>
                <span class="group-count">${items.length} endpoint${items.length !== 1 ? "s" : ""}</span>
              </div>
              <div class="endpoint-list">
                ${items.map((endpoint) => renderEndpointCard(endpoint)).join("")}
              </div>
            </section>
          `
          )
          .join("")
      : `<section class="doc-section"><p class="inline-empty">No endpoints match that filter.</p></section>`
  );
}

function renderAll() {
  renderOverview();
  renderSidebar();
  renderEndpointSections();
}

async function loadCatalog() {
  state.catalog = unwrapApiData(await fetchJson(validifierUrl("/api/v1/endpoints")));
  renderAll();
}

async function handleRecordFetch(event) {
  event.preventDefault();
  const recordId = String(elements.recordIdInput?.value || "").trim();

  if (!recordId) {
    elements.recordTesterStatus.textContent = "Enter a record ID first.";
    elements.recordTesterOutput.textContent = "Awaiting request.";
    return;
  }

  elements.recordTesterStatus.textContent = `Fetching ${recordId}...`;
  elements.recordTesterOutput.textContent = "Loading...";

  try {
    const payload = unwrapApiData(await fetchJson(validifierUrl(`/api/v1/records/${encodeURIComponent(recordId)}`)));
    elements.recordTesterStatus.textContent = `Loaded ${recordId}.`;
    elements.recordTesterOutput.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    elements.recordTesterStatus.textContent = error.message || "Request failed.";
    elements.recordTesterOutput.textContent = JSON.stringify(
      {
        ok: false,
        error: {
          message: error.message || "Request failed.",
        },
      },
      null,
      2
    );
  }
}

function bindEvents() {
  elements.searchInput?.addEventListener("input", () => {
    state.filter = String(elements.searchInput.value || "").trim();
    renderAll();
  });

  elements.resetSearchBtn?.addEventListener("click", () => {
    state.filter = "";
    if (elements.searchInput) {
      elements.searchInput.value = "";
    }
    renderAll();
  });

  elements.recordTesterForm?.addEventListener("submit", handleRecordFetch);
}

function focusRequestedEndpoint() {
  const url = new URL(window.location.href);
  const endpointKey = String(url.searchParams.get("endpoint") || "").trim();
  if (!endpointKey) {
    return;
  }

  const target = document.getElementById(endpointId({ key: endpointKey }));
  if (target) {
    target.scrollIntoView({ block: "start", behavior: "smooth" });
  }
}

async function boot() {
  bindEvents();
  await loadCatalog();

  const url = new URL(window.location.href);
  const recordId = String(url.searchParams.get("recordId") || "").trim();
  if (recordId) {
    elements.recordIdInput.value = recordId;
    elements.recordTesterForm.requestSubmit();
  }

  focusRequestedEndpoint();
}

boot().catch((error) => {
  console.error(error);
  elements.topbarSummary.textContent = error.message || "Failed to load API docs.";
  globalThis.XjkSafeHtml.set(
    elements.endpointSections,
    `<section class="doc-section"><p class="inline-empty">${esc(error.message || "Failed to load API docs.")}</p></section>`
  );
  elements.sidebarGroups.replaceChildren();
  elements.recordTesterStatus.textContent = error.message || "Failed to load API docs.";
});
