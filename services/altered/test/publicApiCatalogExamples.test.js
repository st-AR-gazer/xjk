import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import * as catalogModule from "../src/publicApi/catalog.js";
import { getDefaultExampleResponses } from "../src/publicApi/examples/index.js";

const expectedCatalogHash = "be1fed44c775b815e8bb6f3d86a465bf98739e4d5337e20a1b4b135a8e4b90e9";
const expectedFallbackHash = "3900679fb9b9bd360311d065e64af45afb91c5fca6f035e1c2a3f6b916708d04";
const expectedResponseHashes = {
  "public-api-catalog": "4fb06237849d316243d085cb3604a7f7d0953fb9ee250a8beae3b100868bfe0c",
  "public-map-detail": "a470dbdeff8dfebbd5ace8ead5603990ab285fd33786399517a58ef8679d1cdd",
  "legacy-map-info": "729eb2b2e0b72c57e59978209697846e303907aa4e4610c842772d020b0cc455",
  "alterations-stats": "136857714dd1e46c9aeedf18e68f8100baeb10019e928943f8a3460adca438fc",
  "alterations-maps": "40a2aaedd8c2cd2fde8ff9d8923d5a54785429d30898cf624395fa782fd6adcf",
  "alterations-campaigns": "1e2ced4d0fd4ff3d65305841331e35b1abba695e9215ac32c6b3f9d987d73862",
  "alterations-uploads": "97a703ec5a9ebc55ae5a95a74cb9bb07b80d4d83d1eb18cd7ebbda58aebeb74c",
  "alterations-leaderboards": "23541db8d81f37192a138a165461760e544b5e8545025b1fd5c7b53489588ad9",
  "alterations-leaderboards-live": "421ff3fad4af6d65d08df16f015e6d9e82094f5c6e90ea02725e663fc912b0bc",
  "hook-status": "a941f5638c620dda97932f4cfc8e28a08d0f40ebf3745569a227465b797addc5",
  "hook-maps": "f067408d738a7782711608537b1129f5ad36aa5fd5f2bc39b57a10b41304243b",
  "hook-runs": "da62a9c7c4680ec4c25ca25c7094f8e3b4a88084f7699a82e67e998413c9dc42",
  "aggregator-club-summary": "8b1ea818e1362f034851848771fe1094b636501ce094617542ec0114be37e6d1",
  "aggregator-club-campaigns": "359dd51e6f4122e40fe46d3eaf7fdc1f673f35319cd3be71d0b477c7ed3c635a",
  "aggregator-club-maps": "5a90c6645ad7341b862e8db92641726f939de270a744d1b60cc29a060731c633",
  "dashboard-summary": "9335607eebd9543d45cfa1616db643a134eedd119c2b0c0010f5e936a79050eb",
  "latest-wr": "4a965d1f0a50a6ccabfc4670ab707ed2dea0c828600c9f3cb0311762cc08a99f",
  "tracker-status": "69255ab2617b57691f5f96ad4fd1f2415441a6b4118ecf79e973b5156d98ab3b",
  "aggregator-meta": "cfe2a79fd512dab4ac1bfd17d2837c9658ac9a44c950078cb07349c5904e7ce2",
  "aggregator-metrics-overview": "dd5f6def1760b05e547015909ccecf28ad3a13c1c1550a33d8ccd9c317d41fd5",
  "aggregator-projects": "f6133f98f0ce0bf04c91f7a93dcf55e27d508120721fe6a9c8d492f05b811502",
  "aggregator-project-detail": "e6fdd8c6dc85dee5b8ed89094864eb1dee43e020fc27c672b2da2c8fb6d832c5",
  "aggregator-project-maps": "add3adc654a430448dfa6e49de457152bbbc986d4c8cadf373e856019015e065",
  "aggregator-events-recent": "fff73401f79a103523566d2e8f344db725fa1cbaf0802b88a86c33f1ccb8e6b5",
  "aggregator-display-names": "01194c6574e9653df0e2d0162a1d9b5d941f961fb988cf6cc548695f9263faa7",
  "request-update": "4a0d030f08c3d41067ed1e050127f9ada85cd71267d11437c697e6ccaf797c0e",
  "wr-webhook": "06e9d5d007574e4da5a57864b26683a721183fa2f85af67609f16e19a41b416b",
};

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

test("public API response examples retain the complete endpoint catalog contract", () => {
  const catalog = catalogModule.buildPublicApiCatalog();
  const expectedKeys = Object.keys(expectedResponseHashes);

  assert.deepEqual(
    catalog.endpoints.map((endpoint) => endpoint.key),
    expectedKeys
  );
  assert.equal(hash(catalog), expectedCatalogHash);

  for (const endpoint of catalog.endpoints) {
    const dispatchedExamples = getDefaultExampleResponses({ key: endpoint.key });
    assert.deepEqual(dispatchedExamples, endpoint.exampleResponses, endpoint.key);
    assert.equal(hash(dispatchedExamples), expectedResponseHashes[endpoint.key], endpoint.key);
    dispatchedExamples.forEach((response) => assert.doesNotThrow(() => JSON.parse(response.body), endpoint.key));
  }
});

test("response dispatch uses the documented default for every unregistered key shape", () => {
  const unknownEndpoints = [undefined, null, {}, { key: "" }, { key: "unknown" }, { key: "__proto__" }];

  for (const endpoint of unknownEndpoints) {
    assert.equal(hash(getDefaultExampleResponses(endpoint)), expectedFallbackHash);
  }
});

test("response factories return fresh data and preserve the catalog module exports", () => {
  const first = getDefaultExampleResponses({ key: "public-map-detail" });
  const second = getDefaultExampleResponses({ key: "public-map-detail" });

  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first[0], second[0]);
  assert.deepEqual(first, second);

  first[0].label = "mutated";
  assert.equal(getDefaultExampleResponses({ key: "public-map-detail" })[0].label, "Map detail");
  assert.deepEqual(Object.keys(catalogModule).sort(), [
    "DOCS_PATH",
    "GROUP_ORDER",
    "PUBLIC_API_ENDPOINTS",
    "buildPublicApiCatalog",
  ]);
});
