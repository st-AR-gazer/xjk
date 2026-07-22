import {
  createHash,
  fs,
  path,
  extractMapNumberFromText,
  resolveWeeklyShortsEntry,
  resolveWeeklyShortsWeek,
  WEEKLY_SHORTS_SOURCE_KEY,
  WEEKLY_SHORTS_SOURCE_LABEL,
  WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
  WEEKLY_SHORTS_SOURCE_TYPE,
  WEEKLY_SHORTS_CAMPAIGN_TYPE,
  getDefaultWeeklyShortsImportRoots,
  clampInt,
  toText,
  normalizeUniqueStrings,
  resolveMapDownloadUrl,
  resolveMapUid,
  buildLocalMapRelativePath,
} from "../serviceSupport.js";

class WeeklyShortsSourceService {
  constructor({
    repository,
    getLiveMonitoringService,
    getMapProcessingService,
    getTrackerSyncService,
    getWeeklyShortsSourceStatus,
    getLatestCampaignReleaseWindow,
    fetchAllWeeklyShortsCampaigns,
    buildWeeklyShortsCampaignSnapshots,
    resolveImportRoots,
    runLocalImport,
  }) {
    this.repository = repository;
    this.getLiveMonitoringService = getLiveMonitoringService;
    this.getMapProcessingService = getMapProcessingService;
    this.getTrackerSyncService = getTrackerSyncService;
    this.getWeeklyShortsSourceStatus = getWeeklyShortsSourceStatus;
    this.getLatestCampaignReleaseWindow = getLatestCampaignReleaseWindow;
    this.fetchAllWeeklyShortsCampaigns = fetchAllWeeklyShortsCampaigns;
    this.buildWeeklyShortsCampaignSnapshots = buildWeeklyShortsCampaignSnapshots;
    this.resolveImportRoots = resolveImportRoots;
    this.runLocalImport = runLocalImport;
  }

  normalizeWeeklyShortsImportRoots(importRoots = []) {
    const rawRoots =
      Array.isArray(importRoots) && importRoots.length ? importRoots : getDefaultWeeklyShortsImportRoots();
    return normalizeUniqueStrings(rawRoots.map((root) => toText(root)).filter(Boolean));
  }

