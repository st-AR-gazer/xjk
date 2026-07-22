import { createToolJobCapacity } from "./capacity.js";
import { configureFrontendToolApp, installApiRateLimit } from "./http.js";
import { runProcess } from "./process.js";
import { resolveToolRuntimeConfig } from "./runtime.js";
import { createUploadBudgetMiddleware } from "./uploads.js";

export function createNativeToolBackend({
  metaUrl,
  executableName,
  express,
  helmet,
  morgan,
  rateLimit,
  runtimeOptions = {},
  frontendOptions = {},
  installRateLimit = true,
  rateLimitOptions = {},
  uploadFieldLimitsMb = {},
}) {
  const config = resolveToolRuntimeConfig({ ...runtimeOptions, metaUrl, executableName });
  const app = express();
  configureFrontendToolApp({
    app,
    express,
    helmet,
    morgan,
    frontendDir: config.frontendDir,
    trustProxy: 1,
    ...frontendOptions,
  });
  if (installRateLimit) installApiRateLimit({ app, rateLimit, ...rateLimitOptions });

  const capacity = createToolJobCapacity(config);
  const enforceUploadBudget = createUploadBudgetMiddleware({
    maxTotalMb: config.maxUploadMb,
    fieldLimitsMb: uploadFieldLimitsMb,
  });

  function execute({
    executable = config.toolPath,
    args = [],
    timeoutMs = config.toolTimeoutMs,
    maxOutputBytes = config.maxProcessOutputBytes,
    env = { ...process.env },
    ...options
  } = {}) {
    return runProcess({ executable, args, timeoutMs, maxOutputBytes, env, ...options });
  }

  return {
    app,
    config,
    capacity,
    admit: capacity.admit,
    enforceUploadBudget,
    execute,
    run: (args, options = {}) => execute({ args, ...options }),
  };
}
