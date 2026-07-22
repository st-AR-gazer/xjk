import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRateLimiter, createUnexpectedErrorHandler, startToolServerIfMain } from "../../shared/backend/http.js";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, "..", "frontend");

const app = express();
app.disable("x-powered-by");

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("combined"));
app.use(express.json({ limit: "100kb" }));
app.use("/api/", createRateLimiter({ rateLimit }));
app.use(express.static(FRONTEND_DIR));

app.get("/", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.get("/health", (_req, res) => {
  res.type("text").send("ok");
});

app.use(createUnexpectedErrorHandler({ missingErrorMessage: "Unexpected server error." }));

export { app };
startToolServerIfMain(import.meta.url, {
  app,
  port: PORT,
  message: `Replay Verification launchpad listening on http://127.0.0.1:${PORT}`,
  details: [`FRONTEND_DIR=${FRONTEND_DIR}`],
});
