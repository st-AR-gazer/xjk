import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { stylesheetBundles } from "../scripts/lib/stylesheet-bundles.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const maximumModuleLines = 700;
const maximumAuthoredStylesheetLines = 700;
const assetVersion = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "config/platform-manifest.json"), "utf8")
).assetVersion;
const surfaceFoundationHref = `/shared/xjk-core/surface-foundation.css?v=${assetVersion}`;
const surfaceFoundationConsumers = [
  ["sites/console.xjk.yt/frontend/index.html", `./styles/foundation.css?v=${assetVersion}`],
  ["sites/console.xjk.yt/frontend/bingo/index.html", `../styles/foundation.css?v=${assetVersion}`],
  ["sites/console.xjk.yt/frontend/coming-soon/index.html", `../styles/foundation.css?v=${assetVersion}`],
  ["sites/console.xjk.yt/frontend/rmc/index.html", `../styles/foundation.css?v=${assetVersion}`],
  ["sites/console.xjk.yt/frontend/rms/index.html", `../styles/foundation.css?v=${assetVersion}`],
  ["sites/console.xjk.yt/frontend/rmt/index.html", `../styles/foundation.css?v=${assetVersion}`],
  ["sites/plugins.xjk.yt/Plugins-Hub/frontend/index.html", `styles.css?v=${assetVersion}`],
  ["sites/tools.xjk.yt/Tools-Hub/frontend/index.html", `styles.css?v=${assetVersion}`],
  ["sites/trackers.xjk.yt/frontend/index.html", `/trackers-shell/styles/foundation.css?v=${assetVersion}`],
  ...[
    "Clip-To-Ghost",
    "Embed-RaceValidationGhost",
    "Embedded-Blocks-And-Items-Checker",
    "Extract-Replay-Data",
    "Gbx-Medal-Time-Modifier",
    "Map-Validation-Checker",
    "Replay-Verification",
    "Strip-RaceValidationGhost",
    "Underwater-Map-Converter",
  ].map((tool) => [
    `sites/tools.xjk.yt/${tool}/frontend/index.html`,
    `../shared/tool-theme/foundation.css?v=${assetVersion}`,
  ]),
];

function sourceLineCount(relativePath) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
  return source.length === 0 ? 0 : source.split(/\r?\n/).length;
}

function stylesheetHrefs(html) {
  return [...html.matchAll(/<link\b[^>]*>/giu)]
    .map(([tag]) => {
      const relation = tag.match(/\brel=["']([^"']+)["']/iu)?.[1] ?? "";
      const href = tag.match(/\bhref=["']([^"']+)["']/iu)?.[1] ?? "";
      return relation.split(/\s+/u).includes("stylesheet") ? href : "";
    })
    .filter(Boolean);
}

function pageRelativeHref(page, stylesheet, pageDirectory = path.posix.dirname(page)) {
  const relativePath = path.posix.relative(pageDirectory, stylesheet);
  const href = relativePath.startsWith("../") ? relativePath : `./${relativePath}`;
  return `${href}?v=${assetVersion}`;
}

function bundleStylesheetHref(bundle, page, stylesheet) {
  if (!bundle.publicRoot || !bundle.publicPath) {
    return pageRelativeHref(page, stylesheet, bundle.pageDirectories?.[page]);
  }
  const publicRelativePath = path.posix.relative(bundle.publicRoot, stylesheet);
  assert.ok(
    publicRelativePath && !publicRelativePath.startsWith("../"),
    `${bundle.label} stylesheet escaped its declared public root: ${stylesheet}`
  );
  return `${bundle.publicPath.replace(/\/$/u, "")}/${publicRelativePath}?v=${assetVersion}`;
}

function* walkStylesheets(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", "coverage"].includes(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walkStylesheets(absolutePath);
    } else if (entry.isFile() && entry.name.endsWith(".css")) {
      yield absolutePath;
    }
  }
}

