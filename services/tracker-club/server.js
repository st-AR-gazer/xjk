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
  TRACKER_CLUB_AGGREGATOR_BASE_URL,
  TRACKER_CLUB_AGGREGATOR_TOKEN,
  TRACKER_CLUB_ENABLED,
  TRACKER_CLUB_PROJECT_KEY,
  TRACKER_CLUB_PROJECT_NAME,
  TRACKER_CLUB_REQUEST_TIMEOUT_MS,
  TRACKER_CLUB_SOURCE_LABEL,
} from "./src/config.js";
import { ClubTrackerService } from "./src/services/clubTrackerService.js";

function createClubTrackerService(options = {}) {
  return new ClubTrackerService({
    enabled: TRACKER_CLUB_ENABLED,
    aggregatorBaseUrl: TRACKER_CLUB_AGGREGATOR_BASE_URL,
    aggregatorToken: TRACKER_CLUB_AGGREGATOR_TOKEN,
    projectKey: TRACKER_CLUB_PROJECT_KEY,
    projectName: TRACKER_CLUB_PROJECT_NAME,
    sourceLabel: TRACKER_CLUB_SOURCE_LABEL,
    requestTimeoutMs: TRACKER_CLUB_REQUEST_TIMEOUT_MS,
    ...options,
  });
}

function createClubTrackerApp({ trackerService, frontendDir = FRONTEND_DIR } = {}) {
  const app = express();
  installTrackerHttpFoundation({
    app,
    express,
    helmet,
    cors,
    morgan,
    jsonLimit: "20mb",
    reportTraffic: (sample) => trackerService.reportTraffic(sample),
  });
  mountTrackerStatusRoutes(app, () => trackerService.getStatus());

  app.post("/api/v1/config", (req, res) => {
    const body = req.body || {};
    return res.json(
      trackerService.setConfig({
        enabled: body.enabled,
      })
    );
  });

  app.post("/api/v1/snapshot/ingest", async (req, res) => {
    const result = await trackerService.ingestSnapshot(req.body || {});
    if (result?.error) return res.status(400).json(result);
    return res.json(result);
  });

  mountTrackerFrontend({ app, express, frontendDir });
  mountTrackerErrorHandler(app);
  return app;
}

function createClubTrackerRuntime({ trackerService, serviceOptions, frontendDir = FRONTEND_DIR } = {}) {
  const service = trackerService || createClubTrackerService(serviceOptions);
  return {
    app: createClubTrackerApp({ trackerService: service, frontendDir }),
    service,
  };
}

function startClubTrackerServer({ runtime = defaultRuntime, port = PORT, host = "127.0.0.1", logger = console } = {}) {
  return startTrackerHttpServer({
    app: runtime.app,
    port,
    host,
    logger,
    onListening() {
      logger.log(`Tracker club listening on http://${host}:${port}`);
      logger.log(`FRONTEND_DIR=${FRONTEND_DIR}`);
      logger.log(`AGGREGATOR_BASE_URL=${TRACKER_CLUB_AGGREGATOR_BASE_URL}`);
      logger.log(`TRACKER_CLUB_ENABLED=${TRACKER_CLUB_ENABLED}`);
    },
  });
}

const defaultRuntime = createClubTrackerRuntime();
const { app, service } = defaultRuntime;

if (isDirectRun(import.meta.url)) {
  startClubTrackerServer();
}

export {
  app,
  createClubTrackerApp,
  createClubTrackerRuntime,
  createClubTrackerService,
  service,
  startClubTrackerServer,
};
