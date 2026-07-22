import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import { createEventRow, createNameRow, createProjectMapRow } from "../sites/aggregator.xjk.yt/frontend/rendering.js";
import { renderClipCandidate, renderGhostDetails } from "../sites/tools.xjk.yt/shared/safe-rendering.js";
import "../sites/shared/xjk-core/safe-html.js";

const execFileAsync = promisify(execFile);

async function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] &&
      path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return "";
}

function buildSafeHtmlBrowserFixture(safeHtmlUrl) {
  const payload = Buffer.from(
    `<p id="benign" class="copy"><strong>Safe</strong> content</p>
     <script>globalThis.xssFromScript = true</script>
     <svg id="vector" onload="globalThis.xssFromSvg = true">
       <foreignObject><img src="x" onerror="globalThis.xssFromForeignObject = true"></foreignObject>
       <use id="external-use" href="https://malicious.example/icon.svg#x"></use>
     </svg>
     <math><mtext>unsafe namespace</mtext></math>
     <iframe id="frame" srcdoc="<script>parent.xssFromSrcdoc=true</script>" onload="globalThis.xssFromFrame=true"></iframe>
     <a id="bad-link" href="java&#10;script:alert(1)" target="_blank">Bad link</a>
     <img id="bad-image" src="data:text/html,<script>alert(1)</script>" srcset="/safe.png 1x, javascript:alert(1) 2x" style="background:url(javascript:alert(1))">
     <img id="safe-image" src="data:image/png;base64,aGVsbG8=">
     <button id="bad-button" formaction="javascript:alert(1)">Submit</button>
     <a id="good-link" href="/account/" style="color:#fff" data-note="kept">Account</a>`,
    "utf8"
  ).toString("base64");

  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>pending</title></head>
  <body>
    <div id="fragment-host"></div>
    <div id="set-host"></div>
    <script src="${safeHtmlUrl}"></script>
    <script>
      const markup = atob("${payload}");
      const fragmentHost = document.getElementById("fragment-host");
      fragmentHost.append(globalThis.XjkSafeHtml.fragment(markup));
      const setHost = document.getElementById("set-host");
      globalThis.XjkSafeHtml.set(setHost, markup);

      function summarize(host) {
        const elements = [...host.querySelectorAll("*")];
        const attributes = elements.flatMap((element) => [...element.attributes]);
        const rel = new Set((host.querySelector("#bad-link")?.getAttribute("rel") || "").split(/\\s+/));
        return {
          blockedElements: elements.filter((element) =>
            ["script", "math", "foreignobject", "object", "style", "template"].includes(element.localName.toLowerCase())
          ).length,
          eventAttributes: attributes.filter((attribute) => attribute.name.toLowerCase().startsWith("on")).length,
          srcdocAttributes: attributes.filter((attribute) => attribute.name.toLowerCase() === "srcdoc").length,
          badHrefRemoved: !host.querySelector("#bad-link")?.hasAttribute("href"),
          badImageSrcRemoved: !host.querySelector("#bad-image")?.hasAttribute("src"),
          badImageSrcsetRemoved: !host.querySelector("#bad-image")?.hasAttribute("srcset"),
          badImageStyleRemoved: !host.querySelector("#bad-image")?.hasAttribute("style"),
          badFormActionRemoved: !host.querySelector("#bad-button")?.hasAttribute("formaction"),
          externalUseHrefRemoved: !host.querySelector("#external-use")?.hasAttribute("href"),
          blankRelHardened: rel.has("noopener") && rel.has("noreferrer"),
          safeImageKept: host.querySelector("#safe-image")?.getAttribute("src") === "data:image/png;base64,aGVsbG8=",
          benignMarkupKept:
            host.querySelector("#benign strong")?.textContent === "Safe" &&
            host.querySelector("#good-link")?.getAttribute("href") === "/account/" &&
            host.querySelector("#good-link")?.getAttribute("style") === "color:#fff" &&
            host.querySelector("#good-link")?.getAttribute("data-note") === "kept",
        };
      }

      document.title = btoa(JSON.stringify({
        fragment: summarize(fragmentHost),
        set: summarize(setHost),
        executed: Boolean(
          globalThis.xssFromScript ||
          globalThis.xssFromSvg ||
          globalThis.xssFromForeignObject ||
          globalThis.xssFromSrcdoc ||
          globalThis.xssFromFrame
        ),
      }));
    </script>
  </body>
</html>`;
}

class FakeTextNode {
  constructor(value) {
    this.nodeType = 3;
    this.value = String(value ?? "");
  }

  get textContent() {
    return this.value;
  }
}

class FakeElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = String(tagName).toLowerCase();
    this.className = "";
    this.children = [];
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  get textContent() {
    return this.children.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this.children = [this.ownerDocument.createTextNode(value)];
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(this, tagName);
  }

  createTextNode(value) {
    return new FakeTextNode(value);
  }
}

function descendantTags(node) {
  if (!(node instanceof FakeElement)) return [];
  return [node.tagName, ...node.children.flatMap((child) => descendantTags(child))];
}

function assertPayloadRemainsText(root, payload) {
  assert.match(root.textContent, new RegExp(payload.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(descendantTags(root).includes("img"), false);
  assert.equal(descendantTags(root).includes("script"), false);
  assert.equal(descendantTags(root).includes("svg"), false);
}

test("the removed Altered dashboard bundle has no remaining page entrypoint", async () => {
  const legacyBundle = new URL("../sites/altered.xjk.yt/frontend/app.js", import.meta.url);
  await assert.rejects(access(legacyBundle));
  const rootPage = await readFile(new URL("../sites/altered.xjk.yt/frontend/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(rootPage, /(?:^|[/'"])(?:\.\/)?app\.js(?:[?'"/]|$)/);
});

test("aggregator table renderers keep invalid dates and API fields in text nodes", () => {
  const doc = new FakeDocument();
  const payload = '<img src=x onerror="globalThis.pwned=true">';

  const rows = [
    createEventRow(doc, {
      occurredAt: payload,
      projectName: payload,
      item: payload,
      eventType: payload,
    }),
    createProjectMapRow(doc, {
      mapName: payload,
      mapUid: payload,
      latestCheckedAt: payload,
    }),
    createProjectMapRow(
      doc,
      { accountId: payload, displayName: payload, source: payload, observedAt: payload },
      {
        displaynameMode: true,
      }
    ),
    createNameRow(doc, { accountId: payload, displayName: payload, observedAt: payload }),
  ];

  rows.forEach((row) => assertPayloadRemainsText(row, payload));
  assert.equal(globalThis.pwned, undefined);
});

test("Clip To Ghost candidate rendering treats every parser field as text", () => {
  const doc = new FakeDocument();
  const card = doc.createElement("button");
  const payload = '<svg onload="globalThis.pwned=true">';
  renderClipCandidate(
    doc,
    card,
    {
      clipIndex: payload,
      trackIndex: payload,
      blockIndex: payload,
      derivedRaceTimeMs: payload,
      entListCount: payload,
      totalSamples: payload,
      totalSamples2: payload,
      sourcePath: payload,
    },
    { formatRaceTime: () => payload }
  );

  assertPayloadRemainsText(card, payload);
  assert.equal(globalThis.pwned, undefined);
});

test("ghost detail rendering treats replay parser metadata as text", () => {
  const doc = new FakeDocument();
  const details = doc.createElement("div");
  const payload = "<script>globalThis.pwned=true</script>";
  renderGhostDetails(doc, details, {
    ghostLogin: payload,
    ghostZone: payload,
    ghostTrigram: payload,
    ghostClubTag: payload,
    playerModel: { author: payload, id: payload },
    recordData: { gameVersion: payload },
    walltimeStartTimestamp: payload,
    walltimeEndTimestamp: payload,
  });

  assertPayloadRemainsText(details, payload);
  assert.equal(globalThis.pwned, undefined);
});

test("the shared HTML boundary sanitizes parsed browser DOM for fragment and set", async (context) => {
  const chrome = await findChromeExecutable();
  if (!chrome) {
    if (process.platform === "win32") assert.fail("Chrome is required for the Windows CI sanitizer test");
    context.skip("Chrome is unavailable on this platform");
    return;
  }

  const workdir = await mkdtemp(path.join(tmpdir(), "xjk-safe-html-"));
  try {
    const fixturePath = path.join(workdir, "fixture.html");
    const safeHtmlPath = fileURLToPath(new URL("../sites/shared/xjk-core/safe-html.js", import.meta.url));
    await writeFile(fixturePath, buildSafeHtmlBrowserFixture(pathToFileURL(safeHtmlPath).href), "utf8");

    let stdout;
    try {
      ({ stdout } = await execFileAsync(
        chrome,
        [
          "--headless=new",
          "--disable-background-networking",
          "--disable-default-apps",
          "--disable-extensions",
          "--disable-gpu",
          "--no-first-run",
          "--no-proxy-server",
          "--no-sandbox",
          `--user-data-dir=${path.join(workdir, "profile")}`,
          "--allow-file-access-from-files",
          "--dump-dom",
          pathToFileURL(fixturePath).href,
        ],
        { maxBuffer: 4 * 1024 * 1024, timeout: 30_000 }
      ));
    } catch (error) {
      if (error?.code === "EPERM" && !process.env.CI) {
        context.skip("the current sandbox does not permit a headless Chrome child process");
        return;
      }
      throw error;
    }
    const encodedResult = /<title>([^<]+)<\/title>/i.exec(stdout)?.[1];
    assert.ok(encodedResult && encodedResult !== "pending", "browser fixture must publish sanitizer results");
    const result = JSON.parse(Buffer.from(encodedResult, "base64").toString("utf8"));

    assert.equal(result.executed, false, "sanitized payloads must not execute");
    for (const boundary of [result.fragment, result.set]) {
      assert.deepEqual(boundary, {
        blockedElements: 0,
        eventAttributes: 0,
        srcdocAttributes: 0,
        badHrefRemoved: true,
        badImageSrcRemoved: true,
        badImageSrcsetRemoved: true,
        badImageStyleRemoved: true,
        badFormActionRemoved: true,
        externalUseHrefRemoved: true,
        blankRelHardened: true,
        safeImageKept: true,
        benignMarkupKept: true,
      });
    }
  } finally {
    await rm(workdir, { force: true, recursive: true });
  }
});

test("the shared HTML boundary rejects executable URL and style payloads", () => {
  const { isSafeSrcset, isSafeStyle, isSafeUrl } = globalThis.XjkSafeHtml;

  for (const unsafeUrl of [
    "javascript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "//malicious.example/payload",
  ]) {
    assert.equal(isSafeUrl(unsafeUrl), false, `${unsafeUrl} must not enter a URL attribute`);
  }

  for (const safeUrl of ["/account/", "./details", "#summary", "https://xjk.yt/"]) {
    assert.equal(isSafeUrl(safeUrl), true, `${safeUrl} should remain navigable`);
  }

  assert.equal(
    isSafeUrl("data:image/svg+xml,<svg onload=alert(1)>", { attributeName: "src", elementName: "IMG" }),
    false
  );
  assert.equal(isSafeUrl("data:image/png;base64,aGVsbG8=", { attributeName: "src", elementName: "IMG" }), true);
  assert.equal(isSafeSrcset("/small.png 1x, javascript:alert(1) 2x"), false);
  assert.equal(isSafeSrcset("/small.png 1x, /large.png 2x"), true);
  assert.equal(isSafeStyle("color: #fff; display: grid"), true);
  assert.equal(isSafeStyle("background: url(javascript:alert(1))"), false);
  assert.equal(isSafeStyle("width: expression(alert(1))"), false);
  assert.equal(isSafeStyle("background: u\\72l(javascript:alert(1))"), false);
});
