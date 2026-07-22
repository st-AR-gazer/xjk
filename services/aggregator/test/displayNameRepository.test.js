import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDatabase } from "../src/db/index.js";
import { DisplayNameCandidateEvidenceRepository } from "../src/repositories/displayName/displayNameCandidateEvidenceRepository.js";
import { DisplayNameCommandRepository } from "../src/repositories/displayName/displayNameCommandRepository.js";
import { DisplayNamePersistenceError } from "../src/repositories/displayName/displayNamePersistenceError.js";
import { DisplayNameQueryRepository } from "../src/repositories/displayName/displayNameQueryRepository.js";
import { DisplayNameRepository } from "../src/repositories/displayNameRepository.js";
import { EventIngestRepository } from "../src/repositories/eventIngestRepository.js";
import { DisplayNameCandidateService } from "../src/services/displayNameCandidateService.js";

const NOW_ISO = "2026-01-10T00:00:00.000Z";
const ACCOUNT_IDS = Object.freeze({
  stale: "11111111-1111-4111-8111-111111111111",
  missingMember: "22222222-2222-4222-8222-222222222222",
  missingPlain: "33333333-3333-4333-8333-333333333333",
  fresh: "44444444-4444-4444-8444-444444444444",
});
const PUBLIC_METHODS = [
  "backfillNormalizedDisplayNames",
  "collectDisplayNameCandidates",
  "getDisplayNames",
  "getDisplayNamesByName",
  "ingestDisplayNames",
  "listDisplayNameCandidateDetails",
  "listDisplayNameCandidates",
  "searchDisplayNames",
].sort();
const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function createFixture(context) {
  const db = createDatabase({ filePath: ":memory:" });
  context.after(() => db.close());
  const eventsRepository = new EventIngestRepository(db);
  const repository = new DisplayNameRepository(db, {
    eventsRepository,
    now: () => Date.parse(NOW_ISO),
  });
  return { db, eventsRepository, repository };
}

function assertPersistenceFailure(action, operation) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof DisplayNamePersistenceError);
    assert.equal(error.code, "DISPLAY_NAME_PERSISTENCE_ERROR");
    assert.equal(error.operation, operation);
    assert.equal(error.cause?.code, "ERR_SQLITE_ERROR");
    return true;
  });
}

test("display-name facade composes explicit boundaries and forwards its public API", () => {
  const db = {};
  const eventsRepository = {};
  const repository = new DisplayNameRepository(db, { eventsRepository });

  assert.deepEqual(
    Object.getOwnPropertyNames(DisplayNameRepository.prototype)
      .filter((name) => name !== "constructor")
      .sort(),
    PUBLIC_METHODS
  );
  assert.equal(repository.db, db);
  assert.equal(repository.eventsRepository, eventsRepository);
  assert.ok(repository.commandRepository instanceof DisplayNameCommandRepository);
  assert.ok(repository.queryRepository instanceof DisplayNameQueryRepository);
  assert.ok(repository.candidateEvidenceRepository instanceof DisplayNameCandidateEvidenceRepository);
  assert.ok(repository.candidateService instanceof DisplayNameCandidateService);
  assert.equal(repository.commandRepository.eventsRepository, eventsRepository);
  assert.equal(repository.candidateService.evidenceRepository, repository.candidateEvidenceRepository);

  const owners = new Map([
    ["backfillNormalizedDisplayNames", repository.commandRepository],
    ["ingestDisplayNames", repository.commandRepository],
    ["getDisplayNamesByName", repository.queryRepository],
    ["getDisplayNames", repository.queryRepository],
    ["searchDisplayNames", repository.queryRepository],
    ["collectDisplayNameCandidates", repository.candidateService],
    ["listDisplayNameCandidateDetails", repository.candidateService],
    ["listDisplayNameCandidates", repository.candidateService],
  ]);
  for (const [method, owner] of owners) {
    const argumentsToForward = [{ method }, Symbol(method)];
    const expected = Symbol(`${method}:result`);
    owner[method] = (...received) => {
      assert.deepEqual(received, argumentsToForward);
      return expected;
    };
    assert.equal(repository[method](...argumentsToForward), expected);
  }
});

