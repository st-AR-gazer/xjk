import { createUploadErrorHandler } from "../../../shared/backend/http.js";
import { createBatchJobWorkflow, registerBatchRoutes } from "./batchJobs.js";
import { createUnderwaterRuntime } from "./runtime.js";
import { registerSingleConversionRoute } from "./singleConversion.js";

function createUnderwaterApp({ metaUrl, env = process.env, logger = console } = {}) {
  const runtime = createUnderwaterRuntime({ metaUrl, env });
  const workflow = createBatchJobWorkflow({ runtime, logger });
  registerSingleConversionRoute({ app: runtime.app, runtime, logger });
  registerBatchRoutes({ app: runtime.app, runtime, workflow });
  runtime.app.use(createUploadErrorHandler({ multer: runtime.multer, maxFileMb: runtime.config.maxFileMb }));
  return { app: runtime.app, runtime, workflow };
}

export { createUnderwaterApp };
