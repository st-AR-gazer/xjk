import "/shared/xjk-core/safe-html.js?v=2";
import { fetchJson } from "/shared/xjk-core/http.js";
import { createEventRow } from "../rendering.js";
import { PER_PAGE, fmtNumber, state, updatePaginationUI } from "./dashboardRuntime.js";

function toDatetimeLocalInputValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function setEventRangeInputsEnabled() {
  const range = document.getElementById("eventsRangeFilter").value || "24h";
  const custom = range === "custom";
  document.getElementById("eventsFrom").disabled = !custom;
  document.getElementById("eventsTo").disabled = !custom;
}

function deriveEventTimeRange(filters) {
  const range = String(filters.range || "24h").toLowerCase();
  const now = Date.now();
  let fromIso = "";
  let toIso = "";

  if (range === "custom") {
    const fromMs = Date.parse(String(filters.fromIso || ""));
    const toMs = Date.parse(String(filters.toIso || ""));
    if (Number.isFinite(fromMs)) fromIso = new Date(fromMs).toISOString();
    if (Number.isFinite(toMs)) toIso = new Date(toMs).toISOString();
    return { fromIso, toIso };
  }
  if (range === "all") return { fromIso: "", toIso: "" };

  const lookup = {
    "1h": 1,
    "6h": 6,
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
  };
  const hours = Number(lookup[range] || 24);
  fromIso = new Date(now - hours * 60 * 60 * 1000).toISOString();
  toIso = "";
  return { fromIso, toIso };
}

function readEventFiltersFromUI() {
  const range = document.getElementById("eventsRangeFilter").value || "24h";
  const fromLocal = String(document.getElementById("eventsFrom").value || "").trim();
  const toLocal = String(document.getElementById("eventsTo").value || "").trim();
  return {
    projectKey: String(document.getElementById("eventsProjectFilter").value || "").trim(),
    source: String(document.getElementById("eventsSourceFilter").value || "").trim(),
    eventType: String(document.getElementById("eventsTypeFilter").value || "").trim(),
    range,
    fromIso: fromLocal ? new Date(fromLocal).toISOString() : "",
    toIso: toLocal ? new Date(toLocal).toISOString() : "",
    q: String(document.getElementById("eventsQuery").value || "").trim(),
    changedOnly: Boolean(document.getElementById("eventsChangedOnly").checked),
    includeSystem: Boolean(document.getElementById("eventsIncludeSystem").checked),
  };
}

function syncEventFilterControlsFromState() {
  document.getElementById("eventsProjectFilter").value = state.eventFilters.projectKey || "";
  document.getElementById("eventsSourceFilter").value = state.eventFilters.source || "";
  document.getElementById("eventsTypeFilter").value = state.eventFilters.eventType || "";
  document.getElementById("eventsRangeFilter").value = state.eventFilters.range || "24h";
  document.getElementById("eventsFrom").value = state.eventFilters.fromIso
    ? toDatetimeLocalInputValue(new Date(state.eventFilters.fromIso))
    : "";
  document.getElementById("eventsTo").value = state.eventFilters.toIso
    ? toDatetimeLocalInputValue(new Date(state.eventFilters.toIso))
    : "";
  document.getElementById("eventsQuery").value = state.eventFilters.q || "";
  document.getElementById("eventsChangedOnly").checked = Boolean(state.eventFilters.changedOnly);
  document.getElementById("eventsIncludeSystem").checked = Boolean(state.eventFilters.includeSystem);
  setEventRangeInputsEnabled();
}

function populateEventFilterOptions() {
  const projectSelect = document.getElementById("eventsProjectFilter");
  const sourceSelect = document.getElementById("eventsSourceFilter");
  const typeSelect = document.getElementById("eventsTypeFilter");
  if (!projectSelect || !sourceSelect || !typeSelect) return;

  const selectedProject = state.eventFilters.projectKey || "";
  const selectedSource = state.eventFilters.source || "";
  const selectedType = state.eventFilters.eventType || "";

  globalThis.XjkSafeHtml.set(projectSelect, '<option value="">All projects</option>');
  for (const project of state.projects) {
    const option = document.createElement("option");
    option.value = String(project.projectKey || "");
    option.textContent = String(project.projectName || project.projectKey || "");
    projectSelect.appendChild(option);
  }
  projectSelect.value = [...projectSelect.options].some((opt) => opt.value === selectedProject) ? selectedProject : "";

  const sources =
    state.eventFacets.sources.length > 0
      ? state.eventFacets.sources
      : [...new Set(state.projects.map((project) => String(project.sourceLabel || "").trim()).filter(Boolean))].sort(
          (a, b) => a.localeCompare(b)
        );
  globalThis.XjkSafeHtml.set(sourceSelect, '<option value="">All sources</option>');
  for (const source of sources) {
    const option = document.createElement("option");
    option.value = source;
    option.textContent = source;
    sourceSelect.appendChild(option);
  }
  sourceSelect.value = [...sourceSelect.options].some((opt) => opt.value === selectedSource) ? selectedSource : "";

  const eventTypes = state.eventFacets.eventTypes || [];
  globalThis.XjkSafeHtml.set(typeSelect, '<option value="">All events</option>');
  for (const eventType of eventTypes) {
    const option = document.createElement("option");
    option.value = eventType;
    option.textContent = eventType;
    typeSelect.appendChild(option);
  }
  typeSelect.value = [...typeSelect.options].some((opt) => opt.value === selectedType) ? selectedType : "";

  state.eventFilters.projectKey = projectSelect.value;
  state.eventFilters.source = sourceSelect.value;
  state.eventFilters.eventType = typeSelect.value;
}

