const elements = {
  buildDate: document.getElementById("buildDate"),
  search: document.getElementById("search"),
  statGames: document.getElementById("statGames"),
  statBuilds: document.getElementById("statBuilds"),
  statFiles: document.getElementById("statFiles"),
  catalog: document.getElementById("catalog"),
};

const state = {
  raw: null,
  games: [],
  query: "",
};

function normalizeText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  return [];
}

function stripUnsafeUrl(value) {
  const url = normalizeText(value);
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) return url;
  return url;
}

function normalizeFile(file, index) {
  if (!file || typeof file !== "object") return null;
  const label = normalizeText(file.label || `File ${index + 1}`);
  const url = stripUnsafeUrl(file.url);
  return url ? { label, url } : null;
}

function normalizeLink(link, index) {
  if (!link || typeof link !== "object") return null;
  const label = normalizeText(link.label || `Link ${index + 1}`);
  const url = stripUnsafeUrl(link.url);
  return url ? { label, url } : null;
}

function normalizeBuild(build, index) {
  if (!build || typeof build !== "object") return null;
  const name = normalizeText(build.name || build.label || `Build ${index + 1}`);
  const version = normalizeText(build.version);
  const released = normalizeText(build.released);
  const platform = normalizeText(build.platform);
  const distribution = normalizeText(build.distribution);
  const notes = normalizeText(build.notes);

  const files = toArray(build.files)
    .map((file, fileIndex) => normalizeFile(file, fileIndex))
    .filter(Boolean);
  const links = toArray(build.links)
    .map((link, linkIndex) => normalizeLink(link, linkIndex))
    .filter(Boolean);

  return {
    id: normalizeText(build.id || `build-${index + 1}`),
    name,
    version,
    released,
    platform,
    distribution,
    notes,
    files,
    links,
  };
}

function normalizeGame(game, index) {
  if (!game || typeof game !== "object") return null;
  const id = normalizeText(game.id || `game-${index + 1}`);
  const name = normalizeText(game.name || "Untitled Game");
  const franchise = normalizeText(game.franchise || "TrackMania");
  const years = normalizeText(game.years);
  const description = normalizeText(game.description);
  const platforms = toArray(game.platforms).map((p) => normalizeText(p)).filter(Boolean);
  const builds = toArray(game.builds)
    .map((build, buildIndex) => normalizeBuild(build, buildIndex))
    .filter(Boolean);

  return { id, name, franchise, years, description, platforms, builds };
}

function normalizeArchive(payload) {
  const games = toArray(payload?.games)
    .map((game, index) => normalizeGame(game, index))
    .filter(Boolean);

  const byFranchise = new Map();
  games.forEach((game) => {
    const key = game.franchise || "Other";
    if (!byFranchise.has(key)) byFranchise.set(key, []);
    byFranchise.get(key).push(game);
  });

  return { games, byFranchise };
}

function formatDate(dateIso) {
  if (!dateIso) return "";
  const parsed = new Date(dateIso);
  if (!Number.isFinite(parsed.getTime())) return dateIso;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function textIncludes(haystack, needle) {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle);
}

function buildSearchText(game, build) {
  const parts = [
    game?.name,
    game?.franchise,
    game?.years,
    game?.description,
    ...(game?.platforms || []),
    build?.name,
    build?.version,
    build?.released,
    build?.platform,
    build?.distribution,
    build?.notes,
    ...(build?.files || []).map((f) => `${f.label} ${f.url}`),
    ...(build?.links || []).map((l) => `${l.label} ${l.url}`),
  ].filter(Boolean);
  return parts.join(" ").trim();
}

function createPill(label, className) {
  const pill = document.createElement("span");
  pill.className = `pill ${className || ""}`.trim();
  pill.textContent = label;
  return pill;
}

