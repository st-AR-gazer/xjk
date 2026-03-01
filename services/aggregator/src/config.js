import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Math.max(1, Number(process.env.PORT || 3140));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, "tracker-aggregator.sqlite");
const FRONTEND_DIR =
  process.env.FRONTEND_DIR ||
  path.join(__dirname, "..", "..", "..", "sites", "aggregator.xjk.yt", "frontend");
const INGEST_TOKEN = String(process.env.AGGREGATOR_INGEST_TOKEN || "").trim();

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

ensureDir(DATA_DIR);

export { PORT, DATA_DIR, DB_FILE, FRONTEND_DIR, INGEST_TOKEN };
