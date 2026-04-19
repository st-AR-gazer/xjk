const elements = {
  buildDate: document.getElementById("buildDate"),
  search: document.getElementById("search"),
  searchWrap: document.getElementById("searchWrap"),
  statGames: document.getElementById("statGames"),
  statBuilds: document.getElementById("statBuilds"),
  statFiles: document.getElementById("statFiles"),
  catalog: document.getElementById("catalog"),
  catalogView: document.getElementById("catalogView"),
  gamePage: document.getElementById("gamePage"),
  gameContent: document.getElementById("gamePageContent"),
};

const state = {
  raw: null,
  games: [],
  query: "",
};

function normalizeText(v) {
  return String(v || "").trim();
}

function toArray(v) {
  return Array.isArray(v) ? v : [];
}

function stripUnsafeUrl(value) {
  const url = normalizeText(value);
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) return url;
  return url;
}

function normalizeFile(file, i) {
  if (!file || typeof file !== "object") return null;
  const label = normalizeText(file.label || `File ${i + 1}`);
  const url = stripUnsafeUrl(file.url);
  return url ? { label, url } : null;
}

function normalizeLink(link, i) {
  if (!link || typeof link !== "object") return null;
  const label = normalizeText(link.label || `Link ${i + 1}`);
  const url = stripUnsafeUrl(link.url);
  return url ? { label, url } : null;
}

function normalizeBuild(build, i) {
  if (!build || typeof build !== "object") return null;
  return {
    id: normalizeText(build.id || `build-${i + 1}`),
    name: normalizeText(build.name || build.label || `Build ${i + 1}`),
    version: normalizeText(build.version),
    released: normalizeText(build.released),
    platform: normalizeText(build.platform),
    distribution: normalizeText(build.distribution),
    notes: normalizeText(build.notes),
    category: normalizeText(build.category),
    files: toArray(build.files).map(normalizeFile).filter(Boolean),
    links: toArray(build.links).map(normalizeLink).filter(Boolean),
  };
}

function normalizeGame(game, i) {
  if (!game || typeof game !== "object") return null;
  return {
    id: normalizeText(game.id || `game-${i + 1}`),
    name: normalizeText(game.name || "Untitled Game"),
    franchise: normalizeText(game.franchise || "TrackMania"),
    years: normalizeText(game.years),
    image: normalizeText(game.image),
    description: normalizeText(game.description),
    platforms: toArray(game.platforms).map(normalizeText).filter(Boolean),
    builds: toArray(game.builds).map(normalizeBuild).filter(Boolean),
  };
}

function parseStartYear(years) {
  const match = (years || "").match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : 0;
}

function normalizeArchive(payload) {
  const games = toArray(payload?.games)
    .map(normalizeGame)
    .filter(Boolean);
  games.sort((a, b) => parseStartYear(b.years) - parseStartYear(a.years));
  return games;
}

function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function textIncludes(hay, needle) {
  if (!needle) return true;
  return hay.toLowerCase().includes(needle);
}

function buildSearchText(game, build) {
  return [
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
    build?.category,
    ...(build?.files || []).map((f) => `${f.label} ${f.url}`),
    ...(build?.links || []).map((l) => `${l.label} ${l.url}`),
  ]
    .filter(Boolean)
    .join(" ");
}

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === "className") node.className = value;
      else if (key === "textContent") node.textContent = value;
      else node.setAttribute(key, value);
    });
  }
  children.flat().forEach((child) => {
    if (child == null) return;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  });
  return node;
}

function renderStats() {
  elements.statGames.textContent = String(state.games.length);
  elements.statBuilds.textContent = String(
    state.games.reduce((sum, game) => sum + game.builds.length, 0)
  );
  elements.statFiles.textContent = String(
    state.games.reduce(
      (sum, game) => sum + game.builds.reduce((inner, build) => inner + build.files.length, 0),
      0
    )
  );
}

