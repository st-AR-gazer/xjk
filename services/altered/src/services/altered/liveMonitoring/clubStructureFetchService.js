import { asArray, firstTruthy, parseOptionalBoolean, toText } from "../serviceSupport.js";

class ClubStructureFetchService {
  constructor({ repository, authenticationStage, activityStage, contentDiscoveryPipeline }) {
    this.repository = repository;
    this.authenticationStage = authenticationStage;
    this.activityStage = activityStage;
    this.contentDiscoveryPipeline = contentDiscoveryPipeline;
  }

  createProgressContext(options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    const knownMapNameCache = new Map();
    const resolveMap = (map = {}) => {
      const mapUid = toText(map?.uid || map?.mapUid || map?.map_uid);
      let mapName = toText(map?.name || map?.mapName || map?.title);
      if ((!mapName || (mapUid && mapName === mapUid)) && mapUid) {
        const cacheKey = mapUid.toLowerCase();
        if (!knownMapNameCache.has(cacheKey) && typeof this.repository?.maps?.getMapInfo === "function") {
          const known = this.repository.maps.getMapInfo(mapUid);
          knownMapNameCache.set(cacheKey, toText(known?.map?.name || known?.map?.mapName || ""));
        }
        mapName = toText(knownMapNameCache.get(cacheKey)) || mapName;
      }
      return {
        mapUid: mapUid || null,
        mapName: mapName || mapUid || "Unknown map",
      };
    };

    return {
      report: (partial) => onProgress?.(partial),
      resolveMap,
      previewMaps: (maps = []) =>
        (Array.isArray(maps) ? maps : [])
          .slice(0, 6)
          .map(resolveMap)
          .filter((entry) => entry.mapUid || entry.mapName),
    };
  }

  async loadFoundation(options, progress) {
    progress.report({
      phase: "auth",
      percent: 1,
      message: "Resolving Nadeo Live auth context.",
    });
    const resolvedClient = await this.authenticationStage.resolveLiveClient(options);
    if (resolvedClient.error) return resolvedClient;

    const resolvedOptions = this.authenticationStage.resolveLiveOptions(options);
    const { clubId } = resolvedOptions;
    progress.report({
      phase: "fetch-club",
      percent: 4,
      message: `Fetching club ${clubId} metadata.`,
      counters: { clubId },
    });
    const clubPayload = await resolvedClient.liveClient.getClubById(clubId);
    const clubName = firstTruthy([clubPayload?.name, clubPayload?.clubName, `Club ${clubId}`]);
    const campaignEntries = [
      ...asArray(clubPayload?.campaigns),
      ...asArray(clubPayload?.campaignList),
      ...asArray(clubPayload?.clubCampaigns),
    ];
    progress.report({
      phase: "fetch-club",
      percent: 7,
      message: `Loaded club metadata for ${clubName}.`,
      counters: {
        clubId,
        clubName,
        clubCampaignEntries: campaignEntries.length,
      },
    });

    progress.report({
      phase: "fetch-activities",
      percent: 8,
      message: "Fetching paginated club activities.",
    });
    const activityResult = await this.activityStage.fetchAllActivities(resolvedClient.liveClient, clubId, {
      ...resolvedOptions,
      onPageLoaded: ({ page, offset, totalLoaded, pageSize, activeOnly, forcedFallback }) => {
        progress.report({
          phase: "fetch-activities",
          percent: Math.min(24, 8 + page),
          message: forcedFallback
            ? `Loaded activity page ${page} (${pageSize} records) with active=true fallback.`
            : `Loaded activity page ${page} (${pageSize} records).`,
          counters: {
            activityPagesLoaded: page,
            activityOffset: offset,
            activityLastPageSize: pageSize,
            activitiesSeen: totalLoaded,
            activeOnlyUsed: Boolean(activeOnly),
            activityFallbackApplied: Boolean(forcedFallback),
          },
        });
      },
    });

    return {
      ...resolvedClient,
      resolvedOptions,
      clubId,
      clubPayload,
      clubName,
      campaignEntries,
      activityResult,
      activities: activityResult.activities,
    };
  }

