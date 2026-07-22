import "/shared/xjk-core/safe-html.js?v=2";
import { renderClubCard, renderSourceCard } from "./clubs.js?v=2";
import { esc, fmtDateTime, fmtDuration, fmtNum, toneClass } from "./formatters.js?v=2";
import { resolveWorkspaceHref } from "./request-client.js?v=2";
import { el, state } from "./state.js?v=2";
import {
  checkField,
  configSection,
  field,
  filterBar,
  loading,
  renderTlItem,
  selOpts,
  statCard,
  tableCard,
} from "./ui.js?v=2";

export function renderActivity() {
  const p = state.activity.data;
  if (!p) {
    globalThis.XjkSafeHtml.set(el.wsActivity, loading("Loading activity..."));
    return;
  }
  const events = Array.isArray(p.events) ? p.events : [];
  const f = state.activity.filters;

  globalThis.XjkSafeHtml.set(
    el.wsActivity,
    `
    ${filterBar(
      "activity-filters",
      `
      <div class="filter-fields" style="grid-template-columns:repeat(4,minmax(0,1fr));">
        <label class="field"><span>Kind</span><select name="kind">${selOpts(
          [
            ["all", "All"],
            ["wr-change", "WR Changes"],
            ["error", "Errors"],
            ["poll-run", "Poll Runs"],
            ["scheduler", "Scheduler"],
            ["job", "Jobs"],
          ],
          f.kind
        )}</select></label>
        <label class="field"><span>Job</span><select name="jobKey">${selOpts(
          [
            ["", "All Jobs"],
            ["club-full-sync", "Club Full Sync"],
            ["club-discovery-sync", "Discovery Sync"],
            ["tracker-run", "Tracker Push"],
            ["displayname-sync", "Display Name"],
            ["ops-scheduler", "Ops Scheduler"],
          ],
          f.jobKey
        )}</select></label>
        <label class="field"><span>Map UID</span><input name="mapUid" value="${esc(f.mapUid || "")}" placeholder="Exact UID" /></label>
        <label class="field"><span>Batch Size</span><input name="limit" type="number" min="10" max="100" value="${esc(String(state.activity.limit || 40))}" /></label>
      </div>
    `,
      `<button class="btn primary small" type="submit">Apply</button><button class="btn ghost small" type="button" data-reset-activity>Reset</button>`
    )}

    <div class="card">
      <div class="card-header">
        <div><p class="ws-label">Feed</p><h3>${esc(fmtNum(p.total || 0))} events</h3></div>
        <span class="pill tone-info">Cursor ${esc(String(p.cursor || 0))}</span>
      </div>
      <div class="g1" style="margin-top:.5rem;">
        ${events.length ? events.map(renderTlItem).join("") : `<p class="inline-empty">No events matched.</p>`}
      </div>
      <div class="pagination">
        <span class="page-info">${esc(String(events.length))} event(s) from cursor ${esc(String(p.cursor || 0))}</span>
        <div class="page-btns">
          <button class="btn ghost small" type="button" data-activity-page="prev" ${p.cursor > 0 ? "" : "disabled"}>Newer</button>
          <button class="btn outline small" type="button" data-activity-page="next" ${p.hasMore ? "" : "disabled"}>Older</button>
        </div>
      </div>
    </div>
  `
  );
}

