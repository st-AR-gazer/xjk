import "/shared/xjk-core/safe-html.js?v=2";
import { escapeHtml } from "/shared/xjk-core/dom-utils.js";
import { fetchJson } from "/shared/xjk-core/http.js";
import {
  fmtBytes,
  fmtDurationSeconds,
  fmtNumber,
  fmtPercent,
  setText,
  state,
  waitForNextPaint,
} from "./dashboardRuntime.js";

function renderMetricTopProjects(projects = []) {
  const body = document.getElementById("metricTopProjectsBody");
  if (!body) return;
  body.replaceChildren();
  if (!projects.length) {
    globalThis.XjkSafeHtml.set(body, '<tr><td colspan="4" class="muted">No project metrics available.</td></tr>');
    return;
  }
  projects.forEach((row) => {
    const tr = document.createElement("tr");
    globalThis.XjkSafeHtml.set(
      tr,
      `<td>${escapeHtml(row.projectName || row.projectKey || "-")}</td>` +
        `<td>${fmtNumber(row.checks || 0)}</td>` +
        `<td>${fmtNumber(row.changes || 0)}</td>` +
        `<td>${fmtNumber(row.trackedMaps || 0)}</td>`
    );
    body.appendChild(tr);
  });
}

function renderLineChart(svgId, points, keys, labels) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  const width = 680;
  const height = 210;
  const padding = { left: 26, right: 8, top: 10, bottom: 22 };

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxY = Math.max(1, ...points.flatMap((point) => keys.map((key) => Number(point[key] || 0))));

  if (!points.length) {
    globalThis.XjkSafeHtml.set(
      svg,
      `<line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" class="chart-axis-line"></line>` +
        `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="chart-empty">No data in selected range.</text>`
    );
    return;
  }

  function xAt(index) {
    if (points.length <= 1) return padding.left;
    return padding.left + (innerWidth * index) / (points.length - 1);
  }

  function yAt(value) {
    const ratio = Number(value || 0) / maxY;
    return padding.top + innerHeight - ratio * innerHeight;
  }

  function pathFor(key) {
    return points
      .map((point, idx) => `${idx === 0 ? "M" : "L"} ${xAt(idx).toFixed(2)} ${yAt(point[key]).toFixed(2)}`)
      .join(" ");
  }

  const gridLines = [0.25, 0.5, 0.75].map((ratio) => {
    const y = padding.top + innerHeight - innerHeight * ratio;
    return `<line x1="${padding.left}" y1="${y.toFixed(2)}" x2="${width - padding.right}" y2="${y.toFixed(2)}" class="chart-grid-line"></line>`;
  });

  const legendY = height - 5;
  const legend = labels
    .map((label, idx) => {
      const color = idx === 0 ? "var(--coral)" : "#79e6a0";
      const x = padding.left + idx * 130;
      return (
        `<circle cx="${x}" cy="${legendY - 3}" r="3" fill="${color}"></circle>` +
        `<text x="${x + 8}" y="${legendY}" fill="var(--ink-dim)" font-size="11">${escapeHtml(label)}</text>`
      );
    })
    .join("");

  const primaryPath = pathFor(keys[0]);
  const secondaryPath = keys[1] ? pathFor(keys[1]) : "";

  globalThis.XjkSafeHtml.set(
    svg,
    gridLines.join("") +
      `<line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" class="chart-axis-line"></line>` +
      `<path d="${primaryPath}" class="chart-line-primary"></path>` +
      (secondaryPath ? `<path d="${secondaryPath}" class="chart-line-secondary"></path>` : "") +
      legend
  );
}

