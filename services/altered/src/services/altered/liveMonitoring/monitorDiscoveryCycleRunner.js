import { extractActivityId, firstPositiveInt, firstTruthy, uniqueBy } from "../serviceSupport.js";
import { DiscoverySnapshotPublisher } from "./discoverySnapshotPublisher.js";

class MonitorDiscoveryCycleRunner {
  constructor({
    repository,
    liveMonitor,
    logger,
    getMapCopy,
    getPlayerIdentityService,
    getProjectSourceService,
    resolveLiveClient,
    fetchAllClubActivities,
    contentDiscoveryPipeline,
    updateLiveProgress,
  }) {
    this.repository = repository;
    this.liveMonitor = liveMonitor;
    this.logger = logger;
    this.getMapCopy = getMapCopy;
    this.resolveLiveClient = resolveLiveClient;
    this.fetchAllClubActivities = fetchAllClubActivities;
    this.contentDiscoveryPipeline = contentDiscoveryPipeline;
    this.updateLiveProgress = updateLiveProgress;
    this.publisher = new DiscoverySnapshotPublisher({
      repository,
      getPlayerIdentityService,
      getProjectSourceService,
    });
  }

  getSkipResult() {
    if (this.getMapCopy().running) {
      return { skipped: true, reason: "map-local-copy-backfill running" };
    }
    if (this.liveMonitor.running || this.liveMonitor.discoveryRunning) {
      return { skipped: true, reason: "monitor already running" };
    }
    return null;
  }

  start(reason) {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    this.liveMonitor.discoveryRunning = true;
    this.liveMonitor.lastDiscoveryStartedAt = startedAt;
    this.liveMonitor.lastDiscoveryDurationMs = null;
    this.liveMonitor.lastDiscoveryError = null;
    this.updateLiveProgress({
      reason,
      status: "running",
      phase: "discovery-auth",
      percent: 0,
      startedAt,
      finishedAt: null,
      message: "Starting hourly discovery cycle.",
      counters: {},
      replaceCounters: true,
    });
    return { startedAt, startedMs };
  }

  async loadActivitySnapshot({ reason, authContext }) {
    const resolvedClient = await this.resolveLiveClient({ authContext });
    if (resolvedClient.error) throw new Error(resolvedClient.error);

    const liveClient = resolvedClient.liveClient;
    const clubId = this.liveMonitor.clubId;
    const pageSize = this.liveMonitor.discoveryActivityPageSize;
    this.updateLiveProgress({
      reason,
      status: "running",
      phase: "discovery-activities",
      percent: 8,
      message: `Loading latest activity page for club ${clubId}.`,
      counters: {
        clubId,
        activityPageSize: pageSize,
        discoveryCampaignLimit: this.liveMonitor.discoveryCampaignLimit,
        authSource: resolvedClient.authSource,
      },
    });

    const clubPayload = await liveClient.getClubById(clubId);
    const clubName = firstTruthy([clubPayload?.name, clubPayload?.clubName, `Club ${clubId}`]);
    const activityResult = await this.fetchAllClubActivities(liveClient, clubId, {
      activityPageSize: pageSize,
      activeOnly: this.liveMonitor.activeOnly,
      maxPages: 1,
    });
    const activities = activityResult.activities;
    const activityIds = uniqueBy(
      activities.map((activity) => extractActivityId(activity)).filter((activityId) => Number(activityId) > 0),
      (activityId) => activityId
    );
    const knownActivityIds = new Set(this.repository.monitoring.getKnownActivityIds({ clubId, activityIds }));

    return {
      liveClient,
      authSource: resolvedClient.authSource,
      clubId,
      clubName,
      activities,
      newActivityCount: activityIds.filter((activityId) => !knownActivityIds.has(activityId)).length,
    };
  }

  buildDiscoveryPlans(snapshot) {
    const uploadCandidates = this.contentDiscoveryPipeline.collectUploadCandidates({
      activities: snapshot.activities,
    });
    const uploadBucketIds = uploadCandidates
      .map((bucket) => firstPositiveInt([bucket?.bucketId]))
      .filter((bucketId) => bucketId > 0);
    const knownUploadBucketIds = new Set(
      this.repository.monitoring.getKnownUploadBucketIds({
        clubId: snapshot.clubId,
        bucketIds: uploadBucketIds,
      })
    );

    const latestDescriptors = this.contentDiscoveryPipeline
      .collectCampaignDescriptors({ activities: snapshot.activities })
      .sort((left, right) => Number(right?.activityId || 0) - Number(left?.activityId || 0))
      .slice(0, this.liveMonitor.discoveryCampaignLimit);
    const campaignIds = latestDescriptors
      .map((descriptor) => firstPositiveInt([descriptor?.campaignId]))
      .filter((campaignId) => campaignId > 0);
    const knownCampaignIds = new Set(
      this.repository.monitoring.getKnownCampaignExternalIds({
        clubId: snapshot.clubId,
        campaignExternalIds: campaignIds,
      })
    );
    const newCampaignDescriptors = latestDescriptors.filter((descriptor) => {
      const campaignId = firstPositiveInt([descriptor?.campaignId]);
      return campaignId > 0 && !knownCampaignIds.has(campaignId);
    });

    return {
      uploadCandidates,
      knownUploadBucketIds,
      latestDescriptors,
      newCampaignDescriptors,
    };
  }

