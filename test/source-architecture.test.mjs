import assert from "node:assert/strict";
import { parse } from "acorn";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executableExtensions = new Set([".cjs", ".js", ".mjs", ".ps1", ".py"]);
const sourceRoots = [".github/", "config/", "deploy/", "scripts/", "services/", "sites/", "test/"];
const maximumModuleLines = 850;
const maximumCompositionRootLines = 300;
const maximumBrowserEntrypointLines = 700;
const ignoredDirectoryNames = new Set([
  ".runtime",
  ".venv",
  "__pycache__",
  "bin",
  "build",
  "coverage",
  "data",
  "data_server",
  "dist",
  "logs",
  "node_modules",
  "obj",
]);
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ps1",
  ".py",
  ".svg",
  ".yaml",
  ".yml",
]);

const sizeExemptions = new Map([
  [
    "services/altered/src/services/legacyAlterationRegexCatalog.js",
    "declarative compatibility catalog; it contains no service orchestration",
  ],
  [
    "sites/learn.xjk.yt/frontend/scripts/mock-data.js",
    "development-only lesson fixture catalog; records are intentionally colocated for deterministic mock generation",
  ],
]);

function repositoryFiles() {
  const files = [];
  const visit = (relativeDirectory) => {
    const absoluteDirectory = path.join(repoRoot, relativeDirectory);
    let entries = [];
    try {
      entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory.replaceAll("\\", "/"), entry.name);
      if (
        entry.isDirectory() &&
        (ignoredDirectoryNames.has(entry.name) ||
          entry.name.startsWith("tmp") ||
          entry.name.startsWith("tools-backup") ||
          /^sites\/tools\.xjk\.yt\/[^/]+\/tools(?:\/|$)/.test(relativePath) ||
          relativePath === "sites/tools.xjk.yt/.runtime-licenses")
      ) {
        continue;
      }
      if (
        entry.isFile() &&
        [".local-pids.json", ".localhost-browser-proxy-settings.json", ".localhost-browser-proxy.json"].includes(
          entry.name
        )
      ) {
        continue;
      }
      if (entry.isDirectory()) visit(relativePath);
      else if (entry.isFile()) files.push(relativePath);
    }
  };

  for (const sourceRoot of sourceRoots) visit(sourceRoot.slice(0, -1));
  return files.sort();
}

function sourceLineCount(relativePath) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
  return source.length === 0 ? 0 : source.split(/\r?\n/).length;
}

function executableSourceFiles() {
  return repositoryFiles().filter((file) => executableExtensions.has(path.extname(file)));
}

let discoveredHtmlEntrypoints;

function htmlBrowserEntrypoints() {
  if (discoveredHtmlEntrypoints) return discoveredHtmlEntrypoints;

  discoveredHtmlEntrypoints = new Set();
  const scriptSourcePattern = /<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi;
  for (const htmlFile of repositoryFiles().filter((file) => path.extname(file) === ".html")) {
    const source = fs.readFileSync(path.join(repoRoot, htmlFile), "utf8");
    for (const match of source.matchAll(scriptSourcePattern)) {
      const entrypoint = resolveHtmlScriptReference(htmlFile, match[2]);
      if (entrypoint) discoveredHtmlEntrypoints.add(entrypoint);
    }
  }

  return discoveredHtmlEntrypoints;
}

