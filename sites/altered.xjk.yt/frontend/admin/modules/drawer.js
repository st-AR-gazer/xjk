import "/shared/xjk-core/safe-html.js?v=2";
import { esc, fmtDateTime, fmtDuration, fmtNum, toneClass, toneLabel } from "./formatters.js?v=2";
import { renderClubConfigDrawer, renderNamingDetailDrawer, renderTargetedDnDrawer } from "./naming-detail.js?v=2";
import { resolveWorkspaceHref } from "./request-client.js?v=2";
import { el, state } from "./state.js?v=2";
import { emptyState, field, kv, kvN } from "./ui.js?v=2";

export function renderDrawer() {
  const d = state.drawer;
  if (!d.open) {
    el.drawer.hidden = true;
    el.drawer.setAttribute("aria-hidden", "true");
    el.drawerScrim.hidden = true;
    return;
  }
  el.drawer.hidden = false;
  el.drawer.setAttribute("aria-hidden", "false");
  el.drawerScrim.hidden = false;
  el.drawer?.style.setProperty("--drawer-width", `${state.drawerUi.width}px`);
  el.drawerKicker.textContent = d.kicker || "Detail";
  el.drawerTitle.textContent = d.title || "Detail";
  el.drawerSubtitle.textContent = d.subtitle || "";

  if (d.type === "job-history") {
    renderJobHistoryDrawer(d.payload || {});
    return;
  }
  if (d.type === "map") {
    renderMapDrawer(d.payload || {});
    return;
  }
  if (d.type === "event") {
    renderEventDrawer(d.payload || {});
    return;
  }
  if (d.type === "naming-detail") {
    renderNamingDetailDrawer(d.payload || {});
    return;
  }
  if (d.type === "targeted-displayname") {
    renderTargetedDnDrawer();
    return;
  }
  if (d.type === "club-config") {
    renderClubConfigDrawer(d.payload || {});
    return;
  }
  globalThis.XjkSafeHtml.set(el.drawerBody, emptyState("Nothing to show", "Drawer opened without a payload."));
}

function renderJobHistoryDrawer(p) {
  const items = Array.isArray(p.items) ? p.items : [];
  globalThis.XjkSafeHtml.set(
    el.drawerBody,
    `
    <div class="drawer-section" style="flex-direction:row;align-items:center;gap:.5rem;">
      <span class="pill tone-info">${esc(fmtNum(p.total || 0))} run(s)</span>
      ${p.hasMore ? `<button class="btn outline small" type="button" data-drawer-more-history="${esc(p.jobKey || "")}">Load More</button>` : ""}
    </div>
    ${items.length ? items.map(renderHistoryItem).join("") : emptyState("No history", "No stored runs yet.")}
  `
  );
}

function renderHistoryItem(item) {
  return `
    <div class="drawer-section">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;">
        <div><h3 style="font-size:.92rem;">${esc(item.summary || "Run")}</h3><p style="font-size:.76rem;color:var(--a-muted);">${esc(fmtDateTime(item.finishedAt || item.startedAt))}</p></div>
        <span class="pill ${toneClass(item.state)}">${esc(toneLabel(item.state))}</span>
      </div>
      ${item.detail ? `<p class="card-body">${esc(item.detail)}</p>` : ""}
      <div class="drawer-kv">
        ${kv("Started", fmtDateTime(item.startedAt))}
        ${kv("Finished", fmtDateTime(item.finishedAt))}
        ${kv("Duration", fmtDuration(item.durationMs))}
        ${kv("ID", item.id || "-")}
      </div>
    </div>
  `;
}

