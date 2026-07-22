import "/shared/xjk-core/safe-html.js?v=2";
import { fetchJson } from "/shared/xjk-core/http.js";
import { createProjectMapRow } from "../rendering.js";
import { populateEventFilterOptions, syncEventFilterControlsFromState } from "./eventsPanel.js";
import { fmtNumber, paginate, state, updatePaginationUI } from "./dashboardRuntime.js";

async function loadProjects() {
  const payload = await fetchJson("/api/v1/projects?limit=120");
  const projects = payload?.projects || [];
  state.projects = projects;
  const select = document.getElementById("projectSelect");
  const previous = state.projectKey;

  select.replaceChildren();
  projects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.projectKey;
    option.textContent = `${project.projectName} (${project.projectKey})`;
    select.appendChild(option);
  });

  state.projectKey =
    projects.find((project) => project.projectKey === previous)?.projectKey || projects[0]?.projectKey || "";
  select.value = state.projectKey;
  populateEventFilterOptions();
  syncEventFilterControlsFromState();
}

function isDisplaynameProject(project) {
  const key = String(project?.projectKey || "").toLowerCase();
  const name = String(project?.projectName || "").toLowerCase();
  return key.includes("displayname") || name.includes("displayname");
}

function setProjectTableHeaders(labels = ["Map", "Checks", "Changes", "Last Checked"]) {
  const ids = ["projectCol1", "projectCol2", "projectCol3", "projectCol4"];
  ids.forEach((id, idx) => {
    const el = document.getElementById(id);
    if (el) el.textContent = labels[idx] || "-";
  });
}

async function loadProjectData() {
  const key = state.projectKey || document.getElementById("projectSelect").value;
  if (!key) return;
  state.projectKey = key;
  const project = state.projects.find((item) => item.projectKey === key) || null;
  const displaynameMode = isDisplaynameProject(project);
  state.projectView = displaynameMode ? "displayname" : "maps";

  const changedOnlyToggle = document.getElementById("changedOnly");
  const changedOnly = changedOnlyToggle.checked ? "1" : "0";
  changedOnlyToggle.disabled = displaynameMode;
  if (displaynameMode) changedOnlyToggle.checked = false;

  const instancesPromise = fetchJson(`/api/v1/projects/${encodeURIComponent(key)}/instances?limit=80`);
  let rowsPromise;
  if (displaynameMode) {
    setProjectTableHeaders(["Account", "Name", "Source", "Observed"]);
    rowsPromise = fetchJson("/api/v1/display-names?limit=500");
  } else {
    setProjectTableHeaders(["Map", "Checks", "Changes", "Last Checked"]);
    rowsPromise = fetchJson(`/api/v1/projects/${encodeURIComponent(key)}/maps?limit=500&changed_only=${changedOnly}`);
  }

  const [rowsPayload, instancesPayload] = await Promise.all([rowsPromise, instancesPromise]);
  state.maps = displaynameMode ? rowsPayload?.names || [] : rowsPayload?.maps || [];
  state.page.maps = 1;
  const suffix = displaynameMode ? " | displayname cache" : "";
  document.getElementById("projectInstances").textContent = `${instancesPayload?.count || 0} active/known${suffix}`;
  renderMaps();
}

function renderMaps() {
  const { slice, page, totalPages, total } = paginate(state.maps, state.page.maps);
  state.page.maps = page;

  const displaynameMode = state.projectView === "displayname";
  document.getElementById("mapsCount").textContent = displaynameMode ? `${total} names` : `${total} maps`;
  const body = document.getElementById("projectMapsBody");
  body.replaceChildren();

  if (!slice.length) {
    globalThis.XjkSafeHtml.set(
      body,
      displaynameMode
        ? '<tr><td colspan="4" class="muted">No display names cached for this project yet.</td></tr>'
        : '<tr><td colspan="4" class="muted">No maps in cache for this project yet.</td></tr>'
    );
  } else {
    slice.forEach((row) => {
      body.appendChild(createProjectMapRow(document, row, { displaynameMode, formatNumber: fmtNumber }));
    });
  }

  updatePaginationUI("maps", page, totalPages);
}

export { loadProjectData, loadProjects, renderMaps };
