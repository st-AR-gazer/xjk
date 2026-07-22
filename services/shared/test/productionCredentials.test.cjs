const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  assertServiceProductionCredentials,
  loadProductionCredentialSchema,
  validateProductionCredentialCoverage,
  validateProductionCredentialSchema,
  validateServiceProductionCredentials,
} = require("../productionCredentials.cjs");

test("production credential catalog has a valid declarative schema", () => {
  const schema = loadProductionCredentialSchema();
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "config", "platform-manifest.json"), "utf8")
  );
  assert.deepEqual(validateProductionCredentialSchema(schema), []);
  assert.deepEqual(
    validateProductionCredentialCoverage(
      manifest.services.map((service) => service.id),
      schema
    ),
    []
  );
});

test("credential catalog coverage fails closed in both directions", () => {
  const schema = {
    schemaVersion: 1,
    services: {
      known: { required: [], optional: [], conditional: [] },
      stale: { required: [], optional: [], conditional: [] },
    },
  };
  assert.deepEqual(validateProductionCredentialCoverage(["known", "missing"], schema), [
    "missing credential policy for service: missing",
    "credential policy references unknown service: stale",
  ]);
  assert.deepEqual(validateServiceProductionCredentials("missing", {}, schema), [
    "credential policy is not declared for service missing",
  ]);
});

test("credential schema validation rejects unsupported conditions before deployment", () => {
  assert.deepEqual(
    validateProductionCredentialSchema({
      schemaVersion: 1,
      services: {
        service: {
          required: [],
          optional: [],
          conditional: [
            {
              feature: "bad condition",
              when: { key: "FEATURE_ENABLED", operator: "sometimes" },
              allOf: ["SERVICE_TOKEN"],
            },
          ],
        },
      },
    }),
    ["service has an unsupported condition operator: sometimes"]
  );
});

test("required production settings fail closed without exposing values", () => {
  const failures = validateServiceProductionCredentials("aggregator-hub", {
    AGGREGATOR_INGEST_TOKEN: "configured-ingest",
  });
  assert.deepEqual(failures, [
    "required setting DASH_ADMIN_TOKEN is missing",
    "required setting DASH_ALTERED_INTERNAL_TOKEN is missing",
    "required setting DASH_TRACKER_ADMIN_TOKEN is missing",
  ]);
  assert.throws(
    () => assertServiceProductionCredentials("aggregator-hub", { DASH_ADMIN_TOKEN: "never-print-this" }),
    (error) => error.code === "XJK_PRODUCTION_CREDENTIALS_INVALID" && !error.message.includes("never-print-this")
  );
});

test("conditional features require their own credentials only when enabled", () => {
  assert.deepEqual(validateServiceProductionCredentials("xjk-auth", { UBI_OAUTH_ENABLED: "0" }), []);
  assert.deepEqual(validateServiceProductionCredentials("xjk-auth", { UBI_OAUTH_ENABLED: "1" }), [
    "shared Ubisoft OAuth: missing UBI_OAUTH_CLIENT_ID, UBI_OAUTH_CLIENT_SECRET",
  ]);
  assert.deepEqual(
    validateServiceProductionCredentials("xjk-auth", {
      UBI_OAUTH_ENABLED: "1",
      UBI_OAUTH_CLIENT_ID: "client",
      UBI_OAUTH_CLIENT_SECRET: "secret",
    }),
    []
  );
});

test("alternative credential groups accept only a complete supported group", () => {
  const base = { COTD_ADMIN_TOKEN: "admin", COTD_TOTD_FETCH_ENABLED: "1" };
  assert.equal(validateServiceProductionCredentials("cotd-public", base).length, 1);
  assert.equal(
    validateServiceProductionCredentials("cotd-public", { ...base, COTD_NADEO_DEDI_LOGIN: "login" }).length,
    1
  );
  assert.deepEqual(
    validateServiceProductionCredentials("cotd-public", {
      ...base,
      COTD_NADEO_DEDI_LOGIN: "login",
      COTD_NADEO_DEDI_PASSWORD: "password",
    }),
    []
  );
});

test("always-on production protocols require their authentication material", () => {
  assert.deepEqual(validateServiceProductionCredentials("console-hub", {}), [
    "required setting CONSOLE_HUB_BINGO_AUTH_SECRET is missing",
  ]);
  assert.deepEqual(
    validateServiceProductionCredentials("console-hub", { CONSOLE_HUB_BINGO_AUTH_SECRET: "configured" }),
    []
  );

  assert.deepEqual(validateServiceProductionCredentials("bannerbuilder", { SECRET_KEY: "configured" }), [
    "required setting ADMIN_PWHASH is missing",
  ]);
  assert.deepEqual(
    validateServiceProductionCredentials("bannerbuilder", {
      SECRET_KEY: "configured",
      ADMIN_PWHASH: "configured-hash",
    }),
    []
  );
  assert.deepEqual(
    validateServiceProductionCredentials("bannerbuilder", {
      SECRET_KEY: "configured",
      ADMIN_PASSWORD: "legacy-plaintext-does-not-count",
    }),
    ["required setting ADMIN_PWHASH is missing"]
  );
});

test("Altered live monitoring requires an effective Nadeo credential set", () => {
  const required = {
    ALTERED_INTERNAL_TOKEN: "configured",
    ALTERED_WR_WEBHOOK_SECRET: "configured",
    ALTERED_LIVE_MONITOR_ENABLED: "1",
  };
  assert.deepEqual(validateServiceProductionCredentials("altered-hub", required), [
    "Altered live monitoring: requires one complete credential set: ALTERED_LIVE_DEDI_LOGIN + ALTERED_LIVE_DEDI_PASSWORD OR TRACKER_NADEO_DEDI_LOGIN + TRACKER_NADEO_DEDI_PASSWORD OR ALTERED_LIVE_ACCESS_TOKEN OR ALTERED_LIVE_REFRESH_TOKEN OR TRACKER_NADEO_LIVE_ACCESS_TOKEN OR TRACKER_NADEO_LIVE_REFRESH_TOKEN",
  ]);
  for (const credentials of [
    { ALTERED_LIVE_DEDI_LOGIN: "login", ALTERED_LIVE_DEDI_PASSWORD: "password" },
    { TRACKER_NADEO_DEDI_LOGIN: "login", TRACKER_NADEO_DEDI_PASSWORD: "password" },
    { ALTERED_LIVE_ACCESS_TOKEN: "token" },
    { ALTERED_LIVE_REFRESH_TOKEN: "token" },
  ]) {
    assert.deepEqual(validateServiceProductionCredentials("altered-hub", { ...required, ...credentials }), []);
  }
});
