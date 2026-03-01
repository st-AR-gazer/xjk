import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import { fileURLToPath } from "url";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, "..", "frontend");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const TOOLS_FILE = process.env.TOOLS_FILE || path.join(DATA_DIR, "tools.json");
const SHARED_DIR = process.env.SHARED_DIR || path.join(__dirname, "..", "..", "shared");

const DEFAULT_TOOLS = [
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
];

function safeMkdir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function ensureToolsFile() {
  safeMkdir(DATA_DIR);

  try {
    await fsp.access(TOOLS_FILE);
  } catch {
    await fsp.writeFile(TOOLS_FILE, `${JSON.stringify(DEFAULT_TOOLS, null, 2)}\n`, "utf8");
  }
}

function sanitizeTool(raw, index) {
  if (!raw || typeof raw !== "object") return null;

  const statusRaw = String(raw.status || "live").toLowerCase();
  const toneRaw = String(raw.tone || "cool").toLowerCase();

  return {
    id: String(raw.id || `tool-${index + 1}`),
    name: String(raw.name || "Untitled Tool"),
    description: String(raw.description || "No description provided."),
    category: String(raw.category || "General"),
    status: statusRaw === "live" ? "live" : "soon",
    input: String(raw.input || "N/A"),
    output: String(raw.output || "N/A"),
    link: typeof raw.link === "string" ? raw.link : "",
    tone: toneRaw === "warm" ? "warm" : "cool",
  };
}

async function readTools() {
  try {
    const raw = await fsp.readFile(TOOLS_FILE, "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    if (!Array.isArray(parsed)) throw new Error("tools.json must be an array.");

    const tools = parsed.map((tool, index) => sanitizeTool(tool, index)).filter(Boolean);
    if (!tools.length) throw new Error("No valid tools found in tools.json.");

    return tools;
  } catch (err) {
    console.warn(`Failed to load tools from ${TOOLS_FILE}:`, err.message);
    return DEFAULT_TOOLS;
  }
}

await ensureToolsFile();

const app = express();
app.disable("x-powered-by");

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("combined"));
app.use(express.json({ limit: "200kb" }));

app.use(
  "/api/",
  rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/api/tools", async (_req, res) => {
  const tools = await readTools();
  res.json({ tools, count: tools.length });
});

app.get("/health", (_req, res) => {
  res.type("text").send("ok");
});

app.use("/shared", express.static(SHARED_DIR));
app.use(express.static(FRONTEND_DIR));

app.get("/", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.use((err, _req, res, _next) => {
  if (err) {
    console.error("Unexpected server error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }

  return res.status(500).json({ error: "Unknown server error." });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Backend listening on http://127.0.0.1:${PORT}`);
  console.log(`FRONTEND_DIR=${FRONTEND_DIR}`);
  console.log(`SHARED_DIR=${SHARED_DIR}`);
  console.log(`TOOLS_FILE=${TOOLS_FILE}`);
});

