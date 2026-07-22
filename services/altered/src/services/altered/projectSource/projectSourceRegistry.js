import {
  WEEKLY_SHORTS_SOURCE_KEY,
  WEEKLY_SHORTS_SOURCE_LABEL,
  WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
  WEEKLY_SHORTS_SOURCE_TYPE,
  WEEKLY_SHORTS_CAMPAIGN_TYPE,
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
  PROJECT_SOURCE_RELEASE_BUFFER_MS,
  PROJECT_SOURCE_SCHEDULES,
  getDefaultWeeklyShortsImportRoots,
  clampInt,
  toText,
  toFlexibleIso,
} from "../serviceSupport.js";

class ProjectSourceRegistry {
  constructor({ repository, getLiveMonitor }) {
    this.repository = repository;
    this.getLiveMonitor = getLiveMonitor;
  }

  get liveMonitor() {
    return this.getLiveMonitor();
  }

  getProjectClubs({ includeDisabled = true } = {}) {
    const hooks =
      typeof this.repository?.monitoring?.listHookStatuses === "function"
        ? this.repository.monitoring.listHookStatuses({ includeDisabled })
        : [this.repository.monitoring.getHookStatus()].filter(Boolean);
    return hooks.filter(Boolean).map((hook) => ({
      ...hook,
      primary: String(hook.hookKey || "") === "altered-club",
      liveMonitorClub: Number(hook.clubId || 0) === Number(this.liveMonitor.clubId || 0),
    }));
  }

  getProjectSources({ includeDisabled = true } = {}) {
    const sources =
      typeof this.repository?.configuration?.listProjectSources === "function"
        ? this.repository.configuration.listProjectSources({ includeDisabled })
        : [];
    const builtins = [];
    const ensureBuiltinSource = ({ sourceKey, sourceType, displayName, sourceLabel, metadata }) => {
      if (sources.some((source) => String(source?.sourceKey || "") === sourceKey)) return;
      const fallback =
        typeof this.repository?.configuration?.upsertProjectSource === "function"
          ? this.repository.configuration.upsertProjectSource({
              sourceKey,
              sourceType,
              displayName,
              sourceLabel,
              enabled: true,
              metadata,
            })
          : null;
      if (fallback) builtins.push(fallback);
    };

    ensureBuiltinSource({
      sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
      sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
      displayName: WEEKLY_SHORTS_SOURCE_DISPLAY_NAME,
      sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
      metadata: {
        campaignType: WEEKLY_SHORTS_CAMPAIGN_TYPE,
        storageClubId: 0,
        importRoots: getDefaultWeeklyShortsImportRoots(),
      },
    });

    ensureBuiltinSource({
      sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
      sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
      displayName: OFFICIAL_SEASONAL_SOURCE_DISPLAY_NAME,
      sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
      metadata: {
        campaignType: OFFICIAL_SEASONAL_CAMPAIGN_TYPE,
        storageClubId: 0,
      },
    });

    ensureBuiltinSource({
      sourceKey: TOTD_SOURCE_KEY,
      sourceType: TOTD_SOURCE_TYPE,
      displayName: TOTD_SOURCE_DISPLAY_NAME,
      sourceLabel: TOTD_SOURCE_LABEL,
      metadata: {
        campaignType: TOTD_CAMPAIGN_TYPE,
        storageClubId: 0,
      },
    });

    ensureBuiltinSource({
      sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
      sourceType: WEEKLY_GRANDS_SOURCE_TYPE,
      displayName: WEEKLY_GRANDS_SOURCE_DISPLAY_NAME,
      sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
      metadata: {
        campaignType: WEEKLY_GRANDS_CAMPAIGN_TYPE,
        storageClubId: 0,
      },
    });

    ensureBuiltinSource({
      sourceKey: COMPETITION_SOURCE_KEY,
      sourceType: COMPETITION_SOURCE_TYPE,
      displayName: COMPETITION_SOURCE_DISPLAY_NAME,
      sourceLabel: COMPETITION_SOURCE_LABEL,
      metadata: {
        campaignType: COMPETITION_CAMPAIGN_TYPE,
        storageClubId: COMPETITION_SOURCE_CLUB_ID,
      },
    });

    ensureBuiltinSource({
      sourceKey: DISCOVERY_SOURCE_KEY,
      sourceType: DISCOVERY_SOURCE_TYPE,
      displayName: DISCOVERY_SOURCE_DISPLAY_NAME,
      sourceLabel: DISCOVERY_SOURCE_LABEL,
      metadata: {
        campaignType: DISCOVERY_CAMPAIGN_TYPE,
        storageClubId: DISCOVERY_SOURCE_CLUB_ID,
        campaignIds: DISCOVERY_SOURCE_CAMPAIGNS.map((campaign) => campaign.campaignId),
      },
    });

    ensureBuiltinSource({
      sourceKey: LEGACY_SOURCE_KEY,
      sourceType: LEGACY_SOURCE_TYPE,
      displayName: LEGACY_SOURCE_DISPLAY_NAME,
      sourceLabel: LEGACY_SOURCE_LABEL,
      metadata: {
        campaignType: LEGACY_CAMPAIGN_TYPE,
        storageClubId: LEGACY_SOURCE_CLUB_ID,
        campaignIds: LEGACY_SOURCE_CAMPAIGNS.map((campaign) => campaign.campaignId),
      },
    });

    return [...sources, ...builtins].map((source) => ({
      ...source,
      nextScheduledSyncAt: this.computeProjectSourceNextRunIso(source),
    }));
  }

