import { AlterationCatalogService } from "./altered/alterationCatalogService.js";
import { LiveMonitoringService } from "./altered/liveMonitoringService.js";
import { MapProcessingService } from "./altered/mapProcessingService.js";
import { PlayerIdentityService } from "./altered/playerIdentityService.js";
import { ProjectSourceService } from "./altered/projectSourceService.js";
import { TrackerSyncService } from "./altered/trackerSyncService.js";

class AlteredService {
  constructor({
    repository,
    trackerClient,
    trackerMapSyncClients = [],
    trackerDisplaynameClient = null,
    trackerClubClient = null,
    aggregatorClient = null,
    liveClient = null,
    mapperNameClient = null,
    trackerIntegrations = {},
    liveMonitorConfig = {},
    mapperNameSyncConfig = {},
    mapCopyConfig = {},
    alterationGroupingConfig = {},
    logger = console,
  }) {
    this.tracker = new TrackerSyncService({
      repository,
      trackerClient,
      trackerMapSyncClients,
      getLiveMonitoringService: () => this.monitoring,
    });
    this.players = new PlayerIdentityService({
      repository,
      trackerClient,
      trackerDisplaynameClient,
      trackerClubClient,
      aggregatorClient,
      liveClient,
      mapperNameClient,
      trackerIntegrations,
      mapperNameSyncConfig,
      logger,
      getProjectSourceService: () => this.sources,
      getTrackerSyncService: () => this.tracker,
    });
    this.maps = new MapProcessingService({
      repository,
      mapCopyConfig,
      logger,
      getAlterationCatalogService: () => this.catalog,
      getProjectSourceService: () => this.sources,
    });
    this.catalog = new AlterationCatalogService({
      repository,
      trackerClient,
      alterationGroupingConfig,
      logger,
      getLiveMonitoringService: () => this.monitoring,
      getPlayerIdentityService: () => this.players,
      getTrackerSyncService: () => this.tracker,
    });
    this.sources = new ProjectSourceService({
      repository,
      logger,
      getLiveMonitoringService: () => this.monitoring,
      getMapProcessingService: () => this.maps,
      getPlayerIdentityService: () => this.players,
      getTrackerSyncService: () => this.tracker,
    });
    this.monitoring = new LiveMonitoringService({
      repository,
      liveClient,
      mapperNameClient,
      trackerClubClient,
      trackerDisplaynameClient,
      liveMonitorConfig,
      logger,
      getAlterationCatalogService: () => this.catalog,
      getMapProcessingService: () => this.maps,
      getPlayerIdentityService: () => this.players,
      getProjectSourceService: () => this.sources,
      getTrackerSyncService: () => this.tracker,
    });
  }
}

export { AlteredService };
