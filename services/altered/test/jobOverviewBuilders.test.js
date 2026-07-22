import assert from "node:assert/strict";
import test from "node:test";

import { buildOverviewJobs } from "../src/routes/admin/jobOverviewBuilders.js";
import { buildJobsOverviewPayload } from "../src/routes/admin/jobPayloads.js";

function jobByKey(jobs, jobKey) {
  return jobs.find((job) => job.jobKey === jobKey);
}

test("jobs overview always returns the six canonical jobs in presentation order", () => {
  const input = {
    hook: {},
    liveStatus: {},
    trackerStatus: {},
    trackerRuns: [],
    opsOverview: {},
    localStore: {},
  };
  const payload = buildJobsOverviewPayload(input);

  assert.match(payload.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(
    payload.jobs.map((job) => job.jobKey),
    [
      "club-full-sync",
      "club-discovery-sync",
      "tracker-run",
      "displayname-sync",
      "ops-scheduler",
      "map-local-copy-backfill",
    ]
  );
  assert.equal(jobByKey(payload.jobs, "ops-scheduler").summaryLine, "No ops scheduler run has completed yet.");
  assert.equal(
    jobByKey(payload.jobs, "map-local-copy-backfill").summaryLine,
    "Local map copy store has not been initialized yet."
  );
});

test("job builders preserve running, successful, failed, and disabled state details", () => {
  const jobs = buildOverviewJobs({
    hook: { latestRun: { startedAt: "2026-07-19T08:00:00Z", finishedAt: "2026-07-19T08:02:00Z" } },
    liveStatus: {
      configured: true,
      monitor: {
        enabled: true,
        running: true,
        lastStartedAt: "2026-07-20T08:00:00Z",
        discoveryEnabled: true,
        discoveryRunning: false,
        lastDiscoveryError: "discovery failed",
        lastDiscoveryStartedAt: "2026-07-20T07:00:00Z",
        lastDiscoveryFinishedAt: "2026-07-20T07:01:00Z",
      },
      mapperNameSync: { enabled: false, running: false },
    },
    trackerStatus: { error: "tracker unavailable", runtime: { enabled: true } },
    trackerRuns: [{ startedAt: "2026-07-20T06:00:00Z", finishedAt: "2026-07-20T06:01:00Z", durationMs: 60000 }],
    opsOverview: {
      scheduler: {
        enabled: true,
        running: false,
        lastFinishedAt: "2026-07-20T05:00:00Z",
        lastSummary: { mapsChecked: 12, mapsChanged: 3 },
      },
    },
    localStore: {
      enabled: true,
      job: { running: false, lastFinishedAt: "2026-07-20T04:00:00Z", lastDurationMs: "250" },
      summary: { downloadedCount: 8, totalMaps: 10, signatureReadyCount: 7 },
    },
  });

  assert.equal(jobByKey(jobs, "club-full-sync").state, "running");
  assert.equal(jobByKey(jobs, "club-discovery-sync").state, "failed");
  assert.equal(jobByKey(jobs, "club-discovery-sync").lastSuccessAt, null);
  assert.equal(jobByKey(jobs, "tracker-run").errorLine, "tracker unavailable");
  assert.equal(jobByKey(jobs, "displayname-sync").enabled, false);
  assert.equal(jobByKey(jobs, "ops-scheduler").summaryLine, "12 maps checked | 3 changed");
  assert.equal(jobByKey(jobs, "map-local-copy-backfill").durationMs, 250);
  assert.equal(jobByKey(jobs, "map-local-copy-backfill").summaryLine, "8/10 local files | 7 signatures");
});
