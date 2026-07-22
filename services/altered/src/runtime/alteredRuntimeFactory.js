import { createDatabase } from "../db/index.js";
import { NadeoLiveClient } from "../live/nadeoLiveClient.js";
import { TrackmaniaOAuthClient } from "../live/trackmaniaOAuthClient.js";
import { AlteredRepository } from "../repositories/alteredRepository.js";
import { AlteredService } from "../services/alteredService.js";
import { AggregatorClient } from "../tracker/aggregatorClient.js";
import { TrackerClubClient } from "../tracker/trackerClubClient.js";
import { TrackerClient } from "../tracker/trackerClient.js";
import { TrackerDisplaynameClient } from "../tracker/trackerDisplaynameClient.js";
import {
  AGGREGATOR_BASE_URL,
  AGGREGATOR_TOKEN,
  ALTERED_LIVE_ACCESS_TOKEN,
  ALTERED_LIVE_ACTIVITY_ACTIVE_ONLY,
  ALTERED_LIVE_ACTIVITY_PAGE_SIZE,
  ALTERED_LIVE_API_BASE_URL,
  ALTERED_LIVE_AUTH_MODE,
  ALTERED_LIVE_CLUB_ID,
  ALTERED_LIVE_DEDI_LOGIN,
  ALTERED_LIVE_DEDI_PASSWORD,
  ALTERED_LIVE_DISCOVERY_ACTIVITY_PAGE_SIZE,
  ALTERED_LIVE_DISCOVERY_CAMPAIGN_LIMIT,
  ALTERED_LIVE_DISCOVERY_ENABLED,
  ALTERED_LIVE_DISCOVERY_INTERVAL_SECONDS,
  ALTERED_LIVE_FETCH_MAP_DETAILS,
  ALTERED_LIVE_MIN_REQUEST_GAP_MS,
  ALTERED_LIVE_MONITOR_DAILY_HOUR_UTC,
  ALTERED_LIVE_MONITOR_DAILY_MINUTE_UTC,
  ALTERED_LIVE_MONITOR_ENABLED,
  ALTERED_LIVE_MONITOR_INTERVAL_SECONDS,
  ALTERED_LIVE_MONITOR_SCHEDULE_MODE,
  ALTERED_LIVE_REFRESH_TOKEN,
  ALTERED_LIVE_REQUEST_TIMEOUT_MS,
  ALTERED_LIVE_USER_AGENT,
  ALTERED_MAPPER_NAME_TRACKING_API_BASE_URL,
  ALTERED_MAPPER_NAME_TRACKING_ENABLED,
  ALTERED_MAPPER_NAME_TRACKING_MIN_REQUEST_GAP_MS,
  ALTERED_MAPPER_NAME_TRACKING_REQUEST_TIMEOUT_MS,
  ALTERED_MAPPER_NAME_TRACKING_SCOPE,
  ALTERED_MAPPER_NAME_TRACKING_TOKEN_URL,
  ALTERED_MAPPER_NAME_TRACKING_USER_AGENT,
  ALTERED_MAPPER_SYNC_BATCH_SIZE,
  ALTERED_MAPPER_SYNC_BOOTSTRAP_INTERVAL_SECONDS,
  ALTERED_MAPPER_SYNC_CACHE_TTL_SECONDS,
  ALTERED_MAPPER_SYNC_KNOWN_ACCOUNTS_REFRESH_SECONDS,
  ALTERED_MAPPER_SYNC_MAINTENANCE_INTERVAL_SECONDS,
  ALTERED_MAPPER_SYNC_PRIORITY_BATCH_SIZE,
  ALTERED_MAPPER_SYNC_PRIORITY_CACHE_TTL_SECONDS,
  ALTERED_MAPPER_SYNC_PRIORITY_INTERVAL_SECONDS,
  ALTERED_MAPPER_SYNC_PRIORITY_REFRESH_SECONDS,
  ALTERED_MAPPER_SYNC_PRIORITY_TOP_LIMIT,
  ALTERED_MAPPER_SYNC_SCHEDULER_ENABLED,
  ALTERED_TRACKER_CLUB_ENABLED,
  ALTERED_TRACKER_CLUB_FALLBACK_LOCAL,
  ALTERED_TRACKER_DISPLAYNAME_ENABLED,
  ALTERED_TRACKER_DISPLAYNAME_FALLBACK_LOCAL,
  DATA_DIR,
  DB_FILE,
  TRACKER_ADMIN_BASE_URL,
  TRACKER_ADMIN_PASSWORD,
  TRACKER_ADMIN_TOKEN,
  TRACKER_ADMIN_USERNAME,
  TRACKER_CLUB_BASE_URL,
  TRACKER_DISPLAYNAME_BASE_URL,
  TRACKER_LEADERBOARD_ADMIN_BASE_URL,
  TRACKER_LEADERBOARD_ADMIN_PASSWORD,
  TRACKER_LEADERBOARD_ADMIN_TOKEN,
  TRACKER_LEADERBOARD_ADMIN_USERNAME,
  TRACKER_LEADERBOARD_PUBLIC_BASE_URL,
  TRACKER_PROXY_TIMEOUT_MS,
  TRACKER_PUBLIC_BASE_URL,
  UBI_OAUTH_CLIENT_ID,
  UBI_OAUTH_CLIENT_SECRET,
} from "../config.js";

