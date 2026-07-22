import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const toolsRoot = new URL("../sites/tools.xjk.yt/", import.meta.url);

async function findToolFrontendPages() {
  const entries = await readdir(toolsRoot, { withFileTypes: true });
  const pages = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name !== "shared")
      .map(async (entry) => {
        const url = new URL(`${entry.name}/frontend/index.html`, toolsRoot);
        try {
          return { html: await readFile(url, "utf8"), slug: entry.name };
        } catch (error) {
          if (error?.code === "ENOENT") return null;
          throw error;
        }
      })
  );
  return pages.filter(Boolean);
}

async function loadToolScripts(windowOverrides = {}) {
  const [runtimeSource, themeSource] = await Promise.all([
    readFile(new URL("../sites/tools.xjk.yt/shared/tool-browser-runtime.js", import.meta.url), "utf8"),
    readFile(new URL("../sites/tools.xjk.yt/shared/tool-theme.js", import.meta.url), "utf8"),
  ]);
  const window = { ...windowOverrides };
  const context = { window };
  vm.runInNewContext(runtimeSource, context, { filename: "tool-browser-runtime.js" });
  vm.runInNewContext(themeSource, context, { filename: "tool-theme.js" });
  return window;
}

async function loadToolTheme(windowOverrides = {}) {
  return (await loadToolScripts(windowOverrides)).ToolTheme;
}

test("browser runtime and visual theme remain separate while preserving the ToolTheme API", async () => {
  const window = await loadToolScripts();

  assert.equal(Object.isFrozen(window.ToolBrowserRuntime), true);
  assert.equal(window.ToolTheme.sendXhr, window.ToolBrowserRuntime.sendXhr);
  assert.equal(window.ToolTheme.selectUploadFile, window.ToolBrowserRuntime.selectUploadFile);
  assert.equal(
    window.ToolTheme.createTransferProgressCallbacks,
    window.ToolBrowserRuntime.createTransferProgressCallbacks
  );
  assert.equal(typeof window.ToolTheme.applyToolTheme, "function");
  assert.equal(typeof window.ToolTheme.ensureToolUsageDisclosure, "function");
});

test("every tool page loads the browser runtime before the visual theme", async () => {
  const pages = await findToolFrontendPages();
  assert.ok(pages.length > 0, "at least one tool frontend must exist");

  for (const { html, slug } of pages) {
    const runtimeIndex = html.indexOf("../shared/tool-browser-runtime.js");
    const themeIndex = html.indexOf("../shared/tool-theme.js");

    assert.notEqual(runtimeIndex, -1, `${slug} must load tool-browser-runtime.js`);
    assert.notEqual(themeIndex, -1, `${slug} must load tool-theme.js`);
    assert.ok(runtimeIndex < themeIndex, `${slug} must load browser runtime before visual theme`);
    assert.equal(html.match(/\.\.\/shared\/tool-browser-runtime\.js/g)?.length, 1, `${slug} must load one runtime`);
    assert.equal(html.match(/\.\.\/shared\/tool-theme\.js/g)?.length, 1, `${slug} must load one visual theme`);
  }
});

test("shared upload formatting and response filename parsing are stable", async () => {
  const theme = await loadToolTheme();
  assert.equal(
    theme.formatTransferProgress({ lengthComputable: true, loaded: 1024, total: 4096 }),
    "25% (1 KB / 4 KB)"
  );
  assert.equal(theme.formatTransferProgress({ lengthComputable: false, loaded: 3072 }), "3 KB");
  assert.equal(theme.parseContentDispositionFilename('attachment; filename="result.Map.Gbx"'), "result.Map.Gbx");
  assert.equal(theme.parseContentDispositionFilename("attachment"), "");
});