  async importWeeklyShortsLocalFiles({ campaigns = [], importRoots = [] } = {}) {
    const roots = this.resolveImportRoots(importRoots);
    const mapInfoByAbsoluteNumber = new Map();
    for (const campaign of Array.isArray(campaigns) ? campaigns : []) {
      const week = resolveWeeklyShortsWeek({
        campaignName: campaign?.name,
        campaignPayload: campaign?.raw,
      });
      for (const map of Array.isArray(campaign?.maps) ? campaign.maps : []) {
        const slot = clampInt(map?.slot, { min: 1, max: 5, fallback: 0 }) || null;
        const weeklyEntry = resolveWeeklyShortsEntry({
          campaignName: campaign?.name,
          campaignPayload: campaign?.raw,
          mapPayload: map?.raw,
          slot,
          mapName: map?.name,
          filename: map?.filename,
        });
        if (!weeklyEntry?.mapNumber) continue;
        mapInfoByAbsoluteNumber.set(weeklyEntry.mapNumber, {
          mapUid: resolveMapUid(map),
          mapName: toText(map?.name || weeklyEntry.title || resolveMapUid(map)),
          downloadUrl: resolveMapDownloadUrl(map),
          campaignName: campaign?.name || null,
          slot,
          week: Number(week || 0) || null,
          title: toText(weeklyEntry.title) || null,
        });
      }
    }

    const summary = {
      rootsScanned: roots.length,
      rootsFound: 0,
      filesSeen: 0,
      filesImported: 0,
      filesSkipped: 0,
      missingRoots: [],
      unmatchedFiles: [],
      signaturesReady: 0,
    };
    const upsertRecords = [];
    const mapInfosForSignatures = [];

    for (const root of roots) {
      try {
        const stat = await fs.stat(root);
        if (!stat.isDirectory()) {
          summary.missingRoots.push(root);
          continue;
        }
      } catch {
        summary.missingRoots.push(root);
        continue;
      }
      summary.rootsFound += 1;
      const week =
        resolveWeeklyShortsWeek({
          campaignName: path.basename(root),
        }) || extractMapNumberFromText(path.basename(root), {});
      const dirEntries = await fs.readdir(root, { withFileTypes: true });
      for (const dirEntry of dirEntries) {
        if (!dirEntry.isFile() || !/\.map\.gbx$/i.test(dirEntry.name)) continue;
        summary.filesSeen += 1;
        const sourcePath = path.join(root, dirEntry.name);
        const title = dirEntry.name.replace(/\.map\.gbx$/i, "");
        const weeklyEntry = resolveWeeklyShortsEntry({
          campaignName: week ? `Week ${week}` : "",
          campaignPayload: week ? { week } : null,
          mapName: title,
          filename: title,
        });
        const absoluteMapNumber = Number(weeklyEntry?.mapNumber || 0) || null;
        const target = absoluteMapNumber ? mapInfoByAbsoluteNumber.get(absoluteMapNumber) : null;
        if (!target?.mapUid) {
          summary.filesSkipped += 1;
          summary.unmatchedFiles.push(sourcePath);
          continue;
        }
        const buffer = await fs.readFile(sourcePath);
        const fileSha256 = createHash("sha256").update(buffer).digest("hex");
        const relativePath = buildLocalMapRelativePath(target.mapUid);
        const absolutePath = this.getMapProcessingService().getLocalMapFileAbsolutePath(target.mapUid, relativePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        const tempPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
        await fs.writeFile(tempPath, buffer);
        await fs.rename(tempPath, absolutePath);
        const now = new Date().toISOString();
        upsertRecords.push({
          mapUid: target.mapUid,
          relativePath,
          downloadUrl: target.downloadUrl || null,
          fileSha256,
          fileSizeBytes: buffer.length,
          downloadedAt: now,
          verifiedAt: now,
          status: "ready",
          lastError: null,
        });
        mapInfosForSignatures.push({
          mapUid: target.mapUid,
          name: target.mapName,
          downloadUrl: target.downloadUrl || null,
          campaignName: target.campaignName || null,
          slot: target.slot || null,
        });
        summary.filesImported += 1;
      }
    }

    if (upsertRecords.length) {
      const upsert = this.repository.mapFiles.upsertMapLocalFiles({ records: upsertRecords });
      if (upsert?.error) {
        return {
          error: upsert.error,
          ...summary,
        };
      }
      const signatures = await this.getMapProcessingService().ensureMapContentSignatures(mapInfosForSignatures, {
        force: false,
      });
      summary.signaturesReady = Number(signatures?.summary?.parsed || 0) + Number(signatures?.summary?.reused || 0);
    }

    return summary;
  }

  async syncWeeklyShortsSource({ authContext = null, importLocalFiles = true, importRoots = [] } = {}) {
    if (typeof this.repository?.configuration?.upsertProjectSource === "function") {
      this.repository.configuration.upsertProjectSource({
        sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
        sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
        displayName: WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
        sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
        enabled: true,
        metadata: {
          campaignType: WEEKLY_SHORTS_CAMPAIGN_TYPE,
          storageClubId: 0,
          importRoots: this.resolveImportRoots(importRoots),
        },
      });
    }

    const resolved = await this.getLiveMonitoringService().resolveLiveClient({ authContext });
    if (resolved?.error) {
      if (typeof this.repository?.configuration?.upsertProjectSource === "function") {
        this.repository.configuration.upsertProjectSource({
          sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
          sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
          displayName: WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
          sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
          enabled: true,
          lastError: resolved.error,
        });
      }
      return { error: resolved.error };
    }

    const resolvedCore = await this.getLiveMonitoringService().resolveCoreMapClient({ authContext });
    if (resolvedCore?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
        sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
        displayName: WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
        sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
        enabled: true,
        lastError: resolvedCore.error,
      });
      return { error: resolvedCore.error };
    }

