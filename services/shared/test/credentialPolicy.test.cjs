const assert = require("node:assert/strict");
const test = require("node:test");

const {
  resolveAggregatorUpstreamCredentialEnvironment,
  resolveAlteredInternalCredentialEnvironment,
  resolveWrWebhookCredentialEnvironment,
} = require("../credentialPolicy.cjs");

test("Altered internal access never inherits ingest or dashboard administration credentials", () => {
  assert.deepEqual(
    resolveAggregatorUpstreamCredentialEnvironment({
      AGGREGATOR_INGEST_TOKEN: "ingest-only",
      DASH_ADMIN_TOKEN: "dashboard-only",
      ALTERED_ADMIN_TOKEN: "altered-admin-only",
      TRACKER_ADMIN_TOKEN: "tracker-admin",
    }),
    {
      ALTERED_INTERNAL_TOKEN: "",
      DASH_ALTERED_INTERNAL_TOKEN: "",
      TRACKER_ADMIN_TOKEN: "tracker-admin",
      DASH_TRACKER_ADMIN_TOKEN: "tracker-admin",
    }
  );
});

test("paired producer and consumer names resolve one intentionally shared credential", () => {
  assert.deepEqual(resolveAlteredInternalCredentialEnvironment({ ALTERED_INTERNAL_TOKEN: " internal " }), {
    ALTERED_INTERNAL_TOKEN: "internal",
    DASH_ALTERED_INTERNAL_TOKEN: "internal",
  });
  assert.deepEqual(resolveWrWebhookCredentialEnvironment({ TRACKER_WR_WEBHOOK_SECRET: " webhook " }), {
    ALTERED_WR_WEBHOOK_SECRET: "webhook",
    TRACKER_WR_WEBHOOK_SECRET: "webhook",
  });
});

test("conflicting paired credentials fail closed", () => {
  assert.throws(
    () =>
      resolveAlteredInternalCredentialEnvironment({
        ALTERED_INTERNAL_TOKEN: "server-value",
        DASH_ALTERED_INTERNAL_TOKEN: "client-value",
      }),
    /must contain the same shared credential/
  );
  assert.throws(
    () =>
      resolveWrWebhookCredentialEnvironment({
        ALTERED_WR_WEBHOOK_SECRET: "receiver-value",
        TRACKER_WR_WEBHOOK_SECRET: "sender-value",
      }),
    /must contain the same shared credential/
  );
});

test("cross-source peer conflicts fail closed", () => {
  assert.throws(
    () =>
      resolveAlteredInternalCredentialEnvironment(
        { DASH_ALTERED_INTERNAL_TOKEN: "client-process-value" },
        { ALTERED_INTERNAL_TOKEN: "server-dotenv-value" }
      ),
    /must contain the same shared credential/
  );
  assert.throws(
    () =>
      resolveWrWebhookCredentialEnvironment(
        { ALTERED_WR_WEBHOOK_SECRET: "receiver-process-value" },
        { TRACKER_WR_WEBHOOK_SECRET: "sender-dotenv-value" }
      ),
    /must contain the same shared credential/
  );
});

test("a process value can override the same key from a fallback source", () => {
  assert.deepEqual(
    resolveAlteredInternalCredentialEnvironment(
      { ALTERED_INTERNAL_TOKEN: "process-value" },
      { ALTERED_INTERNAL_TOKEN: "dotenv-value" }
    ),
    {
      ALTERED_INTERNAL_TOKEN: "process-value",
      DASH_ALTERED_INTERNAL_TOKEN: "process-value",
    }
  );
});

test("conflicting fallback aliases fail closed", () => {
  assert.throws(
    () =>
      resolveWrWebhookCredentialEnvironment(
        {},
        {
          ALTERED_WR_WEBHOOK_SECRET: "receiver-dotenv-value",
          TRACKER_WR_WEBHOOK_SECRET: "sender-dotenv-value",
        }
      ),
    /must contain the same shared credential/
  );
});
