import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import path from "path";
import { createDatabase } from "./src/db/index.js";
import { TrackerRepository } from "./src/repositories/trackerRepository.js";
import { TrackerService } from "./src/services/trackerService.js";
import { TrackerEngine } from "./src/services/trackerEngine.js";
import { TrackerRealtimeHub } from "./src/services/trackerRealtimeHub.js";
import { AggregatorReporter } from "./src/services/aggregatorReporter.js";
import { WrWebhookReporter } from "./src/services/wrWebhookReporter.js";
import { createPublicRoutes } from "./src/routes/publicRoutes.js";
import { createAdminRoutes } from "./src/routes/adminRoutes.js";
import { createTrackerProvider } from "./src/tracker/providers/index.js";
import { TrackerAdminAuth } from "./src/auth/trackerAdminAuth.js";
import {
  PORT,
  FRONTEND_DIR,
  DB_FILE,
  TRACKER_ADMIN_TOKEN,
  TRACKER_ADMIN_USERNAME,
  TRACKER_ADMIN_PASSWORD,
  TRACKER_ADMIN_SESSION_COOKIE_NAME,
  TRACKER_ADMIN_SESSION_TTL_SECONDS,
  TRACKER_ADMIN_ALLOW_OPEN,
  TRACKER_ENABLED,
  TRACKER_PROVIDER,
  TRACKER_MODE,
  TRACKER_LEADERBOARD_TOP_N,
  TRACKER_TICK_SECONDS,
  TRACKER_BATCH_SIZE,
  TRACKER_MAX_CHECK_INTERVAL_SECONDS,
  TRACKER_WR_WEBHOOK_ENABLED,
  TRACKER_WR_WEBHOOK_URL,
  TRACKER_WR_WEBHOOK_SECRET,
  TRACKER_WR_WEBHOOK_TIMEOUT_MS,
  TRACKER_USER_AGENT,
  TRACKER_REQUEST_TIMEOUT_MS,
  TRACKER_MIN_REQUEST_GAP_MS,
  TRACKER_LIVE_GROUP_UID,
  TRACKER_LIVE_ONLY_WORLD,
  TRACKER_NADEO_AUTH_MODE,
  TRACKER_NADEO_DEDI_LOGIN,
  TRACKER_NADEO_DEDI_PASSWORD,
  TRACKER_NADEO_LIVE_ACCESS_TOKEN,
  TRACKER_NADEO_LIVE_REFRESH_TOKEN,
  TRACKER_TOKEN_CACHE_FILE,
  TRACKER_AGGREGATOR_ENABLED,
  TRACKER_AGGREGATOR_BASE_URL,
  TRACKER_AGGREGATOR_TOKEN,
  TRACKER_AGGREGATOR_PROJECT_KEY,
  TRACKER_AGGREGATOR_PROJECT_NAME,
  TRACKER_AGGREGATOR_SOURCE_LABEL,
  TRACKER_AGGREGATOR_TIMEOUT_MS,
  TRACKER_INSTANCE_ID,
  TRACKER_INSTANCE_NAME,
} from "./src/config.js";

const db = createDatabase({ filePath: DB_FILE });

const repository = new TrackerRepository(db);
const trackerTrafficServiceName =
  String(TRACKER_INSTANCE_ID || "").trim() ||
  (TRACKER_MODE === "leaderboard" ? "tracker-leaderboard" : "tracker-wr");
