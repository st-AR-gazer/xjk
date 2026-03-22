import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import path from "path";
import { createDatabase } from "./src/db/index.js";
import { AggregatorRepository } from "./src/repositories/aggregatorRepository.js";
import { createPublicRoutes } from "./src/routes/publicRoutes.js";
import { createIngestRoutes } from "./src/routes/ingestRoutes.js";
import { createPrivateDashRoutes } from "./src/routes/privateDashRoutes.js";
import {
  PORT,
  DB_FILE,
  FRONTEND_DIR,
  DASH_FRONTEND_DIR,
  INGEST_TOKEN,
  DASH_ADMIN_TOKEN,
  DASH_HOSTNAMES,
  TRACKER_WR_BASE_URL,
  TRACKER_LEADERBOARD_BASE_URL,
  TRACKER_DISPLAYNAME_BASE_URL,
  TRACKER_CLUB_BASE_URL,
  ALTERED_BASE_URL,
  ALTERED_INTERNAL_TOKEN,
  TRACKER_ADMIN_TOKEN,
  PM2_LOG_DIR,
  NADEO_GLOBAL_THROTTLE_FILE,
  NADEO_GLOBAL_MIN_REQUEST_GAP_MS,
} from "./src/config.js";

const DASH_COOKIE_NAME = "xjk_dash_auth";
const DASH_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const dashHostSet = new Set(
  (Array.isArray(DASH_HOSTNAMES) ? DASH_HOSTNAMES : [])
    .map((host) => String(host || "").trim().toLowerCase())
    .filter(Boolean)
);

function normalizeHost(value) {
  const raw = String(value || "").trim().toLowerCase();
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

function parseCookieHeader(rawCookie = "") {
  const map = new Map();
  const text = String(rawCookie || "").trim();
  if (!text) return map;
  for (const pair of text.split(";")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) continue;
    map.set(key, decodeURIComponent(value));
  }
  return map;
}

function extractDashToken(req) {
  const headerToken =
    req.headers["x-dash-token"] ||
    req.headers["x-admin-token"] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "") ||
    "";
  const queryToken = String(req.query?.token || "").trim();
  if (queryToken) return queryToken;
  if (String(headerToken || "").trim()) return String(headerToken).trim();
  const cookieMap = parseCookieHeader(req.headers.cookie || "");
  return String(cookieMap.get(DASH_COOKIE_NAME) || "").trim();
}

