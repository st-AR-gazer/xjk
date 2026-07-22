import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAggregatorAccessConfigured,
  redactSensitiveUrl,
  resolveAggregatorAccessEnvironment,
} from "../src/auth/accessPolicy.js";

test("ingest credentials are never promoted to dashboard administration", () => {
  assert.deepEqual(
    resolveAggregatorAccessEnvironment({
      AGGREGATOR_INGEST_TOKEN: " ingest-only ",
      DASH_ADMIN_TOKEN: "",
      AGGREGATOR_ALLOW_INSECURE_OPEN: "0",
    }),
    {
      ingestToken: "ingest-only",
      dashAdminToken: "",
      allowInsecureOpen: false,
    }
  );
});

test("aggregator access requires both production secrets", () => {
  assert.throws(
    () => assertAggregatorAccessConfigured({ ingestToken: "", dashAdminToken: "" }),
    /AGGREGATOR_INGEST_TOKEN, DASH_ADMIN_TOKEN/
  );
  assert.throws(
    () => assertAggregatorAccessConfigured({ ingestToken: "ingest", dashAdminToken: "" }),
    /DASH_ADMIN_TOKEN/
  );
  assert.doesNotThrow(() => assertAggregatorAccessConfigured({ ingestToken: "ingest", dashAdminToken: "dash" }));
});

test("open mode requires an explicit opt-in", () => {
  assert.doesNotThrow(() =>
    assertAggregatorAccessConfigured({ ingestToken: "", dashAdminToken: "", allowInsecureOpen: true })
  );
});

test("request logging redacts sensitive query values", () => {
  assert.equal(
    redactSensitiveUrl("/dash/login?token=secret&next=%2Foverview&api_key=key"),
    "/dash/login?token=%5Bredacted%5D&next=%2Foverview&api_key=%5Bredacted%5D"
  );
  assert.equal(redactSensitiveUrl("/health"), "/health");
});
