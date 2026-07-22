import {
  asArray,
  clampInt,
  hasResolvedDisplayName,
  normalizeAccountId,
  normalizeMapUid,
  sanitizeResolvedDisplayName,
  toIso,
  toText,
} from "../serviceSupport.js";
import {
  buildLeaderboardPayload,
  emptyMedalPayload,
  loadMedalPayload,
  loadStoredLeaderboardData,
  normalizeLeaderboardOptions,
  resolveLeaderboardNames,
  resolveLeaderboardRows,
} from "./leaderboardPayload.js";

class LeaderboardService {
  constructor({ repository, trackerClient, getPlayerIdentityService, getTrackerSyncService }) {
    this.repository = repository;
    this.trackerClient = trackerClient;
    this.getPlayerIdentityService = getPlayerIdentityService;
    this.getTrackerSyncService = getTrackerSyncService;
  }

  async getAlterationsLeaderboards(input = {}) {
    const options = normalizeLeaderboardOptions(input);
    const stored = loadStoredLeaderboardData(this.repository, options);
    const trackerCoverageClient =
      this.getTrackerSyncService().getTrackerSyncTargetClient("leaderboard") || this.trackerClient;
    const trackerCoverageResult = await trackerCoverageClient.getLeaderboardCoverage({ trackedOnly: true });
    const resolved = await resolveLeaderboardRows({
      storedRows: stored.rows,
      trackerCoverageClient,
      options,
    });
    const named = await resolveLeaderboardNames({
      resolved,
      playerIdentityService: this.getPlayerIdentityService(),
    });
    const medals = await loadMedalPayload({ trackerClient: this.trackerClient, options });
    return buildLeaderboardPayload({ options, stored, resolved: named, trackerCoverageResult, medals });
  }

  async getMonitorLeaderboardLive({ leaderboardLimit = 18, feedLimit = 80 } = {}) {
    const [leaderboards, trackerStatusResult, trackerFeedResult] = await Promise.all([
      this.getAlterationsLeaderboards({
        limit: leaderboardLimit,
        overallLimit: 350,
        perBucketLimit: 12,
      }),
      this.trackerClient.getTrackerStatus(),
      this.trackerClient.getWrFeed(feedLimit),
    ]);

    const alteredMapUids = new Set(
      this.repository.catalog
        .listAlteredMapUids({ trackedOnly: true, limit: 200000 })
        .map((mapUid) => String(mapUid || "").toLowerCase())
        .filter(Boolean)
    );
    const trackerFeed = asArray(trackerFeedResult?.data?.feed);
    const filteredFeed = trackerFeed
      .filter((event) => alteredMapUids.has(String(event?.uid || event?.mapUid || "").toLowerCase()))
      .slice(0, Math.max(1, Math.min(Number(feedLimit) || 80, 300)));
    const playerIdentity = this.getPlayerIdentityService();
    const feedAccountIds = playerIdentity.collectHolderAccountIds(filteredFeed, ["accountId", "holder"]);
    const feedNamesByAccountId = await playerIdentity.resolvePlayerNamesByAccountIds(feedAccountIds, {
      chunkSize: 100,
    });
    const resolvedFeed = playerIdentity.applyResolvedHolderNames(filteredFeed, "holder", feedNamesByAccountId, {
      accountIdKeys: ["accountId"],
      pendingKey: "displayNamePending",
      accountIdOutputKey: "accountId",
    });

    return {
      generatedAt: new Date().toISOString(),
      leaderboards,
      tracker: trackerStatusResult?.ok
        ? trackerStatusResult.data
        : { error: trackerStatusResult?.error || "Unable to load tracker status." },
      feed: resolvedFeed,
      feedCount: resolvedFeed.length,
      feedSourceCount: trackerFeed.length,
      alteredTrackedMapCount: alteredMapUids.size,
      warnings: [
        !trackerStatusResult?.ok ? trackerStatusResult?.error || "Tracker status unavailable." : null,
        !trackerFeedResult?.ok ? trackerFeedResult?.error || "Tracker feed unavailable." : null,
      ].filter(Boolean),
    };
  }

