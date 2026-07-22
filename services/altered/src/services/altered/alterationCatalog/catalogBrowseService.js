import {
  applyAlterationGrouping,
  classifyNamingSimilaritySource,
  clampInt,
  pickLatestWr,
  toText,
} from "../serviceSupport.js";
import { normalizeCommaSeparatedValues } from "../../../domain/alterationMapFilters.js";

class CatalogBrowseService {
  constructor({ repository, trackerClient, alterationGroupingStore, getPlayerIdentityService }) {
    this.repository = repository;
    this.trackerClient = trackerClient;
    this.alterationGroupingStore = alterationGroupingStore;
    this.getPlayerIdentityService = getPlayerIdentityService;
  }

  async getDashboard({
    mapsLimit = 5000,
    mapsOffset = 0,
    mapOptionsLimit = 25000,
    mapOptionsOffset = 0,
    wrFeedLimit = 24,
    includeMapOptions = true,
    includeTracker = true,
  } = {}) {
    const safeMapsLimit = clampInt(mapsLimit, { min: 0, max: 5000, fallback: 5000 });
    const safeMapsOffset = clampInt(mapsOffset, { min: 0, max: 2000000, fallback: 0 });
    const safeMapOptionsLimit = clampInt(mapOptionsLimit, { min: 0, max: 25000, fallback: 25000 });
    const safeMapOptionsOffset = clampInt(mapOptionsOffset, { min: 0, max: 2000000, fallback: 0 });
    const safeWrFeedLimit = clampInt(wrFeedLimit, { min: 0, max: 200, fallback: 24 });
    const safeIncludeMapOptions = includeMapOptions !== false;
    const safeIncludeTracker = includeTracker !== false;

    const [trackerStatusResult, wrFeedResult] = await Promise.all([
      safeIncludeTracker ? this.trackerClient.getTrackerStatus() : Promise.resolve({ ok: false, data: null }),
      safeWrFeedLimit > 0
        ? this.trackerClient.getWrFeed(safeWrFeedLimit)
        : Promise.resolve({ ok: true, data: { feed: [] } }),
    ]);
    const maps =
      safeMapsLimit > 0 ? this.repository.maps.listMaps({ limit: safeMapsLimit, offset: safeMapsOffset }) : [];
    const mapOptions =
      safeIncludeMapOptions && safeMapOptionsLimit > 0
        ? this.repository.maps.getMapOptions({ limit: safeMapOptionsLimit, offset: safeMapOptionsOffset })
        : [];
    const summary = this.repository.catalog.getSummary();
    const wrFeed = Array.isArray(wrFeedResult?.data?.feed) ? wrFeedResult.data.feed : [];
    const latestWrEvent = this.repository.activity.getLatestWrEvent();
    const latestWr = pickLatestWr(
      latestWrEvent
        ? {
            mapUid: latestWrEvent.mapUid,
            mapName: latestWrEvent.mapName,
            accountId: latestWrEvent.accountId,
            holder: latestWrEvent.holder,
            wrMs: latestWrEvent.wrMs,
            recordedAt: latestWrEvent.recordedAt,
          }
        : null,
      wrFeed[0] || null
    );
    const playerIdentity = this.getPlayerIdentityService();
    const holderAccountIds = [
      ...playerIdentity.collectHolderAccountIds(maps, ["wrAccountId", "wrHolder"]),
      ...playerIdentity.collectHolderAccountIds(wrFeed, ["accountId", "holder"]),
      ...playerIdentity.collectHolderAccountIds(latestWr ? [latestWr] : [], ["accountId", "holder"]),
    ];
    const namesByAccountId = await playerIdentity.resolvePlayerNamesByAccountIds(holderAccountIds, {
      chunkSize: 100,
    });
    const resolvedMaps = playerIdentity.applyResolvedHolderNames(maps, "wrHolder", namesByAccountId, {
      accountIdKeys: ["wrAccountId"],
      pendingKey: "displayNamePending",
      accountIdOutputKey: "wrAccountId",
    });
    const resolvedWrFeed = playerIdentity.applyResolvedHolderNames(wrFeed, "holder", namesByAccountId, {
      accountIdKeys: ["accountId"],
      pendingKey: "displayNamePending",
      accountIdOutputKey: "accountId",
    });
    const resolvedLatestWr = latestWr
      ? playerIdentity.applyResolvedHolderNames([latestWr], "holder", namesByAccountId, {
          accountIdKeys: ["accountId"],
          pendingKey: "displayNamePending",
          accountIdOutputKey: "accountId",
        })[0]
      : null;
    const tracker = safeIncludeTracker && trackerStatusResult?.ok ? trackerStatusResult.data : null;
    return {
      maps: resolvedMaps,
      mapOptions,
      summary,
      wrFeed: resolvedWrFeed,
      latestWr: resolvedLatestWr,
      tracker,
      paging: {
        maps: {
          limit: safeMapsLimit,
          offset: safeMapsOffset,
          count: resolvedMaps.length,
          has_more: safeMapsLimit > 0 && resolvedMaps.length >= safeMapsLimit,
          next_offset:
            safeMapsLimit > 0 && resolvedMaps.length >= safeMapsLimit ? safeMapsOffset + resolvedMaps.length : null,
        },
        map_options: {
          limit: safeIncludeMapOptions ? safeMapOptionsLimit : 0,
          offset: safeMapOptionsOffset,
          count: mapOptions.length,
          has_more: safeIncludeMapOptions && safeMapOptionsLimit > 0 && mapOptions.length >= safeMapOptionsLimit,
          next_offset:
            safeIncludeMapOptions && safeMapOptionsLimit > 0 && mapOptions.length >= safeMapOptionsLimit
              ? safeMapOptionsOffset + mapOptions.length
              : null,
        },
        wr_feed: {
          limit: safeWrFeedLimit,
          offset: 0,
          count: resolvedWrFeed.length,
          has_more: false,
          next_offset: null,
        },
      },
    };
  }

