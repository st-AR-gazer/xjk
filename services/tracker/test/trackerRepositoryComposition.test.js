import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabase } from "../src/db/index.js";
import { TrackerCatalogMutationRepository } from "../src/repositories/trackerCatalogMutationRepository.js";
import { TrackerLeaderboardMutationRepository } from "../src/repositories/trackerLeaderboardMutationRepository.js";
import { TrackerLeaderboardQueryRepository } from "../src/repositories/trackerLeaderboardQueryRepository.js";
import { TrackerMapQueryRepository } from "../src/repositories/trackerMapQueryRepository.js";
import { TrackerPlayerRepository } from "../src/repositories/trackerPlayerRepository.js";
import { TrackerRepository } from "../src/repositories/trackerRepository.js";
import { TrackerRunRepository } from "../src/repositories/trackerRunRepository.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = path.resolve(testDirectory, "../src/repositories");
const expectedRepositoryFiles = [
  "trackerCatalogMutationRepository.js",
  "trackerLeaderboardMutationRepository.js",
  "trackerLeaderboardQueryRepository.js",
  "trackerMapQueryRepository.js",
  "trackerPlayerRepository.js",
  "trackerRepository.js",
  "trackerRepositorySupport.js",
  "trackerRunRepository.js",
];
const delegationGroups = {
  mapQueryRepository: [
    "getSummary",
    "getCampaignNames",
    "getMaps",
    "getTrackedMaps",
    "getMapInfo",
    "getMapByUid",
    "getTrackedLiveCandidates",
    "getDueTrackedMaps",
    "countDueTrackedMaps",
    "touchMapCheckedAt",
    "getMapOptions",
  ],
  leaderboardQueryRepository: [
    "getMedalLeaderboards",
    "getWrFeed",
    "getLeaderboardFeed",
    "getLeaderboardWrLeaderboards",
    "getTopWrAccounts",
    "getLeaderboardCoverage",
  ],
  runRepository: ["recordTrackerRun", "getLatestTrackerRun", "getTrackerRuns"],
  catalogMutationRepository: [
    "upsertClub",
    "upsertCampaignByName",
    "updateMapCampaign",
    "updateMapTracking",
    "bulkUpsertMaps",
  ],
  leaderboardMutationRepository: ["insertWrEvent", "replaceLeaderboardSnapshot"],
  playerRepository: ["bulkUpsertPlayerNames", "getPlayerNamesByAccountIds"],
};
const publicMethods = Object.values(delegationGroups).flat().sort();

