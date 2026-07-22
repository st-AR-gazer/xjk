import "/shared/xjk-core/safe-html.js?v=2";
import { btnClass, esc, fmtDateTime, fmtDuration, toneClass, toneLabel } from "./formatters.js?v=2";
import { el, state } from "./state.js?v=2";
import { emptyState, jobExtra, jobStat, loading } from "./ui.js?v=2";

export function renderJobs() {
  const p = state.jobs;
  if (!p) {
    globalThis.XjkSafeHtml.set(el.wsJobs, loading("Loading jobs..."));
    return;
  }
  const jobs = Array.isArray(p.jobs) ? p.jobs : [];

  globalThis.XjkSafeHtml.set(
    el.wsJobs,
    `
    <p class="card-body" style="margin-bottom:.85rem;">
      All sync jobs that keep clubs, maps, trackers, and display names in sync.
    </p>
    <div class="g2">
      ${jobs.map(renderJobCard).join("") || emptyState("No jobs", "No sync jobs available yet.")}
    </div>
  `
  );
}

function renderJobCard(job) {
  const actions = Array.isArray(job.actions) ? job.actions : [];
  return `
    <div class="job-card">
      <div class="job-top">
        <div>
          <span class="job-key">${esc(job.jobKey || "job")}</span>
          <h3>${esc(job.label || "Unnamed Job")}</h3>
        </div>
        <span class="pill ${toneClass(job.state)}">${esc(toneLabel(job.state))}</span>
      </div>
      <p class="job-summary">${esc(job.summaryLine || "No summary.")}</p>
      ${job.errorLine ? `<p class="job-error">${esc(job.errorLine)}</p>` : ""}
      <div class="job-stats">
        ${jobStat("Last Success", fmtDateTime(job.lastSuccessAt || job.lastFinishedAt))}
        ${jobStat("Next Run", fmtDateTime(job.nextRunAt))}
        ${jobStat("Duration", fmtDuration(job.durationMs))}
      </div>
      <div class="job-extra">
        ${jobExtra("Configured", job.configured ? "Yes" : "No")}
        ${jobExtra("Enabled", job.enabled ? "Yes" : "No")}
        ${jobExtra("Last Failure", fmtDateTime(job.lastFailureAt))}
        ${jobExtra("Last Started", fmtDateTime(job.lastStartedAt))}
      </div>
      <div class="job-actions">
        ${actions.map((a) => `<button class="${btnClass(a.tone)} small" type="button" data-job-action="${esc(a.key)}" data-job-key="${esc(job.jobKey || "")}">${esc(a.label)}</button>`).join("")}
      </div>
    </div>
  `;
}
