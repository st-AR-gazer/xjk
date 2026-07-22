import assert from "node:assert/strict";
import test from "node:test";

import { createDatabase } from "../src/db/index.js";
import { AdminDataRepository } from "../src/repositories/adminDataRepository.js";
import { AggregatorRepository } from "../src/repositories/aggregatorRepository.js";
import { ClubRepository } from "../src/repositories/clubRepository.js";
import { AlteredSnapshotRepository } from "../src/repositories/dashboard/alteredSnapshotRepository.js";
import { MetricsRepository } from "../src/repositories/dashboard/metricsRepository.js";
import { ProjectSnapshotRepository } from "../src/repositories/dashboard/projectSnapshotRepository.js";
import { TrackerSnapshotRepository } from "../src/repositories/dashboard/trackerSnapshotRepository.js";
import { DashboardRepository } from "../src/repositories/dashboardRepository.js";
import { DisplayNameRepository } from "../src/repositories/displayNameRepository.js";
import { EventIngestRepository } from "../src/repositories/eventIngestRepository.js";
import { ProjectQueryRepository } from "../src/repositories/projectQueryRepository.js";
import { buildAllTimeTrafficQueryMeta } from "../src/repositories/traffic/trafficQuerySupport.js";
import { TrafficRepository } from "../src/repositories/trafficRepository.js";

const PUBLIC_METHODS = [
  "appendAggregatorEvent",
  "backfillNormalizedDisplayNames",
  "backfillTrafficSamples",
  "buildDbTrackerEntry",
  "bumpTrafficCacheVersion",
  "collectDisplayNameCandidates",
  "getAlteredCheckHistory",
  "getAlteredDashboardSummary",
  "getClubCampaigns",
  "getClubMaps",
  "getClubMembers",
  "getClubSummary",
  "getClubTrackerSnapshot",
  "getDisplayNames",
  "getDisplayNamesByName",
  "getDisplayNameTrackerSnapshot",
  "getEventFacets",
  "getIngestRunTotals",
  "getLatestIngestRun",
  "getLatestObservedTrafficWindowMeta",
  "getLatestProjectInstance",
  "getMapProjects",
  "getMeta",
  "getMetricsOverview",
  "getMetricsTimeseries",
  "getNadeoGuardrailSnapshot",
  "getPreferredProject",
  "getProject",
  "getProjectMaps",
  "getProjectMapStats",
  "getRecentEvents",
  "getTableRows",
  "getTableSchema",
  "getTrackerStatusSnapshots",
  "getTrafficBackfillState",
  "getTrafficErrors",
  "getTrafficFacets",
  "getTrafficOverview",
  "getTrafficTimeseries",
  "getTrafficTop",
  "getWrBaselineQueue",
  "heartbeatInstance",
  "ingestClubSnapshot",
  "ingestDisplayNames",
  "ingestEvents",
  "ingestTrackerRun",
  "ingestTraffic",
  "insertTrafficSampleRecord",
  "listDataTables",
  "listDisplayNameCandidateDetails",
  "listDisplayNameCandidates",
  "listLegacyTrafficSamples",
  "listProjectInstances",
  "listProjects",
  "listTrafficSamples",
  "registerInstance",
  "searchDisplayNames",
  "upsertProjectSeen",
  "withTrafficCache",
].sort();

