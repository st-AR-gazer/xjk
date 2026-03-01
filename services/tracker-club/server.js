import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import cors from "cors";
import path from "path";
import {
  PORT,
  FRONTEND_DIR,
  TRACKER_CLUB_ENABLED,
  TRACKER_CLUB_PROJECT_KEY,
  TRACKER_CLUB_PROJECT_NAME,
  TRACKER_CLUB_SOURCE_LABEL,
  TRACKER_CLUB_AGGREGATOR_BASE_URL,
  TRACKER_CLUB_AGGREGATOR_TOKEN,
  TRACKER_CLUB_REQUEST_TIMEOUT_MS,
} from "./src/config.js";
import { ClubTrackerService } from "./src/services/clubTrackerService.js";

const service = new ClubTrackerService({
  enabled: TRACKER_CLUB_ENABLED,
  aggregatorBaseUrl: TRACKER_CLUB_AGGREGATOR_BASE_URL,
  aggregatorToken: TRACKER_CLUB_AGGREGATOR_TOKEN,
  projectKey: TRACKER_CLUB_PROJECT_KEY,
  projectName: TRACKER_CLUB_PROJECT_NAME,
  sourceLabel: TRACKER_CLUB_SOURCE_LABEL,
  requestTimeoutMs: TRACKER_CLUB_REQUEST_TIMEOUT_MS,
});

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
app.use(express.json({ limit: "20mb" }));
app.use(
  "/api/",
  rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 500,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/health", (_req, res) => {
  res.type("text").send("ok");
});

app.get("/api/v1/status", (_req, res) => {
  return res.json(service.getStatus());
});

app.post("/api/v1/snapshot/ingest", async (req, res) => {
  const result = await service.ingestSnapshot(req.body || {});
  if (result?.error) return res.status(400).json(result);
  return res.json(result);
});
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
  console.log(`Tracker club listening on http://127.0.0.1:${PORT}`);
  console.log(`FRONTEND_DIR=${FRONTEND_DIR}`);
  console.log(`AGGREGATOR_BASE_URL=${TRACKER_CLUB_AGGREGATOR_BASE_URL}`);
  console.log(`TRACKER_CLUB_ENABLED=${TRACKER_CLUB_ENABLED}`);
});
