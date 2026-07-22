import { escapeHtml } from "../../../shared/xjk-core/dom-utils.js?v=2";
import { inlineAstText as inlineText } from "./ast.js?v=2";
import { splitFrontmatter } from "./learn-frontmatter.js?v=2";
import { sanitizeUrl } from "./utils.js?v=2";

export { escapeHtml, sanitizeUrl };

const ALLOWED_DIRECTIVES = new Set(["video", "image", "tool", "tip", "callout"]);
const CONTAINER_DIRECTIVES = new Set(["tip", "callout"]);
const CALLOUT_TYPES = new Set(["info", "note", "warning", "danger", "success", "coach"]);
const RAW_HTML_PATTERN = /<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s[^<>]*)?>/;

export function parseLearnMarkdown(source, options = {}) {
  const { frontmatter, body } = splitFrontmatter(source);
  const state = createParseState(options);
  const children = parseBlocks(body.split("\n"), state);
  const document = {
    type: "document",
    frontmatter,
    children,
    warnings: state.warnings,
  };

  return {
    ...document,
    ...collectDocumentInfo(document),
  };
}

export function renderLearnMarkdown(source, options = {}) {
  const ast = parseLearnMarkdown(source, options);

  return {
    ast,
    frontmatter: ast.frontmatter,
    html: renderAstToHtml(ast, options),
    headings: ast.headings,
    links: ast.links,
    wikiLinks: ast.wikiLinks,
    directives: ast.directives,
    warnings: ast.warnings,
  };
}

export function renderAstToHtml(ast, options = {}) {
  if (!ast || ast.type !== "document") {
    throw new TypeError("renderAstToHtml expects a Learn markdown document AST.");
  }

  return ast.children
    .map((node) => renderBlock(node, options))
    .filter(Boolean)
    .join("\n");
}

export function slugify(value, fallback = "section") {
  const slug = String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

function createParseState(options) {
  return {
    options,
    warnings: [],
    headingCounts: new Map(),
  };
}

function parseBlocks(lines, state) {
  const nodes = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      const parsed = parseFence(lines, index, fence);
      nodes.push(parsed.node);
      index = parsed.nextIndex;
      continue;
    }

    const container = line.match(/^ {0,3}:::(\w[\w-]*)(.*)$/);
    if (container) {
      const parsed = parseContainerDirective(lines, index, container, state);
      nodes.push(parsed.node);
      index = parsed.nextIndex;
      continue;
    }

    const leafDirective = line.match(/^ {0,3}::(\w[\w-]*)(.*)$/);
    if (leafDirective) {
      if (CONTAINER_DIRECTIVES.has(leafDirective[1].toLowerCase())) {
        const parsed = parseDoubleColonContainerDirective(lines, index, leafDirective, state);
        nodes.push(parsed.node);
        index = parsed.nextIndex;
        continue;
      }

      nodes.push(parseLeafDirective(line, leafDirective, state));
      index += 1;
      continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const children = parseInline(heading[2], state);
      const text = inlineText(children);
      nodes.push({
        type: "heading",
        depth: heading[1].length,
        id: uniqueHeadingId(text, state),
        text,
        children,
      });
      index += 1;
      continue;
    }

    if (isThematicBreak(line)) {
      nodes.push({ type: "thematic_break" });
      index += 1;
      continue;
    }

    if (isListLine(line)) {
      const parsed = parseList(lines, index, state);
      nodes.push(parsed.node);
      index = parsed.nextIndex;
      continue;
    }

    if (/^ {0,3}>\s?/.test(line)) {
      const parsed = parseBlockquote(lines, index, state);
      nodes.push(parsed.node);
      index = parsed.nextIndex;
      continue;
    }

    const parsed = parseParagraph(lines, index, state);
    nodes.push(parsed.node);
    index = parsed.nextIndex;
  }

  return nodes;
}

