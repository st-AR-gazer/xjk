import "../../../shared/xjk-core/safe-html.js?v=2";
import {
  renderCallout,
  renderImageEmbed,
  renderInlineNodes,
  renderTip,
  renderToolEmbed,
  renderVideoEmbed,
} from "./embeds.js";
import { clusterSvgIcon, difficultyLabel, escapeHtml, pageTitle, renderIcon, slugToHash, viewToHash } from "./utils.js";
import { hydrateReaderTools, renderReaderTools } from "./reader-tools.js";
import { clusterColor } from "./knowledge-map.js";
import { normalizeAst } from "./ast.js";

const SIDE_EMBEDS = new Set(["video", "image", "tool"]);

export { normalizeAst } from "./ast.js";

export function bodyAst(ast = []) {
  return normalizeAst(ast).filter((node, index) => {
    const depth = headingDepth(node);
    return !(index === 0 && depth === 1);
  });
}

export function renderAst(ast = [], page = {}, store = null) {
  return normalizeAst(ast)
    .map((node) => renderNode(node, page, store))
    .join("");
}

export function renderNode(node = {}, page = {}, store = null) {
  if (!node) return "";
  if (node.type === "directive") return renderDirective(node, page, store);

  switch (node.type) {
    case "heading":
      return renderHeading(node, page, store);
    case "paragraph":
      return `<p>${renderInlineNodes(node.children || [], store)}</p>`;
    case "list":
      return renderList(node, page, store);
    case "list_item":
      return `<li>${renderInlineNodes(node.children || [], store)}</li>`;
    case "blockquote":
    case "quote":
      return `<blockquote>${renderAst(node.children || [], page, store)}</blockquote>`;
    case "thematic_break":
    case "rule":
      return "<hr />";
    case "code":
    case "codeBlock":
      return renderCode(node);
    case "video":
      return renderVideoEmbed(page, node.attrs || node);
    case "image":
      return renderImageEmbed(page, node.attrs || node);
    case "tool":
      return renderToolEmbed(page, node.attrs || node);
    case "tip":
      return renderTip(node, page, (children) => renderAst(children, page, store));
    case "callout":
      return renderCallout(node, page, (children) => renderAst(children, page, store));
    default:
      return node.children ? renderAst(node.children, page, store) : "";
  }
}

export function renderLessonBody(page = {}, ast = [], store = null) {
  const body = bodyAst(ast);
  const mainNodes = body.filter((node) => !isSideEmbed(node));
  return `<div class="learn-article-body lesson-body">${renderAst(mainNodes, page, store)}</div>`;
}

export function renderLesson(page = {}, ast = [], context = {}) {
  const store = context.store || null;
  const body = bodyAst(ast);
  const sideNodes = body.filter(isSideEmbed);

  return `<article class="lesson-view" data-lesson-slug="${escapeHtml(page.slug || "")}">
    ${renderLessonHeader(page, context)}
    <div class="learn-article-grid">
      ${renderLessonBody(page, ast, store)}
      ${renderSide(sideNodes, page, store, context.state)}
    </div>
    ${renderRelated(page, store)}
    ${renderPrevNext(page, store)}
  </article>`;
}

export function renderLessonHeader(page = {}, context = {}) {
  const clusterId = page.cluster || page.category || page.graph?.primaryCluster || "";
  const cluster = getCluster(context.store, context.manifest, clusterId);

  return `<header class="lesson-header">
    ${context.missingSlug ? `<div class="learn-card learn-route-recovered"><strong>Route recovered</strong><p class="learn-card-text">The requested slug <code>${escapeHtml(context.missingSlug)}</code> is not in the manifest, so Learn opened the default topic.</p></div>` : ""}
    <div class="learn-article-kicker lesson-breadcrumbs">
      <a href="${viewToHash("learn")}">learn.xjk.yt</a>
      <span>/</span>
      <a href="#/library?cluster=${encodeURIComponent(clusterId)}">${escapeHtml(cluster?.title || page.section || clusterId || "Learn")}</a>
      <span>/</span>
      <span>${escapeHtml(page.category || page.type || "Lesson")}</span>
    </div>
    <h1 class="learn-article-title">${escapeHtml(pageTitle(page))}</h1>
    <p class="learn-summary">${escapeHtml(page.summary || page.description || "")}</p>
    ${renderMetadata(page)}
  </header>`;
}

