import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { XJK_SITES } from "../../sites/shared/xjk-core/site-registry.js";
import { repoRoot, toPosixPath } from "./platform-paths.mjs";
import { collectProductionCredentialErrors, collectRunnableServiceErrors } from "./platform-registration.mjs";

export { collectProductionCredentialErrors, collectRunnableServiceErrors, repoRoot };
export const manifestPath = path.join(repoRoot, "config", "platform-manifest.json");
export const toolRuntimeManifestPath = path.join(repoRoot, "deploy", "tool-runtime", "manifest.json");

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function readPlatformManifest() {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export function readToolRuntimeManifest(root = repoRoot) {
  return JSON.parse(readFileSync(path.join(root, "deploy", "tool-runtime", "manifest.json"), "utf8"));
}

function collectDuplicateErrors(values, label) {
  const seen = new Set();
  const errors = [];
  for (const value of values) {
    if (seen.has(value)) errors.push(`${label} contains duplicate value ${value}`);
    seen.add(value);
  }
  return errors;
}

export function collectDefinitionErrors(manifest, root = repoRoot) {
  const errors = [];
  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!/^[A-Za-z0-9._-]+$/.test(String(manifest.assetVersion || ""))) {
    errors.push("assetVersion must contain only URL-safe version characters");
  }

  const sites = Array.isArray(manifest.sites) ? manifest.sites : [];
  const services = Array.isArray(manifest.services) ? manifest.services : [];
  const tools = Array.isArray(manifest.tools) ? manifest.tools : [];
  const hasLocalOnlyOverrides = Array.isArray(manifest.infrastructure?.security?.localOnlyOverrides);
  const localOnlyOverrides = hasLocalOnlyOverrides ? manifest.infrastructure.security.localOnlyOverrides : [];
  if (!hasLocalOnlyOverrides) errors.push("infrastructure.security.localOnlyOverrides must be an array");
  errors.push(
    ...collectDuplicateErrors(
      sites.map((site) => site.id),
      "site ids"
    )
  );
  errors.push(
    ...collectDuplicateErrors(
      services.map((service) => service.id),
      "service ids"
    )
  );
  errors.push(
    ...collectDuplicateErrors(
      services.map((service) => service.processName),
      "process names"
    )
  );
  errors.push(
    ...collectDuplicateErrors(
      services.map((service) => service.localName),
      "local service names"
    )
  );
  errors.push(
    ...collectDuplicateErrors(
      services.map((service) => service.ports.localParameter),
      "local port parameters"
    )
  );
  errors.push(
    ...collectDuplicateErrors(
      services.map((service) => service.ports.localEnvironmentVariable),
      "local port environment variables"
    )
  );
  errors.push(
    ...collectDuplicateErrors(
      services.map((service) => service.ports.production),
      "production ports"
    )
  );
  errors.push(
    ...collectDuplicateErrors(
      services.map((service) => service.ports.local),
      "local ports"
    )
  );
  errors.push(
    ...collectDuplicateErrors(
      tools.map((tool) => tool.id),
      "tool ids"
    )
  );
  errors.push(
    ...collectDuplicateErrors(
      tools.map((tool) => tool.path),
      "tool paths"
    )
  );
  errors.push(...collectDuplicateErrors(tools.map((tool) => tool.serviceId).filter(Boolean), "tool service owners"));
  errors.push(
    ...collectDuplicateErrors(tools.map((tool) => tool.runtimeFileId).filter(Boolean), "tool runtime file ids")
  );

  const allHosts = sites.flatMap((site) => [site.host, ...(site.aliases || [])]);
  errors.push(...collectDuplicateErrors(allHosts, "site hosts"));

  const siteIds = new Set(sites.map((site) => site.id));
  const serviceIds = new Set(services.map((service) => service.id));
  const rootSiteId = String(manifest.infrastructure?.localGateway?.rootSiteId || "");
  if (!siteIds.has(rootSiteId)) {
    errors.push(`local gateway references unknown root site ${rootSiteId || "(empty)"}`);
  }
  const toolsRouting = manifest.routing?.tools;
  const trackerRouting = manifest.routing?.tracker;
  if (!toolsRouting || typeof toolsRouting !== "object") {
    errors.push("routing.tools must define the Tools host and root service owner");
  } else {
    if (!siteIds.has(toolsRouting.siteId)) {
      errors.push(`routing.tools references unknown site ${toolsRouting.siteId}`);
    }
    if (!serviceIds.has(toolsRouting.rootServiceId)) {
      errors.push(`routing.tools references unknown root service ${toolsRouting.rootServiceId}`);
    }
  }
  if (!trackerRouting || typeof trackerRouting !== "object") {
    errors.push("routing.tracker must define the tracker host, root owner, and modes");
  } else {
    if (!siteIds.has(trackerRouting.siteId)) {
      errors.push(`routing.tracker references unknown site ${trackerRouting.siteId}`);
    }
    if (!serviceIds.has(trackerRouting.rootServiceId)) {
      errors.push(`routing.tracker references unknown root service ${trackerRouting.rootServiceId}`);
    }
    const trackerModes = Array.isArray(trackerRouting.modes) ? trackerRouting.modes : [];
    if (!trackerModes.length) errors.push("routing.tracker.modes must contain at least one mode");
    errors.push(
      ...collectDuplicateErrors(
        trackerModes.map((mode) => mode.path),
        "tracker mode paths"
      )
    );
    for (const mode of trackerModes) {
      if (!/^[a-z][a-z0-9-]*$/.test(String(mode.path || ""))) {
        errors.push(`tracker mode has invalid path ${mode.path}`);
      }
      if (!serviceIds.has(mode.serviceId)) {
        errors.push(`tracker mode ${mode.path} references unknown service ${mode.serviceId}`);
      }
    }
  }
  errors.push(
    ...collectDuplicateErrors(
      localOnlyOverrides.map((override) => `${override.serviceId}:${override.environmentVariable}`),
      "local-only security overrides"
    )
  );
  for (const override of localOnlyOverrides) {
    if (!serviceIds.has(override.serviceId)) {
      errors.push(`local-only override references unknown service ${override.serviceId}`);
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(String(override.environmentVariable || ""))) {
      errors.push(`local-only override has invalid environment variable ${override.environmentVariable}`);
    }
    if (override.allowedInProduction !== false) {
      errors.push(`${override.environmentVariable} must be forbidden in production`);
    }
  }
  for (const site of sites) {
    if (!existsSync(path.join(root, site.frontend))) {
      errors.push(`site ${site.id} frontend does not exist: ${site.frontend}`);
    }
  }
  for (const service of services) {
    const entryPath = path.join(root, service.cwd, service.entry);
    if (!existsSync(entryPath)) {
      errors.push(`service ${service.id} entry does not exist: ${service.cwd}/${service.entry}`);
    }
    for (const [environment, port] of Object.entries({
      production: service.ports.production,
      local: service.ports.local,
    })) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        errors.push(`service ${service.id} has invalid ${environment} port ${port}`);
      }
    }
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(String(service.ports.localParameter || ""))) {
      errors.push(`service ${service.id} has invalid local port parameter ${service.ports.localParameter}`);
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(String(service.ports.localEnvironmentVariable || ""))) {
      errors.push(
        `service ${service.id} has invalid local port environment variable ${service.ports.localEnvironmentVariable}`
      );
    }
  }
  for (const tool of tools) {
    if (!existsSync(path.join(root, "sites", "tools.xjk.yt", tool.path))) {
      errors.push(`tool ${tool.id} directory does not exist: ${tool.path}`);
    }
    if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(String(tool.path || ""))) {
      errors.push(`tool ${tool.id} has invalid public path ${tool.path}`);
    }
    if (tool.serviceId !== null && !serviceIds.has(tool.serviceId)) {
      errors.push(`tool ${tool.id} references unknown service ${tool.serviceId}`);
    }
    if (tool.serviceId === null && tool.executableName !== null) {
      errors.push(`static tool ${tool.id} cannot define an executable`);
    }
    if ((tool.executableName === null) !== (tool.runtimeFileId === null)) {
      errors.push(`tool ${tool.id} must define its executable and runtime file id together`);
    }
    if (tool.executableName !== null && !/^[A-Za-z0-9._-]+\.exe$/i.test(String(tool.executableName || ""))) {
      errors.push(`tool ${tool.id} has invalid executable name ${tool.executableName}`);
    }
    for (const field of ["name", "description", "category", "status", "input", "output", "tone"]) {
      if (!String(tool[field] || "").trim()) errors.push(`tool ${tool.id} is missing catalog field ${field}`);
    }
  }

  const toolServiceIds = new Set(tools.map((tool) => tool.serviceId).filter(Boolean));
  for (const service of services.filter(
    (candidate) => candidate.id.startsWith("tools-") && candidate.id !== "tools-hub"
  )) {
    if (!toolServiceIds.has(service.id)) errors.push(`tool service ${service.id} has no owning tool record`);
  }

  return errors;
}

