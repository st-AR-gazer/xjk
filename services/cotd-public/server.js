import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertProductionCredentialsWhenProduction } from "../shared/productionCredentials.js";
import * as settings from "./src/config.js";
import { createCotdApp } from "./src/app.js";
import { createCotdWorkflow } from "./src/cotdWorkflow.js";
import { createCotdRuntime } from "./src/runtime.js";
import { startCotdServer as startRuntimeServer } from "./src/serverRuntime.js";

assertProductionCredentialsWhenProduction("cotd-public", process.env);
const cotdRuntime = createCotdRuntime();
const workflow = createCotdWorkflow(cotdRuntime, { settings });
const app = createCotdApp({ runtime: cotdRuntime, settings, workflow });
const { repository, responseCache } = cotdRuntime;

function startCotdServer(options = {}) {
  return startRuntimeServer({ ...options, app, runtime: cotdRuntime, settings, workflow });
}

const isMainModule = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMainModule) startCotdServer();

export { app, repository, responseCache, startCotdServer };
