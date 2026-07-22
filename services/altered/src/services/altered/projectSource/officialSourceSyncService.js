import {
  OFFICIAL_SEASONAL_SOURCE_KEY,
  OFFICIAL_SEASONAL_SOURCE_LABEL,
  OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
  OFFICIAL_SEASONAL_SOURCE_TYPE,
  OFFICIAL_SEASONAL_CAMPAIGN_TYPE,
  TOTD_SOURCE_KEY,
  TOTD_SOURCE_LABEL,
  TOTD_SOURCE_DISPLAY_NAME,
  TOTD_SOURCE_TYPE,
  TOTD_CAMPAIGN_TYPE,
  WEEKLY_GRANDS_SOURCE_KEY,
  WEEKLY_GRANDS_SOURCE_LABEL,
  WEEKLY_GRANDS_SOURCE_DISPLAY_NAME,
  WEEKLY_GRANDS_SOURCE_TYPE,
  WEEKLY_GRANDS_CAMPAIGN_TYPE,
  OFFICIAL_SEASONAL_SOURCE_MAX_AGE_MS,
  toText,
  normalizeUniqueStrings,
} from "../serviceSupport.js";

class OfficialSourceSyncService {
  constructor({
    repository,
    getLiveMonitoringService,
    getMapProcessingService,
    getOfficialSeasonalSourceStatus,
    getTotdSourceStatus,
    getWeeklyGrandsSourceStatus,
    getCompetitionSourceStatus,
    getLatestCampaignReleaseWindow,
    getLatestTotdReleaseWindow,
    fetchAllOfficialSeasonalCampaigns,
    fetchAllTotdMonths,
    fetchAllWeeklyGrandsCampaigns,
    buildOfficialSeasonalCampaignSnapshots,
    buildTotdCampaignSnapshots,
    buildWeeklyGrandsCampaignSnapshots,
    runOfficialSeasonalSync,
    runTotdSync,
    runCompetitionSync,
  }) {
    this.repository = repository;
    this.getLiveMonitoringService = getLiveMonitoringService;
    this.getMapProcessingService = getMapProcessingService;
    this.getOfficialSeasonalSourceStatus = getOfficialSeasonalSourceStatus;
    this.getTotdSourceStatus = getTotdSourceStatus;
    this.getWeeklyGrandsSourceStatus = getWeeklyGrandsSourceStatus;
    this.getCompetitionSourceStatus = getCompetitionSourceStatus;
    this.getLatestCampaignReleaseWindow = getLatestCampaignReleaseWindow;
    this.getLatestTotdReleaseWindow = getLatestTotdReleaseWindow;
    this.fetchAllOfficialSeasonalCampaigns = fetchAllOfficialSeasonalCampaigns;
    this.fetchAllTotdMonths = fetchAllTotdMonths;
    this.fetchAllWeeklyGrandsCampaigns = fetchAllWeeklyGrandsCampaigns;
    this.buildOfficialSeasonalCampaignSnapshots = buildOfficialSeasonalCampaignSnapshots;
    this.buildTotdCampaignSnapshots = buildTotdCampaignSnapshots;
    this.buildWeeklyGrandsCampaignSnapshots = buildWeeklyGrandsCampaignSnapshots;
    this.runOfficialSeasonalSync = runOfficialSeasonalSync;
    this.runTotdSync = runTotdSync;
    this.runCompetitionSync = runCompetitionSync;
  }

