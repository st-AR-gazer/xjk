import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import {
  installTrackerHttpFoundation,
  isDirectRun,
  mountTrackerErrorHandler,
  mountTrackerFrontend,
  mountTrackerStatusRoutes,
  startTrackerHttpServer,
} from "../shared/trackerHttpRuntime.js";
import {
  FRONTEND_DIR,
  PORT,
  TRACKER_DISPLAYNAME_AGGREGATOR_BASE_URL,
  TRACKER_DISPLAYNAME_AGGREGATOR_TOKEN,
  TRACKER_DISPLAYNAME_API_BASE_URL,
  TRACKER_DISPLAYNAME_BATCH_SIZE,
  TRACKER_DISPLAYNAME_ENABLED,
  TRACKER_DISPLAYNAME_MAINTENANCE_INTERVAL_SECONDS,
  TRACKER_DISPLAYNAME_MAX_ACCOUNTS_PER_CYCLE,
  TRACKER_DISPLAYNAME_MIN_REQUEST_GAP_MS,
  TRACKER_DISPLAYNAME_PROJECT_KEY,
  TRACKER_DISPLAYNAME_PROJECT_NAME,
  TRACKER_DISPLAYNAME_REQUEST_TIMEOUT_MS,
  TRACKER_DISPLAYNAME_SCHEDULER_ENABLED,
  TRACKER_DISPLAYNAME_SCOPE,
  TRACKER_DISPLAYNAME_SOURCE_LABEL,
  TRACKER_DISPLAYNAME_STALE_AFTER_SECONDS,
  TRACKER_DISPLAYNAME_USER_AGENT,
  UBI_OAUTH_CLIENT_ID,
  UBI_OAUTH_CLIENT_SECRET,
  UBI_OAUTH_TOKEN_URL,
} from "./src/config.js";
import { DisplayNameTrackerService, uniqueAccountIds } from "./src/services/displayNameTrackerService.js";
import { TrackmaniaOAuthClient } from "./src/services/trackmaniaOAuthClient.js";

function createDisplayNameTrackerService({ oauthClient, oauthOptions = {}, serviceOptions = {} } = {}) {
  let trackerService = null;
  const resolvedOauthClient =
    oauthClient ||
    new TrackmaniaOAuthClient({
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
        trackerService?.reportTraffic({
          service: "tracker-displayname",
          ...sample,
        });
      },
      logger: console,
      ...oauthOptions,
    });

  trackerService = new DisplayNameTrackerService({
    oauthClient: resolvedOauthClient,
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
    ...serviceOptions,
  });
  return trackerService;
}

function createDisplayNameTrackerApp({ trackerService, frontendDir = FRONTEND_DIR } = {}) {
  const app = express();
  installTrackerHttpFoundation({
    app,
    express,
    helmet,
    cors,
    morgan,
    jsonLimit: "1mb",
    reportTraffic: (sample) => trackerService.reportTraffic(sample),
  });
  mountTrackerStatusRoutes(app, () => trackerService.getStatus());

  app.post("/api/v1/accounts/enqueue", (req, res) => {
    const accountIds = uniqueAccountIds(req.body?.accountIds || []);
    const front = Boolean(req.body?.front || req.body?.prioritize || req.body?.priority);
    const result = trackerService.enqueueAccountIds(accountIds, { front });
    return res.json({
      ...result,
      requested: accountIds.length,
    });
  });

  app.post(["/api/v1/display-names/resolve", "/api/v1/accounts/resolve"], async (req, res) => {
    const accountIds = uniqueAccountIds(req.body?.accountIds || req.body?.account_ids || []);
    const result = await trackerService.resolveAccountIds(accountIds, {
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
    const result = await trackerService.runSync({
      accountIds,
      reason: "manual-api",
      forceCandidates: Boolean(req.body?.forceCandidates),
      prioritizeAccountIds:
        req.body?.prioritizeAccountIds === undefined ? true : Boolean(req.body?.prioritizeAccountIds),
    });
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  app.post("/api/v1/config", (req, res) => {
    const payload = req.body || {};
    return res.json(
      trackerService.setConfig({
        enabled: payload.enabled,
        schedulerEnabled: payload.schedulerEnabled,
        maintenanceIntervalSeconds: payload.maintenanceIntervalSeconds,
        staleAfterSeconds: payload.staleAfterSeconds,
        batchSize: payload.batchSize,
        maxAccountsPerCycle: payload.maxAccountsPerCycle,
        minRequestGapMs: payload.minRequestGapMs,
      })
    );
  });

  mountTrackerFrontend({ app, express, frontendDir });
  mountTrackerErrorHandler(app);
  return app;
}

function createDisplayNameTrackerRuntime({ trackerService, serviceOptions, oauthOptions, frontendDir } = {}) {
  const service = trackerService || createDisplayNameTrackerService({ serviceOptions, oauthOptions });
  return {
    app: createDisplayNameTrackerApp({ trackerService: service, frontendDir }),
    service,
  };
}

function startDisplayNameTrackerServer({
  runtime = defaultRuntime,
  port = PORT,
  host = "127.0.0.1",
  logger = console,
} = {}) {
  return startTrackerHttpServer({
    app: runtime.app,
    port,
    host,
    logger,
    async onListening() {
      logger.log(`Tracker displayname listening on http://${host}:${port}`);
      logger.log(`FRONTEND_DIR=${FRONTEND_DIR}`);
      logger.log(`AGGREGATOR_BASE_URL=${TRACKER_DISPLAYNAME_AGGREGATOR_BASE_URL}`);
      logger.log(`TRACKER_DISPLAYNAME_ENABLED=${TRACKER_DISPLAYNAME_ENABLED}`);
      logger.log(`TRACKER_DISPLAYNAME_SCHEDULER_ENABLED=${TRACKER_DISPLAYNAME_SCHEDULER_ENABLED}`);
      logger.log(`UBI_OAUTH_CLIENT_ID=${UBI_OAUTH_CLIENT_ID ? "<set>" : "<not-set>"}`);
      await runtime.service.warmup();
    },
  });
}

const defaultRuntime = createDisplayNameTrackerRuntime();
const { app, service } = defaultRuntime;

if (isDirectRun(import.meta.url)) {
  startDisplayNameTrackerServer();
}

export {
  app,
  createDisplayNameTrackerApp,
  createDisplayNameTrackerRuntime,
  createDisplayNameTrackerService,
  service,
  startDisplayNameTrackerServer,
};
