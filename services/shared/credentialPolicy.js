import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  resolveAggregatorUpstreamCredentialEnvironment,
  resolveAlteredInternalCredentialEnvironment,
  resolveTrackerAdminCredentialEnvironment,
  resolveWrWebhookCredentialEnvironment,
} = require("./credentialPolicy.cjs");

export {
  resolveAggregatorUpstreamCredentialEnvironment,
  resolveAlteredInternalCredentialEnvironment,
  resolveTrackerAdminCredentialEnvironment,
  resolveWrWebhookCredentialEnvironment,
};
