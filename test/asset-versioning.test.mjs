import assert from "node:assert/strict";
import test from "node:test";

import {
  appendAssetVersion,
  normalizeHtmlAssetReferences,
  normalizeSource,
} from "../scripts/normalize-asset-versions.mjs";

test("asset URLs receive one canonical version before their fragment", () => {
  assert.equal(appendAssetVersion("./app.js", "2"), "./app.js?v=2");
  assert.equal(appendAssetVersion("/shared/main.css?theme=dark#top", "2"), "/shared/main.css?theme=dark&v=2#top");
  assert.equal(appendAssetVersion("./app.js?v=old", "2"), "./app.js?v=2");
  assert.equal(appendAssetVersion("https://cdn.example/app.js", "2"), "https://cdn.example/app.js");
  assert.equal(appendAssetVersion("/api/v1/export.js", "2"), "/api/v1/export.js");
});

test("HTML normalization versions local scripts, styles, icons, and images", () => {
  const source = [
    '<link rel="stylesheet" href="./styles.css">',
    '<link rel="icon" href="/favicon.svg?v=old">',
    '<script src="/shared/runtime.js"></script>',
    '<img src="./hero.webp#preview" alt="">',
    '<a href="./download.js">download</a>',
    '<script src="https://cdn.example/runtime.js"></script>',
  ].join("\n");
  const normalized = normalizeHtmlAssetReferences(source, "2");

  assert.match(normalized, /styles\.css\?v=2/u);
  assert.match(normalized, /favicon\.svg\?v=2/u);
  assert.match(normalized, /runtime\.js\?v=2/u);
  assert.match(normalized, /hero\.webp\?v=2#preview/u);
  assert.match(normalized, /<a href="\.\/download\.js">/u);
  assert.match(normalized, /https:\/\/cdn\.example\/runtime\.js/u);
});

test("source normalization updates existing cache tokens consistently", () => {
  assert.equal(normalizeSource('import "./module.js?v=guard-7";\n', ".js", "2"), 'import "./module.js?v=2";\n');
  assert.equal(
    normalizeSource('const url = "./module.js?mode=test&v=old";\n', ".js", "2"),
    'const url = "./module.js?mode=test&v=2";\n'
  );
});