export function collectToolRuntimeErrors(manifest, root = repoRoot) {
  const errors = [];
  const runtimeManifest = readToolRuntimeManifest(root);
  const runtimeFiles = Array.isArray(runtimeManifest.files) ? runtimeManifest.files : [];
  const runtimeById = new Map(runtimeFiles.map((file) => [file.id, file]));

  errors.push(
    ...collectDuplicateErrors(
      runtimeFiles.map((file) => file.id),
      "tool runtime file ids"
    )
  );
  for (const tool of manifest.tools.filter((candidate) => candidate.runtimeFileId)) {
    const runtimeFile = runtimeById.get(tool.runtimeFileId);
    if (!runtimeFile) {
      errors.push(`tool ${tool.id} references missing runtime file ${tool.runtimeFileId}`);
      continue;
    }
    if (runtimeFile.kind !== "runtime") {
      errors.push(`tool ${tool.id} references non-runtime file ${tool.runtimeFileId}`);
    }
    const expectedDestination = `sites/tools.xjk.yt/${tool.path}/tools/${tool.executableName}`;
    if (!(runtimeFile.destinations || []).map(toPosixPath).includes(expectedDestination)) {
      errors.push(`tool ${tool.id} runtime ${tool.runtimeFileId} must install to ${expectedDestination}`);
    }
  }

  return errors;
}