let aggregatorReporter = null;
const reportTrackerTraffic = (sample = {}) => {
  if (!aggregatorReporter?.isReady) return;
  aggregatorReporter.reportTraffic({
    service: trackerTrafficServiceName,
    ...sample,
  });
};
const trackerProvider = createTrackerProvider({
  providerName: TRACKER_PROVIDER,
  authMode: TRACKER_NADEO_AUTH_MODE,
  dediLogin: TRACKER_NADEO_DEDI_LOGIN,
  dediPassword: TRACKER_NADEO_DEDI_PASSWORD,
  accessToken: TRACKER_NADEO_LIVE_ACCESS_TOKEN,
  refreshToken: TRACKER_NADEO_LIVE_REFRESH_TOKEN,
  tokenCacheFile: TRACKER_TOKEN_CACHE_FILE,
  userAgent: TRACKER_USER_AGENT,
  requestTimeoutMs: TRACKER_REQUEST_TIMEOUT_MS,
  minRequestGapMs: TRACKER_MIN_REQUEST_GAP_MS,
  groupUid: TRACKER_LIVE_GROUP_UID,
  onlyWorld: TRACKER_LIVE_ONLY_WORLD,
  onHttpEvent: reportTrackerTraffic,
  logger: console,
});
aggregatorReporter = new AggregatorReporter({
  enabled: TRACKER_AGGREGATOR_ENABLED,
  baseUrl: TRACKER_AGGREGATOR_BASE_URL,
  token: TRACKER_AGGREGATOR_TOKEN,
  projectKey: TRACKER_AGGREGATOR_PROJECT_KEY,
  projectName: TRACKER_AGGREGATOR_PROJECT_NAME,
  sourceLabel: TRACKER_AGGREGATOR_SOURCE_LABEL,
  serviceName: trackerTrafficServiceName,
  instanceId: TRACKER_INSTANCE_ID,
  instanceName: TRACKER_INSTANCE_NAME,
  timeoutMs: TRACKER_AGGREGATOR_TIMEOUT_MS,
  logger: console,
});
const wrWebhookReporter = new WrWebhookReporter({
  enabled: TRACKER_MODE === "wr" && TRACKER_WR_WEBHOOK_ENABLED,
  endpointUrl: TRACKER_WR_WEBHOOK_URL,
  secret: TRACKER_WR_WEBHOOK_SECRET,
  timeoutMs: TRACKER_WR_WEBHOOK_TIMEOUT_MS,
  onHttpEvent: reportTrackerTraffic,
  logger: console,
});
const realtimeHub = new TrackerRealtimeHub({ logger: console });
const trackerEngine = new TrackerEngine({
  repository,
  provider: trackerProvider,
  enabled: TRACKER_ENABLED,
  mode: TRACKER_MODE,
  leaderboardTopN: TRACKER_LEADERBOARD_TOP_N,
  tickSeconds: TRACKER_TICK_SECONDS,
  batchSize: TRACKER_BATCH_SIZE,
  maxCheckIntervalSeconds: TRACKER_MAX_CHECK_INTERVAL_SECONDS,
  aggregatorReporter,
  wrWebhookReporter,
  realtimeHub,
  logger: console,
});
const service = new TrackerService(repository, { trackerEngine });
const adminAuth = new TrackerAdminAuth({
  adminToken: TRACKER_ADMIN_TOKEN,
  username: TRACKER_ADMIN_USERNAME,
  password: TRACKER_ADMIN_PASSWORD,
  sessionCookieName: TRACKER_ADMIN_SESSION_COOKIE_NAME,
  sessionTtlSeconds: TRACKER_ADMIN_SESSION_TTL_SECONDS,
  allowOpen: TRACKER_ADMIN_ALLOW_OPEN,
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
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  const requestBytes = Number(req.headers["content-length"] || 0) || 0;
  res.on("finish", () => {
    reportTrackerTraffic({
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

app.get(["/status", "/tracker/status"], (_req, res) => {
  res.json(service.getTrackerStatus());
});

const publicRoutes = createPublicRoutes(service, { realtimeHub });
const adminRoutes = createAdminRoutes(service, { adminAuth });

app.use("/api/v1/admin", adminRoutes);
app.use("/api/admin", adminRoutes);
app.use("/v1/admin", adminRoutes);

app.use("/api/v1", publicRoutes);
app.use("/api", publicRoutes);
app.use("/v1", publicRoutes);
app.use(publicRoutes);

function requireAdminPageAuth(req, res, next) {
  const auth = adminAuth.authenticate(req);
  if (auth.ok) {
    req.trackerAdminAuth = auth;
    return next();
  }
  const nextPath = String(req.originalUrl || "/admin");
  const safeNextPath = nextPath.startsWith("/admin") ? nextPath : "/admin";
  return res.redirect(302, `/admin/login?next=${encodeURIComponent(safeNextPath)}`);
}

app.get("/admin/login", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "admin-login.html"));
});

app.get("/admin/logout", (req, res) => {
  adminAuth.logout({ req, res });
  return res.redirect(302, "/admin/login?logged_out=1");
});

app.get(["/admin", "/admin/", "/admin.html"], requireAdminPageAuth, (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "admin.html"));
});

app.use(express.static(FRONTEND_DIR));

app.get("/", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.use((err, _req, res, _next) => {
  if (err) {
    console.error("Unexpected server error:", err);
  }
  const statusCode = Number(err?.statusCode || err?.status || 500);
  if (statusCode >= 400 && statusCode < 500) {
    return res.status(statusCode).json({
      error: err?.expose ? err?.message || "Bad request." : "Bad request.",
    });
  }
  return res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, "127.0.0.1", () => {
  const adminMode = adminAuth.getModeSummary();
  console.log(`Backend listening on http://127.0.0.1:${PORT}`);
  console.log(`FRONTEND_DIR=${FRONTEND_DIR}`);
  console.log(`DB_FILE=${DB_FILE}`);
  console.log(
    `TRACKER_ADMIN token=${adminMode.tokenEnabled ? "on" : "off"} credentials=${adminMode.credentialsEnabled ? "on" : "off"} open=${adminMode.openMode ? "on" : "off"}`
  );
  console.log(
    `TRACKER=${TRACKER_ENABLED ? "enabled" : "disabled"} mode=${TRACKER_MODE} topN=${TRACKER_LEADERBOARD_TOP_N} provider=${TRACKER_PROVIDER} tick=${TRACKER_TICK_SECONDS}s batch=${TRACKER_BATCH_SIZE} maxInterval=${TRACKER_MAX_CHECK_INTERVAL_SECONDS}s`
  );
  const providerReady =
    typeof trackerProvider?.isReady === "boolean" ? trackerProvider.isReady : Boolean(trackerProvider);
  console.log(
    `TRACKER_PROVIDER_READY=${providerReady ? "yes" : "no"} group=${TRACKER_LIVE_GROUP_UID} onlyWorld=${TRACKER_LIVE_ONLY_WORLD ? "1" : "0"} minGapMs=${TRACKER_MIN_REQUEST_GAP_MS}`
  );
  console.log(
    `TRACKER_AGGREGATOR=${TRACKER_AGGREGATOR_ENABLED ? "enabled" : "disabled"} base=${TRACKER_AGGREGATOR_BASE_URL || "<not-set>"} project=${TRACKER_AGGREGATOR_PROJECT_KEY}`
  );
  console.log(
    `TRACKER_WR_WEBHOOK=${wrWebhookReporter.isReady ? "enabled" : "disabled"} endpoint=${TRACKER_WR_WEBHOOK_URL || "<not-set>"}`
  );
  if (aggregatorReporter.isReady) {
    aggregatorReporter
      .registerInstance({
        status: "online",
        meta: {
          provider: TRACKER_PROVIDER,
          mode: TRACKER_MODE,
          tickSeconds: TRACKER_TICK_SECONDS,
          batchSize: TRACKER_BATCH_SIZE,
        },
      })
      .then(() =>
        aggregatorReporter.heartbeatInstance({
          status: "online",
          meta: {
            provider: TRACKER_PROVIDER,
            mode: TRACKER_MODE,
            startedAt: new Date().toISOString(),
          },
        })
      )
      .catch((error) => {
        console.warn(`[tracker] failed to register heartbeat instance: ${error?.message || error}`);
      });
  }
  trackerEngine.start();
});

setInterval(() => {
  adminAuth.cleanupExpired();
}, 60_000).unref();

process.on("SIGINT", () => {
  trackerEngine.stop();
  realtimeHub.close();
  if (aggregatorReporter?.isReady) {
    aggregatorReporter.flushTrafficQueue().catch(() => {});
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  trackerEngine.stop();
  realtimeHub.close();
  if (aggregatorReporter?.isReady) {
    aggregatorReporter.flushTrafficQueue().catch(() => {});
  }
  process.exit(0);
});