function parseFence(lines, startIndex, fence) {
  const marker = fence[1];
  const markerChar = marker[0];
  const language = fence[2].trim().split(/\s+/)[0] || "";
  const content = [];
  let index = startIndex + 1;

  while (index < lines.length) {
    if (new RegExp(`^ {0,3}\\${markerChar}{${marker.length},}\\s*$`).test(lines[index])) {
      return {
        node: { type: "code", language, value: content.join("\n") },
        nextIndex: index + 1,
      };
    }

    content.push(lines[index]);
    index += 1;
  }

  return {
    node: { type: "code", language, value: content.join("\n") },
    nextIndex: index,
  };
}

function parseContainerDirective(lines, startIndex, match, state) {
  return parseDirectiveContainer(lines, startIndex, match, state, {
    closePattern: /^ {0,3}:::\s*$/,
    isAllowed: (name) => ALLOWED_DIRECTIVES.has(name) && CONTAINER_DIRECTIVES.has(name),
  });
}

function parseDoubleColonContainerDirective(lines, startIndex, match, state) {
  return parseDirectiveContainer(lines, startIndex, match, state, {
    closePattern: /^ {0,3}::\s*$/,
    isAllowed: (name) => ALLOWED_DIRECTIVES.has(name),
  });
}

function parseDirectiveContainer(lines, startIndex, match, state, { closePattern, isAllowed }) {
  const name = match[1].toLowerCase();
  const attrs = parseAttributes(match[2]);
  const content = [];
  let index = startIndex + 1;
  let closed = false;

  while (index < lines.length) {
    if (closePattern.test(lines[index])) {
      closed = true;
      break;
    }

    content.push(lines[index]);
    index += 1;
  }

  if (!closed) {
    state.warnings.push({ type: "directive_unclosed", directive: name, line: startIndex + 1 });
  }

  if (!isAllowed(name)) {
    state.warnings.push({ type: "directive_escaped", directive: name, line: startIndex + 1 });
    return {
      node: {
        type: "paragraph",
        children: [{ type: "text", value: lines.slice(startIndex, index + (closed ? 1 : 0)).join("\n") }],
      },
      nextIndex: index + (closed ? 1 : 0),
    };
  }

  return {
    node: {
      type: "directive",
      name,
      attrs,
      children: parseBlocks(content, state),
    },
    nextIndex: index + (closed ? 1 : 0),
  };
}

function parseLeafDirective(line, match, state) {
  const name = match[1].toLowerCase();
  const attrs = parseAttributes(match[2]);

  if (!ALLOWED_DIRECTIVES.has(name) || CONTAINER_DIRECTIVES.has(name)) {
    state.warnings.push({ type: "directive_escaped", directive: name, line: null });
    return { type: "paragraph", children: [{ type: "text", value: line.trim() }] };
  }

  return {
    type: "directive",
    name,
    attrs,
    children: [],
  };
}

