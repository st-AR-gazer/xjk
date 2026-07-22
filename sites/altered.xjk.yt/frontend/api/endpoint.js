import "/shared/xjk-core/safe-html.js?v=2";
import { escapeHtml as esc } from "/shared/xjk-core/dom-utils.js";
import { resolveSiteHref } from "/shared/xjk-core/site-runtime.js";
import { fetchJson } from "/shared/xjk-core/http.js";
import { withDepth } from "./endpoint-tree.js?v=2";
import {
  renderApiParamRows as renderParamRows,
  renderApiRemarks as renderRemarks,
} from "/shared/xjk-core/api-docs-rendering.js?v=2";

const GROUP_ORDER = [
  "Maps",
  "Alterations",
  "Leaderboards",
  "Clubs",
  "Hub",
  "Tracker",
  "Aggregator",
  "Webhooks",
  "Catalog",
];
const alteredUrl = window.__alteredUrl || ((value) => value);

const elements = {
  sidebarTitle: document.getElementById("sidebarTitle"),
  otherEndpoints: document.getElementById("otherEndpoints"),
  topbarSummary: document.getElementById("topbarSummary"),
  openEndpointBtn: document.getElementById("openEndpointBtn"),
  endpointGroup: document.getElementById("endpointGroup"),
  endpointTitle: document.getElementById("endpointTitle"),
  endpointMethod: document.getElementById("endpointMethod"),
  endpointAccess: document.getElementById("endpointAccess"),
  endpointStability: document.getElementById("endpointStability"),
  endpointDescription: document.getElementById("endpointDescription"),
  endpointPath: document.getElementById("endpointPath"),
  headerParams: document.getElementById("headerParams"),
  pathParams: document.getElementById("pathParams"),
  queryParams: document.getElementById("queryParams"),
  endpointRemarks: document.getElementById("endpointRemarks"),
  endpointCurl: document.getElementById("endpointCurl"),
  requestBodyWrap: document.getElementById("requestBodyWrap"),
  requestBodyExample: document.getElementById("requestBodyExample"),
  exampleResponses: document.getElementById("exampleResponses"),
  jsonLink: document.getElementById("jsonLink"),
};

function endpointKeyFromPath() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  return decodeURIComponent(String(segments[segments.length - 1] || "").trim());
}

