import { inlineAstText as inlineText } from "../ast.js";

const INLINE_TYPES = new Set(["text", "strong", "emphasis", "code_inline", "inlineCode", "link", "wiki_link", "image"]);

function collectHeadings(ast = []) {
  const headings = [];
  walkAst(ast, (node) => {
    if (node.type === "heading") {
      const level = Number(node.depth || node.level || 2);
      headings.push({
        id: node.id || "",
        level,
        text: node.text || inlineText(node.children || []) || "Untitled section",
      });
    }
  });
  return headings;
}

function collectLinks(ast = []) {
  const links = [];
  const wikiLinks = [];
  walkAst(ast, (node) => {
    if (node.type === "link") links.push({ href: node.href || "#", text: inlineText(node.children || []) });
    if (node.type === "wiki_link") {
      wikiLinks.push({ target: node.target || "", text: inlineText(node.children || []) });
    }
  });
  return { links, wikiLinks };
}

function collectMedia(ast = []) {
  const media = [];
  walkAst(ast, (node) => {
    if (node.type === "directive" && ["video", "image", "tool"].includes(node.name)) {
      media.push({
        kind: node.name,
        title: node.attrs?.title || node.attrs?.label || node.attrs?.key || node.name,
        syntax: directiveSyntax(node),
      });
    }
    if (node.type === "image") {
      media.push({
        kind: "inline image",
        title: node.alt || node.title || node.src || "Image",
        syntax: `![${node.alt || "image"}](${node.src || ""})`,
      });
    }
  });
  return media;
}

function collectAudit(page = {}, ast = [], store = null) {
  const issues = [];
  const { wikiLinks } = collectLinks(ast);
  wikiLinks.forEach((link) => {
    if (link.target && !store?.getPage?.(link.target)) {
      issues.push({
        title: `Missing wiki target: ${link.target}`,
        detail: link.text || "Wiki link does not resolve to a manifest page.",
      });
    }
  });
  walkAst(ast, (node) => {
    if (node.type !== "directive") return;
    const key = node.attrs?.key;
    if (!key) return;
    if ((node.name === "video" || node.name === "image") && !page.media?.[key]) {
      issues.push({
        title: `Missing media key: ${key}`,
        detail: `${node.name} directive has no matching page.media entry.`,
      });
    }
    if (node.name === "tool" && !page.tools?.[key]) {
      issues.push({
        title: `Missing tool key: ${key}`,
        detail: "Tool directive has no matching page.tools entry.",
      });
    }
  });
  return issues;
}

function directiveSyntax(node = {}) {
  const attrs = Object.entries(node.attrs || {})
    .map(([key, value]) => `${key}="${String(value).replaceAll('"', '\\"')}"`)
    .join(" ");
  return `::${node.name}${attrs ? `{${attrs}}` : ""}`;
}

function walkAst(value, visitor) {
  const nodes = Array.isArray(value) ? value : value?.children || [];
  nodes.forEach((node) => {
    visitor(node);
    if (node.children) {
      if (node.children.every((child) => INLINE_TYPES.has(child.type))) {
        node.children.forEach((child) => walkInline(child, visitor));
      } else {
        walkAst(node.children, visitor);
      }
    }
    if (node.items) node.items.forEach((item) => walkAst([item], visitor));
  });
}

function walkInline(node, visitor) {
  visitor(node);
  if (node.children) node.children.forEach((child) => walkInline(child, visitor));
}

export { collectAudit, collectHeadings, collectLinks, collectMedia };
