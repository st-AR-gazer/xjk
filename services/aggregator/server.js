import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import path from "node:path";
import { createDatabase } from "./src/db/index.js";
import { AggregatorRepository } from "./src/repositories/aggregatorRepository.js";
import { createPublicRoutes } from "./src/routes/publicRoutes.js";
import { createIngestRoutes } from "./src/routes/ingestRoutes.js";
import { createPrivateDashRoutes } from "./src/routes/privateDashRoutes.js";
import { createApiCatalog } from "./src/api/catalog.js";
import { assertAggregatorAccessConfigured, redactSensitiveUrl } from "./src/auth/accessPolicy.js";
import { createDashAuthentication } from "./src/auth/dashAuthentication.js";
import {
  PORT,
  DB_FILE,
  FRONTEND_DIR,
  DASH_FRONTEND_DIR,
  INGEST_TOKEN,
  DASH_ADMIN_TOKEN,
  ALLOW_INSECURE_OPEN,
  DASH_HOSTNAMES,
  TRACKER_WR_BASE_URL,
  TRACKER_LEADERBOARD_BASE_URL,
  TRACKER_DISPLAYNAME_BASE_URL,
  TRACKER_CLUB_BASE_URL,
  ALTERED_BASE_URL,
  ALTERED_INTERNAL_TOKEN,
  TRACKER_ADMIN_TOKEN,
  ARL_OPENPLANET_AUTH_SECRET,
  OPENPLANET_AUTH_VALIDATE_URL,
  PM2_LOG_DIR,
  NADEO_GLOBAL_THROTTLE_FILE,
  NADEO_GLOBAL_MIN_REQUEST_GAP_MS,
} from "./src/config.js";

const STARTUP_BACKFILL_ENABLED =
  String(process.env.AGGREGATOR_STARTUP_BACKFILL_ENABLED || (PORT >= 3100 ? "1" : "0")).trim() !== "0";

const dashHostSet = new Set(
  (Array.isArray(DASH_HOSTNAMES) ? DASH_HOSTNAMES : [])
    .map((host) =>
      String(host || "")
        .trim()
        .toLowerCase()
    )
    .filter(Boolean)
);

function normalizeHost(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  const first = raw.split(",")[0]?.trim() || "";
  return first.replace(/:\d+$/, "");
}

function getRequestHost(req) {
  const forwarded = req.headers["x-forwarded-host"];
  if (Array.isArray(forwarded)) return normalizeHost(forwarded[0]);
  if (forwarded) return normalizeHost(forwarded);
  return normalizeHost(req.headers.host || req.hostname || "");
}

function isDashHostRequest(req) {
  const host = getRequestHost(req);
  return Boolean(host && dashHostSet.has(host));
}

