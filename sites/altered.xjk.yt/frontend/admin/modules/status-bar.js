import { fmtClock, fmtNum, toneClass, toneLabel } from "./formatters.js?v=2";
import { el, state } from "./state.js?v=2";
import { getAllClubs } from "./ui.js?v=2";

export function renderTopbar() {
  const dashboard = state.dashboard;
  if (!dashboard) return;
  const health = dashboard.health || {};
  const jobs = state.jobs?.jobs || dashboard.jobs || [];
  const running = jobs.filter((job) => job.state === "running").length;
  const alerts = Array.isArray(dashboard.alerts) ? dashboard.alerts : [];
  el.healthPill.className = `pill ${toneClass(health.state)}`;
  el.healthPill.textContent = toneLabel(health.state);
  el.healthSummary.textContent = health.summary || "No summary.";
  el.statRunning.textContent = fmtNum(running);
  el.statAlerts.textContent = fmtNum(alerts.length);
  el.statUpdated.textContent = fmtClock(dashboard.generatedAt);
}

export function renderNavBadges() {
  const clubs = getAllClubs();
  if (clubs.length > 0) {
    el.navClubCount.textContent = clubs.length;
    el.navClubCount.hidden = false;
  } else {
    el.navClubCount.hidden = true;
  }

  const jobs = state.jobs?.jobs || state.dashboard?.jobs || [];
  const running = jobs.filter((job) => job.state === "running").length;
  if (running > 0) {
    el.navJobsRunning.textContent = running;
    el.navJobsRunning.hidden = false;
  } else {
    el.navJobsRunning.hidden = true;
  }
}
