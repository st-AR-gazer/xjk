import { CampaignSnapshotService } from "./projectSource/campaignSnapshotService.js";
import { CuratedSourceSyncService } from "./projectSource/curatedSourceSyncService.js";
import { HookSnapshotService } from "./projectSource/hookSnapshotService.js";
import { OfficialSourceSyncService } from "./projectSource/officialSourceSyncService.js";
import { ProjectSourceApi } from "./projectSource/projectSourceApi.js";
import { ProjectSourceRegistry } from "./projectSource/projectSourceRegistry.js";
import { ProjectSourceScheduler } from "./projectSource/projectSourceScheduler.js";
import { WeeklyShortsSourceService } from "./projectSource/weeklyShortsSourceService.js";

class ProjectSourceService {
  constructor({
    repository,
    logger = console,
    getLiveMonitoringService,
    getMapProcessingService,
    getPlayerIdentityService,
    getTrackerSyncService,
  }) {
    this.repository = repository;
    this.logger = logger;
    this.getLiveMonitoringService = getLiveMonitoringService;
    this.getMapProcessingService = getMapProcessingService;
    this.getPlayerIdentityService = getPlayerIdentityService;
    this.getTrackerSyncService = getTrackerSyncService;
    this.projectSourceSync = {
      timer: null,
      nextRunAt: null,
      running: false,
      currentSourceKey: null,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastError: null,
      lastSummary: null,
    };

    this.sourceRegistry = new ProjectSourceRegistry({
      repository,
      getLiveMonitor: () => this.liveMonitor,
    });
    this.sourceApi = new ProjectSourceApi();
    this.campaignSnapshotService = new CampaignSnapshotService();
    this.weeklyShortsSourceService = new WeeklyShortsSourceService({
      repository,
      getLiveMonitoringService,
      getMapProcessingService,
      getTrackerSyncService,
      getWeeklyShortsSourceStatus: (...args) => this.getWeeklyShortsSourceStatus(...args),
      getLatestCampaignReleaseWindow: (...args) => this.getLatestCampaignReleaseWindow(...args),
      fetchAllWeeklyShortsCampaigns: (...args) => this.fetchAllWeeklyShortsCampaigns(...args),
      buildWeeklyShortsCampaignSnapshots: (...args) => this.buildWeeklyShortsCampaignSnapshots(...args),
      resolveImportRoots: (...args) => this.normalizeWeeklyShortsImportRoots(...args),
      runLocalImport: (...args) => this.importWeeklyShortsLocalFiles(...args),
    });
    this.officialSourceSyncService = new OfficialSourceSyncService({
      repository,
      getLiveMonitoringService,
      getMapProcessingService,
      getOfficialSeasonalSourceStatus: (...args) => this.getOfficialSeasonalSourceStatus(...args),
      getTotdSourceStatus: (...args) => this.getTotdSourceStatus(...args),
      getWeeklyGrandsSourceStatus: (...args) => this.getWeeklyGrandsSourceStatus(...args),
      getCompetitionSourceStatus: (...args) => this.getCompetitionSourceStatus(...args),
      getLatestCampaignReleaseWindow: (...args) => this.getLatestCampaignReleaseWindow(...args),
      getLatestTotdReleaseWindow: (...args) => this.getLatestTotdReleaseWindow(...args),
      fetchAllOfficialSeasonalCampaigns: (...args) => this.fetchAllOfficialSeasonalCampaigns(...args),
      fetchAllTotdMonths: (...args) => this.fetchAllTotdMonths(...args),
      fetchAllWeeklyGrandsCampaigns: (...args) => this.fetchAllWeeklyGrandsCampaigns(...args),
      buildOfficialSeasonalCampaignSnapshots: (...args) => this.buildOfficialSeasonalCampaignSnapshots(...args),
      buildTotdCampaignSnapshots: (...args) => this.buildTotdCampaignSnapshots(...args),
      buildWeeklyGrandsCampaignSnapshots: (...args) => this.buildWeeklyGrandsCampaignSnapshots(...args),
      runOfficialSeasonalSync: (...args) => this.syncOfficialSeasonalSource(...args),
      runTotdSync: (...args) => this.syncTotdSource(...args),
      runCompetitionSync: (...args) => this.syncCompetitionSource(...args),
    });
    this.curatedSourceSyncService = new CuratedSourceSyncService({
      repository,
      getLiveMonitoringService,
      getMapProcessingService,
      getCompetitionSourceStatus: (...args) => this.getCompetitionSourceStatus(...args),
      getDiscoverySourceStatus: (...args) => this.getDiscoverySourceStatus(...args),
      getLegacySourceStatus: (...args) => this.getLegacySourceStatus(...args),
      getLatestCampaignReleaseWindow: (...args) => this.getLatestCampaignReleaseWindow(...args),
      buildCompetitionCampaignSnapshots: (...args) => this.buildCompetitionCampaignSnapshots(...args),
      buildDiscoveryCampaignSnapshots: (...args) => this.buildDiscoveryCampaignSnapshots(...args),
      buildLegacyCampaignSnapshots: (...args) => this.buildLegacyCampaignSnapshots(...args),
    });
    this.sourceSyncScheduler = new ProjectSourceScheduler({
      logger,
      projectSourceSync: this.projectSourceSync,
      getProjectSources: (...args) => this.getProjectSources(...args),
      computeProjectSourceNextRunMs: (...args) => this.computeProjectSourceNextRunMs(...args),
      syncOfficialSeasonalSource: (...args) => this.syncOfficialSeasonalSource(...args),
      syncTotdSource: (...args) => this.syncTotdSource(...args),
      syncWeeklyGrandsSource: (...args) => this.syncWeeklyGrandsSource(...args),
      syncCompetitionSource: (...args) => this.syncCompetitionSource(...args),
      syncDiscoverySource: (...args) => this.syncDiscoverySource(...args),
      syncLegacySource: (...args) => this.syncLegacySource(...args),
      syncWeeklyShortsSource: (...args) => this.syncWeeklyShortsSource(...args),
      runSourceSync: (...args) => this.syncProjectSourceByKey(...args),
      runDueSyncs: (...args) => this.runDueProjectSourceSyncs(...args),
      scheduleNextRun: (...args) => this.scheduleNextProjectSourceSyncRun(...args),
    });
    this.hookSnapshotService = new HookSnapshotService({
      repository,
      logger,
      getMapProcessingService,
      getPlayerIdentityService,
      getTrackerSyncService,
    });
  }

