import "/shared/xjk-core/safe-html.js?v=2";
import { safeNavigationHref } from "/shared/xjk-core/dom-utils.js";

const state = {
  plugins: [],
  query: "",
  profileUrl: "",
  cached: false,
  stale: false,
  failed: false,
};

const elements = {
  search: document.getElementById("pluginSearch"),
  statTotal: document.getElementById("statTotal"),
  sourceState: document.getElementById("sourceState"),
  profileLink: document.getElementById("profileLink"),
  footProfileLink: document.getElementById("footProfileLink"),
  toolGrid: document.getElementById("toolGrid"),
};

const PLUGIN_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4.5V6a1.6 1.6 0 0 0 3.2 0V4.5a1.5 1.5 0 0 1 1.5-1.5h1.8a1.5 1.5 0 0 1 1.5 1.5V7h2.5a1.5 1.5 0 0 1 1.5 1.5v1.8a1.5 1.5 0 0 1-1.5 1.5H19a1.6 1.6 0 0 0 0 3.2h1.5a1.5 1.5 0 0 1 1.5 1.5v1.8a1.5 1.5 0 0 1-1.5 1.5H17v-2.3a1.6 1.6 0 0 0-3.2 0V21H7.5A1.5 1.5 0 0 1 6 19.5V17H4.5A1.5 1.5 0 0 1 3 15.5v-1.8a1.5 1.5 0 0 1 1.5-1.5H6a1.6 1.6 0 0 0 0-3.2H4.5A1.5 1.5 0 0 1 3 7.5V5.7A1.5 1.5 0 0 1 4.5 4.2H9z"/></svg>';

function safePluginUrl(value) {
  return safeNavigationHref(value, {
    base: window.location.href,
  });
}

function normalizePlugin(plugin, index) {
  if (!plugin || typeof plugin !== "object") return null;
  const statusRaw = String(plugin.status || "live").toLowerCase();
  const tagsRaw = Array.isArray(plugin.tags) ? plugin.tags : [];
  return {
    id: String(plugin.id || `plugin-${index + 1}`),
    name: String(plugin.name || "Untitled Plugin"),
    description: String(plugin.description || "No description provided."),
    category: String(plugin.category || "Plugin"),
    status: statusRaw === "live" ? "live" : "soon",
    target: String(plugin.target || "Trackmania + Openplanet"),
    install: String(plugin.install || "Openplanet plugin manager"),
    link: safePluginUrl(plugin.link),
    image: safePluginUrl(plugin.image),
    tags: tagsRaw.map((tag) => String(tag)).filter(Boolean),
  };
}

function normalizePluginsList(rawPlugins) {
  if (!Array.isArray(rawPlugins)) return [];
  return rawPlugins.map((plugin, index) => normalizePlugin(plugin, index)).filter(Boolean);
}

