import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import cors from "cors";
import path from "path";
import { createDatabase } from "./src/db/index.js";
import { AlteredRepository } from "./src/repositories/alteredRepository.js";
import { OpsRepository } from "./src/repositories/opsRepository.js";
import { TrackerClient } from "./src/tracker/trackerClient.js";
import { TrackerDisplaynameClient } from "./src/tracker/trackerDisplaynameClient.js";
import { TrackerClubClient } from "./src/tracker/trackerClubClient.js";
import { AggregatorClient } from "./src/tracker/aggregatorClient.js";
import { AlteredService } from "./src/services/alteredService.js";
import { OpsAutomationService } from "./src/services/opsAutomationService.js";
import { NadeoLiveClient } from "./src/live/nadeoLiveClient.js";
import { TrackmaniaOAuthClient } from "./src/live/trackmaniaOAuthClient.js";
import { createPublicRoutes } from "./src/routes/publicRoutes.js";
import { createAdminRoutes } from "./src/routes/adminRoutes.js";
import { createOpsAdminRoutes } from "./src/routes/opsAdminRoutes.js";
import { UbisoftAuth, buildAbsoluteUrl } from "./src/auth/ubisoftAuth.js";
import {
  PORT,
  FRONTEND_DIR,
  DB_FILE,
  ADMIN_TOKEN,
  TRACKER_PUBLIC_BASE_URL,
  TRACKER_ADMIN_BASE_URL,
  TRACKER_ADMIN_TOKEN,
  TRACKER_ADMIN_USERNAME,
  TRACKER_ADMIN_PASSWORD,
  TRACKER_LEADERBOARD_PUBLIC_BASE_URL,
  TRACKER_LEADERBOARD_ADMIN_BASE_URL,
  TRACKER_LEADERBOARD_ADMIN_TOKEN,
  TRACKER_LEADERBOARD_ADMIN_USERNAME,
  TRACKER_LEADERBOARD_ADMIN_PASSWORD,
  TRACKER_PROXY_TIMEOUT_MS,
  TRACKER_DISPLAYNAME_BASE_URL,
  TRACKER_CLUB_BASE_URL,
  AGGREGATOR_BASE_URL,
  AGGREGATOR_TOKEN,
  ALTERED_TRACKER_DISPLAYNAME_ENABLED,
  ALTERED_TRACKER_DISPLAYNAME_FALLBACK_LOCAL,
  ALTERED_TRACKER_CLUB_ENABLED,
  ALTERED_TRACKER_CLUB_FALLBACK_LOCAL,
  ALTERED_WR_WEBHOOK_SECRET,
  UBI_OAUTH_ENABLED,
  UBI_OAUTH_CLIENT_ID,
  UBI_OAUTH_CLIENT_SECRET,
  UBI_OAUTH_AUTHORIZE_URL,
  UBI_OAUTH_TOKEN_URL,
  UBI_OAUTH_USERINFO_URL,
  UBI_OAUTH_SCOPE,
  UBI_OAUTH_CALLBACK_PATH,
  UBI_OAUTH_ALLOWED_SUBJECTS,
  UBI_OAUTH_ALLOWED_USERNAMES,
  ALTERED_SESSION_COOKIE_NAME,
  ALTERED_SESSION_TTL_SECONDS,
  ALTERED_OAUTH_STATE_TTL_SECONDS,
  ALTERED_OAUTH_FALLBACK_LOCAL_ONLY,
  ALTERED_LIVE_MONITOR_ENABLED,
  ALTERED_LIVE_MONITOR_INTERVAL_SECONDS,
  ALTERED_LIVE_MONITOR_SCHEDULE_MODE,
  ALTERED_LIVE_MONITOR_DAILY_HOUR_UTC,
  ALTERED_LIVE_MONITOR_DAILY_MINUTE_UTC,
  ALTERED_LIVE_DISCOVERY_ENABLED,
  ALTERED_LIVE_DISCOVERY_INTERVAL_SECONDS,
  ALTERED_LIVE_DISCOVERY_CAMPAIGN_LIMIT,
  ALTERED_LIVE_DISCOVERY_ACTIVITY_PAGE_SIZE,
  ALTERED_LIVE_CLUB_ID,
  ALTERED_LIVE_ACTIVITY_PAGE_SIZE,
  ALTERED_LIVE_ACTIVITY_ACTIVE_ONLY,
  ALTERED_LIVE_FETCH_MAP_DETAILS,
  ALTERED_LIVE_AUTH_MODE,
  ALTERED_LIVE_DEDI_LOGIN,
  ALTERED_LIVE_DEDI_PASSWORD,
  ALTERED_LIVE_ACCESS_TOKEN,
  ALTERED_LIVE_REFRESH_TOKEN,
  ALTERED_LIVE_API_BASE_URL,
  ALTERED_LIVE_USER_AGENT,
  ALTERED_LIVE_REQUEST_TIMEOUT_MS,
  ALTERED_LIVE_MIN_REQUEST_GAP_MS,
  ALTERED_MAPPER_NAME_TRACKING_ENABLED,
  ALTERED_MAPPER_NAME_TRACKING_API_BASE_URL,
  ALTERED_MAPPER_NAME_TRACKING_TOKEN_URL,
  ALTERED_MAPPER_NAME_TRACKING_SCOPE,
  ALTERED_MAPPER_NAME_TRACKING_REQUEST_TIMEOUT_MS,
  ALTERED_MAPPER_NAME_TRACKING_MIN_REQUEST_GAP_MS,
  ALTERED_MAPPER_NAME_TRACKING_USER_AGENT,
  ALTERED_MAPPER_SYNC_SCHEDULER_ENABLED,
  ALTERED_MAPPER_SYNC_BOOTSTRAP_INTERVAL_SECONDS,
  ALTERED_MAPPER_SYNC_MAINTENANCE_INTERVAL_SECONDS,
  ALTERED_MAPPER_SYNC_PRIORITY_INTERVAL_SECONDS,
  ALTERED_MAPPER_SYNC_BATCH_SIZE,
  ALTERED_MAPPER_SYNC_PRIORITY_BATCH_SIZE,
  ALTERED_MAPPER_SYNC_PRIORITY_TOP_LIMIT,
  ALTERED_MAPPER_SYNC_PRIORITY_REFRESH_SECONDS,
  ALTERED_MAPPER_SYNC_CACHE_TTL_SECONDS,
  ALTERED_MAPPER_SYNC_PRIORITY_CACHE_TTL_SECONDS,
  ALTERED_MAPPER_SYNC_KNOWN_ACCOUNTS_REFRESH_SECONDS,
  ALTERED_OPS_MONITOR_ENABLED,
  ALTERED_OPS_MONITOR_TICK_SECONDS,
  ALTERED_OPS_MONITOR_MAX_MAPS_PER_RUN,
} from "./src/config.js";

