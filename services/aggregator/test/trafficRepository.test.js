import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as repositoryUtils from "../src/repositories/repositoryUtils.js";
import { TrafficAnalyticsRepository } from "../src/repositories/traffic/trafficAnalyticsRepository.js";
import { TrafficIngestionRepository } from "../src/repositories/traffic/trafficIngestionRepository.js";
import { TrafficQueryRepository } from "../src/repositories/traffic/trafficQueryRepository.js";
import { TrafficRepositorySupport } from "../src/repositories/traffic/trafficRepositorySupport.js";
import { TrafficRepository } from "../src/repositories/trafficRepository.js";

const PUBLIC_METHODS = [
  "backfillTrafficSamples",
  "bumpTrafficCacheVersion",
  "getLatestObservedTrafficWindowMeta",
  "getTrafficBackfillState",
  "getTrafficErrors",
  "getTrafficFacets",
  "getTrafficOverview",
  "getTrafficTimeseries",
  "getTrafficTop",
  "ingestTraffic",
  "insertTrafficSampleRecord",
  "listLegacyTrafficSamples",
  "listTrafficSamples",
  "withTrafficCache",
].sort();

const UTILITY_EXPORTS = [
  "FUZZY_SEARCH_ROW_LIMIT",
  "appendTrafficWhere",
  "buildAllTimeTrafficQueryMeta",
  "buildTrafficQueryMeta",
  "buildTrafficSampleQueryMeta",
  "clampInt",
  "computeDiceScore",
  "emptyTrafficTimeseriesPoint",
  "fillTrafficTimeseriesBuckets",
  "floorTrafficBucketMs",
  "isNadeoTargetHost",
  "isPrivateOrLocalTargetHost",
  "isSafeIdentifier",
  "mapIngestRunDbRow",
  "mapTrafficSampleDbRow",
  "normalizeAccountId",
  "normalizeArray",
  "normalizeClubId",
  "normalizeComponent",
  "normalizeDisplayNameEntries",
  "normalizeHost",
  "normalizeHttpMethod",
  "normalizeHttpPath",
  "normalizeInstanceId",
  "normalizeMaybeString",
  "normalizeProjectKey",
  "normalizeSearchMode",
  "normalizeTrafficDirection",
  "normalizeTrafficSample",
  "normalizeTrafficStatusCode",
  "normalizeWindowHours",
  "parseBucket",
  "parseJsonObject",
  "parseTrafficRow",
  "quoteIdentifier",
  "secondsBetweenIso",
  "toDbInt",
  "toDbNumber",
  "toIso",
  "toSafeNumber",
  "toTrafficBucket",
  "trafficBucketSqlExpression",
  "trafficBucketStepMs",
  "tryParseJson",
  "uniqueBy",
].sort();

test("traffic facade preserves its API and explicit domain ownership", () => {
  const db = {};
  const eventsRepository = {};
  const repository = new TrafficRepository(db, { eventsRepository });
  const actualMethods = Object.getOwnPropertyNames(TrafficRepository.prototype)
    .filter((name) => name !== "constructor")
    .sort();

  assert.deepEqual(actualMethods, PUBLIC_METHODS);
  assert.equal(repository.db, db);
  assert.equal(repository.eventsRepository, eventsRepository);
  assert.ok(repository.supportRepository instanceof TrafficRepositorySupport);
  assert.ok(repository.ingestionRepository instanceof TrafficIngestionRepository);
  assert.ok(repository.queryRepository instanceof TrafficQueryRepository);
  assert.ok(repository.analyticsRepository instanceof TrafficAnalyticsRepository);
  assert.equal(repository.ingestionRepository.eventsRepository, eventsRepository);
  assert.equal(repository.ingestionRepository.support, repository.supportRepository);
  assert.equal(repository.queryRepository.support, repository.supportRepository);
  assert.equal(repository.analyticsRepository.support, repository.supportRepository);
});

test("traffic facade cache invalidation remains observable across domains", () => {
  const repository = new TrafficRepository({});
  let computations = 0;
  const compute = () => {
    computations += 1;
    return computations;
  };

  assert.equal(repository.withTrafficCache("overview", compute), 1);
  assert.equal(repository.withTrafficCache("overview", compute), 1);
  assert.equal(computations, 1);

  assert.equal(repository.bumpTrafficCacheVersion(), 1);
  assert.equal(repository.withTrafficCache("overview", compute), 2);
  assert.equal(computations, 2);
});

test("repository utility compatibility barrel preserves its public exports", () => {
  assert.deepEqual(Object.keys(repositoryUtils).sort(), UTILITY_EXPORTS);
});

test("traffic repository modules stay within their architectural boundaries", () => {
  const lineBudgets = {
    "../src/repositories/trafficRepository.js": 120,
    "../src/repositories/repositoryUtils.js": 80,
    "../src/repositories/traffic/trafficRepositorySupport.js": 120,
    "../src/repositories/traffic/trafficIngestionRepository.js": 300,
    "../src/repositories/traffic/trafficQueryRepository.js": 280,
    "../src/repositories/traffic/trafficAnalyticsRepository.js": 650,
    "../src/repositories/traffic/trafficNormalization.js": 320,
    "../src/repositories/traffic/trafficQuerySupport.js": 260,
    "../src/repositories/support/repositoryValues.js": 140,
    "../src/repositories/support/databaseValues.js": 100,
    "../src/repositories/support/displayNameEntries.js": 120,
  };

  for (const [relativePath, maximumLines] of Object.entries(lineBudgets)) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    const lineCount = source.split(/\r?\n/).length;
    assert.ok(lineCount <= maximumLines, `${relativePath} has ${lineCount} lines; maximum is ${maximumLines}`);
  }
});
