import { difficultyLabel, escapeHtml, pageTitle, slugToHash } from "./utils.js";
import { normalizeAst } from "./ast.js";

export function toDiscordSummary(page = {}, ast = []) {
  const nodes = normalizeAst(ast);
  const description = page.summary || page.description || firstParagraph(nodes) || astToPlainText(nodes).slice(0, 240);

  return {
    title: pageTitle(page),
    description: clampText(description, 240),
    url: page.href || slugToHash(page.slug || ""),
    tags: page.tags || [],
    difficulty: page.difficulty || page.level || "guide",
    time: page.time || page.duration || "",
    steps: extractOrderedSteps(nodes).slice(0, 5),
    embeds: collectEmbeds(nodes).map((node) => ({
      type: node.name || node.type,
      key: node.attrs?.key,
      kind: node.attrs?.kind,
      title: node.attrs?.title || node.attrs?.label,
    })),
    related: page.related || [],
  };
}

export function createDiscordPreviewModel(page = {}, ast = []) {
  return toDiscordSummary(page, ast);
}

export function renderDiscordPreview(page = {}, ast = []) {
  return renderDiscordPreviewHtml(toDiscordSummary(page, ast));
}

export function renderDiscordPreviewHtml(summary = {}) {
  const tags = (summary.tags || [])
    .slice(0, 5)
    .map((tag) => `<span class="learn-pill">#${escapeHtml(tag)}</span>`)
    .join("");
  const fields = [
    summary.difficulty ? difficultyLabel(summary.difficulty) : "",
    summary.time || "",
    `${(summary.embeds || []).length} embeds`,
  ].filter(Boolean);

  return `<article class="learn-discord-card discord-preview" data-lesson-slug="${escapeHtml(summary.url || "")}">
    <div class="learn-card-label">Discord mirror preview</div>
    <a class="learn-discord-title" href="${escapeHtml(summary.url || "#")}">${escapeHtml(summary.title || "Untitled lesson")}</a>
    <p class="learn-discord-description">${escapeHtml(summary.description || "No summary available.")}</p>
    <div class="learn-meta-row">
      ${fields.map((field) => `<span class="learn-pill">${escapeHtml(field)}</span>`).join("")}
      ${tags}
    </div>
    <strong>Steps</strong>
    ${(summary.steps || []).length ? `<ol>${summary.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>` : `<p class="learn-card-text">No ordered steps found in this AST.</p>`}
    <strong>Embeds</strong>
    <p class="learn-card-text">${(summary.embeds || []).length ? summary.embeds.map((embed) => `${embed.type}:${embed.title || embed.kind || embed.key || "embed"}`).join(" / ") : "No media embeds."}</p>
  </article>`;
}

export function renderDiscordMarkdown(pageOrSummary = {}, ast = []) {
  const summary =
    pageOrSummary.description !== undefined && pageOrSummary.embeds !== undefined
      ? pageOrSummary
      : toDiscordSummary(pageOrSummary, ast);
  const tags = (summary.tags || [])
    .slice(0, 5)
    .map((tag) => `#${tag}`)
    .join(" ");
  return [`**${summary.title || "Untitled lesson"}**`, summary.description || "", tags, summary.url || ""]
    .filter(Boolean)
    .join("\n");
}

export function astToPlainText(ast = []) {
  const parts = [];
  walkAst(normalizeAst(ast), (node) => {
    if (node.type === "text" || node.type === "code_inline") parts.push(node.value || "");
    if (node.type === "image" && node.alt) parts.push(node.alt);
    return true;
  });
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function collectEmbeds(ast = []) {
  const embeds = [];
  walkAst(normalizeAst(ast), (node) => {
    if (node.type === "directive" && ["video", "image", "tool", "tip", "callout"].includes(node.name)) {
      embeds.push(node);
    }
    if (["video", "image", "tool", "tip", "callout"].includes(node.type)) embeds.push(node);
    return true;
  });
  return embeds;
}

export function extractOrderedSteps(ast = []) {
  const steps = [];
  walkAst(normalizeAst(ast), (node) => {
    if (node.type !== "list" || !node.ordered) return true;
    for (const item of node.items || node.children || []) {
      const text = astToPlainText(item);
      if (text) steps.push(text);
    }
    return true;
  });
  return steps;
}

function firstParagraph(nodes = []) {
  let value = "";
  walkAst(nodes, (node) => {
    if (node.type === "paragraph") {
      value = astToPlainText(node);
      return false;
    }
    return true;
  });
  return value;
}

function walkAst(value, visitor) {
  const nodes = Array.isArray(value) ? value : [value];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const shouldContinue = visitor(node);
    if (shouldContinue === false) return false;
    const children = node.children || node.items || [];
    if (walkAst(children, visitor) === false) return false;
  }
  return true;
}

function clampText(value = "", limit = 240) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 3).trim()}...`;
}
