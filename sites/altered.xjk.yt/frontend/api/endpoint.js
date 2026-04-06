const GROUP_ORDER = ["Maps", "Alterations", "Leaderboards", "Clubs", "Hub", "Tracker", "Aggregator", "Webhooks", "Catalog"];
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

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function endpointKeyFromPath() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  return decodeURIComponent(String(segments[segments.length - 1] || "").trim());
}

function toAbsoluteServiceUrl(path, endpoint) {
  const safePath = String(path || "").trim() || "/";
  if (/^https?:\/\//i.test(safePath)) return safePath;

  if (endpoint?.service === "aggregator") {
    const host = String(window.location.hostname || "").toLowerCase();
    const port = window.location.port ? `:${window.location.port}` : "";
    if (host === "localhost" || host === "127.0.0.1") {
      return new URL(`/aggregator${safePath}`, window.location.origin).toString();
    }
    if (host.endsWith(".localhost")) {
      return `${window.location.protocol}//aggregator.localhost${port}${safePath}`;
    }
    return `${window.location.protocol}//aggregator.xjk.yt${safePath}`;
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
    return `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -d '${endpoint.requestBodyExample || "{\"example\":true}"}'`;
  }
  return `curl "${url}"`;
}

function renderParamRows(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="param-row"><div class="param-name">None</div><div class="param-detail">No entries for this section.</div></div>`;
  }
  return items
    .map(
      (item) => `
        <div class="param-row">
          <div class="param-name">${esc(item.name || "-")}</div>
          <div class="param-detail">
            ${item.value ? `<div><code>${esc(item.value)}</code></div>` : ""}
            ${esc(item.description || "No description.")}
            <div style="margin-top:.15rem;">
              ${item.type ? `type=<code>${esc(item.type)}</code>` : ""}${
                item.required === true ? " | required" : item.required === false ? " | optional" : ""
              }${item.default !== undefined ? ` | default=<code>${esc(String(item.default))}</code>` : ""}
            </div>
          </div>
        </div>
      `
    )
    .join("");
}

function renderRemarks(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<p class="inline-empty">No additional remarks for this endpoint.</p>`;
  }
  return `<ul class="note-list">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
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

function withDepth(items) {
  const sorted = [...items].sort((a, b) => String(a.path || "").localeCompare(String(b.path || "")));
  return sorted.map((ep) => {
    const p = String(ep.path || "");
    const depth = sorted.filter((o) => { const op = String(o.path || ""); return op !== p && p.startsWith(op + "/"); }).length;
    return { ep, depth };
  });
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
  elements.headerParams.innerHTML = renderParamRows(endpoint.headers);
  elements.pathParams.innerHTML = renderParamRows(endpoint.pathParams);
  elements.queryParams.innerHTML = renderParamRows(endpoint.queryParams);
  elements.endpointRemarks.innerHTML = renderRemarks(endpoint.remarks);
  elements.endpointCurl.textContent = buildCurl(endpoint);
  elements.exampleResponses.innerHTML = renderExampleResponses(endpoint.exampleResponses);

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

  elements.otherEndpoints.innerHTML = groups
    .map(({ group, items }) => `
      <details class="sidebar-dropdown"${group === currentGroup ? " open" : ""}>
        <summary>${esc(group)}<span class="sidebar-count">${items.length}</span></summary>
        <div class="sidebar-dropdown-items">
          ${withDepth(items).map(({ ep: item, depth }) => {
            const isActive = String(item.key || "") === currentKey;
            return `<a class="sidebar-ep${isActive ? " active" : ""}" style="--depth:${depth}" href="${esc(alteredUrl(`/api/endpoints/${encodeURIComponent(item.key)}`))}">
              <span class="method-pip ${esc(String(item.method || "GET").toLowerCase())}">${esc(item.method || "GET")}</span>
              <span class="sidebar-ep-title">${esc(item.title || item.key || "Endpoint")}</span>
              ${item.service === "aggregator" ? '<span class="sidebar-svc">agg</span>' : ""}
            </a>`;
          }).join("")}
        </div>
      </details>
    `).join("");
}

async function fetchJson(url) {
  const response = await fetch(alteredUrl(url), { headers: { Accept: "application/json" } });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status}).`);
  return payload;
}

async function boot() {
  const key = endpointKeyFromPath();
  const catalog = await fetchJson("/api/v1/public/endpoints");
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
    elements.headerParams.innerHTML = renderParamRows([]);
    elements.pathParams.innerHTML = renderParamRows([]);
    elements.queryParams.innerHTML = renderParamRows([]);
    elements.endpointRemarks.innerHTML = `<p class="inline-empty">Return to the API index and choose a documented endpoint.</p>`;
    elements.endpointCurl.textContent = `curl "${window.location.origin}${alteredUrl("/api/v1/public/endpoints")}"`;
    elements.exampleResponses.innerHTML = `<p class="inline-empty">No example responses available.</p>`;
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
  elements.headerParams.innerHTML = renderParamRows([]);
  elements.pathParams.innerHTML = renderParamRows([]);
  elements.queryParams.innerHTML = renderParamRows([]);
  elements.endpointRemarks.innerHTML = `<p class="inline-empty">${esc(error.message || "Unknown error.")}</p>`;
  elements.exampleResponses.innerHTML = `<p class="inline-empty">${esc(error.message || "Unknown error.")}</p>`;
});
