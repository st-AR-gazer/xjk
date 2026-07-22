class DiscoverySnapshotPublisher {
  constructor({ repository, getPlayerIdentityService, getProjectSourceService }) {
    this.repository = repository;
    this.getPlayerIdentityService = getPlayerIdentityService;
    this.getProjectSourceService = getProjectSourceService;
  }

  get trackerIntegrations() {
    return this.getPlayerIdentityService().trackerIntegrations;
  }

  async publish({ clubId, clubName, campaigns, activities, uploadBuckets, reason, onProgress }) {
    const playerIdentityService = this.getPlayerIdentityService();
    const useClubRelay = playerIdentityService.shouldUseClubRelay();
    let monitoringRelay = null;
    if (useClubRelay) {
      monitoringRelay = await playerIdentityService.relayClubSnapshotToTrackerClub({
        club: { id: clubId, name: clubName },
        campaigns,
        members: [],
        activities,
        uploadBuckets,
        observedAt: new Date().toISOString(),
      });
      if (monitoringRelay?.error && !this.trackerIntegrations.clubFallbackLocal) {
        throw new Error(monitoringRelay.error);
      }
    }

    let monitoringLocal = null;
    const shouldRunLocalMonitoring = !useClubRelay || this.trackerIntegrations.clubFallbackLocal;
    if (shouldRunLocalMonitoring && typeof this.repository?.monitoring?.upsertClubMonitoringData === "function") {
      monitoringLocal = this.repository.monitoring.upsertClubMonitoringData({
        clubId,
        members: [],
        activities,
        uploadBuckets,
      });
    }

    let sync = null;
    if (campaigns.length > 0 || uploadBuckets.length > 0) {
      sync = await this.getProjectSourceService().syncHookSnapshot(
        {
          club: { id: clubId, name: clubName },
          campaigns,
          uploadBuckets,
          sourceLabel: "altered-live-discovery",
          note: `live-discovery:${reason}`,
        },
        {
          onProgress,
          relayClubSnapshot: false,
        }
      );
    }

    let mapperNames = null;
    if (campaigns.length > 0) {
      mapperNames = await playerIdentityService.syncMapperNamesForCampaigns({
        campaigns,
        note: `live-discovery:${reason}`,
      });
    }

    return {
      monitoring: {
        local: monitoringLocal || null,
        relay: monitoringRelay || null,
      },
      monitoringStored: (monitoringLocal && !monitoringLocal.error) || (monitoringRelay && !monitoringRelay.error),
      sync,
      mapperNames,
    };
  }
}

export { DiscoverySnapshotPublisher };
