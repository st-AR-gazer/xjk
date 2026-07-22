import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Linter } from "eslint";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commonJsGlobals = new Set(["__dirname", "__filename", "exports", "module", "require"]);
const ignoredDirectories = new Set([
  ".git",
  ".runtime",
  ".venv",
  "build",
  "coverage",
  "data",
  "data_server",
  "dist",
  "generated",
  "node_modules",
  "vendor",
]);

function nearestPackageType(filePath, boundary = repoRoot) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mjs") return "module";
  if (extension === ".cjs") return "commonjs";

  const resolvedBoundary = path.resolve(boundary);
  let directory = path.dirname(path.resolve(filePath));
  while (directory === resolvedBoundary || directory.startsWith(`${resolvedBoundary}${path.sep}`)) {
    const packagePath = path.join(directory, "package.json");
    if (fs.existsSync(packagePath)) {
      const manifest = JSON.parse(fs.readFileSync(packagePath, "utf8"));
      return manifest.type === "module" ? "module" : "commonjs";
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return "commonjs";
}

function commonJsGlobalReferences(source, filename = "entry.js") {
  const linter = new Linter();
  return linter
    .verify(
      source,
      [
        {
          languageOptions: { ecmaVersion: "latest", sourceType: "module" },
          rules: { "no-undef": "error" },
        },
      ],
      { filename }
    )
    .filter((message) => message.ruleId === "no-undef")
    .map((message) => ({
      ...message,
      name: message.message.match(/^'([^']+)' is not defined\.$/)?.[1] || "",
    }))
    .filter((message) => commonJsGlobals.has(message.name));
}

function collectJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name) || entry.name.startsWith("tmp")) return [];
      return collectJavaScriptFiles(absolutePath);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [absolutePath] : [];
  });
}

function nodeJavaScriptFiles() {
  const files = ["services", "scripts", "deploy", "config", "test"].flatMap((directory) =>
    collectJavaScriptFiles(path.join(repoRoot, directory))
  );
  const sitesRoot = path.join(repoRoot, "sites");
  for (const file of collectJavaScriptFiles(sitesRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll(path.sep, "/");
    if (relative.includes("/backend/") || relative.startsWith("sites/learn.xjk.yt/tools/")) files.push(file);
  }
  return [...new Set(files)];
}

test("CommonJS-global analysis ignores comments, strings, properties, and local bindings", () => {
  assert.deepEqual(
    commonJsGlobalReferences(`
      const text = "require module.exports";
      const require = (value) => value;
      const module = { exports: {} };
      require(text);
      module.exports = { require: true };
    `),
    []
  );
  assert.deepEqual(
    commonJsGlobalReferences('require("node:http"); module.exports = {};').map(({ name }) => name),
    ["require", "module"]
  );
});

test("Node .js files in module packages do not depend on CommonJS globals", () => {
  const proxyEntry = path.join(repoRoot, "deploy/local/localhost-browser-proxy.js");
  const files = nodeJavaScriptFiles().filter((file) => nearestPackageType(file) === "module");
  assert.ok(files.includes(proxyEntry), "the localhost browser proxy must remain covered by the ESM entrypoint audit");
  assert.equal(nearestPackageType(proxyEntry), "module");

  const failures = files.flatMap((file) =>
    commonJsGlobalReferences(fs.readFileSync(file, "utf8"), file).map(
      (message) =>
        `${path.relative(repoRoot, file).replaceAll(path.sep, "/")}:${message.line}:${message.column} uses CommonJS global ${message.name}`
    )
  );
  assert.deepEqual(failures, [], `ESM entrypoint format failures:\n${failures.join("\n")}`);
});
