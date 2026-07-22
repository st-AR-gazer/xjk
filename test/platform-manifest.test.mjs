import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

import { XJK_SITES } from "../sites/shared/xjk-core/site-registry.js";

import {
  collectBrowserSiteRegistryErrors,
  collectCaddyErrors,
  collectDefinitionErrors,
  collectEcosystemErrors,
  collectGeneratedCatalogErrors,
  collectLocalStackErrors,
  collectProductionCredentialErrors,
  collectRunnableServiceErrors,
  collectToolCatalogErrors,
  collectToolRuntimeErrors,
  readPlatformManifest,
  renderCaddyToolRoutes,
  renderPlatformCatalog,
  repoRoot,
} from "../scripts/lib/platform-manifest.mjs";

const manifest = readPlatformManifest();
const require = createRequire(import.meta.url);

function replaceRoutePort(source, marker, port) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `fixture route is missing ${marker}`);
  const remainder = source.slice(markerIndex);
  const proxyMatch = remainder.match(/reverse_proxy 127\.0\.0\.1:\d+/);
  assert.ok(proxyMatch, `fixture route ${marker} has no proxy`);
  const proxyIndex = markerIndex + proxyMatch.index;
  return `${source.slice(0, proxyIndex)}reverse_proxy 127.0.0.1:${port}${source.slice(proxyIndex + proxyMatch[0].length)}`;
}

