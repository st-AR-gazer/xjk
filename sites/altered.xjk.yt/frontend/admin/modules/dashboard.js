import "/shared/xjk-core/safe-html.js?v=2";
import { clubMiniCard, sourceMiniCard } from "./clubs.js?v=2";
import { alertCheckCount, esc, escN, fmtBytes, fmtNum, toneClass, toneLabel } from "./formatters.js?v=2";
import { renderSimilarityBackfillControls, renderSimilarityBackfillStatus } from "./similarity-progress.js?v=2";
import { el, state } from "./state.js?v=2";
import { getAllClubs, getAllSources, loading, renderAlert, renderTlItem, statCard } from "./ui.js?v=2";

export function renderDashboard() {
  const d = state.dashboard;
  if (!d) {
    globalThis.XjkSafeHtml.set(el.wsDashboard, loading("Loading..."));
    return;
  }
  const c = d.counters || {};
  const alerts = Array.isArray(d.alerts) ? d.alerts : [];
  const events = Array.isArray(d.recentEvents) ? d.recentEvents : [];
  const clubs = d.projectClubs || getAllClubs();
  const sources = d.projectSources || getAllSources();

  globalThis.XjkSafeHtml.set(
    el.wsDashboard,
    `
    ${renderCompatibilityBanner(d)}
    <div class="hero-banner">
      <div>
        <span class="pill ${toneClass(d.health?.state)}">${esc(toneLabel(d.health?.state))}</span>
        <h3>${esc(d.health?.summary || "System ready.")}</h3>
        <p class="card-body">Quick overview of health, jobs, and clubs.</p>
        <div class="hero-actions">
          <button class="btn primary" type="button" data-job-action="run-full-sync" data-job-key="club-full-sync">Run Full Sync</button>
          <button class="btn outline" type="button" data-job-action="run-discovery-sync" data-job-key="club-discovery-sync">Run Discovery</button>
          <button class="btn ghost" type="button" data-nav="clubs">View Clubs</button>
          <button class="btn ghost" type="button" data-nav="jobs">View Jobs</button>
        </div>
      </div>
      <div class="g2">
        ${statCard("Tracked Maps", fmtNum(c.trackedMaps || 0))}
        ${statCard("Campaigns", fmtNum(c.campaigns || 0))}
        ${statCard("Needs Review", fmtNum(c.namingPending || 0))}
        ${statCard("Naming Unmatched", fmtNum(c.namingUnmatched || 0))}
        ${statCard("Queued Requests", fmtNum(c.queuedUpdateRequests || 0))}
      </div>
    </div>

    ${
      clubs.length
        ? `
      <div style="margin-bottom:.85rem;">
        <p class="ws-label">Clubs (${clubs.length})</p>
        <div class="g-auto" style="margin-top:.4rem;">
          ${clubs.map((cl) => clubMiniCard(cl)).join("")}
        </div>
      </div>
    `
        : ""
    }

    ${
      sources.length
        ? `
      <div style="margin-bottom:.85rem;">
        <p class="ws-label">Sources (${sources.length})</p>
        <div class="g-auto" style="margin-top:.4rem;">
          ${sources.map((src) => sourceMiniCard(src)).join("")}
        </div>
      </div>
    `
        : ""
    }

    <div class="g2">
      <div class="card">
        <div class="card-header">
          <div><p class="ws-label">Alerts</p><h3>Alerts</h3></div>
          <span class="pill ${alerts.length ? "tone-warn" : "tone-success"}">${alerts.length ? `${alerts.length} active` : "Clear"}</span>
        </div>
        <div class="alert-list" style="margin-top:.45rem;">
          ${
            alerts.length
              ? alerts.map(renderAlert).join("")
              : `
            <div class="alerts-ok">
              <span class="alerts-ok-dot"></span>
              <div>
                <strong>Alert system active</strong>
                <p>Monitoring ${esc(fmtNum(alertCheckCount(d)))} check(s) across auth, sync, discovery, tracker, naming, ops, and integrations. No issues detected.</p>
              </div>
            </div>
          `
          }
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div><p class="ws-label">Recent Events</p><h3>Activity</h3></div>
          <button class="btn ghost small" type="button" data-nav="activity">View All</button>
        </div>
        <div class="tl-list" style="margin-top:.45rem;">
          ${events.length ? events.map(renderTlItem).join("") : `<p class="inline-empty">No recent events.</p>`}
        </div>
      </div>
    </div>

    <div style="margin-top:.85rem;">
      ${renderDashboardNamingPreview(d)}
    </div>

    <div style="margin-top:.85rem;">
      ${renderDashboardLocalStore(d)}
    </div>

    <div style="margin-top:.85rem;">
      <p class="ws-label">Quick Stats</p>
      <div class="g4" style="margin-top:.4rem;">
        ${statCard("Total Maps", fmtNum(c.maps || 0))}
        ${statCard("Ops Errors", fmtNum(c.opsPollErrors || 0))}
        ${statCard("Due Checks", fmtNum(c.dueSchedules || 0))}
        ${statCard("Queued Commands", fmtNum(c.queuedCommands || 0))}
        ${statCard("API 24h", fmtNum(c.apiRequests24h || 0))}
        ${statCard("API 7d", fmtNum(c.apiRequests7d || 0))}
      </div>
    </div>
  `
  );
}

