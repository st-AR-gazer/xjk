import { escapeHtml, renderIcon, slugToHash } from "../utils.js";
import { collectAudit, collectHeadings, collectLinks, collectMedia } from "./content-index.js";
import { getPins } from "./pins.js";

const PANEL_TITLES = {
  find: "Find in lesson",
  outline: "Outline",
  links: "Links and relations",
  media: "Media and embeds",
  notes: "Private notes",
  suggest: "Improve this lesson",
  audit: "Reader audit",
  ast: "AST inspector",
  source: "Source markdown",
  more: "More reader tools",
};

function toolButton(panel, icon, label) {
  return `<button class="learn-reader-tool" data-reader-panel-trigger="${escapeHtml(panel)}" type="button" title="${escapeHtml(label)}">${renderIcon(icon)}<span>${escapeHtml(label)}</span></button>`;
}

function renderReaderTools({ page = {}, ast = [], state = {}, store = null } = {}) {
  const locked = !state.authenticated;
  const bookmarked = !locked && Boolean(state.bookmarks?.includes(page.slug));
  const pin = getPins()[page.slug];
  const audit = collectAudit(page, ast, store);

  return `<div class="learn-reader-tools" data-reader-tools>
    <div class="learn-reader-progress" aria-hidden="true"><span data-reader-progress></span></div>
    <div class="learn-reader-toolbar" aria-label="Lesson tools">
      <button class="learn-reader-tool" data-reader-action="share" type="button" title="Share lesson">${renderIcon("share")}<span>Share</span></button>
      <button class="learn-reader-tool" data-action="toggle-bookmark" type="button" title="${locked ? "Log in to save lessons" : bookmarked ? "Remove bookmark" : "Bookmark"}" aria-pressed="${bookmarked}">${renderIcon(bookmarked ? "bookmark" : "bookmark-plus")}<span>${bookmarked ? "Saved" : "Save"}</span></button>
      ${toolButton("find", "search", "Find")}
      ${toolButton("notes", "message", "Notes")}
      ${toolButton("more", "menu", "More")}
    </div>
    <div class="learn-reader-drawer" data-reader-drawer hidden></div>
    <div class="learn-reader-status" data-reader-status>${pin ? `Pinned: ${escapeHtml(pin.label)}` : audit.length ? `${audit.length} reader note${audit.length === 1 ? "" : "s"}` : "Reader tools ready"}</div>
  </div>`;
}

function drawerHead(name) {
  return `<div class="learn-reader-drawer-head"><strong>${escapeHtml(panelTitle(name))}</strong><button class="learn-icon-button" data-reader-close type="button" aria-label="Close reader drawer">${renderIcon("close")}</button></div>`;
}

function panelTitle(name) {
  return PANEL_TITLES[name] || "Reader tools";
}

function renderFindPanel() {
  return `<div class="learn-reader-find">
    <input class="learn-input" data-reader-find-input type="search" placeholder="Find text in this lesson..." />
    <button class="learn-button" data-reader-find-action="prev" type="button">Prev</button>
    <button class="learn-button" data-reader-find-action="next" type="button">Next</button>
    <span class="learn-pill" data-reader-find-status>No matches</span>
  </div>`;
}

function renderOutlinePanel(ast) {
  const headings = collectHeadings(ast).filter((heading) => heading.level > 1);
  if (!headings.length) return `<div class="learn-empty">No headings in this lesson.</div>`;
  return `<div class="learn-reader-list">${headings.map((heading) => `<button class="learn-reader-row depth-${heading.level}" data-reader-jump="${escapeHtml(heading.id)}" type="button"><span>${escapeHtml(heading.text)}</span><small>h${heading.level}</small></button>`).join("")}</div>`;
}

function renderLinksPanel(page, ast, store) {
  const { wikiLinks, links } = collectLinks(ast);
  const related = (page.related || []).map((slug) => store?.getPage?.(slug) || { slug, title: slug });
  const rows = [
    ...related.map((item) => ({ label: item.title || item.slug, meta: "related", href: slugToHash(item.slug) })),
    ...wikiLinks.map((link) => {
      const resolved = store?.getPage?.(link.target);
      return {
        label: link.text || link.target,
        meta: resolved ? "wiki" : "missing wiki",
        href: slugToHash(link.target),
        missing: !resolved,
      };
    }),
    ...links.map((link) => ({ label: link.text || link.href, meta: "markdown", href: link.href })),
  ];
  if (!rows.length) return `<div class="learn-empty">No related or markdown links found.</div>`;
  return `<div class="learn-reader-list">${rows.map((row) => `<a class="learn-reader-row ${row.missing ? "is-warning" : ""}" href="${escapeHtml(row.href)}"><span>${escapeHtml(row.label)}</span><small>${escapeHtml(row.meta)}</small></a>`).join("")}</div>`;
}

function renderMediaPanel(ast) {
  const media = collectMedia(ast);
  if (!media.length) return `<div class="learn-empty">No video, image, or tool embeds found.</div>`;
  return `<div class="learn-reader-list">${media
    .map(
      (item) => `<div class="learn-reader-row">
    <span>${escapeHtml(item.title)}</span>
    <small>${escapeHtml(item.kind)}</small>
    <button class="learn-button" data-reader-action="copy-embed" data-embed-syntax="${escapeHtml(item.syntax)}" type="button">Copy syntax</button>
  </div>`
    )
    .join("")}</div>`;
}

function renderNotesPanel(page, state) {
  const note = state.notes?.[page.slug]?.text || "";
  if (!state.authenticated) {
    return `<div class="learn-empty">Log in with Ubisoft to keep private notes attached to this lesson across devices.</div>`;
  }
  return `<div class="learn-reader-form">
    <label class="learn-card-label" for="reader-note">Your private note</label>
    <textarea id="reader-note" class="learn-textarea" data-reader-note rows="7" placeholder="Timing cues, mistakes to avoid, or setup notes...">${escapeHtml(note)}</textarea>
    <button class="learn-button" data-reader-action="save-note" type="button">Save note</button>
  </div>`;
}