  async getAlterationsStats() {
    const base = this.repository.catalog.getAlterationsStats();
    return {
      total_maps: Number(base.totalMaps || 0),
      actively_tracked: Number(base.activelyTracked || 0),
      total_wr_changes: Number(base.totalWrChanges || 0),
      last_run_at: base.lastRunAt || null,
    };
  }

  getAlterationsMapFilters() {
    const filters = this.repository.catalog.getAlterationsMapFilters();
    const configuredAlterations = this.getConfiguredAlterations();
    return {
      ...filters,
      alterations: configuredAlterations.alterations,
      alteration_groups: configuredAlterations.categories,
      alteration_grouping: {
        loaded: configuredAlterations.loaded,
        alias_count: configuredAlterations.alias_count,
        error: configuredAlterations.error,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  getConfiguredAlterations() {
    const alterations = this.repository.catalog.listAlterations();
    const snapshot = this.alterationGroupingStore?.getSnapshot?.() || null;
    return applyAlterationGrouping(alterations, snapshot);
  }

  async getAlterationsMaps(options = {}) {
    const { limit = 50000, offset = 0, campaignIds = [], alterationSlugs = [], alterationIds = [] } = options;
    const safeLimit = clampInt(limit, { min: 1, max: 100000, fallback: 50000 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const normalizeCampaignId = (value) => (/^\d+$/.test(value.trim()) ? value.trim() : "");
    const caseInsensitiveKey = (value) => value.toLowerCase();
    const normalizedCampaignIds = normalizeCommaSeparatedValues(campaignIds, {
      normalize: normalizeCampaignId,
    });
    const normalizedAlterationSlugs = normalizeCommaSeparatedValues(alterationSlugs, {
      makeKey: caseInsensitiveKey,
    });
    const normalizedAlterationIds = normalizeCommaSeparatedValues(alterationIds, {
      normalize: (value) => clampInt(value.trim(), { min: 1, max: 2147483647, fallback: 0 }),
    });
    const { rows: maps, total } = this.repository.catalog.listAlterationsMaps(options);
    const playerIdentity = this.getPlayerIdentityService();
    const holderAccountIds = playerIdentity.collectHolderAccountIds(maps, [
      "wr_account_id",
      "wrAccountId",
      "wr_holder",
    ]);
    const namesByAccountId = await playerIdentity.resolvePlayerNamesByAccountIds(holderAccountIds, {
      chunkSize: 100,
    });
    const resolvedMaps = playerIdentity.applyResolvedHolderNames(maps, "wr_holder", namesByAccountId, {
      accountIdKeys: ["wr_account_id", "wrAccountId"],
      pendingKey: "displayNamePending",
      accountIdOutputKey: "wr_account_id",
    });

    return {
      maps: resolvedMaps,
      count: resolvedMaps.length,
      total,
      paging: {
        limit: safeLimit,
        offset: safeOffset,
        total,
        has_more: safeOffset + resolvedMaps.length < total,
        next_offset: safeOffset + resolvedMaps.length < total ? safeOffset + resolvedMaps.length : null,
      },
      ...(normalizedCampaignIds.length ? { campaignIds: normalizedCampaignIds } : {}),
      ...(normalizedAlterationSlugs.length ? { alterationSlugs: normalizedAlterationSlugs } : {}),
      ...(normalizedAlterationIds.length ? { alterationIds: normalizedAlterationIds } : {}),
    };
  }

  getAlterationsCampaigns({
    limit = 5000,
    offset = 0,
    catalogOnly = false,
    linkedOnly = false,
    alterationSlugs = [],
    alterationIds = [],
  } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 10000, fallback: 5000 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const { rows: campaigns, total } = this.repository.catalog.listAlterationsCampaigns({
      limit: safeLimit,
      offset: safeOffset,
      catalogOnly,
      linkedOnly,
      alterationSlugs,
      alterationIds,
    });
    const resolvedCampaigns = campaigns.map((campaign) => {
      const sortTimestampMs = Number(campaign?.sort_timestamp_ms || campaign?.sortTimestampMs || 0) || 0;
      return {
        ...campaign,
        source_classification:
          toText(campaign?.source_key || campaign?.sourceKey).toLowerCase() ||
          classifyNamingSimilaritySource({
            campaign: campaign?.name,
            clubId: campaign?.club_id || campaign?.clubId || null,
            campaignStartTimestamp: sortTimestampMs > 0 ? new Date(sortTimestampMs).toISOString() : null,
          }),
      };
    });
    return {
      campaigns: resolvedCampaigns,
      count: resolvedCampaigns.length,
      total,
      paging: {
        limit: safeLimit,
        offset: safeOffset,
        total,
        has_more: safeOffset + resolvedCampaigns.length < total,
        next_offset: safeOffset + resolvedCampaigns.length < total ? safeOffset + resolvedCampaigns.length : null,
      },
    };
  }

  resolveCampaignDbId(campaign) {
    return this.repository.catalog.resolveCampaignDbId(campaign);
  }

  getAlterationTypes() {
    const configuredAlterations = this.getConfiguredAlterations();
    return {
      alterations: configuredAlterations.alterations,
      alteration_groups: configuredAlterations.categories,
      alteration_grouping: {
        loaded: configuredAlterations.loaded,
        alias_count: configuredAlterations.alias_count,
        error: configuredAlterations.error,
      },
      count: configuredAlterations.alterations.length,
      generatedAt: new Date().toISOString(),
    };
  }

  getAlterationsUploads({ limit = 20000, offset = 0 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 100000, fallback: 20000 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const uploads = this.repository.catalog.listAlterationsUploadMaps({ limit: safeLimit, offset: safeOffset });
    return {
      uploads,
      count: uploads.length,
      generatedAt: new Date().toISOString(),
      paging: {
        limit: safeLimit,
        offset: safeOffset,
        has_more: uploads.length >= safeLimit,
        next_offset: uploads.length >= safeLimit ? safeOffset + uploads.length : null,
      },
    };
  }

  getCampaignTimeline(options = {}) {
    return this.repository.catalog.getCampaignTimeline(options);
  }

  getHookStatus() {
    return this.repository.monitoring.getHookStatus();
  }

  getHookMaps({ q = "", limit = 1200 } = {}) {
    return this.repository.maps.listMaps({ q, limit });
  }

  getAdminMapsWorkspace({
    q = "",
    campaign = "",
    tracked = undefined,
    status = "",
    staleState = "",
    page = 1,
    pageSize = 50,
  } = {}) {
    const safePageSize = clampInt(pageSize, { min: 10, max: 200, fallback: 50 });
    const safePage = clampInt(page, { min: 1, max: 50000, fallback: 1 });
    const offset = (safePage - 1) * safePageSize;
    const maps = this.repository.maps.listMapsWorkspace({
      q,
      campaign,
      tracked,
      status,
      staleState,
      limit: safePageSize,
      offset,
    });
    const total = this.repository.maps.countMapsWorkspace({ q, campaign, tracked, status, staleState });
    return {
      maps,
      total,
      page: safePage,
      pageSize: safePageSize,
      pageCount: Math.max(1, Math.ceil(total / safePageSize)),
      hasMore: offset + maps.length < total,
    };
  }

  getHookRuns(limit = 30) {
    return this.repository.monitoring.listHookRuns(limit);
  }

  getMapInfo(mapUid) {
    return this.repository.maps.getMapInfo(mapUid);
  }
}

export { CatalogBrowseService };
