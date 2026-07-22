import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = path.join(repoRoot, "sites", "altered.xjk.yt", "frontend");

function collectHtml(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectHtml(absolutePath);
    return entry.isFile() && entry.name.endsWith(".html") ? [absolutePath] : [];
  });
}

function label(file) {
  return path.relative(repoRoot, file).replaceAll(path.sep, "/");
}

function assetBase(file) {
  // endpoint.html is served at /api/endpoints/:key, so its relative asset
  // base is intentionally one virtual directory deeper than its disk path.
  if (path.basename(file) === "endpoint.html" && path.basename(path.dirname(file)) === "api") {
    return path.join(frontendRoot, "api", "endpoints");
  }
  return path.dirname(file);
}

const htmlFiles = collectHtml(frontendRoot);
assert.equal(htmlFiles.length, 16, "unexpected Altered HTML page inventory");

for (const file of htmlFiles) {
  const source = fs.readFileSync(file, "utf8");
  const fileLabel = label(file);
  assert.match(source, /<meta\s+name=["']viewport["'][^>]*>/i, `${fileLabel} must declare a mobile viewport`);

  const assetTags = source.matchAll(/<(?:link|script|img|source)\b[^>]*?\b(?:href|src)=["']([^"']+)["'][^>]*>/gi);
  for (const match of assetTags) {
    const rawUrl = match[1].trim();
    if (!rawUrl || rawUrl.startsWith("#") || rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(rawUrl) || rawUrl.startsWith("//")) continue;

    const cleanUrl = rawUrl.split(/[?#]/, 1)[0];
    if (!cleanUrl) continue;

    if (cleanUrl.startsWith("/")) {
      assert.ok(cleanUrl.startsWith("/shared/"), `${fileLabel} uses path-mode-unsafe root asset ${rawUrl}`);
      const sharedTarget = path.join(repoRoot, "sites", cleanUrl.replace(/^\/+/, ""));
      assert.ok(fs.existsSync(sharedTarget), `${fileLabel} references missing shared asset ${rawUrl}`);
      continue;
    }

    const target = path.resolve(assetBase(file), cleanUrl);
    assert.ok(fs.existsSync(target), `${fileLabel} references missing local asset ${rawUrl}`);
  }
}

console.log(`Altered assets ok: ${htmlFiles.length} HTML pages use deployment-neutral local paths`);
