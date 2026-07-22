import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "node:path";
import fsp from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRateLimiter, createUnexpectedErrorHandler, startToolServerIfMain } from "../../shared/backend/http.js";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, "..", "frontend");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const TOOLS_FILE = process.env.TOOLS_FILE || path.join(DATA_DIR, "tools.json");
const SHARED_DIR = process.env.SHARED_DIR || path.join(__dirname, "..", "..", "shared");
const COLORIZER_DIR = process.env.COLORIZER_DIR || path.join(__dirname, "..", "..", "Colorizer", "frontend");

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
  const raw = await fsp.readFile(TOOLS_FILE, "utf8");
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
  if (!Array.isArray(parsed)) throw new Error("tools.json must be an array.");

  const tools = parsed.map((tool, index) => sanitizeTool(tool, index)).filter(Boolean);
  if (!tools.length) throw new Error("No valid tools found in tools.json.");
  return tools;
}

await readTools();

const app = express();
app.disable("x-powered-by");

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("combined"));
app.use(express.json({ limit: "200kb" }));

app.use("/api/", createRateLimiter({ rateLimit, limit: 120 }));

app.get("/api/tools", async (_req, res, next) => {
  try {
    const tools = await readTools();
    res.json({ tools, count: tools.length });
  } catch (error) {
    next(error);
  }
});

app.get("/health", (_req, res) => {
  res.type("text").send("ok");
});

app.use("/shared", express.static(SHARED_DIR));
app.get(/^\/Colorizer$/, (_req, res) => res.redirect(308, "/Colorizer/"));
app.use("/Colorizer", express.static(COLORIZER_DIR));
app.use(express.static(FRONTEND_DIR));

app.get("/", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.use(createUnexpectedErrorHandler());

export { app };
startToolServerIfMain(import.meta.url, {
  app,
  port: PORT,
  details: [`FRONTEND_DIR=${FRONTEND_DIR}`, `SHARED_DIR=${SHARED_DIR}`, `TOOLS_FILE=${TOOLS_FILE}`],
});
