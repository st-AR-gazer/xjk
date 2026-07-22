import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupUploadedFiles } from "./uploads.js";

const DEFAULT_RATE_WINDOW_MS = 5 * 60 * 1000;

export function configureFrontendToolApp({ app, express, helmet, morgan, frontendDir, jsonLimit, trustProxy }) {
  app.disable("x-powered-by");
  if (trustProxy !== undefined) app.set("trust proxy", trustProxy);

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(morgan("combined"));
  if (jsonLimit) app.use(express.json({ limit: jsonLimit }));
  app.use(express.static(frontendDir));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
  });
  app.get("/health", (_req, res) => {
    res.type("text").send("ok");
  });

  return app;
}

export function createRateLimiter({ rateLimit, limit = 60, windowMs = DEFAULT_RATE_WINDOW_MS }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

export function installApiRateLimit({ app, rateLimit, limit, windowMs }) {
  app.use("/api/", createRateLimiter({ rateLimit, limit, windowMs }));
}

export function createUploadErrorHandler({
  multer,
  maxFileMb,
  fileTooLargeMessage = `File too large. Max ${maxFileMb} MB per file.`,
  entityTooLargeMessage,
}) {
  return async (error, req, res, _next) => {
    await cleanupUploadedFiles(req);
    if (entityTooLargeMessage && error?.type === "entity.too.large") {
      return res.status(413).json({ error: entityTooLargeMessage });
    }

    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      const message = tooLarge ? fileTooLargeMessage : error.message;
      return res.status(tooLarge ? 413 : 400).json({ error: message });
    }

    if (error) {
      return res.status(400).json({ error: error.message || "Invalid request." });
    }

    return res.status(500).json({ error: "Unexpected server error." });
  };
}

export function createUnexpectedErrorHandler({
  logger = console,
  errorMessage = "Unexpected server error.",
  missingErrorMessage = "Unknown server error.",
} = {}) {
  return (error, _req, res, _next) => {
    if (error) {
      logger.error("Unexpected server error:", error);
      return res.status(500).json({ error: errorMessage });
    }

    return res.status(500).json({ error: missingErrorMessage });
  };
}

export function startToolServer({ app, port, message, details = [], logger = console }) {
  return app.listen(port, "127.0.0.1", () => {
    logger.log(message || `Backend listening on http://127.0.0.1:${port}`);
    for (const detail of details) logger.log(detail);
  });
}

export function isMainModule(metaUrl, argv = process.argv) {
  return Boolean(argv[1]) && path.resolve(argv[1]) === path.resolve(fileURLToPath(metaUrl));
}

export function startToolServerIfMain(metaUrl, options, argv = process.argv) {
  return isMainModule(metaUrl, argv) ? startToolServer(options) : undefined;
}
