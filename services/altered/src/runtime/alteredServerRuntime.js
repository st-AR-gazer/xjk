import { UbisoftAuth } from "../auth/ubisoftAuth.js";
import {
  ALTERED_ALTERATION_GROUPS_FILE,
  ALTERED_MAP_COPY_BACKFILL_BATCH_SIZE,
  ALTERED_MAP_COPY_BACKFILL_ENABLED,
  ALTERED_MAP_COPY_MAX_CONCURRENT_DOWNLOADS,
  ALTERED_MAP_COPY_REQUEST_TIMEOUT_MS,
  ALTERED_OPS_MONITOR_ENABLED,
  ALTERED_OPS_MONITOR_MAX_MAPS_PER_RUN,
  ALTERED_OPS_MONITOR_TICK_SECONDS,
  ALTERED_WR_WEBHOOK_SECRET,
  DATA_DIR,
  DB_FILE,
  FRONTEND_DIR,
  PORT,
} from "../config.js";
import { startEventLoopLagMonitor } from "../ops/eventLoopLag.js";
import { acquireInstanceLock } from "../ops/instanceLock.js";
import { OpsRepository } from "../repositories/opsRepository.js";
import { OpsAutomationService } from "../services/opsAutomationService.js";
import { XjkAuthStore } from "../../../shared/xjkAuth.js";
import { createAdminAuth } from "../http/adminAuth.js";
import { createAlteredApp } from "../http/createAlteredApp.js";
import { createAlteredAuthConfig } from "./alteredAuthConfig.js";
import { createAlteredLifecycle } from "./alteredLifecycle.js";
import { createAlteredServiceRuntime } from "./alteredRuntimeFactory.js";

function acquireAlteredInstanceLock({ logger }) {
  const disabled = String(process.env.ALTERED_DISABLE_INSTANCE_LOCK || "").trim() === "1";
  if (disabled) return;

  try {
    acquireInstanceLock({
      lockPath: `${DB_FILE}.lock`,
      label: "altered-service",
      metadata: {
        port: PORT,
        dbFile: DB_FILE,
      },
    });
  } catch (error) {
    logger.error(`Failed to acquire Altered instance lock for DB ${DB_FILE}: ${error?.message || error}`);
    process.exit(1);
  }
}

function startAlteredEventLoopWatchdog({ logger }) {
  const disabled = String(process.env.ALTERED_EVENT_LOOP_WATCHDOG_DISABLED || "").trim() === "1";
  if (disabled) return;

  startEventLoopLagMonitor({
    label: "altered-service",
    intervalMs: Number(process.env.ALTERED_EVENT_LOOP_LAG_INTERVAL_MS || 1000),
    warnMs: Number(process.env.ALTERED_EVENT_LOOP_LAG_WARN_MS || 2000),
    fatalMs: Number(process.env.ALTERED_EVENT_LOOP_LAG_FATAL_MS || 30000),
    fatalConsecutive: Number(process.env.ALTERED_EVENT_LOOP_LAG_FATAL_CONSECUTIVE || 1),
    warmupMs: Number(process.env.ALTERED_EVENT_LOOP_LAG_WARMUP_MS || 60000),
    logger,
  });
}

function createUbisoftAuth({ repository, authConfig, logger }) {
  return new UbisoftAuth({
    enabled: authConfig.UBI_OAUTH_ENABLED,
    clientId: authConfig.UBI_OAUTH_CLIENT_ID,
    clientSecret: authConfig.UBI_OAUTH_CLIENT_SECRET,
    authorizeUrl: authConfig.UBI_OAUTH_AUTHORIZE_URL,
    tokenUrl: authConfig.UBI_OAUTH_TOKEN_URL,
    userInfoUrl: authConfig.UBI_OAUTH_USERINFO_URL,
    scope: authConfig.UBI_OAUTH_SCOPE,
    callbackPath: authConfig.UBI_OAUTH_CALLBACK_PATH,
    allowedSubjects: authConfig.UBI_OAUTH_ALLOWED_SUBJECTS,
    allowedUsernames: authConfig.UBI_OAUTH_ALLOWED_USERNAMES,
    sessionCookieName: authConfig.ALTERED_SESSION_COOKIE_NAME,
    sessionTtlSeconds: authConfig.ALTERED_SESSION_TTL_SECONDS,
    oauthStateTtlSeconds: authConfig.ALTERED_OAUTH_STATE_TTL_SECONDS,
    allowlistResolver: ({ subject, username, profile }) =>
      repository.admin.isUbisoftAdminAllowed({
        subject,
        username,
        profile,
      }),
    sessionStore: {
      getSessionRecordByToken: (token) => repository.admin.getAdminSessionByToken(token),
      upsertSession: ({ token, record }) =>
        repository.admin.upsertAdminSession({
          token,
          record,
        }),
      deleteSessionByToken: (token) => repository.admin.deleteAdminSessionByToken(token),
      deleteExpiredSessions: ({ beforeMs } = {}) =>
        repository.admin.deleteExpiredAdminSessions({
          beforeMs,
        }),
    },
    logger,
  });
}