  async loadMembers(foundation, warnings, progress) {
    progress.report({
      phase: "fetch-members",
      percent: 25,
      message: "Fetching club member list.",
    });
    try {
      const result = await this.activityStage.fetchAllMembers(foundation.liveClient, foundation.clubId, {
        pageSize: foundation.resolvedOptions.activityPageSize,
        onPageLoaded: ({ page, pageSize, totalLoaded }) => {
          progress.report({
            phase: "fetch-members",
            percent: Math.min(29, 25 + page),
            message: `Loaded member page ${page} (${pageSize} records).`,
            counters: {
              memberPagesLoaded: page,
              membersLoaded: totalLoaded,
            },
          });
        },
      });
      return {
        members: result.members,
        memberPagesLoaded: Number(result.pagesLoaded || 0),
      };
    } catch (error) {
      warnings.push(`club members: ${error?.message || "failed to load members"}`);
      return { members: [], memberPagesLoaded: 0 };
    }
  }

  async loadUploadCatalog(foundation, warnings, progress) {
    progress.report({
      phase: "fetch-uploads",
      percent: 30,
      message: "Fetching upload buckets and recent upload activity.",
    });
    try {
      const result = await this.activityStage.fetchAllUploadBuckets(foundation.liveClient, foundation.clubId, {
        pageSize: foundation.resolvedOptions.activityPageSize,
        onPageLoaded: ({ page, pageSize, totalLoaded }) => {
          progress.report({
            phase: "fetch-uploads",
            percent: Math.min(34, 30 + page),
            message: `Loaded upload bucket page ${page} (${pageSize} records).`,
            counters: {
              uploadBucketPagesLoaded: page,
              uploadBucketsLoaded: totalLoaded,
            },
          });
        },
      });
      return {
        catalogBuckets: result.buckets,
        uploadBucketPagesLoaded: Number(result.pagesLoaded || 0),
      };
    } catch (error) {
      warnings.push(`upload buckets: ${error?.message || "failed to load upload buckets"}`);
      return { catalogBuckets: [], uploadBucketPagesLoaded: 0 };
    }
  }

