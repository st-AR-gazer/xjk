import { writeFileSync } from "node:fs";
import path from "node:path";

import {
  readPlatformManifest,
  renderCaddyToolRoutes,
  renderPlatformCatalog,
  renderToolCatalog,
  repoRoot,
} from "./lib/platform-manifest.mjs";

const manifest = readPlatformManifest();
const outputs = [
  {
    path: path.join(repoRoot, "PLATFORM_CATALOG.md"),
    content: renderPlatformCatalog(manifest),
  },
  {
    path: path.join(repoRoot, "sites", "tools.xjk.yt", "Tools-Hub", "data", "tools.json"),
    content: `${JSON.stringify(renderToolCatalog(manifest), null, 2)}\n`,
  },
  {
    path: path.join(repoRoot, "deploy", "Caddyfile.tools.generated"),
    content: renderCaddyToolRoutes(manifest),
  },
];

for (const output of outputs) {
  writeFileSync(output.path, output.content, "utf8");
  console.log(`Wrote ${path.relative(repoRoot, output.path).replaceAll("\\", "/")}`);
}
