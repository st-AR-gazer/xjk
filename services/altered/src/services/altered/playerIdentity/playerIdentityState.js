import {
  DEFAULT_MAPPER_BOOTSTRAP_INTERVAL_SECONDS,
  DEFAULT_MAPPER_MAINTENANCE_INTERVAL_SECONDS,
  DEFAULT_MAPPER_PRIORITY_INTERVAL_SECONDS,
  DEFAULT_MAPPER_SYNC_BATCH_SIZE,
  DEFAULT_MAPPER_PRIORITY_BATCH_SIZE,
  DEFAULT_MAPPER_PRIORITY_TOP_LIMIT,
  DEFAULT_MAPPER_PRIORITY_REFRESH_SECONDS,
  DEFAULT_MAPPER_REQUEST_GAP_MS,
  DISPLAY_NAME_CACHE_TTL_SECONDS,
  DEFAULT_MAPPER_CACHE_TTL_SECONDS,
  DEFAULT_MAPPER_PRIORITY_CACHE_TTL_SECONDS,
  DEFAULT_MAPPER_KNOWN_ACCOUNTS_REFRESH_SECONDS,
  VIEW_PRIORITY_ACCOUNT_TTL_MS,
  VIEW_PRIORITY_RELAY_KICKOFF_COOLDOWN_MS,
  clampInt,
} from "../serviceSupport.js";

function createPlayerIdentityState({ trackerIntegrations = {}, mapperNameSyncConfig = {} } = {}) {
  const trackerIntegrationState = {
    displaynameEnabled:
      trackerIntegrations.displaynameEnabled === undefined ? true : Boolean(trackerIntegrations.displaynameEnabled),
    displaynameFallbackLocal:
      trackerIntegrations.displaynameFallbackLocal === undefined
        ? true
        : Boolean(trackerIntegrations.displaynameFallbackLocal),
    displaynameRelayAvailable: true,
    clubEnabled: trackerIntegrations.clubEnabled === undefined ? true : Boolean(trackerIntegrations.clubEnabled),
    clubFallbackLocal:
      trackerIntegrations.clubFallbackLocal === undefined ? true : Boolean(trackerIntegrations.clubFallbackLocal),
    clubRelayAvailable: true,
    lastDisplaynameRelay: null,
    lastDisplaynameRelayError: null,
    lastClubRelay: null,
    lastClubRelayError: null,
  };

  const mapperNameSync = {
    enabled: mapperNameSyncConfig.enabled === undefined ? true : Boolean(mapperNameSyncConfig.enabled),
    bootstrapIntervalSeconds: clampInt(mapperNameSyncConfig.bootstrapIntervalSeconds, {
      min: 60,
      max: 86400,
      fallback: DEFAULT_MAPPER_BOOTSTRAP_INTERVAL_SECONDS,
    }),
    maintenanceIntervalSeconds: clampInt(mapperNameSyncConfig.maintenanceIntervalSeconds, {
      min: 60,
      max: 86400,
      fallback: DEFAULT_MAPPER_MAINTENANCE_INTERVAL_SECONDS,
    }),
    priorityIntervalSeconds: clampInt(mapperNameSyncConfig.priorityIntervalSeconds, {
      min: 60,
      max: 86400,
      fallback: DEFAULT_MAPPER_PRIORITY_INTERVAL_SECONDS,
    }),
    batchSize: clampInt(mapperNameSyncConfig.batchSize, {
      min: 1,
      max: 50,
      fallback: DEFAULT_MAPPER_SYNC_BATCH_SIZE,
    }),
    priorityBatchSize: clampInt(mapperNameSyncConfig.priorityBatchSize, {
      min: 1,
      max: 50,
      fallback: DEFAULT_MAPPER_PRIORITY_BATCH_SIZE,
    }),
    priorityTopLimit: clampInt(mapperNameSyncConfig.priorityTopLimit, {
      min: 1,
      max: 2000,
      fallback: DEFAULT_MAPPER_PRIORITY_TOP_LIMIT,
    }),
    priorityRefreshSeconds: clampInt(mapperNameSyncConfig.priorityRefreshSeconds, {
      min: 30,
      max: 86400,
      fallback: DEFAULT_MAPPER_PRIORITY_REFRESH_SECONDS,
    }),
    cacheTtlSeconds: clampInt(mapperNameSyncConfig.cacheTtlSeconds, {
      min: 0,
      max: 30 * 24 * 60 * 60,
      fallback: DEFAULT_MAPPER_CACHE_TTL_SECONDS,
    }),
    priorityCacheTtlSeconds: clampInt(mapperNameSyncConfig.priorityCacheTtlSeconds, {
      min: 0,
      max: 30 * 24 * 60 * 60,
      fallback: DEFAULT_MAPPER_PRIORITY_CACHE_TTL_SECONDS,
    }),
    minRequestGapMs: clampInt(mapperNameSyncConfig.minRequestGapMs, {
      min: DEFAULT_MAPPER_REQUEST_GAP_MS,
      max: 120000,
      fallback: DEFAULT_MAPPER_REQUEST_GAP_MS,
    }),
    mode: "bootstrap",
    timer: null,
    priorityTimer: null,
    nextRunAt: null,
    nextPriorityRunAt: null,
    running: false,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastError: null,
    lastSummary: null,
    nextLookupAllowedAtMs: 0,
    knownAccountsRefreshedAtMs: 0,
    knownAccountsRefreshSeconds: clampInt(mapperNameSyncConfig.knownAccountsRefreshSeconds, {
      min: 60,
      max: 86400,
      fallback: DEFAULT_MAPPER_KNOWN_ACCOUNTS_REFRESH_SECONDS,
    }),
    priorityAccountsRefreshedAtMs: 0,
    priorityAccountIds: [],
    viewedPriorityAccountIds: [],
    viewedPriorityQueuedAtMsByAccountId: new Map(),
    viewedPriorityCooldownMs: VIEW_PRIORITY_ACCOUNT_TTL_MS,
    viewedPriorityRelayKickoffCooldownMs: VIEW_PRIORITY_RELAY_KICKOFF_COOLDOWN_MS,
    viewedPriorityLocalKickoffCooldownMs: VIEW_PRIORITY_RELAY_KICKOFF_COOLDOWN_MS,
    lastViewedPriorityRelayKickoffAtMs: 0,
    lastViewedPriorityLocalKickoffAtMs: 0,
    runCounter: 0,
  };

  return {
    trackerIntegrations: trackerIntegrationState,
    mapperNameSync,
    playerNamesCache: new Map(),
    playerNamesCacheTtlMs: DISPLAY_NAME_CACHE_TTL_SECONDS * 1000,
  };
}

export { createPlayerIdentityState };
