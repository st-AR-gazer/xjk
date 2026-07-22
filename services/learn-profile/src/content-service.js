import fsp from "node:fs/promises";
import path from "node:path";

import { parseList } from "../../shared/xjkAuth.js";
import { normalizeSlug } from "./learn-data.js";

export function createContentService({ config, files, logger = console } = {}) {
  function resolveInside(root, relativePath) {
    const resolvedRoot = path.resolve(root);
    const target = path.resolve(resolvedRoot, relativePath);
    if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error("Resolved path escaped the Learn content directory.");
    }
    return target;
  }

  function markdownPathForPage(page = {}, slug = "") {
    const safeSlug = normalizeSlug(slug || page.slug || "");
    const configuredPath = String(page.markdown || page.path || `/content/${safeSlug}.md`)
      .trim()
      .replace(/^\/+/, "")
      .replace(/^content[\\/]/, "");
    if (!configuredPath.toLowerCase().endsWith(".md")) {
      throw new Error("Learn editor only writes markdown files.");
    }
    return resolveInside(config.contentDir, configuredPath);
  }

  function markdownUrlForSlug(slug = "") {
    return `/content/${normalizeSlug(slug)}.md`;
  }

  async function readManifest() {
    const raw = await fsp.readFile(files.paths.manifestFile, "utf8");
    const manifest = JSON.parse(raw);
    if (!Array.isArray(manifest.pages)) manifest.pages = [];
    if (!Array.isArray(manifest.clusters)) manifest.clusters = [];
    return manifest;
  }

  async function writeManifest(manifest) {
    const next = {
      ...manifest,
      generatedAt: manifest.generatedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const temporaryPath = `${files.paths.manifestFile}.tmp`;
    await fsp.writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`);
    await fsp.rename(temporaryPath, files.paths.manifestFile);
    return next;
  }

  async function backupMarkdownFile(filePath, slug) {
    try {
      const current = await fsp.readFile(filePath, "utf8");
      const safeName = normalizeSlug(slug).replace(/[\\/]/g, "__");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const targetDir = path.join(files.paths.backupDir, safeName);
      await fsp.mkdir(targetDir, { recursive: true });
      await fsp.writeFile(path.join(targetDir, `${stamp}.md`), current);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        logger.warn(`[learn-admin] backup failed for ${slug}: ${error?.message || error}`);
      }
    }
  }

  function normalizeTags(value) {
    if (Array.isArray(value)) return value.map((tag) => String(tag || "").trim()).filter(Boolean);
    return parseList(value);
  }

  function pageFromBody(body = {}, existing = null) {
    const slug = normalizeSlug(body.slug || existing?.slug || "");
    const section = String(body.section || existing?.section || slug.split("/")[0] || "learn").trim();
    const category = String(body.category || existing?.category || slug.split("/")[1] || "guide").trim();
    const cluster = String(body.cluster || existing?.cluster || existing?.graph?.primaryCluster || section).trim();
    const tags = body.tags !== undefined ? normalizeTags(body.tags) : existing?.tags || [];
    return {
      ...(existing || {}),
      id: slug,
      slug,
      title: String(body.title || existing?.title || slug.split("/").pop()?.replaceAll("-", " ") || "Untitled").trim(),
      summary: String(body.summary || existing?.summary || "Draft Learn topic.").trim(),
      section,
      category,
      type: String(body.type || existing?.type || "guide").trim(),
      difficulty: String(body.difficulty || existing?.difficulty || "beginner").trim(),
      difficultyIcon: String(body.difficultyIcon || existing?.difficultyIcon || "O").trim(),
      time: String(body.time || existing?.time || "5 min").trim(),
      markdown: existing?.markdown || markdownUrlForSlug(slug),
      tags,
      media: existing?.media || {},
      tools: existing?.tools || {
        "ghost-basic": { kind: "ghost-comparison", title: "Ghost Comparison" },
        "input-basic": { kind: "input-timeline", title: "Input Timeline" },
      },
      related: Array.isArray(body.related) ? body.related.map(normalizeSlug) : existing?.related || [],
      links: Array.isArray(body.links) ? body.links : existing?.links || [],
      cluster,
      secondaryClusters: Array.isArray(body.secondaryClusters)
        ? body.secondaryClusters.map((item) => String(item || "").trim()).filter(Boolean)
        : existing?.secondaryClusters || [],
      graph: {
        ...(existing?.graph || {}),
        primaryCluster: cluster,
        secondaryClusters: Array.isArray(body.secondaryClusters)
          ? body.secondaryClusters.map((item) => String(item || "").trim()).filter(Boolean)
          : existing?.graph?.secondaryClusters || existing?.secondaryClusters || [],
        weight: Number(body.weight || existing?.graph?.weight || 0.65),
      },
    };
  }

  function defaultMarkdownForPage(page) {
    return `# ${page.title}

${page.summary}

::tip{title="Editor note"}
Replace this draft with a focused Learn lesson. Keep the headings clear, add wiki links like [[${page.slug}|this topic]], and use declarative embeds when they help.
::

## Goal

- State the mechanic.
- Explain when to use it.
- Add one repeatable drill.

## Drill

Describe the setup, input timing, and what a clean attempt should look like.
`;
  }

  async function listContentPages() {
    const manifest = await readManifest();
    const pages = [];
    for (const page of manifest.pages) {
      const slug = page.slug || page.id || "";
      if (!slug) continue;
      const filePath = markdownPathForPage(page, slug);
      let stat = null;
      try {
        stat = await fsp.stat(filePath);
      } catch {
        stat = null;
      }
      pages.push({
        slug,
        title: page.title || slug,
        summary: page.summary || "",
        section: page.section || "",
        category: page.category || "",
        cluster: page.cluster || page.graph?.primaryCluster || "",
        markdown: page.markdown || "",
        exists: Boolean(stat),
        size: stat?.size || 0,
        updatedAt: stat ? stat.mtime.toISOString() : null,
      });
    }
    return { manifest, pages };
  }

  return {
    resolveInside,
    markdownPathForPage,
    markdownUrlForSlug,
    readManifest,
    writeManifest,
    backupMarkdownFile,
    normalizeTags,
    pageFromBody,
    defaultMarkdownForPage,
    listContentPages,
  };
}
