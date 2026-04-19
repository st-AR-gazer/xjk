const fallbackTools = [
  {
    id: "map-cleaner",
    name: "Strip Race Validation Ghost",
    description:
      "Upload a map, strip the validation replay, and optionally export cleaned map and extracted ghost files.",
    category: "Validation",
    status: "live",
    input: ".Map.Gbx",
    output: "Map / Ghost / Zip",
    link: "Strip-RaceValidationGhost/",
    tone: "cool",
  },
  {
    id: "ghost-embedder",
    name: "Embed Race Validation Ghost",
    description:
      "Upload a map and a ghost/replay source, pick replay ghost index if needed, then download embedded map output.",
    category: "Validation",
    status: "live",
    input: ".Map.Gbx + .Ghost/.Replay.Gbx",
    output: "Embedded .Map.Gbx",
    link: "Embed-RaceValidationGhost/",
    tone: "warm",
  },
  {
    id: "embedded-checker",
    name: "Embedded Blocks And Items Checker",
    description: "Check map embedding consistency and inspect missing expected/custom embedded models.",
    category: "Inspection",
    status: "live",
    input: ".Map.Gbx",
    output: "JSON report",
    link: "Embedded-Blocks-And-Items-Checker/",
    tone: "cool",
  },
  {
    id: "replay-data-extractor",
    name: "Extract Replay Data",
    description: "Extract structured replay JSON using default projection or a custom request selection.",
    category: "Replay",
    status: "live",
    input: ".Replay.Gbx",
    output: "JSON data",
    link: "Extract-Replay-Data/",
    tone: "cool",
  },
  {
    id: "medal-time-modifier",
    name: "GBX Medal Time Modifier",
    description: "Set AT/Gold/Silver/Bronze medal values for a map and download the modified map file.",
    category: "Map Editing",
    status: "live",
    input: ".Map.Gbx + medal values",
    output: "Modified .Map.Gbx",
    link: "Gbx-Medal-Time-Modifier/",
    tone: "warm",
  },
  {
    id: "map-validation-checker",
    name: "Map Validation Checker",
    description: "Inspect map validation status with optional replay evidence and manual override support.",
    category: "Validation",
    status: "live",
    input: ".Map.Gbx (+ optional replay/manual)",
    output: "JSON verdict",
    link: "Map-Validation-Checker/",
    tone: "cool",
  },
  {
    id: "underwater-converter",
    name: "Underwater Map Converter",
    description:
      "Convert any Trackmania 2020 map into an underwater variant with automatic environment detection and water carrier placement.",
    category: "Map Conversion",
    status: "live",
    input: ".Map.Gbx",
    output: "Underwater .Map.Gbx / Zip",
    link: "Underwater-Map-Converter/",
    tone: "cool",
  },
  {
    id: "colorizer",
    name: "TM Gradient Color Formatter",
    description: "Format Trackmania text with per-letter gradient color codes (supports custom palettes & presets).",
    category: "Text",
    status: "live",
    input: "Text + 2-7 colors",
    output: "Formatted gradient string",
    link: "Colorizer/",
    tone: "warm",
  },
  {
    id: "clip-to-ghost",
    name: "Clip To Ghost",
    description: "Export GPS clip RecordData blocks from Trackmania maps into standalone ghost files with optional manifest output.",
    category: "Ghost Export",
    status: "live",
    input: ".Map.Gbx",
    output: ".Ghost.Gbx + manifest",
    link: "Clip-To-Ghost/",
    tone: "cool",
  },
];

