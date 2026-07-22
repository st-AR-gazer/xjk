import assert from "node:assert/strict";
import test from "node:test";

import { renderAbuseRows } from "../sites/altered.xjk.yt/frontend/bannerbuilder/static/js/admin-rendering.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.style = {};
    this.textContent = "";
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }
}

const documentRef = {
  createElement(tagName) {
    return new FakeElement(tagName);
  },
};

test("banner administration renders untrusted API values through text nodes", () => {
  const container = new FakeElement("tbody");
  const maliciousIp = '<img src=x onerror="globalThis.compromised=true">';

  renderAbuseRows(container, [{ ip: maliciousIp, count: "<script>1</script>" }], { documentRef });

  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].children[0].textContent, maliciousIp);
  assert.equal(container.children[0].children[1].textContent, "<script>1</script>");
});