function collectMutatedCaddyErrors(mutateRoutes, mutateToolRoutes = (source) => source) {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "xjk-caddy-routes-"));
  const fixtureDeploy = path.join(fixtureRoot, "deploy");
  mkdirSync(fixtureDeploy);
  try {
    for (const name of ["Caddyfile", "Caddyfile.tunnel"]) {
      writeFileSync(path.join(fixtureDeploy, name), readFileSync(path.join(repoRoot, "deploy", name), "utf8"), "utf8");
    }
    const routes = readFileSync(path.join(repoRoot, "deploy", "Caddyfile.routes"), "utf8");
    writeFileSync(path.join(fixtureDeploy, "Caddyfile.routes"), mutateRoutes(routes), "utf8");
    const toolRoutes = readFileSync(path.join(repoRoot, "deploy", "Caddyfile.tools.generated"), "utf8");
    writeFileSync(path.join(fixtureDeploy, "Caddyfile.tools.generated"), mutateToolRoutes(toolRoutes), "utf8");
    return collectCaddyErrors(manifest, fixtureRoot);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test("platform manifest has internally consistent identities, paths, and ports", () => {
  assert.deepEqual(collectDefinitionErrors(manifest), []);
});

test("every runnable backend package is registered in the platform manifest", () => {
  assert.deepEqual(collectRunnableServiceErrors(manifest), []);

  const withoutAuthService = {
    ...manifest,
    services: manifest.services.filter((service) => service.id !== "xjk-auth"),
  };
  assert.ok(
    collectRunnableServiceErrors(withoutAuthService).includes(
      "runnable Node package is not registered as a platform service: services/xjk-auth"
    )
  );
});

test("production credential policy covers the exact registered service set", () => {
  assert.deepEqual(collectProductionCredentialErrors(manifest), []);

  const withUncataloguedService = {
    ...manifest,
    services: [...manifest.services, { ...manifest.services[0], id: "uncatalogued-service" }],
  };
  assert.ok(
    collectProductionCredentialErrors(withUncataloguedService).includes(
      "production credential coverage: missing credential policy for service: uncatalogued-service"
    )
  );
});

test("browser site metadata uses the exact operational site identities and hosts", () => {
  const normalize = (sites, readAliases) =>
    sites
      .map((site) => ({
        id: site.id,
        host: site.host,
        aliases: [...readAliases(site)].sort(),
      }))
      .sort((left, right) => left.id.localeCompare(right.id));

  assert.deepEqual(
    normalize(XJK_SITES, (site) => site.hostAliases || []),
    normalize(manifest.sites, (site) => site.aliases || [])
  );
  assert.deepEqual(collectBrowserSiteRegistryErrors(manifest), []);
});

test("Tracker self-starts on its manifest local port when PORT is unset", async () => {
  const previousPort = process.env.PORT;
  process.env.PORT = "";
  try {
    const config = await import(`../services/tracker/src/config.js?manifest-default=${Date.now()}`);
    assert.equal(config.PORT, manifest.services.find((service) => service.id === "tracker-hub").ports.local);
  } finally {
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
  }
});

test("every managed service has a required readiness probe", () => {
  const missingHealthChecks = manifest.services
    .filter((service) => service.health?.required !== true || !String(service.health?.path || "").startsWith("/"))
    .map((service) => service.id);

  assert.deepEqual(missingHealthChecks, []);
});

test("deployment and local runtime catalogs match the platform manifest", () => {
  assert.deepEqual(collectEcosystemErrors(manifest), []);
  assert.deepEqual(collectLocalStackErrors(manifest), []);
  assert.deepEqual(collectCaddyErrors(manifest), []);
});

test("production process skeletons derive identity, launch path, and port from the manifest", () => {
  const ecosystemRoot = path.join(repoRoot, "deploy", "server", "ecosystem");
  const rootSource = readFileSync(path.join(repoRoot, "deploy", "server", "ecosystem.config.cjs"), "utf8");
  const factorySource = readFileSync(path.join(ecosystemRoot, "process-factory.cjs"), "utf8");
  const processDefinitionFiles = [
    "console-process.cjs",
    "platform-processes.cjs",
    "public-data-processes.cjs",
    "tool-processes.cjs",
    "tracker-processes.cjs",
    "tracker-support-processes.cjs",
  ];
  const definitionSource = processDefinitionFiles
    .map((file) => readFileSync(path.join(ecosystemRoot, file), "utf8"))
    .join("\n");
  const toolSource = readFileSync(path.join(ecosystemRoot, "tool-processes.cjs"), "utf8");
  const productionSources = `${rootSource}\n${factorySource}\n${definitionSource}`;

  assert.ok(rootSource.split(/\r?\n/).length <= 100, "ecosystem.config.cjs must remain a thin composition root");
  assert.match(factorySource, /function defineProcess\(serviceId, config = \{\}\)/);
  assert.match(factorySource, /name:\s*service\.processName/);
  assert.match(factorySource, /cwd:\s*serviceRoot/);
  assert.match(factorySource, /PORT:\s*String\(service\.ports\.production\)/);
  assert.match(factorySource, /const reservedKeys = \["name", "cwd", "script", "args", "interpreter"\]/);
  assert.doesNotMatch(productionSources, /name:\s*["']xjk-/);
  assert.doesNotMatch(productionSources, /\bPORT:\s*["']?30\d{2}/);
  assert.doesNotMatch(productionSources, /http:\/\/127\.0\.0\.1:30\d{2}/);
  const toolServiceIds = new Set(manifest.tools.map((tool) => tool.serviceId).filter(Boolean));
  for (const service of manifest.services.filter((candidate) => !toolServiceIds.has(candidate.id))) {
    assert.match(definitionSource, new RegExp(`defineProcess\\("${service.id}"`));
  }
  assert.match(
    toolSource,
    /platformManifest\.tools[\s\S]*\.map\(\(tool\)\s*=>[\s\S]*defineToolProcess\(tool\.serviceId/
  );
  assert.doesNotMatch(toolSource, /defineToolProcess\("tools-/);

  const configuredNames = require("../deploy/server/ecosystem.config.cjs")
    .apps.map((app) => app.name)
    .sort();
  assert.deepEqual(configuredNames, manifest.services.map((service) => service.processName).sort());
});

test("production aggregator credentials preserve the ingest and dashboard trust boundary", () => {
  const { resolveAggregatorAccessEnvironment } = require("../deploy/server/environment-policy.cjs");
  assert.deepEqual(
    resolveAggregatorAccessEnvironment({
      AGGREGATOR_INGEST_TOKEN: "ingest-only",
      DASH_ADMIN_TOKEN: "",
      AGGREGATOR_ALLOW_INSECURE_OPEN: "0",
    }),
    {
      AGGREGATOR_INGEST_TOKEN: "ingest-only",
      DASH_ADMIN_TOKEN: "",
      AGGREGATOR_ALLOW_INSECURE_OPEN: "0",
    }
  );
});

test("production service credentials preserve internal and webhook trust boundaries", () => {
  const {
    resolveAggregatorUpstreamCredentialEnvironment,
    resolveWrWebhookCredentialEnvironment,
  } = require("../services/shared/credentialPolicy.cjs");
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
  assert.deepEqual(
    resolveWrWebhookCredentialEnvironment({
      ALTERED_ADMIN_TOKEN: "altered-admin-only",
      TRACKER_ADMIN_TOKEN: "tracker-admin-only",
    }),
    { ALTERED_WR_WEBHOOK_SECRET: "", TRACKER_WR_WEBHOOK_SECRET: "" }
  );
});

test("Caddy entrypoints differ only by their direct or tunnel transport", () => {
  const direct = readFileSync(path.join(repoRoot, "deploy", "Caddyfile"), "utf8").replace(
    "import Caddyfile.routes https://",
    "import Caddyfile.routes {scheme}"
  );
  const tunnel = readFileSync(path.join(repoRoot, "deploy", "Caddyfile.tunnel"), "utf8")
    .replace("\tauto_https off\n", "")
    .replace("import Caddyfile.routes http://", "import Caddyfile.routes {scheme}");
  assert.equal(tunnel, direct);

  const routes = readFileSync(path.join(repoRoot, "deploy", "Caddyfile.routes"), "utf8");
  assert.match(routes, /\(favicon_redirect\)[\s\S]*redir @favicon \/favicon\.svg 308/);
  assert.doesNotMatch(routes, /^\s*handle(?:_path)?\s+\/api\/(?:embed|inspect-replay|strip|extract|modify)/m);
});

test("Caddy validation rejects swapped tool route owners", () => {
  const errors = collectMutatedCaddyErrors(
    (source) => source,
    (original) => {
      let source = replaceRoutePort(original, "handle_path /Strip-RaceValidationGhost/*", 3012);
      source = replaceRoutePort(source, "handle_path /Embed-RaceValidationGhost/*", 3011);
      return source;
    }
  );
  assert.ok(errors.some((error) => error.includes("tool /Strip-RaceValidationGhost/*") && error.includes("3011")));
  assert.ok(errors.some((error) => error.includes("tool /Embed-RaceValidationGhost/*") && error.includes("3012")));
});

test("production tool routes are generated from the platform manifest", () => {
  const routes = readFileSync(path.join(repoRoot, "deploy", "Caddyfile.tools.generated"), "utf8").replaceAll(
    "\r\n",
    "\n"
  );
  assert.equal(routes, renderCaddyToolRoutes(manifest));
  assert.match(
    readFileSync(path.join(repoRoot, "deploy", "Caddyfile.routes"), "utf8"),
    /import Caddyfile\.tools\.generated/
  );
});

test("Caddy validation rejects swapped tracker mode owners", () => {
  const errors = collectMutatedCaddyErrors((original) => {
    let source = replaceRoutePort(original, "handle_path /wr/*", 3043);
    source = replaceRoutePort(source, "handle_path /leaderboard/*", 3031);
    return source;
  });
  assert.ok(errors.some((error) => error.includes("tracker /wr/*") && error.includes("3031")));
  assert.ok(errors.some((error) => error.includes("tracker /leaderboard/*") && error.includes("3043")));
});

test("tool hub registration matches the platform manifest", () => {
  assert.deepEqual(collectToolCatalogErrors(manifest), []);
});

test("native tool installation destinations match their registered tools", () => {
  assert.deepEqual(collectToolRuntimeErrors(manifest), []);
});

test("generated platform catalog is current", () => {
  assert.deepEqual(collectGeneratedCatalogErrors(manifest), []);
  const catalog = readFileSync(path.join(repoRoot, "PLATFORM_CATALOG.md"), "utf8").replaceAll("\r\n", "\n");
  assert.equal(catalog, renderPlatformCatalog(manifest));
});

test("reset and restart never terminate arbitrary port owners", () => {
  for (const relativePath of ["deploy/local/reset-local.ps1", "deploy/local/restart-local.ps1"]) {
    const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
    assert.match(source, /stop-local\.ps1/);
    assert.doesNotMatch(source, /Get-NetTCPConnection/);
    assert.doesNotMatch(source, /taskkill/);
    assert.doesNotMatch(source, /3110,\s*3120/);
  }

  const startLocal = readFileSync(path.join(repoRoot, "deploy/local/start-local.ps1"), "utf8");
  assert.match(startLocal, /Assert-PortsAvailable/);

  const alteredOnly = readFileSync(path.join(repoRoot, "deploy/local/start-altered-only.ps1"), "utf8");
  assert.match(alteredOnly, /Get-XjkServicePort/);
  assert.doesNotMatch(alteredOnly, /127\.0\.0\.1:31(?:31|40|41|42|43)/);

  const cleanup = readFileSync(path.join(repoRoot, "deploy/server/services/cleanup-pm2.ps1"), "utf8");
  assert.match(cleanup, /platform-manifest\.json/);
  assert.doesNotMatch(cleanup, /\$knownPorts\s*=\s*@\(\s*30\d{2}/);
});

test("local backend overrides are keyed by service identity", () => {
  const startLocalPath = path.join(repoRoot, "deploy", "local", "start-local.ps1");
  const source = readFileSync(startLocalPath, "utf8");
  assert.match(source, /\$backendsByName\s*=\s*New-BackendIndex/);
  assert.match(source, /Resolve-XjkLocalStackConfiguration/);
  assert.match(source, /New-XjkLocalBackendSkeletons/);
  assert.doesNotMatch(source, /\$backends\[\d+\]/);
  assert.doesNotMatch(source, /\$requiredPorts\s*=\s*@\(\s*\$GatewayPort/);
  assert.doesNotMatch(source, /\[int\]\$HubPort\s*=\s*3110/);
  assert.match(source, /if \(\$ValidateBackendConfigOnly\) \{\s*\[array\]::Reverse\(\$backends\)/);
});

test("every managed Node service has a reproducible manifest-derived install", () => {
  const nodeDirectories = [
    ...new Set(manifest.services.filter(({ runtime }) => runtime === "node").map(({ cwd }) => cwd)),
  ];
  for (const directory of nodeDirectories) {
    const packagePath = path.join(repoRoot, directory, "package.json");
    const lockPath = path.join(repoRoot, directory, "package-lock.json");
    assert.ok(existsSync(packagePath), `${directory} is missing package.json`);
    assert.ok(existsSync(lockPath), `${directory} is missing package-lock.json`);

    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    const packageLock = JSON.parse(readFileSync(lockPath, "utf8"));
    const lockedRoot = packageLock.packages?.[""] ?? {};
    for (const dependencyField of ["dependencies", "devDependencies", "optionalDependencies"]) {
      assert.deepEqual(
        lockedRoot[dependencyField] ?? {},
        packageJson[dependencyField] ?? {},
        `${directory}/package-lock.json has stale ${dependencyField}`
      );
    }
  }

  for (const relativePath of ["deploy/server/bootstrap-clean-server.ps1", "deploy/server/apply-update-winsw.ps1"]) {
    const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
    assert.match(source, /Get-XjkNodeServiceDirectories/);
    assert.doesNotMatch(source, /\$backendDirs\s*=\s*@\(/);
    assert.match(source, /package-lock\.json/);
  }

  const bootstrap = readFileSync(path.join(repoRoot, "deploy/server/bootstrap-clean-server.ps1"), "utf8");
  assert.match(bootstrap, /\$platformManifest\.sites/);
  assert.match(bootstrap, /\$platformManifest\.tools/);
  assert.doesNotMatch(bootstrap, /sites\/tracker(?:-displayname|-club)?\.xjk\.yt\/frontend/);

  const startLocal = readFileSync(path.join(repoRoot, "deploy/local/start-local.ps1"), "utf8");
  assert.match(startLocal, /Managed Node service is missing package-lock\.json/);

  const localManifestAdapter = readFileSync(path.join(repoRoot, "deploy/local/platform-manifest.ps1"), "utf8");
  assert.match(localManifestAdapter, /\.\.\\platform-manifest\.ps1/);
});
