import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const policy = require("./productionCredentials.cjs");

export const {
  assertProductionCredentialsWhenProduction,
  assertServiceProductionCredentials,
  conditionMatches,
  loadProductionCredentialSchema,
  validateProductionCredentialCoverage,
  validateProductionCredentialSchema,
  validateServiceProductionCredentials,
} = policy;
