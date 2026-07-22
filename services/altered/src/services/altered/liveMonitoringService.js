import { ClubContentDiscoveryPipeline } from "./liveMonitoring/clubContentDiscoveryPipeline.js";
import { ClubFetchService } from "./liveMonitoring/clubFetchService.js";
import { ClubSyncService } from "./liveMonitoring/clubSyncService.js";
import { DetachedJobService } from "./liveMonitoring/detachedJobService.js";
import { LiveMonitoringContext } from "./liveMonitoring/liveMonitoringContext.js";
import { MonitorCycleService } from "./liveMonitoring/monitorCycleService.js";
import { MonitorStateService } from "./liveMonitoring/monitorStateService.js";

class LiveMonitoringService {
  constructor(options) {
    const context = new LiveMonitoringContext(options);
    this.context = context;

    this.repository = context.repository;
    this.liveClient = context.liveClient;
    this.mapperNameClient = context.mapperNameClient;
    this.trackerClubClient = context.trackerClubClient;
    this.trackerDisplaynameClient = context.trackerDisplaynameClient;
    this.logger = context.logger;
    this.getAlterationCatalogService = context.getAlterationCatalogService;
    this.getMapProcessingService = context.getMapProcessingService;
    this.getPlayerIdentityService = context.getPlayerIdentityService;
    this.getProjectSourceService = context.getProjectSourceService;
    this.getTrackerSyncService = context.getTrackerSyncService;
    this.liveMonitor = context.liveMonitor;
    const contentDiscoveryPipeline = new ClubContentDiscoveryPipeline();

    this.monitorStateService = new MonitorStateService({
      repository: context.repository,
      liveClient: context.liveClient,
      mapperNameClient: context.mapperNameClient,
      trackerClubClient: context.trackerClubClient,
      trackerDisplaynameClient: context.trackerDisplaynameClient,
      logger: context.logger,
      liveMonitor: context.liveMonitor,
      getPlayerIdentityService: context.getPlayerIdentityService,
      getProjectSourceService: context.getProjectSourceService,
      getTrackerSyncService: context.getTrackerSyncService,
      createLiveMonitorConfigSnapshot: () => context.getLiveMonitorConfigSnapshot(),
      runLiveMonitorCycleDetached: (...args) => this.runLiveMonitorCycleDetached(...args),
      runLiveDiscoveryCycleDetached: (...args) => this.runLiveDiscoveryCycleDetached(...args),
    });
    this.clubFetchService = new ClubFetchService({
      repository: context.repository,
      liveClient: context.liveClient,
      liveMonitor: context.liveMonitor,
      contentDiscoveryPipeline,
    });
    this.clubSyncService = new ClubSyncService({
      repository: context.repository,
      getPlayerIdentityService: context.getPlayerIdentityService,
      getProjectSourceService: context.getProjectSourceService,
      fetchLiveClubStructure: (...args) => this.fetchLiveClubStructure(...args),
    });
    this.monitorCycleService = new MonitorCycleService({
      repository: context.repository,
      liveMonitor: context.liveMonitor,
      logger: context.logger,
      getAlterationCatalogService: context.getAlterationCatalogService,
      getMapCopy: () => context.mapCopy,
      getPlayerIdentityService: context.getPlayerIdentityService,
      getProjectSourceService: context.getProjectSourceService,
      resolveLiveClient: (...args) => this.resolveLiveClient(...args),
      fetchAllClubActivities: (...args) => this.fetchAllClubActivities(...args),
      syncLiveClubSnapshot: (...args) => this.syncLiveClubSnapshot(...args),
      updateLiveProgress: (...args) => this.updateLiveProgress(...args),
      contentDiscoveryPipeline,
    });
    this.detachedJobService = new DetachedJobService({
      liveMonitor: context.liveMonitor,
      logger: context.logger,
      getAlterationsSync: () => context.alterationsSync,
      getMapCopy: () => context.mapCopy,
      runLiveMonitorCycle: (...args) => this.runLiveMonitorCycle(...args),
      runLiveDiscoveryCycle: (...args) => this.runLiveDiscoveryCycle(...args),
      updateLiveProgress: (...args) => this.updateLiveProgress(...args),
    });
  }

  get alterationsSync() {
    return this.context.alterationsSync;
  }

  get mapCopy() {
    return this.context.mapCopy;
  }

  get trackerIntegrations() {
    return this.context.trackerIntegrations;
  }

  getLiveMonitorConfigSnapshot(...args) {
    return this.monitorStateService.getLiveMonitorConfigSnapshot(...args);
  }

  persistLiveMonitorConfig(...args) {
    return this.monitorStateService.persistLiveMonitorConfig(...args);
  }

  updateLiveProgress(...args) {
    return this.monitorStateService.updateLiveProgress(...args);
  }

  computeNextScheduledRunIso(...args) {
    return this.monitorStateService.computeNextScheduledRunIso(...args);
  }

  computeNextDiscoveryRunIso(...args) {
    return this.monitorStateService.computeNextDiscoveryRunIso(...args);
  }

  _runLiveJobInWorker(...args) {
    return this.detachedJobService._runLiveJobInWorker(...args);
  }

  runLiveMonitorCycleDetached(...args) {
    return this.detachedJobService.runLiveMonitorCycleDetached(...args);
  }

  runLiveDiscoveryCycleDetached(...args) {
    return this.detachedJobService.runLiveDiscoveryCycleDetached(...args);
  }

  scheduleNextLiveMonitorRun(...args) {
    return this.monitorStateService.scheduleNextLiveMonitorRun(...args);
  }

  scheduleNextDiscoveryRun(...args) {
    return this.monitorStateService.scheduleNextDiscoveryRun(...args);
  }

  getLiveMonitorStatus(...args) {
    return this.monitorStateService.getLiveMonitorStatus(...args);
  }

  resolveLiveClient(...args) {
    return this.clubFetchService.resolveLiveClient(...args);
  }

  resolveCoreMapClient(...args) {
    return this.clubFetchService.resolveCoreMapClient(...args);
  }

  resolveLiveOptions(...args) {
    return this.clubFetchService.resolveLiveOptions(...args);
  }

  fetchAllClubActivities(...args) {
    return this.clubFetchService.fetchAllClubActivities(...args);
  }

  fetchAllClubMembers(...args) {
    return this.clubFetchService.fetchAllClubMembers(...args);
  }

  fetchAllClubUploadBuckets(...args) {
    return this.clubFetchService.fetchAllClubUploadBuckets(...args);
  }

  fetchLiveClubStructure(...args) {
    return this.clubFetchService.fetchLiveClubStructure(...args);
  }

  syncLiveClubSnapshot(...args) {
    return this.clubSyncService.syncLiveClubSnapshot(...args);
  }

  updateLiveMonitorConfig(...args) {
    return this.monitorStateService.updateLiveMonitorConfig(...args);
  }

  getProjectClubsForSync(...args) {
    return this.monitorCycleService.getProjectClubsForSync(...args);
  }

  runLiveMonitorCycle(...args) {
    return this.monitorCycleService.runLiveMonitorCycle(...args);
  }

  runLiveDiscoveryCycle(...args) {
    return this.monitorCycleService.runLiveDiscoveryCycle(...args);
  }

  startLiveMonitor(...args) {
    return this.monitorStateService.startLiveMonitor(...args);
  }

  stopLiveMonitor(...args) {
    return this.monitorStateService.stopLiveMonitor(...args);
  }
}

export { LiveMonitoringService };
