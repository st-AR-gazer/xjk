const fs = require("node:fs");
const path = require("node:path");

function parseEnvironmentFile(source) {
  const environment = {};
  for (const rawLine of String(source || "").split(/\r?\n/)) {
    const line = String(rawLine || "")
      .replace(/^\uFEFF/, "")
      .trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(equalsIndex + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    environment[key] = value;
  }
  return Object.freeze(environment);
}

function loadEnvironmentFile(filePath, fileSystem = fs) {
  if (!filePath || !fileSystem.existsSync(filePath)) return Object.freeze({});
  return parseEnvironmentFile(fileSystem.readFileSync(filePath, "utf8"));
}

function mergeEnvironmentLayers({ inherited = {}, server = {}, scoped = {} } = {}) {
  return Object.freeze({ ...server, ...scoped, ...inherited });
}

function createServiceEnvironmentResolver({
  services = [],
  repoRoot,
  inheritedEnvironment = process.env,
  serverEnvironment = {},
  loadScopedEnvironment = loadEnvironmentFile,
} = {}) {
  const inherited = Object.freeze({ ...inheritedEnvironment });
  const server = Object.freeze({ ...serverEnvironment });
  const servicesById = new Map(services.map((service) => [service.id, service]));
  const scopedByDirectory = new Map();

  function forService(serviceId) {
    const service = servicesById.get(serviceId);
    if (!service) throw new Error(`Unknown platform service: ${serviceId}`);
    const serviceRoot = path.join(repoRoot, service.cwd);
    if (!scopedByDirectory.has(serviceRoot)) {
      scopedByDirectory.set(serviceRoot, loadScopedEnvironment(path.join(serviceRoot, ".env")));
    }
    return mergeEnvironmentLayers({ inherited, server, scoped: scopedByDirectory.get(serviceRoot) });
  }

  return Object.freeze({ forService });
}

module.exports = {
  createServiceEnvironmentResolver,
  loadEnvironmentFile,
  mergeEnvironmentLayers,
  parseEnvironmentFile,
};
