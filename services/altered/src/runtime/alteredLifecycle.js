import {
  ADMIN_TOKEN,
  AGGREGATOR_BASE_URL,
  ALTERED_DEV_LOCAL_OPEN,
  ALTERED_LIVE_ACTIVITY_ACTIVE_ONLY,
  ALTERED_LIVE_ACTIVITY_PAGE_SIZE,
  ALTERED_LIVE_AUTH_MODE,
  ALTERED_LIVE_CLUB_ID,
  ALTERED_LIVE_FETCH_MAP_DETAILS,
  ALTERED_LIVE_MONITOR_DAILY_HOUR_UTC,
  ALTERED_LIVE_MONITOR_DAILY_MINUTE_UTC,
  ALTERED_LIVE_MONITOR_ENABLED,
  ALTERED_LIVE_MONITOR_SCHEDULE_MODE,
  ALTERED_LIVE_USER_AGENT,
  ALTERED_MAP_COPY_BACKFILL_BATCH_SIZE,
  ALTERED_MAP_COPY_BACKFILL_ENABLED,
  ALTERED_MAP_COPY_MAX_CONCURRENT_DOWNLOADS,
  ALTERED_MAP_COPY_REQUEST_TIMEOUT_MS,
  ALTERED_MAPPER_SYNC_BATCH_SIZE,
  ALTERED_MAPPER_SYNC_BOOTSTRAP_INTERVAL_SECONDS,
  ALTERED_MAPPER_SYNC_MAINTENANCE_INTERVAL_SECONDS,
  ALTERED_MAPPER_SYNC_PRIORITY_BATCH_SIZE,
  ALTERED_MAPPER_SYNC_PRIORITY_INTERVAL_SECONDS,
  ALTERED_MAPPER_SYNC_PRIORITY_TOP_LIMIT,
  ALTERED_MAPPER_SYNC_SCHEDULER_ENABLED,
  ALTERED_OAUTH_FALLBACK_LOCAL_ONLY,
  ALTERED_OPS_MONITOR_ENABLED,
  ALTERED_OPS_MONITOR_MAX_MAPS_PER_RUN,
  ALTERED_OPS_MONITOR_TICK_SECONDS,
  ALTERED_TRACKER_CLUB_ENABLED,
  ALTERED_TRACKER_CLUB_FALLBACK_LOCAL,
  ALTERED_TRACKER_DISPLAYNAME_ENABLED,
  ALTERED_TRACKER_DISPLAYNAME_FALLBACK_LOCAL,
  DATA_DIR,
  DB_FILE,
  FRONTEND_DIR,
  PORT,
  TRACKER_ADMIN_BASE_URL,
  TRACKER_CLUB_BASE_URL,
  TRACKER_DISPLAYNAME_BASE_URL,
  TRACKER_LEADERBOARD_ADMIN_BASE_URL,
  TRACKER_LEADERBOARD_PUBLIC_BASE_URL,
  TRACKER_PROXY_TIMEOUT_MS,
  TRACKER_PUBLIC_BASE_URL,
  UBI_OAUTH_ENABLED,
} from "../config.js";

