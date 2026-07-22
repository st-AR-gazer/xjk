import assert from "node:assert/strict";
import test from "node:test";

import { normalizeLineEndings, parseFrontmatter, splitFrontmatter } from "./learn-frontmatter.js";
import { parseLearnMarkdown, renderLearnMarkdown } from "./learn-markdown.js";
import { renderAst } from "./render-lesson.js";
import { sanitizeUrl } from "./utils.js";

function renderPublicLesson(markdown) {
  return renderAst(parseLearnMarkdown(markdown));
}

function urlAttributes(html) {
  return [...String(html).matchAll(/\b(?:href|src)="([^"]*)"/g)].map((match) => match[1]);
}

test("Learn frontmatter parsing is shared without changing runtime scalar behavior", () => {
  const source = [
    "---",
    "title: 'Driving, quickly'",
    "published: true",
    "weight: 0.72",
    "tags: [rally, 'speed, retention']",
    "authors:",
    "  - Alice",
    "  - Bob",
    "---",
    "# Lesson",
  ].join("\r\n");

  assert.equal(normalizeLineEndings("one\r\ntwo\rthree"), "one\ntwo\nthree");
  assert.deepEqual(splitFrontmatter(source), {
    frontmatter: {
      title: "Driving, quickly",
      published: true,
      weight: "0.72",
      tags: ["rally", "speed, retention"],
      authors: ["Alice", "Bob"],
    },
    body: "# Lesson",
  });
});

test("content generation can opt into numeric frontmatter values", () => {
  assert.deepEqual(parseFrontmatter("weight: 0.72\nposition: -3\ntitle: '12'", { parseNumbers: true }), {
    weight: 0.72,
    position: -3,
    title: "12",
  });
});

test("missing frontmatter delimiters preserve the normalized source", () => {
  assert.deepEqual(splitFrontmatter("title: demo\r\n# Lesson"), {
    frontmatter: {},
    body: "title: demo\n# Lesson",
  });
  assert.deepEqual(splitFrontmatter("---\r\ntitle: demo"), {
    frontmatter: {},
    body: "---\ntitle: demo",
  });
});

test("both Learn container syntaxes use the same block parser", () => {
  const tripleColon = parseLearnMarkdown(':::tip{title="Triple"}\nNested **content**\n:::');
  const doubleColon = parseLearnMarkdown('::tip{title="Double"}\nNested **content**\n::');

  assert.equal(tripleColon.children[0].type, "directive");
  assert.equal(doubleColon.children[0].type, "directive");
  assert.equal(tripleColon.children[0].name, "tip");
  assert.equal(doubleColon.children[0].name, "tip");
  assert.equal(tripleColon.children[0].children[0].type, "paragraph");
  assert.equal(doubleColon.children[0].children[0].type, "paragraph");
  assert.deepEqual(tripleColon.warnings, []);
  assert.deepEqual(doubleColon.warnings, []);
});

test("container parsing retains escaped and unclosed warnings", () => {
  const escaped = parseLearnMarkdown(":::video\ncontent\n:::");
  const unclosed = parseLearnMarkdown("::callout\ncontent");

  assert.equal(escaped.children[0].type, "paragraph");
  assert.deepEqual(escaped.warnings, [{ type: "directive_escaped", directive: "video", line: 1 }]);
  assert.deepEqual(unclosed.warnings, [{ type: "directive_unclosed", directive: "callout", line: 1 }]);
});

test("the shared Learn URL policy rejects browser-normalized executable schemes", () => {
  for (const separator of ["\t", "\n", "\r", "\f", "\u0000"]) {
    assert.equal(sanitizeUrl(`java${separator}script:alert(1)`), "");
    assert.equal(sanitizeUrl(`vb${separator}script:alert(1)`), "");
    assert.equal(sanitizeUrl(`da${separator}ta:text/html,unsafe`), "");
    assert.equal(sanitizeUrl(`fi${separator}le:///etc/passwd`), "");
  }

  assert.equal(sanitizeUrl("#/learn/underwater"), "#/learn/underwater");
  assert.equal(sanitizeUrl("/media/diagram.png"), "/media/diagram.png");
  assert.equal(sanitizeUrl("https://example.com/guide?q=car setup"), "https://example.com/guide?q=car setup");
  assert.equal(sanitizeUrl("mailto:learn@example.com"), "mailto:learn@example.com");
});

test("public lesson rendering applies the shared URL policy to authored href and src values", () => {
  const malicious = renderPublicLesson(
    [
      '::tool {href="java\tscript:alert(document.domain)" label="Unsafe tool"}',
      '::image {src="data:text/html,<svg onload=alert(1)>" alt="Unsafe image"}',
      '::video {src="vbscript:alert(1)" poster="file:///etc/passwd" title="Unsafe video"}',
    ].join("\n")
  );

  assert.match(malicious, /Unsafe tool/);
  assert.match(malicious, /Image source removed\./);
  assert.doesNotMatch(malicious, /(?:java\s*script|vb\s*script|data|file):/i);
  for (const value of urlAttributes(malicious)) {
    assert.equal(new URL(value, "https://learn.xjk.yt/").protocol, "https:");
  }

  const preview = renderLearnMarkdown('::tool {href="java\tscript:alert(1)" label="Unsafe preview"}').html;
  assert.doesNotMatch(preview, /href=/);

  const safe = renderPublicLesson(
    [
      '::tool {href="/tools/ghost" label="Relative tool"}',
      '::tool {href="https://example.com/tool" label="HTTPS tool"}',
      '::tool {href="mailto:learn@example.com" label="Email Learn"}',
      '::image {src="/media/diagram.png" alt="Relative image"}',
      '::image {src="https://cdn.example.com/diagram.png" alt="HTTPS image"}',
    ].join("\n")
  );

  assert.match(safe, /href="\/tools\/ghost"/);
  assert.match(safe, /href="https:\/\/example\.com\/tool"/);
  assert.match(safe, /href="mailto:learn@example\.com"/);
  assert.match(safe, /src="\/media\/diagram\.png"/);
  assert.match(safe, /src="https:\/\/cdn\.example\.com\/diagram\.png"/);
});