  get liveMonitor() {
    return this.getLiveMonitoringService().liveMonitor;
  }

  get trackerIntegrations() {
    return this.getPlayerIdentityService().trackerIntegrations;
  }

  getProjectClubs(...args) {
    return this.sourceRegistry.getProjectClubs(...args);
  }

  getProjectSources(...args) {
    return this.sourceRegistry.getProjectSources(...args);
  }

  getWeeklyShortsSourceStatus(...args) {
    return this.sourceRegistry.getWeeklyShortsSourceStatus(...args);
  }

  getOfficialSeasonalSourceStatus(...args) {
    return this.sourceRegistry.getOfficialSeasonalSourceStatus(...args);
  }

  getTotdSourceStatus(...args) {
    return this.sourceRegistry.getTotdSourceStatus(...args);
  }

  getWeeklyGrandsSourceStatus(...args) {
    return this.sourceRegistry.getWeeklyGrandsSourceStatus(...args);
  }

  getCompetitionSourceStatus(...args) {
    return this.sourceRegistry.getCompetitionSourceStatus(...args);
  }

  getDiscoverySourceStatus(...args) {
    return this.sourceRegistry.getDiscoverySourceStatus(...args);
  }

  getLegacySourceStatus(...args) {
    return this.sourceRegistry.getLegacySourceStatus(...args);
  }

  getProjectSourceScheduleRule(...args) {
    return this.sourceRegistry.getProjectSourceScheduleRule(...args);
  }

  computeProjectSourceNextRunMs(...args) {
    return this.sourceRegistry.computeProjectSourceNextRunMs(...args);
  }

  computeProjectSourceNextRunIso(...args) {
    return this.sourceRegistry.computeProjectSourceNextRunIso(...args);
  }

  getLatestCampaignReleaseWindow(...args) {
    return this.sourceRegistry.getLatestCampaignReleaseWindow(...args);
  }

  getLatestTotdReleaseWindow(...args) {
    return this.sourceRegistry.getLatestTotdReleaseWindow(...args);
  }

