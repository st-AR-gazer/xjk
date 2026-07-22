import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { splitFrontmatter } from "../frontend/scripts/learn-frontmatter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(__dirname, "..");
const frontendRoot = path.join(siteRoot, "frontend");
const contentRoot = path.join(frontendRoot, "content");
const cardsRoot = path.join(contentRoot, "cards");
const conceptsRoot = path.join(contentRoot, "concepts");
const packsRoot = path.join(contentRoot, "packs");
const indexManifestPath = path.join(contentRoot, "index.json");
const mockDataPath = path.join(frontendRoot, "scripts", "mock-data.js");

const CORE_CLUSTERS = [
  {
    id: "speed-momentum",
    title: "Speed & Momentum",
    accent: "white",
    x: 0.5,
    y: 0.19,
    description: "Acceleration, speed loss, caps, overspeed, and exits.",
  },
  {
    id: "grip-contact",
    title: "Grip & Contact",
    accent: "silver",
    x: 0.31,
    y: 0.38,
    description: "Noslide, slide states, wheel contact, wall contact, and floatiness.",
  },
  {
    id: "inputs",
    title: "Inputs",
    accent: "white",
    x: 0.69,
    y: 0.38,
    description: "Steering, gas, brake, releases, taps, AKs, analog ranges, and wiggles.",
  },
  {
    id: "surfaces",
    title: "Surfaces",
    accent: "silver",
    x: 0.18,
    y: 0.56,
    description: "Road, dirt, grass, ice, plastic, wood, water, penalty, rubber, and mixed contact.",
  },
  {
    id: "vehicles",
    title: "Vehicles",
    accent: "white",
    x: 0.82,
    y: 0.56,
    description: "Stadium, Rally, Snow, Desert, and car-specific quirks.",
  },
  {
    id: "block-geometry",
    title: "Block Geometry",
    accent: "silver",
    x: 0.34,
    y: 0.74,
    description: "Walls, loops, bobs, tubes, quarterpipes, borders, slopes, edges, and corners.",
  },
  {
    id: "special-forces",
    title: "Special Forces",
    accent: "white",
    x: 0.66,
    y: 0.74,
    description: "Boosters, reactors, water, magnets, gravity changes, and non-standard forces.",
  },
  {
    id: "techniques",
    title: "Techniques",
    accent: "silver",
    x: 0.5,
    y: 0.54,
    description: "Practical mechanics such as speedslides, wallrides, overwalls, bounces, and start tricks.",
  },
  {
    id: "contexts",
    title: "Styles & Contexts",
    accent: "white",
    x: 0.15,
    y: 0.25,
    description: "Fullspeed, tech, dirt, ice, RPG, trial, kacky, underwater, and question-specific context.",
  },
  {
    id: "practice-analysis",
    title: "Practice & Analysis",
    accent: "silver",
    x: 0.85,
    y: 0.25,
    description: "Ghosts, inputs, section practice, validation status, and route reading.",
  },
];

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

