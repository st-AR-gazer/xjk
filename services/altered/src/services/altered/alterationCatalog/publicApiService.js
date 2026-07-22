import {
  PUBLIC_API_ENDPOINTS,
  buildPublicApiCatalog,
  clampInt,
  deriveMapMetadata,
  hasResolvedDisplayName,
  normalizeAccountId,
  sanitizeResolvedDisplayName,
  toText,
  uniqueBy,
} from "../serviceSupport.js";

class PublicApiService {
  constructor({ repository, getPlayerIdentityService }) {
    this.repository = repository;
    this.getPlayerIdentityService = getPlayerIdentityService;
  }

  getPublicApiCatalog() {
    return {
      generatedAt: new Date().toISOString(),
      ...buildPublicApiCatalog(),
    };
  }

  getLegacyMapInfo(mapUid) {
    const payload = this.getPublicMapDetail(mapUid, { wrHistoryLimit: 5 });
    if (!payload?.exists || !payload?.map) {
      return {
        exists: false,
        mapUid: toText(mapUid),
      };
    }

    const map = payload.map;
    return {
      alteration: map.alteration || null,
      author: map.author || "",
      authorScore: Number(map.authorScore || 0),
      bronzeScore: Number(map.bronzeScore || 0),
      collectionName: map.collectionName || null,
      createdWithGamepadEditor: map.createdWithGamepadEditor === null ? false : Boolean(map.createdWithGamepadEditor),
      createdWithSimpleEditor: map.createdWithSimpleEditor === null ? false : Boolean(map.createdWithSimpleEditor),
      fileUrl: map.fileUrl || null,
      filename: map.filename || "",
      goldScore: Number(map.goldScore || 0),
      isPlayable: map.isPlayable === null ? true : Boolean(map.isPlayable),
      mapId: map.mapId || null,
      mapStyle: map.mapStyle || "",
      mapType: map.mapType || "",
      mapUid: map.mapUid,
      mapnumber: Array.isArray(map.mapnumber) ? map.mapnumber : [],
      name: map.name || "",
      season: map.season || null,
      silverScore: Number(map.silverScore || 0),
      submitter: map.submitter || "",
      thumbnailUrl: map.thumbnailUrl || null,
      timestamp: map.timestamp || map.mapCreatedAt || map.mapUpdatedAt || null,
      type: map.type || null,
      year: Number(map.year || 0) || null,
    };
  }