  async discoverContent({ foundation, memberResult, uploadCatalog, warnings, campaignErrors, progress }) {
    const candidates = this.contentDiscoveryPipeline.collectUploadCandidates({
      activities: foundation.activities,
      catalogBuckets: uploadCatalog.catalogBuckets,
    });
    const descriptors = this.contentDiscoveryPipeline.collectCampaignDescriptors({
      activities: foundation.activities,
      campaignEntries: foundation.campaignEntries,
    });

    const discovered = await this.contentDiscoveryPipeline.discover({
      liveClient: foundation.liveClient,
      clubId: foundation.clubId,
      uploads: {
        candidates,
        onHydrationWarning: ({ bucketId, error }) => {
          if (warnings.length < 250) {
            warnings.push(`upload bucket ${bucketId}: ${error?.message || "failed to load details"}`);
          }
        },
        onBucketProcessed: ({ index, total, detailsLoaded }) => {
          progress.report({
            phase: "fetch-uploads",
            percent: total > 0 ? 30 + Math.floor((index / total) * 4) : 34,
            message: `Loaded upload bucket details (${index}/${total}).`,
            counters: {
              uploadBucketsLoaded: total,
              uploadBucketDetailsLoaded: detailsLoaded,
            },
          });
        },
      },
      campaigns: {
        descriptors,
        keepCampaign: (campaign) => campaign.maps.length > 0,
        recoverHydrationError: ({ descriptor, error }) => {
          if (campaignErrors.length < 250) {
            campaignErrors.push(`campaign ${descriptor.campaignId}: ${error?.message || "failed to load details"}`);
          }
        },
        onCampaignProcessed: ({
          campaign,
          descriptor,
          index,
          total,
          campaignsWithMaps,
          mapsFromCampaigns,
          mapUidsDiscovered,
        }) => {
          const currentMap = campaign.maps.length ? progress.resolveMap(campaign.maps[0]) : null;
          progress.report({
            phase: "fetch-campaigns",
            percent: total > 0 ? 35 + Math.floor((index / total) * 23) : 58,
            message: `Loaded campaign details (${index}/${total}).`,
            currentMapUid: currentMap?.mapUid || null,
            currentMapName: currentMap?.mapName || "",
            currentMaps: progress.previewMaps(campaign.maps),
            counters: {
              campaignsSeen: total,
              campaignsProcessed: index,
              campaignsWithMaps,
              campaignErrors: campaignErrors.length,
              mapsFromCampaigns,
              mapUidsDiscovered,
              currentCampaignName: campaign.name,
              currentCampaignId: campaign.campaignId || descriptor.campaignId || null,
              currentCampaignMapCount: campaign.maps.length,
            },
          });
        },
      },
      maps: {
        fetchMapDetails: foundation.resolvedOptions.fetchMapDetails,
        onPrepared: ({ campaigns, mapUids }) => {
          progress.report({
            phase: "prepare-map-details",
            percent: 59,
            message: `Prepared ${mapUids.length} unique map UIDs.`,
            counters: {
              campaignsLoaded: campaigns.length,
              mapUidsDiscovered: mapUids.length,
              mapDetailsRequested: foundation.resolvedOptions.fetchMapDetails ? mapUids.length : 0,
              mapDetailChunksTotal: foundation.resolvedOptions.fetchMapDetails ? Math.ceil(mapUids.length / 100) : 0,
            },
          });
        },
        onChunk: (chunk) => this.reportMapChunk(chunk, progress),
      },
      lifecycle: {
        uploadsDiscovered: (uploadResult) => {
          progress.report({
            phase: "fetch-campaigns",
            percent: 35,
            message: `Discovered ${descriptors.length} campaign descriptors.`,
            counters: {
              clubCampaignEntries: foundation.campaignEntries.length,
              activityPagesLoaded: Number(foundation.activityResult.pagesLoaded || 0),
              activitiesSeen: foundation.activities.length,
              membersLoaded: memberResult.members.length,
              uploadBucketsLoaded: uploadResult.uploadBuckets.length,
              uploadMapsLoaded: uploadResult.uploadMapsLoaded,
              campaignsSeen: descriptors.length,
            },
          });
        },
      },
    });

    return { descriptors, discovered };
  }

  reportMapChunk(chunk, progress) {
    const {
      index,
      total,
      loadedCount,
      chunkSize,
      requestedCount,
      firstUid,
      lastUid,
      currentMapUid,
      currentMapName,
      currentMaps,
    } = chunk;
    progress.report({
      phase: "fetch-map-details",
      percent: 59 + Math.floor((index / Math.max(total, 1)) * 19),
      message: `Fetched map metadata chunks (${index}/${total}).`,
      currentMapUid: toText(currentMapUid) || null,
      currentMapName: toText(currentMapName) || "",
      currentMaps: progress.previewMaps(currentMaps),
      counters: {
        mapDetailChunksTotal: total,
        mapDetailChunksLoaded: index,
        mapDetailChunkSize: chunkSize,
        mapDetailsRequested: requestedCount,
        mapDetailsLoaded: loadedCount,
        mapDetailFirstUid: firstUid || "",
        mapDetailLastUid: lastUid || "",
      },
    });
  }

