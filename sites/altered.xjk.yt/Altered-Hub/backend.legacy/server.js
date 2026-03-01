import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import cors from "cors";
import path from "path";
import { createDatabase } from "./src/db/index.js";
import { seedDatabase } from "./src/db/seed.js";
import { TrackerRepository } from "./src/repositories/trackerRepository.js";
import { TrackerService } from "./src/services/trackerService.js";
import { TrackerEngine } from "./src/services/trackerEngine.js";
import { createPublicRoutes } from "./src/routes/publicRoutes.js";
import { createAdminRoutes } from "./src/routes/adminRoutes.js";
import { createTrackerProvider } from "./src/tracker/providers/index.js";
import {
  PORT,
  FRONTEND_DIR,
  DB_FILE,
  ADMIN_TOKEN,
  ENABLE_SEED,
  TRACKER_ENABLED,
  TRACKER_PROVIDER,
  TRACKER_TICK_SECONDS,
  TRACKER_BATCH_SIZE,
  TRACKER_CHANGE_CHANCE,
  TRACKER_MAX_CHECK_INTERVAL_SECONDS,
} from "./src/config.js";

const db = createDatabase({ filePath: DB_FILE });
if (ENABLE_SEED) {
  const seeded = seedDatabase(db);
  if (seeded) {
    console.log("Database seeded with starter altered tracker data.");
  }
}

const repository = new TrackerRepository(db);
const trackerProvider = createTrackerProvider({
  providerName: TRACKER_PROVIDER,
  changeChance: TRACKER_CHANGE_CHANCE,
});
const trackerEngine = new TrackerEngine({
  repository,
  provider: trackerProvider,
  enabled: TRACKER_ENABLED,
  tickSeconds: TRACKER_TICK_SECONDS,
  batchSize: TRACKER_BATCH_SIZE,
  maxCheckIntervalSeconds: TRACKER_MAX_CHECK_INTERVAL_SECONDS,
  logger: console,
});
const service = new TrackerService(repository, { trackerEngine });

const app = express();
app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
  })
);
app.use(morgan("combined"));
app.use(express.json({ limit: "300kb" }));

app.use(
  "/api/",
  rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/health", (_req, res) => {
  res.type("text").send("ok");
});

app.use("/api/v1", createPublicRoutes(service));
app.use("/api/v1/admin", createAdminRoutes(service, { adminToken: ADMIN_TOKEN }));

app.use(express.static(FRONTEND_DIR));

app.get("/", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.use((err, _req, res, _next) => {
  if (err) {
    console.error("Unexpected server error:", err);
  }
  return res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Backend listening on http://127.0.0.1:${PORT}`);
  console.log(`FRONTEND_DIR=${FRONTEND_DIR}`);
  console.log(`DB_FILE=${DB_FILE}`);
  console.log(`ADMIN_TOKEN=${ADMIN_TOKEN ? "<set>" : "<not-set (open admin endpoints)>"}`);
  console.log(
    `TRACKER=${TRACKER_ENABLED ? "enabled" : "disabled"} provider=${TRACKER_PROVIDER} tick=${TRACKER_TICK_SECONDS}s batch=${TRACKER_BATCH_SIZE} maxInterval=${TRACKER_MAX_CHECK_INTERVAL_SECONDS}s`
  );
  trackerEngine.start();
});

process.on("SIGINT", () => {
  trackerEngine.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  trackerEngine.stop();
  process.exit(0);
});