function parseAttributes(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return {};

  const body = raw.startsWith("{") && raw.endsWith("}") ? raw.slice(1, -1) : raw;
  const attrs = {};
  const matcher = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*("([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|[^\s,}]+)/g;
  let match;

  while ((match = matcher.exec(body))) {
    const key = match[1];
    const rawValue = match[3] ?? match[4] ?? match[2];
    attrs[key] = rawValue.replace(/\\(["'\\])/g, "$1");
  }

  return attrs;
}

function isThematicBreak(line) {
  return /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

function isListLine(line) {
  return /^ {0,3}(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
}

function parseList(lines, startIndex, state) {
  const ordered = /^ {0,3}\d+[.)]\s+/.test(lines[startIndex]);
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    const marker = ordered ? line.match(/^ {0,3}\d+[.)]\s+(.*)$/) : line.match(/^ {0,3}[-*+]\s+(.*)$/);

    if (!marker) break;

    items.push({
      type: "list_item",
      children: parseInline(marker[1], state),
    });
    index += 1;
  }

  return {
    node: { type: "list", ordered, items },
    nextIndex: index,
  };
}

function parseBlockquote(lines, startIndex, state) {
  const content = [];
  let index = startIndex;

  while (index < lines.length && /^ {0,3}>\s?/.test(lines[index])) {
    content.push(lines[index].replace(/^ {0,3}>\s?/, ""));
    index += 1;
  }

  return {
    node: { type: "blockquote", children: parseBlocks(content, state) },
    nextIndex: index,
  };
}

function parseParagraph(lines, startIndex, state) {
  const content = [];
  let index = startIndex;

  while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
    content.push(lines[index].trim());
    index += 1;
  }

  const value = content.join(" ");
  if (RAW_HTML_PATTERN.test(value)) {
    state.warnings.push({ type: "raw_html_escaped", value });
  }

  return {
    node: { type: "paragraph", children: parseInline(value, state) },
    nextIndex: index,
  };
}

function isBlockStart(line) {
  return /^ {0,3}(?:#{1,6}\s+|`{3,}|~{3,}|::\w|:::\w|>\s?|[-*_](?:\s*[-*_]){2,}\s*$|[-*+]\s+|\d+[.)]\s+)/.test(line);
}

function uniqueHeadingId(text, state) {
  const base = slugify(text, "section");
  const current = state.headingCounts.get(base) ?? 0;
  state.headingCounts.set(base, current + 1);
  return current === 0 ? base : `${base}-${current + 1}`;
}

function parseInline(value, state) {
  const text = String(value ?? "");
  const nodes = [];
  let index = 0;

  const pushText = (chunk) => {
    if (!chunk) return;
    const last = nodes[nodes.length - 1];
    if (last?.type === "text") {
      last.value += chunk;
    } else {
      nodes.push({ type: "text", value: chunk });
    }
  };

  while (index < text.length) {
    if (text[index] === "\\" && index + 1 < text.length) {
      pushText(text[index + 1]);
      index += 2;
      continue;
    }

    if (text[index] === "`") {
      const close = text.indexOf("`", index + 1);
      if (close !== -1) {
        nodes.push({ type: "code_inline", value: text.slice(index + 1, close) });
        index = close + 1;
        continue;
      }
    }

    if (text.startsWith("![", index)) {
      const parsed = parseMarkdownLink(text, index + 1);
      if (parsed) {
        nodes.push({
          type: "image",
          alt: inlineText(parseInline(parsed.label, state)),
          src: parsed.href,
          title: parsed.title,
        });
        index = parsed.nextIndex;
        continue;
      }
    }

    if (text.startsWith("[[", index)) {
      const close = text.indexOf("]]", index + 2);
      if (close !== -1) {
        const raw = text.slice(index + 2, close).trim();
        const separator = raw.indexOf("|");
        const target = separator === -1 ? raw : raw.slice(0, separator).trim();
        const label = separator === -1 ? raw : raw.slice(separator + 1).trim();
        nodes.push({
          type: "wiki_link",
          target,
          children: parseInline(label || target, state),
        });
        index = close + 2;
        continue;
      }
    }

    if (text[index] === "[") {
      const parsed = parseMarkdownLink(text, index);
      if (parsed) {
        nodes.push({
          type: "link",
          href: parsed.href,
          title: parsed.title,
          children: parseInline(parsed.label, state),
        });
        index = parsed.nextIndex;
        continue;
      }
    }

    if (text.startsWith("**", index) || text.startsWith("__", index)) {
      const marker = text.slice(index, index + 2);
      const close = text.indexOf(marker, index + 2);
      if (close !== -1) {
        nodes.push({ type: "strong", children: parseInline(text.slice(index + 2, close), state) });
        index = close + 2;
        continue;
      }
    }

    if (text[index] === "*" || text[index] === "_") {
      const marker = text[index];
      const close = text.indexOf(marker, index + 1);
      if (close !== -1) {
        nodes.push({ type: "emphasis", children: parseInline(text.slice(index + 1, close), state) });
        index = close + 1;
        continue;
      }
    }

    const next = nextInlineSpecial(text, index + 1);
    pushText(text.slice(index, next));
    index = next;
  }

  return nodes;
}

function parseMarkdownLink(text, startIndex) {
  const labelStart = startIndex + 1;
  const labelEnd = findClosingBracket(text, labelStart);
  if (labelEnd === -1 || text[labelEnd + 1] !== "(") return null;

  const destinationEnd = findClosingParen(text, labelEnd + 2);
  if (destinationEnd === -1) return null;

  const destination = parseLinkDestination(text.slice(labelEnd + 2, destinationEnd).trim());
  return {
    label: text.slice(labelStart, labelEnd),
    href: destination.href,
    title: destination.title,
    nextIndex: destinationEnd + 1,
  };
}

function findClosingBracket(text, startIndex) {
  let depth = 0;
  for (let index = startIndex; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }

    if (text[index] === "[") depth += 1;
    if (text[index] === "]") {
      if (depth === 0) return index;
      depth -= 1;
    }
  }

  return -1;
}

function findClosingParen(text, startIndex) {
  let quote = "";
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote && text[index - 1] !== "\\") quote = "";
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === ")") return index;
  }

  return -1;
}

