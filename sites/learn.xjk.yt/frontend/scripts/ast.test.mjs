import assert from "node:assert/strict";
import test from "node:test";

import { inlineAstText, normalizeAst } from "./ast.js";

test("Learn AST normalization accepts document wrappers and raw node arrays", () => {
  const children = [{ type: "text", value: "Lesson" }];
  assert.equal(normalizeAst(children), children);
  assert.equal(normalizeAst({ children }), children);
  assert.equal(normalizeAst({ body: children }), children);
  assert.deepEqual(normalizeAst(null), []);
});

test("Learn inline text extraction supports current and legacy node shapes", () => {
  assert.equal(
    inlineAstText([
      { type: "text", value: "Read " },
      { type: "strong", children: [{ type: "code_inline", value: "fast" }] },
      { type: "image", alt: "diagram" },
      { type: "wikiLink", label: "next" },
      { type: "inlineCode", value: "now" },
    ]),
    "Read fastdiagramnextnow"
  );
  assert.equal(inlineAstText({ type: "wikiLink", slug: "fallback" }), "fallback");
  assert.equal(inlineAstText(["plain", null, { text: "legacy" }]), "plainlegacy");
});