  receiveWrWebhook({ mapUid, mapName, accountId, holder, wrMs, recordedAt } = {}) {
    const uid = normalizeMapUid(mapUid);
    if (!uid) return { error: "mapUid is required." };

    const nowIso = new Date().toISOString();
    const mapInfo = this.repository.maps.getMapInfo(uid);
    const resolvedAccountId = normalizeAccountId(accountId || holder);
    const resolvedName = toText(mapName) || toText(mapInfo?.map?.name) || toText(mapInfo?.name) || uid;
    const resolvedHolder =
      sanitizeResolvedDisplayName(holder, { accountId: resolvedAccountId }) || resolvedAccountId || "Unknown";
    const safeWrMs = clampInt(wrMs, { min: 0, max: 2147483647, fallback: 0 });
    const safeRecordedAt = toIso(recordedAt, nowIso);
    const inserted = this.repository.activity.insertWrEvent({
      mapUid: uid,
      mapName: resolvedName,
      accountId: resolvedAccountId,
      holder: resolvedHolder,
      wrMs: safeWrMs,
      recordedAt: safeRecordedAt,
      receivedAt: nowIso,
    });
    if (!inserted) return { error: "Failed to persist WR webhook event." };

    const displayNamePending =
      Boolean(resolvedAccountId) && !hasResolvedDisplayName(inserted.holder, { accountId: resolvedAccountId });
    if (displayNamePending) {
      this.getPlayerIdentityService().queuePriorityDisplayNameLookups([resolvedAccountId], {
        source: "wr-webhook",
      });
    }
    return {
      ok: true,
      event: {
        eventId: inserted.eventId,
        mapUid: inserted.mapUid,
        name: inserted.mapName,
        accountId: inserted.accountId,
        holder: inserted.holder,
        displayNamePending,
        wrMs: inserted.wrMs,
        at: inserted.recordedAt,
        receivedAt: inserted.receivedAt,
      },
    };
  }

  async getLatestWr({ includeRecent = true, limit = 10, offset = 0 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 500, fallback: 10 });
    const safeOffset = clampInt(offset, { min: 0, max: 2000000, fallback: 0 });
    const latest = this.repository.activity.getLatestWrEvent();
    const recent = includeRecent
      ? this.repository.activity.getRecentWrEvents({ limit: safeLimit, offset: safeOffset })
      : [];
    const rows = [latest, ...recent].filter(Boolean);
    const playerIdentity = this.getPlayerIdentityService();
    const holderAccountIds = playerIdentity.collectHolderAccountIds(rows, ["accountId", "holder"]);
    const namesByAccountId = await playerIdentity.resolvePlayerNamesByAccountIds(holderAccountIds, {
      chunkSize: 100,
    });
    const resolvedLatest = latest
      ? playerIdentity.applyResolvedHolderNames([latest], "holder", namesByAccountId, {
          accountIdKeys: ["accountId"],
          pendingKey: "displayNamePending",
          accountIdOutputKey: "accountId",
        })[0]
      : null;
    const resolvedRecent = playerIdentity.applyResolvedHolderNames(recent, "holder", namesByAccountId, {
      accountIdKeys: ["accountId"],
      pendingKey: "displayNamePending",
      accountIdOutputKey: "accountId",
    });
    return {
      latestWr: resolvedLatest
        ? {
            eventId: resolvedLatest.eventId,
            mapUid: resolvedLatest.mapUid,
            name: resolvedLatest.mapName,
            accountId: resolvedLatest.accountId || null,
            holder: resolvedLatest.holder,
            displayNamePending: Boolean(resolvedLatest.displayNamePending),
            wrMs: resolvedLatest.wrMs,
            at: resolvedLatest.recordedAt,
            receivedAt: resolvedLatest.receivedAt,
          }
        : null,
      feed: resolvedRecent.map((item) => ({
        eventId: item.eventId,
        mapUid: item.mapUid,
        name: item.mapName,
        accountId: item.accountId || null,
        holder: item.holder,
        displayNamePending: Boolean(item.displayNamePending),
        wrMs: item.wrMs,
        at: item.recordedAt,
        receivedAt: item.receivedAt,
      })),
      paging: {
        limit: includeRecent ? safeLimit : 0,
        offset: includeRecent ? safeOffset : 0,
        count: recent.length,
        has_more: includeRecent && recent.length >= safeLimit,
        next_offset: includeRecent && recent.length >= safeLimit ? safeOffset + recent.length : null,
      },
    };
  }
}

export { emptyMedalPayload, LeaderboardService };