function renderSuggestionPanel(state) {
  if (!state.authenticated) {
    return `<div class="learn-empty">Log in with Ubisoft to send improvement suggestions for this lesson.</div>`;
  }
  return `<div class="learn-reader-form">
    <p class="learn-card-text">Send a note to editors about unclear wording, missing examples, broken embeds, or better explanations.</p>
    <textarea class="learn-textarea" data-reader-suggestion rows="7" placeholder="What should be improved?"></textarea>
    <button class="learn-button" data-reader-action="submit-suggestion" type="button">Send suggestion</button>
  </div>`;
}

function renderAuditPanel(page, ast, store) {
  const issues = collectAudit(page, ast, store);
  if (!issues.length) return `<div class="learn-empty">No broken wiki links or missing keyed embeds found.</div>`;
  return `<div class="learn-reader-list">${issues.map((issue) => `<div class="learn-reader-row is-warning"><span>${escapeHtml(issue.title)}</span><small>${escapeHtml(issue.detail)}</small></div>`).join("")}</div>`;
}

function renderMorePanel(page, ast, store, state) {
  const pin = getPins()[page.slug];
  const audit = collectAudit(page, ast, store);
  const locked = !state.authenticated;
  const completed = !locked && Boolean(state.completed?.includes(page.slug));
  return `<div class="learn-reader-grid">
    <button class="learn-reader-action-card" data-reader-panel-trigger="outline" type="button">${renderIcon("list")}<strong>Outline</strong><span>Jump through the headings in this lesson.</span></button>
    <button class="learn-reader-action-card" data-reader-panel-trigger="links" type="button">${renderIcon("link")}<strong>Links</strong><span>Related lessons, wiki links, and markdown references.</span></button>
    <button class="learn-reader-action-card" data-reader-panel-trigger="media" type="button">${renderIcon("image")}<strong>Media</strong><span>Video, image, and tool embeds used here.</span></button>
    <button class="learn-reader-action-card" data-action="toggle-complete" type="button">${renderIcon(completed ? "check" : "circle")}<strong>${completed ? "Mark Incomplete" : "Mark Complete"}</strong><span>${locked ? "Log in with Ubisoft to track progress." : "Update your lesson progress."}</span></button>
    <button class="learn-reader-action-card" data-action="focus-active" type="button">${renderIcon("map")}<strong>Focus Map</strong><span>Center the background graph on this lesson.</span></button>
    <button class="learn-reader-action-card" data-reader-action="copy-section-link" type="button">${renderIcon("copy")}<strong>Copy Section Link</strong><span>Copy a link to the heading you are reading.</span></button>
    <button class="learn-reader-action-card" data-reader-action="pin-section" type="button">${renderIcon("pin")}<strong>${pin ? "Replace Pin" : "Pin Section"}</strong><span>${pin ? `Currently pinned: ${escapeHtml(pin.label)}` : "Keep a quick jump target inside this lesson."}</span></button>
    <button class="learn-reader-action-card" data-reader-panel-trigger="suggest" type="button">${renderIcon("warning")}<strong>Suggest Fix</strong><span>Send editors a note about unclear or missing content.</span></button>
    <button class="learn-reader-action-card" data-reader-action="go-pin" type="button">${renderIcon("pin")}<strong>Open Pin</strong><span>${escapeHtml(pin?.label || "No pinned section yet")}</span></button>
    <button class="learn-reader-action-card" data-reader-action="copy-section" type="button">${renderIcon("copy")}<strong>Copy Section</strong><span>Copy the current heading block as plain text.</span></button>
    <button class="learn-reader-action-card" data-reader-panel-trigger="source" type="button">${renderIcon("code")}<strong>View Source</strong><span>Open the original markdown file.</span></button>
    <button class="learn-reader-action-card" data-reader-panel-trigger="ast" type="button">${renderIcon("list")}<strong>AST Inspector</strong><span>Inspect the parsed Learn AST.</span></button>
    <button class="learn-reader-action-card" data-reader-panel-trigger="audit" type="button">${renderIcon("warning")}<strong>Audit</strong><span>${audit.length ? `${audit.length} note${audit.length === 1 ? "" : "s"} found` : "No issues found"}</span></button>
  </div>`;
}

function createReaderPanelRegistry({ page = {}, ast = [], store = null, state = {} } = {}) {
  const renderers = new Map([
    ["find", renderFindPanel],
    ["outline", () => renderOutlinePanel(ast)],
    ["links", () => renderLinksPanel(page, ast, store)],
    ["media", () => renderMediaPanel(ast)],
    ["notes", () => renderNotesPanel(page, state)],
    ["suggest", () => renderSuggestionPanel(state)],
    ["audit", () => renderAuditPanel(page, ast, store)],
    ["ast", () => `<pre class="learn-reader-pre"><code>${escapeHtml(JSON.stringify(ast, null, 2))}</code></pre>`],
    ["source", () => `<p class="learn-card-text">Loading source markdown...</p>`],
    ["more", () => renderMorePanel(page, ast, store, state)],
  ]);
  return {
    render: (name) => renderers.get(name)?.(),
    renderSource: (markdown) => `<pre class="learn-reader-pre"><code>${escapeHtml(markdown)}</code></pre>`,
    renderSourceError: (error) =>
      `<p class="learn-card-text">Could not load source: ${escapeHtml(error?.message || "Unknown error")}</p>`,
  };
}

export { createReaderPanelRegistry, drawerHead, renderReaderTools };
