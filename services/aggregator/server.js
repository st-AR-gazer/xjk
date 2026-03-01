import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import cors from "cors";
import path from "path";
import { createDatabase } from "./src/db/index.js";
import { AggregatorRepository } from "./src/repositories/aggregatorRepository.js";
import { createPublicRoutes } from "./src/routes/publicRoutes.js";
import { createIngestRoutes } from "./src/routes/ingestRoutes.js";
import { PORT, DB_FILE, FRONTEND_DIR, INGEST_TOKEN } from "./src/config.js";

const db = createDatabase({ filePath: DB_FILE });
const repository = new AggregatorRepository(db);

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
app.use(express.json({ limit: "3mb" }));

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

app.use("/api/v1", createPublicRoutes(repository));
app.use("/api/v1/ingest", createIngestRoutes(repository, { ingestToken: INGEST_TOKEN }));
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
  console.log(`Aggregator listening on http://127.0.0.1:${PORT}`);
  console.log(`FRONTEND_DIR=${FRONTEND_DIR}`);
  console.log(`DB_FILE=${DB_FILE}`);
  console.log(`AGGREGATOR_INGEST_TOKEN=${INGEST_TOKEN ? "<set>" : "<not-set (open ingest)>"} `);
});