  getPublicMapDetail(mapUid, { wrHistoryLimit = 5 } = {}) {
    const mapInfo = this.repository.maps.getMapInfo(mapUid);
    if (!mapInfo?.exists || !mapInfo.map) {
      return {
        exists: false,
        mapUid: toText(mapUid),
      };
    }

    const safeWrHistoryLimit = clampInt(wrHistoryLimit, {
      min: 1,
      max: 25,
      fallback: 5,
    });
    const wrHistory = this.repository.activity.getRecentWrEventsForMap({
      mapUid,
      limit: safeWrHistoryLimit,
    });
    const map = mapInfo.map;
    const authorAccountId = normalizeAccountId(map.author);
    const submitterAccountId = normalizeAccountId(map.submitter);
    const authorDisplayName =
      sanitizeResolvedDisplayName(map.authorDisplayName, { accountId: authorAccountId }) ||
      this.getPlayerIdentityService().getCachedPlayerName(authorAccountId) ||
      null;
    const submitterDisplayName =
      sanitizeResolvedDisplayName(map.submitterDisplayName, { accountId: submitterAccountId }) ||
      this.getPlayerIdentityService().getCachedPlayerName(submitterAccountId) ||
      null;
    const pendingMapperNameAccountIds = [];
    const collectPendingMapperName = (accountId, displayName) => {
      const safeAccountId = normalizeAccountId(accountId);
      if (!safeAccountId || hasResolvedDisplayName(displayName, { accountId: safeAccountId })) {
        return;
      }
      pendingMapperNameAccountIds.push(safeAccountId);
    };
    collectPendingMapperName(authorAccountId, authorDisplayName);
    collectPendingMapperName(submitterAccountId, submitterDisplayName);
    const priorityAccountIds = uniqueBy(pendingMapperNameAccountIds, (accountId) => accountId);
    if (priorityAccountIds.length) {
      this.getPlayerIdentityService().queuePriorityDisplayNameLookups(priorityAccountIds, {
        source: "public-map-detail",
      });
    }

    const derived = deriveMapMetadata(map);

    return {
      exists: true,
      generatedAt: new Date().toISOString(),
      api: {
        name: "Altered Public API",
        version: "v1",
        docsPath: "/api/",
      },
      map: {
        mapUid: map.uid,
        mapId: map.mapId || null,
        name: map.name,
        filename: derived.filename,
        fileUrl: derived.fileUrl,
        thumbnailUrl: derived.thumbnailUrl || map.thumbnailUrl || null,
        author: map.author || null,
        authorDisplayName,
        authorSavedDisplayName: map.authorSavedDisplayName || null,
        authorScore: Number(map.authorMs || 0),
        submitter: map.submitter || null,
        submitterDisplayName,
        submitterSavedDisplayName: map.submitterSavedDisplayName || null,
        goldScore: Number(map.goldMs || 0),
        silverScore: Number(map.silverMs || 0),
        bronzeScore: Number(map.bronzeMs || 0),
        wrMs: Number(map.wrMs || 0),
        wrHolder: map.wrHolder || "-",
        wrUpdatedAt: map.wrUpdatedAt || null,
        playerCount: Number(map.playerCount || 0),
        playerCountUpdatedAt: map.playerCountUpdatedAt || null,
        collectionName: derived.collectionName,
        mapStyle: map.mapStyle || "",
        mapType: map.mapType || null,
        type: derived.type || null,
        nbLaps: Number(map.laps || 1),
        isPlayable: derived.isPlayable,
        createdWithGamepadEditor: derived.createdWithGamepadEditor,
        createdWithSimpleEditor: derived.createdWithSimpleEditor,
        timestamp: derived.timestamp,
        mapCreatedAt: map.mapCreatedAt || null,
        mapUpdatedAt: map.mapUpdatedAt || null,
        campaignName: map.campaign || "Unassigned",
        campaignId: Number(map.campaignId || 0) || null,
        campaignExternalId: Number(map.campaignExternalId || 0) || null,
        slot: Number(map.slot || 0) || null,
        tracked: Boolean(map.tracked),
        status: map.status || "live",
        checkFrequencySeconds: Number(map.checkFrequency || 0),
        lastCheckedAt: map.lastCheckedAt || null,
        season: derived.season || null,
        year: Number(derived.year || 0) || null,
        mapnumber: Array.isArray(derived.mapnumber) ? derived.mapnumber : [],
        alteration: derived.alteration || null,
        alterationMix: Array.isArray(derived.alterationMix) ? derived.alterationMix : [],
        latestWrEvent: wrHistory[0] || null,
        cachedPayload: map.payload || null,
        cachedCampaignPayload: map.campaignPayload || null,
      },
      wrHistory,
      links: {
        self: `/api/v1/public/maps/${encodeURIComponent(map.uid)}`,
        legacy: `/api/v1/maps/info/${encodeURIComponent(map.uid)}`,
        docs: "/api/",
      },
    };
  }

  recordPublicApiRequest(request = {}) {
    return this.repository.activity.recordApiRequest(request);
  }

  getPublicApiUsageSummary(options = {}) {
    const catalog = this.getPublicApiCatalog();
    const catalogByKey = new Map(
      (Array.isArray(catalog.endpoints) ? catalog.endpoints : []).map((endpoint) => [endpoint.key, endpoint])
    );
    const usage = this.repository.activity.getApiUsageSummary(options);

    return {
      ...usage,
      catalog: {
        docsPath: catalog.api?.docsPath || "/api/",
        totalEndpoints: Number(catalog.api?.totalEndpoints || PUBLIC_API_ENDPOINTS.length || 0),
      },
      endpoints: (Array.isArray(usage.endpoints) ? usage.endpoints : []).map((endpoint) => {
        const meta = catalogByKey.get(endpoint.endpointKey) || null;
        return {
          ...endpoint,
          method: meta?.method || "GET",
          path: meta?.path || endpoint.requestPath,
          title: meta?.title || endpoint.endpointKey,
          group: meta?.group || "Other",
          access: meta?.access || "public",
          stability: meta?.stability || "existing",
        };
      }),
      recentRequests: (Array.isArray(usage.recentRequests) ? usage.recentRequests : []).map((request) => {
        const meta = catalogByKey.get(request.endpointKey) || null;
        return {
          ...request,
          title: meta?.title || request.endpointKey,
          path: meta?.path || request.requestPath,
          method: meta?.method || request.method || "GET",
        };
      }),
    };
  }
}

export { PublicApiService };
