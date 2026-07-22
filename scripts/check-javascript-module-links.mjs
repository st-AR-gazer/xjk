import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

import { parse } from "acorn";

import { repoRoot } from "./lib/platform-manifest.mjs";

const SOURCE_ROOTS = ["services", "sites", "scripts", "deploy", "test"];
const SOURCE_EXTENSIONS = new Set([".js", ".mjs"]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".runtime",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "data",
  "data_server",
  "dist",
  "logs",
  "node_modules",
]);
const BROWSER_IMPORT_ROOTS = new Map([
  ["/shared/xjk-core/", "sites/shared/xjk-core"],
  ["/shared/xjk-workspace/", "sites/shared/xjk-workspace"],
  ["/shared/", "sites/tools.xjk.yt/shared"],
]);
const BROWSER_IMPORT_FILES = new Map([["/map-layout.js", "sites/xjk.yt/frontend/map-layout.js"]]);

function collectJavaScriptFiles(root = repoRoot) {
  const files = [];
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "EACCES" || error?.code === "EPERM") return;
      throw error;
    }
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolutePath).replaceAll("\\", "/");
      if (
        entry.isDirectory() &&
        (IGNORED_DIRECTORIES.has(entry.name) ||
          entry.name.startsWith("tmp") ||
          entry.name.startsWith("tools-backup") ||
          /^sites\/tools\.xjk\.yt\/[^/]+\/tools(?:\/|$)/.test(relativePath) ||
          relativePath === "sites/tools.xjk.yt/.runtime-licenses")
      ) {
        continue;
      }
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(absolutePath);
    }
  };
  for (const sourceRoot of SOURCE_ROOTS) visit(path.join(root, sourceRoot));
  return files.sort();
}

function withoutUrlSuffix(specifier) {
  return String(specifier).split(/[?#]/, 1)[0];
}

function collectLiteralDynamicImports(source, filePath) {
  let ast;
  try {
    ast = parse(source, {
      allowHashBang: true,
      ecmaVersion: "latest",
      locations: true,
      sourceType: "module",
    });
  } catch (error) {
    throw new Error(`${filePath}:${error?.loc?.line || 1} could not inspect dynamic imports: ${error.message}`);
  }
  const imports = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "ImportExpression" && typeof node.source?.value === "string") {
      imports.push({ specifier: node.source.value, line: node.loc?.start?.line || 1 });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object" && typeof value.type === "string") visit(value);
    }
  };
  visit(ast);
  return imports;
}

function resolveLocalImport(specifier, referencingPath, root = repoRoot) {
  const cleanSpecifier = withoutUrlSuffix(specifier);
  const referencingRelativePath = path.relative(root, referencingPath).replaceAll("\\", "/");
  const trackerShimMatch = referencingRelativePath.match(
    /^sites\/trackers\.xjk\.yt\/frontend\/__runtime\/(?:wr|leaderboard)\//
  );
  if (trackerShimMatch && cleanSpecifier.startsWith("./tracker-shared/")) {
    return path.join(
      root,
      "sites/trackers.xjk.yt/frontend/__runtime/shared",
      cleanSpecifier.slice("./tracker-shared/".length)
    );
  }
  if (cleanSpecifier.startsWith("./") || cleanSpecifier.startsWith("../")) {
    return path.resolve(path.dirname(referencingPath), cleanSpecifier);
  }
  for (const [browserPrefix, localDirectory] of BROWSER_IMPORT_ROOTS) {
    if (cleanSpecifier.startsWith(browserPrefix)) {
      return path.join(root, localDirectory, cleanSpecifier.slice(browserPrefix.length));
    }
  }
  if (BROWSER_IMPORT_FILES.has(cleanSpecifier)) return path.join(root, BROWSER_IMPORT_FILES.get(cleanSpecifier));
  if (cleanSpecifier.startsWith("/")) {
    throw new Error(
      `${path.relative(root, referencingPath)} imports unsupported browser path ${JSON.stringify(specifier)}`
    );
  }
  if (cleanSpecifier.startsWith("file:")) return new URL(cleanSpecifier);
  return null;
}

async function createExternalModule(specifier, referencingPath, cache) {
  const require = createRequire(pathToFileURL(referencingPath));
  const resolvedSpecifier = specifier.startsWith("node:") ? specifier : pathToFileURL(require.resolve(specifier)).href;
  if (cache.has(resolvedSpecifier)) return cache.get(resolvedSpecifier);

  const namespace = await import(resolvedSpecifier);
  const exportNames = Object.keys(namespace);
  const module = new vm.SyntheticModule(
    exportNames,
    function initializeExports() {
      for (const exportName of exportNames) this.setExport(exportName, namespace[exportName]);
    },
    { identifier: resolvedSpecifier }
  );
  cache.set(resolvedSpecifier, module);
  return module;
}

async function linkJavaScriptModules({ root = repoRoot, files = collectJavaScriptFiles(root) } = {}) {
  if (typeof vm.SourceTextModule !== "function") {
    throw new Error("JavaScript module linking requires Node's --experimental-vm-modules flag");
  }

  const modules = new Map();
  const pathsByIdentifier = new Map();
  const sourcesByPath = new Map();
  const externalModules = new Map();

  const loadModule = async (filePath) => {
    const normalizedPath = path.resolve(filePath instanceof URL ? fileURLToPath(filePath) : filePath);
    if (modules.has(normalizedPath)) return modules.get(normalizedPath);
    if (!fs.existsSync(normalizedPath)) {
      throw new Error(`Cannot resolve local module ${path.relative(root, normalizedPath)}`);
    }

    const identifier = pathToFileURL(normalizedPath).href;
    const source = fs.readFileSync(normalizedPath, "utf8");
    const module = new vm.SourceTextModule(source, {
      identifier,
      initializeImportMeta(meta) {
        meta.url = identifier;
      },
    });
    modules.set(normalizedPath, module);
    pathsByIdentifier.set(identifier, normalizedPath);
    sourcesByPath.set(normalizedPath, source);
    return module;
  };

  const linker = async (specifier, referencingModule) => {
    const referencingPath = pathsByIdentifier.get(referencingModule.identifier);
    const localPath = resolveLocalImport(specifier, referencingPath, root);
    if (localPath) return loadModule(localPath);
    return createExternalModule(specifier, referencingPath, externalModules);
  };

  for (const filePath of files) await loadModule(filePath);
  for (const module of modules.values()) {
    if (module.status === "unlinked") await module.link(linker);
  }

  let dynamicImportCount = 0;
  for (const [referencingPath, source] of sourcesByPath) {
    for (const { specifier, line } of collectLiteralDynamicImports(source, path.relative(root, referencingPath))) {
      try {
        await linker(specifier, { identifier: pathToFileURL(referencingPath).href });
        dynamicImportCount += 1;
      } catch (error) {
        throw new Error(
          `${path.relative(root, referencingPath)}:${line} cannot resolve dynamic import ${JSON.stringify(specifier)}: ${error.message}`
        );
      }
    }
  }

  return { dynamicImportCount, fileCount: files.length, moduleCount: modules.size };
}

async function main() {
  const result = await linkJavaScriptModules();
  console.log(
    `Linked ${result.moduleCount} first-party JavaScript modules from ${result.fileCount} source files and resolved ${result.dynamicImportCount} literal dynamic imports.`
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

export { collectJavaScriptFiles, collectLiteralDynamicImports, linkJavaScriptModules, resolveLocalImport };