function applyMetricsOverview(overviewPayload) {
  const metrics = overviewPayload?.metrics || {};
  const freshness = metrics.freshness || {};
  const throughput24h = metrics.throughput24h || {};
  const rates = metrics.rates || {};
  const runHealth = metrics.runHealth || {};
  const instanceHealth = metrics.instanceHealth || {};
  const nameHealth = metrics.nameHealth || {};
  const totalAccounts = Math.max(0, Number(metrics.accounts || 0));
  const matchedDisplayNames = Math.max(0, Number(metrics.displayNames || 0));
  const missingDisplayNames = Math.max(
    0,
    Number(nameHealth.missingDisplayNames ?? totalAccounts - matchedDisplayNames)
  );
  const computedCoveragePct = totalAccounts > 0 ? (matchedDisplayNames / totalAccounts) * 100 : 0;
  const coveragePct = Number(Number.isFinite(nameHealth.coveragePct) ? nameHealth.coveragePct : computedCoveragePct);
  const clampedCoveragePct = Math.max(0, Math.min(100, Number.isFinite(coveragePct) ? coveragePct : 0));

  setText("metricOnlineInstances", fmtNumber(metrics.onlineInstances || 0));
  setText("metricOfflineInstances", fmtNumber(instanceHealth.staleOrOfflineInstances || 0));
  setText("metricIngestRuns", fmtNumber(metrics.ingestRuns || 0));
  setText("metricChangedEvents", fmtNumber(metrics.eventsChanged || 0));
  setText("metricChecks24h", fmtNumber(throughput24h.checks || 0));
  setText("metricChanges24h", fmtNumber(throughput24h.changes || 0));
  setText("metricChangeRate24h", fmtPercent(rates.changeRate24hPct || 0, 2));
  setText("metricMapsChecked24h", fmtNumber(throughput24h.mapsChecked || 0));
  setText("metricTrackedMaps", fmtNumber(freshness.trackedMaps || 0));
  setText("metricStaleMaps24h", fmtNumber(freshness.stale24h || 0));
  setText("metricAvgRunDuration24h", fmtDurationSeconds(runHealth.avgRunDurationSeconds24h || 0));
  setText("metricNameCoverage", fmtPercent(clampedCoveragePct, 2));
  setText("metricNameUpdates24h", fmtNumber(nameHealth.observed24h || 0));
  setText("metricStaleNames20d", fmtNumber(nameHealth.stale20d || 0));
  setText("metricDbSize", fmtBytes(metrics?.storage?.dbBytes || 0));
  setText("metricDisplayNamesMatched", fmtNumber(matchedDisplayNames));
  setText("metricDisplayNamesTotal", fmtNumber(totalAccounts));
  setText("metricDisplayNamesMissing", fmtNumber(missingDisplayNames));
  setText("metricDisplayNamesCoverage", fmtPercent(clampedCoveragePct, 2));

  const coverageBarEl = document.getElementById("metricDisplayNamesCoverageBar");
  if (coverageBarEl) {
    coverageBarEl.style.width = `${clampedCoveragePct.toFixed(2)}%`;
    const progressEl = coverageBarEl.parentElement;
    if (progressEl) progressEl.setAttribute("aria-valuenow", clampedCoveragePct.toFixed(2));
  }
  const coverageStateEl = document.getElementById("metricNameCoverageState");
  if (coverageStateEl) {
    const isComplete = totalAccounts > 0 && missingDisplayNames === 0;
    coverageStateEl.textContent = totalAccounts === 0 ? "No Accounts" : isComplete ? "Complete" : "In Progress";
    coverageStateEl.classList.toggle("is-complete", isComplete);
  }
  renderMetricTopProjects(metrics.topProjects || []);
}