test("facade preserves the repository API and composes explicit domain repositories", () => {
  const db = {};
  const repository = new AggregatorRepository(db);
  const actualMethods = Object.getOwnPropertyNames(AggregatorRepository.prototype)
    .filter((name) => name !== "constructor")
    .sort();

  assert.deepEqual(actualMethods, PUBLIC_METHODS);
  assert.equal(repository.db, db);
  assert.ok(repository.adminDataRepository instanceof AdminDataRepository);
  assert.ok(repository.clubRepository instanceof ClubRepository);
  assert.ok(repository.dashboardRepository instanceof DashboardRepository);
  assert.ok(repository.displayNameRepository instanceof DisplayNameRepository);
  assert.ok(repository.eventIngestRepository instanceof EventIngestRepository);
  assert.ok(repository.projectQueryRepository instanceof ProjectQueryRepository);
  assert.ok(repository.trafficRepository instanceof TrafficRepository);
  assert.equal(repository.trafficRepository.eventsRepository, repository.eventIngestRepository);
  assert.equal(repository.displayNameRepository.eventsRepository, repository.eventIngestRepository);
  assert.equal(repository.clubRepository.eventsRepository, repository.eventIngestRepository);
  assert.equal(repository.dashboardRepository.trafficRepository, repository.trafficRepository);
  assert.equal(repository.dashboardRepository.adminDataRepository, repository.adminDataRepository);
});

test("dashboard facade preserves domain ownership and forwards arguments unchanged", () => {
  const db = {};
  const trafficRepository = {};
  const adminDataRepository = {};
  const repository = new DashboardRepository(db, { trafficRepository, adminDataRepository });
  const domains = [
    {
      property: "projectRepository",
      Type: ProjectSnapshotRepository,
      methods: [
        "getPreferredProject",
        "getLatestProjectInstance",
        "getLatestIngestRun",
        "getIngestRunTotals",
        "getProjectMapStats",
        "buildDbTrackerEntry",
      ],
    },
    {
      property: "trackerRepository",
      Type: TrackerSnapshotRepository,
      methods: [
        "getDisplayNameTrackerSnapshot",
        "getClubTrackerSnapshot",
        "getTrackerStatusSnapshots",
        "getNadeoGuardrailSnapshot",
      ],
    },
    {
      property: "alteredRepository",
      Type: AlteredSnapshotRepository,
      methods: ["getAlteredDashboardSummary", "getAlteredCheckHistory"],
    },
    {
      property: "metricsRepository",
      Type: MetricsRepository,
      methods: ["getMetricsOverview", "getMetricsTimeseries"],
    },
  ];

  assert.equal(repository.db, db);
  assert.equal(repository.trafficRepository, trafficRepository);
  assert.equal(repository.adminDataRepository, adminDataRepository);
  assert.equal(repository.trackerRepository.projectRepository, repository.projectRepository);
  assert.equal(repository.trackerRepository.trafficRepository, trafficRepository);
  assert.equal(repository.metricsRepository.adminDataRepository, adminDataRepository);

  for (const { property, Type, methods } of domains) {
    const domain = repository[property];
    assert.ok(domain instanceof Type);
    for (const method of methods) {
      const args = [{ method }, 42];
      domain[method] = (...received) => ({ method, received });
      assert.deepEqual(repository[method](...args), { method, received: args });
    }
  }
});

test("all-time traffic query construction does not require windowHours", () => {
  const meta = buildAllTimeTrafficQueryMeta({
    projectKey: " Demo Project ",
    service: " API ",
    direction: "outgoing",
    statusMin: 400,
    q: "Nadeo",
  });

  assert.deepEqual(meta, {
    safeProjectKey: "demo-project",
    safeService: "api",
    safeDirection: "outgoing",
    safeStatusMin: 400,
    queryText: "nadeo",
    sinceIso: null,
    clauses: [
      "1 = 1",
      "project_key = ?",
      "LOWER(service) = ?",
      "direction = ?",
      "status_code >= ?",
      "(LOWER(COALESCE(method, '')) LIKE ? OR LOWER(COALESCE(route, '')) LIKE ? OR LOWER(COALESCE(target_host, '')) LIKE ? OR LOWER(COALESCE(target_path, '')) LIKE ? OR LOWER(COALESCE(service, '')) LIKE ? OR LOWER(COALESCE(project_key, '')) LIKE ? OR LOWER(COALESCE(source_label, '')) LIKE ? OR LOWER(CAST(COALESCE(status_code, 0) AS TEXT)) LIKE ?)",
    ],
    args: [
      "demo-project",
      "api",
      "outgoing",
      400,
      "%nadeo%",
      "%nadeo%",
      "%nadeo%",
      "%nadeo%",
      "%nadeo%",
      "%nadeo%",
      "%nadeo%",
      "%nadeo%",
    ],
  });
});

