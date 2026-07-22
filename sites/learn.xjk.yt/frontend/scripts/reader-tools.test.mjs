import assert from "node:assert/strict";
import test from "node:test";

import { renderReaderTools } from "./reader-tools.js";
import { createReaderToolsController } from "./reader-tools/controller.js";
import { createFindController } from "./reader-tools/find-controller.js";
import { createReaderPanelRegistry } from "./reader-tools/panel-registry.js";

class FakeEventPanel {
  constructor({ drawer, progress, status, body, headings }) {
    this.drawer = drawer;
    this.progress = progress;
    this.status = status;
    this.body = body;
    this.headings = headings;
    this.listeners = new Map();
    this.scrollHeight = 1000;
    this.clientHeight = 400;
    this.scrollTop = 300;
    this.scrollCalls = [];
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, event) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size || 0;
  }

  querySelector(selector) {
    if (selector === "[data-reader-drawer]") return this.drawer;
    if (selector === "[data-reader-progress]") return this.progress;
    if (selector === "[data-reader-status]") return this.status;
    if (selector === ".learn-article-body") return this.body;
    if (selector === ".lesson-header") return this.headings[0] || null;
    if (selector.startsWith("#")) return this.headings.find(({ id }) => `#${id}` === selector) || null;
    return null;
  }

  querySelectorAll() {
    return this.headings;
  }

  scrollTo(options) {
    this.scrollCalls.push(options);
    this.scrollTop = options.top;
  }
}

class FakeDrawer {
  constructor() {
    this.hidden = true;
    this.dataset = {};
    this.controls = new Map();
    this.markup = "";
  }

  install(markup) {
    this.markup = markup;
    this.controls.clear();
    if (markup.includes("data-reader-find-input")) {
      this.controls.set("[data-reader-find-input]", {
        value: "",
        focused: false,
        focus() {
          this.focused = true;
        },
      });
      this.controls.set("[data-reader-find-status]", { textContent: "No matches" });
    }
    if (markup.includes("data-reader-note")) this.controls.set("[data-reader-note]", { value: "Existing note" });
    if (markup.includes("data-reader-suggestion")) {
      this.controls.set("[data-reader-suggestion]", { value: "" });
    }
  }

  querySelector(selector) {
    return this.controls.get(selector) || null;
  }

  replaceChildren() {
    this.markup = "";
    this.controls.clear();
  }
}

class FakeClickTarget {
  constructor(selector, dataset = {}) {
    this.selector = selector;
    this.dataset = dataset;
  }