async function main() {
  await fs.mkdir(cardsRoot, { recursive: true });
  await fs.mkdir(conceptsRoot, { recursive: true });
  await fs.mkdir(packsRoot, { recursive: true });

  const concepts = await loadJsonDirectory(conceptsRoot);
  const packs = await loadJsonDirectory(packsRoot);
  const cardFiles = (await walk(cardsRoot))
    .filter((file) => file.endsWith(".md"))
    .sort((a, b) => toPosix(path.relative(cardsRoot, a)).localeCompare(toPosix(path.relative(cardsRoot, b))));

  const pages = [];
  const markdown = {};

  for (const file of cardFiles) {
    const source = await fs.readFile(file, "utf8");
    const { frontmatter, body } = splitFrontmatter(source, { parseNumbers: true });
    const relativeCardPath = toPosix(path.relative(cardsRoot, file));
    const slug = String(frontmatter.slug || relativeCardPath.replace(/\.md$/i, ""));
    const id = String(frontmatter.id || slug);
    const title = String(frontmatter.title || firstHeading(body) || titleFromSlug(slug));
    const cluster = String(frontmatter.cluster || "contexts");
    const secondaryClusters = asArray(frontmatter.secondaryClusters);
    const conceptIds = asArray(frontmatter.concepts);
    const packIds = asArray(frontmatter.packs);
    const prerequisites = asArray(frontmatter.prerequisites);
    const related = unique([...prerequisites, ...asArray(frontmatter.related), ...findWikiLinks(source)]).filter(
      (target) => target !== slug && !conceptIds.includes(target)
    );
    const poster = String(frontmatter.poster || `/media/mock/posters/${slugify(slug)}.svg`);
    const difficulty = String(frontmatter.difficulty || frontmatter.level || "reference");

    const page = {
      id,
      slug,
      title,
      summary: String(frontmatter.summary || firstParagraph(body) || ""),
      section: String(frontmatter.section || cluster),
      category: String(frontmatter.category || relativeCardPath.split("/").slice(0, -1).join("/") || "cards"),
      type: String(frontmatter.type || "card"),
      contentModel: String(frontmatter.contentModel || "card"),
      difficulty,
      difficultyIcon: difficultyIcon(difficulty),
      status: String(frontmatter.status || "draft"),
      sourceKind: String(frontmatter.sourceKind || ""),
      time: String(frontmatter.time || frontmatter.duration || "5 min"),
      markdown: `/${toPosix(path.relative(frontendRoot, file))}`,
      tags: unique([...asArray(frontmatter.tags), ...conceptIds]),
      concepts: conceptIds,
      packIds,
      prerequisites,
      related,
      links: [
        ...prerequisites.map((target) => ({ slug: target, kind: "context", weight: 0.96 })),
        ...related
          .filter((target) => !prerequisites.includes(target))
          .map((target) => ({ slug: target, kind: "related", weight: 0.72 })),
      ],
      media: {
        diagram: {
          type: "image",
          label: `${title} diagram`,
          src: poster,
          alt: `${title} concept poster`,
        },
      },
      tools: {
        "input-basic": { kind: "input-timeline", title: "Input Timeline" },
        "ghost-basic": { kind: "ghost-comparison", title: "Ghost Comparison" },
      },
      cluster,
      secondaryClusters,
      graph: {
        primaryCluster: cluster,
        secondaryClusters,
        weight: Number(frontmatter.weight || pageWeight(String(frontmatter.type || "card"))),
        orbit: Number(frontmatter.orbit ?? (pages.length * 0.61803398875) % 1),
      },
    };

    pages.push(page);
    markdown[page.markdown.replace(/^\/+/, "")] = source;
    markdown[page.slug] = source;
    await writePoster(page, concepts);
  }

  const manifest = {
    version: 2,
    site: "learn.xjk.yt",
    generatedAt: new Date().toISOString(),
    contentModel: {
      cards: "Human-written markdown pages.",
      concepts: "Reusable metadata for search, graph placement, prerequisites, and glossary context.",
      packs: "Shareable curated routes that arrange cards around a question.",
    },
    defaultSlug:
      pages.find((page) => page.slug === "underwater/rally-car/mechanics-primer")?.slug || pages[0]?.slug || "",
    clusters: CORE_CLUSTERS,
    concepts: concepts.map((concept) => normalizeConcept(concept)),
    packs: packs.map((pack) => normalizePack(pack, pages)),
    pages,
    tools: DEFAULT_TOOLS,
  };

  await fs.writeFile(indexManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeMockData(manifest, markdown);

  console.log(`Generated ${toPosix(path.relative(siteRoot, indexManifestPath))}`);
  console.log(`Generated ${toPosix(path.relative(siteRoot, mockDataPath))}`);
  console.log(
    `Prepared ${pages.length} cards, ${manifest.concepts.length} concepts, and ${manifest.packs.length} packs`
  );
}

async function loadJsonDirectory(root) {
  const files = (await walk(root)).filter((file) => file.endsWith(".json")).sort();
  const items = [];
  for (const file of files) {
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    items.push({ id: path.basename(file, ".json"), ...raw });
  }
  return items;
}

async function walk(root) {
  const exists = await fs
    .stat(root)
    .then(() => true)
    .catch(() => false);
  if (!exists) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) results.push(...(await walk(fullPath)));
    else if (entry.isFile()) results.push(fullPath);
  }
  return results;
}

function normalizeConcept(concept = {}) {
  return {
    id: String(concept.id || ""),
    title: String(concept.title || titleFromSlug(concept.id || "")),
    area: String(concept.area || concept.cluster || "contexts"),
    type: String(concept.type || "concept"),
    summary: String(concept.summary || concept.description || ""),
    tags: asArray(concept.tags),
    relatedConcepts: asArray(concept.relatedConcepts),
  };
}

function normalizePack(pack = {}, pages = []) {
  const cards = asArray(pack.cards);
  const firstCard = cards.find((slug) => pages.some((page) => page.slug === slug)) || cards[0] || "";
  return {
    id: String(pack.id || ""),
    title: String(pack.title || titleFromSlug(pack.id || "")),
    summary: String(pack.summary || ""),
    question: String(pack.question || ""),
    pageSlug: String(pack.pageSlug || firstCard),
    cards,
    concepts: asArray(pack.concepts),
    requiredContext: asArray(pack.requiredContext),
    tags: asArray(pack.tags),
  };
}

function asArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function findWikiLinks(source) {
  const targets = new Set();
  const matcher = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = matcher.exec(source))) targets.add(match[1].trim());
  return [...targets].sort();
}

function firstHeading(body) {
  const heading = String(body || "").match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : "";
}

function firstParagraph(body) {
  const blocks = String(body || "")
    .replace(/^#\s+.+$/m, "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const paragraph = blocks.find((block) => !/^(?:#{1,6}\s|::|[-*+]\s|\d+[.)]\s)/.test(block));
  return paragraph ? paragraph.replace(/\s+/g, " ").slice(0, 220) : "";
}

function titleFromSlug(slug) {
  return String(slug)
    .split(/[/-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugify(value) {
  const slug = String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "card";
}

function difficultyIcon(value) {
  return (
    {
      context: "C",
      reference: "R",
      beginner: "O",
      intermediate: "OO",
      advanced: "OOO",
      field: "F",
    }[String(value).toLowerCase()] || ""
  );
}

function pageWeight(type) {
  return (
    {
      context: 0.72,
      overview: 0.96,
      technique: 0.78,
      reference: 0.74,
      "field-note": 0.7,
      pack: 0.9,
    }[type] || 0.68
  );
}

async function writePoster(page, concepts) {
  const src = page.media?.diagram?.src || "";
  if (!src.startsWith("/media/mock/posters/")) return;
  const posterPath = path.join(frontendRoot, src.replace(/^\/+/, ""));
  await fs.mkdir(path.dirname(posterPath), { recursive: true });
  await fs.writeFile(posterPath, createPosterSvg(page, concepts), "utf8");
}

function createPosterSvg(page, concepts) {
  const conceptLabels = (page.concepts || [])
    .map((id) => concepts.find((concept) => concept.id === id)?.title || titleFromSlug(id))
    .slice(0, 4)
    .join(" / ");
  const title = escapeSvg(page.title);
  const label = escapeSvg(conceptLabels || page.cluster);
  const summary = escapeSvg(page.summary);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-label="${title} poster">
  <rect width="1280" height="720" fill="#020202"/>
  <g stroke="#fff" opacity="0.16">
    <path d="M80 0v720M240 0v720M400 0v720M560 0v720M720 0v720M880 0v720M1040 0v720M1200 0v720"/>
    <path d="M0 90h1280M0 210h1280M0 330h1280M0 450h1280M0 570h1280"/>
  </g>
  <g fill="none" stroke="#fff" stroke-linecap="round">
    <path d="M160 500C320 360 456 628 620 466S914 280 1120 392" stroke-width="9" opacity=".9"/>
    <path d="M130 540C330 438 442 658 660 510S932 390 1150 470" stroke-width="2" opacity=".45"/>
    <path d="M220 210C406 118 536 276 702 190S938 112 1088 188" stroke-width="2" opacity=".2"/>
  </g>
  <circle cx="1040" cy="196" r="76" fill="none" stroke="#fff" stroke-width="5" opacity=".78"/>
  <circle cx="1040" cy="196" r="16" fill="#fff"/>
  <text x="80" y="116" fill="#cfcfcf" font-family="Arial, sans-serif" font-size="25" font-weight="700" letter-spacing="4">${label}</text>
  <text x="80" y="214" fill="#fff" font-family="Arial, sans-serif" font-size="68" font-weight="800">${title}</text>
  <foreignObject x="80" y="260" width="760" height="160">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font: 500 30px Arial, sans-serif; line-height: 1.35; color: #d8d8d8;">${summary}</div>
  </foreignObject>
</svg>
`;
}

async function writeMockData(manifest, markdown) {
  const payload = { generatedAt: manifest.generatedAt, manifest, markdown };
  const source = [
    "// Generated by sites/learn.xjk.yt/tools/generate-mock-content.mjs",
    "export const MOCK_CONTENT = ",
    JSON.stringify(payload, null, 2),
    ";",
    "",
    "export const MOCK_MANIFEST = MOCK_CONTENT.manifest;",
    "export const MOCK_MARKDOWN = MOCK_CONTENT.markdown;",
    "export default MOCK_CONTENT;",
    "",
  ].join("\n");
  await fs.writeFile(mockDataPath, source, "utf8");
}

function escapeSvg(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toPosix(value) {
  return value.replaceAll(path.sep, "/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