const DEFAULT_PROJECT_CLUBS = [
  {
    hookKey: "altered-club",
    clubId: 24231,
    clubName: "Altered Nadeo",
    sourceLabel: "altered-monitor",
    enabled: true,
    autoTrackNewMaps: true,
  },
  {
    hookKey: "altered-nadeold",
    clubId: 127644,
    clubName: "Altered Nadeold",
    sourceLabel: "altered-nadeold",
    enabled: true,
    autoTrackNewMaps: true,
  },
  {
    hookKey: "altered-totd",
    clubId: 42245,
    clubName: "Altered TOTD",
    sourceLabel: "altered-totd",
    enabled: true,
    autoTrackNewMaps: true,
  },
];

const DEFAULT_IMPLEMENTATIONS = {
  createDatabase,
  AlteredRepository,
  TrackerClient,
  TrackerDisplaynameClient,
  TrackerClubClient,
  AggregatorClient,
  NadeoLiveClient,
  TrackmaniaOAuthClient,
  AlteredService,
};

function createAlteredServiceRuntime({
  databaseOptions = { filePath: DB_FILE },
  projectClubs = DEFAULT_PROJECT_CLUBS,
  mapCopyConfig = { dataDir: DATA_DIR, enabled: false },
  alterationGroupingConfig = {},
  logger = console,
  implementations = {},
} = {}) {
  const runtime = { ...DEFAULT_IMPLEMENTATIONS, ...implementations };
  const db = runtime.createDatabase(databaseOptions);
  const repository = new runtime.AlteredRepository(db);
  repository.configuration.ensureHookConfigs(projectClubs);

  const trackerClient = new runtime.TrackerClient({
    publicBaseUrl: TRACKER_PUBLIC_BASE_URL,
    adminBaseUrl: TRACKER_ADMIN_BASE_URL,
    adminToken: TRACKER_ADMIN_TOKEN,
    adminUsername: TRACKER_ADMIN_USERNAME,
    adminPassword: TRACKER_ADMIN_PASSWORD,
    timeoutMs: TRACKER_PROXY_TIMEOUT_MS,
    logger,
  });
  const trackerLeaderboardClient = new runtime.TrackerClient({
    publicBaseUrl: TRACKER_LEADERBOARD_PUBLIC_BASE_URL,
    adminBaseUrl: TRACKER_LEADERBOARD_ADMIN_BASE_URL,
    adminToken: TRACKER_LEADERBOARD_ADMIN_TOKEN,
    adminUsername: TRACKER_LEADERBOARD_ADMIN_USERNAME,
    adminPassword: TRACKER_LEADERBOARD_ADMIN_PASSWORD,
    timeoutMs: TRACKER_PROXY_TIMEOUT_MS,
    logger,
  });
  const liveClient = new runtime.NadeoLiveClient({
    authMode: ALTERED_LIVE_AUTH_MODE,
    dediLogin: ALTERED_LIVE_DEDI_LOGIN,
    dediPassword: ALTERED_LIVE_DEDI_PASSWORD,
    accessToken: ALTERED_LIVE_ACCESS_TOKEN,
    refreshToken: ALTERED_LIVE_REFRESH_TOKEN,
    userAgent: ALTERED_LIVE_USER_AGENT,
    requestTimeoutMs: ALTERED_LIVE_REQUEST_TIMEOUT_MS,
    minRequestGapMs: ALTERED_LIVE_MIN_REQUEST_GAP_MS,
    liveApiBaseUrl: ALTERED_LIVE_API_BASE_URL || undefined,
    logger,
  });
  const mapperNameClient = new runtime.TrackmaniaOAuthClient({
    enabled: ALTERED_MAPPER_NAME_TRACKING_ENABLED,
    clientId: UBI_OAUTH_CLIENT_ID,
    clientSecret: UBI_OAUTH_CLIENT_SECRET,
    tokenUrl: ALTERED_MAPPER_NAME_TRACKING_TOKEN_URL || undefined,
    apiBaseUrl: ALTERED_MAPPER_NAME_TRACKING_API_BASE_URL,
    scope: ALTERED_MAPPER_NAME_TRACKING_SCOPE,
    requestTimeoutMs: ALTERED_MAPPER_NAME_TRACKING_REQUEST_TIMEOUT_MS,
    minRequestGapMs: ALTERED_MAPPER_NAME_TRACKING_MIN_REQUEST_GAP_MS,
    userAgent: ALTERED_MAPPER_NAME_TRACKING_USER_AGENT,
    logger,
  });
  const trackerDisplaynameClient = new runtime.TrackerDisplaynameClient({
    baseUrl: TRACKER_DISPLAYNAME_BASE_URL,
    timeoutMs: TRACKER_PROXY_TIMEOUT_MS,
    logger,
  });
  const trackerClubClient = new runtime.TrackerClubClient({
    baseUrl: TRACKER_CLUB_BASE_URL,
    timeoutMs: TRACKER_PROXY_TIMEOUT_MS,
    logger,
  });
  const aggregatorClient = new runtime.AggregatorClient({
    baseUrl: AGGREGATOR_BASE_URL,
    token: AGGREGATOR_TOKEN,
    timeoutMs: TRACKER_PROXY_TIMEOUT_MS,
    logger,
  });
  const alteredService = new runtime.AlteredService({
    repository,
    trackerClient,
    trackerMapSyncClients: [
      {
        key: "leaderboard",
        label: "tracker-leaderboard",
        client: trackerLeaderboardClient,
      },
    ],
    trackerDisplaynameClient,
    trackerClubClient,
    aggregatorClient,
    liveClient,
    mapperNameClient,
    trackerIntegrations: {
      displaynameEnabled: ALTERED_TRACKER_DISPLAYNAME_ENABLED,
      displaynameFallbackLocal: ALTERED_TRACKER_DISPLAYNAME_FALLBACK_LOCAL,
      clubEnabled: ALTERED_TRACKER_CLUB_ENABLED,
      clubFallbackLocal: ALTERED_TRACKER_CLUB_FALLBACK_LOCAL,
    },
    liveMonitorConfig: {
      enabled: ALTERED_LIVE_MONITOR_ENABLED,
      scheduleMode: ALTERED_LIVE_MONITOR_SCHEDULE_MODE,
      dailyHourUtc: ALTERED_LIVE_MONITOR_DAILY_HOUR_UTC,
      dailyMinuteUtc: ALTERED_LIVE_MONITOR_DAILY_MINUTE_UTC,
      discoveryEnabled: ALTERED_LIVE_DISCOVERY_ENABLED,
      discoveryIntervalSeconds: ALTERED_LIVE_DISCOVERY_INTERVAL_SECONDS,
      discoveryCampaignLimit: ALTERED_LIVE_DISCOVERY_CAMPAIGN_LIMIT,
      discoveryActivityPageSize: ALTERED_LIVE_DISCOVERY_ACTIVITY_PAGE_SIZE,
      clubId: ALTERED_LIVE_CLUB_ID,
      intervalSeconds: ALTERED_LIVE_MONITOR_INTERVAL_SECONDS,
      activityPageSize: ALTERED_LIVE_ACTIVITY_PAGE_SIZE,
      activeOnly: ALTERED_LIVE_ACTIVITY_ACTIVE_ONLY,
      fetchMapDetails: ALTERED_LIVE_FETCH_MAP_DETAILS,
    },
    mapperNameSyncConfig: {
      enabled: ALTERED_MAPPER_SYNC_SCHEDULER_ENABLED,
      bootstrapIntervalSeconds: ALTERED_MAPPER_SYNC_BOOTSTRAP_INTERVAL_SECONDS,
      maintenanceIntervalSeconds: ALTERED_MAPPER_SYNC_MAINTENANCE_INTERVAL_SECONDS,
      priorityIntervalSeconds: ALTERED_MAPPER_SYNC_PRIORITY_INTERVAL_SECONDS,
      batchSize: ALTERED_MAPPER_SYNC_BATCH_SIZE,
      priorityBatchSize: ALTERED_MAPPER_SYNC_PRIORITY_BATCH_SIZE,
      priorityTopLimit: ALTERED_MAPPER_SYNC_PRIORITY_TOP_LIMIT,
      priorityRefreshSeconds: ALTERED_MAPPER_SYNC_PRIORITY_REFRESH_SECONDS,
      cacheTtlSeconds: ALTERED_MAPPER_SYNC_CACHE_TTL_SECONDS,
      priorityCacheTtlSeconds: ALTERED_MAPPER_SYNC_PRIORITY_CACHE_TTL_SECONDS,
      knownAccountsRefreshSeconds: ALTERED_MAPPER_SYNC_KNOWN_ACCOUNTS_REFRESH_SECONDS,
      minRequestGapMs: 5000,
    },
    mapCopyConfig,
    alterationGroupingConfig,
    logger,
  });

  return {
    db,
    repository,
    trackerClient,
    trackerLeaderboardClient,
    liveClient,
    mapperNameClient,
    trackerDisplaynameClient,
    trackerClubClient,
    aggregatorClient,
    alteredService,
  };
}

export { DEFAULT_PROJECT_CLUBS, createAlteredServiceRuntime };