function sourceFor(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function importSpecifiers(source) {
  return [...source.matchAll(/(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)].map((match) => match[1]);
}

function exportedNames(source) {
  const names = new Set(
    [...source.matchAll(/^export\s+(?:(?:async\s+)?function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map(
      (match) => match[1]
    )
  );
  for (const match of source.matchAll(/^export\s*{([^}]+)}/gm)) {
    for (const entry of match[1].split(",")) {
      const name = entry
        .trim()
        .split(/\s+as\s+/)
        .at(-1);
      if (name) names.add(name);
    }
  }
  return names;
}

function repositoryPath(name) {
  return path.join(repositoryDirectory, name);
}

test("TrackerRepository preserves its API and composes explicit domain repositories", () => {
  const db = {};
  const repository = new TrackerRepository(db);
  const actualMethods = Object.getOwnPropertyNames(TrackerRepository.prototype)
    .filter((name) => name !== "constructor")
    .sort();

  assert.deepEqual(actualMethods, publicMethods);
  assert.deepEqual(Object.keys(repository).sort(), [
    "catalogMutationRepository",
    "db",
    "leaderboardMutationRepository",
    "leaderboardQueryRepository",
    "mapQueryRepository",
    "playerRepository",
    "runRepository",
  ]);
  assert.equal(repository.db, db);
  assert.ok(repository.mapQueryRepository instanceof TrackerMapQueryRepository);
  assert.ok(repository.leaderboardQueryRepository instanceof TrackerLeaderboardQueryRepository);
  assert.ok(repository.runRepository instanceof TrackerRunRepository);
  assert.ok(repository.catalogMutationRepository instanceof TrackerCatalogMutationRepository);
  assert.ok(repository.leaderboardMutationRepository instanceof TrackerLeaderboardMutationRepository);
  assert.ok(repository.playerRepository instanceof TrackerPlayerRepository);
  assert.equal(repository.catalogMutationRepository.mapQueryRepository, repository.mapQueryRepository);
  assert.equal(repository.leaderboardMutationRepository.mapQueryRepository, repository.mapQueryRepository);
});

test("TrackerRepository delegates each domain through an observable seam", () => {
  const repository = new TrackerRepository({});
  for (const [property, methods] of Object.entries(delegationGroups)) {
    for (const method of methods) {
      const argument = { method };
      const marker = { property, method };
      repository[property][method] = (...args) => ({ marker, args });
      assert.deepEqual(repository[method](argument), { marker, args: [argument] });
    }
  }
});

test("tracker repository modules stay bounded, resolvable, and acyclic", () => {
  assert.deepEqual(
    fs
      .readdirSync(repositoryDirectory)
      .filter((name) => name.startsWith("tracker") && name.endsWith("Repository.js"))
      .sort(),
    expectedRepositoryFiles.filter((name) => name.endsWith("Repository.js")).sort()
  );

  const files = expectedRepositoryFiles.map(repositoryPath);
  const sources = new Map(files.map((filePath) => [filePath, sourceFor(filePath)]));
  const graph = new Map();

  for (const filePath of files) {
    const source = sources.get(filePath);
    const name = path.basename(filePath);
    const limit = name === "trackerRepository.js" ? 180 : name === "trackerRepositorySupport.js" ? 120 : 600;
    const lineCount = source.split(/\r?\n/).length;
    assert.ok(lineCount <= limit, `${name} has ${lineCount} lines (limit ${limit})`);

    const localDependencies = [];
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith(".")) continue;
      const resolvedPath = path.resolve(path.dirname(filePath), specifier);
      assert.ok(fs.existsSync(resolvedPath), `${name} imports missing ${specifier}`);
      if (sources.has(resolvedPath)) localDependencies.push(resolvedPath);
    }
    graph.set(filePath, localDependencies);

    for (const match of source.matchAll(/import\s*{([^}]*)}\s*from\s*["']([^"']+)["']/g)) {
      const [, rawNames, specifier] = match;
      if (!specifier.startsWith(".")) continue;
      const resolvedPath = path.resolve(path.dirname(filePath), specifier);
      const targetSource = sources.get(resolvedPath);
      if (!targetSource) continue;
      const targetExports = exportedNames(targetSource);
      for (const entry of rawNames.split(",")) {
        const importedName = entry.trim().split(/\s+as\s+/)[0];
        if (importedName) {
          assert.ok(targetExports.has(importedName), `${name} imports missing ${importedName} from ${specifier}`);
        }
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(filePath, trail = []) {
    if (visiting.has(filePath)) {
      assert.fail(`tracker repository cycle: ${[...trail, filePath].map((item) => path.basename(item)).join(" -> ")}`);
    }
    if (visited.has(filePath)) return;
    visiting.add(filePath);
    for (const dependency of graph.get(filePath) || []) visit(dependency, [...trail, filePath]);
    visiting.delete(filePath);
    visited.add(filePath);
  }
  for (const filePath of graph.keys()) visit(filePath);

  const facade = sources.get(repositoryPath("trackerRepository.js"));
  assert.doesNotMatch(facade, /\b(?:SELECT|INSERT|UPDATE|DELETE)\b/);
});

test("composed tracker repositories preserve catalog, run, leaderboard, and player behavior", (t) => {
  const db = createDatabase({ filePath: ":memory:" });
  t.after(() => db.close());
  const repository = new TrackerRepository(db);
  const firstAccountId = "11111111-1111-4111-8111-111111111111";
  const secondAccountId = "22222222-2222-4222-8222-222222222222";
  const thirdAccountId = "33333333-3333-4333-8333-333333333333";

  const catalogResult = repository.bulkUpsertMaps({
    maps: [
      {
        uid: "test-map-1",
        mapId: "map-id-1",
        name: "Test Map",
        campaign: "Summer 2026",
        clubId: 42,
        slot: 3,
        tracked: true,
        status: "live",
        checkFrequency: 300,
        authorMs: 50_000,
        goldMs: 55_000,
        silverMs: 60_000,
        bronzeMs: 65_000,
        wrMs: 45_000,
        wrAccountId: firstAccountId,
        wrHolder: "Initial Holder",
      },
    ],
  });
  assert.deepEqual(catalogResult, { inserted: 1, updated: 0, campaignLinks: 1, total: 1 });
  assert.deepEqual(repository.getSummary(), {
    trackedMaps: 1,
    campaignCount: 1,
    latestWrAt: null,
  });
  assert.equal(repository.getMapInfo("test-map-1").map.campaign, "Summer 2026");
  assert.equal(repository.getMaps({ campaign: "Summer 2026" })[0].slot, 3);
  assert.equal(repository.countDueTrackedMaps({ nowIso: "2026-07-19T12:00:00.000Z" }), 1);

  const run = repository.recordTrackerRun({
    startedAt: "2026-07-19T12:00:00.000Z",
    finishedAt: "2026-07-19T12:00:01.000Z",
    mapsConsidered: 1,
    mapsChecked: 1,
    wrChanges: 1,
    provider: "test-provider",
    checks: [
      {
        mapUid: "test-map-1",
        checkedAt: "2026-07-19T12:00:01.000Z",
        changed: true,
        oldWrTime: 45_000,
        newWrTime: 44_000,
        oldHolder: "Initial Holder",
        newHolder: "Event Holder",
      },
    ],
  });
  assert.equal(run.runId, 1);
  assert.equal(repository.getLatestTrackerRun().provider, "test-provider");
  assert.equal(repository.getTrackerRuns()[0].wrChanges, 1);

  const event = repository.insertWrEvent({
    mapUid: "test-map-1",
    accountId: secondAccountId,
    displayName: "Event Holder",
    recordTime: 44_000,
    timestamp: "2026-07-19T12:01:00.000Z",
  });
  assert.deepEqual(
    {
      uid: event.uid,
      campaign: event.campaign,
      accountId: event.accountId,
      holder: event.holder,
      wrMs: event.wrMs,
    },
    {
      uid: "test-map-1",
      campaign: "Summer 2026",
      accountId: secondAccountId,
      holder: "Event Holder",
      wrMs: 44_000,
    }
  );

  const playerResult = repository.bulkUpsertPlayerNames({
    source: "composition-test",
    players: [
      { accountId: secondAccountId.toUpperCase(), displayName: "Resolved Holder" },
      { accountId: secondAccountId, displayName: "Ignored Duplicate" },
      { accountId: "invalid", displayName: "Ignored Invalid" },
    ],
  });
  assert.deepEqual(playerResult, {
    playersSeen: 1,
    namesUpdated: 1,
    historyInserted: 1,
    mapsUpdated: 1,
    leaderboardRowsUpdated: 1,
    wrHistoryRowsUpdated: 1,
  });
  assert.equal(repository.getPlayerNamesByAccountIds({ accountIds: [secondAccountId] }).found, 1);
  assert.equal(repository.getWrFeed()[0].holder, "Resolved Holder");
  assert.equal(repository.getLeaderboardFeed()[0].holder, "Resolved Holder");
  assert.equal(repository.getTopWrAccounts()[0].displayName, "Resolved Holder");

  const snapshot = repository.replaceLeaderboardSnapshot({
    mapUid: "test-map-1",
    checkedAt: "2026-07-19T12:02:00.000Z",
    source: "composition-test",
    entries: [
      { accountId: thirdAccountId, displayName: "Snapshot Leader", score: 43_000, ranking: 1 },
      { accountId: secondAccountId, displayName: "Resolved Holder", score: 44_000, ranking: 2 },
    ],
  });
  assert.equal(snapshot.entries, 2);
  assert.deepEqual(snapshot.top, {
    accountId: thirdAccountId,
    displayName: "Snapshot Leader",
    score: 43_000,
    ranking: 1,
    timestamp: "2026-07-19T12:02:00.000Z",
  });

  const coverage = repository.getLeaderboardCoverage();
  assert.equal(coverage.totalMaps, 1);
  assert.equal(coverage.mapsWithKnownWr, 1);
  assert.equal(coverage.mapsWithExtendedLeaderboard, 1);
  assert.equal(coverage.leaderboardRowsStored, 2);
  const leaderboards = repository.getLeaderboardWrLeaderboards();
  assert.equal(leaderboards.summary.uniquePlayers, 1);
  assert.equal(leaderboards.overall[0].account_id, thirdAccountId);
});