function renderDashboardLocalStore(d) {
  const store = d?.localStore || {};
  const summary = store.summary || {};
  const job = store.job || {};
  const fallbackCount = Number(summary.fallbackSignatureCount || 0);
  const unknownChunkCount = Number(summary.parserUnknownChunkCount || 0);
  const chunk164A8Count = Number(summary.parserChunk164A8Count || 0);
  const invalidStringLengthCount = Number(summary.parserInvalidStringLengthCount || 0);
  const hasParserWarnings =
    fallbackCount > 0 || unknownChunkCount > 0 || chunk164A8Count > 0 || invalidStringLengthCount > 0;
  return `
    <div class="card">
      <div class="card-header">
        <div><p class="ws-label">Local Map Store</p><h3>${store.initialized ? "Initialized" : "Initializing"}</h3></div>
        <span class="pill ${store.initialized ? "tone-success" : job.running ? "tone-info" : "tone-warn"}">${store.initialized ? "Ready" : job.running ? "Running" : "Needs Backfill"}</span>
      </div>
      <div class="hero-actions" style="margin-top:.55rem;">
        <button class="btn outline small" type="button" data-job-action="run-map-local-copy-backfill" data-job-key="map-local-copy-backfill">Run Full Backfill</button>
        <button class="btn ghost small" type="button" data-job-action="retry-map-local-copy-errors" data-job-key="map-local-copy-backfill">Retry Errors</button>
      </div>
      <div class="g4" style="margin-top:.6rem;">
        ${statCard("Downloaded", fmtNum(summary.downloadedCount || 0))}
        ${statCard("Missing", fmtNum(summary.missingCount || 0))}
        ${statCard("Errors", fmtNum(summary.errorCount || 0))}
        ${statCard("Signature Ready", fmtNum(summary.signatureReadyCount || 0))}
        ${statCard("Similarity Ready", fmtNum(summary.similarityReadyCount || 0))}
        ${statCard("Bytes", fmtBytes(summary.totalBytes || 0))}
      </div>
      ${
        hasParserWarnings
          ? `
        <div class="card" style="margin-top:.75rem;border-color:rgba(255,138,92,.45);">
          <div class="card-header">
            <div><p class="ws-label">Parser Health</p><h3>Fallback Signatures Detected</h3></div>
            <span class="pill tone-warn">${esc(fmtNum(fallbackCount))} fallback</span>
          </div>
          <div class="g4" style="margin-top:.5rem;">
            ${statCard("Unknown Chunk", fmtNum(unknownChunkCount))}
            ${statCard("Chunk 0x000164A8", fmtNum(chunk164A8Count))}
            ${statCard("Invalid String", fmtNum(invalidStringLengthCount))}
            ${statCard("Fallback Total", fmtNum(fallbackCount))}
          </div>
          <p class="card-body" style="margin-top:.45rem;">
            These maps were downloaded, but the GBX parser fell back to asset-token signatures. Similarity still works, but rankings can be degraded for affected maps.
          </p>
        </div>
      `
          : ""
      }
    </div>
  `;
}

