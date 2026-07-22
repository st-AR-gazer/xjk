import { startToolServerIfMain } from "../../shared/backend/http.js";
import { createClipApp } from "./src/app.js";

const service = createClipApp({ metaUrl: import.meta.url });
const { app } = service;
const { config } = service.runtime;
const server = startToolServerIfMain(import.meta.url, {
  app,
  port: config.port,
  details: [`TOOL_PATH=${config.toolPath}`, `UPLOAD_DIR=${config.uploadDir}`, `OUTPUT_DIR=${config.outputDir}`],
});
if (server) {
  service.uploadStore.startMaintenance();
  server.once("close", () => service.uploadStore.stopMaintenance());
}

export { app };
