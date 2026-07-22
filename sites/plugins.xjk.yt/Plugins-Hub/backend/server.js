import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadPluginHubConfig } from "./src/config.js";
import { createPluginHubRuntime } from "./src/runtime.js";

export async function main() {
  const runtime = createPluginHubRuntime({ config: loadPluginHubConfig() });
  await runtime.start();
  return runtime;
}

const directEntryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (directEntryUrl === import.meta.url) {
  main().catch((error) => {
    console.error("Plugins Hub failed to start:", error);
    process.exitCode = 1;
  });
}

export { createPluginHubRuntime, loadPluginHubConfig };
