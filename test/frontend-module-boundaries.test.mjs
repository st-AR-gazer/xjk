import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetVersion = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "config/platform-manifest.json"), "utf8")
).assetVersion;
const browserApplications = [
  {
    label: "Console Bingo",
    page: "sites/console.xjk.yt/frontend/bingo/index.html",
    sourceDirectory: "sites/console.xjk.yt/frontend/bingo/scripts",
    entryHref: `./scripts/runtime.js?v=${assetVersion}`,
    modules: ["actions.js", "core.js", "domain.js", "room-list-ui.js", "chrome-ui.js", "match-ui.js", "runtime.js"],
    hrefForModule: (moduleName) => `./scripts/${moduleName}?v=${assetVersion}`,
  },
  {
    label: "Colorizer",
    page: "sites/tools.xjk.yt/Colorizer/frontend/index.html",
    sourceDirectory: "sites/tools.xjk.yt/Colorizer/frontend",
    entryHref: `mainCard.js?v=${assetVersion}`,
    modules: [
      "background.js",
      "card-layout.js",
      "colorCard.js",
      "colorize.js",
      "mainCard.js",
      "optionCard.js",
      "state.js",
    ],
    hrefForModule: (moduleName) => `${moduleName}?v=${assetVersion}`,
  },
];

function scriptTags(html) {
  return [...html.matchAll(/<script\b[^>]*>/giu)].map(([tag]) => ({
    source: tag.match(/\bsrc=["']([^"']+)["']/iu)?.[1] ?? "",
    type: tag.match(/\btype=["']([^"']+)["']/iu)?.[1] ?? "",
  }));
}

function localModuleImports(source, sourcePath) {
  const syntaxTree = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  return syntaxTree.body
    .filter((node) => ["ExportAllDeclaration", "ExportNamedDeclaration", "ImportDeclaration"].includes(node.type))
    .map((node) => node.source?.value)
    .filter((specifier) => typeof specifier === "string" && specifier.startsWith("."))
    .map((specifier) => path.resolve(path.dirname(sourcePath), specifier.split("?")[0]));
}

function assertAcyclicModuleGraph(application) {
  const sourcePaths = new Set(
    application.modules.map((moduleName) => path.resolve(repoRoot, application.sourceDirectory, moduleName))
  );
  const graph = new Map(
    [...sourcePaths].map((sourcePath) => [
      sourcePath,
      localModuleImports(fs.readFileSync(sourcePath, "utf8"), sourcePath).filter((target) => sourcePaths.has(target)),
    ])
  );
  const visiting = new Set();
  const visited = new Set();

  function visit(sourcePath, trail) {
    if (visiting.has(sourcePath)) {
      const cycleStart = trail.indexOf(sourcePath);
      const cycle = [...trail.slice(cycleStart), sourcePath].map((entry) => path.basename(entry));
      assert.fail(`${application.label} contains an import cycle: ${cycle.join(" -> ")}`);
    }
    if (visited.has(sourcePath)) return;
    visiting.add(sourcePath);
    for (const target of graph.get(sourcePath) || []) visit(target, [...trail, sourcePath]);
    visiting.delete(sourcePath);
    visited.add(sourcePath);
  }

  for (const sourcePath of sourcePaths) visit(sourcePath, []);
}

test("browser applications expose one acyclic module entrypoint instead of ordered global bundles", () => {
  for (const application of browserApplications) {
    const html = fs.readFileSync(path.join(repoRoot, application.page), "utf8");
    const scripts = scriptTags(html);
    const applicationScripts = scripts.filter(({ source }) =>
      application.modules.some((moduleName) => source === application.hrefForModule(moduleName))
    );

    assert.deepEqual(
      applicationScripts,
      [{ source: application.entryHref, type: "module" }],
      `${application.label} must load only its module entrypoint from HTML`
    );

    for (const moduleName of application.modules) {
      const source = fs.readFileSync(path.join(repoRoot, application.sourceDirectory, moduleName), "utf8");
      assert.match(
        source,
        /(^|\n)\s*(?:import|export)\b/u,
        `${application.label} ${moduleName} must remain an ES module`
      );
    }
    assertAcyclicModuleGraph(application);
  }
});

test("ESLint no longer carries global-bundle compatibility exemptions", () => {
  const eslintConfig = fs.readFileSync(path.join(repoRoot, "eslint.config.js"), "utf8");

  assert.doesNotMatch(eslintConfig, /bingoBundleGlobals|colorizerBundleGlobals/u);
  assert.doesNotMatch(eslintConfig, /sourceType:\s*["']script["']/u);
});