const TOOL_DOCS = {
  "map-cleaner": {
    overviewHtml: `
      <p>Hosted wrapper around <code>stripValidationReplay.exe</code> for removing the validation replay from a Trackmania map and returning selected artifacts.</p>
      <ul class="docs-list">
        <li>Uploads one <code>.Map.Gbx</code> file per request.</li>
        <li>Can return the cleaned map, extracted validation ghost, and replay output when the underlying tool can produce it.</li>
        <li>Returns either JSON, a single file stream, or a zip archive depending on the requested outputs.</li>
      </ul>
    `,
    apiHtml: `
      <p class="docs-kicker">Hosted base path: <code>/Strip-RaceValidationGhost</code></p>
      <div class="docs-endpoint">
        <h4><code>GET /health</code></h4>
        <p>Returns <code>text/plain</code> with <code>ok</code>.</p>
      </div>
      <div class="docs-endpoint">
        <h4><code>POST /api/strip</code></h4>
        <p>Submit a <code>multipart/form-data</code> request.</p>
        <ul class="docs-list">
          <li><code>map</code>: required file field containing <code>.Map.Gbx</code>.</li>
          <li><code>returnMap</code>: optional boolean.</li>
          <li><code>returnGhost</code>: optional boolean.</li>
          <li><code>returnReplay</code>: optional boolean.</li>
        </ul>
        <p>Response is <code>application/octet-stream</code> for one artifact, <code>application/zip</code> for multiple artifacts, or JSON if no return file was requested.</p>
        <pre class="docs-code"><code>curl -X POST "https://tools.xjk.yt/Strip-RaceValidationGhost/api/strip" ^
  -F "map=@example.Map.Gbx" ^
  -F "returnMap=true" ^
  -F "returnGhost=true" --output stripped.zip</code></pre>
      </div>
    `,
  },
  "ghost-embedder": {
    overviewHtml: `
      <p>Embeds a validation ghost into a target map using either a direct <code>.Ghost.Gbx</code> file or a replay file with a selectable ghost index.</p>
      <ul class="docs-list">
        <li>Replay inspection is exposed separately so callers can pick the correct ghost before embedding.</li>
        <li>The embed endpoint streams the resulting map directly back to the client.</li>
      </ul>
    `,
    apiHtml: `
      <p class="docs-kicker">Hosted base path: <code>/Embed-RaceValidationGhost</code></p>
      <div class="docs-endpoint">
        <h4><code>GET /health</code></h4>
        <p>Returns <code>text/plain</code> with <code>ok</code>.</p>
      </div>
      <div class="docs-endpoint">
        <h4><code>POST /api/inspect-replay</code></h4>
        <ul class="docs-list">
          <li><code>replay</code>: required <code>.Replay.Gbx</code> file.</li>
        </ul>
        <p>Returns JSON containing normalized replay and ghost metadata plus <code>selectedGhostIndex</code>.</p>
      </div>
      <div class="docs-endpoint">
        <h4><code>POST /api/embed</code></h4>
        <ul class="docs-list">
          <li><code>map</code>: required <code>.Map.Gbx</code> file.</li>
          <li><code>source</code>: required <code>.Ghost.Gbx</code> or <code>.Replay.Gbx</code>.</li>
          <li><code>sourceKind</code>: optional <code>ghost</code> or <code>replay</code>.</li>
          <li><code>ghostIndex</code>: optional non-negative integer, used when source is a replay.</li>
        </ul>
        <p>Returns the embedded map as <code>application/octet-stream</code>.</p>
        <pre class="docs-code"><code>curl -X POST "https://tools.xjk.yt/Embed-RaceValidationGhost/api/embed" ^
  -F "map=@target.Map.Gbx" ^
  -F "source=@run.Replay.Gbx" ^
  -F "sourceKind=replay" ^
  -F "ghostIndex=0" --output embedded.Map.Gbx</code></pre>
      </div>
    `,
  },
  "embedded-checker": {
    overviewHtml: `
      <p>Checks embedded blocks and items in a Trackmania map and emits a structured JSON report that can be consumed in automation.</p>
      <ul class="docs-list">
        <li>Supports optional manual override JSON.</li>
        <li>Can tune matching and report verbosity through form fields.</li>
      </ul>
    `,
    apiHtml: `
      <p class="docs-kicker">Hosted base path: <code>/Embedded-Blocks-And-Items-Checker</code></p>
      <div class="docs-endpoint">
        <h4><code>GET /health</code></h4>
        <p>Returns <code>text/plain</code> with <code>ok</code>.</p>
      </div>
      <div class="docs-endpoint">
        <h4><code>POST /api/check</code></h4>
        <p>Submit <code>multipart/form-data</code> with:</p>
        <ul class="docs-list">
          <li><code>map</code>: required <code>.Map.Gbx</code> file.</li>
          <li><code>manualOverrides</code>: optional JSON file.</li>
          <li><code>pretty</code>, <code>caseSensitive</code>, <code>includeExpectedList</code>, <code>includeMapName</code>, <code>relaxedStemMatch</code>, <code>dumpZip</code>: optional booleans.</li>
        </ul>
        <p>Returns JSON with <code>ok</code>, <code>toolExitCode</code>, <code>report</code>, and optional <code>stderr</code>.</p>
        <pre class="docs-code"><code>curl -X POST "https://tools.xjk.yt/Embedded-Blocks-And-Items-Checker/api/check" ^
  -F "map=@example.Map.Gbx" ^
  -F "caseSensitive=false" ^
  -F "includeExpectedList=true"</code></pre>
      </div>
    `,
  },
  "replay-data-extractor": {
    overviewHtml: `
      <p>Wraps <code>ReplayDataExtractor.exe</code> and exposes structured replay extraction over HTTP.</p>
      <ul class="docs-list">
        <li>Uses a default selection schema if no custom request is provided.</li>
        <li>Accepts either inline request JSON text or an uploaded JSON request file.</li>
      </ul>
    `,
    apiHtml: `
      <p class="docs-kicker">Hosted base path: <code>/Extract-Replay-Data</code></p>
      <div class="docs-endpoint">
        <h4><code>GET /health</code></h4>
        <p>Returns <code>text/plain</code> with <code>ok</code>.</p>
      </div>
      <div class="docs-endpoint">
        <h4><code>POST /api/extract</code></h4>
        <ul class="docs-list">
          <li><code>replay</code>: required <code>.Replay.Gbx</code> file.</li>
          <li><code>requestFile</code>: optional JSON file containing selection config.</li>
          <li><code>requestJsonText</code>: optional inline JSON string.</li>
          <li><code>includeNulls</code>, <code>prettyPrint</code>: optional booleans.</li>
          <li><code>maxDepth</code>, <code>maxCollectionItems</code>: optional integers.</li>
        </ul>
        <p>Returns JSON with <code>ok</code>, <code>toolExitCode</code>, <code>result</code>, and optional <code>stderr</code>.</p>
        <pre class="docs-code"><code>curl -X POST "https://tools.xjk.yt/Extract-Replay-Data/api/extract" ^
  -F "replay=@run.Replay.Gbx" ^
  -F "prettyPrint=true" ^
  -F "maxDepth=20"</code></pre>
      </div>
    `,
  },
  "medal-time-modifier": {
    overviewHtml: `
      <p>Updates Trackmania medal times on a map and streams the modified map file back to the caller.</p>
      <ul class="docs-list">
        <li><code>AT</code> must be a number or <code>_</code>.</li>
        <li><code>Gold</code>, <code>Silver</code>, and <code>Bronze</code> accept a number, <code>_</code>, or <code>auto</code>.</li>
      </ul>
    `,
    apiHtml: `
      <p class="docs-kicker">Hosted base path: <code>/Gbx-Medal-Time-Modifier</code></p>
      <div class="docs-endpoint">
        <h4><code>GET /health</code></h4>
        <p>Returns <code>text/plain</code> with <code>ok</code>.</p>
      </div>
      <div class="docs-endpoint">
        <h4><code>POST /api/modify</code></h4>
        <ul class="docs-list">
          <li><code>map</code>: required <code>.Map.Gbx</code> file.</li>
          <li><code>at</code>: required number or <code>_</code>.</li>
          <li><code>gold</code>, <code>silver</code>, <code>bronze</code>: required number, <code>_</code>, or <code>auto</code>.</li>
        </ul>
        <p>Returns the modified map as <code>application/octet-stream</code>.</p>
        <pre class="docs-code"><code>curl -X POST "https://tools.xjk.yt/Gbx-Medal-Time-Modifier/api/modify" ^
  -F "map=@example.Map.Gbx" ^
  -F "at=45000" ^
  -F "gold=auto" ^
  -F "silver=52000" ^
  -F "bronze=60000" --output medals.Map.Gbx</code></pre>
      </div>
    `,
  },
  "map-validation-checker": {
    overviewHtml: `
      <p>Runs validation checks over a Trackmania map and returns a structured verdict payload suitable for dashboards and automation.</p>
      <ul class="docs-list">
        <li>Optional replay and manual override files can influence the result.</li>
        <li>Supports GPS-related flags and output-depth controls.</li>
      </ul>
    `,
    apiHtml: `
      <p class="docs-kicker">Hosted base path: <code>/Map-Validation-Checker</code></p>
      <div class="docs-endpoint">
        <h4><code>GET /health</code></h4>
        <p>Returns <code>text/plain</code> with <code>ok</code>.</p>
      </div>
      <div class="docs-endpoint">
        <h4><code>POST /api/check</code></h4>
        <ul class="docs-list">
          <li><code>map</code>: required <code>.Map.Gbx</code> file.</li>
          <li><code>replay</code>: optional <code>.Replay.Gbx</code> file.</li>
          <li><code>manual</code>: optional JSON file.</li>
          <li><code>strictGps</code>, <code>noGps</code>, <code>includePath</code>, <code>dataDump</code>, <code>pretty</code>: optional booleans.</li>
          <li><code>gpsThresholdMs</code>, <code>maxDepth</code>: optional integers.</li>
        </ul>
        <p>Returns JSON with <code>ok</code>, <code>toolExitCode</code>, <code>result</code>, and optional <code>stderr</code>.</p>
        <pre class="docs-code"><code>curl -X POST "https://tools.xjk.yt/Map-Validation-Checker/api/check" ^
  -F "map=@example.Map.Gbx" ^
  -F "strictGps=true" ^
  -F "gpsThresholdMs=50"</code></pre>
      </div>
    `,
  },
  "underwater-converter": {
    overviewHtml: `
      <p>Converts Trackmania 2020 maps into underwater variants with both single-file and async batch workflows.</p>
      <ul class="docs-list">
        <li>Single conversions can return one map or a zip depending on the selected variant.</li>
        <li>Batch conversion creates an async job with a status endpoint and final zip download.</li>
      </ul>
    `,
    apiHtml: `
      <p class="docs-kicker">Hosted base path: <code>/Underwater-Map-Converter</code></p>
      <div class="docs-endpoint">
        <h4><code>GET /health</code></h4>
        <p>Returns <code>text/plain</code> with <code>ok</code>.</p>
      </div>
      <div class="docs-endpoint">
        <h4><code>POST /api/convert</code></h4>
        <ul class="docs-list">
          <li><code>map</code>: required <code>.Map.Gbx</code> file.</li>
          <li><code>variant</code>: <code>normal</code>, <code>meshless</code>, or <code>both</code>.</li>
          <li><code>coverage</code>: <code>one-layer</code> or <code>full-stack</code>.</li>
          <li><code>suffix</code>: optional output suffix.</li>
        </ul>
        <p>Returns a map stream or zip archive directly.</p>
      </div>
      <div class="docs-endpoint">
        <h4><code>POST /api/convert-batch</code></h4>
        <ul class="docs-list">
          <li><code>maps</code>: repeated file field for multiple map uploads.</li>
          <li>Accepts the same <code>variant</code>, <code>coverage</code>, and <code>suffix</code> fields as single convert.</li>
        </ul>
        <p>Returns <code>202</code> JSON with <code>jobId</code>, <code>statusUrl</code>, and <code>downloadUrl</code>.</p>
      </div>
      <div class="docs-endpoint">
        <h4><code>GET /api/batch/:id/status</code></h4>
        <p>Returns live job JSON, including per-file state and aggregate counts.</p>
      </div>
      <div class="docs-endpoint">
        <h4><code>GET /api/batch/:id/download</code></h4>
        <p>Returns the final zip when the job state is <code>done</code>; otherwise responds with JSON conflict/error details.</p>
        <pre class="docs-code"><code>curl -X POST "https://tools.xjk.yt/Underwater-Map-Converter/api/convert-batch" ^
  -F "maps=@one.Map.Gbx" ^
  -F "maps=@two.Map.Gbx" ^
  -F "variant=meshless" ^
  -F "coverage=full-stack"</code></pre>
      </div>
    `,
  },
  colorizer: {
    overviewHtml: `
      <p>Browser-only formatter for Trackmania color codes with gradients, presets, and custom formatting controls.</p>
      <ul class="docs-list">
        <li>No file upload or server-side processing is involved.</li>
        <li>Best for interactive usage inside the hosted webpage.</li>
      </ul>
    `,
    apiHtml: `
      <p class="docs-kicker">No hosted HTTP API</p>
      <div class="docs-endpoint">
        <h4><code>Browser-only tool</code></h4>
        <p>This tool currently runs entirely in the client. There are no public <code>/api/*</code> endpoints to call programmatically.</p>
        <p>If you need automation, the current option is to reuse or port the frontend color interpolation logic from the page implementation.</p>
      </div>
    `,
  },
  "clip-to-ghost": {
    overviewHtml: `
      <p>Hosted wrapper for exporting GPS clip <code>RecordData</code> blocks from Trackmania maps into standalone <code>.Ghost.Gbx</code> files.</p>
      <ul class="docs-list">
        <li>Can scan a map first to list every exportable clip / track / block candidate.</li>
        <li>Supports shipped, custom, and experimental blank template modes.</li>
        <li>Exports either a single ghost or a zip containing ghosts plus a manifest.</li>
      </ul>
    `,
    apiHtml: `
      <p class="docs-kicker">Hosted base path: <code>/Clip-To-Ghost</code></p>
      <div class="docs-endpoint">
        <h4><code>GET /health</code></h4>
        <p>Returns <code>text/plain</code> with <code>ok</code>.</p>
      </div>
      <div class="docs-endpoint">
        <h4><code>POST /api/inspect</code></h4>
        <ul class="docs-list">
          <li><code>map</code>: required <code>.Map.Gbx</code> file.</li>
          <li><code>clipIndex</code>, <code>trackIndex</code>, <code>blockIndex</code>: optional non-negative integer filters.</li>
        </ul>
        <p>Returns manifest-style JSON describing discovered GPS clip candidates.</p>
      </div>
      <div class="docs-endpoint">
        <h4><code>POST /api/export</code></h4>
        <ul class="docs-list">
          <li><code>map</code>: required <code>.Map.Gbx</code> file.</li>
          <li><code>templateMode</code>: <code>shipped</code>, <code>custom</code>, or <code>blank</code>.</li>
          <li><code>templateGhost</code>: required file when using <code>templateMode=custom</code>.</li>
          <li><code>includeManifest</code>: optional boolean.</li>
          <li><code>clipIndex</code>, <code>trackIndex</code>, <code>blockIndex</code>: optional non-negative integer filters.</li>
        </ul>
        <p>Returns a single <code>.Ghost.Gbx</code> when one export is produced without manifest output; otherwise returns a zip archive.</p>
        <pre class="docs-code"><code>curl -X POST "https://tools.xjk.yt/Clip-To-Ghost/api/inspect" ^
  -F "map=@example.Map.Gbx"

curl -X POST "https://tools.xjk.yt/Clip-To-Ghost/api/export" ^
  -F "map=@example.Map.Gbx" ^
  -F "clipIndex=0" ^
  -F "trackIndex=0" ^
  -F "blockIndex=1" ^
  -F "templateMode=shipped" ^
  -F "includeManifest=true" --output clip-to-ghost.zip</code></pre>
      </div>
    `,
  },
};

