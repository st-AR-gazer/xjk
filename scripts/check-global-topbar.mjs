import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getChromeConfig } from "../sites/shared/xjk-core/chrome-config.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sitesRoot = path.join(repoRoot, "sites");

const directTrackerRuntimePaths = new Set([
  "sites/trackers.xjk.yt/frontend/__runtime/shared/admin.html",
  "sites/trackers.xjk.yt/frontend/__runtime/shared/admin-login.html",
]);
const iframeOnlyRuntimePaths = new Set([
  "sites/trackers.xjk.yt/frontend/__runtime/shared/index.html",
  "sites/trackers.xjk.yt/frontend/__runtime/displayname/index.html",
  "sites/trackers.xjk.yt/frontend/__runtime/club/index.html",
]);
const sharedChromeAssets = Object.freeze([
  {
    name: "chrome-prepaint.css",
    pattern: /\/shared\/xjk-core\/chrome-prepaint\.css\?v=([^"'&\s>]+)/g,
  },
  {
    name: "topbar-loader.js",
    pattern: /\/shared\/xjk-core\/topbar-loader\.js\?v=([^"'&\s>]+)/g,
  },
  {
    name: "sidenav-boot.js",
    pattern: /\/shared\/xjk-core\/sidenav-boot\.js\?v=([^"'&\s>]+)/g,
  },
]);
const pageSpecificContracts = new Map([
  [
    "sites/account.xjk.yt/frontend/index.html",
    {
      required: [
        {
          pattern: /id="overviewActionNote"[^>]*role="status"[^>]*aria-live="polite"/,
          message: "account logout errors need a live status target",
        },
      ],
    },
  ],
  [
    "sites/archive.xjk.yt/frontend/index.html",
    {
      required: [
        {
          pattern: /<section\s+class="arc-filter"[\s\S]*?<input\s+id="search"/,
          message: "Archive's catalog filter must remain in page content",
        },
      ],
    },
  ],
  [
    "sites/dash.xjk.yt/frontend/index.html",
    {
      required: [
        {
          pattern:
            /<div\s+class="toolbar">[\s\S]*?href="\/dash\/logout"\s+data-xjk-dashboard-logout>Leave dashboard<\/a>/,
          message: "Dash's distinct dashboard-session exit must remain a page action",
        },
      ],
      forbidden: [
        {
          pattern: /<header\s+class="topbar"[\s\S]*?href="\/dash\/logout"[\s\S]*?<\/header>/,
          message: "Dash must not duplicate logout beside the account widget",
        },
      ],
    },
  ],
  [
    "sites/learn.xjk.yt/frontend/index.html",
    {
      forbidden: [
        { pattern: /id="command-palette"/, message: "Learn must use the shared search palette" },
        { pattern: /class="learn-sidebar"/, message: "Learn must use the shared sidenav" },
      ],
    },
  ],
]);

function collectFiles(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name === "node_modules") return [];
    if (entry.isDirectory()) return collectFiles(absolutePath, extension);
    return entry.isFile() && entry.name.endsWith(extension) ? [absolutePath] : [];
  });
}

function relativePath(absolutePath) {
  return path.relative(repoRoot, absolutePath).replaceAll(path.sep, "/");
}

function count(source, pattern) {
  return (source.match(pattern) || []).length;
}

function readTagAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

function tagHasAttribute(tag, name, expectedValue) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`(?:\\s|<)${escapedName}(?:\\s|=|/?>)`, "i").test(tag)) return false;
  return expectedValue === undefined || readTagAttribute(tag, name) === expectedValue;
}

