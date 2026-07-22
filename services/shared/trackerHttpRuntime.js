import path from "node:path";
import { pathToFileURL } from "node:url";

const TRACKER_STATUS_PATHS = [
  "/status",
  "/tracker/status",
  "/api/status",
  "/api/tracker/status",
  "/api/v1/status",
  "/api/v1/tracker/status",
];

function createIncomingTrafficMiddleware(reportTraffic) {
  return (req, res, next) => {
    const startedAt = Date.now();
    const requestBytes = Number(req.headers["content-length"] || 0) || 0;
    res.on("finish", () => {
      reportTraffic?.({
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
  };
}

function installTrackerHttpFoundation({ app, express, helmet, cors, morgan, jsonLimit, reportTraffic }) {
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
  app.use(express.json({ limit: jsonLimit }));
  app.use(createIncomingTrafficMiddleware(reportTraffic));
  app.get("/health", (_req, res) => {
    res.type("text").send("ok");
  });
  return app;
}

function mountTrackerStatusRoutes(app, getStatus, paths = TRACKER_STATUS_PATHS) {
  app.get(paths, (_req, res) => res.json(getStatus()));
}

function mountTrackerFrontend({ app, express, frontendDir, indexPaths = ["/"] }) {
  app.use(express.static(frontendDir));
  app.get(indexPaths, (_req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
  });
}

function mountTrackerErrorHandler(app, { logger = console } = {}) {
  app.use((error, _req, res, _next) => {
    if (error) logger.error("Unexpected server error:", error);
    return res.status(500).json({ error: "Unexpected server error." });
  });
}

function startTrackerHttpServer({ app, port, host = "127.0.0.1", onListening, logger = console }) {
  return app.listen(port, host, () => {
    Promise.resolve(onListening?.()).catch((error) => {
      logger.error(`Tracker startup hook failed: ${error?.message || error}`);
    });
  });
}

function isDirectRun(moduleUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;
  return pathToFileURL(path.resolve(argvPath)).href === moduleUrl;
}

export {
  TRACKER_STATUS_PATHS,
  createIncomingTrafficMiddleware,
  installTrackerHttpFoundation,
  isDirectRun,
  mountTrackerErrorHandler,
  mountTrackerFrontend,
  mountTrackerStatusRoutes,
  startTrackerHttpServer,
};
