import "../../../shared/xjk-core/safe-html.js?v=2";
import { renderGhostComparison, renderInputTimeline, renderToolEmbed } from "./embeds.js";
import { parseLearnMarkdown } from "./learn-markdown.js";
import { renderDiscordPreview } from "./discord-preview.js";
import { bodyAst, renderAst } from "./render-lesson.js";
import { copyText, escapeHtml, readJson, renderIcon, slugToHash, writeJson } from "./utils.js";

const TOOLS_KEY = "xjk.learn.tools";

export const LEARN_TOOLS = [
  {
    id: "ghost",
    icon: "spark",
    title: "Ghost Comparison",
    summary: "Compare the lesson reference against a working line.",
  },
  {
    id: "inputs",
    icon: "density",
    title: "Input Timeline",
    summary: "Inspect steering, brake, throttle, pitch, and speed rhythm.",
  },
  {
    id: "markdown",
    icon: "library",
    title: "Markdown Playground",
    summary: "Draft Learn markdown and preview the AST output.",
  },
  {
    id: "discord",
    icon: "message",
    title: "Discord Mirror Preview",
    summary: "Preview the lesson card used by Discord mirrors.",
  },
  {
    id: "export",
    icon: "link",
    title: "Manifest Export",
    summary: "Copy or download the current static manifest snapshot.",
  },
];

const DEFAULT_SAMPLE = `# Markdown Playground

## Goal

Use **Learn markdown** with declarative embeds and wiki links like [[underwater/rally-car/mechanics-primer|Rally Underwater Mechanics Primer]].

::video{key="demo"}

::tool{kind="ghost-comparison" key="ghost-basic" title="Ghost Comparison"}

::callout{type="warning" title="Common trap"}
Raw HTML is escaped. Keep embeds declarative so Discord can mirror them later.
::
`;

function normalizeToolId(value = "") {
  const key = String(value || "").toLowerCase();
  if (key.startsWith("input")) return "inputs";
  if (key.startsWith("timeline")) return "inputs";
  if (key.startsWith("ghost")) return "ghost";
  if (key.startsWith("markdown")) return "markdown";
  if (key.startsWith("discord")) return "discord";
  if (key.startsWith("manifest")) return "export";
  if (key.startsWith("export")) return "export";
  return LEARN_TOOLS.some((tool) => tool.id === key) ? key : "";
}

function activeTool(route = {}, toolState = {}) {
  return normalizeToolId(route.tool || route.slug || toolState.activeTool) || "ghost";
}

function toolNav(selected) {
  return `<nav class="learn-tool-nav" aria-label="Learn tools">
    ${LEARN_TOOLS.map(
      (tool) => `<a class="learn-tool-tile ${tool.id === selected ? "is-active" : ""}" href="#/tools/${tool.id}">
      <span class="learn-nav-icon">${renderIcon(tool.icon)}</span>
      <strong>${escapeHtml(tool.title)}</strong>
      <small>${escapeHtml(tool.summary)}</small>
    </a>`
    ).join("")}
  </nav>`;
}

export function getManifestExport(manifest = {}) {
  return {
    schema: "xjk.learn.manifest-export.v1",
    generatedAt: new Date().toISOString(),
    pageCount: (manifest.pages || []).length,
    clusterCount: (manifest.clusters || []).length,
    manifest,
  };
}

