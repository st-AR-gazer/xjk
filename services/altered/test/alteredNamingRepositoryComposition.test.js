import assert from "node:assert/strict";
import test from "node:test";

import { createDatabase } from "../src/db/index.js";
import * as namingModule from "../src/repositories/alteredNamingRepository.js";

const methodDomains = {
  mapSelectionRepository: ["listMapsForNameStandardization", "listMapsNeedingSimilarityRefresh"],
  nameCandidateRepository: ["upsertMapNameCandidates", "deleteMapNameCandidates"],
  mapNumberSimilarityRepository: ["getMapNumberSimilarity", "upsertMapNumberSimilarity"],
  similarityWeightRepository: [
    "getSimilarityCampaignWeightOverrides",
    "getSimilarityMapWeightOverrides",
    "listSimilarityCampaignWeightOverrides",
    "listSimilarityWeightRules",
    "upsertSimilarityWeightRule",
    "deleteSimilarityWeightRule",
    "upsertSimilarityCampaignWeightOverride",
    "deleteSimilarityCampaignWeightOverride",
    "upsertSimilarityMapWeightOverride",
    "deleteSimilarityMapWeightOverride",
  ],
  nameCandidateReviewRepository: [
    "bulkApproveMapNameCandidates",
    "getMapNameCandidateSummary",
    "listMapNameCandidates",
    "countMapNameCandidates",
    "getMapNameCandidate",
    "updateMapNameCandidateReview",
  ],
};

const noArgumentMethods = new Set([
  "listSimilarityCampaignWeightOverrides",
  "listSimilarityWeightRules",
  "getMapNameCandidateSummary",
]);

function createTransactionDb(insertTable, { failAt = 0 } = {}) {
  const events = [];
  let runCount = 0;
  return {
    events,
    exec(sql) {
      events.push(sql);
    },
    prepare(sql) {
      if (sql.includes("SELECT map_uid AS mapUid")) {
        return { get: () => null };
      }
      if (sql.includes(`INSERT INTO ${insertTable}`)) {
        return {
          run() {
            runCount += 1;
            if (runCount === failAt) throw new Error("forced transaction failure");
            return { changes: 1 };
          },
        };
      }
      throw new Error(`Unexpected SQL in transaction test: ${sql}`);
    },
  };
}

test("AlteredNamingRepository preserves exports, methods, arities, and explicit collaborators", () => {
  assert.deepEqual(Object.keys(namingModule).sort(), [
    "AlteredNamingRepository",
    "buildMapSelectionFilter",
    "buildNameCandidateFilter",
  ]);
  assert.equal(namingModule.AlteredNamingRepository.length, 1);

  const expectedMethods = Object.values(methodDomains).flat().sort();
  const prototypeMethods = Object.getOwnPropertyNames(namingModule.AlteredNamingRepository.prototype)
    .filter((name) => name !== "constructor")
    .sort();
  assert.deepEqual(prototypeMethods, expectedMethods);
  for (const method of expectedMethods) {
    assert.equal(
      namingModule.AlteredNamingRepository.prototype[method].length,
      method === "getMapNameCandidate" ? 1 : 0,
      `${method} arity drifted`
    );
  }

  const db = {};
  const repository = new namingModule.AlteredNamingRepository(db);
  assert.equal(repository.db, db);
  for (const [domain, methods] of Object.entries(methodDomains)) {
    assert.ok(repository[domain], `missing ${domain}`);
    for (const method of methods) {
      repository[domain][method] = (...args) => ({ domain, method, args });
      const argument = { method };
      const result = noArgumentMethods.has(method) ? repository[method]() : repository[method](argument);
      assert.deepEqual(result, {
        domain,
        method,
        args: noArgumentMethods.has(method) ? [] : [argument],
      });
    }
  }
});