const db = createDatabase({ filePath: DB_FILE });
const repository = new AlteredRepository(db);
const opsRepository = new OpsRepository(db);
repository.ensureDefaultHookConfig();
const allowlistBootstrap = repository.seedAdminAllowlistFromConfig({
  subjects: UBI_OAUTH_ALLOWED_SUBJECTS,
  usernames: UBI_OAUTH_ALLOWED_USERNAMES,
});
const trackerClient = new TrackerClient({
  publicBaseUrl: TRACKER_PUBLIC_BASE_URL,
  adminBaseUrl: TRACKER_ADMIN_BASE_URL,
  adminToken: TRACKER_ADMIN_TOKEN,
  adminUsername: TRACKER_ADMIN_USERNAME,
  adminPassword: TRACKER_ADMIN_PASSWORD,
  timeoutMs: TRACKER_PROXY_TIMEOUT_MS,
  logger: console,
});
const trackerLeaderboardClient = new TrackerClient({
  publicBaseUrl: TRACKER_LEADERBOARD_PUBLIC_BASE_URL,
  adminBaseUrl: TRACKER_LEADERBOARD_ADMIN_BASE_URL,
  adminToken: TRACKER_LEADERBOARD_ADMIN_TOKEN,
  adminUsername: TRACKER_LEADERBOARD_ADMIN_USERNAME,
  adminPassword: TRACKER_LEADERBOARD_ADMIN_PASSWORD,
  timeoutMs: TRACKER_PROXY_TIMEOUT_MS,
  logger: console,
});
const liveClient = new NadeoLiveClient({
  authMode: ALTERED_LIVE_AUTH_MODE,
  dediLogin: ALTERED_LIVE_DEDI_LOGIN,
  dediPassword: ALTERED_LIVE_DEDI_PASSWORD,
  accessToken: ALTERED_LIVE_ACCESS_TOKEN,
  refreshToken: ALTERED_LIVE_REFRESH_TOKEN,
  userAgent: ALTERED_LIVE_USER_AGENT,
  requestTimeoutMs: ALTERED_LIVE_REQUEST_TIMEOUT_MS,
  minRequestGapMs: ALTERED_LIVE_MIN_REQUEST_GAP_MS,
  liveApiBaseUrl: ALTERED_LIVE_API_BASE_URL || undefined,
  logger: console,
});
const mapperNameClient = new TrackmaniaOAuthClient({
  enabled: ALTERED_MAPPER_NAME_TRACKING_ENABLED,
  clientId: UBI_OAUTH_CLIENT_ID,
  clientSecret: UBI_OAUTH_CLIENT_SECRET,
  tokenUrl: ALTERED_MAPPER_NAME_TRACKING_TOKEN_URL || undefined,
  apiBaseUrl: ALTERED_MAPPER_NAME_TRACKING_API_BASE_URL,
  scope: ALTERED_MAPPER_NAME_TRACKING_SCOPE,
  requestTimeoutMs: ALTERED_MAPPER_NAME_TRACKING_REQUEST_TIMEOUT_MS,
  minRequestGapMs: ALTERED_MAPPER_NAME_TRACKING_MIN_REQUEST_GAP_MS,
  userAgent: ALTERED_MAPPER_NAME_TRACKING_USER_AGENT,
  logger: console,
});
const trackerDisplaynameClient = new TrackerDisplaynameClient({
  baseUrl: TRACKER_DISPLAYNAME_BASE_URL,
  timeoutMs: TRACKER_PROXY_TIMEOUT_MS,
  logger: console,
});
const trackerClubClient = new TrackerClubClient({
  baseUrl: TRACKER_CLUB_BASE_URL,
  timeoutMs: TRACKER_PROXY_TIMEOUT_MS,
  logger: console,
});
const aggregatorClient = new AggregatorClient({
  baseUrl: AGGREGATOR_BASE_URL,
  token: AGGREGATOR_TOKEN,
  timeoutMs: TRACKER_PROXY_TIMEOUT_MS,
  logger: console,
});
const alteredService = new AlteredService({
  repository,
  trackerClient,
  trackerMapSyncClients: [
    {
      key: "leaderboard",
      label: "tracker-leaderboard",
      client: trackerLeaderboardClient,
    },
  ],
  trackerDisplaynameClient,
  trackerClubClient,
  aggregatorClient,
  liveClient,
  mapperNameClient,
  trackerIntegrations: {
    displaynameEnabled: ALTERED_TRACKER_DISPLAYNAME_ENABLED,
    displaynameFallbackLocal: ALTERED_TRACKER_DISPLAYNAME_FALLBACK_LOCAL,
    clubEnabled: ALTERED_TRACKER_CLUB_ENABLED,
    clubFallbackLocal: ALTERED_TRACKER_CLUB_FALLBACK_LOCAL,
  },
  liveMonitorConfig: {
    enabled: ALTERED_LIVE_MONITOR_ENABLED,
    scheduleMode: ALTERED_LIVE_MONITOR_SCHEDULE_MODE,
    dailyHourUtc: ALTERED_LIVE_MONITOR_DAILY_HOUR_UTC,
    dailyMinuteUtc: ALTERED_LIVE_MONITOR_DAILY_MINUTE_UTC,
    discoveryEnabled: ALTERED_LIVE_DISCOVERY_ENABLED,
    discoveryIntervalSeconds: ALTERED_LIVE_DISCOVERY_INTERVAL_SECONDS,
    discoveryCampaignLimit: ALTERED_LIVE_DISCOVERY_CAMPAIGN_LIMIT,
    discoveryActivityPageSize: ALTERED_LIVE_DISCOVERY_ACTIVITY_PAGE_SIZE,
    clubId: ALTERED_LIVE_CLUB_ID,
    intervalSeconds: ALTERED_LIVE_MONITOR_INTERVAL_SECONDS,
    activityPageSize: ALTERED_LIVE_ACTIVITY_PAGE_SIZE,
    activeOnly: ALTERED_LIVE_ACTIVITY_ACTIVE_ONLY,
    fetchMapDetails: ALTERED_LIVE_FETCH_MAP_DETAILS,
  },
  mapperNameSyncConfig: {
    enabled: ALTERED_MAPPER_SYNC_SCHEDULER_ENABLED,
    bootstrapIntervalSeconds: ALTERED_MAPPER_SYNC_BOOTSTRAP_INTERVAL_SECONDS,
    maintenanceIntervalSeconds: ALTERED_MAPPER_SYNC_MAINTENANCE_INTERVAL_SECONDS,
    priorityIntervalSeconds: ALTERED_MAPPER_SYNC_PRIORITY_INTERVAL_SECONDS,
    batchSize: ALTERED_MAPPER_SYNC_BATCH_SIZE,
    priorityBatchSize: ALTERED_MAPPER_SYNC_PRIORITY_BATCH_SIZE,
    priorityTopLimit: ALTERED_MAPPER_SYNC_PRIORITY_TOP_LIMIT,
    priorityRefreshSeconds: ALTERED_MAPPER_SYNC_PRIORITY_REFRESH_SECONDS,
    cacheTtlSeconds: ALTERED_MAPPER_SYNC_CACHE_TTL_SECONDS,
    priorityCacheTtlSeconds: ALTERED_MAPPER_SYNC_PRIORITY_CACHE_TTL_SECONDS,
    knownAccountsRefreshSeconds: ALTERED_MAPPER_SYNC_KNOWN_ACCOUNTS_REFRESH_SECONDS,
    minRequestGapMs: 5000,
  },
  logger: console,
});
const opsService = new OpsAutomationService({
  repository: opsRepository,
  trackerClient,
  monitorConfig: {
    enabled: ALTERED_OPS_MONITOR_ENABLED,
    tickSeconds: ALTERED_OPS_MONITOR_TICK_SECONDS,
    maxMapsPerRun: ALTERED_OPS_MONITOR_MAX_MAPS_PER_RUN,
  },
  logger: console,
});