export function renderMapView({ root, manifest } = {}) {
  if (!root) return () => {};
  globalThis.XjkSafeHtml.set(
    root,
    `<section class="learn-view learn-map-view" data-learn-view="map">
    <div class="learn-workspace learn-map-workspace">
      ${renderMapPanel(manifest)}
    </div>
  </section>`
  );
  return () => {};
}

export function renderMetadata(page = {}) {
  const tags = page.tags || [];
  const level = page.difficulty || page.level || "guide";
  const duration = page.time || page.duration || "";
  return `<div class="learn-meta-row lesson-meta">
    <span class="learn-pill difficulty-${escapeHtml(level)}">${escapeHtml(page.difficultyIcon || "")} ${escapeHtml(difficultyLabel(level))}</span>
    ${duration ? `<span class="learn-pill">${escapeHtml(duration)}</span>` : ""}
    ${page.type ? `<span class="learn-pill">${escapeHtml(page.type)}</span>` : ""}
    ${tags.map((tag) => `<span class="learn-pill">${escapeHtml(tag)}</span>`).join("")}
  </div>`;
}

export function renderLessonView({
  root,
  page,
  ast,
  manifest,
  store,
  state,
  missingSlug = "",
  showToast,
  route,
  onSaveNote,
  onSubmitSuggestion,
}) {
  if (!root) return () => {};
  const lessonAst = ast || page?.ast || [];
  globalThis.XjkSafeHtml.set(
    root,
    `<section class="learn-view learn-lesson-view" data-learn-view="lesson">
    <div class="learn-workspace learn-map-workspace">
      ${renderMapPanel(manifest)}
      <section class="learn-lesson-panel" aria-label="Lesson content">
        <button class="learn-icon-button learn-lesson-close" data-action="close-lesson-card" type="button" aria-label="Close lesson card" title="Close lesson">${renderIcon("close")}</button>
        ${renderReaderTools({ page, ast: lessonAst, state, store })}
        ${renderLesson(page, lessonAst, { store, state, manifest, missingSlug })}
      </section>
    </div>
  </section>`
  );
  return hydrateReaderTools({
    root,
    page,
    ast: lessonAst,
    store,
    showToast,
    route,
    state,
    onSaveNote,
    onSubmitSuggestion,
  });
}

function renderDirective(node, page, store) {
  if (node.name === "video") return renderVideoEmbed(page, node.attrs || {});
  if (node.name === "image") return renderImageEmbed(page, node.attrs || {});
  if (node.name === "tool") return renderToolEmbed(page, node.attrs || {});
  if (node.name === "tip") return renderTip(node, page, (children) => renderAst(children, page, store));
  if (node.name === "callout") return renderCallout(node, page, (children) => renderAst(children, page, store));
  return "";
}

function renderHeading(node, page, store) {
  const level = Math.min(6, Math.max(2, headingDepth(node)));
  const id = node.id ? ` id="${escapeHtml(node.id)}"` : "";
  return `<h${level}${id}>${renderInlineNodes(node.children || [], store)}</h${level}>`;
}

function renderList(node, page, store) {
  const tag = node.ordered ? "ol" : "ul";
  const items = node.items || node.children || [];
  return `<${tag}>${items
    .map((item) => {
      if (item.type === "list_item") return `<li>${renderInlineNodes(item.children || [], store)}</li>`;
      return `<li>${renderNode(item, page, store)}</li>`;
    })
    .join("")}</${tag}>`;
}

function renderCode(node = {}) {
  const code = node.value || node.code || "";
  const language = node.language || node.lang || "";
  const className = language ? ` class="language-${escapeHtml(language)}"` : "";
  return `<pre><code${className}>${escapeHtml(code)}</code></pre>`;
}