function parseLinkDestination(raw) {
  if (!raw) return { href: "", title: "" };

  const titleMatch = raw.match(/^(\S+)\s+["'](.+)["']$/);
  if (titleMatch) {
    return { href: titleMatch[1], title: titleMatch[2] };
  }

  return { href: raw, title: "" };
}

function nextInlineSpecial(text, startIndex) {
  const specials = ["\\", "`", "![", "[[", "[", "**", "__", "*", "_"];
  let next = text.length;

  for (const marker of specials) {
    const found = text.indexOf(marker, startIndex);
    if (found !== -1 && found < next) next = found;
  }

  return next;
}

function collectDocumentInfo(document) {
  const headings = [];
  const links = [];
  const wikiLinks = [];
  const directives = [];
  const images = [];

  const visitBlock = (node) => {
    if (node.type === "heading") headings.push({ depth: node.depth, id: node.id, text: node.text });
    if (node.type === "directive") directives.push({ name: node.name, attrs: node.attrs });
    if (node.children) {
      if (isInlineChildren(node.children)) {
        node.children.forEach(visitInline);
      } else {
        node.children.forEach(visitBlock);
      }
    }
    if (node.items) node.items.forEach((item) => item.children.forEach(visitInline));
  };

  const visitInline = (node) => {
    if (node.type === "link") links.push({ href: node.href, title: node.title, text: inlineText(node.children) });
    if (node.type === "wiki_link") wikiLinks.push({ target: node.target, text: inlineText(node.children) });
    if (node.type === "image") images.push({ src: node.src, alt: node.alt, title: node.title });
    if (node.children) node.children.forEach(visitInline);
  };

  document.children.forEach(visitBlock);
  return { headings, links, wikiLinks, directives, images };
}

function isInlineChildren(children) {
  return children.every((node) =>
    ["text", "strong", "emphasis", "code_inline", "link", "wiki_link", "image"].includes(node.type)
  );
}

function renderBlock(node, options) {
  switch (node.type) {
    case "heading":
      return `<h${node.depth} id="${escapeHtml(node.id)}">${renderInline(node.children, options)}</h${node.depth}>`;
    case "paragraph":
      return `<p>${renderInline(node.children, options)}</p>`;
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const items = node.items.map((item) => `<li>${renderInline(item.children, options)}</li>`).join("");
      return `<${tag}>${items}</${tag}>`;
    }
    case "blockquote":
      return `<blockquote>${node.children.map((child) => renderBlock(child, options)).join("\n")}</blockquote>`;
    case "code": {
      const languageClass = node.language ? ` class="language-${escapeHtml(slugify(node.language, "text"))}"` : "";
      return `<pre><code${languageClass}>${escapeHtml(node.value)}</code></pre>`;
    }
    case "directive":
      return renderDirective(node, options);
    case "thematic_break":
      return "<hr />";
    default:
      return "";
  }
}

function renderInline(nodes, options) {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return escapeHtml(node.value);
        case "strong":
          return `<strong>${renderInline(node.children, options)}</strong>`;
        case "emphasis":
          return `<em>${renderInline(node.children, options)}</em>`;
        case "code_inline":
          return `<code>${escapeHtml(node.value)}</code>`;
        case "link":
          return renderLink(node, options);
        case "wiki_link":
          return renderWikiLink(node, options);
        case "image":
          return renderInlineImage(node, options);
        default:
          return "";
      }
    })
    .join("");
}