const state = {
  tools: [],
};

const elements = {
  buildDate: document.getElementById("buildDate"),
  statTotal: document.getElementById("statTotal"),
  statLive: document.getElementById("statLive"),
  statSoon: document.getElementById("statSoon"),
  toolSquares: document.getElementById("toolSquares"),
  toolGrid: document.getElementById("toolGrid"),
};

let docsModal = null;
let docsShell = null;
let docsTitle = null;
let docsStatus = null;
let docsTabButtons = [];
let docsPanels = new Map();

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
    link: typeof tool.link === "string" ? tool.link : "",
    tone: toneRaw === "warm" ? "warm" : "cool",
  };
}

function normalizeToolsList(rawTools) {
  if (!Array.isArray(rawTools)) return [];
  return rawTools.map((tool, index) => normalizeTool(tool, index)).filter(Boolean);
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusPillClass(status) {
  return status === "live" ? "pill pill-live" : "pill pill-soon";
}

function renderStats() {
  const liveCount = state.tools.filter((tool) => tool.status === "live").length;
  const soonCount = state.tools.filter((tool) => tool.status !== "live").length;

  elements.statTotal.textContent = String(state.tools.length);
  elements.statLive.textContent = String(liveCount);
  elements.statSoon.textContent = String(soonCount);
}

function createMetaRow(label, value) {
  const row = document.createElement("li");
  const left = document.createElement("span");
  const right = document.createElement("strong");
  left.textContent = label;
  right.textContent = value;
  row.append(left, right);
  return row;
}

function getToolDocs(tool) {
  return (
    TOOL_DOCS[tool.id] || {
      overviewHtml: `<p>No overview has been written for <code>${tool.name}</code> yet.</p>`,
      apiHtml: `<p>No API docs have been written for <code>${tool.name}</code> yet.</p>`,
    }
  );
}

function ensureDocsModal() {
  if (docsModal) return;

  docsModal = document.createElement("div");
  docsModal.className = "docs-modal hidden";
  docsModal.setAttribute("aria-hidden", "true");
  docsModal.innerHTML = `
    <div class="docs-shell" role="dialog" aria-modal="true" aria-labelledby="docsTitle">
      <div class="docs-topline">
        <p id="docsStatus" class="docs-status">Docs</p>
        <button id="docsClose" class="docs-close" type="button" aria-label="Close docs">Close</button>
      </div>
      <h3 id="docsTitle" class="docs-title">Tool docs</h3>
      <div class="docs-tabs" role="tablist" aria-label="Tool docs sections">
        <button class="docs-tab is-active" type="button" role="tab" aria-selected="true" data-doc-tab="overview">Overview</button>
        <button class="docs-tab" type="button" role="tab" aria-selected="false" data-doc-tab="api">API</button>
      </div>
      <section class="docs-panel is-active" data-doc-panel="overview"></section>
      <section class="docs-panel" data-doc-panel="api" hidden></section>
    </div>
  `;

  document.body.appendChild(docsModal);
  docsShell = docsModal.querySelector(".docs-shell");
  docsTitle = docsModal.querySelector("#docsTitle");
  docsStatus = docsModal.querySelector("#docsStatus");
  docsTabButtons = Array.from(docsModal.querySelectorAll("[data-doc-tab]"));
  docsPanels = new Map(
    Array.from(docsModal.querySelectorAll("[data-doc-panel]")).map((panel) => [panel.getAttribute("data-doc-panel"), panel])
  );

  docsModal.querySelector("#docsClose").addEventListener("click", closeDocsModal);
  docsModal.addEventListener("click", (event) => {
    if (event.target === docsModal) closeDocsModal();
  });
  docsTabButtons.forEach((button) => {
    button.addEventListener("click", () => setDocsTab(button.getAttribute("data-doc-tab") || "overview"));
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && docsModal && !docsModal.classList.contains("hidden")) {
      closeDocsModal();
    }
  });
}

