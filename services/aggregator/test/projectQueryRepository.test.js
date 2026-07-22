import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabase } from "../src/db/index.js";
import { EventQueryRepository } from "../src/repositories/projectQuery/eventQueryRepository.js";
import { ProjectReadRepository } from "../src/repositories/projectQuery/projectReadRepository.js";
import { WrBaselineQueryRepository } from "../src/repositories/projectQuery/wrBaselineQueryRepository.js";
import { ProjectQueryRepository } from "../src/repositories/projectQueryRepository.js";

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.join(serviceRoot, "src", "repositories");
const queryModuleRoot = path.join(repositoryRoot, "projectQuery");
const facadeMethods = [
  "getEventFacets",
  "getMapProjects",
  "getProject",
  "getProjectMaps",
  "getRecentEvents",
  "getWrBaselineQueue",
  "listProjectInstances",
  "listProjects",
];

function createFixture(context) {
  const db = createDatabase({ filePath: ":memory:" });
  context.after(() => db.close());

  db.exec("BEGIN");
  try {
    const insertProject = db.prepare(
      "INSERT INTO projects (project_key, display_name, source_label, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?)"
    );
    insertProject.run(
      "alpha-project",
      "Alpha Project",
      "alpha-source",
      "2026-01-01T00:00:00.000Z",
      "2026-01-10T00:00:00.000Z"
    );
    insertProject.run(
      "beta-project",
      "Beta Project",
      "beta-source",
      "2026-01-02T00:00:00.000Z",
      "2026-01-09T00:00:00.000Z"
    );

    db.prepare(
      `INSERT INTO project_instances
        (project_key, instance_id, instance_name, source_label, status, registered_at, last_heartbeat_at, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "alpha-project",
      "alpha-node",
      "Alpha Node",
      "worker",
      "online",
      "2026-01-03T00:00:00.000Z",
      "2026-01-10T01:00:00.000Z",
      JSON.stringify({ version: 2 })
    );

    const insertMap = db.prepare(
      "INSERT INTO map_registry (map_uid, map_name, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?)"
    );
    insertMap.run("map-alpha", "Summer 01", "2026-01-01T00:00:00.000Z", "2026-01-08T00:00:00.000Z");
    insertMap.run("map-beta", "Winter 02", "2026-01-01T00:00:00.000Z", "2026-01-08T00:00:00.000Z");

    const insertProjectMap = db.prepare(
      `INSERT INTO project_maps
        (project_key, map_uid, latest_checked_at, last_changed_at, wr_ms, wr_holder, source, note,
         check_count, change_count, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertProjectMap.run(
      "alpha-project",
      "map-alpha",
      "2026-01-08T06:00:00.000Z",
      "2026-01-08T06:00:00.000Z",
      1000,
      "Player One",
      "tracker-run",
      "changed",
      5,
      2,
      "ok",
      "2026-01-08T06:00:00.000Z"
    );
    insertProjectMap.run(
      "alpha-project",
      "map-beta",
      "2026-01-08T05:00:00.000Z",
      null,
      2000,
      "Player Two",
      "tracker-run",
      "unchanged",
      3,
      0,
      "ok",
      "2026-01-08T05:00:00.000Z"
    );
    insertProjectMap.run(
      "beta-project",
      "map-alpha",
      "2026-01-08T04:00:00.000Z",
      null,
      1100,
      "Player Beta",
      "tracker-run",
      "unchanged",
      1,
      0,
      "ok",
      "2026-01-08T04:00:00.000Z"
    );

    db.prepare(
      `INSERT INTO ingest_runs
        (project_key, provider, reason, source_label, started_at, finished_at, maps_considered,
         maps_checked, wr_changes, note, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "alpha-project",
      "fixture",
      "test",
      "worker",
      "2026-01-08T06:30:00.000Z",
      "2026-01-08T07:00:00.000Z",
      2,
      2,
      1,
      "complete",
      "2026-01-08T07:01:00.000Z"
    );

    const insertMapEvent = db.prepare(
      `INSERT INTO map_events
        (project_key, map_uid, map_name, checked_at, changed, old_wr_time, new_wr_time,
         old_holder, new_holder, source, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertMapEvent.run(
      "alpha-project",
      "map-alpha",
      "Summer 01",
      "2026-01-08T06:00:00.000Z",
      1,
      0,
      1000,
      null,
      "Player One",
      null,
      "new record"
    );
    insertMapEvent.run(
      "alpha-project",
      "map-beta",
      "Winter 02",
      "2026-01-08T05:00:00.000Z",
      0,
      2000,
      2000,
      "Player Two",
      "Player Two",
      "tracker-run",
      "unchanged"
    );

    const insertAggregatorEvent = db.prepare(
      `INSERT INTO aggregator_events
        (project_key, occurred_at, event_type, detail_1, detail_2, detail_3, source_label, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertAggregatorEvent.run(
      "alpha-project",
      "2026-01-08T08:00:00.000Z",
      "displayname.checked",
      "Player One",
      "account-1",
      "change:* first seen",
      "displayname-worker",
      JSON.stringify({ change: "new", displayName: "Player One" })
    );
    insertAggregatorEvent.run(
      "alpha-project",
      "2026-01-08T09:00:00.000Z",
      "instance.heartbeat",
      "alpha-node",
      null,
      null,
      "system",
      null
    );
    insertAggregatorEvent.run(
      "beta-project",
      "2026-01-08T10:00:00.000Z",
      "club.checked",
      "Beta Club",
      null,
      null,
      "club-worker",
      null
    );

    const insertQueueItem = db.prepare(
      `INSERT INTO wr_baseline_queue
        (project_key, map_uid, map_name, checked_at, reason_code, old_wr_time, new_wr_time,
         old_holder, new_holder, source, note, status, resolution_note, created_at, updated_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertQueueItem.run(
      "alpha-project",
      "map-alpha",
      "Summer 01",
      "2026-01-08T06:00:00.000Z",
      "missing-baseline",
      null,
      1000,
      null,
      "Player One",
      "tracker-run",
      "first baseline",
      "queued",
      null,
      "2026-01-08T11:00:00.000Z",
      "2026-01-08T11:00:00.000Z",
      null
    );
    insertQueueItem.run(
      "alpha-project",
      "map-beta",
      "Winter 02",
      "2026-01-08T05:00:00.000Z",
      "holder-mismatch",
      2000,
      1990,
      "Player Two",
      "Player Three",
      "tracker-run",
      "review",
      "queued",
      null,
      "2026-01-08T12:00:00.000Z",
      "2026-01-08T12:00:00.000Z",
      null
    );
    insertQueueItem.run(
      "alpha-project",
      "map-alpha",
      "Summer 01",
      "2026-01-07T06:00:00.000Z",
      "resolved-baseline",
      1050,
      1000,
      "Player Zero",
      "Player One",
      "tracker-run",
      "resolved",
      "resolved",
      "approved",
      "2026-01-07T11:00:00.000Z",
      "2026-01-07T12:00:00.000Z",
      "2026-01-07T12:00:00.000Z"
    );
    insertQueueItem.run(
      "beta-project",
      "map-alpha",
      "Summer 01",
      "2026-01-08T04:00:00.000Z",
      "missing-baseline",
      null,
      1100,
      null,
      "Player Beta",
      "tracker-run",
      "first baseline",
      "queued",
      null,
      "2026-01-08T13:00:00.000Z",
      "2026-01-08T13:00:00.000Z",
      null
    );

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { db, repository: new ProjectQueryRepository(db) };
}

test("project-query facade composes query domains and forwards arguments unchanged", () => {
  const db = {};
  const repository = new ProjectQueryRepository(db);
  assert.equal(repository.db, db);
  assert.ok(repository.projectReadRepository instanceof ProjectReadRepository);
  assert.ok(repository.eventQueryRepository instanceof EventQueryRepository);
  assert.ok(repository.wrBaselineQueryRepository instanceof WrBaselineQueryRepository);
  assert.deepEqual(
    Object.getOwnPropertyNames(ProjectQueryRepository.prototype)
      .filter((name) => name !== "constructor")
      .sort(),
    facadeMethods
  );

  const ownership = new Map([
    ["listProjects", repository.projectReadRepository],
    ["listProjectInstances", repository.projectReadRepository],
    ["getProject", repository.projectReadRepository],
    ["getProjectMaps", repository.projectReadRepository],
    ["getMapProjects", repository.projectReadRepository],
    ["getEventFacets", repository.eventQueryRepository],
    ["getRecentEvents", repository.eventQueryRepository],
    ["getWrBaselineQueue", repository.wrBaselineQueryRepository],
  ]);
  for (const [method, owner] of ownership) {
    const first = { method };
    const second = { marker: Symbol(method) };
    const expected = Symbol(`${method}:result`);
    owner[method] = (...args) => {
      assert.deepEqual(args, [first, second]);
      return expected;
    };
    assert.equal(repository[method](first, second), expected);
  }
});

test("project-query facade contains composition only and modules retain bounded ownership", async () => {
  const facadeSource = await readFile(path.join(repositoryRoot, "projectQueryRepository.js"), "utf8");
  assert.ok(facadeSource.split(/\r?\n/).length <= 80);
  assert.doesNotMatch(facadeSource, /\.prepare\(|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/);

  const modules = ["projectReadRepository.js", "eventQueryRepository.js", "wrBaselineQueryRepository.js"];
  for (const moduleName of modules) {
    assert.match(facadeSource, new RegExp(`from ["']\\./projectQuery/${moduleName.replace(".", "\\.")}["']`));
    const source = await readFile(path.join(queryModuleRoot, moduleName), "utf8");
    assert.ok(source.split(/\r?\n/).length <= 450, `${moduleName} has outgrown its query boundary`);
  }
  assert.match(await readFile(path.join(queryModuleRoot, "README.md"), "utf8"), /compatibility facade/);
});

test("project reads preserve summary, normalization, filtering, and reverse-map contracts", (context) => {
  const { repository } = createFixture(context);
  const projects = repository.listProjects({ limit: 10 });

  assert.deepEqual(
    projects.map(({ projectKey }) => projectKey),
    ["alpha-project", "beta-project"]
  );
  assert.deepEqual(
    {
      trackedMaps: projects[0].trackedMaps,
      totalChecks: projects[0].totalChecks,
      totalChanges: projects[0].totalChanges,
      latestCheckedAt: projects[0].latestCheckedAt,
      latestRunAt: projects[0].latestRunAt,
    },
    {
      trackedMaps: 2,
      totalChecks: 8,
      totalChanges: 2,
      latestCheckedAt: "2026-01-08T06:00:00.000Z",
      latestRunAt: "2026-01-08T07:00:00.000Z",
    }
  );
  assert.deepEqual(repository.listProjectInstances("Alpha Project")[0].meta, { version: 2 });
  assert.equal(repository.getProject("Alpha Project").projectKey, "alpha-project");
  assert.deepEqual(
    repository.getProjectMaps("Alpha Project", { changedOnly: true, q: "SUMMER" }).map(({ mapUid }) => mapUid),
    ["map-alpha"]
  );
  assert.deepEqual(
    repository.getMapProjects("map-alpha").map(({ projectKey }) => projectKey),
    ["alpha-project", "beta-project"]
  );
  assert.equal(repository.getProject(""), null);
  assert.deepEqual(repository.getProjectMaps(""), []);
});

test("event queries preserve facets, merged ordering, change markers, and filters", (context) => {
  const { repository } = createFixture(context);
  const facets = repository.getEventFacets({
    projectKey: "Alpha Project",
    fromIso: "2026-01-08T00:00:00Z",
    toIso: "2026-01-09T00:00:00Z",
  });
  assert.deepEqual(facets.sources, ["displayname-worker", "tracker-run"]);
  assert.deepEqual(facets.eventTypes, ["displayname.checked", "map.checked", "map.wr_changed"]);
  assert.deepEqual(facets.filters, {
    projectKey: "alpha-project",
    includeSystem: false,
    fromIso: "2026-01-08T00:00:00.000Z",
    toIso: "2026-01-09T00:00:00.000Z",
  });

  const recent = repository.getRecentEvents({ projectKey: "Alpha Project", limit: 10 });
  assert.deepEqual(
    recent.events.map(({ eventType }) => eventType),
    ["displayname.checked", "map.wr_changed", "map.checked"]
  );
  assert.equal(recent.events[0].changedLabel, "*");
  assert.equal(recent.events[0].eventDetail, "account-1 | first seen");
  assert.equal(recent.events[1].changedLabel, "*");
  assert.equal(recent.events[2].changedLabel, "no");
  assert.equal(recent.total, 3);

  const changed = repository.getRecentEvents({ projectKey: "Alpha Project", changedOnly: true, limit: 10 });
  assert.deepEqual(
    changed.events.map(({ eventType }) => eventType),
    ["displayname.checked", "map.wr_changed"]
  );
  assert.deepEqual(
    repository
      .getRecentEvents({ projectKey: "Alpha Project", eventType: "map.wr_changed", q: "summer" })
      .events.map(({ eventKey }) => eventKey),
    ["map:1"]
  );
});

test("WR-baseline queries preserve count-first paging, page clamping, and search filters", (context) => {
  const { repository } = createFixture(context);
  const page = repository.getWrBaselineQueue({
    projectKey: "Alpha Project",
    status: "QUEUED",
    limit: 1,
    page: 2,
    offset: 99,
  });

  assert.equal(page.total, 2);
  assert.equal(page.totalPages, 2);
  assert.equal(page.page, 2);
  assert.equal(page.offset, 1);
  assert.equal(page.count, 1);
  assert.equal(page.items[0].mapUid, "map-alpha");
  assert.deepEqual(page.filters, { status: "queued", projectKey: "alpha-project", q: "" });

  const search = repository.getWrBaselineQueue({
    projectKey: "Alpha Project",
    status: "all",
    q: "PLAYER ZERO",
  });
  assert.equal(search.total, 1);
  assert.equal(search.items[0].status, "resolved");
  assert.equal(search.items[0].oldWrTime, 1050);
  assert.equal(search.items[0].newWrTime, 1000);
  assert.equal(search.filters.q, "player zero");
});
