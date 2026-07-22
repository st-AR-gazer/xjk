import "/shared/xjk-core/safe-html.js?v=2";
import { esc, escN, fmtDateTime, fmtNum, toneClass, toneLabel } from "./formatters.js?v=2";
import { el, state } from "./state.js?v=2";
import { emptyState, loading } from "./ui.js?v=2";

export function renderClubs() {
  const p = state.clubs;
  if (!p) {
    globalThis.XjkSafeHtml.set(el.wsClubs, loading("Loading clubs..."));
    return;
  }
  const clubs = Array.isArray(p.projectClubs) ? p.projectClubs : [];

  globalThis.XjkSafeHtml.set(
    el.wsClubs,
    `
    <p class="card-body" style="margin-bottom:.85rem;">
      All clubs tracked inside the Altered project. Each club syncs campaigns and maps independently.
    </p>
    ${
      clubs.length
        ? `
      <div class="g-auto">
        ${clubs.map(renderClubCard).join("")}
      </div>
    `
        : emptyState("No clubs configured", "Add a club through the Settings panel to begin tracking.")
    }
  `
  );
}

export function renderClubCard(club) {
  const status = club.enabled === false ? "paused" : club.lastError ? "error" : club.latestRun ? "success" : "info";
  const lastSync = club.lastSyncedAt || club.latestRun?.finishedAt || club.latestRun?.startedAt || null;
  return `
    <div class="club-card">
      <div class="club-top">
        <div>
          <h3>${escN(club.clubName || `Club ${club.clubId || "-"}`)}</h3>
          <span class="club-id">ID: ${esc(String(club.clubId || "-"))}${club.primary ? " &middot; Primary" : ""}${club.liveMonitorClub ? " &middot; Monitor" : ""}</span>
        </div>
        <span class="pill ${toneClass(status)}">${esc(toneLabel(status))}</span>
      </div>
      <div class="club-stats">
        <span>${esc(fmtNum(club.campaignCount || 0))} campaigns</span>
        <span>${esc(fmtNum(club.mapCount || 0))} maps</span>
        <span>${esc(fmtNum(club.trackedCount || 0))} tracked</span>
      </div>
      <div class="card-meta">
        <span>${esc(club.hookKey || "hook")}</span>
        <span>${esc(club.sourceLabel || "-")}</span>
        <span>${esc(fmtDateTime(lastSync))}</span>
      </div>
      ${club.lastError ? `<p style="font-size:.8rem;color:var(--a-err);margin-top:.2rem;">${esc(club.lastError)}</p>` : ""}
      <div class="club-actions">
        <button class="btn primary small" type="button" data-club-action="sync" data-club-id="${esc(String(club.clubId || 0))}" data-hook-key="${esc(club.hookKey || "")}">Sync</button>
        <button class="btn outline small" type="button" data-club-action="monitor" data-club-id="${esc(String(club.clubId || 0))}">Set as Monitor</button>
        <button class="btn ghost small" type="button" data-club-action="manage" data-club-id="${esc(String(club.clubId || 0))}" data-hook-key="${esc(club.hookKey || "")}">Edit</button>
      </div>
    </div>
  `;
}

export function clubMiniCard(club) {
  const status = club.enabled === false ? "paused" : club.lastError ? "error" : club.latestRun ? "success" : "info";
  return `
    <div class="club-card" style="padding:.65rem;">
      <div class="club-top">
        <div>
          <h3 style="font-size:.92rem;">${escN(club.clubName || `Club ${club.clubId || "-"}`)}</h3>
          <span class="club-id">ID: ${esc(String(club.clubId || "-"))}</span>
        </div>
        <span class="pill ${toneClass(status)}" style="font-size:.62rem;">${esc(toneLabel(status))}</span>
      </div>
      <div class="club-stats" style="font-size:.75rem;">
        <span>${esc(fmtNum(club.campaignCount || 0))} campaigns</span>
        <span>${esc(fmtNum(club.mapCount || 0))} maps</span>
      </div>
      <div class="club-actions" style="margin-top:.15rem;">
        <button class="btn primary small" type="button" data-club-action="sync" data-club-id="${esc(String(club.clubId || 0))}" data-hook-key="${esc(club.hookKey || "")}">Sync</button>
        <button class="btn ghost small" type="button" data-club-action="manage" data-club-id="${esc(String(club.clubId || 0))}" data-hook-key="${esc(club.hookKey || "")}">Edit</button>
      </div>
    </div>
  `;
}

export function renderSourceCard(source) {
  const status =
    source.enabled === false ? "paused" : source.lastError ? "error" : source.lastSyncedAt ? "success" : "info";
  const summary = source.summary || {};
  return `
    <div class="club-card">
      <div class="club-top">
        <div>
          <h3>${escN(source.displayName || source.sourceKey || "Source")}</h3>
          <span class="club-id">Key: ${esc(String(source.sourceKey || "-"))}</span>
        </div>
        <span class="pill ${toneClass(status)}">${esc(toneLabel(status))}</span>
      </div>
      <div class="club-stats">
        <span>${esc(fmtNum(source.campaignCount || 0))} campaigns</span>
        <span>${esc(fmtNum(source.mapCount || 0))} maps</span>
        <span>${esc(fmtNum(source.trackedCount || 0))} tracked</span>
      </div>
      <div class="club-stats" style="font-size:.75rem;">
        <span>${esc(source.sourceLabel || "-")}</span>
        ${source.lastSyncedAt ? `<span>${esc(fmtDateTime(source.lastSyncedAt))}</span>` : ""}
        ${source.nextScheduledSyncAt ? `<span>Next ${esc(fmtDateTime(source.nextScheduledSyncAt))}</span>` : ""}
      </div>
      ${source.lastError ? `<p style="font-size:.8rem;color:var(--a-err);margin-top:.2rem;">${esc(source.lastError)}</p>` : ""}
      <div class="club-actions">
        <button class="btn primary small" type="button" data-source-action="sync" data-source-key="${esc(String(source.sourceKey || ""))}">Sync</button>
        ${summary?.latestWeek ? `<span class="pill tone-info">Week ${esc(String(summary.latestWeek))}</span>` : ""}
      </div>
    </div>
  `;
}

export function sourceMiniCard(source) {
  const status =
    source.enabled === false ? "paused" : source.lastError ? "error" : source.lastSyncedAt ? "success" : "info";
  return `
    <div class="club-card" style="padding:.65rem;">
      <div class="club-top">
        <div>
          <h3 style="font-size:.92rem;">${escN(source.displayName || source.sourceKey || "Source")}</h3>
          <span class="club-id">Key: ${esc(String(source.sourceKey || "-"))}</span>
        </div>
        <span class="pill ${toneClass(status)}">${esc(toneLabel(status))}</span>
      </div>
      <div class="club-stats" style="font-size:.75rem;">
        <span>${esc(fmtNum(source.campaignCount || 0))} campaigns</span>
        <span>${esc(fmtNum(source.mapCount || 0))} maps</span>
        ${source.nextScheduledSyncAt ? `<span>${esc(fmtDateTime(source.nextScheduledSyncAt))}</span>` : ""}
      </div>
      <div class="club-actions" style="margin-top:.15rem;">
        <button class="btn primary small" type="button" data-source-action="sync" data-source-key="${esc(String(source.sourceKey || ""))}">Sync</button>
      </div>
    </div>
  `;
}
