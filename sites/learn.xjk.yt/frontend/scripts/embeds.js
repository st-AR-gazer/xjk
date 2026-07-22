import { assetPath, escapeHtml, makeTelemetry, normalizeSeries, sanitizeUrl } from "./utils.js";

function telemetryFor(page = {}) {
  return page.telemetry || makeTelemetry(page.slug || page.title || "learn");
}

function mergeConfig(page = {}, attrs = {}, bucket = "media") {
  const key = attrs.key || attrs.id || attrs.ref || "";
  const config = key ? page[bucket]?.[key] : null;
  return { ...(config || {}), ...(attrs || {}) };
}

function readAttr(source = {}, keys = [], fallback = "") {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }
  return fallback;
}

export function renderEmbed(node = {}, context = {}) {
  const page = context.page || context.lesson || {};
  const attrs = { ...(node.attrs || {}), ...(node.attributes || {}), ...(node.props || {}) };
  const kind = String(node.name || attrs.kind || node.kind || node.type || "")
    .toLowerCase()
    .replaceAll("_", "-");

  if (kind === "video") return renderVideoEmbed(page, attrs);
  if (kind === "image" || kind === "figure") return renderImageEmbed(page, attrs);
  if (kind === "tool") return renderToolEmbed(page, attrs);
  if (kind === "tip") return renderTip(node, page, context.renderAst || (() => ""));
  if (kind === "callout" || kind === "warning" || kind === "note") {
    return renderCallout(node, page, context.renderAst || (() => ""));
  }
  if (kind.includes("ghost")) return renderToolEmbed(page, { ...attrs, kind: "ghost-comparison" });
  if (kind.includes("input")) return renderToolEmbed(page, { ...attrs, kind: "input-timeline" });
  return "";
}

export function isEmbedNode(node = {}) {
  const kind = String(node.name || node.type || node.kind || "")
    .toLowerCase()
    .replaceAll("_", "-");
  return ["directive", "video", "image", "figure", "tool", "tip", "callout", "warning", "note"].includes(kind);
}

export function renderVideoEmbed(page = {}, attrs = {}) {
  const media = mergeConfig(page, attrs, "media");
  const label = readAttr(media, ["title", "label"], "Demo");
  const src = readAttr(media, ["src", "url", "href"], "");
  const poster = assetPath(
    readAttr(media, ["poster", "thumbnail", "image"], page.poster || "/media/mock/posters/advanced.svg")
  );
  const duration = readAttr(media, ["duration", "time"], "0:36");
  const href = src ? assetPath(src) : "";

  return `<figure class="learn-embed learn-embed-card learn-video-card" data-embed-kind="video">
    <div class="learn-embed-head"><span>${escapeHtml(label)}</span><span>video</span></div>
    <a class="learn-video-poster" href="${escapeHtml(sanitizeUrl(href || "#") || "#")}" aria-label="${escapeHtml(label)}">
      ${poster ? `<img class="learn-video-poster-image" src="${escapeHtml(poster)}" alt="" loading="lazy" decoding="async" />` : ""}
      <span class="learn-play-button">play</span>
      <span class="learn-duration">${escapeHtml(duration)}</span>
    </a>
  </figure>`;
}

