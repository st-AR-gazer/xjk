import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toolsRoot = path.join(repoRoot, "sites", "tools.xjk.yt");
const toolRuntimePath = path.join(toolsRoot, "shared", "tool-browser-runtime.js");
const toolThemePath = path.join(toolsRoot, "shared", "tool-theme.js");
const toolRuntimeSource = fs.readFileSync(toolRuntimePath, "utf8");
const toolThemeSource = fs.readFileSync(toolThemePath, "utf8");

const EXPECTED_CALLER_APPS = Object.freeze([
  "Clip-To-Ghost/frontend/app.js",
  "Embed-RaceValidationGhost/frontend/app.js",
  "Embedded-Blocks-And-Items-Checker/frontend/app.js",
  "Extract-Replay-Data/frontend/app.js",
  "Gbx-Medal-Time-Modifier/frontend/app.js",
  "Map-Validation-Checker/frontend/app.js",
  "Replay-Verification/frontend/app.js",
  "Strip-RaceValidationGhost/frontend/app.js",
  "Tools-Hub/frontend/app.js",
  "Underwater-Map-Converter/frontend/app.js",
]);
const THEMED_TOOL_DIRECTORIES = Object.freeze([
  "Clip-To-Ghost",
  "Embed-RaceValidationGhost",
  "Embedded-Blocks-And-Items-Checker",
  "Extract-Replay-Data",
  "Gbx-Medal-Time-Modifier",
  "Map-Validation-Checker",
  "Replay-Verification",
  "Strip-RaceValidationGhost",
  "Underwater-Map-Converter",
]);
const TOOL_THEME_STYLESHEETS = Object.freeze([
  "foundation.css",
  "uploads.css",
  "controls.css",
  "candidates.css",
  "documentation.css",
]);

function posixPath(value) {
  return value.replaceAll(path.sep, "/");
}

function collectFiles(directory, fileName) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name === "node_modules") return [];
    if (entry.isDirectory()) return collectFiles(absolutePath, fileName);
    return entry.isFile() && entry.name === fileName ? [absolutePath] : [];
  });
}

function scriptSources(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
}

function stylesheetSources(html) {
  return [...html.matchAll(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi)]
    .map(([tag]) => tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || "")
    .filter(Boolean);
}