function createBuildCard(build) {
  const wrapper = document.createElement("div");
  wrapper.className = "build";

  const head = document.createElement("div");
  head.className = "build-head";

  const title = document.createElement("strong");
  title.textContent = build.name;

  const right = document.createElement("span");
  right.className = "muted";
  const releaseLabel = build.released ? formatDate(build.released) : "";
  right.textContent = releaseLabel;

  head.append(title, right);

  const meta = document.createElement("div");
  meta.className = "build-meta";

  const metaParts = [];
  if (build.version) metaParts.push(`Version: ${build.version}`);
  if (build.platform) metaParts.push(`Platform: ${build.platform}`);
  if (build.distribution) metaParts.push(`Source: ${build.distribution}`);
  meta.textContent = metaParts.join(" · ");

  const notes = document.createElement("p");
  notes.className = "muted";
  notes.textContent = build.notes || "";

  const links = document.createElement("div");
  links.className = "links";

  const fileLinks = build.files.map((file, index) => {
    const a = document.createElement("a");
    a.className = index === 0 ? "btn btn-primary" : "btn";
    a.href = file.url;
    a.rel = "noopener";
    a.textContent = file.label || "Download";
    return a;
  });

  const infoLinks = build.links.map((link) => {
    const a = document.createElement("a");
    a.className = "btn";
    a.href = link.url;
    a.target = link.url.startsWith("/") ? "" : "_blank";
    a.rel = "noopener";
    a.textContent = link.label || "Info";
    return a;
  });

  [...fileLinks, ...infoLinks].forEach((a) => links.appendChild(a));

  wrapper.append(head);
  if (meta.textContent) wrapper.append(meta);
  if (notes.textContent) wrapper.append(notes);
  if (links.children.length) wrapper.append(links);

  return wrapper;
}

function createGameDetails(game, query) {
  const details = document.createElement("details");
  details.className = "game";

  const summary = document.createElement("summary");

  const titleBlock = document.createElement("div");
  titleBlock.className = "game-title";

  const title = document.createElement("strong");
  title.textContent = game.name;

  const meta = document.createElement("div");
  meta.className = "game-meta";

  const metaParts = [];
  if (game.years) metaParts.push(game.years);
  if (game.platforms.length) metaParts.push(game.platforms.join(", "));
  meta.textContent = metaParts.join(" · ");

  titleBlock.append(title);
  if (meta.textContent) titleBlock.append(meta);

  const pillStack = document.createElement("div");
  pillStack.className = "pill-stack";

  const buildCount = game.builds.length;
  const fileCount = game.builds.reduce((sum, build) => sum + build.files.length, 0);
  pillStack.append(createPill(`${buildCount} builds`, "pill-builds"), createPill(`${fileCount} files`, "pill-files"));

  summary.append(titleBlock, pillStack);
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "game-body";

  const desc = document.createElement("p");
  desc.className = "game-desc";
  desc.textContent = game.description || "";

  const buildsWrap = document.createElement("div");
  buildsWrap.className = "builds";

  const q = query.trim().toLowerCase();
  const matchedBuilds = q
    ? game.builds.filter((build) => textIncludes(buildSearchText(game, build), q))
    : game.builds;

  if (matchedBuilds.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = game.builds.length
      ? "No builds match your search."
      : "No archived builds yet. Add entries to data/archive.json.";
    buildsWrap.appendChild(empty);
  } else {
    matchedBuilds.forEach((build) => buildsWrap.appendChild(createBuildCard(build)));
  }

  if (desc.textContent) body.appendChild(desc);
  body.appendChild(buildsWrap);
  details.appendChild(body);

  return { details, matchedCount: matchedBuilds.length };
}

function renderStats() {
  const games = state.games.length;
  const builds = state.games.reduce((sum, game) => sum + game.builds.length, 0);
  const files = state.games.reduce((sum, game) => sum + game.builds.reduce((s, b) => s + b.files.length, 0), 0);
  elements.statGames.textContent = String(games);
  elements.statBuilds.textContent = String(builds);
  elements.statFiles.textContent = String(files);
}

function renderCatalog() {
  elements.catalog.innerHTML = "";

  const query = state.query.trim().toLowerCase();
  const byFranchise = new Map();
  state.games.forEach((game) => {
    const key = game.franchise || "Other";
    if (!byFranchise.has(key)) byFranchise.set(key, []);
    byFranchise.get(key).push(game);
  });

  const franchiseKeys = Array.from(byFranchise.keys()).sort((a, b) => a.localeCompare(b));

  let visibleGames = 0;

  franchiseKeys.forEach((franchise) => {
    const games = byFranchise.get(franchise) || [];

    const groupContainer = document.createElement("section");
    groupContainer.className = "group";

    const head = document.createElement("div");
    head.className = "group-head";

    const title = document.createElement("h3");
    title.textContent = franchise;

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = `${games.length} game${games.length === 1 ? "" : "s"}`;

    head.append(title, count);
    groupContainer.appendChild(head);

    let groupHasVisible = false;

    games.forEach((game) => {
      const gameMatches =
        !query ||
        textIncludes(buildSearchText(game, null), query) ||
        game.builds.some((build) => textIncludes(buildSearchText(game, build), query));

      if (!gameMatches) return;
      groupHasVisible = true;
      visibleGames += 1;

      const { details } = createGameDetails(game, state.query);
      groupContainer.appendChild(details);
    });

    if (groupHasVisible) {
      elements.catalog.appendChild(groupContainer);
    }
  });

  if (visibleGames === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No games match your search.";
    elements.catalog.appendChild(empty);
  }
}