function resolveHtmlScriptReference(htmlFile, scriptSource) {
  const source = String(scriptSource || "")
    .split(/[?#]/, 1)[0]
    .replaceAll("\\", "/");
  if (!source || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(source)) return "";

  let candidate;
  if (source.startsWith("/shared/")) {
    candidate = path.posix.join("sites", source.slice(1));
  } else if (source.startsWith("/")) {
    const frontendRoot = htmlFile.match(/^(sites\/.+?\/frontend)(?:\/|$)/)?.[1];
    if (!frontendRoot) return "";
    candidate = path.posix.join(frontendRoot, source.slice(1));
  } else {
    candidate = path.posix.normalize(path.posix.join(path.posix.dirname(htmlFile), source));
  }

  if (!candidate.startsWith("sites/") || ![".cjs", ".js", ".mjs"].includes(path.extname(candidate))) return "";
  return fs.existsSync(path.join(repoRoot, candidate)) ? candidate : "";
}

function isBrowserEntrypoint(file) {
  if (htmlBrowserEntrypoints().has(file)) return true;
  if (!/^sites\/.+\/frontend\/(?:.+\/)?[^/]+\.(?:cjs|js|mjs)$/.test(file)) return false;

  const basename = path.basename(file, path.extname(file));
  return basename === "app" || basename.endsWith("-app");
}

function isServerCompositionRoot(file) {
  return /(?:^|\/)server\.(?:cjs|js|mjs|py)$/.test(file);
}

function isDeploymentCompositionRoot(file) {
  return file === "deploy/server/ecosystem.config.cjs";
}

function isServiceDomainFacade(file) {
  const match = file.match(/^services\/([^/]+)\/src\/(?:repositories|services)\/([^/]+)\.(?:cjs|js|mjs)$/);
  if (!match) return false;

  const serviceName = match[1].replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
  const moduleName = match[2].replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
  return moduleName === `${serviceName}repository` || moduleName === `${serviceName}service`;
}

function isSplitModuleFacade(file) {
  if (![".cjs", ".js", ".mjs"].includes(path.extname(file))) return false;

  const moduleDirectory = path.join(repoRoot, path.dirname(file), path.basename(file, path.extname(file)));
  if (!fs.existsSync(moduleDirectory) || !fs.statSync(moduleDirectory).isDirectory()) return false;
  return fs
    .readdirSync(moduleDirectory, { withFileTypes: true })
    .some((entry) => entry.isFile() && [".cjs", ".js", ".mjs"].includes(path.extname(entry.name)));
}

function isModuleBarrel(file) {
  return /(?:^|\/)index\.(?:cjs|js|mjs)$/.test(file);
}

const compositionRootPolicies = [
  {
    category: "deployment composition root",
    maximumLines: maximumCompositionRootLines,
    matches: isDeploymentCompositionRoot,
  },
  {
    category: "server entrypoint",
    maximumLines: maximumCompositionRootLines,
    matches: isServerCompositionRoot,
  },
  {
    category: "service-domain facade",
    maximumLines: maximumCompositionRootLines,
    matches: isServiceDomainFacade,
  },
  {
    category: "split-module facade",
    maximumLines: maximumCompositionRootLines,
    matches: isSplitModuleFacade,
  },
  {
    category: "module barrel",
    maximumLines: maximumCompositionRootLines,
    matches: isModuleBarrel,
  },
  {
    category: "browser app entrypoint",
    maximumLines: maximumBrowserEntrypointLines,
    matches: isBrowserEntrypoint,
  },
];

test("executable source modules stay below the project size ceiling", () => {
  const oversized = executableSourceFiles()
    .map((file) => ({ file, lines: sourceLineCount(file) }))
    .filter(({ file, lines }) => lines > maximumModuleLines && !sizeExemptions.has(file));

  assert.deepEqual(
    oversized,
    [],
    `modules above ${maximumModuleLines} lines must be split by responsibility or receive a documented declarative exemption`
  );
});

test("composition roots stay thinner than their implementation modules", () => {
  const violations = executableSourceFiles().flatMap((file) => {
    const lines = sourceLineCount(file);
    return compositionRootPolicies
      .filter(({ matches }) => matches(file))
      .filter(({ maximumLines }) => lines > maximumLines)
      .map(({ category, maximumLines }) => ({ category, file, lines, maximumLines }));
  });

  assert.deepEqual(
    violations,
    [],
    "entrypoints, barrels, and composition facades should wire focused modules rather than own domain behavior"
  );
});

test("browser entrypoint policy recognizes app roots and direct HTML scripts", () => {
  const entrypoints = [
    "sites/example.xjk.yt/frontend/app.js",
    "sites/example.xjk.yt/frontend/admin/public-app.js",
    "sites/example.xjk.yt/frontend/runtime/account-app.mjs",
  ];
  const implementationModules = [
    "sites/example.xjk.yt/frontend/application.js",
    "sites/example.xjk.yt/frontend/app/controller.js",
    "services/example/app.js",
  ];

  entrypoints.forEach((file) => assert.equal(isBrowserEntrypoint(file), true, file));
  implementationModules.forEach((file) => assert.equal(isBrowserEntrypoint(file), false, file));

  const htmlEntrypoints = [...htmlBrowserEntrypoints()];
  assert.ok(htmlEntrypoints.length > 0, "the repository should contain browser scripts referenced by HTML");
  assert.ok(
    htmlEntrypoints.some((file) => !/(?:^|\/)(?:app|[^/]+-app)\.(?:cjs|js|mjs)$/.test(file)),
    "named page scripts must not evade entrypoint limits"
  );
  htmlEntrypoints.forEach((file) => assert.ok(fs.existsSync(path.join(repoRoot, file)), file));
});

test("split-module facade policy ignores same-named asset directories", () => {
  assert.equal(isSplitModuleFacade("services/altered/src/services/mapNameStandardizer.js"), true);
  assert.equal(isSplitModuleFacade("sites/tools.xjk.yt/shared/tool-theme.js"), false);
});

test("Altered ingestion owns one shared map normalization and upsert primitive", () => {
  const facade = fs.readFileSync(
    path.join(repoRoot, "services/altered/src/repositories/alteredIngestionRepository.js"),
    "utf8"
  );
  const ingestionModules = ["hookSnapshot.js", "projectSourceSnapshot.js"].map((file) =>
    fs.readFileSync(path.join(repoRoot, "services/altered/src/repositories/alteredIngestion", file), "utf8")
  );
  assert.equal(
    ingestionModules.reduce((count, source) => count + [...source.matchAll(/createMapRecordUpserter\(/g)].length, 0),
    2,
    "both ingestion paths should construct the shared primitive"
  );
  ingestionModules.forEach((source) => assert.doesNotMatch(source, /INSERT INTO altered_maps/));
  assert.doesNotMatch(facade, /createMapRecordUpserter|INSERT INTO altered_maps/);
});

test("large-module exemptions remain explicit and declarative", () => {
  for (const [file, reason] of sizeExemptions) {
    assert.ok(reason.length >= 64, `${file} needs a meaningful exemption rationale`);
    assert.ok(fs.existsSync(path.join(repoRoot, file)), `stale size exemption: ${file}`);
    assert.ok(sourceLineCount(file) > maximumModuleLines, `${file} no longer needs a large-module exemption`);

    const source = fs.readFileSync(path.join(repoRoot, file), "utf8");
    const program = parse(source, { ecmaVersion: "latest", sourceType: "module" });
    const unexpectedTopLevelStatements = program.body.filter((statement) => {
      if (statement.type === "ExportDefaultDeclaration" && statement.declaration.type === "Identifier") return false;
      const node = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
      return node && !["FunctionDeclaration", "ImportDeclaration", "VariableDeclaration"].includes(node.type);
    });
    assert.deepEqual(
      unexpectedTopLevelStatements.map((statement) => statement.type),
      [],
      `${file} may only contain declarations and imports at module scope`
    );
  }
});

test("HTML pages do not embed executable source", () => {
  const inlineScripts = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/giu;
  for (const file of repositoryFiles().filter((candidate) => path.extname(candidate) === ".html")) {
    const source = fs.readFileSync(path.join(repoRoot, file), "utf8");
    for (const match of source.matchAll(scriptPattern)) {
      const attributes = match[1] || "";
      const body = (match[2] || "").trim();
      if (!body || /\bsrc\s*=/iu.test(attributes)) continue;

      const type =
        attributes
          .match(/\btype\s*=\s*(["'])(.*?)\1/iu)?.[2]
          ?.trim()
          .toLowerCase() || "";
      if (type && !["module", "text/javascript", "application/javascript"].includes(type)) continue;
      inlineScripts.push(file);
    }
  }

  assert.deepEqual(inlineScripts, [], "executable browser code belongs in linted, testable source modules");
});

test("the default Node test root contains only test modules", () => {
  const discoveredNonTests = repositoryFiles()
    .filter((file) => file.startsWith("test/"))
    .filter((file) => [".cjs", ".js", ".mjs"].includes(path.extname(file)))
    .filter((file) => !/\.test\.(?:cjs|js|mjs)$/.test(file));

  assert.deepEqual(
    discoveredNonTests,
    [],
    "runtime fixtures and helpers must live outside test/, which Node recursively executes by default"
  );
});

test("repository text sources use UTF-8 without byte-order marks", () => {
  const filesWithBom = repositoryFiles()
    .filter((file) => textExtensions.has(path.extname(file)) || file.endsWith(".env.example"))
    .filter((file) => {
      const bytes = fs.readFileSync(path.join(repoRoot, file));
      return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    });

  assert.deepEqual(filesWithBom, [], "text encoding is defined by .editorconfig as BOM-free UTF-8");
});

test("repository text sources use LF line endings", () => {
  const filesWithCrLf = repositoryFiles()
    .filter((file) => textExtensions.has(path.extname(file)) || file.endsWith(".env.example"))
    .filter((file) => fs.readFileSync(path.join(repoRoot, file), "utf8").includes("\r\n"));

  assert.deepEqual(filesWithCrLf, [], "line endings are defined by .editorconfig and .gitattributes as LF");
});
