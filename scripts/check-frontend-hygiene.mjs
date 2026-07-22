import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stylesheetBundle } from "./lib/stylesheet-bundles.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scannedRoots = [path.join(repoRoot, "sites")];

const ignoredDirs = new Set(["node_modules", ".venv", "dist", "build", "coverage"]);
const scannedExtensions = new Set([".html", ".js", ".mjs"]);
const allowedFiles = new Set([path.normalize("sites/shared/xjk-core/site-runtime.js")]);

const forbiddenPatterns = [
  {
    pattern: /\bSITE_ROUTES\b/,
    label: "local SITE_ROUTES table",
  },
  {
    pattern: /\blocalhostSubdomain\b/,
    label: "duplicated localhostSubdomain field",
  },
  {
    pattern: /\bproductionOrigin\b/,
    label: "duplicated productionOrigin field",
  },
  {
    pattern: /<script\s+src=["']\/xjk-account-widget\.js["']/i,
    label: "direct account widget script tag",
  },
  {
    pattern: /script\.src\s*=\s*["']\/xjk-account-widget\.js["']/,
    label: "direct account widget script injection",
  },
  {
    pattern: /https?:\/\/[a-z0-9-]+\.localhost(?::\$\{?[A-Za-z0-9_]+\}?|:\d+)?\//,
    label: "hard-coded local subdomain URL",
  },
];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }
    if (entry.isFile() && scannedExtensions.has(path.extname(entry.name))) {
      yield fullPath;
    }
  }
}

const failures = [];
const directHtmlSinks = [];

