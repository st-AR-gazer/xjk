function createSettingsRepository({ auth, config, directory, displayNames }) {
  const { getSetting } = auth;
  const { directoryState, getDirectoryIdentity } = directory;
  const { aggregatorClient, trackerDisplaynameClient } = displayNames;

  function buildReadiness() {
    const operatorSession = getSetting("operator_session", null);
    const serviceIdentity = getSetting("service_identity", null);
    const operatorReady = Boolean(
      (config.serviceLogin && config.servicePassword) ||
        (config.operatorAccessToken && config.operatorRefreshToken) ||
        operatorSession?.refreshToken ||
        operatorSession?.accessToken
    );
    const directoryIdentity = getDirectoryIdentity();
    return {
      operatorReady,
      operatorMessage: operatorReady
        ? config.serviceLogin && config.servicePassword
          ? `Service-account auth is armed for club ${config.clubId}.`
          : `Club writes are armed for club ${config.clubId}.`
        : "Log in once with the operator account or provide service-account credentials so the bridge can create and edit club rooms.",
      directoryReady: directoryState.ready || Boolean(directoryIdentity || serviceIdentity),
      directoryMessage: directoryState.ready
        ? "Public room discovery is connected to Bingo."
        : directoryIdentity || serviceIdentity
          ? "Public room discovery is configured and waiting to connect."
          : "Provide a directory identity, log in once, or let the service account bootstrap identity so the bridge can mirror public rooms.",
      bingoPatchReady: Boolean(config.bingoAuthSecret || config.bingoAllowDevKeyExchange),
      bingoPatchMessage: config.bingoAuthSecret
        ? "Bridge-signed Bingo auth keys are enabled."
        : config.bingoAllowDevKeyExchange
          ? "Dev-mode Bingo key exchange fallback is enabled."
          : "Set BINGO_BRIDGE_BINGO_AUTH_SECRET to match the external Bingo auth patch, or enable the explicit dev fallback.",
      displayNameReady: Boolean(aggregatorClient.isConfigured() || trackerDisplaynameClient.isConfigured()),
      displayNameMessage: aggregatorClient.isConfigured()
        ? trackerDisplaynameClient.isConfigured()
          ? "Shared xjk displayname flow is armed: aggregator-first with tracker-displayname fallback."
          : "Shared xjk displayname flow is armed against aggregator."
        : trackerDisplaynameClient.isConfigured()
          ? "Displayname relay is configured, but aggregator is missing."
          : "Configure AGGREGATOR_BASE_URL and optionally TRACKER_DISPLAYNAME_BASE_URL to enable the shared xjk displayname flow.",
      clubId: config.clubId,
    };
  }

  return { buildReadiness };
}

export { createSettingsRepository };
