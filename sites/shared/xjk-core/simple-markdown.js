import { safeNavigationHref } from "./dom-utils.js";

const INLINE_TOKEN = /\[([^\]]+)]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;

function appendInline(document, parent, value) {
  const source = String(value ?? "");
  let cursor = 0;

  for (const match of source.matchAll(INLINE_TOKEN)) {
    if (match.index > cursor) {
      parent.append(document.createTextNode(source.slice(cursor, match.index)));
    }

    if (match[1] !== undefined) {
      const href = safeNavigationHref(match[2]);
      if (href) {
        const link = document.createElement("a");
        link.href = href;
        link.textContent = match[1];
        parent.append(link);
      } else {
        parent.append(document.createTextNode(match[1]));
      }
    } else {
      const tagName = match[3] !== undefined ? "strong" : match[4] !== undefined ? "em" : "code";
      const element = document.createElement(tagName);
      element.textContent = match[3] ?? match[4] ?? match[5] ?? "";
      parent.append(element);
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) {
    parent.append(document.createTextNode(source.slice(cursor)));
  }
}

function appendTextBlock(document, parent, tagName, lines) {
  const element = document.createElement(tagName);
  appendInline(document, element, lines.join(" "));
  parent.append(element);
}

function renderSimpleMarkdown(document, source) {
  const fragment = document.createDocumentFragment();
  const lines = String(source ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  let paragraph = [];
  let list = null;
  let blockquote = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    appendTextBlock(document, fragment, "p", paragraph);
    paragraph = [];
  };
  const closeList = () => {
    list = null;
  };
  const flushBlockquote = () => {
    if (!blockquote.length) return;
    appendTextBlock(document, fragment, "blockquote", blockquote);
    blockquote = [];
  };
  const closeOpenBlocks = () => {
    flushParagraph();
    closeList();
    flushBlockquote();
  };

  for (const line of lines) {
    const text = line.trim();
    if (!text) {
      closeOpenBlocks();
      continue;
    }

    const heading = text.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeOpenBlocks();
      appendTextBlock(document, fragment, `h${heading[1].length}`, [heading[2]]);
      continue;
    }

    if (/^---+$/.test(text)) {
      closeOpenBlocks();
      fragment.append(document.createElement("hr"));
      continue;
    }

    const listItem = text.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      flushBlockquote();
      if (!list) {
        list = document.createElement("ul");
        fragment.append(list);
      }
      const item = document.createElement("li");
      appendInline(document, item, listItem[1]);
      list.append(item);
      continue;
    }

    const quoted = text.match(/^>\s*(.*)$/);
    if (quoted) {
      flushParagraph();
      closeList();
      if (quoted[1]) blockquote.push(quoted[1]);
      continue;
    }

    closeList();
    flushBlockquote();
    paragraph.push(text);
  }

  closeOpenBlocks();
  return fragment;
}

export { renderSimpleMarkdown };
