const fs = require("node:fs");
const path = require("node:path");

const defaultSchemaPath = path.resolve(__dirname, "..", "..", "config", "production-credentials.json");
const truthyValues = new Set(["1", "true", "yes", "on", "enabled"]);

function normalizedValue(environment, key) {
  return String(environment?.[key] ?? "").trim();
}

function loadProductionCredentialSchema(schemaPath = defaultSchemaPath) {
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

function conditionMatches(condition, environment) {
  const value = normalizedValue(environment, condition?.key);
  switch (condition?.operator) {
    case "equals":
      return (
        value.toLowerCase() ===
        String(condition.value ?? "")
          .trim()
          .toLowerCase()
      );
    case "present":
      return Boolean(value);
    case "truthy":
      return truthyValues.has(value.toLowerCase());
    default:
      throw new Error(`Unsupported production credential condition operator: ${condition?.operator || "(missing)"}`);
  }
}

function missingKeys(keys, environment) {
  return (Array.isArray(keys) ? keys : []).filter((key) => !normalizedValue(environment, key));
}

function validateRequirement(requirement, environment) {
  const errors = [];
  const missingAll = missingKeys(requirement.allOf, environment);
  if (missingAll.length) errors.push(`missing ${missingAll.join(", ")}`);
  if (requirement.anyOf?.length && requirement.anyOf.every((key) => !normalizedValue(environment, key))) {
    errors.push(`requires one of ${requirement.anyOf.join(", ")}`);
  }
  if (requirement.anyOfGroups?.length) {
    const hasCompleteGroup = requirement.anyOfGroups.some((group) => missingKeys(group, environment).length === 0);
    if (!hasCompleteGroup) {
      errors.push(
        `requires one complete credential set: ${requirement.anyOfGroups.map((group) => group.join(" + ")).join(" OR ")}`
      );
    }
  }
  return errors;
}

function validateServiceProductionCredentials(serviceId, environment = {}, schema = loadProductionCredentialSchema()) {
  const service = schema.services?.[serviceId];
  if (!service) return [`credential policy is not declared for service ${serviceId}`];
  const errors = missingKeys(service.required, environment).map((key) => `required setting ${key} is missing`);
  for (const requirement of service.conditional || []) {
    if (!conditionMatches(requirement.when, environment)) continue;
    for (const error of validateRequirement(requirement, environment)) {
      errors.push(`${requirement.feature || requirement.when.key}: ${error}`);
    }
  }
  return errors;
}

function validateProductionCredentialCoverage(serviceIds, schema = loadProductionCredentialSchema()) {
  const manifestIds = new Set(Array.isArray(serviceIds) ? serviceIds : []);
  const schemaIds = new Set(Object.keys(schema.services || {}));
  const errors = [];
  for (const serviceId of [...manifestIds].sort()) {
    if (!schemaIds.has(serviceId)) errors.push(`missing credential policy for service: ${serviceId}`);
  }
  for (const serviceId of [...schemaIds].sort()) {
    if (!manifestIds.has(serviceId)) errors.push(`credential policy references unknown service: ${serviceId}`);
  }
  return errors;
}

function assertServiceProductionCredentials(serviceId, environment = {}, schema = loadProductionCredentialSchema()) {
  const errors = validateServiceProductionCredentials(serviceId, environment, schema);
  if (!errors.length) return;
  const error = new Error(`Production credentials for ${serviceId} are incomplete:\n- ${errors.join("\n- ")}`);
  error.code = "XJK_PRODUCTION_CREDENTIALS_INVALID";
  error.serviceId = serviceId;
  error.failures = errors;
  throw error;
}

function assertProductionCredentialsWhenProduction(
  serviceId,
  environment = {},
  schema = loadProductionCredentialSchema()
) {
  if (
    String(environment.NODE_ENV || "")
      .trim()
      .toLowerCase() !== "production"
  ) {
    return;
  }
  assertServiceProductionCredentials(serviceId, environment, schema);
}

function validateProductionCredentialSchema(schema = loadProductionCredentialSchema()) {
  const errors = [];
  if (schema.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!schema.services || typeof schema.services !== "object" || Array.isArray(schema.services)) {
    return [...errors, "services must be an object"];
  }
  for (const [serviceId, service] of Object.entries(schema.services || {})) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(serviceId)) errors.push(`invalid service id: ${serviceId}`);
    if (!service || typeof service !== "object" || Array.isArray(service)) {
      errors.push(`${serviceId} must be an object`);
      continue;
    }
    for (const property of ["required", "optional", "conditional"]) {
      if (!Array.isArray(service[property])) errors.push(`${serviceId}.${property} must be an array`);
    }
    const declared = [
      ...(Array.isArray(service.required) ? service.required : []),
      ...(Array.isArray(service.optional) ? service.optional : []),
    ];
    const duplicateKeys = declared.filter((key, index) => declared.indexOf(key) !== index);
    for (const key of new Set(duplicateKeys)) errors.push(`${serviceId} declares ${key} more than once`);
    for (const requirement of Array.isArray(service.conditional) ? service.conditional : []) {
      if (!requirement || typeof requirement !== "object" || Array.isArray(requirement)) {
        errors.push(`${serviceId} has a conditional requirement that is not an object`);
        continue;
      }
      if (!requirement.feature || !requirement.when?.key || !requirement.when?.operator) {
        errors.push(`${serviceId} has an incomplete conditional requirement`);
      }
      if (!["equals", "present", "truthy"].includes(requirement.when?.operator)) {
        errors.push(`${serviceId} has an unsupported condition operator: ${requirement.when?.operator || "(missing)"}`);
      }
      if (requirement.when?.operator === "equals" && String(requirement.when?.value ?? "").trim() === "") {
        errors.push(`${serviceId} has an equals condition without a value`);
      }
      const allOf = Array.isArray(requirement.allOf) ? requirement.allOf : [];
      const anyOf = Array.isArray(requirement.anyOf) ? requirement.anyOf : [];
      const anyOfGroups = Array.isArray(requirement.anyOfGroups) ? requirement.anyOfGroups : [];
      if (!allOf.length && !anyOf.length && !anyOfGroups.length) {
        errors.push(`${serviceId} has a conditional requirement without credential keys`);
      }
      if (anyOfGroups.some((group) => !Array.isArray(group) || !group.length)) {
        errors.push(`${serviceId} has an empty anyOfGroups credential set`);
      }
      declared.push(requirement.when?.key, ...allOf, ...anyOf, ...anyOfGroups.flat());
    }
    for (const key of declared) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) errors.push(`${serviceId} declares an invalid environment key: ${key}`);
    }
  }
  return errors;
}

module.exports = {
  assertProductionCredentialsWhenProduction,
  assertServiceProductionCredentials,
  conditionMatches,
  defaultSchemaPath,
  loadProductionCredentialSchema,
  validateProductionCredentialCoverage,
  validateProductionCredentialSchema,
  validateServiceProductionCredentials,
};
