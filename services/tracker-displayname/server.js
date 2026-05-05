import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import path from "path";
import {
  PORT,
  FRONTEND_DIR,
  TRACKER_DISPLAYNAME_ENABLED,
  TRACKER_DISPLAYNAME_SCHEDULER_ENABLED,
  TRACKER_DISPLAYNAME_MAINTENANCE_INTERVAL_SECONDS,
  TRACKER_DISPLAYNAME_STALE_AFTER_SECONDS,
  TRACKER_DISPLAYNAME_BATCH_SIZE,
  TRACKER_DISPLAYNAME_MAX_ACCOUNTS_PER_CYCLE,
  TRACKER_DISPLAYNAME_PROJECT_KEY,
  TRACKER_DISPLAYNAME_PROJECT_NAME,
  TRACKER_DISPLAYNAME_SOURCE_LABEL,
  TRACKER_DISPLAYNAME_AGGREGATOR_BASE_URL,
  TRACKER_DISPLAYNAME_AGGREGATOR_TOKEN,
  TRACKER_DISPLAYNAME_REQUEST_TIMEOUT_MS,
  TRACKER_DISPLAYNAME_MIN_REQUEST_GAP_MS,
  UBI_OAUTH_CLIENT_ID,
  UBI_OAUTH_CLIENT_SECRET,
  UBI_OAUTH_TOKEN_URL,
  TRACKER_DISPLAYNAME_API_BASE_URL,
  TRACKER_DISPLAYNAME_SCOPE,
  TRACKER_DISPLAYNAME_USER_AGENT,
} from "./src/config.js";
import { TrackmaniaOAuthClient } from "./src/services/trackmaniaOAuthClient.js";
import { DisplayNameTrackerService, uniqueAccountIds } from "./src/services/displayNameTrackerService.js";

let service = null;
const oauthClient = new TrackmaniaOAuthClient({
  enabled: TRACKER_DISPLAYNAME_ENABLED,
  clientId: UBI_OAUTH_CLIENT_ID,
  clientSecret: UBI_OAUTH_CLIENT_SECRET,
  tokenUrl: UBI_OAUTH_TOKEN_URL,
  apiBaseUrl: TRACKER_DISPLAYNAME_API_BASE_URL,
  scope: TRACKER_DISPLAYNAME_SCOPE,
  userAgent: TRACKER_DISPLAYNAME_USER_AGENT,
  requestTimeoutMs: TRACKER_DISPLAYNAME_REQUEST_TIMEOUT_MS,
  minRequestGapMs: TRACKER_DISPLAYNAME_MIN_REQUEST_GAP_MS,
  onHttpEvent: (sample) => {
    if (!service) return;
    service.reportTraffic({
      service: "tracker-displayname",
      ...sample,
    });
  },
  logger: console,
});

service = new DisplayNameTrackerService({
  oauthClient,
  aggregatorBaseUrl: TRACKER_DISPLAYNAME_AGGREGATOR_BASE_URL,
  aggregatorToken: TRACKER_DISPLAYNAME_AGGREGATOR_TOKEN,
  projectKey: TRACKER_DISPLAYNAME_PROJECT_KEY,
  projectName: TRACKER_DISPLAYNAME_PROJECT_NAME,
  sourceLabel: TRACKER_DISPLAYNAME_SOURCE_LABEL,
  enabled: TRACKER_DISPLAYNAME_ENABLED,
  schedulerEnabled: TRACKER_DISPLAYNAME_SCHEDULER_ENABLED,
  maintenanceIntervalSeconds: TRACKER_DISPLAYNAME_MAINTENANCE_INTERVAL_SECONDS,
  staleAfterSeconds: TRACKER_DISPLAYNAME_STALE_AFTER_SECONDS,
  batchSize: TRACKER_DISPLAYNAME_BATCH_SIZE,
  maxAccountsPerCycle: TRACKER_DISPLAYNAME_MAX_ACCOUNTS_PER_CYCLE,
  requestTimeoutMs: TRACKER_DISPLAYNAME_REQUEST_TIMEOUT_MS,
  minRequestGapMs: TRACKER_DISPLAYNAME_MIN_REQUEST_GAP_MS,
  logger: console,
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
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  const requestBytes = Number(req.headers["content-length"] || 0) || 0;
  res.on("finish", () => {
    service.reportTraffic({
      direction: "incoming",
      component: "express",
      method: req.method,
      route: req.path || "/",
      targetHost: String(req.hostname || req.headers.host || "").replace(/:\d+$/, ""),
      targetPath: req.originalUrl || req.url || req.path || "/",
      statusCode: Number(res.statusCode || 0),
      durationMs: Date.now() - startedAt,
      bytesIn: Math.max(0, requestBytes),
      bytesOut: Math.max(0, Number(res.getHeader("content-length") || 0) || 0),
    });
  });
  next();
});
app.get("/health", (_req, res) => {
  res.type("text").send("ok");
});