function renderBuildDate() {
  const stamp = new Date();
  elements.buildDate.textContent = stamp.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

async function loadArchive() {
  const response = await fetch("data/archive.json", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`archive.json returned HTTP ${response.status}`);
  return await response.json();
}

function defaultArchive() {
  return {
    games: [
      {
        id: "tm-original",
        franchise: "TrackMania",
        name: "TrackMania (Original)",
        years: "2003",
        platforms: ["Windows"],
        description: "The original TrackMania release.",
        builds: [],
      },
      {
        id: "tm-sunrise",
        franchise: "TrackMania",
        name: "TrackMania Sunrise",
        years: "2005",
        platforms: ["Windows"],
        description: "TrackMania Sunrise and Sunrise eXtreme-era builds.",
        builds: [],
      },
      {
        id: "tm-nations-eswc",
        franchise: "TrackMania",
        name: "TrackMania Nations ESWC",
        years: "2006",
        platforms: ["Windows"],
        description: "The ESWC release and related patches.",
        builds: [],
      },
      {
        id: "tm-united",
        franchise: "TrackMania",
        name: "TrackMania United",
        years: "2006",
        platforms: ["Windows"],
        description: "TrackMania United (retail/digital) installers and updates.",
        builds: [],
      },
      {
        id: "tm-forever",
        franchise: "TrackMania",
        name: "TrackMania Forever (Nations / United)",
        years: "2008",
        platforms: ["Windows"],
        description: "Nations Forever and United Forever builds.",
        builds: [],
      },
      {
        id: "tm2",
        franchise: "TrackMania² / ManiaPlanet",
        name: "TrackMania² (Canyon / Stadium / Valley / Lagoon)",
        years: "2011–2017",
        platforms: ["Windows"],
        description: "ManiaPlanet-era TrackMania² titles and updates.",
        builds: [],
      },
      {
        id: "tm-turbo",
        franchise: "TrackMania",
        name: "TrackMania Turbo",
        years: "2016",
        platforms: ["Windows", "PS4", "Xbox One"],
        description: "TrackMania Turbo releases and patches.",
        builds: [],
      },
      {
        id: "tm-2020",
        franchise: "TrackMania",
        name: "Trackmania (2020)",
        years: "2020–",
        platforms: ["Windows", "PS4/PS5", "Xbox One/Series", "Cloud"],
        description: "Trackmania 2020 builds, tools, and data snapshots.",
        builds: [],
      },
      {
        id: "shootmania-storm",
        franchise: "ShootMania / ManiaPlanet",
        name: "ShootMania Storm",
        years: "2013",
        platforms: ["Windows"],
        description: "ShootMania Storm builds and updates.",
        builds: [],
      },
      {
        id: "questmania",
        franchise: "QuestMania / ManiaPlanet",
        name: "QuestMania",
        years: "2011",
        platforms: ["Windows"],
        description: "QuestMania builds and updates.",
        builds: [],
      },
    ],
  };
}

function setQuery(next) {
  state.query = String(next || "");
  renderCatalog();
}

async function boot() {
  renderBuildDate();
  elements.catalog.innerHTML = '<div class="empty-state">Loading archive…</div>';

  try {
    state.raw = await loadArchive();
  } catch (err) {
    console.warn("Failed to load data/archive.json, using fallback:", err);
    state.raw = defaultArchive();
  }

  const normalized = normalizeArchive(state.raw);
  state.games = normalized.games;

  renderStats();
  renderCatalog();

  elements.search.addEventListener("input", () => setQuery(elements.search.value));
}

boot();

