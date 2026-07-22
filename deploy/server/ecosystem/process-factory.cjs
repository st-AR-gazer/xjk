const path = require("node:path");

function createProcessFactory({ repoRoot, platformManifest, serviceEnvironments }) {
  const servicesById = new Map(platformManifest.services.map((service) => [service.id, service]));
  const sitesRoot = path.join(repoRoot, "sites");
  const roots = Object.freeze({
    aggregator: path.join(sitesRoot, "aggregator.xjk.yt"),
    altered: path.join(sitesRoot, "altered.xjk.yt"),
    console: path.join(sitesRoot, "console.xjk.yt"),
    dash: path.join(sitesRoot, "dash.xjk.yt"),
    learn: path.join(sitesRoot, "learn.xjk.yt"),
    plugins: path.join(sitesRoot, "plugins.xjk.yt"),
    sites: sitesRoot,
    tools: path.join(sitesRoot, "tools.xjk.yt"),
    trackers: path.join(sitesRoot, "trackers.xjk.yt"),
  });

  function getServiceManifest(serviceId) {
    const service = servicesById.get(serviceId);
    if (!service) throw new Error(`Unknown platform service: ${serviceId}`);
    return service;
  }

  function productionServiceUrl(serviceId, pathname = "") {
    const service = getServiceManifest(serviceId);
    const suffix = String(pathname || "").trim();
    return `http://127.0.0.1:${service.ports.production}${suffix ? `/${suffix.replace(/^\/+/, "")}` : ""}`;
  }

  function defineProcess(serviceId, config = {}) {
    const service = getServiceManifest(serviceId);
    const authoritativeEnv = config.authoritativeEnv || {};
    const processConfig = { ...config };
    delete processConfig.authoritativeEnv;
    const reservedKeys = ["name", "cwd", "script", "args", "interpreter"];
    const overriddenKey = reservedKeys.find((key) => Object.hasOwn(processConfig, key));
    if (overriddenKey) throw new Error(`${serviceId} must define ${overriddenKey} in the platform manifest`);

    const serviceRoot = path.join(repoRoot, service.cwd);
    const runtime =
      service.runtime === "python"
        ? {
            script: path.join(serviceRoot, ".venv", "Scripts", "python.exe"),
            args: service.entry,
            interpreter: "none",
          }
        : { script: service.entry, interpreter: "node" };

    return {
      ...processConfig,
      name: service.processName,
      cwd: serviceRoot,
      ...runtime,
      env: {
        ...processConfig.env,
        ...serviceEnvironments.forService(serviceId),
        ...authoritativeEnv,
        NODE_ENV: "production",
        PORT: String(service.ports.production),
      },
    };
  }

  function getToolRoot(serviceId) {
    const tool = platformManifest.tools.find((candidate) => candidate.serviceId === serviceId);
    if (!tool) throw new Error(`No platform tool is owned by service: ${serviceId}`);
    return path.join(roots.tools, tool.path);
  }

  function defineToolProcess(serviceId, { executableName = "", env = {} } = {}) {
    const toolRoot = getToolRoot(serviceId);
    const workspaceEnv = executableName
      ? {
          UPLOAD_DIR: path.join(toolRoot, "data", "uploads"),
          OUTPUT_DIR: path.join(toolRoot, "data", "processed"),
          TOOL_PATH: path.join(toolRoot, "tools", executableName),
        }
      : {};
    return defineProcess(serviceId, {
      env: { FRONTEND_DIR: path.join(toolRoot, "frontend"), ...workspaceEnv, ...env },
      authoritativeEnv: executableName ? { TOOL_PATH: workspaceEnv.TOOL_PATH } : {},
    });
  }

  return Object.freeze({
    defineProcess,
    defineToolProcess,
    getToolRoot,
    platformManifest,
    productionServiceUrl,
    roots,
  });
}

module.exports = { createProcessFactory };