  getWeeklyShortsSourceStatus() {
    return (
      this.getProjectSources({ includeDisabled: true }).find(
        (source) => String(source?.sourceKey || "") === WEEKLY_SHORTS_SOURCE_KEY
      ) || null
    );
  }

  getOfficialSeasonalSourceStatus() {
    return (
      this.getProjectSources({ includeDisabled: true }).find(
        (source) => String(source?.sourceKey || "") === OFFICIAL_SEASONAL_SOURCE_KEY
      ) || null
    );
  }

  getTotdSourceStatus() {
    return (
      this.getProjectSources({ includeDisabled: true }).find(
        (source) => String(source?.sourceKey || "") === TOTD_SOURCE_KEY
      ) || null
    );
  }

  getWeeklyGrandsSourceStatus() {
    return (
      this.getProjectSources({ includeDisabled: true }).find(
        (source) => String(source?.sourceKey || "") === WEEKLY_GRANDS_SOURCE_KEY
      ) || null
    );
  }

  getCompetitionSourceStatus() {
    return (
      this.getProjectSources({ includeDisabled: true }).find(
        (source) => String(source?.sourceKey || "") === COMPETITION_SOURCE_KEY
      ) || null
    );
  }

  getDiscoverySourceStatus() {
    return (
      this.getProjectSources({ includeDisabled: true }).find(
        (source) => String(source?.sourceKey || "") === DISCOVERY_SOURCE_KEY
      ) || null
    );
  }

  getLegacySourceStatus() {
    return (
      this.getProjectSources({ includeDisabled: true }).find(
        (source) => String(source?.sourceKey || "") === LEGACY_SOURCE_KEY
      ) || null
    );
  }

  getProjectSourceScheduleRule(sourceKey = "") {
    const safeKey = toText(sourceKey).toLowerCase();
    return PROJECT_SOURCE_SCHEDULES[safeKey] || null;
  }