test("display-name modules retain command, query, evidence, and planning boundaries", async () => {
  const files = {
    facade: path.join(serviceRoot, "src", "repositories", "displayNameRepository.js"),
    commands: path.join(serviceRoot, "src", "repositories", "displayName", "displayNameCommandRepository.js"),
    queries: path.join(serviceRoot, "src", "repositories", "displayName", "displayNameQueryRepository.js"),
    evidence: path.join(serviceRoot, "src", "repositories", "displayName", "displayNameCandidateEvidenceRepository.js"),
    persistenceError: path.join(serviceRoot, "src", "repositories", "displayName", "displayNamePersistenceError.js"),
    planner: path.join(serviceRoot, "src", "services", "displayNameCandidatePlanner.js"),
    candidateService: path.join(serviceRoot, "src", "services", "displayNameCandidateService.js"),
    documentation: path.join(serviceRoot, "src", "repositories", "displayName", "README.md"),
  };
  const sources = Object.fromEntries(
    await Promise.all(Object.entries(files).map(async ([name, file]) => [name, await readFile(file, "utf8")]))
  );
  const lineBudgets = {
    facade: 80,
    commands: 300,
    queries: 320,
    evidence: 140,
    persistenceError: 70,
    planner: 180,
    candidateService: 90,
  };
  for (const [name, maximumLines] of Object.entries(lineBudgets)) {
    const lineCount = sources[name].split(/\r?\n/).length;
    assert.ok(lineCount <= maximumLines, `${name} has ${lineCount} lines; maximum is ${maximumLines}`);
  }

  assert.doesNotMatch(sources.facade, /\.prepare\(|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/);
  assert.doesNotMatch(sources.planner, /\.prepare\(|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/);
  assert.doesNotMatch(sources.evidence, /staleAfterSeconds|CANDIDATE_SCORES|Date\.now|\bscore\b/);
  assert.match(sources.documentation, /compatibility facade/);
  assert.match(sources.documentation, /fail-closed error contract/);
});

test("valid empty display-name storage returns explicit empty results", (context) => {
  const { repository } = createFixture(context);

  assert.deepEqual(repository.getDisplayNames(), []);
  assert.deepEqual(repository.getDisplayNamesByName(), { queries: [], count: 0 });
  assert.deepEqual(repository.searchDisplayNames(), {
    query: "",
    mode: "contains",
    matches: [],
    count: 0,
  });
  assert.deepEqual(repository.collectDisplayNameCandidates(), []);
  assert.deepEqual(repository.listDisplayNameCandidates(), []);
  assert.deepEqual(repository.listDisplayNameCandidateDetails(), {
    count: 0,
    limit: 200,
    offset: 0,
    candidates: [],
  });
  assert.equal(repository.backfillNormalizedDisplayNames(), false);
});

test("ingestion, search, and candidate planning preserve their behavior across boundaries", (context) => {
  const { db, repository } = createFixture(context);
  const firstIngest = repository.ingestDisplayNames({
    projectKey: "Display Names",
    sourceLabel: "fixture",
    names: [
      { accountId: ACCOUNT_IDS.stale, displayName: "Alpha Player", observedAt: "2026-01-01T00:00:00.000Z" },
      { accountId: ACCOUNT_IDS.fresh, displayName: "Fresh Player", observedAt: "2026-01-09T23:30:00.000Z" },
    ],
  });
  assert.deepEqual(
    {
      accepted: firstIngest.accepted,
      inserted: firstIngest.inserted,
      updated: firstIngest.updated,
      unchanged: firstIngest.unchanged,
      rejectedCount: firstIngest.rejectedCount,
    },
    { accepted: 2, inserted: 2, updated: 0, unchanged: 0, rejectedCount: 0 }
  );

  const secondIngest = repository.ingestDisplayNames({
    projectKey: "Display Names",
    names: [
      {
        accountId: ACCOUNT_IDS.stale,
        displayName: "Alpha Prime",
        observedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
  });
  assert.equal(secondIngest.updated, 1);
  assert.equal(
    repository.searchDisplayNames({ q: "alpha pr", mode: "prefix" }).matches[0].accountId,
    ACCOUNT_IDS.stale
  );
  assert.equal(
    repository.getDisplayNamesByName({ displayNames: ["ALPHA PRIME"] }).queries[0].matches[0].accountId,
    ACCOUNT_IDS.stale
  );

  const insertAccount = db.prepare("INSERT INTO accounts (account_id, first_seen_at, last_seen_at) VALUES (?, ?, ?)");
  insertAccount.run(ACCOUNT_IDS.missingMember, "2026-01-03T00:00:00.000Z", "2026-01-09T22:00:00.000Z");
  insertAccount.run(ACCOUNT_IDS.missingPlain, "2026-01-03T00:00:00.000Z", "2026-01-08T00:00:00.000Z");
  db.prepare("INSERT INTO clubs (club_id, club_name, first_seen_at, last_synced_at) VALUES (?, ?, ?, ?)").run(
    7,
    "Fixture Club",
    "2026-01-01T00:00:00.000Z",
    "2026-01-09T22:30:00.000Z"
  );
  const insertMember = db.prepare("INSERT INTO club_members (club_id, account_id, last_synced_at) VALUES (?, ?, ?)");
  insertMember.run(7, ACCOUNT_IDS.missingMember, "2026-01-09T22:30:00.000Z");
  insertMember.run(7, ACCOUNT_IDS.stale, "2026-01-09T21:30:00.000Z");
  insertMember.run(7, ACCOUNT_IDS.fresh, "2026-01-09T23:45:00.000Z");

  assert.deepEqual(repository.getDisplayNames({ accountIds: [ACCOUNT_IDS.missingPlain] })[0], {
    accountId: ACCOUNT_IDS.missingPlain,
    displayName: null,
    normalizedDisplayName: null,
    source: null,
    observedAt: null,
    updatedAt: null,
    ageSeconds: 0,
    stale: true,
    missing: true,
  });

  const candidates = repository.collectDisplayNameCandidates({ staleAfterSeconds: 86400 });
  assert.deepEqual(
    candidates.map(({ accountId, score, missing }) => ({ accountId, score, missing })),
    [
      { accountId: ACCOUNT_IDS.missingMember, score: 210, missing: true },
      { accountId: ACCOUNT_IDS.missingPlain, score: 120, missing: true },
      { accountId: ACCOUNT_IDS.stale, score: 100, missing: false },
    ]
  );
  assert.equal(
    candidates.some(({ accountId }) => accountId === ACCOUNT_IDS.fresh),
    false
  );
  assert.deepEqual(repository.listDisplayNameCandidates({ staleAfterSeconds: 86400, limit: 2 }), [
    ACCOUNT_IDS.missingMember,
    ACCOUNT_IDS.missingPlain,
  ]);
  assert.deepEqual(
    repository
      .listDisplayNameCandidateDetails({ staleAfterSeconds: 86400, limit: 1, offset: 1 })
      .candidates.map(({ accountId }) => accountId),
    [ACCOUNT_IDS.missingPlain]
  );

  db.prepare("UPDATE account_display_name_current SET normalized_display_name = NULL WHERE account_id = ?").run(
    ACCOUNT_IDS.stale
  );
  assert.equal(repository.backfillNormalizedDisplayNames(), true);
  assert.equal(repository.backfillNormalizedDisplayNames(), false);
});

test("missing SQLite schema errors fail closed instead of looking like empty data", (context) => {
  const db = new DatabaseSync(":memory:");
  context.after(() => db.close());
  const repository = new DisplayNameRepository(db, {
    eventsRepository: {
      appendAggregatorEvent() {},
      upsertProjectSeen() {},
    },
    now: () => Date.parse(NOW_ISO),
  });

  assertPersistenceFailure(() => repository.getDisplayNames(), "get-display-names");
  assertPersistenceFailure(() => repository.searchDisplayNames({ q: "player" }), "search-display-names");
  assertPersistenceFailure(
    () => repository.getDisplayNamesByName({ displayNames: ["Player"] }),
    "get-display-names-by-name"
  );
  assertPersistenceFailure(() => repository.collectDisplayNameCandidates(), "load-display-name-candidate-evidence");
  assertPersistenceFailure(() => repository.backfillNormalizedDisplayNames(), "backfill-normalized-display-names");
});

test("a broken current-name table is not disguised as a valid empty query", (context) => {
  const { db, repository } = createFixture(context);
  db.exec("DROP TABLE account_display_name_current");

  assertPersistenceFailure(() => repository.getDisplayNames(), "get-display-names");
  assertPersistenceFailure(() => repository.searchDisplayNames({ q: "player" }), "search-display-names");
});
