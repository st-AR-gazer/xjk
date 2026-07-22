import { clampInt, uniqueBy } from "../serviceSupport.js";
import { ClubContentDiscoveryPipeline } from "./clubContentDiscoveryPipeline.js";
import { MonitorDiscoveryCycleRunner } from "./monitorDiscoveryCycleRunner.js";
import { MonitorSyncCycleRunner } from "./monitorSyncCycleRunner.js";

class MonitorCycleService {
  constructor({
    repository,
    liveMonitor,
    logger,
    getAlterationCatalogService,
    getMapCopy,
    getPlayerIdentityService,
    getProjectSourceService,
    resolveLiveClient,
    fetchAllClubActivities,
    syncLiveClubSnapshot,
    updateLiveProgress,
    contentDiscoveryPipeline = null,
  }) {
    this.repository = repository;
    this.liveMonitor = liveMonitor;
    this.getMapCopy = getMapCopy;
    this.getPlayerIdentityService = getPlayerIdentityService;
    this.getProjectSourceService = getProjectSourceService;
    this.contentDiscoveryPipeline = contentDiscoveryPipeline || new ClubContentDiscoveryPipeline();

    this.syncRunner = new MonitorSyncCycleRunner({
      liveMonitor,
      logger,
      getMapCopy,
      getAlterationCatalogService,
      getProjectClubsForSync: () => this.getProjectClubsForSync(),
      syncLiveClubSnapshot,
      updateLiveProgress,
    });
    this.discoveryRunner = new MonitorDiscoveryCycleRunner({
      repository,
      liveMonitor,
      logger,
      getMapCopy,
      getPlayerIdentityService,
      getProjectSourceService,
      resolveLiveClient,
      fetchAllClubActivities,
      contentDiscoveryPipeline: this.contentDiscoveryPipeline,
      updateLiveProgress,
    });
  }

  get mapCopy() {
    return this.getMapCopy();
  }

  get trackerIntegrations() {
    return this.getPlayerIdentityService().trackerIntegrations;
  }

  getProjectClubsForSync() {
    const clubs = this.getProjectSourceService().getProjectClubs({ includeDisabled: false });
    const primaryClubId = clampInt(this.liveMonitor.clubId, {
      min: 1,
      max: 2147483647,
      fallback: 0,
    });
    const primaryHook = clubs.find((club) => Number(club?.clubId || 0) === primaryClubId) ||
      this.repository.configuration.getHookConfig("altered-club") || {
        hookKey: "altered-club",
        clubId: primaryClubId,
        clubName: `Club ${primaryClubId}`,
        sourceLabel: "altered-live-monitor",
        enabled: true,
        autoTrackNewMaps: true,
      };

    return uniqueBy(
      [primaryHook, ...clubs].filter((club) => Number(club?.clubId || 0) > 0),
      (club) => Number(club.clubId || 0)
    ).map((club) => ({
      ...club,
      primary: Number(club?.clubId || 0) === primaryClubId || String(club?.hookKey || "") === "altered-club",
    }));
  }

  runLiveMonitorCycle(...args) {
    return this.syncRunner.run(...args);
  }

  runLiveDiscoveryCycle(...args) {
    return this.discoveryRunner.run(...args);
  }
}

export { MonitorCycleService };
