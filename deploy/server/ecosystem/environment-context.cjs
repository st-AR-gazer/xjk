const path = require("node:path");

const {
  resolveAlteredInternalCredentialEnvironment,
  resolveTrackerAdminCredentialEnvironment,
  resolveWrWebhookCredentialEnvironment,
} = require("../../../services/shared/credentialPolicy.cjs");
const { resolveAggregatorAccessEnvironment } = require("../environment-policy.cjs");
const { createServiceEnvironmentResolver, loadEnvironmentFile } = require("../environment-layers.cjs");

function createOptionalEnvironmentResolver(environment) {
  return function optionalEnvVar(targetKey, ...sourceKeys) {
    for (const key of [targetKey, ...sourceKeys].filter(Boolean)) {
      const value = environment[key];
      if (typeof value === "string" && value.trim()) return { [targetKey]: value };
    }
    return {};
  };
}

function createEnvironmentContext({ repoRoot, platformManifest, inheritedEnvironment = process.env }) {
  const inherited = Object.freeze({ ...inheritedEnvironment });
  const serverEnvironment = loadEnvironmentFile(path.join(repoRoot, "deploy", "server", ".env"));
  const serviceEnvironments = createServiceEnvironmentResolver({
    services: platformManifest.services,
    repoRoot,
    inheritedEnvironment: inherited,
    serverEnvironment,
  });
  const alteredEnvironment = serviceEnvironments.forService("altered-hub");
  const aggregatorEnvironment = serviceEnvironments.forService("aggregator-hub");
  const trackerEnvironment = serviceEnvironments.forService("tracker-hub");
  const aggregatorUpstreamCredentials = Object.freeze({
    ...resolveAlteredInternalCredentialEnvironment({
      ALTERED_INTERNAL_TOKEN: alteredEnvironment.ALTERED_INTERNAL_TOKEN,
      DASH_ALTERED_INTERNAL_TOKEN: aggregatorEnvironment.DASH_ALTERED_INTERNAL_TOKEN,
    }),
    ...resolveTrackerAdminCredentialEnvironment({
      TRACKER_ADMIN_TOKEN: trackerEnvironment.TRACKER_ADMIN_TOKEN,
      DASH_TRACKER_ADMIN_TOKEN: aggregatorEnvironment.DASH_TRACKER_ADMIN_TOKEN,
    }),
  });
  const wrWebhookCredentials = Object.freeze(
    resolveWrWebhookCredentialEnvironment({
      ALTERED_WR_WEBHOOK_SECRET: alteredEnvironment.ALTERED_WR_WEBHOOK_SECRET,
      TRACKER_WR_WEBHOOK_SECRET: trackerEnvironment.TRACKER_WR_WEBHOOK_SECRET,
    })
  );

  function optionalEnvVarFor(serviceId, targetKey, ...sourceKeys) {
    return createOptionalEnvironmentResolver(serviceEnvironments.forService(serviceId))(targetKey, ...sourceKeys);
  }

  return Object.freeze({
    aggregatorAccessEnvironment: Object.freeze(resolveAggregatorAccessEnvironment(aggregatorEnvironment)),
    aggregatorUpstreamCredentials,
    optionalEnvVarFor,
    serviceEnvironments,
    wrWebhookCredentials,
  });
}

module.exports = { createEnvironmentContext, createOptionalEnvironmentResolver };
