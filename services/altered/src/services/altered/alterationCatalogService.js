import { createAlterationGroupingStore } from "./serviceSupport.js";
import { AlterationSyncService, createAlterationsSyncState } from "./alterationCatalog/alterationSyncService.js";
import { CatalogBrowseService } from "./alterationCatalog/catalogBrowseService.js";
import { LeaderboardService } from "./alterationCatalog/leaderboardService.js";
import { PublicApiService } from "./alterationCatalog/publicApiService.js";
import { UpdateRequestService } from "./alterationCatalog/updateRequestService.js";

class AlterationCatalogService {
  constructor({
    repository,
    trackerClient,
    alterationGroupingConfig = {},
    logger = console,
    getLiveMonitoringService,
    getPlayerIdentityService,
    getTrackerSyncService,
  }) {
    this.repository = repository;
    this.trackerClient = trackerClient;
    this.logger = logger;
    this.getLiveMonitoringService = getLiveMonitoringService;
    this.getPlayerIdentityService = getPlayerIdentityService;
    this.getTrackerSyncService = getTrackerSyncService;
    this.alterationGroupingStore = createAlterationGroupingStore({
      filePath: alterationGroupingConfig?.filePath || "",
      logger,
    });
    this.alterationsSync = createAlterationsSyncState();

    this.catalogBrowseService = new CatalogBrowseService({
      repository,
      trackerClient,
      alterationGroupingStore: this.alterationGroupingStore,
      getPlayerIdentityService,
    });
    this.alterationSyncService = new AlterationSyncService({
      repository,
      alterationsSync: this.alterationsSync,
      getLiveMonitoringService,
    });
    this.leaderboardService = new LeaderboardService({
      repository,
      trackerClient,
      getPlayerIdentityService,
      getTrackerSyncService,
    });
    this.updateRequestService = new UpdateRequestService({
      repository,
      getTrackerSyncService,
    });
    this.publicApiService = new PublicApiService({
      repository,
      getPlayerIdentityService,
    });
  }

  get liveMonitor() {
    return this.alterationSyncService.liveMonitor;
  }

  getDashboard(options = {}) {
    return this.catalogBrowseService.getDashboard(options);
  }

  getAlterationsStats() {
    return this.catalogBrowseService.getAlterationsStats();
  }

  getAlterationsMapFilters() {
    return this.catalogBrowseService.getAlterationsMapFilters();
  }

  getConfiguredAlterations() {
    return this.catalogBrowseService.getConfiguredAlterations();
  }

  getAlterationsMaps(options = {}) {
    return this.catalogBrowseService.getAlterationsMaps(options);
  }

  getAlterationsCampaigns(options = {}) {
    return this.catalogBrowseService.getAlterationsCampaigns(options);
  }

  syncAlterations() {
    return this.alterationSyncService.syncAlterations();
  }

  getAlterationsSyncStatus() {
    return this.alterationSyncService.getAlterationsSyncStatus();
  }

  queueAlterationsSync(options = {}) {
    return this.alterationSyncService.queueAlterationsSync(options);
  }

  _resolveCampaignDbId(campaign) {
    return this.catalogBrowseService.resolveCampaignDbId(campaign);
  }

  getAlterationTypes() {
    return this.catalogBrowseService.getAlterationTypes();
  }

  getAlterationsUploads(options = {}) {
    return this.catalogBrowseService.getAlterationsUploads(options);
  }

  getAlterationsLeaderboards(options = {}) {
    return this.leaderboardService.getAlterationsLeaderboards(options);
  }

  getMonitorLeaderboardLive(options = {}) {
    return this.leaderboardService.getMonitorLeaderboardLive(options);
  }

  receiveWrWebhook(payload = {}) {
    return this.leaderboardService.receiveWrWebhook(payload);
  }

  getLatestWr(options = {}) {
    return this.leaderboardService.getLatestWr(options);
  }

  submitUpdateRequest(payload = {}) {
    return this.updateRequestService.submitUpdateRequest(payload);
  }

  listUpdateRequests(options = {}) {
    return this.updateRequestService.listUpdateRequests(options);
  }

  updateUpdateRequestStatus(payload = {}) {
    return this.updateRequestService.updateUpdateRequestStatus(payload);
  }

  getCampaignTimeline(options = {}) {
    return this.catalogBrowseService.getCampaignTimeline(options);
  }

  getHookStatus() {
    return this.catalogBrowseService.getHookStatus();
  }

  getHookMaps(options = {}) {
    return this.catalogBrowseService.getHookMaps(options);
  }

  getAdminMapsWorkspace(options = {}) {
    return this.catalogBrowseService.getAdminMapsWorkspace(options);
  }

  getHookRuns(limit = 30) {
    return this.catalogBrowseService.getHookRuns(limit);
  }

  getMapInfo(mapUid) {
    return this.catalogBrowseService.getMapInfo(mapUid);
  }

  getPublicApiCatalog() {
    return this.publicApiService.getPublicApiCatalog();
  }

  getLegacyMapInfo(mapUid) {
    return this.publicApiService.getLegacyMapInfo(mapUid);
  }

  getPublicMapDetail(mapUid, options = {}) {
    return this.publicApiService.getPublicMapDetail(mapUid, options);
  }

  recordPublicApiRequest(request = {}) {
    return this.publicApiService.recordPublicApiRequest(request);
  }

  getPublicApiUsageSummary(options = {}) {
    return this.publicApiService.getPublicApiUsageSummary(options);
  }
}

export { AlterationCatalogService };