function createAlteredServerRuntime({ logger = console } = {}) {
  acquireAlteredInstanceLock({ logger });

  const serviceRuntime = createAlteredServiceRuntime({
    databaseOptions: {
      filePath: DB_FILE,
      busyTimeoutMs: Number(process.env.ALTERED_DB_BUSY_TIMEOUT_MS || 2000),
    },
    mapCopyConfig: {
      dataDir: DATA_DIR,
      enabled: ALTERED_MAP_COPY_BACKFILL_ENABLED,
      batchSize: ALTERED_MAP_COPY_BACKFILL_BATCH_SIZE,
      maxConcurrentDownloads: ALTERED_MAP_COPY_MAX_CONCURRENT_DOWNLOADS,
      requestTimeoutMs: ALTERED_MAP_COPY_REQUEST_TIMEOUT_MS,
    },
    alterationGroupingConfig: {
      filePath: ALTERED_ALTERATION_GROUPS_FILE,
    },
    logger,
  });
  const { db, repository, trackerClient, alteredService } = serviceRuntime;
  const opsRepository = new OpsRepository(db);
  const authConfig = createAlteredAuthConfig();
  const allowlistBootstrap = repository.admin.seedAdminAllowlistFromConfig({
    subjects: authConfig.UBI_OAUTH_ALLOWED_SUBJECTS,
    usernames: authConfig.UBI_OAUTH_ALLOWED_USERNAMES,
  });
  const opsService = new OpsAutomationService({
    repository: opsRepository,
    trackerClient,
    monitorConfig: {
      enabled: ALTERED_OPS_MONITOR_ENABLED,
      tickSeconds: ALTERED_OPS_MONITOR_TICK_SECONDS,
      maxMapsPerRun: ALTERED_OPS_MONITOR_MAX_MAPS_PER_RUN,
    },
    logger,
  });

  startAlteredEventLoopWatchdog({ logger });

  const ubisoftAuth = createUbisoftAuth({ repository, authConfig, logger });
  const sharedAuthStore = authConfig.XJK_SHARED_AUTH_ENABLED
    ? new XjkAuthStore({
        dbFile: authConfig.XJK_SHARED_AUTH_DB_FILE,
        sessionCookieName: authConfig.XJK_SHARED_AUTH_SESSION_COOKIE_NAME,
      })
    : null;
  const auth = createAdminAuth({
    repository,
    ubisoftAuth,
    sharedAuthStore,
    config: authConfig,
  });
  const app = createAlteredApp({
    repository,
    alteredService,
    opsService,
    auth,
    ubisoftAuth,
    sharedAuthStore,
    frontendDir: FRONTEND_DIR,
    wrWebhookSecret: ALTERED_WR_WEBHOOK_SECRET,
    authConfig,
    logger,
  });
  const lifecycle = createAlteredLifecycle({
    app,
    repository,
    alteredService,
    opsService,
    ubisoftAuth,
    allowlistBootstrap,
    logger,
  });

  return {
    ...serviceRuntime,
    opsRepository,
    opsService,
    authConfig,
    allowlistBootstrap,
    ubisoftAuth,
    sharedAuthStore,
    auth,
    app,
    ...lifecycle,
  };
}

export { createAlteredServerRuntime };