export function collectEcosystemErrors(manifest, root = repoRoot) {
  const ecosystemPath = path.join(root, "deploy", "server", "ecosystem.config.cjs");
  const require = createRequire(import.meta.url);
  delete require.cache[require.resolve(ecosystemPath)];
  const apps = require(ecosystemPath).apps || [];
  const appsByName = new Map(apps.map((app) => [app.name, app]));
  const expectedNames = new Set(manifest.services.map((service) => service.processName));
  const errors = [];

  for (const service of manifest.services) {
    const app = appsByName.get(service.processName);
    if (!app) {
      errors.push(`ecosystem is missing ${service.processName}`);
      continue;
    }
    const relativeCwd = toPosixPath(path.relative(root, app.cwd));
    if (relativeCwd !== toPosixPath(service.cwd)) {
      errors.push(`${service.processName} cwd is ${relativeCwd}; manifest expects ${service.cwd}`);
    }
    const actualEntry = service.runtime === "python" ? String(app.args || "").trim() : toPosixPath(app.script);
    if (actualEntry !== service.entry) {
      errors.push(`${service.processName} entry is ${actualEntry}; manifest expects ${service.entry}`);
    }
    if (Number(app.env?.PORT) !== service.ports.production) {
      errors.push(
        `${service.processName} production port is ${app.env?.PORT}; manifest expects ${service.ports.production}`
      );
    }
  }

  for (const app of apps) {
    if (!expectedNames.has(app.name)) errors.push(`ecosystem has unregistered process ${app.name}`);
  }

  for (const override of manifest.infrastructure.security.localOnlyOverrides) {
    const service = manifest.services.find((candidate) => candidate.id === override.serviceId);
    const app = service ? appsByName.get(service.processName) : null;
    if (!service) {
      errors.push(`local-only override references unknown service ${override.serviceId}`);
      continue;
    }
    if (
      override.allowedInProduction === false &&
      String(app?.env?.[override.environmentVariable] ?? "") === override.localValue
    ) {
      errors.push(`${override.environmentVariable} must not use its local-only value in the production ecosystem`);
    }
  }

  return errors;
}