    const liveClient = resolved.liveClient;
    const coreClient = resolvedCore.coreClient;
    const rawCampaigns = await this.fetchAllWeeklyShortsCampaigns(liveClient, {
      length: 10,
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
    const campaigns = this.buildWeeklyShortsCampaignSnapshots(rawCampaigns, mapDetailsByUid);
    if (!campaigns.length) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
        sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
        displayName: WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
        sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
        enabled: true,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        summary: {
          campaignCount: 0,
          mapCount: 0,
          trackedCount: 0,
          latestWeek: null,
        },
        metadata: {
          campaignType: WEEKLY_SHORTS_CAMPAIGN_TYPE,
          storageClubId: 0,
          importRoots: this.resolveImportRoots(importRoots),
        },
      });
      return {
        ok: true,
        source: this.getWeeklyShortsSourceStatus(),
        campaigns: [],
        ingest: null,
        trackerSync: { ok: true, targetCount: 0, chunkCount: 0, mapsSynced: 0 },
        importSummary: null,
        metadataAssignment: { processed: 0 },
        namingAssignment: { ok: true, processed: 0, resolved: 0, unresolved: 0 },
      };
    }
    const ingest = this.repository.ingestion.ingestProjectSourceSnapshot({
      sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
      sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
      displayName: WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
      sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
      campaignType: WEEKLY_SHORTS_CAMPAIGN_TYPE,
      clubId: 0,
      campaigns,
      note: "weekly-shorts-sync",
      trackedDefault: true,
    });
    if (ingest?.error) {
      this.repository.configuration.upsertProjectSource({
        sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
        sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
        displayName: WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
        sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
        enabled: true,
        lastError: ingest.error,
      });
      return ingest;
    }

    const trackerSync =
      Array.isArray(ingest?.mapsForTracker) && ingest.mapsForTracker.length
        ? await this.getTrackerSyncService().syncMapsToTrackerInChunks(ingest.mapsForTracker, {
            chunkSize: 50,
          })
        : { ok: true, targetCount: 0, chunkCount: 0, mapsSynced: 0 };
    const canonicalTouchedMapUids = normalizeUniqueStrings(
      campaigns.flatMap((campaign) =>
        (Array.isArray(campaign?.maps) ? campaign.maps : [])
          .filter((map) => Boolean(map?.raw?.weeklyShorts?.isCanonicalNadeoWeek))
          .map((map) => resolveMapUid(map))
      )
    );
    const automaticNaming = await this.getMapProcessingService().runAutomaticNamingAssignments({
      mapUids: canonicalTouchedMapUids,
      persistCandidates: true,
    });
    const metadataAssignment = automaticNaming.metadataAssignment;
    const namingAssignment = automaticNaming.namingAssignment;
    const importSummary = importLocalFiles
      ? await this.runLocalImport({
          campaigns,
          importRoots,
        })
      : null;
    const trackerSyncError =
      trackerSync?.ok === false && toText(trackerSync?.error) !== "No tracker map-sync targets are configured."
        ? trackerSync.error || null
        : null;
    const weeklySourceSummary = {
      campaignCount: Number(ingest?.campaignsSeen || 0),
      mapCount: Number(ingest?.mapsSeen || 0),
      trackedCount: canonicalTouchedMapUids.length,
      canonicalCampaignCount: campaigns.filter((campaign) => Boolean(campaign?.raw?.weeklyShorts?.isCanonicalNadeoWeek))
        .length,
      canonicalMapCount: canonicalTouchedMapUids.length,
      trackerMapsSynced: Number(trackerSync?.mapsSynced || 0),
      importSummary,
      metadataAssignment,
      namingAssignment,
      authSource: resolved?.authSource || null,
      latestWeek: rawCampaigns.reduce((max, campaign) => Math.max(max, Number(campaign?.week || 0) || 0), 0) || null,
      ...this.getLatestCampaignReleaseWindow(rawCampaigns),
    };

    this.repository.configuration.upsertProjectSource({
      sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
      sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
      displayName: WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
      sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
      enabled: true,
      lastSyncedAt: new Date().toISOString(),
      lastError: ingest?.error || trackerSyncError || importSummary?.error || null,
      summary: weeklySourceSummary,
      metadata: {
        campaignType: WEEKLY_SHORTS_CAMPAIGN_TYPE,
        storageClubId: 0,
        importRoots: this.resolveImportRoots(importRoots),
      },
    });

    return {
      ok: true,
      source: this.getWeeklyShortsSourceStatus(),
      campaigns,
      ingest,
      trackerSync,
      importSummary,
      metadataAssignment,
      namingAssignment,
    };
  }
}

export { WeeklyShortsSourceService };