app.get(
  [
    "/status",
    "/tracker/status",
    "/api/status",
    "/api/tracker/status",
    "/api/v1/status",
    "/api/v1/tracker/status",
  ],
  (_req, res) => {
  res.json(service.getStatus());
  }
);

app.post("/api/v1/accounts/enqueue", (req, res) => {
  const accountIds = uniqueAccountIds(req.body?.accountIds || []);
  const front = Boolean(req.body?.front || req.body?.prioritize || req.body?.priority);
  const result = service.enqueueAccountIds(accountIds, { front });
  return res.json({
    ...result,
    requested: accountIds.length,
  });
});

app.post(["/api/v1/display-names/resolve", "/api/v1/accounts/resolve"], async (req, res) => {
  const accountIds = uniqueAccountIds(req.body?.accountIds || req.body?.account_ids || []);
  const result = await service.resolveAccountIds(accountIds, {
    reason: req.body?.reason || "priority-api",
    front:
      req.body?.front === undefined && req.body?.prioritize === undefined
        ? true
        : Boolean(req.body?.front || req.body?.prioritize || req.body?.priority),
  });
  if (result?.error && !result?.ok) return res.status(400).json(result);
  return res.json(result);
});

app.post("/api/v1/sync/run-now", async (req, res) => {
  const accountIds = uniqueAccountIds(req.body?.accountIds || []);
  const result = await service.runSync({
    accountIds,
    reason: "manual-api",
    forceCandidates: Boolean(req.body?.forceCandidates),
    prioritizeAccountIds:
      req.body?.prioritizeAccountIds === undefined
        ? true
        : Boolean(req.body?.prioritizeAccountIds),
  });
  if (result?.error) return res.status(400).json(result);
  return res.json(result);
});

app.post("/api/v1/config", (req, res) => {
  const payload = req.body || {};
  const status = service.setConfig({
    enabled: payload.enabled,
    schedulerEnabled: payload.schedulerEnabled,
    maintenanceIntervalSeconds: payload.maintenanceIntervalSeconds,
    staleAfterSeconds: payload.staleAfterSeconds,
    batchSize: payload.batchSize,
    maxAccountsPerCycle: payload.maxAccountsPerCycle,
    minRequestGapMs: payload.minRequestGapMs,
  });
  return res.json(status);
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

app.listen(PORT, "127.0.0.1", async () => {
  console.log(`Tracker displayname listening on http://127.0.0.1:${PORT}`);
  console.log(`FRONTEND_DIR=${FRONTEND_DIR}`);
  console.log(`AGGREGATOR_BASE_URL=${TRACKER_DISPLAYNAME_AGGREGATOR_BASE_URL}`);
  console.log(`TRACKER_DISPLAYNAME_ENABLED=${TRACKER_DISPLAYNAME_ENABLED}`);
  console.log(`TRACKER_DISPLAYNAME_SCHEDULER_ENABLED=${TRACKER_DISPLAYNAME_SCHEDULER_ENABLED}`);
  console.log(`UBI_OAUTH_CLIENT_ID=${UBI_OAUTH_CLIENT_ID ? "<set>" : "<not-set>"}`);
  await service.warmup();
});