test("modular stylesheet bundles stay ordered, direct, and bounded", () => {
  assert.equal(
    new Set(stylesheetBundles.map(({ id }) => id)).size,
    stylesheetBundles.length,
    "stylesheet bundle ids must be unique"
  );

  for (const bundle of stylesheetBundles) {
    const retiredMonoliths = bundle.retiredMonoliths || [bundle.retiredMonolith];
    for (const retiredMonolith of retiredMonoliths) {
      assert.equal(
        fs.existsSync(path.join(repoRoot, retiredMonolith)),
        false,
        `${bundle.label} must not recreate retired stylesheet ${retiredMonolith}`
      );
    }

    const { pages } = bundle;
    assert.ok(Array.isArray(pages) && pages.length > 0, `${bundle.label} must declare its consuming pages`);
    assert.equal(new Set(pages).size, pages.length, `${bundle.label} repeats a page declaration`);

    for (const page of pages) {
      const html = fs.readFileSync(path.join(repoRoot, page), "utf8");
      const linkedStylesheets = stylesheetHrefs(html);
      const expectedHrefs = bundle.stylesheets.map((stylesheet) => bundleStylesheetHref(bundle, page, stylesheet));
      const firstBundleIndex = linkedStylesheets.indexOf(expectedHrefs[0]);
      const actualBundleHrefs = linkedStylesheets.slice(firstBundleIndex, firstBundleIndex + expectedHrefs.length);

      assert.notEqual(firstBundleIndex, -1, `${bundle.label} is missing its first stylesheet module in ${page}`);
      assert.deepEqual(actualBundleHrefs, expectedHrefs, `${bundle.label} stylesheet cascade order changed in ${page}`);
      assert.equal(
        new Set(actualBundleHrefs).size,
        expectedHrefs.length,
        `${bundle.label} repeats a stylesheet link in ${page}`
      );
      for (const retiredMonolith of retiredMonoliths) {
        assert.ok(
          !linkedStylesheets.includes(pageRelativeHref(page, retiredMonolith, bundle.pageDirectories?.[page])),
          `${bundle.label} still links retired stylesheet ${retiredMonolith} in ${page}`
        );
      }
    }

    for (const stylesheet of bundle.stylesheets) {
      const absolutePath = path.join(repoRoot, stylesheet);
      assert.ok(fs.existsSync(absolutePath), `missing ${bundle.label} stylesheet module: ${stylesheet}`);
      assert.ok(
        !retiredMonoliths.includes(stylesheet),
        `${bundle.label} lists retired stylesheet ${stylesheet} as an active module`
      );
      assert.ok(
        sourceLineCount(stylesheet) <= maximumModuleLines,
        `${stylesheet} exceeds the ${maximumModuleLines}-line stylesheet module ceiling`
      );
      assert.doesNotMatch(
        fs.readFileSync(absolutePath, "utf8"),
        /@import\b/iu,
        `${stylesheet} should be linked directly instead of delaying CSS through @import`
      );
    }
  }
});

test("authored stylesheets stay below the source-file ceiling", () => {
  for (const absolutePath of walkStylesheets(path.join(repoRoot, "sites"))) {
    const relativePath = path.relative(repoRoot, absolutePath);
    assert.ok(
      sourceLineCount(relativePath) <= maximumAuthoredStylesheetLines,
      `${relativePath} exceeds the ${maximumAuthoredStylesheetLines}-line authored stylesheet ceiling`
    );
  }
});

test("shared surface styles load once before every local visual layer", () => {
  const surfaceSource = fs.readFileSync(path.join(repoRoot, "sites/shared/xjk-core/surface-foundation.css"), "utf8");
  assert.doesNotMatch(surfaceSource, /@import\b/iu, "the shared surface must remain a direct stylesheet");

  for (const [page, localFoundationHref] of surfaceFoundationConsumers) {
    const html = fs.readFileSync(path.join(repoRoot, page), "utf8");
    const hrefs = stylesheetHrefs(html);
    const sharedIndex = hrefs.indexOf(surfaceFoundationHref);
    const localIndex = hrefs.indexOf(localFoundationHref);

    assert.notEqual(sharedIndex, -1, `${page} is missing the shared surface foundation`);
    assert.equal(
      hrefs.filter((href) => href === surfaceFoundationHref).length,
      1,
      `${page} must load the shared surface foundation exactly once`
    );
    assert.notEqual(localIndex, -1, `${page} is missing its local visual foundation`);
    assert.ok(sharedIndex < localIndex, `${page} must load shared surface rules before local overrides`);
  }
});
