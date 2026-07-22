const fs = require("node:fs");
const path = require("node:path");

const { defineConsoleProcess } = require("./ecosystem/console-process.cjs");
const { createEnvironmentContext } = require("./ecosystem/environment-context.cjs");
const { definePlatformProcesses } = require("./ecosystem/platform-processes.cjs");
const { createProcessFactory } = require("./ecosystem/process-factory.cjs");
const { definePublicDataProcesses } = require("./ecosystem/public-data-processes.cjs");
const { defineToolProcesses } = require("./ecosystem/tool-processes.cjs");
const { defineTrackerProcesses } = require("./ecosystem/tracker-processes.cjs");
const { defineTrackerSupportProcesses } = require("./ecosystem/tracker-support-processes.cjs");

const repoRoot = path.resolve(__dirname, "..", "..");
const platformManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "config", "platform-manifest.json"), "utf8"));
const environmentContext = createEnvironmentContext({ repoRoot, platformManifest });
const processFactory = createProcessFactory({
  repoRoot,
  platformManifest,
  serviceEnvironments: environmentContext.serviceEnvironments,
});
const definitionContext = Object.freeze({ ...environmentContext, ...processFactory });

module.exports = {
  apps: [
    ...definePublicDataProcesses(definitionContext),
    ...definePlatformProcesses(definitionContext),
    defineConsoleProcess(definitionContext),
    ...defineTrackerProcesses(definitionContext),
    ...defineTrackerSupportProcesses(definitionContext),
    ...defineToolProcesses(definitionContext),
  ],
};