function renderMapDrawer(map) {
  const d = map.detail || {};
  const canCheck = Boolean(d.opsMonitorUserId);
  globalThis.XjkSafeHtml.set(
    el.drawerBody,
    `
    <div class="drawer-section">
      <div class="drawer-kv">
        ${kvN("Campaign", map.campaignName || d.campaign || "Unassigned")}
        ${kv("Slot", d.slot || map.slot || "-")}
        ${kv("Tracked", map.tracked ? "Yes" : "No")}
        ${kv("Status", map.status || d.status || "live")}
        ${kv("Last Checked", fmtDateTime(map.lastCheckedAt))}
        ${kv("Last WR Change", fmtDateTime(map.lastWrChangeAt))}
      </div>
      <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.5rem;">
        <button class="btn primary small" type="button" data-map-command="track" data-map-uid="${esc(map.mapUid)}">Track</button>
        <button class="btn outline small" type="button" data-map-command="pause" data-map-uid="${esc(map.mapUid)}">Pause</button>
        <button class="btn outline small" type="button" data-map-command="history" data-map-uid="${esc(map.mapUid)}">History</button>
        <button class="btn ghost small" type="button" data-map-command="check-now" data-map-uid="${esc(map.mapUid)}" ${canCheck ? "" : "disabled"}>Check Now</button>
        <a class="btn ghost small" href="${esc(resolveWorkspaceHref(`/api/v1/public/maps/${encodeURIComponent(map.mapUid)}`))}" target="_blank" rel="noreferrer">Open API JSON</a>
      </div>
      ${d.opsLastError ? `<p style="font-size:.82rem;color:var(--a-err);margin-top:.3rem;">${esc(d.opsLastError)}</p>` : ""}
    </div>
    <div class="drawer-section">
      <h3 style="font-size:.92rem;">Move to Campaign</h3>
      <form data-drawer-form="move-map" class="config-form" style="margin-top:.3rem;">
        <input type="hidden" name="mapUid" value="${esc(map.mapUid)}" />
        ${field("Campaign", "campaignName", "text", map.campaignName || d.campaign || "")}
        ${field("Slot", "slot", "number", d.slot || map.slot || 1, { min: 1 })}
        <div class="form-footer"><button class="btn primary small" type="submit">Move</button></div>
      </form>
    </div>
    <div class="drawer-section">
      <h3 style="font-size:.92rem;">Details</h3>
      <div class="drawer-kv">
        ${kv("UID", map.mapUid)}
        ${kv("Map ID", d.mapId || "-")}
        ${kvN("WR Holder", d.wrHolder || "-")}
        ${kv("WR ms", d.wrMs || 0)}
        ${kv("Players", d.playerCount || 0)}
        ${kv("Ops User", d.opsMonitorUserEmail || "-")}
      </div>
    </div>
  `
  );
}

function renderEventDrawer(ev) {
  const meta = Object.entries(ev.meta || {});
  globalThis.XjkSafeHtml.set(
    el.drawerBody,
    `
    <div class="drawer-section">
      <span class="pill ${toneClass(ev.status || ev.kind)}">${esc(toneLabel(ev.status || ev.kind))}</span>
      <p class="card-body">${esc(ev.summary || "No summary.")}</p>
      ${ev.detail ? `<p style="font-size:.82rem;color:var(--a-muted);margin-top:.2rem;">${esc(ev.detail)}</p>` : ""}
    </div>
    <div class="drawer-section">
      <div class="drawer-kv">
        ${kv("Kind", ev.kind || "-")}
        ${kv("When", fmtDateTime(ev.createdAt))}
        ${kv("Map UID", ev.mapUid || "-")}
        ${kv("Job Key", ev.jobKey || "-")}
      </div>
    </div>
    <div class="drawer-section">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;">
        <h3 style="font-size:.92rem;">Metadata</h3>
        ${ev.mapUid ? `<button class="btn ghost small" type="button" data-map-command="history" data-map-uid="${esc(ev.mapUid)}">Map History</button>` : ""}
      </div>
      <div class="g1" style="margin-top:.3rem;">
        ${meta.length ? meta.map(([k, v]) => `<div class="stat-card"><div class="label">${esc(k)}</div><div class="value">${esc(String(v ?? "-"))}</div></div>`).join("") : `<p class="inline-empty">No metadata.</p>`}
      </div>
    </div>
  `
  );
}