function setDocsTab(tabName) {
  docsTabButtons.forEach((button) => {
    const active = button.getAttribute("data-doc-tab") === tabName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  docsPanels.forEach((panel, key) => {
    const active = key === tabName;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
}

function openDocsModal(tool) {
  ensureDocsModal();
  const docs = getToolDocs(tool);
  docsTitle.textContent = tool.name;
  docsStatus.textContent = `${titleCase(tool.status)} • ${tool.category}`;
  docsPanels.get("overview").innerHTML = docs.overviewHtml;
  docsPanels.get("api").innerHTML = docs.apiHtml;
  applyPalette(docsShell, tool);
  setDocsTab("overview");
  docsModal.classList.remove("hidden");
  docsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("docs-open");
}

function closeDocsModal() {
  if (!docsModal) return;
  docsModal.classList.add("hidden");
  docsModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("docs-open");
}

function hashString(value) {
  if (window.ToolTheme?.hashString) return window.ToolTheme.hashString(value);
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapHue(hue) {
  const normalized = Number(hue) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function radToHue(rad) {
  return wrapHue((rad * 180) / Math.PI);
}

const TAU = Math.PI * 2;
const HUE_CIRCLE_START_RAD = (18 * Math.PI) / 180;
const FALLBACK_TOOL_IDS = fallbackTools.map((tool) => tool.id);
const FALLBACK_HUE_BY_TOOL_ID = FALLBACK_TOOL_IDS.reduce((acc, id, index) => {
  const step = TAU / Math.max(FALLBACK_TOOL_IDS.length, 1);
  acc[id] = radToHue(HUE_CIRCLE_START_RAD + step * index);
  return acc;
}, {});
const FALLBACK_ID_BY_SLUG = fallbackTools.reduce((acc, tool) => {
  const slug = String(tool.link || "").replace(/^\/+|\/+$/g, "");
  if (slug) acc[slug] = tool.id;
  return acc;
}, {});

const SQUARE_EDGE_MARGIN_PERCENT = 4;
const SQUARE_MIN_RING_RATIO = 0.38;
const SQUARE_RADIUS_X_PERCENT = 46;
const SQUARE_RADIUS_Y_PERCENT = 42;
const SQUARE_INTERACTION_RADIUS_PX = 230;
const SQUARE_INTERACTION_SHIFT_PX = 10;
const SQUARE_INTERACTION_SCALE = 0.08;
const SQUARE_BASE_OPACITY = 0.16;
const SQUARE_HOVER_OPACITY = 0.34;

const squareMotionState = {
  items: [],
  pointerX: null,
  pointerY: null,
  rafId: 0,
  listenersReady: false,
  reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
};

function seededUnit(seed, salt) {
  return (hashString(`${seed}:${salt}`) % 10000) / 10000;
}

function getSquareAnchor(seed) {
  const angle = seededUnit(seed, "angle") * TAU;
  const radius = SQUARE_MIN_RING_RATIO + seededUnit(seed, "radius") * (1 - SQUARE_MIN_RING_RATIO);
  const left = clamp(
    50 + Math.cos(angle) * radius * SQUARE_RADIUS_X_PERCENT,
    SQUARE_EDGE_MARGIN_PERCENT,
    100 - SQUARE_EDGE_MARGIN_PERCENT
  );
  const top = clamp(
    50 + Math.sin(angle) * radius * SQUARE_RADIUS_Y_PERCENT,
    SQUARE_EDGE_MARGIN_PERCENT,
    100 - SQUARE_EDGE_MARGIN_PERCENT
  );

  return { left, top };
}

function scheduleSquareMotionFrame() {
  if (squareMotionState.reduceMotion) return;
  if (squareMotionState.rafId) return;
  squareMotionState.rafId = window.requestAnimationFrame(() => {
    squareMotionState.rafId = 0;
    const hasPointer =
      Number.isFinite(squareMotionState.pointerX) && Number.isFinite(squareMotionState.pointerY);

    squareMotionState.items.forEach((item) => {
      let shiftX = 0;
      let shiftY = 0;
      let scale = 1;
      let opacity = SQUARE_BASE_OPACITY;

      if (hasPointer) {
        const centerX = (item.leftPercent / 100) * window.innerWidth;
        const centerY = (item.topPercent / 100) * window.innerHeight;
        const dx = squareMotionState.pointerX - centerX;
        const dy = squareMotionState.pointerY - centerY;
        const distance = Math.hypot(dx, dy);

        if (distance < SQUARE_INTERACTION_RADIUS_PX) {
          const influence = 1 - distance / SQUARE_INTERACTION_RADIUS_PX;
          const safeDistance = Math.max(distance, 1);
          const unitX = dx / safeDistance;
          const unitY = dy / safeDistance;

          shiftX = unitX * SQUARE_INTERACTION_SHIFT_PX * influence;
          shiftY = unitY * SQUARE_INTERACTION_SHIFT_PX * influence;
          scale = 1 + influence * SQUARE_INTERACTION_SCALE;
          opacity = SQUARE_BASE_OPACITY + (SQUARE_HOVER_OPACITY - SQUARE_BASE_OPACITY) * influence;
        }
      }

      item.element.style.setProperty("--square-shift-x", `${shiftX.toFixed(2)}px`);
      item.element.style.setProperty("--square-shift-y", `${shiftY.toFixed(2)}px`);
      item.element.style.setProperty("--square-scale", scale.toFixed(3));
      item.element.style.setProperty("--square-opacity", opacity.toFixed(3));
    });
  });
}

function setSquarePointerPosition(x, y) {
  squareMotionState.pointerX = x;
  squareMotionState.pointerY = y;
  scheduleSquareMotionFrame();
}

function clearSquarePointerPosition() {
  squareMotionState.pointerX = null;
  squareMotionState.pointerY = null;
  scheduleSquareMotionFrame();
}

function ensureSquareMotionListeners() {
  if (squareMotionState.reduceMotion || squareMotionState.listenersReady) return;

  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      setSquarePointerPosition(event.clientX, event.clientY);
    },
    { passive: true }
  );
  window.addEventListener("pointerleave", clearSquarePointerPosition, { passive: true });
  window.addEventListener("blur", clearSquarePointerPosition, { passive: true });
  window.addEventListener("resize", scheduleSquareMotionFrame, { passive: true });

  squareMotionState.listenersReady = true;
}

function createPalette(tool) {
  if (window.ToolTheme?.getToolPalette) {
    return window.ToolTheme.getToolPalette(tool);
  }

  const seed = hashString(`${tool.id}:${tool.link || ""}`);
  const slug = String(tool.link || "").replace(/^\/+|\/+$/g, "");
  const knownIdFromSlug = FALLBACK_ID_BY_SLUG[slug] || "";
  const resolvedId = FALLBACK_HUE_BY_TOOL_ID[tool.id] ? tool.id : knownIdFromSlug || tool.id;
  const fallbackHue = radToHue(HUE_CIRCLE_START_RAD + ((seed % 8192) / 8192) * TAU);
  const hueCenter = FALLBACK_HUE_BY_TOOL_ID[resolvedId] ?? fallbackHue;
  const hueA = wrapHue(hueCenter - 7);
  const hueB = wrapHue(hueCenter + 7);

  const sat = 38;
  const satSoft = 32;
  const lightA = 61;
  const lightB = 56;
  const lightC = 51;

  return {
    accentA: `hsla(${hueA} ${sat}% ${lightB}% / 0.22)`,
    accentB: `hsla(${hueB} ${satSoft}% ${lightC - 1}% / 0.09)`,
    buttonA: `hsl(${hueA} ${sat}% ${lightA}%)`,
    buttonB: `hsl(${hueB} ${sat}% ${lightB}%)`,
    buttonC: `hsl(${hueB} ${satSoft}% ${lightC}%)`,
    buttonBorder: `hsla(${hueCenter} ${satSoft}% 76% / 0.28)`,
    buttonShadow: `hsla(${hueCenter} ${satSoft}% 20% / 0.3)`,
    cardBorderHover: `hsla(${hueCenter} ${sat}% 68% / 0.42)`,
    titleHover: `hsl(${hueCenter} ${sat}% 69%)`,
    squareA: `hsla(${hueA} ${sat}% ${lightB}% / 0.24)`,
    squareB: `hsla(${hueB} ${satSoft}% ${lightC}% / 0.1)`,
  };
}

function applyPalette(card, tool) {
  const palette = createPalette(tool);
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

function renderLiveSquares() {
  if (!elements.toolSquares) return;

  elements.toolSquares.innerHTML = "";
  squareMotionState.items = [];
  ensureSquareMotionListeners();

  const liveTools = state.tools.filter((tool) => tool.status === "live");

  liveTools.forEach((tool, index) => {
    const palette = createPalette(tool);
    const seed = hashString(`${tool.id}:${tool.link}:${index}`);

    const square = document.createElement("span");
    square.className = "bg-tool-square";

    const size = 86 + (seed % 56);
    const anchor = getSquareAnchor(seed);
    const rotation = Math.round(seededUnit(seed, "rotation") * 26 - 13);

    square.style.width = `${size}px`;
    square.style.height = `${size}px`;
    square.style.left = `${anchor.left}%`;
    square.style.top = `${anchor.top}%`;
    square.style.setProperty("--square-rot", `${rotation}deg`);
    square.style.setProperty("--square-shift-x", "0px");
    square.style.setProperty("--square-shift-y", "0px");
    square.style.setProperty("--square-scale", "1");
    square.style.setProperty("--square-opacity", `${SQUARE_BASE_OPACITY}`);
    square.style.background = `linear-gradient(140deg, ${palette.squareA || palette.accentA}, ${palette.squareB || palette.accentB})`;
    square.style.boxShadow = `0 12px 30px ${palette.buttonShadow || "rgba(4, 10, 20, 0.3)"}`;

    elements.toolSquares.appendChild(square);
    squareMotionState.items.push({
      element: square,
      leftPercent: anchor.left,
      topPercent: anchor.top,
    });
  });

  scheduleSquareMotionFrame();
}

function createCard(tool, index) {
  const card = document.createElement("article");
  card.className = `tool-card tone-${tool.tone}`;
  card.style.setProperty("--delay", `${index * 0.06}s`);
  applyPalette(card, tool);

  const head = document.createElement("header");
  head.className = "tool-head";

  const category = document.createElement("p");
  category.className = "tool-category";
  category.textContent = tool.category;

  const status = document.createElement("span");
  status.className = statusPillClass(tool.status);
  status.textContent = titleCase(tool.status);

  head.append(category, status);

  const title = document.createElement("h3");
  if (tool.status === "live" && tool.link) {
    const titleLink = document.createElement("a");
    titleLink.className = "tool-title-link";
    titleLink.href = tool.link;
    titleLink.textContent = tool.name;
    title.appendChild(titleLink);
  } else {
    title.textContent = tool.name;
  }

  const desc = document.createElement("p");
  desc.className = "tool-desc";
  desc.textContent = tool.description;

  const meta = document.createElement("ul");
  meta.className = "tool-meta";
  meta.append(createMetaRow("Input", tool.input), createMetaRow("Output", tool.output));

  const foot = document.createElement("div");
  foot.className = "tool-foot";

  const openBtn = document.createElement("a");
  openBtn.className = "btn btn-card";
  openBtn.textContent = "Open Tool";

  if (tool.status === "live" && tool.link) {
    openBtn.href = tool.link;
  } else {
    openBtn.href = "#";
    openBtn.textContent = "Coming Soon";
    openBtn.classList.add("disabled");
    openBtn.setAttribute("aria-disabled", "true");
  }

  foot.append(openBtn);
  card.append(head, title, desc, meta, foot);
  return card;
}

function renderCards() {
  elements.toolGrid.innerHTML = "";
  renderLiveSquares();

  if (!state.tools.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No tools available.";
    elements.toolGrid.appendChild(empty);
    return;
  }

  state.tools.forEach((tool, index) => {
    elements.toolGrid.appendChild(createCard(tool, index));
  });
}

function renderBuildDate() {
  const stamp = new Date();
  const formatted = stamp.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  elements.buildDate.textContent = formatted;
}

async function loadTools() {
  try {
    const response = await fetch(new URL("./api/tools", window.location.href), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`API returned HTTP ${response.status}`);

    const payload = await response.json();
    const normalized = normalizeToolsList(payload?.tools);
    if (!normalized.length) throw new Error("API returned no tools.");

    state.tools = normalized;
  } catch (err) {
    console.warn("Falling back to bundled tools:", err);
    state.tools = normalizeToolsList(fallbackTools);
  }
}

async function boot() {
  renderBuildDate();
  elements.toolGrid.innerHTML = '<div class="empty-state">Loading tools...</div>';
  await loadTools();
  renderStats();
  renderCards();
}

boot();
