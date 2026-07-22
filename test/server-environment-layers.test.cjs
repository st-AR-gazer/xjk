const assert = require("node:assert/strict");
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createServiceEnvironmentResolver,
  loadEnvironmentFile,
  mergeEnvironmentLayers,
  parseEnvironmentFile,
} = require("../deploy/server/environment-layers.cjs");
const { createProcessFactory } = require("../deploy/server/ecosystem/process-factory.cjs");
const { createEnvironmentContext } = require("../deploy/server/ecosystem/environment-context.cjs");
const { definePublicDataProcesses } = require("../deploy/server/ecosystem/public-data-processes.cjs");

test("environment file parsing is side-effect free", () => {
  const key = "XJK_ENVIRONMENT_LAYER_TEST";
  const previous = process.env[key];
  process.env[key] = "inherited-sentinel";
  try {
    const parsed = parseEnvironmentFile(`${key}=scoped-sentinel\nQUOTED='value'`);
    const loaded = loadEnvironmentFile("virtual.env", {
      existsSync: () => true,
      readFileSync: () => `${key}=file-sentinel`,
    });
    assert.equal(parsed[key], "scoped-sentinel");
    assert.equal(parsed.QUOTED, "value");
    assert.equal(loaded[key], "file-sentinel");
    assert.equal(process.env[key], "inherited-sentinel");
    assert.ok(Object.isFrozen(parsed));
    assert.ok(Object.isFrozen(loaded));
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test("service environments keep scoped values isolated with explicit precedence", () => {
  const services = [
    { id: "alpha", cwd: "services/alpha" },
    { id: "beta", cwd: "services/beta" },
  ];
  const scopedByService = {
    alpha: { COLLISION: "alpha-sentinel", ALPHA_ONLY: "alpha-only" },
    beta: { COLLISION: "beta-sentinel", BETA_ONLY: "beta-only" },
  };
  const resolver = createServiceEnvironmentResolver({
    services,
    repoRoot: path.parse(process.cwd()).root,
    inheritedEnvironment: { INHERITED_ONLY: "inherited-only" },
    serverEnvironment: { COLLISION: "server-sentinel", SERVER_ONLY: "server-only" },
    loadScopedEnvironment: (filePath) => scopedByService[path.basename(path.dirname(filePath))],
  });

  const alpha = resolver.forService("alpha");
  const beta = resolver.forService("beta");
  assert.equal(alpha.COLLISION, "alpha-sentinel");
  assert.equal(beta.COLLISION, "beta-sentinel");
  assert.equal(alpha.BETA_ONLY, undefined);
  assert.equal(beta.ALPHA_ONLY, undefined);
  assert.equal(alpha.SERVER_ONLY, "server-only");
  assert.equal(beta.INHERITED_ONLY, "inherited-only");
  assert.ok(Object.isFrozen(alpha));
  assert.ok(Object.isFrozen(beta));

  assert.equal(
    mergeEnvironmentLayers({
      inherited: { COLLISION: "inherited-sentinel" },
      server: { COLLISION: "server-sentinel" },
      scoped: { COLLISION: "scoped-sentinel" },
    }).COLLISION,
    "inherited-sentinel"
  );
});

test("credential and alias derivation uses the owning service environment", () => {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "xjk-service-environments-"));
  const services = [
    { id: "altered-hub", cwd: "services/altered" },
    { id: "aggregator-hub", cwd: "services/aggregator" },
    { id: "tracker-hub", cwd: "services/tracker" },
  ];
  const environments = new Map([
    ["altered-hub", "ALTERED_INTERNAL_TOKEN=altered-pair\nALTERED_WR_WEBHOOK_SECRET=webhook-pair"],
    [
      "aggregator-hub",
      "AGGREGATOR_INGEST_TOKEN=ingest-only\nDASH_ADMIN_TOKEN=dashboard-only\nDASH_ALTERED_INTERNAL_TOKEN=altered-pair\nDASH_TRACKER_ADMIN_TOKEN=tracker-pair",
    ],
    ["tracker-hub", "TRACKER_ADMIN_TOKEN=tracker-pair\nTRACKER_WR_WEBHOOK_SECRET=webhook-pair"],
  ]);
  try {
    for (const service of services) {
      const directory = path.join(repoRoot, service.cwd);
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, ".env"), environments.get(service.id), "utf8");
    }
    const context = createEnvironmentContext({
      repoRoot,
      platformManifest: { services },
      inheritedEnvironment: {},
    });
    assert.equal(context.aggregatorAccessEnvironment.AGGREGATOR_INGEST_TOKEN, "ingest-only");
    assert.equal(context.aggregatorAccessEnvironment.DASH_ADMIN_TOKEN, "dashboard-only");
    assert.equal(context.aggregatorUpstreamCredentials.ALTERED_INTERNAL_TOKEN, "altered-pair");
    assert.equal(context.aggregatorUpstreamCredentials.TRACKER_ADMIN_TOKEN, "tracker-pair");
    assert.equal(context.wrWebhookCredentials.TRACKER_WR_WEBHOOK_SECRET, "webhook-pair");

    const definitions = definePublicDataProcesses({
      defineProcess: (serviceId, config) => ({ serviceId, ...config }),
      roots: { sites: path.join(repoRoot, "sites") },
      serviceEnvironments: {
        forService: (serviceId) =>
          serviceId === "validifier-public" ? { REPLAY_VERIFICATION_API_TOKEN: "validifier-alias" } : {},
      },
    });
    assert.equal(
      definitions.find((definition) => definition.serviceId === "validifier-public").env.VALIDIFIER_INTERNAL_TOKEN,
      "validifier-alias"
    );
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("production Underwater always uses the manifest-managed executable", () => {
  const repoRoot = path.resolve(__dirname, "..");
  const manifest = require(path.join(repoRoot, "config", "platform-manifest.json"));
  const tool = manifest.tools.find((candidate) => candidate.serviceId === "tools-underwater");
  const service = manifest.services.find((candidate) => candidate.id === "tools-underwater");
  const ecosystemPath = path.join(repoRoot, "deploy", "server", "ecosystem.config.cjs");
  const previousToolPath = process.env.TOOL_PATH;
  process.env.TOOL_PATH = path.join(repoRoot, "outside-managed-runtime.exe");
  delete require.cache[require.resolve(ecosystemPath)];
  try {
    const app = require(ecosystemPath).apps.find((candidate) => candidate.name === service.processName);
    assert.equal(
      path.resolve(app.env.TOOL_PATH),
      path.join(repoRoot, "sites", "tools.xjk.yt", tool.path, "tools", tool.executableName)
    );
  } finally {
    if (previousToolPath === undefined) delete process.env.TOOL_PATH;
    else process.env.TOOL_PATH = previousToolPath;
    delete require.cache[require.resolve(ecosystemPath)];
  }
});

test("process definitions apply defaults, isolated service values, and authoritative values in order", () => {
  const repoRoot = path.resolve(__dirname, "..");
  const platformManifest = {
    services: [
      {
        id: "example-service",
        processName: "xjk-example",
        cwd: "services/example",
        runtime: "node",
        entry: "server.js",
        ports: { production: 3999 },
      },
    ],
    tools: [],
  };
  const factory = createProcessFactory({
    repoRoot,
    platformManifest,
    serviceEnvironments: {
      forService: () => ({ COLLISION: "service", SERVICE_ONLY: "service-only", PORT: "wrong-port" }),
    },
  });

  const processDefinition = factory.defineProcess("example-service", {
    env: { COLLISION: "default", DEFAULT_ONLY: "default-only", NODE_ENV: "development" },
    authoritativeEnv: { COLLISION: "authoritative", AUTHORITATIVE_ONLY: "authoritative-only" },
  });

  assert.equal(processDefinition.env.COLLISION, "authoritative");
  assert.equal(processDefinition.env.DEFAULT_ONLY, "default-only");
  assert.equal(processDefinition.env.SERVICE_ONLY, "service-only");
  assert.equal(processDefinition.env.AUTHORITATIVE_ONLY, "authoritative-only");
  assert.equal(processDefinition.env.NODE_ENV, "production");
  assert.equal(processDefinition.env.PORT, "3999");
});