function pluginSearchText(plugin) {
  return [plugin.name, plugin.description, plugin.category, plugin.target, ...plugin.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function profileHandle(url) {
  const raw = String(url || "").replace(/\/+$/, "");
  if (!raw) return "";
  const segment = raw.split("/").pop() || "";
  return segment.trim();
}

function renderInfo() {
  if (elements.statTotal) elements.statTotal.textContent = String(state.plugins.length);

  if (elements.sourceState) {
    const badge = elements.sourceState.querySelector(".plg-op-badge");
    let label = "Live from Openplanet";
    if (state.failed) label = "Openplanet unavailable";
    else if (state.stale) label = "Cached (Openplanet offline)";
    else if (state.cached) label = "Live from Openplanet (cached)";
    elements.sourceState.replaceChildren();
    if (badge) elements.sourceState.append(badge);
    elements.sourceState.append(document.createTextNode(` ${label}`));
    elements.sourceState.classList.toggle("is-stale", state.stale || state.failed);
  }

  const handle = profileHandle(state.profileUrl);
  [elements.profileLink].forEach((node) => {
    if (!node) return;
    node.textContent = handle || "openplanet";
    if (state.profileUrl) node.href = state.profileUrl;
    else node.removeAttribute("href");
  });
  if (elements.footProfileLink && state.profileUrl) {
    elements.footProfileLink.href = state.profileUrl;
  } else {
    elements.footProfileLink?.removeAttribute("href");
  }
}

function setMediaPlaceholder(media) {
  media.classList.add("is-empty");
  globalThis.XjkSafeHtml.set(media, `<span class="plugin-media-glyph" aria-hidden="true">${PLUGIN_ICON}</span>`);
}

function createCard(plugin) {
  const card = document.createElement("article");
  card.className = "plugin-card";

  const live = plugin.status === "live" && plugin.link;

  const media = document.createElement(live ? "a" : "div");
  media.className = "plugin-media";
  if (live) {
    media.href = plugin.link;
    media.rel = "noopener";
    media.setAttribute("aria-label", `Open ${plugin.name} in Openplanet`);
  }
  if (plugin.image) {
    const img = document.createElement("img");
    img.src = plugin.image;
    img.alt = `${plugin.name} preview`;
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.remove();
      setMediaPlaceholder(media);
    });
    media.append(img);
  } else {
    setMediaPlaceholder(media);
  }
  card.append(media);

  const body = document.createElement("div");
  body.className = "plugin-body";

  const title = document.createElement("h3");
  title.className = "plugin-name";
  if (live) {
    const link = document.createElement("a");
    link.className = "plugin-name-link";
    link.href = plugin.link;
    link.rel = "noopener";
    link.textContent = plugin.name;
    title.append(link);
  } else {
    title.textContent = plugin.name;
  }
  body.append(title);

  const desc = document.createElement("p");
  desc.className = "plugin-desc";
  desc.textContent = plugin.description;
  body.append(desc);

  const foot = document.createElement("div");
  foot.className = "plugin-foot";

  const info = document.createElement("div");
  info.className = "plugin-foot-info";
  const dot = document.createElement("span");
  dot.className = `plugin-dot ${plugin.status === "live" ? "is-live" : "is-soon"}`;
  const target = document.createElement("span");
  target.className = "plugin-target";
  target.textContent = plugin.target;
  info.append(dot, target);
  foot.append(info);

  if (live) {
    const open = document.createElement("a");
    open.className = "plugin-open";
    open.href = plugin.link;
    open.rel = "noopener";
    open.textContent = "Open in Openplanet";
    foot.append(open);
  } else {
    const open = document.createElement("span");
    open.className = "plugin-open is-disabled";
    open.textContent = "Coming soon";
    foot.append(open);
  }

  body.append(foot);
  card.append(body);
  return card;
}

function renderCards() {
  elements.toolGrid.replaceChildren();

  if (state.failed && !state.plugins.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Could not reach the Openplanet profile right now. Try again in a few moments.";
    elements.toolGrid.appendChild(empty);
    return;
  }

  if (!state.plugins.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No plugins loaded right now.";
    elements.toolGrid.appendChild(empty);
    return;
  }

  const query = state.query.trim().toLowerCase();
  const visible = state.plugins.filter((plugin) => !query || pluginSearchText(plugin).includes(query));

  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No plugins match your search.";
    elements.toolGrid.appendChild(empty);
    return;
  }

  visible.forEach((plugin) => elements.toolGrid.appendChild(createCard(plugin)));
}

async function loadPlugins() {
  const response = await fetch(new URL("./api/plugins", window.location.href), {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    if (payload?.profile) state.profileUrl = safePluginUrl(payload.profile);
    throw new Error(`API returned HTTP ${response.status}`);
  }

  const normalized = normalizePluginsList(payload.plugins);
  if (!normalized.length) throw new Error("API returned no plugins.");

  state.plugins = normalized;
  state.profileUrl = safePluginUrl(payload.profile);
  state.cached = Boolean(payload.cached);
  state.stale = Boolean(payload.stale);
  state.failed = false;
}

function bindSearch() {
  elements.search?.addEventListener("input", () => {
    state.query = elements.search.value;
    renderCards();
  });

  window.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
    if (event.key === "/" && !isTyping && elements.search) {
      event.preventDefault();
      elements.search.focus();
    }
    if (event.key === "Escape" && document.activeElement === elements.search) {
      elements.search.value = "";
      state.query = "";
      renderCards();
      elements.search.blur();
    }
  });
}

async function boot() {
  bindSearch();
  globalThis.XjkSafeHtml.set(elements.toolGrid, '<div class="empty-state">Loading plugins...</div>');

  try {
    await loadPlugins();
  } catch (err) {
    console.warn("Failed to load plugin catalog:", err);
    state.plugins = [];
    state.failed = true;
  }

  renderInfo();
  renderCards();
}

boot();
