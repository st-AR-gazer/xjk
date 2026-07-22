import { createPlayerIdentityState } from "./playerIdentity/playerIdentityState.js";
import {
  collectAccountIds,
  collectHolderAccountIds,
  pruneViewedPriorityAccountIds,
  kickoffPriorityDisplayNameFallback,
  queuePriorityDisplayNameLookups,
  getCachedPlayerName,
  cachePlayerName,
  resolvePlayerNamesByAccountIds,
  resolveHolderName,
  applyResolvedHolderNames,
} from "./playerIdentity/playerNameResolution.js";
import {
  shouldUseDisplaynameRelay,
  shouldUseClubRelay,
  relayClubSnapshotToTrackerClub,
  getDisplayNamesFromAggregator,
  ingestDisplayNamesToAggregator,
  runTrackerDisplaynameSync,
} from "./playerIdentity/trackerIdentityGateway.js";
import {
  getMapperNameSyncStatus,
  updateMapperNameSyncConfig,
  computeNextMapperSyncRunIso,
  scheduleNextMapperSyncRun,
  refreshMapperAccountPool,
  refreshPriorityMapperAccounts,
} from "./playerIdentity/mapperNameScheduler.js";
import { syncMapperNamesBatch } from "./playerIdentity/mapperNameBatch.js";
import {
  runMapperNameSyncCycle,
  runMapperNameSyncNow,
  syncSpecificMapperAccountIds,
  startMapperNameSyncScheduler,
  stopMapperNameSyncScheduler,
  syncMapperNamesForCampaigns,
} from "./playerIdentity/mapperNameOrchestration.js";

class PlayerIdentityService {
  constructor({
    repository,
    trackerClient,
    trackerDisplaynameClient = null,
    trackerClubClient = null,
    aggregatorClient = null,
    liveClient = null,
    mapperNameClient = null,
    trackerIntegrations = {},
    mapperNameSyncConfig = {},
    logger = console,
    getProjectSourceService,
    getTrackerSyncService,
  }) {
    this.repository = repository;
    this.trackerClient = trackerClient;
    this.trackerDisplaynameClient = trackerDisplaynameClient;
    this.trackerClubClient = trackerClubClient;
    this.aggregatorClient = aggregatorClient;
    this.liveClient = liveClient;
    this.mapperNameClient = mapperNameClient;
    this.logger = logger;
    this.getProjectSourceService = getProjectSourceService;
    this.getTrackerSyncService = getTrackerSyncService;
    Object.assign(
      this,
      createPlayerIdentityState({
        trackerIntegrations,
        mapperNameSyncConfig,
      })
    );
  }

  collectAccountIds(rows = [], keys = []) {
    return collectAccountIds.call(this, rows, keys);
  }

  collectHolderAccountIds(rows = [], keys = []) {
    return collectHolderAccountIds.call(this, rows, keys);
  }

  pruneViewedPriorityAccountIds(nowMs = Date.now()) {
    return pruneViewedPriorityAccountIds.call(this, nowMs);
  }

  kickoffPriorityDisplayNameFallback({ source = "public-view" } = {}) {
    return kickoffPriorityDisplayNameFallback.call(this, { source });
  }

  queuePriorityDisplayNameLookups(accountIds = [], { source = "public-view" } = {}) {
    return queuePriorityDisplayNameLookups.call(this, accountIds, { source });
  }

  getCachedPlayerName(accountId) {
    return getCachedPlayerName.call(this, accountId);
  }

  cachePlayerName(accountId, displayName) {
    return cachePlayerName.call(this, accountId, displayName);
  }

  async resolvePlayerNamesByAccountIds(accountIds = [], { chunkSize = 100, external = true } = {}) {
    return resolvePlayerNamesByAccountIds.call(this, accountIds, { chunkSize, external });
  }

  resolveHolderName(holder, namesByAccountId = {}, { accountId = "" } = {}) {
    return resolveHolderName.call(this, holder, namesByAccountId, { accountId });
  }

  applyResolvedHolderNames(
    rows = [],
    holderKey,
    namesByAccountId = {},
    { accountIdKeys = [], pendingKey = "", accountIdOutputKey = "" } = {}
  ) {
    return applyResolvedHolderNames.call(this, rows, holderKey, namesByAccountId, {
      accountIdKeys,
      pendingKey,
      accountIdOutputKey,
    });
  }

  shouldUseDisplaynameRelay() {
    return shouldUseDisplaynameRelay.call(this);
  }

  shouldUseClubRelay() {
    return shouldUseClubRelay.call(this);
  }

  async relayClubSnapshotToTrackerClub(snapshot = {}) {
    return relayClubSnapshotToTrackerClub.call(this, snapshot);
  }

  async getDisplayNamesFromAggregator(accountIds = []) {
    return getDisplayNamesFromAggregator.call(this, accountIds);
  }

  async ingestDisplayNamesToAggregator(namesByAccountId = {}, { source = "mapper-sync" } = {}) {
    return ingestDisplayNamesToAggregator.call(this, namesByAccountId, { source });
  }

  async runTrackerDisplaynameSync({ accountIds = [], reason = "altered-sync", forceCandidates = false } = {}) {
    return runTrackerDisplaynameSync.call(this, { accountIds, reason, forceCandidates });
  }

  getMapperNameSyncStatus() {
    return getMapperNameSyncStatus.call(this);
  }

  async updateMapperNameSyncConfig(options = {}) {
    return updateMapperNameSyncConfig.call(this, options);
  }

  computeNextMapperSyncRunIso({ priority = false, fromTimeMs = Date.now() } = {}) {
    return computeNextMapperSyncRunIso.call(this, { priority, fromTimeMs });
  }

  scheduleNextMapperSyncRun({ priority = false, fromTimeMs = Date.now() } = {}) {
    return scheduleNextMapperSyncRun.call(this, { priority, fromTimeMs });
  }

  async refreshMapperAccountPool({ force = false } = {}) {
    return refreshMapperAccountPool.call(this, { force });
  }

  async refreshPriorityMapperAccounts({ force = false } = {}) {
    return refreshPriorityMapperAccounts.call(this, { force });
  }

  async syncMapperNamesBatch({ accountIds = [], source = "mapper-sync" } = {}) {
    return syncMapperNamesBatch.call(this, { accountIds, source });
  }

  async runMapperNameSyncCycle({
    priority = false,
    reason = "schedule",
    force = false,
    accountIds = [],
    allowWhenDisabled = false,
    limit = null,
  } = {}) {
    return runMapperNameSyncCycle.call(this, {
      priority,
      reason,
      force,
      accountIds,
      allowWhenDisabled,
      limit,
    });
  }

  async runMapperNameSyncNow({ priority = false, force = false, reason = "manual-api" } = {}) {
    return runMapperNameSyncNow.call(this, { priority, force, reason });
  }

  async syncSpecificMapperAccountIds({ accountIds = [], force = false, reason = "manual-targeted-api" } = {}) {
    return syncSpecificMapperAccountIds.call(this, { accountIds, force, reason });
  }

  async startMapperNameSyncScheduler() {
    return startMapperNameSyncScheduler.call(this);
  }

  async stopMapperNameSyncScheduler() {
    return stopMapperNameSyncScheduler.call(this);
  }

  async syncMapperNamesForCampaigns({ campaigns = [], note = "", onProgress = null } = {}) {
    return syncMapperNamesForCampaigns.call(this, { campaigns, note, onProgress });
  }
}

export { PlayerIdentityService };