function renderMapLegend(manifest = {}) {
  const clusters = manifest?.clusters || [];
  if (!clusters.length) return "";
  return `<nav class="learn-map-legend" aria-label="Knowledge clusters">
    ${clusters
      .map(
        (
          cluster
        ) => `<a class="learn-map-legend-item" href="#/library?cluster=${encodeURIComponent(cluster.id)}" title="${escapeHtml(cluster.description || cluster.title)}">
      <span style="background: rgb(${clusterColor(cluster.id)})" aria-hidden="true"></span>${escapeHtml(cluster.title)}
    </a>`
      )
      .join("")}
  </nav>`;
}

function renderMapPanel(manifest) {
  return `<section class="learn-map-panel" aria-label="Knowledge map background">
    <div class="learn-graph-wrap">
      <canvas id="knowledge-canvas" class="learn-knowledge-canvas"></canvas>
      <div id="graph-tooltip" class="learn-graph-tooltip"></div>
    </div>
    <div class="learn-map-controls">
      <button class="learn-icon-button" data-action="zoom-out" type="button" aria-label="Zoom out">${renderIcon("zoom-out")}</button>
      <button class="learn-icon-button" data-action="zoom-in" type="button" aria-label="Zoom in">${renderIcon("zoom-in")}</button>
      <button class="learn-icon-button" data-action="reset-map" type="button" aria-label="Reset map">${renderIcon("reset")}</button>
      <button class="learn-button" data-action="toggle-map-mode" type="button" aria-label="Switch map view">View: 3D</button>
      <button class="learn-button" data-action="focus-active" type="button">Focus active</button>
      <button class="learn-button" data-action="toggle-labels" type="button">Labels</button>
      <button class="learn-icon-button" data-action="open-library" type="button" aria-label="Open library">${renderIcon("library")}</button>
    </div>
    ${renderMapLegend(manifest)}
  </section>`;
}

function renderSide(nodes, page, store, state = {}) {
  const preferred = nodes.length
    ? nodes
    : [
        { type: "image", attrs: { key: "diagram" } },
        { type: "tool", attrs: { key: "ghost-basic", kind: "ghost-comparison", title: "Ghost Comparison" } },
      ];

  return `<aside class="learn-side">
    ${preferred
      .slice(0, 3)
      .map((node) => renderNode(node, page, store))
      .join("")}
    ${renderConceptPanel(page, store)}
    ${renderPackPanel(page, store)}
    ${renderPathStatus(page, store, state)}
  </aside>`;
}

function renderConceptPanel(page, store) {
  const concepts = (page.concepts || [])
    .map((id) => store?.getConcept?.(id) || { id, title: id.replaceAll("-", " ") })
    .slice(0, 8);
  if (!concepts.length) return "";
  return `<div class="learn-card">
    <div class="learn-card-label">Concepts</div>
    <div class="learn-meta-row">
      ${concepts.map((concept) => `<a class="learn-pill" href="#/library?cluster=${encodeURIComponent(concept.area || concept.cluster || "all")}">${escapeHtml(concept.title || concept.id)}</a>`).join("")}
    </div>
  </div>`;
}

function renderPackPanel(page, store) {
  const packs = (page.packIds || []).map((id) => store?.getPack?.(id) || null).filter(Boolean);
  if (!packs.length) return "";
  return `<div class="learn-card">
    <div class="learn-card-label">Shareable packs</div>
    ${packs
      .slice(0, 4)
      .map(
        (pack) => `<a class="learn-related-card" href="${slugToHash(pack.pageSlug || pack.cards?.[0] || page.slug)}">
      <span>${renderIcon("list")}</span>
      <span><strong>${escapeHtml(pack.title)}</strong><small>${escapeHtml(pack.question || pack.summary || "Curated route")}</small></span>
      <span>${renderIcon("chevron-right")}</span>
    </a>`
      )
      .join("")}
  </div>`;
}

