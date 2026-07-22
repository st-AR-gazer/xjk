import { ingestClubSnapshot } from "./club/clubSnapshotIngestion.js";
import { getClubCampaigns, getClubMaps, getClubMembers, getClubSummary } from "./club/clubQueries.js";

class ClubRepository {
  constructor(db, { eventsRepository } = {}) {
    this.db = db;
    this.eventsRepository = eventsRepository;
  }

  ingestClubSnapshot(payload = {}) {
    return ingestClubSnapshot(this, payload);
  }

  getClubSummary(clubId) {
    return getClubSummary(this.db, clubId);
  }

  getClubCampaigns(clubId, options) {
    return getClubCampaigns(this.db, clubId, options);
  }

  getClubMembers(clubId, options) {
    return getClubMembers(this.db, clubId, options);
  }

  getClubMaps(clubId, options) {
    return getClubMaps(this.db, clubId, options);
  }
}

export { ClubRepository };