test("facade coordinates project, traffic, display-name, club, and admin domains", (t) => {
  const db = createDatabase({ filePath: ":memory:" });
  t.after(() => db.close());
  const repository = new AggregatorRepository(db);
  const accountId = "12345678-1234-1234-1234-123456789abc";
  const observedAt = new Date().toISOString();

  const registered = repository.registerInstance({
    projectKey: "Demo Project",
    projectName: "Demo",
    instanceId: "Node One",
    meta: { version: 2 },
  });
  assert.deepEqual(
    {
      projectKey: registered.projectKey,
      instanceId: registered.instanceId,
      instanceName: registered.instanceName,
      status: registered.status,
    },
    {
      projectKey: "demo-project",
      instanceId: "node-one",
      instanceName: "node-one",
      status: "online",
    }
  );
  assert.match(registered.registeredAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(registered.lastHeartbeatAt, registered.registeredAt);

  const projects = repository.listProjects();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].projectKey, "demo-project");
  assert.equal(repository.listProjectInstances("demo-project").length, 1);

  const trafficResult = repository.ingestTraffic({
    projectKey: "Demo Project",
    sourceLabel: "test",
    samples: [
      {
        direction: "outgoing",
        service: "api",
        method: "GET",
        route: "/maps",
        targetHost: "prod.trackmania.core.nadeo.online",
        targetPath: "/maps",
        statusCode: 503,
        durationMs: 12,
        occurredAt: observedAt,
      },
    ],
  });
  assert.equal(trafficResult.accepted, 1);
  const traffic = repository.listTrafficSamples({ windowHours: 24, projectKey: "demo-project" });
  assert.equal(traffic.length, 1);
  assert.deepEqual(
    {
      projectKey: traffic[0].projectKey,
      direction: traffic[0].direction,
      service: traffic[0].service,
      statusCode: traffic[0].statusCode,
      isNadeoOutgoing: traffic[0].isNadeoOutgoing,
    },
    {
      projectKey: "demo-project",
      direction: "outgoing",
      service: "api",
      statusCode: 503,
      isNadeoOutgoing: true,
    }
  );
  const overview = repository.getTrafficOverview({ windowHours: 24, projectKey: "demo-project" });
  assert.equal(overview.requests, 1);
  assert.equal(overview.errorRequests, 1);

  const displayNames = repository.ingestDisplayNames({
    projectKey: "Demo Project",
    names: [{ accountId, displayName: "Example Player", observedAt }],
  });
  assert.deepEqual(
    {
      accepted: displayNames.accepted,
      inserted: displayNames.inserted,
      updated: displayNames.updated,
      unchanged: displayNames.unchanged,
      rejectedCount: displayNames.rejectedCount,
    },
    { accepted: 1, inserted: 1, updated: 0, unchanged: 0, rejectedCount: 0 }
  );
  assert.equal(repository.getDisplayNames({ accountIds: [accountId] })[0].displayName, "Example Player");

  const club = repository.ingestClubSnapshot({
    projectKey: "Demo Project",
    club: { id: 42, name: "Demo Club" },
    members: [{ accountId, displayName: "Example Player", role: "admin" }],
  });
  assert.equal(club.clubId, 42);
  assert.equal(club.membersSeen, 1);
  assert.deepEqual(
    {
      clubName: repository.getClubSummary(42).clubName,
      memberName: repository.getClubMembers(42)[0].displayName,
    },
    { clubName: "Demo Club", memberName: "Example Player" }
  );

  const meta = repository.getMeta();
  assert.equal(meta.projects, 1);
  assert.equal(meta.maps, 0);
  assert.equal(meta.events, 5);
  assert.match(meta.latestEventAt, /^\d{4}-\d{2}-\d{2}T/);
});
