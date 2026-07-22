import { collectPlatformErrors, readPlatformManifest } from "./lib/platform-manifest.mjs";

const errors = collectPlatformErrors(readPlatformManifest());
if (errors.length) {
  console.error(`Platform manifest validation failed with ${errors.length} error${errors.length === 1 ? "" : "s"}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  "Platform manifest matches browser sites, local startup, production processes, Caddy routes, tool catalog, and docs."
);
