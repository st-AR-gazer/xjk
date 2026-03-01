import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3130);
const FRONTEND_DIR =
  process.env.FRONTEND_DIR || path.join(__dirname, "..", "..", "..", "frontend");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, "altered-tracker.sqlite");
const ADMIN_TOKEN = process.env.ALTERED_ADMIN_TOKEN || "";
const ENABLE_SEED = String(process.env.ENABLE_SEED || "1") !== "0";
const TRACKER_ENABLED = String(process.env.TRACKER_ENABLED || "1") !== "0";
const TRACKER_PROVIDER = String(process.env.TRACKER_PROVIDER || "simulated");
const TRACKER_TICK_SECONDS = Math.max(3, Number(process.env.TRACKER_TICK_SECONDS || 20));
const TRACKER_BATCH_SIZE = Math.max(1, Number(process.env.TRACKER_BATCH_SIZE || 6));
const TRACKER_CHANGE_CHANCE = Math.min(
  1,
  Math.max(0, Number(process.env.TRACKER_CHANGE_CHANCE || 0.18))
);
const TRACKER_MAX_CHECK_INTERVAL_SECONDS = Math.max(
  0,
  Number(process.env.TRACKER_MAX_CHECK_INTERVAL_SECONDS || 0)
);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

ensureDir(DATA_DIR);

export {
  PORT,
  FRONTEND_DIR,
  DATA_DIR,
  DB_FILE,
  ADMIN_TOKEN,
  ENABLE_SEED,
  TRACKER_ENABLED,
  TRACKER_PROVIDER,
  TRACKER_TICK_SECONDS,
  TRACKER_BATCH_SIZE,
  TRACKER_CHANGE_CHANCE,
  TRACKER_MAX_CHECK_INTERVAL_SECONDS,
};