export function collectBrowserSiteRegistryErrors(manifest) {
  const errors = [];
  const browserSitesById = new Map(XJK_SITES.map((site) => [site.id, site]));
  const manifestSiteIds = new Set(manifest.sites.map((site) => site.id));

  for (const site of manifest.sites) {
    const browserSite = browserSitesById.get(site.id);
    if (!browserSite) {
      errors.push(`browser site registry is missing operational site ${site.id}`);
      continue;
    }
    if (browserSite.host !== site.host) {
      errors.push(`browser site ${site.id} host is ${browserSite.host}; manifest expects ${site.host}`);
    }
    const browserAliases = [...(browserSite.hostAliases || [])].sort();
    const manifestAliases = [...(site.aliases || [])].sort();
    if (JSON.stringify(browserAliases) !== JSON.stringify(manifestAliases)) {
      errors.push(
        `browser site ${site.id} host aliases are ${browserAliases.join(", ") || "empty"}; manifest expects ${manifestAliases.join(", ") || "empty"}`
      );
    }
  }

  for (const site of XJK_SITES) {
    if (!manifestSiteIds.has(site.id)) {
      errors.push(`browser site registry contains unregistered operational site ${site.id}`);
    }
  }
  return errors;
}

export function collectLocalStackErrors(manifest, root = repoRoot) {
  const startPath = path.join(root, "deploy", "local", "start-local.ps1");
  const source = readFileSync(startPath, "utf8");
  const platformHelper = readFileSync(path.join(root, "deploy", "platform-manifest.ps1"), "utf8");
  const backendHelper = readFileSync(path.join(root, "deploy", "local", "backend-config.ps1"), "utf8");
  const backendEnvironmentHelper = readFileSync(path.join(root, "deploy", "local", "backend-environment.ps1"), "utf8");
  const errors = [];

  if (!source.includes("platform-manifest.ps1")) errors.push("start-local.ps1 must load the platform manifest helper");
  if (!source.includes("Write-XjkLocalSiteUrls") || !source.includes("Write-XjkLocalPathUrls")) {
    errors.push("start-local.ps1 must render its canonical URL inventory from the platform manifest");
  }

  if (!source.includes("Resolve-XjkLocalStackConfiguration")) {
    errors.push("start-local.ps1 must resolve defaults and overrides through the platform manifest helper");
  }
  if (!source.includes("New-XjkLocalBackendSkeletons")) {
    errors.push("start-local.ps1 must construct backend skeletons from the platform manifest");
  }
  if (!source.includes("localEnvironmentVariable")) {
    errors.push("start-local.ps1 must export gateway service ports from manifest environment-variable names");
  }
  if (/\$requiredPorts\s*=\s*@\(\s*\$GatewayPort/.test(source)) {
    errors.push("start-local.ps1 must not rebuild the required-port inventory by hand");
  }
  if (/\$backends\s*=\s*@\(\s*@\{/.test(source)) {
    errors.push("start-local.ps1 must not rebuild backend identities by hand");
  }

  const expectedParameters = [
    manifest.infrastructure.localGateway.portParameter,
    ...manifest.services.map((service) => service.ports.localParameter),
  ];
  for (const parameterName of expectedParameters) {
    const parameterPattern = new RegExp(`\\[int\\]\\$${escapeRegExp(parameterName)}\\s*=\\s*0(?:,|\\s)`);
    if (!parameterPattern.test(source)) {
      errors.push(`start-local.ps1 must retain zero-sentinel CLI compatibility for ${parameterName}`);
    }
  }

  for (const marker of ["ServicePorts", "ParameterPorts", "RequiredPorts"]) {
    if (!platformHelper.includes(marker)) errors.push(`platform manifest helper must expose ${marker}`);
  }
  for (const marker of ["service.localName", "service.cwd", "service.runtime", "service.entry"]) {
    if (!backendHelper.includes(marker)) errors.push(`local backend skeletons must derive ${marker} from the manifest`);
  }
  if (
    !source.includes("Initialize-XjkLocalBackendEnvironment") ||
    !backendEnvironmentHelper.includes("Add-XjkLocalSecurityOverrides")
  ) {
    errors.push("start-local.ps1 must apply local-only security policy from the platform manifest");
  }

  for (const entry of readdirSync(path.join(root, "deploy", "local"), { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".ps1") continue;
    const localScript = readFileSync(path.join(root, "deploy", "local", entry.name), "utf8");
    const gatewayDefault = localScript.match(/\[int\]\$GatewayPort\s*=\s*([^,\r\n)]+)/);
    if (gatewayDefault && gatewayDefault[1].trim() !== "0") {
      errors.push(`${entry.name} must use the manifest-resolved zero sentinel for GatewayPort`);
    }
  }

  return errors;
}

function extractCaddyBlock(source, startIndex, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] !== "}") continue;
    depth -= 1;
    if (depth === 0) return source.slice(startIndex, index + 1);
  }
  return null;
}

