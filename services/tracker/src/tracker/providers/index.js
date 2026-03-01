import { NoopTrackerProvider } from "./noopProvider.js";
import { NadeoLiveTrackerProvider } from "./nadeoLiveProvider.js";

function createTrackerProvider({
  providerName,
  authMode,
  dediLogin,
  dediPassword,
  accessToken,
  refreshToken,
  tokenCacheFile,
  userAgent,
  requestTimeoutMs,
  minRequestGapMs,
  groupUid,
  onlyWorld,
  logger = console,
}) {
  const name = String(providerName || "noop").trim().toLowerCase();
  if (name === "nadeo-live" || name === "live" || name === "nadeo") {
    const provider = new NadeoLiveTrackerProvider({
      authMode,
      dediLogin,
      dediPassword,
      accessToken,
      refreshToken,
      tokenCacheFile,
      userAgent,
      requestTimeoutMs,
      minRequestGapMs,
      groupUid,
      onlyWorld,
      logger,
    });
    if (!provider.isReady) {
      logger.warn(
        '[tracker] TRACKER_PROVIDER is "nadeo-live" but auth is not configured. ' +
          "Set dedicated login/password or live access/refresh tokens."
      );
    }
    return provider;
  }

  if (name !== "noop") {
    logger.warn(`Unknown TRACKER_PROVIDER="${name}". Falling back to noop provider.`);
  }
  return new NoopTrackerProvider();
}

export { createTrackerProvider };