function renderCompatibilityBanner(d) {
  const compatibility = d?.compatibility;
  if (!compatibility) {
    return `
      <div class="card" style="margin-bottom:.85rem;border-color:rgba(255,138,92,.45);">
        <div class="card-header">
          <div><p class="ws-label">Compatibility</p><h3>Backend Capability Manifest Missing</h3></div>
          <span class="pill tone-warn">Warning</span>
        </div>
        <p class="card-body" style="margin-top:.45rem;">
          The frontend expects a backend compatibility manifest, but this API response did not include one.
          This usually means the static frontend was updated without restarting the altered backend.
        </p>
      </div>
    `;
  }
  if (compatibility.ok) return "";
  const notes = Array.isArray(compatibility.notes) ? compatibility.notes : [];
  return `
    <div class="card" style="margin-bottom:.85rem;border-color:rgba(255,138,92,.45);">
      <div class="card-header">
        <div><p class="ws-label">Compatibility</p><h3>Backend / DB Migration Required</h3></div>
        <span class="pill tone-warn">Action Needed</span>
      </div>
      <p class="card-body" style="margin-top:.45rem;">
        This backend is running without required schema or route support for the current admin UI.
      </p>
      <div class="tl-list" style="margin-top:.45rem;">
        ${notes.length ? notes.map((note) => `<div class="tl-item"><div class="tl-main"><strong>${esc(note)}</strong></div></div>`).join("") : `<p class="inline-empty">No detailed notes were provided.</p>`}
      </div>
    </div>
  `;
}

function renderDashboardNamingPreview(d) {
  const naming = d?.naming || {};
  const summary = naming.summary || {};
  const unmatched = Array.isArray(naming.unmatchedPreview) ? naming.unmatchedPreview : [];
  return `
    <div class="card">
      <div class="card-header">
        <div><p class="ws-label">Naming Queue</p><h3>Unmatched Preview</h3></div>
        <span class="pill ${Number(summary.unmatched || 0) > 0 ? "tone-warn" : "tone-success"}">${Number(summary.unmatched || 0) > 0 ? `${fmtNum(summary.unmatched || 0)} unmatched` : "Clear"}</span>
      </div>
      <div class="hero-actions" style="margin-top:.55rem;">
        ${renderSimilarityBackfillControls({ buttonLabel: "Run Similarity Rescan", buttonClass: "btn danger small" })}
        <button class="btn ghost small" type="button" data-open-unmatched-naming>Open Naming Queue</button>
      </div>
      <div data-similarity-backfill-status-compact>${renderSimilarityBackfillStatus({ compact: true })}</div>
      <div class="tl-list" style="margin-top:.6rem;">
        ${
          unmatched.length
            ? unmatched
                .map(
                  (row) => `
          <div class="tl-item">
            <div class="tl-main">
              <strong>${escN(row.finalName || row.proposedName || row.sanitizedName || row.originalName || row.mapUid || "-")}</strong>
              <span>${escN(row.campaign || "Unassigned")} &middot; slot ${esc(String(row.slot || "-"))} &middot; ${row.requiresRegex ? "needs regex" : "needs similarity/manual"}</span>
            </div>
            <div class="tl-side">
              <span class="pill ${row.automationState === "matched" ? "tone-success" : "tone-warn"}">${esc(row.automationState || "unmatched")}</span>
            </div>
          </div>
        `
                )
                .join("")
            : `<p class="inline-empty">No unmatched naming candidates.</p>`
        }
      </div>
    </div>
  `;
}