function readStylesheetBundle(bundleId) {
  return stylesheetBundle(bundleId)
    .stylesheets.map((relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8"))
    .join("\n");
}

for (const root of scannedRoots) {
  for (const filePath of walk(root)) {
    const relPath = path.relative(repoRoot, filePath);
    if (allowedFiles.has(path.normalize(relPath))) continue;

    const content = fs.readFileSync(filePath, "utf8");
    const sinkMatches =
      content.match(/\.(?:innerHTML|outerHTML)\s*=|\.insertAdjacentHTML\s*\(|\bdocument\.write(?:ln)?\s*\(/g) || [];
    if (sinkMatches.length) directHtmlSinks.push({ file: relPath.replaceAll("\\", "/"), count: sinkMatches.length });
    for (const { pattern, label } of forbiddenPatterns) {
      if (pattern.test(content)) {
        failures.push(`${relPath}: ${label}`);
      }
    }
  }
}

assert.deepEqual(failures, [], `frontend hygiene failures:\n${failures.join("\n")}`);
assert.deepEqual(
  directHtmlSinks,
  [{ file: "sites/shared/xjk-core/safe-html.js", count: 1 }],
  "parsed HTML must enter the frontend through exactly one reviewed sanitizer boundary"
);

const accountFrontendDir = path.join(repoRoot, "sites/account.xjk.yt/frontend");
for (const legacyAccountFile of ["app.js", "index.html", "styles.css"]) {
  assert.equal(
    fs.existsSync(path.join(repoRoot, "sites/xjk.yt/frontend/account", legacyAccountFile)),
    false,
    `the unreachable legacy account ${legacyAccountFile} must not return beside the canonical account site`
  );
}
const accountApp = fs.readFileSync(path.join(accountFrontendDir, "app.js"), "utf8");
const accountModules = fs
  .readdirSync(path.join(accountFrontendDir, "account"))
  .filter((name) => name.endsWith(".js"))
  .map((name) => fs.readFileSync(path.join(accountFrontendDir, "account", name), "utf8"))
  .join("\n");
const accountSource = `${accountApp}\n${accountModules}`;
const accountHtml = fs.readFileSync(path.join(accountFrontendDir, "index.html"), "utf8");
const accountCss = readStylesheetBundle("account");
const learnApp = fs.readFileSync(path.join(repoRoot, "sites/learn.xjk.yt/frontend/scripts/app.js"), "utf8");
const learnRouter = fs.readFileSync(path.join(repoRoot, "sites/learn.xjk.yt/frontend/scripts/router.js"), "utf8");
const learnCss = readStylesheetBundle("learn");
const archiveApp = fs.readFileSync(path.join(repoRoot, "sites/archive.xjk.yt/frontend/app.js"), "utf8");
const pluginsApp = fs.readFileSync(path.join(repoRoot, "sites/plugins.xjk.yt/Plugins-Hub/frontend/app.js"), "utf8");
const globalSearchModel = fs.readFileSync(path.join(repoRoot, "sites/shared/xjk-core/global-search/model.js"), "utf8");
const validifierRoutes = fs.readFileSync(
  path.join(repoRoot, "sites/validifier.xjk.yt/frontend/scripts/routes.js"),
  "utf8"
);
const validifierRenderers = fs.readFileSync(
  path.join(repoRoot, "sites/validifier.xjk.yt/frontend/scripts/renderers.js"),
  "utf8"
);
const dashApp = fs.readFileSync(path.join(repoRoot, "sites/dash.xjk.yt/frontend/app.js"), "utf8");
const dashModuleDirectory = path.join(repoRoot, "sites/dash.xjk.yt/frontend/dashboard");
const dashModules = fs
  .readdirSync(dashModuleDirectory)
  .filter((name) => name.endsWith(".js"))
  .map((name) => fs.readFileSync(path.join(dashModuleDirectory, name), "utf8"))
  .join("\n");
const dashLifecycle = fs.readFileSync(path.join(dashModuleDirectory, "lifecycle.js"), "utf8");
const alteredHub = fs.readFileSync(path.join(repoRoot, "sites/altered.xjk.yt/frontend/altered-hub.js"), "utf8");
const trackersApp = fs.readFileSync(
  path.join(repoRoot, "sites/trackers.xjk.yt/frontend/trackers-shell/app.js"),
  "utf8"
);
const accountHtmlIds = new Set([...accountHtml.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]));
const accountAppElementIds = [
  ...new Set([...accountSource.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1])),
];
const missingAccountElementIds = accountAppElementIds.filter((id) => !accountHtmlIds.has(id));
assert.deepEqual(
  missingAccountElementIds,
  [],
  `account app references IDs absent from account index.html: ${missingAccountElementIds.join(", ")}`
);

for (const binding of [
  "accountMenuTrigger",
  "accountMenu",
  "sidebarAccountName",
  "sidebarAccountMeta",
  "accountHomeLink",
]) {
  assert.doesNotMatch(accountSource, new RegExp(`\\b${binding}\\b`), `account app retains detached ${binding} chrome`);
}
for (const binding of ["userWidget", "userMenuOpen", "renderSidebarProfile", "handleUserMenuClick", "getUserMenu"]) {
  assert.doesNotMatch(learnApp, new RegExp(`\\b${binding}\\b`), `Learn app retains detached ${binding} chrome`);
}
assert.doesNotMatch(learnApp, /from\s+["']\.\/search\.js["']/, "Learn must not bootstrap a second search owner");
assert.doesNotMatch(
  accountCss,
  /\.(?:top-account(?:-[\w-]+)?|account-menu(?:-[\w-]+)?|service-status|status-copy|status-dot)\b/,
  "account CSS retains selectors for detached legacy chrome"
);
const detachedAccountLayoutClasses = [
  "accent-row",
  "account-brand",
  "account-brand-logo",
  "account-footer",
  "action-context-grid",
  "action-list-card",
  "action-row",
  "action-row--clear",
  "action-row--session",
  "appearance-grid",
  "appearance-preview",
  "appearance-preview-lane",
  "appearance-preview-lane--motion",
  "card-head",
  "connected-card",
  "connected-space-card",
  "connected-space-grid",
  "danger",
  "data-banner",
  "data-diagnostics",
  "data-zone-grid",
  "density-preview",
  "details-toggle",
  "eyebrow",
  "identity-route-board",
  "info-grid",
  "is-admin",
  "is-danger",
  "is-idle",
  "is-ok",
  "is-warning",
  "map-readout",
  "overview-admin-status",
  "overview-attention-action",
  "overview-attention-item",
  "overview-attention-list",
  "overview-attention-title",
  "overview-brief",
  "overview-card-actions",
  "overview-grid",
  "overview-line-stop--admin",
  "overview-mini-link",
  "overview-segments",
  "overview-session-board",
  "overview-setting-row",
  "overview-settings",
  "overview-status-card",
  "overview-support-grid",
  "overview-swatch-line",
  "panel-header",
  "privacy-card",
  "privacy-learn",
  "privacy-tags",
  "session-avatar",
  "session-body",
  "session-card",
  "session-facts",
  "session-logout-button",
  "session-note",
  "session-note-icon",
  "session-primary",
  "session-timeline",
  "space-card-actions",
  "space-card-copy",
  "space-card-station",
];
for (const className of detachedAccountLayoutClasses) {
  assert.doesNotMatch(
    accountCss,
    new RegExp(`\\.${className}(?![\\w-])`),
    `account CSS retains the zero-consumer .${className} selector`
  );
}
assert.doesNotMatch(
  accountCss,
  /wins earlier overview passes/,
  "account CSS must not rely on append-order layout passes"
);
assert.doesNotMatch(
  learnCss,
  /\.learn-(?:user(?:-[\w-]+)?|mini-profile|avatar)\b/,
  "Learn CSS retains selectors for its detached legacy account widget"
);
const knownLearnViewsMatch = learnRouter.match(/const KNOWN_VIEWS = new Set\((\[[\s\S]*?\])\);/);
assert.ok(knownLearnViewsMatch, "Learn router must declare its supported view set");
assert.deepEqual(
  [...knownLearnViewsMatch[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1]),
  ["map", "library", "tools", "profile", "settings", "admin"],
  "Learn router must not retain impossible view aliases"
);
assert.doesNotMatch(validifierRoutes, /export function apiUrl\b/, "Validifier must not duplicate its URL helper");
assert.match(
  validifierRoutes,
  /export \{ absoluteUrlForPath as apiUrl \};/,
  "Validifier must preserve apiUrl as an alias of its canonical URL helper"
);
assert.doesNotMatch(validifierRenderers, /\btextOrFallback\b/, "Validifier renderers retain an unused text helper");
assert.match(
  dashApp,
  /import \{ startDashboard \} from "\.\/dashboard\/lifecycle\.js\?v=2";/,
  "Dash entry must load its lifecycle module"
);
assert.doesNotMatch(dashModules, /\bfunction renderTableMessage\b/, "Dash retains an unreferenced table helper");
assert.match(dashLifecycle, /function runUiAction\b/, "Dash must expose one caught async UI action boundary");
assert.match(
  dashLifecycle,
  /function bindAsyncAction\b/,
  "Dash must bind throwing UI actions through its shared boundary"
);
for (const controlId of [
  "windowHours",
  "projectKey",
  "serviceName",
  "alteredCheckApplyBtn",
  "alteredCheckClearBtn",
  "alteredCheckSearch",
]) {
  assert.match(
    dashLifecycle,
    new RegExp(`bindAsyncAction\\(document\\.getElementById\\("${controlId}"\\)`),
    `Dash ${controlId} action must use the caught async boundary`
  );
}
assert.match(
  dashLifecycle,
  /querySelectorAll\("#tabRoutes \.sub-tab-btn"\)[\s\S]*?bindAsyncAction\(btn, "click"/,
  "Dash route refresh actions must use the caught async boundary"
);
assert.match(alteredHub, /async function bootAlteredHub\b/, "Altered hub must expose one async boot boundary");
assert.match(
  alteredHub,
  /await Promise\.all\(\[[\s\S]*?populateSeasonNav\(\)[\s\S]*?populateSeasonRibbon\(\)[\s\S]*?populateCurrentSeasonCard\(\)/,
  "Altered hub season boot promises must share one awaited boundary"
);
assert.match(alteredHub, /void bootAlteredHub\(\)\.catch\(/, "Altered hub boot failures must be observed");
assert.doesNotMatch(
  trackersApp,
  /\bfunction runtime(?:Direct|Admin)Href\b/,
  "Trackers retains unreferenced runtime URL helpers"
);

const { ensureStylesheetLink, onStylesheetReady, safeNavigationHref, uniqueById } = await import(
  pathToFileURL(path.join(repoRoot, "sites/shared/xjk-core/dom-utils.js")).href
);
const deduplicated = uniqueById([{ id: "first" }, { id: "first" }, null, { id: "second" }]);
assert.deepEqual(
  deduplicated.map((item) => item.id),
  ["first", "second"],
  "shared ID deduplication must preserve the first occurrence"
);

const stylesheetLinks = [];
const stylesheetDocument = {
  querySelector: (selector) => stylesheetLinks.find((link) => link.selector === selector) || null,
  createElement: () => ({ dataset: {} }),
  head: {
    appendChild(link) {
      stylesheetLinks.push(link);
    },
  },
};
const stylesheetOptions = {
  selector: "link[data-test-style]",
  href: "/shared/test.css?v=1",
  datasetKey: "testStyle",
};
const firstStylesheet = ensureStylesheetLink(stylesheetDocument, stylesheetOptions);
firstStylesheet.selector = stylesheetOptions.selector;
const secondStylesheet = ensureStylesheetLink(stylesheetDocument, stylesheetOptions);
assert.equal(firstStylesheet, secondStylesheet, "shared stylesheet loading must be idempotent");
assert.equal(stylesheetLinks.length, 1, "shared stylesheet loading must not create duplicate links");
assert.equal(firstStylesheet.rel, "stylesheet");
assert.equal(firstStylesheet.href, stylesheetOptions.href);
assert.equal(firstStylesheet.dataset.testStyle, "true");

const readinessListeners = new Map();
const readinessTimers = [];
let readinessToken = "";
let readinessCalls = 0;
const readinessDocument = {
  documentElement: {},
  defaultView: {
    clearTimeout() {},
    getComputedStyle: () => ({ getPropertyValue: () => readinessToken }),
    queueMicrotask: (callback) => callback(),
    requestAnimationFrame: () => 1,
    setTimeout(callback) {
      readinessTimers.push(callback);
      return { unref() {} };
    },
  },
};
const pendingStylesheet = {
  ownerDocument: readinessDocument,
  sheet: null,
  addEventListener(eventName, callback) {
    readinessListeners.set(eventName, callback);
  },
};
const finishReadiness = onStylesheetReady(pendingStylesheet, {
  document: readinessDocument,
  sentinelTarget: readinessDocument.documentElement,
  sentinelProperty: "--shared-ready",
  onReady: () => {
    readinessCalls += 1;
  },
});
assert.equal(readinessCalls, 0, "stylesheet readiness must wait while CSS is unavailable");
readinessListeners.get("load")();
readinessListeners.get("error")();
readinessTimers.at(-1)();
finishReadiness();
assert.equal(readinessCalls, 1, "stylesheet readiness must settle once across every completion path");

readinessToken = "ready";
onStylesheetReady(
  { ownerDocument: readinessDocument, sheet: null, addEventListener() {} },
  {
    document: readinessDocument,
    sentinelTarget: readinessDocument.documentElement,
    sentinelProperty: "--shared-ready",
    onReady: () => {
      readinessCalls += 1;
    },
  }
);
assert.equal(readinessCalls, 2, "stylesheet readiness must detect a load event that completed before binding");

const navigationOptions = {
  base: "https://account.xjk.yt/settings",
  fallback: "/auth/ubisoft/login",
};
assert.equal(
  safeNavigationHref("javascript:alert(1)", navigationOptions),
  "https://account.xjk.yt/auth/ubisoft/login",
  "navigation URLs must reject javascript schemes"
);
assert.equal(
  safeNavigationHref("data:text/html,<script>alert(1)</script>", navigationOptions),
  "https://account.xjk.yt/auth/ubisoft/login",
  "navigation URLs must reject data schemes"
);
assert.equal(
  safeNavigationHref("/auth/ubisoft/login?source=account", navigationOptions),
  "https://account.xjk.yt/auth/ubisoft/login?source=account",
  "navigation URLs must preserve safe relative HTTP routes"
);
assert.equal(
  safeNavigationHref("vbscript:msgbox(1)", {
    base: navigationOptions.base,
    fallback: "javascript:alert(1)",
  }),
  "",
  "navigation URLs must also reject an unsafe fallback"
);

for (const [source, label] of [
  [archiveApp, "Archive"],
  [pluginsApp, "Plugins"],
  [globalSearchModel, "global search model"],
]) {
  assert.match(source, /import\s*\{[^}]*safeNavigationHref[^}]*\}/, `${label} must import the shared URL guard`);
  assert.match(source, /safeNavigationHref\s*\(/, `${label} must guard navigable data before assigning it`);
}

const toolManifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "sites/tools.xjk.yt/Tools-Hub/data/tools.json"), "utf8")
);
const toolsHubFrontend = fs.readFileSync(path.join(repoRoot, "sites/tools.xjk.yt/Tools-Hub/frontend/app.js"), "utf8");
const toolsHubPage = fs.readFileSync(path.join(repoRoot, "sites/tools.xjk.yt/Tools-Hub/frontend/index.html"), "utf8");
const toolsHubBackend = fs.readFileSync(path.join(repoRoot, "sites/tools.xjk.yt/Tools-Hub/backend/server.js"), "utf8");
const toolTheme = fs.readFileSync(path.join(repoRoot, "sites/tools.xjk.yt/shared/tool-theme.js"), "utf8");
const bannerAdminTemplate = fs.readFileSync(
  path.join(repoRoot, "services/bannerbuilder/templates/admin_list.html"),
  "utf8"
);
assert.equal(toolsHubFrontend.includes("fallbackTools"), false, "Tools Hub must not duplicate its canonical manifest");
assert.equal(toolsHubFrontend.includes("TOOL_DOCS"), false, "Tools Hub contains unreachable legacy docs data");
assert.equal(toolsHubFrontend.includes("renderLiveSquares"), false, "Tools Hub contains unreachable background code");
assert.match(
  toolsHubFrontend,
  /window\.ToolTheme\.getToolPalette\(tool\)/,
  "Tools Hub cards must use the canonical tool palette"
);
assert.ok(
  toolsHubPage.indexOf("../shared/tool-theme.js") < toolsHubPage.indexOf('src="app.js'),
  "Tools Hub must load its shared palette before rendering cards"
);
assert.equal(pluginsApp.includes("buildDate"), false, "Plugins retains a detached build-date binding");
assert.equal(toolsHubFrontend.includes("buildDate"), false, "Tools Hub retains a detached build-date binding");
assert.equal(toolsHubBackend.includes("DEFAULT_TOOLS"), false, "Tools backend must read its canonical manifest");
assert.match(
  toolsHubBackend,
  /app\.get\("\/api\/tools", async \(_req, res, next\) => \{[\s\S]*?catch \(error\) \{\s*next\(error\);/,
  "Tools API must forward asynchronous manifest failures to Express error middleware"
);
assert.match(
  bannerAdminTemplate,
  /data-series='\{\{ chart\|tojson\|safe \}\}'/,
  "Bannerbuilder chart JSON must use a single-quoted HTML attribute"
);
assert.match(
  bannerAdminTemplate,
  /data-total='\{\{ counters\|tojson\|safe \}\}'/,
  "Bannerbuilder counter JSON must use a single-quoted HTML attribute"
);
for (const tool of toolManifest) {
  assert.ok(
    toolTheme.includes(`"${tool.id}":`) || toolTheme.includes(`\n    ${tool.id}:`),
    `tool theme metadata is missing canonical tool ${tool.id}`
  );
}
console.log("frontend hygiene ok");
