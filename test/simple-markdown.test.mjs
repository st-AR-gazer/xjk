import assert from "node:assert/strict";
import test from "node:test";

import { renderSimpleMarkdown } from "../sites/shared/xjk-core/simple-markdown.js";

class TestNode {
  constructor(tagName, textContent = "") {
    this.tagName = tagName;
    this.textContent = textContent;
    this.children = [];
    this.href = "";
  }

  append(...children) {
    this.children.push(...children);
  }
}

const testDocument = {
  createDocumentFragment: () => new TestNode("fragment"),
  createElement: (tagName) => new TestNode(tagName),
  createTextNode: (text) => new TestNode("#text", text),
};

function descendants(node) {
  return [node, ...node.children.flatMap(descendants)];
}

test("simple markdown treats raw markup and unsafe links as text", () => {
  const fragment = renderSimpleMarkdown(
    testDocument,
    "# Safe title\n\n<script>alert('xss')</script>\n\n[bad](javascript:alert(1)) [good](https://example.com/docs)"
  );
  const nodes = descendants(fragment);

  assert.deepEqual(
    nodes.filter((node) => node.tagName === "script"),
    []
  );
  assert.ok(nodes.some((node) => node.tagName === "#text" && node.textContent.includes("<script>")));
  assert.equal(nodes.filter((node) => node.tagName === "a").length, 1);
  assert.equal(nodes.find((node) => node.tagName === "a")?.href, "https://example.com/docs");
  assert.ok(nodes.some((node) => node.tagName === "#text" && node.textContent === "bad"));
});
