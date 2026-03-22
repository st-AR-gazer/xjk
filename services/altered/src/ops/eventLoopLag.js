function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function startEventLoopLagMonitor({
  label = "event-loop",
  intervalMs = 1000,
  warnMs = 2000,
  fatalMs = 30000,
  fatalConsecutive = 1,
  warmupMs = 60000,
  logger = console,
  onFatal = null,
} = {}) {
  const safeIntervalMs = clampInt(intervalMs, { min: 250, max: 60000, fallback: 1000 });
  const safeWarnMs = clampInt(warnMs, { min: 0, max: 10 * 60 * 1000, fallback: 2000 });
  const safeFatalMs = clampInt(fatalMs, { min: safeWarnMs, max: 60 * 60 * 1000, fallback: 30000 });
  const safeFatalConsecutive = clampInt(fatalConsecutive, { min: 1, max: 20, fallback: 1 });
  const safeWarmupMs = clampInt(warmupMs, { min: 0, max: 60 * 60 * 1000, fallback: 60000 });

  let expectedAtMs = Date.now() + safeIntervalMs;
  const startedAtMs = Date.now();
  let consecutiveFatal = 0;
  let maxLagMs = 0;

  const timer = setInterval(() => {
    const nowMs = Date.now();
    const lagMs = Math.max(0, nowMs - expectedAtMs);
    expectedAtMs = nowMs + safeIntervalMs;
    if (lagMs > maxLagMs) maxLagMs = lagMs;

    if (safeWarmupMs > 0 && nowMs - startedAtMs < safeWarmupMs) {
      consecutiveFatal = 0;
      return;
    }

    if (lagMs >= safeFatalMs) {
      consecutiveFatal += 1;
    } else {
      consecutiveFatal = 0;
    }

    if (safeWarnMs > 0 && lagMs >= safeWarnMs) {
      logger.warn(
        `[${label}] event-loop lag ${lagMs}ms (warn>=${safeWarnMs}ms fatal>=${safeFatalMs}ms consecutiveFatal=${consecutiveFatal})`
      );
    }

    if (consecutiveFatal >= safeFatalConsecutive) {
      const message = `[${label}] event-loop lag ${lagMs}ms exceeded fatal threshold; exiting to allow a restart (maxLag=${maxLagMs}ms).`;
      logger.error(message);
      if (typeof onFatal === "function") {
        try {
          onFatal({ lagMs, maxLagMs, message });
        } catch {
          // fall through
        }
      }
      process.exit(1);
    }
  }, safeIntervalMs);
  timer.unref?.();

  return {
    stop() {
      clearInterval(timer);
    },
  };
}

export { startEventLoopLagMonitor };
