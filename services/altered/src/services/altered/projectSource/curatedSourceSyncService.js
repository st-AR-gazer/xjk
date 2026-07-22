import {
  COMPETITION_SOURCE_KEY,
  COMPETITION_SOURCE_LABEL,
  COMPETITION_SOURCE_DISPLAY_NAME,
  COMPETITION_SOURCE_TYPE,
  COMPETITION_CAMPAIGN_TYPE,
  COMPETITION_SOURCE_CLUB_ID,
  DISCOVERY_SOURCE_KEY,
  DISCOVERY_SOURCE_LABEL,
  DISCOVERY_SOURCE_DISPLAY_NAME,
  DISCOVERY_SOURCE_TYPE,
  DISCOVERY_CAMPAIGN_TYPE,
  DISCOVERY_SOURCE_CLUB_ID,
  DISCOVERY_SOURCE_CAMPAIGNS,
  LEGACY_SOURCE_KEY,
  LEGACY_SOURCE_LABEL,
  LEGACY_SOURCE_DISPLAY_NAME,
  LEGACY_SOURCE_TYPE,
  LEGACY_CAMPAIGN_TYPE,
  LEGACY_SOURCE_CLUB_ID,
  LEGACY_SOURCE_CAMPAIGNS,
  toText,
  normalizeUniqueStrings,
} from "../serviceSupport.js";

async function loadCampaignMapDetails(rawCampaigns, coreClient) {
  const mapUids = normalizeUniqueStrings(
    rawCampaigns.flatMap((payload) =>
      (Array.isArray(payload?.campaign?.playlist) ? payload.campaign.playlist : []).map((entry) =>
        toText(entry?.mapUid)
      )
    )
  );
  const mapDetails = await coreClient.getCoreMapsByUidList(mapUids);
  const mapDetailsByUid = new Map(
    (Array.isArray(mapDetails) ? mapDetails : [])
      .filter((map) => toText(map?.mapUid || map?.uid))
      .map((map) => [toText(map.mapUid || map.uid).toLowerCase(), map])
  );
  return { mapUids, mapDetailsByUid };
}

class CuratedSourceSyncService {
  constructor({
    repository,
    getLiveMonitoringService,
    getMapProcessingService,
    getCompetitionSourceStatus,
    getDiscoverySourceStatus,
    getLegacySourceStatus,
    getLatestCampaignReleaseWindow,
    buildCompetitionCampaignSnapshots,
    buildDiscoveryCampaignSnapshots,
    buildLegacyCampaignSnapshots,
  }) {
    this.repository = repository;
    this.getLiveMonitoringService = getLiveMonitoringService;
    this.getMapProcessingService = getMapProcessingService;
    this.getCompetitionSourceStatus = getCompetitionSourceStatus;
    this.getDiscoverySourceStatus = getDiscoverySourceStatus;
    this.getLegacySourceStatus = getLegacySourceStatus;
    this.getLatestCampaignReleaseWindow = getLatestCampaignReleaseWindow;
    this.buildCompetitionCampaignSnapshots = buildCompetitionCampaignSnapshots;
    this.buildDiscoveryCampaignSnapshots = buildDiscoveryCampaignSnapshots;
    this.buildLegacyCampaignSnapshots = buildLegacyCampaignSnapshots;
  }