const app = express();
app.disable("x-powered-by");

const ubisoftAuth = new UbisoftAuth({
  enabled: UBI_OAUTH_ENABLED,
  clientId: UBI_OAUTH_CLIENT_ID,
  clientSecret: UBI_OAUTH_CLIENT_SECRET,
  authorizeUrl: UBI_OAUTH_AUTHORIZE_URL,
  tokenUrl: UBI_OAUTH_TOKEN_URL,
  userInfoUrl: UBI_OAUTH_USERINFO_URL,
  scope: UBI_OAUTH_SCOPE,
  callbackPath: UBI_OAUTH_CALLBACK_PATH,
  allowedSubjects: UBI_OAUTH_ALLOWED_SUBJECTS,
  allowedUsernames: UBI_OAUTH_ALLOWED_USERNAMES,
  sessionCookieName: ALTERED_SESSION_COOKIE_NAME,
  sessionTtlSeconds: ALTERED_SESSION_TTL_SECONDS,
  oauthStateTtlSeconds: ALTERED_OAUTH_STATE_TTL_SECONDS,
  allowlistResolver: ({ subject, username, profile }) =>
    repository.isUbisoftAdminAllowed({
      subject,
      username,
      profile,
    }),
  sessionStore: {
    getSessionRecordByToken: (token) => repository.getAdminSessionByToken(token),
    upsertSession: ({ token, record }) =>
      repository.upsertAdminSession({
        token,
        record,
      }),
    deleteSessionByToken: (token) => repository.deleteAdminSessionByToken(token),
    deleteExpiredSessions: ({ beforeMs } = {}) =>
      repository.deleteExpiredAdminSessions({
        beforeMs,
      }),
  },
  logger: console,
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
app.use(morgan("combined"));
app.use(express.json({ limit: "20mb" }));

app.use(
  "/api/",
  rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

function getHeaderAdminToken(req) {
  const token =
    req.headers["x-admin-token"] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "") ||
    "";
  return String(token).trim();
}

function parseOptionalBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return undefined;
  const raw = String(value).trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return undefined;
}

function getOAuthLoginUrl(req, returnTo = "/admin/") {
  const encoded = encodeURIComponent(String(returnTo || "/admin/"));
  return buildAbsoluteUrl(req, `/auth/ubisoft/login?return_to=${encoded}`);
}

function isOAuthEnforced() {
  const oauthStatus = ubisoftAuth.getStatus();
  return UBI_OAUTH_ENABLED && oauthStatus.enabled;
}

function extractRequestHost(req) {
  return String(req.headers["x-forwarded-host"] || req.headers.host || req.hostname || "")
    .split(",")[0]
    .trim()
    .split(":")[0]
    .toLowerCase();
}

function isLoopbackAddress(value) {
  const ip = String(value || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!ip) return false;
  if (ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1") return true;
  if (ip.startsWith("127.")) return true;
  if (ip === "::ffff:0:1") return true;
  return false;
}

function isLocalRequest(req) {
  const host = extractRequestHost(req);
  if (host) {
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  }

  const remoteAddress = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "");
  return isLoopbackAddress(remoteAddress);
}

function isOAuthFallbackOpen(req) {
  const oauthStatus = ubisoftAuth.getStatus();
  if (!UBI_OAUTH_ENABLED || oauthStatus.enabled) return false;
  if (!ALTERED_OAUTH_FALLBACK_LOCAL_ONLY) return false;
  return isLocalRequest(req);
}

function isOAuthRequiredButUnavailable(req) {
  const oauthStatus = ubisoftAuth.getStatus();
  return UBI_OAUTH_ENABLED && !oauthStatus.enabled && !isOAuthFallbackOpen(req);
}

function requirePageAdmin(req, res, next) {
  if (isOAuthEnforced()) {
    const session = ubisoftAuth.getSessionFromRequest(req);
    if (session) return next();
    const encoded = encodeURIComponent(req.originalUrl || "/admin/");
    return res.redirect(`/auth/ubisoft/login?return_to=${encoded}`);
  }

  if (isOAuthRequiredButUnavailable(req)) {
    return res.status(503).type("html").send(
      "<h1>Altered Admin Unavailable</h1><p>Ubisoft OAuth admin login is required and not configured on this deployment.</p>"
    );
  }

  if (isOAuthFallbackOpen(req)) return next();

  if (!ADMIN_TOKEN) {
    return res.status(503).type("html").send(
      "<h1>Admin Auth Not Configured</h1><p>Set Ubisoft OAuth settings or ALTERED_ADMIN_TOKEN to enable admin access.</p>"
    );
  }
  const token = getHeaderAdminToken(req);
  if (token && token === String(ADMIN_TOKEN).trim()) return next();
  return res.status(401).send("Unauthorized");
}

function requireApiAdmin(req, res, next) {
  if (isOAuthEnforced()) {
    const session = ubisoftAuth.getSessionFromRequest(req);
    if (session) {
      req.alteredAdmin = session.user;
      req.alteredAdminSession = session;
      return next();
    }
    return res.status(401).json({
      error: "Unauthorized",
      loginUrl: getOAuthLoginUrl(req, "/admin/"),
    });
  }

  if (isOAuthRequiredButUnavailable(req)) {
    return res.status(503).json({
      error: "Ubisoft OAuth admin login is required and is not configured.",
      oauthRequired: true,
      configError:
        "Set UBI_OAUTH_CLIENT_ID, UBI_OAUTH_CLIENT_SECRET, and Ubisoft OAuth endpoint URLs.",
    });
  }

  if (isOAuthFallbackOpen(req)) return next();

  if (!ADMIN_TOKEN) {
    return res.status(503).json({
      error: "Admin auth is not configured.",
      configError: "Set Ubisoft OAuth settings or ALTERED_ADMIN_TOKEN.",
    });
  }
  const token = getHeaderAdminToken(req);
  if (token !== String(ADMIN_TOKEN).trim()) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

async function resolveLiveAuthContext(req) {
  if (!isOAuthEnforced()) return null;

  const session = ubisoftAuth.getSessionFromRequest(req);
  if (!session) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }

  const context = await ubisoftAuth.getNadeoAuthContextFromRequest(req);
  if (!context?.ubisoftAccessToken) {
    const error = new Error(
      "Ubisoft session token is unavailable or expired for Nadeo API calls. Log out and sign in again."
    );
    error.statusCode = 401;
    throw error;
  }
  return context;
}

app.get("/health", (_req, res) => {
  res.type("text").send("ok");
});

app.get("/auth/ubisoft/login", (req, res) => {
  if (!isOAuthEnforced()) {
    if (isOAuthRequiredButUnavailable(req)) {
      return res.status(503).json({
        error:
          "Ubisoft OAuth admin login is required and is not fully configured on this service.",
      });
    }
    return res.redirect("/admin/");
  }

  const returnTo = String(req.query.return_to || "/admin/");
  const loginUrl = ubisoftAuth.buildLoginUrl({
    req,
    returnTo,
  });
  if (!loginUrl) {
    return res.status(503).json({
      error: "Ubisoft OAuth login is currently unavailable.",
    });
  }
  return res.redirect(loginUrl);
});

app.get("/auth/ubisoft/callback", async (req, res) => {
  if (!isOAuthEnforced()) {
    if (isOAuthRequiredButUnavailable(req)) {
      return res.status(503).type("html").send(
        "<h1>Ubisoft Login Unavailable</h1><p>OAuth admin login is required and not configured on this deployment.</p>"
      );
    }
    return res.redirect("/admin/");
  }

  const result = await ubisoftAuth.completeCallback({
    req,
    code: req.query.code,
    state: req.query.state,
  });
  if (!result.ok) {
    return res.status(result.statusCode || 400).type("html").send(
      `<h1>Ubisoft Login Failed</h1><p>${result.error || "Unknown error."}</p><p><a href="/auth/ubisoft/login?return_to=%2Fadmin%2F">Try again</a></p>`
    );
  }

  ubisoftAuth.attachSessionCookie(res, req, result.sessionToken);
  return res.redirect(result.returnTo || "/admin/");
});

app.get("/api/v1/admin/auth/status", (req, res) => {
  if (isOAuthEnforced()) {
    const session = ubisoftAuth.getSessionFromRequest(req);
    if (!session) {
      return res.status(200).json({
        authenticated: false,
        provider: "ubisoft",
        loginUrl: getOAuthLoginUrl(req, "/admin/"),
        allowlistMode: "database",
        allowlistedAccounts: repository.countActiveAdminUsers(),
      });
    }
    return res.status(200).json({
      authenticated: true,
      provider: "ubisoft",
      user: session.user,
      expiresAt: new Date(session.expiresAt).toISOString(),
      hasLiveApiToken: Boolean(
        ubisoftAuth.getSessionRecordByToken(session.token)?.record?.oauth?.accessToken
      ),
    });
  }

  if (isOAuthRequiredButUnavailable(req)) {
    return res.status(200).json({
      authenticated: false,
      provider: "ubisoft",
      oauthRequired: true,
      configError:
        "Ubisoft OAuth admin login is required and is not configured on this service.",
    });
  }

  if (isOAuthFallbackOpen(req)) {
    return res.status(200).json({
      authenticated: true,
      provider: "open-fallback",
      warning:
        "UBI_OAUTH_ENABLED=1 but OAuth is incomplete. Local fallback mode is active on this instance.",
    });
  }

  const tokenRequired = Boolean(ADMIN_TOKEN);
  if (!tokenRequired) {
    const oauthDisabled = !UBI_OAUTH_ENABLED;
    return res.status(200).json({
      authenticated: false,
      provider: oauthDisabled ? "ubisoft-disabled" : "unconfigured",
      oauthEnabled: UBI_OAUTH_ENABLED,
      configError: oauthDisabled
        ? "Ubisoft OAuth is disabled (UBI_OAUTH_ENABLED=0). Enable OAuth and set client/endpoint settings to use Ubisoft login."
        : "Admin auth is not configured. Set Ubisoft OAuth settings or ALTERED_ADMIN_TOKEN.",
      tokenRequired: false,
    });
  }
  const providedToken = getHeaderAdminToken(req);
  return res.status(200).json({
    authenticated: providedToken === String(ADMIN_TOKEN).trim(),
    provider: tokenRequired ? "admin-token" : "open",
    tokenRequired,
  });
});

app.post("/api/v1/admin/auth/logout", (req, res) => {
  ubisoftAuth.clearSession(res, req);
  return res.status(200).json({ ok: true });
});

app.get("/api/v1/admin/auth/allowlist", requireApiAdmin, (req, res) => {
  const includeInactive = parseOptionalBoolean(req.query.includeInactive);
  const users = repository.listAdminUsers({
    includeInactive: includeInactive === undefined ? true : includeInactive,
    limit: Number(req.query.limit) || 500,
  });
  return res.status(200).json({
    users,
    count: users.length,
    activeCount: repository.countActiveAdminUsers(),
  });
});

app.post("/api/v1/admin/auth/allowlist", requireApiAdmin, (req, res) => {
  const body = req.body || {};
  const isActive = parseOptionalBoolean(body.isActive);
  const result = repository.upsertAdminUser({
    subject: body.subject,
    username: body.username,
    displayName: body.displayName,
    role: body.role,
    isActive: isActive === undefined ? true : isActive,
    source: "admin-api",
    note: body.note,
  });
  if (result?.error) {
    return res.status(400).json(result);
  }
  return res.status(200).json({
    ok: true,
    adminUser: result.adminUser,
    activeCount: repository.countActiveAdminUsers(),
  });
});

app.post("/api/v1/admin/auth/allowlist/:adminUserId/active", requireApiAdmin, (req, res) => {
  const adminUserId = Number(req.params.adminUserId) || 0;
  const active = parseOptionalBoolean(req.body?.active);
  if (active === undefined) {
    return res.status(400).json({ error: "active boolean is required." });
  }

  const existing = repository.getAdminUserById(adminUserId);
  if (!existing) {
    return res.status(404).json({ error: "Admin user not found." });
  }
  if (!active && existing.isActive && repository.countActiveAdminUsers() <= 1) {
    return res.status(400).json({
      error: "Cannot disable the last active admin allowlist entry.",
    });
  }

  const updated = repository.updateAdminUserActive({ adminUserId, isActive: active });
  return res.status(200).json({
    ok: true,
    adminUser: updated,
    activeCount: repository.countActiveAdminUsers(),
  });
});

app.use("/api/v1/admin/ops", requireApiAdmin, createOpsAdminRoutes(opsService));
app.use(
  "/api/v1/admin",
  requireApiAdmin,
  createAdminRoutes(alteredService, {
    resolveLiveAuthContext,
  })
);
app.use(
  "/api/v1",
  createPublicRoutes(alteredService, {
    wrWebhookSecret: ALTERED_WR_WEBHOOK_SECRET,
  })
);

app.get("/admin", requirePageAdmin, (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "admin.html"));
});