  buildSummary({ foundation, memberResult, uploadCatalog, descriptors, discovered }) {
    const mapCount = discovered.campaigns.reduce((sum, campaign) => sum + campaign.maps.length, 0);
    const mapUidCount = discovered.mapUids.length;
    const fetchMapDetails = foundation.resolvedOptions.fetchMapDetails;
    return {
      clubId: foundation.clubId,
      clubName: foundation.clubName,
      clubCampaignEntries: foundation.campaignEntries.length,
      activityPagesLoaded: Number(foundation.activityResult.pagesLoaded || 0),
      activitiesSeen: foundation.activities.length,
      campaignsSeen: descriptors.length,
      campaignsLoaded: discovered.campaigns.length,
      campaignsWithMaps: discovered.campaignsWithMaps,
      mapsLoaded: mapCount,
      mapUidsDiscovered: mapUidCount,
      membersLoaded: memberResult.members.length,
      memberPagesLoaded: memberResult.memberPagesLoaded,
      uploadBucketsLoaded: discovered.uploadBuckets.length,
      uploadBucketPagesLoaded: uploadCatalog.uploadBucketPagesLoaded,
      uploadBucketDetailsLoaded: discovered.uploadBucketDetailsLoaded,
      uploadMapsLoaded: discovered.uploadMapsLoaded,
      mapDetailsRequested: fetchMapDetails ? mapUidCount : 0,
      mapDetailsLoaded: discovered.mapDetailsByUid.size,
      mapDetailsCoveragePercent:
        fetchMapDetails && mapUidCount
          ? Math.floor((discovered.mapDetailsByUid.size / mapUidCount) * 100)
          : fetchMapDetails
            ? 0
            : 100,
      fetchMapDetails,
      activeOnlyRequested: foundation.resolvedOptions.activeOnly,
      activeOnlyUsed: foundation.activityResult.effectiveActiveOnly,
      activityFallbackApplied: foundation.activityResult.forcedActiveOnlyFallback,
      authSource: foundation.authSource,
      authWarning: foundation.warning || null,
    };
  }

  buildResponse({ options, foundation, memberResult, discovered, summary, warnings }) {
    if (parseOptionalBoolean(options.summaryOnly) === true) {
      return {
        club: { id: foundation.clubId, name: foundation.clubName },
        summary,
        warnings,
        campaignSample: discovered.campaigns.slice(0, 20).map((campaign) => ({
          name: campaign.name,
          campaignId: campaign.campaignId || null,
          mapCount: campaign.maps.length,
        })),
        memberSample: memberResult.members.slice(0, 20),
        uploadBucketSample: discovered.uploadBuckets.slice(0, 20).map((bucket) => ({
          bucketId: bucket.bucketId || null,
          name: bucket.name || "",
          bucketType: bucket.bucketType || "map",
          mapCount: Number(bucket.mapCount || 0),
          mapsSeen: Array.isArray(bucket.maps) ? bucket.maps.length : 0,
        })),
      };
    }

    return {
      club: {
        id: foundation.clubId,
        name: foundation.clubName,
        raw: foundation.clubPayload,
      },
      campaigns: discovered.campaigns,
      activities: foundation.activities,
      members: memberResult.members,
      uploadBuckets: discovered.uploadBuckets,
      summary,
      warnings,
    };
  }

  async fetch(options = {}) {
    const progress = this.createProgressContext(options);
    const foundation = await this.loadFoundation(options, progress);
    if (foundation.error) return { error: foundation.error };

    const fetchWarnings = [];
    const campaignErrors = [];
    const memberResult = await this.loadMembers(foundation, fetchWarnings, progress);
    const uploadCatalog = await this.loadUploadCatalog(foundation, fetchWarnings, progress);
    const { descriptors, discovered } = await this.discoverContent({
      foundation,
      memberResult,
      uploadCatalog,
      warnings: fetchWarnings,
      campaignErrors,
      progress,
    });
    const summary = this.buildSummary({ foundation, memberResult, uploadCatalog, descriptors, discovered });
    progress.report({
      phase: "fetch-complete",
      percent: 79,
      message: `Fetched ${summary.campaignsLoaded} campaigns and ${summary.mapsLoaded} maps.`,
      counters: {
        ...summary,
        campaignErrors: campaignErrors.length,
      },
    });

    const warnings = [...fetchWarnings, ...campaignErrors];
    if (foundation.activityResult.forcedActiveOnlyFallback) {
      warnings.unshift("Activity endpoint returned player:error-notFound for active=false; retried with active=true.");
    }
    return this.buildResponse({ options, foundation, memberResult, discovered, summary, warnings });
  }
}

export { ClubStructureFetchService };
