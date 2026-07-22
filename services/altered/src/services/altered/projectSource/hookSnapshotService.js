import { parseOptionalBoolean, toText, asArray, firstPositiveInt } from "../serviceSupport.js";

class HookSnapshotService {
  constructor({ repository, logger, getMapProcessingService, getPlayerIdentityService, getTrackerSyncService }) {
    this.repository = repository;
    this.logger = logger;
    this.getMapProcessingService = getMapProcessingService;
    this.getPlayerIdentityService = getPlayerIdentityService;
    this.getTrackerSyncService = getTrackerSyncService;
  }

  get trackerIntegrations() {
    return this.getPlayerIdentityService().trackerIntegrations;
  }

  async syncHookSnapshot(snapshot = {}, options = {}) {
    const onProgress = typeof options?.onProgress === "function" ? options.onProgress : null;
    const relayClubSnapshotOption = parseOptionalBoolean(options?.relayClubSnapshot);
    const relayClubSnapshot = relayClubSnapshotOption === undefined ? true : Boolean(relayClubSnapshotOption);
    const snapshotCampaigns = Array.isArray(snapshot?.campaigns) ? snapshot.campaigns : [];
    const snapshotUploadBuckets = Array.isArray(snapshot?.uploadBuckets) ? snapshot.uploadBuckets : [];
    const snapshotCampaignMaps = snapshotCampaigns.reduce((sum, campaign) => {
      const count = Array.isArray(campaign?.maps) ? campaign.maps.length : 0;
      return sum + count;
    }, 0);
    const snapshotUploadMaps = snapshotUploadBuckets.reduce((sum, bucket) => {
      const count = Array.isArray(bucket?.maps) ? bucket.maps.length : 0;
      return sum + count;
    }, 0);
    const snapshotMaps = snapshotCampaignMaps + snapshotUploadMaps;
    if (onProgress) {
      onProgress({
        phase: "sync-snapshot",
        percent: 78,
        message:
          `Storing fetched club snapshot in altered database (` +
          `${snapshotCampaigns.length} campaigns, ${snapshotCampaignMaps} campaign maps, ` +
          `${snapshotUploadBuckets.length} upload buckets, ${snapshotUploadMaps} upload maps).`,
        counters: {
          campaignsToStore: snapshotCampaigns.length,
          mapsToStore: snapshotMaps,
          campaignMapsToStore: snapshotCampaignMaps,
          uploadBucketsToStore: snapshotUploadBuckets.length,
          uploadMapsToStore: snapshotUploadMaps,
        },
      });
    }
    const hookKey = toText(options?.hookKey || snapshot?.hookKey || "altered-club", "altered-club");
    const result = this.repository.ingestion.ingestHookSnapshot({
      hookKey,
      ...snapshot,
    });
    if (result?.error) return { error: result.error, details: result };

    const touchedMapUids = Array.from(
      new Set([
        ...snapshotCampaigns.flatMap((campaign) =>
          asArray(campaign?.maps).map((map) => toText(map?.uid || map?.mapUid || map?.map_uid))
        ),
        ...snapshotUploadBuckets.flatMap((bucket) =>
          asArray(bucket?.maps).map((map) => toText(map?.uid || map?.mapUid || map?.map_uid))
        ),
      ])
    ).filter(Boolean);
    const automaticNaming = await this.getMapProcessingService().runAutomaticNamingAssignments({
      mapUids: touchedMapUids,
      persistCandidates: true,
    });
    const metadataAssignment = automaticNaming.metadataAssignment;
    if (metadataAssignment?.error) {
      result.metadataWarning = metadataAssignment.error;
    } else {
      result.metadataAssignment = metadataAssignment;
    }
    const similarityAssignment = automaticNaming.namingAssignment;
    if (similarityAssignment?.ok === false) {
      result.similarityWarning = "Failed assigning map numbers from GBX content similarity.";
    } else {
      result.similarityAssignment = similarityAssignment;
    }

    let clubRelay = null;
    if (relayClubSnapshot && this.getPlayerIdentityService().shouldUseClubRelay()) {
      if (onProgress) {
        onProgress({
          phase: "relay-tracker-club",
          percent: 82,
          message: "Relaying hook snapshot to tracker-club service.",
          counters: {
            relayCampaigns: snapshotCampaigns.length,
            relayMembers: asArray(snapshot?.members).length,
            relayActivities: asArray(snapshot?.activities).length,
            relayUploadBuckets: asArray(snapshot?.uploadBuckets).length,
          },
        });
      }
      clubRelay = await this.getPlayerIdentityService().relayClubSnapshotToTrackerClub({
        club: snapshot?.club || {
          id: firstPositiveInt([snapshot?.clubId]),
          name: toText(snapshot?.clubName || ""),
        },
        campaigns: snapshotCampaigns,
        members: asArray(snapshot?.members),
        activities: asArray(snapshot?.activities),
        uploadBuckets: asArray(snapshot?.uploadBuckets),
        observedAt: new Date().toISOString(),
      });
      if (clubRelay?.error) {
        result.clubRelayWarning = clubRelay.error;
        if (!this.trackerIntegrations.clubFallbackLocal) {
          return {
            error: clubRelay.error,
            details: {
              ...result,
              clubRelay,
            },
          };
        }
      }
    }

    const mapsForTracker = Array.isArray(result.mapsForTracker) ? result.mapsForTracker : [];
    let trackerSync = { ok: true, targetCount: 0, chunkCount: 0, mapsSynced: 0 };
    if (mapsForTracker.length) {
      trackerSync = await this.getTrackerSyncService().syncMapsToTrackerInChunks(mapsForTracker, {
        onChunk: ({ index, total, mapsSynced, chunkSize, targetLabel, targetIndex, targetTotal }) => {
          if (!onProgress) return;
          const percent = 84 + Math.floor((index / Math.max(total, 1)) * 14);
          onProgress({
            phase: "sync-tracker",
            percent,
            message: `Syncing maps into ${targetLabel || "tracker"} (${index}/${total} chunks).`,
            counters: {
              trackerChunksTotal: total,
              trackerChunksSynced: index,
              trackerChunkSize: chunkSize,
              trackerMapsToSync: mapsForTracker.length,
              trackerMapsSynced: mapsSynced,
              trackerTarget: targetLabel || null,
              trackerTargetIndex: Number(targetIndex || 0),
              trackerTargetTotal: Number(targetTotal || 0),
            },
          });
        },
      });
    }
    if (!trackerSync.ok) {
      result.trackerWarning = `Snapshot stored, but tracker sync failed: ${trackerSync.error}`;
      this.logger.warn(`[altered] tracker bulk-upsert failed after snapshot sync: ${trackerSync.error}`);
    }

    if (onProgress) {
      onProgress({
        phase: "sync-finished",
        percent: 99,
        message: "Snapshot + tracker sync completed.",
        counters: {
          campaignsToStore: snapshotCampaigns.length,
          mapsToStore: snapshotMaps,
          uploadBucketsToStore: snapshotUploadBuckets.length,
          uploadMapsToStore: snapshotUploadMaps,
          campaignsStored: Number(result.campaignsSeen || 0),
          mapsStored: Number(result.mapsSeen || 0),
          mapsInserted: Number(result.mapsInserted || 0),
          mapsUpdated: Number(result.mapsUpdated || 0),
          mapsLinked: Number(result.mapsLinked || 0),
          uploadBucketsStored: Number(result.uploadBucketsSeen || 0),
          uploadMapsStored: Number(result.uploadMapsSeen || 0),
          trackerTargetsTotal: Number(trackerSync.targetCount || 0),
          trackerChunksTotal: Number(trackerSync.chunkCount || 0),
          trackerChunksSynced: Number(trackerSync.chunkCount || 0),
          trackerMapsToSync: Number(mapsForTracker.length || 0),
          trackerMapsSynced: Number(trackerSync.mapsSynced || 0),
        },
      });
    }

    return {
      synced: {
        ...result,
        clubRelay,
        trackerSync,
      },
    };
  }
}

export { HookSnapshotService };