function applyLeaderboardCoverage(coveragePayload) {
  const coverage = coveragePayload?.coverage || {};
  const totalMaps = Math.max(0, Number(coverage.totalMaps || 0));
  const mapsWithKnownWr = Math.max(0, Number(coverage.mapsWithKnownWr || 0));
  const mapsWithLeaderboardRows = Math.max(0, Number(coverage.mapsWithLeaderboardRows || 0));
  const mapsWithExtendedLeaderboard = Math.max(0, Number(coverage.mapsWithExtendedLeaderboard || 0));
  const leaderboardRowsStored = Math.max(0, Number(coverage.leaderboardRowsStored || 0));
  const extendedCoveragePct = Math.max(0, Math.min(100, Number(coverage.extendedCoveragePct || 0)));

  setText("metricLeaderboardWrKnown", `${fmtNumber(mapsWithKnownWr)} / ${fmtNumber(totalMaps)}`);
  setText("metricLeaderboardAnyRows", `${fmtNumber(mapsWithLeaderboardRows)} / ${fmtNumber(totalMaps)}`);
  setText("metricLeaderboardExtended", `${fmtNumber(mapsWithExtendedLeaderboard)} / ${fmtNumber(totalMaps)}`);
  setText("metricLeaderboardRowsStored", fmtNumber(leaderboardRowsStored));

  const coverageBarEl = document.getElementById("metricLeaderboardCoverageBar");
  if (coverageBarEl) {
    coverageBarEl.style.width = `${extendedCoveragePct.toFixed(2)}%`;
    const progressEl = coverageBarEl.parentElement;
    if (progressEl) progressEl.setAttribute("aria-valuenow", extendedCoveragePct.toFixed(2));
  }

  const coverageStateEl = document.getElementById("metricLeaderboardCoverageState");
  if (coverageStateEl) {
    const isComplete = totalMaps > 0 && mapsWithExtendedLeaderboard >= totalMaps;
    coverageStateEl.textContent =
      totalMaps === 0 ? "No Maps" : isComplete ? "Complete" : fmtPercent(extendedCoveragePct, 1);
    coverageStateEl.classList.toggle("is-complete", isComplete);
  }

  const barsEl = document.getElementById("metricLeaderboardCoverageBars");
  if (barsEl) {
    const rows = [
      {
        label: "WR Known",
        value: mapsWithKnownWr,
        pct: Number(coverage.wrCoveragePct || 0),
        tone: "is-known",
      },
      {
        label: "Any Leaderboard Rows",
        value: mapsWithLeaderboardRows,
        pct: Number(coverage.leaderboardCoveragePct || 0),
        tone: "is-any",
      },
      {
        label: "Fuller Leaderboard",
        value: mapsWithExtendedLeaderboard,
        pct: Number(coverage.extendedCoveragePct || 0),
        tone: "is-fuller",
      },
    ];
    globalThis.XjkSafeHtml.set(
      barsEl,
      rows
        .map((row) => {
          const pct = Math.max(0, Math.min(100, Number(row.pct || 0)));
          return `
            <div class="coverage-bar-row">
              <div class="coverage-bar-head">
                <span class="coverage-bar-label">${escapeHtml(row.label)}</span>
                <span class="coverage-bar-value">${escapeHtml(`${fmtNumber(row.value)} / ${fmtNumber(totalMaps)} (${fmtPercent(pct, 1)})`)}</span>
              </div>
              <div class="coverage-bar-track">
                <span class="coverage-bar-fill ${row.tone}" style="width:${pct.toFixed(2)}%"></span>
              </div>
            </div>
          `;
        })
        .join("")
    );
  }
}

function applyMetricsTimeline(timelinePayload) {
  const series = timelinePayload?.series || {};
  renderLineChart("eventsChart", series.events || [], ["checks", "changes"], ["Checks", "Changes"]);
  renderLineChart(
    "runsChart",
    series.runs || [],
    ["mapsChecked", "avgDurationSeconds"],
    ["Maps Checked", "Avg Run Seconds"]
  );
  renderLineChart("namesChart", series.names || [], ["updates"], ["Name Updates"]);
}

async function loadMetrics() {
  const overviewPayload = await fetchJson("/api/v1/metrics/overview");
  applyMetricsOverview(overviewPayload);
  const leaderboardCoveragePayload = await fetchJson("/api/v1/metrics/leaderboards/coverage");
  applyLeaderboardCoverage(leaderboardCoveragePayload);
  await waitForNextPaint();
  const timelinePayload = await fetchJson(
    `/api/v1/metrics/timeseries?bucket=${encodeURIComponent(state.metrics.bucket)}&window_hours=${encodeURIComponent(state.metrics.windowHours)}`
  );
  applyMetricsTimeline(timelinePayload);
}

export { loadMetrics };
