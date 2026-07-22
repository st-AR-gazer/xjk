import "../../../shared/xjk-core/safe-html.js?v=2";
import {
  clusterForPage,
  clusterSvgIcon,
  difficultyLabel,
  escapeHtml,
  formatCount,
  pageTitle,
  readJson,
  renderIcon,
  slugToHash,
  unique,
  writeJson,
} from "./utils.js";
import { getState, toggleBookmark, toggleCompleted } from "./state.js";

const FILTER_KEY = "xjk.learn.library.filters";

const DEFAULT_FILTERS = {
  query: "",
  cluster: "all",
  difficulty: "all",
  tag: "all",
  groupBy: "cluster",
  sortBy: "recommended",
  viewStyle: "tiles",
  bookmarkedOnly: false,
  hideCompleted: false,
};

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function slug(value = "") {
  return String(value || "")
    .trim()
    .replace(/^content\//, "")
    .replace(/\.md$/i, "")
    .replace(/^\/+/, "");
}

function clusterLabel(clusterId, manifest = {}) {
  const clusters = manifest.clusters || manifest.graph?.clusters || [];
  if (Array.isArray(clusters)) {
    const match = clusters.find((cluster) => (cluster.id || cluster.slug || cluster.name) === clusterId);
    return match?.title || match?.label || match?.name || clusterId;
  }
  const cluster = clusters[clusterId];
  if (cluster && typeof cluster === "object") return cluster.title || cluster.label || cluster.name || clusterId;
  return String(clusterId || "learn").replaceAll("-", " ");
}

function normalizeTags(page = {}) {
  return unique(
    [
      ...toArray(page.tags),
      ...toArray(page.keywords),
      ...toArray(page.graph?.tags),
      page.section,
      page.category,
      page.type,
    ]
      .map((tag) => String(tag || "").trim())
      .filter(Boolean)
  );
}

function pageMinutes(page = {}) {
  const raw = page.minutes ?? page.durationMinutes ?? page.readingMinutes ?? page.time ?? page.duration ?? "";
  const match = String(raw).match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function titleCase(value = "") {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function pageSource(manifest = getState().manifest) {
  if (Array.isArray(manifest)) return manifest;
  return manifest?.pages || manifest?.lessons || manifest?.items || [];
}

export function getLibraryItems(manifest = getState().manifest) {
  return pageSource(manifest).map((page, index) => {
    const primaryCluster = clusterForPage(page);
    const pageSlug = slug(page.slug || page.id || page.path || `lesson-${index + 1}`);
    return {
      index,
      slug: pageSlug,
      title: pageTitle(page),
      summary: page.summary || page.description || page.excerpt || "",
      cluster: primaryCluster,
      clusterLabel: clusterLabel(primaryCluster, manifest),
      secondaryClusters: toArray(page.secondaryClusters || page.graph?.secondaryClusters),
      difficulty: String(page.difficulty || page.level || "guide").toLowerCase(),
      difficultyIcon: page.difficultyIcon || "",
      type: page.type || page.kind || "lesson",
      tags: normalizeTags(page),
      minutes: pageMinutes(page),
      order: Number(page.order ?? page.rank ?? index),
      updated: page.updated || page.modified || page.date || "",
      href: page.href || slugToHash(pageSlug),
    };
  });
}

export function getLibraryFacets(items = getLibraryItems()) {
  return {
    clusters: unique(items.flatMap((item) => [item.cluster, ...item.secondaryClusters])).filter(Boolean),
    difficulties: unique(items.map((item) => item.difficulty)).filter(Boolean),
    tags: unique(items.flatMap((item) => item.tags.map((tag) => tag.toLowerCase()))).sort((a, b) => a.localeCompare(b)),
  };
}

function loadFilters(route = {}, state = getState()) {
  const saved = readJson(FILTER_KEY, {});
  const routeCluster = route?.query?.get?.("cluster") || route?.slug || "";
  return {
    ...DEFAULT_FILTERS,
    ...saved,
    cluster: routeCluster || saved.cluster || state.selectedCluster || DEFAULT_FILTERS.cluster,
  };
}

function saveFilters(filters) {
  writeJson(FILTER_KEY, { ...DEFAULT_FILTERS, ...filters });
}

function statusFor(item, state = getState()) {
  if (state.completed.includes(item.slug)) return "completed";
  if (state.bookmarks.includes(item.slug)) return "saved";
  return "open";
}

function matchesQuery(item, query = "") {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.title, item.summary, item.cluster, item.clusterLabel, item.difficulty, item.type, ...item.tags]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function sortItems(items, sortBy) {
  return [...items].sort((a, b) => {
    if (sortBy === "title") return a.title.localeCompare(b.title);
    if (sortBy === "duration") return a.minutes - b.minutes || a.title.localeCompare(b.title);
    if (sortBy === "updated") {
      return String(b.updated).localeCompare(String(a.updated)) || a.title.localeCompare(b.title);
    }
    return a.order - b.order || a.title.localeCompare(b.title);
  });
}

export function filterLibraryItems(items, filters = {}, state = getState()) {
  const active = { ...DEFAULT_FILTERS, ...filters };
  return sortItems(items, active.sortBy).filter((item) => {
    const inCluster =
      active.cluster === "all" || item.cluster === active.cluster || item.secondaryClusters.includes(active.cluster);
    if (!inCluster) return false;
    if (active.difficulty !== "all" && item.difficulty !== active.difficulty) return false;
    if (active.tag !== "all" && !item.tags.map((tag) => tag.toLowerCase()).includes(active.tag)) return false;
    if (active.bookmarkedOnly && !state.bookmarks.includes(item.slug)) return false;
    if (active.hideCompleted && state.completed.includes(item.slug)) return false;
    return matchesQuery(item, active.query);
  });
}

export function groupLibraryItems(items, filters = {}, manifest = getState().manifest, state = getState()) {
  const active = { ...DEFAULT_FILTERS, ...filters };
  const groups = new Map();
  items.forEach((item) => {
    let key = item.cluster;
    let label = item.clusterLabel;
    if (active.groupBy === "difficulty") {
      key = item.difficulty;
      label = difficultyLabel(item.difficulty);
    } else if (active.groupBy === "status") {
      key = statusFor(item, state);
      label = { completed: "Completed", saved: "Saved", open: "Open" }[key] || key;
    } else if (active.groupBy === "type") {
      key = item.type;
      label = String(item.type || "lesson").replaceAll("-", " ");
    } else {
      label = clusterLabel(item.cluster, manifest);
    }
    if (!groups.has(key)) groups.set(key, { key, label, items: [] });
    groups.get(key).items.push(item);
  });
  return [...groups.values()];
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function clusterCard(cluster, count, active) {
  return `<button class="learn-library-card ${active === cluster.id ? "is-active" : ""}" data-cluster="${escapeHtml(cluster.id)}" type="button">
    <span class="learn-nav-icon">${clusterSvgIcon(cluster.id)}</span>
    <h2 class="learn-card-title">${escapeHtml(cluster.title || cluster.id)} <span class="learn-pill">${count}</span></h2>
    <p class="learn-card-text">${escapeHtml(cluster.description || "")}</p>
  </button>`;
}

function createFolderNode({ segment = "", label = "Library", path = "", depth = -1 } = {}) {
  return {
    segment,
    label,
    path,
    depth,
    count: 0,
    children: new Map(),
    items: [],
  };
}

function folderLabel(segment = "", depth = 0, manifest = {}) {
  if (depth === 0) {
    const clusters = manifest.clusters || [];
    const cluster = clusters.find((entry) => entry.id === segment || entry.slug === segment);
    if (cluster) return cluster.title || cluster.label || titleCase(segment);
  }
  return titleCase(segment);
}

function buildLibraryTree(items = [], manifest = {}) {
  const rootNode = createFolderNode();
  items.forEach((item) => {
    const segments = item.slug.split("/").filter(Boolean);
    const folders = segments.length > 1 ? segments.slice(0, -1) : [item.cluster || "uncategorized"];
    let current = rootNode;
    folders.forEach((segment, index) => {
      const path = [...folders.slice(0, index), segment].join("/");
      if (!current.children.has(segment)) {
        current.children.set(
          segment,
          createFolderNode({
            segment,
            path,
            depth: index,
            label: folderLabel(segment, index, manifest),
          })
        );
      }
      current = current.children.get(segment);
    });
    current.items.push(item);
  });

  function count(node) {
    node.count = node.items.length + [...node.children.values()].reduce((total, child) => total + count(child), 0);
    return node.count;
  }
  count(rootNode);
  return rootNode;
}

function sortedFolders(node, manifest = {}) {
  const clusterOrder = new Map((manifest.clusters || []).map((cluster, index) => [cluster.id, index]));
  return [...node.children.values()].sort((a, b) => {
    if (a.depth === 0 || b.depth === 0) {
      const orderA = clusterOrder.has(a.segment) ? clusterOrder.get(a.segment) : 999;
      const orderB = clusterOrder.has(b.segment) ? clusterOrder.get(b.segment) : 999;
      if (orderA !== orderB) return orderA - orderB;
    }
    return a.label.localeCompare(b.label);
  });
}

function activeExplorerFilter(filters = {}) {
  return Boolean(
    filters.query ||
      filters.cluster !== "all" ||
      filters.difficulty !== "all" ||
      filters.tag !== "all" ||
      filters.bookmarkedOnly ||
      filters.hideCompleted
  );
}

function renderLibraryRow(item, state) {
  const locked = !state.authenticated;
  const saved = !locked && state.bookmarks.includes(item.slug);
  const done = !locked && state.completed.includes(item.slug);
  const status = done ? "Done" : saved ? "Saved" : "Open";
  const fileName = item.slug.split("/").at(-1) || item.slug;
  const time = item.minutes ? `${item.minutes} min` : "-";
  const actions = locked
    ? ""
    : `<span class="learn-library-row-actions">
      <button class="learn-toggle" data-library-action="bookmark" data-slug="${escapeHtml(item.slug)}" aria-pressed="${saved}" title="${saved ? "Remove bookmark" : "Save topic"}" type="button">${saved ? "Saved" : "Save"}</button>
      <button class="learn-toggle" data-library-action="complete" data-slug="${escapeHtml(item.slug)}" aria-pressed="${done}" title="${done ? "Mark incomplete" : "Mark done"}" type="button">${done ? "Done" : "Done?"}</button>
    </span>`;
  return `<article class="learn-library-row" data-library-card="${escapeHtml(item.slug)}">
    <a class="learn-library-row-main" href="${escapeHtml(item.href)}">
      <span class="learn-library-file-icon">${renderIcon("file-text")}</span>
      <span class="learn-library-file-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(fileName)} / ${escapeHtml(item.summary || "No summary yet.")}</small>
      </span>
    </a>
    <span class="learn-library-cell">${escapeHtml(item.type || "card")}</span>
    <span class="learn-library-cell">${escapeHtml(difficultyLabel(item.difficulty))}</span>
    <span class="learn-library-cell">${escapeHtml(time)}</span>
    <span class="learn-library-cell">${locked ? "Login" : escapeHtml(status)}</span>
    ${actions}
  </article>`;
}

function renderLibraryFileTile(item, state) {
  const locked = !state.authenticated;
  const saved = !locked && state.bookmarks.includes(item.slug);
  const done = !locked && state.completed.includes(item.slug);
  const status = done ? "Done" : saved ? "Saved" : "Open";
  const fileName = item.slug.split("/").at(-1) || item.slug;
  const time = item.minutes ? `<span class="learn-pill">${item.minutes} min</span>` : "";
  const tags = item.tags
    .slice(0, 3)
    .map((tag) => `<span class="learn-pill">${escapeHtml(tag)}</span>`)
    .join("");
  const actions = locked
    ? ""
    : `<span class="learn-library-row-actions">
      <button class="learn-toggle" data-library-action="bookmark" data-slug="${escapeHtml(item.slug)}" aria-pressed="${saved}" title="${saved ? "Remove bookmark" : "Save topic"}" type="button">${saved ? "Saved" : "Save"}</button>
      <button class="learn-toggle" data-library-action="complete" data-slug="${escapeHtml(item.slug)}" aria-pressed="${done}" title="${done ? "Mark incomplete" : "Mark done"}" type="button">${done ? "Done" : "Done?"}</button>
    </span>`;
  return `<article class="learn-library-file-tile" data-library-card="${escapeHtml(item.slug)}">
    <a class="learn-library-tile-main" href="${escapeHtml(item.href)}">
      <span class="learn-library-file-icon">${renderIcon("file-text")}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(fileName)}</small>
      <p>${escapeHtml(item.summary || "No summary yet.")}</p>
    </a>
    <div class="learn-meta-row">
      <span class="learn-pill">${escapeHtml(item.type || "card")}</span>
      <span class="learn-pill difficulty-${escapeHtml(item.difficulty)}">${escapeHtml(difficultyLabel(item.difficulty))}</span>
      ${time}
      ${locked ? "" : `<span class="learn-pill">${escapeHtml(status)}</span>`}
    </div>
    ${tags ? `<div class="learn-meta-row">${tags}</div>` : ""}
    ${actions}
  </article>`;
}

function folderSummary(node) {
  const folderCount = node.children.size;
  const fileCount = node.items.length;
  const parts = [];
  if (folderCount) parts.push(formatCount(folderCount, "folder"));
  if (fileCount) parts.push(formatCount(fileCount, "card"));
  return parts.join(" / ") || "empty";
}

function findFolderNode(rootNode, path = "") {
  if (!path) return rootNode;
  let current = rootNode;
  for (const segment of path.split("/").filter(Boolean)) {
    current = current.children.get(segment);
    if (!current) return null;
  }
  return current;
}

function parentPath(path = "") {
  return path.split("/").filter(Boolean).slice(0, -1).join("/");
}

function breadcrumbItems(path = "", manifest = {}) {
  const segments = path.split("/").filter(Boolean);
  const items = [{ label: "Library", path: "" }];
  segments.forEach((segment, index) => {
    items.push({
      label: folderLabel(segment, index, manifest),
      path: segments.slice(0, index + 1).join("/"),
    });
  });
  return items;
}

function renderBreadcrumbs(path = "", manifest = {}) {
  return `<nav class="learn-library-breadcrumbs" aria-label="Library folder path">
    ${breadcrumbItems(path, manifest)
      .map(
        (item, index) =>
          `<button class="learn-library-crumb ${index === 0 ? "is-root" : ""}" data-library-folder-path="${escapeHtml(item.path)}" type="button">${escapeHtml(item.label)}</button>`
      )
      .join(`<span>${renderIcon("chevron-right")}</span>`)}
  </nav>`;
}

function renderFolderTile(node) {
  return `<button class="learn-library-folder-tile" data-library-folder-path="${escapeHtml(node.path)}" type="button">
    <span class="learn-library-tile-icon">${renderIcon("folder")}</span>
    <strong>${escapeHtml(node.label)}</strong>
    <small>${escapeHtml(node.path ? node.path.replaceAll("/", " / ") : "Library")}</small>
    <span class="learn-library-tile-meta">${escapeHtml(formatCount(node.count, "card"))} / ${escapeHtml(folderSummary(node))}</span>
  </button>`;
}

function renderTreeFolder(node, state, manifest, filters = {}) {
  const folders = sortedFolders(node, manifest);
  const itemCount = node.items.length;
  const open = node.depth <= 0 || activeExplorerFilter(filters);
  const typeLabel = node.depth === 0 ? "Area" : "Folder";
  const folderPath = node.path || node.segment || "library";

  return `<details class="learn-library-folder" data-depth="${node.depth}" ${open ? "open" : ""}>
    <summary class="learn-library-folder-head">
      <span class="learn-library-folder-caret">${renderIcon("chevron-right")}</span>
      <span class="learn-library-folder-icon">
        ${renderIcon("folder", "learn-folder-closed")}
        ${renderIcon("folder-open", "learn-folder-open")}
      </span>
      <span class="learn-library-folder-copy">
        <strong>${escapeHtml(node.label)}</strong>
        <small>${escapeHtml(folderPath.replaceAll("/", " / "))}</small>
      </span>
      <span class="learn-library-cell">${escapeHtml(typeLabel)}</span>
      <span class="learn-library-cell">${escapeHtml(folderSummary(node))}</span>
      <span class="learn-library-cell">${escapeHtml(formatCount(node.count, "card"))}</span>
      <span class="learn-library-cell">${escapeHtml(itemCount ? formatCount(itemCount, "direct card", "direct cards") : "nested")}</span>
    </summary>
    <div class="learn-library-folder-body">
      ${folders.map((folder) => renderTreeFolder(folder, state, manifest, filters)).join("")}
      ${node.items.map((item) => renderLibraryRow(item, state)).join("")}
    </div>
  </details>`;
}

function renderTree(items, state, manifest, filters = {}) {
  if (!items.length) return `<div class="learn-empty">No topics match this filter.</div>`;
  const tree = buildLibraryTree(items, manifest);
  const folders = sortedFolders(tree, manifest);

  return `<div class="learn-library-tree">
    <div class="learn-library-header" aria-hidden="true">
      <span>Name</span>
      <span>Type</span>
      <span>Level / items</span>
      <span>Time</span>
      <span>Status</span>
    </div>
    ${folders.map((folder) => renderTreeFolder(folder, state, manifest, filters)).join("")}
    ${tree.items.map((item) => renderLibraryRow(item, state)).join("")}
  </div>`;
}

function renderExplorer(items, state, manifest, currentPath = "") {
  if (!items.length) return `<div class="learn-empty">No topics match this filter.</div>`;
  const tree = buildLibraryTree(items, manifest);
  const node = findFolderNode(tree, currentPath) || tree;
  const actualPath = node === tree ? "" : node.path;
  const folders = sortedFolders(node, manifest);
  const totalVisible = folders.length + node.items.length;
  const upPath = parentPath(actualPath);

  return `<div class="learn-library-browser">
    <div class="learn-library-browser-bar">
      <button class="learn-icon-button" data-library-up type="button" ${actualPath ? "" : "disabled"} aria-label="Up one folder">${renderIcon("chevron-left")}</button>
      ${renderBreadcrumbs(actualPath, manifest)}
      <span class="learn-pill">${escapeHtml(formatCount(totalVisible, "item"))}</span>
      <span class="learn-library-current-path">${escapeHtml(actualPath || "/")}</span>
    </div>
    <div class="learn-library-tile-grid">
      ${
        actualPath
          ? `<button class="learn-library-folder-tile is-up" data-library-folder-path="${escapeHtml(upPath)}" type="button">
        <span class="learn-library-tile-icon">${renderIcon("chevron-left")}</span>
        <strong>Up</strong>
        <small>${escapeHtml(upPath || "Library")}</small>
        <span class="learn-library-tile-meta">Parent folder</span>
      </button>`
          : ""
      }
      ${folders.map(renderFolderTile).join("")}
      ${node.items.map((item) => renderLibraryFileTile(item, state)).join("")}
    </div>
    ${totalVisible ? "" : `<div class="learn-empty">This folder is empty.</div>`}
  </div>`;
}

export function renderLibraryView({
  root,
  state = getState(),
  store = null,
  route = {},
  navigateView,
  showToast,
  onAccountSync,
} = {}) {
  if (!root) return () => {};
  const manifest = state.manifest || store?.getManifest?.() || store?.manifest || { pages: [], clusters: [] };
  const allItems = getLibraryItems(manifest);
  const facets = getLibraryFacets(allItems);
  let filters = loadFilters(route, state);
  const validClusters = new Set(["all", ...(manifest.clusters || []).map((cluster) => cluster.id), ...facets.clusters]);
  if (!validClusters.has(filters.cluster)) filters.cluster = "all";
  if (filters.difficulty !== "all" && !facets.difficulties.includes(filters.difficulty)) filters.difficulty = "all";
  if (filters.tag !== "all" && !facets.tags.includes(filters.tag)) filters.tag = "all";
  if (!["tiles", "tree"].includes(filters.viewStyle)) filters.viewStyle = DEFAULT_FILTERS.viewStyle;
  if (!state.authenticated) {
    filters = {
      ...filters,
      bookmarkedOnly: false,
      hideCompleted: false,
      groupBy: filters.groupBy === "status" ? "cluster" : filters.groupBy,
    };
  }
  let currentPath = "";

  function filtered() {
    return filterLibraryItems(allItems, filters, state);
  }

  function clusterCount(clusterId) {
    return allItems.filter((item) => item.cluster === clusterId || item.secondaryClusters.includes(clusterId)).length;
  }

  function renderResults() {
    const pages = filtered();
    const resultRoot = root.querySelector("#library-results");
    const count = root.querySelector("#library-count");
    const tree = buildLibraryTree(pages, manifest);
    if (!findFolderNode(tree, currentPath)) currentPath = "";
    if (count) count.textContent = `${pages.length} cards`;
    if (resultRoot) {
      globalThis.XjkSafeHtml.set(
        resultRoot,
        filters.viewStyle === "tree"
          ? renderTree(pages, state, manifest, filters)
          : renderExplorer(pages, state, manifest, currentPath)
      );
    }
  }

  function renderShell() {
    globalThis.XjkSafeHtml.set(
      root,
      `<div class="learn-workspace learn-library-workspace">
      <section class="learn-panel">
        <div class="learn-page-head">
          <div>
            <p class="learn-eyebrow">Library</p>
            <h1 class="learn-page-title">Content index</h1>
            <p class="learn-page-subtitle">Browse cards like a file tree. Open a top-level folder to reveal its subfolders, then open those for the actual cards.</p>
          </div>
          <button class="learn-button" data-action="random-topic" type="button">Random topic</button>
        </div>
        <div class="learn-filter-row">
          <input id="library-search" class="learn-input" type="search" placeholder="Filter library..." value="${escapeHtml(filters.query)}" />
          <button class="learn-chip ${filters.cluster === "all" ? "is-active" : ""}" data-cluster="all" type="button">All</button>
          ${(manifest.clusters || []).map((cluster) => `<button class="learn-chip ${filters.cluster === cluster.id ? "is-active" : ""}" data-cluster="${escapeHtml(cluster.id)}" type="button">${escapeHtml(cluster.title || cluster.id)}</button>`).join("")}
          <select class="learn-select" data-library-filter="difficulty">${[
            option("all", "All levels", filters.difficulty === "all"),
            ...facets.difficulties.map((difficulty) =>
              option(difficulty, difficultyLabel(difficulty), filters.difficulty === difficulty)
            ),
          ].join("")}</select>
          <select class="learn-select" data-library-filter="tag">${[
            option("all", "All tags", filters.tag === "all"),
            ...facets.tags.map((tag) => option(tag, `#${tag}`, filters.tag === tag)),
          ].join("")}</select>
          <select class="learn-select" data-library-filter="sortBy">
            ${option("recommended", "Recommended", filters.sortBy === "recommended")}
            ${option("title", "Title", filters.sortBy === "title")}
            ${option("duration", "Duration", filters.sortBy === "duration")}
            ${option("updated", "Updated", filters.sortBy === "updated")}
          </select>
          <span class="learn-library-view-switch" role="group" aria-label="Library view style">
            <button class="learn-chip ${filters.viewStyle === "tiles" ? "is-active" : ""}" data-library-view-style="tiles" type="button" title="Browse one folder at a time">Folders</button>
            <button class="learn-chip ${filters.viewStyle === "tree" ? "is-active" : ""}" data-library-view-style="tree" type="button" title="Show an expandable file tree">Tree</button>
          </span>
          <button class="learn-chip ${filters.bookmarkedOnly ? "is-active" : ""}" data-library-toggle="bookmarkedOnly" type="button" ${state.authenticated ? "" : "disabled"} title="${state.authenticated ? "Show saved topics only" : "Log in to filter saved topics"}">Saved</button>
          <button class="learn-chip ${filters.hideCompleted ? "is-active" : ""}" data-library-toggle="hideCompleted" type="button" ${state.authenticated ? "" : "disabled"} title="${state.authenticated ? "Hide completed topics" : "Log in to track completed topics"}">Hide done</button>
          <button class="learn-chip" data-library-action="reset-filters" type="button">Reset</button>
          <span id="library-count" class="learn-pill"></span>
        </div>
        <div id="library-results"></div>
      </section>
      <aside class="learn-panel">
        <p class="learn-eyebrow">Clusters</p>
        <h2 class="learn-card-title">Concept areas</h2>
        <p class="learn-card-text">Cards sit in one primary area while concepts and packs pull visible tendrils toward the other context they need.</p>
        <div class="learn-card-grid learn-library-cluster-grid">
          ${(manifest.clusters || []).map((cluster) => clusterCard(cluster, clusterCount(cluster.id), filters.cluster)).join("")}
        </div>
      </aside>
    </div>`
    );
    renderResults();
  }

  const persistAndRender = (nextFilters, redrawShell = false) => {
    filters = { ...filters, ...nextFilters };
    currentPath = "";
    saveFilters(filters);
    if (redrawShell) renderShell();
    else renderResults();
  };

  const onInput = (event) => {
    if (event.target.id === "library-search") {
      persistAndRender({ query: event.target.value });
    }
  };

  const onChange = (event) => {
    const control = event.target.closest("[data-library-filter]");
    if (!control) return;
    persistAndRender({ [control.dataset.libraryFilter]: control.value });
  };

  const onClick = (event) => {
    const folder = event.target.closest("[data-library-folder-path]");
    if (folder) {
      currentPath = folder.dataset.libraryFolderPath || "";
      renderResults();
      return;
    }

    const up = event.target.closest("[data-library-up]");
    if (up) {
      currentPath = parentPath(currentPath);
      renderResults();
      return;
    }

    const viewStyle = event.target.closest("[data-library-view-style]");
    if (viewStyle) {
      persistAndRender({ viewStyle: viewStyle.dataset.libraryViewStyle || DEFAULT_FILTERS.viewStyle }, true);
      return;
    }

    const action = event.target.closest("[data-library-action]");
    if (action?.dataset.libraryAction === "reset-filters") {
      filters = { ...DEFAULT_FILTERS };
      currentPath = "";
      saveFilters(filters);
      renderShell();
      return;
    }

    const progress = event.target.closest("[data-library-action][data-slug]");
    if (progress?.dataset.libraryAction === "bookmark") {
      if (!state.authenticated) {
        showToast?.("Bookmarks need a Learn login");
        navigateView?.("profile");
        return;
      }
      const added = toggleBookmark(progress.dataset.slug);
      onAccountSync?.();
      showToast?.(added ? "Bookmarked" : "Bookmark removed");
      renderResults();
      return;
    }
    if (progress?.dataset.libraryAction === "complete") {
      if (!state.authenticated) {
        showToast?.("Progress tracking needs a Learn login");
        navigateView?.("profile");
        return;
      }
      const done = toggleCompleted(progress.dataset.slug);
      onAccountSync?.();
      showToast?.(done ? "Marked complete" : "Marked incomplete");
      renderResults();
      return;
    }

    const toggle = event.target.closest("[data-library-toggle]");
    if (toggle) {
      const key = toggle.dataset.libraryToggle;
      persistAndRender({ [key]: !filters[key] }, true);
      return;
    }

    const cluster = event.target.closest("[data-cluster]");
    if (!cluster) return;
    persistAndRender({ cluster: cluster.dataset.cluster }, true);
    if (filters.cluster !== "all") showToast?.(`Cluster: ${filters.cluster}`);
  };

  renderShell();
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("click", onClick);
  return () => {
    root.removeEventListener("input", onInput);
    root.removeEventListener("change", onChange);
    root.removeEventListener("click", onClick);
  };
}

export default renderLibraryView;
