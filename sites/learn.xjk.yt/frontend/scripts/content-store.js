import { inlineAstText as inlineText } from "./ast.js";
import { parseLearnMarkdown } from "./learn-markdown.js";
import { MOCK_CONTENT } from "./mock-data.js";
import { assetPath, makeTelemetry } from "./utils.js";

const DEFAULT_TOOLS = [
  {
    id: "ghost",
    title: "Ghost Comparison",
    summary: "Compare your run against a top ghost with speed, angle, and input deltas.",
  },
  {
    id: "inputs",
    title: "Input Timeline",
    summary: "Inspect speed, steer, pitch, and angle timing from a mock input trace.",
  },
  {
    id: "markdown",
    title: "Markdown Playground",
    summary: "Test Learn directives and inspect the rendered AST output.",
  },
  {
    id: "discord",
    title: "Discord Mirror Preview",
    summary: "Preview how a Learn page can mirror into Discord from the same AST.",
  },
  {
    id: "export",
    title: "Manifest Export",
    summary: "View and copy the static manifest JSON currently powering Learn.",
  },
];

const CLUSTER_POSITIONS = {
  underwater: [0.28, 0.28],
  "desert-car": [0.64, 0.4],
  snowcar: [0.44, 0.68],
  recovery: [0.24, 0.72],
  advanced: [0.64, 0.76],
  style: [0.78, 0.58],
};