function renderLink(node, options) {
  const href = sanitizeUrl(node.href, options);
  const label = renderInline(node.children, options);
  if (!href) return `<span class="learn-unsafe-link">${label}</span>`;

  const title = node.title ? ` title="${escapeHtml(node.title)}"` : "";
  return `<a href="${escapeHtml(href)}"${title}>${label}</a>`;
}

function renderWikiLink(node, options) {
  const rawHref =
    typeof options.wikiResolver === "function"
      ? options.wikiResolver(node.target, node)
      : `#/lesson/${slugify(node.target)}`;
  const href = sanitizeUrl(rawHref, options);
  const label = renderInline(node.children, options);

  if (!href) {
    return `<span class="learn-wiki-link is-unresolved" data-wiki-target="${escapeHtml(node.target)}">${label}</span>`;
  }

  return `<a class="learn-wiki-link" href="${escapeHtml(href)}" data-wiki-target="${escapeHtml(node.target)}">${label}</a>`;
}

function renderInlineImage(node, options) {
  const src = sanitizeUrl(node.src, options);
  const title = node.title ? ` title="${escapeHtml(node.title)}"` : "";
  if (!src) return `<span class="learn-image-missing">${escapeHtml(node.alt || "Image removed")}</span>`;

  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(node.alt)}"${title} loading="lazy" decoding="async" />`;
}

function renderDirective(node, options) {
  switch (node.name) {
    case "video":
      return renderVideoDirective(node, options);
    case "image":
      return renderImageDirective(node, options);
    case "tool":
      return renderToolDirective(node, options);
    case "tip":
      return renderAsideDirective(node, options, "learn-tip", "Tip");
    case "callout":
      return renderAsideDirective(node, options, "learn-callout", "Callout");
    default:
      return "";
  }
}

function renderVideoDirective(node, options) {
  const src = sanitizeUrl(node.attrs.src, options);
  const title = node.attrs.title || "Lesson video";
  const poster = sanitizeUrl(node.attrs.poster, options);
  const duration = node.attrs.duration
    ? `<span class="learn-video-duration">${escapeHtml(node.attrs.duration)}</span>`
    : "";
  const frame = src
    ? `<iframe src="${escapeHtml(src)}" title="${escapeHtml(title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
    : `<p class="learn-directive-warning">Video source removed.</p>`;
  const posterAttr = poster ? ` data-poster="${escapeHtml(poster)}"` : "";

  return [
    `<figure class="learn-directive learn-video"${posterAttr}>`,
    `<div class="learn-video-frame">${frame}</div>`,
    `<figcaption><span>${escapeHtml(title)}</span>${duration}</figcaption>`,
    "</figure>",
  ].join("");
}

function renderImageDirective(node, options) {
  const src = sanitizeUrl(node.attrs.src, options);
  const alt = node.attrs.alt || "";
  const caption = node.attrs.caption || node.attrs.title || "";
  const image = src
    ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />`
    : `<p class="learn-directive-warning">Image source removed.</p>`;
  const captionHtml = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "";

  return `<figure class="learn-directive learn-image">${image}${captionHtml}</figure>`;
}

function renderToolDirective(node, options) {
  const href = sanitizeUrl(node.attrs.href, options);
  const label = node.attrs.label || "Open tool";
  const description = node.attrs.description || "";
  const link = href ? `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>` : `<span>${escapeHtml(label)}</span>`;
  const descriptionHtml = description ? `<p>${escapeHtml(description)}</p>` : "";

  return `<aside class="learn-directive learn-tool">${link}${descriptionHtml}</aside>`;
}

function renderAsideDirective(node, options, className, fallbackTitle) {
  const rawType = node.name === "callout" ? String(node.attrs.type || "info").toLowerCase() : "";
  const type = CALLOUT_TYPES.has(rawType) ? rawType : "info";
  const title = node.attrs.title || fallbackTitle;
  const typeAttr = node.name === "callout" ? ` data-type="${escapeHtml(type)}"` : "";
  const children = node.children.map((child) => renderBlock(child, options)).join("\n");

  return `<aside class="learn-directive ${className}"${typeAttr}><strong>${escapeHtml(title)}</strong>${children}</aside>`;
}
