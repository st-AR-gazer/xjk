import { TrackerCatalogMutationRepository } from "./trackerCatalogMutationRepository.js";
import { TrackerLeaderboardMutationRepository } from "./trackerLeaderboardMutationRepository.js";
import { TrackerLeaderboardQueryRepository } from "./trackerLeaderboardQueryRepository.js";
import { TrackerMapQueryRepository } from "./trackerMapQueryRepository.js";
import { TrackerPlayerRepository } from "./trackerPlayerRepository.js";
import { TrackerRunRepository } from "./trackerRunRepository.js";

class TrackerRepository {
  constructor(db) {
    this.db = db;
    this.mapQueryRepository = new TrackerMapQueryRepository(db);
    this.leaderboardQueryRepository = new TrackerLeaderboardQueryRepository(db);
    this.runRepository = new TrackerRunRepository(db);
    this.catalogMutationRepository = new TrackerCatalogMutationRepository({
      db,
      mapQueryRepository: this.mapQueryRepository,
    });
    this.leaderboardMutationRepository = new TrackerLeaderboardMutationRepository({
      db,
      mapQueryRepository: this.mapQueryRepository,
    });
    this.playerRepository = new TrackerPlayerRepository(db);
  }

  getSummary(...args) {
    return this.mapQueryRepository.getSummary(...args);
  }

  getCampaignNames(...args) {
    return this.mapQueryRepository.getCampaignNames(...args);
  }

  getMaps(...args) {
    return this.mapQueryRepository.getMaps(...args);
  }

  getTrackedMaps(...args) {
    return this.mapQueryRepository.getTrackedMaps(...args);
  }

  getMapInfo(...args) {
    return this.mapQueryRepository.getMapInfo(...args);
  }

  getMapByUid(...args) {
    return this.mapQueryRepository.getMapByUid(...args);
  }

  getTrackedLiveCandidates(...args) {
    return this.mapQueryRepository.getTrackedLiveCandidates(...args);
  }

  getDueTrackedMaps(...args) {
    return this.mapQueryRepository.getDueTrackedMaps(...args);
  }

  countDueTrackedMaps(...args) {
    return this.mapQueryRepository.countDueTrackedMaps(...args);
  }

  touchMapCheckedAt(...args) {
    return this.mapQueryRepository.touchMapCheckedAt(...args);
  }

  getMapOptions(...args) {
    return this.mapQueryRepository.getMapOptions(...args);
  }

  getMedalLeaderboards(...args) {
    return this.leaderboardQueryRepository.getMedalLeaderboards(...args);
  }

  getWrFeed(...args) {
    return this.leaderboardQueryRepository.getWrFeed(...args);
  }

  getLeaderboardFeed(...args) {
    return this.leaderboardQueryRepository.getLeaderboardFeed(...args);
  }

  getLeaderboardWrLeaderboards(...args) {
    return this.leaderboardQueryRepository.getLeaderboardWrLeaderboards(...args);
  }

  getTopWrAccounts(...args) {
    return this.leaderboardQueryRepository.getTopWrAccounts(...args);
  }

  getLeaderboardCoverage(...args) {
    return this.leaderboardQueryRepository.getLeaderboardCoverage(...args);
  }

  recordTrackerRun(...args) {
    return this.runRepository.recordTrackerRun(...args);
  }

  getLatestTrackerRun(...args) {
    return this.runRepository.getLatestTrackerRun(...args);
  }

  getTrackerRuns(...args) {
    return this.runRepository.getTrackerRuns(...args);
  }

  upsertClub(...args) {
    return this.catalogMutationRepository.upsertClub(...args);
  }

  upsertCampaignByName(...args) {
    return this.catalogMutationRepository.upsertCampaignByName(...args);
  }

  updateMapCampaign(...args) {
    return this.catalogMutationRepository.updateMapCampaign(...args);
  }

  updateMapTracking(...args) {
    return this.catalogMutationRepository.updateMapTracking(...args);
  }

  bulkUpsertMaps(...args) {
    return this.catalogMutationRepository.bulkUpsertMaps(...args);
  }

  insertWrEvent(...args) {
    return this.leaderboardMutationRepository.insertWrEvent(...args);
  }

  replaceLeaderboardSnapshot(...args) {
    return this.leaderboardMutationRepository.replaceLeaderboardSnapshot(...args);
  }

  bulkUpsertPlayerNames(...args) {
    return this.playerRepository.bulkUpsertPlayerNames(...args);
  }

  getPlayerNamesByAccountIds(...args) {
    return this.playerRepository.getPlayerNamesByAccountIds(...args);
  }
}

export { TrackerRepository };