function createAlteredLifecycle({
  app,
  repository,
  alteredService,
  opsService,
  ubisoftAuth,
  allowlistBootstrap,
  logger = console,
  port = PORT,
  frontendDir = FRONTEND_DIR,
  dataDir = DATA_DIR,
  dbFile = DB_FILE,
} = {}) {
  const projectSourceAutoSyncStartupEnabled =
    String(process.env.ALTERED_PROJECT_SOURCE_AUTO_SYNC_STARTUP || "").trim() === "1";
  const mapCopyAutoSyncStartupEnabled = String(process.env.ALTERED_MAP_COPY_AUTO_SYNC_STARTUP || "").trim() === "1";

  function startServer() {
    return app.listen(port, "127.0.0.1", () => {
      logger.log(`Altered service listening on http://127.0.0.1:${port}`);
      logger.log(`FRONTEND_DIR=${frontendDir}`);
      logger.log(`DB_FILE=${dbFile}`);
      logger.log(`ADMIN_TOKEN=${ADMIN_TOKEN ? "<set>" : "<not-set>"}`);
      logger.log(`TRACKER_PUBLIC_BASE_URL=${TRACKER_PUBLIC_BASE_URL}`);
      logger.log(`TRACKER_ADMIN_BASE_URL=${TRACKER_ADMIN_BASE_URL}`);
      logger.log(`TRACKER_LEADERBOARD_PUBLIC_BASE_URL=${TRACKER_LEADERBOARD_PUBLIC_BASE_URL}`);
      logger.log(`TRACKER_LEADERBOARD_ADMIN_BASE_URL=${TRACKER_LEADERBOARD_ADMIN_BASE_URL}`);
      logger.log(`TRACKER_DISPLAYNAME_BASE_URL=${TRACKER_DISPLAYNAME_BASE_URL}`);
      logger.log(`TRACKER_CLUB_BASE_URL=${TRACKER_CLUB_BASE_URL}`);
      logger.log(`AGGREGATOR_BASE_URL=${AGGREGATOR_BASE_URL}`);
      logger.log(`TRACKER_PROXY_TIMEOUT_MS=${TRACKER_PROXY_TIMEOUT_MS}`);
      logger.log(
        `ALTERED_TRACKER_INTEGRATIONS displayname=${ALTERED_TRACKER_DISPLAYNAME_ENABLED ? "on" : "off"} fallback=${ALTERED_TRACKER_DISPLAYNAME_FALLBACK_LOCAL ? "on" : "off"} club=${ALTERED_TRACKER_CLUB_ENABLED ? "on" : "off"} fallback=${ALTERED_TRACKER_CLUB_FALLBACK_LOCAL ? "on" : "off"}`
      );
      const authStatus = ubisoftAuth.getStatus();
      logger.log(
        `UBISOFT_OAUTH=${authStatus.enabled ? "enabled" : "disabled"} configured=${
          authStatus.configured ? "yes" : "no"
        } allowlist(mode=${authStatus.allowlist.mode}, subjects=${authStatus.allowlist.subjects}, usernames=${authStatus.allowlist.usernames})`
      );
      logger.log(
        `ALTERED_ADMIN_ALLOWLIST active=${repository.admin.countActiveAdminUsers()} bootstrapped=${allowlistBootstrap.seededCount}`
      );
      logger.log(`ALTERED_OAUTH_FALLBACK_LOCAL_ONLY=${ALTERED_OAUTH_FALLBACK_LOCAL_ONLY ? "1" : "0"}`);
      if (ALTERED_DEV_LOCAL_OPEN) {
        logger.log("ALTERED_DEV_LOCAL_OPEN=1 - admin auth bypassed for local requests");
      }
      logger.log(
        `ALTERED_LIVE monitor=${ALTERED_LIVE_MONITOR_ENABLED ? "enabled" : "disabled"} schedule=${ALTERED_LIVE_MONITOR_SCHEDULE_MODE} dailyUtc=${ALTERED_LIVE_MONITOR_DAILY_HOUR_UTC}:${String(ALTERED_LIVE_MONITOR_DAILY_MINUTE_UTC).padStart(2, "0")} club=${ALTERED_LIVE_CLUB_ID} pageSize=${ALTERED_LIVE_ACTIVITY_PAGE_SIZE} activeOnly=${ALTERED_LIVE_ACTIVITY_ACTIVE_ONLY} fetchMapDetails=${ALTERED_LIVE_FETCH_MAP_DETAILS}`
      );
      logger.log(`ALTERED_LIVE authMode=${ALTERED_LIVE_AUTH_MODE} ua="${ALTERED_LIVE_USER_AGENT}"`);
      logger.log(
        `ALTERED_MAPPER_SYNC scheduler=${ALTERED_MAPPER_SYNC_SCHEDULER_ENABLED ? "enabled" : "disabled"} bootstrap=${ALTERED_MAPPER_SYNC_BOOTSTRAP_INTERVAL_SECONDS}s maintenance=${ALTERED_MAPPER_SYNC_MAINTENANCE_INTERVAL_SECONDS}s priority=${ALTERED_MAPPER_SYNC_PRIORITY_INTERVAL_SECONDS}s batch=${ALTERED_MAPPER_SYNC_BATCH_SIZE}/${ALTERED_MAPPER_SYNC_PRIORITY_BATCH_SIZE} topLimit=${ALTERED_MAPPER_SYNC_PRIORITY_TOP_LIMIT}`
      );
      logger.log(
        `ALTERED_OPS monitor=${ALTERED_OPS_MONITOR_ENABLED ? "enabled" : "disabled"} tick=${ALTERED_OPS_MONITOR_TICK_SECONDS}s maxMapsPerRun=${ALTERED_OPS_MONITOR_MAX_MAPS_PER_RUN}`
      );
      logger.log(
        `ALTERED_MAP_COPY enabled=${ALTERED_MAP_COPY_BACKFILL_ENABLED ? "enabled" : "disabled"} batch=${ALTERED_MAP_COPY_BACKFILL_BATCH_SIZE} concurrent=${ALTERED_MAP_COPY_MAX_CONCURRENT_DOWNLOADS} timeoutMs=${ALTERED_MAP_COPY_REQUEST_TIMEOUT_MS} dataDir=${dataDir}`
      );
      if (UBI_OAUTH_ENABLED && !authStatus.enabled) {
        logger.warn(
          ALTERED_OAUTH_FALLBACK_LOCAL_ONLY
            ? "UBI_OAUTH_ENABLED=1 but OAuth is incomplete. Local fallback mode enabled; all other admin access blocked."
            : "UBI_OAUTH_ENABLED=1 but OAuth is incomplete. Admin access is blocked."
        );
      }

      const liveStatus = alteredService.monitoring.getLiveMonitorStatus();
      const effectiveLiveEnabled = Boolean(liveStatus?.monitor?.enabled);
      logger.log(
        `ALTERED_LIVE effectiveMonitor=${effectiveLiveEnabled ? "enabled" : "disabled"} schedule=${liveStatus?.monitor?.scheduleMode || "unknown"} interval=${Number(liveStatus?.monitor?.intervalSeconds || 0)}s discovery=${liveStatus?.monitor?.discoveryEnabled ? "on" : "off"}`
      );
      const existingAlterationCount =
        typeof repository.catalog.countAlterations === "function" ? repository.catalog.countAlterations() : 0;
      if (existingAlterationCount <= 0) {
        alteredService.catalog
          .queueAlterationsSync({ reason: "startup", wait: true })
          .then((syncResult) => {
            if (syncResult?.ok && syncResult.summary) {
              logger.log(
                `ALTERATIONS_SYNC campaigns=${syncResult.summary.campaigns_scanned} linked_campaigns=${syncResult.summary.campaigns_linked} links=${syncResult.summary.links_inserted} alterations=${syncResult.summary.alterations_touched} unused_deleted=${syncResult.summary.unused_deleted}`
              );
            } else if (syncResult?.error) {
              logger.warn(`[alterations-sync] startup sync failed: ${syncResult.error}`);
            }
          })
          .catch((error) => {
            logger.warn(`[alterations-sync] startup sync failed: ${error?.message || error}`);
          });
      } else {
        logger.log(`[alterations-sync] startup sync skipped; ${existingAlterationCount} alterations already present.`);
      }
      if (mapCopyAutoSyncStartupEnabled) {
        alteredService.maps.startMapLocalCopyBackfillOnBoot();
      } else {
        logger.log(
          "[altered-map-copy] auto-start backfill disabled; trigger local store backfill from the admin when needed."
        );
      }
      if (effectiveLiveEnabled) {
        alteredService.monitoring.startLiveMonitor();
        alteredService.monitoring
          .runLiveMonitorCycleDetached({
            reason: "startup-initial",
          })
          .catch((error) => {
            logger.warn(`[altered-live] startup sync failed: ${error?.message || error}`);
          });
      }
      if (ALTERED_OPS_MONITOR_ENABLED) {
        opsService.startScheduler();
        opsService.runDueSchedules({ reason: "startup" }).catch((error) => {
          logger.warn(`[altered-ops] startup run failed: ${error?.message || error}`);
        });
      }
      if (ALTERED_MAPPER_SYNC_SCHEDULER_ENABLED) {
        alteredService.players.startMapperNameSyncScheduler().catch((error) => {
          logger.warn(`[altered-mapper-sync] failed to start scheduler: ${error?.message || error}`);
        });
      }
      if (projectSourceAutoSyncStartupEnabled) {
        alteredService.sources.startProjectSourceSyncScheduler();
        alteredService.sources
          .runDueProjectSourceSyncs({ reason: "startup", fromTimeMs: Date.now() })
          .catch((error) => {
            logger.warn(`[altered-project-source] startup sync failed: ${error?.message || error}`);
          });
      } else {
        logger.log(
          "[altered-project-source] auto-start sync disabled; trigger source syncs from the admin when needed."
        );
      }
      setInterval(() => {
        ubisoftAuth.cleanupExpired();
      }, 60 * 1000).unref();
    });
  }

  function stopServices() {
    alteredService.monitoring.stopLiveMonitor();
    alteredService.players.stopMapperNameSyncScheduler().catch(() => {});
    alteredService.sources.stopProjectSourceSyncScheduler();
    opsService.stopScheduler();
  }

  return { startServer, stopServices };
}

export { createAlteredLifecycle };
