import "/shared/xjk-core/safe-html.js?v=2";
import {
  esc,
  escN,
  fmtDateTime,
  fmtNum,
  fmtTimeAgo,
  similarityStateMeta,
  toneClass,
  toneLabel,
} from "./formatters.js?v=2";
import { el, state } from "./state.js?v=2";

export function renderAlert(a) {
  return `<div class="alert-row">
    <span class="pill ${toneClass(a.level)}" style="flex-shrink:0;">${esc(toneLabel(a.level))}</span>
    <div class="alert-row-body">
      <strong>${esc(a.title || "Alert")}</strong>
      <span class="alert-row-detail">${esc(a.body || "")} <span class="alert-row-src">${esc(a.source || "")} &middot; ${esc(fmtDateTime(a.createdAt))}</span></span>
    </div>
    ${a.actionTarget ? `<button class="btn ghost small" type="button" data-alert-target="${esc(a.actionTarget)}">${esc(a.actionLabel || "Go")}</button>` : ""}
  </div>`;
}

export function renderTlItem(ev) {
  return `<div class="tl-row" data-open-event='${esc(JSON.stringify(ev))}'>
    <span class="pill ${toneClass(ev.status || ev.kind)}" style="flex-shrink:0;">${esc(toneLabel(ev.status || ev.kind))}</span>
    <div class="tl-row-body">
      <strong>${escN(ev.title || "Event")}</strong>
      <span class="tl-row-summary">${escN(ev.summary || "")}</span>
    </div>
    <span class="tl-row-time">${esc(fmtTimeAgo(ev.createdAt))}</span>
  </div>`;
}

export function statCard(label, value, note = "") {
  return `<div class="stat-card"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>${note ? `<div class="note">${esc(note)}</div>` : ""}</div>`;
}

export function jobStat(label, value) {
  return `<div class="job-stat"><div class="label">${esc(label)}</div><strong>${esc(value)}</strong></div>`;
}

export function jobExtra(label, value) {
  return `<div class="job-extra-item"><div class="label">${esc(label)}</div><strong>${esc(value)}</strong></div>`;
}

export function kv(label, value) {
  return `<div class="kv"><div class="label">${esc(label)}</div><strong>${esc(String(value ?? "-"))}</strong></div>`;
}

export function kvN(label, value) {
  return `<div class="kv"><div class="label">${esc(label)}</div><strong>${escN(String(value ?? "-"))}</strong></div>`;
}

export function subtab(view, label, active) {
  return `<button class="subtab ${view === active ? "active" : ""}" type="button" data-maps-view="${esc(view)}">${esc(label)}</button>`;
}

export function filterBar(formKind, fields, actions) {
  return `<div class="filter-bar"><form data-form-kind="${esc(formKind)}">${fields}<div style="display:flex;gap:.35rem;align-items:end;">${actions}</div></form></div>`;
}

export function tableCard(label, summary, tableHtml) {
  return `<div class="card"><div class="card-header"><div><p class="ws-label">${esc(label)}</p><h3>${summary}</h3></div></div><div class="table-wrap" style="margin-top:.5rem;">${tableHtml}</div></div>`;
}

export function renderNamingFlags(candidate = {}) {
  const similarityMeta = similarityStateMeta(candidate);
  const similarityWarnings = Array.isArray(candidate?.similarityDetails?.diagnosticWarnings)
    ? candidate.similarityDetails.diagnosticWarnings.filter(Boolean)
    : [];
  const flagRows = [
    {
      tone:
        candidate?.localFileStatus === "ready"
          ? "tone-success"
          : candidate?.localFileStatus === "error"
            ? "tone-warn"
            : "tone-warn",
      label: `local:${candidate?.localFileStatus || "missing"}`,
    },
    {
      tone:
        candidate?.signatureStatus === "ready"
          ? "tone-success"
          : candidate?.signatureStatus === "error"
            ? "tone-warn"
            : "tone-warn",
      label: `sig:${candidate?.signatureStatus || "missing"}`,
    },
    {
      tone: similarityMeta.tone,
      label: similarityMeta.label,
    },
    ...(similarityWarnings.length
      ? [
          {
            tone: "tone-warn",
            label: "sim:degraded",
          },
        ]
      : []),
    ...(candidate?.parserWarning
      ? [
          {
            tone: "tone-warn",
            label: "regex:warn",
          },
        ]
      : []),
  ];
  return `<div class="naming-flag-stack">${flagRows
    .map((flag) => `<span class="pill ${flag.tone}">${esc(flag.label)}</span>`)
    .join("")}</div>`;
}