test("candidate and similarity upserts retain commit and rollback transaction boundaries", () => {
  const cases = [
    {
      method: "upsertMapNameCandidates",
      table: "altered_map_name_candidates",
      key: "candidates",
      records: [
        { mapUid: "candidate-a", originalName: "A" },
        { mapUid: "candidate-b", originalName: "B" },
      ],
    },
    {
      method: "upsertMapNumberSimilarity",
      table: "altered_map_number_similarity",
      key: "records",
      records: [{ mapUid: "similarity-a" }, { mapUid: "similarity-b" }],
    },
  ];

  for (const { method, table, key, records } of cases) {
    const successDb = createTransactionDb(table);
    const successRepository = new namingModule.AlteredNamingRepository(successDb);
    assert.deepEqual(successRepository[method]({ [key]: records.slice(0, 1) }), {
      processed: 1,
      inserted: 1,
      updated: 0,
    });
    assert.deepEqual(successDb.events, ["BEGIN IMMEDIATE", "COMMIT"]);

    const failureDb = createTransactionDb(table, { failAt: 2 });
    const failureRepository = new namingModule.AlteredNamingRepository(failureDb);
    const failure = failureRepository[method]({ [key]: records });
    assert.equal(failure.error, "forced transaction failure");
    assert.equal(failure.processed, 1);
    assert.deepEqual(failureDb.events, ["BEGIN IMMEDIATE", "ROLLBACK"]);
  }
});

test("composed naming repositories preserve candidate, similarity, review, and rule behavior", () => {
  const db = createDatabase({ filePath: ":memory:" });
  try {
    const now = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO altered_maps (map_uid, map_id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      `
    ).run("map-a", "map-map-a", "Original", now, now);

    const repository = new namingModule.AlteredNamingRepository(db);
    assert.deepEqual(
      repository.upsertMapNameCandidates({
        candidates: [
          {
            mapUid: "map-a",
            originalName: "Original",
            sanitizedName: "Original",
            proposedName: "Proposed",
            mapNumbers: [7],
            automationState: "matched",
          },
        ],
      }),
      { processed: 1, inserted: 1, updated: 0 }
    );
    assert.equal(repository.countMapNameCandidates(), 1);
    assert.equal(repository.listMapNameCandidates()[0].proposedName, "Proposed");

    assert.deepEqual(
      repository.upsertMapNumberSimilarity({
        records: [
          {
            mapUid: "map-a",
            familyKey: "season:summer:2026",
            assignedMapNumbers: [7],
            topScore: 0.98,
            secondScore: 0.2,
            confidence: 0.99,
            candidateMatches: [{ mapUid: "reference-a", slot: 7, score: 0.98 }],
            details: { matchClassification: "unique-strong" },
          },
        ],
      }),
      { processed: 1, inserted: 1, updated: 0 }
    );
    assert.deepEqual(repository.getMapNumberSimilarity({ mapUids: ["map-a"] })[0].assignedMapNumbers, [7]);

    const reviewed = repository.updateMapNameCandidateReview({
      mapUid: "map-a",
      reviewState: "approved",
      manualName: "Manual",
      reviewNote: "checked",
    });
    assert.equal(reviewed.ok, true);
    assert.equal(reviewed.candidate.finalName, "Manual");
    assert.equal(reviewed.candidate.similarityStatus, "matched");
    assert.equal(repository.getMapNameCandidateSummary().approved, 1);

    const insertedRule = db
      .prepare(
        `
        INSERT INTO altered_similarity_weight_rules (
          source_key, weights_json, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        `
      )
      .run("seed", "{}", 1, now, now);
    const rule = repository.upsertSimilarityWeightRule({
      ruleId: Number(insertedRule.lastInsertRowid),
      sourceKey: "test-source",
      weights: { finalAbsolute: 80 },
    });
    assert.equal(rule.ok, true);
    assert.equal(repository.listSimilarityWeightRules()[0].sourceKey, "test-source");
    assert.equal(repository.deleteSimilarityWeightRule({ ruleId: rule.rule.ruleId }).deleted, 1);
  } finally {
    db.close();
  }
});