async function loadEventFacets() {
  const range = deriveEventTimeRange(state.eventFilters);
  const params = new URLSearchParams();
  if (state.eventFilters.projectKey) params.set("project_key", state.eventFilters.projectKey);
  if (state.eventFilters.includeSystem) params.set("include_system", "1");
  if (range.fromIso) params.set("from_iso", range.fromIso);
  if (range.toIso) params.set("to_iso", range.toIso);

  const payload = await fetchJson(`/api/v1/events/facets?${params.toString()}`);
  state.eventFacets.sources = Array.isArray(payload?.sources) ? payload.sources : [];
  state.eventFacets.eventTypes = Array.isArray(payload?.eventTypes) ? payload.eventTypes : [];
  populateEventFilterOptions();
  syncEventFilterControlsFromState();
}

async function loadEvents({ page = state.eventsMeta.page } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const range = deriveEventTimeRange(state.eventFilters);
  const requestedPageSize = Number(
    document.getElementById("eventsPageSize")?.value || state.eventsMeta.pageSize || PER_PAGE
  );
  state.eventsMeta.pageSize = Math.max(1, Math.min(500, requestedPageSize || PER_PAGE));
  const params = new URLSearchParams();
  params.set("limit", String(state.eventsMeta.pageSize || PER_PAGE));
  params.set("page", String(safePage));
  if (state.eventFilters.projectKey) params.set("project_key", state.eventFilters.projectKey);
  if (state.eventFilters.source) params.set("source", state.eventFilters.source);
  if (state.eventFilters.eventType) params.set("event_type", state.eventFilters.eventType);
  if (state.eventFilters.changedOnly) params.set("changed_only", "1");
  if (state.eventFilters.includeSystem) params.set("include_system", "1");
  if (range.fromIso) params.set("from_iso", range.fromIso);
  if (range.toIso) params.set("to_iso", range.toIso);
  if (state.eventFilters.q) params.set("q", state.eventFilters.q);

  const payload = await fetchJson(`/api/v1/events/recent?${params.toString()}`);
  state.events = payload?.events || [];
  state.eventsMeta.page = Math.max(1, Number(payload?.page || safePage));
  state.eventsMeta.pageSize = Math.max(1, Number(payload?.limit || state.eventsMeta.pageSize || PER_PAGE));
  state.eventsMeta.total = Math.max(0, Number(payload?.total || state.events.length));
  state.eventsMeta.totalPages = Math.max(1, Number(payload?.totalPages || 1));
  renderEvents();
}

function renderEvents() {
  const page = state.eventsMeta.page;
  const totalPages = state.eventsMeta.totalPages;
  const total = state.eventsMeta.total;

  document.getElementById("eventsCount").textContent = `${fmtNumber(total)} events`;
  const body = document.getElementById("eventsBody");
  body.replaceChildren();

  if (!state.events.length) {
    globalThis.XjkSafeHtml.set(body, '<tr><td colspan="5" class="muted">No events yet.</td></tr>');
  } else {
    state.events.forEach((row) => {
      body.appendChild(createEventRow(document, row));
    });
  }

  updatePaginationUI("events", page, totalPages);
  const jump = document.getElementById("eventsPageJump");
  if (jump) {
    jump.min = "1";
    jump.max = String(Math.max(1, totalPages));
    jump.value = String(page);
  }
}

export {
  loadEventFacets,
  loadEvents,
  populateEventFilterOptions,
  readEventFiltersFromUI,
  renderEvents,
  setEventRangeInputsEnabled,
  syncEventFilterControlsFromState,
};