function renderWorkspace(tool, page, manifest, toolState) {
  if (tool === "inputs") {
    return `<h2 class="learn-card-title">Input Timeline</h2>
      <p class="learn-card-text">A larger mock view of the same timeline embed Learn pages can declare with <code>::tool</code>.</p>
      <div class="learn-tool-section">${renderInputTimeline(page)}</div>
      <div class="learn-panel-grid learn-tool-section">
        <div class="learn-stat-card learn-span-4"><div class="learn-stat-label">Steer noise</div><div class="learn-stat-value">0.12</div></div>
        <div class="learn-stat-card learn-span-4"><div class="learn-stat-label">Pitch delta</div><div class="learn-stat-value">-3</div></div>
        <div class="learn-stat-card learn-span-4"><div class="learn-stat-label">Speed</div><div class="learn-stat-value">103</div></div>
      </div>`;
  }

  if (tool === "markdown") {
    return `<h2 class="learn-card-title">Markdown Playground</h2>
      <p class="learn-card-text">The preview below is rendered from the Learn AST, not from raw HTML.</p>
      <div class="learn-panel-grid learn-tool-section">
        <div class="learn-span-6"><textarea id="markdown-playground" class="learn-textarea">${escapeHtml(toolState.markdown || DEFAULT_SAMPLE)}</textarea></div>
        <div class="learn-span-6"><div id="markdown-preview" class="learn-article-body learn-preview-box"></div></div>
      </div>`;
  }

  if (tool === "discord") {
    return `<h2 class="learn-card-title">Discord Mirror Preview</h2>
      <p class="learn-card-text">Generated from the current page AST so the future mirror path does not scrape website markup.</p>
      <div id="discord-preview-mount" class="learn-tool-section"></div>`;
  }

  if (tool === "export") {
    const manifestJson = JSON.stringify(getManifestExport(manifest), null, 2);
    return `<h2 class="learn-card-title">Manifest Export</h2>
      <p class="learn-card-text">The static manifest powering this run.</p>
      <div class="learn-card-actions learn-tool-actions">
        <button class="learn-button" id="copy-manifest" type="button">Copy JSON</button>
        <a class="learn-button" href="data:application/json;charset=utf-8,${encodeURIComponent(manifestJson)}" download="learn-manifest.json">Download</a>
      </div>
      <pre class="learn-pre"><code>${escapeHtml(manifestJson)}</code></pre>`;
  }

  return `<h2 class="learn-card-title">Ghost Comparison</h2>
    <p class="learn-card-text">Mock route comparison for angle, speed, and input drift. Real Trackmania integrations can attach here later.</p>
    <div class="learn-tool-section">${renderGhostComparison(page)}</div>
    <div class="learn-panel-grid learn-tool-section">
      <div class="learn-stat-card learn-span-4"><div class="learn-stat-label">Current topic</div><div class="learn-stat-value">${escapeHtml(page.time)}</div></div>
      <div class="learn-stat-card learn-span-4"><div class="learn-stat-label">Drift delta</div><div class="learn-stat-value">+6.2</div></div>
      <div class="learn-stat-card learn-span-4"><div class="learn-stat-label">Exit speed</div><div class="learn-stat-value">103</div></div>
    </div>
    <div class="learn-tool-section">${renderToolEmbed(page, { kind: "ghost-comparison", title: "Page embed version" })}</div>`;
}

export function renderToolsView({ root, state, store, route, showToast }) {
  const toolState = { activeTool: "ghost", ...readJson(TOOLS_KEY, {}) };
  const tool = activeTool(route, toolState);
  toolState.activeTool = tool;
  writeJson(TOOLS_KEY, toolState);
  const page = state.activePage || store.getPage(state.activeSlug) || store.getPage(state.manifest.defaultSlug);

  globalThis.XjkSafeHtml.set(
    root,
    `<div class="learn-workspace learn-single-workspace">
    <div class="learn-page-scaffold">
      <div class="learn-page-head">
        <div>
          <p class="learn-eyebrow">Tools</p>
          <h1 class="learn-page-title">Practice tools</h1>
          <p class="learn-page-subtitle">Tools for embeds, authoring, Discord previews, and manifest inspection inside Learn.</p>
        </div>
        <a class="learn-button" href="${slugToHash(page.slug)}">Current lesson</a>
      </div>
      <div class="learn-tool-layout">
        ${toolNav(tool)}
        <section class="learn-panel">${renderWorkspace(tool, page, state.manifest, toolState)}</section>
      </div>
    </div>
  </div>`
  );

  let cancelled = false;

  if (tool === "markdown") {
    const input = root.querySelector("#markdown-playground");
    const preview = root.querySelector("#markdown-preview");
    const update = () => {
      toolState.markdown = input.value;
      writeJson(TOOLS_KEY, toolState);
      const ast = bodyAst(parseLearnMarkdown(input.value));
      globalThis.XjkSafeHtml.set(preview, renderAst(ast, page, store));
    };
    store
      .loadMarkdown(page.slug)
      .then((markdown) => {
        if (cancelled) return;
        input.value = toolState.markdown || markdown || DEFAULT_SAMPLE;
        update();
      })
      .catch(update);
    input.addEventListener("input", update);
    update();
    return () => {
      cancelled = true;
      input.removeEventListener("input", update);
    };
  }

  if (tool === "discord") {
    const mount = root.querySelector("#discord-preview-mount");
    store.loadAst(page.slug).then((ast) => {
      if (!cancelled) globalThis.XjkSafeHtml.set(mount, renderDiscordPreview(page, ast));
    });
    return () => {
      cancelled = true;
    };
  }

  if (tool === "export") {
    const button = root.querySelector("#copy-manifest");
    const onCopy = () =>
      copyText(JSON.stringify(getManifestExport(state.manifest), null, 2)).then(() => showToast?.("Manifest copied"));
    button.addEventListener("click", onCopy);
    return () => button.removeEventListener("click", onCopy);
  }

  return () => {};
}
