import assert from "node:assert/strict";
import test from "node:test";

import { MapNameWorkspaceService } from "../src/services/altered/mapProcessing/mapNameWorkspaceService.js";

function createService(repositoryOverrides = {}) {
  const repository = {
    activity: { ...repositoryOverrides.activity },
    campaigns: { ...repositoryOverrides.campaigns },
    catalog: { ...repositoryOverrides.catalog },
    configuration: { ...repositoryOverrides.configuration },
    mapFiles: { ...repositoryOverrides.mapFiles },
    maps: { ...repositoryOverrides.maps },
    naming: {
      listMapsForNameStandardization: () => [],
      ...repositoryOverrides.naming,
    },
  };
  const projectSourceService = {
    getProjectSources: () => [],
    async ensureOfficialSeasonalSourceFresh() {},
    async ensureTotdSourceAvailable() {},
    async ensureCompetitionSourceAvailable() {},
  };
  const mapLocalFileService = {
    async ensureMapContentSignatures(maps) {
      return {
        summary: { total: maps.length, reused: 0, parsed: 0, errors: 0, missingDownload: maps.length },
        localFiles: { total: maps.length, reused: 0, downloaded: 0, missing: maps.length, errors: 0 },
        records: [],
      };
    },
    getPreferredMapLocalFiles: () => [],
  };
  return new MapNameWorkspaceService({
    repository,
    logger: { warn() {}, info() {}, error() {} },
    getAlterationCatalogService: () => ({ getConfiguredAlterations: () => ({ alterations: [] }) }),
    getMapLocalFileService: () => mapLocalFileService,
    getProjectSourceService: () => projectSourceService,
  });
}

test("MapNameWorkspaceService retains its complete public API", () => {
  const methods = Object.getOwnPropertyNames(MapNameWorkspaceService.prototype)
    .filter((name) => name !== "constructor")
    .sort();

  assert.deepEqual(methods, [
    "applyAutoApprovalFromSimilarity",
    "assignStoredMapMetadata",
    "assignStoredMapNumbersBySimilarity",
    "collectCampaignSnapshotMapUids",
    "deleteSimilarityCampaignWeightOverride",
    "deleteSimilarityWeightRule",
    "getAutomaticSimilarityTargetMapUids",
    "getMapNameStandardizationCandidateDetail",
    "getMapNameStandardizationCandidates",
    "getNamingSimilaritySourceOptions",
    "getSimilarityWeightRules",
    "getSimilarityWeightWorkspace",
    "processMapNameStandardization",
    "runAutomaticNamingAssignments",
    "updateHookConfig",
    "updateMapCampaign",
    "updateMapNameCandidateSimilaritySelection",
    "updateMapNameCandidateSimilarityWeights",
    "updateMapNameStandardizationCandidateReview",
    "updateSimilarityCampaignWeightOverride",
    "updateSimilarityWeightRule",
  ]);
});

test("empty similarity assignments preserve their result and progress contract", async () => {
  const progress = [];
  const service = createService();

  const result = await service.assignStoredMapNumbersBySimilarity({
    mapUids: ["missing-map"],
    onProgress: (event) => progress.push(event),
  });

  assert.deepEqual(result, {
    ok: true,
    processed: 0,
    resolved: 0,
    unresolved: 0,
    missingReferenceFamilies: [],
  });
  assert.deepEqual(
    progress.map(({ stage, status, percent }) => ({ stage, status, percent })),
    [
      { stage: "loading-targets", status: "running", percent: 2 },
      { stage: "complete", status: "ok", percent: 100 },
    ]
  );
});

test("composed workflows retain overridable facade seams", async () => {
  const service = createService();
  const calls = [];
  service.getAutomaticSimilarityTargetMapUids = () => ["map-one"];
  service.assignStoredMapMetadata = (options) => {
    calls.push(["metadata", options]);
    return { ok: true, processed: 1 };
  };
  service.assignStoredMapNumbersBySimilarity = async (options) => {
    calls.push(["similarity", options]);
    return { ok: true, processed: 1 };
  };

  const result = await service.runAutomaticNamingAssignments({
    mapUids: ["map-one"],
    forceSimilarity: true,
  });

  assert.equal(result.metadataAssignment.processed, 1);
  assert.equal(result.namingAssignment.processed, 1);
  assert.deepEqual(
    calls.map(([operation]) => operation),
    ["metadata", "similarity"]
  );
});

test("similarity assignment composes target loading, matching, and persistence", async () => {
  const storedRecords = [];
  const map = {
    mapUid: "map-one",
    name: "Test Map",
    campaignName: "Altered Spring 2025",
    campaignId: 7,
    slot: 1,
  };
  const service = createService({
    catalog: {
      listAlterationsCampaigns: () => ({ rows: [] }),
    },
    maps: {
      listMapsForCampaignNames: () => [],
    },
    naming: {
      listMapsForNameStandardization: () => [map],
      getSimilarityMapWeightOverrides: () => [],
      getSimilarityCampaignWeightOverrides: () => [],
      listSimilarityWeightRules: () => [],
      getMapNumberSimilarity: () => [],
      upsertMapNumberSimilarity({ records }) {
        storedRecords.push(...records);
        return { processed: records.length, inserted: records.length, updated: 0 };
      },
    },
  });

  const result = await service.assignStoredMapNumbersBySimilarity({
    mapUids: [map.mapUid],
    persistCandidates: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.processed, 1);
  assert.equal(result.similarityUpsert.processed, 1);
  assert.equal(storedRecords.length, 1);
  assert.equal(storedRecords[0].mapUid, map.mapUid);
  assert.equal(typeof storedRecords[0].assignmentMethod, "string");
});