  async syncOfficialSeasonalSource({ authContext = null } = {}) {
    if (typeof this.repository?.configuration?.upsertProjectSource === "function") {
      this.repository.configuration.upsertProjectSource({
        sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
        sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
        displayName: OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
        sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
        enabled: true,
        metadata: {
          campaignType: OFFICIAL_SEASONAL_CAMPAIGN_TYPE,
          storageClubId: 0,
        },
      });
    }

    const resolvedLive = await this.getLiveMonitoringService().resolveLiveClient({ authContext });
    if (resolvedLive?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
        sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
        displayName: OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
        sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedLive.error,
      });
      return { error: resolvedLive.error };
    }

    const resolvedCore = await this.getLiveMonitoringService().resolveCoreMapClient({ authContext });
    if (resolvedCore?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
        sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
        displayName: OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
        sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedCore.error,
      });
      return { error: resolvedCore.error };
    }

    const liveClient = resolvedLive.liveClient;
    const coreClient = resolvedCore.coreClient;
    const rawCampaigns = await this.fetchAllOfficialSeasonalCampaigns(liveClient, {
      length: 25,
    });
    const mapUids = normalizeUniqueStrings(
      rawCampaigns.flatMap((campaign) =>
        (Array.isArray(campaign?.playlist) ? campaign.playlist : []).map((entry) => toText(entry?.mapUid))
      )
    );
    const mapDetails = await coreClient.getCoreMapsByUidList(mapUids);
    const mapDetailsByUid = new Map(
      (Array.isArray(mapDetails) ? mapDetails : [])
        .filter((map) => toText(map?.mapUid || map?.uid))
        .map((map) => [toText(map.mapUid || map.uid).toLowerCase(), map])
    );
    const campaigns = this.buildOfficialSeasonalCampaignSnapshots(rawCampaigns, mapDetailsByUid);
    if (!campaigns.length) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
        sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
        displayName: OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
        sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
        enabled: true,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        summary: {
          campaignCount: 0,
          mapCount: 0,
          trackedCount: 0,
        },
        metadata: {
          campaignType: OFFICIAL_SEASONAL_CAMPAIGN_TYPE,
          storageClubId: 0,
        },
      });
      return {
        ok: true,
        source: this.getOfficialSeasonalSourceStatus(),
        campaigns: [],
        ingest: null,
      };
    }

    const ingest = this.repository.ingestion.ingestProjectSourceSnapshot({
      sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
      sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
      displayName: OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
      sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
      campaignType: OFFICIAL_SEASONAL_CAMPAIGN_TYPE,
      clubId: 0,
      campaigns,
      note: "official-seasonal-sync",
      trackedDefault: false,
    });
    if (ingest?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
        sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
        displayName: OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
        sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
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

    const summary = {
      campaignCount: Number(ingest?.campaignsSeen || 0),
      mapCount: Number(ingest?.mapsSeen || 0),
      trackedCount: Array.isArray(ingest?.mapsForTracker) ? ingest.mapsForTracker.length : 0,
      metadataAssignment: automaticNaming.metadataAssignment,
      namingAssignment: automaticNaming.namingAssignment,
      authSource: resolvedLive?.authSource || resolvedCore?.authSource || null,
      ...this.getLatestCampaignReleaseWindow(rawCampaigns),
    };

    this.repository.configuration.upsertProjectSource({
      sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
      sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
      displayName: OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
      sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
      enabled: true,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      summary,
      metadata: {
        campaignType: OFFICIAL_SEASONAL_CAMPAIGN_TYPE,
        storageClubId: 0,
      },
    });

    return {
      ok: true,
      source: this.getOfficialSeasonalSourceStatus(),
      campaigns,
      ingest,
      metadataAssignment: automaticNaming.metadataAssignment,
      namingAssignment: automaticNaming.namingAssignment,
    };
  }

  async ensureOfficialSeasonalSourceFresh({
    authContext = null,
    force = false,
    maxAgeMs = OFFICIAL_SEASONAL_SOURCE_MAX_AGE_MS,
  } = {}) {
    const source = this.getOfficialSeasonalSourceStatus();
    const lastSyncedAtMs = Date.parse(String(source?.lastSyncedAt || "").trim());
    const hasFreshSync =
      !force &&
      Number.isFinite(lastSyncedAtMs) &&
      Date.now() - lastSyncedAtMs <= Math.max(0, Number(maxAgeMs || 0) || 0) &&
      !toText(source?.lastError);
    if (hasFreshSync && Number(source?.campaignCount || 0) > 0 && Number(source?.mapCount || 0) > 0) {
      return {
        ok: true,
        skipped: true,
        source,
      };
    }
    return this.runOfficialSeasonalSync({ authContext });
  }

  async ensureTotdSourceAvailable({ authContext = null } = {}) {
    const source = this.getTotdSourceStatus();
    if (Number(source?.campaignCount || 0) > 0 && Number(source?.mapCount || 0) > 0 && !toText(source?.lastError)) {
      return { ok: true, skipped: true, source };
    }
    return this.runTotdSync({ authContext });
  }

  async ensureCompetitionSourceAvailable({ authContext = null } = {}) {
    const source = this.getCompetitionSourceStatus();
    if (Number(source?.campaignCount || 0) > 0 && Number(source?.mapCount || 0) > 0 && !toText(source?.lastError)) {
      return { ok: true, skipped: true, source };
    }
    return this.runCompetitionSync({ authContext });
  }

  async syncTotdSource({ authContext = null } = {}) {
    if (typeof this.repository?.configuration?.upsertProjectSource === "function") {
      this.repository.configuration.upsertProjectSource({
        sourceKey: TOTD_SOURCE_KEY,
        sourceType: TOTD_SOURCE_TYPE,
        displayName: TOTD_SOURCE_DISPLAY_NAME,
        sourceLabel: TOTD_SOURCE_LABEL,
        enabled: true,
        metadata: {
          campaignType: TOTD_CAMPAIGN_TYPE,
          storageClubId: 0,
        },
      });
    }

    const resolvedLive = await this.getLiveMonitoringService().resolveLiveClient({ authContext });
    if (resolvedLive?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: TOTD_SOURCE_KEY,
        sourceType: TOTD_SOURCE_TYPE,
        displayName: TOTD_SOURCE_DISPLAY_NAME,
        sourceLabel: TOTD_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedLive.error,
      });
      return { error: resolvedLive.error };
    }

    const resolvedCore = await this.getLiveMonitoringService().resolveCoreMapClient({ authContext });
    if (resolvedCore?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: TOTD_SOURCE_KEY,
        sourceType: TOTD_SOURCE_TYPE,
        displayName: TOTD_SOURCE_DISPLAY_NAME,
        sourceLabel: TOTD_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedCore.error,
      });
      return { error: resolvedCore.error };
    }

    const rawMonths = await this.fetchAllTotdMonths(resolvedLive.liveClient, {
      length: 12,
    });
    const mapUids = normalizeUniqueStrings(
      rawMonths.flatMap((month) => (Array.isArray(month?.days) ? month.days : []).map((entry) => toText(entry?.mapUid)))
    );
    const mapDetails = await resolvedCore.coreClient.getCoreMapsByUidList(mapUids);
    const mapDetailsByUid = new Map(
      (Array.isArray(mapDetails) ? mapDetails : [])
        .filter((map) => toText(map?.mapUid || map?.uid))
        .map((map) => [toText(map.mapUid || map.uid).toLowerCase(), map])
    );
    const campaigns = this.buildTotdCampaignSnapshots(rawMonths, mapDetailsByUid);
    const ingest = campaigns.length
      ? this.repository.ingestion.ingestProjectSourceSnapshot({
          sourceKey: TOTD_SOURCE_KEY,
          sourceType: TOTD_SOURCE_TYPE,
          displayName: TOTD_SOURCE_DISPLAY_NAME,
          sourceLabel: TOTD_SOURCE_LABEL,
          campaignType: TOTD_CAMPAIGN_TYPE,
          clubId: 0,
          campaigns,
          note: "totd-sync",
          trackedDefault: false,
        })
      : null;
    if (ingest?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: TOTD_SOURCE_KEY,
        sourceType: TOTD_SOURCE_TYPE,
        displayName: TOTD_SOURCE_DISPLAY_NAME,
        sourceLabel: TOTD_SOURCE_LABEL,
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
      sourceKey: TOTD_SOURCE_KEY,
      sourceType: TOTD_SOURCE_TYPE,
      displayName: TOTD_SOURCE_DISPLAY_NAME,
      sourceLabel: TOTD_SOURCE_LABEL,
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
        ...this.getLatestTotdReleaseWindow(rawMonths),
      },
      metadata: {
        campaignType: TOTD_CAMPAIGN_TYPE,
        storageClubId: 0,
      },
    });

    return {
      ok: true,
      source: this.getTotdSourceStatus(),
      months: rawMonths,
      campaigns,
      ingest,
      metadataAssignment: automaticNaming.metadataAssignment,
      namingAssignment: automaticNaming.namingAssignment,
    };
  }

  async syncWeeklyGrandsSource({ authContext = null } = {}) {
    if (typeof this.repository?.configuration?.upsertProjectSource === "function") {
      this.repository.configuration.upsertProjectSource({
        sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
        sourceType: WEEKLY_GRANDS_SOURCE_TYPE,
        displayName: WEEKLY_GRANDS_SOURCE_DISPLAY_NAME,
        sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
        enabled: true,
        metadata: {
          campaignType: WEEKLY_GRANDS_CAMPAIGN_TYPE,
          storageClubId: 0,
        },
      });
    }

    const resolvedLive = await this.getLiveMonitoringService().resolveLiveClient({ authContext });
    if (resolvedLive?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
        sourceType: WEEKLY_GRANDS_SOURCE_TYPE,
        displayName: WEEKLY_GRANDS_SOURCE_DISPLAY_NAME,
        sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedLive.error,
      });
      return { error: resolvedLive.error };
    }

    const resolvedCore = await this.getLiveMonitoringService().resolveCoreMapClient({ authContext });
    if (resolvedCore?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
        sourceType: WEEKLY_GRANDS_SOURCE_TYPE,
        displayName: WEEKLY_GRANDS_SOURCE_DISPLAY_NAME,
        sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedCore.error,
      });
      return { error: resolvedCore.error };
    }

    const rawCampaigns = await this.fetchAllWeeklyGrandsCampaigns(resolvedLive.liveClient, {
      length: 25,
    });
    const mapUids = normalizeUniqueStrings(
      rawCampaigns.flatMap((campaign) =>
        (Array.isArray(campaign?.playlist) ? campaign.playlist : []).map((entry) => toText(entry?.mapUid))
      )
    );
    const mapDetails = await resolvedCore.coreClient.getCoreMapsByUidList(mapUids);
    const mapDetailsByUid = new Map(
      (Array.isArray(mapDetails) ? mapDetails : [])
        .filter((map) => toText(map?.mapUid || map?.uid))
        .map((map) => [toText(map.mapUid || map.uid).toLowerCase(), map])
    );
    const campaigns = this.buildWeeklyGrandsCampaignSnapshots(rawCampaigns, mapDetailsByUid);
    const ingest = campaigns.length
      ? this.repository.ingestion.ingestProjectSourceSnapshot({
          sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
          sourceType: WEEKLY_GRANDS_SOURCE_TYPE,
          displayName: WEEKLY_GRANDS_SOURCE_DISPLAY_NAME,
          sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
          campaignType: WEEKLY_GRANDS_CAMPAIGN_TYPE,
          clubId: 0,
          campaigns,
          note: "weekly-grands-sync",
          trackedDefault: false,
        })
      : null;
    if (ingest?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
        sourceType: WEEKLY_GRANDS_SOURCE_TYPE,
        displayName: WEEKLY_GRANDS_SOURCE_DISPLAY_NAME,
        sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
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
      sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
      sourceType: WEEKLY_GRANDS_SOURCE_TYPE,
      displayName: WEEKLY_GRANDS_SOURCE_DISPLAY_NAME,
      sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
      enabled: true,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      summary: {
        campaignCount: Number(ingest?.campaignsSeen || campaigns.length || 0),
        mapCount: Number(ingest?.mapsSeen || mapUids.length || 0),
        trackedCount: 0,
        metadataAssignment: automaticNaming.metadataAssignment,
        namingAssignment: automaticNaming.namingAssignment,
        canonicalCampaignCount: campaigns.filter((campaign) =>
          Boolean(campaign?.raw?.weeklyGrand?.isCanonicalNadeoWeek)
        ).length,
        canonicalMapCount: campaigns.reduce(
          (sum, campaign) =>
            sum +
            (Array.isArray(campaign?.maps)
              ? campaign.maps.filter((map) => Boolean(map?.raw?.weeklyGrand?.isCanonicalNadeoWeek)).length
              : 0),
          0
        ),
        authSource: resolvedLive?.authSource || resolvedCore?.authSource || null,
        ...this.getLatestCampaignReleaseWindow(rawCampaigns),
      },
      metadata: {
        campaignType: WEEKLY_GRANDS_CAMPAIGN_TYPE,
        storageClubId: 0,
      },
    });

    return {
      ok: true,
      source: this.getWeeklyGrandsSourceStatus(),
      campaigns,
      ingest,
      metadataAssignment: automaticNaming.metadataAssignment,
      namingAssignment: automaticNaming.namingAssignment,
    };
  }
}

export { OfficialSourceSyncService };
