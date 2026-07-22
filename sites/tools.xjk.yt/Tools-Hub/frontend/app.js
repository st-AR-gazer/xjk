const state = {
  tools: [],
};

const elements = {
  toolGrid: document.getElementById("toolGrid"),
};

function safeToolHref(value) {
  try {
    const url = new URL(String(value || ""), window.location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function renderGridMessage(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  elements.toolGrid.replaceChildren(empty);
}

function normalizeTool(tool, index) {
  if (!tool || typeof tool !== "object") return null;

  const statusRaw = String(tool.status || "live").toLowerCase();
  const toneRaw = String(tool.tone || "cool").toLowerCase();

  return {
    id: String(tool.id || `tool-${index + 1}`),
    name: String(tool.name || "Untitled Tool"),
    description: String(tool.description || "No description provided."),
    category: String(tool.category || "General"),
    status: statusRaw === "live" ? "live" : "soon",
    input: String(tool.input || "N/A"),
    output: String(tool.output || "N/A"),
    link: safeToolHref(tool.link),
    tone: toneRaw === "warm" ? "warm" : "cool",
  };
}

function normalizeToolsList(rawTools) {
  if (!Array.isArray(rawTools)) return [];
  return rawTools.map((tool, index) => normalizeTool(tool, index)).filter(Boolean);
}

function applyPalette(card, tool) {
  const palette = window.ToolTheme.getToolPalette(tool);
  card.style.setProperty("--tool-accent-a", palette.accentA);
  card.style.setProperty("--tool-accent-b", palette.accentB);
  card.style.setProperty("--tool-btn-a", palette.buttonA);
  card.style.setProperty("--tool-btn-b", palette.buttonB);
  card.style.setProperty("--tool-btn-c", palette.buttonC);
  card.style.setProperty("--tool-btn-border", palette.buttonBorder);
  card.style.setProperty("--tool-btn-shadow", palette.buttonShadow);
  card.style.setProperty("--tool-card-border-hover", palette.cardBorderHover);
  card.style.setProperty("--tool-title-hover", palette.titleHover);
  card.style.setProperty("--tool-square-a", palette.squareA || palette.accentA);
  card.style.setProperty("--tool-square-b", palette.squareB || palette.accentB);
}

function createCard(tool) {
  const live = tool.status === "live" && tool.link;
  const card = document.createElement(live ? "a" : "article");
  card.className = `tool-card${live ? " is-clickable" : ""}`;
  if (live) {
    card.href = tool.link;
    card.setAttribute("aria-label", `Open ${tool.name}`);
  }
  applyPalette(card, tool);

  const cat = document.createElement("p");
  cat.className = "tool-cat";
  cat.textContent = tool.category || "General";
  card.appendChild(cat);

  const title = document.createElement("h3");
  title.className = "tool-title";
  title.textContent = tool.name;

  const desc = document.createElement("p");
  desc.className = "tool-desc";
  desc.textContent = tool.description;

  const io = document.createElement("p");
  io.className = "tool-io";
  io.textContent = `${tool.input} -> ${tool.output}`;

  const foot = document.createElement("div");
  foot.className = "tool-foot";

  const status = document.createElement("span");
  status.className = `tool-status ${tool.status === "live" ? "is-live" : "is-soon"}`;
  status.textContent = tool.status === "live" ? "Online" : "Soon";

  foot.appendChild(status);

  if (live) {
    const openCue = document.createElement("span");
    openCue.className = "tool-open";
    openCue.textContent = "Open";
    foot.appendChild(openCue);
  } else {
    const openNote = document.createElement("span");
    openNote.className = "tool-open is-disabled";
    openNote.textContent = "Coming soon";
    foot.appendChild(openNote);
  }

  card.append(title, desc, io, foot);
  return card;
}

function renderCards() {
  elements.toolGrid.replaceChildren();

  if (!state.tools.length) {
    renderGridMessage("No tools available.");
    return;
  }

  const grid = document.createElement("div");
  grid.className = "tools-grid";
  state.tools.forEach((tool) => grid.appendChild(createCard(tool)));
  elements.toolGrid.appendChild(grid);
}

async function loadTools() {
  const response = await fetch(new URL("./api/tools", window.location.href), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`API returned HTTP ${response.status}`);

  const payload = await response.json();
  const normalized = normalizeToolsList(payload?.tools);
  if (!normalized.length) throw new Error("API returned no tools.");
  state.tools = normalized;
}

async function boot() {
  renderGridMessage("Loading tools...");
  try {
    await loadTools();
    renderCards();
  } catch (error) {
    console.error("Tool catalog could not load:", error);
    renderGridMessage("The tool catalog is temporarily unavailable.");
  }
}

boot();
