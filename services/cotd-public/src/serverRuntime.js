function startCotdScheduler(workflow, { logger = console, settings } = {}) {
  const { TOTD_FETCH_ENABLED, TOTD_FETCH_INTERVAL_MS, TOTD_FETCH_ON_START } = settings;
  if (!TOTD_FETCH_ENABLED) return null;
  const runScheduledFetch = () => {
    workflow.runFetch({ reason: "scheduler" }).catch((error) => {
      logger.warn("[cotd-public] scheduled TOTD fetch failed:", error?.message || error);
    });
  };
  const interval = setInterval(runScheduledFetch, TOTD_FETCH_INTERVAL_MS);
  interval.unref?.();
  const startupTimer = TOTD_FETCH_ON_START ? setTimeout(runScheduledFetch, 1000) : null;
  startupTimer?.unref?.();
  return {
    stop() {
      clearInterval(interval);
      if (startupTimer) clearTimeout(startupTimer);
    },
  };
}

function startCotdServer({ app, runtime, settings, workflow, port = settings.PORT, logger = console } = {}) {
  const {
    CLASSIFIER_BASE_URL,
    DB_FILE,
    FRONTEND_DIR,
    MAP_FILES_DIR,
    NADEO_USER_AGENT,
    TOTD_FETCH_ENABLED,
    TOTD_SOURCE_URL,
  } = settings;
  let scheduler = null;
  const server = app.listen(port, "127.0.0.1", () => {
    logger.log(`COTD public service listening on http://127.0.0.1:${port}`);
    logger.log(`FRONTEND_DIR=${FRONTEND_DIR}`);
    logger.log(`DB_FILE=${DB_FILE}`);
    logger.log(`MAP_FILES_DIR=${MAP_FILES_DIR}`);
    logger.log(`COTD_CLASSIFIER_BASE_URL=${CLASSIFIER_BASE_URL || "(not configured)"}`);
    logger.log(`COTD_TOTD_SOURCE_URL=${TOTD_SOURCE_URL || "(not configured)"}`);
    logger.log(`COTD_NADEO_CONFIGURED=${runtime.nadeoClient.isConfigured() ? "1" : "0"}`);
    logger.log(`COTD_NADEO_USER_AGENT=${NADEO_USER_AGENT}`);
    logger.log(`COTD_TOTD_FETCH_ENABLED=${TOTD_FETCH_ENABLED ? "1" : "0"}`);
    scheduler = startCotdScheduler(workflow, { logger, settings });
  });
  server.once("close", () => scheduler?.stop());
  return server;
}

export { startCotdScheduler, startCotdServer };