function renderPathStatus(page, store, state = {}) {
  const related = getRelated(store, page);
  const locked = !state.authenticated;
  const completed = locked ? [] : state.completed || [];
  const done = related.filter((item) => completed.includes(item.slug)).length;
  const percent = Math.round((done / Math.max(1, related.length)) * 100);

  return `<div class="learn-card">
    <div class="learn-card-label">Path status</div>
    <p class="learn-card-text">${locked ? "Guest mode: log in to track completed neighboring topics." : `${done}/${related.length} neighboring topics completed. The active node stays bright while related tendrils remain visible.`}</p>
    <div class="learn-progress-bar"><span style="width:${percent}%"></span></div>
  </div>`;
}

function renderRelated(page, store) {
  const related = getRelated(store, page).slice(0, 4);
  if (!related.length) return "";

  return `<section class="learn-related-section lesson-related">
    <div class="learn-card-label">Related</div>
    <div class="learn-related-grid">
      ${related
        .map(
          (item) => `<a class="learn-related-card" href="${slugToHash(item.slug)}">
        <span class="learn-nav-icon">${clusterSvgIcon(item.cluster)}</span>
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.type || "lesson")} / ${escapeHtml(item.time || "")}</small></span>
        <span>${renderIcon("chevron-right")}</span>
      </a>`
        )
        .join("")}
    </div>
  </section>`;
}

function renderPrevNext(page, store) {
  const { previous, next } = getAdjacent(store, page);
  const prevPage = previous || referencePage(page.previous || page.prev);
  const nextPage = next || referencePage(page.nextLesson || page.next);
  if (!prevPage && !nextPage) return "";

  return `<nav class="learn-related-section lesson-prev-next" aria-label="Lesson navigation">
    <div class="learn-related-grid">
      ${prevPage ? `<a class="learn-related-card" href="${slugToHash(prevPage.slug)}"><span>${renderIcon("chevron-left")}</span><span><strong>${escapeHtml(prevPage.title)}</strong><small>Previous topic</small></span><span></span></a>` : ""}
      ${nextPage ? `<a class="learn-related-card" href="${slugToHash(nextPage.slug)}"><span></span><span><strong>${escapeHtml(nextPage.title)}</strong><small>Next topic</small></span><span>${renderIcon("chevron-right")}</span></a>` : ""}
    </div>
  </nav>`;
}

function isSideEmbed(node = {}) {
  if (SIDE_EMBEDS.has(node.type)) return true;
  return node.type === "directive" && SIDE_EMBEDS.has(node.name);
}

function headingDepth(node = {}) {
  if (node.type !== "heading") return 0;
  return Number(node.depth || node.level || 2);
}

function referencePages(values = []) {
  if (!values) return [];
  const list = Array.isArray(values) ? values : [values];
  return list.map(referencePage).filter(Boolean);
}

function referencePage(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  const slug = String(value);
  return { slug, title: slug.split("/").at(-1)?.replace(/[-_]+/g, " ") || slug, type: "lesson", time: "" };
}

function getCluster(store, manifest, id) {
  if (!id) return null;
  if (typeof store?.getCluster === "function") return store.getCluster(id);
  const clusters = manifest?.clusters || manifest?.tracks || [];
  return clusters.find((cluster) => cluster.id === id || cluster.slug === id) || null;
}

function getRelated(store, page) {
  if (!page) return [];
  if (typeof store?.getRelated === "function") return store.getRelated(page) || [];
  if (typeof store?.getRelatedLessonsSync === "function") {
    return store.getRelatedLessonsSync(page.id || page.slug) || [];
  }
  return referencePages(page.related);
}

function getAdjacent(store, page) {
  if (!page) return { previous: null, next: null };
  if (typeof store?.getAdjacent === "function") {
    return store.getAdjacent(page.slug || page.id) || { previous: null, next: null };
  }
  if (typeof store?.getAdjacentLessonsSync === "function") {
    return store.getAdjacentLessonsSync(page.id || page.slug) || { previous: null, next: null };
  }
  return { previous: null, next: null };
}
