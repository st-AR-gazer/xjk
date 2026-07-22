import path from "node:path";
import { pathToFileURL } from "node:url";

import { createAlteredServerRuntime } from "./src/runtime/alteredServerRuntime.js";

const runtime = createAlteredServerRuntime();
const { app, startServer, stopServices } = runtime;

const mainModuleUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === mainModuleUrl) {
  startServer();
  process.on("SIGINT", () => {
    stopServices();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stopServices();
    process.exit(0);
  });
}

export { app, startServer };
