import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { readPlatformManifest, repoRoot } from "./lib/platform-manifest.mjs";

const supportedExtensions = new Set([".css", ".html", ".js", ".mjs"]);
const versionedAssetExtensions = new Set([
  ".css",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".mjs",
  ".png",
  ".svg",
  ".webp",
  ".woff",
  ".woff2",
]);
const ignoredDirectories = new Set([".venv", "data", "data_server", "node_modules"]);

function appendAssetVersion(rawUrl, assetVersion) {
  const value = String(rawUrl || "").trim();
  if (
    !value ||
    value.startsWith("#") ||
    value.startsWith("//") ||
    value.startsWith("/api/") ||
    /^[a-z][a-z\d+.-]*:/iu.test(value)
  ) {
    return value;
  }

  const [withoutHash, ...hashParts] = value.split("#");
  const hash = hashParts.length ? `#${hashParts.join("#")}` : "";
  const pathname = withoutHash.split("?")[0];
  if (!versionedAssetExtensions.has(path.posix.extname(pathname).toLowerCase())) return value;

  const canonicalToken = `v=${assetVersion}`;
  if (/[?&]v=[^&#]*/iu.test(withoutHash)) {
    return `${withoutHash.replace(/([?&])v=[^&#]*/giu, `$1${canonicalToken}`)}${hash}`;
  }
  return `${withoutHash}${withoutHash.includes("?") ? "&" : "?"}${canonicalToken}${hash}`;
}

function normalizeHtmlAssetReferences(source, assetVersion) {
  return source.replace(
    /(<(?:img|link|script)\b[^>]*?\b(?:href|src)\s*=\s*)(["'])([^"']+)\2/giu,
    (match, prefix, quote, value) => `${prefix}${quote}${appendAssetVersion(value, assetVersion)}${quote}`
  );
}

function normalizeSource(source, extension, assetVersion) {
  let normalized = source.replace(/([?&])v=[A-Za-z0-9._-]+/g, `$1v=${assetVersion}`);
  normalized = normalized
    .replace(/const STYLE_VERSION\s*=\s*"[A-Za-z0-9._-]+"/g, `const STYLE_VERSION = "${assetVersion}"`)
    .replace(/const styleVersion\s*=\s*"[A-Za-z0-9._-]+"/g, `const styleVersion = "${assetVersion}"`);
  return extension === ".html" ? normalizeHtmlAssetReferences(normalized, assetVersion) : normalized;
}

function listStaticSourceFiles(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "EACCES" || error?.code === "EPERM") return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && (ignoredDirectories.has(entry.name) || entry.name.startsWith("tmp"))) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listStaticSourceFiles(entryPath));
    else if (entry.isFile() && supportedExtensions.has(path.extname(entry.name))) files.push(entryPath);
  }
  return files;
}

function main({ write = process.argv.includes("--write") } = {}) {
  const assetVersion = readPlatformManifest().assetVersion;
  const expectedToken = `?v=${assetVersion}`;
  const staticSourceFiles = [path.join(repoRoot, "sites"), path.join(repoRoot, "services")].flatMap(
    listStaticSourceFiles
  );
  const changed = [];

  for (const filePath of staticSourceFiles) {
    const source = readFileSync(filePath, "utf8");
    const normalized = normalizeSource(source, path.extname(filePath), assetVersion);
    if (normalized === source) continue;
    changed.push(path.relative(repoRoot, filePath).replaceAll("\\", "/"));
    if (write) writeFileSync(filePath, normalized, "utf8");
  }

  if (changed.length && !write) {
    console.error(
      `Found ${changed.length} file${changed.length === 1 ? "" : "s"} with missing or stale asset versions:`
    );
    for (const file of changed) console.error(`- ${file}`);
    console.error("Run npm run assets:version to normalize them.");
    process.exitCode = 1;
    return changed;
  }

  console.log(
    changed.length
      ? `Normalized asset version ${expectedToken} in ${changed.length} file${changed.length === 1 ? "" : "s"}.`
      : `All first-party HTML assets and existing source tokens use ${expectedToken}.`
  );
  return changed;
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (entryPath === import.meta.url) main();

export { appendAssetVersion, main, normalizeHtmlAssetReferences, normalizeSource };
