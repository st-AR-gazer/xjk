import { startToolServerIfMain } from "../../shared/backend/http.js";
import { createUnderwaterApp } from "./src/app.js";

const service = createUnderwaterApp({ metaUrl: import.meta.url });
const { app } = service;
const { config } = service.runtime;
const server = startToolServerIfMain(import.meta.url, {
  app,
  port: config.port,
  details: [`UPLOAD_DIR=${config.uploadDir}`, `OUTPUT_DIR=${config.outputDir}`, `TOOL_PATH=${config.toolPath}`],
});
if (server) {
  service.workflow.startMaintenance();
  server.once("close", () => service.workflow.stopMaintenance());
}

export { app };
