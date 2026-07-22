import { toText, asArray } from "../serviceSupport.js";

class ClubSyncService {
  constructor({ repository, getPlayerIdentityService, getProjectSourceService, fetchLiveClubStructure }) {
    this.repository = repository;
    this.getPlayerIdentityService = getPlayerIdentityService;
    this.getProjectSourceService = getProjectSourceService;
    this.fetchLiveClubStructure = fetchLiveClubStructure;
  }

  get trackerIntegrations() {
    return this.getPlayerIdentityService().trackerIntegrations;
  }

  async syncLiveClubSnapshot(options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    const hookKey = toText(options.hookKey || "altered-club", "altered-club");
    const fetched = await this.fetchLiveClubStructure({
      ...options,
      onProgress,
    });
    if (fetched?.error) return fetched;

    const noteSuffix = String(options.note || "").trim();
    const syncPayload = {
      hookKey,
      club: {
        id: fetched.club.id,
        name: fetched.club.name,
      },
      campaigns: fetched.campaigns,
      uploadBuckets: fetched.uploadBuckets,
      sourceLabel: options.sourceLabel || "altered-live-monitor",
      note: noteSuffix || `live-club-${fetched.club.id}`,
    };

    const syncResult = await this.getProjectSourceService().syncHookSnapshot(syncPayload, {
      onProgress,
      relayClubSnapshot: false,
      hookKey,
    });
    if (syncResult?.error) return syncResult;

    let monitoringRelay = null;
    if (this.getPlayerIdentityService().shouldUseClubRelay()) {
      if (onProgress) {
        onProgress({
          phase: "relay-tracker-club",
          percent: 85,
          message: "Relaying club snapshot to tracker-club service.",
          counters: {
            relayClubId: fetched.club.id,
            relayCampaigns: asArray(fetched.campaigns).length,
            relayMembers: asArray(fetched.members).length,
            relayActivities: asArray(fetched.activities).length,
            relayUploadBuckets: asArray(fetched.uploadBuckets).length,
          },
        });
      }
      monitoringRelay = await this.getPlayerIdentityService().relayClubSnapshotToTrackerClub({
        club: {
          id: fetched.club.id,
          name: fetched.club.name,
        },
        campaigns: fetched.campaigns,
        members: fetched.members,
        activities: fetched.activities,
        uploadBuckets: fetched.uploadBuckets,
        observedAt: new Date().toISOString(),
      });
      if (monitoringRelay?.error) {
        fetched.warnings = [...asArray(fetched.warnings), `Tracker-club relay warning: ${monitoringRelay.error}`];
        if (!this.trackerIntegrations.clubFallbackLocal) {
          return {
            error: monitoringRelay.error,
          };
        }
      }
    }

    let monitoringSync = null;
    const shouldRunLocalMonitoring =
      !this.getPlayerIdentityService().shouldUseClubRelay() || this.trackerIntegrations.clubFallbackLocal;
    if (shouldRunLocalMonitoring && typeof this.repository?.monitoring?.upsertClubMonitoringData === "function") {
      if (onProgress) {
        onProgress({
          phase: "sync-club-monitoring",
          percent: 88,
          message: "Storing club members, activities, and upload buckets.",
          counters: {
            membersToStore: Array.isArray(fetched.members) ? fetched.members.length : 0,
            activitiesToStore: Array.isArray(fetched.activities) ? fetched.activities.length : 0,
            uploadBucketsToStore: Array.isArray(fetched.uploadBuckets) ? fetched.uploadBuckets.length : 0,
          },
        });
      }
      monitoringSync = this.repository.monitoring.upsertClubMonitoringData({
        clubId: fetched.club.id,
        members: fetched.members,
        activities: fetched.activities,
        uploadBuckets: fetched.uploadBuckets,
      });
      if (monitoringSync?.error) {
        fetched.warnings = [...asArray(fetched.warnings), `Club monitoring storage warning: ${monitoringSync.error}`];
      } else if (onProgress) {
        onProgress({
          phase: "sync-club-monitoring",
          percent: 91,
          message: "Club monitoring storage completed.",
          counters: {
            membersSeen: Number(monitoringSync.membersSeen || 0),
            activitiesSeen: Number(monitoringSync.activitiesSeen || 0),
            uploadBucketsSeen: Number(monitoringSync.uploadBucketsSeen || 0),
            uploadMapsSeen: Number(monitoringSync.uploadMapsSeen || 0),
          },
        });
      }
    }

    const mapperNameSync = await this.getPlayerIdentityService().syncMapperNamesForCampaigns({
      campaigns: fetched.campaigns,
      note: noteSuffix || `live-club-${fetched.club.id}`,
      onProgress,
    });
    if (mapperNameSync?.warning) {
      fetched.warnings = [...asArray(fetched.warnings), mapperNameSync.warning];
    }

    const monitoringSummary = {
      membersSeen: Number(
        monitoringSync?.membersSeen ?? monitoringRelay?.membersSeen ?? asArray(fetched.members).length
      ),
      activitiesSeen: Number(
        monitoringSync?.activitiesSeen ?? monitoringRelay?.activitiesSeen ?? asArray(fetched.activities).length
      ),
      uploadBucketsSeen: Number(
        monitoringSync?.uploadBucketsSeen ?? monitoringRelay?.uploadsSeen ?? asArray(fetched.uploadBuckets).length
      ),
      uploadMapsSeen: Number(monitoringSync?.uploadMapsSeen ?? monitoringRelay?.uploadMapsSeen ?? 0),
      relay: monitoringRelay || null,
      local: monitoringSync || null,
    };

    return {
      fetched: {
        summary: fetched.summary,
        warnings: fetched.warnings,
      },
      synced: {
        ...syncResult.synced,
        monitoring: monitoringSummary,
        mapperNames: mapperNameSync || null,
      },
    };
  }
}

export { ClubSyncService };
