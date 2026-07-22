const fs = require("node:fs");
const path = require("node:path");
const {
  loadProductionCredentialSchema,
  validateProductionCredentialCoverage,
  validateProductionCredentialSchema,
  validateServiceProductionCredentials,
} = require("../../services/shared/productionCredentials.cjs");

function parseArguments(argv) {
  const serviceNames = [];
  let schemaOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--schema-only") schemaOnly = true;
    else if (argument === "--service") serviceNames.push(String(argv[++index] || "").trim());
    else throw new Error(`Unknown production credential preflight argument: ${argument}`);
  }
  return { schemaOnly, serviceNames: serviceNames.filter(Boolean) };
}

function checkProductionCredentials({ repoRoot, schemaOnly = false, serviceNames = [] } = {}) {
  const schema = loadProductionCredentialSchema(path.join(repoRoot, "config", "production-credentials.json"));
  const schemaErrors = validateProductionCredentialSchema(schema);
  if (schemaErrors.length) return schemaErrors.map((message) => `credential schema: ${message}`);

  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "config", "platform-manifest.json"), "utf8"));
  const coverageErrors = validateProductionCredentialCoverage(
    manifest.services.map((service) => service.id),
    schema
  );
  if (coverageErrors.length) return coverageErrors.map((message) => `credential schema: ${message}`);
  if (schemaOnly) return [];

  const serviceByProcessName = new Map(manifest.services.map((service) => [service.processName, service]));
  const serviceById = new Map(manifest.services.map((service) => [service.id, service]));
  const selected = new Set(serviceNames);
  const requestedServices = serviceNames.map((name) => serviceByProcessName.get(name) || serviceById.get(name));
  const unknownServices = serviceNames.filter((_name, index) => !requestedServices[index]);
  if (unknownServices.length) return unknownServices.map((name) => `unknown production service: ${name}`);

  const ecosystem = require(path.join(repoRoot, "deploy", "server", "ecosystem.config.cjs"));
  const appByProcessName = new Map((ecosystem.apps || []).map((app) => [app.name, app]));
  const failures = [];
  for (const service of manifest.services) {
    if (selected.size && !selected.has(service.id) && !selected.has(service.processName)) continue;
    const app = appByProcessName.get(service.processName);
    if (!app) {
      failures.push(`${service.id}: process definition ${service.processName} is missing`);
      continue;
    }
    for (const message of validateServiceProductionCredentials(service.id, app.env || {}, schema)) {
      failures.push(`${service.id}: ${message}`);
    }
  }
  return failures;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, "..", "..");
  const failures = checkProductionCredentials({ repoRoot, ...options });
  if (failures.length) {
    console.error(`Production credential preflight failed:\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    options.schemaOnly ? "Production credential schema is valid." : "Production credential preflight passed."
  );
}

if (require.main === module) main();

module.exports = { checkProductionCredentials, parseArguments };