function toAbsoluteServiceUrl(path, endpoint) {
  const safePath = String(path || "").trim() || "/";
  if (/^https?:\/\//i.test(safePath)) return safePath;

  if (endpoint?.service === "aggregator") {
    return resolveSiteHref("aggregator", {
      path: safePath,
      location: window.location,
    });
  }

  return new URL(alteredUrl(safePath), window.location.origin).toString();
}

function buildExamplePath(endpoint) {
  let path = String(endpoint?.path || "");
  const params = Array.isArray(endpoint?.pathParams) ? endpoint.pathParams : [];
  params.forEach((param) => {
    const replacement = param.example || `<${param.name}>`;
    path = path.replace(`:${param.name}`, replacement);
  });
  return path;
}

function buildCurl(endpoint) {
  const url = toAbsoluteServiceUrl(buildExamplePath(endpoint), endpoint);
  if (String(endpoint?.method || "GET").toUpperCase() === "POST") {
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
        <div class="code-block">
          <div class="code-label">${esc(String(item.status || 200))} ${esc(item.label || "Response")}</div>
          <pre><code>${esc(item.body || "{}")}</code></pre>
          ${item.description ? `<div style="padding:0 0.7rem 0.7rem;color:var(--muted);font-size:0.78rem;">${esc(item.description)}</div>` : ""}
        </div>
      `
    )
    .join("");
}

function groupEndpoints(endpoints) {
  const grouped = new Map();
  endpoints.forEach((ep) => {
    const group = String(ep?.group || "Other").trim();
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(ep);
  });
  return [...grouped.entries()]
    .map(([group, items]) => ({ group, items }))
    .sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a.group);
      const bi = GROUP_ORDER.indexOf(b.group);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.group.localeCompare(b.group);
    });
}

function renderEndpoint(endpoint, catalog) {
  const svcLabel = endpoint.service === "aggregator" ? " (aggregator)" : "";

  document.title = `${endpoint.title || endpoint.key || "Endpoint"} | Altered Public API`;
  elements.sidebarTitle.textContent = endpoint.title || endpoint.key || "Endpoint";
  elements.topbarSummary.textContent = `${endpoint.method || "GET"} ${endpoint.path || ""}${svcLabel}`;
  elements.endpointGroup.textContent = (endpoint.group || "Reference") + svcLabel;
  elements.endpointTitle.textContent = endpoint.title || endpoint.key || "Endpoint";
  elements.endpointMethod.textContent = endpoint.method || "GET";
  elements.endpointMethod.className = `method-badge ${String(endpoint.method || "GET").toLowerCase()}`;
  elements.endpointAccess.textContent = endpoint.access || "public";
  elements.endpointAccess.className = `status-badge ${endpoint.access || "public"}`;
  elements.endpointStability.textContent = endpoint.stability || "existing";
  elements.endpointStability.className = `status-badge ${endpoint.stability || "existing"}`;
  elements.endpointDescription.textContent = endpoint.description || "";
  elements.endpointPath.textContent = endpoint.path || "-";
  globalThis.XjkSafeHtml.set(elements.headerParams, renderParamRows(endpoint.headers));
  globalThis.XjkSafeHtml.set(elements.pathParams, renderParamRows(endpoint.pathParams));
  globalThis.XjkSafeHtml.set(elements.queryParams, renderParamRows(endpoint.queryParams));
  globalThis.XjkSafeHtml.set(elements.endpointRemarks, renderRemarks(endpoint.remarks));
  elements.endpointCurl.textContent = buildCurl(endpoint);
  globalThis.XjkSafeHtml.set(elements.exampleResponses, renderExampleResponses(endpoint.exampleResponses));

  elements.openEndpointBtn.href = toAbsoluteServiceUrl(buildExamplePath(endpoint), endpoint) || alteredUrl("/api/");
  elements.openEndpointBtn.textContent = endpoint.service === "aggregator" ? "Open on Aggregator" : "Open Live Route";
  elements.jsonLink.href = alteredUrl("/api/v1/public/endpoints");

  if (endpoint.requestBodyExample) {
    elements.requestBodyWrap.classList.remove("hidden");
    elements.requestBodyExample.textContent = endpoint.requestBodyExample;
  } else {
    elements.requestBodyWrap.classList.add("hidden");
  }

  const allEndpoints = Array.isArray(catalog?.endpoints) ? catalog.endpoints : [];
  const currentGroup = String(endpoint.group || "Other").trim();
  const currentKey = String(endpoint.key || "");
  const groups = groupEndpoints(allEndpoints);

  globalThis.XjkSafeHtml.set(
    elements.otherEndpoints,
    groups
      .map(
        ({ group, items }) => `
      <details class="sidebar-dropdown"${group === currentGroup ? " open" : ""}>
        <summary>${esc(group)}<span class="sidebar-count">${items.length}</span></summary>
        <div class="sidebar-dropdown-items">
          ${withDepth(items)
            .map(({ ep: item, depth }) => {
              const isActive = String(item.key || "") === currentKey;
              return `<a class="sidebar-ep${isActive ? " active" : ""}" style="--depth:${depth}" href="${esc(alteredUrl(`/api/endpoints/${encodeURIComponent(item.key)}`))}">
              <span class="method-pip ${esc(String(item.method || "GET").toLowerCase())}">${esc(item.method || "GET")}</span>
              <span class="sidebar-ep-title">${esc(item.title || item.key || "Endpoint")}</span>
              ${item.service === "aggregator" ? '<span class="sidebar-svc">agg</span>' : ""}
            </a>`;
            })
            .join("")}
        </div>
      </details>
    `
      )
      .join("")
  );
}

async function boot() {
  const key = endpointKeyFromPath();
  const catalog = await fetchJson(alteredUrl("/api/v1/public/endpoints"));
  const endpoint = (Array.isArray(catalog?.endpoints) ? catalog.endpoints : []).find(
    (item) => String(item?.key || "").trim() === key
  );

  if (!endpoint) {
    document.title = "Endpoint Not Found | Altered Public API";
    elements.sidebarTitle.textContent = "Not Found";
    elements.topbarSummary.textContent = "Endpoint not found.";
    elements.endpointGroup.textContent = "Reference";
    elements.endpointTitle.textContent = "Endpoint not found";
    elements.endpointDescription.textContent = `No endpoint matched "${key}".`;
    elements.endpointPath.textContent = alteredUrl("/api/");
    globalThis.XjkSafeHtml.set(elements.headerParams, renderParamRows([]));
    globalThis.XjkSafeHtml.set(elements.pathParams, renderParamRows([]));
    globalThis.XjkSafeHtml.set(elements.queryParams, renderParamRows([]));
    globalThis.XjkSafeHtml.set(
      elements.endpointRemarks,
      `<p class="inline-empty">Return to the API index and choose a documented endpoint.</p>`
    );
    elements.endpointCurl.textContent = `curl "${window.location.origin}${alteredUrl("/api/v1/public/endpoints")}"`;
    globalThis.XjkSafeHtml.set(
      elements.exampleResponses,
      `<p class="inline-empty">No example responses available.</p>`
    );
    elements.openEndpointBtn.href = alteredUrl("/api/");
    elements.openEndpointBtn.textContent = "Back to Index";
    return;
  }

  renderEndpoint(endpoint, catalog);
}

boot().catch((error) => {
  console.error(error);
  document.title = "Endpoint Error | Altered Public API";
  elements.sidebarTitle.textContent = "Load Error";
  elements.topbarSummary.textContent = error.message || "Failed to load endpoint.";
  elements.endpointTitle.textContent = "Failed to load endpoint";
  elements.endpointDescription.textContent = error.message || "Unknown error.";
  globalThis.XjkSafeHtml.set(elements.headerParams, renderParamRows([]));
  globalThis.XjkSafeHtml.set(elements.pathParams, renderParamRows([]));
  globalThis.XjkSafeHtml.set(elements.queryParams, renderParamRows([]));
  globalThis.XjkSafeHtml.set(
    elements.endpointRemarks,
    `<p class="inline-empty">${esc(error.message || "Unknown error.")}</p>`
  );
  globalThis.XjkSafeHtml.set(
    elements.exampleResponses,
    `<p class="inline-empty">${esc(error.message || "Unknown error.")}</p>`
  );
});