  getPrimaryProjectClubId(...args) {
    return this.sourceRegistry.getPrimaryProjectClubId(...args);
  }

  fetchAllOfficialSeasonalCampaigns(...args) {
    return this.sourceApi.fetchAllOfficialSeasonalCampaigns(...args);
  }

  fetchAllTotdMonths(...args) {
    return this.sourceApi.fetchAllTotdMonths(...args);
  }

  fetchAllWeeklyGrandsCampaigns(...args) {
    return this.sourceApi.fetchAllWeeklyGrandsCampaigns(...args);
  }

  fetchAllWeeklyShortsCampaigns(...args) {
    return this.sourceApi.fetchAllWeeklyShortsCampaigns(...args);
  }

  buildOfficialSeasonalCampaignSnapshots(...args) {
    return this.campaignSnapshotService.buildOfficialSeasonalCampaignSnapshots(...args);
  }

  buildTotdCampaignSnapshots(...args) {
    return this.campaignSnapshotService.buildTotdCampaignSnapshots(...args);
  }

  buildWeeklyGrandsCampaignSnapshots(...args) {
    return this.campaignSnapshotService.buildWeeklyGrandsCampaignSnapshots(...args);
  }

  buildDiscoveryCampaignSnapshots(...args) {
    return this.campaignSnapshotService.buildDiscoveryCampaignSnapshots(...args);
  }

  buildLegacyCampaignSnapshots(...args) {
    return this.campaignSnapshotService.buildLegacyCampaignSnapshots(...args);
  }

  buildCompetitionCampaignSnapshots(...args) {
    return this.campaignSnapshotService.buildCompetitionCampaignSnapshots(...args);
  }

  buildWeeklyShortsCampaignSnapshots(...args) {
    return this.campaignSnapshotService.buildWeeklyShortsCampaignSnapshots(...args);
  }

  normalizeWeeklyShortsImportRoots(...args) {
    return this.weeklyShortsSourceService.normalizeWeeklyShortsImportRoots(...args);
  }

  importWeeklyShortsLocalFiles(...args) {
    return this.weeklyShortsSourceService.importWeeklyShortsLocalFiles(...args);
  }

  syncOfficialSeasonalSource(...args) {
    return this.officialSourceSyncService.syncOfficialSeasonalSource(...args);
  }

  ensureOfficialSeasonalSourceFresh(...args) {
    return this.officialSourceSyncService.ensureOfficialSeasonalSourceFresh(...args);
  }

  ensureTotdSourceAvailable(...args) {
    return this.officialSourceSyncService.ensureTotdSourceAvailable(...args);
  }

  ensureCompetitionSourceAvailable(...args) {
    return this.officialSourceSyncService.ensureCompetitionSourceAvailable(...args);
  }

  syncTotdSource(...args) {
    return this.officialSourceSyncService.syncTotdSource(...args);
  }

  syncWeeklyGrandsSource(...args) {
    return this.officialSourceSyncService.syncWeeklyGrandsSource(...args);
  }

  syncDiscoverySource(...args) {
    return this.curatedSourceSyncService.syncDiscoverySource(...args);
  }

  syncLegacySource(...args) {
    return this.curatedSourceSyncService.syncLegacySource(...args);
  }

  syncCompetitionSource(...args) {
    return this.curatedSourceSyncService.syncCompetitionSource(...args);
  }

  syncProjectSourceByKey(...args) {
    return this.sourceSyncScheduler.syncProjectSourceByKey(...args);
  }

  runDueProjectSourceSyncs(...args) {
    return this.sourceSyncScheduler.runDueProjectSourceSyncs(...args);
  }

  scheduleNextProjectSourceSyncRun(...args) {
    return this.sourceSyncScheduler.scheduleNextProjectSourceSyncRun(...args);
  }

  startProjectSourceSyncScheduler(...args) {
    return this.sourceSyncScheduler.startProjectSourceSyncScheduler(...args);
  }

  stopProjectSourceSyncScheduler(...args) {
    return this.sourceSyncScheduler.stopProjectSourceSyncScheduler(...args);
  }

  syncWeeklyShortsSource(...args) {
    return this.weeklyShortsSourceService.syncWeeklyShortsSource(...args);
  }

  syncHookSnapshot(...args) {
    return this.hookSnapshotService.syncHookSnapshot(...args);
  }
}

export { ProjectSourceService };