export function renderImageEmbed(page = {}, attrs = {}) {
  const media = mergeConfig(page, attrs, "media");
  const src = assetPath(
    readAttr(media, ["src", "url", "href", "poster"], page.poster || "/media/mock/posters/advanced.svg")
  );
  const label = readAttr(media, ["caption", "title", "label"], "Diagram");
  const alt = readAttr(media, ["alt"], label);

  const image = src
    ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />`
    : `<span class="learn-image-missing">Image source removed.</span>`;

  return `<figure class="learn-embed learn-embed-card learn-image-card" data-embed-kind="image">
    ${image}
    <figcaption>${escapeHtml(label)}</figcaption>
  </figure>`;
}

export function renderGhostComparison(page = {}) {
  const series = telemetryFor(page);
  const you = normalizeSeries(series.you, 500, 116, -4, 12);
  const ghost = normalizeSeries(series.ghost, 500, 116, -4, 12);

  return `<svg class="learn-chart ghost-tool-chart" viewBox="0 0 560 150" role="img" aria-label="Ghost comparison chart">
    <line x1="42" y1="22" x2="42" y2="130" stroke="rgba(255,255,255,.18)"/>
    <line x1="42" y1="130" x2="530" y2="130" stroke="rgba(255,255,255,.18)"/>
    <path d="${escapeHtml(ghost)}" fill="none" stroke="rgba(255,255,255,.42)" stroke-width="3" stroke-dasharray="6 7" transform="translate(42,10)"/>
    <path d="${escapeHtml(you)}" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="3.5" transform="translate(42,10)"/>
    <line x1="284" y1="18" x2="284" y2="138" stroke="rgba(255,255,255,.76)" stroke-width="2"/>
    <text x="12" y="34" fill="#aaa" font-size="12">ANGLE</text>
    <text x="252" y="146" fill="#f4f4f4" font-size="12">1.28s</text>
    <text x="462" y="46" fill="#fff" font-size="18" font-weight="700">+6.2</text>
    <text x="462" y="72" fill="#bbb" font-size="15">+1.1</text>
  </svg>
  <div class="learn-tool-legend">
    <span class="learn-pill">Your run</span>
    <span class="learn-pill">Top ghost</span>
    <span class="learn-pill">Delta</span>
  </div>`;
}

export function renderInputTimeline(page = {}) {
  const series = telemetryFor(page);
  const speed = normalizeSeries(series.speed, 470, 36, 70, 112);
  const steer = normalizeSeries(series.steer, 470, 36, -0.5, 0.5);
  const pitch = normalizeSeries(series.pitch, 470, 36, -18, 18);

  return `<svg class="learn-chart input-tool-chart" viewBox="0 0 560 164" role="img" aria-label="Input timeline chart">
    <line x1="76" y1="30" x2="530" y2="30" stroke="rgba(255,255,255,.14)"/>
    <line x1="76" y1="80" x2="530" y2="80" stroke="rgba(255,255,255,.14)"/>
    <line x1="76" y1="130" x2="530" y2="130" stroke="rgba(255,255,255,.14)"/>
    <text x="14" y="34" fill="#aaa" font-size="12">SPEED</text>
    <text x="14" y="84" fill="#aaa" font-size="12">STEER</text>
    <text x="14" y="134" fill="#aaa" font-size="12">PITCH</text>
    <path d="${escapeHtml(speed)}" fill="none" stroke="#fff" stroke-width="3" transform="translate(76,12)"/>
    <path d="${escapeHtml(steer)}" fill="none" stroke="#bfbfbf" stroke-width="3" transform="translate(76,62)"/>
    <path d="${escapeHtml(pitch)}" fill="none" stroke="#e6e6e6" stroke-width="3" stroke-dasharray="5 6" transform="translate(76,112)"/>
    <line x1="286" y1="14" x2="286" y2="148" stroke="rgba(255,255,255,.72)" stroke-width="2"/>
    <text x="262" y="160" fill="#f4f4f4" font-size="12">1.28s</text>
  </svg>`;
}

export function renderMockGhostTool(page = {}) {
  return renderGhostComparison(page);
}

export function renderMockInputTool(page = {}) {
  return renderInputTimeline(page);
}

export function renderToolEmbed(page = {}, attrs = {}) {
  const config = mergeConfig(page, attrs, "tools");
  const href = readAttr(config, ["href", "url"], "");
  const explicitKind = readAttr(config, ["kind", "tool"], "");
  if (href && !explicitKind && !attrs.key) return renderLinkedTool(config);

  const kind = (explicitKind || "ghost-comparison").toLowerCase();
  const title = readAttr(config, ["title", "label"], kind === "input-timeline" ? "Input Timeline" : "Ghost Comparison");
  const chart = kind.includes("input") ? renderInputTimeline(page) : renderGhostComparison(page);
  const toolPath = kind.includes("input") ? "#/tools/inputs" : "#/tools/ghost";

  return `<section class="learn-embed learn-tool-card learn-embed-tool" data-embed-kind="tool" data-tool-kind="${escapeHtml(kind)}">
    <div class="learn-tool-head"><span>${escapeHtml(title)}</span><a href="${escapeHtml(toolPath)}">open</a></div>
    ${chart}
  </section>`;
}

function renderLinkedTool(config = {}) {
  const label = readAttr(config, ["label", "title"], "Open tool");
  const description = readAttr(config, ["description", "summary"], "");
  const href = sanitizeUrl(readAttr(config, ["href", "url"], "#")) || "#";

  return `<section class="learn-embed learn-tool-card learn-embed-tool" data-embed-kind="tool" data-tool-kind="link">
    <div class="learn-tool-head"><span>${escapeHtml(label)}</span><a href="${escapeHtml(href)}">open</a></div>
    ${description ? `<p class="learn-card-text">${escapeHtml(description)}</p>` : ""}
  </section>`;
}

export function renderCallout(node = {}, page = {}, renderAst = () => "") {
  const attrs = node.attrs || {};
  const type = attrs.type || node.kind || "info";
  const title = attrs.title || (type === "warning" ? "Warning" : "Note");

  return `<aside class="learn-embed learn-card learn-callout learn-callout-${escapeHtml(type)}" data-embed-kind="callout">
    <strong>${escapeHtml(title)}</strong>
    <div class="learn-article-body">${renderAst(node.children || [], page)}</div>
  </aside>`;
}

export function renderTip(node = {}, page = {}, renderAst = () => "") {
  const title = node.attrs?.title || "Tip";
  return `<aside class="learn-embed learn-card learn-tip" data-embed-kind="tip">
    <strong>${escapeHtml(title)}</strong>
    <div class="learn-article-body">${renderAst(node.children || [], page)}</div>
  </aside>`;
}

export function renderInlineNodes(nodes = [], store = null) {
  return nodes.map((node) => renderInlineNode(node, store)).join("");
}

export function renderInlineNode(node = {}, store = null) {
  if (typeof node === "string") return escapeHtml(node);

  switch (node.type) {
    case "text":
      return escapeHtml(node.value || "");
    case "strong":
      return `<strong>${renderInlineNodes(node.children || [], store)}</strong>`;
    case "emphasis":
      return `<em>${renderInlineNodes(node.children || [], store)}</em>`;
    case "code_inline":
    case "inlineCode":
      return `<code>${escapeHtml(node.value || "")}</code>`;
    case "link":
      return renderLink(node, store);
    case "wiki_link":
      return renderWikiLink(node, store);
    case "image": {
      const src = assetPath(node.src || node.url || "");
      return src
        ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(node.alt || "")}" loading="lazy" decoding="async" />`
        : `<span class="learn-image-missing">${escapeHtml(node.alt || "Image source removed.")}</span>`;
    }
    default:
      return node.children ? renderInlineNodes(node.children, store) : escapeHtml(node.value || node.text || "");
  }
}