function isScriptNamed(source, fileName) {
  const cleanSource = source.split(/[?#]/, 1)[0].replaceAll("\\", "/");
  return cleanSource === fileName || cleanSource.endsWith(`/${fileName}`);
}

function cacheVersion(source) {
  const query = source.split("?", 2)[1] || "";
  return query.match(/(?:^|&)v=([^&]+)/)?.[1] || "";
}

function fileInputIsMultiple(html) {
  return [...html.matchAll(/<input\b[^>]*>/gi)].some(([tag]) => {
    const isFile = /\btype\s*=\s*["']file["']/i.test(tag);
    const isMultiple = /(?:\s|<)multiple(?:\s|=|\/?>)/i.test(tag);
    return isFile && isMultiple;
  });
}

function destructuredToolThemeNames(source) {
  return [...source.matchAll(/\b(?:const|let|var)\s*\{([^}]+)\}\s*=\s*window\.ToolTheme\s*;/g)].flatMap((match) =>
    match[1]
      .split(",")
      .map((token) => token.trim().split(/\s*:\s*/, 1)[0])
      .filter(Boolean)
  );
}

function directToolThemeNames(source) {
  return [...source.matchAll(/window\.ToolTheme\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1]);
}

class FakeClassList {
  #values = new Set();

  add(value) {
    this.#values.add(value);
  }

  remove(value) {
    this.#values.delete(value);
  }

  toggle(value, force) {
    if (force === undefined ? !this.#values.has(value) : Boolean(force)) this.#values.add(value);
    else this.#values.delete(value);
    return this.#values.has(value);
  }

  contains(value) {
    return this.#values.has(value);
  }
}

class FakeElement {
  constructor() {
    this.classList = new FakeClassList();
    this.className = "";
    this.children = [];
    this.files = [];
    this.textContent = "";
    this.clickCount = 0;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  append(...children) {
    this.children.push(...children);
  }

  click() {
    this.clickCount += 1;
  }

  fire(type, values = {}) {
    const event = {
      dataTransfer: null,
      defaultPrevented: false,
      key: "",
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...values,
    };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
}

function loadToolThemeApi() {
  const clipboardWrites = [];
  const context = {
    window: {
      document: { createElement: () => new FakeElement() },
      navigator: { clipboard: { writeText: async (value) => clipboardWrites.push(value) } },
    },
  };
  vm.runInNewContext(toolRuntimeSource, context, { filename: toolRuntimePath });
  vm.runInNewContext(toolThemeSource, context, { filename: toolThemePath });
  assert.ok(context.window.ToolBrowserRuntime, "tool-browser-runtime.js did not expose window.ToolBrowserRuntime");
  assert.ok(context.window.ToolTheme, "tool-theme.js did not expose window.ToolTheme");
  return {
    api: context.window.ToolTheme,
    clipboardWrites,
    runtime: context.window.ToolBrowserRuntime,
  };
}

function checkHelperApi(api, runtime) {
  const runtimeFunctions = [
    "bindFileDropZone",
    "copyJsonToClipboard",
    "copyTextToClipboard",
    "createJsonResultBindings",
    "createSummaryRow",
    "createToolUiBindings",
    "formatKilobytes",
    "formatPercent",
    "isMapGbxFilename",
    "parseJsonOrNull",
    "readBlobText",
    "setDropZoneReady",
  ];
  const visualThemeFunctions = ["applyToolTheme", "ensureToolBackLink", "ensureToolUsageDisclosure", "getToolPalette"];
  assert.equal(Object.isFrozen(runtime), true, "ToolBrowserRuntime must expose an immutable API object");
  for (const name of runtimeFunctions) {
    assert.equal(typeof runtime[name], "function", `ToolBrowserRuntime.${name} is missing`);
    assert.equal(api[name], runtime[name], `ToolTheme.${name} must delegate to the browser runtime owner`);
  }
  for (const name of visualThemeFunctions) {
    assert.equal(typeof api[name], "function", `ToolTheme.${name} is missing`);
    assert.equal(name in runtime, false, `ToolBrowserRuntime must not own visual helper ${name}`);
  }

  assert.equal(api.formatKilobytes(1536), "2 KB");
  assert.equal(api.formatKilobytes(undefined), "0 KB");
  assert.equal(api.formatPercent(49.5), "50%");
  assert.equal(api.formatPercent(Number.NaN), "0%");
  assert.equal(api.parseJsonOrNull('{"ok":true}')?.ok, true);
  assert.equal(api.parseJsonOrNull("not-json"), null);
  assert.equal(api.isMapGbxFilename("Example.Map.Gbx"), true);
  assert.equal(api.isMapGbxFilename("Example.Gbx"), true);
  assert.equal(api.isMapGbxFilename("Example.Replay.Gbx"), true);
  assert.equal(api.isMapGbxFilename("Example.zip"), false);

  const summaryRow = api.createSummaryRow("Result", "Ready");
  assert.equal(summaryRow.className, "summary-item");
  assert.deepEqual(
    summaryRow.children.map((child) => [child.className, child.textContent]),
    [
      ["k", "Result"],
      ["v", "Ready"],
    ]
  );

  const resultElement = new FakeElement();
  const resultPanel = new FakeElement();
  resultPanel.classList.add("hidden");
  const jsonBindings = api.createJsonResultBindings({ resultElement, panelElement: resultPanel });
  assert.equal(Object.isFrozen(jsonBindings), true, "JSON result bindings must expose an immutable API object");
  assert.equal(jsonBindings.render({ ok: true }), '{\n  "ok": true\n}');
  assert.equal(resultElement.textContent, '{\n  "ok": true\n}');
  assert.equal(resultPanel.classList.contains("hidden"), false);

  const ready = new FakeElement();
  api.setDropZoneReady(ready, { selected: true });
  assert.equal(ready.classList.contains("ready"), true, "truthy file state must mark a drop zone ready");
  api.setDropZoneReady(ready, null);
  assert.equal(ready.classList.contains("ready"), false, "empty file state must clear drop-zone readiness");
  assert.doesNotThrow(() => api.setDropZoneReady(null, true), "missing optional drop zones must be safe");
}

async function checkAsyncUtilities(api, clipboardWrites) {
  assert.equal(await api.readBlobText({ text: async () => "payload" }), "payload");
  assert.equal(await api.readBlobText({ text: async () => Promise.reject(new Error("unreadable")) }), "");

  let copyStatus = "";
  let copyError = "";
  const copied = await api.copyJsonToClipboard('{"ok":true}', {
    setStatus: (message) => {
      copyStatus = message;
    },
    setError: (message) => {
      copyError = message;
    },
  });
  assert.equal(copied, true);
  assert.deepEqual(clipboardWrites, ['{"ok":true}']);
  assert.equal(copyStatus, "JSON copied to clipboard.");
  assert.equal(copyError, "");
  assert.equal(await api.copyTextToClipboard(""), false, "empty clipboard values must remain a no-op");
}

function checkSingleFileBinding(api) {
  const drop = new FakeElement();
  const input = new FakeElement();
  const first = { name: "first.Map.Gbx" };
  const second = { name: "second.Map.Gbx" };
  const picked = [];

  api.bindFileDropZone(drop, input, (file) => picked.push(file));

  drop.fire("click");
  assert.equal(input.clickCount, 1, "drop-zone click must open the file input");

  const ignoredKey = drop.fire("keydown", { key: "Escape" });
  assert.equal(ignoredKey.defaultPrevented, false, "unrelated keys must remain untouched");
  assert.equal(input.clickCount, 1, "unrelated keys must not open the file input");

  for (const key of ["Enter", " "]) {
    const event = drop.fire("keydown", { key });
    assert.equal(event.defaultPrevented, true, `${JSON.stringify(key)} must suppress its default action`);
  }
  assert.equal(input.clickCount, 3, "Enter and Space must both open the file input");

  const dragover = drop.fire("dragover");
  assert.equal(dragover.defaultPrevented, true, "dragover must allow a file drop");
  assert.equal(drop.classList.contains("dragover"), true, "dragover must expose its visual state");
  drop.fire("dragleave");
  assert.equal(drop.classList.contains("dragover"), false, "dragleave must clear its visual state");

  drop.classList.add("dragover");
  const dropped = drop.fire("drop", { dataTransfer: { files: [first, second] } });
  assert.equal(dropped.defaultPrevented, true, "drop must not navigate the browser to the file");
  assert.equal(drop.classList.contains("dragover"), false, "drop must clear its visual state");
  assert.equal(picked.at(-1), first, "single-file bindings must select only the first dropped file");

  input.files = [second, first];
  input.fire("change");
  assert.equal(picked.at(-1), second, "single-file input changes must select only the first file");
}

function checkMultipleFileBinding(api) {
  const drop = new FakeElement();
  const input = new FakeElement();
  const files = [{ name: "one.Map.Gbx" }, { name: "two.Map.Gbx" }];
  const picked = [];

  api.bindFileDropZone(drop, input, (value) => picked.push(value), { multiple: true });
  drop.fire("drop", { dataTransfer: { files } });
  assert.equal(picked.at(-1), files, "multiple-file drops must preserve the complete file collection");

  const inputFiles = [{ name: "three.Map.Gbx" }, { name: "four.Map.Gbx" }];
  input.files = inputFiles;
  input.fire("change");
  assert.equal(picked.at(-1), inputFiles, "multiple-file input changes must preserve the complete collection");
}

function checkDisabledBinding(api) {
  const drop = new FakeElement();
  const input = new FakeElement();
  const picked = [];
  let disabled = true;

  api.bindFileDropZone(drop, input, (file) => picked.push(file), { isDisabled: () => disabled });

  drop.fire("click");
  assert.equal(input.clickCount, 0, "disabled drop zones must not open the file input");

  const keydown = drop.fire("keydown", { key: "Enter" });
  assert.equal(keydown.defaultPrevented, true, "disabled keyboard activation must still suppress its default action");
  assert.equal(input.clickCount, 0, "disabled keyboard activation must not open the file input");

  const dragover = drop.fire("dragover");
  assert.equal(dragover.defaultPrevented, true, "disabled dragover must still prevent browser navigation");
  assert.equal(drop.classList.contains("dragover"), false, "disabled dragover must not show an active state");

  drop.classList.add("dragover");
  const dropped = drop.fire("drop", { dataTransfer: { files: [{ name: "ignored.Map.Gbx" }] } });
  assert.equal(dropped.defaultPrevented, true, "disabled drops must still prevent browser navigation");
  assert.equal(drop.classList.contains("dragover"), false, "disabled drops must clear stale drag state");
  assert.deepEqual(picked, [], "disabled drops must not change the selected file");

  input.files = [{ name: "ignored-again.Map.Gbx" }];
  input.fire("change");
  assert.deepEqual(picked, [], "disabled input changes must not change the selected file");

  disabled = false;
  drop.fire("click");
  assert.equal(input.clickCount, 1, "isDisabled must be evaluated for every interaction");
}

function checkUiBindings(api) {
  const status = new FakeElement();
  const error = new FakeElement();
  const overlay = new FakeElement();
  const overlayText = new FakeElement();
  const progress = new FakeElement();
  overlay.classList.add("hidden");
  progress.textContent = "stale progress";

  const bindings = api.createToolUiBindings({
    statusElement: status,
    errorElement: error,
    overlayElement: overlay,
    overlayTextElement: overlayText,
    progressTextElement: progress,
  });
  assert.equal(Object.isFrozen(bindings), true, "tool UI bindings must expose an immutable API object");

  bindings.setStatus("Ready");
  bindings.setError("Problem");
  assert.equal(status.textContent, "Ready");
  assert.equal(error.textContent, "Problem");
  bindings.setStatus();
  bindings.setError();
  assert.equal(status.textContent, "");
  assert.equal(error.textContent, "");

  bindings.showOverlay();
  assert.equal(overlayText.textContent, "Working...", "overlay must retain the legacy default copy");
  assert.equal(progress.textContent, "", "showOverlay must clear stale progress");
  assert.equal(overlay.classList.contains("hidden"), false, "showOverlay must reveal the overlay");
  bindings.hideOverlay();
  assert.equal(overlay.classList.contains("hidden"), true, "hideOverlay must hide the overlay");

  bindings.showOverlay("");
  assert.equal(overlayText.textContent, "Working...", "empty overlay copy must use the legacy fallback");
  assert.doesNotThrow(() => {
    const optionalBindings = api.createToolUiBindings();
    optionalBindings.setStatus("ignored");
    optionalBindings.setError("ignored");
    optionalBindings.showOverlay();
    optionalBindings.hideOverlay();
  }, "all UI binding elements must remain optional");
}

function checkCallerContracts(api) {
  const callerApps = collectFiles(toolsRoot, "app.js")
    .filter((file) => posixPath(file).includes("/frontend/"))
    .filter((file) => fs.readFileSync(file, "utf8").includes("window.ToolTheme"));
  const relativeCallers = callerApps.map((file) => posixPath(path.relative(toolsRoot, file))).sort();
  assert.deepEqual(
    relativeCallers,
    [...EXPECTED_CALLER_APPS].sort(),
    "ToolTheme caller inventory changed; migrate or classify the new caller explicitly"
  );

  for (const appPath of callerApps) {
    const appSource = fs.readFileSync(appPath, "utf8");
    const htmlPath = path.join(path.dirname(appPath), "index.html");
    const label = posixPath(path.relative(repoRoot, appPath));
    assert.ok(fs.existsSync(htmlPath), `${label} has no index.html for load-order validation`);
    const html = fs.readFileSync(htmlPath, "utf8");
    const sources = scriptSources(html);
    const runtimeIndex = sources.findIndex((source) => isScriptNamed(source, "tool-browser-runtime.js"));
    const themeIndex = sources.findIndex((source) => isScriptNamed(source, "tool-theme.js"));
    const appIndex = sources.findIndex((source) => isScriptNamed(source, "app.js"));
    assert.ok(runtimeIndex >= 0, `${label} does not load tool-browser-runtime.js`);
    assert.ok(themeIndex > runtimeIndex, `${label} must load tool-browser-runtime.js before tool-theme.js`);
    assert.ok(themeIndex >= 0, `${label} does not load tool-theme.js`);
    assert.ok(appIndex > themeIndex, `${label} must load tool-theme.js before app.js`);

    const runtimeVersion = cacheVersion(sources[runtimeIndex]);
    const themeVersion = cacheVersion(sources[themeIndex]);
    const appVersion = cacheVersion(sources[appIndex]);
    assert.ok(runtimeVersion, `${label} tool-browser-runtime.js needs a cache version`);
    assert.ok(themeVersion, `${label} tool-theme.js needs a cache version`);
    assert.equal(
      themeVersion,
      runtimeVersion,
      `${label} tool-browser-runtime.js and tool-theme.js must use the same cache version`
    );
    assert.equal(appVersion, themeVersion, `${label} app.js and tool-theme.js must use the same cache version`);

    const referencedNames = new Set([...destructuredToolThemeNames(appSource), ...directToolThemeNames(appSource)]);
    for (const name of referencedNames) {
      assert.ok(name in api, `${label} references missing ToolTheme.${name}`);
    }
    assert.doesNotMatch(
      appSource,
      /\b(?:summaryRow|parseJsonSafe|isMapFilename|copyResult|blobToText)\b/,
      `${label} still references a retired local helper`
    );
    assert.doesNotMatch(
      appSource,
      /\bfunction\s+(?:summaryRow|parseJsonSafe|isMapFilename|copyResult|blobToText|readBlobText)\b/,
      `${label} redeclares a helper owned by ToolTheme`
    );

    const helperRequestsMultiple = /\bmultiple\s*:\s*true\b/.test(appSource);
    assert.equal(
      fileInputIsMultiple(html),
      helperRequestsMultiple,
      `${label} helper and file-input multiple modes disagree`
    );
  }

  const clipSource = fs.readFileSync(path.join(toolsRoot, "Clip-To-Ghost", "frontend", "app.js"), "utf8");
  assert.match(clipSource, /const dropZoneOptions\s*=\s*\{\s*isDisabled:\s*\(\)\s*=>\s*isBusy\s*\}/);
  assert.equal(
    [...clipSource.matchAll(/bindFileDropZone\([^;]+dropZoneOptions\s*\);/g)].length,
    2,
    "Clip-to-Ghost must apply its busy guard to both file inputs"
  );

  const underwaterSource = fs.readFileSync(
    path.join(toolsRoot, "Underwater-Map-Converter", "frontend", "app.js"),
    "utf8"
  );
  const underwaterBinding = underwaterSource.match(
    /bindFileDropZone\(drop,\s*fileInput,\s*pickFiles,\s*\{([\s\S]*?)\}\s*\);/
  )?.[1];
  assert.ok(underwaterBinding, "Underwater converter is missing its shared file binding");
  assert.match(underwaterBinding, /isDisabled:\s*\(\)\s*=>\s*isBusy/);
  assert.match(underwaterBinding, /multiple:\s*true/);

  return callerApps.length;
}

function checkThemeStylesheetModules() {
  const themeDirectory = path.join(toolsRoot, "shared", "tool-theme");
  assert.equal(fs.existsSync(path.join(toolsRoot, "shared", "tool-theme.css")), false);

  for (const fileName of TOOL_THEME_STYLESHEETS) {
    const filePath = path.join(themeDirectory, fileName);
    assert.ok(fs.existsSync(filePath), `missing shared tool theme module ${fileName}`);
    const source = fs.readFileSync(filePath, "utf8");
    assert.ok(source.split(/\r?\n/).length <= 700, `${fileName} exceeds the tool theme module ceiling`);
    assert.doesNotMatch(source, /@import\b/i, `${fileName} must be linked directly`);
  }

  const expectedHrefs = TOOL_THEME_STYLESHEETS.map((fileName) => `../shared/tool-theme/${fileName}?v=2`);
  for (const toolDirectory of THEMED_TOOL_DIRECTORIES) {
    const htmlPath = path.join(toolsRoot, toolDirectory, "frontend", "index.html");
    const hrefs = stylesheetSources(fs.readFileSync(htmlPath, "utf8"));
    const firstThemeIndex = hrefs.indexOf(expectedHrefs[0]);
    assert.notEqual(firstThemeIndex, -1, `${toolDirectory} is missing the shared theme foundation`);
    assert.deepEqual(
      hrefs.slice(firstThemeIndex, firstThemeIndex + expectedHrefs.length),
      expectedHrefs,
      `${toolDirectory} changed the shared theme cascade order`
    );
  }
}

const { api, clipboardWrites, runtime } = loadToolThemeApi();
checkHelperApi(api, runtime);
await checkAsyncUtilities(api, clipboardWrites);
checkSingleFileBinding(api);
checkMultipleFileBinding(api);
checkDisabledBinding(api);
checkUiBindings(api);
checkThemeStylesheetModules();
const callerCount = checkCallerContracts(api);

console.log(
  `tool theme ok: helper interactions, overlay defaults, ${callerCount} ordered callers, API, busy, and multiple contracts`
);
