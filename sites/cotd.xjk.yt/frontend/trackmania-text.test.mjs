import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTrackmaniaMarkup,
  parseTrackmaniaText,
  setTrackmaniaText,
  trackmaniaPlainText,
} from "./trackmania-text.js";

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeNode {
  constructor(ownerDocument, nodeName, text = "") {
    this.ownerDocument = ownerDocument;
    this.nodeName = nodeName;
    this.children = [];
    this.classList = new FakeClassList();
    this.style = {};
    this.title = "";
    this.value = text;
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.value = "";
    this.children = [...nodes];
  }

  set className(value) {
    this.classList = new FakeClassList();
    this.classList.add(
      ...String(value || "")
        .split(/\s+/)
        .filter(Boolean)
    );
  }

  get className() {
    return [...this.classList.values].join(" ");
  }

  set textContent(value) {
    this.value = String(value ?? "");
    this.children = [];
  }

  get textContent() {
    return this.value + this.children.map((child) => child.textContent).join("");
  }
}

class FakeDocument {
  createDocumentFragment() {
    return new FakeNode(this, "#document-fragment");
  }

  createElement(tagName) {
    return new FakeNode(this, String(tagName).toUpperCase());
  }

  createTextNode(value) {
    return new FakeNode(this, "#text", String(value));
  }
}

function collectElementNames(node) {
  const names = node.nodeName.startsWith("#") ? [] : [node.nodeName];
  return names.concat(...node.children.map(collectElementNames));
}

test("parser converts Trackmania formatting codes into explicit text runs", () => {
  const parsed = parseTrackmaniaMarkup("$f00Red $oBold$z $$cash $tupper$z Mixed");

  assert.equal(parsed.plainText, "Red Bold $cash UPPER Mixed");
  assert.equal(parsed.runs[0].color, "#ff0000");
  assert.equal(parsed.runs[1].bold, true);
  assert.equal(parsed.runs[1].color, "#ff0000");
  assert.equal(parsed.runs.at(-2).text, "UPPER");
  assert.equal(parsed.runs.at(-1).color, "");
});

test("plain-text conversion removes link and width control codes", () => {
  assert.equal(trackmaniaPlainText("Start$l[https://xjk.yt]$wWide$m normal$< end", "fallback"), "StartWide normal end");
  assert.equal(trackmaniaPlainText("", "fallback"), "fallback");
  assert.equal(trackmaniaPlainText("literal$qcode"), "literal$qcode");
});

test("renderer keeps adjacent styled runs in one word", () => {
  const document = new FakeDocument();
  const parsed = parseTrackmaniaText("$f00Red$0f0Green", document);
  const word = parsed.fragment.children[0];

  assert.equal(parsed.fragment.children.length, 1);
  assert.equal(word.classList.contains("tm-word"), true);
  assert.equal(word.children.length, 2);
  assert.equal(word.children[0].style.color, "#ff0000");
  assert.equal(word.children[1].style.color, "#00ff00");
  assert.equal(parsed.fragment.textContent, "RedGreen");
});

test("DOM rendering treats map names as text rather than markup", () => {
  const document = new FakeDocument();
  const element = document.createElement("h1");
  const source = "$f0f<img src=x onerror=alert(1)>";

  assert.equal(setTrackmaniaText(element, source, "Unknown", { prefix: "Map: " }), "<img src=x onerror=alert(1)>");
  assert.equal(element.textContent, "Map: <img src=x onerror=alert(1)>");
  assert.equal(element.classList.contains("tm-text"), true);
  assert.equal(element.title, "<img src=x onerror=alert(1)>");
  assert.deepEqual(new Set(collectElementNames(element)), new Set(["H1", "SPAN"]));
});