export function asPlainText(value = "") {
  if (Array.isArray(value)) return value.map(asPlainText).filter(Boolean).join(" ");
  if (value && typeof value === "object") {
    if (value.type === "text" || value.type === "code_inline") return value.value || "";
    if (value.alt) return value.alt;
    if (value.children) return asPlainText(value.children);
    if (value.items) return asPlainText(value.items);
    if (value.value || value.text) return value.value || value.text;
    return "";
  }
  return String(value || "");
}

function renderLink(node = {}, store = null) {
  const href = sanitizeUrl(node.href || node.url || "#") || "#";
  const label = renderInlineNodes(node.children || [], store) || escapeHtml(href);
  const external = /^(https?:)?\/\//i.test(href);
  const target = external ? ` target="_blank" rel="noreferrer"` : "";
  return `<a href="${escapeHtml(href)}"${target}>${label}</a>`;
}

function renderWikiLink(node = {}, store = null) {
  const target = node.target || "";
  const page = store?.getPage?.(target);
  const href = page ? `#/learn/${page.slug}` : `#/learn/${target}`;
  const label = renderInlineNodes(node.children || [], store) || escapeHtml(page?.title || target);
  return `<a class="learn-wiki-link" href="${escapeHtml(href)}" data-wiki-target="${escapeHtml(target)}">${label}</a>`;
}