function findCaddyBlocks(source, marker) {
  const pattern = new RegExp(`^[\\t ]*${escapeRegExp(marker)}[\\t ]*\\{[\\t ]*$`, "gm");
  return [...source.matchAll(pattern)]
    .map((match) => {
      const openIndex = match.index + match[0].lastIndexOf("{");
      return extractCaddyBlock(source, match.index, openIndex);
    })
    .filter(Boolean);
}

function findCaddySiteBlocks(source, host) {
  const expectedAddress = `{args[0]}${host}`;
  const siteBlockPattern = /^[^\r\n]*\{[\t ]*$/gm;
  return [...source.matchAll(siteBlockPattern)]
    .filter((match) => {
      const addressList = match[0].slice(0, match[0].lastIndexOf("{")).trim();
      return addressList
        .split(",")
        .map((address) => address.trim())
        .includes(expectedAddress);
    })
    .map((match) => {
      const openIndex = match.index + match[0].lastIndexOf("{");
      return extractCaddyBlock(source, match.index, openIndex);
    })
    .filter(Boolean);
}

function collectCaddyProxyPorts(block) {
  return [...block.matchAll(/^\s*reverse_proxy\s+127\.0\.0\.1:(\d+)(?:\s|$)/gm)].map((match) => Number(match[1]));
}

function collectOwnedCaddyRouteErrors(source, marker, expectedPort, label) {
  const blocks = findCaddyBlocks(source, marker);
  if (blocks.length !== 1) return [`${label} must have exactly one ${marker} block`];
  const ports = collectCaddyProxyPorts(blocks[0]);
  if (ports.length !== 1 || ports[0] !== expectedPort) {
    return [`${label} routes to ${ports.join(", ") || "no service"}; manifest expects ${expectedPort}`];
  }
  return [];
}

export function collectCaddyErrors(manifest, root = repoRoot) {
  const errors = [];
  const routesRelativePath = "deploy/Caddyfile.routes";
  const routesPath = path.join(root, routesRelativePath);
  if (!existsSync(routesPath)) return [`${routesRelativePath} does not exist`];
  const routesSource = readFileSync(routesPath, "utf8");
  const toolRoutesRelativePath = "deploy/Caddyfile.tools.generated";
  const toolRoutesPath = path.join(root, toolRoutesRelativePath);
  const toolRoutesSource = existsSync(toolRoutesPath) ? readFileSync(toolRoutesPath, "utf8") : "";
  if (!toolRoutesSource) {
    errors.push(`${toolRoutesRelativePath} does not exist`);
  } else if (toolRoutesSource.replaceAll("\r\n", "\n") !== renderCaddyToolRoutes(manifest)) {
    errors.push(`${toolRoutesRelativePath} is stale; run npm run catalog:write`);
  }
  const entrypoints = [
    { relativePath: "deploy/Caddyfile", scheme: "https://", autoHttpsOff: false },
    { relativePath: "deploy/Caddyfile.tunnel", scheme: "http://", autoHttpsOff: true },
  ];

  for (const entrypoint of entrypoints) {
    const entryPath = path.join(root, entrypoint.relativePath);
    if (!existsSync(entryPath)) {
      errors.push(`${entrypoint.relativePath} does not exist`);
      continue;
    }
    const source = readFileSync(entryPath, "utf8");
    const imports = [...source.matchAll(/^\s*import\s+Caddyfile\.routes(?:\s+(\S+))?\s*$/gm)];
    if (imports.length !== 1 || imports[0][1] !== entrypoint.scheme) {
      errors.push(`${entrypoint.relativePath} must import Caddyfile.routes with ${entrypoint.scheme}`);
    }
    const hasAutoHttpsOff = /^\s*auto_https\s+off\s*$/m.test(source);
    if (hasAutoHttpsOff !== entrypoint.autoHttpsOff) {
      errors.push(`${entrypoint.relativePath} must ${entrypoint.autoHttpsOff ? "disable" : "enable"} automatic HTTPS`);
    }
    if (/^\s*(?:handle(?:_path)?|reverse_proxy|file_server|root)\b/m.test(source)) {
      errors.push(`${entrypoint.relativePath} must keep site routing in Caddyfile.routes`);
    }
  }

  for (const site of manifest.sites) {
    for (const host of [site.host, ...(site.aliases || [])]) {
      if (findCaddySiteBlocks(routesSource, host).length !== 1) {
        errors.push(`${routesRelativePath} must have exactly one site block for ${host}`);
      }
    }
    const canonicalBlocks = findCaddySiteBlocks(routesSource, site.host);
    if (canonicalBlocks.length === 1 && !canonicalBlocks[0].includes("import favicon_redirect")) {
      errors.push(`${routesRelativePath} ${site.host} must apply the shared favicon redirect`);
    }
  }

  const completeRoutesSource = `${routesSource}\n${toolRoutesSource}`;
  for (const service of manifest.services) {
    if (!completeRoutesSource.includes(`127.0.0.1:${service.ports.production}`)) {
      errors.push(`${routesRelativePath} does not route production port ${service.ports.production} (${service.id})`);
    }
  }

  const servicesById = new Map(manifest.services.map((service) => [service.id, service]));
  const sitesById = new Map(manifest.sites.map((site) => [site.id, site]));
  const toolsRouting = manifest.routing?.tools;
  const toolsSite = sitesById.get(toolsRouting?.siteId);
  const toolsRootService = servicesById.get(toolsRouting?.rootServiceId);
  const toolsBlocks = toolsSite ? findCaddySiteBlocks(routesSource, toolsSite.host) : [];
  if (toolsBlocks.length === 1) {
    const toolsBlock = toolsBlocks[0];
    const toolRouteImports = [...toolsBlock.matchAll(/^\s*import\s+Caddyfile\.tools\.generated\s*$/gm)];
    if (toolRouteImports.length !== 1) {
      errors.push(`${routesRelativePath} ${toolsSite.host} must import Caddyfile.tools.generated exactly once`);
    }
    for (const tool of manifest.tools.filter((candidate) => candidate.serviceId)) {
      const service = servicesById.get(tool.serviceId);
      if (!service) continue;
      errors.push(
        ...collectOwnedCaddyRouteErrors(
          toolRoutesSource,
          `handle_path /${tool.path}/*`,
          service.ports.production,
          `tool /${tool.path}/*`
        )
      );
    }

    const toolApiRoutes = [...toolsBlock.matchAll(/^\s*handle(?:_path)?\s+(\/api\/\S*)/gm)]
      .map((match) => match[1])
      .filter((route) => route !== "/api/v1/account/*");
    if (toolApiRoutes.length) {
      errors.push(
        `root tool APIs must remain owned by ${toolsRouting.rootServiceId}; remove ${toolApiRoutes.join(", ")}`
      );
    }
    if (toolsRootService) {
      errors.push(
        ...collectOwnedCaddyRouteErrors(
          toolsBlock,
          "handle",
          toolsRootService.ports.production,
          `tools root (${toolsRouting.rootServiceId})`
        )
      );
    }
  }

  const trackerRouting = manifest.routing?.tracker;
  const trackerSite = sitesById.get(trackerRouting?.siteId);
  const trackerRootService = servicesById.get(trackerRouting?.rootServiceId);
  const trackerBlocks = trackerSite ? findCaddySiteBlocks(routesSource, trackerSite.host) : [];
  if (trackerBlocks.length === 1) {
    const trackerBlock = trackerBlocks[0];
    for (const mode of trackerRouting.modes || []) {
      const service = servicesById.get(mode.serviceId);
      if (!service) continue;
      for (const routePath of [`/__runtime/${mode.path}/*`, `/${mode.path}/*`]) {
        errors.push(
          ...collectOwnedCaddyRouteErrors(
            trackerBlock,
            `handle_path ${routePath}`,
            service.ports.production,
            `tracker ${routePath}`
          )
        );
      }
    }
    if (trackerRootService) {
      for (const routePath of ["/admin*", "/api/v1*"]) {
        errors.push(
          ...collectOwnedCaddyRouteErrors(
            trackerBlock,
            `handle ${routePath}`,
            trackerRootService.ports.production,
            `tracker root ${routePath}`
          )
        );
      }
    }
  }
  return errors;
}

export function collectToolCatalogErrors(manifest, root = repoRoot) {
  const catalogPath = path.join(root, "sites", "tools.xjk.yt", "Tools-Hub", "data", "tools.json");
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const errors = [];
  if (JSON.stringify(catalog) !== JSON.stringify(renderToolCatalog(manifest))) {
    errors.push("tools.json is stale; run npm run catalog:write");
  }

  const gatewayConfig = readFileSync(path.join(root, "deploy", "local", "gateway", "config.js"), "utf8");
  if (
    !gatewayConfig.includes("PLATFORM_MANIFEST.tools") ||
    !gatewayConfig.includes("localServicePort(tool.serviceId)")
  ) {
    errors.push("local gateway config must derive tool proxy routes from the platform manifest");
  }
  return errors;
}

export function renderToolCatalog(manifest) {
  return manifest.tools
    .filter((tool) => tool.listed)
    .map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      category: tool.category,
      status: tool.status,
      input: tool.input,
      output: tool.output,
      link: `${tool.path}/`,
      tone: tool.tone,
    }));
}