export function renderSettings() {
  const d = state.settings;
  if (!d) {
    globalThis.XjkSafeHtml.set(el.wsSettings, loading("Loading settings..."));
    return;
  }
  const mon = d.liveMonitor || {};
  const hook = d.hook || {};
  const clubs = Array.isArray(d.projectClubs) ? d.projectClubs : [];
  const sources = Array.isArray(d.projectSources) ? d.projectSources : [];
  const mapper = d.mapperNameSync || {};
  const sched = d.ops?.scheduler || {};
  const bot = d.ops?.bot || {};
  const publicApi = d.publicApi || {};
  const apiTotals = publicApi.totals || {};

  globalThis.XjkSafeHtml.set(
    el.wsSettings,
    `
    ${
      clubs.length
        ? `
      <div style="margin-bottom:.85rem;">
        <p class="ws-label">Project Clubs (${clubs.length})</p>
        <div class="g-auto" style="margin-top:.4rem;">${clubs.map(renderClubCard).join("")}</div>
      </div>
    `
        : ""
    }

    ${
      sources.length
        ? `
      <div style="margin-bottom:.85rem;">
        <p class="ws-label">Project Sources (${sources.length})</p>
        <div class="g-auto" style="margin-top:.4rem;">${sources.map(renderSourceCard).join("")}</div>
      </div>
    `
        : ""
    }

    <div class="g1">
      ${configSection(
        "hook-config",
        "Club Source / Hook",
        true,
        `
        <form data-settings-form="hook" class="config-form">
          ${field("Club ID", "clubId", "number", hook.clubId || mon.clubId || 24231, { min: 1 })}
          ${field("Club Name", "clubName", "text", hook.clubName || "Altered")}
          ${field("Source Label", "sourceLabel", "text", hook.sourceLabel || "altered-club")}
          ${checkField("Enabled", "enabled", hook.enabled)}
          ${checkField("Auto-track New Maps", "autoTrackNewMaps", hook.autoTrackNewMaps)}
          <div class="form-footer"><button class="btn primary" type="submit">Save Hook Config</button></div>
        </form>
      `
      )}

      ${configSection(
        "monitor-config",
        "Club Monitor Schedule",
        false,
        `
        <form data-settings-form="monitor" class="config-form">
          <label class="field"><span>Schedule Mode</span><select name="scheduleMode">${selOpts(
            [
              ["interval", "Interval"],
              ["daily", "Daily"],
            ],
            mon.scheduleMode || "interval"
          )}</select></label>
          ${field("Interval Seconds", "intervalSeconds", "number", mon.intervalSeconds || 1800, { min: 60 })}
          ${field("Daily Hour UTC", "dailyHourUtc", "number", mon.dailyHourUtc || 3, { min: 0, max: 23 })}
          ${field("Daily Minute UTC", "dailyMinuteUtc", "number", mon.dailyMinuteUtc || 0, { min: 0, max: 59 })}
          ${field("Activity Page Size", "activityPageSize", "number", mon.activityPageSize || 250, { min: 1, max: 250 })}
          ${field("Tracker Chunk Size", "trackerChunkSize", "number", mon.trackerChunkSize || 350, { min: 25, max: 2000 })}
          ${field("Discovery Interval Sec", "discoveryIntervalSeconds", "number", mon.discoveryIntervalSeconds || 3600, { min: 60 })}
          ${field("Discovery Campaign Limit", "discoveryCampaignLimit", "number", mon.discoveryCampaignLimit || 25, { min: 1 })}
          ${field("Discovery Page Size", "discoveryActivityPageSize", "number", mon.discoveryActivityPageSize || 100, { min: 1, max: 250 })}
          ${checkField("Monitor Enabled", "enabled", mon.enabled)}
          ${checkField("Discovery Enabled", "discoveryEnabled", mon.discoveryEnabled)}
          ${checkField("Active Only", "activeOnly", mon.activeOnly)}
          ${checkField("Fetch Map Details", "fetchMapDetails", mon.fetchMapDetails)}
          <div class="form-footer"><button class="btn primary" type="submit">Save Monitor Config</button></div>
        </form>
      `
      )}

      ${configSection(
        "displayname-config",
        "Display Name Sync",
        false,
        `
        <form data-settings-form="displayname" class="config-form">
          ${checkField("Enabled", "enabled", mapper.enabled)}
          ${field("Bootstrap Interval Sec", "bootstrapIntervalSeconds", "number", mapper.bootstrapIntervalSeconds || 60, { min: 1 })}
          ${field("Maintenance Interval Sec", "maintenanceIntervalSeconds", "number", mapper.maintenanceIntervalSeconds || 60, { min: 1 })}
          ${field("Priority Interval Sec", "priorityIntervalSeconds", "number", mapper.priorityIntervalSeconds || 60, { min: 1 })}
          ${field("Batch Size", "batchSize", "number", mapper.batchSize || 50, { min: 1 })}
          ${field("Priority Batch Size", "priorityBatchSize", "number", mapper.priorityBatchSize || 25, { min: 1 })}
          ${field("Priority Top Limit", "priorityTopLimit", "number", mapper.priorityTopLimit || 250, { min: 1 })}
          ${field("Priority Refresh Sec", "priorityRefreshSeconds", "number", mapper.priorityRefreshSeconds || 600, { min: 1 })}
          ${field("Known Accounts Refresh", "knownAccountsRefreshSeconds", "number", mapper.knownAccountsRefreshSeconds || 900, { min: 1 })}
          ${field("Cache TTL Sec", "cacheTtlSeconds", "number", mapper.cacheTtlSeconds || 86400, { min: 1 })}
          ${field("Priority Cache TTL", "priorityCacheTtlSeconds", "number", mapper.priorityCacheTtlSeconds || 1800, { min: 1 })}
          ${field("Min Request Gap ms", "minRequestGapMs", "number", mapper.minRequestGapMs || 5000, { min: 0 })}
          <div class="form-footer"><button class="btn primary" type="submit">Save Display Name Config</button></div>
        </form>
      `
      )}

      ${configSection(
        "ops-config",
        "Ops Scheduler",
        false,
        `
        <form data-settings-form="ops" class="config-form">
          ${checkField("Enabled", "enabled", sched.enabled)}
          ${field("Tick Seconds", "tickSeconds", "number", sched.tickSeconds || 120, { min: 15 })}
          ${field("Max Maps Per Run", "maxMapsPerRun", "number", sched.maxMapsPerRun || 5000, { min: 1 })}
          <div class="form-footer"><button class="btn primary" type="submit">Save Ops Config</button></div>
        </form>
      `
      )}

      ${configSection(
        "bot-config",
        "Bot / Discord Webhook",
        false,
        `
        <form data-settings-form="bot" class="config-form">
          ${checkField("Enabled", "enabled", bot.enabled)}
          ${checkField("Announce WR Changes", "announceWrChanges", bot.announceWrChanges)}
          ${field("Bot Name", "botName", "text", bot.botName || "")}
          ${field("Guild ID", "guildId", "text", bot.guildId || "")}
          ${field("Channel ID", "channelId", "text", bot.channelId || "")}
          ${field("Mention Role ID", "mentionRoleId", "text", bot.mentionRoleId || "")}
          <label class="field" style="grid-column:1/-1;"><span>Webhook URL</span><input name="webhookUrl" value="${esc(bot.webhookUrl || "")}" /></label>
          <label class="field" style="grid-column:1/-1;"><span>Footer Text</span><input name="footerText" value="${esc(bot.footerText || "")}" /></label>
          <div class="form-footer"><button class="btn primary" type="submit">Save Bot Config</button></div>
        </form>
      `
      )}

      <div class="card" style="margin-top:.4rem;">
        <div class="card-header"><div><p class="ws-label">Runtime</p><h3>Support State</h3></div></div>
        <div class="g3" style="margin-top:.5rem;">
          ${statCard("Live API Session", d.liveApiSession?.available ? "Available" : "Unavailable", d.liveApiSession?.error || d.liveAuth?.authAdvice || "Resolved.")}
          ${statCard("Displayname Relay", mapper.relayAvailable ? "Healthy" : "Unavailable", mapper.relayLastError || "Responding.")}
          ${statCard("Update Requests", `${fmtNum(d.updateRequestSummary?.queued || 0)} queued`, `${fmtNum(d.updateRequestSummary?.total || 0)} total.`)}
        </div>
      </div>

      <div class="card" style="margin-top:.85rem;">
        <div class="card-header">
          <div><p class="ws-label">Public API</p><h3>Workspace</h3></div>
          <div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;">
            <span class="pill tone-info">${esc(fmtNum(publicApi.catalog?.totalEndpoints || 0))} documented</span>
            <a class="btn ghost small" href="${esc(resolveWorkspaceHref(publicApi.catalog?.docsPath || "/api/"))}" target="_blank" rel="noreferrer">Open Docs</a>
          </div>
        </div>
        <div class="g4" style="margin-top:.5rem;">
          ${statCard("Requests 24h", fmtNum(apiTotals.requests24h || 0))}
          ${statCard("Requests 7d", fmtNum(apiTotals.requests7d || 0))}
          ${statCard("Requests 30d", fmtNum(apiTotals.requestsWindow || 0))}
          ${statCard("Unique Clients", fmtNum(apiTotals.uniqueClientsWindow || 0), `${fmtNum(apiTotals.serverErrorCount || 0)} server errors in window.`)}
        </div>
        <p class="card-body" style="margin-top:.75rem;">
          API docs and endpoint analytics now live in the dedicated <strong>API</strong> workspace.
          Use that page to review endpoint coverage, traffic, and direct links for external projects.
        </p>
        <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.65rem;">
          <button class="btn primary small" type="button" data-nav="api">Open API Workspace</button>
          <a class="btn ghost small" href="${esc(resolveWorkspaceHref("/api/"))}" target="_blank" rel="noreferrer">Open Public Docs</a>
          <a class="btn ghost small" href="${esc(resolveWorkspaceHref("/api/v1/public/endpoints"))}" target="_blank" rel="noreferrer">Open Catalog JSON</a>
        </div>
      </div>
    </div>
  `
  );
}