export function renderNamingSimilarityPreview(candidate = {}) {
  const matches = Array.isArray(candidate?.similarityCandidateMatches)
    ? candidate.similarityCandidateMatches.slice(0, 5)
    : [];
  if (!matches.length) {
    return `<p class="inline-empty">No close maps.</p>`;
  }
  const topScore = Number.isFinite(Number(matches[0]?.score)) ? Number(matches[0].score) : null;
  return `<div class="naming-sim-list">${matches
    .map((match, i) => {
      const mapName = match?.mapName || match?.mapUid || "-";
      const score = Number.isFinite(Number(match?.score)) ? Number(match.score) : null;
      const scoreStr = score != null ? score.toFixed(6) : "-";
      const diffStr = i > 0 && score != null && topScore != null ? (score - topScore).toFixed(3) : "";
      return `<div class="naming-sim-row">
        <span class="naming-sim-name">${escN(mapName)}</span>
        ${diffStr ? `<span class="naming-sim-diff">${esc(diffStr)}</span>` : ""}
        <span class="naming-sim-score">${esc(scoreStr)}</span>
      </div>`;
    })
    .join("")}</div>`;
}

export function configSection(id, title, defaultOpen, body) {
  return `<div class="config-section ${defaultOpen ? "open" : ""}" id="${esc(id)}">
    <div class="config-header"><h3>${esc(title)}</h3><span class="config-toggle">&#9660;</span></div>
    <div class="config-body">${body}</div>
  </div>`;
}

export function field(label, name, type, value, attrs = {}) {
  const extra = Object.entries(attrs)
    .map(([k, v]) => `${k}="${esc(String(v))}"`)
    .join(" ");
  return `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" value="${esc(String(value ?? ""))}" ${extra} /></label>`;
}

export function checkField(label, name, checked) {
  return `<div class="field check"><span>${esc(label)}</span><input name="${esc(name)}" type="checkbox" ${checked ? "checked" : ""} /></div>`;
}

export function selOpts(options, selected) {
  return options
    .map(
      ([v, l]) =>
        `<option value="${esc(v)}" ${String(v) === String(selected ?? "") ? "selected" : ""}>${esc(l)}</option>`
    )
    .join("");
}

export function pagination({ page, pageCount, total, unfilteredTotal, hasMore, prevAction, nextAction }) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageCount = Math.max(1, Number(pageCount) || 1);
  const isFiltered = unfilteredTotal !== undefined && Number(unfilteredTotal) !== Number(total);
  const totalLabel = isFiltered
    ? `${esc(fmtNum(total))} of ${esc(fmtNum(unfilteredTotal))} shown`
    : `${esc(fmtNum(total))} total`;
  return `<div class="pagination">
    <span class="page-info">Page <strong>${esc(String(safePage))}</strong> of <strong>${esc(String(safePageCount))}</strong> &middot; ${totalLabel}</span>
    <div class="page-btns">
      <button class="btn ghost small" type="button" data-page-action="maps-first-page" ${safePage > 1 ? "" : "disabled"}>First</button>
      <button class="btn ghost small" type="button" data-page-action="${esc(prevAction)}" ${safePage > 1 ? "" : "disabled"}>Previous</button>
      <form class="page-jump-form" data-form-kind="maps-page-jump" data-page-count="${esc(String(safePageCount))}">
        <span class="page-jump-copy">Go to</span>
        <input
          class="page-jump-input"
          name="page"
          type="number"
          min="1"
          max="${esc(String(safePageCount))}"
          value="${esc(String(safePage))}"
          inputmode="numeric"
        />
        <button class="btn outline small" type="submit">Go</button>
      </form>
      <button class="btn outline small" type="button" data-page-action="${esc(nextAction)}" ${hasMore ? "" : "disabled"}>Next</button>
      <button class="btn outline small" type="button" data-page-action="maps-last-page" ${safePage < safePageCount ? "" : "disabled"}>Last</button>
    </div>
  </div>`;
}

export function loading(msg) {
  return `<div class="empty-state"><span class="pill tone-muted">Loading</span><h3>${esc(msg)}</h3></div>`;
}
export function emptyState(title, copy, tone = "muted") {
  return `<div class="empty-state"><span class="pill tone-${esc(tone)}">Empty</span><h3>${esc(title)}</h3><p>${esc(copy)}</p></div>`;
}

function createToast(msg, type = "info", { autoHideMs = 3500, busy = false } = {}) {
  const div = document.createElement("div");
  div.className = `toast toast-${type}${busy ? " toast-busy" : ""}`;
  globalThis.XjkSafeHtml.set(div, `<span class="toast-dot"></span>${esc(msg)}`);
  el.toastBox.appendChild(div);

  const dismiss = () => div.remove();
  if (Number(autoHideMs || 0) > 0) {
    window.setTimeout(() => {
      div.classList.add("leaving");
      div.addEventListener("animationend", dismiss);
    }, autoHideMs);
  }
  return dismiss;
}