function sourceHasSimpleSelector(source, selector) {
  assert.doesNotMatch(selector, /[>+~\s]/, `unsupported compound selector in chrome config: ${selector}`);
  const tagName = selector.match(/^[a-z][a-z0-9-]*/i)?.[0]?.toLowerCase();
  const id = selector.match(/#([a-z0-9_-]+)/i)?.[1];
  const classes = [...selector.matchAll(/\.([a-z0-9_-]+)/gi)].map((match) => match[1]);
  const attributes = [...selector.matchAll(/\[([a-z0-9_-]+)(?:=["']([^"']*)["'])?\]/gi)].map((match) => [
    match[1],
    match[2],
  ]);

  return [...source.matchAll(/<[a-z][^>]*>/gis)].some(([tag]) => {
    const sourceTagName = tag
      .slice(1)
      .match(/^[a-z][a-z0-9-]*/i)?.[0]
      ?.toLowerCase();
    if (tagName && sourceTagName !== tagName) return false;
    if (id && readTagAttribute(tag, "id") !== id) return false;
    const classNames = new Set(readTagAttribute(tag, "class").split(/\s+/).filter(Boolean));
    if (classes.some((className) => !classNames.has(className))) return false;
    return attributes.every(([name, value]) => tagHasAttribute(tag, name, value));
  });
}

function assertConfiguredSelectorsExist(source, label) {
  const topbarTag = [...source.matchAll(/<script\b[^>]*>/gis)]
    .map((match) => match[0])
    .find((tag) => tag.includes("/shared/xjk-core/topbar-loader.js"));
  assert.ok(topbarTag, `${label} is missing its topbar context tag`);
  const config = getChromeConfig({
    site: readTagAttribute(topbarTag, "data-xjk-topbar"),
    page: readTagAttribute(topbarTag, "data-xjk-page"),
  });

  for (const item of config.sidenav.sections) {
    for (const behavior of ["tab", "focus"]) {
      if (!item[behavior]) continue;
      assert.ok(
        sourceHasSimpleSelector(source, item[behavior]),
        `${label} inherits ${behavior} selector ${item[behavior]} but has no matching element`
      );
    }
  }
}

function assertPageSpecificContract(source, label) {
  const contract = pageSpecificContracts.get(label);
  for (const requirement of contract?.required || []) {
    assert.match(source, requirement.pattern, `${label}: ${requirement.message}`);
  }
  for (const prohibition of contract?.forbidden || []) {
    assert.doesNotMatch(source, prohibition.pattern, `${label}: ${prohibition.message}`);
  }
}

const htmlFiles = collectFiles(sitesRoot, ".html").filter((file) => relativePath(file).includes("/frontend/"));
const trackerRuntimeFiles = htmlFiles.filter((file) =>
  relativePath(file).startsWith("sites/trackers.xjk.yt/frontend/__runtime/")
);
const directTrackerRuntimeFiles = trackerRuntimeFiles.filter((file) =>
  directTrackerRuntimePaths.has(relativePath(file))
);
const iframeOnlyRuntimeFiles = trackerRuntimeFiles.filter((file) => iframeOnlyRuntimePaths.has(relativePath(file)));
const unclassifiedRuntimeFiles = trackerRuntimeFiles.filter(
  (file) => !directTrackerRuntimePaths.has(relativePath(file)) && !iframeOnlyRuntimePaths.has(relativePath(file))
);
const staticPageFiles = htmlFiles.filter((file) => !trackerRuntimeFiles.includes(file));
const bannerAdminTemplateFiles = [
  path.join(repoRoot, "services/bannerbuilder/templates/admin_login.html"),
  path.join(repoRoot, "services/bannerbuilder/templates/admin_list.html"),
];
const pageFiles = [...staticPageFiles, ...directTrackerRuntimeFiles, ...bannerAdminTemplateFiles];
const versionsByAsset = new Map(sharedChromeAssets.map(({ name }) => [name, new Set()]));

assert.equal(staticPageFiles.length, 47, "unexpected static top-level frontend page inventory");
assert.equal(directTrackerRuntimeFiles.length, 2, "unexpected direct Trackers admin template inventory");
assert.equal(iframeOnlyRuntimeFiles.length, 3, "unexpected iframe-only Trackers runtime template inventory");
assert.deepEqual(unclassifiedRuntimeFiles.map(relativePath), [], "Trackers runtime HTML must be explicitly classified");
assert.equal(bannerAdminTemplateFiles.length, 2, "unexpected Bannerbuilder admin template inventory");
assert.equal(pageFiles.length, 51, "unexpected shared-chrome page inventory");

for (const file of pageFiles) {
  const source = fs.readFileSync(file, "utf8");
  const label = relativePath(file);
  const headOpenIndex = source.search(/<head\b/i);
  const headCloseIndex = source.search(/<\/head>/i);
  const prepaintIndex = source.indexOf("/shared/xjk-core/chrome-prepaint.css");

  assert.equal(
    count(source, /\/shared\/xjk-core\/chrome-prepaint\.css(?:\?[^"']*)?/g),
    1,
    `${label} must load exactly one shared chrome prepaint stylesheet`
  );
  assert.ok(
    headOpenIndex >= 0 && prepaintIndex > headOpenIndex && prepaintIndex < headCloseIndex,
    `${label} must load shared chrome prepaint CSS synchronously inside <head>`
  );
  assert.equal(
    count(source, /\/shared\/xjk-core\/topbar-loader\.js(?:\?[^"']*)?/g),
    1,
    `${label} must load exactly one shared topbar renderer`
  );
  assert.equal(
    count(source, /\/shared\/xjk-core\/sidenav-boot\.js(?:\?[^"']*)?/g),
    1,
    `${label} must load exactly one shared sidenav renderer`
  );
  for (const { name, pattern } of sharedChromeAssets) {
    const versions = [...source.matchAll(pattern)].map((match) => match[1]);
    assert.equal(versions.length, 1, `${label} must load ${name} with exactly one ?v= cache buster`);
    versionsByAsset.get(name).add(versions[0]);
  }
  assert.doesNotMatch(source, /account-widget-loader\.js/, `${label} has a legacy account bootstrap`);
  assert.doesNotMatch(source, /data-xjk-account-widget-slot="sidebar"/, `${label} has a legacy sidebar account mount`);
  assert.doesNotMatch(source, /global-search-loader\.js/, `${label} has a legacy search bootstrap`);
  assert.doesNotMatch(source, /data-xjk-topbar-local-search/, `${label} has an obsolete topbar-local search block`);
  assert.doesNotMatch(source, /data-xjk-topbar-legacy-account/, `${label} has a legacy account action block`);
  assertConfiguredSelectorsExist(source, label);
  assertPageSpecificContract(source, label);
}

for (const { name } of sharedChromeAssets) {
  const versions = versionsByAsset.get(name);
  assert.equal(
    versions.size,
    1,
    `${name} must use one cache-buster version across shared-chrome pages; found ${[...versions].join(", ")}`
  );
}

for (const file of iframeOnlyRuntimeFiles) {
  const source = fs.readFileSync(file, "utf8");
  const label = relativePath(file);
  assert.doesNotMatch(source, /chrome-prepaint\.css/, `${label} must not reserve top-level chrome paint`);
  assert.doesNotMatch(source, /topbar-loader\.js/, `${label} must defer topbar chrome to its parent shell`);
  assert.doesNotMatch(source, /sidenav-boot\.js/, `${label} must defer sidenav chrome to its parent shell`);
}

console.log(
  `shared chrome ok: ${pageFiles.length} pages use one topbar + one sidenav, ${iframeOnlyRuntimeFiles.length} iframe-only payloads delegate`
);