  closest(selector) {
    return selector === this.selector ? this : null;
  }
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  toggle(value, enabled) {
    if (enabled) this.values.add(value);
    else this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeFindMark {
  constructor() {
    this.className = "";
    this.classList = new FakeClassList();
    this.textContent = "";
    this.offsetTop = 180;
    this.body = null;
  }

  replaceWith(textNode) {
    this.body.removeMark(this, textNode);
  }
}

class FakeFindTextNode {
  constructor(value, body = null) {
    this.nodeValue = value;
    this.body = body;
    this.parentElement = { closest: () => null };
  }

  replaceWith(fragment) {
    this.body.replaceText(this, fragment.children);
  }
}

class FakeFindBody {
  constructor(values) {
    this.textNodes = values.map((value) => new FakeFindTextNode(value, this));
    this.marks = [];
    this.normalizeCount = 0;
  }

  querySelectorAll(selector) {
    return selector === ".learn-find-hit" ? this.marks : [];
  }

  replaceText(textNode, children) {
    this.textNodes = this.textNodes.filter((candidate) => candidate !== textNode);
    children.forEach((child) => {
      child.body = this;
      if (child instanceof FakeFindMark) {
        child.offsetTop = 180 + this.marks.length * 40;
        this.marks.push(child);
      } else {
        this.textNodes.push(child);
      }
    });
  }

  removeMark(mark, textNode) {
    this.marks = this.marks.filter((candidate) => candidate !== mark);
    textNode.body = this;
    this.textNodes.push(textNode);
  }

  normalize() {
    this.normalizeCount += 1;
  }
}

class FakeFindDocument {
  createDocumentFragment() {
    return {
      children: [],
      append(node) {
        this.children.push(node);
      },
    };
  }

  createElement(tagName) {
    assert.equal(tagName, "mark");
    return new FakeFindMark();
  }

  createTextNode(value) {
    return new FakeFindTextNode(value);
  }

  createTreeWalker(body, _kind, filter) {
    const accepted = body.textNodes.filter((node) => filter.acceptNode(node) === 1);
    let index = -1;
    return {
      currentNode: null,
      nextNode() {
        index += 1;
        this.currentNode = accepted[index] || null;
        return Boolean(this.currentNode);
      },
    };
  }
}

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("reader panel registry preserves toolbar state and content-specific panels", (context) => {
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => null, setItem() {} } };
  context.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  const page = {
    slug: "alpha",
    title: "Alpha <Guide>",
    related: ["beta"],
    media: {},
    tools: {},
  };
  const ast = [
    { type: "heading", depth: 2, id: "start", children: [{ type: "text", value: "Start" }] },
    { type: "wiki_link", target: "missing", children: [{ type: "text", value: "Missing page" }] },
    { type: "directive", name: "video", attrs: { key: "missing-video", title: "Demo" } },
  ];
  const state = { authenticated: true, bookmarks: ["alpha"], notes: { alpha: { text: "Private" } } };
  const store = {
    getPage(slug) {
      return slug === "beta" ? { slug, title: "Beta" } : null;
    },
  };

  const toolbar = renderReaderTools({ page, ast, state, store });
  assert.match(toolbar, /aria-pressed="true"/);
  assert.match(toolbar, />Saved</);
  assert.match(toolbar, /2 reader notes/);

  const registry = createReaderPanelRegistry({ page, ast, state, store });
  assert.match(registry.render("outline"), /data-reader-jump="start"/);
  assert.match(registry.render("links"), /missing wiki/);
  assert.match(registry.render("media"), /data-embed-syntax/);
  assert.match(registry.render("notes"), /Private/);
  assert.match(registry.render("audit"), /Missing wiki target/);
  assert.match(registry.render("more"), /More reader tools|AST Inspector/);
  assert.equal(registry.render("unknown"), undefined);
});