test("shared transfer callbacks preserve upload, processing, and download progress transitions", async () => {
  const theme = await loadToolTheme();
  const overlayTextElement = { textContent: "Idle" };
  const progressTextElement = { textContent: "Waiting" };
  const callbacks = theme.createTransferProgressCallbacks({
    overlayTextElement,
    progressTextElement,
    processingLabel: "Converting...",
    processingMessage: "Building output...",
  });

  callbacks.onUploadProgress({ lengthComputable: false, loaded: 512 });
  assert.equal(overlayTextElement.textContent, "Idle");
  assert.equal(progressTextElement.textContent, "Waiting");

  callbacks.onUploadProgress({ lengthComputable: true, loaded: 1024, total: 4096 });
  assert.equal(overlayTextElement.textContent, "Uploading...");
  assert.equal(progressTextElement.textContent, "25% (1 KB / 4 KB)");

  callbacks.onUploadComplete();
  assert.equal(overlayTextElement.textContent, "Converting...");
  assert.equal(progressTextElement.textContent, "Building output...");

  callbacks.onDownloadProgress({ lengthComputable: false, loaded: 2048 });
  assert.equal(overlayTextElement.textContent, "Downloading...");
  assert.equal(progressTextElement.textContent, "2 KB");
  callbacks.onDownloadProgress({ lengthComputable: true, loaded: 3072, total: 4096 });
  assert.equal(progressTextElement.textContent, "75% (3 KB / 4 KB)");

  const pendingProgress = { textContent: "Processing" };
  const pendingDownload = theme.createTransferProgressCallbacks({
    overlayTextElement,
    progressTextElement: pendingProgress,
  });
  pendingDownload.onDownloadProgress({ lengthComputable: false, loaded: 512 });
  assert.equal(pendingProgress.textContent, "");
  pendingProgress.textContent = "Keep until measurable";
  pendingDownload.onDownloadProgress({ lengthComputable: false, loaded: 1024 });
  assert.equal(pendingProgress.textContent, "Keep until measurable");
});

test("Strip and Underwater single-file flows share the transfer callback controller", async () => {
  const sources = await Promise.all([
    readFile(new URL("../sites/tools.xjk.yt/Strip-RaceValidationGhost/frontend/app.js", import.meta.url), "utf8"),
    readFile(new URL("../sites/tools.xjk.yt/Underwater-Map-Converter/frontend/app.js", import.meta.url), "utf8"),
  ]);

  for (const source of sources) {
    assert.match(source, /createTransferProgressCallbacks/);
    assert.match(source, /\.\.\.transferProgress/);
    assert.doesNotMatch(source, /let uploadDone|let downloadStarted/);
  }
});

test("Clip-To-Ghost reuses the shared transfer and download infrastructure", async () => {
  const source = await readFile(
    new URL("../sites/tools.xjk.yt/Clip-To-Ghost/frontend/app.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /createTransferProgressCallbacks/);
  assert.match(source, /sendXhr/);
  assert.match(source, /parseContentDispositionFilename/);
  assert.match(source, /triggerBlobDownload/);
  assert.doesNotMatch(source, /new XMLHttpRequest/);
  assert.doesNotMatch(source, /function parseContentDispositionFilename/);
  assert.doesNotMatch(source, /function triggerDownload/);
});

test("shared XHR helper resolves HTTP responses and classifies transport failures", async () => {
  const sentBodies = [];
  class FakeXhr {
    upload = {};

    open(method, url) {
      this.method = method;
      this.url = url;
    }

    send(body) {
      sentBodies.push(body);
      this.status = 200;
      this.onload();
    }
  }
  const theme = await loadToolTheme({ XMLHttpRequest: FakeXhr });
  const response = await theme.sendXhr({ url: "/api/check", body: "payload" });
  assert.equal(response.method, "POST");
  assert.equal(response.url, "/api/check");
  assert.deepEqual(sentBodies, ["payload"]);

  class FailingXhr extends FakeXhr {
    send() {
      this.onerror();
    }
  }
  await assert.rejects(
    theme.sendXhr({ url: "/api/check", xhrFactory: () => new FailingXhr() }),
    (error) => error.code === "network"
  );
});

test("shared file selection applies validation and button state consistently", async () => {
  const theme = await loadToolTheme();
  const classes = new Set();
  const dropElement = {
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
  };
  const nameElement = { textContent: "" };
  const submitElement = { disabled: true };
  const errors = [];
  const file = { name: "map.Map.Gbx", size: 2048 };

  assert.equal(
    theme.selectUploadFile({
      file,
      dropElement,
      nameElement,
      submitElement,
      emptyLabel: "No map selected",
      accepts: (candidate) => theme.isMapGbxFilename(candidate.name),
      setError: (message) => errors.push(message),
    }),
    file
  );
  assert.equal(submitElement.disabled, false);
  assert.equal(classes.has("ready"), true);
  assert.match(nameElement.textContent, /map\.Map\.Gbx/);
  assert.deepEqual(errors, [""]);
});