app.get("/admin/", requirePageAdmin, (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "admin.html"));
});

app.get("/admin.html", requirePageAdmin, (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "admin.html"));
});

app.get("/admin/monitoring", requirePageAdmin, (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "admin-monitoring.html"));
});

app.get("/admin/monitoring/", requirePageAdmin, (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "admin-monitoring.html"));
});

app.get("/admin-monitoring.html", requirePageAdmin, (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "admin-monitoring.html"));
});

app.get("/admin-login", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "admin-login.html"));
});

app.get("/admin-login/", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "admin-login.html"));
});

app.use(express.static(FRONTEND_DIR));

app.get("/", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.use((err, _req, res, _next) => {
  if (err) {
    console.error("Unexpected altered service error:", err);
  }
  return res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Altered service listening on http://127.0.0.1:${PORT}`);
  console.log(`FRONTEND_DIR=${FRONTEND_DIR}`);
  console.log(`DB_FILE=${DB_FILE}`);
  console.log(`ADMIN_TOKEN=${ADMIN_TOKEN ? "<set>" : "<not-set>"}`);
  console.log(`TRACKER_PUBLIC_BASE_URL=${TRACKER_PUBLIC_BASE_URL}`);
  console.log(`TRACKER_ADMIN_BASE_URL=${TRACKER_ADMIN_BASE_URL}`);
  console.log(`TRACKER_LEADERBOARD_PUBLIC_BASE_URL=${TRACKER_LEADERBOARD_PUBLIC_BASE_URL}`);
  console.log(`TRACKER_LEADERBOARD_ADMIN_BASE_URL=${TRACKER_LEADERBOARD_ADMIN_BASE_URL}`);
  console.log(`TRACKER_DISPLAYNAME_BASE_URL=${TRACKER_DISPLAYNAME_BASE_URL}`);
  console.log(`TRACKER_CLUB_BASE_URL=${TRACKER_CLUB_BASE_URL}`);
  console.log(`AGGREGATOR_BASE_URL=${AGGREGATOR_BASE_URL}`);
  console.log(`TRACKER_PROXY_TIMEOUT_MS=${TRACKER_PROXY_TIMEOUT_MS}`);
  console.log(
    `ALTERED_TRACKER_INTEGRATIONS displayname=${ALTERED_TRACKER_DISPLAYNAME_ENABLED ? "on" : "off"} fallback=${ALTERED_TRACKER_DISPLAYNAME_FALLBACK_LOCAL ? "on" : "off"} club=${ALTERED_TRACKER_CLUB_ENABLED ? "on" : "off"} fallback=${ALTERED_TRACKER_CLUB_FALLBACK_LOCAL ? "on" : "off"}`
  );
  const authStatus = ubisoftAuth.getStatus();
  console.log(
    `UBISOFT_OAUTH=${authStatus.enabled ? "enabled" : "disabled"} configured=${
      authStatus.configured ? "yes" : "no"
    } allowlist(mode=${authStatus.allowlist.mode}, subjects=${authStatus.allowlist.subjects}, usernames=${authStatus.allowlist.usernames})`
  );
  console.log(
    `ALTERED_ADMIN_ALLOWLIST active=${repository.countActiveAdminUsers()} bootstrapped=${allowlistBootstrap.seededCount}`
  );
  console.log(
    `ALTERED_OAUTH_FALLBACK_LOCAL_ONLY=${ALTERED_OAUTH_FALLBACK_LOCAL_ONLY ? "1" : "0"}`
  );
  console.log(
    `ALTERED_LIVE monitor=${ALTERED_LIVE_MONITOR_ENABLED ? "enabled" : "disabled"} schedule=${ALTERED_LIVE_MONITOR_SCHEDULE_MODE} dailyUtc=${ALTERED_LIVE_MONITOR_DAILY_HOUR_UTC}:${String(ALTERED_LIVE_MONITOR_DAILY_MINUTE_UTC).padStart(2, "0")} club=${ALTERED_LIVE_CLUB_ID} pageSize=${ALTERED_LIVE_ACTIVITY_PAGE_SIZE} activeOnly=${ALTERED_LIVE_ACTIVITY_ACTIVE_ONLY} fetchMapDetails=${ALTERED_LIVE_FETCH_MAP_DETAILS}`
  );
  console.log(`ALTERED_LIVE authMode=${ALTERED_LIVE_AUTH_MODE} ua="${ALTERED_LIVE_USER_AGENT}"`);
  console.log(
    `ALTERED_MAPPER_SYNC scheduler=${ALTERED_MAPPER_SYNC_SCHEDULER_ENABLED ? "enabled" : "disabled"} bootstrap=${ALTERED_MAPPER_SYNC_BOOTSTRAP_INTERVAL_SECONDS}s maintenance=${ALTERED_MAPPER_SYNC_MAINTENANCE_INTERVAL_SECONDS}s priority=${ALTERED_MAPPER_SYNC_PRIORITY_INTERVAL_SECONDS}s batch=${ALTERED_MAPPER_SYNC_BATCH_SIZE}/${ALTERED_MAPPER_SYNC_PRIORITY_BATCH_SIZE} topLimit=${ALTERED_MAPPER_SYNC_PRIORITY_TOP_LIMIT}`
  );
  console.log(
    `ALTERED_OPS monitor=${ALTERED_OPS_MONITOR_ENABLED ? "enabled" : "disabled"} tick=${ALTERED_OPS_MONITOR_TICK_SECONDS}s maxMapsPerRun=${ALTERED_OPS_MONITOR_MAX_MAPS_PER_RUN}`
  );
  if (UBI_OAUTH_ENABLED && !authStatus.enabled) {
    console.warn(
      ALTERED_OAUTH_FALLBACK_LOCAL_ONLY
        ? "UBI_OAUTH_ENABLED=1 but OAuth is incomplete. Local fallback mode enabled; all other admin access blocked."
        : "UBI_OAUTH_ENABLED=1 but OAuth is incomplete. Admin access is blocked."
    );
  }
  if (ALTERED_LIVE_MONITOR_ENABLED) {
    alteredService.startLiveMonitor();
  }
  if (ALTERED_OPS_MONITOR_ENABLED) {
    opsService.startScheduler();
    opsService.runDueSchedules({ reason: "startup" }).catch((error) => {
      console.warn(`[altered-ops] startup run failed: ${error?.message || error}`);
    });
  }
  if (ALTERED_MAPPER_SYNC_SCHEDULER_ENABLED) {
    alteredService.startMapperNameSyncScheduler().catch((error) => {
      console.warn(`[altered-mapper-sync] failed to start scheduler: ${error?.message || error}`);
    });
  }
  setInterval(() => {
    ubisoftAuth.cleanupExpired();
  }, 60 * 1000).unref();
});

process.on("SIGINT", () => {
  alteredService.stopLiveMonitor();
  alteredService.stopMapperNameSyncScheduler().catch(() => {});
  opsService.stopScheduler();
  process.exit(0);
});

process.on("SIGTERM", () => {
  alteredService.stopLiveMonitor();
  alteredService.stopMapperNameSyncScheduler().catch(() => {});
  opsService.stopScheduler();
  process.exit(0);
});