function renderBuildDate() {
  elements.buildDate.textContent = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function createBuildCard(build) {
  const card = el("div", { className: "build" });

  const head = el(
    "div",
    { className: "build-head" },
    el("strong", { textContent: build.name }),
    el("span", { className: "muted", textContent: formatDate(build.released) })
  );

  const metaParts = [];
  if (build.version) metaParts.push(`Version: ${build.version}`);
  if (build.platform) metaParts.push(`Platform: ${build.platform}`);
  if (build.distribution) metaParts.push(`Source: ${build.distribution}`);

  const links = el("div", { className: "links" });
  build.files.forEach((file, index) => {
    const link = el("a", {
      className: index === 0 ? "btn btn-primary" : "btn",
      href: file.url,
      rel: "noopener",
    });
    link.textContent = file.label || "Download";
    links.appendChild(link);
  });
  build.links.forEach((linkData) => {
    const link = el("a", {
      className: "btn",
      href: linkData.url,
      rel: "noopener",
      ...(linkData.url.startsWith("/") ? {} : { target: "_blank" }),
    });
    link.textContent = linkData.label || "Info";
    links.appendChild(link);
  });

  card.appendChild(head);
  if (metaParts.length) {
    card.appendChild(el("div", { className: "build-meta", textContent: metaParts.join(" | ") }));
  }
  if (build.notes) {
    card.appendChild(el("p", { className: "muted", textContent: build.notes }));
  }
  if (links.children.length) {
    card.appendChild(links);
  }
  return card;
}

function renderGamePage(game) {
  const content = elements.gameContent;
  content.innerHTML = "";

  const back = el("a", { className: "back-btn", href: "#" });
  back.innerHTML = "&larr; BACK TO VAULT";
  back.addEventListener("click", (event) => {
    event.preventDefault();
    location.hash = "";
  });
  content.appendChild(back);

  const coverWrap = el("div", { className: "gp-cover" });
  if (game.image) {
    const img = el("img", { src: game.image, alt: game.name, loading: "eager" });
    img.onerror = () => {
      img.style.display = "none";
    };
    coverWrap.appendChild(img);
  }
  const coverOverlay = el("div", { className: "gp-cover-overlay" });
  coverOverlay.appendChild(el("span", { className: "gp-franchise", textContent: game.franchise }));
  if (game.years) {
    coverOverlay.appendChild(el("span", { className: "gp-year", textContent: game.years }));
  }
  coverWrap.appendChild(coverOverlay);
  content.appendChild(coverWrap);

  const meta = el("div", { className: "gp-meta" });
  meta.appendChild(el("h2", { className: "gp-title", textContent: game.name }));

  const pills = el("div", { className: "gp-pills" });
  game.platforms.forEach((platform) => {
    pills.appendChild(el("span", { className: "pill", textContent: platform }));
  });
  const buildCount = game.builds.length;
  const fileCount = game.builds.reduce((sum, build) => sum + build.files.length, 0);
  pills.appendChild(
    el("span", {
      className: "pill-count",
      textContent: `${buildCount} build${buildCount !== 1 ? "s" : ""}`,
    })
  );
  if (fileCount > 0) {
    pills.appendChild(
      el("span", {
        className: "pill-count",
        textContent: `${fileCount} file${fileCount !== 1 ? "s" : ""}`,
      })
    );
  }
  meta.appendChild(pills);

  if (game.description) {
    meta.appendChild(el("p", { className: "gp-desc", textContent: game.description }));
  }
  content.appendChild(meta);

  const buildsSection = el("div", { className: "gp-builds" });
  buildsSection.appendChild(
    el("div", { className: "gp-builds-heading", textContent: "ARCHIVED BUILDS" })
  );

  if (game.builds.length === 0) {
    buildsSection.appendChild(
      el("div", {
        className: "empty-state",
        textContent: "No archived builds yet. Add entries to data/archive.json.",
      })
    );
  } else {
    const hasCategories = game.builds.some((build) => build.category);
    if (hasCategories) {
      const grouped = new Map();
      game.builds.forEach((build) => {
        const key = build.category || "General";
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(build);
      });
      grouped.forEach((builds, category) => {
        buildsSection.appendChild(
          el("div", { className: "build-category-head", textContent: category })
        );
        const grid = el("div", { className: "builds" });
        builds.forEach((build) => grid.appendChild(createBuildCard(build)));
        buildsSection.appendChild(grid);
      });
    } else {
      const grid = el("div", { className: "builds" });
      game.builds.forEach((build) => grid.appendChild(createBuildCard(build)));
      buildsSection.appendChild(grid);
    }
  }
  content.appendChild(buildsSection);
}

function createGameCard(game) {
  const card = el("a", {
    className: "game-card",
    href: `#${game.id}`,
    "data-game-id": game.id,
  });

  const cover = el("div", { className: "game-cover" });
  if (game.image) {
    const img = document.createElement("img");
    img.src = game.image;
    img.alt = game.name;
    img.loading = "lazy";
    img.onerror = () => {
      img.style.display = "none";
    };
    cover.appendChild(img);
  }
  cover.appendChild(el("span", { className: "cover-franchise", textContent: game.franchise }));
  if (game.years) {
    cover.appendChild(el("span", { className: "cover-year", textContent: game.years }));
  }
  card.appendChild(cover);

  const info = el("div", { className: "game-info" });
  info.appendChild(el("span", { className: "game-name", textContent: game.name }));

  const pills = el("div", { className: "game-pills" });
  game.platforms
    .slice(0, 3)
    .forEach((platform) => pills.appendChild(el("span", { className: "pill", textContent: platform })));
  if (game.platforms.length > 3) {
    pills.appendChild(
      el("span", { className: "pill", textContent: `+${game.platforms.length - 3}` })
    );
  }

  const buildCount = game.builds.length;
  const fileCount = game.builds.reduce((sum, build) => sum + build.files.length, 0);
  pills.appendChild(
    el("span", {
      className: "pill-count",
      textContent: `${buildCount} build${buildCount !== 1 ? "s" : ""}`,
    })
  );
  if (fileCount > 0) {
    pills.appendChild(
      el("span", {
        className: "pill-count",
        textContent: `${fileCount} file${fileCount !== 1 ? "s" : ""}`,
      })
    );
  }

  info.appendChild(pills);
  card.appendChild(info);
  return card;
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

  const franchiseKeys = Array.from(byFranchise.keys()).sort((a, b) => {
    const aYear = parseStartYear(byFranchise.get(a)[0]?.years || "0");
    const bYear = parseStartYear(byFranchise.get(b)[0]?.years || "0");
    return bYear - aYear;
  });

  let totalVisible = 0;

  franchiseKeys.forEach((franchise) => {
    const games = byFranchise.get(franchise) || [];
    const section = el("section", { className: "group" });

    const head = el(
      "div",
      { className: "group-head" },
      el("h3", { textContent: franchise }),
      el("span", {
        className: "count",
        textContent: `${games.length} game${games.length === 1 ? "" : "s"}`,
      })
    );
    section.appendChild(head);

    const grid = el("div", { className: "games-grid" });
    let groupVisible = false;

    games.forEach((game) => {
      const matches =
        !query ||
        textIncludes(buildSearchText(game, null), query) ||
        game.builds.some((build) => textIncludes(buildSearchText(game, build), query));
      if (!matches) return;
      groupVisible = true;
      totalVisible += 1;
      grid.appendChild(createGameCard(game));
    });

    if (groupVisible) {
      section.appendChild(grid);
      elements.catalog.appendChild(section);
    }
  });

  if (totalVisible === 0) {
    elements.catalog.appendChild(
      el("div", { className: "empty-state", textContent: "No games match your search." })
    );
  }
}

function showCatalog() {
  elements.catalogView.hidden = false;
  elements.gamePage.hidden = true;
  elements.searchWrap.hidden = false;
  document.title = "xjk / archive hub";
  renderCatalog();
  window.scrollTo(0, 0);
}

function showGame(game) {
  elements.catalogView.hidden = true;
  elements.gamePage.hidden = false;
  elements.searchWrap.hidden = true;
  document.title = `xjk / ${game.name}`;
  renderGamePage(game);
  window.scrollTo(0, 0);
}

function handleRoute() {
  const hash = location.hash.replace(/^#/, "").trim();
  if (hash && state.games.length > 0) {
    const game = state.games.find((entry) => entry.id === hash);
    if (game) {
      showGame(game);
      return;
    }
  }
  showCatalog();
}

async function loadArchive() {
  const response = await fetch("data/archive.json", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function defaultArchive() {
  return {
    games: [
      {
        id: "tm-original",
        franchise: "TrackMania",
        name: "TrackMania",
        years: "2003",
        image: "img/tm-original.svg",
        platforms: ["Windows"],
        description: "Original TrackMania release.",
        builds: [],
      },
      {
        id: "tm-2020",
        franchise: "TrackMania",
        name: "Trackmania (2020)",
        years: "2020-",
        image: "img/tm-2020.svg",
        platforms: ["Windows"],
        description: "Current Trackmania release.",
        builds: [],
      },
    ],
  };
}

async function boot() {
  renderBuildDate();
  elements.catalog.innerHTML = '<div class="empty-state">Loading archive...</div>';

  try {
    state.raw = await loadArchive();
  } catch (err) {
    console.warn("Failed to load data/archive.json, using fallback:", err);
    state.raw = defaultArchive();
  }

  state.games = normalizeArchive(state.raw);
  renderStats();
  handleRoute();

  window.addEventListener("hashchange", handleRoute);
  elements.search.addEventListener("input", () => {
    state.query = elements.search.value;
    if (!elements.catalogView.hidden) renderCatalog();
  });
}

boot();