  computeProjectSourceNextRunMs(source = null, { fromTimeMs = Date.now() } = {}) {
    const rule = this.getProjectSourceScheduleRule(source?.sourceKey);
    if (!rule || source?.enabled === false) return null;

    const releaseStartMs = Date.parse(String(source?.summary?.latestReleaseStartAt || "").trim());
    const releaseEndMs = Date.parse(String(source?.summary?.latestReleaseEndAt || "").trim());
    const lastSyncedMs = Date.parse(String(source?.lastSyncedAt || "").trim());
    const hasLastSynced = Number.isFinite(lastSyncedMs);
    const candidates = [];

    if (!hasLastSynced || !Number.isFinite(releaseStartMs)) {
      return fromTimeMs;
    }

    for (const checkpointMs of Array.isArray(rule.checkpointsMs) ? rule.checkpointsMs : []) {
      const dueMs = releaseStartMs + Math.max(0, Number(checkpointMs) || 0);
      if (!Number.isFinite(dueMs)) continue;
      if (!hasLastSynced || dueMs > lastSyncedMs) {
        candidates.push(dueMs);
      }
    }

    if (rule.followEndTimestamp && Number.isFinite(releaseEndMs)) {
      const nextReleaseDueMs = releaseEndMs + PROJECT_SOURCE_RELEASE_BUFFER_MS;
      if (!hasLastSynced || nextReleaseDueMs > lastSyncedMs) {
        candidates.push(nextReleaseDueMs);
      }
    }

    const nextMs = [...new Set(candidates.filter((value) => Number.isFinite(value)))].sort(
      (left, right) => left - right
    )[0];
    return Number.isFinite(nextMs) ? nextMs : null;
  }

  computeProjectSourceNextRunIso(source = null, options = {}) {
    const nextMs = this.computeProjectSourceNextRunMs(source, options);
    return Number.isFinite(nextMs) ? new Date(nextMs).toISOString() : null;
  }

  getLatestCampaignReleaseWindow(rawCampaigns = []) {
    let latest = null;
    for (const campaign of Array.isArray(rawCampaigns) ? rawCampaigns : []) {
      const startMs = Date.parse(toFlexibleIso(campaign?.startTimestamp) || "");
      if (!Number.isFinite(startMs)) continue;
      if (!latest || startMs > latest.startMs) {
        latest = {
          startMs,
          endMs: Date.parse(toFlexibleIso(campaign?.endTimestamp) || ""),
          name: toText(campaign?.name) || null,
        };
      }
    }
    return latest
      ? {
          latestReleaseStartAt: new Date(latest.startMs).toISOString(),
          latestReleaseEndAt: Number.isFinite(latest.endMs) ? new Date(latest.endMs).toISOString() : null,
          latestReleaseName: latest.name || null,
        }
      : {
          latestReleaseStartAt: null,
          latestReleaseEndAt: null,
          latestReleaseName: null,
        };
  }

  getLatestTotdReleaseWindow(rawMonths = []) {
    let latest = null;
    for (const month of Array.isArray(rawMonths) ? rawMonths : []) {
      for (const day of Array.isArray(month?.days) ? month.days : []) {
        const startMs = Date.parse(toFlexibleIso(day?.startTimestamp) || "");
        if (!Number.isFinite(startMs)) continue;
        if (!latest || startMs > latest.startMs) {
          latest = {
            startMs,
            endMs: Date.parse(toFlexibleIso(day?.endTimestamp) || ""),
            monthDay: clampInt(day?.monthDay, { min: 1, max: 31, fallback: 0 }) || null,
            year: clampInt(month?.year, { min: 2020, max: 2100, fallback: 0 }) || null,
            month: clampInt(month?.month, { min: 1, max: 12, fallback: 0 }) || null,
          };
        }
      }
    }
    return latest
      ? {
          latestReleaseStartAt: new Date(latest.startMs).toISOString(),
          latestReleaseEndAt: Number.isFinite(latest.endMs) ? new Date(latest.endMs).toISOString() : null,
          latestReleaseName:
            latest.year && latest.month && latest.monthDay
              ? `TOTD ${latest.year}-${String(latest.month).padStart(2, "0")}-${String(latest.monthDay).padStart(2, "0")}`
              : null,
        }
      : {
          latestReleaseStartAt: null,
          latestReleaseEndAt: null,
          latestReleaseName: null,
        };
  }

  getPrimaryProjectClubId() {
    const liveMonitorClubId = clampInt(this.liveMonitor?.clubId, {
      min: 1,
      max: 2147483647,
      fallback: 0,
    });
    if (liveMonitorClubId > 0) return liveMonitorClubId;
    const primaryHookClubId = clampInt(this.repository.configuration.getHookConfig("altered-club")?.clubId, {
      min: 1,
      max: 2147483647,
      fallback: 0,
    });
    return primaryHookClubId > 0 ? primaryHookClubId : null;
  }
}

export { ProjectSourceRegistry };
