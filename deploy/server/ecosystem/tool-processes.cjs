const path = require("node:path");

function defineToolProcesses({
  defineProcess,
  defineToolProcess,
  getToolRoot,
  platformManifest,
  roots,
  serviceEnvironments,
}) {
  const replayEnvironment = serviceEnvironments.forService("tools-replay-verification");
  const environmentFactories = new Map([
    [
      "tools-embed",
      () => ({
        REPLAY_EXTRACT_TOOL_PATH: path.join(getToolRoot("tools-embed"), "tools", "ReplayDataExtractor.exe"),
        GBXLZO_PATH: path.join(getToolRoot("tools-strip"), "tools", "gbxlzo.exe"),
      }),
    ],
    [
      "tools-replay-verification",
      () => ({
        REPLAY_VERIFICATION_API_BASE_URL: replayEnvironment.REPLAY_VERIFICATION_API_BASE_URL || "",
        REPLAY_VERIFICATION_API_TOKEN: replayEnvironment.REPLAY_VERIFICATION_API_TOKEN || "",
        REPLAY_VERIFICATION_API_TOKEN_HEADER: replayEnvironment.REPLAY_VERIFICATION_API_TOKEN_HEADER || "Authorization",
        REPLAY_VERIFICATION_API_TOKEN_PREFIX: replayEnvironment.REPLAY_VERIFICATION_API_TOKEN_PREFIX || "Bearer",
        REPLAY_VERIFICATION_REQUEST_TIMEOUT_MS: replayEnvironment.REPLAY_VERIFICATION_REQUEST_TIMEOUT_MS || "15000",
      }),
    ],
  ]);
  const toolBackends = platformManifest.tools
    .filter((tool) => tool.serviceId)
    .map((tool) =>
      defineToolProcess(tool.serviceId, {
        executableName: tool.executableName || "",
        env: environmentFactories.get(tool.serviceId)?.() || {},
      })
    );

  return [
    defineProcess("tools-hub", {
      env: {
        FRONTEND_DIR: path.join(roots.tools, "Tools-Hub", "frontend"),
        DATA_DIR: path.join(roots.tools, "Tools-Hub", "data"),
        TOOLS_FILE: path.join(roots.tools, "Tools-Hub", "data", "tools.json"),
      },
    }),
    ...toolBackends,
  ];
}

module.exports = { defineToolProcesses };
