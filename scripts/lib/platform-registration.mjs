import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { repoRoot, toPosixPath } from "./platform-paths.mjs";

function immediateDirectories(root, relativePath) {
  const directory = path.join(root, relativePath);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => toPosixPath(path.join(relativePath, entry.name)));
}

function parseNodeStartEntry(command) {
  const match = String(command || "")
    .trim()
    .match(/^node(?:\s+--\S+)*\s+["']?([^\s"']+)["']?(?:\s|$)/);
  return match ? toPosixPath(match[1]) : "";
}

export function collectRunnableServiceErrors(manifest, root = repoRoot) {
  const errors = [];
  const services = Array.isArray(manifest.services) ? manifest.services : [];
  const nodeServicesByCwd = new Map();

  for (const service of services.filter((candidate) => candidate.runtime === "node")) {
    const cwd = toPosixPath(service.cwd);
    const entries = nodeServicesByCwd.get(cwd) || new Set();
    entries.add(toPosixPath(service.entry));
    nodeServicesByCwd.set(cwd, entries);
  }

  const packageDirectories = [
    ...immediateDirectories(root, "services"),
    ...immediateDirectories(root, "sites/tools.xjk.yt").map((directory) => `${directory}/backend`),
    ...immediateDirectories(root, "sites/plugins.xjk.yt").map((directory) => `${directory}/backend`),
  ].filter((directory) => existsSync(path.join(root, directory, "package.json")));

  const runnablePackageDirectories = new Set();
  for (const directory of packageDirectories) {
    const packageJson = JSON.parse(readFileSync(path.join(root, directory, "package.json"), "utf8"));
    const startCommand = String(packageJson.scripts?.start || "").trim();
    if (!startCommand) continue;
    runnablePackageDirectories.add(directory);

    const registeredEntries = nodeServicesByCwd.get(directory);
    if (!registeredEntries) {
      errors.push(`runnable Node package is not registered as a platform service: ${directory}`);
      continue;
    }

    const startEntry = parseNodeStartEntry(startCommand);
    if (!startEntry) {
      errors.push(`${directory} start script must use a manifest-verifiable node entrypoint`);
    } else if (!registeredEntries.has(startEntry)) {
      errors.push(`${directory} starts ${startEntry}; manifest registers ${[...registeredEntries].join(", ")}`);
    }
  }

  for (const directory of nodeServicesByCwd.keys()) {
    if (!runnablePackageDirectories.has(directory)) {
      errors.push(`registered Node service directory has no runnable package start script: ${directory}`);
    }
  }

  for (const directory of immediateDirectories(root, "services")) {
    const appPath = path.join(root, directory, "app.py");
    const requirementsPath = path.join(root, directory, "requirements.txt");
    if (!existsSync(appPath) || !existsSync(requirementsPath)) continue;
    const registered = services.some(
      (service) =>
        service.runtime === "python" &&
        toPosixPath(service.cwd) === directory &&
        toPosixPath(service.entry) === "app.py"
    );
    if (!registered) errors.push(`runnable Python service is not registered in the platform manifest: ${directory}`);
  }

  return errors;
}

export function collectProductionCredentialErrors(manifest, root = repoRoot) {
  const modulePath = path.join(root, "services", "shared", "productionCredentials.cjs");
  const schemaPath = path.join(root, "config", "production-credentials.json");
  if (!existsSync(modulePath)) return ["production credential validator does not exist"];
  if (!existsSync(schemaPath)) return ["production credential catalog does not exist"];

  const require = createRequire(import.meta.url);
  const {
    loadProductionCredentialSchema,
    validateProductionCredentialCoverage,
    validateProductionCredentialSchema,
  } = require(modulePath);
  const schema = loadProductionCredentialSchema(schemaPath);
  const services = Array.isArray(manifest.services) ? manifest.services : [];
  return [
    ...validateProductionCredentialSchema(schema).map((message) => `production credential schema: ${message}`),
    ...validateProductionCredentialCoverage(
      services.map((service) => service.id),
      schema
    ).map((message) => `production credential coverage: ${message}`),
  ];
}
