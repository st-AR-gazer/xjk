import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { getAccountWidgetSrc } from "../sites/shared/xjk-core/site-runtime.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const xjkCore = path.join(repoRoot, "sites/shared/xjk-core");

function readCoreAsset(name) {
  return fs.readFileSync(path.join(xjkCore, name), "utf8");
}

function readStyleVersion(source, label) {
  const version = source.match(/const STYLE_VERSION\s*=\s*"([^"]+)"/)?.[1];
  assert.ok(version, `${label} is missing its STYLE_VERSION`);
  return version;
}

function readImportVersion(source, asset, label) {
  const escapedAsset = asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const version = source.match(new RegExp(`(?:\\./)?${escapedAsset}\\?v=([^"']+)`))?.[1];
  assert.ok(version, `${label} must import ${asset} with a cache version`);
  return version;
}

test("shared chrome loaders use the renderer-owned asset versions", () => {
  const topbar = readCoreAsset("topbar.js");
  const sidenav = readCoreAsset("sidenav.js");
  const visibility = readCoreAsset("chrome-visibility.js");
  const topbarLoader = readCoreAsset("topbar-loader.js");
  const sidenavBoot = readCoreAsset("sidenav-boot.js");

  assert.equal(readImportVersion(topbarLoader, "topbar.js", "topbar-loader.js"), readStyleVersion(topbar, "topbar.js"));
  assert.equal(
    readImportVersion(sidenavBoot, "sidenav.js", "sidenav-boot.js"),
    readStyleVersion(sidenav, "sidenav.js")
  );
  assert.equal(
    readImportVersion(topbarLoader, "chrome-visibility.js", "topbar-loader.js"),
    readStyleVersion(visibility, "chrome-visibility.js")
  );
  assert.equal(
    readImportVersion(sidenavBoot, "chrome-visibility.js", "sidenav-boot.js"),
    readStyleVersion(visibility, "chrome-visibility.js")
  );
  assert.match(getAccountWidgetSrc(), /^\/shared\/xjk-core\/xjk-account-widget\.js\?v=\d+$/);
});

test("one loader owns account and search startup while both loaders remain iframe-safe", () => {
  const topbarLoader = readCoreAsset("topbar-loader.js");
  const sidenavBoot = readCoreAsset("sidenav-boot.js");
  const runtime = readCoreAsset("site-runtime.js");
  const globalSearch = readCoreAsset("global-search.js");
  const toolTheme = fs.readFileSync(path.join(repoRoot, "sites/tools.xjk.yt/shared/tool-theme.js"), "utf8");

  assert.match(topbarLoader, /mountTopbar/);
  assert.match(topbarLoader, /loadGlobalSearch/);
  assert.match(topbarLoader, /loadAccountWidgetScript/);
  assert.match(topbarLoader, /mountChromeVisibility/);
  assert.match(sidenavBoot, /mountSidenav/);
  assert.match(sidenavBoot, /mountChromeVisibility/);
  assert.match(topbarLoader, /globalThis\.self === globalThis\.top/);
  assert.match(sidenavBoot, /globalThis\.self === globalThis\.top/);
  assert.doesNotMatch(runtime, /function ensureGlobalTopbar/);
  assert.doesNotMatch(globalSearch, /ensureGlobalTopbar/);
  assert.doesNotMatch(toolTheme, /global-search\.js/);
});

test("shared chrome styles retain their prepaint and viewport layout boundaries", () => {
  const prepaint = readCoreAsset("chrome-prepaint.css");
  const topbar = readCoreAsset("topbar.css");
  const sidenav = readCoreAsset("sidenav.css");
  const visibility = readCoreAsset("chrome-visibility.css");
  const accountWidget = readCoreAsset("account-widget.css");

  assert.match(
    prepaint,
    /html:not\(\.xjk-topbar-ready\)[\s\S]*?--xjk-chrome-prepaint-visibility:\s*hidden[\s\S]*?visibility:\s*var\(--xjk-chrome-prepaint-visibility\)[\s\S]*?3s\s+forwards/
  );
  assert.match(
    prepaint,
    /html:not\(\.xjk-sidenav-ready\)[\s\S]*?\.xjk-sidenav[\s\S]*?visibility:\s*var\(--xjk-chrome-prepaint-visibility\)[\s\S]*?3s\s+forwards/
  );
  assert.match(
    topbar,
    /html\.xjk-has-sidenav\s+\.xjk-global-topbar\s*\{[^}]*width:\s*calc\(100%\s*\+\s*var\(--xjk-sidenav-w\)\)[^}]*margin-left:\s*calc\(-1\s*\*\s*var\(--xjk-sidenav-w\)\)/s
  );
  assert.match(topbar, /\.xjk-global-topbar\s*\{[^}]*min-height:\s*59px\s*!important[^}]*height:\s*59px\s*!important/s);
  assert.match(topbar, /\.xjk-global-topbar\s*\{[^}]*pointer-events:\s*auto\s*!important/s);
  assert.match(
    topbar,
    /\.xjk-global-topbar\[data-xjk-topbar-position="viewport"\]\s*\{[^}]*position:\s*fixed\s*!important[^}]*left:\s*0\s*!important[^}]*right:\s*0\s*!important/s
  );
  assert.match(sidenav, /\.xjk-sidenav\s*\{[^}]*top:\s*59px/s);
  assert.match(
    sidenav,
    /html\.xjk-has-sidenav\s+body\s*\{[^}]*margin:\s*0[^}]*padding-left:\s*var\(--xjk-sidenav-w\)/s
  );
  assert.match(
    visibility,
    /html\[data-xjk-chrome-scroll-reveal="hidden"\]\s+\.xjk-global-topbar,[\s\S]*?transition-delay:\s*0s,\s*0s,\s*240ms/s
  );
  assert.match(accountWidget, /\.xjk-account-widget\s*\{/);
});

test("integration shims preserve shared identity links and asset paths", () => {
  const learnRouter = fs.readFileSync(path.join(repoRoot, "sites/learn.xjk.yt/frontend/scripts/router.js"), "utf8");
  const alteredPaths = fs.readFileSync(path.join(repoRoot, "sites/altered.xjk.yt/frontend/altered-paths.js"), "utf8");
  const validifierPaths = fs.readFileSync(
    path.join(repoRoot, "sites/validifier.xjk.yt/frontend/validifier-paths.js"),
    "utf8"
  );

  assert.match(learnRouter, /anchor\.hasAttribute\("data-xjk-site-link"\)/);
  assert.match(alteredPaths, /\[data-xjk-site-link\]/);
  assert.match(alteredPaths, /startsWith\("\/shared\/"\)/);
  assert.match(validifierPaths, /startsWith\("\/shared\/xjk-core\/"\)/);
});