  async discoverContent({ reason, snapshot, plans }) {
    return this.contentDiscoveryPipeline.discover({
      liveClient: snapshot.liveClient,
      clubId: snapshot.clubId,
      uploads: {
        candidates: plans.uploadCandidates,
        shouldHydrate: (bucket) => {
          const bucketId = firstPositiveInt([bucket?.bucketId]);
          return bucketId > 0 && !plans.knownUploadBucketIds.has(bucketId);
        },
        onHydrationWarning: ({ bucketId, error }) => {
          this.logger.warn(
            `[altered-live] discovery: failed to hydrate upload bucket ${bucketId}: ${error?.message || error}`
          );
        },
      },
      campaigns: {
        descriptors: plans.newCampaignDescriptors,
        onCampaignProcessed: ({ index, total, mapUidsDiscovered }) => {
          this.updateLiveProgress({
            reason,
            status: "running",
            phase: "discovery-campaigns",
            percent: total > 0 ? 28 + Math.floor((index / total) * 32) : 60,
            message: `Hydrating new campaigns (${index}/${total}).`,
            counters: {
              newCampaignsDetected: total,
              newCampaignsHydrated: index,
              discoveredMapUids: mapUidsDiscovered,
            },
          });
        },
      },
      maps: {
        fetchMapDetails: this.liveMonitor.fetchMapDetails,
      },
      lifecycle: {
        uploadsDiscovered: (uploadResult) => {
          this.updateLiveProgress({
            reason,
            status: "running",
            phase: "discovery-campaigns",
            percent: 28,
            message: `Detected ${plans.newCampaignDescriptors.length} new campaigns in the latest ${plans.latestDescriptors.length}.`,
            counters: {
              activitiesSeen: snapshot.activities.length,
              newActivities: snapshot.newActivityCount,
              latestCampaignsChecked: plans.latestDescriptors.length,
              newCampaignsDetected: plans.newCampaignDescriptors.length,
              uploadBucketsSeen: uploadResult.uploadBuckets.length,
              uploadMapsSeen: uploadResult.uploadMapsLoaded,
              uploadBucketDetailsLoaded: uploadResult.uploadBucketDetailsLoaded,
            },
          });
        },
      },
    });
  }

  finishSuccess({ reason, run, snapshot, plans, discovered, published }) {
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - run.startedMs);
    const summary = {
      clubId: snapshot.clubId,
      clubName: snapshot.clubName,
      authSource: snapshot.authSource,
      activitiesSeen: snapshot.activities.length,
      newActivities: snapshot.newActivityCount,
      latestCampaignsChecked: plans.latestDescriptors.length,
      newCampaignsDetected: plans.newCampaignDescriptors.length,
      newCampaignsStored: discovered.campaigns.length,
      discoveredMapUids: discovered.mapUids.length,
      mapDetailsLoaded: discovered.mapDetailsByUid.size,
      uploadBucketsSeen: discovered.uploadBuckets.length,
      uploadMapsSeen: discovered.uploadMapsLoaded,
      uploadBucketDetailsLoaded: discovered.uploadBucketDetailsLoaded,
      monitoringStored: published.monitoringStored,
    };
    this.liveMonitor.lastDiscoverySummary = summary;
    this.liveMonitor.lastDiscoveryFinishedAt = finishedAt;
    this.liveMonitor.lastDiscoveryDurationMs = durationMs;
    this.updateLiveProgress({
      reason,
      status: "ok",
      phase: "discovery-complete",
      percent: 100,
      finishedAt,
      durationMs,
      message: `Discovery completed: ${summary.newCampaignsStored} new campaigns, ${summary.uploadBucketsSeen} upload buckets scanned.`,
      counters: { ...summary, durationMs },
    });
    return {
      summary,
      monitoring: published.monitoring,
      sync: published.sync,
      mapperNames: published.mapperNames,
    };
  }

  finishError({ reason, run, error }) {
    const message = error?.message || "Live discovery cycle failed.";
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - run.startedMs);
    this.liveMonitor.lastDiscoveryError = message;
    this.liveMonitor.lastDiscoveryFinishedAt = finishedAt;
    this.liveMonitor.lastDiscoveryDurationMs = durationMs;
    this.updateLiveProgress({
      reason,
      status: "error",
      phase: "discovery-failed",
      percent: this.liveMonitor.progress?.percent || 0,
      finishedAt,
      durationMs,
      message,
    });
    this.logger.warn(`[altered-live] discovery cycle failed: ${message}`);
    return { error: message };
  }

  async run({ reason = "hourly-discovery", authContext = null } = {}) {
    const skipped = this.getSkipResult();
    if (skipped) return skipped;
    const run = this.start(reason);

    try {
      const snapshot = await this.loadActivitySnapshot({ reason, authContext });
      const plans = this.buildDiscoveryPlans(snapshot);
      const discovered = await this.discoverContent({ reason, snapshot, plans });
      const published = await this.publisher.publish({
        clubId: snapshot.clubId,
        clubName: snapshot.clubName,
        campaigns: discovered.campaigns,
        activities: snapshot.activities,
        uploadBuckets: discovered.uploadBuckets,
        reason,
        onProgress: (partial) => this.updateLiveProgress({ reason, status: "running", ...partial }),
      });
      return this.finishSuccess({ reason, run, snapshot, plans, discovered, published });
    } catch (error) {
      return this.finishError({ reason, run, error });
    } finally {
      this.liveMonitor.discoveryRunning = false;
    }
  }
}

export { MonitorDiscoveryCycleRunner };