export function renderApi() {
  const d = state.api;
  if (!d) {
    globalThis.XjkSafeHtml.set(el.wsApi, loading("Loading API workspace..."));
    return;
  }
  const usage = d.usage || {};
  const catalog = d.catalog || {};
  const apiInfo = catalog.api || {};
  const endpoints = Array.isArray(catalog.endpoints) ? catalog.endpoints : [];
  const groups = summarizeApiGroups(endpoints);

  globalThis.XjkSafeHtml.set(
    el.wsApi,
    `
    <div class="hero-banner">
      <div>
        <span class="pill tone-info">Public API</span>
        <h3>Endpoint directory and usage analytics.</h3>
        <p class="card-body">
          This workspace documents the public Altered API for external integrations and tracks how
          those endpoints are being used.
        </p>
        <div class="hero-actions">
          <a class="btn primary" href="${esc(resolveWorkspaceHref(apiInfo.docsPath || "/api/"))}" target="_blank" rel="noreferrer">Open Public Docs</a>
          <a class="btn outline" href="${esc(resolveWorkspaceHref("/api/v1/public/endpoints"))}" target="_blank" rel="noreferrer">Open Catalog JSON</a>
          <a class="btn ghost" href="${esc(resolveWorkspaceHref("/api/"))}" target="_blank" rel="noreferrer">Open Map Tester</a>
          <button class="btn ghost" type="button" data-api-action="backfill-map-metadata">Backfill Map Metadata</button>
        </div>
      </div>
      <div class="g2">
        ${statCard("Version", apiInfo.version || "v1")}
        ${statCard("Docs Path", resolveWorkspaceHref(apiInfo.docsPath || "/api/"))}
        ${statCard("Documented", fmtNum(apiInfo.totalEndpoints || endpoints.length || 0))}
        ${statCard("Updated", fmtDateTime(catalog.generatedAt || d.generatedAt))}
      </div>
    </div>

    ${
      groups.length
        ? `
      <div style="margin-top:.85rem;">
        <p class="ws-label">Endpoint Groups</p>
        <div class="g4" style="margin-top:.4rem;">
          ${groups.map((group) => statCard(group.group, fmtNum(group.count || 0))).join("")}
        </div>
      </div>
    `
        : ""
    }

    ${renderPublicApiUsage(usage)}
    ${renderPublicApiDirectory(catalog)}
  `
  );
}

