import assert from "node:assert/strict";
import test from "node:test";
import { normalizePublicApiEndpoints } from "../publicApiCatalog.js";

test("normalizePublicApiEndpoints preserves explicit metadata and supplies missing defaults", () => {
  const calls = [];
  const defaults = {
    defaultHeaders(endpoint) {
      calls.push(["headers", endpoint.key]);
      return ["default-header"];
    },
    defaultRemarks(endpoint) {
      calls.push(["remarks", endpoint.key]);
      return ["default-remark"];
    },
    defaultRequestBodyExample(endpoint) {
      calls.push(["body", endpoint.key]);
      return `body:${endpoint.key}`;
    },
    defaultExampleResponses(endpoint) {
      calls.push(["responses", endpoint.key]);
      return [`response:${endpoint.key}`];
    },
  };

  const source = [
    { key: "defaulted" },
    {
      key: "explicit",
      pathParams: ["path"],
      queryParams: ["query"],
      headers: ["header"],
      remarks: ["remark"],
      requestBodyExample: "body",
      exampleResponses: ["response"],
      notes: ["note"],
    },
  ];

  const normalized = normalizePublicApiEndpoints(source, defaults);

  assert.deepEqual(normalized[0], {
    key: "defaulted",
    pathParams: [],
    queryParams: [],
    headers: ["default-header"],
    remarks: ["default-remark"],
    requestBodyExample: "body:defaulted",
    exampleResponses: ["response:defaulted"],
    notes: [],
  });
  assert.deepEqual(normalized[1], source[1]);
  assert.deepEqual(calls, [
    ["headers", "defaulted"],
    ["remarks", "defaulted"],
    ["body", "defaulted"],
    ["responses", "defaulted"],
  ]);
  assert.notEqual(normalized[0], source[0]);
});