function getRequestOrigin(req) {
  const rawForwarded = req.headers["x-forwarded-host"];
  const forwardedHost = Array.isArray(rawForwarded) ? rawForwarded[0] : rawForwarded;
  const hostHeader = String(forwardedHost || req.headers.host || "")
    .split(",")[0]
    .trim();
  if (!hostHeader) return "";
  const normalizedHost = hostHeader.toLowerCase();
  const protocol = normalizedHost.includes("localhost") || normalizedHost.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${hostHeader}`;
}

assertAggregatorAccessConfigured({
  ingestToken: INGEST_TOKEN,
  dashAdminToken: DASH_ADMIN_TOKEN,
  allowInsecureOpen: ALLOW_INSECURE_OPEN,
});

const db = createDatabase({ filePath: DB_FILE });
const repository = new AggregatorRepository(db);
const SHARED_DIR = path.resolve(FRONTEND_DIR, "..", "..", "shared");
const serveAggregatorStatic = express.static(FRONTEND_DIR);
const serveDashStatic = express.static(DASH_FRONTEND_DIR);
const serveApiDocsStatic = express.static(path.join(FRONTEND_DIR, "api-docs"));
const serveSharedStatic = express.static(SHARED_DIR);

const app = express();
app.disable("x-powered-by");
const dashAuthentication = createDashAuthentication({
  adminToken: DASH_ADMIN_TOKEN,
  allowInsecureOpen: ALLOW_INSECURE_OPEN,
  isDashHostRequest,
});

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
morgan.token("redacted-url", (req) => redactSensitiveUrl(req.originalUrl || req.url));
app.use(
  morgan(
    ':remote-addr - :remote-user [:date[clf]] ":method :redacted-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
  )
);
app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ extended: false }));
app.use("/shared", serveSharedStatic);

app.get("/health", (_req, res) => {
  res.type("text").send("ok");
});

app.use(dashAuthentication.middleware);
app.get("/dash/login", dashAuthentication.showLogin);
app.post("/dash/login", dashAuthentication.login);
app.get("/dash/logout", dashAuthentication.logout);

const publicRoutes = createPublicRoutes(repository, {
  trackerControl: {
    leaderboardBaseUrl: TRACKER_LEADERBOARD_BASE_URL,
  },
  catalogFactory: (req) =>
    createApiCatalog({
      origin: getRequestOrigin(req),
      ingestTokenConfigured: Boolean(INGEST_TOKEN),
      arlAuthConfigured: Boolean(ARL_OPENPLANET_AUTH_SECRET),
    }),
});
const ingestRoutes = createIngestRoutes(repository, {
  ingestToken: INGEST_TOKEN,
  allowInsecureOpen: ALLOW_INSECURE_OPEN,
  arlOpenplanetAuthSecret: ARL_OPENPLANET_AUTH_SECRET,
  openplanetValidateUrl: OPENPLANET_AUTH_VALIDATE_URL,
});
const privateDashRoutes = createPrivateDashRoutes(repository, {
  trackerControl: {
    wrBaseUrl: TRACKER_WR_BASE_URL,
    leaderboardBaseUrl: TRACKER_LEADERBOARD_BASE_URL,
    displaynameBaseUrl: TRACKER_DISPLAYNAME_BASE_URL,
    clubBaseUrl: TRACKER_CLUB_BASE_URL,
    adminToken: TRACKER_ADMIN_TOKEN,
  },
  alteredControl: {
    baseUrl: ALTERED_BASE_URL,
    internalToken: ALTERED_INTERNAL_TOKEN,
  },
  logsControl: {
    logDir: PM2_LOG_DIR,
  },
  nadeoControl: {
    throttleStateFile: NADEO_GLOBAL_THROTTLE_FILE,
    minRequestGapMs: NADEO_GLOBAL_MIN_REQUEST_GAP_MS,
  },
});

app.get(["/api", "/api/", "/api/index.html"], (req, res, next) => {
  if (isDashHostRequest(req)) return next();
  return res.sendFile(path.join(FRONTEND_DIR, "api-docs", "index.html"));
});

app.get("/api/catalog.json", (req, res, next) => {
  if (isDashHostRequest(req)) return next();
  return res.json(
    createApiCatalog({
      origin: getRequestOrigin(req),
      ingestTokenConfigured: Boolean(INGEST_TOKEN),
      arlAuthConfigured: Boolean(ARL_OPENPLANET_AUTH_SECRET),
    })
  );
});

app.use("/api/_docs", (req, res, next) => {
  if (isDashHostRequest(req)) return next();
  return serveApiDocsStatic(req, res, next);
});

app.use("/api/v1", publicRoutes);
app.use("/api", publicRoutes);

app.use("/api/v1/ingest", ingestRoutes);
app.use("/api/ingest", ingestRoutes);

app.use("/api/v1/private/dash", privateDashRoutes);
app.use("/api/private/dash", privateDashRoutes);

app.use((req, res, next) => {
  if (isDashHostRequest(req)) return serveDashStatic(req, res, next);
  return serveAggregatorStatic(req, res, next);
});

app.get("/", (req, res) => {
  if (isDashHostRequest(req)) {
    return res.sendFile(path.join(DASH_FRONTEND_DIR, "index.html"));
  }
  return res.sendFile(path.join(FRONTEND_DIR, "index.html"));
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
  console.log(`DASH_FRONTEND_DIR=${DASH_FRONTEND_DIR}`);
  console.log(`DB_FILE=${DB_FILE}`);
  console.log(`AGGREGATOR_AUTH=${ALLOW_INSECURE_OPEN ? "explicit-insecure-open" : "required"}`);
  console.log(`DASH_HOSTNAMES=${[...dashHostSet].join(",")}`);
  console.log(
    `DASH_TRACKERS wr=${TRACKER_WR_BASE_URL} lb=${TRACKER_LEADERBOARD_BASE_URL} dn=${TRACKER_DISPLAYNAME_BASE_URL} club=${TRACKER_CLUB_BASE_URL}`
  );
  console.log(
    `DASH_NADEO_THROTTLE file=${NADEO_GLOBAL_THROTTLE_FILE || "<not-set>"} minGapMs=${NADEO_GLOBAL_MIN_REQUEST_GAP_MS}`
  );
  console.log(`STARTUP_BACKFILL_ENABLED=${STARTUP_BACKFILL_ENABLED ? "1" : "0"}`);

  if (STARTUP_BACKFILL_ENABLED) {
    const runTrafficBackfill = () => {
      try {
        const result = repository.backfillTrafficSamples({
          batchSize: 5000,
          maxBatches: 1,
        });
        const inserted = Number(result?.inserted || 0);
        if (inserted > 0) {
          console.log(`Backfilled ${inserted} traffic sample rows.`);
          setTimeout(runTrafficBackfill, 25);
        }
      } catch (error) {
        console.warn(`Traffic sample backfill failed: ${error?.message || error}`);
      }
    };

    setTimeout(runTrafficBackfill, 25);

    const runNormBackfill = () => {
      try {
        const more = repository.backfillNormalizedDisplayNames();
        if (more) {
          console.log("Backfilled a batch of normalized display names.");
          setTimeout(runNormBackfill, 500);
        }
      } catch (error) {
        console.warn(`Norm backfill failed: ${error?.message || error}`);
      }
    };
    setTimeout(runNormBackfill, 50);
  }
});