export function renderCaddyToolRoutes(manifest) {
  const servicesById = new Map(manifest.services.map((service) => [service.id, service]));
  const lines = ["# Generated by scripts/generate-platform-catalog.mjs. Do not edit by hand.", ""];

  for (const tool of manifest.tools.filter((candidate) => candidate.serviceId)) {
    const service = servicesById.get(tool.serviceId);
    if (!service) continue;
    const matcherName = `tool${String(tool.id)
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
      .join("")}Exact`;
    lines.push(
      `@${matcherName} path /${tool.path}`,
      `redir @${matcherName} /${tool.path}/ 308`,
      `handle_path /${tool.path}/* {`,
      `\treverse_proxy 127.0.0.1:${service.ports.production}`,
      "}",
      ""
    );
  }

  return lines.join("\n");
}

export function renderPlatformCatalog(manifest) {
  const lines = [
    "<!-- Generated by scripts/generate-platform-catalog.mjs. Do not edit by hand. -->",
    "",
    "# Platform Catalog",
    "",
    `Asset version: \`${manifest.assetVersion}\``,
    "",
    "## Sites",
    "",
    "| Site | Host | Local URL | Aliases | Frontend | Visibility |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const site of manifest.sites) {
    lines.push(
      `| ${site.name} | \`${site.host}\` | \`http://${site.id}.localhost:${manifest.infrastructure.localGateway.port}/\` | ${site.aliases.length ? site.aliases.map((host) => `\`${host}\``).join(", ") : "—"} | \`${site.frontend}\` | ${site.visibility} |`
    );
  }

  lines.push(
    "",
    "## Services",
    "",
    "| Service | Process | Production | Local | Local override | Gateway binding | Source | Health |",
    "| --- | --- | ---: | ---: | --- | --- | --- | --- |"
  );
  for (const service of manifest.services) {
    const health = service.health
      ? `\`${service.health.path}\` (${service.health.required ? "required" : "optional"})`
      : "—";
    lines.push(
      `| ${service.id} | \`${service.processName}\` | ${service.ports.production} | ${service.ports.local} | \`-${service.ports.localParameter}\` | \`${service.ports.localEnvironmentVariable}\` | \`${service.cwd}/${service.entry}\` | ${health} |`
    );
  }

  lines.push("", "## Tracker Routes", "", "| Public path | Runtime path | Backend |", "| --- | --- | --- |");
  for (const mode of manifest.routing.tracker.modes) {
    lines.push(`| \`/${mode.path}/\` | \`/__runtime/${mode.path}/\` | \`${mode.serviceId}\` |`);
  }
  lines.push(
    "",
    `Tracker root \`/api/v1*\` and \`/admin*\` requests belong to \`${manifest.routing.tracker.rootServiceId}\`.`,
    `The Tools root belongs to \`${manifest.routing.tools.rootServiceId}\`; individual tool APIs stay under their registered tool paths.`
  );

  lines.push("", "## Tools", "", "| Tool | Public path | Backend | Hub listing |", "| --- | --- | --- | --- |");
  for (const tool of manifest.tools) {
    lines.push(
      `| ${tool.id} | \`/${tool.path}/\` | ${tool.serviceId ? `\`${tool.serviceId}\`` : "static"} | ${tool.listed ? "yes" : "no"} |`
    );
  }
  lines.push(
    "",
    "## Local-only Security Overrides",
    "",
    "| Service | Environment variable | Local value | Production |",
    "| --- | --- | --- | --- |"
  );
  for (const override of manifest.infrastructure.security.localOnlyOverrides) {
    lines.push(
      `| ${override.serviceId} | \`${override.environmentVariable}\` | \`${override.localValue}\` | ${override.allowedInProduction ? "allowed" : "forbidden"} |`
    );
  }
  lines.push("", "The canonical source for this document is `config/platform-manifest.json`.", "");
  return lines.join("\n");
}

export function collectGeneratedCatalogErrors(manifest, root = repoRoot) {
  const catalogPath = path.join(root, "PLATFORM_CATALOG.md");
  if (!existsSync(catalogPath)) return ["PLATFORM_CATALOG.md has not been generated"];
  const actual = readFileSync(catalogPath, "utf8").replaceAll("\r\n", "\n");
  const expected = renderPlatformCatalog(manifest);
  return actual === expected ? [] : ["PLATFORM_CATALOG.md is stale; run npm run catalog:write"];
}

export function collectPlatformErrors(manifest = readPlatformManifest(), root = repoRoot) {
  return [
    ...collectDefinitionErrors(manifest, root),
    ...collectRunnableServiceErrors(manifest, root),
    ...collectProductionCredentialErrors(manifest, root),
    ...collectBrowserSiteRegistryErrors(manifest),
    ...collectEcosystemErrors(manifest, root),
    ...collectLocalStackErrors(manifest, root),
    ...collectCaddyErrors(manifest, root),
    ...collectToolCatalogErrors(manifest, root),
    ...collectToolRuntimeErrors(manifest, root),
    ...collectGeneratedCatalogErrors(manifest, root),
  ];
}