test("reader-tools controller composes drawer, progress, navigation, notes, and suggestions", async () => {
  const drawer = new FakeDrawer();
  const progress = { style: {} };
  const status = { textContent: "" };
  const paragraph = { tagName: "P", innerText: "Opening paragraph", nextElementSibling: null };
  const detailsParagraph = { tagName: "P", innerText: "Details body", nextElementSibling: null };
  const details = {
    id: "details",
    tagName: "H3",
    innerText: "Details",
    offsetTop: 500,
    nextElementSibling: detailsParagraph,
  };
  paragraph.nextElementSibling = details;
  const intro = {
    id: "intro",
    tagName: "H2",
    innerText: "Introduction",
    offsetTop: 100,
    nextElementSibling: paragraph,
  };
  const body = { innerText: "Introduction\nOpening paragraph\nDetails\nDetails body", normalize() {} };
  const panel = new FakeEventPanel({ drawer, progress, status, body, headings: [intro, details] });
  const root = { querySelector: (selector) => (selector === ".learn-lesson-panel" ? panel : null) };
  const messages = [];
  const copied = [];
  const savedNotes = [];
  const suggestions = [];
  const pins = { alpha: { id: "intro", label: "Introduction" } };
  const scheduledFrames = [];
  const cleanup = createReaderToolsController(
    {
      root,
      page: { slug: "alpha", title: "Alpha", summary: "Summary" },
      ast: [],
      state: { authenticated: true, notes: { alpha: { text: "Existing note" } } },
      route: { query: new URLSearchParams("section=details") },
      showToast: (message) => messages.push(message),
      onSaveNote: (slug, text) => savedNotes.push({ slug, text }),
      onSubmitSuggestion: (payload) => suggestions.push(payload),
    },
    {
      copyText: (value) => {
        copied.push(value);
        return Promise.resolve();
      },
      document: new FakeFindDocument(),
      getPins: () => pins,
      navigator: {},
      nodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
      now: () => new Date("2026-01-10T00:00:00.000Z"),
      requestAnimationFrame: (callback) => scheduledFrames.push(callback),
      savePin: (slug, pin) => {
        pins[slug] = pin;
      },
      setHtml: (element, markup) => element.install(markup),
      window: {
        CSS: { escape: (value) => value },
        location: { origin: "https://learn.xjk.yt", pathname: "/" },
      },
    }
  );

  assert.equal(progress.style.width, "50.00%");
  assert.equal(panel.listenerCount("click"), 1);
  assert.equal(scheduledFrames.length, 1);
  scheduledFrames.shift()();
  assert.deepEqual(panel.scrollCalls.at(-1), { top: 428, behavior: "smooth" });

  panel.dispatch("click", {
    target: new FakeClickTarget("[data-reader-panel-trigger]", { readerPanelTrigger: "notes" }),
  });
  assert.equal(drawer.hidden, false);
  assert.equal(drawer.dataset.readerPanel, "notes");
  drawer.querySelector("[data-reader-note]").value = "Updated note";
  panel.dispatch("click", {
    target: new FakeClickTarget("[data-reader-action]", { readerAction: "save-note" }),
  });
  await flushPromises();
  assert.deepEqual(savedNotes, [{ slug: "alpha", text: "Updated note" }]);
  assert.equal(status.textContent, "Lesson note saved");

  panel.dispatch("click", {
    target: new FakeClickTarget("[data-reader-panel-trigger]", { readerPanelTrigger: "suggest" }),
  });
  const suggestion = drawer.querySelector("[data-reader-suggestion]");
  suggestion.value = "short";
  panel.dispatch("click", {
    target: new FakeClickTarget("[data-reader-action]", { readerAction: "submit-suggestion" }),
  });
  assert.equal(status.textContent, "Suggestion is too short");
  suggestion.value = "Please clarify this section.";
  panel.dispatch("click", {
    target: new FakeClickTarget("[data-reader-action]", { readerAction: "submit-suggestion" }),
  });
  await flushPromises();
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].slug, "alpha");
  assert.match(suggestions[0].context, /Details body/);
  assert.equal(suggestion.value, "");

  panel.scrollTop = 600;
  panel.dispatch("scroll", { target: panel });
  assert.equal(progress.style.width, "100.00%");
  panel.dispatch("click", {
    target: new FakeClickTarget("[data-reader-action]", { readerAction: "pin-section" }),
  });
  assert.deepEqual(pins.alpha, {
    id: "details",
    label: "Details",
    updatedAt: "2026-01-10T00:00:00.000Z",
  });
  panel.dispatch("click", {
    target: new FakeClickTarget("[data-reader-action]", { readerAction: "copy-section-link" }),
  });
  await flushPromises();
  assert.equal(copied.at(-1), "https://learn.xjk.yt/#/learn/alpha?section=details");

  panel.dispatch("keydown", { key: "Escape", target: new FakeClickTarget("") });
  assert.equal(drawer.hidden, true);
  cleanup();
  assert.equal(panel.listenerCount("click"), 0);
  assert.equal(panel.listenerCount("scroll"), 0);
  assert.ok(messages.includes("Suggestion sent"));
});

test("find controller marks every match, cycles active hits, and restores text on cleanup", () => {
  const body = new FakeFindBody(["Alpha one and alpha two", "Beta alpha"]);
  const drawer = new FakeDrawer();
  drawer.controls.set("[data-reader-find-status]", { textContent: "No matches" });
  const scrollCalls = [];
  const panel = {
    querySelector: (selector) => (selector === ".learn-article-body" ? body : null),
    scrollTo: (options) => scrollCalls.push(options),
  };
  const controller = createFindController({
    panel,
    getDrawer: () => drawer,
    documentRef: new FakeFindDocument(),
    nodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
  });

  controller.run("alpha");
  assert.deepEqual(controller.snapshot(), { count: 3, index: 0 });
  assert.equal(drawer.querySelector("[data-reader-find-status]").textContent, "1 / 3");
  assert.equal(body.marks[0].classList.contains("is-active"), true);
  controller.move(1);
  assert.deepEqual(controller.snapshot(), { count: 3, index: 1 });
  assert.equal(drawer.querySelector("[data-reader-find-status]").textContent, "2 / 3");
  assert.equal(body.marks[1].classList.contains("is-active"), true);
  assert.equal(scrollCalls.length, 2);

  controller.clear();
  assert.deepEqual(controller.snapshot(), { count: 0, index: -1 });
  assert.equal(body.marks.length, 0);
  assert.equal(body.normalizeCount, 2);
});