function ensureSlash(path = "") {
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path}`;
}

function titleFor(id = "") {
  return String(id)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function clusterFromLesson(lesson) {
  if (lesson.slug?.includes("/underwater/")) return "underwater";
  if (lesson.category === "style" || lesson.slug?.startsWith("style/")) return "style";
  return lesson.category || lesson.section || "advanced";
}

function defaultClustersFromTracks(tracks = []) {
  return tracks.map((track, index) => {
    const id = track.id === "desert" ? "desert-car" : track.id;
    const position = CLUSTER_POSITIONS[id] || [0.25 + (index % 3) * 0.22, 0.3 + Math.floor(index / 3) * 0.25];
    return {
      id,
      title: track.title || titleFor(id),
      accent: "white",
      x: position[0],
      y: position[1],
      description: track.summary || "",
    };
  });
}

function normalizeLesson(lesson, index) {
  const cluster = clusterFromLesson(lesson);
  const secondary = lesson.related || lesson.wikiLinks || lesson.prerequisites || [];
  const related = [...(lesson.wikiLinks || []), ...(lesson.prerequisites || []), lesson.next]
    .filter(Boolean)
    .filter((slug) => slug !== lesson.slug)
    .slice(0, 4);
  return {
    id: lesson.id || lesson.slug,
    slug: lesson.slug,
    title: lesson.title,
    summary: lesson.summary || "",
    section: lesson.category || lesson.section || cluster,
    category: lesson.section || lesson.category || cluster,
    type: lesson.type || "guide",
    difficulty: lesson.level || lesson.difficulty || "intermediate",
    difficultyIcon: lesson.level === "advanced" ? "OOO" : lesson.level === "beginner" ? "O" : "OO",
    time: lesson.duration || lesson.time || "4 min",
    markdown: ensureSlash(lesson.path || lesson.markdown || `content/${lesson.slug}.md`),
    tags: lesson.tags || [],
    media: {
      demo: {
        type: "video",
        label: "Demo",
        poster: ensureSlash(lesson.poster || `media/mock/posters/${cluster}.svg`),
        duration: "0:36",
        mock: true,
      },
      diagram: {
        type: "image",
        label: `${lesson.title} diagram`,
        src: ensureSlash(lesson.poster || `media/mock/posters/${cluster}.svg`),
        alt: `Mock diagram for ${lesson.title}`,
      },
    },
    tools: {
      "ghost-basic": { kind: "ghost-comparison", title: "Ghost Comparison" },
      "input-basic": { kind: "input-timeline", title: "Input Timeline" },
    },
    telemetry: makeTelemetry(lesson.slug),
    related,
    links: related.map((slug, linkIndex) => ({
      slug,
      kind: linkIndex === 0 ? "prerequisite" : "related",
      weight: linkIndex === 0 ? 0.95 : 0.72,
    })),
    cluster,
    secondaryClusters: secondary.map((slug) => String(slug).split("/")[0]).filter((id) => id && id !== cluster),
    graph: {
      primaryCluster: cluster,
      secondaryClusters: secondary.map((slug) => String(slug).split("/")[0]).filter((id) => id && id !== cluster),
      weight: lesson.level === "advanced" ? 0.92 : lesson.level === "beginner" ? 0.56 : 0.74,
      orbit: (index * 0.61803398875) % 1,
    },
  };
}

function normalizeManifest(raw) {
  if (raw?.clusters && raw?.pages?.some((page) => page.markdown)) {
    return {
      ...raw,
      defaultSlug: raw.defaultSlug || raw.pages[0]?.slug || "",
      concepts: (raw.concepts || []).map((concept) => ({
        ...concept,
        id: concept.id || concept.slug || "",
        title: concept.title || titleFor(concept.id || concept.slug || ""),
        area: concept.area || concept.cluster || "contexts",
        tags: concept.tags || [],
        relatedConcepts: concept.relatedConcepts || [],
      })),
      packs: (raw.packs || []).map((pack) => ({
        ...pack,
        id: pack.id || pack.slug || "",
        title: pack.title || titleFor(pack.id || pack.slug || ""),
        cards: pack.cards || [],
        concepts: pack.concepts || [],
        requiredContext: pack.requiredContext || [],
        tags: pack.tags || [],
      })),
      pages: raw.pages.map((page) => ({
        ...page,
        markdown: ensureSlash(page.markdown),
        concepts: page.concepts || [],
        packIds: page.packIds || page.packs || [],
        prerequisites: page.prerequisites || [],
        status: page.status || "",
        telemetry: page.telemetry || makeTelemetry(page.slug),
      })),
      tools: raw.tools?.length ? raw.tools : DEFAULT_TOOLS,
    };
  }

  const tracks = raw?.tracks || [];
  const lessons = raw?.lessons || [];
  const clusters = defaultClustersFromTracks(tracks);
  if (!clusters.some((cluster) => cluster.id === "underwater")) {
    clusters.unshift({
      id: "underwater",
      title: "Underwater Mechanics",
      accent: "white",
      x: 0.28,
      y: 0.28,
      description: "Water, buoyancy, submerged control, and low-speed recovery.",
    });
  }
  const pages = lessons.map((lesson, index) => normalizeLesson(lesson, index));
  return {
    version: raw?.schemaVersion || 1,
    site: raw?.site || "learn.xjk.yt",
    generatedAt: raw?.generatedAt || "",
    defaultSlug: raw?.defaultSlug || pages[0]?.slug || "",
    clusters,
    pages,
    tools: DEFAULT_TOOLS,
  };
}

function normalizeInline(nodes = []) {
  return nodes.map((node) => {
    if (node.type === "text") return { type: "text", value: node.value };
    if (node.type === "code_inline") return { type: "code_inline", value: node.value };
    if (node.type === "code") return node;
    if (node.type === "strong") return { type: "strong", children: normalizeInline(node.children || []) };
    if (node.type === "emphasis") return { type: "emphasis", children: normalizeInline(node.children || []) };
    if (node.type === "link") return { type: "link", label: inlineText(node.children || []), href: node.href };
    if (node.type === "wiki_link") {
      return {
        type: "wiki_link",
        target: node.target,
        children: normalizeInline(node.children || [{ type: "text", value: node.target }]),
      };
    }
    if (node.type === "wikiLink") {
      return { type: "wiki_link", target: node.slug, children: [{ type: "text", value: node.label || node.slug }] };
    }
    return { type: "text", value: inlineText([node]) };
  });
}

function normalizeBlocks(nodes = []) {
  return nodes.map((node) => {
    if (node.type === "heading") {
      return {
        type: "heading",
        level: node.depth || node.level || 2,
        text: node.text || inlineText(node.children),
        children: normalizeInline(node.children || []),
      };
    }
    if (node.type === "paragraph") {
      return {
        type: "paragraph",
        text: inlineText(node.children || []),
        children: normalizeInline(node.children || []),
      };
    }
    if (node.type === "list") {
      return {
        type: "list",
        ordered: Boolean(node.ordered),
        items: (node.items || []).map((item) => ({
          type: "list_item",
          text: inlineText(item.children || []),
          children: normalizeInline(item.children || []),
        })),
      };
    }
    if (node.type === "blockquote") return { type: "quote", children: normalizeBlocks(node.children || []) };
    if (node.type === "quote") return { type: "quote", children: normalizeBlocks(node.children || []) };
    if (node.type === "code") {
      return { type: "codeBlock", lang: node.language || node.lang || "", code: node.value || node.code || "" };
    }
    if (node.type === "codeBlock") return node;
    if (node.type === "thematic_break" || node.type === "rule") return { type: "rule" };
    if (node.type === "directive") {
      return { type: node.name, attrs: node.attrs || {}, children: normalizeBlocks(node.children || []) };
    }
    return node;
  });
}

function normalizeAst(ast) {
  if (Array.isArray(ast)) return ast;
  if (ast?.type === "document") return normalizeBlocks(ast.children || []);
  return [];
}

export function createContentStore({ mock = false } = {}) {
  let manifest = null;
  let bySlug = new Map();
  let byCluster = new Map();
  let byConcept = new Map();
  let byPack = new Map();
  const markdownCache = new Map();
  const astCache = new Map();

  function indexManifest(nextManifest) {
    manifest = normalizeManifest(nextManifest);
    bySlug = new Map((manifest.pages || []).map((page) => [page.slug, page]));
    byCluster = new Map((manifest.clusters || []).map((cluster) => [cluster.id, cluster]));
    byConcept = new Map((manifest.concepts || []).map((concept) => [concept.id, concept]));
    byPack = new Map((manifest.packs || []).map((pack) => [pack.id, pack]));
    return manifest;
  }

  async function loadManifest() {
    if (manifest) return manifest;
    if (mock) return indexManifest(MOCK_CONTENT.manifest);
    const response = await fetch(assetPath("/content/index.json"), { cache: "no-cache" });
    if (!response.ok) throw new Error(`Manifest request failed with ${response.status}`);
    return indexManifest(await response.json());
  }

  function getManifest() {
    return manifest;
  }

  function getPage(slug) {
    return bySlug.get(slug);
  }

  function getCluster(id) {
    return byCluster.get(id);
  }

  function getConcept(id) {
    return byConcept.get(id);
  }

  function getPack(id) {
    return byPack.get(id);
  }

  function getRelated(page) {
    return (page?.related || []).map((slug) => bySlug.get(slug)).filter(Boolean);
  }

  function getPagesByCluster(clusterId) {
    return (manifest?.pages || []).filter(
      (page) =>
        page.cluster === clusterId ||
        page.graph?.primaryCluster === clusterId ||
        page.secondaryClusters?.includes(clusterId) ||
        page.graph?.secondaryClusters?.includes(clusterId)
    );
  }

  function getPagesByConcept(conceptId) {
    return (manifest?.pages || []).filter((page) => page.concepts?.includes(conceptId));
  }

  function getPackPages(packId) {
    const pack = getPack(packId);
    return (pack?.cards || []).map((slug) => bySlug.get(slug)).filter(Boolean);
  }

  function getAdjacent(slug) {
    const pages = manifest?.pages || [];
    const index = pages.findIndex((page) => page.slug === slug);
    if (index < 0) return { previous: null, next: null };
    return {
      previous: pages[(index - 1 + pages.length) % pages.length],
      next: pages[(index + 1) % pages.length],
    };
  }

  async function loadMarkdown(slug) {
    if (markdownCache.has(slug)) return markdownCache.get(slug);
    const page = getPage(slug);
    if (!page) throw new Error(`Unknown Learn slug: ${slug}`);
    let markdown = page.markdownContent;
    if (!markdown && mock) {
      const key = page.markdown.replace(/^\/+/, "");
      markdown = MOCK_CONTENT.markdown?.[key] || MOCK_CONTENT.markdown?.[page.markdown];
    }
    if (!markdown) {
      const response = await fetch(assetPath(page.markdown), { cache: "no-cache" });
      if (!response.ok) throw new Error(`Markdown request failed for ${slug} with ${response.status}`);
      markdown = await response.text();
    }
    markdownCache.set(slug, markdown);
    return markdown;
  }

  async function loadAst(slug) {
    if (astCache.has(slug)) return astCache.get(slug);
    const markdown = await loadMarkdown(slug);
    const ast = normalizeAst(parseLearnMarkdown(markdown));
    astCache.set(slug, ast);
    return ast;
  }

  function search(query = "") {
    const q = query.trim().toLowerCase();
    const pages = manifest?.pages || [];
    if (!q) return pages.slice(0, 20);
    return pages.filter((page) =>
      [
        page.title,
        page.summary,
        page.section,
        page.category,
        page.type,
        page.cluster,
        ...(page.tags || []),
        ...(page.secondaryClusters || []),
        ...(page.concepts || []),
        ...(page.packIds || []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }

  return {
    get manifest() {
      return manifest;
    },
    getManifest,
    loadManifest,
    loadMarkdown,
    loadAst,
    getPage,
    getCluster,
    getConcept,
    getPack,
    getRelated,
    getPagesByCluster,
    getPagesByConcept,
    getPackPages,
    getAdjacent,
    search,
  };
}