export function toast(msg, type = "info") {
  createToast(msg, type, { autoHideMs: 3500 });
}

export function toastBusy(msg, type = "info") {
  return createToast(msg, type, { autoHideMs: 0, busy: true });
}

export function setBusyButtonsState(key, busy) {
  const selectors = {
    "naming-rebuild": "[data-run-naming-process]",
    "naming-similarity": "[data-run-naming-similarity]",
  };
  const selector = selectors[key];
  if (!selector) return;
  document.querySelectorAll(selector).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (busy) {
      node.setAttribute("disabled", "disabled");
      if (!node.hasAttribute("data-idle-label")) {
        node.setAttribute("data-idle-label", node.textContent || "");
      }
      node.textContent = "Running...";
      return;
    }
    node.removeAttribute("disabled");
    if (node.hasAttribute("data-idle-label")) {
      node.textContent = node.getAttribute("data-idle-label") || node.textContent || "";
      node.removeAttribute("data-idle-label");
    }
  });
}

export function findActiveButton() {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    const direct = active.closest("button, a.btn, [role='button']");
    if (direct) return direct;
  }
  if (state.lastActionControl instanceof HTMLElement && document.contains(state.lastActionControl)) {
    return state.lastActionControl;
  }
  return null;
}

export function lockButtonWhileBusy(node, { label = "Working..." } = {}) {
  if (!(node instanceof HTMLElement)) return () => {};
  const shouldUpdateLabel = label !== null && label !== undefined && String(label) !== "";
  const previousText = node.textContent || "";
  const previousDisabled = node.hasAttribute("disabled");
  const previousAria = node.getAttribute("aria-disabled");
  const previousPointerEvents = node.style.pointerEvents;
  const previousOpacity = node.style.opacity;

  if (!previousDisabled) node.setAttribute("disabled", "disabled");
  node.setAttribute("aria-disabled", "true");
  node.style.pointerEvents = "none";
  node.style.opacity = "0.75";
  if (shouldUpdateLabel && (node.tagName === "BUTTON" || node.classList.contains("btn"))) {
    node.textContent = label;
  }

  return () => {
    if (!previousDisabled) node.removeAttribute("disabled");
    if (previousAria === null) node.removeAttribute("aria-disabled");
    else node.setAttribute("aria-disabled", previousAria);
    node.style.pointerEvents = previousPointerEvents;
    node.style.opacity = previousOpacity;
    if (shouldUpdateLabel && (node.tagName === "BUTTON" || node.classList.contains("btn"))) {
      node.textContent = previousText;
    }
  };
}

export function getAllClubs() {
  const fromSettings = Array.isArray(state.settings?.projectClubs) ? state.settings.projectClubs : [];
  if (fromSettings.length) return fromSettings;
  const fromJobs = Array.isArray(state.clubs?.projectClubs) ? state.clubs.projectClubs : [];
  if (fromJobs.length) return fromJobs;
  const fromJobs2 = Array.isArray(state.jobs?.projectClubs) ? state.jobs.projectClubs : [];
  if (fromJobs2.length) return fromJobs2;
  return Array.isArray(state.dashboard?.projectClubs) ? state.dashboard.projectClubs : [];
}

export function getAllSources() {
  const fromSettings = Array.isArray(state.settings?.projectSources) ? state.settings.projectSources : [];
  if (fromSettings.length) return fromSettings;
  const fromJobs = Array.isArray(state.jobs?.projectSources) ? state.jobs.projectSources : [];
  if (fromJobs.length) return fromJobs;
  return Array.isArray(state.dashboard?.projectSources) ? state.dashboard.projectSources : [];
}

export function findClub({ hookKey = "", clubId = 0 }) {
  const hk = String(hookKey || "")
    .trim()
    .toLowerCase();
  const cid = Number(clubId || 0) || 0;
  return (
    getAllClubs().find((c) => {
      if (
        hk &&
        String(c?.hookKey || "")
          .trim()
          .toLowerCase() === hk
      ) {
        return true;
      }
      if (cid && Number(c?.clubId || 0) === cid) return true;
      return false;
    }) || null
  );
}

export function findSource(sourceKey = "") {
  const key = String(sourceKey || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  return (
    getAllSources().find(
      (source) =>
        String(source?.sourceKey || "")
          .trim()
          .toLowerCase() === key
    ) || null
  );
}

export function findRow(uid) {
  return (
    (Array.isArray(state.maps.data?.rows) ? state.maps.data.rows : []).find((r) => String(r.mapUid) === String(uid)) ||
    null
  );
}