  async syncDiscoverySource({ authContext = null } = {}) {
    if (typeof this.repository?.configuration?.upsertProjectSource === "function") {
      this.repository.configuration.upsertProjectSource({
        sourceKey: DISCOVERY_SOURCE_KEY,
        sourceType: DISCOVERY_SOURCE_TYPE,
        displayName: DISCOVERY_SOURCE_DISPLAY_NAME,
        sourceLabel: DISCOVERY_SOURCE_LABEL,
        enabled: true,
        metadata: {
          campaignType: DISCOVERY_CAMPAIGN_TYPE,
          storageClubId: DISCOVERY_SOURCE_CLUB_ID,
          campaignIds: DISCOVERY_SOURCE_CAMPAIGNS.map((campaign) => campaign.campaignId),
        },
      });
    }

    const resolvedLive = await this.getLiveMonitoringService().resolveLiveClient({ authContext });
    if (resolvedLive?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: DISCOVERY_SOURCE_KEY,
        sourceType: DISCOVERY_SOURCE_TYPE,
        displayName: DISCOVERY_SOURCE_DISPLAY_NAME,
        sourceLabel: DISCOVERY_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedLive.error,
      });
      return { error: resolvedLive.error };
    }

    const resolvedCore = await this.getLiveMonitoringService().resolveCoreMapClient({ authContext });
    if (resolvedCore?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: DISCOVERY_SOURCE_KEY,
        sourceType: DISCOVERY_SOURCE_TYPE,
        displayName: DISCOVERY_SOURCE_DISPLAY_NAME,
        sourceLabel: DISCOVERY_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedCore.error,
      });
      return { error: resolvedCore.error };
    }

    const rawCampaigns = [];
    for (const descriptor of DISCOVERY_SOURCE_CAMPAIGNS) {
      try {
        const payload = await resolvedLive.liveClient.getClubCampaignById(
          DISCOVERY_SOURCE_CLUB_ID,
          descriptor.campaignId
        );
        rawCampaigns.push(payload);
      } catch (error) {
        return {
          error: error?.message || `Failed to load discovery campaign ${descriptor.campaignId}.`,
        };
      }
    }

    const { mapUids, mapDetailsByUid } = await loadCampaignMapDetails(rawCampaigns, resolvedCore.coreClient);
    const campaigns = this.buildDiscoveryCampaignSnapshots(rawCampaigns, mapDetailsByUid);
    const ingest = campaigns.length
      ? this.repository.ingestion.ingestProjectSourceSnapshot({
          sourceKey: DISCOVERY_SOURCE_KEY,
          sourceType: DISCOVERY_SOURCE_TYPE,
          displayName: DISCOVERY_SOURCE_DISPLAY_NAME,
          sourceLabel: DISCOVERY_SOURCE_LABEL,
          campaignType: DISCOVERY_CAMPAIGN_TYPE,
          clubId: 0,
          campaigns,
          note: "official-discovery-sync",
          trackedDefault: false,
        })
      : null;
    if (ingest?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: DISCOVERY_SOURCE_KEY,
        sourceType: DISCOVERY_SOURCE_TYPE,
        displayName: DISCOVERY_SOURCE_DISPLAY_NAME,
        sourceLabel: DISCOVERY_SOURCE_LABEL,
        enabled: true,
        lastError: ingest.error,
      });
      return ingest;
    }

    const touchedMapUids = this.getMapProcessingService().collectCampaignSnapshotMapUids(campaigns);
    const automaticNaming = await this.getMapProcessingService().runAutomaticNamingAssignments({
      mapUids: touchedMapUids,
      persistCandidates: true,
    });

    this.repository.configuration.upsertProjectSource({
      sourceKey: DISCOVERY_SOURCE_KEY,
      sourceType: DISCOVERY_SOURCE_TYPE,
      displayName: DISCOVERY_SOURCE_DISPLAY_NAME,
      sourceLabel: DISCOVERY_SOURCE_LABEL,
      enabled: true,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      summary: {
        campaignCount: Number(ingest?.campaignsSeen || campaigns.length || 0),
        mapCount: Number(ingest?.mapsSeen || mapUids.length || 0),
        trackedCount: 0,
        metadataAssignment: automaticNaming.metadataAssignment,
        namingAssignment: automaticNaming.namingAssignment,
        authSource: resolvedLive?.authSource || resolvedCore?.authSource || null,
        ...this.getLatestCampaignReleaseWindow(rawCampaigns.map((payload) => payload?.campaign || payload)),
      },
      metadata: {
        campaignType: DISCOVERY_CAMPAIGN_TYPE,
        storageClubId: DISCOVERY_SOURCE_CLUB_ID,
        campaignIds: DISCOVERY_SOURCE_CAMPAIGNS.map((campaign) => campaign.campaignId),
      },
    });

    return {
      ok: true,
      source: this.getDiscoverySourceStatus(),
      campaigns,
      ingest,
      metadataAssignment: automaticNaming.metadataAssignment,
      namingAssignment: automaticNaming.namingAssignment,
    };
  }

  async syncLegacySource({ authContext = null } = {}) {
    if (typeof this.repository?.configuration?.upsertProjectSource === "function") {
      this.repository.configuration.upsertProjectSource({
        sourceKey: LEGACY_SOURCE_KEY,
        sourceType: LEGACY_SOURCE_TYPE,
        displayName: LEGACY_SOURCE_DISPLAY_NAME,
        sourceLabel: LEGACY_SOURCE_LABEL,
        enabled: true,
        metadata: {
          campaignType: LEGACY_CAMPAIGN_TYPE,
          storageClubId: LEGACY_SOURCE_CLUB_ID,
          campaignIds: LEGACY_SOURCE_CAMPAIGNS.map((campaign) => campaign.campaignId),
        },
      });
    }

    const resolvedLive = await this.getLiveMonitoringService().resolveLiveClient({ authContext });
    if (resolvedLive?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: LEGACY_SOURCE_KEY,
        sourceType: LEGACY_SOURCE_TYPE,
        displayName: LEGACY_SOURCE_DISPLAY_NAME,
        sourceLabel: LEGACY_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedLive.error,
      });
      return { error: resolvedLive.error };
    }

    const resolvedCore = await this.getLiveMonitoringService().resolveCoreMapClient({ authContext });
    if (resolvedCore?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: LEGACY_SOURCE_KEY,
        sourceType: LEGACY_SOURCE_TYPE,
        displayName: LEGACY_SOURCE_DISPLAY_NAME,
        sourceLabel: LEGACY_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedCore.error,
      });
      return { error: resolvedCore.error };
    }

    const rawCampaigns = [];
    for (const descriptor of LEGACY_SOURCE_CAMPAIGNS) {
      try {
        const payload = await resolvedLive.liveClient.getClubCampaignById(LEGACY_SOURCE_CLUB_ID, descriptor.campaignId);
        rawCampaigns.push(payload);
      } catch (error) {
        return {
          error: error?.message || `Failed to load legacy campaign ${descriptor.campaignId}.`,
        };
      }
    }

    const { mapUids, mapDetailsByUid } = await loadCampaignMapDetails(rawCampaigns, resolvedCore.coreClient);
    const campaigns = this.buildLegacyCampaignSnapshots(rawCampaigns, mapDetailsByUid);
    const ingest = campaigns.length
      ? this.repository.ingestion.ingestProjectSourceSnapshot({
          sourceKey: LEGACY_SOURCE_KEY,
          sourceType: LEGACY_SOURCE_TYPE,
          displayName: LEGACY_SOURCE_DISPLAY_NAME,
          sourceLabel: LEGACY_SOURCE_LABEL,
          campaignType: LEGACY_CAMPAIGN_TYPE,
          clubId: 0,
          campaigns,
          note: "official-legacy-sync",
          trackedDefault: false,
        })
      : null;
    if (ingest?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: LEGACY_SOURCE_KEY,
        sourceType: LEGACY_SOURCE_TYPE,
        displayName: LEGACY_SOURCE_DISPLAY_NAME,
        sourceLabel: LEGACY_SOURCE_LABEL,
        enabled: true,
        lastError: ingest.error,
      });
      return ingest;
    }

    const touchedMapUids = this.getMapProcessingService().collectCampaignSnapshotMapUids(campaigns);
    const automaticNaming = await this.getMapProcessingService().runAutomaticNamingAssignments({
      mapUids: touchedMapUids,
      persistCandidates: true,
    });

    this.repository.configuration.upsertProjectSource({
      sourceKey: LEGACY_SOURCE_KEY,
      sourceType: LEGACY_SOURCE_TYPE,
      displayName: LEGACY_SOURCE_DISPLAY_NAME,
      sourceLabel: LEGACY_SOURCE_LABEL,
      enabled: true,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      summary: {
        campaignCount: Number(ingest?.campaignsSeen || campaigns.length || 0),
        mapCount: Number(ingest?.mapsSeen || mapUids.length || 0),
        trackedCount: 0,
        metadataAssignment: automaticNaming.metadataAssignment,
        namingAssignment: automaticNaming.namingAssignment,
        authSource: resolvedLive?.authSource || resolvedCore?.authSource || null,
        ...this.getLatestCampaignReleaseWindow(rawCampaigns.map((payload) => payload?.campaign || payload)),
      },
      metadata: {
        campaignType: LEGACY_CAMPAIGN_TYPE,
        storageClubId: LEGACY_SOURCE_CLUB_ID,
        campaignIds: LEGACY_SOURCE_CAMPAIGNS.map((campaign) => campaign.campaignId),
      },
    });

    return {
      ok: true,
      source: this.getLegacySourceStatus(),
      campaigns,
      ingest,
      metadataAssignment: automaticNaming.metadataAssignment,
      namingAssignment: automaticNaming.namingAssignment,
    };
  }

  async syncCompetitionSource({ authContext = null } = {}) {
    if (typeof this.repository?.configuration?.upsertProjectSource === "function") {
      this.repository.configuration.upsertProjectSource({
        sourceKey: COMPETITION_SOURCE_KEY,
        sourceType: COMPETITION_SOURCE_TYPE,
        displayName: COMPETITION_SOURCE_DISPLAY_NAME,
        sourceLabel: COMPETITION_SOURCE_LABEL,
        enabled: true,
        metadata: {
          campaignType: COMPETITION_CAMPAIGN_TYPE,
          storageClubId: COMPETITION_SOURCE_CLUB_ID,
        },
      });
    }

    const fetched = await this.getLiveMonitoringService().fetchLiveClubStructure({
      authContext,
      clubId: COMPETITION_SOURCE_CLUB_ID,
      activeOnly: false,
      fetchMapDetails: true,
    });
    if (fetched?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: COMPETITION_SOURCE_KEY,
        sourceType: COMPETITION_SOURCE_TYPE,
        displayName: COMPETITION_SOURCE_DISPLAY_NAME,
        sourceLabel: COMPETITION_SOURCE_LABEL,
        enabled: true,
        lastError: fetched.error,
      });
      return fetched;
    }

    const campaigns = this.buildCompetitionCampaignSnapshots(fetched?.campaigns || []);
    const ingest = campaigns.length
      ? this.repository.ingestion.ingestProjectSourceSnapshot({
          sourceKey: COMPETITION_SOURCE_KEY,
          sourceType: COMPETITION_SOURCE_TYPE,
          displayName: COMPETITION_SOURCE_DISPLAY_NAME,
          sourceLabel: COMPETITION_SOURCE_LABEL,
          campaignType: COMPETITION_CAMPAIGN_TYPE,
          clubId: 0,
          campaigns,
          note: "competition-sync",
          trackedDefault: false,
        })
      : null;
    if (ingest?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: COMPETITION_SOURCE_KEY,
        sourceType: COMPETITION_SOURCE_TYPE,
        displayName: COMPETITION_SOURCE_DISPLAY_NAME,
        sourceLabel: COMPETITION_SOURCE_LABEL,
        enabled: true,
        lastError: ingest.error,
      });
      return ingest;
    }

    const touchedMapUids = this.getMapProcessingService().collectCampaignSnapshotMapUids(campaigns);
    const automaticNaming = await this.getMapProcessingService().runAutomaticNamingAssignments({
      mapUids: touchedMapUids,
      persistCandidates: true,
    });

    this.repository.configuration.upsertProjectSource({
      sourceKey: COMPETITION_SOURCE_KEY,
      sourceType: COMPETITION_SOURCE_TYPE,
      displayName: COMPETITION_SOURCE_DISPLAY_NAME,
      sourceLabel: COMPETITION_SOURCE_LABEL,
      enabled: true,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      summary: {
        campaignCount: Number(ingest?.campaignsSeen || campaigns.length || 0),
        mapCount: Number(ingest?.mapsSeen || 0),
        trackedCount: 0,
        metadataAssignment: automaticNaming.metadataAssignment,
        namingAssignment: automaticNaming.namingAssignment,
        authSource: fetched?.summary?.authSource || null,
        warnings: Array.isArray(fetched?.warnings) ? fetched.warnings.length : 0,
        clubName: toText(fetched?.club?.name) || null,
      },
      metadata: {
        campaignType: COMPETITION_CAMPAIGN_TYPE,
        storageClubId: COMPETITION_SOURCE_CLUB_ID,
      },
    });

    return {
      ok: true,
      source: this.getCompetitionSourceStatus(),
      campaigns,
      ingest,
      metadataAssignment: automaticNaming.metadataAssignment,
      namingAssignment: automaticNaming.namingAssignment,
      fetchedSummary: fetched?.summary || null,
      warnings: Array.isArray(fetched?.warnings) ? fetched.warnings : [],
    };
  }
}

export { CuratedSourceSyncService, loadCampaignMapDetails };