function summarizeApiGroups(endpoints) {
  const counts = new Map();
  (Array.isArray(endpoints) ? endpoints : []).forEach((endpoint) => {
    const key = String(endpoint?.group || "Other").trim() || "Other";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((left, right) => right.count - left.count || left.group.localeCompare(right.group));
}

function endpointLiveHref(endpoint) {
  const path = String(endpoint?.path || "").trim();
  const method = String(endpoint?.method || "GET")
    .trim()
    .toUpperCase();
  if (!path || method !== "GET") return "";
  if (!path.includes(":")) return resolveWorkspaceHref(path, endpoint?.service);
  if (endpoint?.key === "public-map-detail" || endpoint?.key === "legacy-map-info") {
    return resolveWorkspaceHref("/api/");
  }
  return "";
}

function renderPublicApiUsage(publicApi) {
  const endpoints = Array.isArray(publicApi?.endpoints) ? publicApi.endpoints : [];
  const recentRequests = Array.isArray(publicApi?.recentRequests) ? publicApi.recentRequests : [];
  const origins = Array.isArray(publicApi?.origins) ? publicApi.origins : [];

  return `
    <div class="g2" style="margin-top:.85rem;">
      <div>
        <p class="ws-label">Top Endpoints</p>
        <div class="table-wrap" style="margin-top:.35rem;">
          <table>
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>24h</th>
                <th>7d</th>
                <th>Avg ms</th>
                <th>Last Hit</th>
              </tr>
            </thead>
            <tbody>
              ${
                endpoints.length
                  ? endpoints
                      .map(
                        (endpoint) => `
                        <tr>
                          <td>
                            <strong>${esc(endpoint.title || endpoint.endpointKey || "Endpoint")}</strong>
                            <div style="font-size:.72rem;color:var(--a-muted);margin-top:.15rem;">
                              <code>${esc(endpoint.method || "GET")}</code> ${esc(endpoint.path || endpoint.requestPath || "-")}
                            </div>
                          </td>
                          <td>${esc(fmtNum(endpoint.requests24h || 0))}</td>
                          <td>${esc(fmtNum(endpoint.requests7d || 0))}</td>
                          <td>${esc(fmtDuration(endpoint.avgDurationMs || 0))}</td>
                          <td>${esc(fmtDateTime(endpoint.lastRequestedAt))}</td>
                        </tr>
                      `
                      )
                      .join("")
                  : `<tr><td colspan="5"><span class="inline-empty">No API traffic recorded yet.</span></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <p class="ws-label">Recent Requests</p>
        <div class="table-wrap" style="margin-top:.35rem;">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Endpoint</th>
                <th>Status</th>
                <th>Origin</th>
                <th>ms</th>
              </tr>
            </thead>
            <tbody>
              ${
                recentRequests.length
                  ? recentRequests
                      .map(
                        (request) => `
                        <tr>
                          <td>${esc(fmtDateTime(request.createdAt))}</td>
                          <td>
                            <strong>${esc(request.title || request.endpointKey || "-")}</strong>
                            <div style="font-size:.72rem;color:var(--a-muted);margin-top:.15rem;"><code>${esc(request.method || "GET")}</code> ${esc(request.path || request.requestPath || "-")}</div>
                            ${request.mapUid ? `<div style="font-size:.72rem;color:var(--a-muted);margin-top:.15rem;">Map ${esc(request.mapUid)}</div>` : ""}
                          </td>
                          <td><span class="pill ${toneClass(request.statusCode >= 500 ? "error" : request.statusCode >= 400 ? "warn" : "success")}">${esc(String(request.statusCode || "-"))}</span></td>
                          <td>${esc(request.origin || "direct")}</td>
                          <td>${esc(fmtDuration(request.durationMs || 0))}</td>
                        </tr>
                      `
                      )
                      .join("")
                  : `<tr><td colspan="5"><span class="inline-empty">No recent requests.</span></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
    ${
      origins.length
        ? `
        <div style="margin-top:.85rem;">
          <p class="ws-label">Top Origins (${esc(fmtNum(origins.length))})</p>
          <div class="g-auto" style="margin-top:.35rem;">
            ${origins
              .map((origin) =>
                statCard(
                  origin.origin || "direct",
                  fmtNum(origin.totalRequests || 0),
                  fmtDateTime(origin.lastRequestedAt)
                )
              )
              .join("")}
          </div>
        </div>
      `
        : ""
    }
  `;
}

function renderPublicApiDirectory(catalog) {
  const endpoints = (Array.isArray(catalog?.endpoints) ? catalog.endpoints : []).slice().sort((left, right) => {
    const leftGroup = String(left?.group || "Other");
    const rightGroup = String(right?.group || "Other");
    if (leftGroup !== rightGroup) return leftGroup.localeCompare(rightGroup);
    return String(left?.title || left?.path || "").localeCompare(String(right?.title || right?.path || ""));
  });

  return tableCard(
    "Endpoint Directory",
    `${fmtNum(endpoints.length)} documented endpoint(s)`,
    `
    <table>
      <thead>
        <tr>
          <th>Endpoint</th>
          <th>Group</th>
          <th>Access</th>
          <th>Stability</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${
          endpoints.length
            ? endpoints
                .map((endpoint) => {
                  const liveHref = endpointLiveHref(endpoint);
                  return `
                <tr>
                  <td>
                    <strong>${esc(endpoint.title || endpoint.key || "Endpoint")}</strong>
                    <div style="font-size:.72rem;color:var(--a-muted);margin-top:.15rem;"><code>${esc(endpoint.method || "GET")}</code> ${esc(endpoint.path || "-")}</div>
                    ${endpoint.description ? `<div style="font-size:.72rem;color:var(--a-muted);margin-top:.15rem;">${esc(endpoint.description)}</div>` : ""}
                  </td>
                  <td>${esc(endpoint.group || "Other")}</td>
                  <td><span class="pill ${toneClass(endpoint.access === "protected" ? "warn" : "info")}">${esc(endpoint.access || "public")}</span></td>
                  <td><span class="pill ${toneClass(endpoint.stability === "legacy" ? "warn" : endpoint.stability === "stable" ? "success" : "muted")}">${esc(endpoint.stability || "existing")}</span></td>
                  <td>
                    <div style="display:flex;gap:.35rem;flex-wrap:wrap;">
                      <a class="btn ghost small" href="${esc(resolveWorkspaceHref("/api/"))}" target="_blank" rel="noreferrer">Docs</a>
                      ${liveHref ? `<a class="btn outline small" href="${esc(liveHref)}" target="_blank" rel="noreferrer">Open</a>` : ""}
                    </div>
                  </td>
                </tr>
              `;
                })
                .join("")
            : `<tr><td colspan="5"><span class="inline-empty">No documented endpoints.</span></td></tr>`
        }
      </tbody>
    </table>
  `
  );
}