function renderDashLoginPage({ error = "", nextPath = "/" } = {}) {
  const safeError = String(error || "").trim();
  const safeNext = String(nextPath || "/").startsWith("/") ? String(nextPath || "/") : "/";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>xjk / dash login</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: "Segoe UI", Arial, sans-serif;
      background: radial-gradient(circle at 20% 10%, #102038, #05080f 58%);
      color: #d9e7ff;
    }
    .card {
      width: min(420px, calc(100% - 2rem));
      border: 1px solid rgba(80, 150, 255, 0.25);
      border-radius: 16px;
      background: rgba(9, 16, 28, 0.92);
      padding: 1.15rem;
      box-shadow: 0 16px 34px rgba(0, 0, 0, 0.35);
    }
    h1 { margin: 0 0 0.45rem; font-size: 1.15rem; }
    p { margin: 0.1rem 0 0.8rem; color: #9db6db; font-size: 0.9rem; }
    label { display: block; margin-bottom: 0.35rem; color: #c6dbff; font-size: 0.85rem; }
    input {
      width: 100%;
      min-height: 38px;
      border-radius: 10px;
      border: 1px solid rgba(120, 172, 255, 0.28);
      background: rgba(4, 10, 18, 0.85);
      color: #eff6ff;
      padding: 0.4rem 0.6rem;
      font: inherit;
      box-sizing: border-box;
    }
    button {
      margin-top: 0.7rem;
      min-height: 38px;
      border-radius: 10px;
      border: 1px solid rgba(88, 170, 255, 0.5);
      background: linear-gradient(135deg, #0a4c90, #1163b8);
      color: #f2f8ff;
      padding: 0.42rem 0.9rem;
      font: inherit;
      cursor: pointer;
    }
    .error {
      margin-bottom: 0.6rem;
      border: 1px solid rgba(255, 122, 122, 0.45);
      background: rgba(92, 16, 16, 0.65);
      color: #ffcdcd;
      padding: 0.45rem 0.55rem;
      border-radius: 9px;
      font-size: 0.84rem;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>Private Dashboard</h1>
    <p>Enter the dashboard token to continue.</p>
    ${safeError ? `<div class="error">${safeError}</div>` : ""}
    <form method="post" action="/dash/login">
      <label for="token">Token</label>
      <input id="token" name="token" type="password" required autocomplete="current-password" />
      <input type="hidden" name="next" value="${safeNext.replaceAll('"', "&quot;")}" />
      <button type="submit">Sign in</button>
    </form>
  </main>
</body>
</html>`;
}

const db = createDatabase({ filePath: DB_FILE });
const repository = new AggregatorRepository(db);
const serveAggregatorStatic = express.static(FRONTEND_DIR);
const serveDashStatic = express.static(DASH_FRONTEND_DIR);

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
app.use(express.urlencoded({ extended: false }));

app.get("/health", (_req, res) => {
  res.type("text").send("ok");
});

app.use((req, res, next) => {
  if (!DASH_ADMIN_TOKEN) return next();

  const dashHostRequest = isDashHostRequest(req);
  const dashApiRequest =
    req.path.startsWith("/api/v1/private/dash") || req.path.startsWith("/api/private/dash");
  if (!dashHostRequest && !dashApiRequest) return next();

  const pathLower = String(req.path || "").toLowerCase();
  if (pathLower === "/dash/login" || pathLower === "/dash/logout" || pathLower === "/health") {
    return next();
  }

  const token = extractDashToken(req);
  if (token && token === DASH_ADMIN_TOKEN) {
    return next();
  }

  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const nextPath = String(req.originalUrl || "/");
  const safeNextPath = nextPath.startsWith("/") ? nextPath : "/";
  return res.redirect(302, `/dash/login?next=${encodeURIComponent(safeNextPath)}`);
});

app.get("/dash/login", (req, res) => {
  if (!DASH_ADMIN_TOKEN) {
    return res.status(503).type("text").send("Dash auth is not configured.");
  }
  const nextPath = String(req.query.next || "/");
  return res.status(200).type("html").send(renderDashLoginPage({ nextPath }));
});

app.post("/dash/login", (req, res) => {
  if (!DASH_ADMIN_TOKEN) {
    return res.status(503).type("text").send("Dash auth is not configured.");
  }
  const token = String(req.body?.token || req.query?.token || "").trim();
  const nextPath = String(req.body?.next || req.query?.next || "/");
  const safeNextPath = nextPath.startsWith("/") ? nextPath : "/";

  if (token !== DASH_ADMIN_TOKEN) {
    return res
      .status(401)
      .type("html")
      .send(renderDashLoginPage({ error: "Invalid token.", nextPath: safeNextPath }));
  }

  res.cookie(DASH_COOKIE_NAME, DASH_ADMIN_TOKEN, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: DASH_SESSION_TTL_MS,
    path: "/",
  });
  return res.redirect(302, safeNextPath);
});

app.get("/dash/logout", (_req, res) => {
  res.clearCookie(DASH_COOKIE_NAME, { path: "/" });
  return res.redirect(302, "/dash/login");
});

const publicRoutes = createPublicRoutes(repository, {
  trackerControl: {
    leaderboardBaseUrl: TRACKER_LEADERBOARD_BASE_URL,
  },
});
const ingestRoutes = createIngestRoutes(repository, { ingestToken: INGEST_TOKEN });
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
  console.log(`AGGREGATOR_INGEST_TOKEN=${INGEST_TOKEN ? "<set>" : "<not-set (open ingest)>"} `);
  console.log(`DASH_ADMIN_TOKEN=${DASH_ADMIN_TOKEN ? "<set>" : "<not-set (dash open)>"} `);
  console.log(`DASH_HOSTNAMES=${[...dashHostSet].join(",")}`);
  console.log(
    `DASH_TRACKERS wr=${TRACKER_WR_BASE_URL} lb=${TRACKER_LEADERBOARD_BASE_URL} dn=${TRACKER_DISPLAYNAME_BASE_URL} club=${TRACKER_CLUB_BASE_URL}`
  );
  console.log(
    `DASH_NADEO_THROTTLE file=${NADEO_GLOBAL_THROTTLE_FILE || "<not-set>"} minGapMs=${NADEO_GLOBAL_MIN_REQUEST_GAP_MS}`
  );

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
});
